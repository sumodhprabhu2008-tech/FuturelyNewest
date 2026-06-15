# TEST 05 — End-to-End Flow & Regression Tests

## What This Tests
- Full login-to-grades flow works end to end
- Dashboard shows real name (not "Test")
- HAC scraper CSS selectors return data for Katy ISD
- Session survives 30 minutes (TTL test)
- Dev auth bypass correctly uses real JWT
- No fake/seeded data shown when portal is connected
- All error paths surface correct messages
- Security: password not persisted anywhere

---

## Pre-Test Requirements

- All tests TEST_01 through TEST_04 must PASS
- `TEST_JWT` must be set (from TEST 1.10)
- If network tests required: HAC connectivity must be reachable

---

## TEST 5.1 — Full Login-to-Grades End-to-End (Network Required)

This is the master flow test. Perform the following sequence:

**Step 1:** Delete any existing session:
```bash
curl -s -X DELETE http://localhost:3001/api/integrations/grades/session \
  -H "Authorization: Bearer $TEST_JWT"
```

**Step 2:** Verify no session:
```bash
BEFORE=$(curl -s http://localhost:3001/api/integrations/grades/status \
  -H "Authorization: Bearer $TEST_JWT")
echo "Before login: $BEFORE"
```
Assert: `data.connected` = false

**Step 3:** Login to HAC (use real credentials):
```bash
LOGIN=$(curl -s -X POST http://localhost:3001/api/integrations/grades/hac/login \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TEST_JWT" \
  -d '{
    "baseUrl": "https://homeaccess.katyisd.org",
    "username": "REAL_USERNAME",
    "password": "REAL_PASSWORD"
  }')
echo "Login response: $LOGIN"
```
Assert: `data.sessionToken` is present, status 200

**Step 4:** Verify session active:
```bash
STATUS=$(curl -s http://localhost:3001/api/integrations/grades/status \
  -H "Authorization: Bearer $TEST_JWT")
echo "Status after login: $STATUS"
```
Assert: `data.connected` = true, `sessionExpiresIn` > 1700

**Step 5:** Fetch grades:
```bash
GRADES=$(curl -s http://localhost:3001/api/integrations/grades/current \
  -H "Authorization: Bearer $TEST_JWT")
echo "Grades count: $(echo $GRADES | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.data.grades.length)")"
```
Assert:
- [ ] `data.grades.length` >= 1
- [ ] All courses have numeric `average` (not letter string)
- [ ] At least one course has `assignments.length` >= 1

**Step 6:** Fetch GPA:
```bash
curl -s http://localhost:3001/api/integrations/grades/gpa \
  -H "Authorization: Bearer $TEST_JWT"
```
Assert: `data.gpa` is a number between 0 and 4

**Step 7:** Fetch student info:
```bash
curl -s http://localhost:3001/api/integrations/grades/info \
  -H "Authorization: Bearer $TEST_JWT"
```
Assert: `data.name` is a real name (not empty, not "Test Student")

**Step 8:** Verify DB updated with real name:
```bash
cd backend && node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.user.findFirst({ select: { id: true, name: true } })
  .then(u => { console.log('DB name:', u?.name); return p.\$disconnect(); })
  .catch(e => { console.error(e.message); process.exit(1); })
"
```
Assert: name is NOT "Test Student" (was updated by FIX_03)

**Report:** PASS if all 8 steps pass. FAIL/NETWORK_BLOCKED otherwise.

---

## TEST 5.2 — Fake Data NOT Shown When Connected

**Purpose:** Verify that seeded courses (AP English Language, AP Calculus BC,
U.S. History, Spanish III, Honors Chemistry, Physical Education) are NOT shown
when a real portal session is active.

After TEST 5.1 (portal connected with real credentials), fetch grades:

```bash
GRADES=$(curl -s http://localhost:3001/api/integrations/grades/current \
  -H "Authorization: Bearer $TEST_JWT")
```

