# NextStep — Architecture

## System Overview

```
[ React Native Mobile App ]
         │
         ▼
[ REST API / NestJS on Node.js ]
         │
    ┌────┴────┐
    ▼         ▼
[PostgreSQL] [Firebase Auth]
    │
    ▼
[AWS S3 — file storage]
    │
    ▼
[AI Layer — Claude / OpenAI API]
```

## Frontend
- **Framework:** React Native (Expo managed workflow)
- **Platform:** iOS + Android (single codebase)
- **State:** Redux Toolkit + RTK Query
- **Styling:** NativeWind (Tailwind for React Native)
- **Push Notifications:** Firebase Cloud Messaging (FCM)
- **Navigation:** React Navigation v6
- **Auth UI:** Firebase Auth (Google, Apple, email/password)

## Backend
- **Runtime:** Node.js with NestJS (TypeScript-first, module-based)
- **API Style:** REST (JSON). GraphQL only if complexity demands it later.
- **Auth:** Firebase Auth tokens validated server-side via Firebase Admin SDK
- **Session:** JWT with short expiry + refresh token rotation
- **Input Validation:** class-validator + class-transformer on all DTOs
- **Rate Limiting:** Express-rate-limit on all public endpoints

## Database
- **Primary DB:** PostgreSQL (Supabase-hosted for managed infra + row-level security)
- **ORM:** Prisma (type-safe schema + migrations)
- **Real-time:** Supabase Realtime for planner sync (fallback: polling)
- **File Storage:** AWS S3 (transcripts, report cards) — presigned URLs only, never public
- **Cache:** Redis (upstash) for GPA computation results and session data

## AI Layer
- **LLM:** Claude API (Anthropic) or OpenAI GPT-4o — prompt-based features
- **Features powered by AI:**
  - Smart Planner task organization
  - GPA "what-if" narrative explanations
  - College readiness predictions (rule-based + LLM hybrid)
  - Course recommendations (9th–12th grade roadmap)
  - Background scraping agent (Canvas/HAC data extraction)
- **AI runs server-side only** — no API keys in client

## School System Integrations
| System | Method | Notes |
|--------|--------|-------|
| Canvas LMS | Official REST API | OAuth 2.0, assignment sync |
| Google Classroom | Google API | OAuth 2.0, assignment sync |
| PowerSchool | REST API (if district enables) | Grades, transcripts |
| Skyward | API or secure server-side scraping | Varies by district |
| HAC (Home Access Center) | Secure server-side scraping | Session-based auth |

**Integration Strategy:** All school system auth tokens stored encrypted server-side. Never transmitted to client. Scraping runs in isolated worker processes with rate limiting and retry logic.

## Infrastructure & DevOps
- **Cloud:** AWS (primary) + Google Cloud (Firebase services)
- **CI/CD:** GitHub Actions → Expo EAS Build (mobile) + AWS App Runner / Railway (backend)
- **Monitoring:** Sentry (errors), Mixpanel (product analytics), Datadog (infra)
- **Secrets:** AWS Secrets Manager / Doppler
- **Environments:** `development` | `staging` | `production`

## Key Module Boundaries
```
src/
  modules/
    auth/           # Firebase auth, JWT, consent flow
    grades/         # Grade Viewer, transcript parsing, HAC/Skyward/PS integration
    gpa/            # GPA calculator, what-if simulator, predictions
    planner/        # Smart Planner, Canvas/GClassroom sync, AI task organization
    roadmap/        # Course suggestions, graduation tracking, college prep
    ai/             # Prompt engineering, LLM calls, recommendation engine
    users/          # Student profiles, settings, premium status
    notifications/  # FCM push, email reminders
    integrations/   # School system connectors (isolated workers)
    compliance/     # FERPA/COPPA consent tracking, audit logs
```

## Data Flow: Grade Sync
```
Student authenticates with school portal credentials
→ Credentials encrypted, stored in Secrets Manager
→ Integration worker runs on schedule (or on-demand)
→ Fetches grades from HAC/Skyward/PowerSchool
→ Parses, normalizes to internal schema
→ Stores in PostgreSQL (student_grades table, RLS enforced)
→ Triggers GPA recalculation job
→ Pushes updated data to client via Supabase Realtime
```

## Security Constraints
- All student data encrypted at rest (AES-256) and in transit (TLS 1.3)
- No student PII in logs — use anonymized IDs only
- Row-level security on all Supabase tables (students see only their own data)
- School credentials stored in AWS Secrets Manager — never in DB plaintext
- FERPA audit log: every data access event recorded
- COPPA gate: age verification + parental consent flow before any data collection for users under 13
