/**
 * Transcript language detection for the single conversation engine (KAN-23).
 * Classifies one utterance as en | hi | hinglish. Does not book appointments
 * and does not call external providers.
 */

export const LANGUAGE_CODES = ["en", "hi", "hinglish"] as const;

export type LanguageCode = (typeof LANGUAGE_CODES)[number];

/** True when value is a POC session language code (en | hi | hinglish). */
export function isLanguageCode(value: string): value is LanguageCode {
  return (LANGUAGE_CODES as readonly string[]).includes(value);
}

/**
 * Normalize a session language preference (KAN-28).
 * Empty / missing → `en`. Unsupported codes return null (caller decides reject vs default).
 */
export function normalizeLanguageCode(value: string | undefined | null): LanguageCode | null {
  const raw = value?.trim();
  if (!raw) {
    return "en";
  }
  const normalized = raw.toLowerCase();
  return isLanguageCode(normalized) ? normalized : null;
}

export type LanguageDetectionHints = {
  /** Optional STT provider tag, e.g. "en", "hi", "en-US". Transcript wins when they disagree. */
  providerLanguage?: string;
};

export type LanguageDetectionResult = {
  /** Null when the utterance is unclear or unsupported. */
  language: LanguageCode | null;
  /** 0..1. Zero when unclear or unsupported. */
  confidence: number;
  unclear: boolean;
  /** True when the text is not English, Hindi, or Hinglish. */
  unsupported: boolean;
};

const UNCLEAR: LanguageDetectionResult = {
  language: null,
  confidence: 0,
  unclear: true,
  unsupported: false,
};

const UNSUPPORTED: LanguageDetectionResult = {
  language: null,
  confidence: 0,
  unclear: true,
  unsupported: true,
};

/** Romanized Hindi content and function words used in clinic speech. */
const HINDI_WORDS = new Set([
  "aaj",
  "aana",
  "aao",
  "aap",
  "aapka",
  "aapke",
  "aapki",
  "aapko",
  "aath",
  "abhi",
  "aur",
  "baad",
  "bahut",
  "baje",
  "bataiye",
  "batao",
  "chahie",
  "chahiye",
  "char",
  "cheh",
  "chhe",
  "das",
  "dhanyavad",
  "dopahar",
  "hai",
  "hain",
  "haan",
  "ho",
  "hoon",
  "hun",
  "jaroor",
  "ji",
  "ka",
  "kab",
  "kahaan",
  "kahan",
  "kaise",
  "kal",
  "karna",
  "karo",
  "kariye",
  "ke",
  "ki",
  "kijiye",
  "kitna",
  "kitne",
  "ko",
  "kripya",
  "kya",
  "kyunki",
  "lekin",
  "liye",
  "magar",
  "main",
  "mat",
  "mein",
  "mera",
  "mere",
  "meri",
  "milna",
  "mujhe",
  "mujhko",
  "na",
  "nahi",
  "nahin",
  "namaskar",
  "namaste",
  "nau",
  "paanch",
  "panch",
  "parso",
  "parson",
  "pe",
  "pehle",
  "phir",
  "raat",
  "saat",
  "saath",
  "samay",
  "sath",
  "se",
  "shaam",
  "sham",
  "shukriya",
  "subah",
  "teen",
  "theek",
  "thik",
  "thoda",
  "toh",
  "vah",
  "wala",
  "wale",
  "wali",
  "woh",
  "ya",
  "yah",
  "yeh",
  "zaroor",
]);

