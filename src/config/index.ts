import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

function loadEnvFiles(): void {
  dotenv.config({ path: path.resolve(process.cwd(), ".env"), quiet: true });

  const envName = process.env.APP_ENV ?? process.env.NODE_ENV;
  if (envName) {
    dotenv.config({
      path: path.resolve(process.cwd(), `.env.${envName}`),
      override: true,
      quiet: true,
    });
  }
}

loadEnvFiles();

const appEnvSchema = z.enum(["development", "test", "production", "demo"]);
const logLevelSchema = z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]);

const optionalNonEmptyString = z.preprocess(
  (value) => (value === "" || value === undefined || value === null ? undefined : value),
  z.string().min(1).optional(),
);

const optionalUrl = z.preprocess(
  (value) => (value === "" || value === undefined || value === null ? undefined : value),
  z.string().url().optional(),
);

const rawEnvSchema = z
  .object({
    APP_NAME: z.string().min(1).default("voice-agent"),
    APP_ENV: appEnvSchema.optional(),
    NODE_ENV: z.enum(["development", "test", "production"]).optional(),
    APP_PORT: z.coerce.number().int().positive().optional(),
    PORT: z.coerce.number().int().positive().optional(),
    LOG_LEVEL: logLevelSchema.default("info"),
    DATABASE_URL: optionalUrl,
    LLM_PROVIDER: optionalNonEmptyString,
    LLM_MODEL: optionalNonEmptyString,
    LLM_API_KEY: optionalNonEmptyString,
    STT_PROVIDER: optionalNonEmptyString,
    STT_API_KEY: optionalNonEmptyString,
    STT_MODEL: optionalNonEmptyString,
    /** Optional default STT language hint (en | hi | hinglish / ISO). Auto when unset (KAN-24). */
    STT_DEFAULT_LANGUAGE: optionalNonEmptyString,
    TTS_PROVIDER: optionalNonEmptyString,
    TTS_API_KEY: optionalNonEmptyString,
    TTS_MODEL: optionalNonEmptyString,
    VECTOR_DB_URL: optionalUrl,
    VECTOR_DB_API_KEY: optionalNonEmptyString,
    EMBEDDING_MODEL: optionalNonEmptyString,
    /** Comma-separated browser origins, or `*` (KAN-16 frontend CORS). */
    CORS_ORIGINS: optionalNonEmptyString,
  })
  .superRefine((value, ctx) => {
    if (!value.APP_ENV && !value.NODE_ENV) {
      ctx.addIssue({
        code: "custom",
        path: ["APP_ENV"],
        message: "APP_ENV is required (development | test | production | demo)",
      });
    }
  });

export type AppEnvironment = z.infer<typeof appEnvSchema>;
export type LogLevel = z.infer<typeof logLevelSchema>;

/** Default Vite ports used by the separate frontend repo during local POC. */
export const DEFAULT_DEV_CORS_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
] as const;

export function resolveCorsOrigins(
  raw: string | undefined,
  appEnv: AppEnvironment,
): string[] {
  if (raw && raw.trim().length > 0) {
    return raw
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
  }
  // Production: no browser CORS unless explicitly configured.
  if (appEnv === "production") {
    return [];
  }
  return [...DEFAULT_DEV_CORS_ORIGINS];
}

export type AppConfig = {
  app: {
    name: string;
    env: AppEnvironment;
    port: number;
    logLevel: LogLevel;
    /** Allowed browser Origins for CORS (empty = no CORS headers). */
    corsOrigins: string[];
  };
  database: {
    url?: string;
  };
  llm: {
    provider?: string;
    model?: string;
    apiKey?: string;
  };
  stt: {
    provider?: string;
    model?: string;
    apiKey?: string;
    /** Default Whisper language hint when the request omits languageHint (KAN-24). */
    defaultLanguage?: string;
  };
  tts: {
    provider?: string;
    model?: string;
    apiKey?: string;
  };
  rag: {
    vectorDbUrl?: string;
    vectorDbApiKey?: string;
    embeddingModel?: string;
  };
};

function resolveAppEnv(appEnv?: AppEnvironment, nodeEnv?: string): AppEnvironment {
  if (appEnv) {
    return appEnv;
  }
  if (nodeEnv === "development" || nodeEnv === "test" || nodeEnv === "production") {
    return nodeEnv;
  }
  throw new Error("Invalid application configuration: APP_ENV is required");
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = rawEnvSchema.safeParse(env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid application configuration: ${details}`);
  }

  const raw = parsed.data;
  const appEnv = resolveAppEnv(raw.APP_ENV, raw.NODE_ENV);

  return {
    app: {
      name: raw.APP_NAME,
      env: appEnv,
      port: raw.APP_PORT ?? raw.PORT ?? 3000,
      logLevel: raw.LOG_LEVEL,
      corsOrigins: resolveCorsOrigins(raw.CORS_ORIGINS, appEnv),
    },
    database: {
      url: raw.DATABASE_URL,
    },
    llm: {
      provider: raw.LLM_PROVIDER,
      model: raw.LLM_MODEL,
      apiKey: raw.LLM_API_KEY,
    },
    stt: {
      provider: raw.STT_PROVIDER,
      model: raw.STT_MODEL,
      apiKey: raw.STT_API_KEY,
      defaultLanguage: raw.STT_DEFAULT_LANGUAGE,
    },
    tts: {
      provider: raw.TTS_PROVIDER,
      model: raw.TTS_MODEL,
      apiKey: raw.TTS_API_KEY,
    },
    rag: {
      vectorDbUrl: raw.VECTOR_DB_URL,
      vectorDbApiKey: raw.VECTOR_DB_API_KEY,
      embeddingModel: raw.EMBEDDING_MODEL,
    },
  };
}

/** Singleton accessor so services never read process.env directly. */
let cachedConfig: AppConfig | undefined;

export function getConfig(): AppConfig {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}

/** Test helper to clear the cached singleton between cases. */
export function resetConfigCache(): void {
  cachedConfig = undefined;
}
