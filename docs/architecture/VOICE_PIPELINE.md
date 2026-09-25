# Voice Pipeline

Browser-first audio pipeline (no telephony).

## Orchestrated turn (KAN-14)

Preferred frontend path: one HTTP turn that wires STT → language detection → LLM → TTS.

```
Microphone (frontend repo)
   → capture audio blob
   → POST /api/voice/turn (audioBase64)
   → VoicePipelineService (src/voice/voicePipelineService.ts)
        ├─ SttService
        ├─ LanguageDetectionService (KAN-23: en | hi | hinglish)
        ├─ SessionService when callId set (KAN-15 durable state + context)
        ├─ ConversationService (in-memory turns; fallback without callId)
        ├─ LlmService
        └─ TtsService (TTS failure still returns transcript + replyText)
   → playback audioBase64 in browser (or show text if ttsError)
```

WebSocket streaming is **not** required for Sprint 2. The realtime contract today is HTTP `POST /api/voice/turn`. A future WS contract may stream partial transcripts/audio; until then clients should use the HTTP turn API (or the step APIs below).

### `POST /api/voice/turn`

Request:

```json
{
  "audioBase64": "<base64 audio bytes or data-URL>",
  "mimeType": "audio/webm",
  "fileName": "clip.webm",
  "sessionId": "browser-...",
  "conversationId": "<optional prior conversation>",
  "callId": "<optional durable session from POST /api/sessions>",
  "messages": [{ "role": "user", "content": "optional extra context" }],
  "voice": "alloy",
  "languageHint": "en"
}
```

Success `200`:

```json
{
  "transcript": "user utterance",
  "replyText": "assistant reply",
  "audioBase64": "<base64 mp3>",
  "mimeType": "audio/mpeg",
  "conversationId": "<uuid>",
  "sessionId": "browser-...",
  "languageDetection": {
    "language": "en",
    "confidence": 0.92,
    "unclear": false,
    "unsupported": false
  }
}
```

When TTS fails after a successful LLM reply (TC-004), response is still `200` with `transcript` + `replyText` and:

```json
{
  "ttsError": {
    "code": "EXTERNAL_SERVICE_UNAVAILABLE",
    "message": "...",
    "service": "tts"
  }
}
```

| Situation | Code | Status |
| --------- | ---- | ------ |
| Missing/empty/invalid audio | `VALIDATION_ERROR` | 400 |
| STT or LLM provider failure | `EXTERNAL_SERVICE_UNAVAILABLE` | 502 |

Success responses may include `requestId` (KAN-18 correlation id from `pino-http`), a `pipeline` object for the UI, and a `cost` estimate:

```json
{
  "pipeline": {
    "requestId": "12",
    "stages": [
      { "stage": "stt", "outcome": "success", "durationMs": 1598 },
      { "stage": "language", "outcome": "success", "durationMs": 2 },
      { "stage": "llm", "outcome": "success", "durationMs": 1586 },
      { "stage": "tts", "outcome": "success", "durationMs": 2445 }
    ]
  },
  "cost": {
    "currency": "USD",
    "estimatedUsd": 0.00042,
    "breakdown": [
      { "stage": "stt", "estimatedUsd": 0.0001, "details": { "audioBytes": 12000 } },
      { "stage": "llm", "estimatedUsd": 0.0002, "details": { "promptTokens": 120, "completionTokens": 40 } },
      { "stage": "tts", "estimatedUsd": 0.00012, "details": { "characters": 80 } }
    ],
    "note": "Estimated from public OpenAI list prices for this POC; not a live wallet balance."
  }
}
```

## Language detection (KAN-23)

After a non-empty transcript, `LanguageDetectionService` classifies the **whole** utterance before the LLM. One engine, not three agents. No appointment logic.

| Code | When |
| ---- | ---- |
| `en` | Recognized words are English only |
| `hi` | Devanagari, or romanized Hindi with no English content words |
| `hinglish` | Hindi (Devanagari or romanized) and English content words in the same utterance |
| `null` + `unclear` | Empty, punctuation-only, or nonsense |
| `null` + `unclear` + `unsupported` | Another language or script |

`language` is `null` for unclear and unsupported results. An optional `languageHint` raises confidence when it agrees and does not override a clear transcript. If detection throws, the stage is logged with secrets redacted and the turn continues with `unclear: true`.

## Session language preference (KAN-28)

When `callId` is present and detection returns a clear `en` | `hi` | `hinglish` result, `SessionService.updateLanguage` persists that code on **both** `calls.language` and `conversation_states.language`. A `LANGUAGE_CHANGED` call event is written only when the preference actually changes (`metadata.from` / `metadata.to`). Unclear or unsupported utterances do **not** overwrite the stored preference.

