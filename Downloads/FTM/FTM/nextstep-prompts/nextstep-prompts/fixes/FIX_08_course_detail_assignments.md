# FIX 08 — Clickable Courses: Assignment Drill-Down with Numeric Grades

## Priority: HIGH — Core feature; courses must be tappable to see all assignments

---

## Context & Root Cause

Currently `GradeViewerScreen.tsx` renders `CourseRow` components in a
`FlatList`. Each `CourseRow` is a static `View` — it is NOT a `TouchableOpacity`
and has no `onPress`. Tapping a course does nothing.

The HAC scraper already returns full assignment data (`scores[]` on each
`HACClass`), which flows through `normalizeGrades.ts` into `NormalizedCourse.assignments[]`
and is available in the mobile app via `getCurrentPortalGrades()`.

The fix requires:
1. Adding a `CourseDetail` screen that shows all assignments for a course
2. Making `CourseRow` tappable to navigate to `CourseDetail`
3. Adding `CourseDetail` to `GradePortalNavigator`
4. Displaying grades as **numbers** (e.g., `92.4 / 100`) by default,
   falling back to letter only when no numeric score exists
5. Showing assignment category, due date, and score/total on each row

---

## Files You Must Read Before Editing

```
nextstep-mobile/src/screens/GradeViewerScreen.tsx
nextstep-mobile/src/navigation/GradePortalNavigator.tsx
nextstep-mobile/src/api/portalApi.ts
backend/src/integrations/grades/normalizeGrades.ts
backend/src/integrations/grades/hacClient.ts
```

Understand:
- The full `NormalizedCourse` and `NormalizedAssignment` shapes from `portalApi.ts`
- The existing `GradePortalParamList` type in `GradePortalNavigator.tsx`
- How `CourseRow` currently renders (it is a plain `View`)
- The `adaptPortalGrades` function in `GradeViewerScreen.tsx`

---

## Part A — Update Navigation Types

### Step 1: Open `GradePortalNavigator.tsx`

Find the `GradePortalParamList` type definition. It should look like:

```typescript
export type GradePortalParamList = {
  GradePortalDashboard: undefined
  GradeViewer: undefined
  Transcript: undefined
  ClassSchedule: undefined
  Simulator: undefined
  ContactTeachers: undefined
  PortalConnect: undefined
}
```

Add `CourseDetail` to this type:

```typescript
export type GradePortalParamList = {
  GradePortalDashboard: undefined
  GradeViewer: undefined
  CourseDetail: {
    courseId: string
    courseName: string
  }
  Transcript: undefined
  ClassSchedule: undefined
  Simulator: undefined
  ContactTeachers: undefined
  PortalConnect: undefined
}
```

### Step 2: Register the new screen in the navigator

Find where all the `<Stack.Screen>` elements are registered. Add:

```typescript
import CourseDetailScreen from '../screens/CourseDetailScreen'

// Inside the Stack.Navigator:
<Stack.Screen
  name="CourseDetail"
  component={CourseDetailScreen}
  options={{ headerShown: false }}
/>
```

---

## Part B — Update `CourseWithGrade` type to carry assignments

Open `nextstep-mobile/src/api/gradesApi.ts`. Find the `CourseWithGrade` interface.
Add an `assignments` field:

```typescript
export interface AssignmentDetail {
  name: string
  category: string
  score: number | null
  totalPoints: number | null
  percentage: string
  dateDue: string
}

export interface CourseWithGrade {
  id: number
  name: string
  teacher: string
  period: number
  courseType: string
  creditHours: number
  semester: string
  grade: GradeData | null
  assignments: AssignmentDetail[]  // ADD THIS
}
```

---

## Part C — Update `adaptPortalGrades` in `GradeViewerScreen.tsx`

Find `adaptPortalGrades`. Update it to carry assignments through:

