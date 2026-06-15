# TEST 02 — HAC Login Flow & Session Creation

## What This Tests
- `/api/integrations/grades/hac/login` endpoint accepts correct input
- Validation rejects missing/malformed fields
- Successful HAC login creates an in-memory session
- Session token is returned to the caller
- `/api/integrations/grades/status` reflects connected state after login
- SchoolLoginScreen code calls `connectHac` before `signIn`
- Auth requirement enforced on portal routes

---

## Pre-Test Requirements

- Backend must be running (TEST_01 must pass first)
- `TEST_JWT` must be set (from TEST 1.10)
- HAC connectivity must be reachable (TEST 1.9 must be PASS or NETWORK_WARNING)

If HAC connectivity is UNREACHABLE, mark TEST 2.4 and 2.5 as NETWORK_BLOCKED
and continue with the other sub-tests.

---

## TEST 2.1 — Validation: Missing baseUrl

```bash
curl -s -X POST http://localhost:3001/api/integrations/grades/hac/login \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TEST_JWT" \
  -d '{"username":"testuser","password":"testpass"}'
```

Assert:
- [ ] Response status is 400
- [ ] Response body has `error.code` = `"VALIDATION_ERROR"`
- [ ] Response body has `error.message` containing "baseUrl" or "URL"

**Report:** PASS or FAIL with response body.

---

## TEST 2.2 — Validation: Invalid URL format

```bash
curl -s -X POST http://localhost:3001/api/integrations/grades/hac/login \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TEST_JWT" \
  -d '{"baseUrl":"not-a-url","username":"testuser","password":"testpass"}'
```

Assert:
- [ ] Response status is 400
- [ ] Response body has `error.code` = `"VALIDATION_ERROR"`
- [ ] Response body has `error.message` containing "URL" or "valid"

**Report:** PASS or FAIL.

---

## TEST 2.3 — Validation: Missing credentials

```bash
curl -s -X POST http://localhost:3001/api/integrations/grades/hac/login \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TEST_JWT" \
  -d '{"baseUrl":"https://homeaccess.katyisd.org"}'
```

Assert:
- [ ] Response status is 400
- [ ] Error message mentions username or password required

**Report:** PASS or FAIL.

---

## TEST 2.4 — Auth Required (no JWT)

```bash
curl -s -X POST http://localhost:3001/api/integrations/grades/hac/login \
  -H "Content-Type: application/json" \
  -d '{"baseUrl":"https://homeaccess.katyisd.org","username":"test","password":"test"}'
```

Check `backend/src/app.ts` to verify `ENABLE_DEV_INTEGRATION_AUTH_BYPASS`.

If bypass is `false`:
- [ ] Response status is 401
- [ ] Response body contains authorization error

If bypass is `true` (dev mode only):
- [ ] Route proceeds past auth — this is expected in dev mode
- [ ] Document that bypass is active — it should be turned off for prod

**Report:** PASS (401 received as expected) or BYPASS_ACTIVE (document state).

---

## TEST 2.5 — Real HAC Login (Network Required)

**SKIP this test if HAC connectivity is NETWORK_BLOCKED.**

This test uses the Katy ISD HAC portal. You need real credentials.

If you have real credentials, replace `REAL_USERNAME` and `REAL_PASSWORD`:

```bash
curl -s -X POST http://localhost:3001/api/integrations/grades/hac/login \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TEST_JWT" \
  -d '{
    "baseUrl": "https://homeaccess.katyisd.org",
    "username": "REAL_USERNAME",
    "password": "REAL_PASSWORD"
  }'
```

If you do NOT have real credentials, test with obviously wrong credentials:

```bash
curl -s -X POST http://localhost:3001/api/integrations/grades/hac/login \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TEST_JWT" \
  -d '{
    "baseUrl": "https://homeaccess.katyisd.org",
    "username": "wronguser12345",
    "password": "wrongpassword99999"
  }'
```

Assert for wrong credentials:
- [ ] Response status is 401 or 400
- [ ] Response body has `error.message` containing "Invalid credentials" or "rejected"
- [ ] Response does NOT have `data.sessionToken`

Assert for correct credentials (if provided):
- [ ] Response status is 200
- [ ] Response body has `data.sessionToken` (non-empty string)
- [ ] Response body has `data.systemType` = `"HAC"`
- [ ] Response body has `data.districtUrl`
- [ ] Response body has `data.expiresIn` = 1800

