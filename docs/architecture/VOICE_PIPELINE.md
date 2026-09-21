# Voice Pipeline

Browser-first audio pipeline (no telephony).

```
Microphone (frontend repo)
   → capture audio blob/stream
   → POST /api/stt/transcribe (audioBase64)
   → STT (src/voice/sttService.ts → OpenAI Whisper when STT_PROVIDER=openai)
   → text to conversation + LLM/tools
   → POST /api/llm/complete (or LlmService.complete)
   → reply text
   → TTS (src/voice/ttsService.ts)
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

## STT API (KAN-11)

`POST /api/stt/transcribe`

Request:

```json
{
  "audioBase64": "<base64 audio bytes or data-URL>",
  "mimeType": "audio/webm",
  "fileName": "clip.webm"
}
```

Response `200`:

```json
{ "text": "transcribed utterance" }
```

Errors:

| Situation | Code | Status |
| --------- | ---- | ------ |
| Missing/empty/invalid audio | `VALIDATION_ERROR` | 400 |
| Missing STT config / provider failure | `EXTERNAL_SERVICE_UNAVAILABLE` | 502 |

Supported provider today: `openai` (Whisper transcriptions API). Model defaults to `whisper-1` when `STT_MODEL` is unset.

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

## Session init

`VoiceService.initializeBrowserSession(language)` requires both STT and TTS providers to be configured. Returns `{ sessionId: browser-*, language }`.

## Implementation status

| Layer | Status |
| ----- | ------ |
| STT | Wired for OpenAI via `SttService` + HTTP route |
| TTS | Stub (fail-closed until KAN-13) |
| LLM | Wired for OpenAI via `LlmService` + HTTP route (KAN-12) |
