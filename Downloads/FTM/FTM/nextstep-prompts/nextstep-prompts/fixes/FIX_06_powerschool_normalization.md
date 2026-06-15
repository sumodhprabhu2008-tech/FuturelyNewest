# FIX 06 — PowerSchool Normalization + Dev Auth Bypass Hardening

## Priority: HIGH — PowerSchool always returns 0 grades; auth bypass causes user data mixing

---

## Context & Root Cause

### Problem A — PowerSchool normalization stub
`normalizeGrades.ts` has `normalizePsGrades()` hardcoded to return `[]`:

```typescript
export function normalizePsGrades(_rawClasses: unknown[]): NormalizedCourse[] {
  // TODO: Implement PowerSchool normalization in PS sprint
  return []
}
```

Any student who connects via PowerSchool sees zero grades with no explanation.
The `powerSchoolClient.ts` scraper already returns `PSClass[]` with `name`,
`grade`, and `term` fields. These need to be mapped to `NormalizedCourse[]`.

### Problem B — Dev auth bypass hardcodes userId=1
`backend/src/app.ts` has:

```typescript
const ENABLE_DEV_INTEGRATION_AUTH_BYPASS =
  process.env.ENABLE_DEV_INTEGRATION_AUTH_BYPASS === 'true'

function devBypass(req: any, _res: any, next: any): void {
  req.userId = 1
  next()
}
```

If `ENABLE_DEV_INTEGRATION_AUTH_BYPASS=true`, every request from every user
gets `userId=1`. On a shared dev environment (e.g., two phones testing the
app), User A's HAC login overwrites User B's session.

---

## Files You Must Read Before Editing

```
backend/src/integrations/grades/normalizeGrades.ts
backend/src/integrations/grades/powerSchoolClient.ts
backend/src/app.ts
backend/src/middleware/auth.ts
backend/.env (or .env.example if .env doesn't exist)
```

---

## Part A — Implement Real PowerSchool Normalization

### Step 1: Read `powerSchoolClient.ts` carefully

Understand the `PSClass` interface:

```typescript
export interface PSClass {
  name: string
  grade: string | null  // Letter grade like "A", "B+", or percentage like "92"
  term: string          // Term code like "Q1", "S1", etc.
}
```

### Step 2: Replace the stub in `normalizeGrades.ts`

Find and REPLACE the stub `normalizePsGrades` function with this implementation:

```typescript
/**
 * Convert an array of PSClass objects into NormalizedCourse[].
 * PowerSchool does not return assignment-level detail from the home page,
 * so assignments is always empty. Only course-level grade data is available.
 */
export function normalizePsGrades(rawClasses: PSClass[]): NormalizedCourse[] {
  if (!Array.isArray(rawClasses) || rawClasses.length === 0) return []

  return rawClasses
    .filter(cls => cls.name && cls.name.trim().length > 0)
    .map((cls, index): NormalizedCourse => {
      const rawGrade = cls.grade?.trim() ?? null

      // Try to parse as numeric first (e.g., "92.4")
      let average: number | null = null
      let letterGrade: string | null = null

      if (rawGrade && rawGrade !== '--' && rawGrade !== '') {
        const asNum = parseFloat(rawGrade)

        if (!isNaN(asNum) && asNum >= 0 && asNum <= 100) {
          // Numeric grade — store as average and derive letter
          average = Math.round(asNum * 10) / 10
          letterGrade = deriveLetterGrade(average)
        } else if (/^[A-Fa-f][+-]?$/.test(rawGrade)) {
          // Letter grade directly (A, B+, C-, etc.)
          letterGrade = rawGrade.toUpperCase()
          // Convert to approximate numeric average for display
          const letterToNum: Record<string, number> = {
            'A+': 98, 'A': 95, 'A-': 92,
            'B+': 88, 'B': 85, 'B-': 82,
            'C+': 78, 'C': 75, 'C-': 72,
            'D+': 68, 'D': 65, 'D-': 62,
            'F': 50,
          }
          average = letterToNum[letterGrade] ?? null
        }
      }

      return {
        id: `ps-${index}-${cls.name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20)}`,
        name: cls.name.trim(),
        teacher: 'See PowerSchool',  // PS home page does not expose teacher name
        period: String(index + 1),   // PS does not expose period numbers from home page
        average,
        letterGrade,
        assignments: [],             // PS home page does not expose assignment detail
      }
    })
}
```

### Step 3: Add the `PSClass` import at the top of `normalizeGrades.ts`

Find the existing import line:

```typescript
import type { HACClass, HACScore } from './hacClient'
```

Add the PowerSchool type:

