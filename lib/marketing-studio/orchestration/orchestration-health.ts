/**
 * lib/marketing-studio/orchestration/orchestration-health.ts
 *
 * MS-12 — Commerce Orchestration Layer: Destination Health Engine
 *
 * Pure computation — no Prisma, no fetch, no side effects.
 * Accepts already-loaded product and job snapshots.
 */

import type { ProductConsoleItem } from "../products/product-display";
import type { OrchestrationJob } from "./orchestration-types";
import type { OrgCommerceSyncSummary } from "../commerce/sync-monitor";
import {
  DESTINATION_HEALTH_LEVEL,
  SYSTEM_HEALTH_LEVEL,
  type DestinationHealth,
  type DestinationHealthLevel,
  type SystemHealthLevel,
  ORCHESTRATION_JOB_STATUS,
} from "./orchestration-types";

// ── Channel definitions ────────────────────────────────────────────────────────

interface ChannelDef {
  channel: string;
  label:   string;
}

const COMMERCE_CHANNELS: ChannelDef[] = [
  { channel: "shopify",  label: "Shopify"   },
  { channel: "catalog",  label: "Catálogo"  },
  { channel: "whatsapp", label: "WhatsApp"  },
  { channel: "ads",      label: "Ads"       },
  { channel: "crm",      label: "CRM"       },
];

// ── Health computation ─────────────────────────────────────────────────────────

export function computeDestinationHealth(
  products:    ProductConsoleItem[],
  jobs:        OrchestrationJob[],
  syncSummary: OrgCommerceSyncSummary | null,
): DestinationHealth[] {
  return COMMERCE_CHANNELS.map(({ channel, label }) => {
    const channelJobs   = jobs.filter(j => j.affectedDestinations.includes(channel));
    const activeJobs    = channelJobs.filter(j => j.status === ORCHESTRATION_JOB_STATUS.RUNNING || j.status === ORCHESTRATION_JOB_STATUS.PENDING).length;
    const failedJobs    = channelJobs.filter(j => j.status === ORCHESTRATION_JOB_STATUS.FAILED).length;
    const retryJobs     = channelJobs.filter(j => j.status === ORCHESTRATION_JOB_STATUS.RETRYING).length;

    const syncedProducts = products.filter(p =>
      p.syncSummary.some(s => s.channel === channel && s.status === "synced"),
    ).length;

    const publishedProducts = products.filter(p =>
      p.publicationSummary.some(s => s.channel === channel && s.publicationStatus === "published"),
    ).length;

    const lastActivity = channelJobs
      .map(j => j.completedAt ?? j.startedAt ?? j.createdAt)
      .sort()
      .reverse()[0] ?? null;

    // Determine health level
    let healthLevel: DestinationHealthLevel;
    let healthLabel:  string;
    let errorSummary: string | null = null;

    if (channel === "shopify" && syncSummary) {
      if (syncSummary.missingExternal > 0 || syncSummary.conflict > 0) {
        healthLevel  = DESTINATION_HEALTH_LEVEL.BLOCKED;
        healthLabel  = "Bloqueado — acción requerida";
        errorSummary = syncSummary.missingExternal > 0
          ? `${syncSummary.missingExternal} producto(s) eliminados en Shopify`
          : `${syncSummary.conflict} conflicto(s) detectado(s)`;
      } else if (syncSummary.driftDetected > 0 || syncSummary.agentikNewer > 0 || failedJobs > 0) {
        healthLevel = DESTINATION_HEALTH_LEVEL.DEGRADED;
        healthLabel = "Degradado — drift detectado";
      } else if (syncSummary.inSync > 0) {
        healthLevel = DESTINATION_HEALTH_LEVEL.HEALTHY;
        healthLabel = "Operacional";
      } else {
        healthLevel = DESTINATION_HEALTH_LEVEL.UNKNOWN;
        healthLabel = "Sin datos de sync";
      }
    } else if (failedJobs > 2) {
      healthLevel  = DESTINATION_HEALTH_LEVEL.BLOCKED;
      healthLabel  = "Bloqueado";
      errorSummary = `${failedJobs} jobs fallidos`;
    } else if (failedJobs > 0 || retryJobs > 0) {
      healthLevel = DESTINATION_HEALTH_LEVEL.DEGRADED;
      healthLabel = "Degradado";
    } else if (syncedProducts > 0 || publishedProducts > 0) {
      healthLevel = DESTINATION_HEALTH_LEVEL.HEALTHY;
      healthLabel = "Operacional";
    } else {
      healthLevel = DESTINATION_HEALTH_LEVEL.UNKNOWN;
      healthLabel = "Sin actividad";
    }

    return {
      channel,
      label,
      healthLevel,
      healthLabel,
      activeJobs,
      failedJobs,
      retryJobs,
      syncedProducts:  channel === "shopify" && syncSummary ? syncSummary.inSync : syncedProducts,
      totalProducts:   products.length,
      lastActivityAt:  lastActivity,
      errorSummary,
    };
  });
}

// ── System-level health ────────────────────────────────────────────────────────

export function computeSystemHealth(
  destinations: DestinationHealth[],
  webhookPending: number,
): { healthLevel: SystemHealthLevel; healthLabel: string } {
  const blocked  = destinations.filter(d => d.healthLevel === DESTINATION_HEALTH_LEVEL.BLOCKED).length;
  const degraded = destinations.filter(d => d.healthLevel === DESTINATION_HEALTH_LEVEL.DEGRADED).length;

  if (blocked > 0) {
    return {
      healthLevel: SYSTEM_HEALTH_LEVEL.CRITICAL,
      healthLabel: `${blocked} destino${blocked > 1 ? "s" : ""} bloqueado${blocked > 1 ? "s" : ""} — acción inmediata requerida`,
    };
  }
  if (degraded > 0 || webhookPending > 10) {
    return {
      healthLevel: SYSTEM_HEALTH_LEVEL.DEGRADED,
      healthLabel: `${degraded} destino${degraded > 1 ? "s" : ""} degradado${degraded > 1 ? "s" : ""}${webhookPending > 10 ? ` · ${webhookPending} webhooks pendientes` : ""}`,
    };
  }
  if (destinations.every(d => d.healthLevel === DESTINATION_HEALTH_LEVEL.UNKNOWN)) {
    return { healthLevel: SYSTEM_HEALTH_LEVEL.UNKNOWN, healthLabel: "Sin datos de salud disponibles" };
  }
  return { healthLevel: SYSTEM_HEALTH_LEVEL.OPERATIONAL, healthLabel: "Todos los destinos operacionales" };
}
