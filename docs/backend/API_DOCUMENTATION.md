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
