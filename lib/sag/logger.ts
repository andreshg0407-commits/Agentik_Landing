/**
 * lib/sag/logger.ts
 *
 * Structured logging utility for SAG operations.
 *
 * Provides consistent, parseable log lines for:
 *   - Sync runs (start / success / failure)
 *   - Write operations (enqueue / approve / send / result)
 *   - SOAP-level errors (fault / HTTP error / parse error)
 *   - Master-data validation warnings/errors
 *
 * Output goes to stderr so it does not pollute JSON API responses.
 * All lines are prefixed with [SAG] and a structured context object,
 * making them easy to grep, forward to a log aggregator, or parse.
 *
 * Usage:
 *   import { sagLog } from "@/lib/sag/logger";
 *
 *   sagLog("info",  "sync:start",  { orgId, connectorId, module });
 *   sagLog("error", "soap:fault",  { orgId, tipo, code: "SAG_SOAP_FAULT", message });
 *   sagLog("warn",  "master:warn", { orgId, field: "FORMA_PAGO", value, reason });
 */

// ── Level type ─────────────────────────────────────────────────────────────────

export type SagLogLevel = "debug" | "info" | "warn" | "error";

// ── Event categories ───────────────────────────────────────────────────────────

export type SagEventCode =
  // Sync
  | "sync:start"
  | "sync:module:ok"
  | "sync:module:fail"
  | "sync:all:ok"
  | "sync:all:fail"
  | "sync:hook:fail"
  // Write queue
  | "write:enqueue"
  | "write:approve"
  | "write:reject"
  | "write:send:start"
  | "write:send:ok"
  | "write:send:fail"
  | "write:retry"
  // SOAP transport
  | "soap:call:start"   // emitted before every consultaSagJson call (token never included)
  | "soap:call:done"   // emitted after SOAP response received (row count)
  | "soap:cache:ready" // emitted after adapter cache is populated (AR row count)
  | "soap:page"        // emitted per pullReceivables page (offset, slice, hasMore)
  | "soap:fault"
  | "soap:http:error"
  | "soap:parse:error"
  | "soap:ok"
  // Master data
  | "master:warn"
  | "master:error"
  | "master:missing"
  // Homologation
  | "homolog:summary"
  | "homolog:pending";

// ── Context type ───────────────────────────────────────────────────────────────

export interface SagLogContext {
  orgId?:       string;
  connectorId?: string;
  module?:      string;
  runId?:       string;
  opId?:        string;         // SagWriteOp.id
  tipo?:        number;         // SagWriteType
  code?:        string;         // error code, e.g. "SAG_SOAP_FAULT"
  message?:     string;
  field?:       string;         // master-data field name
  value?:       string;         // master-data rejected value
  reason?:      string;
  retryCount?:  number;
  ms?:          number;         // elapsed milliseconds
  rows?: {
    imported?: number;
    skipped?:  number;
    errored?:  number;
  };
  [key: string]: unknown;       // allow ad-hoc fields
}

// ── Core logger ────────────────────────────────────────────────────────────────

const LEVEL_RANK: Record<SagLogLevel, number> = {
  debug: 0,
  info:  1,
  warn:  2,
  error: 3,
};

/**
 * Minimum log level. Override via SAG_LOG_LEVEL env var.
 * Defaults to "info" in production, "debug" when PYA_DEBUG=true.
 */
function minLevel(): SagLogLevel {
  if (process.env.SAG_LOG_LEVEL) {
    const v = process.env.SAG_LOG_LEVEL as SagLogLevel;
    if (v in LEVEL_RANK) return v;
  }
  return process.env.PYA_DEBUG === "true" ? "debug" : "info";
}

/**
 * Emit a structured SAG log line to stderr.
 *
 * Format:
 *   [SAG] {level} {event} {jsonContext}
 *
 * Example:
 *   [SAG] error soap:fault {"orgId":"abc","tipo":2,"code":"SAG_SOAP_FAULT","message":"..."}
 */
export function sagLog(
  level:   SagLogLevel,
  event:   SagEventCode,
  context: SagLogContext = {},
): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[minLevel()]) return;

  const ts  = new Date().toISOString();
  const ctx = JSON.stringify({ ts, ...context });
  // eslint-disable-next-line no-console
  console.error(`[SAG] ${level.toUpperCase().padEnd(5)} ${event.padEnd(22)} ${ctx}`);
}

// ── Convenience shortcuts ──────────────────────────────────────────────────────

export const sagDebug = (event: SagEventCode, ctx?: SagLogContext) =>
  sagLog("debug", event, ctx);

export const sagInfo  = (event: SagEventCode, ctx?: SagLogContext) =>
  sagLog("info",  event, ctx);

export const sagWarn  = (event: SagEventCode, ctx?: SagLogContext) =>
  sagLog("warn",  event, ctx);

export const sagError = (event: SagEventCode, ctx?: SagLogContext) =>
  sagLog("error", event, ctx);

// ── Error serializer ───────────────────────────────────────────────────────────

/**
 * Extract a safe, structured summary from any thrown value.
 * Parses known SAG error prefixes into `code` + `message`.
 *
 * Usage:
 *   catch (err) {
 *     sagError("soap:fault", serializeSagError(err, { orgId, tipo }));
 *   }
 */
export function serializeSagError(
  err:     unknown,
  context: SagLogContext = {},
): SagLogContext {
  const raw = err instanceof Error ? err.message : String(err);

  // Parse known SAG error codes: "SAG_SOAP_FAULT [xxx]: yyy"
  const knownPrefixes = [
    "SAG_SOAP_FAULT",
    "SAG_HTTP_ERROR",
    "SAG_PARSE_ERROR",
  ] as const;

  for (const prefix of knownPrefixes) {
    if (raw.startsWith(prefix)) {
      return {
        ...context,
        code:    prefix,
        message: raw.slice(prefix.length).replace(/^[: ]+/, ""),
        stack:   err instanceof Error ? err.stack?.split("\n")[1]?.trim() : undefined,
      };
    }
  }

  return {
    ...context,
    code:    "UNKNOWN_ERROR",
    message: raw.slice(0, 500),
    stack:   err instanceof Error ? err.stack?.split("\n")[1]?.trim() : undefined,
  };
}
