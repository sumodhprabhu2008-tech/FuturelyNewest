# Agent Script: Auth & Onboarding

Run these prompts in Claude Code **in order**.
Each one is a complete copy-paste. Do not skip steps.

---

## TURN 1 — Architect designs it

```
Act as Lead Architect.

Read: .claude/context/PROJECT.md, ARCHITECTURE.md, ENGINEERING_RULES.md, COMPLIANCE.md

Design the prototype auth system for NextStep.

Prototype constraints:
- Express.js backend (not NestJS yet)
- SQLite via Prisma (not PostgreSQL)
- Hardcoded test user: email=test@nextstep.com password=nextstep123
- JWT token returned on login, stored in AsyncStorage on mobile
- No Firebase for now

Provide:
1. Prisma schema for the User model
2. Express API routes: POST /auth/login, GET /auth/me
3. React Native screen list: LoginScreen, and what it navigates to
4. Task breakdown for Backend and Frontend agents
```

---

## TURN 2 — Backend builds it

```
Act as Backend Engineer.

Read: .claude/context/ARCHITECTURE.md, ENGINEERING_RULES.md

Build the prototype auth backend based on this Architect plan:
[PASTE TURN 1 OUTPUT HERE]

Deliver:
- prisma/schema.prisma with User model
- src/routes/auth.ts with POST /auth/login and GET /auth/me
- src/middleware/auth.ts JWT verification middleware
- prisma/seed.ts with one test user (test@nextstep.com / nextstep123, bcrypt hashed)
- TypeScript strict, no any

Include the handoff block at the end.
```

---

## TURN 3 — Frontend builds the screen

```
Act as Frontend Engineer.

Read: .claude/context/ARCHITECTURE.md, DESIGN_SYSTEM.md, ENGINEERING_RULES.md

Build the React Native login screen.

Backend context:
[PASTE TURN 2 OUTPUT HERE]

Deliver:
- src/screens/LoginScreen.tsx
  - Email input, password input, Login button
  - Calls POST /auth/login
  - Stores JWT in AsyncStorage on success
  - Navigates to DashboardScreen on success
  - Shows error message on failure
- src/navigation/RootNavigator.tsx
  - Auth stack: LoginScreen
  - App stack: DashboardScreen (placeholder for now)
  - Checks AsyncStorage on launch, routes to correct stack

TypeScript strict. Loading state on button. Error state shown to user.
Include handoff block.
```

---

## TURN 4 — UI polishes it

```
Act as UI Design System Engineer.

Read: .claude/context/DESIGN_SYSTEM.md, ENGINEERING_RULES.md

Polish the login screen UI.

Frontend output:
[PASTE TURN 3 OUTPUT HERE]

NextStep brand: dark background #0D1117, primary teal #00C896, text #E6EDF3.

Deliver:
- Refined LoginScreen.tsx with proper brand styling
- src/components/ui/Button.tsx — primary variant, loading spinner, disabled state
- src/components/ui/Input.tsx — label above, border highlights on focus, error message below
- Both components typed, no business logic

Include handoff block.
```

---

## TURN 5 — QA checks it

```
Act as QA & Security Engineer.

Read: .claude/context/ENGINEERING_RULES.md, COMPLIANCE.md

Review the complete auth feature.

All outputs:
[PASTE TURNS 2 + 3 + 4 OUTPUTS HERE]

Check:
- Login with wrong password returns 401 (not 500)
- Login with missing fields returns 400
- JWT is validated on protected routes
- No passwords logged anywhere
- No any types in TypeScript

Issue PASS, REVISE, or BLOCK verdict with specific issues listed.
```
