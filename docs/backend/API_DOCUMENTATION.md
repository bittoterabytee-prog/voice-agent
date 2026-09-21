# API Documentation

## Current endpoints

### `GET /health`

**Purpose:** Liveness check for local/Docker verification.

**Response `200`:**

```json
{ "status": "ok" }
```

No authentication.

## Planned / domain APIs (not yet exposed)

These behaviors exist at the repository/service layer and will be wrapped by HTTP or tool-calling as needed:

| Capability | Backend entry |
| ---------- | ------------- |
| Start call/session | `callService.startCall` |
| Persist conversation state | `conversationStateRepository` |
| Create/find appointment | `appointmentRepository` |
| Patient / doctor CRUD | respective repositories |
| Appointment tool for LLM | `lookupAppointment` in `appointmentTools.ts` |

## Error shape

Unhandled/`AppError` responses go through `errorHandler` and must not include secrets or raw provider payloads.