**Save session token if login succeeded:**
```
HAC_SESSION_TOKEN=<data.sessionToken value>
```

**Report:** PASS/FAIL/NETWORK_BLOCKED with response.

---

## TEST 2.6 — Session Status After Login

If TEST 2.5 produced a session token:

```bash
curl -s http://localhost:3001/api/integrations/grades/status \
  -H "Authorization: Bearer $TEST_JWT"
```

Assert:
- [ ] Response status 200
- [ ] `data.connected` = `true`
- [ ] `data.systemType` = `"HAC"`
- [ ] `data.districtUrl` is non-empty
- [ ] `data.sessionExpiresIn` > 0 (should be close to 1800)

**Report:** PASS or FAIL with response body.

---

## TEST 2.7 — Session Status When Not Logged In (Fresh User)

Create a second user and check their status:

```bash
# Register a second test user
curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@nextstep.com","password":"nextstep123"}'
```

If your app only has one test user, check status BEFORE any HAC login:

```bash
curl -s http://localhost:3001/api/integrations/grades/status \
  -H "Authorization: Bearer $TEST_JWT"
```

Run this check immediately after backend restart (before any login).

Assert:
- [ ] Response status 200
- [ ] `data.connected` = `false` (no active in-memory session)
- [ ] `data.sessionExpiresIn` = 0

**Report:** PASS or FAIL.

---

## TEST 2.8 — SchoolLoginScreen Code Audit

**Read** `nextstep-mobile/src/screens/SchoolLoginScreen.tsx` fully.

Verify the following in the `handleSignIn` function:

- [ ] `connectHac` or `connectPowerSchool` is imported from `../api/portalApi`
- [ ] `handleSignIn` calls `connectHac(baseUrl, username, password)` BEFORE calling `signIn()`
- [ ] `signIn()` is called ONLY inside the `try` block, after the backend call succeeds
- [ ] The `catch` block calls `setPassword('')` to clear password on failure
- [ ] The `finally` block calls `setIsLoading(false)`
- [ ] Error messages handle: "Invalid credentials", "Cannot reach", "timeout", "SSO"
- [ ] `password` is NOT passed to `signIn()` (SchoolSessionContext must not receive it)
- [ ] `AsyncStorage` is NOT set anywhere with `password` as a value

**Report:** PASS if all true. FAIL with specific line number for each violation.

---

## TEST 2.9 — Session Persistence After Restart (FIX_04 Verification)

This test verifies that sessions can be restored from the database cache.

Step 1: Ensure a HAC session exists (from TEST 2.5 with real credentials).

Step 2: Check the database for cached session data:
```bash
cd backend && node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.schoolConnection.findFirst()
  .then(sc => {
    console.log(JSON.stringify({
      found: !!sc,
      systemType: sc?.systemType,
      hasCache: !!sc?.cachedSession,
      cacheLength: sc?.cachedSession?.length ?? 0,
    }));
    return p.\$disconnect();
  })
  .catch(e => { console.error(e.message); process.exit(1); })
"
```

Assert:
- [ ] A `SchoolConnection` record exists
- [ ] `hasCache` = `true` (cachedSession was written)
- [ ] `cacheLength` > 100 (cookie jar JSON is non-trivial)

Step 3: Restart the backend, then call status:
```bash
# Stop backend, restart it, wait 3 seconds
curl -s http://localhost:3001/api/integrations/grades/status \
  -H "Authorization: Bearer $TEST_JWT"
```

Assert (after restart):
- [ ] `data.connected` is `true` OR `data.districtUrl` is non-null
  (session may be restored from DB cache automatically)

**Report:** PASS or FAIL with DB check output and post-restart status.

---

## Summary

```
TEST 02 — HAC Login Flow & Session Creation
--------------------------------------------
2.1  Missing baseUrl validation:    PASS/FAIL
2.2  Invalid URL validation:        PASS/FAIL
2.3  Missing credentials:           PASS/FAIL
2.4  Auth required:                 PASS/BYPASS_ACTIVE/FAIL
2.5  Real HAC login:                PASS/FAIL/NETWORK_BLOCKED
2.6  Session status after login:    PASS/FAIL/SKIPPED
2.7  Status when not logged in:     PASS/FAIL
2.8  SchoolLoginScreen code audit:  PASS/FAIL
2.9  Session persistence:           PASS/FAIL/SKIPPED
--------------------------------------------
OVERALL: PASS/FAIL
```
