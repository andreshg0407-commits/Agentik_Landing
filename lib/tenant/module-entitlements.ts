/**
 * lib/tenant/module-entitlements.ts
 *
 * Tenant module entitlement service — typed Prisma models, transactional
 * activation lifecycle, commercial term history, entitlement periods.
 *
 * Sprint: AGENTIK-TENANT-MODULE-ENTITLEMENTS-BILLING-01
 *
 * Storage:
 *   TenantModule                     — current enabled/disabled state (access authority)
 *   TenantModuleCommercialTerm       — price history with non-overlapping effective periods
 *   TenantModuleEntitlementPeriod    — activation/deactivation history for billing
 *
 * Access authority:
 *   TenantModule.enabled remains the ONLY source of current access.
 *   Historical periods do NOT determine today's authorization.
 *
 * Money:
 *   All prices in integer cents. No floating-point.
 *   Currency is ISO 4217 (e.g. "COP", "USD") — no hardcoded assumption.
 *
 * Atomicity:
 *   Activation/deactivation/price-update use Prisma $transaction.
 */

import { prisma } from "@/lib/prisma";
import type { ModuleKey } from "./modules";
import { MODULE_KEYS } from "./modules";
import { getModuleCatalogEntry } from "./module-catalog";

// ── Semantic clarification ────────────────────────────────────────────────────
//
// Three independent concepts — each stored separately, each with its own authority:
//
//   TENANT_MODULE_ENABLED_SEMANTICS:
//     TenantModule.enabled is the ONLY source of CURRENT ACCESS.
//     enabled=true  → module is accessible to tenant users (subject to role gate).
//     enabled=false → module is NOT accessible, regardless of billing state.
//     Missing row   → module is NOT accessible (CLOSED BY DEFAULT).
//     WHO CONTROLS: Agentik admin (activate/deactivate operations).
//
//   ENTITLEMENT_PERIOD_SEMANTICS:
//     TenantModuleEntitlementPeriod tracks WHEN a module was active.
//     [effectiveFrom, effectiveTo) = the interval during which the module was enabled.
//     effectiveTo=null means the period is still open (currently active).
//     PURPOSE: billing history. Does NOT determine today's access.
//     IMMUTABLE: periods are closed (effectiveTo set), never deleted.
//     WHO CONTROLS: system (auto-created on activate, auto-closed on deactivate).
//
//   COMMERCIAL_TERM_SEMANTICS:
//     TenantModuleCommercialTerm tracks PRICE HISTORY over time.
//     [effectiveFrom, effectiveTo) = the interval during which a price was valid.
//     effectiveTo=null means the term is still the current price.
//     PURPOSE: billing calculation. Independent of access state.
//     A module can have a commercial term without being enabled (pre-priced).
//     Commercial terms are NOT closed on deactivation — they represent price history.
//     WHO CONTROLS: commercial admin (price update operations).

// ── Types ────────────────────────────────────────────────────────────────────

export interface CommercialTerm {
  id:                string;
  tenantModuleId:    string;
  monthlyPriceCents: number;
  currency:          string;
  effectiveFrom:     string;
  effectiveTo:       string | null;
  note:              string | null;
}

export interface EntitlementPeriod {
  id:             string;
  tenantModuleId: string;
  effectiveFrom:  string;
  effectiveTo:    string | null;
}

export interface ModuleEntitlement {
  moduleKey:          ModuleKey;
  tenantModuleId:     string | null;
  enabled:            boolean;
  /** Current commercial term (effective now). null if no term set. */
  currentTerm:        CommercialTerm | null;
  /** All commercial term periods (historical + current). */
  termHistory:        CommercialTerm[];
  /** All entitlement periods (historical + current). */
  entitlementPeriods: EntitlementPeriod[];
  /** Current active entitlement period. null if not currently active. */
  currentPeriod:      EntitlementPeriod | null;
}

