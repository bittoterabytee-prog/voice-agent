# Agent guide

Before changing this repo, read:

1. [`PROJECT_RULES.md`](PROJECT_RULES.md)
2. [`ARCHITECTURE.md`](ARCHITECTURE.md)
3. [`SYSTEM_FLOW.md`](SYSTEM_FLOW.md)
4. Backend product requirements (SRD): [`docs/backend/SRD_BACKEND.md`](docs/backend/SRD_BACKEND.md)
5. Sprint plan (current sprint + roadmap): [`docs/process/SPRINT_PLAN.md`](docs/process/SPRINT_PLAN.md)
6. Topic docs under [`docs/`](docs/)
7. MCP setup: [`docs/mcp/MCP_SETUP.md`](docs/mcp/MCP_SETUP.md)
8. Ticket standards: [`docs/process/TICKET_STANDARDS.md`](docs/process/TICKET_STANDARDS.md)
9. Branch & PR workflow: [`docs/process/BRANCH_AND_PR.md`](docs/process/BRANCH_AND_PR.md)
10. Postman APIs: [`docs/process/POSTMAN.md`](docs/process/POSTMAN.md) + [`postman/`](postman/) — update the collection when adding HTTP routes

Prefer repository docs + source over assumptions. Backend availability is the source of truth for appointments.

When creating or updating Jira tickets, always include **High-Level Flow**, **Description**, **Test Cases**, and **Acceptance Criteria** per the ticket standards, align backend scope with [`docs/backend/SRD_BACKEND.md`](docs/backend/SRD_BACKEND.md), and place work in the **current sprint** from [`docs/process/SPRINT_PLAN.md`](docs/process/SPRINT_PLAN.md).

### Starting implementation work

1. If no Jira key is provided, **ask for the ticket number** before coding.
2. Create a branch: `feat/{KEY}-{short-title}`, `fix/{KEY}-{short-title}`, or `bugfix/{KEY}-{short-title}`.
3. When pushing shared work, **open a pull request** (do not only push the branch). See [`BRANCH_AND_PR.md`](docs/process/BRANCH_AND_PR.md).

### Required on every change

1. **Check ticket test cases** — map each TC / acceptance criterion to work or an explicit “N/A” with reason.
2. **Add or update tests** under `tests/` for new/changed behavior; run `npm test` before opening the PR.
3. **Update knowledge** — keep `docs/` and root architecture/flow/rules docs accurate for whatever you changed (APIs, flows, config, schema, voice, process).
4. **Update Postman** — if you add/change HTTP routes under `src/routes/`, update `postman/Voice-Agent-API.postman_collection.json` with Success/Fail examples in the same change (see [`docs/process/POSTMAN.md`](docs/process/POSTMAN.md)).
5. Do not treat docs, tests, or Postman as optional follow-ups.
