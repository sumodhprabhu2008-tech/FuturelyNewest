# RUN ALL — NextStep Bugfix & Auto-Sync Sprint

Before starting: make sure the current working state is committed (or stashed), so the changes from this sprint are easy to review and diff against.

Run these in order as one continuous maintenance session:

1. `00-diagnostic-audit.md`
2. `01-fix-hosting-404.md`
3. `02-fix-login-autofetch.md`
4. `03-fix-dashboard-planner.md`

After each phase: run the type checks for whichever package(s) you touched (confirm exact script names in each `package.json` first) and fix any new errors before continuing. Append that phase's findings to `.claude/DIAGNOSTIC_REPORT.md`.

After all four phases, give a final chat summary covering:
- Root cause + fix for each of the 4 original bugs (404, slow sign-in, dashboard, planner).
- The new sign-in → auto-sync → dashboard/planner flow, end to end, including the staleness threshold used.
- Manual steps Sai needs to run: `npx prisma migrate dev`, redeploy, restart Expo, etc.
- Explicit confirmation that `hacClient.ts` scraping internals, `CourseDetailScreen`, and existing grade-related Prisma models/routes were not modified (only added to, if anything).
- Anything still broken or that needs Sai's input before continuing.
