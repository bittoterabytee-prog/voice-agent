# Waiting State

When the user says “hold on”, “wait”, or similar:

1. Detect wait intent from STT text.
2. Transition `conversation_states`:
   - `ACTIVE_CONVERSATION` → `USER_REQUESTED_WAIT` → `WAITING_FOR_USER`
3. Emit `call_events`: `WAIT_STARTED`.
4. Pause proactive prompts; do not book or invent actions while waiting.
5. On user return:
   - `CALLER_RETURNED` → `ACTIVE_CONVERSATION`
   - Emit `CALLER_RETURNED` event.
6. Briefly re-orient (“Welcome back — shall we continue booking?”).

Enums already exist in `src/models/enums.ts`. Orchestration is implemented in `SessionService` (`requestWait` / `resumeFromWait` / `handleUserUtterance`) and exposed via `/api/sessions/*` (KAN-15).
