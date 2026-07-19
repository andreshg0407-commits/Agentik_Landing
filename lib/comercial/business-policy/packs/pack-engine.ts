/**
 * lib/comercial/business-policy/packs/pack-engine.ts
 *
 * Pack Engine (FASE 4, 5, 7).
 * In-memory store for Policy Packs.
 *
 * API:
 *   registerPack()
 *   activatePack()
 *   deactivatePack()
 *   listPacks()
 *   resolveActivePack()
 *
 * Plus versioning and compatibility helpers.
 *
 * Sprint: BUSINESS-POLICY-PACKS-01
 */

import type {
  BusinessPolicyPack,
  BusinessPolicyPackVersion,
  BusinessPolicyPackSummary,
  BusinessPolicyPackActivation,
  BusinessPolicyPackReference,
  PackValidationResult,
  PackDiff,
  PackDiffEntry,
  PackStatus,
} from "./pack-types";
import type { PolicyCategory } from "../policy-types";
import { validatePack } from "./pack-validation";

// ── In-Memory Store ─────────────────────────────────────────────────────────

const packStore: Map<string, BusinessPolicyPack[]> = new Map();

// ── registerPack ────────────────────────────────────────────────────────────

export interface RegisterPackResult {
  readonly success: boolean;
  readonly pack: BusinessPolicyPack;
  readonly validation: PackValidationResult;
}

export function registerPack(pack: BusinessPolicyPack): RegisterPackResult {
  const validation = validatePack(pack);
  if (!validation.valid) {
    return { success: false, pack, validation };
  }

  const key = pack.tenantId;
  const existing = packStore.get(key) ?? [];

  // Enforce: a policy belongs to one pack only within the same tenant
  const membershipIssue = checkMembershipExclusivity(pack, existing);
  if (membershipIssue) {
    return {
      success: false,
      pack,
      validation: {
        valid: false,
        issues: [
          ...validation.issues,
          { field: "policies", message: membershipIssue, severity: "ERROR" },
        ],
      },
    };
  }

  existing.push(pack);
  packStore.set(key, existing);

  return { success: true, pack, validation };
}

// ── activatePack ────────────────────────────────────────────────────────────

export function activatePack(
  tenantId: string,
  packId: string,
  activatedBy: string,
): BusinessPolicyPackActivation | null {
  const packs = packStore.get(tenantId) ?? [];
  const idx = packs.findIndex(p => p.id === packId && (p.status === "DRAFT" || p.status === "DEPRECATED"));
  if (idx === -1) return null;

  // Deactivate any currently active pack for this tenant
  let previousPackId: string | null = null;
  let previousVersion: string | null = null;

  for (let i = 0; i < packs.length; i++) {
    if (packs[i].status === "ACTIVE" && packs[i].id !== packId) {
      previousPackId = packs[i].id;
      previousVersion = packs[i].versionInfo.version;
      packs[i] = {
        ...packs[i],
        status: "DEPRECATED" as PackStatus,
        versionInfo: { ...packs[i].versionInfo, deprecatedAt: new Date() },
      };
    }
  }

  const now = new Date();
  packs[idx] = {
    ...packs[idx],
    status: "ACTIVE",
    versionInfo: { ...packs[idx].versionInfo, activatedAt: now },
  };
  packStore.set(tenantId, packs);

  return {
    packId,
    tenantId,
    version: packs[idx].versionInfo.version,
    activatedAt: now,
    activatedBy,
    previousPackId,
    previousVersion,
  };
}

// ── deactivatePack ──────────────────────────────────────────────────────────

export function deactivatePack(tenantId: string, packId: string): BusinessPolicyPack | null {
  const packs = packStore.get(tenantId) ?? [];
  const idx = packs.findIndex(p => p.id === packId && p.status === "ACTIVE");
  if (idx === -1) return null;

  packs[idx] = {
    ...packs[idx],
    status: "DEPRECATED",
    versionInfo: { ...packs[idx].versionInfo, deprecatedAt: new Date() },
  };
  packStore.set(tenantId, packs);

  return packs[idx];
}

// ── listPacks ───────────────────────────────────────────────────────────────

export interface ListPacksFilter {
  readonly tenantId: string;
  readonly status?: PackStatus;
  readonly category?: PolicyCategory;
}

export function listPacks(filter: ListPacksFilter): readonly BusinessPolicyPack[] {
  let packs = packStore.get(filter.tenantId) ?? [];

  if (filter.status) {
    packs = packs.filter(p => p.status === filter.status);
  }

  if (filter.category) {
    packs = packs.filter(p => p.categories.includes(filter.category!));
  }

  return packs;
}

// ── resolveActivePack ───────────────────────────────────────────────────────

