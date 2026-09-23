const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[a-zA-Z0-9_-]{8,}\b/g,
  /\bBearer\s+[a-zA-Z0-9._\-+=/]{8,}\b/gi,
  /\b(?:api[_-]?key|access[_-]?token|secret|password)\s*[:=]\s*['"]?([^\s'"]+)/gi,
];

/** Redact API keys and credential-like substrings from a string. */
export function redactSecrets(value: string): string {
  let result = value;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}

/** Deep-clone JSON-safe values while redacting secret-like strings. */
export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 6) {
    return "[Truncated]";
  }
  if (typeof value === "string") {
    return redactSecrets(value);
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSecrets(value.message),
      code:
        "code" in value && typeof (value as { code?: unknown }).code === "string"
          ? (value as { code: string }).code
          : undefined,
    };
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth + 1));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (/api[_-]?key|secret|password|authorization|token/i.test(key)) {
        out[key] = "[REDACTED]";
        continue;
      }
      out[key] = redactValue(nested, depth + 1);
    }
    return out;
  }
  return value;
}
