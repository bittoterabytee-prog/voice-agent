/**
 * Rough OpenAI public list prices for POC estimates (USD).
 * Not a live billing feed — values may drift from OpenAI's current rates.
 * Update when models/pricing change.
 */
export const OPENAI_PRICE_ESTIMATES = {
  /** gpt-4o-mini approximate */
  llmInputPer1MTokens: 0.15,
  llmOutputPer1MTokens: 0.6,
  /** whisper-1 */
  sttPerMinute: 0.006,
  /** tts-1 */
  ttsPer1MCharacters: 15,
} as const;

export type StageUsageEstimate = {
  stage: "stt" | "llm" | "tts";
  estimatedUsd: number;
  details: Record<string, number | string>;
};

export type TurnCostEstimate = {
  currency: "USD";
  estimatedUsd: number;
  breakdown: StageUsageEstimate[];
  note: string;
};

const COST_NOTE =
  "Estimated from public OpenAI list prices for this POC; not a live wallet balance.";

export function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function estimateLlmCostUsd(input: {
  promptTokens?: number;
  completionTokens?: number;
}): StageUsageEstimate {
  const promptTokens = Math.max(0, input.promptTokens ?? 0);
  const completionTokens = Math.max(0, input.completionTokens ?? 0);
  const estimatedUsd = roundUsd(
    (promptTokens / 1_000_000) * OPENAI_PRICE_ESTIMATES.llmInputPer1MTokens +
      (completionTokens / 1_000_000) * OPENAI_PRICE_ESTIMATES.llmOutputPer1MTokens,
  );
  return {
    stage: "llm",
    estimatedUsd,
    details: { promptTokens, completionTokens },
  };
}

/** Estimate Whisper minutes from payload size (compressed audio ≈ 16kbps ballpark). */
export function estimateSttCostUsd(input: {
  audioBytes: number;
  mimeType?: string;
}): StageUsageEstimate {
  const bytes = Math.max(0, input.audioBytes);
  const mime = (input.mimeType ?? "").toLowerCase();
  let durationSec: number;
  if (mime.includes("wav") || mime.includes("pcm")) {
    // 16-bit mono 16kHz ≈ 32000 bytes/sec
    durationSec = bytes / 32_000;
  } else {
    // webm/opus rough bitrate ~16kbps
    durationSec = (bytes * 8) / 16_000;
  }
  durationSec = Math.max(durationSec, 0.5);
  const minutes = durationSec / 60;
  const estimatedUsd = roundUsd(minutes * OPENAI_PRICE_ESTIMATES.sttPerMinute);
  return {
    stage: "stt",
    estimatedUsd,
    details: {
      audioBytes: bytes,
      estimatedDurationSec: roundUsd(durationSec),
    },
  };
}

export function estimateTtsCostUsd(input: { text: string }): StageUsageEstimate {
  const characters = [...(input.text ?? "")].length;
  const estimatedUsd = roundUsd(
    (characters / 1_000_000) * OPENAI_PRICE_ESTIMATES.ttsPer1MCharacters,
  );
  return {
    stage: "tts",
    estimatedUsd,
    details: { characters },
  };
}

export function sumTurnCost(breakdown: StageUsageEstimate[]): TurnCostEstimate {
  const estimatedUsd = roundUsd(breakdown.reduce((sum, item) => sum + item.estimatedUsd, 0));
  return {
    currency: "USD",
    estimatedUsd,
    breakdown,
    note: COST_NOTE,
  };
}
