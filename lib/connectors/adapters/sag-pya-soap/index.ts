/**
 * sag-pya-soap/index.ts
 *
 * SAG PYA SOAP adapter — pulls customers (TERCEROS) and receivables (MOVIMIENTOS)
 * from the SAG enterprise SOAP API used by Castillitos and other PYA clients.
 * CARTERA does not exist in this installation; receivables use MOVIMIENTOS
 * joined with MOVIMIENTOS_ITEMS for real monetary amounts (confirmed 2026-04-08).
 *
 * Transport layer: lib/connectors/pya/client.ts (consultaSagJson).
 * Auth: lib/connectors/pya/auth.ts (getPyaConfig).
 *
 * Rate limits enforced by an in-memory token bucket:
 *   - 10 requests / minute
 *   - 340 requests / day
 * Each adapter instance tracks its own bucket; a new instance is created per
 * sync run so the daily counter resets across runs (correct behaviour because
 * the SAG API limit is per-key, not per-process).
 *
 * Incremental sync:
 *   SAG returns ALL rows in a single response (no server-side pagination).
 *   Incremental behaviour is achieved by filtering rows client-side:
 *     rows where FECHA_MODIFICACION > cursor are kept; older rows are dropped.
 *   hasMore is always false — the full data set fits in one page.
 *
 * Config shape (stored in Connector.config):
 * ```json
 * {
 *   "token": "abc123",
 *   "endpointUrl": "http://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap",
 *   "database": "INDIANAA_CASTILLO-ALZATE-DSLLO",
 *   "customerQuery": "SELECT * FROM TERCEROS",
 *   "receivableQuery": "(omit to use DEFAULT_RECEIVABLE_QUERY JOIN)"
 * }
 * ```
 */

import { consultaSagJson } from "@/lib/connectors/pya/client";
import { BaseAdapter }     from "@/lib/connectors/core/base-adapter";
import { sagDebug, sagInfo } from "@/lib/sag/logger";
import { mapSagCustomer, mapSagReceivable } from "./mappers";
import type {
  AdapterConfig,
  PullResult,
  SyncModule,
  UnifiedCustomer,
  UnifiedReceivable,
} from "@/lib/connectors/core/types";

// ── Config ────────────────────────────────────────────────────────────────────

interface SagPyaSoapConfig extends AdapterConfig {
  token:            string;
  endpointUrl?:     string;
  /** Company database name (a_s_bd) for the SAG SOAP call. */
  database?:        string;
  customerQuery?:   string;
  receivableQuery?: string;
}

const DEFAULT_ENDPOINT =
  process.env.PYA_SOAP_ENDPOINT ??
  "https://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap";

// Fallback database name from env — same var used by loadSagTestEnv() in lib/sag/env.ts.
// This ensures the adapter works even when Connector.config does not store 'database'.
const DEFAULT_DATABASE = process.env.PYA_SAG_BD;

// Fallback token from env — mirrors the resolution order the diagnostic script uses:
//   PYA_SOAP_TOKEN first (production), SAG_TEST_TOKEN second (dev/CI).
// Without this, a null/missing connector.config.token produces the string "null"
// in the SOAP envelope (runtime JS coercion) → SAG rejects it → s_estado=FALLIDO.
const DEFAULT_TOKEN =
  process.env.PYA_SOAP_TOKEN?.trim() ||
  process.env.SAG_TEST_TOKEN?.trim() ||
  undefined;

// Manual v32 (PYA, 2026-02-10) — the only documented consultaSagJson example
// queries the v_cl view, NOT the TERCEROS raw table directly:
//   SELECT TOP 10 n_nit AS Documento, sc_nombre AS Nombre FROM v_cl
// v_cl is a SAG-managed view over TERCEROS that exposes the same column names
// (n_nit, sc_nombre, ss_nombre1/2, ss_apellido1/2, sc_naturaleza, etc.) that
// our mapper already expects — no mapper changes required.
//
// NOTE: TOP is not applied here because this query runs for both dry-run and
// full sync. Dry-run mode (dryRun:true) skips storage but still pulls all rows.
// The dry-run script (scripts/sag-test-dry-run.ts) uses TOP 100 for validation.
const DEFAULT_CUSTOMER_QUERY = "SELECT * FROM v_cl";

