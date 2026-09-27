import { describe, expect, it } from "vitest";
import {
  gateMutateToolArguments,
  guardAppointmentReply,
  isAmbiguousTimePhrase,
  isExplicitConfirmation,
} from "../src/ai/appointmentSafety";
import { CLINIC_SYSTEM_PROMPT, buildSystemMessage } from "../src/ai/prompts";

describe("KAN-112 appointment prompts and safety gates", () => {
  it("system prompt encodes confirmation and no-invent rules", () => {
    expect(CLINIC_SYSTEM_PROMPT).toMatch(/confirmed=true/i);
    expect(CLINIC_SYSTEM_PROMPT).toMatch(/Never invent open appointment slots/i);
    expect(CLINIC_SYSTEM_PROMPT).toMatch(/ambiguous time/i);
    const hi = buildSystemMessage({ language: "hi" });
    expect(hi.content).toMatch(/Reply language for this turn: Hindi/);
    const hinglish = buildSystemMessage({ language: "hinglish" });
    expect(hinglish.content).toMatch(/Hinglish/);
  });

  it("TC-001 ambiguous sometime is detected for clarification", () => {
    expect(isAmbiguousTimePhrase("sometime next week")).toBe(true);
    expect(isAmbiguousTimePhrase("jab bhi free ho")).toBe(true);
    expect(isAmbiguousTimePhrase("कभी भी")).toBe(true);
    expect(isAmbiguousTimePhrase("tomorrow morning")).toBe(false);
  });

  it("TC-002 mutate confirmed=true is forced off without explicit confirm", () => {
    const gated = gateMutateToolArguments({
      name: "book_appointment",
      arguments: {
        patientId: "p1",
        doctorId: "d1",
        date: "2026-10-14",
        time: "10:00:00",
        confirmed: true,
      },
      latestUserUtterance: "book me tomorrow if possible",
    });
    expect(gated.confirmedForcedOff).toBe(true);
    expect(gated.arguments.confirmed).toBe(false);
  });

  it("allows confirmed=true after multilingual explicit confirms", () => {
    for (const utterance of ["yes please", "हाँ", "haan theek hai", "bilkul book kar do", "okay confirm"]) {
      const gated = gateMutateToolArguments({
        name: "book_appointment",
        arguments: { confirmed: true },
        latestUserUtterance: utterance,
      });
      expect(gated.confirmedForcedOff).toBe(false);
      expect(gated.arguments.confirmed).toBe(true);
      expect(isExplicitConfirmation(utterance)).toBe(true);
    }
  });

  it("TC-003 fail-closed reply when model claims success without tool success (en/hi/hinglish)", () => {
    const en = guardAppointmentReply({
      replyText: "Your appointment is booked for tomorrow.",
      toolExecutions: [{ name: "book_appointment", ok: true, result: { outcome: "failed" } }],
      language: "en",
    });
    expect(en.rewritten).toBe(true);
    expect(en.text).toMatch(/could not complete/i);

    const hi = guardAppointmentReply({
      replyText: "आपकी अपॉइंटमेंट बुक हो गई।",
      toolExecutions: [{ name: "book_appointment", ok: false, result: { error: { code: "TOOL_FAILED" } } }],
      language: "hi",
    });
    expect(hi.rewritten).toBe(true);
    expect(hi.text).toMatch(/सेव नहीं हुआ/);

    const hinglish = guardAppointmentReply({
      replyText: "Appointment book ho gaya.",
      toolExecutions: [],
      language: "hinglish",
    });
    expect(hinglish.rewritten).toBe(true);
    expect(hinglish.text).toMatch(/save nahi hua/i);
  });

  it("keeps success wording when tool outcome is booked", () => {
    const guarded = guardAppointmentReply({
      replyText: "Your appointment is booked.",
      toolExecutions: [
        {
          name: "book_appointment",
          ok: true,
          result: { outcome: "booked", confirmation: { appointmentId: "a1" } },
        },
      ],
      language: "en",
    });
    expect(guarded.rewritten).toBe(false);
    expect(guarded.text).toBe("Your appointment is booked.");
  });
});
