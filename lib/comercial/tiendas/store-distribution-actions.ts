/**
 * lib/comercial/tiendas/store-distribution-actions.ts
 *
 * Server actions for the canonical store distribution layer.
 * Handles:
 *   - Effective config resolution (tenant defaults + store overrides)
 *   - Rule impact preview (deterministic, no LLM)
 *   - Save with permission checks, audit trail, and cache invalidation
 *
 * Consumes (never duplicates):
 *   - store-policy-service → CRUD for StorePolicyRule
 *   - store-policy-pack-config → tenant defaults
 *   - store-distribution-service → buildCanonicalStoreDistribution, getCanonicalStoreDetail
 *   - module-access → hasMinRole for permission checks
 *
 * SERVER ONLY — never import from client components.
 *
 * Sprint: AGENTIK-STORES-CANONICAL-DISTRIBUTION-01
 */

import "server-only";

import type { Role } from "@prisma/client";

import type {
  EffectiveStoreConfig,
  EffectiveTextileConfig,
  EffectiveAccessoryConfig,
  EffectiveScarcityConfig,
  RuleImpactPreview,
  ConfigValidationResult,
  ConfigFieldError,
} from "./store-distribution-types";

import {
  ACTIVE_STORE_SLUGS,
  validateDistributionConfigInput,
} from "./store-distribution-types";

import type { StoreSizeClass, StorePolicyRule } from "./store-policy-types";

import {
  getStorePolicyByStoreId,
  saveStorePolicy,
} from "./store-policy-service";

import {
  CASTILLITOS_TEXTILE_COVERAGE,
  LATIN_KIDS_TEXTILE_COVERAGE,
  CASTILLITOS_GLOBAL_LOW_STOCK,
  CASTILLITOS_ACCESSORY_COVERAGE,
} from "./store-policy-pack-config";

import {
  getCanonicalStoreDetail,
  invalidateDistributionCacheForOrg,
} from "./store-distribution-service";
import { invalidateLineCountsCache } from "./store-inventory-by-line";
import { hasMinRole } from "@/lib/auth/module-access";
import { prisma } from "@/lib/prisma";

// ── Permission check ──────────────────────────────────────────────────────────

const EDIT_MIN_ROLE: Role = "ORG_ADMIN";

export function canEditDistributionConfig(role: Role): boolean {
  return hasMinRole(role, EDIT_MIN_ROLE);
}

// ── Audit trail ───────────────────────────────────────────────────────────────

