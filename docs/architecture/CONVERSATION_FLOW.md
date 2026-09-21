# Conversation Flow

## Two conversation concepts

1. **Turn history (in-memory)** — `src/conversation/conversationService.ts`  
   Roles: `user` | `assistant` | `system`. Not persisted to Postgres yet.

2. **State machine (Postgres)** — `conversation_states.current_state`  
   Enum values (`src/models/enums.ts`):

| State | Meaning |
| ----- | ------- |
| `ACTIVE_CONVERSATION` | Normal dialog |
| `USER_REQUESTED_WAIT` | User asked to wait |
| `WAITING_FOR_USER` | Agent is waiting |
| `CALLER_RETURNED` | User resumed |
| `HUMAN_HANDOFF` | Escalation |
| `CALL_COMPLETED` | Session finished |

## Persistence API

- `conversationStateRepository.upsert({ callId, currentState, language, intent })`
- One row per call (`call_id UNIQUE`)

## Events

Parallel audit trail in `call_events` (`USER_SPEECH`, `WAIT_STARTED`, `TOOL_CALLED`, …).

## Intent (current)

`intent` is a free-text column (e.g. seed uses `schedule_appointment`). Structured intent routing will live with the conversation manager / LLM layer.
