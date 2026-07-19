/**
 * lib/copilot/execution-store/execution-store-sanitizer.ts
 *
 * AGENTIK-EXECUTION-PERSISTENCE-01 — Payload sanitizer for execution snapshots.
 * SERVER ONLY — no React, no domain-specific code.
 * @server-only
 *
 * Removes sensitive fields from any arbitrary JSON-serialisable payload
 * before it is written to the database. Applied to:
 *   - inputSnapshot (step parameters from intent resolver)
 *   - outputSnapshot (handler result data)
 *   - planSnapshot   (full execution plan)
 *   - reportSnapshot (full execution report)
 *
 * Design:
 *   - Deep clone + recursive mask — never mutates the original object.
 *   - Case-insensitive key matching.
 *   - Replaces sensitive values with the literal string "[REDACTED]".
 *   - Safe on null / undefined / primitive types.
 *   - No external dependencies.
 */
import "server-only";

// ── Sensitive field registry ───────────────────────────────────────────────────

/**
 * Keys whose values must always be redacted, regardless of nesting depth.
 * Matching is case-insensitive and by substring (e.g. "AccessToken" matches "shopifyAccessToken").
 */
const SENSITIVE_PATTERNS: readonly RegExp[] = [
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /password/i,
  /\bsecret\b/i,
  /api[_-]?key/i,
  /\bauthorization\b/i,
  /\bcookie\b/i,
  /private[_-]?key/i,
  /certificate/i,
  /\.p12$/i,
  /\bbearer\b/i,
  /\btoken\b/i,
] as const;

const REDACTED = "[REDACTED]";
const MAX_DEPTH = 12;

/** Return true if the given object key should be redacted. */
function isSensitiveKey(key: string): boolean {
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(key));
}

// ── Core sanitizer ────────────────────────────────────────────────────────────

/**
 * Deep-clone and sanitise an arbitrary payload before persisting it.
 *
 * - Primitive values (string, number, boolean, null, undefined) are returned as-is.
 * - Arrays are cloned element by element.
 * - Plain objects are cloned key by key; sensitive keys are replaced with "[REDACTED]".
 * - Non-plain objects (Date, RegExp, etc.) are converted to their string representation.
 * - Cycles are handled by depth limiting (MAX_DEPTH = 12).
 *
 * @param payload - Any JSON-serialisable value from an execution snapshot
 * @returns       A sanitised deep clone safe to persist
 */
export function sanitizeExecutionPayload(payload: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[DEPTH_LIMIT]";
  if (payload === null || payload === undefined) return payload;

  // Primitives — safe as-is
  if (typeof payload === "string") return payload;
  if (typeof payload === "number") return payload;
  if (typeof payload === "boolean") return payload;

  // Arrays
  if (Array.isArray(payload)) {
    return payload.map(item => sanitizeExecutionPayload(item, depth + 1));
  }

  // Non-plain objects (Date, RegExp, Buffer, etc.) — stringify
  if (typeof payload === "object") {
    const proto = Object.getPrototypeOf(payload);
    const isPlain = proto === Object.prototype || proto === null;

    if (!isPlain) {
      try { return String(payload); } catch { return "[UNSERIALIZABLE]"; }
    }

    // Plain object — deep-clone with key redaction
    const record = payload as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(record)) {
      if (isSensitiveKey(key)) {
        result[key] = REDACTED;
      } else {
        result[key] = sanitizeExecutionPayload(value, depth + 1);
      }
    }

    return result;
  }

  // Functions, symbols, etc. — not serialisable
  return "[UNSERIALIZABLE]";
}

/**
 * Sanitise a payload and return it only if it is non-null.
 * Helper used by store implementations before persisting snapshots.
 */
export function sanitizeSnapshot(payload: unknown): unknown | undefined {
  if (payload === null || payload === undefined) return undefined;
  return sanitizeExecutionPayload(payload);
}
