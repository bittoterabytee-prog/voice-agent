# AI Agent

The agent layer sits between STT text input and TTS audio output.

## Responsibilities

- Interpret user intent (scheduling, wait, FAQ, handoff)
- Call tools for availability/booking (never invent results)
- Produce assistant text responses
- Respect [`PROJECT_RULES.md`](../../PROJECT_RULES.md)

## Implementation

| Piece | Location | Status |
| ----- | -------- | ------ |
| LLM adapter | `src/ai/llmService.ts` | OpenAI chat completions via `getConfig().llm` (KAN-12) |
| System prompt | `src/ai/prompts.ts` | Clinic scheduling guardrails |
| Tool definitions (prep) | `src/ai/llmTools.ts` | OpenAI tool schemas; execution still backend-only |
| HTTP | `POST /api/llm/complete` | Text turn → assistant reply (+ optional `toolCalls`) |
| Tools (runtime) | `src/tools/appointmentTools.ts` | Placeholder lookup |
| Config | `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY` | Via `getConfig().llm` |

## HTTP API (KAN-12)

`POST /api/llm/complete`

```json
{
  "prompt": "I need an appointment",
  "messages": [{ "role": "user", "content": "prior turn..." }],
  "includeSystemPrompt": true,
  "enableTools": false
}
```

Response `200`:

```json
{ "text": "assistant reply", "toolCalls": [] }
```

`toolCalls` is omitted when empty. When `enableTools` is true, appointment tool definitions are sent to the provider; returned `toolCalls` are decisions only — they must be executed via backend tools, never treated as confirmed bookings.

## Guardrails

- No medical diagnosis
- Identify as AI when asked
- Confirm booking only after successful persistence
- Never invent appointment availability (prompt + tools docs)
