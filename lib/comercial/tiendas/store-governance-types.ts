/**
 * lib/comercial/tiendas/store-governance-types.ts
 *
 * Pure types for store governance (ACTIVE / INACTIVE).
 * No runtime logic, no Prisma, no imports beyond sibling types.
 *
 * Sprint: AGENTIK-STORES-ACTIVE-STORE-GOVERNANCE-01
 */

// ── Operational status ──────────────────────────────────────────────────────

export type StoreOperationalStatus = "ACTIVE" | "INACTIVE";

// ── Canonical store record ──────────────────────────────────────────────────

export interface StoreGovernanceRecord {
  storeId:              string;
  slug:                 string;
  displayName:          string;
  warehouseId:          string;   // kaNlBodega from warehouse-master
  sagWarehouseCode:     string;   // ssCodigo from warehouse-master
  city:                 string;
  status:               StoreOperationalStatus;
  activatedAt:          string | null;
  deactivatedAt:        string | null;
  deactivationReason:   string | null;
  updatedBy:            string | null;
  updatedAt:            string;
}

// ── Audit entry ─────────────────────────────────────────────────────────────

export interface StoreGovernanceAuditEntry {
  organizationId:   string;
  storeId:          string;
  storeName:        string;
  previousStatus:   StoreOperationalStatus;
  newStatus:        StoreOperationalStatus;
  reason:           string | null;
  userId:           string;
  userRole:         string;
  timestamp:        string;
  source:           string;
  executionId:      string;
}

// ── API response codes ──────────────────────────────────────────────────────

export const STORE_INACTIVE_CODE = "STORE_INACTIVE" as const;
export const STORE_INACTIVE_MESSAGE = "La tienda esta inactiva y no participa en la operacion." as const;

// ── Castillitos inactive stores (seed from warehouse-master EXCLUDED) ──────

export interface InactiveStoreSeed {
  warehouseId:      string;   // kaNlBodega
  sagWarehouseCode: string;   // ssCodigo
  displayName:      string;
  city:             string;
  exclusionReason:  string;
}

export const CASTILLITOS_INACTIVE_STORES: InactiveStoreSeed[] = [
  { warehouseId: "12", sagWarehouseCode: "03", displayName: "Mayorca",            city: "Sabaneta",   exclusionReason: "No tener en cuenta" },
  { warehouseId: "52", sagWarehouseCode: "41", displayName: "Dexcato",            city: "Medellin",   exclusionReason: "No tener en cuenta" },
  { warehouseId: "17", sagWarehouseCode: "08", displayName: "Paque Berrio",       city: "Medellin",   exclusionReason: "Franquicia cerrada" },
  { warehouseId: "18", sagWarehouseCode: "10", displayName: "Bello",              city: "Bello",      exclusionReason: "Franquicia cerrada" },
  { warehouseId: "21", sagWarehouseCode: "12", displayName: "Pereira",            city: "Pereira",    exclusionReason: "Franquicia cerrada" },
  { warehouseId: "19", sagWarehouseCode: "09", displayName: "Bolivar",            city: "Medellin",   exclusionReason: "Franquicia cerrada" },
  { warehouseId: "20", sagWarehouseCode: "11", displayName: "Armenia",            city: "Armenia",    exclusionReason: "Franquicia cerrada" },
  { warehouseId: "22", sagWarehouseCode: "13", displayName: "Cent May Bogota",    city: "Bogota",     exclusionReason: "Franquicia cerrada" },
  { warehouseId: "23", sagWarehouseCode: "14", displayName: "Mayorca (F17)",      city: "Sabaneta",   exclusionReason: "Franquicia cerrada" },
  { warehouseId: "24", sagWarehouseCode: "15", displayName: "Ibague",             city: "Ibague",     exclusionReason: "Franquicia cerrada" },
];
