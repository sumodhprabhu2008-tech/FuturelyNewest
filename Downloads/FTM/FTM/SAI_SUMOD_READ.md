# How the Agentic Setup Works — Read This First

---

## The Short Version

You describe what you want. I figure out which agents to use and run them.
You don't need to manage agents, copy-paste between them, or say magic words.

---

## What Was Built

Your project now has a real multi-agent system with 8 specialized agents:

| Agent | What it owns |
|-------|-------------|
| `architect` | Designs features, reviews output, gives final approval |
| `backend-engineer` | API routes, database schema, business logic |
| `frontend-engineer` | Mobile screens, web pages, navigation, data fetching |
| `ui-engineer` | Components, animations, skeleton states, accessibility |
| `integration-engineer` | External APIs, OAuth flows, scrapers, sync workers |
| `ai-engineer` | Prompts, LLM calls, structured output schemas, fallbacks |
| `qa-engineer` | Tests, security review, compliance audit, PASS/REVISE/BLOCK |
| `devops-engineer` | CI/CD, deployment, cloud infra, secrets management |

These live in `.claude/agents/`. Each one has a focused system prompt and gets its own isolated context window when spawned — they are not roleplays of a single Claude session. They are real subagents.

---

## How It Actually Works

When you tell me what you want, here is the actual execution path:

```
You say what you want
        ↓
I read CLAUDE.md (loaded every session automatically)
        ↓
I decide which agents are needed and in what order
        ↓
I spawn each agent as a real isolated subagent
  → Each gets its own context window
  → Each gets the relevant .claude/agents/*.md as its system prompt
  → Each reads the context files it needs (.claude/context/*.md)
        ↓
I pass outputs between agents (backend → frontend, etc.)
        ↓
I return the final result and tell you what manual steps remain
```

You are never in the middle of this chain. I orchestrate everything.

---

## How to Use It — Just Talk to Me

The most efficient way to use this setup is to describe what you want in plain English.

**Building a new feature:**
> "Add push notifications that fire when an assignment is due in 24 hours"

**Fixing a bug:**
> "The login screen shows a blank page after a correct password — the redirect to /dashboard never fires"

**Reviewing the codebase:**
> "Do a security review of the recent changes before I open a PR"

**Running a sprint:**
> "This week I want to finish the parent dashboard, fix the grade sync 403, and add the AI chat. Do them in the right order."

I read your request, route to the right agents, and make the changes. You do not need to say "act as backend-engineer" or manage handoffs yourself.

---

## What the `/project:` Commands Are (and When to Use Them)

Files in `.claude/commands/` become slash commands. They are **not required**. They are saved workflow templates — structured prompts that ensure consistency on common tasks.

| Command | When it's useful |
|---------|-----------------|
| `/project:new-feature [description]` | Guarantees the full 9-step workflow runs: architect design → implementation → QA → approval |
| `/project:fix [description]` | Structured bug fix: root cause first, then minimal fix, then verify |
| `/project:sprint [list of features]` | Batches multiple features efficiently so agents don't context-switch |
| `/project:diagnose` | Systematic codebase audit — runs every checklist, not just what you thought to ask about |
| `/project:review` | Pre-PR security and compliance review — every checkbox, guaranteed |

**When to use them:** Anytime you want a guaranteed, repeatable process — especially before shipping or doing a big sprint.

**When to skip them:** Most of the time. Just describe what you want. I'll figure out the right workflow.

---

## The Standard Feature Workflow (what I run internally)

When a new feature is needed, agents run in this order. Steps are skipped if not relevant to the feature.

```
1. architect            → design, task breakdown, compliance check
2. backend-engineer     → API + database + business logic
3. integration-engineer → external connectors (if feature needs a third-party API or scraper)
4. ai-engineer          → prompts + LLM calls (if feature uses AI)
5. frontend-engineer    → screens + state + API wiring
6. ui-engineer          → component polish + skeleton screens + accessibility
7. qa-engineer          → tests + security review + compliance audit + verdict
8. devops-engineer      → CI/CD + deploy config (if new infrastructure needed)
9. architect            → final approval
```

The `qa-engineer` issues one of three verdicts:
- **PASS** — ready to ship
- **REVISE** — specific issues to fix, agent is routed back to fix them
- **BLOCK** — security or compliance violation, nothing ships until resolved

---

## What Is Still Manual (your two responsibilities)

After agents produce output, two things require you:

**1. Run database migrations**
The backend agent will tell you exactly when and what to run:
```bash
npx prisma migrate dev
```

**2. Add environment variables**
The agents always list exactly which env vars are new. You paste them into `.env.local`:
```
NEW_VAR_NAME=your_value_here
```

Everything else — file edits, code generation, wiring between layers, tests, compliance checks — the agents handle.

---

## How to Write Good Requests

The more specific you are, the faster and more accurate the agents are.

**Include:**
- Which file, screen, or route you're talking about
- What it should do (not just what's broken)
- Any constraints (don't change the DB schema, use the existing Button component)

| Bad | Good |
|-----|------|
| "Fix the login" | "The login screen at `app/login/page.tsx` shows a blank screen after correct password — the token is set but the redirect to `/dashboard` never fires" |
| "Add AI" | "Wire the `/api/ai` stub in `backend/src/routes/ai.ts` to the real Claude API — anonymize the input, add Zod validation on the output, and fall back to a rule-based message if the API call fails" |
| "Something's slow" | "The dashboard takes 4+ seconds to load on first open — it feels like the grade fetch and planner fetch are running sequentially instead of in parallel" |

---

## Where Everything Lives

```
.claude/
├── agents/          ← The 8 agent definitions (system prompts + routing descriptions)
│   ├── lead-architect.md
│   ├── backend-engineer.md
│   ├── frontend-engineer.md
│   ├── ui-engineer.md
│   ├── integration-engineer.md
│   ├── ai-engineer.md
│   ├── qa-engineer.md
│   └── devops-engineer.md
├── commands/        ← Slash command workflows (optional shortcuts)
│   ├── new-feature.md
│   ├── fix.md
│   ├── sprint.md
│   ├── diagnose.md
│   └── review.md
└── context/         ← Project knowledge (read by agents every session)
    ├── PROJECT.md          ← What you're building, current phase, roadmap
    ├── ARCHITECTURE.md     ← Tech stack, module structure, data flows
    ├── ENGINEERING_RULES.md ← Code standards (non-negotiable)
    ├── DESIGN_SYSTEM.md    ← Colors, typography, component standards
    ├── COMPLIANCE.md       ← FERPA/COPPA rules for student data
    └── AGENT_WORKFLOW.md   ← Team workflow reference

CLAUDE.md            ← Master orchestrator (loaded every session, runs session-start questions)
```

---

## The One Rule

**Just describe what you want. Be specific about the file, the symptom, and any constraints. I handle the rest.**
