# AI Voice Agent Backend

Backend foundation for the AI Voice Agent POC ([KAN-5](https://voiceagentai.atlassian.net/browse/KAN-5), [KAN-7](https://voiceagentai.atlassian.net/browse/KAN-7), [KAN-8](https://voiceagentai.atlassian.net/browse/KAN-8), [KAN-9](https://voiceagentai.atlassian.net/browse/KAN-9)).

The API is the central application layer for calls, conversation state, AI/LLM integrations, browser STT/TTS, appointment tools, and PostgreSQL persistence.

**Project knowledge for AI/MCP clients:** [`ARCHITECTURE.md`](ARCHITECTURE.md) · [`SYSTEM_FLOW.md`](SYSTEM_FLOW.md) · [`PROJECT_RULES.md`](PROJECT_RULES.md) · [`docs/`](docs/) · [MCP setup](docs/mcp/MCP_SETUP.md) · [Ticket standards](docs/process/TICKET_STANDARDS.md) · [Branch & PR](docs/process/BRANCH_AND_PR.md)

## Stack

- Node.js 20+
- TypeScript
- Express
- PostgreSQL 16

## Project structure

```
src/
├── config/           Centralized env loading, validation, and typed config
├── controllers/      HTTP handlers
├── routes/           Route registration
├── services/         Call and domain services
├── middleware/       Request logging and error handling
├── models/           Domain types
├── repositories/     PostgreSQL data access
├── integrations/     External HTTP clients
├── ai/               LLM provider layer
├── voice/            Browser STT/TTS (no telephony)
├── conversation/     In-call conversation turns
├── tools/            Appointment and other agent tools
├── db/               Connection, migrations, and seed
├── utils/            Logger and error types
├── app.ts            Express application factory
└── index.ts          Process entrypoint
docs/                 Architecture, API, DB, AI, voice, MCP knowledge base
postman/              Postman collection + local environment (KAN-21)
migrations/           SQL schema migrations
tests/                Unit and database tests
```

Root knowledge files: `ARCHITECTURE.md`, `SYSTEM_FLOW.md`, `PROJECT_RULES.md`, `AGENTS.md`.

> The browser UI lives in a **separate frontend repository**. This repo is backend-only.

## Local setup

1. Install Node.js 20 or later and Docker.
2. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

   Optionally add an environment overlay (loaded after `.env`):

   ```bash
   cp .env.example .env.development
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

   Or import the Postman collection: [`postman/`](postman/) — see [`docs/process/POSTMAN.md`](docs/process/POSTMAN.md).

Expected response:

```json
{
  "status": "ok"
}
```

The process fails at startup if `APP_ENV` / `NODE_ENV` is missing, `DATABASE_URL` is missing, or PostgreSQL is unreachable.

## Configuration

All services read settings through `src/config` (never scatter `process.env` reads). Frontend env/config belongs in the separate frontend repository.

Sensitive credentials stay in local `.env` / `.env.<APP_ENV>` files (gitignored). `.env.example` contains placeholders only.

| Variable            | Required | Description                                      |
| ------------------- | -------- | ------------------------------------------------ |
| `APP_ENV`           | yes\*    | `development`, `test`, `production`, or `demo`   |
| `APP_NAME`          | no       | Service name (default `voice-agent`)             |
| `APP_PORT`          | no       | HTTP port (default `3000`; `PORT` also accepted) |
| `LOG_LEVEL`         | no       | Pino log level (default `info`)                  |
| `CORS_ORIGINS`      | no       | Comma-separated browser Origins (or `*`). Non-production default: `http://localhost:5173,http://localhost:5174`. Production default: empty (no CORS) |
| `DATABASE_URL`      | yes\*\*  | PostgreSQL connection string                     |
| `LLM_PROVIDER`      | no       | LLM vendor id                                    |
| `LLM_MODEL`         | no       | Model name                                       |
| `LLM_API_KEY`       | no       | LLM API key                                      |
| `STT_PROVIDER`      | no       | Speech-to-text provider (browser POC)            |
| `STT_MODEL`         | no       | STT model                                        |
| `STT_API_KEY`       | no       | STT API key                                      |
| `TTS_PROVIDER`      | no       | Text-to-speech provider (browser POC)            |
| `TTS_MODEL`         | no       | TTS model                                        |
| `TTS_API_KEY`       | no       | TTS API key                                      |
| `VECTOR_DB_URL`     | no       | Qdrant URL (local default `http://localhost:6333`) |
| `VECTOR_DB_API_KEY` | no       | Vector DB API key (optional for local Qdrant)      |
| `EMBEDDING_MODEL`   | no       | Embedding model name                               |

\*`NODE_ENV` is accepted as a fallback for `APP_ENV` (`development` \| `test` \| `production`).  
\*\*Required to start the server. HTTP unit tests can run without it.

No telephony phone numbers or voice-carrier credentials are required for this browser-based POC.

Invalid or missing required values fail startup with a clear configuration error.

## Browser E2E demo (KAN-17)

Run backend + frontend for a multi-turn voice conversation:

→ Full checklist and API cheat sheet: [`docs/testing/E2E_BROWSER_VOICE.md`](docs/testing/E2E_BROWSER_VOICE.md)

Quick path: `npm run deps:up && npm run db:migrate && npm run dev` (API `:3000`), open frontend **`http://localhost:5174/calls`**, confirm System Status Healthy, then Start → speak → Send turn (twice) → Stop.

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
| `npm run vector:up`  | Start local Qdrant           |
| `npm run deps:up`    | Start PostgreSQL and Qdrant  |
| `npm run db:migrate` | Apply SQL migrations         |
| `npm run db:seed`    | Load sample development data |

Database integration tests always run. They use `DATABASE_URL` when PostgreSQL is reachable, otherwise they start a local Postgres-compatible test database.

## Docker

```bash
docker compose up -d postgres qdrant
docker build -t voice-agent-backend .
docker run --rm -p 3000:3000 --env-file .env voice-agent-backend
```

Local Qdrant dashboard/API: http://localhost:6333/dashboard

## MCP (repository knowledge)

To connect Cursor (or another MCP client) to this GitHub repo in **read-only** mode, follow [`docs/mcp/MCP_SETUP.md`](docs/mcp/MCP_SETUP.md).

```bash
cp .cursor/mcp.json.example .cursor/mcp.json
# set YOUR_GITHUB_PAT, then restart Cursor
```
