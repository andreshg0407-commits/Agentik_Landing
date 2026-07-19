/**
 * lib/comercial/pedidos/seller-resolution-service.ts
 *
 * Seller resolution for SAG orders.
 *
 * Resolution priority:
 *   1. SAG MOVIMIENTOS.ka_nl_tercero_vend → TERCEROS.sc_nombre (HIGH confidence)
 *   2. CRM quote history: customer → most frequent seller (MEDIUM confidence)
 *   3. null (UNKNOWN — no guessing)
 *
 * Coverage evidence (from audit):
 *   - 2026: 92% of PD orders have ka_nl_tercero_vend
 *   - 2023-2025: ~0% (SAG stopped populating, then resumed)
 *   - 2020-2021: ~99%
 *   - CRM: 8/9 sellers match SAG vendor names
 *   - CustomerProfile.sellerName: 46/33k profiles — not useful
 *
 * Sprint: PEDIDOS-VENDEDOR-RESOLUTION-01
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import { consultaSagJson } from "@/lib/connectors/pya/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SellerConfidence = "high" | "medium" | "low" | "unknown";

export type SellerSource =
  | "sag_movimientos"       // ka_nl_tercero_vend from SAG
  | "crm_quote_history"     // Most frequent seller for this customer in CRM
  | "none";

export interface ResolvedSeller {
  sellerName:   string | null;
  sellerCode:   string | null;  // SAG ka_nl_tercero_vend as string
  source:       SellerSource;
  confidence:   SellerConfidence;
}

export interface SellerResolutionReport {
  totalOrders:       number;
  resolvedHigh:      number;
  resolvedMedium:    number;
  resolvedLow:       number;
  unresolved:        number;
  resolutionPct:     number;
  bySource:          Record<SellerSource, number>;
  sellers:           Array<{ name: string; orderCount: number; source: SellerSource }>;
  computedAt:        string;
}

// ─── SAG config helper ────────────────────────────────────────────────────────

function getSagConfig() {
  return {
    token: process.env.PYA_SOAP_TOKEN ?? "",
    endpointUrl: process.env.PYA_SOAP_ENDPOINT ?? "https://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap",
    database: process.env.PYA_SAG_BD ?? "",
  };
}

// ─── SAG vendor map (cached) ──────────────────────────────────────────────────

let sagVendorCache: Map<number, string> | null = null;
let sagVendorCacheAt = 0;
const SAG_CACHE_TTL = 10 * 60 * 1000; // 10 min

/**
 * Build a map of ka_nl_tercero_vend → vendor name from SAG TERCEROS.
 * Queries all vendor tercero IDs used in PD MOVIMIENTOS.
 */
async function buildSagVendorMap(): Promise<Map<number, string>> {
  if (sagVendorCache && Date.now() - sagVendorCacheAt < SAG_CACHE_TTL) return sagVendorCache;

  const config = getSagConfig();
  if (!config.token || !config.database) return new Map();

  try {
    // Get distinct vendor IDs from PD orders
    const vendorIds = await consultaSagJson(config, `
      SELECT DISTINCT ka_nl_tercero_vend
      FROM MOVIMIENTOS
      WHERE ka_ni_fuente = 40
      AND sc_anulado = 'N'
      AND ka_nl_tercero_vend IS NOT NULL
      AND ka_nl_tercero_vend > 0
    `);

    if (vendorIds.length === 0) return new Map();

    const idList = vendorIds.map((r: any) => r.ka_nl_tercero_vend).join(",");

    // Resolve names from TERCEROS
    const names = await consultaSagJson(config, `
      SELECT ka_nl_tercero, sc_nombre, n_nit
      FROM TERCEROS
      WHERE ka_nl_tercero IN (${idList})
    `);

    const map = new Map<number, string>();
    for (const n of names) {
      if (n.ka_nl_tercero && n.sc_nombre) {
        map.set(Number(n.ka_nl_tercero), String(n.sc_nombre).trim());
      }
    }

    sagVendorCache = map;
    sagVendorCacheAt = Date.now();
    return map;
  } catch {
    return sagVendorCache ?? new Map();
  }
}

// ─── CRM seller map (cached) ─────────────────────────────────────────────────

let crmSellerCache: Map<string, { name: string; confidence: number }> | null = null;
let crmSellerCacheAt = 0;
const CRM_CACHE_TTL = 10 * 60 * 1000;
const CRM_CONFIDENCE_THRESHOLD = 60;

/**
 * Build a map of customerNit → primary CRM seller.
 * Uses CRM quote history: for each customer, the seller with most quotes wins.
 */