/** English content + common function words (names stay unknown; French still has ~0 hits). */
const ENGLISH_WORDS = new Set([
  "about",
  "again",
  "also",
  "am",
  "and",
  "appointment",
  "are",
  "around",
  "assist",
  "assistant",
  "available",
  "be",
  "book",
  "booking",
  "brother",
  "but",
  "can",
  "cancel",
  "change",
  "check",
  "clinic",
  "continue",
  "could",
  "course",
  "dentist",
  "did",
  "do",
  "doctor",
  "does",
  "english",
  "evening",
  "family",
  "first",
  "for",
  "from",
  "general",
  "get",
  "go",
  "had",
  "has",
  "have",
  "hello",
  "help",
  "here",
  "hi",
  "hold",
  "how",
  "husband",
  "if",
  "is",
  "it",
  "just",
  "language",
  "last",
  "let",
  "lets",
  "like",
  "me",
  "monday",
  "morning",
  "my",
  "name",
  "need",
  "next",
  "night",
  "not",
  "of",
  "ok",
  "okay",
  "one",
  "or",
  "please",
  "pm",
  "proceed",
  "ready",
  "reply",
  "reschedule",
  "respond",
  "schedule",
  "slots",
  "some",
  "son",
  "speak",
  "sure",
  "switch",
  "take",
  "talk",
  "thank",
  "thanks",
  "that",
  "the",
  "then",
  "there",
  "think",
  "this",
  "time",
  "to",
  "today",
  "tomorrow",
  "too",
  "tuesday",
  "until",
  "us",
  "wait",
  "want",
  "was",
  "we",
  "wednesday",
  "week",
  "were",
  "what",
  "when",
  "where",
  "while",
  "who",
  "why",
  "wife",
  "will",
  "with",
  "would",
  "yes",
  "you",
]);

function normalizeHint(hint: string | undefined): LanguageCode | "other" | null {
  if (!hint) {
    return null;
  }
  const value = hint.trim().toLowerCase();
  if (!value) {
    return null;
  }
  if (value === "hinglish") {
    return "hinglish";
  }
  if (value === "en" || value === "english" || value.startsWith("en-")) {
    return "en";
  }
  if (value === "hi" || value === "hindi" || value.startsWith("hi-")) {
    return "hi";
  }
  return "other";
}

function applyHint(
  result: LanguageDetectionResult,
  hints?: LanguageDetectionHints,
): LanguageDetectionResult {
  if (!result.language) {
    return result;
  }
  const hint = normalizeHint(hints?.providerLanguage);
  if (hint && hint === result.language) {
    return { ...result, confidence: Math.min(0.98, result.confidence + 0.05) };
  }
  return result;
}

function scriptCounts(text: string): { latin: number; devanagari: number; other: number } {
  let latin = 0;
  let devanagari = 0;
  let other = 0;
  for (const ch of text) {
    if (/[A-Za-z]/.test(ch)) {
      latin += 1;
    } else if (/[\u0900-\u097F]/.test(ch)) {
      devanagari += 1;
    } else if (/\p{L}/u.test(ch)) {
      other += 1;
    }
  }
  return { latin, devanagari, other };
}

function classify(hindiHits: number, englishHits: number, devanagari: number): LanguageCode | null {
  if (devanagari > 0 && englishHits > 0) {
    return "hinglish";
  }
  if (devanagari > 0) {
    return "hi";
  }
  if (hindiHits > 0 && englishHits > 0) {
    return "hinglish";
  }
  if (hindiHits > 0) {
    return "hi";
  }
  if (englishHits > 0) {
    return "en";
  }
  return null;
}

function confidenceFor(language: LanguageCode, hindiHits: number, englishHits: number): number {
  const hits = hindiHits + englishHits;
  if (language === "hinglish") {
    return hits >= 4 ? 0.9 : 0.8;
  }
  if (language === "hi" && hindiHits === 0) {
    return 0.93;
  }
  return hits >= 2 ? 0.92 : 0.75;
}

/**
 * Explicit mid-call reply-language requests (KAN-27).
 * English (or romanized) "speak in Hindi" must switch session reply language even
 * though the utterance itself is English.
 */