export interface DistributionConfigAuditEntry {
  organizationId: string;
  storeId:        string;
  userId:         string;
  userRole:       string;
  requestId:      string;
  source:         "ui" | "api" | "system";
  fecha:          string;
  regla:          string;
  valorAnterior:  unknown;
  valorNuevo:     unknown;
  vigencia:       string | null;
  validFrom:      string | null;
  validTo:        string | null;
  season:         string | null;
  notes:          string | null;
  motivo:         string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const auditDb = () => (prisma as any).agentExecution;

async function recordAuditEntry(entry: DistributionConfigAuditEntry): Promise<void> {
  try {
    await auditDb().create({
      data: {
        tenantId:     entry.organizationId,
        module:       "comercial",
        operation:    "STORE_DISTRIBUTION_CONFIG_AUDIT",
        status:       "completed",
        createdBy:    entry.userId,
        intent:       `Cambio regla: ${entry.regla} en tienda ${entry.storeId}`,
        metadataJson: entry,
      },
    });
  } catch (err) {
    console.error("[DISTRIBUTION_AUDIT] Failed to record audit entry:", err);
  }
}

// ── Sanitization helpers (used in save flow) ──────────────────────────────────
const MAX_SEASON_LENGTH = 100;
const MAX_NOTES_LENGTH = 500;

function sanitizeText(s: string, maxLen: number): string {
  return String(s).replace(/<[^>]*>/g, "").trim().slice(0, maxLen);
}

// ── Effective config resolution ───────────────────────────────────────────────

/**
 * Resolves the effective configuration for a store.
 * Merges tenant defaults with store-specific overrides from store-policy-service.
 */
export async function getEffectiveStoreConfig(
  orgId: string,
  storeId: string,
): Promise<EffectiveStoreConfig> {
  const policy = await getStorePolicyByStoreId(orgId, storeId);
  const rules = policy?.rules ?? [];

  // ── Textile configs ──────────────────────────────────────────────────
  const castillitosTextile = resolveTextileConfig(rules, "castillitos", CASTILLITOS_TEXTILE_COVERAGE);
  const latinKidsTextile = resolveTextileConfig(rules, "latin_kids", LATIN_KIDS_TEXTILE_COVERAGE);

  // ── Accessory configs ────────────────────────────────────────────────
  const smallAcc = resolveAccessoryConfig(rules, "small", CASTILLITOS_ACCESSORY_COVERAGE.idealBySize.small);
  const mediumAcc = resolveAccessoryConfig(rules, "medium", CASTILLITOS_ACCESSORY_COVERAGE.idealBySize.medium);
  const largeAcc = resolveAccessoryConfig(rules, "large", CASTILLITOS_ACCESSORY_COVERAGE.idealBySize.large);

  // ── Scarcity config ──────────────────────────────────────────────────
  const scarcity = resolveScarcityConfig(rules);

  return {
    castillitos: castillitosTextile,
    latinKids:   latinKidsTextile,
    accessories: { small: smallAcc, medium: mediumAcc, large: largeAcc },
    scarcity,
  };
}

function resolveTextileConfig(
  rules: Array<{ scope: string; line?: string; minQty: number; idealQty: number; maxQty: number; active: boolean; validFrom?: string | null; validTo?: string | null; season?: string | null; notes?: string | null }>,
  lineId: string,
  defaults: { minimumUnits: number; idealUnits: number; maximumUnits: number },
): EffectiveTextileConfig {
  const now = new Date().toISOString();
  // Look for a store-level textile override for this line
  const override = rules.find(
    r => r.active && r.scope === "line" && r.line === lineId,
  );

  if (override) {
    // Vigencia check: future rule doesn't apply yet, expired rule falls back
    if (override.validFrom && override.validFrom > now) {
      // Future rule — fall through to defaults
    } else if (override.validTo && override.validTo < now) {
      // Expired rule — fall through to defaults
    } else {
      return {
        enabled:     true,
        minUnits:    override.minQty,
        maxUnits:    override.maxQty,
        targetUnits: override.idealQty,
        validFrom:   override.validFrom ?? null,
        validTo:     override.validTo ?? null,
        season:      override.season ?? null,
        notes:       override.notes ?? null,
        source:      "store_override",
      };
    }
  }

  return {
    enabled:     true,
    minUnits:    defaults.minimumUnits,
    maxUnits:    defaults.maximumUnits,
    targetUnits: defaults.idealUnits,
    validFrom:   null,
    validTo:     null,
    season:      null,
    notes:       null,
    source:      "tenant_default",
  };
}

function resolveAccessoryConfig(
  rules: Array<{ scope: string; sizeClass?: StoreSizeClass; idealQty: number; active: boolean; validFrom?: string | null; validTo?: string | null; season?: string | null; notes?: string | null }>,
  sizeClass: StoreSizeClass,
  defaultTarget: number,
): EffectiveAccessoryConfig {
  const now = new Date().toISOString();
  const override = rules.find(
    r => r.active && r.scope === "class_size" && r.sizeClass === sizeClass,
  );

  if (override) {
    if (override.validFrom && override.validFrom > now) { /* future — fall through */ }
    else if (override.validTo && override.validTo < now) { /* expired — fall through */ }
    else {
      return {
        sizeClass,
        targetUnits: override.idealQty,
        validFrom:   override.validFrom ?? null,
        validTo:     override.validTo ?? null,
        season:      override.season ?? null,
        notes:       override.notes ?? null,
        source:      "store_override",
      };
    }
  }

  return {
    sizeClass,
    targetUnits: defaultTarget,
    validFrom:   null,
    validTo:     null,
    season:      null,
    notes:       null,
    source:      "tenant_default",
  };
}

function resolveScarcityConfig(
  rules: Array<{ scope: string; active: boolean; line?: string; minQty: number; maxQty: number }>,
): EffectiveScarcityConfig {
  // Scarcity config comes from tenant defaults (CASTILLITOS_GLOBAL_LOW_STOCK)
  // Store overrides could add/remove this store from allowed list, but that's tenant-level
  return {
    enabled:                        true,
    lowStockConcentrationThreshold: CASTILLITOS_GLOBAL_LOW_STOCK.threshold,
    allowedStoresWhenScarce:        CASTILLITOS_GLOBAL_LOW_STOCK.allowedStoreIds,
    allowedStoreNames:              CASTILLITOS_GLOBAL_LOW_STOCK.allowedStoreNames,
    validFrom:                      null,
    validTo:                        null,
    season:                         null,
    notes:                          null,
    source:                         "tenant_default",
  };
}

// ── Impact preview ────────────────────────────────────────────────────────────

/**
 * Deterministic impact preview: compares current distribution with what WOULD
 * happen if the proposed config were applied. No LLM, no side effects.
 */
export async function previewRuleImpact(
  orgId: string,
  storeId: string,
  proposedConfig: Partial<EffectiveStoreConfig>,
): Promise<RuleImpactPreview> {
  // Get current distribution for this store
  const currentDetail = await getCanonicalStoreDetail(orgId, storeId);
  if (!currentDetail) {
    return { additionalSurtir: 0, additionalUnitsNeeded: 0, resolvedDeficits: 0, newRetirar: 0 };
  }

  const currentItems = currentDetail.items;
  const currentConfig = await getEffectiveStoreConfig(orgId, storeId);

  // Merge proposed changes into current config
  const merged: EffectiveStoreConfig = {
    castillitos: proposedConfig.castillitos ?? currentConfig.castillitos,
    latinKids:   proposedConfig.latinKids ?? currentConfig.latinKids,
    accessories: proposedConfig.accessories ?? currentConfig.accessories,
    scarcity:    proposedConfig.scarcity ?? currentConfig.scarcity,
  };

  // Simulate impact on each item
  let additionalSurtir = 0;
  let additionalUnitsNeeded = 0;
  let resolvedDeficits = 0;
  let newRetirar = 0;

  for (const item of currentItems) {
    const newThresholds = getProposedThresholds(item, merged);
    if (!newThresholds) continue;

    const newDeficit = Math.max(0, newThresholds.min - item.currentUnits);
    const newExcess = Math.max(0, item.currentUnits - newThresholds.max);

    // Compare with current
    if (newDeficit > 0 && item.deficit === 0) {
      additionalSurtir++;
      additionalUnitsNeeded += newDeficit;
    } else if (newDeficit > item.deficit) {
      additionalUnitsNeeded += newDeficit - item.deficit;
    }

    if (item.deficit > 0 && newDeficit === 0) {
      resolvedDeficits++;
    }

    if (newExcess > 0 && item.excess === 0) {
      newRetirar++;
    }
  }

  return { additionalSurtir, additionalUnitsNeeded, resolvedDeficits, newRetirar };
}

function getProposedThresholds(
  item: { world: string; canonicalLine: string; sizeClass: StoreSizeClass | null },
  config: EffectiveStoreConfig,
): { min: number; max: number } | null {
  if (item.world === "TEXTILE") {
    const tc = item.canonicalLine === "latin_kids" ? config.latinKids : config.castillitos;
    return { min: tc.minUnits, max: tc.maxUnits };
  }

  if (item.world === "IMPORT" && item.sizeClass) {
    const ac = config.accessories[item.sizeClass];
    if (ac) {
      // For accessories, target = ideal, no explicit min/max in current model
      return { min: 0, max: ac.targetUnits + 1 };
    }
  }

  return null;
}

// ── Save distribution config ──────────────────────────────────────────────────

export interface SaveDistributionConfigInput {
  orgId:    string;
  storeId:  string;
  storeName: string;
  userId:   string;
  role:     Role;
  config:   Partial<EffectiveStoreConfig>;
  motivo:   string;
  source?:  "ui" | "api" | "system";
}

export interface SaveDistributionConfigResult {
  ok:               boolean;
  error?:           string;
  validationErrors?: Array<{ field: string; message: string }>;
  config?:          EffectiveStoreConfig;
}

/**
 * Save distribution config changes for a store.
 * Server-enforced: permission check → validation → persist → audit → cache invalidation.
 */
export async function saveDistributionConfig(
  input: SaveDistributionConfigInput,
): Promise<SaveDistributionConfigResult> {
  // ── Permission check (server-enforced) ────────────────────────────────
  if (!canEditDistributionConfig(input.role)) {
    return { ok: false, error: "FORBIDDEN: Se requiere rol ORG_ADMIN o superior" };
  }

  const { orgId, storeId, storeName, userId, config, motivo, source = "ui" } = input;

  // ── Server-side validation (PRIMERO) ──────────────────────────────────
  const validation = validateDistributionConfigInput(config);
  if (!validation.valid) {
    return { ok: false, error: "Validacion fallida", validationErrors: validation.errors };
  }

  // Sanitize text fields before persistence
  if (config.castillitos) {
    if (config.castillitos.season) config.castillitos.season = sanitizeText(config.castillitos.season, MAX_SEASON_LENGTH);
    if (config.castillitos.notes) config.castillitos.notes = sanitizeText(config.castillitos.notes, MAX_NOTES_LENGTH);
  }
  if (config.latinKids) {
    if (config.latinKids.season) config.latinKids.season = sanitizeText(config.latinKids.season, MAX_SEASON_LENGTH);
    if (config.latinKids.notes) config.latinKids.notes = sanitizeText(config.latinKids.notes, MAX_NOTES_LENGTH);
  }
  if (config.scarcity) {
    if (config.scarcity.season) config.scarcity.season = sanitizeText(config.scarcity.season, MAX_SEASON_LENGTH);
    if (config.scarcity.notes) config.scarcity.notes = sanitizeText(config.scarcity.notes, MAX_NOTES_LENGTH);
  }

  try {
    // Get current config for audit diff
    const currentConfig = await getEffectiveStoreConfig(orgId, storeId);
    const now = new Date().toISOString();

    // Get existing policy to preserve non-distribution rules
    const existingPolicy = await getStorePolicyByStoreId(orgId, storeId);
    const existingRules = existingPolicy?.rules ?? [];

    // Build updated rules from proposed config
    const updatedRules = buildRulesFromConfig(storeId, config, existingRules);

    // Persist via store-policy-service (single motor)
    await saveStorePolicy(orgId, {
      storeId,
      storeName,
      rules:    updatedRules,
      capacity: existingPolicy?.capacity,
      active:   existingPolicy?.active ?? true,
    });

    // Record audit entries for each changed field
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const auditEntries = buildAuditEntries(orgId, storeId, userId, input.role, requestId, source, now, currentConfig, config, motivo);
    await Promise.all(auditEntries.map(recordAuditEntry));

    // Invalidate all caches so next read picks up new config
    invalidateDistributionCacheForOrg(orgId);
    invalidateLineCountsCache(orgId);

    // Return the new effective config
    const newConfig = await getEffectiveStoreConfig(orgId, storeId);
    return { ok: true, config: newConfig };
  } catch (err) {
    console.error("[DISTRIBUTION_SAVE] Failed to save config:", err);
    return { ok: false, error: "Error al guardar configuracion" };
  }
}

// ── Build rules from effective config ─────────────────────────────────────────

function buildRulesFromConfig(
  storeId: string,
  proposed: Partial<EffectiveStoreConfig>,
  existingRules: StorePolicyRule[],
): StorePolicyRule[] {
  // Start with existing rules that are NOT being overridden
  const result: StorePolicyRule[] = [];

  // Keep rules that aren't affected by the proposed changes
  for (const rule of existingRules) {
    const isTextileOverride = rule.scope === "line" && (rule.line === "castillitos" || rule.line === "latin_kids");
    const isAccessoryOverride = rule.scope === "class_size" && rule.sizeClass;

    if (isTextileOverride && proposed.castillitos && rule.line === "castillitos") continue;
    if (isTextileOverride && proposed.latinKids && rule.line === "latin_kids") continue;
    if (isAccessoryOverride && proposed.accessories && rule.sizeClass) continue;

    result.push(rule);
  }

  // Add new/updated overrides from proposed config
  if (proposed.castillitos && proposed.castillitos.source === "store_override") {
    result.push(buildTextileRule(storeId, "castillitos", proposed.castillitos, existingRules));
  }

  if (proposed.latinKids && proposed.latinKids.source === "store_override") {
    result.push(buildTextileRule(storeId, "latin_kids", proposed.latinKids, existingRules));
  }

  if (proposed.accessories) {
    for (const sc of ["small", "medium", "large"] as StoreSizeClass[]) {
      const acc = proposed.accessories[sc];
      if (acc && acc.source === "store_override") {
        result.push(buildAccessoryRule(storeId, sc, acc, existingRules));
      }
    }
  }

  return result;
}

function buildTextileRule(
  storeId: string,
  lineId: string,
  config: EffectiveTextileConfig,
  existing: StorePolicyRule[],
): StorePolicyRule {
  const prev = existing.find(r => r.scope === "line" && r.line === lineId);
  return {
    id:                          prev?.id ?? `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    storeId,
    scope:                       "line",
    productClass:                "textile",
    line:                        lineId,
    minQty:                      config.minUnits,
    idealQty:                    config.targetUnits,
    maxQty:                      config.maxUnits,
    allowReplacement:            true,
    allowProductionSignal:       false,
    allowMainWarehouseTransfer:  true,
    priority:                    50,
    active:                      config.enabled,
    validFrom:                   config.validFrom,
    validTo:                     config.validTo,
    season:                      config.season,
    notes:                       config.notes,
  };
}

function buildAccessoryRule(
  storeId: string,
  sizeClass: StoreSizeClass,
  config: EffectiveAccessoryConfig,
  existing: StorePolicyRule[],
): StorePolicyRule {
  const prev = existing.find(r => r.scope === "class_size" && r.sizeClass === sizeClass);
  return {
    id:                          prev?.id ?? `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    storeId,
    scope:                       "class_size",
    productClass:                "accessory",
    sizeClass,
    minQty:                      0,
    idealQty:                    config.targetUnits,
    maxQty:                      config.targetUnits + 1,
    allowReplacement:            false,
    allowProductionSignal:       false,
    allowMainWarehouseTransfer:  true,
    priority:                    40,
    active:                      true,
    validFrom:                   config.validFrom,
    validTo:                     config.validTo,
    season:                      config.season,
    notes:                       config.notes,
  };
}

// ── Build audit entries ───────────────────────────────────────────────────────

function extractVigencia(obj: { validFrom?: string | null; validTo?: string | null; season?: string | null; notes?: string | null } | undefined) {
  if (!obj) return { vigencia: null, validFrom: null as string | null, validTo: null as string | null, season: null as string | null, notes: null as string | null };
  const vf = obj.validFrom ?? null;
  const vt = obj.validTo ?? null;
  return {
    vigencia: vf && vt ? `${vf} — ${vt}` : vf ? `Desde ${vf}` : vt ? `Hasta ${vt}` : null,
    validFrom: vf,
    validTo: vt,
    season: obj.season ?? null,
    notes: obj.notes ?? null,
  };
}

function buildAuditEntries(
  orgId: string,
  storeId: string,
  userId: string,
  userRole: Role,
  requestId: string,
  source: "ui" | "api" | "system",
  fecha: string,
  current: EffectiveStoreConfig,
  proposed: Partial<EffectiveStoreConfig>,
  motivo: string,
): DistributionConfigAuditEntry[] {
  const entries: DistributionConfigAuditEntry[] = [];
  const base = { organizationId: orgId, storeId, userId, userRole: String(userRole), requestId, source, fecha, motivo };

  if (proposed.castillitos) {
    const v = extractVigencia(proposed.castillitos);
    entries.push({ ...base, regla: "castillitos_textile", valorAnterior: current.castillitos, valorNuevo: proposed.castillitos, ...v });
  }

  if (proposed.latinKids) {
    const v = extractVigencia(proposed.latinKids);
    entries.push({ ...base, regla: "latin_kids_textile", valorAnterior: current.latinKids, valorNuevo: proposed.latinKids, ...v });
  }

  if (proposed.accessories) {
    for (const sc of ["small", "medium", "large"] as StoreSizeClass[]) {
      if (proposed.accessories[sc]) {
        const v = extractVigencia(proposed.accessories[sc]);
        entries.push({ ...base, regla: `accessory_${sc}`, valorAnterior: current.accessories[sc], valorNuevo: proposed.accessories[sc], ...v });
      }
    }
  }

  if (proposed.scarcity) {
    const v = extractVigencia(proposed.scarcity);
    entries.push({ ...base, regla: "scarcity_rule36", valorAnterior: current.scarcity, valorNuevo: proposed.scarcity, ...v });
  }

  return entries;
}

// Re-export for convenience
export { invalidateDistributionCacheForOrg } from "./store-distribution-service";
