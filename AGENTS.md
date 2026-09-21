# Agent guide

Before changing this repo, read:

1. [`PROJECT_RULES.md`](PROJECT_RULES.md)
2. [`ARCHITECTURE.md`](ARCHITECTURE.md)
3. [`SYSTEM_FLOW.md`](SYSTEM_FLOW.md)
4. Topic docs under [`docs/`](docs/)
5. MCP setup: [`docs/mcp/MCP_SETUP.md`](docs/mcp/MCP_SETUP.md)
6. Ticket standards: [`docs/process/TICKET_STANDARDS.md`](docs/process/TICKET_STANDARDS.md)
7. Branch & PR workflow: [`docs/process/BRANCH_AND_PR.md`](docs/process/BRANCH_AND_PR.md)

Prefer repository docs + source over assumptions. Backend availability is the source of truth for appointments.

When creating Jira tickets, always include **High-Level Flow**, **Description**, **Test Cases**, and **Acceptance Criteria** per the ticket standards.

### Starting implementation work

1. If no Jira key is provided, **ask for the ticket number** before coding.
2. Create a branch: `feat/{KEY}-{short-title}`, `fix/{KEY}-{short-title}`, or `bugfix/{KEY}-{short-title}`.
3. When pushing shared work, **open a pull request** (do not only push the branch). See [`BRANCH_AND_PR.md`](docs/process/BRANCH_AND_PR.md).