```typescript
import type { HACClass, HACScore } from './hacClient'
import type { PSClass } from './powerSchoolClient'
```

### Step 4: Add a user-visible note for PowerSchool assignment limitations

In `nextstep-mobile/src/screens/GradeViewerScreen.tsx`, find the
`adaptPortalGrades` function. Add a comment explaining PS limitation.
Do NOT change the function logic — only add a comment:

```typescript
// NOTE: PowerSchool courses from the home page do not include assignment detail.
// assignments[] will be empty for PS users. Only course-level averages are available.
function adaptPortalGrades(
  portalCourses: import('../api/portalApi').NormalizedCourse[]
): CourseWithGrade[] {
```

---

## Part B — Harden the Dev Auth Bypass

### Problem

The `devBypass` middleware always uses `userId=1`. This means:
- Any logged-in real user's HAC session maps to User ID 1
- The seed data for `test@nextstep.com` is User ID 1
- Two testers sharing the backend will conflict

### Fix — Make bypass use real JWT when available

Open `backend/src/app.ts`. Find the `devBypass` function and replace it:

```typescript
import jwt from 'jsonwebtoken'

/**
 * Development auth bypass middleware.
 * If a real JWT is present in the Authorization header, decode it and use
 * the real userId. Only falls back to userId=1 if no token is present.
 * This prevents multi-user conflicts on shared dev environments.
 */
function devBypass(req: any, _res: any, next: any): void {
  const authHeader = req.headers?.authorization as string | undefined
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7)
      const secret = process.env.JWT_SECRET ?? 'nextstep-dev-secret-change-in-production'
      const payload = jwt.verify(token, secret) as { sub?: number | string }
      const id = typeof payload.sub === 'number' 
        ? payload.sub 
        : parseInt(String(payload.sub), 10)
      if (!isNaN(id)) {
        req.userId = id
        next()
        return
      }
    } catch {
      // Token invalid — fall through to default
    }
  }
  // No valid token — use default test user
  req.userId = 1
  next()
}
```

This requires importing `jwt` at the top of `app.ts`:

```typescript
import jwt from 'jsonwebtoken'
```

Check if `jwt` is already imported in `app.ts`. If it is, do not duplicate
the import. If it is not, add it.

### Add a warning log when bypass is active

After the `if (ENABLE_DEV_INTEGRATION_AUTH_BYPASS)` block:

```typescript
if (ENABLE_DEV_INTEGRATION_AUTH_BYPASS) {
  console.warn('⚠️  [DEV] Auth bypass active — requests will use real JWT userId or fall back to userId=1')
  console.warn('⚠️  [DEV] Set ENABLE_DEV_INTEGRATION_AUTH_BYPASS=false before any real testing')
  // ...
}
```

---

## Part C — Update `.env` Comment for Bypass Setting

In `backend/.env`, ensure `ENABLE_DEV_INTEGRATION_AUTH_BYPASS` is set:

```
# Set to true ONLY for local dev when testing without going through full auth flow
# Must be false for any real user testing
ENABLE_DEV_INTEGRATION_AUTH_BYPASS=false
```

For your own device testing where you ARE going through the full login flow
(LoginScreen → SchoolLoginScreen), this MUST be `false`. The fix in FIX_02
ensures SchoolLoginScreen passes a real JWT.

---

## TypeScript Requirements

```bash
cd backend
npx tsc --noEmit
```

Watch for:
- `PSClass` import — must match the exact export name in `powerSchoolClient.ts`
- `jwt.verify` return type — cast as `{ sub?: number | string }` 
- `deriveLetterGrade` used in `normalizePsGrades` — it is already defined
  in `normalizeGrades.ts` above the function, verify it is accessible

---

## Acceptance Criteria

- [ ] `normalizePsGrades` returns real data instead of `[]`
- [ ] `PSClass` imported in `normalizeGrades.ts`
- [ ] PowerSchool letter grades and numeric grades both parsed correctly
- [ ] `devBypass` uses real JWT userId when token is present
- [ ] Warning logs added when bypass is active
- [ ] `ENABLE_DEV_INTEGRATION_AUTH_BYPASS=false` in `.env`
- [ ] `npx tsc --noEmit` passes in `backend/`

---

## What NOT to Do

- Do NOT add assignment-level scraping in this fix (PowerSchool does not
  expose it from the home page without session drilling)
- Do NOT change the `PSClass` interface in `powerSchoolClient.ts`
- Do NOT change how `normalizePsGrades` is called in `gradesRouter.ts`
- Do NOT disable the bypass entirely if you still need it for dev workflow
