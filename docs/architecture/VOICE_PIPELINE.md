# Voice Pipeline

Browser-first audio pipeline (no telephony).

```
Microphone
   → capture audio blob/stream
   → STT (src/voice/sttService.ts)
   → text to conversation + LLM/tools
   → reply text
   → TTS (src/voice/ttsService.ts)
   → playback in browser
```

## Configuration

From centralized config (`getConfig()`):

| Setting | Env |
| ------- | --- |
| STT provider / model / key | `STT_PROVIDER`, `STT_MODEL`, `STT_API_KEY` |
| TTS provider / model / key | `TTS_PROVIDER`, `TTS_MODEL`, `TTS_API_KEY` |

Frontend hints for STT/TTS providers belong in the **separate frontend repo**, not this backend.

## Session init

`VoiceService.initializeBrowserSession(language)` requires both STT and TTS providers to be configured. Returns `{ sessionId: browser-*, language }`.

## Current implementation status

STT/TTS/LLM methods validate configuration then throw `ExternalServiceError` (“unavailable”) until real providers are wired. This is intentional fail-closed behavior.
