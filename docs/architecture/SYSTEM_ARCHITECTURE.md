# System Architecture

## Layers

1. **Frontend (browser)** — mic/audio UI in a **separate frontend repository**. This backend exposes HTTP/API (and optional WS) for that client.
2. **API** — Express app (`src/app.ts`). Public routes: `GET /health`, `POST /api/voice/turn`, `POST /api/stt/transcribe`, `POST /api/llm/complete`, `POST /api/tts/synthesize`.
3. **Domain services** — `callService`, `conversationService`, voice STT + TTS + LLM (OpenAI), appointment tools.
4. **Persistence** — PostgreSQL via repositories; migrations in `migrations/`.
5. **Integrations** — `httpClient` for outbound HTTP; unwired providers fail closed.
6. **RAG** — Qdrant configured via `VECTOR_DB_URL` (Docker service `qdrant`).

## Runtime bootstrap

1. `loadConfig()` validates env (`APP_ENV`, etc.).
2. `connectDatabase()` requires `DATABASE_URL`.
3. `createApp()` mounts middleware and routes.
4. Listen on `config.app.port`.

## Cross-cutting concerns

- **Logging:** Pino (`src/utils/logger.ts`) using `config.app.logLevel`.
- **Errors:** `AppError` hierarchy + Express `errorHandler` (no secret leakage).
- **Config:** Only through `src/config` — see [KAN-8](https://voiceagentai.atlassian.net/browse/KAN-8).
- **CORS:** `src/middleware/cors.ts` + `getConfig().app.corsOrigins` (`CORS_ORIGINS`). Allows the separate frontend (e.g. `http://localhost:5174`) to call HTTP APIs for [KAN-16](https://voiceagentai.atlassian.net/browse/KAN-16).

## Out of scope (current POC)

- Telephone/Twilio-style providers
- Full booking HTTP API surface (repositories exist; tools are stubs)
- Production auth
