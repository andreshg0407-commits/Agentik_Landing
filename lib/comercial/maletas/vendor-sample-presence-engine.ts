/**
 * vendor-sample-presence-engine.ts
 *
 * VENDOR-SAMPLE-PRESENCE-ENGINE-02 — F34-based vendor maleta REFERENCE presence engine.
 *
 * ROOT CAUSE (ENGINE-01): F34 transfers write to `movimientos_traslados`, not MOVIMIENTOS_ITEMS.
 * ROOT CAUSE (ENGINE-02): ENGINE-01 grouped by (ref, talla, color) which inflated counts via
 * talla swaps. The business unit is REFERENCE, not variant. A ref with T:2 net=-1 and T:3 net=+1
 * has ref-level net=0 → ABSENT. ENGINE-01 saw only T:3 (HAVING > 0) → false PRESENT.
 *
 * This engine computes presence at REFERENCE level: GROUP BY ref only, net computed across
 * all talla/color variants. netBalance > 0 → present. Maletas are mostrario (max 1 per ref).
 *
 * Vendor bodega mapping (ka_nl_bodega — SAG internal PK):
 *   ORLANDO=45, CARLOS_LEON=46, LUIS=47, NESTOR=48, CARLOS_VILLA=49, FREDY=50
 */

import { consultaSagJson } from "@/lib/connectors/pya/client";
import type { PyaApiConfig } from "@/lib/connectors/pya/types";

// ── Types ────────────────────────────────────────────────────────────────────

export interface VendorPresenceItem {
  reference: string;
  description: string;
  netQty: number;
  present: boolean;         // netQty > 0
  subgrupoId: number | null; // ka_ni_subgrupo FK to SUBGRUPOS table
  lastTransferDate: string | null;
  sourceWarehouse: number | null; // ka_nl_bodega_origen of most recent inbound transfer
}

export interface VendorPresenceResult {
  vendorId: string;
  vendorName: string;
  bodegaKaNl: number;       // ka_nl_bodega (internal PK)
  items: VendorPresenceItem[];
  totalPresent: number;      // count of items where present=true
  queriedAt: string;
}

// ── Vendor config (ka_nl_bodega = SAG internal PK) ───────────────────────────

export interface VendorBodegaConfig {
  id: string;
  name: string;
  bodegaKaNl: number;
  active: boolean;
}

/**
 * Default vendor activation states for Castillitos Go Live.
 * Mutable: activation state can be overridden at runtime via setVendorActivation().
 * Persisted via VendorBagIdealRouteRule with line="__ACTIVATION__".
 */
export const VENDOR_BODEGA_CONFIGS: VendorBodegaConfig[] = [
  { id: "ORLANDO",      name: "Orlando",      bodegaKaNl: 45, active: true },
  { id: "CARLOS_LEON",  name: "Carlos Leon",  bodegaKaNl: 46, active: false },
  { id: "LUIS",          name: "Luis",         bodegaKaNl: 47, active: false },
  { id: "NESTOR",       name: "Nestor",       bodegaKaNl: 48, active: true },
  { id: "CARLOS_VILLA", name: "Carlos Villa", bodegaKaNl: 49, active: false },
  { id: "FREDY",        name: "Fredy",        bodegaKaNl: 50, active: false },
];

/**
 * Applies persisted activation overrides from Prisma.
 * Called by the loader before fetching presence data.
 */
export function applyActivationOverrides(
  overrides: Map<string, boolean>,
): void {
  for (const config of VENDOR_BODEGA_CONFIGS) {
    if (overrides.has(config.id)) {
      config.active = overrides.get(config.id)!;
    }
  }
}

// ── SAG query builders ───────────────────────────────────────────────────────

/**
 * Builds the SAG SQL query to compute net balance from movimientos_traslados
 * for a single vendor bodega. Non-anulados only.
 *
 * ENGINE-02: Groups by REFERENCE only (not ref+talla+color) to avoid talla swap inflation.
 * Uses subquery pattern so HAVING filter applies after full ref-level aggregation.
 *
 * Returns: ref, descr, net_qty, subgrupo_id (WHERE net_qty > 0)
 */