Check that NO course name in the response matches the seeded names:
```bash
echo $GRADES | node -e "
const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
const seedNames = ['AP English Language', 'AP Calculus BC', 'U.S. History', 'Spanish III', 'Honors Chemistry', 'Physical Education'];
const realNames = d.data.grades.map(c => c.name);
const fakeFound = realNames.filter(n => seedNames.includes(n));
if (fakeFound.length > 0) {
  console.log('FAIL: Seeded course names found in live data:', fakeFound);
} else {
  console.log('PASS: No seeded names found. Real courses:', realNames);
}
"
```

Assert:
- [ ] None of the 6 seeded course names appear in the live grade response

**Note:** If the student genuinely takes "U.S. History" at their school, this
test may produce a false positive. Use judgment.

**Report:** PASS or FAIL with course names.

---

## TEST 5.3 — Wrong Credentials Error Message

```bash
curl -s -X POST http://localhost:3001/api/integrations/grades/hac/login \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TEST_JWT" \
  -d '{
    "baseUrl": "https://homeaccess.katyisd.org",
    "username": "definitelynotarealusername12345",
    "password": "definitelynotarealpassword99999"
  }'
```

Assert:
- [ ] Response status is 401
- [ ] `error.message` mentions "Invalid credentials" or "rejected" or "password"
- [ ] Response does NOT contain a `sessionToken`

**Report:** PASS or FAIL.

---

## TEST 5.4 — Invalid District URL Error

```bash
curl -s -X POST http://localhost:3001/api/integrations/grades/hac/login \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TEST_JWT" \
  -d '{
    "baseUrl": "https://thisurlreallydoesnotexist999.edu",
    "username": "testuser",
    "password": "testpass"
  }'
```

Assert:
- [ ] Response status is 502 or 504 (network error, not 500)
- [ ] `error.message` mentions "Cannot reach" or "DNS" or "ENOTFOUND"
- [ ] Response does NOT contain a `sessionToken`

**Report:** PASS or FAIL.

---

## TEST 5.5 — Session Expiry Handling

This test verifies the app correctly handles expired sessions.

Manually expire the session by waiting (or simulate by calling the route
after deleting session from store):

```bash
# Delete session
curl -s -X DELETE http://localhost:3001/api/integrations/grades/session \
  -H "Authorization: Bearer $TEST_JWT"

# Try to fetch grades with no session
curl -s http://localhost:3001/api/integrations/grades/current \
  -H "Authorization: Bearer $TEST_JWT"
```

Assert:
- [ ] Response status is 401
- [ ] `error.code` = `"NO_SCHOOL_SESSION"`
- [ ] `error.message` mentions "log in" or "session"

**Read** `nextstep-mobile/src/screens/GradeViewerScreen.tsx` loadGrades function:
- [ ] When `error` contains "session" or "401", the screen shows error state
- [ ] Error state has a "Connect School Portal" button or retry mechanism

**Report:** PASS or FAIL.

---

## TEST 5.6 — Dev Auth Bypass Uses Real JWT

**Read** `backend/src/app.ts`.

Find the `devBypass` function.

If `ENABLE_DEV_INTEGRATION_AUTH_BYPASS=false` in `.env`:
- Assert the `devBypass` function is NOT used in any `app.use()` calls
- PASS — bypass is correctly disabled

If `ENABLE_DEV_INTEGRATION_AUTH_BYPASS=true`:
- Assert the `devBypass` function reads the `Authorization` header
- Assert it tries to verify the JWT and extract a real `userId`
- Assert it only falls back to `userId=1` if no valid JWT is present

**Report:** PASS or BYPASS_DISABLED (also acceptable).

---

## TEST 5.7 — Security: Password Not in Any Storage

**Read** each of these files completely:

1. `nextstep-mobile/src/context/SchoolSessionContext.tsx`
2. `nextstep-mobile/src/screens/SchoolLoginScreen.tsx`
3. `nextstep-mobile/src/screens/PortalConnectScreen.tsx`
4. `nextstep-mobile/src/api/portalApi.ts`
5. `backend/src/integrations/grades/gradesRouter.ts`
6. `backend/prisma/schema.prisma`

