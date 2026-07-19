/**
 * lib/marketing-studio/orchestration/orchestration-display.ts
 *
 * MS-12 — Commerce Orchestration Layer: Display Helpers
 *
 * Labels, colors, and icons for job types, health levels, and statuses.
 * Pure lookup functions — no computation, no side effects.
 */

import type {
  OrchestrationJobType,
  OrchestrationJobStatus,
  DestinationHealthLevel,
  SystemHealthLevel,
  OrchestrationRecommendedAction,
} from "./orchestration-types";
import {
  ORCHESTRATION_JOB_TYPE,
  ORCHESTRATION_JOB_STATUS,
  DESTINATION_HEALTH_LEVEL,
  SYSTEM_HEALTH_LEVEL,
} from "./orchestration-types";

// ── Job type labels ────────────────────────────────────────────────────────────

export const JOB_TYPE_LABELS: Record<OrchestrationJobType, string> = {
  [ORCHESTRATION_JOB_TYPE.SYNC_SHOPIFY]:            "Sync Shopify",
  [ORCHESTRATION_JOB_TYPE.REBUILD_CATALOG]:          "Reconstruir Catálogo",
  [ORCHESTRATION_JOB_TYPE.GENERATE_VARIANTS]:        "Generar Variantes",
  [ORCHESTRATION_JOB_TYPE.GENERATE_SOCIAL_ASSETS]:   "Generar Assets Sociales",
  [ORCHESTRATION_JOB_TYPE.UPDATE_WHATSAPP]:          "Actualizar WhatsApp",
  [ORCHESTRATION_JOB_TYPE.PUBLISH_PRODUCT]:          "Publicar Producto",
  [ORCHESTRATION_JOB_TYPE.RETRY_SYNC]:               "Reintentar Sync",
  [ORCHESTRATION_JOB_TYPE.RECALCULATE_READINESS]:    "Recalcular Readiness",
  [ORCHESTRATION_JOB_TYPE.REFRESH_RECOMMENDATIONS]:  "Actualizar Recomendaciones",
};

// ── Job type icons (emoji-free: use text symbols) ─────────────────────────────

export const JOB_TYPE_ICONS: Record<OrchestrationJobType, string> = {
  [ORCHESTRATION_JOB_TYPE.SYNC_SHOPIFY]:            "↔",
  [ORCHESTRATION_JOB_TYPE.REBUILD_CATALOG]:          "▦",
  [ORCHESTRATION_JOB_TYPE.GENERATE_VARIANTS]:        "+",
  [ORCHESTRATION_JOB_TYPE.GENERATE_SOCIAL_ASSETS]:   "◈",
  [ORCHESTRATION_JOB_TYPE.UPDATE_WHATSAPP]:          "◉",
  [ORCHESTRATION_JOB_TYPE.PUBLISH_PRODUCT]:          "↑",
  [ORCHESTRATION_JOB_TYPE.RETRY_SYNC]:               "↺",
  [ORCHESTRATION_JOB_TYPE.RECALCULATE_READINESS]:    "◎",
  [ORCHESTRATION_JOB_TYPE.REFRESH_RECOMMENDATIONS]:  "≡",
};

// ── Job status labels ──────────────────────────────────────────────────────────

export const JOB_STATUS_LABELS: Record<OrchestrationJobStatus, string> = {
  [ORCHESTRATION_JOB_STATUS.PENDING]:   "Pendiente",
  [ORCHESTRATION_JOB_STATUS.RUNNING]:   "En ejecución",
  [ORCHESTRATION_JOB_STATUS.SUCCEEDED]: "Completado",
  [ORCHESTRATION_JOB_STATUS.FAILED]:    "Fallido",
  [ORCHESTRATION_JOB_STATUS.RETRYING]:  "Reintentando",
  [ORCHESTRATION_JOB_STATUS.CANCELLED]: "Cancelado",
  [ORCHESTRATION_JOB_STATUS.STALE]:     "Estancado",
};

// ── Job status CSS variant names ───────────────────────────────────────────────
// Maps to ag-op-status--{variant} classes

