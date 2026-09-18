import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ quiet: true });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional(),
  ),
  LLM_API_KEY: z.string().optional().or(z.literal("")),
  LLM_BASE_URL: z.string().url().optional().or(z.literal("")),
  VOICE_PROVIDER_API_KEY: z.string().optional().or(z.literal("")),
  VOICE_PROVIDER_BASE_URL: z.string().url().optional().or(z.literal("")),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid application configuration: ${details}`);
  }

  return parsed.data;
}
