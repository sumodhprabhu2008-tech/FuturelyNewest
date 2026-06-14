# Phase 3 — Fix Dashboard and Planner

## Before starting
Read `.claude/DIAGNOSTIC_REPORT.md` (Phases 0–2). Phase 2 should have produced a fast cached-grades endpoint and a sync-status endpoint — use them here.

## Ground rules
Same as previous phases (minimal diffs, read-before-edit, type-check after, never touch `hacClient.ts` internals / `CourseDetailScreen` / existing grade routes-models, no credential persistence).

## Dashboard
- Read the full Dashboard screen and its data layer.
- Confirm it's calling the Phase 2 cached/sync-status endpoints; finish wiring this if Phase 2 left it incomplete.
- Add loading (syncing), error, and empty states, matching the existing visual style used elsewhere (e.g., the card/color conventions from `CourseDetailScreen`) — don't introduce a new design language.
- If "Dashboard shows nothing" had a separate cause (crash on mount, bad import, missing navigation registration), fix that too and note it even if Phase 2's data-flow changes would also have masked it.

## Planner
- Read the full Planner screen and any backend route it calls.
- The AI-driven study-plan generation is a known stub awaiting an API key — that's expected and out of scope here.
- Diagnose why the SCREEN itself isn't working: likely a crash on mount, a missing/broken navigation route registration, a call to a nonexistent/erroring endpoint, or a render error on `undefined` data.
- Fix the wiring/rendering bug so the screen loads cleanly with a sensible placeholder/empty state (e.g., "Your study plan will appear here once your grades sync").
- If the Planner is meant to show assignments, wire it to the Phase 2 cached endpoint so it displays real assignment data even before AI scheduling exists.

## Don't
- Implement AI study-plan generation.
- Touch `CourseDetailScreen` or grade-detail routes.
- Change navigation structure beyond fixing a broken registration.

## Finish
- Type-check backend and mobile.
- Append a "Phase 3" section to `.claude/DIAGNOSTIC_REPORT.md`, including a written trace of: sign-in → Phase 2 sync → Dashboard shows data → Planner shows assignment data, confirming each link in the chain in the actual code.
