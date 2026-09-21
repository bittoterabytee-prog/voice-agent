# MCP Setup (KAN-9)

Configure an MCP-compatible client (Cursor, VS Code, Claude Desktop, etc.) so an AI coding agent can **read** this repository’s code, docs, issues, and PRs.

## Goals

- Repository structure + source discovery
- Architecture docs under `docs/` and root `ARCHITECTURE.md` / `SYSTEM_FLOW.md` / `PROJECT_RULES.md`
- Backend product requirements: [`docs/backend/SRD_BACKEND.md`](../backend/SRD_BACKEND.md) (agents should not need the Google SRD re-shared for backend scope)
- Sprint plan / current To Do: [`docs/process/SPRINT_PLAN.md`](../process/SPRINT_PLAN.md)
- GitHub issues/PRs when needed
- **Read-only by default** (no accidental writes via MCP)

Official server: [github/github-mcp-server](https://github.com/github/github-mcp-server)

## Cursor (project-level)

1. Create a [GitHub Personal Access Token](https://github.com/settings/tokens) with **read** scopes for the private repo (typically `repo` for private repos; prefer fine-grained read-only contents/issues/PRs).
2. Copy the example config:

   ```bash
   cp .cursor/mcp.json.example .cursor/mcp.json
   ```

3. Replace `YOUR_GITHUB_PAT` in `.cursor/mcp.json` with your token (never commit the real token).
4. Restart Cursor (or reload MCP servers).
5. Open **Settings → MCP** and confirm the `github` server shows connected tools (read-only toolset).

`.cursor/mcp.json` is gitignored. `.cursor/mcp.json.example` is committed.

### Option A — Remote GitHub MCP (read-only URL) — recommended

Copy `.cursor/mcp.json.example` to `.cursor/mcp.json`. It uses
`https://api.githubcopilot.com/mcp/readonly` so write tools are not advertised.

### Option B — Local Docker (read-only flag)

```json
{
  "mcpServers": {
    "github": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "GITHUB_PERSONAL_ACCESS_TOKEN",
        "-e",
        "GITHUB_READ_ONLY=1",
        "-e",
        "GITHUB_TOOLSETS=repos,issues,pull_requests",
        "ghcr.io/github/github-mcp-server"
      ],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "YOUR_GITHUB_PAT"
      }
    }
  }
}
```

Requires Docker. Sets `GITHUB_READ_ONLY=1`.

## Verification checklist (test cases)

| ID | Check |
| -- | ----- |
| TC-001 | Client lists GitHub MCP tools after connect |
| TC-002 | Agent can describe repo structure / list files via MCP or workspace |
| TC-003 | Ask “Where is the appointment service?” → `src/tools/appointmentTools.ts` / repositories |
| TC-004 | Ask “Explain the end-to-end call flow” → uses `SYSTEM_FLOW.md` |
| TC-005 | Ask “Which file handles conversation state?” → `conversationStateRepository` + `conversationService` |
| TC-006 | Ask “Which tables are used for appointments?” → `docs/database/DATABASE_SCHEMA.md` |
| TC-007 | Booking changes must follow `PROJECT_RULES.md` (backend source of truth) |
| TC-008 | Attempted write via MCP should be unavailable in read-only mode |
| TC-010 | Ask “Explain how this project works” → `ARCHITECTURE.md` + `README.md` |
| TC-011 | Ask “What should the backend build for appointments?” → `docs/backend/SRD_BACKEND.md` |
| TC-012 | Ask to draft/update a backend Jira ticket → uses SRD + `TICKET_STANDARDS.md` + current sprint from `SPRINT_PLAN.md` |
| TC-013 | Ask “What sprint are we in?” → Sprint 2 Basic Voice Agent (`docs/process/SPRINT_PLAN.md`) |

## Security

- Do not put PATs in git, screenshots, or docs.
- `.env` remains gitignored; do not paste secrets into MCP prompts.
- Keep MCP read-only until the team explicitly enables write toolsets.

## Related docs

- [`ARCHITECTURE.md`](../../ARCHITECTURE.md)
- [`PROJECT_RULES.md`](../../PROJECT_RULES.md)
- [`SYSTEM_FLOW.md`](../../SYSTEM_FLOW.md)
- [`SPRINT_PLAN.md`](../process/SPRINT_PLAN.md)
- [`../backend/SRD_BACKEND.md`](../backend/SRD_BACKEND.md)
