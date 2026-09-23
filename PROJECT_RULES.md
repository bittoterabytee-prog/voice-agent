# Project Rules

Rules for humans and AI agents working on the AI Voice Agent POC.

1. **Backend is the source of truth for appointment availability.**
2. **AI must never invent appointment availability.** Always call backend/tool APIs that query PostgreSQL.
3. **AI must never claim an appointment was booked** unless the booking API/repository confirms success.
4. **Conversation state must be persisted** in `conversation_states` (and related `call_events`) where required for resume/wait/handoff behavior.
5. **Medical diagnosis is outside the scope of the agent.** The agent may help with scheduling and clinic FAQs only.
6. **The agent must identify itself as an AI assistant** if asked.
7. **Never expose API keys or secrets.** Do not commit `.env`, tokens, or credentials. Use `.env.example` placeholders only.
8. **Do not modify the database schema without a migration** under `migrations/`.
9. **External integrations must be isolated** behind service modules (`src/ai`, `src/voice`, `src/integrations`, `src/tools`).
10. **All new features must include test scenarios** under `tests/`.
11. **This POC is browser-based.** Prefer browser microphone + STT/TTS. Do not require telephony/phone-carrier credentials.
12. **Configuration is centralized.** Application code reads `getConfig()` / `loadConfig()` — do not scatter `process.env` reads.
13. **When architectural behavior changes**, update the matching docs under `docs/` and root `ARCHITECTURE.md` / `SYSTEM_FLOW.md`.
14. **MCP GitHub access is read-only by default.** Configure MCP only via the shared knowledge repo https://github.com/bittoterabytee-prog/voice-agent-knowledge — do not re-add project-level MCP under this backend folder unless the team agrees.
15. **New Jira tickets must include** High-Level Flow, Description, Test Cases, and Acceptance Criteria — see [`docs/process/TICKET_STANDARDS.md`](docs/process/TICKET_STANDARDS.md). Backend tickets must align with [`docs/backend/SRD_BACKEND.md`](docs/backend/SRD_BACKEND.md). Place tickets in the **current sprint** from [`docs/process/SPRINT_PLAN.md`](docs/process/SPRINT_PLAN.md).
16. **Before implementing, confirm the Jira ticket key** (ask if missing). Use branch names `feat/{title}`, `fix/{title}`, or `bugfix/{title}` (include the ticket key in the branch). When pushing, **open a PR** — see [`docs/process/BRANCH_AND_PR.md`](docs/process/BRANCH_AND_PR.md).
17. **Every change must cover tests and knowledge:**
    - Read and satisfy the ticket’s **Test Cases** and **Acceptance Criteria**.
    - **Add or update automated tests** under `tests/` for the behavior you change (do not ship code without tests when behavior is testable).
    - **Update project knowledge** (`docs/`, `ARCHITECTURE.md`, `SYSTEM_FLOW.md`, `PROJECT_RULES.md`, process docs) so docs match the implementation.
    - **When HTTP routes change**, update the Postman collection (`postman/`) with Success/Fail examples — [`docs/process/POSTMAN.md`](docs/process/POSTMAN.md).
    - See [`docs/testing/TESTING_STRATEGY.md`](docs/testing/TESTING_STRATEGY.md) and [`docs/process/BRANCH_AND_PR.md`](docs/process/BRANCH_AND_PR.md).

See also: [`docs/`](docs/), [`ARCHITECTURE.md`](ARCHITECTURE.md), [`SYSTEM_FLOW.md`](SYSTEM_FLOW.md).
