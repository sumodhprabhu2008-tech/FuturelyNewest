# Claude Code — Project Orchestrator

This file is the master configuration for every Claude Code session on this project.
Read it completely before doing any work.

---

## Session Start Protocol

At the start of EVERY new session, before touching any file, ask the user these questions.
Do not skip this — the answers change how you work.

### Question 1 — What are we doing today?
> "What do you want to build, fix, or change today?
> (New feature / bug fix / refactor / review / sprint / something else?)"

Wait for their answer. If it's vague ("work on the app"), ask a clarifying follow-up:
> "Which part — backend, frontend, mobile, AI features, integrations, or infrastructure?"

### Question 2 — What MCP tools do you have active?
> "Are any MCP tools connected right now? For example:
> - **Database tool** — I can query your database directly, verify schema, and check live data
> - **GitHub MCP** — I can create PRs, check CI status, read and comment on issues
> - **Playwright / Browser** — I can open the running app and test UI flows live
> - **Filesystem / Shell** — I already have these built-in via Read, Edit, Write, Bash
>
> Type `/mcp list` in the Claude Code terminal to see what's active.
> If none are connected, I'll flag which ones would most help your current task."

### Question 3 — Are your services running? (ask only if task requires it)
If the task involves backend code or testing:
> "Quick check before I write backend code:
> - Is your database running and reachable?
> - Do you have all required env vars set (DATABASE_URL, API keys, etc.)?
> - Is the local dev server running?
> I'll need these to verify changes work."

---

## Tools That Would Accelerate This Project

If the user hasn't mentioned these, proactively recommend them based on what they're working on:

| Tool | What it unlocks | When to recommend |
|------|----------------|-------------------|
| **Database MCP** | I can directly inspect schema, run queries, verify migrations, and check live data — instead of inferring everything from Prisma schema files | Anytime we're changing the database or debugging data issues |
| **GitHub MCP** | I can create PRs, check CI status, read open issues, and post comments without switching to the browser | Anytime we're near shipping or reviewing code |
| **Playwright / Browser MCP** | I can open the running app and verify UI flows live — not just review code | Anytime we're building or fixing frontend/mobile screens |
| **Expo / React Native MCP** | I can interact with the Expo dev server and get device logs in real time | When debugging mobile-specific issues |

> To add an MCP tool: run `/mcp` in Claude Code or open `.claude/settings.json`.
> I can help you configure any of these if you want to add one.

---

## Mandatory Context: Read Before Every Session

Read these files at the start of every session, in this order:

1. `.claude/context/PROJECT.md` — product vision, current phase, what's in/out of scope
2. `.claude/context/ARCHITECTURE.md` — tech stack, module boundaries, data flows
3. `.claude/context/ENGINEERING_RULES.md` — code standards (apply to all agents, non-negotiable)
4. `.claude/context/COMPLIANCE.md` — regulatory and data-handling requirements (read before any user-data work)
5. `.claude/context/DESIGN_SYSTEM.md` — colors, typography, component standards (frontend/UI work only)

If any context file is missing or noticeably outdated, tell the user before proceeding:
> "The context file [filename] seems missing / hasn't been updated since [date]. 
> Should I update it to reflect the current state of the project before we continue?"

---

## Agent Routing

Use subagents for all substantial implementation work. A "substantial" task is anything touching more than 2 files or requiring a design decision. For single-file, clearly-scoped fixes, handle inline.

Route tasks as follows:

| Task type | Primary agent | Notes |
|-----------|--------------|-------|
| New feature — design & planning | `architect` | Always invoke first |
| Existing feature — architecture question or scope change | `architect` | Before writing any code |
| API routes, DB schema, business logic, background jobs | `backend-engineer` | — |
| Mobile screens, web pages, navigation, data fetching | `frontend-engineer` | — |
| UI components, animations, accessibility audit | `ui-engineer` | After frontend-engineer |
| Third-party API, OAuth, web scraper, sync worker | `integration-engineer` | — |
| AI prompts, LLM calls, structured outputs, fallback logic | `ai-engineer` | — |
| Tests, security review, compliance audit, verdicts | `qa-engineer` | Always last before shipping |
| CI/CD, deployment config, cloud infra, env vars | `devops-engineer` | When infra changes needed |
| Bug triage, design disagreement, final approval | `architect` | Always last for sign-off |

---

## Standard Feature Workflow

For any new feature, follow this sequence. Do not skip steps.

```
1. architect            → design, task breakdown, compliance check
2. backend-engineer     → API routes + database + business logic
3. integration-engineer → external connectors (skip if no third-party integration)
4. ai-engineer          → prompts + LLM calls + validation (skip if not an AI feature)
5. frontend-engineer    → screens + state management + API wiring
6. ui-engineer          → component polish + skeleton states + accessibility
7. qa-engineer          → test suites + security review + compliance audit + verdict
8. devops-engineer      → CI/CD + deploy config (skip if no new infrastructure)
9. architect            → final approval → SHIP
```

Each agent's output must end with a **Handoff Block** (see format below).
If an agent delivers output without a handoff block, ask for it before routing to the next agent.

---

## Handoff Block Format (enforced across all agents)

Every agent output must end with exactly this:

```
---
FILES CHANGED:
- path/to/file.ts (created|modified|deleted)

DEPENDENCIES ADDED:
- package@version (or "none")

MIGRATIONS REQUIRED:
- [describe what the migration does] (or "none")

ENV VARS REQUIRED:
- VAR_NAME=description (or "none")

NEXT AGENT:
- [agent-name]: [specific instruction for what they need to do next]
```

---

## Escalation Rules

| Situation | What to do |
|-----------|------------|
| QA issues a BLOCK verdict | Stop all work immediately. Invoke `architect`. Do not ship anything. |
| Any compliance question (COMPLIANCE.md) | Invoke `architect` for a ruling before writing any code |
| Two agents produce conflicting designs | Invoke `architect` to decide. Document the decision as an ADR. |
| Requirement is ambiguous or unclear | Ask the user to clarify before dispatching any agent |
| A required env var or external service is missing | Ask the user before proceeding — do not stub around it silently |
| Any secret or credential appears in source code | Invoke `qa-engineer` to BLOCK. Invoke `architect` to review. Do not commit. |
| Feature is outside the current phase scope (PROJECT.md) | Flag it to the user and invoke `architect` to approve scope expansion |

---

## What I Track Between Agent Calls

After each agent produces output, I maintain a running context for this session:
- Which agents have run and what they produced
- Current list of files changed
- Any open blockers or REVISE/BLOCK verdicts
- Environment variables that need to be added

If the session gets long, I'll summarize the current state before routing to the next agent so nothing is lost.

---

## Quick Reference: Slash Commands

These commands are available via the `.claude/commands/` folder:

| Command | What it does |
|---------|-------------|
| `/project:new-feature` | Starts the full 9-step workflow for a new feature |
| `/project:diagnose` | Audits the current codebase state and surfaces issues |
| `/project:fix` | Targeted bug fix: identify root cause → fix → verify |
| `/project:sprint` | Plans and executes a batch of features in priority order |
| `/project:review` | Code, security, and compliance review of recent changes |

---

## Project-Specific Notes

> **Add any project-specific context here that doesn't belong in a context file.**
> Examples: known quirks, temporary workarounds, decisions that surprised you, external service limitations.
> Keep each note short. If it grows long, move it to a context file.

- See `.claude/context/PROJECT.md` for current MVP scope and phase
- See `.claude/context/ARCHITECTURE.md` for full tech stack details
- See `.claude/DIAGNOSTIC_REPORT.md` for known integration blockers
