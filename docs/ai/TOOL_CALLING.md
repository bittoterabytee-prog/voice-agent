# Tool Calling

## Current tools

| Name | File | Behavior |
| ---- | ---- | -------- |
| `lookupAppointment` | `src/tools/appointmentTools.ts` | Returns placeholder `found: false` |

## Intended tools (to implement)

| Tool | Must |
| ---- | ---- |
| check_availability | Query doctors + appointments; never invent slots |
| book_appointment | Persist only on success; return confirmation id |
| cancel_or_reschedule | Update status via repository |
| lookup_patient | By phone / name via `patientRepository` |

## Contract

1. Tools are the only path to mutate or assert appointment data.
2. Tool failures emit `TOOL_FAILED` call events when wired.
3. LLM must surface tool errors honestly to the user.

## Logging

Successful tool use → `call_events.event_type = TOOL_CALLED` with safe metadata (no secrets).
