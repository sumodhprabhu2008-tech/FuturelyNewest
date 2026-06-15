# NextStep MVP

AI-powered academic companion for high school students.

## Quick Start

### Prerequisites
- Node.js 18+
- Expo Go app on your phone

### 1. Start the backend
```bash
cd backend
npm install
npm run dev
```
Server runs at http://localhost:3001

### 2. Seed student data (first time only)
```bash
cd backend
npm run db:seed          # seeds test user
npm run seed:students    # seeds 4000 SLHS students (~10 min)
```

After adding StudentProfile, run the migration:
```bash
cd backend
npx prisma migrate dev --name add_student_profile
```

### 3. Start the mobile app
```bash
cd nextstep-mobile
npm install
npx expo start
```
Scan the QR code with Expo Go on your phone.
Update `nextstep-mobile/src/constants/api.ts` with your machine's LAN IP.

### 4. Start the web app
```bash
# From project root
npm install
npm run dev
```
Web app: http://localhost:3000

## Demo Credentials
- Test account: `test@nextstep.com` / `nextstep123`
- Any SLHS student: `{studentId}@slhs.edu` / `nextstep123`
- List top students: `cd backend && npm run demo:students`

## Features
- **Grade Viewer** — Report Card, Transcript, Class Schedule, Contact Teachers
- **GPA Simulator** — What-if grade changes, real-time recalculation
- **Smart Planner** — Assignments by priority + Calendar view
- **NextStep AI Chat** — Stub (add Anthropic API key to activate)
- **College Help** — Roadmap, GPA Planner, Colleges placeholder
- **Settings** — Student profile, academic info, preferences

## Adding Real AI
When you have an Anthropic API key:
1. Add `ANTHROPIC_API_KEY=your_key` to `backend/.env`
2. Replace the stub in `backend/src/routes/ai.ts` with the Anthropic SDK call
3. No other changes needed

## Tech Stack
| Layer | Tech |
|-------|------|
| Mobile | React Native (Expo Go) |
| Web | Next.js 15 |
| Backend | Express.js + TypeScript |
| Database | SQLite via Prisma |
| Auth | JWT |
| AI | Rule-based stub (Anthropic API drop-in ready) |

## Project Structure
```
ns1-master/
├── backend/          Express API + Prisma + SQLite
│   ├── prisma/       Schema, migrations, seed scripts
│   ├── scripts/      Demo student listing
│   └── src/          Routes, middleware, lib
├── nextstep-mobile/  React Native (Expo) mobile app
│   └── src/          Screens, navigation, API clients
├── app/              Next.js web app
│   ├── (app)/        Authenticated pages (dashboard, grades, planner, ai, settings)
│   └── login/        Login page
└── lib/              Shared web API client
```
