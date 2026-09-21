# Branch & Pull Request Workflow

How agents and developers start work, name branches, and open PRs for this repository.

## Before coding

1. **Identify the Jira ticket.**
   - If the user already gave a key (e.g. `KAN-11`), use it.
   - If not, **ask for the Jira ticket number** before creating a branch or committing feature work.
2. Read the ticket (Purpose, High-Level Flow, Test Cases, Acceptance Criteria).
3. Confirm scope matches this **backend** repo (frontend work belongs in the separate frontend repo).

Do not start implementation on `main` for ticketed work. Always use a feature/fix branch.

## Branch naming

Use a prefix that matches the type of change, then a short kebab-case title derived from the ticket summary.

| Prefix | When to use |
| ------ | ----------- |
| `feat/` | New feature or capability |
| `fix/` | Correcting broken/incorrect behavior (non-urgent or general fix) |
| `bugfix/` | Defect / regression fix (prefer when the ticket is clearly a bug) |

### Format

```text
{prefix}/{jira-key}-{short-title}
```

- `{prefix}`: `feat` | `fix` | `bugfix`
- `{jira-key}`: e.g. `KAN-11` (lowercase key is also fine: `kan-11`)
- `{short-title}`: kebab-case, 3–8 words from the ticket title; no spaces

### Examples

| Ticket | Branch |
| ------ | ------ |
| KAN-11 Implement Speech-to-Text Integration | `feat/KAN-11-speech-to-text-integration` |
| KAN-18 Add Voice Pipeline Logging & Error Handling | `feat/KAN-18-voice-pipeline-logging` |
| Bug: STT returns empty on valid audio | `bugfix/KAN-XX-stt-empty-transcript` |
| Config validation rejects valid DATABASE_URL | `fix/KAN-XX-database-url-validation` |

### Rules

- One ticket → one branch (unless the ticket is split with agreement).
- Do not use vague names like `feat/updates` or `fix/stuff`.
- Do not commit secrets (`.env`, `.cursor/mcp.json`).

## Commits

- Prefer focused commits that match the ticket scope.
- Reference the Jira key in the commit message subject or body when practical, e.g. `feat(stt): wire OpenAI transcription (KAN-11)`.

## Push & pull request

When the work is ready to share (or the user asks to push / open a PR):

1. Push the branch with upstream tracking: `git push -u origin HEAD`
2. **Open a pull request** into `main` (default base unless told otherwise).
3. PR title and branch should stay aligned with the naming convention.

### PR title

```text
{prefix}: {Ticket title} ({JIRA-KEY})
```

Examples:

- `feat: Implement Speech-to-Text Integration (KAN-11)`
- `bugfix: Handle empty STT audio payload (KAN-XX)`
- `fix: Clarify DATABASE_URL validation error (KAN-XX)`

### PR body (minimum)

```markdown
## Summary
- <what changed and why>
- Jira: https://voiceagentai.atlassian.net/browse/{KEY}

## Test plan
- [ ] Unit/integration tests added or updated
- [ ] Manual check against ticket test cases / acceptance criteria
```

Use `gh pr create` when available. Link the Jira ticket in the summary.

## After merge

- Move/close the Jira ticket per team process (often **Done** after merge).
- Delete the remote branch if the host does not auto-delete.
- Update [`BACKLOG.md`](BACKLOG.md) status notes if useful.

## Quick checklist for agents

- [ ] Asked for / confirmed Jira ticket key
- [ ] Branch named `feat|fix|bugfix/{KEY}-{short-title}`
- [ ] Implementation matches ticket AC
- [ ] Tests updated
- [ ] Pushed branch **and** opened PR with matching title
- [ ] No secrets in the PR

## Related docs

- [`TICKET_STANDARDS.md`](TICKET_STANDARDS.md)
- [`BACKLOG.md`](BACKLOG.md)
- [`AGENTS.md`](../../AGENTS.md)
