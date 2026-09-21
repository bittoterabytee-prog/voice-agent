# Services

| Service | Path | Role |
| ------- | ---- | ---- |
| CallService | `src/services/callService.ts` | Create ACTIVE call with caller number + language |
| ConversationService | `src/conversation/conversationService.ts` | In-memory turn buffer |
| LlmService | `src/ai/llmService.ts` | OpenAI chat completions via `getConfig().llm` (KAN-12) |
| SttService | `src/voice/sttService.ts` | OpenAI Whisper transcription via `getConfig().stt` (KAN-11) |
| TtsService | `src/voice/ttsService.ts` | OpenAI speech synthesis via `getConfig().tts` (KAN-13) |
| VoiceService | `src/voice/voiceService.ts` | Browser session init requiring STT+TTS config |

## Repositories (data services)

| Repository | Entity |
| ---------- | ------ |
| `patientRepository` | patients |
| `doctorRepository` | doctors |
| `appointmentRepository` | appointments |
| `callRepository` | calls |
| `conversationStateRepository` | conversation_states |
| `callEventRepository` | call_events |
| `conversationRepository` | in-memory conversation ids (legacy/scaffold) |

## Tools

| Tool | Path | Notes |
| ---- | ---- | ----- |
| `lookupAppointment` | `src/tools/appointmentTools.ts` | Placeholder; must later query backend only |

**Rule:** Services and tools must use `getConfig()` for credentials, never hardcode secrets.