export function detectRequestedReplyLanguage(text: string): LanguageCode | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  if (/[\u0900-\u097F]/.test(trimmed) && /(?:हिंदी|हिन्दी)/.test(trimmed)) {
    // Devanagari mention of Hindi usually means "use Hindi" when paired with request verbs,
    // but pure Hindi content is handled by lexicon — only treat as switch when request-like.
    if (/(?:बोल|बात|करो|कीजिए|कृपया)/.test(trimmed)) {
      return "hi";
    }
  }

  const t = trimmed.toLowerCase();

  if (
    /\bhinglish\b/.test(t) &&
    /\b(?:speak|talk|reply|respond|continue|switch|change|use|in)\b/.test(t)
  ) {
    return "hinglish";
  }

  if (
    /\b(?:speak|talk|reply|respond|continue)\b.{0,48}\bhindi\b/.test(t) ||
    /\b(?:switch|change)\b.{0,48}\bhindi\b/.test(t) ||
    /\bin\s+hindi\b/.test(t) ||
    /\bhindi\s+(?:please|mein|me)\b/.test(t) ||
    /\b(?:baat|bolo|bolie|boliye|karo)\b.{0,24}\bhindi\b/.test(t) ||
    /\bhindi\b.{0,24}\b(?:baat|bolo|bolie|boliye|karo)\b/.test(t)
  ) {
    return "hi";
  }

  if (
    /\b(?:speak|talk|reply|respond|continue)\b.{0,48}\benglish\b/.test(t) ||
    /\b(?:switch|change)\b.{0,48}\benglish\b/.test(t) ||
    /\bin\s+english\b/.test(t) ||
    /\benglish\s+please\b/.test(t)
  ) {
    return "en";
  }

  return null;
}

export class LanguageDetectionService {
  detect(text: string, hints?: LanguageDetectionHints): LanguageDetectionResult {
    const trimmed = text.trim();
    if (!trimmed) {
      return UNCLEAR;
    }

    const { latin, devanagari, other } = scriptCounts(trimmed);
    if (latin === 0 && devanagari === 0 && other === 0) {
      return UNCLEAR;
    }

    // Prefer explicit "speak in X" over lexicon-of-the-utterance (KAN-27 mid-call switch).
    const requested = detectRequestedReplyLanguage(trimmed);
    if (requested) {
      return applyHint(
        {
          language: requested,
          confidence: 0.96,
          unclear: false,
          unsupported: false,
        },
        hints,
      );
    }

    const tokens = trimmed.toLowerCase().match(/[a-z]+/g) ?? [];
    let hindiHits = 0;
    let englishHits = 0;
    let unknown = 0;
    for (const token of tokens) {
      if (HINDI_WORDS.has(token)) {
        hindiHits += 1;
      } else if (ENGLISH_WORDS.has(token)) {
        englishHits += 1;
      } else {
        unknown += 1;
      }
    }

    if (other > 0 && devanagari === 0 && hindiHits === 0 && englishHits === 0) {
      return UNSUPPORTED;
    }

    const language = classify(hindiHits, englishHits, devanagari);
    if (!language) {
      // Latin-only English with many proper nouns (names) must not become "unsupported"
      // just because unknown >= 3. Only treat as unsupported when there are no EN/HI
      // lexicon hits (e.g. French) or non-Latin/non-Devanagari script.
      if (other > 0 && hindiHits === 0 && englishHits === 0) {
        return UNSUPPORTED;
      }
      if (latin > 0 && englishHits === 0 && hindiHits === 0 && unknown >= 3) {
        return UNSUPPORTED;
      }
      if (normalizeHint(hints?.providerLanguage) === "other" && englishHits === 0 && hindiHits === 0) {
        return UNSUPPORTED;
      }
      return UNCLEAR;
    }

    // Provider reports an out-of-scope language and the transcript is not clearly
    // Hindi/Hinglish (Devanagari or Hindi lexicon) — treat as unsupported.
    const providerHint = normalizeHint(hints?.providerLanguage);
    if (providerHint === "other" && language === "en" && hindiHits === 0 && devanagari === 0) {
      return UNSUPPORTED;
    }

    return applyHint(
      {
        language,
        confidence: confidenceFor(language, hindiHits, englishHits),
        unclear: false,
        unsupported: false,
      },
      hints,
    );
  }
}

export const languageDetectionService = new LanguageDetectionService();