```typescript
function adaptPortalGrades(
  portalCourses: import('../api/portalApi').NormalizedCourse[]
): CourseWithGrade[] {
  return portalCourses.map((course, index) => ({
    id: index,
    name: course.name,
    teacher: course.teacher,
    period: parseInt(course.period, 10) || (index + 1),
    courseType: 'STANDARD',
    creditHours: 1.0,
    semester: 'CURRENT',
    grade: course.average !== null
      ? {
          letterGrade: course.letterGrade ?? 'N/A',
          percentage: course.average,
          gradingPeriod: 'CURRENT',
        }
      : null,
    assignments: (course.assignments ?? []).map(a => ({
      name: a.name,
      category: a.category,
      score: a.score,
      totalPoints: a.totalPoints,
      percentage: a.percentage,
      dateDue: a.dateDue,
    })),
  }))
}
```

---

## Part D — Make `CourseRow` Tappable in `GradeViewerScreen.tsx`

### Step 1: Add navigation import

At the top of `GradeViewerScreen.tsx`, ensure this import exists:

```typescript
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { GradePortalParamList } from '../navigation/GradePortalNavigator'
```

### Step 2: Update `CourseRow` to be tappable

Find the `CourseRow` component. Replace the outer `View` with `TouchableOpacity`:

```typescript
function CourseRow({
  course,
  onPress,
}: {
  course: CourseWithGrade
  onPress: () => void
}): React.JSX.Element {
  const letterGrade = course.grade?.letterGrade ?? null
  const percentage = course.grade?.percentage ?? null
  const badge = letterGrade !== null ? gradeBadge(letterGrade) : FALLBACK_BADGE

  // Format: prefer "92.4" over "A" for the percentage display
  const displayScore = percentage !== null ? `${percentage.toFixed(1)}%` : null

  return (
    <TouchableOpacity
      style={styles.courseRow}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${course.name}, ${displayScore ?? letterGrade ?? 'no grade'}, tap to see assignments`}
    >
      <View style={styles.courseLeft}>
        <View style={styles.courseNameRow}>
          <Text variant="h3" style={styles.courseName}>
            {course.name}
          </Text>
          <CourseTypeBadge type={course.courseType} />
        </View>
        <Text variant="caption" color={colors.textSecondary}>
          {course.teacher} · Period {course.period}
          {course.assignments.length > 0 && ` · ${course.assignments.length} assignments`}
        </Text>
      </View>
      <View style={styles.courseRight}>
        <View
          style={[styles.gradeBadge, { backgroundColor: badge.bg, borderColor: badge.text }]}
        >
          <Text style={[styles.gradeBadgeText, { color: badge.text }]}>
            {letterGrade ?? '—'}
          </Text>
        </View>
        {displayScore !== null && (
          <Text variant="caption" color={colors.textSecondary} style={styles.percentageText}>
            {displayScore}
          </Text>
        )}
        <Ionicons name="chevron-forward" size={14} color={colors.textMuted} style={{ marginTop: 2 }} />
      </View>
    </TouchableOpacity>
  )
}
```

### Step 3: Update FlatList renderItem to pass onPress

In the main screen JSX, find the `FlatList` `renderItem`. Update it:

```typescript
renderItem={({ item }) => (
  <CourseRow
    course={item}
    onPress={() => navigation.navigate('CourseDetail', {
      courseId: item.id.toString(),
      courseName: item.name,
    })}
  />
)}
```

You need access to `navigation` in the screen component. Ensure this exists
at the top of `GradeViewerScreen`:

```typescript
const navigation = useNavigation<NativeStackNavigationProp<GradePortalParamList>>()
```

Also update the `courses` state to carry assignments. Pass through the full
`CourseWithGrade[]` — the `assignments` array is now part of it.

Store courses in a `useRef` or pass them via navigation params.
The simplest approach: store all courses in component state and when
navigating to `CourseDetail`, pass the `courseId`. The `CourseDetailScreen`
reads it from the courses that were fetched. Use a shared context or just
navigate with the full course data serialized.

**Preferred approach — pass full course data via navigation:**

Update the navigation call to pass the full assignments array:

```typescript
onPress={() => {
  navigation.navigate('CourseDetail', {
    courseId: item.id.toString(),
    courseName: item.name,
  })
  // Store courses in a module-level ref so CourseDetailScreen can access them
  coursesCache.current = sortedCourses
}}
```

Add at the top of the component (inside the function, before return):

```typescript
const coursesCache = useRef<CourseWithGrade[]>([])
```

---

## Part E — Create `CourseDetailScreen.tsx`

Create this file at:
`nextstep-mobile/src/screens/CourseDetailScreen.tsx`

This is the full implementation:

```typescript
import React, { useMemo } from 'react'
import {
  FlatList,
  StyleSheet,
  View,
} from 'react-native'
import { useRoute, useNavigation } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { Ionicons } from '@expo/vector-icons'
import Text from '../components/ui/Text'
import ScreenHeader from '../components/ui/ScreenHeader'
import { colors } from '../constants/colors'
import type { GradePortalParamList } from '../navigation/GradePortalNavigator'
import type { AssignmentDetail, CourseWithGrade } from '../api/gradesApi'

