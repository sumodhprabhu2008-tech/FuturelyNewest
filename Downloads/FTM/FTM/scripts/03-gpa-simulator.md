# Agent Script: GPA Simulator

Run after `02-grade-viewer.md` is complete.

---

## TURN 1 — Architect designs it

```
Act as Lead Architect.

Read: .claude/context/PROJECT.md, ARCHITECTURE.md, ENGINEERING_RULES.md

Design the GPA Simulator for the NextStep prototype.

What it does:
- Student sees their current grades
- They can adjust any grade hypothetically using a picker (A+, A, A-, B+, etc.)
- GPA recalculates in real time as they change grades
- Shows: current GPA, projected GPA, difference (+0.12, -0.05, etc.)
- A "Reset" button restores original grades

Prototype constraints:
- All recalculation happens on the client side (no API call per change)
- The original grades come from the existing GET /grades endpoint
- No saving of hypothetical grades to DB

Provide:
1. Client-side GPA recalculation logic (TypeScript function)
2. Screen layout and component breakdown
3. Task breakdown for Frontend and UI agents
```

---

## TURN 2 — Frontend builds the screen

```
Act as Frontend Engineer.

Read: .claude/context/ARCHITECTURE.md, DESIGN_SYSTEM.md, ENGINEERING_RULES.md

Build the GPA Simulator screen.

Architect plan:
[PASTE TURN 1 OUTPUT HERE]

Grade data comes from existing GET /grades API (already built).

Deliver:
- src/screens/GpaSimulatorScreen.tsx
  - Fetches grades from existing API on mount
  - Local state for hypothetical grades (starts as copy of real grades)
  - For each course: course name + grade picker (A+, A, A-, B+, B, B-, C+, C, D, F)
  - GPAComparisonCard at top: current GPA vs projected GPA, difference in color
    (green if improving, red if dropping, gray if same)
  - Reset button restores all pickers to original grades
  - Recalculation is instant — no API call, pure client-side math
- src/utils/gpaCalculator.ts
  - gradeToPoints(letter: string): number
  - calculateGPA(courses: CourseWithGrade[]): { unweighted: number, weighted: number }
  - All grade conversions: A+=4.3, A=4.0, A-=3.7, B+=3.3, B=3.0, B-=2.7, C+=2.3, C=2.0, D=1.0, F=0.0
  - Weighted: add 1.0 to grade points for AP/IB courses before averaging

Add GPA Simulator tab to bottom navigation.
TypeScript strict, no any. Include handoff block.
```

---

## TURN 3 — UI builds the components

```
Act as UI Design System Engineer.

Read: .claude/context/DESIGN_SYSTEM.md, ENGINEERING_RULES.md

Build the GPA Simulator UI components.

Frontend output:
[PASTE TURN 2 OUTPUT HERE]

Deliver:
- src/components/simulator/GPAComparisonCard.tsx
  - Two columns: "Current" and "Projected"
  - Large GPA numbers
  - Difference badge: +0.12 in green, -0.05 in red, same in gray
  - Smooth number transition when value changes (React Native Animated)
- src/components/simulator/GradePickerRow.tsx
  - Course name on left
  - Grade picker on right: horizontal scroll of pill buttons (A+, A, A-, B+...)
  - Selected grade pill highlighted in teal #00C896
  - AP badge shown for AP courses
- src/components/ui/ResetButton.tsx
  - Secondary button style, with reset icon

All typed, no business logic. Include handoff block.
```

---

## TURN 4 — QA checks it

```
Act as QA & Security Engineer.

Read: .claude/context/ENGINEERING_RULES.md

Review the GPA Simulator.

All outputs:
[PASTE TURNS 2 + 3 OUTPUTS HERE]

Check:
- GPA calculation accuracy:
  If all 6 courses are set to A (4.0), unweighted GPA = 4.0 exactly
  If AP courses are set to A (4.0 + 1.0 bonus = 5.0), weighted GPA > 4.0
  If one course changed from A to F, GPA drops meaningfully
- Reset button restores all pickers to original grades
- Difference badge shows correct color (green=up, red=down, gray=same)
- No API calls fired when sliders change (verify it's client-side only)
- TypeScript: no any types in gpaCalculator.ts

Issue PASS, REVISE, or BLOCK verdict.
```
