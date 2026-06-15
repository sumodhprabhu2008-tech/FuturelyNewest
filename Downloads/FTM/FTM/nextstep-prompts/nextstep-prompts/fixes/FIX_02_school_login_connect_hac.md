# FIX 02 — SchoolLoginScreen Must Actually Call connectHac / connectPowerSchool

## Priority: CRITICAL — This is why real grades never appear

---

## Context & Root Cause

`nextstep-mobile/src/screens/SchoolLoginScreen.tsx` handles the first-time
school portal sign-in. When a student picks their district, enters their
username and password, and taps "Sign In", the `handleSignIn` function calls
only `signIn()` from `SchoolSessionContext`. That function writes the district
name, URL, and username to AsyncStorage — but **it never calls the backend**.

This means `loginHAC()` in `hacClient.ts` is never executed. The backend's
in-memory `sessionStore` stays empty. When `GradeViewerScreen` later calls
`getPortalStatus()`, the backend returns `connected: false` because no session
was ever created. The app falls through to the seeded/fake data path.

The fix: `handleSignIn` must POST the credentials to the backend's
`/api/integrations/grades/hac/login` (or `/powerschool/login`) endpoint
BEFORE calling `signIn()`. Only if that backend call succeeds should
`signIn()` be called to persist the metadata to AsyncStorage.

---

## Files You Must Read Before Editing

Read ALL of these completely before writing a single line of code:

```
nextstep-mobile/src/screens/SchoolLoginScreen.tsx
nextstep-mobile/src/api/portalApi.ts
nextstep-mobile/src/context/SchoolSessionContext.tsx
nextstep-mobile/src/utils/api.ts
nextstep-mobile/src/utils/auth.ts
nextstep-mobile/src/constants/api.ts
nextstep-mobile/src/navigation/RootNavigator.tsx
backend/src/app.ts
backend/src/integrations/grades/gradesRouter.ts
```

Understand:
- How `connectHac(baseUrl, username, password)` works in `portalApi.ts`
- What `signIn(SchoolInfo)` does in `SchoolSessionContext`
- What the backend expects in the POST body for `/hac/login`
- How `RootNavigator` decides which screen to show based on `hasSchoolSession`
- Whether `requireAuth` middleware is active or bypassed in `app.ts`

---

## What You Must Change — `SchoolLoginScreen.tsx`

### The current broken `handleSignIn` logic (DO NOT LEAVE AS-IS):

```typescript
// CURRENT (BROKEN) — only saves to AsyncStorage, never hits backend
await signIn({
  district: selectedDistrict.label,
  districtUrl: baseUrl,
  username: username.trim(),
  systemType: selectedDistrict.system,
})
setPassword('')
```

### The correct replacement logic:

Replace the `handleSignIn` function body with the following logic.
Read the existing imports at the top of the file first. You will need
to add an import for `connectHac` and `connectPowerSchool` from
`../api/portalApi` if it is not already there.

```typescript
const handleSignIn = async (): Promise<void> => {
  if (!selectedDistrict) {
    setError('Please select your school district.')
    return
  }

  const baseUrl = districtUrl.trim()

  if (!baseUrl) {
    setError('Please enter your district portal URL.')
    return
  }
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    setError('District URL must start with http:// or https://')
    return
  }
  if (!username.trim()) {
    setError('Please enter your username.')
    return
  }
  if (!password.trim()) {
    setError('Please enter your password.')
    return
  }

  setIsLoading(true)
  setError(null)

  try {
    console.log('[SCHOOL LOGIN] Attempting backend portal connection...')
    console.log('[SCHOOL LOGIN] system:', selectedDistrict.system)
    console.log('[SCHOOL LOGIN] baseUrl:', baseUrl)
    console.log('[SCHOOL LOGIN] username exists:', Boolean(username.trim()))

    // Step 1: Hit the backend to create a real HAC/PowerSchool session
    if (selectedDistrict.system === 'HAC') {
      await connectHac(baseUrl, username.trim(), password)
    } else {
      await connectPowerSchool(baseUrl, username.trim(), password)
    }

    console.log('[SCHOOL LOGIN] Backend connection successful — saving session metadata')

    // Step 2: Only if the backend call succeeded, persist metadata to AsyncStorage
    // NOTE: password is intentionally NOT persisted anywhere
    await signIn({
      district: selectedDistrict.label,
      districtUrl: baseUrl,
      username: username.trim(),
      systemType: selectedDistrict.system,
    })

    // Step 3: Clear password from memory immediately
    setPassword('')

    console.log('[SCHOOL LOGIN] Sign-in complete')
    // RootNavigator will automatically re-render to AppNavigator
    // because hasSchoolSession is now true

  } catch (err: unknown) {
    // Clear password on any failure
    setPassword('')

    const message = err instanceof Error ? err.message : 'Sign in failed. Please try again.'
    console.log('[SCHOOL LOGIN] Error:', message)

    // Provide user-friendly error messages
    if (message.includes('Invalid credentials') || message.includes('401')) {
      setError('Incorrect username or password. Please check your school portal credentials.')
    } else if (message.includes('Cannot reach') || message.includes('ENOTFOUND') || message.includes('Network')) {
      setError('Cannot reach your school portal. Check the district URL and your internet connection.')
    } else if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
      setError('Connection timed out. Your school portal may be slow — try again.')
    } else if (message.includes('login form') || message.includes('SSO')) {
      setError('This district may use SSO or ClassLink login. Contact support for help.')
    } else {
      setError(message)
    }
  } finally {
    setIsLoading(false)
  }
}
```