async function buildCrmSellerMap(orgId: string): Promise<Map<string, { name: string; confidence: number }>> {
  if (crmSellerCache && Date.now() - crmSellerCacheAt < CRM_CACHE_TTL) return crmSellerCache;

  const db = prisma as any;

  // Get all CRM quotes with customer and seller
  const quotes = await db.cRMQuote.findMany({
    where: { organizationId: orgId },
    select: { sellerName: true, rawCrmJson: true },
  });

  // Get customer profiles with crmId and sagTerceroId
  const profiles = await db.customerProfile.findMany({
    where: { organizationId: orgId },
    select: { id: true, crmId: true, sagTerceroId: true, nit: true },
  });

  // Map crmId → sagTerceroId
  const crmToTercero = new Map<string, number>();
  for (const p of profiles) {
    if (p.crmId && p.sagTerceroId) {
      crmToTercero.set(p.crmId, p.sagTerceroId);
    }
  }

  // Aggregate quotes per customer per seller
  const customerSellers = new Map<number, Map<string, number>>();

  for (const q of quotes) {
    const raw = (q.rawCrmJson as any)?.raw ?? {};
    const billingId = raw.billing_account_id as string | undefined;
    const sellerName = q.sellerName as string;
    if (!billingId || !sellerName || sellerName === "Administrator") continue;

    const terceroId = crmToTercero.get(billingId);
    if (!terceroId) continue;

    const sellers = customerSellers.get(terceroId) ?? new Map<string, number>();
    sellers.set(sellerName, (sellers.get(sellerName) ?? 0) + 1);
    customerSellers.set(terceroId, sellers);
  }

  // Compute primary seller per customer
  const map = new Map<string, { name: string; confidence: number }>();

  for (const [terceroId, sellers] of customerSellers) {
    const total = [...sellers.values()].reduce((a, b) => a + b, 0);
    const sorted = [...sellers.entries()].sort((a, b) => b[1] - a[1]);
    const [primaryName, primaryCount] = sorted[0];
    const confidence = Math.round((primaryCount / total) * 100);

    if (confidence >= CRM_CONFIDENCE_THRESHOLD) {
      map.set(String(terceroId), { name: primaryName, confidence });
    }
  }

  crmSellerCache = map;
  crmSellerCacheAt = Date.now();
  return map;
}

// ─── Single order resolution ──────────────────────────────────────────────────

/**
 * Resolve seller for a single SAG order.
 *
 * @param orgId        — organization ID
 * @param erpMovId     — SAG ka_nl_movimiento
 * @param customerNit  — SAG ka_nl_tercero (customer FK, stored in CustomerOrderRecord.customerNit)
 */
export async function resolveSellerForSagOrder(
  orgId: string,
  erpMovId: number | string | null,
  customerNit: string | null,
): Promise<ResolvedSeller> {
  // Strategy 1: Query SAG MOVIMIENTOS.ka_nl_tercero_vend for this specific order
  if (erpMovId) {
    const config = getSagConfig();
    if (config.token && config.database) {
      try {
        const rows = await consultaSagJson(config, `
          SELECT ka_nl_tercero_vend
          FROM MOVIMIENTOS
          WHERE ka_nl_movimiento = ${Number(erpMovId)}
        `);

        if (rows.length > 0 && rows[0].ka_nl_tercero_vend && Number(rows[0].ka_nl_tercero_vend) > 0) {
          const vendorId = Number(rows[0].ka_nl_tercero_vend);
          const vendorMap = await buildSagVendorMap();
          const vendorName = vendorMap.get(vendorId);

          if (vendorName) {
            return {
              sellerName:  vendorName,
              sellerCode:  String(vendorId),
              source:      "sag_movimientos",
              confidence:  "high",
            };
          }
        }
      } catch {
        // SAG unavailable — fall through to CRM
      }
    }
  }

  // Strategy 2: CRM quote history (customer → most frequent seller)
  if (customerNit) {
    const crmMap = await buildCrmSellerMap(orgId);
    const crmSeller = crmMap.get(customerNit);

    if (crmSeller) {
      return {
        sellerName:  crmSeller.name,
        sellerCode:  null,
        source:      "crm_quote_history",
        confidence:  crmSeller.confidence >= 80 ? "medium" : "low",
      };
    }
  }

  // No resolution available
  return {
    sellerName: null,
    sellerCode: null,
    source:     "none",
    confidence: "unknown",
  };
}

// ─── Batch resolution ─────────────────────────────────────────────────────────

/**
 * Resolve sellers for multiple orders in batch.
 * More efficient than calling resolveSellerForSagOrder per order.
 *
 * @param orgId  — organization ID
 * @param orders — array of { erpMovId, customerNit }
 */
