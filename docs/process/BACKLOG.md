# Product backlog (by sprint)

Stories follow [`TICKET_STANDARDS.md`](TICKET_STANDARDS.md).  
**Sprint roadmap:** [`SPRINT_PLAN.md`](SPRINT_PLAN.md) — **current = Sprint 2 (Basic Voice Agent)**.

Frontend work lives in the **separate frontend repository**; backend work in this repo (`voice-agent`).

---

## Sprint 1 — Foundation ✅

Complete: config, DB, MCP, architecture/process docs, backend SRD knowledge. See [`SPRINT_PLAN.md`](SPRINT_PLAN.md).

| Summary | Jira |
| ------- | ---- |
| Centralized config | [KAN-8](https://voiceagentai.atlassian.net/browse/KAN-8) |
| MCP setup | [KAN-9](https://voiceagentai.atlassian.net/browse/KAN-9) |

---

## Sprint 2 — Basic Voice Agent ← Now (To Do)

| # | Summary | Owner | Status | Jira |
| - | ------- | ----- | ------ | ---- |
| 7 | Implement Browser Microphone & Audio Capture | Frontend | Done | [KAN-10](https://voiceagentai.atlassian.net/browse/KAN-10) |
| 8 | Implement Speech-to-Text Integration | Backend/AI | In progress | [KAN-11](https://voiceagentai.atlassian.net/browse/KAN-11) |
| 9 | Implement LLM Conversation Service | Backend/AI | To Do → move In Progress when coding | [KAN-12](https://voiceagentai.atlassian.net/browse/KAN-12) (`feat/KAN-12-llm-conversation-service`) |
| 10 | Implement Text-to-Speech Integration | Backend/AI | To Do | [KAN-13](https://voiceagentai.atlassian.net/browse/KAN-13) |
| 11 | Implement Real-Time Voice Conversation Pipeline | Backend | To Do | [KAN-14](https://voiceagentai.atlassian.net/browse/KAN-14) |
| 12 | Implement Conversation Session & Context Management | Backend | To Do | [KAN-15](https://voiceagentai.atlassian.net/browse/KAN-15) |
| 13 | Implement Voice Agent UI | Frontend | To Do | [KAN-16](https://voiceagentai.atlassian.net/browse/KAN-16) |
| 14 | Implement End-to-End Browser Voice Conversation | Full Stack | To Do | [KAN-17](https://voiceagentai.atlassian.net/browse/KAN-17) |
| 15 | Add Voice Pipeline Logging & Error Handling | Backend | To Do | [KAN-18](https://voiceagentai.atlassian.net/browse/KAN-18) |

**Epic (Sprint 2 container):** Create Epic **Sprint 2 — Basic Voice Agent** in Jira and set Parent on KAN-10–KAN-18 (label `sprint-2`). Until then, treat those keys as the active sprint To Do set per this doc.

**Dependency order:** **KAN-10 → KAN-11/12/13 → KAN-15 → KAN-14 → KAN-16 → KAN-17**, with **KAN-18** in parallel once the pipeline exists.

Each ticket includes: **Purpose/Description**, **High-Level Flow**, **Test Cases**, **Acceptance Criteria** (plus Scope / Dependencies / Definition of Done).

**Jira board action:** keep KAN-10–KAN-18 on the **active Sprint 2** board as To Do / In Progress (KAN-11 Done; KAN-12 In Progress). Do not pull Sprint 3–8 themes into Sprint 2.

---

## Later sprints (planned — do not start unless requested)

| Sprint | Theme | Ticket status |
| ------ | ----- | ------------- |
| 3 | Multilingual Voice | Not created yet — draft from [`SPRINT_PLAN.md`](SPRINT_PLAN.md) when Sprint 2 ends |
| 4 | Appointment System | Not created yet |
| 5 | Human-like Conversation Behavior | Not created yet |
| 6 | RAG + Tools | Not created yet |
| 7 | Adaptive Voice + Verification | Not created yet |
| 8 | 300 Test Scenarios + Final Demo | Not created yet |

When creating those tickets, follow [`TICKET_STANDARDS.md`](TICKET_STANDARDS.md) + [`../backend/SRD_BACKEND.md`](../backend/SRD_BACKEND.md) and register keys here.
