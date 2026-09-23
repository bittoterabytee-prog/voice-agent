import { describe, expect, it } from "vitest";
import {
  estimateLlmCostUsd,
  estimateSttCostUsd,
  estimateTtsCostUsd,
  sumTurnCost,
} from "../src/utils/openaiCost";

describe("openaiCost estimates (KAN-18 POC spend)", () => {
  it("estimates LLM cost from token counts", () => {
    const stage = estimateLlmCostUsd({ promptTokens: 1_000_000, completionTokens: 1_000_000 });
    expect(stage.stage).toBe("llm");
    expect(stage.estimatedUsd).toBe(0.75);
  });

  it("estimates STT from audio bytes and TTS from characters", () => {
    const stt = estimateSttCostUsd({ audioBytes: 16_000, mimeType: "audio/webm" });
    expect(stt.stage).toBe("stt");
    expect(stt.estimatedUsd).toBeGreaterThan(0);

    const tts = estimateTtsCostUsd({ text: "Hello" });
    expect(tts.stage).toBe("tts");
    expect(tts.estimatedUsd).toBeGreaterThan(0);
  });

  it("sums turn cost with note", () => {
    const cost = sumTurnCost([
      estimateLlmCostUsd({ promptTokens: 1000, completionTokens: 500 }),
      estimateTtsCostUsd({ text: "Hi" }),
    ]);
    expect(cost.currency).toBe("USD");
    expect(cost.estimatedUsd).toBeGreaterThan(0);
    expect(cost.breakdown).toHaveLength(2);
    expect(cost.note).toMatch(/not a live wallet/i);
  });
});