export interface ActivateModuleInput {
  monthlyPriceCents: number;
  currency:          string;
  effectiveFrom?:    Date;
  note?:             string;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function toCommercialTerm(row: any): CommercialTerm {
  return {
    id:                row.id,
    tenantModuleId:    row.tenantModuleId,
    monthlyPriceCents: row.monthlyPriceCents,
    currency:          row.currency,
    effectiveFrom:     row.effectiveFrom instanceof Date ? row.effectiveFrom.toISOString() : String(row.effectiveFrom),
    effectiveTo:       row.effectiveTo instanceof Date ? row.effectiveTo.toISOString() : (row.effectiveTo ? String(row.effectiveTo) : null),
    note:              row.note ?? null,
  };
}

function toEntitlementPeriod(row: any): EntitlementPeriod {
  return {
    id:             row.id,
    tenantModuleId: row.tenantModuleId,
    effectiveFrom:  row.effectiveFrom instanceof Date ? row.effectiveFrom.toISOString() : String(row.effectiveFrom),
    effectiveTo:    row.effectiveTo instanceof Date ? row.effectiveTo.toISOString() : (row.effectiveTo ? String(row.effectiveTo) : null),
  };
}

/** Find the term effective at a given instant. */
function findEffectiveTerm(terms: CommercialTerm[], at: Date): CommercialTerm | null {
  const ts = at.getTime();
  return terms.find(t => {
    const from = new Date(t.effectiveFrom).getTime();
    const to = t.effectiveTo ? new Date(t.effectiveTo).getTime() : Infinity;
    return ts >= from && ts < to;
  }) ?? null;
}

/** Find the entitlement period active at a given instant. */
function findActivePeriod(periods: EntitlementPeriod[], at: Date): EntitlementPeriod | null {
  const ts = at.getTime();
  return periods.find(p => {
    const from = new Date(p.effectiveFrom).getTime();
    const to = p.effectiveTo ? new Date(p.effectiveTo).getTime() : Infinity;
    return ts >= from && ts < to;
  }) ?? null;
}

// ── Entitlement queries ──────────────────────────────────────────────────────

/**
 * Returns full entitlement state for all modules for an org.
 */
export async function getEntitlements(
  organizationId: string,
): Promise<ModuleEntitlement[]> {
  const rows = await (prisma as any).tenantModule.findMany({
    where: { organizationId },
    include: {
      commercialTerms:    { orderBy: { effectiveFrom: "asc" } },
      entitlementPeriods: { orderBy: { effectiveFrom: "asc" } },
    },
  });

  const rowMap = new Map<string, any>(rows.map((r: any) => [r.moduleKey, r]));
  const now = new Date();

  return MODULE_KEYS.map((key): ModuleEntitlement => {
    const row = rowMap.get(key);
    if (!row) {
      // CLOSED BY DEFAULT: missing row = NOT ENABLED.
      return {
        moduleKey: key,
        tenantModuleId: null,
        enabled: false,
        currentTerm: null,
        termHistory: [],
        entitlementPeriods: [],
        currentPeriod: null,
      };
    }

    const terms = (row.commercialTerms ?? []).map(toCommercialTerm);
    const periods = (row.entitlementPeriods ?? []).map(toEntitlementPeriod);

    return {
      moduleKey:          key,
      tenantModuleId:     row.id,
      enabled:            row.enabled,
      currentTerm:        findEffectiveTerm(terms, now),
      termHistory:        terms,
      entitlementPeriods: periods,
      currentPeriod:      findActivePeriod(periods, now),
    };
  });
}

/**
 * Returns entitlement for a single module.
 */
export async function getEntitlement(
  organizationId: string,
  moduleKey: ModuleKey,
): Promise<ModuleEntitlement> {
  const row = await (prisma as any).tenantModule.findUnique({
    where: { organizationId_moduleKey: { organizationId, moduleKey } },
    include: {
      commercialTerms:    { orderBy: { effectiveFrom: "asc" } },
      entitlementPeriods: { orderBy: { effectiveFrom: "asc" } },
    },
  });

  if (!row) {
    // CLOSED BY DEFAULT: missing row = NOT ENABLED.
    return {
      moduleKey,
      tenantModuleId: null,
      enabled: false,
      currentTerm: null,
      termHistory: [],
      entitlementPeriods: [],
      currentPeriod: null,
    };
  }

  const now = new Date();
  const terms = (row.commercialTerms ?? []).map(toCommercialTerm);
  const periods = (row.entitlementPeriods ?? []).map(toEntitlementPeriod);

  return {
    moduleKey,
    tenantModuleId: row.id,
    enabled: row.enabled,
    currentTerm: findEffectiveTerm(terms, now),
    termHistory: terms,
    entitlementPeriods: periods,
    currentPeriod: findActivePeriod(periods, now),
  };
}

// ── Activation / deactivation (transactional) ────────────────────────────────

/**
 * Activates a module with commercial terms. Atomic transaction:
 *   1. Upserts TenantModule (enabled=true)
 *   2. Creates TenantModuleCommercialTerm (closing previous open term)
 *   3. Opens TenantModuleEntitlementPeriod
 *
 * Idempotent: if already active, still creates new commercial term if provided.
 */
export async function activateModule(
  organizationId: string,
  moduleKey:      ModuleKey,
  input:          ActivateModuleInput,
): Promise<ModuleEntitlement> {
  const now = input.effectiveFrom ?? new Date();

  await (prisma as any).$transaction(async (tx: any) => {
    // 1. Upsert TenantModule
    const tm = await tx.tenantModule.upsert({
      where:  { organizationId_moduleKey: { organizationId, moduleKey } },
      create: { organizationId, moduleKey, enabled: true },
      update: { enabled: true },
    });

    // 2. Close any open commercial term
    await tx.tenantModuleCommercialTerm.updateMany({
      where: { tenantModuleId: tm.id, effectiveTo: null },
      data:  { effectiveTo: now },
    });

    // 3. Create new commercial term
    await tx.tenantModuleCommercialTerm.create({
      data: {
        tenantModuleId:    tm.id,
        monthlyPriceCents: input.monthlyPriceCents,
        currency:          input.currency,
        effectiveFrom:     now,
        effectiveTo:       null,
        note:              input.note ?? null,
      },
    });

    // 4. Close any open entitlement period (in case of re-activation)
    await tx.tenantModuleEntitlementPeriod.updateMany({
      where: { tenantModuleId: tm.id, effectiveTo: null },
      data:  { effectiveTo: now },
    });

    // 5. Open new entitlement period
    await tx.tenantModuleEntitlementPeriod.create({
      data: {
        tenantModuleId: tm.id,
        effectiveFrom:  now,
        effectiveTo:    null,
      },
    });
  });

  return getEntitlement(organizationId, moduleKey);
}

/**
 * Deactivates a module. Atomic transaction:
 *   1. Sets TenantModule.enabled = false
 *   2. Closes current entitlement period
 *
 * Idempotent. Data preserved — never deletes.
 * Commercial terms are NOT closed (they represent price history, not access).
 */
export async function deactivateModule(
  organizationId: string,
  moduleKey:      ModuleKey,
): Promise<ModuleEntitlement> {
  const now = new Date();

  await (prisma as any).$transaction(async (tx: any) => {
    const tm = await tx.tenantModule.upsert({
      where:  { organizationId_moduleKey: { organizationId, moduleKey } },
      create: { organizationId, moduleKey, enabled: false },
      update: { enabled: false },
    });

    // Close any open entitlement period
    await tx.tenantModuleEntitlementPeriod.updateMany({
      where: { tenantModuleId: tm.id, effectiveTo: null },
      data:  { effectiveTo: now },
    });
  });

  return getEntitlement(organizationId, moduleKey);
}

/**
 * Updates commercial price for an active module. Atomic transaction:
 *   1. Closes current commercial term
 *   2. Opens new term with new price
 *
 * Does NOT change enabled state.
 * Previous term's effectiveTo = new term's effectiveFrom (no gap, no overlap).
 */
export async function updateModulePrice(
  organizationId: string,
  moduleKey:      ModuleKey,
  input:          ActivateModuleInput,
): Promise<ModuleEntitlement> {
  const now = input.effectiveFrom ?? new Date();

  await (prisma as any).$transaction(async (tx: any) => {
    const tm = await tx.tenantModule.findUnique({
      where: { organizationId_moduleKey: { organizationId, moduleKey } },
    });
    if (!tm) throw new Error(`TenantModule not found: ${moduleKey}`);

    // Close current open term
    await tx.tenantModuleCommercialTerm.updateMany({
      where: { tenantModuleId: tm.id, effectiveTo: null },
      data:  { effectiveTo: now },
    });

    // Create new term
    await tx.tenantModuleCommercialTerm.create({
      data: {
        tenantModuleId:    tm.id,
        monthlyPriceCents: input.monthlyPriceCents,
        currency:          input.currency,
        effectiveFrom:     now,
        effectiveTo:       null,
        note:              input.note ?? null,
      },
    });
  });

  return getEntitlement(organizationId, moduleKey);
}

// ── Historical query helpers ─────────────────────────────────────────────────

/**
 * Returns the commercial term effective for a module at a specific date.
 * Used by billing preview for historical months.
 */
export async function getTermAtDate(
  organizationId: string,
  moduleKey:      ModuleKey,
  at:             Date,
): Promise<CommercialTerm | null> {
  const ent = await getEntitlement(organizationId, moduleKey);
  return findEffectiveTerm(ent.termHistory, at);
}

/**
 * Returns the entitlement period active for a module at a specific date.
 * Used by billing preview to determine if module was billable in a given month.
 */
export async function getPeriodAtDate(
  organizationId: string,
  moduleKey:      ModuleKey,
  at:             Date,
): Promise<EntitlementPeriod | null> {
  const ent = await getEntitlement(organizationId, moduleKey);
  return findActivePeriod(ent.entitlementPeriods, at);
}

// Re-export for convenience
export { findEffectiveTerm, findActivePeriod };
