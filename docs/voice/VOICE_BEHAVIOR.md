# Voice Behavior

## Goals

Natural browser voice dialog for clinic scheduling without telephony.

## Behaviors to support

| Behavior | Notes |
| -------- | ----- |
| Greeting | Identify as AI assistant |
| Language | Use `calls.language` / patient preferred language |
| Scheduling | Tool-backed only |
| Wait / hold on | See `WAITING_STATE.md` |
| Interruption | See `INTERRUPTION_HANDLING.md` |
| Handoff | `HUMAN_HANDOFF` state |

## Code entry points

- Session: `src/voice/voiceService.ts`
- STT/TTS: `src/voice/sttService.ts`, `src/voice/ttsService.ts`
- Events: `call_events` types in `src/models/enums.ts`

## Adding a new voice behavior

1. Document it under `docs/voice/`.
2. Implement in `src/voice/` and/or conversation manager.
3. Persist state/events when the behavior affects resume/handoff.
4. Add tests under `tests/`.
