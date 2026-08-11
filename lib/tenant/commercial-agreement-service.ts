/**
 * lib/tenant/commercial-agreement-service.ts
 *
 * Commercial agreement lifecycle service.
 *
 * Sprint: AGENTIK-CUSTOM-COMMERCIAL-AGREEMENTS-01
 *
 * CRITICAL BILLING RULES:
 *   - Bundle-covered module commercial terms are NEVER mutated.
 *   - A module's individual TenantModuleCommercialTerm retains its real price.
 *   - Billing preview suppresses individual charges for covered modules.
 *   - BUNDLE_MODULE_PRICE_MUTATED = false (enforced by design).
 *
 * ENTITLEMENT SEPARATION:
 *   - Creating an agreement does NOT enable/disable TenantModule.
 *   - Agreement answers: "is this module's charge covered by the bundle?"
 *   - TenantModule answers: "can the tenant use this module?"
 *
 * HISTORY:
 *   - Agreements are effective-dated and never destructively deleted.
 *   - Changing terms = close old agreement (set effectiveTo) + create new one.
 *   - FK deletion policy: RESTRICT (cannot delete org with agreement history).
 */

import { prisma } from "@/lib/prisma";
import type { ModuleKey } from "./modules";
import type {
  CommercialAgreement,
  CommercialAgreementFull,
  CreateAgreementInput,
  UsageLimitMetricKey,
  UsageLimitPolicy,
  UsageLimitCheckResult,
} from "./commercial-agreement-types";
import { USAGE_METRIC_READINESS } from "./commercial-agreement-types";

// ── Queries ────────────────────────────────────────────────────────────────

/**
 * Returns the ACTIVE agreement for an org effective at a given date.
 * Returns null if no active agreement exists.
 */
export async function getActiveAgreement(
  organizationId: string,
  at?: Date,
): Promise<CommercialAgreementFull | null> {
  const now = at ?? new Date();

  const row = await (prisma as any).tenantCommercialAgreement.findFirst({
    where: {
      organizationId,
      status: "ACTIVE",
      effectiveFrom: { lte: now },
      OR: [
        { effectiveTo: null },
        { effectiveTo: { gt: now } },
      ],
    },
    include: {
      modules: true,
      usageLimits: true,
    },
    orderBy: { effectiveFrom: "desc" },
  });

  if (!row) return null;
  return mapAgreementRow(row);
}

/**
 * Returns the agreement effective for a specific billing month (YYYY-MM).
 * Used by billing preview for historical month calculations.
 */
export async function getAgreementForMonth(
  organizationId: string,
  period: string,
): Promise<CommercialAgreementFull | null> {
  const [yearStr, monthStr] = period.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1;
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 1);

  const row = await (prisma as any).tenantCommercialAgreement.findFirst({
    where: {
      organizationId,
      status: { in: ["ACTIVE", "EXPIRED", "SUPERSEDED"] },
      effectiveFrom: { lt: monthEnd },
      OR: [
        { effectiveTo: null },
        { effectiveTo: { gt: monthStart } },
      ],
    },
    include: {
      modules: true,
      usageLimits: true,
    },
    orderBy: { effectiveFrom: "desc" },
  });

  if (!row) return null;
  return mapAgreementRow(row);
}

/**
 * Returns all agreements for an org (including historical).
 */
export async function listAgreements(
  organizationId: string,
): Promise<CommercialAgreementFull[]> {
  const rows = await (prisma as any).tenantCommercialAgreement.findMany({
    where: { organizationId },
    include: {
      modules: true,
      usageLimits: true,
    },
    orderBy: { effectiveFrom: "desc" },
  });

  return rows.map(mapAgreementRow);
}

/**
 * Returns the set of module keys covered by the active agreement.
 * Empty set if no active agreement.
 */
export async function getCoveredModuleKeys(
  organizationId: string,
  at?: Date,
): Promise<Set<ModuleKey>> {
  const agreement = await getActiveAgreement(organizationId, at);
  if (!agreement) return new Set();
  return new Set(agreement.modules.map(m => m.moduleKey as ModuleKey));
}

// ── Mutations ──────────────────────────────────────────────────────────────

/**
 * Creates a new commercial agreement.
 *
 * DOES NOT:
 *   - Enable/disable TenantModule rows (entitlement is separate)
 *   - Mutate TenantModuleCommercialTerm prices (BUNDLE_MODULE_PRICE_MUTATED = false)
 *   - Close existing agreements (caller must do this explicitly)
 */