// Confirmed 2026-04-08: CARTERA does not exist in this SAG installation.
// MOVIMIENTOS is the document-header table; monetary amounts live in MOVIMIENTOS_ITEMS.
// Confirmed 2026-04-08: SAG SQL engine supports LEFT JOIN + GROUP BY + SUM(ISNULL(...)).
// Single-pass JOIN query — one SOAP call per sync.
//
// Amount fields after JOIN:
//   total_valor     = SUM(ISNULL(mi.n_valor, 0))     — net line values ex-IVA
//   total_iva       = SUM(ISNULL(mi.n_iva, 0))        — sum of IVA % rates (reference only)
//   total_descuento = SUM(ISNULL(mi.n_descuento, 0))  — total discount
//
// paidAmount not available: RECIBOS/ANTICIPOS/ABONOS tables do not exist;
// PAGOS exists but is empty. balanceDue = total_valor until a payment source is found.
//
// FUENTES join (confirmed 2026-04-11): provides sc_cobrar_pagar ('C'=AR | 'P'=AP),
// k_n_clase_fuente (4=customer orders), ka_ni_forma_pago_fte (1=immediate | 2=30-day credit).
// Used to filter non-AR documents and compute dueDate.
const DEFAULT_RECEIVABLE_QUERY = [
  "SELECT",
  "  m.ka_nl_movimiento, m.ka_ni_fuente, m.n_numero_documento,",
  "  m.ka_nl_tercero, m.sc_beneficiario, m.d_fecha_documento,",
  "  m.ss_moneda, m.ddt_fecha_new,",
  "  SUM(ISNULL(mi.n_valor, 0))      AS total_valor,",
  "  SUM(ISNULL(mi.n_iva, 0))        AS total_iva,",
  "  SUM(ISNULL(mi.n_descuento, 0))  AS total_descuento,",
  "  f.sc_cobrar_pagar, f.k_n_clase_fuente, f.ka_ni_forma_pago_fte",
  "FROM MOVIMIENTOS m",
  "LEFT JOIN MOVIMIENTOS_ITEMS mi",
  "  ON mi.ka_nl_movimiento = m.ka_nl_movimiento",
  "LEFT JOIN FUENTES f",
  "  ON f.ka_ni_fuente = m.ka_ni_fuente",
  "WHERE m.sc_anulado = 'N'",
  "GROUP BY",
  "  m.ka_nl_movimiento, m.ka_ni_fuente, m.n_numero_documento,",
  "  m.ka_nl_tercero, m.sc_beneficiario, m.d_fecha_documento,",
  "  m.ss_moneda, m.ddt_fecha_new,",
  "  f.sc_cobrar_pagar, f.k_n_clase_fuente, f.ka_ni_forma_pago_fte",
  "ORDER BY m.ka_nl_movimiento",
].join(" ");

// ── Envelope preview helper ───────────────────────────────────────────────

/**
 * Returns a redacted envelope string suitable for debug logging.
 * Token is never included — only "[REDACTED]" is shown.
 * Database and consulta are shown verbatim so mismatches are visible.
 */
