# FIX 03 — Dashboard "Welcome" Name Must Use Real Student Name from HAC

## Priority: HIGH — Currently always shows "Test" regardless of who is logged in

---

## Context & Root Cause

`DashboardScreen.tsx` displays the student's name with:
```typescript
const firstName = data?.name?.split(' ')[0] ?? 'Student'
```

`data` comes from `fetchStudentData()` → `/api/students/me` → `prisma.user.findUnique()`.
The `name` field on the User model is set to `'Test Student'` in the seed file
and is never updated after a real HAC login. The HAC scraper in `hacClient.ts`
has a working `getStudentInfo()` function that returns the real name from
`Registration.aspx`, but it is never called after login, and the result is
never written back to the database.

The fix has two parts:
1. After a successful HAC login, call `getStudentInfo()` and write the
   student's real name to `User.name` in the database
2. The dashboard already uses `data.name` — once the DB is updated, it
   will automatically show the correct name

---

## Files You Must Read Before Editing

```
backend/src/integrations/grades/gradesRouter.ts
backend/src/integrations/grades/hacClient.ts
backend/src/lib/prisma.ts
backend/prisma/schema.prisma
nextstep-mobile/src/screens/DashboardScreen.tsx
nextstep-mobile/src/api/studentApi.ts
nextstep-mobile/src/api/portalApi.ts
```

Understand:
- The `/hac/login` route in `gradesRouter.ts` — specifically what it does
  AFTER `loginHAC()` succeeds (it only upserts `SchoolConnection`)
- The `getStudentInfo()` function signature and return type in `hacClient.ts`
- The `User` model in `schema.prisma` — specifically the `name` field
- How `prisma.user.update()` works

---

## Backend Change — `backend/src/integrations/grades/gradesRouter.ts`

### Locate the `/hac/login` POST route

Find this section (after the `loginHAC` call succeeds):

```typescript
await prisma.schoolConnection.upsert({
  where: { userId },
  update: {
    systemType: 'HAC',
    districtUrl: resolvedBaseUrl,
    lastSynced: new Date(),
  },
  create: {
    userId,
    systemType: 'HAC',
    districtUrl: resolvedBaseUrl,
  },
})

res.json({
  data: {
    sessionToken,
    systemType: 'HAC',
    districtUrl: resolvedBaseUrl,
    expiresIn: 1800,
  },
})
```

### Add student info sync after SchoolConnection upsert

Insert the following block BETWEEN the `prisma.schoolConnection.upsert` call
and the `res.json(...)` call. This is a best-effort operation — if it fails,
the login still succeeds (the student can use the app, their name just might
not update yet).

```typescript
// Best-effort: fetch real student name from HAC and update User record
try {
  console.log('[GRADES ROUTER] Fetching student info from HAC...')
  const studentInfo = await getStudentInfo(sessionToken)

  if (studentInfo.name && studentInfo.name.trim().length > 0) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        name: studentInfo.name.trim(),
      },
    })
    console.log('[GRADES ROUTER] Updated user name from HAC:', studentInfo.name.trim())
  }
} catch (infoErr: unknown) {
  // Non-fatal: log and continue. Login still succeeds.
  console.warn('[GRADES ROUTER] Could not fetch student info (non-fatal):', 
    infoErr instanceof Error ? infoErr.message : String(infoErr)
  )
}
```

### Add `getStudentInfo` to the imports at the top of the file

Find the existing import from `./hacClient`:

```typescript
import {
  loginHAC,
  getGrades as hacGrades,
  getTranscript as hacTranscript,
  getSchedule,
  getStudentInfo,
} from './hacClient'
```

Verify `getStudentInfo` is already in this import. If it is NOT, add it.
Read the import block carefully before editing — do not duplicate imports.

---

## GradePortalDashboard Context — Sync name on portal connect too

If the student connects via `PortalConnectScreen` (the second connect path),
the same best-effort sync should also happen there. The route is the same
(`/hac/login`) so the fix above covers both paths since both use that route.

---

## Verify the Dashboard Display

Open `nextstep-mobile/src/screens/DashboardScreen.tsx` and find:

```typescript
const firstName = data?.name?.split(' ')[0] ?? 'Student'
```

This line is already correct — it uses `data.name` which comes from
`/api/students/me` → `user.name` in the database. Once the backend fix
writes the real name to the DB, this line will automatically display it.

Do NOT change this line. Verify it is present and unchanged.

---

## Profile GPA Fields — Verify they are populated

Also in `DashboardScreen.tsx`:

```typescript
const uGpa = (profile?.unweightedGpa ?? 0).toFixed(2)
const wGpa = (profile?.weightedGpa ?? 0).toFixed(2)
```

These come from `StudentProfile.weightedGpa` and `StudentProfile.unweightedGpa`.
These are seeded as `0.0` by default.

For now, do NOT change the GPA display logic — a later fix (FIX_05) will
add a GPA computation route. Just make sure the name fix does not break
the existing GPA display (it should not, since you're only touching `user.name`).

---

## TypeScript Requirements

After changes, run from `backend/`:

```bash
cd backend
npx tsc --noEmit
```

Common issues:
- `getStudentInfo` import missing or incorrect — verify the import line
- `infoErr` typed as `unknown` — the catch block handles this correctly
  in the template above (uses `instanceof Error`)

---

## Acceptance Criteria

- [ ] `gradesRouter.ts` calls `getStudentInfo(sessionToken)` after successful HAC login
- [ ] If real name found, `prisma.user.update` writes it to `User.name`
- [ ] The call is wrapped in try/catch — failure does NOT prevent login success
- [ ] `getStudentInfo` is imported in `gradesRouter.ts`
- [ ] `npx tsc --noEmit` passes in `backend/` with zero errors
- [ ] Dashboard `firstName` display uses `data?.name?.split(' ')[0]` (unchanged)

---

## What NOT to Do

- Do NOT store the student's real school credentials anywhere in the DB
- Do NOT make `getStudentInfo` failure a fatal error for the login route
- Do NOT change `DashboardScreen.tsx` logic for how `firstName` is derived
- Do NOT change the `StudentProfile` model or GPA fields in this fix
- Do NOT add any new API endpoints — the existing `/students/me` already works
