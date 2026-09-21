# Voice conversation backlog

Stories for the browser voice conversation slice. Created following [`TICKET_STANDARDS.md`](TICKET_STANDARDS.md).

| # | Summary | Owner | Jira |
| - | ------- | ----- | ---- |
| 7 | Implement Browser Microphone & Audio Capture | Frontend | [KAN-10](https://voiceagentai.atlassian.net/browse/KAN-10) |
| 8 | Implement Speech-to-Text Integration | Backend/AI | [KAN-11](https://voiceagentai.atlassian.net/browse/KAN-11) (PR: `feat/KAN-11-speech-to-text-integration`) |
| 9 | Implement LLM Conversation Service | Backend/AI | [KAN-12](https://voiceagentai.atlassian.net/browse/KAN-12) |
| 10 | Implement Text-to-Speech Integration | Backend/AI | [KAN-13](https://voiceagentai.atlassian.net/browse/KAN-13) |
| 11 | Implement Real-Time Voice Conversation Pipeline | Backend | [KAN-14](https://voiceagentai.atlassian.net/browse/KAN-14) |
| 12 | Implement Conversation Session & Context Management | Backend | [KAN-15](https://voiceagentai.atlassian.net/browse/KAN-15) |
| 13 | Implement Voice Agent UI | Frontend | [KAN-16](https://voiceagentai.atlassian.net/browse/KAN-16) |
| 14 | Implement End-to-End Browser Voice Conversation | Full Stack | [KAN-17](https://voiceagentai.atlassian.net/browse/KAN-17) |
| 15 | Add Voice Pipeline Logging & Error Handling | Backend | [KAN-18](https://voiceagentai.atlassian.net/browse/KAN-18) |

Frontend work is implemented in the **separate frontend repository**; backend work in this repo (`voice-agent`).

Suggested dependency order: **KAN-10 → KAN-11/12/13 → KAN-15 → KAN-14 → KAN-16 → KAN-17**, with **KAN-18** in parallel once the pipeline exists.

Each ticket includes: **Purpose/Description**, **High-Level Flow**, **Test Cases**, **Acceptance Criteria** (plus Scope / Dependencies / Definition of Done).