### Import addition at the top of the file

Find the existing imports section. Add the following import if it does
not already exist:

```typescript
import { connectHac, connectPowerSchool } from '../api/portalApi'
```

Make sure this import is alongside the other `../api/` imports.
Do NOT duplicate an existing import — check first.

---

## Authentication Token Issue — Read This Carefully

`connectHac` in `portalApi.ts` calls `getToken()` to attach a JWT Bearer
token to the request. This is needed because the backend's
`/api/integrations/grades/hac/login` route is protected by `requireAuth`
middleware (unless `ENABLE_DEV_INTEGRATION_AUTH_BYPASS=true`).

The `SchoolLoginScreen` is shown to a user who is already authenticated
with their NextStep account (they logged into the NextStep app first via
`LoginScreen`). Their JWT should already be stored by `AuthContext`.

However, verify this flow:
1. Open `nextstep-mobile/src/navigation/RootNavigator.tsx`
2. Confirm that `SchoolLoginScreen` is only reachable AFTER the user
   has already passed through `LoginScreen` and has a valid JWT stored
3. If `SchoolLoginScreen` can be reached without a JWT (i.e., it is
   shown before NextStep login), then `connectHac` will fail with 401
   and you need to either:
   a. Ensure SchoolLoginScreen is after NextStep login in the navigation flow, OR
   b. Set `ENABLE_DEV_INTEGRATION_AUTH_BYPASS=true` in `backend/.env`
      for development only (not for production)

Read `RootNavigator.tsx` carefully and document what you find in a
comment at the top of `SchoolLoginScreen.tsx`.

---

## Loading State UX

The existing loading state `isLoading` must correctly disable the button
AND show an activity indicator during the backend call. Verify that:

1. The "Sign In" button shows `<ActivityIndicator>` when `isLoading === true`
2. The button is `disabled` when `isLoading === true` so the user cannot
   double-tap
3. All form fields are visually non-interactive during loading (add
   `editable={!isLoading}` to each `TextInput` if not already present)

The HAC backend call can take 5–15 seconds on a real school portal.
The user must see feedback immediately when they tap the button.
If there is a loading text label, change it to say
"Connecting to your school portal..." instead of a generic "Loading..."

---

## Error State UX

After a failed attempt:
1. The error message must be visible in the `{error !== null && (...)}` banner
2. The username field must still contain the username (don't clear it)
3. The password field must be empty (already handled by `setPassword('')`)
4. The button must be re-enabled so the user can try again
5. The "Sign In" button must NOT still show a spinner

---

## TypeScript Requirements

After making changes:

```bash
cd nextstep-mobile
npx tsc --noEmit
```

Zero TypeScript errors are required. Common issues to watch for:
- `connectHac` imported but `connectPowerSchool` missing (or vice versa)
- `selectedDistrict.system` typed as a string that doesn't match
  `'HAC' | 'PowerSchool'` — check the `District` interface in the file

---

## Acceptance Criteria

- [ ] `handleSignIn` calls `connectHac` or `connectPowerSchool` BEFORE calling `signIn`
- [ ] `connectHac`/`connectPowerSchool` imported from `../api/portalApi`
- [ ] Password is cleared in both success and failure paths
- [ ] `isLoading` is `true` during the backend call and `false` after
- [ ] User-friendly error messages for bad credentials, network errors, timeouts
- [ ] `npx tsc --noEmit` in `nextstep-mobile/` passes with zero errors
- [ ] The button is disabled during loading and re-enabled after failure
- [ ] `signIn()` is only called on backend success, not before

---

## What NOT to Do

- Do NOT store the password in AsyncStorage anywhere
- Do NOT store the password in SchoolSessionContext
- Do NOT change the `SchoolSessionContext` `signIn` function signature
- Do NOT change `portalApi.ts` — it is already correct
- Do NOT change the navigation structure
- Do NOT modify `PortalConnectScreen.tsx` in this fix
