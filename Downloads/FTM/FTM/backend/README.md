# NextStep Backend

Express + TypeScript + Prisma (SQLite) API for the NextStep prototype.

## Prerequisites

- Node.js 20+
- npm

## Setup

```bash
npm install
cp .env.example .env
npx prisma migrate dev --name init
npx prisma db seed
npm run dev
```

Server runs on **http://localhost:3001**.

## Test credentials

| Field    | Value                  |
|----------|------------------------|
| email    | test@nextstep.com      |
| password | nextstep123            |

## Scripts

| Command          | Description                          |
|------------------|--------------------------------------|
| `npm run dev`    | Start dev server with hot reload     |
| `npm run build`  | Compile TypeScript to `dist/`        |
| `npm start`      | Run compiled build                   |
| `npm run db:migrate` | Run pending Prisma migrations    |
| `npm run db:seed`    | Seed database with test data     |
| `npm run db:reset`   | Reset DB and re-seed             |

## Endpoints

| Method | Path           | Auth | Description          |
|--------|----------------|------|----------------------|
| GET    | /health        | No   | Health check         |
| POST   | /auth/login    | No   | Login, returns JWT   |
| GET    | /auth/me       | Yes  | Current user profile |
