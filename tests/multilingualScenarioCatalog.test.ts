/**
 * KAN-32 — catalog-backed smoke for core multilingual scenarios.
 * Full matrix lives in docs/testing/MULTILINGUAL_SCENARIO_CATALOG.md.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { languageDetectionService } from "../src/voice/languageDetectionService";
import { sanitizeWhisperTranscript } from "../src/voice/sttService";

const catalogPath = resolve(process.cwd(), "docs/testing/MULTILINGUAL_SCENARIO_CATALOG.md");

describe("KAN-32 multilingual scenario catalog", () => {
  it("TC-001 catalog document exists and lists EN/HI/Hinglish/switch/fallback", () => {
    expect(existsSync(catalogPath)).toBe(true);
    const body = readFileSync(catalogPath, "utf8");
    for (const token of [
      "S3-DET-001",
      "S3-SW-001",
      "S3-FB-001",
      "S3-UI-001",
      "S3-E2E-001",
      "Hinglish",
      "LANGUAGE_CHANGED",
    ]) {
      expect(body).toContain(token);
    }
  });

  it("TC-002 automated core detection cases from the catalog still pass", () => {
    expect(languageDetectionService.detect("Hello, I want to book an appointment.").language).toBe("en");
    expect(languageDetectionService.detect("मुझे कल आना है").language).toBe("hi");
    expect(
      languageDetectionService.detect("Mujhe doctor ke saath evening mein appointment chahiye, around 6 PM.")
        .language,
    ).toBe("hinglish");
    expect(languageDetectionService.detect("Speak in Hindi, brother.").language).toBe("hi");
    expect(
      languageDetectionService.detect("Bonjour je voudrais un rendez vous demain").unsupported,
    ).toBe(true);
  });

  it("keeps prompt-echo sanitization (S3-STT-006)", () => {
    expect(
      sanitizeWhisperTranscript(
        "Transcribe exactly what was spoken in English, Hindi, or Hinglish. If the caller…",
      ),
    ).toBe("");
  });
});
