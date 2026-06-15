# Agent Script: Smart Planner

Run after `03-gpa-simulator.md` is complete.

---

## TURN 1 — Architect designs it

```
Act as Lead Architect.

Read: .claude/context/PROJECT.md, ARCHITECTURE.md, ENGINEERING_RULES.md

Design the Smart Planner for the NextStep prototype.

What it does:
- Shows a list of assignments with due dates, subject, and estimated time
- Student can mark assignments as complete (taps a checkbox)
- Overdue assignments shown with red accent
- Due today shown with yellow accent
- Upcoming shown normally
- Simple weekly view: "Today", "Tomorrow", "This Week", "Later"

Prototype constraints:
- Seed data only — no Canvas/Google Classroom sync yet
- Assignments stored in SQLite, status (complete/incomplete) persisted
- PATCH /assignments/:id/complete endpoint to toggle completion

Provide:
1. Prisma schema: Assignment model
2. Express routes: GET /assignments, PATCH /assignments/:id/complete
3. Seed data: 8 realistic assignments across multiple subjects with varied due dates
4. Task breakdown for Backend and Frontend agents
```

---

## TURN 2 — Backend builds it

```
Act as Backend Engineer.

Read: .claude/context/ARCHITECTURE.md, ENGINEERING_RULES.md

Build the Smart Planner backend.

Architect plan:
[PASTE TURN 1 OUTPUT HERE]

Deliver:
- Prisma schema additions: Assignment model
  fields: id, userId, courseId, title, dueDate, estimatedMinutes, isComplete, priority
- src/routes/assignments.ts
  - GET /assignments — returns assignments grouped by time bucket
    (overdue, today, tomorrow, this_week, later)
  - PATCH /assignments/:id/complete — toggles isComplete boolean
  Both routes: auth-protected
- prisma/seed.ts additions: 8 assignments with realistic titles and due dates
  relative to today (2 overdue, 1 today, 2 tomorrow, 3 this week)
- TypeScript strict, no any. Include handoff block.
```

---

## TURN 3 — Frontend builds the screen

```
Act as Frontend Engineer.

Read: .claude/context/ARCHITECTURE.md, DESIGN_SYSTEM.md, ENGINEERING_RULES.md

Build the Smart Planner screen.

Backend API:
[PASTE TURN 2 OUTPUT HERE]

Deliver:
- src/screens/SmartPlannerScreen.tsx
  - Section headers: "Overdue", "Today", "Tomorrow", "This Week", "Later"
  - AssignmentCard component per assignment
  - Tapping checkbox calls PATCH /assignments/:id/complete, updates UI optimistically
  - Completed assignments get strikethrough text and reduced opacity
  - Loading skeleton, error state, empty state ("No assignments due — enjoy your day!")
- src/api/assignmentsApi.ts — fetch wrappers for both endpoints
- Add Planner tab to bottom navigation

TypeScript strict, all three states. Include handoff block.
```

---

## TURN 4 — UI builds the components

```
Act as UI Design System Engineer.

Read: .claude/context/DESIGN_SYSTEM.md, ENGINEERING_RULES.md

Build the Smart Planner UI components.

Frontend output:
[PASTE TURN 3 OUTPUT HERE]

Deliver:
- src/components/planner/AssignmentCard.tsx
  - Left: checkbox (empty circle → filled teal check on complete)
  - Center: assignment title (strikethrough when done), subject name, estimated time
  - Right: due date label
  - Card accent: red left border if overdue, yellow if today, none otherwise
  - Completed: whole card slightly muted (opacity 0.5)
- src/components/planner/SectionHeader.tsx
  - Section label ("Today", "Overdue" etc.)
  - Count badge showing number of assignments in section
  - "Overdue" section header in red

All typed, no business logic. Include handoff block.
```

---

## TURN 5 — QA checks it

```
Act as QA & Security Engineer.

Read: .claude/context/ENGINEERING_RULES.md

Review the Smart Planner.

All outputs:
[PASTE TURNS 2 + 3 + 4 OUTPUTS HERE]

Check:
- Marking complete updates the UI immediately without full reload (optimistic update)
- Overdue assignments correctly identified (dueDate < today)
- Today's assignments correctly identified (dueDate = today's date)
- Unauthenticated requests to GET /assignments return 401
- Student can only see their own assignments (userId scoped)
- Empty state shows when no assignments in a section

Issue PASS, REVISE, or BLOCK verdict.
```