Assert for each file:

1. SchoolSessionContext: No password field in `SchoolInfo`, no AsyncStorage write of password
2. SchoolLoginScreen: `setPassword('')` is called in both success and catch paths;
   password is NOT passed to `signIn()`
3. PortalConnectScreen: password is cleared after `connectHac`/`connectPowerSchool` call
4. portalApi.ts: password appears ONLY in the request body of `connectHac`/`connectPowerSchool`
   — it is NOT stored in any module-level variable
5. gradesRouter.ts: password does NOT appear in any Prisma write call
6. schema.prisma: No `password` field on `SchoolConnection`, `StudentProfile`,
   or any model other than `User.passwordHash` (NextStep login password — that's OK)

**Report:** PASS if password is never persisted. FAIL with file + line if found.

---

## TEST 5.8 — Multiple District URLs Accepted

Test that the login endpoint accepts various HAC district URL formats:

```bash
# Test without trailing slash
curl -s -X POST http://localhost:3001/api/integrations/grades/hac/login \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TEST_JWT" \
  -d '{"baseUrl":"https://homeaccess.katyisd.org","username":"x","password":"y"}'
```

Assert: No 400 validation error (may get 401 from wrong credentials — that's fine)

```bash
# Test with trailing slash
curl -s -X POST http://localhost:3001/api/integrations/grades/hac/login \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TEST_JWT" \
  -d '{"baseUrl":"https://homeaccess.katyisd.org/","username":"x","password":"y"}'
```

Assert: No 400 validation error

```bash
# Test with http (not https)
curl -s -X POST http://localhost:3001/api/integrations/grades/hac/login \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TEST_JWT" \
  -d '{"baseUrl":"http://hac.somedistrict.org","username":"x","password":"y"}'
```

Assert: No 400 validation error (http:// is a valid URL)

**Report:** PASS if all 3 return non-400 responses.

---

## TEST 5.9 — HAC Selector Debug Log Present

**Read** `backend/src/integrations/grades/hacClient.ts`.

Find `getGrades()` function.

Assert:
- [ ] A `console.log` or `console.warn` exists near the start of the function
  that logs the page title and count of `.AssignmentClass` elements
- [ ] A warning is logged when `hasAssignmentClass === 0`

**Report:** PASS or FAIL.

---

## TEST 5.10 — Regression: Seeded Data Still Available in Dev Mode

The seeded test account must still work in dev mode (before portal connection).

Verify seeded grades route still works:

```bash
curl -s http://localhost:3001/api/grades \
  -H "Authorization: Bearer $TEST_JWT"
```

Assert:
- [ ] Response status 200
- [ ] `data.courses` is an array with >= 6 items
- [ ] `data.gpa` is an object with `weighted` and `unweighted` fields

**This is the "fallback" path used in `__DEV__` mode in GradeViewerScreen.**

**Report:** PASS or FAIL.

---

## Summary

```
TEST 05 — End-to-End & Regression
------------------------------------
5.1  Full login-to-grades E2E:         PASS/FAIL/NETWORK_BLOCKED
5.2  No fake data when connected:      PASS/FAIL/NETWORK_BLOCKED
5.3  Wrong credentials error:          PASS/FAIL/NETWORK_BLOCKED
5.4  Invalid district URL error:       PASS/FAIL
5.5  Session expiry handling:          PASS/FAIL
5.6  Dev bypass uses real JWT:         PASS/BYPASS_DISABLED/FAIL
5.7  Password not in storage:          PASS/FAIL
5.8  Multiple URL formats accepted:    PASS/FAIL
5.9  HAC selector debug log:           PASS/FAIL
5.10 Seeded data regression:           PASS/FAIL
------------------------------------
OVERALL: PASS/FAIL
```