export async function resolveSellersBatch(
  orgId: string,
  orders: Array<{ erpMovId: number | string | null; customerNit: string | null }>,
): Promise<Map<string, ResolvedSeller>> {
  const config = getSagConfig();
  const results = new Map<string, ResolvedSeller>();

  // Step 1: Batch query SAG for all erpMovIds
  const erpIds = orders.filter(o => o.erpMovId).map(o => Number(o.erpMovId));

  let sagVendorByOrder = new Map<number, number>();
  if (erpIds.length > 0 && config.token && config.database) {
    try {
      // Query in batches of 100
      for (let i = 0; i < erpIds.length; i += 100) {
        const batch = erpIds.slice(i, i + 100);
        const idList = batch.join(",");
        const rows = await consultaSagJson(config, `
          SELECT ka_nl_movimiento, ka_nl_tercero_vend
          FROM MOVIMIENTOS
          WHERE ka_nl_movimiento IN (${idList})
          AND ka_nl_tercero_vend IS NOT NULL
          AND ka_nl_tercero_vend > 0
        `);
        for (const r of rows) {
          sagVendorByOrder.set(Number(r.ka_nl_movimiento), Number(r.ka_nl_tercero_vend));
        }
      }
    } catch {
      // SAG unavailable
    }
  }

  // Step 2: Build vendor name map
  const vendorMap = await buildSagVendorMap();

  // Step 3: Build CRM seller map
  const crmMap = await buildCrmSellerMap(orgId);

  // Step 4: Resolve each order
  for (const order of orders) {
    const key = String(order.erpMovId ?? order.customerNit ?? "unknown");

    // Priority 1: SAG vendor
    if (order.erpMovId) {
      const vendorId = sagVendorByOrder.get(Number(order.erpMovId));
      if (vendorId) {
        const vendorName = vendorMap.get(vendorId);
        if (vendorName) {
          results.set(key, {
            sellerName: vendorName,
            sellerCode: String(vendorId),
            source: "sag_movimientos",
            confidence: "high",
          });
          continue;
        }
      }
    }

    // Priority 2: CRM seller
    if (order.customerNit) {
      const crmSeller = crmMap.get(order.customerNit);
      if (crmSeller) {
        results.set(key, {
          sellerName: crmSeller.name,
          sellerCode: null,
          source: "crm_quote_history",
          confidence: crmSeller.confidence >= 80 ? "medium" : "low",
        });
        continue;
      }
    }

    // No resolution
    results.set(key, {
      sellerName: null,
      sellerCode: null,
      source: "none",
      confidence: "unknown",
    });
  }

  return results;
}

// ─── Resolution report ────────────────────────────────────────────────────────

/**
 * Generate a full resolution report for all PD orders.
 */
export async function generateSellerResolutionReport(orgId: string): Promise<SellerResolutionReport> {
  const db = prisma as any;

  // Get all SAG orders
  const orders = await db.$queryRaw`
    SELECT "erpMovId", "customerNit"
    FROM "CustomerOrderRecord"
    WHERE "organizationId" = ${orgId}
    AND "erpMovId" IS NOT NULL
  ` as any[];

  const resolved = await resolveSellersBatch(
    orgId,
    orders.map((o: any) => ({
      erpMovId: o.erpMovId,
      customerNit: o.customerNit,
    })),
  );

  let high = 0, medium = 0, low = 0, unknown = 0;
  const bySource: Record<SellerSource, number> = { sag_movimientos: 0, crm_quote_history: 0, none: 0 };
  const sellerCounts = new Map<string, { count: number; source: SellerSource }>();

  for (const r of resolved.values()) {
    bySource[r.source]++;
    if (r.confidence === "high") high++;
    else if (r.confidence === "medium") medium++;
    else if (r.confidence === "low") low++;
    else unknown++;

    if (r.sellerName) {
      const existing = sellerCounts.get(r.sellerName) ?? { count: 0, source: r.source };
      existing.count++;
      sellerCounts.set(r.sellerName, existing);
    }
  }

  const total = orders.length;
  const resolvedCount = high + medium;

  return {
    totalOrders:   total,
    resolvedHigh:  high,
    resolvedMedium: medium,
    resolvedLow:   low,
    unresolved:    unknown,
    resolutionPct: total > 0 ? Math.round((resolvedCount / total) * 1000) / 10 : 0,
    bySource,
    sellers: [...sellerCounts.entries()]
      .map(([name, { count, source }]) => ({ name, orderCount: count, source }))
      .sort((a, b) => b.orderCount - a.orderCount),
    computedAt: new Date().toISOString(),
  };
}
