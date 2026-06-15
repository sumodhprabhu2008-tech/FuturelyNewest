# Agent Script: Grade Viewer

Run after `01-auth.md` is complete and working on your phone.

---

## TURN 1 — Architect designs it

```
Act as Lead Architect.

Read: .claude/context/PROJECT.md, ARCHITECTURE.md, ENGINEERING_RULES.md

Design the Grade Viewer for the NextStep prototype.

Prototype constraints:
- SQLite via Prisma (already set up from auth feature)
- Seed data: realistic fake grades for test student (6 subjects, letter grades, percentages)
- No real school system sync yet — seed data only
- GPA calculated server-side and returned in API response

Provide:
1. Prisma schema additions: Course and Grade models
2. Express API: GET /grades — returns courses with grades + calculated GPA
3. GPA calculation logic (weighted and unweighted)
4. Task breakdown for Backend and Frontend agents
```

---

## TURN 2 — Backend builds it

```
Act as Backend Engineer.

Read: .claude/context/ARCHITECTURE.md, ENGINEERING_RULES.md

Build the Grade Viewer backend.

Architect plan:
[PASTE TURN 1 OUTPUT HERE]

Deliver:
- Prisma schema additions (Course, Grade models)
- Migration: npx prisma migrate dev --name add-grades
- src/routes/grades.ts — GET /grades endpoint, auth-protected
- GPA calculation: unweighted (4.0 scale) and weighted (AP +1.0)
- prisma/seed.ts additions — 6 realistic courses with grades:
  AP English (A-, 92%), AP Calculus (B+, 88%), US History (A, 95%),
  Spanish III (B, 83%), Chemistry (B+, 87%), PE (A, 98%)
- TypeScript strict, no any

Include handoff block.
```

---

## TURN 3 — Frontend builds the screen

```
Act as Frontend Engineer.

Read: .claude/context/ARCHITECTURE.md, DESIGN_SYSTEM.md, ENGINEERING_RULES.md

Build the Grade Viewer screen.

Backend API:
[PASTE TURN 2 OUTPUT HERE]

Deliver:
- src/screens/GradeViewerScreen.tsx
  - Large GPA display at top (unweighted / weighted toggle)
  - List of GradeCard components, one per subject
  - Loading skeleton while fetching
  - Error state with retry button
  - Empty state if no grades
- src/api/gradesApi.ts — fetch wrapper for GET /grades
- Add Grade Viewer tab to bottom navigation

TypeScript strict. All three states. Include handoff block.
```

---

## TURN 4 — UI builds the GradeCard

```
Act as UI Design System Engineer.

Read: .claude/context/DESIGN_SYSTEM.md, ENGINEERING_RULES.md

Build the GradeCard component and GPA display.

Frontend output:
[PASTE TURN 3 OUTPUT HERE]

Deliver:
- src/components/grades/GradeCard.tsx
  - Subject name, teacher (if available), letter grade badge, percentage
  - Grade badge colors: A=green #3FB950, B=blue #58A6FF, C=yellow #D29922, D=orange #F0883E, F=red #F85149
  - Card style: dark surface #161B22, border #30363D, rounded 12px
- src/components/grades/GPASummaryCard.tsx
  - Large GPA number (32px bold), label underneath
  - Unweighted / Weighted toggle pills
  - Trend arrow (↑ ↓ →) with color
- src/components/ui/Skeleton.tsx — shimmer placeholder for loading

All typed, no business logic. Include handoff block.
```

---

## TURN 5 — QA checks it

```
Act as QA & Security Engineer.

Read: .claude/context/ENGINEERING_RULES.md

Review the Grade Viewer feature.

All outputs:
[PASTE TURNS 2 + 3 + 4 OUTPUTS HERE]

Check:
- GPA calculates correctly for known dataset:
  AP English A- = 3.7 (unweighted), 4.7 (weighted)
  AP Calculus B+ = 3.3 (unweighted), 4.3 (weighted)
  Verify final GPA is approximately 3.6 unweighted, 4.3 weighted
- Unauthenticated request to GET /grades returns 401
- Loading skeleton shows while data fetches
- Error state shows if API is unreachable
- All grade badge colors match spec

Issue PASS, REVISE, or BLOCK verdict.
```
