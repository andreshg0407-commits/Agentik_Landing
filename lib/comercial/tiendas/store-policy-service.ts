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
import type { AgingDiscountBandConfig } from "./store-policy-pack-config";
import {
  buildEffectiveAgingDiscountPolicy,
} from "./store-effective-rule-registry";
import type { AgingDiscountPolicyValidationError } from "./store-effective-rule-registry";

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

// ═════════════════════════════════════════════════════════════════════════════
// AGENTIK-STORES-DISCOUNTS-DYNAMIC-RULES-01 §3-5
// Atomic batch persistence with validate-before-write
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Result of a batch aging discount rule operation.
 */
export interface AgingDiscountBatchResult {
  ok: boolean;
  /** Validation errors — if any, NO rules were persisted */
  errors: readonly AgingDiscountPolicyValidationError[];
  /** The resulting policy after applying candidate rules (null if rejected) */
  policy: StorePolicy | null;
}

/**
 * A candidate operation for the batch.
 */
export interface AgingDiscountRuleCandidate {
  id?: string;
  effect: "OVERRIDE" | "DISABLE" | "ADD";
  minDays?: number;
  maxDays?: number | null;
  discountPercent?: number;
  priority?: number;
  active?: boolean;
  validFrom?: string;
  validTo?: string;
}

/**
 * Save aging discount rules atomically with validate-before-write.
 *
 * Contract:
 *   1. Read current persisted rules for the store
 *   2. Merge non-AGING_DISCOUNT rules (preserved) + candidate AGING_DISCOUNT rules
 *   3. Build candidate effective policy from defaults + merged rules
 *   4. Validate candidate policy — if errors, REJECT (no DB mutation)
 *   5. If valid, persist ALL rules in a single write
 *
 * This function is the ONLY write path for AGING_DISCOUNT rules.
 * Single-rule edits (CREATE/EDIT/DISABLE/REACTIVATE) also go through here.
 */
export async function saveAgingDiscountRulesBatch(
  orgId: string,
  storeId: string,
  storeName: string,
  candidates: AgingDiscountRuleCandidate[],
  defaultBands: readonly AgingDiscountBandConfig[],
): Promise<AgingDiscountBatchResult> {
  // 1. Read current persisted rules
  const currentPolicy = await getStorePolicyByStoreId(orgId, storeId);
  const currentRules = currentPolicy?.rules ?? [];

  // 2. Separate non-aging rules (preserved) from aging rules (replaced)
  const nonAgingRules = currentRules.filter(r => r.ruleKind !== "AGING_DISCOUNT");

  // 3. Build candidate AGING_DISCOUNT StorePolicyRules
  const candidateRules: StorePolicyRule[] = candidates.map((c, i) => ({
    id: c.id || generateRuleId(),
    storeId,
    scope: "store" as const,
    productClass: "textile" as const,
    allowReplacement: false,
    allowProductionSignal: false,
    allowMainWarehouseTransfer: false,
    priority: c.priority ?? (i * 10),
    active: c.active ?? true,
    ruleKind: "AGING_DISCOUNT" as const,
    effect: c.effect,
    minDays: c.minDays,
    maxDays: c.maxDays,
    discountPercent: c.discountPercent,
    validFrom: c.validFrom,
    validTo: c.validTo,
  }));

  // 4. Build candidate effective policy to validate
  const evaluationDate = new Date().toISOString().slice(0, 10);
  const { errors } = buildEffectiveAgingDiscountPolicy(
    defaultBands,
    candidateRules,
    storeId,
    evaluationDate,
  );

  // 5. REJECT if invalid — no DB mutation
  if (errors.length > 0) {
    return { ok: false, errors, policy: null };
  }

  // 6. Merge and persist atomically (single write)
  const mergedRules = [...nonAgingRules, ...candidateRules];
  const saved = await saveStorePolicy(orgId, {
    storeId,
    storeName: currentPolicy?.storeName ?? storeName,
    rules: mergedRules,
    capacity: currentPolicy?.capacity,
    active: currentPolicy?.active ?? true,
  });

  return { ok: true, errors: [], policy: saved };
}
