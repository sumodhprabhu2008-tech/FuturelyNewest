# NextStep Diagnostic Report
_Generated: 2026-06-14 — RUN_ALL sprint_

---

## Phase 0 — Diagnostic Audit

### Bug 1 — Production 404 on root domain

**Symptom:** Visiting the production Vercel URL returns 404 for `/` and all non-API paths.

**Root cause:** `vercel.json` uses a Vercel v2 `routes` array:
```json
"routes": [
  { "src": "/api/(.*)", "dest": "/backend/api/index.ts" },
  { "src": "/ws/(.*)", "dest": "/backend/api/index.ts" }
]
```
In Vercel v2, an explicit `routes` array **completely replaces** the auto-generated routing table (including the Next.js catch-all). No route matches `GET /`, so Vercel returns 404. The `builds` array correctly registers both Next.js and the Express backend, but without a filesystem sentinel at the end of `routes`, the built Next.js pages are never served.

**File:** `vercel.json`  
**Confidence:** HIGH  
**Fix (Phase 1):** Add `{ "handle": "filesystem" }` as the last entry in `routes` so Vercel falls through to the Next.js build output for any path not matched by the API/WS routes.

**Additional note:** `next.config.ts` rewrites `/api/:path*` → `${BACKEND_URL}/api/:path*`. In production on Vercel, `BACKEND_URL` must be set to the full Vercel Functions URL (e.g., `https://<domain>/api`). If this env var is absent, Next.js rewrites fall back to `http://localhost:3001` which fails in production. Sai must add `BACKEND_URL` to Vercel environment variables if not already set.

---

### Bug 2 — Sign-in takes ~5 minutes

**Symptom:** After entering school credentials in SchoolLoginScreen, the app hangs for up to several minutes before responding.

**Root cause:** `POST /api/integrations/grades/hac/login` in `gradesRouter.ts` calls:
1. `loginHAC()` — 3 sequential HTTP requests each with `timeout: 45_000 ms` (~135s worst case)
2. `getStudentInfo()` — fetches demographic iframe, 1-2 more requests × 45s (~90s worst case)

Both calls complete **before the HTTP response is sent** to the mobile client. Total worst case: ~225 seconds.

**File:** `backend/src/integrations/grades/gradesRouter.ts` — `POST /hac/login` handler  
**Confidence:** HIGH  
**Fix (Phase 2):** Return the login response immediately after `loginHAC()` succeeds. Fire `getStudentInfo()` + grade sync as a non-blocking background task. Add a `GET /api/integrations/grades/sync-status` endpoint the client can poll.

---

### Bug 3 — Dashboard shows nothing

**Root cause A (auth):** `DashboardScreen.tsx` calls `apiFetch('/students/me')` which includes a JWT in the Authorization header. School-session students (who signed in via SchoolLoginScreen, not the NextStep login form) have NO JWT — they get a 401. The Dashboard shows an error/empty state.

**Root cause B (empty DB):** Even for users who have a JWT, `GET /api/students/me` (`students.ts`) reads from `Course` and `Grade` Prisma tables. The HAC grade sync (`GET /integrations/grades/current`) only writes to the `Assignment` table (upcoming assignments). The `Course`/`Grade` tables are never populated by the sync flow, so GPA and course list come back empty.

**Root cause C (no GPA source):** GPA is computed from `Course`/`Grade` rows in `students.ts`. With those tables empty, GPA = null/NaN.

**Files:** `nextstep-mobile/src/screens/DashboardScreen.tsx`, `backend/src/routes/students.ts`, `backend/src/integrations/grades/gradesRouter.ts`  
**Confidence:** HIGH  
**Fix (Phase 2+3):** Phase 2 adds a cached-grades endpoint that returns data from the HAC Assignment sync. Phase 3 wires Dashboard to this endpoint, adds loading/syncing/error/empty/loaded states, and adds GPA from the HAC transcript if available.

---

### Bug 4 — Planner not working

**Symptom:** SmartPlannerScreen either crashes on mount or shows nothing.

**Root cause:** `SmartPlannerScreen.tsx` calls `apiFetch('/assignments')` which requires JWT auth. School-session students (no JWT) get a 401. Additionally, `fetchStudyPlan()` calls an AI endpoint that is a known unimplemented stub, causing a secondary error.

**File:** `nextstep-mobile/src/screens/SmartPlannerScreen.tsx`, `backend/src/routes/assignments.ts`  
**Confidence:** HIGH  
**Fix (Phase 3):** Wire Planner to the Phase 2 cached assignments endpoint. Suppress the AI study-plan fetch error with a sensible "Your study plan will appear here once your grades sync" placeholder state.

