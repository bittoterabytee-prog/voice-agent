# Architecture Overview

High-level architecture for the **AI Voice Agent** browser-based POC.

Related tickets: [KAN-5](https://voiceagentai.atlassian.net/browse/KAN-5), [KAN-7](https://voiceagentai.atlassian.net/browse/KAN-7), [KAN-8](https://voiceagentai.atlassian.net/browse/KAN-8), [KAN-9](https://voiceagentai.atlassian.net/browse/KAN-9). Voice conversation backlog: [`docs/process/BACKLOG.md`](docs/process/BACKLOG.md) (KAN-10–KAN-18).

## Stack

| Layer | Technology |
| ----- | ---------- |
| Runtime | Node.js 20+, TypeScript |
| HTTP API | Express |
| Primary DB | PostgreSQL 16 |
| Vector DB (RAG) | Qdrant (Docker) |
| Config | Zod-validated env via `src/config` |
| Voice | Browser mic → STT / TTS (stubs; no telephony) |
| LLM | Provider-agnostic stub in `src/ai` |

## Component diagram

```
┌──────────────────┐      HTTP / WS (CORS)       ┌─────────────────────┐
│ Browser frontend │ ─────────────────────────► │ Express backend     │
│ (separate repo)  │                            │ src/app.ts          │
└────────┬─────────┘                            └──────────┬──────────┘
         │ mic / audio                                     │
         ▼                                                 ▼
┌──────────────────┐                            ┌─────────────────────┐
│ STT / TTS        │◄── getConfig().stt/tts ────│ Services / Tools    │
│ src/voice/*      │                            │ conversation, call, │
└──────────────────┘                            │ appointment tools   │
                                                └──────────┬──────────┘
                                                           │
                     ┌─────────────────────────────────────┼────────────────┐
                     ▼                                     ▼                ▼
              ┌────────────┐                        ┌────────────┐   ┌────────────┐
              │ PostgreSQL │                        │ LLM stub   │   │ Qdrant     │
              │ patients,  │                        │ src/ai     │   │ VECTOR_DB  │
              │ doctors,   │                        └────────────┘   └────────────┘
              │ appointments,
              │ calls, conversation_states,
              │ call_events
              └────────────┘
```

## Responsibility map (where to look)

| Question | Primary location |
| -------- | ---------------- |
| How does config load? | `src/config/index.ts` |
| Health / HTTP entry | `src/app.ts`, `src/routes/health.ts` |
| Call lifecycle | `src/services/callService.ts`, `src/repositories/callRepository.ts` |
| Conversation turns (in-memory) | `src/conversation/conversationService.ts` |
| Conversation state machine (DB) | `src/models/conversationState.ts`, `src/repositories/conversationStateRepository.ts` |
| Appointment persistence | `src/repositories/appointmentRepository.ts` |
| Appointment agent tool | `src/tools/appointmentTools.ts` |
| LLM | `src/ai/llmService.ts` |
| Browser voice / STT / TTS | `src/voice/` |
| Schema | `migrations/001_init.sql` |

> **Frontend** lives in a **separate repository**. This backend repo does not contain UI code.

## Design principles

- Backend APIs and PostgreSQL are the **source of truth** for appointments.
- Integrations are **fail-closed** stubs until providers are wired (`ExternalServiceError`).
- Secrets stay in gitignored `.env` files; docs use placeholders only.
- See [`PROJECT_RULES.md`](PROJECT_RULES.md) and [`docs/`](docs/) for deeper detail.

## Documentation index

| Doc | Path |
| --- | ---- |
| End-to-end flow | [`SYSTEM_FLOW.md`](SYSTEM_FLOW.md) |
| Project rules | [`PROJECT_RULES.md`](PROJECT_RULES.md) |
| System architecture | [`docs/architecture/SYSTEM_ARCHITECTURE.md`](docs/architecture/SYSTEM_ARCHITECTURE.md) |
| Data flow | [`docs/architecture/DATA_FLOW.md`](docs/architecture/DATA_FLOW.md) |
| Voice pipeline | [`docs/architecture/VOICE_PIPELINE.md`](docs/architecture/VOICE_PIPELINE.md) |
| Conversation flow | [`docs/architecture/CONVERSATION_FLOW.md`](docs/architecture/CONVERSATION_FLOW.md) |
| Backend / API / services | [`docs/backend/`](docs/backend/) |
| Backend SRD (what to build) | [`docs/backend/SRD_BACKEND.md`](docs/backend/SRD_BACKEND.md) |
| Database | [`docs/database/DATABASE_SCHEMA.md`](docs/database/DATABASE_SCHEMA.md) |
| AI / RAG / tools | [`docs/ai/`](docs/ai/) |
| Voice behavior | [`docs/voice/`](docs/voice/) |
| Testing | [`docs/testing/TESTING_STRATEGY.md`](docs/testing/TESTING_STRATEGY.md) |
| MCP setup | [`docs/mcp/MCP_SETUP.md`](docs/mcp/MCP_SETUP.md) |
| Ticket standards | [`docs/process/TICKET_STANDARDS.md`](docs/process/TICKET_STANDARDS.md) |
| Branch & PR workflow | [`docs/process/BRANCH_AND_PR.md`](docs/process/BRANCH_AND_PR.md) |
| Voice backlog | [`docs/process/BACKLOG.md`](docs/process/BACKLOG.md) |
