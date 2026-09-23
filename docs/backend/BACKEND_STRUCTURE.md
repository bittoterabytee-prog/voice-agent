# Backend Structure

Product requirements (what to build): [`SRD_BACKEND.md`](SRD_BACKEND.md).

```
src/
├── config/           Typed env config (Zod)
├── controllers/      HTTP handlers
├── routes/           Route registration
├── services/         Domain orchestration (calls)
├── middleware/       Logging, errors, CORS (KAN-16)
├── models/           Domain types + enums
├── repositories/     PostgreSQL access
├── integrations/     Outbound HTTP
├── ai/               LLM provider adapter
├── voice/            Browser STT, language detection, TTS, session
├── conversation/     In-memory turns
├── tools/            Agent-callable tools
├── db/               Pool, migrate, seed, mappers
├── utils/            Logger, errors
├── app.ts
└── index.ts
```

## HTTP surface (today)

| Method | Path | Handler |
| ------ | ---- | ------- |
| GET | `/health` | `{ status: "ok" }` |
| POST | `/api/stt/transcribe` | Speech-to-text (`audioBase64` → `{ text }`) |
| POST | `/api/llm/complete` | LLM turn (`prompt`/`messages` → `{ text, toolCalls? }`) |

Additional appointment/call HTTP routes will be added as the POC grows; repositories already exist.

## Scripts

See root `package.json`: `dev`, `build`, `test`, `db:up`, `db:migrate`, `db:seed`, `vector:up`, `deps:up`.
