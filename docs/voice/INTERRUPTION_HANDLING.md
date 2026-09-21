# Interruption Handling

## Types

| Interruption | Suggested handling |
| ------------ | ------------------ |
| User speaks over TTS | Stop playback; STT captures new utterance; log `INTERRUPTION` |
| User changes topic | Update intent; keep `ACTIVE_CONVERSATION` unless wait/handoff |
| Network/STT failure | Fail closed; apologize; optionally retry or hand off |

## Events

Use `call_events.event_type = INTERRUPTION` with safe metadata (timestamps, not audio blobs/secrets).

## Rules

- Prefer acknowledging the latest user utterance (barge-in).
- Do not finalize a booking if interrupted mid-confirmation without re-confirming.
