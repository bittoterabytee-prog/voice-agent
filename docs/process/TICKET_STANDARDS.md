# Jira Ticket Writing Standards

When creating or updating work items for the AI Voice Agent (backend or frontend), every ticket **must** include the four sections below. Incomplete tickets should be rejected in review.

## Required sections

### 1. High-Level Flow

A short ASCII or mermaid-style flow showing the main path (user/system steps). Keep it to the happy path plus one critical branch if needed.

### 2. Description / Purpose

- What problem this solves
- Scope (in / out)
- Owner layer: `Frontend` | `Backend` | `Backend/AI` | `Full Stack`
- Dependencies on other tickets or systems
- Links to relevant docs (`ARCHITECTURE.md`, `SYSTEM_FLOW.md`, `docs/...`)

### 3. Test Cases

Numbered Given / When / Then cases (TC-001…). Cover:

- Happy path
- Missing/invalid input
- Failure of external dependency (STT/LLM/TTS/network)
- Security / no secret leakage where relevant

### 4. Acceptance Criteria

Checklist of observable outcomes. Prefer measurable “done” statements over vague intent.

## Optional but recommended

- Definition of Done (1 short paragraph)
- Labels: `frontend`, `backend`, `ai`, `voice`, `fullstack`
- Link related tickets (blocked-by / relates-to)

## Template (copy into Jira description)

```markdown
## Purpose
<1–3 sentences. Owner: Frontend | Backend | Backend/AI | Full Stack>

## Scope
- In: ...
- Out: ...

## High-Level Flow
\`\`\`
Step A
  │
  ▼
Step B
  │
  ▼
Step C
\`\`\`

## Dependencies
- ...

## Test Cases

### TC-001 — <name>
Given: ...
When: ...
Then: ...

### TC-002 — <name>
Given: ...
When: ...
Then: ...

## Acceptance Criteria
- [ ] ...
- [ ] ...

## Definition of Done
<one paragraph>
```

## Rules for agents creating tickets

1. Do **not** create bare titles without the four sections.
2. Match flows to the real architecture (browser mic POC; no telephony unless explicitly requested).
3. Backend tickets reference `src/` paths; frontend tickets belong to the **separate frontend repo** but may still be tracked on the same Jira board.
4. **Backend product scope** comes from [`docs/backend/SRD_BACKEND.md`](../backend/SRD_BACKEND.md) (appointment tools, state, RAG, safety, error handling). Derive ticket Description / Test Cases / Acceptance Criteria from the matching SRD sections; link that doc in the ticket. When updating an existing backend ticket, re-check it against the SRD so scope does not drift.
5. After creating tickets, add key IDs to [`docs/process/BACKLOG.md`](BACKLOG.md) and mention them in `ARCHITECTURE.md` when they become active work.
6. Prefer Story work type unless the board standard says otherwise.
7. Implementation follows [`BRANCH_AND_PR.md`](BRANCH_AND_PR.md): confirm ticket key → named branch → PR on push.
8. Implementers must **check ticket test cases**, **add/update automated tests**, and **update knowledge docs** for the change ([`TESTING_STRATEGY.md`](../testing/TESTING_STRATEGY.md)).

## Related docs

- [`BRANCH_AND_PR.md`](BRANCH_AND_PR.md)
- [`../backend/SRD_BACKEND.md`](../backend/SRD_BACKEND.md)
- [`ARCHITECTURE.md`](../../ARCHITECTURE.md)
- [`SYSTEM_FLOW.md`](../../SYSTEM_FLOW.md)
- [`PROJECT_RULES.md`](../../PROJECT_RULES.md)
