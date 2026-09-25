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

**Purpose:** Convert browser-captured audio to text (KAN-11, KAN-24 multilingual).

**Request body:**

```json
{
  "audioBase64": "<base64>",
  "mimeType": "audio/webm",
  "fileName": "clip.webm",
  "languageHint": "hi"
}
```

`languageHint` is optional (`en` | `hi` | `hinglish` or ISO tags like `en-US`). For `hinglish`, Whisper `language` is omitted so mixed speech can auto-detect. When unset, `STT_DEFAULT_LANGUAGE` may apply.

**Response `200`:**

```json
{ "text": "...", "language": "hi", "supported": true }
```

`language` is the provider-reported ISO-639-1 code when available. `supported` is `false` when that language is outside the POC set (**en** / **hi**; Hinglish is classified after STT). Out-of-scope hints (`fr`, `es`, …) are ignored for Whisper biasing.

Uses `getConfig().stt` (`STT_PROVIDER`, `STT_API_KEY`, `STT_MODEL`, optional `STT_DEFAULT_LANGUAGE`). Failures are fail-closed and must not leak API keys. One STT stack for en/hi/hinglish — not separate language agents.

### `POST /api/llm/complete`

**Purpose:** Run one LLM conversation turn (KAN-12 / KAN-25).

**Request body:**

```json
{
  "prompt": "user utterance",
  "messages": [{ "role": "user", "content": "prior turn" }],
  "includeSystemPrompt": true,
  "enableTools": false,
  "language": "hi"
}
```

Provide `prompt` and/or `messages`. System prompt from `src/ai/prompts.ts` is included by default. Optional `language` (`en` | `hi` | `hinglish`) sets the reply-language section of the system prompt (default `en`). One conversation engine for all languages — not separate agents.

**Response `200`:**

```json
{ "text": "assistant reply" }
```

May include `toolCalls` when `enableTools` is true and the model requests a tool. Tool suggestions are not bookings — execute via backend tools only.

Uses `getConfig().llm` (`LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`). Failures are fail-closed and must not leak API keys.

### `POST /api/tts/synthesize`

**Purpose:** Convert assistant reply text to playable audio (KAN-13 / KAN-26).

**Request body:**

```json
{
  "text": "assistant reply to speak",
  "voice": "alloy",
  "language": "hi"
}
```

`voice` is optional. Optional `language` (`en` | `hi` | `hinglish`) selects a default OpenAI voice when `voice` is omitted: **en → `alloy`**, **hi / hinglish → `nova`**. Explicit `voice` always wins. One TTS stack for all languages — not separate agents. Adaptive delivery profiles remain a later sprint.

**Response `200`:**

```json
{
  "audioBase64": "<base64>",
  "mimeType": "audio/mpeg"
}
```

Uses `getConfig().tts` (`TTS_PROVIDER`, `TTS_API_KEY`, `TTS_MODEL`). Failures are fail-closed and must not leak API keys.

### `POST /api/voice/turn`

**Purpose:** Run one realtime voice turn end-to-end (KAN-14, KAN-23): STT → language detection → LLM → TTS.

**Request body:**

```json
{
  "audioBase64": "<base64>",
  "mimeType": "audio/webm",
  "fileName": "clip.webm",
  "sessionId": "browser-...",
  "conversationId": "<optional>",
  "messages": [{ "role": "user", "content": "optional prior context" }],
  "voice": "alloy",
  "languageHint": "en"
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
  "sessionId": "browser-...",
  "languageDetection": {
    "language": "en",
    "confidence": 0.92,
    "unclear": false,
    "unsupported": false
  },
  "language": "en",
  "languageChanged": false
}
```

`languageHint` is optional on the turn request and is also forwarded into STT (KAN-24). When omitted but `callId` is set, the session `language` is used as the STT hint. Only **en / hi / hinglish** are in scope. If STT or language detection marks another language as unsupported — or speech is unclear / empty — the turn skips the LLM and returns a clarification or polite fallback in the **session language** (default `en`; TTS still attempted). Provider-detected STT language feeds language detection confidence; the transcript still wins when they disagree for in-scope languages. `languageDetection.language` is `en`, `hi`, `hinglish`, or `null` when `unclear` / `unsupported` is true. A detection failure is logged without secrets and soft-continues with the unclear fallback (KAN-30). This stage does not book appointments.

