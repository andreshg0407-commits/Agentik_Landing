/**
 * lib/comercial/tiendas/store-governance-service.ts
 *
 * Canonical source of truth for store operational status (ACTIVE / INACTIVE).
 * Persists in AgentExecution with operation COMERCIAL_STORE_GOVERNANCE.
 *
 * PRIMERO: Each store has a single governance record.
 * SEGUNDO: resolveActiveStores() / resolveInactiveStores() are the only entry points.
 * TERCERO: Inactive stores are excluded from ALL intelligence.
 * QUINTO:  Activate/deactivate with audit.
 * SEXTO:   Audit via AgentExecution.
 * SÉPTIMO: Cache invalidation on every change.
 *
 * SERVER ONLY — never import from client components.
 *
 * Sprint: AGENTIK-STORES-ACTIVE-STORE-GOVERNANCE-01
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { CANONICAL_STORE_IDENTITY, invalidateDistributionCacheForOrg } from "./store-distribution-service";
import type {
  StoreGovernanceRecord,
  StoreOperationalStatus,
  StoreGovernanceAuditEntry,
} from "./store-governance-types";
import { CASTILLITOS_INACTIVE_STORES } from "./store-governance-types";

// ── Constants ─────────────────────────────────────────────────────────────────

const MODULE    = "comercial";
const OPERATION = "COMERCIAL_STORE_GOVERNANCE";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const execDb = () => (prisma as any).agentExecution;

// ── In-memory cache ───────────────────────────────────────────────────────────

const governanceCache = new Map<string, { data: StoreGovernanceRecord[]; expiresAt: number }>();
const GOVERNANCE_TTL = 5 * 60 * 1000; // 5 min

function invalidateGovernanceCache(orgId: string): void {
  governanceCache.delete(`governance:${orgId}`);
  // Also invalidate distribution caches (SÉPTIMO)
  invalidateDistributionCacheForOrg(orgId);
}

// ── Row mapping ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToRecord(row: any): StoreGovernanceRecord {
  const meta = (row.metadataJson ?? {}) as Record<string, unknown>;
  return {
    storeId:            (meta.storeId as string) ?? "",
    slug:               (meta.slug as string) ?? "",
    displayName:        (meta.displayName as string) ?? "",
    warehouseId:        (meta.warehouseId as string) ?? "",
    sagWarehouseCode:   (meta.sagWarehouseCode as string) ?? "",
    city:               (meta.city as string) ?? "",
    status:             (meta.status as StoreOperationalStatus) ?? "INACTIVE",
    activatedAt:        (meta.activatedAt as string) ?? null,
    deactivatedAt:      (meta.deactivatedAt as string) ?? null,
    deactivationReason: (meta.deactivationReason as string) ?? null,
    updatedBy:          (meta.updatedBy as string) ?? null,
    updatedAt:          row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt ?? row.createdAt),
  };
}

// ── Load all governance records ───────────────────────────────────────────────

async function loadGovernanceRecords(orgId: string): Promise<StoreGovernanceRecord[]> {
  const cached = governanceCache.get(`governance:${orgId}`);
  if (cached && Date.now() < cached.expiresAt) return cached.data;

  try {
    const rows = await execDb().findMany({
      where: { tenantId: orgId, module: MODULE, operation: OPERATION },
      orderBy: { createdAt: "asc" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const records = rows.map((r: any) => rowToRecord(r));
    governanceCache.set(`governance:${orgId}`, { data: records, expiresAt: Date.now() + GOVERNANCE_TTL });
    return records;
  } catch {
    return [];
  }
}

// ── Build default governance from warehouse-master ──────────────────────────

function buildDefaultGovernance(): StoreGovernanceRecord[] {
  const now = new Date().toISOString();
  const records: StoreGovernanceRecord[] = [];

  // Active stores from CANONICAL_STORE_IDENTITY
  for (const [pk, identity] of Object.entries(CANONICAL_STORE_IDENTITY)) {
    records.push({
      storeId:            identity.slug,
      slug:               identity.slug,
      displayName:        identity.name,
      warehouseId:        pk,
      sagWarehouseCode:   pk,
      city:               identity.city,
      status:             "ACTIVE",
      activatedAt:        now,
      deactivatedAt:      null,
      deactivationReason: null,
      updatedBy:          "system",
      updatedAt:          now,
    });
  }

  // Inactive stores from seed
  for (const seed of CASTILLITOS_INACTIVE_STORES) {
    records.push({
      storeId:            `inactive_${seed.warehouseId}`,
      slug:               `inactive_${seed.warehouseId}`,
      displayName:        seed.displayName,
      warehouseId:        seed.warehouseId,
      sagWarehouseCode:   seed.sagWarehouseCode,
      city:               seed.city,
      status:             "INACTIVE",
      activatedAt:        null,
      deactivatedAt:      now,
      deactivationReason: seed.exclusionReason,
      updatedBy:          "system",
      updatedAt:          now,
    });
  }

  return records;
}

// ── SEGUNDO: Resolve active / inactive stores ─────────────────────────────

export async function resolveActiveStores(orgId: string): Promise<StoreGovernanceRecord[]> {
  const records = await loadGovernanceRecords(orgId);
  if (records.length > 0) return records.filter(r => r.status === "ACTIVE");
  // Fallback to defaults if no persisted records exist
  return buildDefaultGovernance().filter(r => r.status === "ACTIVE");
}

export async function resolveInactiveStores(orgId: string): Promise<StoreGovernanceRecord[]> {
  const records = await loadGovernanceRecords(orgId);
  if (records.length > 0) return records.filter(r => r.status === "INACTIVE");
  return buildDefaultGovernance().filter(r => r.status === "INACTIVE");
}

export async function resolveAllStores(orgId: string): Promise<StoreGovernanceRecord[]> {
  const records = await loadGovernanceRecords(orgId);
  if (records.length > 0) return records;
  return buildDefaultGovernance();
}

// ── TERCERO: Guard — reject inactive store operations ───────────────────────

export async function assertStoreActive(orgId: string, storeId: string): Promise<void> {
  const active = await resolveActiveStores(orgId);
  const isActive = active.some(s => s.storeId === storeId || s.slug === storeId);
  if (!isActive) {
    const error = new Error("STORE_INACTIVE");
    (error as Error & { code: string }).code = "STORE_INACTIVE";
    throw error;
  }
}

// ── QUINTO: Activate a store ────────────────────────────────────────────────

export async function activateStore(
  orgId: string,
  storeId: string,
  userId: string,
  userRole: string,
): Promise<StoreGovernanceRecord> {
  const all = await resolveAllStores(orgId);
  const store = all.find(s => s.storeId === storeId || s.slug === storeId);
  if (!store) throw new Error("STORE_NOT_FOUND");
  if (store.status === "ACTIVE") throw new Error("STORE_ALREADY_ACTIVE");

  const now = new Date().toISOString();
  const updated: StoreGovernanceRecord = {
    ...store,
    status:             "ACTIVE",
    activatedAt:        now,
    deactivatedAt:      null,
    deactivationReason: null,
    updatedBy:          userId,
    updatedAt:          now,
  };

  await persistGovernanceRecord(orgId, updated, userId, userRole, "INACTIVE", "ACTIVE", null);
  invalidateGovernanceCache(orgId);
  return updated;
}

// ── QUINTO: Deactivate a store ──────────────────────────────────────────────

export async function deactivateStore(
  orgId: string,
  storeId: string,
  reason: string,
  userId: string,
  userRole: string,
): Promise<StoreGovernanceRecord> {
  if (!reason || reason.trim().length === 0) throw new Error("REASON_REQUIRED");

  const all = await resolveAllStores(orgId);
  const store = all.find(s => s.storeId === storeId || s.slug === storeId);
  if (!store) throw new Error("STORE_NOT_FOUND");
  if (store.status === "INACTIVE") throw new Error("STORE_ALREADY_INACTIVE");

  const now = new Date().toISOString();
  const updated: StoreGovernanceRecord = {
    ...store,
    status:             "INACTIVE",
    activatedAt:        store.activatedAt,
    deactivatedAt:      now,
    deactivationReason: reason.trim(),
    updatedBy:          userId,
    updatedAt:          now,
  };

  await persistGovernanceRecord(orgId, updated, userId, userRole, "ACTIVE", "INACTIVE", reason);
  invalidateGovernanceCache(orgId);
  return updated;
}

// ── SEXTO: Persist with audit ───────────────────────────────────────────────

async function persistGovernanceRecord(
  orgId: string,
  record: StoreGovernanceRecord,
  userId: string,
  userRole: string,
  previousStatus: StoreOperationalStatus,
  newStatus: StoreOperationalStatus,
  reason: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  const executionId = `gov_${record.storeId}_${Date.now()}`;

  const auditEntry: StoreGovernanceAuditEntry = {
    organizationId: orgId,
    storeId:        record.storeId,
    storeName:      record.displayName,
    previousStatus,
    newStatus,
    reason,
    userId,
    userRole,
    timestamp:      now,
    source:         "store-governance-service",
    executionId,
  };

  const metadataJson = {
    ...record,
    audit: auditEntry,
  };

  // Upsert: find existing record for this store, update or create
  const existing = await execDb().findFirst({
    where: {
      tenantId:  orgId,
      module:    MODULE,
      operation: OPERATION,
      intent:    { contains: record.storeId },
    },
  });

  if (existing) {
    await execDb().update({
      where: { id: existing.id },
      data:  { metadataJson, updatedAt: new Date() },
    });
  } else {
    await execDb().create({
      data: {
        tenantId:     orgId,
        module:       MODULE,
        operation:    OPERATION,
        status:       "completed",
        createdBy:    userId,
        intent:       `Store governance: ${record.storeId}`,
        metadataJson,
      },
    });
  }
}

// ── Permission check ────────────────────────────────────────────────────────

const GOVERNANCE_ROLES = new Set(["SUPER_ADMIN", "ORG_ADMIN"]);

export function canManageStoreGovernance(role: string): boolean {
  return GOVERNANCE_ROLES.has(role);
}
