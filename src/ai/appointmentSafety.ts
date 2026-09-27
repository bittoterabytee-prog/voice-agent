/**
 * Appointment voice safety gates (KAN-112).
 * Confirm-before-mutate (en / hi / hinglish) and fail-closed success language.
 */
import type { LanguageCode } from "../voice/languageDetectionService";
import { resolveReplyLanguage } from "./prompts";
import type { AppointmentToolExecution } from "./appointmentToolRunner";

const MUTATE_TOOLS = new Set([
  "book_appointment",
  "cancel_appointment",
  "reschedule_appointment",
]);

/** Explicit yes / confirm phrases across POC languages. */
const CONFIRMATION_PATTERNS: RegExp[] = [
  // English
  /\b(yes|yeah|yep|yup|ok|okay|sure|confirm|confirmed|please\s+book|go\s+ahead|do\s+it|that'?s?\s+fine|sounds\s+good)\b/i,
  // Hindi (Devanagari)
  /(हाँ|हां|जी\s*हाँ|जी\s*हां|ठीक\s*है|बिल्कुल|पुष्टि|हाँ\s*कर\s*दो|हाँ\s*कर\s*दीजिए)/,
  // Romanized Hindi / Hinglish
  /\b(haan|han|haaji|ji\s*haan|ji\s*han|theek\s*hai|thik\s*hai|bilkul|pakka|confirm\s*kar\s*do|book\s*kar\s*do|haa?\s*kar\s*do)\b/i,
];

const AMBIGUOUS_TIME_PATTERNS: RegExp[] = [
  /\b(sometime|some\s*time|whenever|any\s*time|anytime|later|jab\s*bhi|kabhi\s*bhi)\b/i,
  /(कभी\s*भी|जब\s*भी|कभी)/,
];

const SUCCESS_CLAIM_PATTERNS: RegExp[] = [
  /\b(booked|cancelled|canceled|rescheduled|scheduled\s+successfully|appointment\s+is\s+confirmed)\b/i,
  /(बुक\s*हो\s*गई|बुक\s*हो\s*गया|रद्द\s*हो\s*गया|रिस्केड्यूल|apunेंट\s*confirm)/i,
  /\b(book\s*ho\s*gaya|book\s*ho\s*gayi|cancel\s*ho\s*gaya|reschedule\s*ho\s*gaya)\b/i,
];

export function isExplicitConfirmation(utterance: string | null | undefined): boolean {
  const text = utterance?.trim() ?? "";
  if (!text) return false;
  return CONFIRMATION_PATTERNS.some((re) => re.test(text));
}

export function isAmbiguousTimePhrase(utterance: string | null | undefined): boolean {
  const text = utterance?.trim() ?? "";
  if (!text) return false;
  return AMBIGUOUS_TIME_PATTERNS.some((re) => re.test(text));
}

export function latestUserUtterance(
  messages: Array<{ role: string; content?: string | null }>,
): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m.role === "user" && typeof m.content === "string" && m.content.trim()) {
      return m.content.trim();
    }
  }
  return null;
}

export function isMutateAppointmentTool(name: string): boolean {
  return MUTATE_TOOLS.has(name.trim());
}

/**
 * Force confirmed=false on mutate tools unless the latest user utterance is an explicit confirm.
 */
export function gateMutateToolArguments(input: {
  name: string;
  arguments: Record<string, unknown>;
  latestUserUtterance?: string | null;
}): { arguments: Record<string, unknown>; confirmedForcedOff: boolean } {
  const args = { ...input.arguments };
  if (!isMutateAppointmentTool(input.name)) {
    return { arguments: args, confirmedForcedOff: false };
  }
  if (args.confirmed !== true) {
    return { arguments: args, confirmedForcedOff: false };
  }
  if (isExplicitConfirmation(input.latestUserUtterance)) {
    return { arguments: args, confirmedForcedOff: false };
  }
  args.confirmed = false;
  return { arguments: args, confirmedForcedOff: true };
}

function toolHadSuccessOutcome(executions: AppointmentToolExecution[]): boolean {
  return executions.some((e) => {
    if (!e.ok || !e.result || typeof e.result !== "object") return false;
    const outcome = (e.result as { outcome?: unknown }).outcome;
    return (
      outcome === "booked" ||
      outcome === "cancelled" ||
      outcome === "rescheduled"
    );
  });
}

function toolHadFailure(executions: AppointmentToolExecution[]): boolean {
  return executions.some((e) => {
    if (!e.ok) return true;
    if (!e.result || typeof e.result !== "object") return false;
    const outcome = (e.result as { outcome?: unknown }).outcome;
    const err = (e.result as { error?: unknown }).error;
    return outcome === "failed" || err != null;
  });
}

const FAIL_CLOSED_REPLIES: Record<LanguageCode, string> = {
  en: "I could not complete that appointment change. Nothing was saved. Please try again or ask for a human.",
  hi: "मैं वह अपॉइंटमेंट बदलाव पूरा नहीं कर सका। कुछ सेव नहीं हुआ। कृपया फिर कोशिश करें या किसी स्टाफ से बात करें।",
  hinglish:
    "Main woh appointment change complete nahi kar paya. Kuch save nahi hua. Please phir try karein ya human staff se baat karein.",
};

/**
 * If the model claims success without a successful mutate tool outcome, replace with fail-closed copy.
 */
export function guardAppointmentReply(input: {
  replyText: string;
  toolExecutions: AppointmentToolExecution[];
  language?: string | null;
}): { text: string; rewritten: boolean } {
  const text = input.replyText.trim();
  const language = resolveReplyLanguage(input.language);
  const claimsSuccess = SUCCESS_CLAIM_PATTERNS.some((re) => re.test(text));
  if (!claimsSuccess) {
    return { text, rewritten: false };
  }
  if (toolHadSuccessOutcome(input.toolExecutions)) {
    return { text, rewritten: false };
  }
  // Claimed success but no booked/cancelled/rescheduled tool outcome — fail closed.
  return {
    text: FAIL_CLOSED_REPLIES[language],
    rewritten: true,
  };
}

export function failClosedReplyForToolFailure(language?: string | null): string {
  return FAIL_CLOSED_REPLIES[resolveReplyLanguage(language)];
}

export function shouldPreferFailClosedReply(
  toolExecutions: AppointmentToolExecution[],
): boolean {
  return toolHadFailure(toolExecutions) && !toolHadSuccessOutcome(toolExecutions);
}
