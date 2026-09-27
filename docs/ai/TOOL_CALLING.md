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
| `cancelAppointment` / `cancelAppointmentTool` | `src/services/cancelService.ts`, `src/tools/appointmentTools.ts` | Single appointment + patient verify + policy + `confirmed=true`. Outcomes `cancelled` \| `needs_confirmation` \| `not_found` \| `multiple_matches` \| `already_cancelled` \| `not_permitted` \| `failed` (KAN-70) |
| `rescheduleAppointment` / `rescheduleAppointmentTool` | `src/services/rescheduleService.ts`, `src/tools/appointmentTools.ts` | Same row; new slot via `checkAvailability` + confirmation; stale mid-flow candidates rejected. Outcomes `rescheduled` \| `needs_confirmation` \| `not_found` \| `not_permitted` \| `slot_unavailable` \| `stale_candidate` \| `failed` (KAN-71) |
| `lookupAppointment` | `src/tools/appointmentTools.ts` | Deprecated placeholder |

## Intended tools (to implement)

| Tool | Must |
| ---- | ---- |
| _(done)_ | Appointment HTTP APIs + Postman (KAN-72) |
| _(done)_ | Voice appointment tool loop (KAN-111) |

## Contract

1. Tools are the only path to mutate or assert appointment data.
2. Appointment tool wrappers emit `TOOL_CALLED` / `TOOL_FAILED` when `ctx.callId` is passed (KAN-73).
3. LLM must surface tool errors honestly to the user.
4. Patient identity for the browser POC: ask the user for **phone** first. Missing phone → `ValidationError`. Unknown phone without name → `needs_name` (ask for name, then register).

## LLM tool loop on voice turn (KAN-111)

`src/ai/llmTools.ts` defines OpenAI tools aligned with appointment APIs (`identify_patient`, `search_doctor`, `resolve_datetime`, `check_availability`, `get_appointment`, `book_appointment`, `cancel_appointment`, `reschedule_appointment`).

`runAppointmentToolLoop` (`src/ai/appointmentToolLoop.ts`) is used by `VoicePipelineService` on `/api/voice/turn`:

1. LLM may return `toolCalls`.
2. `executeAppointmentToolCall` runs the matching `appointmentTools` entry (with optional `callId`).
3. Tool JSON is fed back as OpenAI `tool` messages until a final text reply (max 6 rounds).
4. Mutating tools only persist when `confirmed: true`.
5. **KAN-112 safety:** `gateMutateToolArguments` clears `confirmed=true` unless the latest user utterance is an explicit multilingual confirm; `guardAppointmentReply` fail-closes invented success claims.

Never treat a model tool suggestion alone as a confirmed booking — only tool/DB outcomes.

## Logging

Appointment tools (`checkAvailability`, `bookAppointment`, `cancelAppointment`, `rescheduleAppointment`) accept optional `{ callId }` and write `call_events`:

| Event | When |
| ----- | ---- |
| `TOOL_CALLED` | Tool completed with a non-`failed` outcome (includes `booked`, `available`, `needs_confirmation`, …) |
| `TOOL_FAILED` | Outcome `failed`, or thrown validation/DB error before completion |

Metadata shape (redacted): `{ kind: "appointment_tool", tool, outcome, appointmentId?, message? }`. No API keys, connection strings, or raw SQL.