function buildVendorBalanceQuery(bodegaKaNl: number): string {
  return `
SELECT ref, descr, net_qty, subgrupo_id FROM (
  SELECT
    v.k_sc_codigo_articulo AS ref,
    MAX(v.sc_detalle_articulo) AS descr,
    MAX(v.ka_ni_subgrupo) AS subgrupo_id,
    SUM(CASE WHEN mt.ka_nl_bodega_destino = ${bodegaKaNl} THEN mt.nd_cantidad ELSE 0 END) -
    SUM(CASE WHEN mt.ka_nl_bodega_origen = ${bodegaKaNl} THEN mt.nd_cantidad ELSE 0 END) AS net_qty
  FROM movimientos_traslados mt
  INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mt.ka_nl_movimiento
  LEFT JOIN v_articulos v ON v.ka_nl_articulo = mt.ka_nl_articulo
  WHERE m.sc_anulado = 'N'
    AND (mt.ka_nl_bodega_destino = ${bodegaKaNl} OR mt.ka_nl_bodega_origen = ${bodegaKaNl})
  GROUP BY v.k_sc_codigo_articulo
) sub
WHERE net_qty > 0
  `.trim();
}

/**
 * Builds a query to find the most recent inbound transfer date and origin
 * for a vendor bodega. Returns one row per reference with the latest transfer.
 */
function buildLastTransferQuery(bodegaKaNl: number): string {
  return `
SELECT TOP 500
  v.k_sc_codigo_articulo AS ref,
  m.sd_fecha AS transfer_date,
  mt.ka_nl_bodega_origen AS origin_bodega
FROM movimientos_traslados mt
INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mt.ka_nl_movimiento
LEFT JOIN v_articulos v ON v.ka_nl_articulo = mt.ka_nl_articulo
WHERE m.sc_anulado = 'N'
  AND mt.ka_nl_bodega_destino = ${bodegaKaNl}
ORDER BY m.sd_fecha DESC
  `.trim();
}

// ── SAG row types ────────────────────────────────────────────────────────────

interface BalanceRow {
  ref: string;
  descr: string;
  net_qty: number;
  subgrupo_id: number | null;
}

interface TransferRow {
  ref: string;
  transfer_date: string;
  origin_bodega: number;
}

// ── Core engine ──────────────────────────────────────────────────────────────

/**
 * Fetches vendor maleta presence for a single vendor bodega from SAG SOAP.
 * Two queries per vendor: balance + last transfer metadata.
 */
async function fetchVendorPresence(
  config: PyaApiConfig,
  vendor: VendorBodegaConfig,
): Promise<VendorPresenceResult> {
  const queriedAt = new Date().toISOString();

  // Query 1: Net balance from movimientos_traslados
  let balanceRows: BalanceRow[] = [];
  try {
    const raw = await consultaSagJson(config, buildVendorBalanceQuery(vendor.bodegaKaNl));
    balanceRows = raw as unknown as BalanceRow[];
  } catch (err) {
    console.error(`[MALETAS] Balance query failed for ${vendor.name} (bod ${vendor.bodegaKaNl}):`, err);
  }

  // Query 2: Last transfer dates (for metadata — non-blocking)
  const transferMap = new Map<string, { date: string; origin: number }>();
  try {
    const raw = await consultaSagJson(config, buildLastTransferQuery(vendor.bodegaKaNl));
    const transferRows = raw as unknown as TransferRow[];
    // Keep only the first (most recent) per reference
    for (const tr of transferRows) {
      if (tr.ref && !transferMap.has(tr.ref)) {
        transferMap.set(tr.ref, {
          date: tr.transfer_date,
          origin: tr.origin_bodega,
        });
      }
    }
  } catch (err) {
    console.error(`[MALETAS] Transfer query failed for ${vendor.name} (bod ${vendor.bodegaKaNl}):`, err);
    // Non-fatal — we still have balance data
  }

  // ENGINE-02: SQL already returns one row per ref with net_qty > 0
  const items: VendorPresenceItem[] = [];
  for (const row of balanceRows) {
    const ref = (row.ref ?? "").trim();
    if (!ref) continue;
    const transfer = transferMap.get(ref);
    items.push({
      reference: ref,
      description: row.descr ?? "",
      netQty: Number(row.net_qty) || 0,
      present: true, // SQL WHERE net_qty > 0 guarantees this
      subgrupoId: row.subgrupo_id != null ? Number(row.subgrupo_id) : null,
      lastTransferDate: transfer?.date ?? null,
      sourceWarehouse: transfer?.origin ?? null,
    });
  }

  return {
    vendorId: vendor.id,
    vendorName: vendor.name,
    bodegaKaNl: vendor.bodegaKaNl,
    items,
    totalPresent: items.length,
    queriedAt,
  };
}

