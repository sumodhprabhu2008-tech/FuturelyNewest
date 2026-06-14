# Phase 2 — Fast sign-in + automatic grade sync (no second credential entry)

## Before starting
Read `.claude/DIAGNOSTIC_REPORT.md` (Phases 0–1).

## Ground rules
Same as Phase 0 — repeated here because this phase touches the most sensitive part of the app:
- Read every file below in full before changing anything.
- Never modify `hacClient.ts`'s internal scraping/parsing/cookie logic — only how/when its exported functions are called, or new thin wrappers around them.
- Never touch `CourseDetailScreen` or existing grade-detail routes/Prisma models — additive only.
- **HAC credentials live in memory only**, for the duration of the sign-in request and the sync it triggers. Never write them to the DB, a file, `.env`, or a log. Only the resulting grade/course/assignment DATA may be persisted.
- Type-check after.

## Current behavior (verify, don't assume)
Sign-in (ISD + HAC username + password) takes ~5 minutes. Separately, Settings has a flow where the user re-enters the SAME credentials to "connect" to HAC — and that's currently the only thing that populates the Dashboard with real data.

## Target behavior
1. **Sign-in responds quickly** (seconds, not minutes) — it should only verify credentials and establish the NextStep session.
2. **Immediately after a successful sign-in, a grade sync starts automatically**, using the same credentials the student just typed, in memory — no trip to Settings, no second entry.
3. **Avoid redundant scraping**: before starting a fresh sync, check if cached data already exists and is recent (e.g., synced within the last 15 minutes). If so, serve the cache immediately and skip re-scraping. Only do a full HAC sync if the cache is stale or missing. (Tune the threshold if you find an existing convention — the point is to avoid hammering HAC on every app open/sign-in.)
4. **Fetched data is cached** via Prisma (grades/courses/assignments), tied to the user, with a `lastSyncedAt` timestamp.
5. **Dashboard shows a "syncing your grades…" state** while a sync is in progress, then updates once it completes — poll a small status endpoint, or whatever lightweight pattern fits the existing `apiFetch` setup.
6. **Settings no longer requires re-entering credentials for the dashboard to populate.** Repurpose that flow as an optional "Refresh now" action that calls the same sync logic — credentials should only be asked for again if there's genuinely no usable session (e.g., after a long period, or if HAC auth fails).
7. **Sync errors are surfaced, not silently hung.** If the sync fails (bad credentials, HAC unreachable), the status endpoint should report an error state and the Dashboard should show a real message — not an infinite spinner.

## Steps
1. **Read in full first:**
   - The current sign-in route/controller and whatever it currently calls in `hacClient.ts`.
   - `hacClient.ts`'s exported functions — signatures and return shapes only.
   - `schema.prisma`.
   - The Settings screen's portal-connection flow.
   - The Dashboard screen's current data fetching.

2. **Split sign-in into**:
   - (a) a fast auth-only step that confirms credentials and creates the session, returned to the client immediately.
   - (b) a sync step (sync-now-if-stale, per point 3 above) using the same in-memory credentials, run right after (a) — synchronously-but-fast if HAC auth is the only slow part once the existing scrape-everything call is decoupled, or as a background job if not.
   - If `hacClient.ts` only exposes one combined "auth + scrape everything" function, add a new thin wrapper that can do auth alone vs. auth+sync — don't change the existing combined function if anything else still calls it directly.

3. **Add cache model(s)** to `schema.prisma` if suitable ones don't already exist (check first — earlier work may have created something close). Additive migration only (`npx prisma migrate dev --name ...` — Sai will run this).

4. **Add/update endpoints**: a fast "get cached grades" endpoint and a "sync status" endpoint (`syncing` / `complete` / `error`, plus `lastSyncedAt`).

5. **Wire Dashboard** to the new endpoints with syncing/error/empty/loaded states.

6. **Update Settings** per point 6 above.

## Don't
- Change `hacClient.ts` scraping selectors, request URLs, or cookie/session handling.
- Touch `CourseDetailScreen` or its data source.
- Add any new credential storage (Keychain/AsyncStorage/SecureStore) for HAC credentials.
- Remove the Settings screen — repurpose the relevant section only.

## Finish
- Type-check backend and mobile.
- Append a "Phase 2" section to `.claude/DIAGNOSTIC_REPORT.md`: new endpoints, new Prisma model(s) + the migration command Sai needs to run, the staleness threshold used, and the full sign-in → sync → dashboard flow described end to end.
