/**
 * lib/marketing-studio/orchestrator/orchestrator-display.ts
 *
 * MS-17 — Unified Publishing Orchestrator: Display helpers (pure, no side effects)
 *
 * All functions serializable-safe. Never import Prisma here.
 */

import type {
  OrchestratorStatus,
  OrchestratorStageStatus,
  OrchestratorJobType,
  OrchestratorPlanType,
  OrchestratorHealthLevel,
  OrchestratorChannel,
  RecommendationSource,
} from "./orchestrator-types";

// ── Status labels ─────────────────────────────────────────────────────────────

export const ORCHESTRATOR_STATUS_LABEL: Record<OrchestratorStatus, string> = {
  draft:               "Borrador",
  validating:          "Validando",
  blocked:             "Bloqueado",
  queued:              "En Cola",
  running:             "Ejecutando",
  partially_completed: "Parcial",
  completed:           "Completado",
  failed:              "Fallido",
  paused:              "Pausado",
  archived:            "Archivado",
};

export const ORCHESTRATOR_STAGE_STATUS_LABEL: Record<OrchestratorStageStatus, string> = {
  pending:   "Pendiente",
  ready:     "Listo",
  running:   "Ejecutando",
  completed: "Completado",
  blocked:   "Bloqueado",
  failed:    "Fallido",
  skipped:   "Omitido",
};

export const ORCHESTRATOR_JOB_TYPE_LABEL: Record<OrchestratorJobType, string> = {
  validation:       "Validación",
  asset_sync:       "Sincronización de Assets",
  shopify_publish:  "Publicación Shopify",
  social_publish:   "Publicación Social",
  whatsapp_publish: "Publicación WhatsApp",
  campaign_attach:  "Adjuntar Campaña",
  catalog_sync:     "Sincronización Catálogo",
  retry:            "Reintento",
  cleanup:          "Limpieza",
};

export const ORCHESTRATOR_PLAN_TYPE_LABEL: Record<OrchestratorPlanType, string> = {
  product_launch:       "Lanzamiento de Producto",
  campaign_launch:      "Lanzamiento de Campaña",
  catalog_distribution: "Distribución de Catálogo",
  social_push:          "Publicación Social",
  shopify_sync:         "Sincronización Shopify",
  whatsapp_broadcast:   "Broadcast WhatsApp",
  multi_channel_launch: "Lanzamiento Multi-Canal",
};

export const ORCHESTRATOR_CHANNEL_LABEL: Record<OrchestratorChannel, string> = {
  shopify:   "Shopify",
  instagram: "Instagram",
  facebook:  "Facebook",
  tiktok:    "TikTok",
  whatsapp:  "WhatsApp",
  youtube:   "YouTube",
  landing:   "Landing",
  catalog:   "Catálogo",
  ads:       "Ads",
  email:     "Email",
};

// ── Status variant (ag-op-status--{variant}) ──────────────────────────────────

export function getOrchestratorStatusVariant(status: OrchestratorStatus): string {
  switch (status) {
    case "completed":           return "ok";
    case "running":             return "syncing";
    case "partially_completed": return "warning";
    case "blocked":             return "critical";
    case "failed":              return "critical";
    case "validating":          return "syncing";
    case "queued":              return "stale";
    case "paused":              return "stale";
    case "draft":               return "draft";
    case "archived":            return "draft";
    default:                    return "draft";
  }
}

export function getStageStatusVariant(status: OrchestratorStageStatus): string {
  switch (status) {
    case "completed": return "ok";
    case "running":   return "syncing";
    case "ready":     return "stale";
    case "blocked":   return "critical";
    case "failed":    return "critical";
    case "skipped":   return "draft";
    default:          return "draft";
  }
}

// ── Stage status icon ─────────────────────────────────────────────────────────

export function getStageStatusIcon(status: OrchestratorStageStatus): string {
  switch (status) {
    case "completed": return "✓";
    case "running":   return "▶";
    case "ready":     return "◌";
    case "blocked":   return "⊘";
    case "failed":    return "✗";
    case "skipped":   return "–";
    default:          return "·";
  }
}

// ── Health ────────────────────────────────────────────────────────────────────

export function getHealthColor(level: OrchestratorHealthLevel): string {
  switch (level) {
    case "healthy":  return "var(--ag-green, #16a34a)";
    case "warning":  return "var(--ag-amber, #d97706)";
    case "degraded": return "var(--ag-amber-dark, #92400e)";
    case "critical": return "var(--ag-red, #dc2626)";
  }
}

export function getHealthLabel(level: OrchestratorHealthLevel): string {
  switch (level) {
    case "healthy":  return "Operacional";
    case "warning":  return "Atención requerida";
    case "degraded": return "Degradado";
    case "critical": return "Crítico";
  }
}

// ── Progress color ────────────────────────────────────────────────────────────

export function getProgressColor(progress: number): string {
  if (progress >= 80) return "var(--ag-green, #16a34a)";
  if (progress >= 40) return "var(--ag-amber, #d97706)";
  return "var(--ag-red, #dc2626)";
}

// ── Channel dot color ─────────────────────────────────────────────────────────

export function getChannelColor(channel: OrchestratorChannel): string {
  switch (channel) {
    case "shopify":   return "#96BF48";
    case "instagram": return "#E1306C";
    case "facebook":  return "#1877F2";
    case "tiktok":    return "#010101";
    case "whatsapp":  return "#25D366";
    case "youtube":   return "#FF0000";
    case "landing":   return "#6366f1";
    case "catalog":   return "#059669";
    case "ads":       return "#F59E0B";
    case "email":     return "#0369a1";
  }
}

// ── Recommendation source ─────────────────────────────────────────────────────

export function getRecommendationSourceLabel(source: RecommendationSource): string {
  return source === "luca" ? "Luca · Análisis Comercial" : "Mila · Inteligencia Creativa";
}

export function getRecommendationSourceColor(source: RecommendationSource): string {
  return source === "luca" ? "var(--ag-blue-dark, #004AAD)" : "var(--ag-brand, #7c3aed)";
}

// ── Duration formatting ───────────────────────────────────────────────────────

export function formatDurationMs(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000)   return `${ms}ms`;
  if (ms < 60000)  return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60000);
  const sec = Math.round((ms % 60000) / 1000);
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
}

// ── Date formatting ───────────────────────────────────────────────────────────

export function formatOrchestratorDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("es-MX", {
    month:  "short",
    day:    "numeric",
    hour:   "2-digit",
    minute: "2-digit",
  });
}

export function formatCountdown(iso: string | null): string {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return "Vencido";
  const min = Math.floor(diff / 60000);
  if (min < 60)  return `en ${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24)   return `en ${hr}h`;
  return `en ${Math.floor(hr / 24)}d`;
}

// ── Plan type icon ────────────────────────────────────────────────────────────

export function getPlanTypeIcon(type: OrchestratorPlanType): string {
  switch (type) {
    case "product_launch":       return "◈";
    case "campaign_launch":      return "◉";
    case "catalog_distribution": return "▤";
    case "social_push":          return "◎";
    case "shopify_sync":         return "⊟";
    case "whatsapp_broadcast":   return "◷";
    case "multi_channel_launch": return "⊕";
  }
}
