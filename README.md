# AI Voice Agent Backend

Backend foundation for the AI Voice Agent POC ([KAN-5](https://voiceagentai.atlassian.net/browse/KAN-5), [KAN-7](https://voiceagentai.atlassian.net/browse/KAN-7)).

The API is the central application layer for calls, conversation state, AI/LLM integrations, voice/telephony providers, appointment tools, and PostgreSQL persistence.

## Stack

- Node.js 20+
- TypeScript
- Express
- PostgreSQL 16

## Project structure

```
src/
├── config/           Environment loading and validation
├── controllers/      HTTP handlers
├── routes/           Route registration
├── services/         Call and domain services
├── middleware/       Request logging and error handling
├── models/           Domain types
├── repositories/     PostgreSQL data access
├── integrations/     External HTTP clients
├── ai/               LLM provider layer
├── voice/            Voice/telephony provider layer
├── conversation/     In-call conversation turns
├── tools/            Appointment and other agent tools
├── db/               Connection, migrations, and seed
├── utils/            Logger and error types
├── app.ts            Express application factory
└── index.ts          Process entrypoint
migrations/           SQL schema migrations
tests/                Unit and database tests
```

## Local setup

1. Install Node.js 20 or later and Docker.
2. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Start PostgreSQL:

   ```bash
   npm run db:up
   ```

5. Run migrations and optional sample data:

   ```bash
   npm run db:migrate
   npm run db:seed
   ```

6. Start the API:

   ```bash
   npm run dev
   ```

7. Check health:

   ```bash
   curl http://localhost:3000/health
   ```

Expected response:

```json
{
  "status": "ok"
}
```

The process fails at startup if `DATABASE_URL` is missing or PostgreSQL is unreachable.

## Database

PostgreSQL is the source of truth for patients, doctors, appointments, calls, conversation state, and call events.

| Entity                | Notes                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------- |
| `patients`            | Unique phone number                                                                   |
| `doctors`             | `working_hours` stored as JSON                                                        |
| `appointments`        | FK to patient and doctor; status `SCHEDULED`, `CANCELLED`, `COMPLETED`, `RESCHEDULED` |
| `calls`               | Status `ACTIVE`, `COMPLETED`, `FAILED`, `TRANSFERRED`                                 |
| `conversation_states` | One row per call; updated as the dialog moves                                         |
| `call_events`         | Append-only event log with JSON metadata                                              |

Invalid foreign keys are rejected by PostgreSQL and mapped to `INVALID_RELATIONSHIP`.

## Scripts

| Command              | Description                  |
| -------------------- | ---------------------------- |
| `npm run dev`        | Start with reload            |
| `npm run build`      | Compile TypeScript           |
| `npm start`          | Run the compiled server      |
| `npm test`           | Run tests                    |
| `npm run lint`       | Lint TypeScript              |
| `npm run format`     | Format files                 |
| `npm run db:up`      | Start local PostgreSQL       |
| `npm run db:migrate` | Apply SQL migrations         |
| `npm run db:seed`    | Load sample development data |

Database integration tests always run. They use `DATABASE_URL` when PostgreSQL is reachable, otherwise they start a local Postgres-compatible test database.

## Configuration

Required variables are validated at startup. Missing or invalid values fail with a clear configuration error instead of a silent crash.

| Variable                 | Required | Description                            |
| ------------------------ | -------- | -------------------------------------- |
| `NODE_ENV`               | yes      | `development`, `test`, or `production` |
| `DATABASE_URL`           | yes\*    | PostgreSQL connection string           |
| `PORT`                   | no       | HTTP port (default `3000`)             |
| `LOG_LEVEL`              | no       | Pino log level (default `info`)        |
| `LLM_API_KEY`            | no       | LLM provider key                       |
| `VOICE_PROVIDER_API_KEY` | no       | Voice provider key                     |

\*Required to start the server. HTTP unit tests can run without it.

Do not commit `.env` or real database passwords.

## Docker

```bash
docker compose up -d postgres
docker build -t voice-agent-backend .
docker run --rm -p 3000:3000 --env-file .env voice-agent-backend
```
