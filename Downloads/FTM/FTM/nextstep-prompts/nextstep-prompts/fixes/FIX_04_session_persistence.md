# FIX 04 — Make School Portal Session Survive Backend Restarts

## Priority: HIGH — Sessions currently vanish on every backend restart

---

## Context & Root Cause

`backend/src/integrations/grades/sessionStore.ts` stores all active school
portal sessions (HAC cookie jars, PowerSchool cookies) in a `Map<string, StoredSession>`
inside Node.js process memory. When the backend restarts, this Map is empty.

The `SchoolConnection` Prisma table stores `districtUrl` and `systemType` —
but NOT the session token or the serialized cookie jar. So after a restart,
`getSessionByUserId(userId)` returns `null`, `requireSession()` returns
`NO_SCHOOL_SESSION`, and all grade fetch calls fail with a 401.

The fix: implement a recovery path. When a user's session is missing from
the in-memory store but `SchoolConnection` shows they were previously connected,
the backend should return a special status code so the mobile app knows to
prompt for re-authentication — NOT silently show an error.

Additionally, extend the `SchoolConnection` table to cache the serialized
cookie jar so sessions can be restored from the DB on restart.

---

## Files You Must Read Before Editing

```
backend/src/integrations/grades/sessionStore.ts
backend/src/integrations/grades/gradesRouter.ts
backend/prisma/schema.prisma
backend/prisma/migrations/20260608035719_add_school_connection/migration.sql
nextstep-mobile/src/api/portalApi.ts
nextstep-mobile/src/screens/GradePortalDashboard.tsx
nextstep-mobile/src/screens/GradeViewerScreen.tsx
```

---

## Part A — Extend the `SchoolConnection` Schema for Session Caching

### Step 1: Add `cachedSession` field to `SchoolConnection` in `schema.prisma`

Find the `SchoolConnection` model and add one optional field:

```prisma
model SchoolConnection {
  id             Int       @id @default(autoincrement())
  userId         Int       @unique
  systemType     String
  districtUrl    String
  lastSynced     DateTime?
  cachedSession  String?   // Serialized cookie jar JSON — encrypted at rest in prod
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

### Step 2: Create a new Prisma migration

```bash
cd backend
npx prisma migrate dev --name add_cached_session
```

This creates a new migration file. Do NOT edit the migration SQL manually.

### Step 3: Regenerate Prisma client

```bash
cd backend
npx prisma generate
```

---

## Part B — Update `sessionStore.ts` to Persist Sessions

### Modify `saveSession` to accept an optional Prisma upsert callback

Do NOT change the `saveSession` function signature — other code calls it
without a Prisma argument. Instead, add a new exported function:

```typescript
/**
 * Save a session to the in-memory store AND persist the cookie jar
 * to the SchoolConnection table in the database.
 *
 * @param userId     NextStep user ID
 * @param systemType 'HAC' | 'PowerSchool'
 * @param baseUrl    District base URL
 * @param sessionData Serialized cookie jar JSON string
 * @param prismaUpdate Optional async callback to persist to DB
 */
export async function saveSessionWithPersistence(
  userId: number,
  systemType: SchoolSystemType,
  baseUrl: string,
  sessionData: string,
  prismaUpdate: (token: string, sessionData: string) => Promise<void>
): Promise<string> {
  const token = saveSession(userId, systemType, baseUrl, sessionData)
  try {
    await prismaUpdate(token, sessionData)
  } catch (e) {
    // Non-fatal: in-memory session is still valid
    console.warn('[SESSION STORE] Failed to persist session to DB:', 
      e instanceof Error ? e.message : String(e))
  }
  return token
}
```

Also export a new `restoreSessionFromCache` helper:

```typescript
/**
 * Restore a session into the in-memory store from a cached serialized
 * cookie jar. Called on server startup or when a session is missing.
 *
 * @returns The new session token, or null if cache is invalid/expired
 */
