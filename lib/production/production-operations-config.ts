/**
 * production-operations-config.ts
 *
 * PRODUCTION-OPERATIONS-WORKSPACE-HARDENING-01 — Tenant-Aware Config Resolver.
 *
 * Encapsulates SAG/Castillitos-specific configuration that was previously
 * hardcoded in production-operations-service.ts.
 *
 * No React. No Prisma. No server-only. Pure config resolution.
 */

import type {
  ProductionTimelineSourceConfig,
  ProductionTimelineStageConfig,
} from "@/lib/production-timeline/production-timeline-types";
import {
  SAG_PYA_SOURCE_CONFIG,
  CASTILLITOS_STAGE_CONFIG,
  DEFAULT_SOURCE_CONFIG,
  DEFAULT_STAGE_CONFIG,
} from "@/lib/production-timeline/production-timeline-types";
import type { ProductionProfileId } from "@/lib/production-stages/production-stage-types";

// ── Config Shape ────────────────────────────────────────────────────────────

export interface ProductionOperationsConfig {
  /** Source config for timeline loading. */
  sourceConfig: ProductionTimelineSourceConfig;
  /** Stage config for readiness assessment. */
  stageConfig: ProductionTimelineStageConfig;
  /** Connector source key for last-sync queries. */
  connectorSource: string;
  /** Production profile for stage activation. */
  profileId: ProductionProfileId;
  /** Default date range in days (only orders with events within this window). */
  defaultRangeDays: number;
}

// ── Tenant Registry ─────────────────────────────────────────────────────────

const TENANT_CONFIGS: Record<string, ProductionOperationsConfig> = {
  castillitos: {
    sourceConfig: SAG_PYA_SOURCE_CONFIG,
    stageConfig: CASTILLITOS_STAGE_CONFIG,
    connectorSource: "sag_pya_soap",
    profileId: "textile_full",
    defaultRangeDays: 365,
  },
};

const DEFAULT_CONFIG: ProductionOperationsConfig = {
  sourceConfig: DEFAULT_SOURCE_CONFIG,
  stageConfig: DEFAULT_STAGE_CONFIG,
  connectorSource: "",
  profileId: "custom",
  defaultRangeDays: 365,
};

// ── Resolver ────────────────────────────────────────────────────────────────

/** Resolve production operations config for a given tenant. */
export function resolveProductionOperationsConfig(
  orgSlug: string,
): ProductionOperationsConfig {
  return TENANT_CONFIGS[orgSlug] ?? DEFAULT_CONFIG;
}
