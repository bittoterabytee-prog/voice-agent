import { randomUUID } from "node:crypto";
import { logger } from "./logger";
import { redactSecrets, redactValue } from "./redact";

export type PipelineStage = "stt" | "llm" | "tts" | "session" | "turn";

export type PipelineLogContext = {
  requestId?: string;
  callId?: string;
  conversationId?: string;
  sessionId?: string;
};

/** Stage summary returned on voice turn responses for UI (KAN-18). */
export type PipelineStageSummary = {
  stage: PipelineStage;
  outcome: "success" | "failure";
  durationMs: number;
  softFail?: boolean;
  code?: string;
};

export type PipelineTrace = {
  requestId: string;
  stages: PipelineStageSummary[];
};

export function createPipelineTrace(requestId: string): {
  requestId: string;
  stages: PipelineStageSummary[];
  record: (entry: PipelineStageSummary) => void;
  toJSON: () => PipelineTrace;
} {
  const stages: PipelineStageSummary[] = [];
  return {
    requestId,
    stages,
    record(entry) {
      stages.push(entry);
    },
    toJSON() {
      return { requestId, stages: [...stages] };
    },
  };
}

export function createRequestId(existing?: string): string {
  const trimmed = existing?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : randomUUID();
}

export function logPipelineStage(
  level: "info" | "error" | "warn",
  message: string,
  fields: PipelineLogContext & {
    stage: PipelineStage;
    outcome: "start" | "success" | "failure";
    durationMs?: number;
    softFail?: boolean;
    code?: string;
    err?: unknown;
    [key: string]: unknown;
  },
): void {
  const { err, ...rest } = fields;
  const payload: Record<string, unknown> = {
    ...rest,
    component: "voice_pipeline",
  };
  if (err !== undefined) {
    payload.err = redactValue(err);
  }
  if (typeof payload.code === "string") {
    payload.code = redactSecrets(payload.code);
  }

  if (level === "error") {
    logger.error(payload, message);
  } else if (level === "warn") {
    logger.warn(payload, message);
  } else {
    logger.info(payload, message);
  }
}

export async function withStageTiming<T>(
  ctx: PipelineLogContext & { stage: PipelineStage },
  run: () => Promise<T>,
  trace?: { record: (entry: PipelineStageSummary) => void },
): Promise<{ result: T; durationMs: number }> {
  const started = Date.now();
  logPipelineStage("info", `Voice pipeline ${ctx.stage} start`, {
    ...ctx,
    outcome: "start",
  });
  try {
    const result = await run();
    const durationMs = Date.now() - started;
    logPipelineStage("info", `Voice pipeline ${ctx.stage} success`, {
      ...ctx,
      outcome: "success",
      durationMs,
    });
    trace?.record({ stage: ctx.stage, outcome: "success", durationMs });
    return { result, durationMs };
  } catch (error) {
    const durationMs = Date.now() - started;
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code: string }).code)
        : "INTERNAL_ERROR";
    logPipelineStage("error", `Voice pipeline ${ctx.stage} failed`, {
      ...ctx,
      outcome: "failure",
      durationMs,
      code,
      err: error,
    });
    trace?.record({
      stage: ctx.stage,
      outcome: "failure",
      durationMs,
      code: redactSecrets(code),
    });
    throw error;
  }
}
