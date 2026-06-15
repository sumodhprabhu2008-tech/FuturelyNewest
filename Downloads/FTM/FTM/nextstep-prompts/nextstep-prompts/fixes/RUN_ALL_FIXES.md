# RUN_ALL_FIXES — NextStep Live Portal Sprint: Execute All Fixes in Order

## ⚠️ READ THIS ENTIRE FILE BEFORE EXECUTING ANYTHING ⚠️

This file orchestrates all 8 fix prompts for the NextStep app.
Each fix must be executed in sequence. Do NOT skip ahead.
Do NOT run a later fix if an earlier fix has TypeScript errors or fails its acceptance criteria.

---

## Pre-Flight Checklist (Do Before Anything Else)

Before running any fix, verify:

1. You are in the root of the `NextStep-Correct-main` directory (or equivalent)
2. The backend can be found at `./backend/`
3. The mobile app can be found at `./nextstep-mobile/`
4. You have Node.js installed (`node --version` should print v18+)
5. Run `cd backend && npm install --legacy-peer-deps` if `node_modules` is missing
6. Run `cd nextstep-mobile && npm install --legacy-peer-deps` if `node_modules` is missing

---

## Execution Order

Run each fix by reading its markdown file completely, then implementing
every step inside it. After each fix, run the TypeScript check before proceeding.

---

### STEP 1 — FIX_01: Prisma Schema (Database Foundation)
**File:** `fixes/FIX_01_prisma_schema.md`

Read FIX_01 completely. Execute every step inside it.

This fix MUST succeed before any other fix. A broken database layer
will cause every other fix to fail silently.

After completing: verify `backend/prisma/dev.db` exists and `npx prisma generate` runs clean.

**TypeScript gate:**
```bash
cd backend && npx tsc --noEmit
```
Zero errors required before proceeding.

---

### STEP 2 — FIX_02: School Login Connects HAC (Critical Grade Fix)
**File:** `fixes/FIX_02_school_login_connect_hac.md`

Read FIX_02 completely. Execute every step inside it.

This is the single most important fix. After this, signing in via
`SchoolLoginScreen` will create a real backend HAC session.

**TypeScript gate:**
```bash
cd nextstep-mobile && npx tsc --noEmit
```
Zero errors required before proceeding.

---

### STEP 3 — FIX_03: Dashboard Real Student Name
**File:** `fixes/FIX_03_dashboard_real_name.md`

Read FIX_03 completely. Execute every step inside it.

After this fix, the dashboard will show the student's real HAC name
instead of "Test Student" or "Test".

**TypeScript gate:**
```bash
cd backend && npx tsc --noEmit
```
Zero errors required before proceeding.

---

### STEP 4 — FIX_04: Session Persistence Across Restarts
**File:** `fixes/FIX_04_session_persistence.md`

Read FIX_04 completely. Execute every step inside it.

This fix requires a new Prisma migration. Run:
```bash
cd backend && npx prisma migrate dev --name add_cached_session
cd backend && npx prisma generate
```

**TypeScript gate:**
```bash
cd backend && npx tsc --noEmit
cd nextstep-mobile && npx tsc --noEmit
```
Both must pass before proceeding.

---

### STEP 5 — FIX_05: HAC Selector Hardening
**File:** `fixes/FIX_05_hac_selector_hardening.md`

Read FIX_05 completely. Execute every step inside it.

After this, the HAC scraper will work across more districts and
return proper period/average values.

**TypeScript gate:**
```bash
cd backend && npx tsc --noEmit
```
Zero errors required before proceeding.

---

### STEP 6 — FIX_06: PowerSchool Normalization + Auth Bypass Fix
**File:** `fixes/FIX_06_powerschool_normalization.md`

Read FIX_06 completely. Execute every step inside it.

After this, PowerSchool users will see real grades.
After this, the dev auth bypass will use real JWTs when available.

**TypeScript gate:**
```bash
cd backend && npx tsc --noEmit
```
Zero errors required before proceeding.

---

### STEP 7 — FIX_07: Unify Portal Connect Flows
**File:** `fixes/FIX_07_unify_portal_connect.md`

Read FIX_07 completely. Execute every step inside it.

After this, `GradePortalDashboard` shows real connection status,
and `PortalConnectScreen` won't duplicate/overwrite sessions.

**TypeScript gate:**
```bash
cd nextstep-mobile && npx tsc --noEmit
```
Zero errors required before proceeding.

---

### STEP 8 — FIX_08: Clickable Courses with Assignment Drill-Down
**File:** `fixes/FIX_08_course_detail_assignments.md`

Read FIX_08 completely. Execute every step inside it.

This fix creates `CourseDetailScreen.tsx` from scratch.
Verify the file exists after execution:
```
nextstep-mobile/src/screens/CourseDetailScreen.tsx
```

**TypeScript gate:**
```bash
cd nextstep-mobile && npx tsc --noEmit
```
Zero errors required before proceeding.

---

## Post-Fix Verification

After all 8 fixes:

### 1. Full TypeScript clean build
```bash
cd backend && npx tsc --noEmit && echo "BACKEND OK"
cd nextstep-mobile && npx tsc --noEmit && echo "MOBILE OK"
```

### 2. Start the backend
```bash
cd backend && npm run dev
```
Expected: Server running on port 3001, no errors in console.

### 3. Verify the health endpoint
```bash
curl http://localhost:3001/health
```
Expected: `{"status":"ok"}`

### 4. Verify HAC connectivity
```bash
curl http://localhost:3001/api/health/connectivity
```
Expected: `{"status":"reachable",...}` — if unreachable, check your network.

### 5. Run the test suite
After fixes pass, run the test suite from the `tests/` folder using
`RUN_ALL_TESTS.md` as the orchestrator.

---

## If a Fix Fails

1. Do NOT proceed to the next fix
2. Re-read the failed fix's markdown file from the beginning
3. Check if the file you were editing already had the change (idempotency)
4. Check TypeScript errors — they will indicate exactly which line is wrong
5. If a TypeScript error is in a file you did NOT edit, re-read that file
   to understand if a prior fix changed a type that this fix depends on

---

## Files Modified by This Sprint (Summary)

### Backend files modified:
- `backend/prisma/schema.prisma` — FIX_01, FIX_04
- `backend/.env` — FIX_01, FIX_06
- `backend/src/integrations/grades/gradesRouter.ts` — FIX_03, FIX_04
- `backend/src/integrations/grades/hacClient.ts` — FIX_05
- `backend/src/integrations/grades/normalizeGrades.ts` — FIX_06
- `backend/src/integrations/grades/sessionStore.ts` — FIX_04
- `backend/src/app.ts` — FIX_06

### Mobile files modified:
- `nextstep-mobile/src/screens/SchoolLoginScreen.tsx` — FIX_02
- `nextstep-mobile/src/screens/GradeViewerScreen.tsx` — FIX_07, FIX_08
- `nextstep-mobile/src/screens/GradePortalDashboard.tsx` — FIX_07
- `nextstep-mobile/src/screens/PortalConnectScreen.tsx` — FIX_07
- `nextstep-mobile/src/api/gradesApi.ts` — FIX_08

### New files created:
- `nextstep-mobile/src/screens/CourseDetailScreen.tsx` — FIX_08
- `backend/prisma/migrations/[timestamp]_add_cached_session/` — FIX_04
