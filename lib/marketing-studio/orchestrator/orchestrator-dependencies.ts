/**
 * lib/marketing-studio/orchestrator/orchestrator-dependencies.ts
 *
 * MS-17 — Unified Publishing Orchestrator: Dependency resolution engine
 *
 * Pure computation — no Prisma, no fetch, no side effects.
 */

import { randomUUID } from "crypto";
import type {
  OrchestratorPlan,
  OrchestratorBlocker,
  OrchestratorBlockerSeverity,
  OrchestratorPlanType,
  OrchestratorJobType,
} from "./orchestrator-types";

// ── Dependency map: plan type → required job types in order ───────────────────

export const PLAN_STAGE_ORDER: Record<OrchestratorPlanType, OrchestratorJobType[]> = {
  product_launch: [
    "validation",
    "asset_sync",
    "shopify_publish",
    "catalog_sync",
    "social_publish",
    "campaign_attach",
    "cleanup",
  ],
  campaign_launch: [
    "validation",
    "asset_sync",
    "campaign_attach",
    "social_publish",
    "shopify_publish",
    "whatsapp_publish",
    "cleanup",
  ],
  catalog_distribution: [
    "validation",
    "catalog_sync",
    "shopify_publish",
    "whatsapp_publish",
    "cleanup",
  ],
  social_push: [
    "validation",
    "asset_sync",
    "social_publish",
    "cleanup",
  ],
  shopify_sync: [
    "validation",
    "asset_sync",
    "shopify_publish",
    "cleanup",
  ],
  whatsapp_broadcast: [
    "validation",
    "catalog_sync",
    "whatsapp_publish",
    "cleanup",
  ],
  multi_channel_launch: [
    "validation",
    "asset_sync",
    "shopify_publish",
    "social_publish",
    "campaign_attach",
    "whatsapp_publish",
    "catalog_sync",
    "cleanup",
  ],
};

// ── Stage dependency graph: each job type depends on ─────────────────────────

export const STAGE_DEPENDENCIES: Record<OrchestratorJobType, OrchestratorJobType[]> = {
  validation:       [],
  asset_sync:       ["validation"],
  shopify_publish:  ["validation", "asset_sync"],
  social_publish:   ["validation", "asset_sync"],
  whatsapp_publish: ["validation", "catalog_sync"],
  campaign_attach:  ["validation"],
  catalog_sync:     ["validation"],
  retry:            [],
  cleanup:          ["shopify_publish", "social_publish", "whatsapp_publish", "campaign_attach", "catalog_sync"],
};

// ── Blocker detection patterns ────────────────────────────────────────────────

interface BlockerSpec {
  code:        string;
  severity:    OrchestratorBlockerSeverity;
  description: string;
  autoAction:  string | null;
}

const BLOCKER_SPECS: Record<string, BlockerSpec> = {
  missing_assets: {
    code:        "MISSING_ASSETS",
    severity:    "error",
    description: "El plan no tiene assets aprobados disponibles para publicación",
    autoAction:  "Revisar Foto Estudio y aprobar assets",
  },
  missing_variants: {
    code:        "MISSING_VARIANTS",
    severity:    "error",
    description: "El producto no tiene variantes activas en Shopify",
    autoAction:  "Sincronizar variantes desde SAG",
  },
  missing_captions: {
    code:        "MISSING_CAPTIONS",
    severity:    "warning",
    description: "Faltan captions o copy para publicaciones sociales",
    autoAction:  "Generar captions con Mila IA",
  },
  missing_availability: {
    code:        "MISSING_AVAILABILITY",
    severity:    "warning",
    description: "Sin datos de inventario o disponibilidad confirmados",
    autoAction:  "Verificar stock en SAG",
  },
  stale_campaign: {
    code:        "STALE_CAMPAIGN",
    severity:    "warning",
    description: "La campaña asociada tiene más de 7 días sin actividad",
    autoAction:  "Reactivar campaña",
  },
  auth_expired: {
    code:        "AUTH_EXPIRED",
    severity:    "error",
    description: "Las credenciales de un canal de publicación están vencidas o revocadas",
    autoAction:  "Reconectar conector en Integraciones",
  },
  sync_failure: {
    code:        "SYNC_FAILURE",
    severity:    "error",
    description: "La última sincronización con el canal externo falló",
    autoAction:  "Reintentar sincronización",
  },
};

// ── Blocker builder ───────────────────────────────────────────────────────────

function buildBlocker(
  spec:    BlockerSpec,
  planId:  string,
  stageId: string | null = null,
): OrchestratorBlocker {
  return {
    id:          randomUUID(),
    planId,
    stageId,
    severity:    spec.severity,
    code:        spec.code,
    description: spec.description,
    autoAction:  spec.autoAction,
    resolvedAt:  null,
  };
}

// ── Detect blockers from plan state ──────────────────────────────────────────

export function detectBlockers(plan: OrchestratorPlan): OrchestratorBlocker[] {
  const blockers: OrchestratorBlocker[] = [];

  // Already-tracked blockers in stages
  const failedStages = plan.stages.filter(s => s.status === "failed" || s.status === "blocked");

  for (const stage of failedStages) {
    if (stage.failedReason?.includes("auth")) {
      blockers.push(buildBlocker(BLOCKER_SPECS.auth_expired, plan.id, stage.id));
    } else if (stage.failedReason?.includes("sync")) {
      blockers.push(buildBlocker(BLOCKER_SPECS.sync_failure, plan.id, stage.id));
    } else if (stage.failedReason?.includes("asset")) {
      blockers.push(buildBlocker(BLOCKER_SPECS.missing_assets, plan.id, stage.id));
    }
  }

  // Plan-level signals from metadata
  const meta = plan.metadata;
  if (meta.missingAssets)       blockers.push(buildBlocker(BLOCKER_SPECS.missing_assets, plan.id));
  if (meta.missingVariants)     blockers.push(buildBlocker(BLOCKER_SPECS.missing_variants, plan.id));
  if (meta.missingCaptions)     blockers.push(buildBlocker(BLOCKER_SPECS.missing_captions, plan.id));
  if (meta.missingAvailability) blockers.push(buildBlocker(BLOCKER_SPECS.missing_availability, plan.id));
  if (meta.staleCampaign)       blockers.push(buildBlocker(BLOCKER_SPECS.stale_campaign, plan.id));

  return blockers;
}

// ── Can a stage execute? ──────────────────────────────────────────────────────

export function canStageExecute(
  stageType:    OrchestratorJobType,
  plan:         OrchestratorPlan,
): boolean {
  const requiredTypes = STAGE_DEPENDENCIES[stageType];
  for (const dep of requiredTypes) {
    const depStage = plan.stages.find(s => s.type === dep);
    if (!depStage || depStage.status !== "completed") return false;
  }
  return true;
}

// ── Compute dependency graph for display ──────────────────────────────────────

export interface DependencyNode {
  stageId:    string;
  type:       OrchestratorJobType;
  label:      string;
  dependsOn:  string[];
  isResolved: boolean;
}

export function computeDependencyGraph(plan: OrchestratorPlan): DependencyNode[] {
  return plan.stages.map(stage => ({
    stageId:    stage.id,
    type:       stage.type,
    label:      stage.label,
    dependsOn:  stage.dependsOn,
    isResolved: stage.status === "completed",
  }));
}

// ── Auto-advance: which stages are now ready? ─────────────────────────────────

export function computeReadyStages(plan: OrchestratorPlan): string[] {
  return plan.stages
    .filter(s => s.status === "pending" && canStageExecute(s.type, plan))
    .map(s => s.id);
}
