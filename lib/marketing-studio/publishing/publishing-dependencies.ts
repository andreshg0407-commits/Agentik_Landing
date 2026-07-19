/**
 * lib/marketing-studio/publishing/publishing-dependencies.ts
 *
 * MS-17 — Unified Publishing OS: Dependency resolution engine
 *
 * Pure functions. No Prisma. No async.
 */

import {
  PUBLISHING_DEPENDENCY_TYPE,
  PUBLISHING_DESTINATION,
  type PublishingDependency,
  type PublishingPlanStep,
  type PublishingDependencyType,
  type PublishingDestination,
} from "./publishing-types";

// ── Required dependency specs per destination ─────────────────────────────────

const DESTINATION_DEPENDENCIES: Record<PublishingDestination, PublishingDependencyType[]> = {
  [PUBLISHING_DESTINATION.SHOPIFY]:   ["product_ready", "asset_ready"],
  [PUBLISHING_DESTINATION.INSTAGRAM]: ["variant_ready", "asset_ready", "auth_connected"],
  [PUBLISHING_DESTINATION.FACEBOOK]:  ["variant_ready", "asset_ready", "auth_connected"],
  [PUBLISHING_DESTINATION.TIKTOK]:    ["variant_ready", "asset_ready", "auth_connected"],
  [PUBLISHING_DESTINATION.WHATSAPP]:  ["catalog_ready", "auth_connected"],
  [PUBLISHING_DESTINATION.YOUTUBE]:   ["variant_ready", "asset_ready", "auth_connected"],
  [PUBLISHING_DESTINATION.LANDING]:   ["product_ready", "shopify_published"],
  [PUBLISHING_DESTINATION.CATALOG]:   ["product_ready"],
  [PUBLISHING_DESTINATION.ADS]:       ["variant_ready", "campaign_ready", "shopify_published"],
  [PUBLISHING_DESTINATION.EMAIL]:     ["catalog_ready", "campaign_ready"],
};

// ── Dependency descriptions ───────────────────────────────────────────────────

const DEPENDENCY_DESCRIPTION: Record<PublishingDependencyType, string> = {
  product_ready:     "Producto con SKU, precio e imagen principal",
  asset_ready:       "Asset generado y aprobado",
  variant_ready:     "Variante de distribución con ratio correcto",
  catalog_ready:     "Catálogo publicado y sincronizado",
  shopify_published: "Producto publicado en Shopify",
  campaign_ready:    "Campaña configurada y activa",
  auth_connected:    "Integración de canal autenticada",
  schedule_due:      "Fecha/hora de publicación alcanzada",
};

// ── Builders ──────────────────────────────────────────────────────────────────

export function buildRequiredDependencies(
  destination: PublishingDestination,
  context: {
    productId?:   string | null;
    assetId?:     string | null;
    campaignId?:  string | null;
    catalogId?:   string | null;
    scheduledAt?: string | null;
  } = {},
): PublishingDependency[] {
  const types = DESTINATION_DEPENDENCIES[destination] ?? [];

  return types.map(type => ({
    type,
    entityId:    resolveEntityId(type, context),
    description: DEPENDENCY_DESCRIPTION[type],
    isResolved:  false,
    resolvedAt:  null,
  }));
}

function resolveEntityId(
  type: PublishingDependencyType,
  ctx: { productId?: string | null; assetId?: string | null; campaignId?: string | null; catalogId?: string | null },
): string | null {
  switch (type) {
    case "product_ready":
    case "shopify_published":   return ctx.productId ?? null;
    case "asset_ready":
    case "variant_ready":       return ctx.assetId   ?? null;
    case "campaign_ready":      return ctx.campaignId ?? null;
    case "catalog_ready":       return ctx.catalogId  ?? null;
    default:                    return null;
  }
}

// ── Resolution ────────────────────────────────────────────────────────────────

export function resolvePublishingDependencies(
  deps: PublishingDependency[],
  resolvedTypes: PublishingDependencyType[],
): PublishingDependency[] {
  const now = new Date().toISOString();
  return deps.map(dep => {
    if (!dep.isResolved && (resolvedTypes as string[]).includes(dep.type)) {
      return { ...dep, isResolved: true, resolvedAt: now };
    }
    return dep;
  });
}

export function detectBlockedSteps(steps: PublishingPlanStep[]): PublishingPlanStep[] {
  return steps.filter(s => s.isBlocked);
}

export function canExecutePublishingStep(step: PublishingPlanStep): boolean {
  return step.dependencies.every(d => d.isResolved);
}

export function computeDependencyGraph(steps: PublishingPlanStep[]): Map<string, string[]> {
  const graph = new Map<string, string[]>();

  for (const step of steps) {
    const blockedBy: string[] = [];
    for (const dep of step.dependencies) {
      if (!dep.isResolved && dep.type === "shopify_published") {
        // Find the shopify step in the plan
        const shopifyStep = steps.find(s => s.destination === "shopify" && s.status !== "published");
        if (shopifyStep) blockedBy.push(shopifyStep.id);
      }
    }
    graph.set(step.id, blockedBy);
  }

  return graph;
}

export function getUnresolvedDependencies(deps: PublishingDependency[]): PublishingDependency[] {
  return deps.filter(d => !d.isResolved);
}

export function computeStepBlockers(step: PublishingPlanStep): string[] {
  return step.dependencies
    .filter(d => !d.isResolved)
    .map(d => d.description);
}
