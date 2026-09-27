import { describe, expect, it } from "vitest";
import { resolveDateTime } from "../src/services/dateTimeResolver";

/** Fixed "now" in UTC that is Wednesday 2026-10-07 06:30 UTC = 12:00 IST. */
const NOW = new Date("2026-10-07T06:30:00.000Z");

describe("KAN-66 resolveDateTime", () => {
  it("TC-001 resolves tomorrow morning to the next calendar morning (IST)", () => {
    const result = resolveDateTime("tomorrow morning", NOW);
    expect(result.outcome).toBe("resolved");
    if (result.outcome === "resolved") {
      expect(result.window.date).toBe("2026-10-08");
      expect(result.window.partOfDay).toBe("morning");
      expect(result.window.timeStart).toBe("09:00:00");
      expect(result.window.timeEnd).toBe("12:00:00");
    }
  });

  it("TC-002 resolves a specific calendar date and clock time", () => {
    const result = resolveDateTime("2026-10-15 at 3:30 pm", NOW);
    expect(result.outcome).toBe("resolved");
    if (result.outcome === "resolved") {
      expect(result.window.date).toBe("2026-10-15");
      expect(result.window.timeStart).toBe("15:30:00");
    }
  });

  it("TC-003 returns ambiguous for vague phrases without inventing a slot", () => {
    const result = resolveDateTime("sometime", NOW);
    expect(result.outcome).toBe("ambiguous");
    expect(result.window).toBeNull();
  });

  it("TC-004 resolves a weekday to the next matching day (same week if still ahead)", () => {
    // NOW is Wednesday IST 2026-10-07 → Friday is 2026-10-09
    const friday = resolveDateTime("Friday", NOW);
    expect(friday.outcome).toBe("resolved");
    if (friday.outcome === "resolved") {
      expect(friday.window.date).toBe("2026-10-09");
    }

    // Same weekday without "next" stays today
    const wednesday = resolveDateTime("Wednesday afternoon", NOW);
    expect(wednesday.outcome).toBe("resolved");
    if (wednesday.outcome === "resolved") {
      expect(wednesday.window.date).toBe("2026-10-07");
      expect(wednesday.window.partOfDay).toBe("afternoon");
    }

    // "next Wednesday" skips to the following week
    const nextWed = resolveDateTime("next Wednesday", NOW);
    expect(nextWed.outcome).toBe("resolved");
    if (nextWed.outcome === "resolved") {
      expect(nextWed.window.date).toBe("2026-10-14");
    }
  });

  it("resolves after 5 PM on tomorrow as evening window", () => {
    const result = resolveDateTime("tomorrow after 5 pm", NOW);
    expect(result.outcome).toBe("resolved");
    if (result.outcome === "resolved") {
      expect(result.window.date).toBe("2026-10-08");
      expect(result.window.partOfDay).toBe("evening");
    }
  });

  it("rejects empty input as ambiguous", () => {
    expect(resolveDateTime("  ", NOW).outcome).toBe("ambiguous");
  });
});
