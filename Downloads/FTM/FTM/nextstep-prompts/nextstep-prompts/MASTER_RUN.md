# MASTER_RUN — NextStep Full Repair & Verification Sprint

## ⚠️ READ EVERY WORD OF THIS FILE BEFORE TOUCHING ANYTHING ⚠️

This is the single entry point that runs both the complete fix suite
and the complete test suite for the NextStep app's live portal integration.

You are fixing a React Native (Expo) + Express/TypeScript/Prisma/SQLite app
that scrapes real grade data from school portals (HAC / PowerSchool).

---

## Your Operating Rules (Non-Negotiable)

1. **Read before you write.** Every fix prompt lists files to read first.
   Do not skip the read step. The codebase has interconnected types and
   existing logic that must be preserved.

2. **One fix at a time, in sequence.** Do not jump ahead. Fix 01 must
   complete before Fix 02 starts. A broken database layer makes all
   other fixes fail.

3. **TypeScript gate between every fix.** After each fix, run
   `npx tsc --noEmit` in the affected directory. Zero errors required
   before proceeding.

4. **Never store passwords.** This app handles real student school
   credentials. Passwords must never be written to AsyncStorage,
   SQLite, or any log output. This is enforced in tests.

5. **Prefer numeric grades over letter grades.** When displaying
   assignment scores, show `92 / 100 (92.0%)` not just `A`.

6. **Do not rebuild what already exists.** Read existing routes,
   components, and types before creating new ones. The codebase
   has working auth, grades, assignments, and navigation already.

---

## Directory Structure

This sprint uses two folders:

```
nextstep-prompts/
├── fixes/
│   ├── RUN_ALL_FIXES.md          ← Fixes orchestrator
│   ├── FIX_01_prisma_schema.md
│   ├── FIX_02_school_login_connect_hac.md
│   ├── FIX_03_dashboard_real_name.md
│   ├── FIX_04_session_persistence.md
│   ├── FIX_05_hac_selector_hardening.md
│   ├── FIX_06_powerschool_normalization.md
│   ├── FIX_07_unify_portal_connect.md
│   └── FIX_08_course_detail_assignments.md
└── tests/
    ├── RUN_ALL_TESTS.md           ← Tests orchestrator
    ├── TEST_01_database_backend_health.md
    ├── TEST_02_hac_login_session.md
    ├── TEST_03_grade_fetching_normalization.md
    ├── TEST_04_mobile_code_audit.md
    └── TEST_05_end_to_end_regression.md
```

---

## PHASE 1 — APPLY ALL FIXES

### Step 1.A — Read the Fixes Orchestrator

**Read** `fixes/RUN_ALL_FIXES.md` completely.

This file describes:
- The pre-flight checklist (npm installs, node version check)
- The 8 fixes in order with their TypeScript gates
- What files are modified by each fix
- How to handle failures

### Step 1.B — Execute Fixes 01 Through 08 in Order

For each fix, follow this exact workflow:

```
1. Read fixes/FIX_NN_<name>.md from top to bottom completely
2. Read every file listed in the "Files You Must Read" section of that fix
3. Apply every change described in the fix
4. Run the TypeScript gate command specified in that fix
5. Verify all acceptance criteria checkboxes are satisfied
6. Only then proceed to the next fix
```

The 8 fixes in order:

| Order | File | What it fixes |
|-------|------|---------------|
| 1 | FIX_01_prisma_schema.md | SQLite vs PostgreSQL schema mismatch |
| 2 | FIX_02_school_login_connect_hac.md | SchoolLoginScreen never called backend |
| 3 | FIX_03_dashboard_real_name.md | Dashboard always showed "Test" |
| 4 | FIX_04_session_persistence.md | Sessions lost on backend restart |
| 5 | FIX_05_hac_selector_hardening.md | HAC scraper CSS selectors fragile |
| 6 | FIX_06_powerschool_normalization.md | PowerSchool always returned 0 grades |
| 7 | FIX_07_unify_portal_connect.md | Two duplicate portal connect flows |
| 8 | FIX_08_course_detail_assignments.md | Courses not tappable; no assignment view |

### Step 1.C — Post-Fix Verification

After all 8 fixes complete, run:

```bash
# Backend TypeScript
cd backend && npx tsc --noEmit && echo "✅ BACKEND TS CLEAN"

# Mobile TypeScript
cd nextstep-mobile && npx tsc --noEmit && echo "✅ MOBILE TS CLEAN"

# Backend starts
cd backend && npm run dev &
sleep 5
curl -s http://localhost:3001/health && echo "✅ BACKEND RUNNING"
```

All three must succeed before starting Phase 2.

