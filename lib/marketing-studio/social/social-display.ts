/**
 * lib/marketing-studio/social/social-display.ts
 *
 * MS-16 — Social Publishing Execution Engine: Display helpers
 *
 * Pure functions. No Prisma. No async. Safe for RSC + client.
 */

import {
  SOCIAL_CHANNEL_LABEL,
  SOCIAL_STATUS_LABEL,
  SOCIAL_CONTENT_TYPE_LABEL,
  SOCIAL_PRIORITY_LABEL,
  SOCIAL_FAILURE_LABEL,
  type SocialChannel,
  type SocialStatus,
  type SocialContentType,
  type SocialPriority,
  type SocialFailureType,
} from "./social-types";

// ── Label helpers ──────────────────────────────────────────────────────────────

export function getSocialChannelLabel(ch: string): string {
  return SOCIAL_CHANNEL_LABEL[ch as SocialChannel] ?? ch;
}

export function getSocialStatusLabel(status: string): string {
  return SOCIAL_STATUS_LABEL[status as SocialStatus] ?? status;
}

export function getSocialContentTypeLabel(type: string): string {
  return SOCIAL_CONTENT_TYPE_LABEL[type as SocialContentType] ?? type;
}

export function getSocialPriorityLabel(priority: string): string {
  return SOCIAL_PRIORITY_LABEL[priority as SocialPriority] ?? priority;
}

export function getSocialFailureLabel(type: string): string {
  return SOCIAL_FAILURE_LABEL[type as SocialFailureType] ?? type;
}

// ── Status chip variants ───────────────────────────────────────────────────────

const STATUS_VARIANT: Record<SocialStatus, string> = {
  draft:      "draft",
  queued:     "queued",
  preparing:  "default",
  publishing: "running",
  published:  "ok",
  failed:     "critical",
  retrying:   "retry-scheduled",
  scheduled:  "scheduled",
  paused:     "warning",
  cancelled:  "stale",
};

export function getSocialStatusVariant(status: string): string {
  return STATUS_VARIANT[status as SocialStatus] ?? "default";
}

// ── Priority variants ──────────────────────────────────────────────────────────

const PRIORITY_VARIANT: Record<SocialPriority, string> = {
  critical: "critical",
  high:     "warning",
  medium:   "default",
  low:      "muted",
};

export function getSocialPriorityVariant(priority: string): string {
  return PRIORITY_VARIANT[priority as SocialPriority] ?? "default";
}

// ── Health display ─────────────────────────────────────────────────────────────

const HEALTH_COLOR: Record<string, string> = {
  healthy:  "#16a34a",
  degraded: "#d97706",
  blocked:  "#dc2626",
  offline:  "#9ca3af",
};

const HEALTH_LABEL: Record<string, string> = {
  healthy:  "Canal operativo",
  degraded: "Canal degradado",
  blocked:  "Canal bloqueado",
  offline:  "Canal offline",
};

const HEALTH_VARIANT: Record<string, string> = {
  healthy:  "ok",
  degraded: "warning",
  blocked:  "critical",
  offline:  "stale",
};

export function getSocialHealthColor(level: string): string {
  return HEALTH_COLOR[level] ?? "#9ca3af";
}

export function getSocialHealthLabel(level: string): string {
  return HEALTH_LABEL[level] ?? level;
}

export function getSocialHealthVariant(level: string): string {
  return HEALTH_VARIANT[level] ?? "default";
}

// ── Retry pressure ─────────────────────────────────────────────────────────────

const RETRY_PRESSURE_LABEL: Record<string, string> = {
  low:      "Presión baja",
  medium:   "Presión media",
  high:     "Presión alta",
  critical: "Presión crítica",
};

const RETRY_PRESSURE_COLOR: Record<string, string> = {
  low:      "#16a34a",
  medium:   "#d97706",
  high:     "#ea580c",
  critical: "#dc2626",
};

export function getRetryPressureLabel(pressure: string): string {
  return RETRY_PRESSURE_LABEL[pressure] ?? pressure;
}

export function getRetryPressureColor(pressure: string): string {
  return RETRY_PRESSURE_COLOR[pressure] ?? "#9ca3af";
}

// ── Channel brand colors ───────────────────────────────────────────────────────

const CHANNEL_COLOR: Record<SocialChannel, string> = {
  tiktok:    "#000000",
  instagram: "#E1306C",
  facebook:  "#1877F2",
  whatsapp:  "#25D366",
  youtube:   "#FF0000",
};

export function getSocialChannelColor(ch: string): string {
  return CHANNEL_COLOR[ch as SocialChannel] ?? "#6b7280";
}

// ── Duration formatting ────────────────────────────────────────────────────────

export function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

// ── Scheduled time display ─────────────────────────────────────────────────────

export function formatScheduledAt(iso: string | null): string {
  if (!iso) return "Sin programar";
  const d    = new Date(iso);
  const now  = new Date();
  const diff = d.getTime() - now.getTime();
  if (Math.abs(diff) < 60_000) return "Ahora";
  if (diff < 0) return `Vencida ${formatRelative(Math.abs(diff))}`;
  return `En ${formatRelative(diff)}`;
}

function formatRelative(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.round(hr / 24)}d`;
}

export function formatPublishedAt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CO", {
    month:  "short",
    day:    "numeric",
    hour:   "2-digit",
    minute: "2-digit",
  });
}

// ── Activity type labels ───────────────────────────────────────────────────────

export const ACTIVITY_TYPE_LABEL: Record<string, string> = {
  started:           "Iniciando publicación",
  success:           "Publicado exitosamente",
  failed:            "Publicación fallida",
  retrying:          "Reintentando",
  campaign_advanced: "Campaña avanzó fase",
};

export function getActivityTypeLabel(type: string): string {
  return ACTIVITY_TYPE_LABEL[type] ?? type;
}

export function getActivityTypeColor(type: string): string {
  const colors: Record<string, string> = {
    started:           "#004AAD",
    success:           "#16a34a",
    failed:            "#dc2626",
    retrying:          "#d97706",
    campaign_advanced: "#7c3aed",
  };
  return colors[type] ?? "#6b7280";
}
