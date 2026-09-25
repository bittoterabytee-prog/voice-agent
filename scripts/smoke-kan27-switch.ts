/**
 * In-process smoke for explicit EN→HI switch (Docker optional).
 */
import { LlmService } from "../src/ai/llmService";
import { closePool, connectDatabase, getPool } from "../src/db/pool";
import { runMigrations } from "../src/db/migrate";
import { languageDetectionService } from "../src/voice/languageDetectionService";
import { SessionService } from "../src/services/sessionService";
import { SttService } from "../src/voice/sttService";
import { TtsService } from "../src/voice/ttsService";
import { VoicePipelineService } from "../src/voice/voicePipelineService";
import { ensureTestDatabase } from "../tests/setup/postgres";

function line(check: string, ok: boolean, detail: string): void {
  console.log(`${ok ? "PASS" : "FAIL"} | ${check} | ${detail}`);
}

async function main(): Promise<void> {
  let failed = 0;
  const assert = (check: string, ok: boolean, detail: string) => {
    line(check, ok, detail);
    if (!ok) failed += 1;
  };

  for (const [text, expectLang] of [
    ["Speak in Hindi, brother.", "hi"],
    ["Can you speak in Hindi, please?", "hi"],
    ["Talk in Hinglish please", "hinglish"],
  ] as const) {
    const d = languageDetectionService.detect(text);
    assert(
      `detect ${expectLang}`,
      d.language === expectLang && !d.unsupported && !d.unclear,
      `got language=${d.language} unsupported=${d.unsupported}`,
    );
  }
  const fr = languageDetectionService.detect("Bonjour je voudrais un rendez vous demain");
  assert("French unsupported", fr.unsupported === true, `unsupported=${fr.unsupported}`);

  const handle = await ensureTestDatabase();
  await connectDatabase();
  await runMigrations();
  await getPool().query(
    "TRUNCATE call_events, conversation_states, calls, appointments, patients, doctors RESTART IDENTITY CASCADE",
  );

  const sessions = new SessionService();
  const started = await sessions.startSession({ callerNumber: "smoke", language: "en" });
  assert("session en", started.language === "en", `language=${started.language}`);

  const llm = {
    complete: async (req: { language?: string }) => ({
      text: `reply-lang=${req.language ?? "missing"}`,
    }),
  } as unknown as LlmService;
  const tts = {
    synthesize: async (req: { language?: string }) => ({
      audio: new Uint8Array([1, 2, 3]),
      mimeType: "audio/mpeg",
      language: req.language,
    }),
  } as unknown as TtsService;
  const stt = {
    transcribe: async () => ({
      text: "Can you speak in Hindi, please?",
      language: "en",
      supported: false,
    }),
  } as unknown as SttService;

  const turn = await new VoicePipelineService({ stt, llm, tts, sessions }).runTurn({
    audio: new Uint8Array([9, 9, 9]),
    callId: started.callId,
  });

  const leak = /sk-[A-Za-z0-9]/.test(JSON.stringify(turn));
  assert(
    "turn switches to hi",
    turn.language === "hi" &&
      turn.languageChanged === true &&
      turn.languageDetection?.language === "hi" &&
      turn.replyText === "reply-lang=hi",
    `language=${turn.language} changed=${turn.languageChanged} detection=${turn.languageDetection?.language} reply=${turn.replyText}`,
  );
  assert("no secrets", !leak, `leak=${leak}`);

  await closePool();
  await handle?.stop();
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("SMOKE_FAIL", err);
  process.exitCode = 1;
});
