/**
 * lib/marketing-studio/campaigns/campaign-display.ts
 *
 * MS-15 — Campaign Operating System: Display helpers
 *
 * Pure functions. No Prisma. No async. Safe for RSC + client.
 */

import {
  CAMPAIGN_TYPE_LABEL,
  CAMPAIGN_STATUS_LABEL,
  CAMPAIGN_PRIORITY_LABEL,
  CONTENT_TYPE_LABEL,
  CHANNEL_TYPE_LABEL,
  LAUNCH_PHASE_LABEL,
  CAMPAIGN_HEALTH_LEVEL,
  CAMPAIGN_READINESS_LEVEL,
  type CampaignType,
  type CampaignStatus,
  type CampaignPriority,
  type ContentType,
  type ChannelType,
  type LaunchPhase,
  type CampaignHealthLevel,
  type CampaignReadinessLevel,
} from "./campaign-types";

// ── Type/status labels ─────────────────────────────────────────────────────────

export function formatCampaignType(type: string): string {
  return CAMPAIGN_TYPE_LABEL[type as CampaignType] ?? type;
}

export function formatCampaignStatus(status: string): string {
  return CAMPAIGN_STATUS_LABEL[status as CampaignStatus] ?? status;
}

export function formatCampaignPriority(priority: string): string {
  return CAMPAIGN_PRIORITY_LABEL[priority as CampaignPriority] ?? priority;
}

export function formatContentType(type: string): string {
  return CONTENT_TYPE_LABEL[type as ContentType] ?? type;
}

export function formatChannelLabel(channel: string): string {
  return CHANNEL_TYPE_LABEL[channel as ChannelType] ?? channel;
}

export function formatLaunchPhase(phase: string): string {
  return LAUNCH_PHASE_LABEL[phase as LaunchPhase] ?? phase;
}

// ── Status chip variants ───────────────────────────────────────────────────────

export const CAMPAIGN_STATUS_VARIANT: Record<CampaignStatus, string> = {
  draft:     "draft",
  planning:  "default",
  scheduled: "scheduled",
  active:    "ok",
  paused:    "warning",
  completed: "ok",
  failed:    "critical",
};

export function getCampaignStatusVariant(status: string): string {
  return CAMPAIGN_STATUS_VARIANT[status as CampaignStatus] ?? "default";
}

// ── Priority variants ──────────────────────────────────────────────────────────

export const CAMPAIGN_PRIORITY_VARIANT: Record<CampaignPriority, string> = {
  critical: "critical",
  high:     "warning",
  medium:   "default",
  low:      "muted",
};

export function getCampaignPriorityVariant(priority: string): string {
  return CAMPAIGN_PRIORITY_VARIANT[priority as CampaignPriority] ?? "default";
}

// ── Health colors ──────────────────────────────────────────────────────────────

const HEALTH_COLOR_MAP: Record<CampaignHealthLevel, string> = {
  healthy:  "#16a34a",
  warning:  "#d97706",
  critical: "#dc2626",
  stalled:  "#9ca3af",
};

export function resolveCampaignHealthColor(level: string): string {
  return HEALTH_COLOR_MAP[level as CampaignHealthLevel] ?? "#9ca3af";
}

export const HEALTH_VARIANT: Record<CampaignHealthLevel, string> = {
  healthy:  "ok",
  warning:  "warning",
  critical: "critical",
  stalled:  "stale",
};

export function getCampaignHealthVariant(level: string): string {
  return HEALTH_VARIANT[level as CampaignHealthLevel] ?? "default";
}

export const HEALTH_LABEL: Record<CampaignHealthLevel, string> = {
  healthy:  "Campañas saludables",
  warning:  "Campañas en riesgo",
  critical: "Campañas bloqueadas",
  stalled:  "Campañas estancadas",
};

export function getCampaignHealthLabel(level: string): string {
  return HEALTH_LABEL[level as CampaignHealthLevel] ?? level;
}

// ── Readiness display ──────────────────────────────────────────────────────────

export const READINESS_VARIANT: Record<CampaignReadinessLevel, string> = {
  blocked:   "critical",
  partial:   "warning",
  ready:     "ok",
  excellent: "ok",
};

export const READINESS_LABEL: Record<CampaignReadinessLevel, string> = {
  blocked:   "Bloqueada",
  partial:   "Parcial",
  ready:     "Lista",
  excellent: "Excelente",
};

export function getCampaignReadinessVariant(level: string): string {
  return READINESS_VARIANT[level as CampaignReadinessLevel] ?? "default";
}

export function getCampaignReadinessLabel(level: string): string {
  return READINESS_LABEL[level as CampaignReadinessLevel] ?? level;
}

// ── Launch timing ──────────────────────────────────────────────────────────────

export function formatLaunchWindow(isoDate: string | null): string {
  if (!isoDate) return "Sin fecha";
  const d    = new Date(isoDate);
  const now  = new Date();
  const diff = d.getTime() - now.getTime();
  const days = Math.round(diff / (1000 * 60 * 60 * 24));

  if (diff < 0)   return `Vencida hace ${Math.abs(days)}d`;
  if (days === 0) return "Hoy";
  if (days === 1) return "Mañana";
  if (days < 7)  return `En ${days}d`;
  if (days < 30) return `En ${Math.round(days / 7)}sem`;
  return d.toLocaleDateString("es-CO", { month: "short", day: "numeric" });
}

export function formatCampaignDate(isoDate: string | null): string {
  if (!isoDate) return "—";
  return new Date(isoDate).toLocaleDateString("es-CO", {
    month: "short",
    day:   "numeric",
    year:  "numeric",
  });
}

// ── Cadence display ────────────────────────────────────────────────────────────

export function formatCadence(postsPerWeek: number): string {
  if (postsPerWeek === 0) return "Sin cadencia";
  if (postsPerWeek === 1) return "1 post/semana";
  if (postsPerWeek <= 3) return `${postsPerWeek} posts/semana`;
  if (postsPerWeek <= 7) return "Diario";
  return `${postsPerWeek} posts/semana (alta frecuencia)`;
}

// ── Launch pressure ────────────────────────────────────────────────────────────

export const LAUNCH_PRESSURE_LABEL: Record<string, string> = {
  low:      "Presión baja",
  medium:   "Presión media",
  high:     "Presión alta",
  critical: "Presión crítica",
};

export const LAUNCH_PRESSURE_COLOR: Record<string, string> = {
  low:      "#16a34a",
  medium:   "#d97706",
  high:     "#ea580c",
  critical: "#dc2626",
};

export function getLaunchPressureLabel(pressure: string): string {
  return LAUNCH_PRESSURE_LABEL[pressure] ?? pressure;
}

export function getLaunchPressureColor(pressure: string): string {
  return LAUNCH_PRESSURE_COLOR[pressure] ?? "#9ca3af";
}

// ── Readiness score bar ────────────────────────────────────────────────────────

export function getReadinessScoreColor(score: number): string {
  if (score >= 85) return "#16a34a";
  if (score >= 60) return "#d97706";
  if (score >= 30) return "#ea580c";
  return "#dc2626";
}

// ── Phase sequence display ─────────────────────────────────────────────────────

export const PHASE_VARIANT: Record<LaunchPhase, string> = {
  teaser:        "scheduled",
  reveal:        "queued",
  launch:        "ok",
  reinforcement: "default",
  urgency:       "warning",
  retention:     "muted",
};

export function getLaunchPhaseVariant(phase: string): string {
  return PHASE_VARIANT[phase as LaunchPhase] ?? "default";
}
