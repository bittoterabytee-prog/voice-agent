# Sprint Plan

Product delivery roadmap for the AI Voice Appointment Agent POC.  
Use this when **creating, prioritizing, or updating Jira tickets** so work stays in the right sprint.

**Current sprint:** Sprint 2 — Basic Voice Agent  
**Source of truth for backend scope:** [`../backend/SRD_BACKEND.md`](../backend/SRD_BACKEND.md)  
**Ticket format:** [`TICKET_STANDARDS.md`](TICKET_STANDARDS.md)

---

## Roadmap overview

| Sprint | Theme | Status |
| ------ | ----- | ------ |
| **1** | Foundation | ✅ Done |
| **2** | Basic Voice Agent | ← **Now** (active) |
| **3** | Multilingual Voice | Planned |
| **4** | Appointment System | Planned |
| **5** | Human-like Conversation Behavior | Planned |
| **6** | RAG + Tools | Planned |
| **7** | Adaptive Voice + Verification | Planned |
| **8** | 300 Test Scenarios + Final Demo | Planned |

When drafting Jira work: put new tickets in the **current sprint** unless the user explicitly targets a later sprint. Label with sprint theme (`sprint-2`, `voice`, etc.) when the board supports labels.

---

## Sprint 1 — Foundation ✅

**Goal:** Repo, config, database, docs, MCP, and agent rules so later sprints can build safely.

