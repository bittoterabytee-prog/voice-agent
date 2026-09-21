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
| Errors | `tests/errorHandler.test.ts` |
| Integrations fail-closed | `tests/integrations.test.ts` |
| Postgres schema/repos | `tests/db/postgres.test.ts` |

## Expectations for new work

1. Add/adjust tests with each feature.
2. Config/validation changes must extend `tests/config.test.ts`.
3. Schema changes need migration + DB tests.
4. Never assert real secrets in tests — use placeholders.

## Manual checks

- `npm run deps:up` → Postgres + Qdrant
- `npm run db:migrate && npm run db:seed`
- `npm run dev` → `GET /health`
- MCP: see [`docs/mcp/MCP_SETUP.md`](../mcp/MCP_SETUP.md)