export async function createAgreement(
  input: CreateAgreementInput,
): Promise<CommercialAgreementFull> {
  const row = await (prisma as any).tenantCommercialAgreement.create({
    data: {
      organizationId: input.organizationId,
      agreementType: input.agreementType,
      monthlyPriceCents: input.monthlyPriceCents,
      currency: input.currency,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo ?? null,
      status: "ACTIVE",
      note: input.note ?? null,
      modules: {
        create: input.includedModuleKeys.map(key => ({ moduleKey: key })),
      },
      usageLimits: input.usageLimits
        ? {
            create: input.usageLimits.map(ul => ({
              metricKey: ul.metricKey,
              includedQuantity: ul.includedQuantity,
              policy: ul.policy,
              overagePriceCents: ul.overagePriceCents ?? null,
              overageCurrency: ul.overageCurrency ?? null,
            })),
          }
        : undefined,
    },
    include: {
      modules: true,
      usageLimits: true,
    },
  });

  return mapAgreementRow(row);
}

/**
 * Supersedes an existing agreement by closing it and creating a new version.
 *
 * The old agreement gets status=SUPERSEDED and effectiveTo=newEffectiveFrom.
 * Historical billing previews remain stable because they query by date overlap.
 */
export async function supersededAgreement(
  existingAgreementId: string,
  newInput: CreateAgreementInput,
): Promise<CommercialAgreementFull> {
  return await (prisma as any).$transaction(async (tx: any) => {
    // Close old agreement
    await tx.tenantCommercialAgreement.update({
      where: { id: existingAgreementId },
      data: {
        status: "SUPERSEDED",
        effectiveTo: newInput.effectiveFrom,
      },
    });

    // Create new agreement
    const row = await tx.tenantCommercialAgreement.create({
      data: {
        organizationId: newInput.organizationId,
        agreementType: newInput.agreementType,
        monthlyPriceCents: newInput.monthlyPriceCents,
        currency: newInput.currency,
        effectiveFrom: newInput.effectiveFrom,
        effectiveTo: newInput.effectiveTo ?? null,
        status: "ACTIVE",
        note: newInput.note ?? null,
        modules: {
          create: newInput.includedModuleKeys.map(key => ({ moduleKey: key })),
        },
        usageLimits: newInput.usageLimits
          ? {
              create: newInput.usageLimits.map(ul => ({
                metricKey: ul.metricKey,
                includedQuantity: ul.includedQuantity,
                policy: ul.policy,
              })),
            }
          : undefined,
      },
      include: {
        modules: true,
        usageLimits: true,
      },
    });

    return mapAgreementRow(row);
  });
}

/**
 * Expires an agreement (sets effectiveTo to now, status to EXPIRED).
 * Does NOT touch entitlements or module prices.
 */
export async function expireAgreement(
  agreementId: string,
): Promise<CommercialAgreement> {
  const row = await (prisma as any).tenantCommercialAgreement.update({
    where: { id: agreementId },
    data: {
      status: "EXPIRED",
      effectiveTo: new Date(),
    },
  });

  return mapAgreementRow(row);
}

// ── Usage limit checks ─────────────────────────────────────────────────────

/**
 * Evaluates whether a proposed usage increment is within the agreement's limits.
 *
 * Returns deterministic status:
 *   WITHIN_ALLOWANCE   — current + proposed <= included
 *   LIMIT_EXCEEDED     — current + proposed > included (includes overage info)
 *   TRACKING_NOT_READY — no reliable counter for this contractual unit
 *   NO_LIMIT_DEFINED   — no limit for this metric in the active agreement
 *
 * IMPORTANT: This is a USAGE EVALUATION function.
 * It does NOT block product execution automatically.
 * Enforcement (hard blocking) is a separate concern.
 */
export async function checkUsageLimit(
  organizationId: string,
  metricKey: UsageLimitMetricKey,
  proposedUsage: number,
): Promise<UsageLimitCheckResult> {
  const readiness = USAGE_METRIC_READINESS[metricKey];

  const agreement = await getActiveAgreement(organizationId);
  const limit = agreement?.usageLimits.find(ul => ul.metricKey === metricKey);

  if (!limit) {
    return {
      metricKey,
      status: "NO_LIMIT_DEFINED",
      allowed: true,
      currentUsage: 0,
      includedQuantity: Infinity,
      remaining: Infinity,
      policy: "ADVISORY",
      trackingReadiness: readiness,
      overage: null,
    };
  }

  if (readiness === "TRACKING_NOT_READY") {
    // Cannot evaluate — no reliable counter exists for this contractual unit.
    // currentUsage=0 is NOT certified zero — it is absence of measurement.
    return {
      metricKey,
      status: "TRACKING_NOT_READY",
      allowed: true,
      currentUsage: 0,
      includedQuantity: limit.includedQuantity,
      remaining: limit.includedQuantity,
      policy: limit.policy as UsageLimitPolicy,
      trackingReadiness: "TRACKING_NOT_READY",
      overage: null,
    };
  }

  const currentUsage = await getCurrentUsage(organizationId, metricKey);
  const remaining = Math.max(0, limit.includedQuantity - currentUsage);
  const wouldExceed = (currentUsage + proposedUsage) > limit.includedQuantity;

  const allowed = limit.policy === "HARD_CAP" ? !wouldExceed : true;

  let overage: UsageLimitCheckResult["overage"] = null;
  if (wouldExceed && limit.overagePriceCents != null && limit.overageCurrency) {
    const excessUnits = (currentUsage + proposedUsage) - limit.includedQuantity;
    overage = {
      excessUnits,
      overagePriceCents: limit.overagePriceCents,
      overageCurrency: limit.overageCurrency,
      overageTotalCents: excessUnits * limit.overagePriceCents,
    };
  }

  return {
    metricKey,
    status: wouldExceed ? "LIMIT_EXCEEDED" : "WITHIN_ALLOWANCE",
    allowed,
    currentUsage,
    includedQuantity: limit.includedQuantity,
    remaining,
    policy: limit.policy as UsageLimitPolicy,
    trackingReadiness: readiness,
    overage,
  };
}

