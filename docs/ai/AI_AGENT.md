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
| LLM adapter | `src/ai/llmService.ts` | Stub (config required; fail-closed) |
| Tools | `src/tools/appointmentTools.ts` | Placeholder lookup |
| Config | `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY` | Via `getConfig().llm` |

## Guardrails

- No medical diagnosis
- Identify as AI when asked
- Confirm booking only after successful persistence
