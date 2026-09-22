# Conversation Flow

## Two conversation concepts

1. **Turn history** — `src/conversation/conversationService.ts`  
   Roles: `user` | `assistant` | `system`. Held in memory for the process, keyed by `callId`.  
   User/assistant speech is also written to `call_events` (`USER_SPEECH` / `AGENT_RESPONSE` with `metadata.text`) so context can be **rehydrated** after a restart (KAN-15).

2. **State machine (Postgres)** — `conversation_states.current_state`  
   Enum values (`src/models/enums.ts`):

| State | Meaning |
| ----- | ------- |
| `ACTIVE_CONVERSATION` | Normal dialog |
| `USER_REQUESTED_WAIT` | User asked to wait |
| `WAITING_FOR_USER` | Agent is waiting |
| `CALLER_RETURNED` | User resumed (transient; immediately followed by ACTIVE) |
| `HUMAN_HANDOFF` | Escalation |
| `CALL_COMPLETED` | Session finished |

## Session lifecycle (KAN-15)

Orchestrator: `src/services/sessionService.ts`

```
POST /api/sessions
  → calls (ACTIVE) + conversation_states (ACTIVE_CONVERSATION) + CALL_STARTED
  → in-memory ConversationService buffer

POST /api/sessions/:callId/turns  (user text)
  → USER_SPEECH event + turn append
  → wait intent → USER_REQUESTED_WAIT → WAIT_STARTED → WAITING_FOR_USER
  → while waiting, next utterance → CALLER_RETURNED → ACTIVE_CONVERSATION

GET /api/sessions/:callId
  → snapshot: currentState + messages[] for LLM context

POST /api/sessions/:callId/wait | /resume | /complete
  → explicit state transitions + matching call_events
```

`POST /api/voice/turn` accepts optional `callId` to use this durable session path.

Wait phrase detection: `src/conversation/waitIntent.ts` (see [`docs/voice/WAITING_STATE.md`](../voice/WAITING_STATE.md)).

## Persistence API

- `conversationStateRepository.upsert({ callId, currentState, language, intent })`
- One row per call (`call_id UNIQUE`)
- `callEventRepository.create` / `listByCallId` for audit + turn rehydration

## Events

Parallel audit trail in `call_events` (`CALL_STARTED`, `USER_SPEECH`, `AGENT_RESPONSE`, `WAIT_STARTED`, `CALLER_RETURNED`, `CALL_ENDED`, …).

## Intent (current)

`intent` is a free-text column (e.g. seed uses `schedule_appointment`). Structured intent routing will live with the conversation manager / LLM layer.
