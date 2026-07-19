/**
 * lib/security/vault/vault-masking.ts
 *
 * AGENTIK-SECURITY-VAULT-01
 * Standalone Org-Scoped Secret Vault — Secret Masking
 *
 * Deterministic masking of secret values for safe display.
 * No server-only, no Prisma, no React.
 *
 * Rules:
 *   value.length <= 4 → "****" (never reveal short secrets)
 *   value.length > 4  → first 4 chars + "****" + last 2 chars
 *   empty / falsy     → "****"
 */

// ── Masking ───────────────────────────────────────────────────────────────────

/**
 * Mask a secret value for safe display.
 *
 * Examples:
 *   "sk-prod-1234567890abcdef"  → "sk-p****ef"
 *   "myshortkey"                → "mysh****ey"
 *   "1234"                      → "****"
 *   ""                          → "****"
 */
export function maskSecret(value: string): string {
  if (!value || value.length <= 4) return "****";
  const first = value.slice(0, 4);
  const last  = value.slice(-2);
  return `${first}****${last}`;
}

/**
 * Check if a value appears to already be masked (contains ****).
 * Use this to avoid double-masking.
 */
export function isMasked(value: string): boolean {
  return typeof value === "string" && value.includes("****");
}

/**
 * Sanitize a string for log output — redact anything that looks like an API key or token
 * (contiguous alphanumeric/dash/underscore runs of 20+ characters).
 */
export function sanitizeForLog(text: string): string {
  return text.replace(/[A-Za-z0-9_\-]{20,}/g, "[REDACTED]");
}
