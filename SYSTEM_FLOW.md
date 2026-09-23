# System Flow

End-to-end flows for the browser-based AI Voice Agent POC.

> **Note:** The POC uses the **browser microphone**, not a telephone carrier. “Session” below is the browser voice session equivalent of a call.

## Primary flow (browser session)

```
Browser opens UI (separate frontend repo)
      │
      ▼
Frontend calls this backend API (and optional WebSocket)
      │
      ▼
User grants microphone
      │
      ▼
Voice layer initializes (STT + TTS config required)
  src/voice/voiceService.ts
      │
      ▼
Backend starts call record (ACTIVE)
  src/services/callService.ts → calls table
      │
      ▼
Conversation state row created (ACTIVE_CONVERSATION)
  conversation_states
      │
      ▼
Audio Processing (browser)
      │
      ▼
Preferred Sprint 2 path — one orchestrated turn (KAN-14):
  POST /api/voice/turn → VoicePipelineService
    STT → ConversationService turns → LLM → TTS → play in browser
  (step APIs /api/stt|/api/llm|/api/tts remain available)

Longer-term flow (tools, RAG, DB state — later tickets):
      │
      ▼
STT (src/voice/sttService.ts → POST /api/stt/transcribe)
      │
      ▼
Conversation Manager
  src/conversation/conversationService.ts (turn history)
  + conversation_states (state machine)
      │
      ├── Detect Language
      ├── Detect Intent
      ├── Check Conversation State
      ├── Retrieve Context (optional RAG via Qdrant)
      └── Decide Action
               │
        ┌──────┴─────────┐
        │                │
        ▼                ▼
   LLM Response      Tool Call
   src/ai/*          src/tools/appointmentTools.ts
   POST /api/llm/complete
                          │
                          ▼
                    Backend repositories
                          │
                          ▼
                      PostgreSQL
                          │
                          ▼
                    TTS (src/voice/ttsService.ts → POST /api/tts/synthesize)
                    → play audio in browser
```

## Wait / “hold on” flow

When the user says wait / hold on:

```
USER_SPEECH detected as wait intent
      │
      ▼
conversation_states → USER_REQUESTED_WAIT
      │
      ▼
call_events → WAIT_STARTED
      │
      ▼
conversation_states → WAITING_FOR_USER
      │
      ▼
(user returns)
      │
      ▼
conversation_states → CALLER_RETURNED → ACTIVE_CONVERSATION
call_events → CALLER_RETURNED
```

Implementation hooks: enums in `src/models/enums.ts`, persistence in `conversationStateRepository` / `callEventRepository`, orchestration in `SessionService` + `POST /api/sessions/*` (KAN-15). Full wait behavior is documented in [`docs/voice/WAITING_STATE.md`](docs/voice/WAITING_STATE.md).

## Appointment booking flow (intended)

```
User asks to book / check availability
      │
      ▼
Intent: schedule_appointment
      │
      ▼
Tool call (never invent slots)
  src/tools/appointmentTools.ts
      │
      ▼
Repositories query PostgreSQL
  doctors.working_hours + appointments
      │
      ▼
If book confirmed by API → persist appointments row
Else → tell user booking was not completed
```

**Rule:** Backend availability is the source of truth ([`PROJECT_RULES.md`](PROJECT_RULES.md)).

## Human handoff

```
Agent decides handoff / user requests human
      │
      ▼
conversation_states → HUMAN_HANDOFF
call_events → HUMAN_HANDOFF
calls.status → TRANSFERRED (when implemented)
```

## Session end

```
conversation_states → CALL_COMPLETED
call_events → CALL_ENDED
calls.status → COMPLETED, end_time set
```

## Quick answers for agents

| Question | Answer |
| -------- | ------ |
| Where is appointment availability checked? | Backend repositories + `appointmentTools` (must not invent slots) |
| Which service handles booking? | Persist via `appointmentRepository`; agent entry is `appointmentTools` |
| What happens when the caller says hold on? | Wait state machine above |
| Which file handles conversation state? | DB: `conversationStateRepository`; turns: `conversationService` |
| How does a call enter the system? | Browser session → `callService.startCall` |
| Where to add voice behavior? | `src/voice/` + docs under `docs/voice/` |
| How do I run the browser E2E demo? | [`docs/testing/E2E_BROWSER_VOICE.md`](docs/testing/E2E_BROWSER_VOICE.md) (KAN-17) |