/**
 * Fetches vendor maleta presence for all active vendors.
 * Sequential to respect SAG rate limits (10/min).
 */
export async function fetchAllVendorPresence(
  config: PyaApiConfig,
): Promise<VendorPresenceResult[]> {
  const activeVendors = VENDOR_BODEGA_CONFIGS.filter((v) => v.active);
  const results: VendorPresenceResult[] = [];

  for (const vendor of activeVendors) {
    const result = await fetchVendorPresence(config, vendor);
    results.push(result);
  }

  // Include inactive vendors with empty results
  for (const vendor of VENDOR_BODEGA_CONFIGS.filter((v) => !v.active)) {
    results.push({
      vendorId: vendor.id,
      vendorName: vendor.name,
      bodegaKaNl: vendor.bodegaKaNl,
      items: [],
      totalPresent: 0,
      queriedAt: new Date().toISOString(),
    });
  }

  return results;
}

// ── SAG SUBGRUPOS lookup ─────────────────────────────────────────────────────

interface SubgrupoRow {
  ka_ni_subgrupo: number;
  sc_detalle_subgrupo: string;
  ka_ni_grupo: number;
}

interface GrupoRow {
  ka_ni_grupo: number;
  sc_detalle_grupo: string;
}

/**
 * Fetches the full SUBGRUPOS lookup table from SAG.
 * Returns a Map from ka_ni_subgrupo → sc_detalle_subgrupo (e.g. "PIJAMA CL 2-8").
 */
export async function fetchSubgruposLookup(
  config: PyaApiConfig,
): Promise<Map<number, string>> {
  const lookup = new Map<number, string>();
  try {
    const raw = await consultaSagJson(
      config,
      "SELECT ka_ni_subgrupo, sc_detalle_subgrupo FROM SUBGRUPOS",
    );
    const rows = raw as unknown as SubgrupoRow[];
    for (const row of rows) {
      if (row.ka_ni_subgrupo != null) {
        lookup.set(Number(row.ka_ni_subgrupo), (row.sc_detalle_subgrupo ?? "").trim());
      }
    }
  } catch (err) {
    console.error("[MALETAS] SUBGRUPOS lookup failed:", err);
  }
  return lookup;
}

/**
 * Fetches subgrupoId → grupoName mapping by joining SUBGRUPOS (ka_ni_grupo FK) with GRUPOS.
 * Returns Map from ka_ni_subgrupo → sc_detalle_grupo (e.g. "CS NIÑA BEBE").
 * Sprint: MALETAS-TEXTIL-DERROTERO-SAG-MATCH-01
 */
export async function fetchSubgrupoToGrupoLookup(
  config: PyaApiConfig,
): Promise<Map<number, string>> {
  const lookup = new Map<number, string>();
  try {
    // Step 1: fetch subgrupo → grupo FK
    const subRaw = await consultaSagJson(
      config,
      "SELECT ka_ni_subgrupo, ka_ni_grupo FROM SUBGRUPOS",
    );
    const subRows = subRaw as unknown as SubgrupoRow[];
    const subToGrupoId = new Map<number, number>();
    for (const row of subRows) {
      if (row.ka_ni_subgrupo != null && row.ka_ni_grupo != null) {
        subToGrupoId.set(Number(row.ka_ni_subgrupo), Number(row.ka_ni_grupo));
      }
    }

    // Step 2: fetch grupo names
    const grupoRaw = await consultaSagJson(
      config,
      "SELECT ka_ni_grupo, sc_detalle_grupo FROM GRUPOS",
    );
    const grupoRows = grupoRaw as unknown as GrupoRow[];
    const grupoNames = new Map<number, string>();
    for (const row of grupoRows) {
      if (row.ka_ni_grupo != null) {
        grupoNames.set(Number(row.ka_ni_grupo), (row.sc_detalle_grupo ?? "").trim());
      }
    }

    // Step 3: compose subgrupoId → grupoName
    for (const [subId, grupoId] of subToGrupoId) {
      const grupoName = grupoNames.get(grupoId);
      if (grupoName) {
        lookup.set(subId, grupoName);
      }
    }
  } catch (err) {
    console.error("[MALETAS] Subgrupo→Grupo lookup failed:", err);
  }
  return lookup;
}
