/**
 * lib/comercial/tiendas/sag-warehouse-lookup.ts
 *
 * SAG BODEGAS lookup cache — persists warehouse names so the tiendas
 * adapter can resolve human-readable names at read time without
 * calling SAG SOAP on every page load.
 *
 * Storage: AgentExecution with operation SAG_WAREHOUSE_LOOKUP_CACHE.
 * One record per org — metadataJson holds the full lookup map.
 *
 * SERVER ONLY — never import from client components.
 *
 * Sprint: TIENDAS-INVENTORY-01
 */

import "server-only";

import { prisma } from "@/lib/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SagWarehouseEntry {
  /** SAG ka_nl_bodega (numeric PK as string) — matches PIL warehouseId */
  warehouseId: string;
  /** SAG ss_codigo (short code) — matches PIL externalRef */
  code:        string;
  /** SAG ss_nombre (human-readable name) */
  name:        string;
  /** Whether the warehouse is active in SAG (sc_activo = 'S') */
  active:      boolean;
}

export type SagWarehouseMap = Map<string, SagWarehouseEntry>;

// ── Constants ─────────────────────────────────────────────────────────────────

const MODULE    = "comercial";
const OPERATION = "SAG_WAREHOUSE_LOOKUP_CACHE";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const execDb = () => (prisma as any).agentExecution;

// ── Load cached BODEGAS lookup ───────────────────────────────────────────────

/**
 * Load the cached SAG BODEGAS lookup for an organization.
 * Returns an empty map if no cache exists.
 */
export async function loadWarehouseLookup(orgId: string): Promise<SagWarehouseMap> {
  try {
    const row = await execDb().findFirst({
      where: { tenantId: orgId, module: MODULE, operation: OPERATION },
      orderBy: { createdAt: "desc" },
    });
    if (!row) return new Map();

    const meta = (row.metadataJson ?? {}) as Record<string, unknown>;
    const entries = meta.warehouses as SagWarehouseEntry[] | undefined;
    if (!Array.isArray(entries)) return new Map();

    const map: SagWarehouseMap = new Map();
    for (const e of entries) {
      map.set(e.warehouseId, e);
    }
    return map;
  } catch {
    return new Map();
  }
}

// ── Save BODEGAS lookup ──────────────────────────────────────────────────────

/**
 * Persist the SAG BODEGAS lookup for an organization.
 * Upserts — replaces existing cache if present.
 *
 * Called from:
 *   - scripts/_populate-sag-warehouse-cache.ts (one-time)
 *   - sag-inventory-sync.ts (during inventory sync)
 */
export async function saveWarehouseLookup(
  orgId: string,
  entries: SagWarehouseEntry[],
): Promise<void> {
  const now = new Date().toISOString();
  const metadataJson = {
    warehouses: entries,
    cachedAt:   now,
    count:      entries.length,
  };

  // Find existing cache record
  const existing = await execDb().findFirst({
    where: { tenantId: orgId, module: MODULE, operation: OPERATION },
    select: { id: true },
  });

  if (existing) {
    await execDb().update({
      where: { id: existing.id },
      data:  { metadataJson },
    });
  } else {
    await execDb().create({
      data: {
        tenantId:     orgId,
        module:       MODULE,
        operation:    OPERATION,
        status:       "completed",
        createdBy:    "system",
        intent:       "SAG BODEGAS lookup cache",
        metadataJson,
      },
    });
  }
}

// ── Resolve helpers ──────────────────────────────────────────────────────────

/** Resolve a PIL warehouseId to a human-readable name */
export function resolveWarehouseName(
  lookup: SagWarehouseMap,
  warehouseId: string,
): string {
  return lookup.get(warehouseId)?.name ?? `Bodega ${warehouseId}`;
}

/** Check if a warehouse looks like a retail store (franchise F-stores) */
export function isRetailWarehouse(entry: SagWarehouseEntry): boolean {
  const n = entry.name.toUpperCase().trim();
  // Franchise stores: "F1 - ...", "F3 - ...", "F6 - ..."
  if (/^F\d+\s*-/.test(n)) return true;
  // Named retail locations
  if (n.includes("BODEGA SANDIEGO")) return true;
  if (n.includes("BODEGA MAYORCA") || n.includes("BODEGA  MAYORCA")) return true;
  if (n.includes("GRAN PLAZA")) return true;
  if (n.includes("BODEGA CENTRO")) return true;
  if (n.includes("BODEGA CALDAS")) return true;
  if (n.includes("PAGINA WEB")) return true;
  if (n.includes("PLAN SEPARE")) return true;
  if (n.includes("DEXCATO")) return true;
  return false;
}

/** Check if a warehouse is the main distribution warehouse */
export function isMainWarehouse(entry: SagWarehouseEntry): boolean {
  const n = entry.name.toUpperCase().trim();
  return n.includes("BODEGA PRINCIPAL");
}

/** Check if a warehouse is non-retail (production, imports, raw materials, etc.) */
export function isNonRetailWarehouse(entry: SagWarehouseEntry): boolean {
  const n = entry.name.toUpperCase().trim();
  if (n.includes("MATERIA PRIMA")) return true;
  if (n.includes("PRODUCTO EN PROCESO")) return true;
  if (n.includes("TELAS")) return true;
  if (n.includes("RETAZOS")) return true;
  if (n.includes("MUESTRAS")) return true;
  if (n.includes("ARREGLOS")) return true;
  if (n.includes("SEGUNDAS Y SALDOS")) return true;
  if (n.includes("IMPORTACI")) return true;
  if (n.includes("IMPO CONTEN")) return true;
  if (n.includes("NO USAR")) return true;
  if (n.includes("MARCA SAMUEL")) return true;
  if (/^VEND\s/.test(n)) return true; // Salesperson warehouses
  return false;
}
