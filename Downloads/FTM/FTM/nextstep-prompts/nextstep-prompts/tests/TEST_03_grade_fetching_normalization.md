# TEST 03 — Grade Fetching, Normalization & Assignment Data

## What This Tests
- `/api/integrations/grades/current` returns normalized grades after login
- Grades contain numeric averages (not just letter grades)
- Assignments array is populated per course
- Assignment data has name, score, totalPoints, percentage, category, dateDue
- `/api/integrations/grades/gpa` computes correct GPA
- `/api/integrations/grades/info` returns real student name
- PowerSchool normalization returns data (not empty array)
- `GradeViewerScreen` shows live data when connected

---

## Pre-Test Requirements

- TEST_01 and TEST_02 must PASS
- `TEST_JWT` must be set
- `HAC_SESSION_TOKEN` must be set (requires real credentials from TEST 2.5)
- If HAC is NETWORK_BLOCKED, mark network-dependent tests as NETWORK_BLOCKED

---

## TEST 3.1 — Current Grades Route: No Session (Cold State)

First, clear any active session:

```bash
curl -s -X DELETE http://localhost:3001/api/integrations/grades/session \
  -H "Authorization: Bearer $TEST_JWT"
```

Then try to fetch grades:

```bash
curl -s http://localhost:3001/api/integrations/grades/current \
  -H "Authorization: Bearer $TEST_JWT"
```

Assert:
- [ ] Response status is 401
- [ ] Response body has `error.code` = `"NO_SCHOOL_SESSION"`
- [ ] Response body has `error.message` containing "log in" or "session"

**Report:** PASS or FAIL.

---

## TEST 3.2 — Current Grades Route: After HAC Login (Network Required)

**SKIP if NETWORK_BLOCKED.**

Ensure HAC session exists (re-run login if needed). Then:

```bash
curl -s http://localhost:3001/api/integrations/grades/current \
  -H "Authorization: Bearer $TEST_JWT"
```

Assert:
- [ ] Response status 200
- [ ] `data.systemType` = `"HAC"`
- [ ] `data.grades` is an array
- [ ] `data.grades.length` >= 1 (at least one course)

