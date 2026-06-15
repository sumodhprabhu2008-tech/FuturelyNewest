# TEST 04 — Mobile App Code Audit: Navigation, Screens & Course Detail

## What This Tests
- `GradeViewerScreen` uses portal data when connected, seed data only when not
- `CourseDetailScreen` exists and is registered in navigation
- `CourseRow` is a `TouchableOpacity` (not a plain `View`)
- Assignment drill-down navigation is wired correctly
- Numeric grades are preferred over letter grades in display
- `CourseDetailScreen` shows score/totalPoints format
- Category breakdown section exists in CourseDetailScreen
- `GradePortalDashboard` shows connection status
- `PortalConnectScreen` shows connected-state card when session active
- Mobile TypeScript compiles clean

---

## Pre-Test Requirements

- All FIX prompts (01–08) must have been executed
- `nextstep-mobile/` must be present
- Run: `cd nextstep-mobile && npx tsc --noEmit` — must return 0 errors

---

## TEST 4.1 — TypeScript Compilation

```bash
cd nextstep-mobile && npx tsc --noEmit 2>&1
```

Assert:
- [ ] Exit code is 0
- [ ] Output is empty (no errors)

If any errors: list every error with file name and line number.

**Report:** PASS or FAIL with full error list.

---

## TEST 4.2 — `CourseDetailScreen.tsx` Existence

Check that the file exists:

```bash
ls nextstep-mobile/src/screens/CourseDetailScreen.tsx
```

Assert:
- [ ] File exists (exit code 0)
- [ ] File is not empty (size > 0)

**Read the file** and verify:
- [ ] Has a default export named `CourseDetailScreen`
- [ ] Exports `coursesCache` as a named export
- [ ] Has an `AssignmentRow` component
- [ ] Has a `formatScore` function
- [ ] Has a `buildCategorySummaries` function

**Report:** PASS or FAIL with file size.

---

## TEST 4.3 — Navigation Type for `CourseDetail`

**Read** `nextstep-mobile/src/navigation/GradePortalNavigator.tsx` fully.

Assert:
- [ ] `GradePortalParamList` type contains `CourseDetail` key
- [ ] `CourseDetail` params are typed as `{ courseId: string; courseName: string }`
- [ ] A `<Stack.Screen name="CourseDetail" component={CourseDetailScreen} />` entry exists
- [ ] `CourseDetailScreen` is imported from `'../screens/CourseDetailScreen'`

**Report:** PASS if all true. FAIL with specific missing item.

---

## TEST 4.4 — `CourseRow` is Tappable

**Read** `nextstep-mobile/src/screens/GradeViewerScreen.tsx`.

Find the `CourseRow` component definition (approximately line 190–240).

Assert:
- [ ] The root element of `CourseRow` is `TouchableOpacity` (NOT `View`)
- [ ] `CourseRow` accepts an `onPress` prop
- [ ] `TouchableOpacity` has `onPress={onPress}`
- [ ] `TouchableOpacity` has `activeOpacity={0.7}` or similar (not 1.0)
- [ ] An `Ionicons` chevron icon is rendered (e.g., `name="chevron-forward"`)

Find where `CourseRow` is rendered in the `FlatList`:
- [ ] `renderItem` passes `onPress` to `CourseRow`
- [ ] `onPress` calls `navigation.navigate('CourseDetail', { courseId: ..., courseName: ... })`
- [ ] Before navigating, `coursesCache.current = sortedCourses` is set

**Report:** PASS if all true. FAIL with specific line violation.

---

## TEST 4.5 — `coursesCache` Import in `GradeViewerScreen`

**Read** the imports section of `GradeViewerScreen.tsx`.

Assert:
- [ ] `import { coursesCache } from './CourseDetailScreen'` or similar exists
- [ ] This import does NOT import `CourseDetailScreen` as a component
  (the component is used via navigation, not directly imported)

**Report:** PASS or FAIL.

---

## TEST 4.6 — Numeric Grade Display Logic

**Read** `nextstep-mobile/src/screens/CourseDetailScreen.tsx`.

Find the `formatScore` function.

Assert:
- [ ] When `score` and `totalPoints` are both non-null:
  Returns format `"<score> / <totalPoints>  (<pct>%)"` (numeric preferred)
- [ ] When only `score` is non-null (totalPoints is null):
  Returns `"<score> pts"` or similar numeric format
- [ ] When both are null but `percentage` has a value:
  Returns the percentage string as fallback
- [ ] When all are null/empty: Returns `"—"` (em dash)

Find the `scoreColor` function:
- [ ] Uses numeric percentage for color determination
- [ ] >= 90 → success (green)
- [ ] >= 80 → info (blue)
- [ ] >= 70 → warning (yellow)
- [ ] >= 60 → orange
- [ ] < 60 → error (red)
- [ ] null → textMuted (gray)

**Report:** PASS if all true. FAIL with specific function that is wrong.

---

## TEST 4.7 — Category Breakdown in `CourseDetailScreen`

**Read** `nextstep-mobile/src/screens/CourseDetailScreen.tsx`.

Find `buildCategorySummaries` function.

Assert:
- [ ] Groups assignments by `category` field
- [ ] Computes per-category average as `(sum of scores / sum of totalPoints) * 100`
  NOT as average of individual percentages (these give different results)
