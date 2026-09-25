# Sprint 3 multilingual scenario catalog (KAN-32)

Documented EN / HI / Hinglish / switch / fallback scenarios for Sprint 3. **Not** the Sprint 8 300-scenario suite. **No appointment booking.**

Jira: [KAN-32](https://voiceagentai.atlassian.net/browse/KAN-32)  
Jira: [KAN-32](https://voiceagentai.atlassian.net/browse/KAN-32)  
Manual E2E: [`E2E_MULTILINGUAL_KAN31.md`](E2E_MULTILINGUAL_KAN31.md)  
Sprint 2 English baseline: [`E2E_SPRINT2_KAN17.md`](E2E_SPRINT2_KAN17.md)

---

## Legend

| Field | Meaning |
| ----- | ------- |
| ID | Stable catalog id |
| Layer | `detect` / `stt` / `session` / `switch` / `llm` / `tts` / `fallback` / `ui` / `e2e` |
| Auto | Automated in CI (`npm test`) |
| Manual | Browser checklist step |

---

## Detection (KAN-23)

| ID | Scenario | Auto | Where |
| -- | -------- | ---- | ----- |
| S3-DET-001 | English utterance → `en` | Yes | `tests/languageDetection.test.ts` TC-001 |
| S3-DET-002 | Romanized Hindi / Devanagari → `hi` or `hinglish` | Yes | `languageDetection` TC-002 |
| S3-DET-003 | Mixed Hinglish → single `hinglish` result | Yes | `languageDetection` TC-003 |
| S3-DET-004 | Empty / nonsense → unclear; French/CJK → unsupported | Yes | `languageDetection` TC-004 |
| S3-DET-005 | “Speak in Hindi…” English request → target `hi` | Yes | `languageDetection` TC-005 |
| S3-DET-006 | Latin English with Indian names is not unsupported | Yes | `languageDetection` (names case) |

---

## STT (KAN-24 / PR #20)

| ID | Scenario | Auto | Where |
| -- | -------- | ---- | ----- |
| S3-STT-001 | Valid audio → transcript | Yes | `tests/stt.test.ts` TC-001 |
| S3-STT-002 | Missing config / provider 5xx fail closed | Yes | `stt` TC-002 / TC-003 |
| S3-STT-003 | Empty byte payload rejected | Yes | `stt` TC-004 |
| S3-STT-004 | Whisper language not forced for POC hints (auto-detect) | Yes | `stt` resolveWhisperLanguage cases |
| S3-STT-005 | Empty Whisper text soft outcome (no hard 502) | Yes | `stt` empty text case |
| S3-STT-006 | Prompt-echo transcript sanitized | Yes | `stt` sanitizeWhisperTranscript |

---

## Session language (KAN-28)

| ID | Scenario | Auto | Where |
| -- | -------- | ---- | ----- |
| S3-SES-001 | Create session default `en` | Yes | `tests/sessionLanguage.test.ts` / `session.test.ts` |
| S3-SES-002 | Create with `hi` / reject `fr` | Yes | `sessionLanguage` |
| S3-SES-003 | Persist language on clear detection | Yes | `sessionLanguage` + voice pipeline |

---

## Dynamic switch (KAN-27 / PR #20)

| ID | Scenario | Auto | Where |
| -- | -------- | ---- | ----- |
| S3-SW-001 | EN → HI same `callId`, context kept | Yes | `tests/languageSwitching.test.ts` TC-001 |
| S3-SW-002 | HI → EN | Yes | `languageSwitching` TC-002 |
| S3-SW-003 | Consecutive EN → no `LANGUAGE_CHANGED` | Yes | `languageSwitching` TC-003 |
| S3-SW-004 | Hinglish mid-call one engine | Yes | `languageSwitching` TC-004 |
| S3-SW-005 | English “speak in Hindi” → `hi` + LLM/TTS `hi` | Yes | `languageSwitching` TC-005 |
| S3-SW-006 | EN → HI → EN round-trip + events | Yes | `languageSwitching` KAN-31 TC-003 (PR #21) |

---

## LLM / TTS (KAN-25 / KAN-26)

| ID | Scenario | Auto | Where |
| -- | -------- | ---- | ----- |
| S3-LLM-001 | Reply language follows detection/session | Yes | `tests/multilingualLlm.test.ts` |
| S3-LLM-002 | Context preserved after language switch | Yes | `multilingualLlm` TC-004 |
| S3-TTS-001 | TTS voice/language for `en` / `hi` / `hinglish` | Yes | `tests/multilingualTts.test.ts` (or TTS suite) |

---

## Fallback (KAN-30)

| ID | Scenario | Auto | Where |
| -- | -------- | ---- | ----- |
| S3-FB-001 | Unclear speech → clarification, session open | Yes | `tests/multilingualFallback.test.ts` TC-001 |
| S3-FB-002 | Unsupported language → polite fallback | Yes | `multilingualFallback` TC-002 |
| S3-FB-003 | Empty STT soft-continues | Yes | `multilingualFallback` empty STT |

---

## UI (KAN-29)

| ID | Scenario | Auto | Where |
| -- | -------- | ---- | ----- |
| S3-UI-001 | English baseline after Start | Yes | FE `VoiceAgentPanel` TC-003 |
| S3-UI-002 | Hindi indicator + switch notice | Yes | FE `VoiceAgentPanel` TC-001 / TC-002 |
| S3-UI-003 | Hinglish indicator | Yes | FE `VoiceAgentPanel` KAN-31 hinglish case |

---

## Manual E2E (KAN-31 / KAN-62)

| ID | Scenario | Manual checklist |
| -- | -------- | ---------------- |
| S3-E2E-001 | English browser turn | [`E2E_MULTILINGUAL_KAN31.md`](E2E_MULTILINGUAL_KAN31.md) TC-001 |
| S3-E2E-002 | Hindi browser turn | TC-002 |
| S3-E2E-003 | Mid-call EN→HI→EN | TC-003 |
| S3-E2E-004 | Hinglish utterance | TC-004 |
| S3-E2E-005 | UI language + `LANGUAGE_CHANGED` in events | UI + Logged changes rows |

---

## CI command (KAN-61)

```bash
# backend — core multilingual subset
cd voice-agent
npm test -- --run \
  tests/languageDetection.test.ts \
  tests/languageSwitching.test.ts \
  tests/sessionLanguage.test.ts \
  tests/multilingualFallback.test.ts \
  tests/stt.test.ts \
  tests/multilingualLlm.test.ts

# frontend — language UI
cd voice-agent-frontend
npm test -- --run tests/VoiceAgentPanel.test.tsx tests/voiceUi.test.ts
```

---

## Out of scope

- 300-scenario suite → Sprint 8  
- Deep appointment book/cancel/reschedule → Sprint 4  
- Wait / barge-in productization → Sprint 5  
