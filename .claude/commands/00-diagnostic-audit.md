# Phase 0 — Diagnostic Audit (Read First, Fix Light)

## Role
You're doing maintenance on NextStep — an existing, partially-deployed React Native (Expo) + Express/TypeScript/Prisma/SQLite app that connects to school grade portals (HAC for Katy ISD). This is NOT a rewrite. Read before you touch anything, and make the smallest change that fixes the actual root cause.

## Hard rules for this entire session (every phase)
- Read a file completely before editing it.
- Don't refactor, rename, reformat, or "clean up" anything outside the scope of the bug you're fixing.
- Never modify the internals of `hacClient.ts` (scraping selectors, cookie/session handling, parsing) — you may add new exported functions or thin wrappers around existing ones, but don't change how the existing ones work.
- Never modify `CourseDetailScreen` or any existing grade-detail routes/controllers — they work and must keep working.
- Never remove or rename existing Prisma models/fields — additive migrations only.
- HAC portal credentials (username/password) may only ever exist in memory for the duration of a single sign-in/sync operation. Never write them to the database, a file, `.env`, or any log/console statement — in this phase or any later one.
- After any code change, find the project's actual type-check command (check `package.json` scripts in both the backend and the Expo app) and run it. Fix any new errors before moving on.
- Use `--legacy-peer-deps` for any npm install.

## The four reported bugs
1. The production domain shows an internal 404 where the hosted app/landing should be.
2. Signing in (ISD + HAC username + password) takes roughly 5 minutes.
3. The Dashboard screen shows nothing.
4. The Planner screen isn't working.

## What to do

### 1. Map the territory (skim, don't deep-dive yet)
Locate:
- Deployment/hosting config: `render.yaml` / `vercel.json` / `next.config.js` / root `package.json` scripts / any Express static-file serving / `app.json`.
- Sign-in: the route/controller handling login, any auth middleware, and the `hacClient.ts` functions it calls.
- Dashboard screen + the API call(s) it makes (frontend `apiFetch` call + matching backend route).
- Planner screen + any backend route it calls.
- Settings: the existing flow where a user re-enters HAC credentials to "connect" / trigger a grade fetch.

If any of these don't exist under the names above, search for the closest equivalent and record the real path in the report.

### 2. Diagnose each bug
Create `.claude/DIAGNOSTIC_REPORT.md`. For each of the 4 bugs, write: **Symptom**, **Root cause** (file + function/line), **Confidence** (high/med/low), and **Notes for later phases**.

For bug 2 (slow sign-in), specifically check and note which of these apply:
- `axios` calls in `hacClient.ts` with no `timeout` set.
- A loop doing sequential `await axios...` once per course/category (N sequential round trips).
- Retry/backoff logic that retries multiple times on failure.
- The sign-in route awaiting a FULL grade scrape (every course + every assignment) before responding at all.
- If the app is hosted on a free tier with "sleep after inactivity" / cold-start behavior, note that as a possible contributing infra-level factor — flag it for Sai, since that's not something to fix in code.

For bug 1 (404), specifically check and note which applies:
- Does the Express backend define any handler for `GET /`? If the custom domain points at this service and there's no root route, Express's default "Cannot GET /" is the 404 being seen.
- Is there a separate web build (Next.js / Expo web export) meant to be served at this domain instead/also, and is it actually being built and deployed?
- If one server serves both API and a static frontend, is the catch-all route for the frontend registered AFTER the API routes (correct) or before (would shadow them)?

### 3. Safe quick fixes — apply now, log each one
- If `hacClient.ts` axios calls have no `timeout`, add `timeout: 15000` to each request's config only — don't touch URLs, headers, selectors, or parsing.
- Fix any obvious one-line bug (missing `await`, unhandled `undefined`, typo'd prop/import) that's causing a TS error or an immediate crash on mount in Dashboard/Planner. If it doesn't fully fix "shows nothing," still document the deeper cause for Phase 3 — don't force a fix here.
- Don't restructure sign-in, add database models, or touch Settings yet — that's Phases 2–3.

### 4. Finish
- Run the type checks. Report pass/fail.
- In chat, summarize each of the 4 diagnoses in 1–2 sentences and list any quick fixes applied.