function buildEnvelopePreview(consulta: string, database: string | undefined, endpoint: string): string {
  const SOAP_NS_ENV = "http://schemas.xmlsoap.org/soap/envelope/";
  const SOAP_NS_TNS = "http://tempuri.org/";
  const bdParam = database ? `<tns:a_s_bd>${database}</tns:a_s_bd>` : "<!-- a_s_bd OMITTED -->";
  return (
    `POST ${endpoint}\n` +
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:soap="${SOAP_NS_ENV}" xmlns:tns="${SOAP_NS_TNS}">` +
      `<soap:Body>` +
        `<tns:consultaSagJson>` +
          `<tns:a_s_token>[REDACTED]</tns:a_s_token>` +
          bdParam +
          `<tns:a_s_consulta>${consulta}</tns:a_s_consulta>` +
        `</tns:consultaSagJson>` +
      `</soap:Body>` +
    `</soap:Envelope>`
  );
}

// ── Rate limiter ──────────────────────────────────────────────────────────────

/**
 * Simple in-memory token bucket rate limiter.
 *
 * Two independent buckets are maintained:
 *   - per-minute:  refills fully every 60 s
 *   - per-day:     refills fully every 86 400 s
 *
 * `consume()` returns a Promise that resolves once a token is available in
 * both buckets, sleeping as needed. Throws after 10 minutes of waiting to
 * prevent hangs.
 */
class TokenBucket {
  private minuteTokens: number;
  private dayTokens:    number;

  private lastMinuteRefill: number; // epoch ms
  private lastDayRefill:    number; // epoch ms

  private readonly minuteLimit: number;
  private readonly dayLimit:    number;

  constructor(minuteLimit: number, dayLimit: number) {
    this.minuteLimit      = minuteLimit;
    this.dayLimit         = dayLimit;
    this.minuteTokens     = minuteLimit;
    this.dayTokens        = dayLimit;
    this.lastMinuteRefill = Date.now();
    this.lastDayRefill    = Date.now();
  }

  /** Consume one token, waiting if the bucket is empty. */
  async consume(): Promise<void> {
    const deadline = Date.now() + 10 * 60_000; // 10-minute hard deadline

    while (true) {
      this._refill();

      if (this.minuteTokens >= 1 && this.dayTokens >= 1) {
        this.minuteTokens -= 1;
        this.dayTokens    -= 1;
        return;
      }

      if (Date.now() > deadline) {
        throw new Error(
          "[SagPyaSoapAdapter] Rate limit wait exceeded 10 minutes — aborting."
        );
      }

      // Calculate how long to sleep until the first bucket can refill
      const now = Date.now();
      let waitMs = 100;

      if (this.minuteTokens < 1) {
        const msSinceMinuteRefill = now - this.lastMinuteRefill;
        const msUntilMinuteRefill = 60_000 - msSinceMinuteRefill;
        waitMs = Math.max(waitMs, msUntilMinuteRefill + 10);
      }
      if (this.dayTokens < 1) {
        // Don't wait a full day — throw instead to surface the limit clearly
        throw new Error(
          "[SagPyaSoapAdapter] Daily rate limit of 340 requests exhausted. " +
          "Retry tomorrow or reduce sync frequency."
        );
      }

      await sleep(waitMs);
    }
  }

  private _refill(): void {
    const now = Date.now();

    const minuteElapsed = now - this.lastMinuteRefill;
    if (minuteElapsed >= 60_000) {
      const periods = Math.floor(minuteElapsed / 60_000);
      this.minuteTokens = Math.min(
        this.minuteLimit,
        this.minuteTokens + periods * this.minuteLimit
      );
      this.lastMinuteRefill += periods * 60_000;
    }

    const dayElapsed = now - this.lastDayRefill;
    if (dayElapsed >= 86_400_000) {
      this.dayTokens    = this.dayLimit;
      this.lastDayRefill = now;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class SagPyaSoapAdapter extends BaseAdapter {
  readonly source         = "sag_pya_soap" as const;
  readonly displayName    = "SAG PYA SOAP";
  readonly supportedModules: SyncModule[] = ["customers", "receivables"];

  private readonly rateLimiter = new TokenBucket(10, 340);

  private get cfg(): SagPyaSoapConfig {
    return this.config as SagPyaSoapConfig;
  }

  private get apiConfig() {
    return {
      endpointUrl: this.cfg.endpointUrl ?? DEFAULT_ENDPOINT,
      // Fallback to env vars when Connector.config.token is absent or null.
      // Without a valid token SAG returns s_estado=FALLIDO (NullReferenceException).
      // If the DB value is null at runtime (JS coercion → "null" string), the fallback
      // prevents the corrupted value reaching the SOAP envelope.
      token:       this.cfg.token || DEFAULT_TOKEN || "",
      // If the Connector.config row does not store 'database', fall back to the
      // PYA_SAG_BD env var (same source used by loadSagTestEnv in lib/sag/env.ts).
      // Without a_s_bd the SAG server throws NullReferenceException (s_estado=FALLIDO).
      database:    this.cfg.database ?? DEFAULT_DATABASE,
    };
  }

  // ── pullCustomers ───────────────────────────────────────────────────────────

  async pullCustomers(cursor?: string): Promise<PullResult<UnifiedCustomer>> {
    await this.rateLimiter.consume();

    const query    = this.cfg.customerQuery ?? DEFAULT_CUSTOMER_QUERY;
    const { endpointUrl, database } = this.apiConfig;

    sagInfo("soap:call:start", {
      orgId:       this.orgId,
      module:      "customers",
      message:     `token=${this.apiConfig.token ? "[SET]" : "MISSING"} a_s_bd=${database ?? "(omitted)"} endpoint=${endpointUrl} query=${query.slice(0, 80)}`,
    });
    sagDebug("soap:call:start", {
      orgId:       this.orgId,
      module:      "customers",
      message:     buildEnvelopePreview(query, database, endpointUrl),
    });

    const rows  = await consultaSagJson(this.apiConfig, query);

    // Cursor = ISO date of last FECHA_MODIFICACION seen in a previous run.
    const cursorDate = cursor ? new Date(cursor) : null;

    const customers: UnifiedCustomer[] = [];
    let latestDate: Date | null = null;

    for (const row of rows) {
      const r = row as Record<string, unknown>;

      // Incremental filter — column name is lowercase per mapper (ddt_fecha_modificacion).
      if (cursorDate) {
        const modifiedStr = r["ddt_fecha_modificacion"];
        if (modifiedStr) {
          const modDate = new Date(String(modifiedStr).slice(0, 10) + "T00:00:00Z");
          if (!isNaN(modDate.getTime()) && modDate <= cursorDate) {
            continue;
          }
        }
      }

      const customer = mapSagCustomer(r, this.orgId);
      customers.push(customer);

      if (customer.updatedAt.getTime() > 0) {
        if (!latestDate || customer.updatedAt > latestDate) {
          latestDate = customer.updatedAt;
        }
      }
    }

    return {
      records:    customers,
      nextCursor: latestDate ? latestDate.toISOString() : cursor ?? null,
      hasMore:    false,
      totalCount: rows.length,
    };
  }

  // ── pullReceivables ─────────────────────────────────────────────────────────

  async pullReceivables(cursor?: string): Promise<PullResult<UnifiedReceivable>> {
    await this.rateLimiter.consume();

    const query    = this.cfg.receivableQuery ?? DEFAULT_RECEIVABLE_QUERY;
    const { endpointUrl, database } = this.apiConfig;

    sagInfo("soap:call:start", {
      orgId:       this.orgId,
      module:      "receivables",
      message:     `token=${this.apiConfig.token ? "[SET]" : "MISSING"} a_s_bd=${database ?? "(omitted)"} endpoint=${endpointUrl} query=${query.slice(0, 80)}`,
    });
    sagDebug("soap:call:start", {
      orgId:       this.orgId,
      module:      "receivables",
      message:     buildEnvelopePreview(query, database, endpointUrl),
    });

    const rows  = await consultaSagJson(this.apiConfig, query);

    // Incremental cursor: d_fecha_documento (ISO date on the JOIN result row).
    // Rows where d_fecha_documento <= cursor are skipped (already seen).
    const cursorDate = cursor ? new Date(cursor) : null;

    const receivables: UnifiedReceivable[] = [];
    let latestDate: Date | null = null;

    for (const row of rows) {
      const r = row as Record<string, unknown>;

      if (cursorDate) {
        const dateStr = r["d_fecha_documento"];
        if (dateStr) {
          const d = new Date(String(dateStr).slice(0, 10) + "T00:00:00Z");
          if (!isNaN(d.getTime()) && d <= cursorDate) {
            continue;
          }
        }
      }

      const receivable = mapSagReceivable(r, this.orgId);
      if (!receivable) continue; // skip non-AR documents (payables, orders)
      receivables.push(receivable);

      if (receivable.issueDate.getTime() > 0) {
        if (!latestDate || receivable.issueDate > latestDate) {
          latestDate = receivable.issueDate;
        }
      }
    }

    return {
      records:    receivables,
      nextCursor: latestDate ? latestDate.toISOString() : cursor ?? null,
      hasMore:    false,
      totalCount: rows.length,
    };
  }

  // ── testConnection ──────────────────────────────────────────────────────────

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.rateLimiter.consume();
      // Use a minimal query to validate token, endpoint, and a_s_bd (same view as pullCustomers)
      await consultaSagJson(this.apiConfig, "SELECT TOP 1 * FROM v_cl");
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  describeCursor(cursor: string): string {
    try {
      return `desde ${new Date(cursor).toLocaleDateString("es-CO", { dateStyle: "medium" })}`;
    } catch {
      return cursor;
    }
  }
}