`POST /api/sessions` defaults `language` to `en` and rejects unsupported codes with `400`. `POST /api/voice/turn` responses expose top-level `language` (session preference) plus `languageDetection` (utterance classification). No appointment logic.

## Dynamic language switching (KAN-27)

Mid-call switches stay on the **same** `callId` / conversation engine. Clear detection that differs from the stored preference:

1. Persists via `SessionService.updateLanguage` (same as KAN-28)
2. Emits `LANGUAGE_CHANGED` with `metadata.from` / `metadata.to`
3. Sets response `languageChanged: true` when `callId` is present
4. Keeps prior turns in `messages` so LLM/TTS use the new reply language without starting a new session

Consecutive same-language turns leave preference unchanged (`languageChanged: false`, no `LANGUAGE_CHANGED`). Unclear / unsupported detections do not switch. Hinglish is handled by the same engine — not a third agent.

## Multilingual error & fallback (KAN-30)

When detection is **unclear** (including empty STT / nonsense) or **unsupported** (out-of-scope language), the pipeline **skips the LLM** and returns a clarification or polite “English / Hindi / Hinglish only” reply in the session’s last language (default `en`). TTS still runs with that reply language. The session stays open (`languageChanged: false`). Fallback turns log `fallbackReason` and write a `TOOL_CALLED` call event with `metadata.kind = "language_fallback"` (no secrets). STT/LLM provider outages remain hard failures; TTS soft-fail is unchanged.

## Multilingual LLM replies (KAN-25)

One `LlmService` / conversation engine for all languages. After detection (and optional session persist), the pipeline resolves reply language as:

1. Clear detection `en` | `hi` | `hinglish`, else
2. Session `language`, else
3. `en`

That code is passed to `llm.complete({ language })`, which prepends a language-aware system prompt (`buildSystemMessage`). Prior turns remain in `messages` when the caller switches language. Hinglish is instructed as one mixed reply — not separate EN/HI agents. Voice turns keep `enableTools: false`.

## Logging & error handling (KAN-18)

Each turn emits structured pino logs with `component: "voice_pipeline"`, `requestId`, optional `callId` / `conversationId`, `stage` (`stt` | `language` | `llm` | `tts` | `turn`), `outcome`, and `durationMs`. Language logs include `detectedLanguage`, `confidence`, `unclear`, and `unsupported` — not API keys.

When `callId` is set:

- Session layer still writes `USER_SPEECH` / `AGENT_RESPONSE` (and lifecycle events).
- STT/LLM hard failures and TTS soft-failures also write `call_events` with `event_type = TOOL_FAILED` and metadata `{ kind: "voice_pipeline", stage, softFail, code, message, requestId }` (messages are secret-redacted).
- Successful turns also write `call_events` with `event_type = TOOL_CALLED` and metadata `{ kind: "openai_usage", estimatedUsd, breakdown, requestId }` for POC spend tracking (list-price estimates only — not a live OpenAI wallet balance).

`errorHandler` returns `{ error: { code, message } }` only; API keys and credential-like substrings are redacted from logs and client messages (`src/utils/redact.ts`).

## Step APIs (also available)

Clients may still call STT / LLM / TTS independently:

```
Microphone (frontend repo)
   → capture audio blob/stream
   → POST /api/stt/transcribe (audioBase64)
   → STT (src/voice/sttService.ts → OpenAI Whisper when STT_PROVIDER=openai)
   → text to conversation + LLM/tools
   → POST /api/llm/complete (or LlmService.complete)
   → reply text
   → POST /api/tts/synthesize (text)
   → TTS (src/voice/ttsService.ts → OpenAI speech when TTS_PROVIDER=openai)
   → playback in browser
```

## Configuration

From centralized config (`getConfig()`):

| Setting | Env |
| ------- | --- |
| STT provider / model / key | `STT_PROVIDER`, `STT_MODEL`, `STT_API_KEY` |
| LLM provider / model / key | `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY` |
| TTS provider / model / key | `TTS_PROVIDER`, `TTS_MODEL`, `TTS_API_KEY` |

Frontend config belongs in the **separate frontend repo**.

### Browser CORS (KAN-16)

The Express app sends CORS headers for Origins listed in `getConfig().app.corsOrigins` (`CORS_ORIGINS` env, comma-separated, or `*`).

| Environment | Default when `CORS_ORIGINS` unset |
| ----------- | --------------------------------- |
| development / test / demo | `http://localhost:5173`, `http://localhost:5174` |
| production | none (set `CORS_ORIGINS` explicitly) |

