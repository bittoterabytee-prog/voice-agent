# Tool Calling

## Current tools

| Name | File | Behavior |
| ---- | ---- | -------- |
| `identifyPatient` / `getPatient` / `getPatientTool` | `src/services/patientService.ts`, `src/tools/appointmentTools.ts` | POC: **ask for phone** (no call ANI). Outcomes `found` \| `multiple_matches` \| `needs_name` \| `registered`. One phone may have many patients; unknown phone + name registers (KAN-64) |
| `lookupAppointment` | `src/tools/appointmentTools.ts` | Returns placeholder `found: false` |

## Intended tools (to implement)

| Tool | Must |
| ---- | ---- |
| `searchDoctor` | Query doctors by name/specialty/department; never invent |
| `checkAvailability` | Query doctors + appointments; never invent slots |
| `bookAppointment` | Persist only after confirmation + success |
| `cancelAppointment` / `rescheduleAppointment` | Update status via repository |
| `getAppointment` | Fetch existing appointment(s) |

## Contract

1. Tools are the only path to mutate or assert appointment data.
2. Tool failures emit `TOOL_FAILED` call events when wired.
3. LLM must surface tool errors honestly to the user.
4. Patient identity for the browser POC: ask the user for **phone** first. Missing phone → `ValidationError`. Unknown phone without name → `needs_name` (ask for name, then register).

## LLM tool-calling prep (KAN-12)

`src/ai/llmTools.ts` exports OpenAI-style definitions (`check_availability`, `book_appointment`, `lookup_appointment`).
`LlmService.complete({ enableTools: true })` attaches them to the chat request and may return `toolCalls` with parsed arguments.

**Not yet in this ticket:** executing those tool calls or looping tool results back into the model. Callers must still invoke `src/tools/*` (or future tool runners) against PostgreSQL — never treat a model tool suggestion as a confirmed booking.

## Logging

Successful tool use → `call_events.event_type = TOOL_CALLED` with safe metadata (no secrets).
