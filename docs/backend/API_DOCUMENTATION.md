# API Documentation

## Current endpoints

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

## Planned / domain APIs (not yet exposed)

These behaviors exist at the repository/service layer and will be wrapped by HTTP or tool-calling as needed:

| Capability | Backend entry |
| ---------- | ------------- |
| Start call/session | `callService.startCall` |
| Persist conversation state | `conversationStateRepository` |
| Create/find appointment | `appointmentRepository` |
| Patient / doctor CRUD | respective repositories |
| Appointment tool for LLM | `lookupAppointment` in `appointmentTools.ts` |

## Error shape

Unhandled/`AppError` responses go through `errorHandler` and must not include secrets or raw provider payloads.