// Module-level cache populated by GradeViewerScreen before navigation
export const coursesCache: React.MutableRefObject<CourseWithGrade[]> = { current: [] }

type RouteType = RouteProp<GradePortalParamList, 'CourseDetail'>

// ── Score formatting helpers ───────────────────────────────────────────────────

/**
 * Format an assignment score. Prefer numeric over letter.
 * Examples:
 *   score=92, totalPoints=100  → "92 / 100  (92.0%)"
 *   score=null, percentage="A" → "A"
 *   score=null, percentage=""  → "—"
 */
function formatScore(a: AssignmentDetail): string {
  if (a.score !== null && a.totalPoints !== null && a.totalPoints > 0) {
    const pct = (a.score / a.totalPoints) * 100
    return `${a.score} / ${a.totalPoints}  (${pct.toFixed(1)}%)`
  }
  if (a.score !== null) {
    return `${a.score} pts`
  }
  if (a.percentage && a.percentage !== '' && a.percentage !== '--') {
    return a.percentage
  }
  return '—'
}

/**
 * Determine color for a score.
 * Uses numeric percentage when available, falls back to letter grade parsing.
 */
function scoreColor(a: AssignmentDetail): string {
  let pct: number | null = null

  if (a.score !== null && a.totalPoints !== null && a.totalPoints > 0) {
    pct = (a.score / a.totalPoints) * 100
  } else if (a.percentage && a.percentage !== '--') {
    const parsed = parseFloat(a.percentage)
    if (!isNaN(parsed)) pct = parsed
  }

  if (pct === null) return colors.textMuted
  if (pct >= 90) return colors.success
  if (pct >= 80) return colors.info
  if (pct >= 70) return colors.warning
  if (pct >= 60) return colors.orange
  return colors.error
}

/**
 * Format a due date string to something readable.
 * HAC returns dates like "05/15/2025" or "5/15/2025".
 */
function formatDueDate(raw: string): string {
  if (!raw || raw === '--' || raw === '') return ''
  try {
    const d = new Date(raw)
    if (isNaN(d.getTime())) return raw
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return raw
  }
}

// ── Assignment Row ──────────────────────────────────────────────────────────────

