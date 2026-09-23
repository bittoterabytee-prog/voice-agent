# Testing Strategy

## Framework

- **Vitest** (`npm test`)
- HTTP: Supertest against `createApp()`
- DB: uses `DATABASE_URL` when reachable; otherwise PGlite (`tests/setup/postgres.ts`)

## Suites

| Area | Location |
| ---- | -------- |
| Health | `tests/health.test.ts` |
| Config (KAN-8) | `tests/config.test.ts` |
| CORS (KAN-16 UI) | `tests/cors.test.ts` |
| Browser E2E contract (KAN-17) | `tests/e2eBrowserContract.test.ts` + runbook [`E2E_BROWSER_VOICE.md`](E2E_BROWSER_VOICE.md) |
| STT (KAN-11) | `tests/stt.test.ts` |
| LLM (KAN-12) | `tests/llm.test.ts` |
| TTS (KAN-13) | `tests/tts.test.ts` |
| Voice pipeline (KAN-14) | `tests/voicePipeline.test.ts` |
| Postman sync (KAN-21) | `tests/postmanCollection.test.ts` |
| Errors | `tests/errorHandler.test.ts`, `tests/voicePipelineLogging.test.ts` (KAN-18) |
| Integrations fail-closed | `tests/integrations.test.ts` |
| Postgres schema/repos | `tests/db/postgres.test.ts` |

## Mandatory for every change

1. **Read the Jira ticket test cases** (TC-001…) and acceptance criteria.
2. **Add or update automated tests** under `tests/` for each testable TC / behavior change.
   - Prefer naming or commenting tests with the ticket key and TC id when useful (e.g. `KAN-11 TC-002`).
3. **Run `npm test`** before push/PR; fix failures before asking for review.
4. **Update knowledge** in the same change set when behavior, APIs, schema, config, or flows change (`docs/`, `ARCHITECTURE.md`, `SYSTEM_FLOW.md`, etc.).
5. Never assert real secrets in tests — use placeholders only.

Shipping code without covering ticket test cases (or without updating docs for the change) is incomplete. See [`docs/process/BRANCH_AND_PR.md`](../process/BRANCH_AND_PR.md).

## Expectations by change type

| Change | Tests | Knowledge |
| ------ | ----- | --------- |
| Config / env | Extend `tests/config.test.ts` | `.env.example`, README config table |
| Schema / repos | `tests/db/postgres.test.ts` + migration | `docs/database/DATABASE_SCHEMA.md` |
| STT / TTS / LLM | Service + fail-closed tests | `docs/voice/*`, `docs/ai/*`, voice pipeline docs |
| HTTP API | Route/handler tests + Postman collection sync | `docs/backend/API_DOCUMENTATION.md`, `postman/`, [`docs/process/POSTMAN.md`](../process/POSTMAN.md) |
| Conversation / session | Unit + DB state tests | `SYSTEM_FLOW.md`, `docs/architecture/CONVERSATION_FLOW.md` |

## Manual checks

- `npm run deps:up` → Postgres + Qdrant
- `npm run db:migrate && npm run db:seed`
- `npm run dev` → `GET /health`
- Shared MCP / agent knowledge: https://github.com/bittoterabytee-prog/voice-agent-knowledge
