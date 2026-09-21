# Backend Software Requirements (from SRD)

Canonical **backend** requirements for the AI Voice Appointment Agent POC.

**Source:** [Software Requirements Document — AI Voice Appointment Agent](https://docs.google.com/document/d/1bGI6jgH1Plkc328smgSnx6hTI-kzV3XyKLpmrfJ9C_A/edit?usp=sharing) (v1.0 Draft / POC).  
**Scope of this file:** backend APIs, tools, PostgreSQL, conversation state persistence, RAG retrieval contracts, safety, and error handling.  
**Not in this file:** frontend UI, TTS voice acting, telephony provider UX, or dashboard UI (those stay in voice/architecture docs or the separate frontend repo).

When creating or changing **Jira tickets** for backend work, align Description / Test Cases / Acceptance Criteria with this document and [`docs/process/TICKET_STANDARDS.md`](../process/TICKET_STANDARDS.md).

---

## 1. Product purpose (backend view)

Build a real-time multilingual AI receptionist that:

- Understands appointment intents from STT text (English / Hindi / Hinglish).
- Maintains conversation context and explicit conversation state.
- Executes appointment actions **only** through backend tools/APIs backed by PostgreSQL.
- Retrieves clinic FAQ/policy via RAG when available; never invents facts.
- Escalates to a human when required.

This system is **not** a medical diagnosis or treatment system.

**Repo adaptation:** this codebase is a **browser mic POC** (see `PROJECT_RULES.md`). Prefer browser STT/TTS over telephony; backend contracts below still apply.

---

## 2. Actors the backend must support

| Actor | Backend responsibility |
| ----- | ---------------------- |
| Patient / Caller | Persist identity hints (phone/name), appointments, call session |
| AI Voice Agent | Call tools; read/write conversation state and call events |
| Human Receptionist | Receive handoff signal / transfer status on call |
| Clinic Administrator | Data for doctors, schedules, clinic knowledge (seed/RAG) |
| Backend System | Source of truth for patients, doctors, appointments, availability |
| Dashboard User | Consume call/state/tool events (API later; UI elsewhere) |

---

## 3. Backend in-scope capabilities

| Capability | Backend must provide |
| ---------- | -------------------- |
| Appointment booking | Validate → check availability → confirm → persist → return confirmation |
| Cancellation | Locate appointment → policy checks → confirm → update status |
| Rescheduling | Locate → new slot availability → confirm → update |
| Doctor / specialty search | Query doctors by name, specialty, department, preferences |
| Availability | Compute slots from `doctors.working_hours` + existing appointments; **never invent** |
| Patient lookup / verification | By phone / name (and related fields as schema allows) |
| Conversation state | Persist states for wait / resume / handoff / tool execution |
| Call + event logging | `calls`, `call_events` for monitoring and audit |
| RAG retrieval | Controlled knowledge base query; no invented clinic facts |
| Tool calling surface | Functions the LLM may invoke; backend executes and confirms |
| Human handoff | Transition call/conversation to `HUMAN_HANDOFF` / transferred |
| Safety boundaries | Refuse diagnosis/prescription; honest AI identity; no false booking claims |

### Out of scope (backend must not implement)

- Medical diagnosis, advice, prescriptions, medical decision making
- Payment / insurance claim processing
- Full production hospital integration / healthcare compliance suite
- Inventing availability or claiming success without DB/API confirmation

---

## 4. Appointment flows (backend contracts)

### 4.1 Booking

1. Detect intent (agent) → gather specialty / doctor / date / time.
2. `searchDoctor` / specialty search as needed.
3. `checkAvailability` — return real slots only.
4. Offer slots; require explicit user confirmation.
5. `bookAppointment` — persist only after confirmation + successful write.
6. Return confirmation payload (ids, doctor, date, time, status).

Never book because the model “inferred” intent without confirmation.

### 4.2 Cancellation

1. Identify appointment (`getAppointment` / patient + criteria).
2. Verify patient identity fields required by policy.
3. Apply cancellation policy when necessary.
4. Confirm with user → `cancelAppointment` → confirm result.
5. Handle: not found, multiple matches, already cancelled, not permitted, API failure.

### 4.3 Rescheduling

1. Find existing appointment.
2. Collect new date/time.
3. `checkAvailability` for the new slot.
4. Confirm → `rescheduleAppointment` → confirm new booking.
5. When the user changes the time mid-flow, drop the previous candidate and re-check.

### 4.4 Doctor search outcomes

Backend/tool responses should distinguish:

- Found / not found / multiple matches
- Unavailable / on leave
- Preference fields where supported (gender, fee, schedule)

### 4.5 Date / time understanding

Agent + backend should resolve (or return ambiguity for clarification):

- Relative: today, tomorrow, day after, weekday names, next week, weekend
- Parts of day: morning, afternoon, evening, after 5 PM, before lunch, any time
- Specific calendar dates

If ambiguous, **clarify** — do not guess a slot.

---

## 5. Required backend tools / APIs

These are the SRD tool names. Map implementations under `src/tools/` and repositories; HTTP routes may wrap them later.

| Tool (SRD) | Responsibility |
| ---------- | -------------- |
| `getPatient()` | Lookup / verify patient |
| `searchDoctor()` | Name, specialty, department, preferences |
| `checkAvailability()` | Real slots only; suggest alternatives when empty |
| `bookAppointment()` | Create appointment after confirmation |
| `cancelAppointment()` | Cancel with policy + confirmation |
| `rescheduleAppointment()` | Move appointment after availability + confirmation |
| `getAppointment()` | Fetch existing appointment(s) |
| `sendConfirmation()` | Optional notification hook (stub OK in POC) |
| `transferToHuman()` | Mark handoff; update call status |

**Backend owns:** validation, authorization, DB mutations, true success/failure.  
**LLM must not** be treated as source of truth for availability or booking status.

Current repo prep: see [`docs/ai/TOOL_CALLING.md`](../ai/TOOL_CALLING.md) and `src/tools/appointmentTools.ts`.

---

## 6. Conversation state (persist in DB)

SRD states the backend should support over time (subset already in schema):

| State | Meaning |
| ----- | ------- |
| `ACTIVE_CONVERSATION` | Normal dialogue |
| `AGENT_SPEAKING` / `USER_SPEAKING` | Turn ownership (may be event-level) |
| `INTERRUPTED` | Barge-in; abandon/revise prior agent turn |
| `USER_REQUESTED_WAIT` | User asked to hold |
| `WAITING_FOR_USER` | Connected; do not auto-reply to background speech |
| `BACKGROUND_SPEECH` | Non-primary speech while waiting |
| `USER_RETURNED` / `CALLER_RETURNED` | Resume after wait |
| `CHECKING_AVAILABILITY` | Tool in flight |
| `CONFIRMATION_REQUIRED` | Awaiting explicit yes/no before mutate |
| `TOOL_EXECUTION` | Backend tool running |
| `HUMAN_HANDOFF` | Escalated |
| `ERROR_RECOVERY` | Safe failure path |
| `CALL_ENDING` / completed | Graceful close |

Combine with: **intent**, **language**, conversation context, next action.

Schema today: `conversation_states` + `call_events` — see [`docs/database/DATABASE_SCHEMA.md`](../database/DATABASE_SCHEMA.md). Extend via **migrations** only.

### Wait / return (backend implications)

- On wait request → persist `WAITING_FOR_USER` (and related events).
- Preserve prior intent/context across the wait.
- Configurable wait timeout; optional “are you still there?” prompt after timeout.
- Resume on explicit return (“I’m back”) or contextual return (“let’s do 6 PM”) without losing booking context.
- While waiting: do not treat every STT fragment as actionable caller speech (voice layer + state gates).

---

## 7. Knowledge base / RAG (backend)

Controlled corpus may include: clinic hours, doctors/departments, fees, location, parking, cancellation/appointment policy, documents required, payment methods, online consult info, FAQs.

Rules:

- Answer only from retrieved knowledge (or tool data).
- If missing → say information is unavailable; **do not invent**.
- Vector store in this repo: Qdrant (see architecture docs).

---

## 8. Safety & confirmation (backend-enforced)

The backend / tools must make it impossible for the agent to truthfully claim:

- A booking/cancel/reschedule succeeded when the write failed.
- Availability that was not returned by `checkAvailability`.

Also:

- No diagnosis, prescriptions, or treatment decisions.
- Medical emergency / medical decision requests → configured escalation (`transferToHuman` / handoff policy).
- If asked, the agent identifies as an AI assistant (prompt + product rules).
- Confirmations required before mutating appointments.

---

## 9. Error handling (backend)

| Failure | Expected behavior |
| ------- | ----------------- |
| Appointment API / DB failure | Do not claim success; offer retry or human escalation |
| Availability timeout | Retry or escalate |
| Unknown FAQ | Information unavailable |
| Tool validation failure | Ask for missing fields; do not mutate |
| Call disconnect | Persist call status / last state |
| STT/TTS/LLM upstream failure | Fail closed; no secret leakage |

---

## 10. Data model (SRD ↔ this repo)

| SRD entity | Repo table / notes |
| ---------- | ------------------ |
| Patient | `patients` |
| Doctor | `doctors` (`working_hours` JSONB) |
| Appointment | `appointments` + `appointment_status` |
| KnowledgeDocument | RAG / Qdrant (not a primary SQL table today) |
| Call | `calls` |
| ConversationState | `conversation_states` |
| CallEvent | `call_events` |

---

## 11. Non-functional (backend)

- **Latency:** aim ~1–2s conversational turn where achievable (STT + LLM + tools + TTS dominate).
- **Reliability:** graceful handling of API/network/tool/DB failures.
- **Security:** secrets in env only; validate inputs; minimize PII in logs; no keys in responses.
- **Extensibility:** more clinics, doctors, languages, tools without rewriting core contracts.

---

## 12. Human handoff triggers

Backend should support transitioning to handoff when:

- User requests a human
- Request cannot be resolved
- Repeated misunderstanding / high frustration
- Outside POC scope
- Backend failure blocks safe completion
- Medical emergency / medical decision request detected

Persist `HUMAN_HANDOFF` / call `TRANSFERRED` (or equivalent) and emit call events.

---

## 13. Test scenario suites (backend-relevant)

SRD targets ~300 scenarios overall. When writing backend tickets/tests, prioritize suites that hit APIs/tools/DB:

| Suite | Approx. count (SRD) | Backend focus |
| ----- | ------------------- | ------------- |
| Patient registration / verification | 20 | Patient lookup APIs |
| Doctor search | 20 | `searchDoctor` |
| Appointment booking | 35 | book + confirm |
| Date & time handling | 25 | parsing + clarification |
| Availability & alternatives | 20 | real slots only |
| Cancellation | 15 | cancel paths |
| Rescheduling | 20 | reschedule paths |
| Clinic FAQ / RAG | 25 | retrieval, no invention |
| API / tool failures | 15 | fail closed |
| Safety & medical boundaries | 15 | refusal + escalation |
| Human escalation | 10 | handoff state |
| Wait / return / interruption | (voice-heavy) | state persistence + events |

Scenario format for tickets/tests: Scenario ID, description, initial state, user input, expected intent/state/action/language/result.

Representative SRD cases TC-001…TC-020 (booking, mind-change, Hinglish, no availability, API failure, wait/return, medical refusal, etc.) should map into `tests/` and Jira Test Cases where they touch backend behavior.

---

## 14. Success criteria (backend slice)

- Booking, cancel, and reschedule succeed only via confirmed tool/DB results.
- Availability never invented.
- Failed tools never reported as success.
- Conversation state persisted for wait / return / handoff.
- RAG does not invent clinic facts.
- Human handoff state is recorded.
- Call/tool events available for monitoring.

---

## 15. How agents should use this doc

1. **Before coding:** read this + `PROJECT_RULES.md` + relevant `docs/backend/*` and schema.
2. **Creating/updating Jira:** derive High-Level Flow, Description, Test Cases, and Acceptance Criteria from the matching sections above; link this file in the ticket. Place tickets in the **current sprint** per [`../process/SPRINT_PLAN.md`](../process/SPRINT_PLAN.md).
3. **MCP / GitHub:** this file lives in-repo so agents do not need the Google Doc re-shared for backend scope.
4. **Conflicts:** if implementation docs (`ARCHITECTURE.md`, schema, API docs) differ from the Google Doc, prefer **repo docs + migrations + source** for “what exists today,” and use this SRD for “what to build next.” Update this file when product requirements change.

## Related docs

- [`BACKEND_STRUCTURE.md`](BACKEND_STRUCTURE.md)
- [`API_DOCUMENTATION.md`](API_DOCUMENTATION.md)
- [`SERVICES.md`](SERVICES.md)
- [`../database/DATABASE_SCHEMA.md`](../database/DATABASE_SCHEMA.md)
- [`../ai/TOOL_CALLING.md`](../ai/TOOL_CALLING.md)
- [`../process/TICKET_STANDARDS.md`](../process/TICKET_STANDARDS.md)
- [`../../PROJECT_RULES.md`](../../PROJECT_RULES.md)