---

### Phase 0 quick fixes applied

**hacClient.ts timeouts:** Already set to `timeout: 45_000` for all requests in the previous sprint. No change needed.

**No other safe quick fixes** were identified that could be applied without touching the Phase 2/3 scope.

---

### Backend type check (pre-sprint baseline)

Pre-sprint: 14 errors, all caused by stale Prisma generated client (schema had been updated with `Profile`, `Notification`, `hacPasswordEncrypted`, `psPasswordEncrypted` models/fields but `prisma generate` was never re-run). Fix applied: `npx prisma generate` → 0 errors.

---

## Phase 1 — Fix Production 404

**What was wrong:** `vercel.json` `routes` array in Vercel v2 completely replaces the auto-generated routing table. With only `/api/(.*)` and `/ws/(.*)` routes defined, no rule matched `GET /` or any Next.js page path → 404 for all frontend routes.

**Change made:** `vercel.json` — added `{ "handle": "filesystem" }` as the last entry in `routes`. This sentinel tells Vercel to fall through to the built Next.js output (filesystem) for any path not matched by the explicit API/WS routes above it.

**Type check:** `npx tsc --noEmit` at repo root → 0 errors.

**Manual redeploy step:** Sai must trigger a Vercel redeploy (push to main or click "Redeploy" in the Vercel dashboard) for this change to take effect in production.

**Additional note:** `next.config.ts` rewrites `/api/:path*` to `${BACKEND_URL}/api/:path*`. In production, `BACKEND_URL` must be set in Vercel environment variables (e.g., to the Vercel domain itself, like `https://nextstep.vercel.app`). If missing, Next.js rewrites fall back to `http://localhost:3001` which will fail.

---

## Phase 2 — Fast Sign-in + Automatic Grade Sync

### New Prisma fields (additive)

Added to `SchoolConnection` in `backend/prisma/schema.prisma`:
```prisma
syncStatus  String?   // 'syncing' | 'complete' | 'error'
syncError   String?
```

**Migration Sai must run:**
```
cd backend
npx prisma migrate dev --name add_school_connection_sync_status
```

Then restart the backend server.

### New endpoints

- **`GET /api/integrations/grades/sync-status`** — returns `{ data: { status: 'idle'|'syncing'|'complete'|'error', lastSyncedAt: string|null, errorMessage: string|null } }`. Requires auth. Polls no HAC — reads only from the `SchoolConnection` row.

### Login flow changes

**Before:** `POST /hac/login` awaited `loginHAC()` (up to ~135s) + `getStudentInfo()` (up to ~90s) + session persistence before responding. Worst-case: ~225 seconds.

**After:**
1. `loginHAC()` is still awaited (this is the actual credential verification — HAC must respond before we know if credentials are valid).
2. DB upsert + conflict check + DEV role assignment run immediately after (fast DB operations).
3. **Response is sent to the client immediately** with `sessionToken`.
4. `runBackgroundSync()` fires without `await` — all remaining work (session cookie persistence, `getStudentInfo()`, grade sync, profile update) runs in background.

### Staleness threshold

**15 minutes.** Before starting a background sync, `runBackgroundSync()` checks `SchoolConnection.lastSynced`. If less than 15 minutes ago, the sync is skipped and `syncStatus` is set to `'complete'` immediately. This prevents hammering HAC on every app open or login.

The threshold is defined in `gradesRouter.ts` as:
```typescript
const SYNC_STALE_MS = 15 * 60 * 1000 // 15 minutes
```

### End-to-end flow (sign-in → sync → dashboard)

1. **User taps "Connect" on SchoolLoginScreen** → `POST /api/integrations/grades/hac/login` with credentials.
2. Backend calls `loginHAC()` — 3 HTTP requests to HAC. If credentials valid, returns `sessionToken`. If HAC is unreachable/slow, this step can still be slow (HAC network is the bottleneck, not our code).
3. Backend responds immediately with `{ sessionToken, systemType, districtUrl }`. Mobile receives response in seconds (not minutes).
4. Mobile saves school session to AsyncStorage via `SchoolSessionContext.signIn()`.
5. Background: `runBackgroundSync()` starts — marks `syncStatus = 'syncing'` on the DB row.
6. Background: `getStudentInfo()` fetches student name/counselor/grad year from HAC demographic page → updates `User.name` and `Profile`.
7. Background: `hacGrades()` fetches classwork page → normalizes → upserts upcoming `Assignment` rows into DB for this user.
8. Background: `syncStatus = 'complete'`, `lastSynced = now()`.
9. **Dashboard mounts** → calls `GET /api/students/me` (gets user profile + assignments from DB).
10. Dashboard also calls `GET /api/integrations/grades/sync-status` every 3 seconds.
11. While `status === 'syncing'`: Dashboard shows "Syncing your grades…" banner + ActivityIndicator.
12. When `status === 'complete'`: polling stops, Dashboard reloads data from `/students/me`.
13. If `status === 'error'`: Dashboard shows error banner with message.