Preflight `OPTIONS` returns `204`. This unblocks the Vite UI on port **5174** calling `GET /health`, `POST /api/sessions`, and `POST /api/voice/turn`.

Sprint 3 TTS uses one OpenAI stack for en / hi / hinglish. Default voices: `alloy` (en), `nova` (hi / hinglish). Explicit request `voice` overrides the map. Adaptive delivery profiles remain a later sprint.

## STT API (KAN-11 / KAN-24 multilingual)

`POST /api/stt/transcribe`

Request:

```json
{
  "audioBase64": "<base64 audio bytes or data-URL>",
  "mimeType": "audio/webm",
  "fileName": "clip.webm",
  "languageHint": "hi"
}
```

`languageHint` is optional. `en` / `hi` map to Whisper ISO codes; `hinglish` leaves language unset for auto-detect. Voice turns also pass session `language` when `callId` is set and the body omits a hint.

Response `200`:

```json
{ "text": "transcribed utterance", "language": "hi", "supported": true }
```

`supported: false` means Whisper reported a language outside **en/hi**. Voice turns then set `languageDetection.unsupported` and reply with a fixed “English / Hindi / Hinglish only” message (no LLM).

Errors:

| Situation | Code | Status |
| --------- | ---- | ------ |
| Missing/empty/invalid audio | `VALIDATION_ERROR` | 400 |
| Missing STT config / provider failure | `EXTERNAL_SERVICE_UNAVAILABLE` | 502 |

Supported provider today: `openai` (Whisper transcriptions API, `verbose_json`). Model defaults to `whisper-1` when `STT_MODEL` is unset. Optional `STT_DEFAULT_LANGUAGE` seeds a default hint. One shared STT path for English, Hindi, and Hinglish — no per-language agent stacks.

## LLM API (KAN-12)

`POST /api/llm/complete`

Request:

```json
{
  "prompt": "user utterance",
  "messages": [{ "role": "user", "content": "prior turn" }],
  "includeSystemPrompt": true,
  "enableTools": false
}
```

Response `200`:

```json
{ "text": "assistant reply" }
```

Optional `toolCalls` when the model requests a tool (with `enableTools: true`). Tool execution remains backend-owned.

| Situation | Code | Status |
| --------- | ---- | ------ |
| Missing prompt/messages | `VALIDATION_ERROR` | 400 |
| Missing LLM config / provider failure | `EXTERNAL_SERVICE_UNAVAILABLE` | 502 |

Supported provider today: `openai` (chat completions). Model defaults to `gpt-4o-mini` when `LLM_MODEL` is unset.

## Multilingual TTS (KAN-26)

After the LLM reply, `attachTts` calls `tts.synthesize({ text, voice?, language })` with the same reply language used for the LLM prompt. `resolveTtsVoice` maps:

| Language | Default OpenAI voice |
| -------- | -------------------- |
| `en` | `alloy` |
| `hi` | `nova` |
| `hinglish` | `nova` |

Unsupported-language fallback replies stay English (`alloy`). Soft-fail still returns `200` with `ttsError` and no audio. One TTS service — not separate language agents.

## TTS API (KAN-13 / KAN-26)

`POST /api/tts/synthesize`

Request:

```json
{
  "text": "assistant reply to speak",
  "voice": "alloy",
  "language": "hi"
}
```

`voice` is optional. `language` (`en` | `hi` | `hinglish`) selects the default voice when `voice` is omitted.

Response `200`:

```json
{
  "audioBase64": "<base64 mp3 bytes>",
  "mimeType": "audio/mpeg"
}
```

Errors:

| Situation | Code | Status |
| --------- | ---- | ------ |
| Missing/empty text | `VALIDATION_ERROR` | 400 |
| Missing TTS config / provider failure | `EXTERNAL_SERVICE_UNAVAILABLE` | 502 |

Supported provider today: `openai` (audio speech API). Model defaults to `tts-1` when `TTS_MODEL` is unset.

## Session init

`VoiceService.initializeBrowserSession(language)` requires both STT and TTS providers to be configured. Returns `{ sessionId: browser-*, language }`.

## Implementation status

| Layer | Status |
| ----- | ------ |
| STT | Wired for OpenAI via `SttService` + HTTP route |
| TTS | Wired for OpenAI via `TtsService` + HTTP route (KAN-13) |
| LLM | Wired for OpenAI via `LlmService` + HTTP route (KAN-12) |
| Turn pipeline | Wired via `VoicePipelineService` + `POST /api/voice/turn` (KAN-14) |
| WebSocket streaming | Deferred (document-only until a later ticket) |
