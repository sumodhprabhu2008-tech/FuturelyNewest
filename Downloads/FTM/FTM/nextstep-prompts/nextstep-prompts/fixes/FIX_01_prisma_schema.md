# FIX 01 — Prisma Schema Provider Mismatch (SQLite vs PostgreSQL)

## Priority: MUST RUN FIRST — All other fixes depend on a working database layer

---

## Context & Root Cause

`backend/prisma/schema.prisma` declares `provider = "postgresql"` and references
two environment variables (`DATABASE_URL` and `DIRECT_URL`) that point to a
PostgreSQL instance. However, `backend/prisma/migrations/migration_lock.toml`
clearly states `provider = "sqlite"`, which means every migration was actually
run against SQLite. The Prisma client generated from the PostgreSQL schema may
produce a client that targets the wrong engine, causing runtime failures on any
query that hits the database.

Additionally, the `directUrl` field is a Prisma Accelerate / PgBouncer
concept that has no meaning for SQLite and will cause `prisma generate` to
throw or behave unexpectedly.

---

## What You Must Do — Step by Step

### STEP 1 — Read existing files before touching anything

Read each of these files completely before making any edit:

```
backend/prisma/schema.prisma
backend/prisma/migrations/migration_lock.toml
backend/prisma/migrations/20260601032048_init/migration.sql
backend/prisma/migrations/20260601055002_add_grades/migration.sql
backend/prisma/migrations/20260601230139_add_assignments/migration.sql
backend/prisma/migrations/20260602000000_add_student_profile/migration.sql
backend/prisma/migrations/20260608035719_add_school_connection/migration.sql
backend/.gitignore
backend/package.json
```

Confirm:
- The migration SQL files use SQLite syntax (no `SERIAL`, no `BIGSERIAL`,
  uses `INTEGER PRIMARY KEY AUTOINCREMENT` or similar)
- The `backend/.gitignore` excludes `*.db` and `dev.db`
- `backend/package.json` has a `prisma` section or a `db:migrate` script

### STEP 2 — Fix `backend/prisma/schema.prisma`

Replace the entire `datasource db` block. Change it from:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

To:

```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

Do NOT change the `generator client` block. Do NOT change any model
definitions. Only the `datasource db` block changes.

### STEP 3 — Create or update `backend/.env` if it does not already exist

Check whether `backend/.env` exists. If it does not exist, create it.
If it already exists, check whether `DATABASE_URL` is set correctly.

The correct `DATABASE_URL` for SQLite on Windows with Git Bash must use
an absolute path with forward slashes. Use this exact format:

```
DATABASE_URL="file:./dev.db"
JWT_SECRET="nextstep-dev-secret-change-in-production"
ENABLE_DEV_INTEGRATION_AUTH_BYPASS=false
```

The `file:./dev.db` path is relative to the `backend/prisma/` directory
which is where Prisma resolves it from. This is correct for local dev.

Do NOT set `DIRECT_URL` — it is no longer in the schema.
Do NOT commit `.env` to git (it is already in `.gitignore`).

### STEP 4 — Regenerate the Prisma client

Run these commands from the `backend/` directory:

```bash
cd backend
npx prisma generate
```

Expected output: `✔ Generated Prisma Client` with no errors.

If you see any error about `DIRECT_URL` or `postgresql`, the schema edit
in Step 2 did not save correctly. Re-read the file and verify the change.

### STEP 5 — Run migrations to ensure the database is up to date

```bash
cd backend
npx prisma migrate deploy
```

This applies any pending migrations to `dev.db` without prompting.

If `dev.db` does not exist yet, run instead:

```bash
cd backend
npx prisma migrate dev --name init
```

Do NOT run `prisma migrate reset` — this destroys all seed data.

### STEP 6 — Verify the database exists and has the right tables

```bash
cd backend
npx prisma studio
```

If Prisma Studio opens without error and shows the tables
`User`, `Course`, `Grade`, `Assignment`, `StudentProfile`, `SchoolConnection`,
`ComplianceAuditLog` — the fix is complete.

Alternatively, run:

```bash
cd backend
node -e "const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient(); p.user.count().then(n => { console.log('User count:', n); p.\$disconnect(); }).catch(e => { console.error(e); p.\$disconnect(); })"
```

Expected output: `User count: 0` or a positive number (not an error).

### STEP 7 — Seed the database with test data

```bash
cd backend
npx ts-node prisma/seed.ts
```

Or if the package.json has a seed script:

```bash
cd backend
npm run db:seed
```

Verify the seed ran without errors. The test account
`test@nextstep.com` / `nextstep123` must exist for later tests.

### STEP 8 — TypeScript check

```bash
cd backend
npx tsc --noEmit
```

There should be zero TypeScript errors related to Prisma types.
If there are errors about `directUrl` or missing properties on
`PrismaClientOptions`, the schema was not regenerated properly.
Re-run `npx prisma generate` from the `backend/` directory.

---

## Acceptance Criteria

- [ ] `backend/prisma/schema.prisma` has `provider = "sqlite"` with no `directUrl`
- [ ] `backend/.env` exists with `DATABASE_URL="file:./dev.db"`
- [ ] `npx prisma generate` completes without errors
- [ ] `npx prisma migrate deploy` completes without errors
- [ ] `backend/prisma/dev.db` file exists on disk
- [ ] `npx tsc --noEmit` in `backend/` reports zero errors
- [ ] The test user `test@nextstep.com` exists in the database

---

## What NOT to Do

- Do NOT change any model definitions in `schema.prisma`
- Do NOT delete the migrations folder
- Do NOT run `prisma migrate reset` (destroys data)
- Do NOT add `directUrl` back
- Do NOT change `migration_lock.toml` manually