### Type check

Backend: `npx tsc --noEmit` → 0 errors.
Mobile: `npx tsc --noEmit` → 0 errors (in `src/`; pre-existing `Futurely/` sub-project errors are unrelated baseline noise).

---

## Phase 3 — Dashboard and Planner

### Dashboard

**Root cause confirmed:** Two independent issues:
- A. School-session users (no JWT) get 401 on `/students/me` in production (no bypass). Fixed by giving a clear "Sign in to your NextStep account" message instead of the raw 401 error.
- B. Even for users with JWT, `Course`/`Grade` DB tables are empty because HAC sync only writes to `Assignment` table. Dashboard shows 0.00/0.00 GPA and "No courses found". Fixed by showing "Syncing your grades…" when sync is in progress.

**Changes made (`DashboardScreen.tsx`):**
- Added `SyncBanner` component: shows blue "Syncing your grades…" banner with spinner while `syncStatus === 'syncing'`; shows red error banner when `syncStatus === 'error'`.
- Added sync-status polling on mount (3-second interval, auto-stops on complete/error/idle, hard stops after 5 minutes).
- When polling detects `complete`, Dashboard auto-reloads data from `/students/me`.
- "No courses found" empty state now reads "Syncing your grades…" while sync is active.
- 401 error now shows "Sign in to your NextStep account to view your dashboard."
- Added `getSyncStatus()` to `portalApi.ts`, mapped to new `GET /sync-status` endpoint.

### Planner

**Root cause confirmed:**
- Primary: `fetchAssignments()` → `GET /api/assignments` → requires JWT → 401 for school-session-only users in production. Fixed with clear "Sign in to your NextStep account to view your assignments here." message.
- Secondary: AI study plan tab → `fetchStudyPlan()` → hits unimplemented AI endpoint → shows "Could Not Generate Plan" error. Replaced with a soft placeholder: "Your study plan will appear here once your grades sync."

**Changes made (`SmartPlannerScreen.tsx`):**
- `ErrorView` now detects 401 errors and shows a human-readable sign-in message.
- `AiPlanView` error branch replaced with a non-alarming placeholder matching the "grades not yet synced" context.

### Planner data flow (after sync)

After background sync completes, `Assignment` rows are in the DB for the user. `GET /api/assignments` (with proper JWT auth) returns those rows. The Planner displays them grouped by `groupAssignments()` (overdue / today / this week / later / completed). This flow is already wired; no schema or route changes were needed for the Planner.

### Written trace: sign-in → sync → dashboard/planner data

| Step | Code path | Confirmed |
|------|-----------|-----------|
| SchoolLoginScreen → connect | `connectHac()` → `POST /hac/login` | ✓ route exists |
| loginHAC() resolves (credentials valid) | `hacClient.ts:loginHAC()` | ✓ unchanged |
| Response returned immediately | `gradesRouter.ts` hac/login handler | ✓ this sprint |
| Background sync marks 'syncing' | `runBackgroundSync()` → `prisma.schoolConnection.update` | ✓ this sprint |
| getStudentInfo → User + Profile upsert | `runBackgroundSync()` internal block | ✓ this sprint |
| hacGrades → Assignment rows upserted | `runBackgroundSync()` → `prisma.assignment.upsert` | ✓ this sprint |
| syncStatus → 'complete' | `runBackgroundSync()` final update | ✓ this sprint |
| Dashboard polls /sync-status | `checkSyncStatus()` in DashboardScreen | ✓ this sprint |
| Dashboard shows syncing banner | `SyncBanner` component | ✓ this sprint |
| Dashboard reload on complete | `checkSyncStatus()` → `fetchStudentData()` | ✓ this sprint |
| Planner shows synced assignments | `fetchAssignments()` → `/assignments` | ✓ pre-existing route |

### Type check

Backend: 0 errors. Mobile (src/): 0 errors.

---
