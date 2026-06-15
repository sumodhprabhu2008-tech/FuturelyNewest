# RUN_ALL_TESTS — NextStep Live Portal Sprint: Execute All Tests in Order

## ⚠️ READ THIS ENTIRE FILE BEFORE RUNNING ANY TEST ⚠️

This file orchestrates all 5 test suites for the NextStep app.
Tests must run in sequence. A failure in an early test does NOT
automatically block later tests, but failures should be documented
before proceeding.

**Do NOT run tests before running ALL fixes.** The test suite assumes
FIX_01 through FIX_08 have all been executed successfully.

---

## Pre-Test Setup

### 1. Verify backend is running
```bash
curl -s http://localhost:3001/health
```
Expected: `{"status":"ok"}`

If backend is not running:
```bash
cd backend && npm run dev
```
Wait 5 seconds, then re-check.

### 2. Get a JWT for testing
```bash
TEST_JWT=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@nextstep.com","password":"nextstep123"}' \
  | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.data?.token ?? 'NO_TOKEN')")
echo "JWT: $TEST_JWT"
```
Expected: A long JWT string. If you see `NO_TOKEN`, the seed user is missing — run:
```bash
cd backend && npx ts-node prisma/seed.ts
```

### 3. Check HAC network reachability
```bash
curl -s http://localhost:3001/api/health/connectivity
```
- If `"status":"reachable"` → All network tests can run
- If `"status":"unreachable"` → Mark all HAC network tests as NETWORK_BLOCKED

---

## Test Execution Order

---

### TEST SUITE 1 — Database Layer & Backend Health
**File:** `tests/TEST_01_database_backend_health.md`

Read TEST_01 completely. Execute every sub-test (1.1 through 1.12).

This suite verifies the foundation. All other suites depend on it.
If any sub-test FAILS (not NETWORK_WARNING), do NOT proceed until fixed.

**Critical gates:**
- 1.1 Schema: MUST PASS (confirms FIX_01 worked)
- 1.7 TypeScript: MUST PASS (confirms no compilation errors)
- 1.8 Backend startup: MUST PASS (required for all HTTP tests)
- 1.10 Auth login: MUST PASS (provides JWT for all subsequent tests)

Expected result: All 12 sub-tests PASS or NETWORK_WARNING.

---

### TEST SUITE 2 — HAC Login Flow & Session Creation
**File:** `tests/TEST_02_hac_login_session.md`

Read TEST_02 completely. Execute every sub-test (2.1 through 2.9).

**Depends on:** TEST_01 passing + TEST_JWT set.

**Critical gates:**
- 2.1–2.3 Validation: MUST PASS
- 2.8 Code audit: MUST PASS (confirms FIX_02 was correctly applied)

For 2.5 (real HAC login): requires real school credentials.
If you have them, use them. If not, test with wrong credentials
to verify the error path.

Expected result: Validation tests PASS, code audit PASS, network tests
PASS or NETWORK_BLOCKED.

---

### TEST SUITE 3 — Grade Fetching & Normalization
**File:** `tests/TEST_03_grade_fetching_normalization.md`

Read TEST_03 completely. Execute every sub-test (3.1 through 3.10).

**Depends on:** TEST_01 and TEST_02 passing.

**Critical gates:**
- 3.1 No session → 401: MUST PASS
- 3.6 PS normalization code audit: MUST PASS (confirms FIX_06)
- 3.7 Normalizer unit behavior: MUST PASS (offline test, no network needed)

Expected result: Code audit and unit tests PASS, network tests PASS or NETWORK_BLOCKED.

---

### TEST SUITE 4 — Mobile App Code Audit
**File:** `tests/TEST_04_mobile_code_audit.md`

Read TEST_04 completely. Execute every sub-test (4.1 through 4.13).

**Depends on:** All FIX prompts executed. No running backend needed
(these are code audits, not HTTP tests).

**Critical gates:**
- 4.1 TypeScript: MUST PASS (zero errors)
- 4.2 CourseDetailScreen exists: MUST PASS (confirms FIX_08)
- 4.3 Navigation type: MUST PASS
- 4.4 CourseRow tappable: MUST PASS
- 4.6 Numeric grade display: MUST PASS
- 4.12 No password in storage: MUST PASS (security requirement)

Expected result: All 13 sub-tests PASS.

---

### TEST SUITE 5 — End-to-End & Regression
**File:** `tests/TEST_05_end_to_end_regression.md`

Read TEST_05 completely. Execute every sub-test (5.1 through 5.10).

**Depends on:** All previous suites passing.

**Critical gates:**
- 5.7 Password not in storage: MUST PASS (security)
- 5.10 Seeded data regression: MUST PASS (existing functionality not broken)

Expected result: Security tests PASS, regression PASS, network tests PASS or NETWORK_BLOCKED.

---

## After All Tests: Final Report

Compile a single final report in this format:

