# TEST 01 — Database Layer & Backend Health Verification

## What This Tests
- Prisma schema is SQLite (not PostgreSQL)
- Database file exists and has all required tables
- Seed data is present and queryable
- Backend starts and responds on port 3001
- HAC connectivity endpoint is reachable
- TypeScript builds cleanly

---

## Pre-Test Setup

Make sure the backend is NOT already running before starting this test.
Kill any existing process on port 3001:

```bash
# On Windows Git Bash:
netstat -ano | grep :3001
# Kill the PID shown, or just proceed — the test will catch it
```

---

## TEST 1.1 — Schema File Verification

**Read** `backend/prisma/schema.prisma`.

Assert ALL of the following are true — if any fail, report FAIL with the exact line:

- [ ] Line containing `provider` in `datasource db` block reads exactly `provider = "sqlite"`
- [ ] There is NO `directUrl` field anywhere in the datasource block
- [ ] There IS a `DATABASE_URL` env reference: `url = env("DATABASE_URL")`
- [ ] Model `User` exists with fields: `id`, `email`, `passwordHash`, `name`, `role`
- [ ] Model `Course` exists with field `userId`
- [ ] Model `Grade` exists with fields `courseId`, `userId`, `letterGrade`, `percentage`
- [ ] Model `Assignment` exists
- [ ] Model `StudentProfile` exists
- [ ] Model `SchoolConnection` exists with fields `systemType`, `districtUrl`, `cachedSession`
  (Note: `cachedSession` may be `String?` — that is correct after FIX_04)

**Report:** PASS if all true. FAIL with specific missing item if any false.

---

## TEST 1.2 — Migration Lock Consistency

**Read** `backend/prisma/migrations/migration_lock.toml`.

Assert:
- [ ] File contains `provider = "sqlite"` (not postgresql)

**Report:** PASS or FAIL with file contents.

---

## TEST 1.3 — Environment File Check

**Check** whether `backend/.env` exists.

Assert:
- [ ] File exists
- [ ] Contains `DATABASE_URL=` with a value starting with `file:`
- [ ] Contains `JWT_SECRET=` with a non-empty value
- [ ] Does NOT contain `DIRECT_URL=` (this was removed in FIX_01)

**Report:** PASS or FAIL. If file does not exist: FAIL — run FIX_01 again.

---

## TEST 1.4 — Prisma Client Generation

Run:
```bash
cd backend && npx prisma generate 2>&1
```

Assert:
- [ ] Exit code is 0
- [ ] Output contains "Generated Prisma Client"
- [ ] Output does NOT contain "Error" or "error"

**Report:** PASS with generated client path, or FAIL with full error output.

---

## TEST 1.5 — Database File Existence and Table Check

Run:
```bash
cd backend && node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
Promise.all([
  p.user.count(),
  p.course.count(),
  p.grade.count(),
  p.assignment.count(),
  p.studentProfile.count(),
  p.schoolConnection.count(),
]).then(([u,c,g,a,sp,sc]) => {
  console.log(JSON.stringify({ users:u, courses:c, grades:g, assignments:a, profiles:sp, connections:sc }));
  return p.\$disconnect();
}).catch(e => { console.error('DB ERROR:', e.message); process.exit(1); })
"
```

Assert:
- [ ] Command exits with code 0 (no error)
- [ ] Output is valid JSON with all six keys present
- [ ] `users` >= 1 (seed data exists — expect at least `test@nextstep.com`)
- [ ] `courses` >= 6 (seeded courses exist)
- [ ] `grades` >= 6 (seeded grades exist)
- [ ] `assignments` >= 1

**Report:** PASS with counts, or FAIL with the DB error message.

---

## TEST 1.6 — Seed Data Correctness

Run:
```bash
cd backend && node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.user.findUnique({ where: { email: 'test@nextstep.com' }, include: { courses: { include: { grades: true } } } })
  .then(u => {
    if (!u) { console.error('SEED USER NOT FOUND'); process.exit(1); }
    console.log(JSON.stringify({
      name: u.name,
      role: u.role,
      courseCount: u.courses.length,
      gradesCount: u.courses.reduce((s,c) => s + c.grades.length, 0)
    }));
    return p.\$disconnect();
  })
  .catch(e => { console.error(e.message); process.exit(1); })
"
```

