const WAIT_PATTERNS: RegExp[] = [
  /\bhold on\b/i,
  /\bwait\b/i,
  /\bone (sec|second|moment|minute|min)\b/i,
  /\bgive me (a )?(sec|second|moment|minute|min)\b/i,
  /\bhang on\b/i,
  /\bjust a (sec|second|moment|minute|min)\b/i,
];

const RETURN_PATTERNS: RegExp[] = [
  /\bi('|\s+a)?m back\b/i,
  /\bi am back\b/i,
  /\blet'?s continue\b/i,
  /\bready\b/i,
  /\bok(,)? (i'?m |im )?back\b/i,
  /\bcontinue\b/i,
];

export function isWaitIntent(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }
  return WAIT_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isReturnIntent(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }
  return RETURN_PATTERNS.some((pattern) => pattern.test(normalized));
}
