import {
  isLanguageCode,
  type LanguageCode,
} from "./languageDetectionService";

export type FallbackReason = "unclear" | "unsupported";

const UNSUPPORTED: Record<LanguageCode, string> = {
  en: "I'm sorry — I can only help in English, Hindi, or Hinglish. Please continue in one of those languages.",
  hi: "Maaf kijiye — main sirf English, Hindi, ya Hinglish mein madad kar sakta hoon. Kripya inmein se kisi ek bhasha mein baat kariye.",
  hinglish:
    "Sorry — main sirf English, Hindi, ya Hinglish mein help kar sakta hoon. Please continue in one of those.",
};

const UNCLEAR: Record<LanguageCode, string> = {
  en: "I didn't catch that. Could you please say that again?",
  hi: "Mujhe samajh nahi aaya. Kya aap dobara bol sakte hain?",
  hinglish: "Sorry, samajh nahi aaya. Please bol sakte ho phir se?",
};

/** Default English unsupported reply (KAN-24 / KAN-30). Prefer `fallbackReplyFor`. */
export const UNSUPPORTED_LANGUAGE_REPLY = UNSUPPORTED.en;

/** Default English unclear reply (KAN-30). Prefer `fallbackReplyFor`. */
export const UNCLEAR_SPEECH_REPLY = UNCLEAR.en;

/**
 * Pick fallback copy in the caller's last/default language (session → en).
 */
export function resolveFallbackLanguage(sessionLanguage?: string | null): LanguageCode {
  if (sessionLanguage && isLanguageCode(sessionLanguage)) {
    return sessionLanguage;
  }
  return "en";
}

export function fallbackReplyFor(
  reason: FallbackReason,
  sessionLanguage?: string | null,
): { language: LanguageCode; replyText: string } {
  const language = resolveFallbackLanguage(sessionLanguage);
  const replyText = reason === "unsupported" ? UNSUPPORTED[language] : UNCLEAR[language];
  return { language, replyText };
}
