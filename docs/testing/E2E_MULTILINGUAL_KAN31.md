# Multilingual E2E flow (KAN-31)

Prove Sprint 3 end-to-end: **mic → `/calls` → session → `/api/voice/turn` → language detect/switch → LLM/TTS → UI language indicator**, for English, Hindi, mid-call EN→HI→EN, and Hinglish. **No appointment booking.**

Jira: [KAN-31](https://voiceagentai.atlassian.net/browse/KAN-31)  
Depends on: KAN-23–30 (pipeline) + [KAN-29](https://voiceagentai.atlassian.net/browse/KAN-29) (UI) + [PR #20](https://github.com/bittoterabytee-prog/voice-agent/pull/20) (switch/STT hardening).

Companion Sprint 2 English runbook: [`E2E_SPRINT2_KAN17.md`](E2E_SPRINT2_KAN17.md).

---

## Ports

| Service | URL |
| ------- | --- |
| Backend API | `http://localhost:3000` |
| Frontend `/calls` | `http://localhost:5173/calls` or `http://localhost:5174/calls` |

CORS defaults allow `localhost` and `127.0.0.1` on Vite ports 5173/5174.

---

## Preconditions

| Item | Expected |
| ---- | -------- |
| Backend | `origin/main` with Sprint 3 + PR #20; Postgres up; STT/LLM/TTS keys set |
| Frontend | `origin/main` with KAN-29; `VITE_API_BASE_URL=http://localhost:3000` |
| Scope | Browser only — **no telephony**, **no real booking** |

---

## Pipeline (already wired)

```mermaid
sequenceDiagram
  participant Op as Operator
  participant UI as /calls
  participant API as Backend

  Op->>UI: Start
  UI->>API: POST /api/sessions (language=en)
  API-->>UI: callId, language
  Note over UI: Language indicator seeds English (en)
  Op->>UI: Speak + Send turn
  UI->>API: POST /api/voice/turn (callId, languageHint)
  API-->>UI: transcript, replyText, language, languageChanged, audioBase64
  Note over UI: Update indicator; show switch notice when languageChanged
  Op->>UI: Stop
  UI->>API: POST /api/sessions/:callId/complete
```

Verify `LANGUAGE_CHANGED` via Call History events or:

```bash
curl http://localhost:3000/api/sessions/<callId>/events
```

---

## Demo checklist (KAN-31 TCs)

| ID | Steps | Pass when |
| -- | ----- | --------- |
| TC-001 English E2E | Start → speak English → Send turn | STT transcript English; reply + TTS English; UI shows `English (en)`; `languageChanged=false` |
| TC-002 Hindi E2E | Same session or new: speak Hindi / “speak in Hindi” then Hindi | Reply + TTS in Hindi; UI shows `Hindi (hi)`; optional switch notice |
| TC-003 Mid-call EN→HI→EN | English turn → Hindi (or “speak in Hindi”) → English again | Same `callId`; context retained in replies; ≥1 `LANGUAGE_CHANGED` event; UI tracks language |
| TC-004 Hinglish | Mixed utterance (e.g. “Mujhe appointment chahiye tomorrow”) | Coherent single-engine reply; UI may show `Hinglish`; TTS uses hinglish voice path |
| UI language | Watch Language field on `/calls` | Updates after each clear detection; notice on switch |
| Logged changes | Events API or Call History | `LANGUAGE_CHANGED` with `from` / `to` when preference changes |
| Out of scope | Ask to book a real slot | Agent must not invent confirmed bookings (Sprint 4 tools) |

---

## Automated coverage

| Layer | Where |
| ----- | ----- |
| BE switch + context | `voice-agent` `tests/languageSwitching.test.ts` (incl. EN→HI→EN) |
| BE detection / STT / fallback | `languageDetection`, `stt`, `multilingualFallback`, … |
| FE indicator | `voice-agent-frontend` `tests/VoiceAgentPanel.test.tsx` (KAN-29 + Hinglish) |

```bash
# backend
cd voice-agent && npm test -- --run tests/languageSwitching.test.ts

# frontend
cd voice-agent-frontend && npm test -- --run tests/VoiceAgentPanel.test.tsx
```

---

## Blockers

1. Stale local `voice-agent` checkout (must include PR #20).
2. Missing STT/LLM/TTS keys or Postgres.
3. CORS Origin mismatch (`127.0.0.1` vs `localhost`) — restart BE after CORS defaults that include both.

---

## After demo

Mark [KAN-31](https://voiceagentai.atlassian.net/browse/KAN-31) Done. Scenario expansion (300 cases) is [KAN-32](https://voiceagentai.atlassian.net/browse/KAN-32).
