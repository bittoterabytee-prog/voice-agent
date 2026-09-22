# Data Flow

## Write paths

| Action | Flow |
| ------ | ---- |
| Start session/call | `callService` → `callRepository.create` → `calls` |
| Upsert dialog state | `conversationStateRepository.upsert` → `conversation_states` |
| Append event | `callEventRepository.create` → `call_events` |
| Create appointment | `appointmentRepository.create` → `appointments` |
| Seed demo data | `src/db/seed.ts` |

## Read paths

| Action | Flow |
| ------ | ---- |
| Find patient by phone | `patientRepository` → `patients` (unique phone) |
| Doctor hours | `doctorRepository` → `doctors.working_hours` JSONB |
| Appointment by id | `appointmentRepository.findById` |
| State by call | `conversationStateRepository.findByCallId` |

## In-memory vs durable

| Data | Storage |
| ---- | ------- |
| Turn-by-turn messages | `ConversationService` map + `call_events` (`USER_SPEECH` / `AGENT_RESPONSE`) for rehydrate |
| Session start / wait / resume | `SessionService` → `calls` + `conversation_states` + `call_events` |
| State machine + events | PostgreSQL |
| Call metadata | PostgreSQL `calls` |

## RAG data (planned)

Embeddings / clinic knowledge → Qdrant (`VECTOR_DB_URL`). Embedding model from `EMBEDDING_MODEL`. See [`docs/ai/RAG.md`](../ai/RAG.md).