// ── Usage counters ─────────────────────────────────────────────────────────

/**
 * Reads current monthly usage for a metric.
 * Only implemented for metrics with PRODUCTION_READY or COUNTER_EXISTS readiness.
 *
 * CONTRACTUAL UNIT INTEGRITY:
 *   ai_videos_monthly uses video COUNT — but no video-count field exists in DB.
 *   Only videoSeconds exists. videoSeconds ≠ video count.
 *   Therefore ai_videos_monthly falls through to TRACKING_NOT_READY.
 */
async function getCurrentUsage(
  organizationId: string,
  metricKey: UsageLimitMetricKey,
): Promise<number> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  switch (metricKey) {
    case "ai_credits_monthly": {
      const balance = await prisma.aiCreditBalance.findFirst({
        where: { organizationId },
        select: { totalDebited: true },
      });
      return Math.abs(balance?.totalDebited ?? 0);
    }

    case "image_units_monthly": {
      const result = await (prisma as any).aiUsage.aggregate({
        where: {
          organizationId,
          usageKind: "IMAGE_GENERATION",
          createdAt: { gte: monthStart, lt: monthEnd },
          status: { not: "VOIDED" },
        },
        _sum: { imageUnits: true },
      });
      return result._sum?.imageUnits ?? 0;
    }

    case "video_seconds_monthly": {
      // INTERNAL metric only — measures seconds, NOT video count.
      // Never used for contractual ai_videos_monthly.
      const result = await (prisma as any).aiUsage.aggregate({
        where: {
          organizationId,
          usageKind: "VIDEO_GENERATION",
          createdAt: { gte: monthStart, lt: monthEnd },
          status: { not: "VOIDED" },
        },
        _sum: { videoSeconds: true },
      });
      return result._sum?.videoSeconds ?? 0;
    }

    case "automation_executions_monthly": {
      const count = await (prisma as any).workExecution.count({
        where: {
          organizationId,
          createdAt: { gte: monthStart, lt: monthEnd },
        },
      });
      return count;
    }

    // Contractual metrics with no reliable counter:
    case "ai_videos_monthly":              // contract = video COUNT; DB only has videoSeconds
    case "ai_chat_queries_monthly":        // contract = queries; DB has ai_credits (different unit)
    case "whatsapp_conversations_monthly": // contract = conversations; no conversation counter
    case "whatsapp_messages_monthly":
    case "accounting_documents_monthly":   // no document counter
    case "storage_gb":
      return 0; // TRACKING_NOT_READY — honest absence, not certified zero
  }
}

// ── Mapper ─────────────────────────────────────────────────────────────────

function mapAgreementRow(row: any): CommercialAgreementFull {
  return {
    id: row.id,
    organizationId: row.organizationId,
    agreementType: row.agreementType,
    monthlyPriceCents: row.monthlyPriceCents,
    currency: row.currency,
    effectiveFrom: row.effectiveFrom instanceof Date ? row.effectiveFrom.toISOString() : row.effectiveFrom,
    effectiveTo: row.effectiveTo instanceof Date ? row.effectiveTo.toISOString() : row.effectiveTo ?? null,
    status: row.status,
    note: row.note ?? null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
    modules: (row.modules ?? []).map((m: any) => ({
      id: m.id,
      agreementId: m.agreementId,
      moduleKey: m.moduleKey,
    })),
    usageLimits: (row.usageLimits ?? []).map((ul: any) => ({
      id: ul.id,
      agreementId: ul.agreementId,
      metricKey: ul.metricKey,
      includedQuantity: ul.includedQuantity,
      policy: ul.policy,
      overagePriceCents: ul.overagePriceCents ?? null,
      overageCurrency: ul.overageCurrency ?? null,
    })),
  };
}
