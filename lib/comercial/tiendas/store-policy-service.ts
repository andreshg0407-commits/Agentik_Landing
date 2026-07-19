/**
 * lib/comercial/tiendas/store-policy-service.ts
 *
 * FASE 7 — Per-store policy configuration service.
 * Persists StorePolicyRule[] in AgentExecution with operation COMERCIAL_STORE_POLICY_RULES.
 *
 * SERVER ONLY — never import from client components.
 *
 * Sprint: TIENDAS-POLICY-FOUNDATION-01
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import type { StorePolicyRule, StorePolicy } from "./store-policy-types";

// ── Constants ─────────────────────────────────────────────────────────────────

const MODULE    = "comercial";
const OPERATION = "COMERCIAL_STORE_POLICY_RULES";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const execDb = () => (prisma as any).agentExecution;

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateRuleId(): string {
  return `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToPolicy(row: any): StorePolicy {
  const meta = (row.metadataJson ?? {}) as Record<string, unknown>;
  return {
    storeId:   (meta.storeId as string) ?? "",
    storeName: (meta.storeName as string) ?? "",
    rules:     (meta.rules as StorePolicyRule[]) ?? [],
    capacity:  meta.capacity as StorePolicy["capacity"],
    active:    (meta.active as boolean) ?? true,
    updatedAt: row.updatedAt instanceof Date
      ? row.updatedAt.toISOString()
      : String(row.updatedAt ?? row.createdAt),
  };
}

// ── List all policies ─────────────────────────────────────────────────────────

export async function listStorePolicies(orgId: string): Promise<StorePolicy[]> {
  try {
    const rows = await execDb().findMany({
      where: { tenantId: orgId, module: MODULE, operation: OPERATION },
      orderBy: { createdAt: "asc" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rows.map((r: any) => rowToPolicy(r));
  } catch {
    return [];
  }
}

// ── Get policy for a specific store ───────────────────────────────────────────

export async function getStorePolicyByStoreId(
  orgId: string,
  storeId: string,
): Promise<StorePolicy | null> {
  try {
    const rows = await execDb().findMany({
      where: { tenantId: orgId, module: MODULE, operation: OPERATION },
      orderBy: { createdAt: "desc" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const match = rows.find((r: any) => {
      const meta = (r.metadataJson ?? {}) as Record<string, unknown>;
      return meta.storeId === storeId;
    });
    return match ? rowToPolicy(match) : null;
  } catch {
    return null;
  }
}

// ── Get all rules for a store (flattened) ─────────────────────────────────────

export async function getStoreRules(
  orgId: string,
  storeId: string,
): Promise<StorePolicyRule[]> {
  const policy = await getStorePolicyByStoreId(orgId, storeId);
  return policy?.rules ?? [];
}

// ── Save policy (create or update) ────────────────────────────────────────────

export async function saveStorePolicy(
  orgId: string,
  data: {
    storeId:   string;
    storeName: string;
    rules:     StorePolicyRule[];
    capacity?: StorePolicy["capacity"];
    active?:   boolean;
  },
): Promise<StorePolicy> {
  const now = new Date().toISOString();

  // Ensure all rules have IDs
  const rules = data.rules.map(r => ({
    ...r,
    id: r.id || generateRuleId(),
    storeId: data.storeId,
  }));

  const metadataJson = {
    storeId:   data.storeId,
    storeName: data.storeName,
    rules,
    capacity:  data.capacity,
    active:    data.active ?? true,
    updatedAt: now,
  };

  // Find existing row for this store
  const existing = await findPolicyRow(orgId, data.storeId);

  if (existing) {
    const row = await execDb().update({
      where: { id: existing.id },
      data:  { metadataJson },
    });
    return rowToPolicy(row);
  }

  const row = await execDb().create({
    data: {
      tenantId:     orgId,
      module:       MODULE,
      operation:    OPERATION,
      status:       "completed",
      createdBy:    "admin",
      intent:       `Politica tienda: ${data.storeName}`,
      metadataJson: { ...metadataJson, createdAt: now },
    },
  });
  return rowToPolicy(row);
}

// ── Toggle policy active ──────────────────────────────────────────────────────

export async function toggleStorePolicyActive(
  orgId: string,
  storeId: string,
): Promise<StorePolicy | null> {
  const policy = await getStorePolicyByStoreId(orgId, storeId);
  if (!policy) return null;

  return saveStorePolicy(orgId, {
    storeId:   policy.storeId,
    storeName: policy.storeName,
    rules:     policy.rules,
    capacity:  policy.capacity,
    active:    !policy.active,
  });
}

// ── Add rule to store ─────────────────────────────────────────────────────────

export async function addRuleToStore(
  orgId: string,
  storeId: string,
  storeName: string,
  rule: Omit<StorePolicyRule, "id" | "storeId">,
): Promise<StorePolicy> {
  const policy = await getStorePolicyByStoreId(orgId, storeId);
  const existingRules = policy?.rules ?? [];

  const newRule: StorePolicyRule = {
    ...rule,
    id: generateRuleId(),
    storeId,
  };

  return saveStorePolicy(orgId, {
    storeId,
    storeName: policy?.storeName ?? storeName,
    rules:     [...existingRules, newRule],
    capacity:  policy?.capacity,
    active:    policy?.active ?? true,
  });
}

// ── Remove rule from store ────────────────────────────────────────────────────

export async function removeRuleFromStore(
  orgId: string,
  storeId: string,
  ruleId: string,
): Promise<StorePolicy | null> {
  const policy = await getStorePolicyByStoreId(orgId, storeId);
  if (!policy) return null;

  return saveStorePolicy(orgId, {
    storeId,
    storeName: policy.storeName,
    rules:     policy.rules.filter(r => r.id !== ruleId),
    capacity:  policy.capacity,
    active:    policy.active,
  });
}

// ── Internal helper ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findPolicyRow(orgId: string, storeId: string): Promise<any | null> {
  try {
    const rows = await execDb().findMany({
      where: { tenantId: orgId, module: MODULE, operation: OPERATION },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rows.find((r: any) => {
      const meta = (r.metadataJson ?? {}) as Record<string, unknown>;
      return meta.storeId === storeId;
    }) ?? null;
  } catch {
    return null;
  }
}
