# Tool Calling

## Current tools

| Name | File | Behavior |
| ---- | ---- | -------- |
| `identifyPatient` / `getPatient` / `getPatientTool` | `src/services/patientService.ts`, `src/tools/appointmentTools.ts` | POC: **ask for phone** (no call ANI). Outcomes `found` \| `multiple_matches` \| `needs_name` \| `registered`. One phone may have many patients; unknown phone + name registers (KAN-64) |
| `searchDoctor` / `searchDoctorTool` | `src/services/doctorService.ts`, `src/tools/appointmentTools.ts` | Search by name / specialty / department / gender. Outcomes `found` \| `multiple_matches` \| `not_found` \| `unavailable`. Never invents doctors (KAN-65) |
| `resolveDateTime` / `resolveDateTimeTool` | `src/services/dateTimeResolver.ts`, `src/tools/appointmentTools.ts` | Resolve relative / part-of-day / calendar phrases in Asia/Kolkata. Outcomes `resolved` \| `ambiguous` (KAN-66) |
| `checkAvailability` / `checkAvailabilityTool` | `src/services/availabilityService.ts`, `src/tools/appointmentTools.ts` | Real slots from `working_hours` minus SCHEDULED; alternatives when empty; never invent (KAN-67) |
| `getAppointment` / `getAppointmentTool` | `src/services/appointmentLookupService.ts`, `src/tools/appointmentTools.ts` | By id or patient + criteria. Outcomes `found` \| `not_found` \| `multiple_matches`. Read-only; `isActive` only when SCHEDULED (KAN-68) |
| `bookAppointment` / `bookAppointmentTool` | `src/services/bookingService.ts`, `src/tools/appointmentTools.ts` | Persist only when `confirmed=true` and slot is open via `checkAvailability`. Outcomes `booked` \| `needs_confirmation` \| `slot_unavailable` \| `failed`. `sendConfirmation` stub after success (KAN-69) |
| `lookupAppointment` | `src/tools/appointmentTools.ts` | Deprecated placeholder |

## Intended tools (to implement)

| Tool | Must |
| ---- | ---- |
| `cancelAppointment` / `rescheduleAppointment` | Update status via repository; resolve target via `getAppointment` |

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
