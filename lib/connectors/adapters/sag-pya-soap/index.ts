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
 *   "receivableQuery": "(omit to use DEFAULT_RECEIVABLE_QUERY JOIN)",
 *   "fuentesMap": { "1": "FE", "2": "FD", "3": "FW" }
 * }
 * ```
 * fuentesMap: per-company FUENTES registry (kaNiFuente → codigoFuente).
 * Required for PYA companies other than Castillitos.
 * When omitted, falls back to CASTILLITOS_SOURCE_SEMANTIC_RULES.
 */

import { consultaSagJson } from "@/lib/connectors/pya/client";
import { BaseAdapter }     from "@/lib/connectors/core/base-adapter";
import { sagDebug, sagInfo } from "@/lib/sag/logger";
import { mapSagCustomer, mapSagReceivable, mapSagMovement, mapSagOrder, mapSagCollection } from "./mappers";
// Castillitos FUENTES registry — used as the default fuentesMap when
// connector.config.fuentesMap is absent (backward-compat for existing connectors).
// Jupiter Pets and future tenants must supply their own fuentesMap in connector.config.
import { CASTILLITOS_SOURCE_SEMANTIC_RULES } from "@/lib/sag/master-data/source-semantic-rules";
import type {
  AdapterConfig,
  PullResult,
  SyncModule,
  UnifiedCollection,
  UnifiedCustomer,
  UnifiedMovement,
  UnifiedReceivable,
  UnifiedSagOrder,
} from "@/lib/connectors/core/types";

// ── Config ────────────────────────────────────────────────────────────────────

interface SagPyaSoapConfig extends AdapterConfig {
  token:            string;
  endpointUrl?:     string;
  /** Company database name (a_s_bd) for the SAG SOAP call. */
  database?:        string;
  customerQuery?:   string;
  receivableQuery?: string;
  /**
   * Per-connector FUENTES registry: maps kaNiFuente (integer) → codigoFuente (string).
   * Required for any PYA company other than Castillitos.
   * When absent, the adapter falls back to CASTILLITOS_SOURCE_SEMANTIC_RULES.
   *
   * Build from FUENTES.xlsx for each new company:
   *   { "1": "FE", "2": "FD", "3": "FW", ... }
   * Keys are stored as strings in JSON; the adapter coerces them to numbers.
   */
  fuentesMap?: Record<string, string>;
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
  "  f.sc_cobrar_pagar, f.k_n_clase_fuente, f.ka_ni_forma_pago_fte,",
  // JOIN TERCEROS to get the real NIT (n_nit) instead of the internal FK (ka_nl_tercero).
  // MAX() avoids adding t.n_nit to GROUP BY — safe because ka_nl_tercero is a unique PK
  // in TERCEROS so one tercero = one n_nit.
  "  MAX(t.n_nit)                     AS nit_tercero",
  "FROM MOVIMIENTOS m",
  "LEFT JOIN MOVIMIENTOS_ITEMS mi",
  "  ON mi.ka_nl_movimiento = m.ka_nl_movimiento",
  "LEFT JOIN FUENTES f",
  "  ON f.ka_ni_fuente = m.ka_ni_fuente",
  "LEFT JOIN TERCEROS t",
  "  ON t.ka_nl_tercero = m.ka_nl_tercero",
  "WHERE m.sc_anulado = 'N'",
  "GROUP BY",
  "  m.ka_nl_movimiento, m.ka_ni_fuente, m.n_numero_documento,",
  "  m.ka_nl_tercero, m.sc_beneficiario, m.d_fecha_documento,",
  "  m.ss_moneda, m.ddt_fecha_new,",
  "  f.sc_cobrar_pagar, f.k_n_clase_fuente, f.ka_ni_forma_pago_fte",
  "ORDER BY m.ka_nl_movimiento",
].join(" ");

// DEFAULT_MOVEMENTS_QUERY — IDENTICAL to DEFAULT_RECEIVABLE_QUERY.
//
// k_sc_codigo_fuente is NOT included here: adding it to GROUP BY causes a SAG
// NullReferenceException on the full dataset (reproduced 2026-04-24; works only
// with TOP 10 in probe).  comprobanteCode is instead derived client-side from
// ka_ni_fuente via the per-connector fuentesMap (connector.config.fuentesMap).
const DEFAULT_MOVEMENTS_QUERY = DEFAULT_RECEIVABLE_QUERY;

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

/**
 * Page size for client-side receivables pagination.
 *
 * SAG returns ALL rows in one SOAP response (no server-side pagination).
 * We cache the response in the adapter instance and slice it into pages of
 * this size so the sync engine can checkpoint the cursor after every batch,
 * keeping individual Vercel invocations well under the 120-second timeout.
 *
 * 500 rows × ~5 ms/upsert = ~2.5 s of DB writes per page.
 * With maxPages=20 per invocation: 20 × 2.5 s + 1 SOAP call ≈ 55–70 s.
 */
const RX_PAGE_SIZE = 500;

/**
 * Cursor sentinel prefixes used by pullReceivables.
 *
 *   "page:N"   — N records already written in the current bulk-import epoch.
 *                Next call starts at offset N in the cached (or re-fetched) row array.
 *   "date:ISO" — Incremental: only rows where issueDate > ISO need syncing.
 *                Produced once all pages of the current epoch have been sent.
 *
 * Legacy ISO-only cursors (no prefix) produced by older runs are treated as
 * "date:" cursors — behaviour is identical.
 */
const PAGE_PFX = "page:";
const DATE_PFX = "date:";

export class SagPyaSoapAdapter extends BaseAdapter {
  readonly source         = "sag_pya_soap" as const;
  readonly displayName    = "SAG PYA SOAP";
  readonly supportedModules: SyncModule[] = ["customers", "receivables", "movements", "collections", "orders"];

  private readonly rateLimiter = new TokenBucket(10, 340);

  /**
   * Instance-level cache for the receivables SOAP response.
   *
   * Populated on the first pullReceivables() call within a sync run and
   * reused for every subsequent page iteration within the same invocation —
   * so SAG is hit exactly once per Vercel function call regardless of how
   * many pages the engine iterates through.
   *
   * The cache is intentionally NOT shared across adapter instances (i.e. across
   * Vercel invocations). On a resumed "page:N" cursor the SOAP data is
   * re-fetched once and the slice starting at N is returned.
   */
  private _rxCache: UnifiedReceivable[] | null = null;
  private _rxCacheLatestDate: Date | null = null;
  private _movCache: UnifiedMovement[] | null = null;
  private _movCacheLatestDate: Date | null = null;
  // PD orders — populated as a side-effect of the movement cache fill.
  // Same MOVIMIENTOS query; class-4 rows are split off here instead of discarded.
  private _orderCache: UnifiedSagOrder[] | null = null;
  // v_pagosnew collections — independent SOAP call, own cache.
  private _colCache: UnifiedCollection[] | null = null;
  private _colCacheLatestDate: Date | null = null;

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

  /**
   * Per-instance FUENTES lookup: kaNiFuente (int) → codigoFuente (string | null).
   *
   * Priority:
   *   1. connector.config.fuentesMap — explicit map stored in the Connector DB row.
   *      JSON keys are strings; coerce to number for lookup.
   *   2. CASTILLITOS_SOURCE_SEMANTIC_RULES — built-in fallback for backward-compat.
   *      Any connector without fuentesMap (i.e. all existing Castillitos connectors)
   *      continues to work without migration.
   */
  private _fuenteCodeMapCache: ReadonlyMap<number, string> | null = null;

  private _getFuenteCodeMap(): ReadonlyMap<number, string> {
    if (this._fuenteCodeMapCache) return this._fuenteCodeMapCache;

    const explicit = this.cfg.fuentesMap;
    if (explicit && Object.keys(explicit).length > 0) {
      // JSON stores keys as strings — coerce to number
      this._fuenteCodeMapCache = new Map(
        Object.entries(explicit).map(([k, v]) => [Number(k), v])
      );
    } else {
      // Fallback: Castillitos built-in registry
      this._fuenteCodeMapCache = new Map(
        CASTILLITOS_SOURCE_SEMANTIC_RULES.map(r => [r.kaNiFuente, r.codigoFuente])
      );
    }
    return this._fuenteCodeMapCache;
  }

  /** Bound lookup function passed to mapSagMovement / mapSagOrder. */
  private fuenteToCode = (kaNiFuente: number): string | null => {
    return this._getFuenteCodeMap().get(kaNiFuente) ?? null;
  };

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
  //
  // Batch-safe pagination strategy
  // ────────────────────────────────
  // SAG has no server-side pagination — it returns all rows in one SOAP call.
  // We implement client-side pagination via an instance-level cache:
  //
  //   First call (cursor null or "date:ISO"):
  //     1. Fire one SOAP call → map + filter AR rows → store in _rxCache.
  //     2. If cursor is "date:ISO": filter cache to rows newer than ISO,
  //        return all matching rows as a single non-paginated result
  //        (incremental syncs are typically small — a few hundred rows at most).
  //     3. If no cursor (full sync): slice cache[0 : RX_PAGE_SIZE],
  //        return with hasMore=true and nextCursor="page:RX_PAGE_SIZE".
  //
  //   Subsequent calls (cursor "page:N") — same Vercel invocation:
  //     Use _rxCache (already warm). Return slice[N : N+RX_PAGE_SIZE].
  //     If slice is smaller than RX_PAGE_SIZE → last page: hasMore=false,
  //     nextCursor="date:latestIssueDate" (switches to incremental mode).
  //
  //   Resumed calls (cursor "page:N") — new Vercel invocation, cache cold:
  //     Re-fetch SOAP once → fill _rxCache → slice from N as above.
  //     One SOAP call per invocation, regardless of maxPages.
  //
  // Cursor lifecycle:
  //   null → "page:500" → "page:1000" → … → "date:ISO" → "date:ISO2" → …

  async pullReceivables(cursor?: string): Promise<PullResult<UnifiedReceivable>> {
    // ── Decode cursor ─────────────────────────────────────────────────────────
    let pageOffset  = 0;
    let dateFilter: Date | null = null;

    if (!cursor) {
      // Fresh full sync — start from offset 0
      pageOffset = 0;
    } else if (cursor.startsWith(PAGE_PFX)) {
      pageOffset = parseInt(cursor.slice(PAGE_PFX.length), 10);
      if (isNaN(pageOffset) || pageOffset < 0) pageOffset = 0;
    } else {
      // "date:ISO" or legacy bare ISO — incremental
      const iso = cursor.startsWith(DATE_PFX) ? cursor.slice(DATE_PFX.length) : cursor;
      dateFilter = new Date(iso);
      if (isNaN(dateFilter.getTime())) dateFilter = null;
    }

    // ── Populate cache (once per adapter instance / Vercel invocation) ────────
    if (!this._rxCache) {
      await this.rateLimiter.consume();

      const query    = this.cfg.receivableQuery ?? DEFAULT_RECEIVABLE_QUERY;
      const { endpointUrl, database } = this.apiConfig;

      sagInfo("soap:call:start", {
        orgId:   this.orgId,
        module:  "receivables",
        message: `token=${this.apiConfig.token ? "[SET]" : "MISSING"} a_s_bd=${database ?? "(omitted)"} endpoint=${endpointUrl} query=${query.slice(0, 80)}`,
      });
      sagDebug("soap:call:start", {
        orgId:   this.orgId,
        module:  "receivables",
        message: buildEnvelopePreview(query, database, endpointUrl),
      });

      const rawRows = await consultaSagJson(this.apiConfig, query);

      sagInfo("soap:call:done", {
        orgId:   this.orgId,
        module:  "receivables",
        message: `SAG returned ${rawRows.length} raw rows — mapping + filtering AR records`,
      });

      // Map and filter: keep only AR documents (sc_cobrar_pagar = 'C').
      // Rows where mapSagReceivable returns null are non-AR (payables, orders).
      let latestDate: Date | null = null;
      const mapped: UnifiedReceivable[] = [];

      for (const row of rawRows) {
        const r = row as Record<string, unknown>;
        const rec = mapSagReceivable(r, this.orgId);
        if (!rec) continue;
        mapped.push(rec);
        if (rec.issueDate.getTime() > 0 && (!latestDate || rec.issueDate > latestDate)) {
          latestDate = rec.issueDate;
        }
      }

      this._rxCache           = mapped;
      this._rxCacheLatestDate = latestDate;

      sagInfo("soap:cache:ready", {
        orgId:   this.orgId,
        module:  "receivables",
        message: `Cache filled: ${mapped.length} AR records (${rawRows.length - mapped.length} non-AR skipped)`,
      });
    }

    const cached    = this._rxCache;
    const totalAR   = cached.length;
    const latestISO = this._rxCacheLatestDate?.toISOString() ?? null;

    // ── Incremental (date-filter) branch ──────────────────────────────────────
    // Incremental syncs are expected to be small (days/weeks of new records).
    // Return all matching rows in one shot — no pagination needed.
    if (dateFilter) {
      const filtered = cached.filter(r => r.issueDate > dateFilter!);
      return {
        records:    filtered,
        nextCursor: latestISO ? `${DATE_PFX}${latestISO}` : cursor ?? null,
        hasMore:    false,
        totalCount: totalAR,
      };
    }

    // ── Page-based (full-sync) branch ─────────────────────────────────────────
    const slice     = cached.slice(pageOffset, pageOffset + RX_PAGE_SIZE);
    const nextOffset = pageOffset + slice.length;
    const isLast     = nextOffset >= totalAR;

    const nextCursor = isLast
      ? (latestISO ? `${DATE_PFX}${latestISO}` : null)
      : `${PAGE_PFX}${nextOffset}`;

    sagInfo("soap:page", {
      orgId:   this.orgId,
      module:  "receivables",
      message: `Page offset=${pageOffset} slice=${slice.length} total=${totalAR} hasMore=${!isLast} nextCursor=${nextCursor ?? "null"}`,
    });

    return {
      records:    slice,
      nextCursor,
      hasMore:    !isLast,
      totalCount: totalAR,
    };
  }

  // ── pullMovements ───────────────────────────────────────────────────────────

  async pullMovements(cursor?: string): Promise<PullResult<UnifiedMovement>> {
    // ── Decode cursor (same strategy as pullReceivables) ──────────────────────
    let pageOffset  = 0;
    let dateFilter: Date | null = null;

    if (!cursor) {
      pageOffset = 0;
    } else if (cursor.startsWith(PAGE_PFX)) {
      pageOffset = parseInt(cursor.slice(PAGE_PFX.length), 10);
      if (isNaN(pageOffset) || pageOffset < 0) pageOffset = 0;
    } else {
      const iso = cursor.startsWith(DATE_PFX) ? cursor.slice(DATE_PFX.length) : cursor;
      dateFilter = new Date(iso);
      if (isNaN(dateFilter.getTime())) dateFilter = null;
    }

    // ── Populate cache ────────────────────────────────────────────────────────
    if (!this._movCache) {
      await this.rateLimiter.consume();

      const query = DEFAULT_MOVEMENTS_QUERY;
      const { endpointUrl, database } = this.apiConfig;

      sagInfo("soap:call:start", {
        orgId:   this.orgId,
        module:  "movements",
        message: `token=${this.apiConfig.token ? "[SET]" : "MISSING"} a_s_bd=${database ?? "(omitted)"} endpoint=${endpointUrl} query=${query.slice(0, 80)}`,
      });

      const rawRows = await consultaSagJson(this.apiConfig, query);

      sagInfo("soap:call:done", {
        orgId:   this.orgId,
        module:  "movements",
        message: `SAG returned ${rawRows.length} raw rows — mapping to SaleRecord`,
      });

      let latestDate: Date | null = null;
      const mapped: UnifiedMovement[] = [];
      const orders: UnifiedSagOrder[] = [];

      for (const row of rawRows) {
        const r = row as Record<string, unknown>;
        // Capture PD orders BEFORE mapSagMovement filters them out (clase === 4 → null)
        const ord = mapSagOrder(r, this.orgId, this.fuenteToCode);
        if (ord) { orders.push(ord); continue; }
        const rec = mapSagMovement(r, this.orgId, this.fuenteToCode);
        if (!rec) continue;
        mapped.push(rec);
        if (rec.saleDate.getTime() > 0 && (!latestDate || rec.saleDate > latestDate)) {
          latestDate = rec.saleDate;
        }
      }

      this._movCache           = mapped;
      this._movCacheLatestDate = latestDate;
      this._orderCache         = orders;

      sagInfo("soap:cache:ready", {
        orgId:   this.orgId,
        module:  "movements",
        message: `Cache filled: ${mapped.length} movements (${rawRows.length - mapped.length} skipped)`,
      });
    }

    const cached    = this._movCache;
    const totalMov  = cached.length;
    const latestISO = this._movCacheLatestDate?.toISOString() ?? null;

    // ── Incremental branch ────────────────────────────────────────────────────
    if (dateFilter) {
      const filtered = cached.filter(r => r.saleDate > dateFilter!);
      return {
        records:    filtered,
        nextCursor: latestISO ? `${DATE_PFX}${latestISO}` : cursor ?? null,
        hasMore:    false,
        totalCount: totalMov,
      };
    }

    // ── Page-based branch ─────────────────────────────────────────────────────
    const slice      = cached.slice(pageOffset, pageOffset + RX_PAGE_SIZE);
    const nextOffset = pageOffset + slice.length;
    const isLast     = nextOffset >= totalMov;

    const nextCursor = isLast
      ? (latestISO ? `${DATE_PFX}${latestISO}` : null)
      : `${PAGE_PFX}${nextOffset}`;

    sagInfo("soap:page", {
      orgId:   this.orgId,
      module:  "movements",
      message: `Page offset=${pageOffset} slice=${slice.length} total=${totalMov} hasMore=${!isLast} nextCursor=${nextCursor ?? "null"}`,
    });

    return {
      records:    slice,
      nextCursor,
      hasMore:    !isLast,
      totalCount: totalMov,
    };
  }

  // ── pullOrders ───────────────────────────────────────────────────────────────

  /**
   * Returns PD (Pedidos Cliente, k_n_clase_fuente=4) rows captured during the
   * most recent movement cache fill.  If pullMovements() has not been called yet
   * this run the order cache will be empty — the sync engine must call
   * pullMovements first, or both modules must be synced in the same run.
   *
   * Returns all orders in a single page (no pagination needed — same volume
   * constraint as movements).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async pullOrders(_cursor?: string): Promise<PullResult<any>> {
    // Ensure the MOVIMIENTOS cache (and therefore _orderCache) is populated.
    // If movements were already fetched this run, this is a no-op.
    if (this._orderCache === null) {
      // Trigger the cache fill by calling pullMovements with no cursor.
      // We discard the PullResult; we only care about the side-effect on _orderCache.
      await this.pullMovements(undefined);
    }
    const cached = this._orderCache ?? [];
    return {
      records:    cached,
      nextCursor: null,
      hasMore:    false,
      totalCount: cached.length,
    };
  }

  // ── pullCollections ─────────────────────────────────────────────────────────
  //
  // Pulls real cobro amounts from SAG v_pagosnew (confirmed 2026-04-30).
  // Same page/date cursor strategy as pullMovements():
  //   Full sync:   cursor null → "page:N" → "date:ISO"
  //   Incremental: cursor "date:ISO" → filter by collectionDate > ISO
  //
  // The SOAP query is QUERY_CATALOG.collections.allCobros.query.
  // One rate-limit token consumed per adapter instance (once per Vercel call).

  async pullCollections(cursor?: string): Promise<PullResult<UnifiedCollection>> {
    // ── Decode cursor ─────────────────────────────────────────────────────────
    let pageOffset = 0;
    let dateFilter: Date | null = null;

    if (!cursor) {
      pageOffset = 0;
    } else if (cursor.startsWith(PAGE_PFX)) {
      pageOffset = parseInt(cursor.slice(PAGE_PFX.length), 10);
      if (isNaN(pageOffset) || pageOffset < 0) pageOffset = 0;
    } else {
      const iso = cursor.startsWith(DATE_PFX) ? cursor.slice(DATE_PFX.length) : cursor;
      dateFilter = new Date(iso);
      if (isNaN(dateFilter.getTime())) dateFilter = null;
    }

    // ── Populate cache (once per adapter instance) ────────────────────────────
    if (!this._colCache) {
      await this.rateLimiter.consume();

      const { endpointUrl, database } = this.apiConfig;

      // Confirmed column names from live v_pagosnew schema (2026-04-30):
      //   Fecha_Documento (not Fecha_Pago), Numero_Documento (not Nro_Comprobante)
      //   Ka_Nl_Movimiento does NOT exist in this view — natural key = code+docNum+date
      //
      // TERCEROS LEFT JOIN added 2026-05-02:
      //   Joins on n_nit = Nit_Tercero to retrieve Ka_Nl_Tercero (sagTerceroId).
      //   No GROUP BY needed — each v_pagosnew row maps to at most one TERCEROS row.
      //   CAST to BIGINT handles any numeric/varchar mismatch between the two tables.
      //   Ka_Nl_Tercero will be NULL when Nit_Tercero is absent or has no TERCEROS match.
      const COLLECTIONS_QUERY = [
        "SELECT",
        "  p.Codigo_Fuente_Comprobante,",
        "  p.Valor_Pagado,",
        "  p.Fecha_Documento,",
        "  p.Numero_Documento,",
        "  p.Documento_pagado,",
        "  p.Nit_Tercero,",
        "  p.Nombre_Tercero,",
        "  t.Ka_Nl_Tercero",
        "FROM v_pagosnew p",
        "LEFT JOIN TERCEROS t ON CAST(t.n_nit AS BIGINT) = CAST(p.Nit_Tercero AS BIGINT)",
        "WHERE p.Codigo_Fuente_Comprobante IN ('R1','R2','RS','RC','RG','RA','SI','AN')",
        "  AND p.Valor_Pagado > 0",
        "ORDER BY p.Fecha_Documento DESC",
      ].join(" ");

      sagInfo("soap:call:start", {
        orgId:   this.orgId,
        module:  "collections",
        message: `token=${this.apiConfig.token ? "[SET]" : "MISSING"} a_s_bd=${database ?? "(omitted)"} endpoint=${endpointUrl} query=v_pagosnew cobros`,
      });

      const rawRows = await consultaSagJson(this.apiConfig, COLLECTIONS_QUERY);

      sagInfo("soap:call:done", {
        orgId:   this.orgId,
        module:  "collections",
        message: `SAG v_pagosnew returned ${rawRows.length} raw rows — mapping to CollectionRecord`,
      });

      let latestDate: Date | null = null;
      const mapped: UnifiedCollection[] = [];

      for (const row of rawRows) {
        const r = row as Record<string, unknown>;
        const rec = mapSagCollection(r, this.orgId);
        if (!rec) continue; // filtered out: zero amount or unknown code
        mapped.push(rec);
        if (
          rec.collectionDate.getTime() > 0 &&
          (!latestDate || rec.collectionDate > latestDate)
        ) {
          latestDate = rec.collectionDate;
        }
      }

      this._colCache           = mapped;
      this._colCacheLatestDate = latestDate;

      sagInfo("soap:cache:ready", {
        orgId:   this.orgId,
        module:  "collections",
        message: `Cache filled: ${mapped.length} collection records (${rawRows.length - mapped.length} skipped)`,
      });
    }

    const cached    = this._colCache;
    const total     = cached.length;
    const latestISO = this._colCacheLatestDate?.toISOString() ?? null;

    // ── Incremental branch ────────────────────────────────────────────────────
    if (dateFilter) {
      const filtered = cached.filter(r => r.collectionDate > dateFilter!);
      return {
        records:    filtered,
        nextCursor: latestISO ? `${DATE_PFX}${latestISO}` : cursor ?? null,
        hasMore:    false,
        totalCount: total,
      };
    }

    // ── Page-based branch ─────────────────────────────────────────────────────
    const slice      = cached.slice(pageOffset, pageOffset + RX_PAGE_SIZE);
    const nextOffset = pageOffset + slice.length;
    const isLast     = nextOffset >= total;

    const nextCursor = isLast
      ? (latestISO ? `${DATE_PFX}${latestISO}` : null)
      : `${PAGE_PFX}${nextOffset}`;

    sagInfo("soap:page", {
      orgId:   this.orgId,
      module:  "collections",
      message: `Page offset=${pageOffset} slice=${slice.length} total=${total} hasMore=${!isLast} nextCursor=${nextCursor ?? "null"}`,
    });

    return {
      records:    slice,
      nextCursor,
      hasMore:    !isLast,
      totalCount: total,
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
    if (cursor.startsWith(PAGE_PFX)) {
      const n = parseInt(cursor.slice(PAGE_PFX.length), 10);
      return `importando (${n.toLocaleString("es-CO")} registros procesados)`;
    }
    const iso = cursor.startsWith(DATE_PFX) ? cursor.slice(DATE_PFX.length) : cursor;
    try {
      return `desde ${new Date(iso).toLocaleDateString("es-CO", { dateStyle: "medium" })}`;
    } catch {
      return cursor;
    }
  }
}