function AssignmentRow({ item }: { item: AssignmentDetail }): React.JSX.Element {
  const scoreStr = formatScore(item)
  const color = scoreColor(item)
  const due = formatDueDate(item.dateDue)

  return (
    <View style={styles.assignmentRow}>
      <View style={styles.assignmentLeft}>
        <Text variant="body" style={styles.assignmentName} numberOfLines={2}>
          {item.name || 'Unnamed Assignment'}
        </Text>
        <View style={styles.assignmentMeta}>
          {item.category ? (
            <View style={styles.categoryChip}>
              <Text style={styles.categoryText}>{item.category}</Text>
            </View>
          ) : null}
          {due ? (
            <Text variant="caption" color={colors.textMuted}>
              Due {due}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.assignmentRight}>
        <Text style={[styles.scoreText, { color }]}>
          {scoreStr}
        </Text>
      </View>
    </View>
  )
}

function Separator(): React.JSX.Element {
  return <View style={styles.separator} />
}

// ── Category Summary ────────────────────────────────────────────────────────────

interface CategorySummary {
  name: string
  count: number
  average: number | null
}

function buildCategorySummaries(assignments: AssignmentDetail[]): CategorySummary[] {
  const map = new Map<string, { scores: number[]; totals: number[] }>()

  for (const a of assignments) {
    const cat = a.category || 'Uncategorized'
    if (!map.has(cat)) map.set(cat, { scores: [], totals: [] })
    const entry = map.get(cat)!
    if (a.score !== null && a.totalPoints !== null && a.totalPoints > 0) {
      entry.scores.push(a.score)
      entry.totals.push(a.totalPoints)
    }
  }

  const summaries: CategorySummary[] = []
  for (const [name, data] of map.entries()) {
    const count = assignments.filter(a => (a.category || 'Uncategorized') === name).length
    const totalScore = data.scores.reduce((s, v) => s + v, 0)
    const totalPossible = data.totals.reduce((s, v) => s + v, 0)
    const average = totalPossible > 0 ? Math.round((totalScore / totalPossible) * 1000) / 10 : null
    summaries.push({ name, count, average })
  }

  return summaries.sort((a, b) => a.name.localeCompare(b.name))
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function CourseDetailScreen(): React.JSX.Element {
  const route = useRoute<RouteType>()
  const { courseId, courseName } = route.params

  // Find course from cache populated by GradeViewerScreen
  const course = useMemo(
    () => coursesCache.current.find(c => c.id.toString() === courseId) ?? null,
    [courseId]
  )

  const assignments = course?.assignments ?? []
  const categorySummaries = useMemo(() => buildCategorySummaries(assignments), [assignments])

  const courseAvg = course?.grade?.percentage ?? null
  const courseLetter = course?.grade?.letterGrade ?? null

  const Header = useMemo(() => (
    <View>
      {/* Course summary card */}
      <View style={styles.summaryCard}>
        <Text variant="h3" style={styles.summaryCourseName}>{courseName}</Text>
        {course?.teacher ? (
          <Text variant="caption" color={colors.textSecondary}>
            {course.teacher} · Period {course.period}
          </Text>
        ) : null}
        <View style={styles.summaryGradeRow}>
          {courseAvg !== null && (
            <Text style={styles.summaryAvg}>{courseAvg.toFixed(1)}%</Text>
          )}
          {courseLetter && (
            <View style={[styles.letterBadge, { borderColor: courseLetter ? colors.primary : colors.border }]}>
              <Text style={styles.letterBadgeText}>{courseLetter}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Category breakdown */}
      {categorySummaries.length > 0 && (
        <View style={styles.categorySection}>
          <Text variant="label" color={colors.textSecondary} style={styles.sectionLabel}>
            BY CATEGORY
          </Text>
          {categorySummaries.map(cat => (
            <View key={cat.name} style={styles.categoryRow}>
              <Text variant="body" style={{ flex: 1 }}>{cat.name}</Text>
              <Text variant="caption" color={colors.textMuted}>
                {cat.count} assignment{cat.count !== 1 ? 's' : ''}
              </Text>
              {cat.average !== null && (
                <Text style={[styles.catAvg, { color: scoreColor({ score: cat.average, totalPoints: 100, percentage: '', name: '', category: '', dateDue: '' }) }]}>
                  {cat.average.toFixed(1)}%
                </Text>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Assignments header */}
      <View style={styles.assignmentsHeader}>
        <Text variant="label" color={colors.textSecondary}>
          ASSIGNMENTS ({assignments.length})
        </Text>
      </View>
    </View>
  ), [course, courseName, courseAvg, courseLetter, categorySummaries, assignments.length])

  return (
    <View style={styles.screen}>
      <ScreenHeader title={courseName} />

      {assignments.length === 0 ? (
        <View style={styles.emptyState}>
          {Header}
          <View style={styles.emptyContent}>
            <Ionicons name="document-text-outline" size={40} color={colors.textMuted} />
            <Text variant="h3" style={{ marginTop: 12, textAlign: 'center' }}>
              No Assignments Found
            </Text>
            <Text variant="caption" color={colors.textSecondary} style={{ textAlign: 'center', marginTop: 8 }}>
              {course === null
                ? 'Course data could not be loaded. Try refreshing grades.'
                : 'No assignment data was returned for this course from your school portal.'}
            </Text>
          </View>
        </View>
      ) : (
        <FlatList
          data={assignments}
          keyExtractor={(item, index) => `${item.name}-${index}`}
          renderItem={({ item }) => <AssignmentRow item={item} />}
          ItemSeparatorComponent={Separator}
          ListHeaderComponent={Header}
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  summaryCard: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  summaryCourseName: {
    marginBottom: 4,
  },
  summaryGradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
  },
  summaryAvg: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  letterBadge: {
    width: 48,
    height: 48,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterBadgeText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
  },
  categorySection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionLabel: {
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 8,
  },
  catAvg: {
    fontSize: 13,
    fontWeight: '700',
    minWidth: 52,
    textAlign: 'right',
  },
  assignmentsHeader: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  assignmentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
  },
  assignmentLeft: {
    flex: 1,
  },
  assignmentName: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    marginBottom: 6,
  },
  assignmentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  categoryChip: {
    backgroundColor: colors.surface,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  assignmentRight: {
    alignItems: 'flex-end',
    minWidth: 90,
  },
  scoreText: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 20,
  },
  emptyState: {
    flex: 1,
  },
  emptyContent: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 60,
  },
})
```

---

## Part F — Export the courses cache from `CourseDetailScreen` correctly

In `GradeViewerScreen.tsx`, import the cache ref:

```typescript
import CourseDetailScreen, { coursesCache } from './CourseDetailScreen'
```

Wait — `CourseDetailScreen` is used via navigation (it's registered in
`GradePortalNavigator`), so you should NOT import the component directly
in `GradeViewerScreen`. Import ONLY the cache:

```typescript
import { coursesCache } from './CourseDetailScreen'
```

Then before navigating:
```typescript
onPress={() => {
  coursesCache.current = sortedCourses  // populate cache before navigation
  navigation.navigate('CourseDetail', {
    courseId: item.id.toString(),
    courseName: item.name,
  })
}}
```

---

## Part G — Update Course Average Display in `GradeViewerScreen`

Find `CourseRow`'s percentage display. Currently it shows percentage.
Make it prefer the numeric percentage over the letter:

The badge should still show the letter (`A`, `B`, etc.) since it's compact.
But the text below the badge should show the numeric percentage:

```typescript
{percentage !== null && (
  <Text variant="caption" color={colors.textSecondary} style={styles.percentageText}>
    {percentage.toFixed(1)}%
  </Text>
)}
```

This is likely already present — verify it is correct and not showing `A+`
style strings in the percentage slot.

---

## TypeScript Requirements

```bash
cd nextstep-mobile
npx tsc --noEmit
```

Zero errors. Watch for:
- `coursesCache` export — must be a `React.MutableRefObject<CourseWithGrade[]>`
  and exported as a named export from `CourseDetailScreen.tsx`
- `CourseWithGrade` must have `assignments: AssignmentDetail[]` — added in Part B
- `AssignmentDetail` must be exported from `gradesApi.ts`
- Navigation type for `CourseDetail` must include `courseId` and `courseName`

---

## Acceptance Criteria

- [ ] `CourseDetailScreen.tsx` created with full assignment list
- [ ] `GradePortalParamList` includes `CourseDetail` route with typed params
- [ ] `CourseDetail` registered in `GradePortalNavigator`
- [ ] `CourseRow` is a `TouchableOpacity` with chevron icon
- [ ] Tapping a course navigates to `CourseDetailScreen`
- [ ] Assignments display as "score / total  (pct%)" — numeric preferred
- [ ] Category breakdown section shows per-category averages
- [ ] Empty state shown when no assignments available
- [ ] `AssignmentDetail` exported from `gradesApi.ts`
- [ ] `npx tsc --noEmit` passes with zero errors

## What NOT to Do

- Do NOT use React Navigation `params` to pass the full assignments array
  (too large; use the module-level cache instead)
- Do NOT remove the letter grade badge from the course list
- Do NOT change `normalizeGrades.ts` — assignments are already mapped
- Do NOT add a back button — `ScreenHeader` handles that via the navigator stack