For each course in `data.grades`, assert:
- [ ] Has `id` (string, non-empty)
- [ ] Has `name` (string, non-empty)
- [ ] Has `teacher` (string — may be empty for some districts but field exists)
- [ ] Has `period` (string)
- [ ] Has `average` (number or null — NOT a letter grade string)
- [ ] Has `letterGrade` (string or null)
- [ ] Has `assignments` (array — may be empty if school hasn't entered grades)

**Numeric average check:**
For every course where `average` is not null:
- [ ] `average` is a number between 0 and 100
- [ ] `average` is NOT a string like "A" or "B+"
- [ ] `letterGrade` is derived correctly:
  - average >= 90 → letterGrade = "A"
  - average >= 80 → letterGrade = "B"
  - average >= 70 → letterGrade = "C"
  - average >= 60 → letterGrade = "D"
  - average < 60 → letterGrade = "F"

**Assignment check (for courses with assignments.length > 0):**
For each assignment in `assignments`:
- [ ] Has `name` (string)
- [ ] Has `category` (string, may be empty)
- [ ] Has `score` (number or null)
- [ ] Has `totalPoints` (number or null)
- [ ] Has `percentage` (string)
- [ ] Has `dateDue` (string)

If `score` and `totalPoints` are both non-null:
- [ ] `score / totalPoints * 100` approximately matches `percentage` value

**Report:** PASS with course count and sample course JSON, or FAIL with error.

---

## TEST 3.3 — GPA Computation

**SKIP if NETWORK_BLOCKED.**

```bash
curl -s http://localhost:3001/api/integrations/grades/gpa \
  -H "Authorization: Bearer $TEST_JWT"
```

Assert:
- [ ] Response status 200
- [ ] `data.gpa` is a number between 0.0 and 4.0 (or null if no graded courses)
- [ ] `data.courseCount` >= 1
- [ ] `data.systemType` = `"HAC"` or `"PowerSchool"`

If `data.gpa` is not null:
- [ ] It is rounded to 2 decimal places (e.g., 3.75 not 3.75000001)
- [ ] It makes sense given the grades (a student with all A's should have GPA >= 3.7)

**Report:** PASS with GPA value and course count, or FAIL.

---

## TEST 3.4 — Student Info Endpoint

**SKIP if NETWORK_BLOCKED.**

```bash
curl -s http://localhost:3001/api/integrations/grades/info \
  -H "Authorization: Bearer $TEST_JWT"
```

Assert:
- [ ] Response status 200
- [ ] `data.name` is a non-empty string (the student's real name, NOT "Test Student")
- [ ] `data.name` looks like a real name (has at least 2 characters, not blank)
- [ ] `data.grade` is present (may be empty if scraper couldn't find it)
- [ ] `data.school` is present (may be empty for some districts)

**Report:** PASS with name and school values, or FAIL.

---

## TEST 3.5 — Dashboard Name Updated in Database

After TEST 3.4 (student info fetched after HAC login):

```bash
cd backend && node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.user.findFirst({ where: { NOT: { name: 'Test Student' } } })
  .then(u => {
    if (u) {
      console.log('UPDATED NAME FOUND:', u.name);
    } else {
      console.log('NO UPDATED NAME YET — checking all users:');
      return p.user.findMany({ select: { id: true, name: true, email: true } });
    }
    return p.\$disconnect();
  })
  .then(users => {
    if (users) console.log(JSON.stringify(users));
    return p.\$disconnect();
  })
  .catch(e => { console.error(e.message); process.exit(1); })
"
```

Assert:
- [ ] At least one user has a name that is NOT `"Test Student"`
  (the HAC login in FIX_03 should have written the real name)

**Report:** PASS with updated name, or FAIL with current DB state.

---

## TEST 3.6 — PowerSchool Normalization Code Audit

**Read** `backend/src/integrations/grades/normalizeGrades.ts` fully.

Assert:
- [ ] `normalizePsGrades` function does NOT return `[]` unconditionally
- [ ] `normalizePsGrades` accepts `PSClass[]` (not `unknown[]`)
- [ ] `PSClass` is imported from `./powerSchoolClient`
- [ ] For a numeric grade string (e.g., "92.5"), `average` is set to a float
- [ ] For a letter grade string (e.g., "A"), `letterGrade` is set and `average` is estimated
- [ ] Course `id` follows pattern `ps-N-<slug>` (different from HAC's `hac-N-<slug>`)
- [ ] `assignments` is always `[]` for PowerSchool (PS home page doesn't have assignment detail)

**Report:** PASS if all true. FAIL with specific line for each violation.

---

## TEST 3.7 — Normalizer Unit Behavior (No Network Needed)

Run this Node.js snippet to test normalization logic directly:

```bash
cd backend && node -e "
// Test HAC normalization
const { normalizeHacGrades, normalizePsGrades, computeGpaFromNormalized } = require('./dist/integrations/grades/normalizeGrades');

// Test HAC
const fakeHacClasses = [
  { name: 'AP English', period: '1', teacher: 'Mr. Test', room: '101', average: '92.5', scores: [
    { name: 'Essay 1', category: 'Major', score: 92, totalPoints: 100, percentage: '92%', dateDue: '05/01/2025' }
  ]},
  { name: 'Math', period: '2', teacher: '', room: '', average: 'N/A', scores: [] },
];

const hacResult = normalizeHacGrades(fakeHacClasses);
console.log('HAC:', JSON.stringify(hacResult.map(c => ({ name: c.name, average: c.average, letter: c.letterGrade, assignments: c.assignments.length }))));

// Test PS
const fakePsClasses = [
  { name: 'Biology', grade: '88.5', term: 'Q1' },
  { name: 'History', grade: 'A-', term: 'Q1' },
  { name: 'PE', grade: '--', term: 'Q1' },
];
const psResult = normalizePsGrades(fakePsClasses);
console.log('PS:', JSON.stringify(psResult.map(c => ({ name: c.name, average: c.average, letter: c.letterGrade }))));

// Test GPA
const gpa = computeGpaFromNormalized(hacResult);
console.log('GPA:', gpa);
" 2>&1
```

If `dist/` doesn't exist, compile first:
```bash
cd backend && npx tsc && node -e "..." # same script
```

Assert:
- [ ] HAC course 1: `average` = 92.5 (number), `letterGrade` = "A", `assignments.length` = 1
- [ ] HAC course 2: `average` = null (N/A parsed to null), `letterGrade` = null
- [ ] PS course 1 (numeric): `average` = 88.5, `letterGrade` = "B"
- [ ] PS course 2 (letter "A-"): `letterGrade` = "A-", `average` is estimated (approx 92)
- [ ] PS course 3 (--): `average` = null or `letterGrade` = null
- [ ] GPA is between 0 and 4

**Report:** PASS with output, or FAIL with error.

---

## TEST 3.8 — Schedule Endpoint

**SKIP if NETWORK_BLOCKED.**

```bash
curl -s http://localhost:3001/api/integrations/grades/schedule \
  -H "Authorization: Bearer $TEST_JWT"
```

Assert:
- [ ] Response status 200
- [ ] `data.schedule` is an array
- [ ] If array is non-empty, each entry is an object with string values
  (the exact keys depend on the district's column headers)

**Report:** PASS with schedule count, or FAIL.

---

## TEST 3.9 — Transcript Endpoint

**SKIP if NETWORK_BLOCKED.**

```bash
curl -s http://localhost:3001/api/integrations/grades/transcript \
  -H "Authorization: Bearer $TEST_JWT"
```

Assert:
- [ ] Response status 200
- [ ] `data.transcript` is an object
- [ ] `data.transcript.semesters` is an array (may be empty for new students)
- [ ] `data.transcript.cumulativeGPA` is either null or a decimal string

**Report:** PASS or FAIL with transcript summary.

---

## TEST 3.10 — Session Disconnect

```bash
curl -s -X DELETE http://localhost:3001/api/integrations/grades/session \
  -H "Authorization: Bearer $TEST_JWT"
```

Assert:
- [ ] Response status 200
- [ ] `data.disconnected` = `true`

Then verify status:
```bash
curl -s http://localhost:3001/api/integrations/grades/status \
  -H "Authorization: Bearer $TEST_JWT"
```

Assert:
- [ ] `data.connected` = `false`
- [ ] `data.sessionExpiresIn` = 0

**Report:** PASS or FAIL.

---

## Summary

```
TEST 03 — Grade Fetching & Normalization
-----------------------------------------
3.1  No session → 401:              PASS/FAIL
3.2  Live grades structure:         PASS/FAIL/NETWORK_BLOCKED
3.3  GPA computation:               PASS/FAIL/NETWORK_BLOCKED
3.4  Student info endpoint:         PASS/FAIL/NETWORK_BLOCKED
3.5  DB name updated:               PASS/FAIL
3.6  PS normalization code audit:   PASS/FAIL
3.7  Normalizer unit behavior:      PASS/FAIL
3.8  Schedule endpoint:             PASS/FAIL/NETWORK_BLOCKED
3.9  Transcript endpoint:           PASS/FAIL/NETWORK_BLOCKED
3.10 Session disconnect:            PASS/FAIL
-----------------------------------------
OVERALL: PASS/FAIL
```
