# Database Schema

Source of truth: `migrations/*.sql` (applied in filename order by `npm run db:migrate`).

- `001_init.sql` — core POC tables
- `003_patients_phone_not_unique.sql` — KAN-64: drop unique phone so one number can have multiple patients

## Enums

| Enum | Values |
| ---- | ------ |
| `appointment_status` | SCHEDULED, CANCELLED, COMPLETED, RESCHEDULED |
| `doctor_availability_status` | AVAILABLE, ON_LEAVE, UNAVAILABLE |
| `call_status` | ACTIVE, COMPLETED, FAILED, TRANSFERRED |
| `conversation_state_name` | ACTIVE_CONVERSATION, USER_REQUESTED_WAIT, WAITING_FOR_USER, CALLER_RETURNED, HUMAN_HANDOFF, CALL_COMPLETED |
| `call_event_type` | CALL_STARTED, USER_SPEECH, AGENT_RESPONSE, LANGUAGE_CHANGED, INTERRUPTION, WAIT_STARTED, CALLER_RETURNED, TOOL_CALLED, TOOL_FAILED, HUMAN_HANDOFF, CALL_ENDED |

## Tables

### `patients`

| Column | Notes |
| ------ | ----- |
| id | UUID PK |
| name, phone, email | phone **not unique** (KAN-64: multiple patients per phone; POC asks for number) |
| preferred_language | default `en` |

Indexes: `phone`, `name` (lookup for `getPatient` / `identifyPatient`).

### `doctors`

| Column | Notes |
| ------ | ----- |
| id | UUID PK |
| name, specialization | |
| department | required (Sprint 4); backfilled from specialization when upgrading |
| gender | optional preference field |
| availability_status | `AVAILABLE` / `ON_LEAVE` / `UNAVAILABLE` |
| working_hours | JSONB weekday → `{ start, end }` |

### `appointments`

| Column | Notes |
| ------ | ----- |
| patient_id, doctor_id | FKs |
| appointment_date, appointment_time | |
| status | `appointment_status` |

Partial unique index `idx_appointments_doctor_slot_scheduled`: one **SCHEDULED** row per doctor + date + time (cancelled/rescheduled history may reuse the slot).

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

## Seed (KAN-104)

```bash
npm run db:up
npm run db:migrate
npm run db:seed
```

- Loads demo Indian patients (`+1555…` phones only) and Saket Hospital, Jaipur doctor/department fixtures (public listings from https://www.sakethospital.in/our-doctors/), working hours, open and fully booked days, plus cancel/reschedule fixtures.
- **Idempotent:** skips when marker patient phone `+15550001001` already exists.
- **Reset:** `npm run db:seed -- --reset` (or `SEED_RESET=1`) truncates appointment-related tables and reloads sample data (local/demo only).

See README **Database** section for the demo inventory.

## Appointments question cheatsheet

> “Which tables are used for appointments?” → `appointments`, plus `patients` and `doctors` via FKs. Availability logic must also consider `doctors.working_hours` and skip doctors with `availability_status` other than `AVAILABLE`.
