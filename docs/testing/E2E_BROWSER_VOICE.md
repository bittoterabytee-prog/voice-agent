# Browser E2E Voice Conversation (KAN-17)

Local runbook to demo the Sprint 2 Basic Voice Agent: **mic → UI → session → `/api/voice/turn` → transcript + TTS → multi-turn → stop**.

Jira: [KAN-17](https://voiceagentai.atlassian.net/browse/KAN-17)  
Depends on: KAN-10–16 (mic, STT, LLM, TTS, pipeline, session, UI) + CORS ([KAN-16](https://voiceagentai.atlassian.net/browse/KAN-16) / PR #8).

> Frontend lives in a **separate repo**. Voice UI: **`http://localhost:5174/calls`** (not `5173`).

---

## Ports

| Service | URL |
| ------- | --- |
| Backend API | `http://localhost:3000` |
| Frontend Voice UI | `http://localhost:5174/calls` |

CORS defaults (non-production) allow `http://localhost:5173` and `http://localhost:5174`. Override with `CORS_ORIGINS` if needed.

---

## Backend setup

1. Copy env and set keys:

   ```bash
   cp .env.example .env
   ```

   Required for a real voice turn: `APP_ENV=development`, `DATABASE_URL`, plus `STT_*`, `LLM_*`, `TTS_*` (provider + API key + model).

2. Start deps and API:

   ```bash
   npm run deps:up
   npm run db:migrate
   npm run dev
   ```

3. Confirm health:

   ```bash
   curl http://localhost:3000/health
   # {"status":"ok"}
   ```

No telephony / carrier credentials are required.

---

## Frontend setup

1. Point the frontend API base URL at `http://localhost:3000` (e.g. `VITE_API_BASE_URL`).
2. Open **`http://localhost:5174/calls`**.
3. System Status must show **Healthy** (`GET /health` via CORS). If not, restart backend with CORS merged and check Origin is `http://localhost:5174`.

---

## Happy path (API contract)

```
GET  /health
POST /api/sessions                    → callId
POST /api/voice/turn  (+ callId)      → transcript, replyText, audioBase64?
POST /api/voice/turn  (same callId)   → multi-turn context
POST /api/sessions/:callId/complete
```

### `POST /api/sessions`

Body (optional fields):

```json
{ "callerNumber": "browser", "language": "en" }
```

`201` → `{ "callId", "conversationId", "currentState", ... }`

### `POST /api/voice/turn`

```json
{
  "audioBase64": "<base64>",
  "mimeType": "audio/webm",
  "fileName": "clip.webm",
  "callId": "<from sessions>"
}
```

`200` → `{ "transcript", "replyText", "audioBase64?", "mimeType?", "conversationId", "sessionId", "callId?", "ttsError?" }`

- Pass **`callId`** every turn so SessionService keeps durable context (KAN-15).
- If `ttsError` is set on `200`, show text reply (soft fail) — do not treat as a hard crash.
- STT/LLM failure → `502` `{ "error": { "code", "message" } }` (no API keys in body).

### `POST /api/sessions/:callId/complete`

Finishes the session; UI returns to idle.

Full shapes: [`docs/backend/API_DOCUMENTATION.md`](../backend/API_DOCUMENTATION.md), [`docs/architecture/VOICE_PIPELINE.md`](../architecture/VOICE_PIPELINE.md).

Postman: [`postman/Voice-Agent-API.postman_collection.json`](../../postman/Voice-Agent-API.postman_collection.json).

---

## Smoke checklist

- [ ] Backend `:3000` + frontend `:5174/calls`; System Status **Healthy**
- [ ] Start → mic allow → Listening + Call ID shown
- [ ] Turn 1: short greeting → transcript + reply; audio plays **or** soft `ttsError` notice
- [ ] Turn 2: follow-up with **same `callId`** → reply uses prior context
- [ ] Stop → Idle; mic released; session complete
- [ ] Mic deny → readable error
- [ ] Backend down / missing keys → recoverable error; Stop still works
- [ ] No telephony env vars required

---

## Related docs

| Doc | Use |
| --- | --- |
| [`SYSTEM_FLOW.md`](../../SYSTEM_FLOW.md) | End-to-end browser flow |
| [`ARCHITECTURE.md`](../../ARCHITECTURE.md) | Stack + CORS pointer |
| [`docs/architecture/VOICE_PIPELINE.md`](../architecture/VOICE_PIPELINE.md) | Turn pipeline |
| [`docs/architecture/CONVERSATION_FLOW.md`](../architecture/CONVERSATION_FLOW.md) | Session lifecycle |
| [`PROJECT_RULES.md`](../../PROJECT_RULES.md) | Browser POC rules |
| [KAN-16](https://voiceagentai.atlassian.net/browse/KAN-16) | Voice Agent UI |

## Out of scope (later sprints)

WebSocket streaming, multilingual UI, appointment booking UX, barge-in polish, production auth.