| Area | Outcome | Jira / notes |
| ---- | ------- | ------------ |
| Project + architecture | Express/TS backend layout, architecture docs | Prior foundation tickets |
| Config | Central Zod config (`src/config`) | [KAN-8](https://voiceagentai.atlassian.net/browse/KAN-8) |
| Database | PostgreSQL schema, migrate/seed | migrations + schema docs |
| MCP | Read-only GitHub MCP for agents | [KAN-9](https://voiceagentai.atlassian.net/browse/KAN-9) |
| Process | Ticket standards, branch/PR, backlog | `docs/process/*` |
| Backend SRD knowledge | In-repo product requirements | [`SRD_BACKEND.md`](../backend/SRD_BACKEND.md) |

Do **not** open new Foundation tickets unless something foundational is missing.

---

## Sprint 2 — Basic Voice Agent ← Now

**Goal:** Browser-based English voice loop: mic → STT → LLM → TTS → play, with session context, UI, E2E path, and logging. Not yet multilingual, appointments, wait/barge-in polish, or full RAG.

### Current To Do (active sprint backlog)

| Priority | Ticket | Summary | Owner | Repo / Jira status |
| -------- | ------ | ------- | ----- | ------------------ |
| — | [KAN-10](https://voiceagentai.atlassian.net/browse/KAN-10) | Browser microphone & audio capture | Frontend | Done |
| P0 | [KAN-11](https://voiceagentai.atlassian.net/browse/KAN-11) | Speech-to-text integration | Backend/AI | Done |
| P0 | [KAN-12](https://voiceagentai.atlassian.net/browse/KAN-12) | LLM conversation service | Backend/AI | Done |
| P0 | [KAN-13](https://voiceagentai.atlassian.net/browse/KAN-13) | Text-to-speech integration | Backend/AI | Done |
| P1 | [KAN-15](https://voiceagentai.atlassian.net/browse/KAN-15) | Conversation session & context management | Backend | Done |
| P1 | [KAN-14](https://voiceagentai.atlassian.net/browse/KAN-14) | Real-time voice conversation pipeline | Backend | In Progress |
| P1 | [KAN-16](https://voiceagentai.atlassian.net/browse/KAN-16) | Voice agent UI | Frontend | To Do |
| P2 | [KAN-17](https://voiceagentai.atlassian.net/browse/KAN-17) | End-to-end browser voice conversation | Full Stack | To Do |
| P2 | [KAN-18](https://voiceagentai.atlassian.net/browse/KAN-18) | Voice pipeline logging & error handling | Backend | To Do |
| P2 | [KAN-21](https://voiceagentai.atlassian.net/browse/KAN-21) | Postman collection for HTTP APIs | Backend | Done |

**Suggested order:** KAN-10 → KAN-11 / KAN-12 / KAN-13 → KAN-15 → KAN-14 → KAN-16 → KAN-17, with KAN-18 in parallel after pipeline exists. KAN-21 can land anytime after routes exist.

**Sprint 2 out of scope** (defer to later sprints): Hindi/Hinglish switching, book/cancel/reschedule tools, wait/hold & barge-in productization, RAG corpus, adaptive TTS profiles, 300-scenario suite.

Detail table: [`BACKLOG.md`](BACKLOG.md).

---

## Sprint 3 — Multilingual Voice

**Goal:** English, Hindi, and Hinglish in one session; mid-call language switch without losing context.

Typical tickets (create when Sprint 2 closes):

- Language detection / preference on call + `conversation_states.language`
- Prompt + STT/TTS provider settings for Hindi / Hinglish
- Language-switch flows and tests
- Logging `LANGUAGE_CHANGED` events

---

## Sprint 4 — Appointment System

**Goal:** Backend is source of truth for search, availability, book, cancel, reschedule (with confirmation).

Typical tickets:

- `searchDoctor` / specialty search tools + APIs
- `checkAvailability` (never invent slots)
- `bookAppointment` / `cancelAppointment` / `rescheduleAppointment` + confirmations
- Patient lookup / verification
- Call-event logging for tool success/failure

Align with [`SRD_BACKEND.md`](../backend/SRD_BACKEND.md) §§4–5, 8–9.

---

## Sprint 5 — Human-like Conversation Behavior

**Goal:** Interruptions, wait/hold, background speech ignore, caller return, conversation state machine beyond basic ACTIVE.

Typical tickets:

- Barge-in / interrupt handling
- `USER_REQUESTED_WAIT` → `WAITING_FOR_USER` → return
- Wait timeout configuration
- Persist states + `call_events` for wait/return/interrupt

---

## Sprint 6 — RAG + Tools

**Goal:** Clinic FAQ/policy via RAG; LLM tool-calling loop executing real backend tools.

Typical tickets:

- Knowledge ingest + Qdrant retrieval
- Tool runner (execute OpenAI tool calls → repositories → reply)
- Fail-closed “don’t invent” FAQ behavior
- Human handoff tool (`transferToHuman`)

---

## Sprint 7 — Adaptive Voice + Verification

**Goal:** Voice delivery profiles (speed/tone by context); verification of patient/appointment before mutate; demo-hardening.

Typical tickets:

- Voice delivery profile from conversation cues
- Confirmation gates before book/cancel/reschedule
- Safety / medical-boundary enforcement checks
- Monitoring events for dashboard consumers

---

## Sprint 8 — 300 Test Scenarios + Final Demo

**Goal:** Scenario suite (~300) executed; demo script covering booking, languages, wait/return, failures, handoff.

Typical tickets:

- Scenario catalog + automation where feasible
- Demo runbook
- Gap fixes from failed scenarios
- POC success-criteria checklist (SRD §41 backend slice)

---

## Rules for agents

1. **Default new tickets → Sprint 2** until this doc marks a later sprint as current.
2. Every ticket still needs High-Level Flow, Description, Test Cases, Acceptance Criteria.
3. After creating tickets, update [`BACKLOG.md`](BACKLOG.md) and the sprint table above.
4. When Sprint 2 is complete, flip **Current sprint** to Sprint 3 and move leftover items explicitly.
5. Prefer extending existing KAN keys over duplicating Sprint 2 stories.

## Related docs

- [`BACKLOG.md`](BACKLOG.md)
- [`TICKET_STANDARDS.md`](TICKET_STANDARDS.md)
- [`BRANCH_AND_PR.md`](BRANCH_AND_PR.md)
- [`../backend/SRD_BACKEND.md`](../backend/SRD_BACKEND.md)
- [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md)
