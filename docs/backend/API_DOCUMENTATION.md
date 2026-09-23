# API Documentation

**Postman:** Import [`postman/Voice-Agent-API.postman_collection.json`](../../postman/Voice-Agent-API.postman_collection.json) + [`postman/Local.postman_environment.json`](../../postman/Local.postman_environment.json). Keep the collection updated when routes change — [`docs/process/POSTMAN.md`](../process/POSTMAN.md) (KAN-21).

## Current endpoints

Browser clients (separate frontend repo) call these APIs over HTTP. CORS is enabled via `CORS_ORIGINS` / defaults for local Vite (`http://localhost:5173`, `http://localhost:5174`) so the KAN-16 UI can reach this backend. See [`ARCHITECTURE.md`](../../ARCHITECTURE.md) and `src/middleware/cors.ts`.

**Browser E2E demo (KAN-17):** [`docs/testing/E2E_BROWSER_VOICE.md`](../testing/E2E_BROWSER_VOICE.md).

### `GET /health`

**Purpose:** Liveness check for local/Docker verification.

**Response `200`:**

```json
{ "status": "ok" }
```

No authentication.

### `POST /api/stt/transcribe`

**Purpose:** Convert browser-captured audio to text (KAN-11).

**Request body:**

```json
{
  "audioBase64": "<base64>",
  "mimeType": "audio/webm",
  "fileName": "clip.webm"
}
```

**Response `200`:**

```json
{ "text": "..." }
```

Uses `getConfig().stt` (`STT_PROVIDER`, `STT_API_KEY`, `STT_MODEL`). Failures are fail-closed and must not leak API keys.

### `POST /api/llm/complete`

**Purpose:** Run one LLM conversation turn (KAN-12).

**Request body:**

```json
{
  "prompt": "user utterance",
  "messages": [{ "role": "user", "content": "prior turn" }],
  "includeSystemPrompt": true,
  "enableTools": false
}
```

Provide `prompt` and/or `messages`. System prompt from `src/ai/prompts.ts` is included by default.

**Response `200`:**

```json
{ "text": "assistant reply" }
```

May include `toolCalls` when `enableTools` is true and the model requests a tool. Tool suggestions are not bookings — execute via backend tools only.

Uses `getConfig().llm` (`LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`). Failures are fail-closed and must not leak API keys.

### `POST /api/tts/synthesize`

**Purpose:** Convert assistant reply text to playable audio (KAN-13).

**Request body:**

```json
{
  "text": "assistant reply to speak",
  "voice": "alloy"
}
```

`voice` is optional (OpenAI default `alloy`).

**Response `200`:**

```json
{
  "audioBase64": "<base64>",
  "mimeType": "audio/mpeg"
}
```

Uses `getConfig().tts` (`TTS_PROVIDER`, `TTS_API_KEY`, `TTS_MODEL`). Failures are fail-closed and must not leak API keys. Sprint 2 scope is English browser playback, not multilingual or adaptive voice profiles.

### `POST /api/voice/turn`

**Purpose:** Run one realtime voice turn end-to-end (KAN-14): STT → LLM → TTS.

**Request body:**

```json
{
  "audioBase64": "<base64>",
  "mimeType": "audio/webm",
  "fileName": "clip.webm",
  "sessionId": "browser-...",
  "conversationId": "<optional>",
  "messages": [{ "role": "user", "content": "optional prior context" }],
  "voice": "alloy"
}
```

**Response `200`:**

```json
{
  "transcript": "...",
  "replyText": "...",
  "audioBase64": "<base64>",
  "mimeType": "audio/mpeg",
  "conversationId": "<uuid>",
  "sessionId": "browser-..."
}
```

If TTS fails after LLM succeeds, `audioBase64` may be omitted and `ttsError` is set (`code`, `message`, `service`). STT/LLM failures return `502` `EXTERNAL_SERVICE_UNAVAILABLE`. No telephony provider is required.

See [`docs/architecture/VOICE_PIPELINE.md`](../architecture/VOICE_PIPELINE.md) for the full contract (HTTP today; WebSocket streaming deferred).

### `POST /api/sessions`

**Purpose:** Start a durable browser conversation session (KAN-15).

**Request body:**

```json
{
  "callerNumber": "browser",
  "language": "en"
}
```

Both fields optional (`callerNumber` defaults to `browser`, `language` to `en`).

**Response `201`:**

```json
{
  "callId": "<uuid>",
  "conversationId": "<uuid>",
  "callerNumber": "browser",
  "language": "en",
  "callStatus": "ACTIVE",
  "currentState": "ACTIVE_CONVERSATION",
  "intent": null,
  "turns": [],
  "messages": []
}
```

Creates `calls` + `conversation_states` and emits `CALL_STARTED`.

### `GET /api/sessions/:callId`

**Purpose:** Load session snapshot (state + LLM `messages`).

**Response `200`:** same shape as start. **`404 NOT_FOUND`** if unknown.

### `POST /api/sessions/:callId/turns`

**Purpose:** Append a turn; user text runs wait/resume detection.

**Request body:**

```json
{ "text": "hold on" }
```

Or `{ "role": "assistant", "content": "..." }` to store an agent reply without wait detection.

**Response `200`:** session snapshot plus `action`: `continue` | `waited` | `resumed` (and optional `agentReply` when waited).

### `POST /api/sessions/:callId/wait`

Explicit wait: `ACTIVE_CONVERSATION` → `USER_REQUESTED_WAIT` → `WAITING_FOR_USER` + `WAIT_STARTED`.

### `POST /api/sessions/:callId/resume`

Resume: `CALLER_RETURNED` → `ACTIVE_CONVERSATION` + `CALLER_RETURNED` event.

### `POST /api/sessions/:callId/complete`

Finish: `CALL_COMPLETED` + `CALL_ENDED`; call status `COMPLETED`.

See [`docs/architecture/CONVERSATION_FLOW.md`](../architecture/CONVERSATION_FLOW.md) and [`docs/voice/WAITING_STATE.md`](../voice/WAITING_STATE.md).

## Planned / domain APIs (not yet exposed)

These behaviors exist at the repository/service layer and will be wrapped by HTTP or tool-calling as needed:

| Capability | Backend entry |
| ---------- | ------------- |
| Create/find appointment | `appointmentRepository` |
| Patient / doctor CRUD | respective repositories |
| Appointment tool for LLM | `lookupAppointment` in `appointmentTools.ts` |

## Error shape

Unhandled/`AppError` responses go through `errorHandler` and must not include secrets or raw provider payloads:

```json
{
  "error": {
    "code": "VALIDATION_ERROR | EXTERNAL_SERVICE_UNAVAILABLE | NOT_FOUND | INTERNAL_ERROR | ...",
    "message": "human-readable message when expose=true"
  }
}
```

Saved Success/Fail examples for each current endpoint live in the Postman collection.
