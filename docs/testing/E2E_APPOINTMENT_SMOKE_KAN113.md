# E2E appointment smoke (KAN-113)

Canonical runbook lives in the knowledge repo:

[`voice-agent-knowledge/docs/testing/E2E_APPOINTMENT_SMOKE_KAN113.md`](https://github.com/bittoterabytee-prog/voice-agent-knowledge/blob/main/docs/testing/E2E_APPOINTMENT_SMOKE_KAN113.md)

## Automated script (this repo)

```bash
# Backend listening on :3000; DATABASE_URL matches that server
npm run smoke:kan113
```

Script: `scripts/smoke-kan113-appointment.ts` — UI HTTP book path + voice tool-loop confirm book + failure/secret checks.