**Session language (KAN-28):** When `callId` is set and detection is clear (`en` | `hi` | `hinglish`), the pipeline updates `calls.language` and `conversation_states.language` and may emit `LANGUAGE_CHANGED`. Unclear / unsupported detections leave the prior preference unchanged. Turn responses include top-level `language` (durable session preference) alongside `languageDetection` (this utterance).

**Dynamic switching (KAN-27):** On the same `callId`, a clear detection that differs from the stored preference updates session language, emits `LANGUAGE_CHANGED`, and sets `languageChanged: true`. Same-language turns keep `languageChanged: false`. Conversation history is preserved; no new session is required.

**Error & fallback (KAN-30):** Unclear speech (including empty STT) and unsupported languages skip the LLM and return a clarification / polite fallback in the session language (default `en`). The session is not ended. Fallback is logged (`fallbackReason` + `language_fallback` call event) without secrets. STT/LLM provider failures remain `502`; TTS soft-fail is unchanged.

**Multilingual LLM (KAN-25):** The same `LlmService` receives `language` (clear detection → else session → else `en`) so the system prompt instructs the reply language. Prior conversation turns stay in `messages` across switches. `enableTools` remains false on the voice path (no appointment tool calling in Sprint 3).

**Multilingual TTS (KAN-26):** The same `TtsService` receives that reply `language` so default OpenAI voice is `alloy` (en) or `nova` (hi / hinglish). Client `voice` override still wins. Soft-fail `ttsError` behavior is unchanged.

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

Both fields optional (`callerNumber` defaults to `browser`, `language` to `en`). Allowed `language` values: **`en`**, **`hi`**, **`hinglish`** (KAN-28). Other codes return `400` `VALIDATION_ERROR`.

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

### `GET /api/sessions`

**Purpose:** List recent sessions for Call History (KAN-18).

**Query:** `limit` optional (default 50, max 200).

**Response `200`:**

```json
{
  "sessions": [
    {
      "callId": "<uuid>",
      "callerNumber": "browser",
      "language": "en",
      "callStatus": "COMPLETED",
      "currentState": "CALL_COMPLETED",
      "intent": null,
      "startTime": "2026-09-23T05:00:00.000Z",
      "endTime": "2026-09-23T05:05:00.000Z",
      "durationMs": 300000,
      "estimatedUsd": 0.0012
    }
  ]
}
```

`estimatedUsd` is the sum of tracked `openai_usage` events for that call (list-price estimate; not a live wallet balance).

### `GET /api/usage/summary`

**Purpose:** Estimated POC OpenAI spend so far (KAN-18). Sums `TOOL_CALLED` / `openai_usage` events across recent calls.

**Response `200`:**

```json
{
  "currency": "USD",
  "estimatedUsdTotal": 0.0042,
  "turnCount": 3,
  "callCount": 12,
  "note": "Estimated POC spend from tracked OpenAI usage events; not a live OpenAI wallet balance."
}
```

### `GET /api/sessions/:callId`

**Purpose:** Load session snapshot (state + LLM `messages`).

**Response `200`:** same shape as start. **`404 NOT_FOUND`** if unknown.

### `GET /api/sessions/:callId/events`

**Purpose:** List durable `call_events` for a session (speech, replies, wait/end, pipeline `TOOL_FAILED`, usage `TOOL_CALLED` / `openai_usage`).

**Response `200`:**

```json
{
  "callId": "<uuid>",
  "events": [
    {
      "id": "<uuid>",
      "callId": "<uuid>",
      "eventType": "USER_SPEECH",
      "timestamp": "2026-09-23T05:01:00.000Z",
      "metadata": { "text": "hello" }
    }
  ]
}
```

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

Credential-like substrings (e.g. `sk-…`, `Bearer …`, `api_key=…`) are redacted to `[REDACTED]` in both logs and exposed messages (KAN-18).

Voice turn failures with a durable `callId` also persist `call_events` (`TOOL_FAILED`, metadata `kind: "voice_pipeline"`) for STT/LLM hard failures and TTS soft-failures.

Saved Success/Fail examples for each current endpoint live in the Postman collection.
