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

/** English content words. Tiny stopwords that collide with Hindi are omitted. */
const ENGLISH_WORDS = new Set([
  "about",
  "am",
  "appointment",
  "around",
  "book",
  "booking",
  "can",
  "cancel",
  "clinic",
  "could",
  "doctor",
  "evening",
  "hello",
  "help",
  "hi",
  "like",
  "monday",
  "morning",
  "need",
  "next",
  "night",
  "please",
  "pm",
  "reschedule",
  "schedule",
  "slot",
  "thank",
  "thanks",
  "time",
  "today",
  "tomorrow",
  "tuesday",
  "want",
  "wednesday",
  "week",
  "with",
  "would",
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
      if (unknown >= 3 || other > 0) {
        return UNSUPPORTED;
      }
      // Whisper/provider said a non-POC language (fr, es, …).
      if (normalizeHint(hints?.providerLanguage) === "other") {
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