---

## PHASE 2 — RUN ALL TESTS

### Step 2.A — Read the Tests Orchestrator

**Read** `tests/RUN_ALL_TESTS.md` completely.

This file describes:
- Pre-test setup (getting JWT, checking HAC reachability)
- The 5 test suites in order
- The final report format
- The remediation guide for any failures

### Step 2.B — Execute Tests 01 Through 05 in Order

For each test suite, follow this exact workflow:

```
1. Read tests/TEST_NN_<name>.md from top to bottom completely
2. Execute each sub-test by running the commands shown
3. Assert each condition and mark PASS, FAIL, or NETWORK_BLOCKED
4. Document any FAILs immediately
5. Continue to the next sub-test (failures are documented, not blocking)
6. Compile the suite result (PASS only if all non-NETWORK_BLOCKED tests PASS)
```

The 5 test suites in order:

| Order | File | What it tests |
|-------|------|---------------|
| 1 | TEST_01_database_backend_health.md | DB schema, migrations, seed, auth |
| 2 | TEST_02_hac_login_session.md | HAC login endpoint, session creation |
| 3 | TEST_03_grade_fetching_normalization.md | Grade data, numeric averages, assignments |
| 4 | TEST_04_mobile_code_audit.md | CourseDetail, navigation, no password storage |
| 5 | TEST_05_end_to_end_regression.md | Full flow, security, regression |

### Step 2.C — Compile Final Report

After all 5 test suites, produce the full report defined in
`tests/RUN_ALL_TESTS.md` under "After All Tests: Final Report".

Fill in every [ PASS | FAIL | NETWORK_BLOCKED ] entry.

---

## PHASE 3 — REMEDIATION (If Any Tests Fail)

If any test suite produces FAIL results:

1. Identify which FIX prompt corresponds to the failing test
   (use the remediation guide table in `RUN_ALL_TESTS.md`)

2. Re-read the relevant FIX prompt from the beginning

3. Re-apply only the portions that are failing
   (check if the file already has the change before re-applying)

4. Re-run ONLY the failing test suite, not the entire suite

5. Update the final report with corrected results

---

## What Success Looks Like

When this sprint is complete:

✅ A student opens the app and picks their district (e.g., Katy ISD)
✅ They enter their HAC username and password
✅ The app calls the backend, which logs into HAC, creates a real session
✅ They land on their dashboard showing their actual name (e.g., "Sarah")
✅ The Grade Portal shows a green "Connected" banner
✅ Their Report Card shows real courses with real numeric averages (e.g., 94.2%)
✅ Tapping a course opens the assignment list for that course
✅ Each assignment shows "92 / 100 (92.0%)" style numeric scoring
✅ A category breakdown shows weighted average per category
✅ Their GPA is computed from real grades
✅ Closing and reopening the app does not lose the connection
✅ Entering wrong credentials shows a clear error message
✅ The password is never written to disk anywhere

---

## Critical Files Reference

For quick context during this sprint, these are the most important files:

**Backend (issues are here):**
- `backend/prisma/schema.prisma` — database models
- `backend/src/integrations/grades/hacClient.ts` — HAC scraping
- `backend/src/integrations/grades/gradesRouter.ts` — grade API routes
- `backend/src/integrations/grades/normalizeGrades.ts` — data normalization
- `backend/src/integrations/grades/sessionStore.ts` — session management
- `backend/src/app.ts` — Express app + auth bypass

**Mobile (issues are here):**
- `nextstep-mobile/src/screens/SchoolLoginScreen.tsx` — school sign-in
- `nextstep-mobile/src/screens/GradeViewerScreen.tsx` — grade display
- `nextstep-mobile/src/screens/CourseDetailScreen.tsx` — NEW (created by FIX_08)
- `nextstep-mobile/src/screens/GradePortalDashboard.tsx` — portal hub
- `nextstep-mobile/src/screens/PortalConnectScreen.tsx` — connect screen
- `nextstep-mobile/src/navigation/GradePortalNavigator.tsx` — navigation
- `nextstep-mobile/src/api/portalApi.ts` — portal API client
- `nextstep-mobile/src/context/SchoolSessionContext.tsx` — session context

---

## Environment Variables Required

`backend/.env` must contain:

```
DATABASE_URL="file:./dev.db"
JWT_SECRET="nextstep-dev-secret-change-in-production"
ENABLE_DEV_INTEGRATION_AUTH_BYPASS=false
```

Do NOT commit `.env` to git. Verify it is in `.gitignore`.

---

## Begin Now

**Start with Phase 1, Step 1.A: Read `fixes/RUN_ALL_FIXES.md`.**
