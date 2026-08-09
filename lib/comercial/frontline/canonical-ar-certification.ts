/**
 * lib/comercial/frontline/canonical-ar-certification.ts
 *
 * AGENTIK-RECEIVABLES-AR-TRUTH-01 — Certification Evidence
 *
 * This file documents the certified semantics of canonical AR sources
 * and provides deterministic freshness policy.
 *
 * NO RUNTIME LOGIC depends on comments here.
 * The functions ARE runtime — they enforce freshness thresholds.
 */

// ── VW_AGENTIK_CARTERA AUTHORITY ────────────────────────────────────────────
//
// View definition retrieved 2026-08-09 via OBJECT_DEFINITION():
//
// SOURCE TABLES:
//   saldos_facturas    — period-based invoice balance (n_saldo_actual)
//   movimientos        — accounting transactions
//   fuentes            — source document types
//   movimientos_facturas — invoice-specific fields (d_vencimiento, n_valor_inicial)
//   movimientos_valores — invoice total computation (n_tipo_valor = 99)
//   terceros           — customer master
//   ciudades           — city reference
//   clientes_sucursales — branch addresses
//   vendedores         — seller reference
//   canales            — sales channel reference
//   valores_posibles   — value type reference
//
// KEY SEMANTICS:
//
// SALDO_PENDIENTE = saldos_facturas.n_saldo_actual
//   ✓ Pre-computed by SAG accounting engine
//   ✓ Includes ALL applied collections (recaudos)
//   ✓ Includes ALL credit note applications
//   ✓ Includes ALL debit adjustments
//   ✓ Includes ALL other AR adjustments
//   ✓ Period: MAX(k_sc_periodo) <= current YYYYMM
//   ✓ Filter: n_saldo_actual <> 0.00 (zero-balance rows excluded)
//
// EVIDENCE (probe 2026-08-09):
//   FE-10380: VALOR=21,911,979, recaudos=17,527,713, SALDO=3,923,930
//   Delta = 460,336 (additional adjustments beyond visible recaudos)
//   → SALDO_PENDIENTE includes MORE than just recaudos
//   → It is the authoritative remaining balance from SAG's ledger
//
// SALDO_PENDIENTE_INCLUDES_COLLECTIONS = YES
// SALDO_PENDIENTE_INCLUDES_CREDIT_NOTES = YES
// SALDO_PENDIENTE_INCLUDES_DEBIT_ADJUSTMENTS = YES
// SALDO_PENDIENTE_OTHER_ADJUSTMENTS = rounding, withholding, misc ledger entries
//
// DIAS_MORA = DATEDIFF(DAY, d_vencimiento, GETDATE())
//   ✓ Live-computed at query time (not frozen)
//   ✓ Verified: computed_dpd - DIAS_MORA = 0 for all tested documents
//   ✓ Future due dates produce negative values
//   ✓ NULL when d_vencimiento is NULL
//
// FILTERS:
//   sc_cobrar_pagar = 'C'     → receivables only
//   sc_tipo_dcto <> 'A'       → excludes advance payments
//   sc_anulado = 'N'          → excludes voided documents
//   n_saldo_actual <> 0.00    → only non-zero balances
//
// DOCUMENT_ID = fuente_codigo + '-' + numero_documento (e.g. "FE-10380")
//
// ── VW_AGENTIK_RECAUDOS AUTHORITY ───────────────────────────────────────────
//
// SOURCE TABLES:
//   movimientos              — collection transactions
//   movimientos_referencias  — document-level application detail
//   terceros                 — customer master
//   fuentes                  — source types
//   cuentas_auxiliares        — bank account references
//   cuentas_contables         — chart of accounts
//   bancos                   — bank master
//
// KEY SEMANTICS:
//   VALOR_RECAUDADO: positive=payment, negative=credit/reversal
//   ID_RECAUDO: NOT unique per row (same for multi-doc applications)
//   DOCUMENTO_RELACIONADO: links to cartera.DOCUMENTO for doc-level join
//   MONTO_NO_APLICADO: unapplied remainder
//
// ── FRESHNESS POLICY ────────────────────────────────────────────────────────
//
// FRESHNESS AUTHORITY: SAG read-success timestamp (query execution time).
//
// A business document date (FECHA_DOCUMENTO, FECHA_VENCIMIENTO, FECHA_RECAUDO)
// is NOT evidence of source freshness. Those are event dates, not refresh dates.
//
// vw_agentik_cartera does NOT expose a refresh/sync timestamp.
// The only authoritative freshness signal is: "we successfully queried SAG
// at time T, and the query returned data." That T is the `asOf` timestamp
// set to `new Date()` in fetchCustomerArWithStatus() and fetchCertifiedArSnapshot().
//
// Therefore: data is FRESH if the SAG read succeeded within the threshold.
// Data is STALE if the `asOf` is older than the threshold (meaning we are
// relying on a cached/previous read).
//
// PROHIBITED freshness evidence:
//   - MAX(FECHA_DOCUMENTO) — business event date, not source refresh
//   - MAX(FECHA_RECAUDO) — payment event date, not source refresh
//   - Any derived document date
//

