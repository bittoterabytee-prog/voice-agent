import { afterEach, describe, expect, it } from "vitest";
import { getConfig, loadConfig, resetConfigCache } from "../src/config";
import { LlmService } from "../src/ai/llmService";
import { readFileSync } from "node:fs";
import path from "node:path";

afterEach(() => {
  resetConfigCache();
});

describe("environment configuration (KAN-8)", () => {
  it("TC-003 keeps secrets out of source control", () => {
    const gitignore = readFileSync(path.resolve(process.cwd(), ".gitignore"), "utf8");
    const example = readFileSync(path.resolve(process.cwd(), ".env.example"), "utf8");

    expect(gitignore).toMatch(/^\.env$/m);
    expect(gitignore).toMatch(/^\.env\.\*$/m);
    expect(example).toMatch(/APP_ENV=/);
    expect(example).toMatch(/DATABASE_URL=/);
    expect(example).not.toMatch(/sk-[a-zA-Z0-9]{10,}/);
    expect(example).not.toMatch(/password=[^v\s]+/i);
  });

  it("TC-001 loads development configuration successfully", () => {
    const config = loadConfig({
      APP_NAME: "voice-agent",
      APP_ENV: "development",
      APP_PORT: "3000",
      LOG_LEVEL: "info",
      DATABASE_URL: "postgresql://voice:voice@localhost:5432/voice_agent",
      LLM_PROVIDER: "openai",
      LLM_MODEL: "gpt-4o-mini",
      LLM_API_KEY: "sk-dev",
      STT_PROVIDER: "openai",
      STT_API_KEY: "sk-stt-dev",
      STT_MODEL: "whisper-1",
      TTS_PROVIDER: "openai",
      TTS_API_KEY: "sk-tts-dev",
      TTS_MODEL: "tts-1",
      VECTOR_DB_URL: "https://vector.example",
      VECTOR_DB_API_KEY: "vec-dev",
      EMBEDDING_MODEL: "text-embedding-3-small",
    });

    expect(config.app.env).toBe("development");
    expect(config.app.port).toBe(3000);
    expect(config.database.url).toContain("localhost");
    expect(config.llm.provider).toBe("openai");
    expect(config.stt.provider).toBe("openai");
    expect(config.tts.provider).toBe("openai");
    expect(config.rag.embeddingModel).toBe("text-embedding-3-small");
  });

  it("TC-002 fails clearly when a required variable is missing", () => {
    expect(() => loadConfig({ APP_PORT: "3000" })).toThrow(/Invalid application configuration/i);
    expect(() => loadConfig({ APP_PORT: "3000" })).toThrow(/APP_ENV/);
  });

  it("TC-004 uses environment-specific configuration values", () => {
    const development = loadConfig({
      APP_ENV: "development",
      APP_PORT: "3000",
      LLM_API_KEY: "sk-dev",
    });
    const test = loadConfig({
      APP_ENV: "test",
      APP_PORT: "3001",
      LLM_API_KEY: "sk-test",
    });
    const demo = loadConfig({
      APP_ENV: "demo",
      APP_PORT: "8080",
      LLM_API_KEY: "sk-demo",
    });

    expect(development.app.env).toBe("development");
    expect(development.app.port).toBe(3000);
    expect(development.llm.apiKey).toBe("sk-dev");

    expect(test.app.env).toBe("test");
    expect(test.app.port).toBe(3001);
    expect(test.llm.apiKey).toBe("sk-test");

    expect(demo.app.env).toBe("demo");
    expect(demo.app.port).toBe(8080);
    expect(demo.llm.apiKey).toBe("sk-demo");
  });

  it("TC-005 services read secrets through the centralized config module", () => {
    process.env.APP_ENV = "test";
    process.env.LLM_PROVIDER = "openai";
    process.env.LLM_API_KEY = "sk-centralized";
    resetConfigCache();

    const config = getConfig();
    expect(config.llm.apiKey).toBe("sk-centralized");

    const service = new LlmService({
      apiKey: config.llm.apiKey,
      provider: config.llm.provider,
      model: config.llm.model,
    });
    expect(service).toBeInstanceOf(LlmService);
  });

  it("TC-006 rejects invalid configuration formats", () => {
    expect(() =>
      loadConfig({
        APP_ENV: "development",
        DATABASE_URL: "not-a-url",
      }),
    ).toThrow(/DATABASE_URL/i);

    expect(() =>
      loadConfig({
        APP_ENV: "development",
        APP_PORT: "-1",
      }),
    ).toThrow(/Invalid application configuration/i);

    expect(() =>
      loadConfig({
        APP_ENV: "staging" as "development",
      }),
    ).toThrow(/APP_ENV|Invalid/i);
  });

  it("TC-008 browser voice config loads STT/TTS without telephony settings", () => {
    const backend = loadConfig({
      APP_ENV: "development",
      STT_PROVIDER: "openai",
      STT_API_KEY: "sk-stt",
      STT_MODEL: "whisper-1",
      TTS_PROVIDER: "openai",
      TTS_API_KEY: "sk-tts",
      TTS_MODEL: "tts-1",
    });

    expect(backend.stt.provider).toBe("openai");
    expect(backend.tts.provider).toBe("openai");
    expect(backend).not.toHaveProperty("voiceProvider");
  });

  it("accepts NODE_ENV as a fallback for APP_ENV", () => {
    const config = loadConfig({
      NODE_ENV: "production",
      PORT: "8080",
    });

    expect(config.app.env).toBe("production");
    expect(config.app.port).toBe(8080);
  });
});