```
═══════════════════════════════════════════════════════
NEXTSTEP LIVE PORTAL SPRINT — FULL TEST REPORT
Executed: [DATE AND TIME]
═══════════════════════════════════════════════════════

SUITE 1 — Database & Backend Health
  1.1  Schema file:              [ PASS | FAIL ]
  1.2  Migration lock:           [ PASS | FAIL ]
  1.3  Environment file:         [ PASS | FAIL ]
  1.4  Prisma generate:          [ PASS | FAIL ]
  1.5  DB tables:                [ PASS | FAIL ]
  1.6  Seed data:                [ PASS | FAIL ]
  1.7  TypeScript compile:       [ PASS | FAIL ]
  1.8  Backend startup:          [ PASS | FAIL ]
  1.9  HAC connectivity:         [ PASS | NETWORK_WARNING | FAIL ]
  1.10 Auth login:               [ PASS | FAIL ]
  1.11 Auth required:            [ PASS | FAIL ]
  1.12 Auth works:               [ PASS | FAIL ]
  SUITE RESULT:                  [ PASS | FAIL ]

SUITE 2 — HAC Login & Session
  2.1  Missing baseUrl:          [ PASS | FAIL ]
  2.2  Invalid URL:              [ PASS | FAIL ]
  2.3  Missing credentials:      [ PASS | FAIL ]
  2.4  Auth required:            [ PASS | BYPASS_ACTIVE | FAIL ]
  2.5  Real HAC login:           [ PASS | FAIL | NETWORK_BLOCKED ]
  2.6  Session status:           [ PASS | FAIL | SKIPPED ]
  2.7  Status when cold:         [ PASS | FAIL ]
  2.8  Code audit:               [ PASS | FAIL ]
  2.9  Session persistence:      [ PASS | FAIL | SKIPPED ]
  SUITE RESULT:                  [ PASS | FAIL ]

SUITE 3 — Grade Fetching & Normalization
  3.1  No session → 401:         [ PASS | FAIL ]
  3.2  Live grades structure:    [ PASS | FAIL | NETWORK_BLOCKED ]
  3.3  GPA computation:          [ PASS | FAIL | NETWORK_BLOCKED ]
  3.4  Student info:             [ PASS | FAIL | NETWORK_BLOCKED ]
  3.5  DB name updated:          [ PASS | FAIL ]
  3.6  PS normalization audit:   [ PASS | FAIL ]
  3.7  Normalizer unit:          [ PASS | FAIL ]
  3.8  Schedule endpoint:        [ PASS | FAIL | NETWORK_BLOCKED ]
  3.9  Transcript endpoint:      [ PASS | FAIL | NETWORK_BLOCKED ]
  3.10 Session disconnect:       [ PASS | FAIL ]
  SUITE RESULT:                  [ PASS | FAIL ]

SUITE 4 — Mobile Code Audit
  4.1  TypeScript compile:       [ PASS | FAIL ]
  4.2  CourseDetailScreen:       [ PASS | FAIL ]
  4.3  Navigation type:          [ PASS | FAIL ]
  4.4  CourseRow tappable:       [ PASS | FAIL ]
  4.5  coursesCache import:      [ PASS | FAIL ]
  4.6  Numeric grade display:    [ PASS | FAIL ]
  4.7  Category breakdown:       [ PASS | FAIL ]
  4.8  adaptPortalGrades:        [ PASS | FAIL ]
  4.9  Data source logic:        [ PASS | FAIL ]
  4.10 Dashboard status:         [ PASS | FAIL ]
  4.11 PortalConnect router:     [ PASS | FAIL ]
  4.12 No password stored:       [ PASS | FAIL ]
  4.13 Assignment empty state:   [ PASS | FAIL ]
  SUITE RESULT:                  [ PASS | FAIL ]

SUITE 5 — End-to-End & Regression
  5.1  Full E2E flow:            [ PASS | FAIL | NETWORK_BLOCKED ]
  5.2  No fake data when live:   [ PASS | FAIL | NETWORK_BLOCKED ]
  5.3  Wrong credentials:        [ PASS | FAIL | NETWORK_BLOCKED ]
  5.4  Invalid district URL:     [ PASS | FAIL ]
  5.5  Session expiry:           [ PASS | FAIL ]
  5.6  Dev bypass JWT:           [ PASS | BYPASS_DISABLED | FAIL ]
  5.7  Password not stored:      [ PASS | FAIL ]
  5.8  URL formats:              [ PASS | FAIL ]
  5.9  HAC selector log:         [ PASS | FAIL ]
  5.10 Seed data regression:     [ PASS | FAIL ]
  SUITE RESULT:                  [ PASS | FAIL ]

═══════════════════════════════════════════════════════
OVERALL RESULT: [ PASS | FAIL ]
NETWORK TESTS:  [ ALL_PASS | BLOCKED (N tests skipped) ]
SECURITY:       [ PASS | FAIL ] (5.7 + 4.12)
═══════════════════════════════════════════════════════

FAILING TESTS (list any FAILs here with details):
- [Test ID]: [What failed and what was expected]

BLOCKED TESTS (network):
- [List all NETWORK_BLOCKED tests]

NEXT ACTIONS (if any FAILs):
- [Which FIX prompt to re-run]
```

---

## If a Test Fails: Remediation Guide

| Failing Test | Likely Cause | Re-run Fix |
|---|---|---|
| 1.1 Schema | FIX_01 not applied or reverted | FIX_01 |
| 1.5 DB tables | Migration not run | FIX_01 step 5 |
| 1.7 TypeScript | Syntax error introduced | Check error file |
| 2.8 Code audit | FIX_02 not applied | FIX_02 |
| 3.6 PS audit | FIX_06 not applied | FIX_06 |
| 3.7 Normalizer unit | normalizePsGrades returns [] | FIX_06 |
| 4.1 Mobile TypeScript | Type mismatch | Check error |
| 4.2 CourseDetailScreen | FIX_08 not applied | FIX_08 |
| 4.4 CourseRow tappable | FIX_08 not applied | FIX_08 |
| 4.12 Password stored | Security violation | FIX_02 |
| 5.7 Password security | Security violation | FIX_02 |
| 5.10 Seed regression | Route broken | Check grades.ts |