- [ ] Returns array of `{ name, count, average }` objects
- [ ] Handles empty assignments array (returns `[]`)
- [ ] Handles assignments where `score` or `totalPoints` is null (skips them for average)

Find the category section in the JSX:
- [ ] Renders category rows when `categorySummaries.length > 0`
- [ ] Each row shows: category name, assignment count, average percentage
- [ ] Color coding applied to average using `scoreColor`

**Report:** PASS or FAIL with specific issue.

---

## TEST 4.8 — `adaptPortalGrades` Carries Assignments

**Read** `nextstep-mobile/src/screens/GradeViewerScreen.tsx`.

Find the `adaptPortalGrades` function.

Assert:
- [ ] The returned object includes `assignments: [...]` field
- [ ] `assignments` is mapped from `course.assignments` (from `NormalizedCourse`)
- [ ] Each assignment has: `name`, `category`, `score`, `totalPoints`, `percentage`, `dateDue`

**Read** `nextstep-mobile/src/api/gradesApi.ts`.

Assert:
- [ ] `CourseWithGrade` interface has `assignments: AssignmentDetail[]` field
- [ ] `AssignmentDetail` interface is exported
- [ ] `AssignmentDetail` has: `name`, `category`, `score`, `totalPoints`, `percentage`, `dateDue`

**Report:** PASS or FAIL.

---

## TEST 4.9 — `GradeViewerScreen` Data Source Logic

**Read** `nextstep-mobile/src/screens/GradeViewerScreen.tsx`.

Find the `loadGrades` function.

Assert:
- [ ] Calls `getPortalStatus()` at the start
- [ ] If `status.connected === true`:
  Calls `getCurrentPortalGrades()` and uses portal data (NOT seed data)
- [ ] If NOT connected AND `__DEV__` is true:
  Falls back to `fetchGrades()` (seed data) — this is acceptable for dev
- [ ] If NOT connected AND NOT `__DEV__`:
  Shows empty state with "Connect Your School Portal" message
- [ ] The data source indicator exists (`__DEV__` shows 🟢/🟡 badge)

**Report:** PASS or FAIL.

---

## TEST 4.10 — `GradePortalDashboard` Connection Status Display

**Read** `nextstep-mobile/src/screens/GradePortalDashboard.tsx`.

Assert:
- [ ] `getPortalStatus()` is called and stored in component state
- [ ] When `status.connected === true`: A green/success colored banner or indicator exists
- [ ] When `status.connected === false`: An orange/warning colored banner exists with a connect CTA
- [ ] Status refreshes on screen focus (useFocusEffect or navigation listener)
- [ ] Disconnect button exists and calls `disconnectPortal()`

**Report:** PASS or FAIL.

---

## TEST 4.11 — `PortalConnectScreen` Smart Router

**Read** `nextstep-mobile/src/screens/PortalConnectScreen.tsx`.

Assert:
- [ ] `getPortalStatus()` is called on mount/focus
- [ ] When status.connected = true: Shows a "Connected" card (NOT the login form)
- [ ] The connected card shows: system type, district URL, session expiry info
- [ ] A disconnect button exists in the connected state
- [ ] When status.connected = false: Shows the full login form
- [ ] The login form still calls `connectHac` or `connectPowerSchool`

**Report:** PASS or FAIL.

---

## TEST 4.12 — `SchoolSessionContext` Does NOT Store Password

**Read** `nextstep-mobile/src/context/SchoolSessionContext.tsx` fully.

Assert:
- [ ] `SchoolInfo` interface has NO `password` field
- [ ] `signIn(info: SchoolInfo)` has NO `password` parameter
- [ ] `AsyncStorage.multiSet(...)` call does NOT include any password key/value pair
- [ ] No `KEY_PASSWORD` or similar constant exists
- [ ] `passwordHash` is NOT stored in AsyncStorage

**Report:** PASS if all true (password is correctly NOT stored). FAIL if password found anywhere.

---

## TEST 4.13 — Assignment Empty State

**Read** `nextstep-mobile/src/screens/CourseDetailScreen.tsx`.

Assert:
- [ ] When `assignments.length === 0`: An empty state view is shown
- [ ] Empty state shows an icon (e.g., `document-text-outline`)
- [ ] Empty state shows a message explaining why there are no assignments
  (e.g., "No assignment data was returned from your school portal")
- [ ] Empty state does NOT crash (null course case handled)

**Report:** PASS or FAIL.

---

## Summary

```
TEST 04 — Mobile App Code Audit
---------------------------------
4.1  TypeScript compile:              PASS/FAIL
4.2  CourseDetailScreen exists:       PASS/FAIL
4.3  Navigation type for CourseDetail: PASS/FAIL
4.4  CourseRow is tappable:           PASS/FAIL
4.5  coursesCache import:             PASS/FAIL
4.6  Numeric grade display logic:     PASS/FAIL
4.7  Category breakdown:              PASS/FAIL
4.8  adaptPortalGrades carries data:  PASS/FAIL
4.9  Data source logic:               PASS/FAIL
4.10 Dashboard connection status:     PASS/FAIL
4.11 PortalConnect smart router:      PASS/FAIL
4.12 No password in context:          PASS/FAIL
4.13 Assignment empty state:          PASS/FAIL
---------------------------------
OVERALL: PASS/FAIL
```
