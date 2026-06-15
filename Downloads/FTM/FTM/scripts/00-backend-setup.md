# Agent Script: Backend Project Setup

Run this FIRST before any feature scripts.
This sets up the Express + SQLite backend that all features share.

---

## TURN 1 — Backend sets up the project

```
Act as Backend Engineer.

Read: .claude/context/ARCHITECTURE.md, ENGINEERING_RULES.md

Set up the NextStep prototype backend from scratch.

Stack:
- Node.js + Express + TypeScript
- Prisma ORM with SQLite (file: dev.db)
- bcrypt for password hashing
- jsonwebtoken for JWT auth
- cors enabled for local mobile dev

Create the complete starting project structure:

1. package.json with all dependencies
2. tsconfig.json (strict mode)
3. src/index.ts — Express app, port 3001, CORS open for development
4. src/middleware/auth.ts — JWT verification, attaches userId to request
5. prisma/schema.prisma — SQLite provider, User model only (other models added per feature)
6. .env.example — JWT_SECRET, DATABASE_URL, PORT
7. README.md — how to run:
   npm install
   cp .env.example .env
   npx prisma migrate dev --name init
   npx prisma db seed
   npm run dev

TypeScript strict throughout. Include handoff block.
```

---

## TURN 2 — DevOps configures the scripts

```
Act as DevOps Engineer.

Read: .claude/context/ENGINEERING_RULES.md

Configure the development scripts for the NextStep prototype backend.

Backend setup:
[PASTE TURN 1 OUTPUT HERE]

Deliver:
- Updated package.json scripts:
  "dev": "ts-node-dev --respawn src/index.ts"
  "build": "tsc"
  "start": "node dist/index.js"
  "db:migrate": "prisma migrate dev"
  "db:seed": "prisma db seed"
  "db:reset": "prisma migrate reset --force && prisma db seed"
- .gitignore: node_modules, dist, .env, dev.db
- Confirm all required dev dependencies are listed

Include handoff block.
```
