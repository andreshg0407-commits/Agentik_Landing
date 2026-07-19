/**
 * lib/comercial/tiendas/store-warehouse-config-service.ts
 *
 * Administrative warehouse mapping configuration.
 * Persists in AgentExecution with operation COMERCIAL_STORE_WAREHOUSE_MAPPING_CONFIG.
 *
 * SERVER ONLY — never import from client components.
 *
 * Sprint: COMERCIAL-TIENDAS-NO-HARDCODE-05
 */

import "server-only";

import { prisma } from "@/lib/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

export type WarehouseConfigSource = "sag" | "admin_config";

export interface StoreWarehouseMappingConfig {
  id:               string;
  organizationId:   string;
  storeName:        string;
  sagWarehouseCode: string;
  city:             string;
  responsibleName:  string;
  storeType:        "tienda" | "outlet" | "punto_venta";
  isMainWarehouse:  boolean;
  active:           boolean;
  source:           WarehouseConfigSource;
  createdAt:        string;
  updatedAt:        string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MODULE    = "comercial";
const OPERATION = "COMERCIAL_STORE_WAREHOUSE_MAPPING_CONFIG";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const execDb = () => (prisma as any).agentExecution;

// ── Row mapping ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToConfig(row: any): StoreWarehouseMappingConfig {
  const meta = (row.metadataJson ?? {}) as Record<string, unknown>;
  return {
    id:               row.id,
    organizationId:   row.tenantId,
    storeName:        (meta.storeName as string) ?? "",
    sagWarehouseCode: (meta.sagWarehouseCode as string) ?? "",
    city:             (meta.city as string) ?? "",
    responsibleName:  (meta.responsibleName as string) ?? "",
    storeType:        (meta.storeType as StoreWarehouseMappingConfig["storeType"]) ?? "tienda",
    isMainWarehouse:  (meta.isMainWarehouse as boolean) ?? false,
    active:           (meta.active as boolean) ?? true,
    source:           (meta.source as WarehouseConfigSource) ?? "admin_config",
    createdAt:        row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt:        row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt ?? row.createdAt),
  };
}

// ── List configs ────────────────────────────────────────────────────────────

export async function listWarehouseConfigs(orgId: string): Promise<StoreWarehouseMappingConfig[]> {
  try {
    const rows = await execDb().findMany({
      where: {
        tenantId:  orgId,
        module:    MODULE,
        operation: OPERATION,
      },
      orderBy: { createdAt: "asc" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rows.map((r: any) => rowToConfig(r));
  } catch {
    return [];
  }
}

// ── Get single config ───────────────────────────────────────────────────────

export async function getWarehouseConfig(
  orgId: string, configId: string,
): Promise<StoreWarehouseMappingConfig | null> {
  try {
    const row = await execDb().findFirst({
      where: { id: configId, tenantId: orgId, module: MODULE, operation: OPERATION },
    });
    return row ? rowToConfig(row) : null;
  } catch {
    return null;
  }
}

// ── Save config (create or update) ──────────────────────────────────────────

export async function saveWarehouseConfig(
  orgId: string,
  data: {
    id?:              string;
    storeName:        string;
    sagWarehouseCode: string;
    city?:            string;
    responsibleName?: string;
    storeType?:       StoreWarehouseMappingConfig["storeType"];
    isMainWarehouse?: boolean;
    active?:          boolean;
  },
): Promise<StoreWarehouseMappingConfig> {
  const now = new Date().toISOString();
  const metadataJson = {
    storeName:        data.storeName,
    sagWarehouseCode: data.sagWarehouseCode,
    city:             data.city ?? "",
    responsibleName:  data.responsibleName ?? "",
    storeType:        data.storeType ?? "tienda",
    isMainWarehouse:  data.isMainWarehouse ?? false,
    active:           data.active ?? true,
    source:           "admin_config" as const,
    updatedAt:        now,
  };

  if (data.id) {
    // Update existing
    const row = await execDb().update({
      where: { id: data.id },
      data:  { metadataJson },
    });
    return rowToConfig(row);
  }

  // Create new
  const row = await execDb().create({
    data: {
      tenantId:     orgId,
      module:       MODULE,
      operation:    OPERATION,
      status:       "completed",
      createdBy:    "admin",
      intent:       `Configuracion bodega: ${data.storeName}`,
      metadataJson: { ...metadataJson, createdAt: now },
    },
  });
  return rowToConfig(row);
}

// ── Toggle active ───────────────────────────────────────────────────────────

export async function toggleWarehouseConfigActive(
  orgId: string, configId: string,
): Promise<StoreWarehouseMappingConfig | null> {
  const config = await getWarehouseConfig(orgId, configId);
  if (!config) return null;

  return saveWarehouseConfig(orgId, {
    id:               configId,
    storeName:        config.storeName,
    sagWarehouseCode: config.sagWarehouseCode,
    city:             config.city,
    responsibleName:  config.responsibleName,
    storeType:        config.storeType,
    isMainWarehouse:  config.isMainWarehouse,
    active:           !config.active,
  });
}