Assert:
- [ ] User found with email `test@nextstep.com`
- [ ] `name` is not null (should be 'Test Student' from seed, or real name from HAC sync)
- [ ] `courseCount` >= 6
- [ ] `gradesCount` >= 6

**Report:** PASS with the JSON output, or FAIL with error.

---

## TEST 1.7 — Backend TypeScript Compilation

Run:
```bash
cd backend && npx tsc --noEmit 2>&1
```

Assert:
- [ ] Exit code is 0
- [ ] Output is empty (no errors, no warnings)

**Report:** PASS or FAIL with full tsc output.

---

## TEST 1.8 — Backend Server Startup

Start the backend in a background-compatible way:

```bash
cd backend && npm run dev &
sleep 5
curl -s http://localhost:3001/health
```

Assert:
- [ ] `curl` returns `{"status":"ok"}`
- [ ] No crash output in the startup logs

**Report:** PASS with health response, or FAIL with startup error.

---

## TEST 1.9 — HAC Connectivity Endpoint

After backend is running:

```bash
curl -s http://localhost:3001/api/health/connectivity
```

Assert:
- [ ] Response is valid JSON
- [ ] Contains a `status` field (value is either `"reachable"` or `"unreachable"`)
- [ ] If `"unreachable"`: this is a NETWORK WARNING, not a code failure.
  The backend is running correctly — it just cannot reach the external HAC server.
  Document the `code` and `error` fields from the response.

**Report:**
- If status = "reachable": PASS
- If status = "unreachable": NETWORK WARNING — log the error code and continue.
  This does not block other tests, but grade scraping will fail until network is fixed.

---

## TEST 1.10 — Auth Route Smoke Test

```bash
curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@nextstep.com","password":"nextstep123"}'
```

Assert:
- [ ] Response status 200
- [ ] Response body has `data.token` (a non-empty string)
- [ ] Response body has `data.user.email` = `"test@nextstep.com"`
- [ ] Response body has `data.user.role` = `"STUDENT"`

**Save the token** — subsequent tests will need it:
```
TEST_JWT=<token from data.token>
```

**Report:** PASS with user data, or FAIL with full response body.

---

## TEST 1.11 — Protected Route Requires Auth

```bash
curl -s http://localhost:3001/api/students/me
```

Assert:
- [ ] Response status is 401 (not 200)
- [ ] Response body contains an error about authentication/unauthorized

**Report:** PASS if 401 returned, FAIL if 200 or another status.

---

## TEST 1.12 — Protected Route Works With Auth

Using the `TEST_JWT` saved from TEST 1.10:

```bash
curl -s http://localhost:3001/api/students/me \
  -H "Authorization: Bearer $TEST_JWT"
```

Assert:
- [ ] Response status 200
- [ ] Response body has `data.id`, `data.email`, `data.name`, `data.courses`
- [ ] `data.courses` is an array with length >= 6
- [ ] `data.courses[0]` has fields: `name`, `teacher`, `period`, `grade`

**Report:** PASS with student data summary, or FAIL with response.

---

## Summary

After all sub-tests, report:

```
TEST 01 — Database Layer & Backend Health
------------------------------------------
1.1  Schema file:         PASS/FAIL
1.2  Migration lock:      PASS/FAIL
1.3  Environment file:    PASS/FAIL
1.4  Prisma generate:     PASS/FAIL
1.5  DB tables:           PASS/FAIL (counts: users=N courses=N ...)
1.6  Seed data:           PASS/FAIL
1.7  TypeScript compile:  PASS/FAIL
1.8  Backend startup:     PASS/FAIL
1.9  HAC connectivity:    PASS/NETWORK_WARNING/FAIL
1.10 Auth login:          PASS/FAIL
1.11 Auth required:       PASS/FAIL
1.12 Auth works:          PASS/FAIL
------------------------------------------
OVERALL: PASS (if all PASS) / FAIL (if any FAIL)
```
