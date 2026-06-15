# NextStep Agent Team — Workflow Guide

## Team Roster

| Agent | File | Owns |
|-------|------|------|
| Lead Architect | `agents/lead-architect.md` | System design, task breakdown, code review, final approval |
| Backend Engineer | `agents/backend.md` | NestJS API, Prisma, Firebase Auth, GPA logic |
| Frontend Engineer | `agents/frontend.md` | React Native screens, RTK Query, navigation |
| UI Design System Engineer | `agents/ui.md` | Components, styling, animations, accessibility |
| School Systems Integration | `agents/integration.md` | Canvas, Google Classroom, HAC, Skyward, PowerSchool |
| AI Engineer | `agents/ai-engineer.md` | Prompts, LLM calls, smart planner, GPA predictions |
| QA & Security Engineer | `agents/qa.md` | Tests, security review, FERPA/COPPA audit, verdicts |
| DevOps Engineer | `agents/devops.md` | CI/CD, AWS, EAS Build, secrets, monitoring |

---

## The Standard Feature Workflow

Every new feature follows this sequence. Do not skip steps.

```
1. ARCHITECT  →  Design + task breakdown
2. BACKEND    →  API routes + data models
3. INTEGRATION (if school data needed)  →  Sync worker
4. AI ENGINEER (if AI feature)  →  Prompts + AI service
5. FRONTEND   →  Screens + API wiring
6. UI         →  Component polish + accessibility
7. QA         →  Tests + security review + verdict
8. DEVOPS     →  Deploy config (if new infra needed)
9. ARCHITECT  →  Final approval
```

---

## How to Invoke Each Agent (copy-paste prompts)

### Step 1 — Architect: Design a feature
```
Act as Lead Architect for NextStep.

Read: .claude/context/PROJECT.md, ARCHITECTURE.md, ENGINEERING_RULES.md, COMPLIANCE.md

Feature request: [describe the feature]

Provide:
- Architecture decision (data models, API contracts)
- Task breakdown per agent
- Risks and compliance considerations
- What must exist before work starts
```

### Step 2 — Backend: Implement API
```
Act as Backend Engineer for NextStep.

Read: .claude/context/ARCHITECTURE.md, ENGINEERING_RULES.md, COMPLIANCE.md

Implement this feature based on the Architect's design:
[paste Architect output]

Deliver: NestJS controllers, services, DTOs, Prisma schema changes.
All ENGINEERING_RULES.md standards apply. Include handoff block.
```

### Step 3 — Integration: School system connector (if needed)
```
Act as School Systems Integration Engineer for NextStep.

Read: .claude/context/COMPLIANCE.md, ARCHITECTURE.md, ENGINEERING_RULES.md

Build the [HAC | Canvas | Skyward | PowerSchool] integration worker for:
[describe what data is needed]

Backend API context:
[paste relevant Backend output]

Deliver: worker processor, connector class, normalized schema. Include handoff block.
```

### Step 4 — AI Engineer: AI feature (if needed)
```
Act as AI Engineer for NextStep.

Read: .claude/context/PROJECT.md, COMPLIANCE.md, ENGINEERING_RULES.md

Implement the AI feature: [describe feature]

Backend schema context:
[paste relevant Backend output]

Deliver: prompt template, Zod validation schema, AI service method, fallback logic.
Include handoff block.
```

### Step 5 — Frontend: Build screens
```
Act as Frontend Engineer for NextStep.

Read: .claude/context/ARCHITECTURE.md, DESIGN_SYSTEM.md, ENGINEERING_RULES.md

Build the React Native screens for: [feature name]

Backend API contracts:
[paste Backend output — endpoints, request/response shapes]

AI feature context (if applicable):
[paste AI Engineer output]

Deliver: screens, RTK Query slices, navigation wiring. Include handoff block.
```

### Step 6 — UI: Polish components
```
Act as UI Design System Engineer for NextStep.

Read: .claude/context/DESIGN_SYSTEM.md, ENGINEERING_RULES.md

Polish and complete the UI for: [feature name]

Frontend output to polish:
[paste Frontend output]

Deliver: refined components, skeleton screens, empty/error states, accessibility pass.
Include handoff block.
```

### Step 7 — QA: Test and audit
```
Act as QA & Security Engineer for NextStep.

Read: .claude/context/COMPLIANCE.md, ENGINEERING_RULES.md

Review and test the complete feature: [feature name]

All agent outputs to review:
[paste Backend + Integration + AI + Frontend + UI outputs]

Deliver: test suite, security findings, compliance audit, PASS/REVISE/BLOCK verdict.
Include handoff block.
```

### Step 8 — DevOps: Deploy config (if new infra)
```
Act as DevOps Engineer for NextStep.

Read: .claude/context/ARCHITECTURE.md, COMPLIANCE.md

Set up deployment for: [feature name]

New infrastructure needed:
[describe: new env vars, new AWS resources, new build config]

Deliver: GitHub Actions workflow changes, EAS config, AWS config, env var documentation.
Include handoff block.
```

### Step 9 — Architect: Final review
```
Act as Lead Architect for NextStep.

Final review for feature: [feature name]

All agent outputs:
[paste all relevant outputs]

QA verdict: [PASS/REVISE/BLOCK]

Issue final approval or list blockers.
```

---

## Escalation Rules

| Situation | Action |
|-----------|--------|
| QA issues BLOCK verdict | Stop all work. Lead Architect reviews. Do not ship. |
| Compliance question (FERPA/COPPA) | Ask Lead Architect before writing any code |
| Two agents disagree on design | Lead Architect decides. Document the decision. |
| School credential handling question | Always: Secrets Manager. No exceptions. |
| AI output seems inaccurate | AI Engineer adds Zod validation + rule-based fallback. Always. |

---

## Quick Reference: What Each Agent Does NOT Touch

| Agent | Hard Boundaries |
|-------|----------------|
| Backend | No React Native, no UI components |
| Frontend | No API handlers, no DB queries, no business logic |
| UI | No API calls, no state management, no navigation logic |
| Integration | No direct DB writes, no API handlers, no frontend |
| AI Engineer | No DB schema, no frontend, no model training on student data |
| QA | No feature code, no fixes — reports only |
| DevOps | No application code |

---

## Context Files Quick Reference

| File | When to read |
|------|-------------|
| `PROJECT.md` | Every session — product scope, MVP features |
| `ARCHITECTURE.md` | Before any code — module boundaries, tech stack |
| `ENGINEERING_RULES.md` | Before every output — quality standards |
| `DESIGN_SYSTEM.md` | Frontend + UI agents — every time |
| `COMPLIANCE.md` | Before ANY student data code — non-negotiable |