/**
 * Maximum acceptable age (in hours) for canonical AR data.
 *
 * SAG views are live-computed (DIAS_MORA uses GETDATE()).
 *
 * Freshness is measured from the SAG read-success timestamp (`asOf`),
 * which is `new Date()` at the moment of a successful SAG SOAP query.
 *
 * A business document date (FECHA_DOCUMENTO) is NOT freshness evidence.
 */
export const CANONICAL_AR_FRESHNESS_THRESHOLD_HOURS = 24;

/**
 * Check if an asOf timestamp is within the freshness threshold.
 *
 * `asOf` MUST be the SAG query execution time (read-success timestamp),
 * NOT a business document date.
 */
export function isCanonicalArFresh(asOf: Date): boolean {
  const ageMs = Date.now() - asOf.getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  return ageHours <= CANONICAL_AR_FRESHNESS_THRESHOLD_HOURS;
}

// ── DPD AUTHORITY ───────────────────────────────────────────────────────────
//
// DUE_DATE_AUTHORITY: vw_agentik_cartera.FECHA_VENCIMIENTO
//   Source: movimientos_facturas.d_vencimiento
//
// DPD_FORMULA: DATEDIFF(DAY, FECHA_VENCIMIENTO, GETDATE())
//   Computed live by SAG view — NOT frozen/stored
//
// AS_OF_AUTHORITY: query execution time (GETDATE() in the view)
//
// VERIFIED (probe 2026-08-09):
//   5 overdue docs: dpd_delta = 0 for all
//   5 future-due docs: negative DIAS_MORA matches computed DPD
//
// ── CUSTOMER AGGREGATION FORMULAS ───────────────────────────────────────────
//
// totalReceivable = SUM(SALDO_PENDIENTE) WHERE SALDO_PENDIENTE > 0
// overdueAmount   = SUM(SALDO_PENDIENTE) WHERE SALDO_PENDIENTE > 0 AND DIAS_MORA > 0
// maxDaysOverdue  = MAX(DIAS_MORA) WHERE SALDO_PENDIENTE > 0 AND DIAS_MORA > 0
//
// Computed in canonical-ar-service.ts groupByCustomer() — NOT in React
//
// ── TRUTH STATUS POLICY ─────────────────────────────────────────────────────
//
// CustomerArResult status semantics (exact certification policy):
//
//   CERTIFIED (via HAS_OPEN_AR):
//     ALL of the following are true:
//       1. SAG SOAP query succeeded (read-success)
//       2. clienteId > 0 (valid SAG PK)
//       3. vw_agentik_cartera returned >= 1 row for this CLIENTE_ID
//       4. SALDO_PENDIENTE is pre-computed by SAG (semantics certified in this file)
//       5. DIAS_MORA is live-computed by SAG at query time (dpd_delta=0 verified)
//       6. asOf = query execution time (read-success freshness)
//
//   CERTIFIED_ZERO:
//     ALL of the following are true:
//       1. SAG SOAP query succeeded (read-success)
//       2. clienteId > 0 (valid SAG PK)
//       3. vw_agentik_cartera returned 0 rows for this CLIENTE_ID
//       4. Customer existence confirmed in TERCEROS (ka_nl_tercero lookup)
//       5. 0 rows = all invoices fully paid (view filters n_saldo_actual <> 0.00)
//       6. This is a genuine financial zero, not a data gap
//
//   IDENTITY_UNKNOWN:
//     ANY of the following is true:
//       a. clienteId <= 0 or falsy (invalid SAG PK — checked before query)
//       b. clienteId > 0 but customer does NOT exist in TERCEROS
//          (0 cartera rows + 0 TERCEROS rows = unknown identity, not certified zero)
//
//   SAG_UNAVAILABLE:
//     SAG SOAP connection or query failed (network, auth, view not found).
//     No certification possible — fall through to legacy if available.
//
// If ANY fail: truthStatus != "CERTIFIED"
//   - SAG unavailable → SAG_UNAVAILABLE (non-certified)
//   - clienteId invalid → IDENTITY_UNKNOWN (non-certified)
//   - clienteId valid but not in TERCEROS → IDENTITY_UNKNOWN (non-certified)
//   - Data stale → "STALE" (non-certified)
//
// PROHIBITED fallbacks:
//   - v_pagosnew (SAG_V_PAGOSNEW) — NOT canonical AR authority
//   - CollectionRecord[SAG_V_PAGOSNEW] — legacy source
//   - CustomerReceivable.balanceDue — paidAmount always 0
//
// ── AMV LLANO GATE ──────────────────────────────────────────────────────────
//
// AMV_CLIENTE_ID: 856
// AMV_NIT: 900469068
// AMV_NAME: "AMV LLANO SAS"
// AMV_IDENTITY_JOIN_STATUS: CONFIRMED (TERCEROS lookup by NIT and name match)
//
// VW_AGENTIK_CARTERA_ROWS: 0
// VW_AGENTIK_RECAUDOS_ROWS: 330
// TOTAL_RECAUDADO: 506,522,345
//
// RESULT: CERTIFIED_ZERO — fully paid, genuine zero
// LEGACY_VALUE: ~542M overdue (from CustomerReceivable where paidAmount=0)
// EXPLANATION: Legacy pipeline never applied any collections. SAG shows all paid.
