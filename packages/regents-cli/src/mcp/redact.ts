const REDACTED = "[redacted]";

const SENSITIVE_KEY_PATTERNS = [
  /receipt/i,
  /signature/i,
  /authorization/i,
  /private[_-]?key/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /^token$/i,
  /api[_-]?key/i,
  /secret/i,
  /^x-siwa-receipt$/i,
  /^x-key-id$/i,
  /^bearer[_-]?token$/i,
  /^auth[_-]?header$/i,
  /^sessionId$/i,
  /^payment-signature$/i,
  /^payment-response$/i,
  /^x-payment$/i,
  /^x-payment-response$/i,
];

const isSensitiveKey = (key: string): boolean =>
  SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));

export function redactRegentSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactRegentSecrets);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      isSensitiveKey(key) ? REDACTED : redactRegentSecrets(entry),
    ]),
  );
}
