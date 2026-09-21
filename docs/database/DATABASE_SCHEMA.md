# Database Schema

Source of truth: `migrations/001_init.sql`.

## Enums

| Enum | Values |
| ---- | ------ |
| `appointment_status` | SCHEDULED, CANCELLED, COMPLETED, RESCHEDULED |
| `call_status` | ACTIVE, COMPLETED, FAILED, TRANSFERRED |
| `conversation_state_name` | ACTIVE_CONVERSATION, USER_REQUESTED_WAIT, WAITING_FOR_USER, CALLER_RETURNED, HUMAN_HANDOFF, CALL_COMPLETED |
| `call_event_type` | CALL_STARTED, USER_SPEECH, AGENT_RESPONSE, LANGUAGE_CHANGED, INTERRUPTION, WAIT_STARTED, CALLER_RETURNED, TOOL_CALLED, TOOL_FAILED, HUMAN_HANDOFF, CALL_ENDED |

## Tables

### `patients`

| Column | Notes |
| ------ | ----- |
| id | UUID PK |
| name, phone, email | phone UNIQUE |
| preferred_language | default `en` |

### `doctors`

| Column | Notes |
| ------ | ----- |
| id | UUID PK |
| name, specialization | |
| working_hours | JSONB |

### `appointments`

| Column | Notes |
| ------ | ----- |
| patient_id, doctor_id | FKs |
| appointment_date, appointment_time | |
| status | `appointment_status` |

### `calls`

| Column | Notes |
| ------ | ----- |
| caller_number, language | |
| start_time, end_time | |
| status | `call_status` |

### `conversation_states`

| Column | Notes |
| ------ | ----- |
| call_id | UNIQUE FK → calls |
| current_state, language, intent | |

### `call_events`

| Column | Notes |
| ------ | ----- |
| call_id | FK → calls |
| event_type, metadata | append-only JSONB metadata |

## Migrations

- Applied by `npm run db:migrate` (`src/db/migrate.ts`)
- Tracked in `schema_migrations`
- **Never** change schema without a new SQL migration file

## Appointments question cheatsheet

> “Which tables are used for appointments?” → `appointments`, plus `patients` and `doctors` via FKs. Availability logic must also consider `doctors.working_hours`.