export function resolveActivePack(tenantId: string): BusinessPolicyPack | null {
  const packs = packStore.get(tenantId) ?? [];
  return packs.find(p => p.status === "ACTIVE") ?? null;
}

// ── Pack Summary ────────────────────────────────────────────────────────────

export function buildPackSummary(pack: BusinessPolicyPack): BusinessPolicyPackSummary {
  return {
    packId: pack.id,
    tenantId: pack.tenantId,
    name: pack.name,
    version: pack.versionInfo.version,
    status: pack.status,
    categoryCount: pack.categories.length,
    policyCount: pack.policies.length,
    categories: pack.categories,
    activatedAt: pack.versionInfo.activatedAt,
  };
}

// ── Pack Versioning (FASE 5) ────────────────────────────────────────────────

export function createPackVersion(
  existingPack: BusinessPolicyPack,
  updates: Partial<Pick<BusinessPolicyPack, "name" | "description" | "categories" | "policies" | "tags" | "metadata">>,
  createdBy: string,
  changeNote: string | null,
): BusinessPolicyPack {
  const prevVersion = existingPack.versionInfo.version;
  const nextVersion = incrementVersion(prevVersion);

  const newVersionInfo: BusinessPolicyPackVersion = {
    version: nextVersion,
    createdAt: new Date(),
    createdBy,
    activatedAt: null,
    deprecatedAt: null,
    previousVersion: prevVersion,
    changeNote,
  };

  return {
    ...existingPack,
    ...updates,
    status: "DRAFT",
    versionInfo: newVersionInfo,
  };
}

// ── Pack Diff ───────────────────────────────────────────────────────────────

export function diffPacks(from: BusinessPolicyPack, to: BusinessPolicyPack): PackDiff {
  const entries: PackDiffEntry[] = [];

  const fromMap = new Map(from.policies.map(p => [p.policyId, p]));
  const toMap = new Map(to.policies.map(p => [p.policyId, p]));

  // Added or version changed
  for (const [id, toRef] of toMap) {
    const fromRef = fromMap.get(id);
    if (!fromRef) {
      entries.push({ category: toRef.category, policyId: id, change: "ADDED", previousVersion: null, newVersion: toRef.policyVersion });
    } else if (fromRef.policyVersion !== toRef.policyVersion) {
      entries.push({ category: toRef.category, policyId: id, change: "VERSION_CHANGED", previousVersion: fromRef.policyVersion, newVersion: toRef.policyVersion });
    }
  }

  // Removed
  for (const [id, fromRef] of fromMap) {
    if (!toMap.has(id)) {
      entries.push({ category: fromRef.category, policyId: id, change: "REMOVED", previousVersion: fromRef.policyVersion, newVersion: null });
    }
  }

  return {
    fromVersion: from.versionInfo.version,
    toVersion: to.versionInfo.version,
    entries,
  };
}

// ── Compatibility (FASE 7) ──────────────────────────────────────────────────

/**
 * Given a Pack, returns only the policy references for a given category.
 * This lets an engine (e.g., Coverage) ask "which policies apply to me?"
 * without knowing about the Pack structure.
 */
export function getPoliciesForCategory(
  pack: BusinessPolicyPack,
  category: PolicyCategory,
): readonly BusinessPolicyPackReference[] {
  return pack.policies.filter(p => p.category === category);
}

/**
 * Resolves the active pack for a tenant and returns the policy IDs
 * for a given category. Returns empty array if no active pack.
 */
export function resolvePackPolicyIds(
  tenantId: string,
  category: PolicyCategory,
): readonly string[] {
  const pack = resolveActivePack(tenantId);
  if (!pack) return [];
  return getPoliciesForCategory(pack, category).map(p => p.policyId);
}

// ── Membership Exclusivity ──────────────────────────────────────────────────

function checkMembershipExclusivity(
  newPack: BusinessPolicyPack,
  existingPacks: readonly BusinessPolicyPack[],
): string | null {
  const activePacks = existingPacks.filter(p => p.status === "ACTIVE" || p.status === "DRAFT");

  for (const ref of newPack.policies) {
    for (const existing of activePacks) {
      if (existing.id === newPack.id) continue;
      const duplicate = existing.policies.find(p => p.policyId === ref.policyId);
      if (duplicate) {
        return `Policy "${ref.policyId}" already belongs to pack "${existing.id}" (${existing.name})`;
      }
    }
  }

  return null;
}

// ── Clear Store (testing only) ──────────────────────────────────────────────

export function _clearPackStore(): void {
  packStore.clear();
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function incrementVersion(version: string): string {
  const parts = version.split(".");
  if (parts.length !== 3) return "1.0.1";
  const major = parseInt(parts[0], 10) || 1;
  const minor = parseInt(parts[1], 10) || 0;
  const patch = (parseInt(parts[2], 10) || 0) + 1;
  return `${major}.${minor}.${patch}`;
}