export const JOB_STATUS_VARIANT: Record<OrchestrationJobStatus, string> = {
  [ORCHESTRATION_JOB_STATUS.PENDING]:   "warning",
  [ORCHESTRATION_JOB_STATUS.RUNNING]:   "info",
  [ORCHESTRATION_JOB_STATUS.SUCCEEDED]: "ok",
  [ORCHESTRATION_JOB_STATUS.FAILED]:    "critical",
  [ORCHESTRATION_JOB_STATUS.RETRYING]:  "warning",
  [ORCHESTRATION_JOB_STATUS.CANCELLED]: "neutral",
  [ORCHESTRATION_JOB_STATUS.STALE]:     "warning",
};

// ── Destination health labels ──────────────────────────────────────────────────

export const DEST_HEALTH_LABELS: Record<DestinationHealthLevel, string> = {
  [DESTINATION_HEALTH_LEVEL.HEALTHY]:  "Operacional",
  [DESTINATION_HEALTH_LEVEL.DEGRADED]: "Degradado",
  [DESTINATION_HEALTH_LEVEL.BLOCKED]:  "Bloqueado",
  [DESTINATION_HEALTH_LEVEL.OFFLINE]:  "Offline",
  [DESTINATION_HEALTH_LEVEL.UNKNOWN]:  "Sin datos",
};

export const DEST_HEALTH_VARIANT: Record<DestinationHealthLevel, string> = {
  [DESTINATION_HEALTH_LEVEL.HEALTHY]:  "ok",
  [DESTINATION_HEALTH_LEVEL.DEGRADED]: "warning",
  [DESTINATION_HEALTH_LEVEL.BLOCKED]:  "critical",
  [DESTINATION_HEALTH_LEVEL.OFFLINE]:  "neutral",
  [DESTINATION_HEALTH_LEVEL.UNKNOWN]:  "neutral",
};

// ── System health labels ───────────────────────────────────────────────────────

export const SYSTEM_HEALTH_LABELS: Record<SystemHealthLevel, string> = {
  [SYSTEM_HEALTH_LEVEL.OPERATIONAL]: "Operacional",
  [SYSTEM_HEALTH_LEVEL.DEGRADED]:    "Degradado",
  [SYSTEM_HEALTH_LEVEL.CRITICAL]:    "Crítico",
  [SYSTEM_HEALTH_LEVEL.UNKNOWN]:     "Sin datos",
};

export const SYSTEM_HEALTH_VARIANT: Record<SystemHealthLevel, string> = {
  [SYSTEM_HEALTH_LEVEL.OPERATIONAL]: "ok",
  [SYSTEM_HEALTH_LEVEL.DEGRADED]:    "warning",
  [SYSTEM_HEALTH_LEVEL.CRITICAL]:    "critical",
  [SYSTEM_HEALTH_LEVEL.UNKNOWN]:     "neutral",
};

// ── Action type labels ─────────────────────────────────────────────────────────

export const ACTION_TYPE_LABELS: Record<OrchestrationRecommendedAction["actionType"], string> = {
  review:  "Revisar",
  sync:    "Sincronizar",
  publish: "Publicar",
  rebuild: "Reconstruir",
  retry:   "Reintentar",
};

// ── Urgency variant ────────────────────────────────────────────────────────────

export const URGENCY_VARIANT: Record<string, string> = {
  critical: "critical",
  high:     "warning",
  medium:   "info",
  low:      "neutral",
};

export const URGENCY_LABELS: Record<string, string> = {
  critical: "Crítico",
  high:     "Alto",
  medium:   "Medio",
  low:      "Bajo",
};

// ── Time formatting ────────────────────────────────────────────────────────────

export function formatJobAge(isoDate: string | null): string {
  if (!isoDate) return "—";
  const ms   = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1)  return "ahora";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export function formatNextRetry(isoDate: string | null): string {
  if (!isoDate) return "—";
  const ms   = new Date(isoDate).getTime() - Date.now();
  if (ms <= 0)   return "próximo";
  const mins = Math.ceil(ms / 60_000);
  if (mins < 60) return `en ${mins}m`;
  return `en ${Math.ceil(mins / 60)}h`;
}
