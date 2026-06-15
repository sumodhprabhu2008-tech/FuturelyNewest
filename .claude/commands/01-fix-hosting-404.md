# Phase 1 — Fix the production 404

## Before starting
Read `.claude/DIAGNOSTIC_REPORT.md` — Phase 0 should already have identified which scenario below applies. Implement that one.

## Ground rules
Same as Phase 0: maintenance mode, minimal diffs, read-before-edit, type-check after, never touch `hacClient.ts` internals / `CourseDetailScreen` / existing grade routes-models, never persist credentials.

## Scenario A — Express backend has no root route
If the domain points at the Express API and there's no `GET /` handler, add a minimal one:

```ts
app.get("/", (_req, res) => {
  res.status(200).json({ status: "ok", service: "NextStep API" });
});
```

Register it alongside other top-level routes, before any catch-all 404 handler. Don't touch existing `/api/...` prefixes.

## Scenario B — Web frontend build isn't being served/routed correctly
If a Next.js (or Expo web export) build is meant to serve the domain:
- Confirm the build command and output directory in the hosting platform's config actually match what the framework produces.
- For a static export, confirm there's a catch-all rewrite to `index.html` for client-side routes. For SSR, confirm `next start` (or equivalent) is the actual run command.

Fix the specific misconfiguration — this is almost always a 1–2 line config change, not application code.

## Scenario C — Route ordering / path collision
If one server serves both `/api/*` and a static frontend, make sure the frontend's catch-all route is registered LAST, after all `/api/*` routes, so it doesn't shadow them.

## Don't
- Change the mobile app's API base URL or any `/api/...` paths.
- Introduce a new hosting platform or restructure the deploy pipeline.

## Finish
- Build/type-check whichever package you touched.
- Append a "Phase 1" section to `.claude/DIAGNOSTIC_REPORT.md`: what was actually wrong, what changed, and any manual redeploy step needed on the hosting platform.