export function restoreSessionFromCache(
  userId: number,
  systemType: SchoolSystemType,
  baseUrl: string,
  cachedSessionData: string
): string | null {
  try {
    // Validate the cache is parseable JSON before restoring
    JSON.parse(cachedSessionData)
    return saveSession(userId, systemType, baseUrl, cachedSessionData)
  } catch {
    return null
  }
}
```

---

## Part C — Update `gradesRouter.ts` to Use Persistent Sessions

### In the `/hac/login` route, replace `loginHAC(...)` with `saveSessionWithPersistence`

Find the current code after `loginHAC` returns a token:

```typescript
const sessionToken = await loginHAC(
  resolvedBaseUrl,
  username,
  password,
  userId,
  clsessionCookie,
)
```

The `loginHAC` call internally calls `saveSession()`. To also persist to DB,
after the `loginHAC` call and after the `SchoolConnection` upsert, add:

```typescript
// Persist the session cookie to DB so it can survive backend restarts
try {
  const { getSessionByToken } = await import('./sessionStore')
  const stored = getSessionByToken(sessionToken)
  if (stored) {
    await prisma.schoolConnection.update({
      where: { userId },
      data: { cachedSession: stored.sessionData },
    })
    console.log('[GRADES ROUTER] Session cached to DB for userId:', userId)
  }
} catch (cacheErr) {
  console.warn('[GRADES ROUTER] Non-fatal: could not cache session:', 
    cacheErr instanceof Error ? cacheErr.message : String(cacheErr))
}
```

Apply the same pattern in the `/powerschool/login` route.

### Update the `/status` route to attempt session restoration

Find the `/status` GET route. After `getSessionByUserId(userId)` returns null,
add a restoration attempt:

```typescript
router.get('/status', async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.userId!

  let entry = getSessionByUserId(userId)

  // If no in-memory session, try to restore from DB cache
  if (!entry) {
    const connection = await prisma.schoolConnection.findUnique({
      where: { userId },
    })

    if (connection?.cachedSession) {
      console.log('[GRADES ROUTER] Attempting session restore from DB cache for userId:', userId)
      const restoredToken = restoreSessionFromCache(
        userId,
        connection.systemType as SchoolSystemType,
        connection.districtUrl,
        connection.cachedSession
      )
      if (restoredToken) {
        entry = getSessionByUserId(userId)
        console.log('[GRADES ROUTER] Session restored from cache:', Boolean(entry))
      }
    }
  }

  const connection = await prisma.schoolConnection.findUnique({
    where: { userId },
  })

  res.json({
    data: {
      connected: Boolean(entry),
      systemType: entry?.session.systemType ?? connection?.systemType ?? null,
      districtUrl: entry?.session.baseUrl ?? connection?.districtUrl ?? null,
      lastSynced: connection?.lastSynced ?? null,
      sessionExpiresIn: entry
        ? Math.max(0, Math.floor((entry.session.expiresAt - Date.now()) / 1000))
        : 0,
    },
  })
})
```

Add the missing import at the top of `gradesRouter.ts`:

```typescript
import { 
  getSessionByUserId, 
  deleteSessionByUserId,
  restoreSessionFromCache,
  type SchoolSystemType
} from './sessionStore'
```

---

## Part D — Mobile App: Prompt Re-Auth When Session Missing

In `nextstep-mobile/src/screens/GradeViewerScreen.tsx`, find the
`loadGrades` function. After calling `getPortalStatus()`, check if the
session is expired:

```typescript
const status = await getPortalStatus()
setPortalStatus(status)

if (status.connected) {
  // ... existing grade fetch
} else if (status.sessionExpiresIn === 0 && status.districtUrl !== null) {
  // Session expired or lost — redirect to PortalConnect to re-auth
  setDataSource('seeded')
  setError('Your school portal session expired. Please reconnect.')
} else if (__DEV__) {
  // ...
}
```

This ensures the user sees a meaningful message and a way to reconnect,
rather than just seeing stale or empty data.

---

## TypeScript Requirements

```bash
cd backend
npx tsc --noEmit
```

```bash
cd nextstep-mobile
npx tsc --noEmit
```

Both must pass with zero errors.

---

## Acceptance Criteria

- [ ] `SchoolConnection` has new `cachedSession String?` field in schema
- [ ] Migration created and applied (`npx prisma migrate dev`)
- [ ] After HAC login, session cookie is written to `SchoolConnection.cachedSession`
- [ ] `/status` route attempts to restore session from DB if in-memory store is empty
- [ ] `restoreSessionFromCache` exported from `sessionStore.ts`
- [ ] Mobile app shows re-auth prompt when session is expired but district is known
- [ ] Both TypeScript checks pass

---

## Security Note

`cachedSession` contains serialized browser cookies that can authenticate
against the school portal. In development this is acceptable. For production,
this field should be encrypted at rest. Add a `// TODO: encrypt in production`
comment above the field in `schema.prisma` as a reminder.

## What NOT to Do

- Do NOT store the school portal password in the database
- Do NOT make session restoration failures a hard error
- Do NOT break the existing `saveSession` function signature
- Do NOT remove the 30-minute TTL from the in-memory store
