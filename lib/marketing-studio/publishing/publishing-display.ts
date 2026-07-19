/**
 * lib/marketing-studio/publishing/publishing-display.ts
 *
 * MS-17 — Unified Publishing OS: Display helpers
 *
 * Pure functions. No Prisma. No async. Safe for RSC + client.
 */

import {
  PUBLISHING_DESTINATION_LABEL,
  PUBLISHING_STATUS_LABEL,
  PUBLISHING_PRIORITY_LABEL,
  type PublishingDestination,
  type PublishingStatus,
  type PublishingPriority,
} from "./publishing-types";

// ── Label helpers ─────────────────────────────────────────────────────────────

export function getPublishingDestinationLabel(dest: string): string {
  return PUBLISHING_DESTINATION_LABEL[dest as PublishingDestination] ?? dest;
}

export function getPublishingStatusLabel(status: string): string {
  return PUBLISHING_STATUS_LABEL[status as PublishingStatus] ?? status;
}

export function getPublishingPriorityLabel(priority: string): string {
  return PUBLISHING_PRIORITY_LABEL[priority as PublishingPriority] ?? priority;
}

export function getPublishingTriggerLabel(trigger: string): string {
  const labels: Record<string, string> = {
    manual:                "Manual",
    schedule:              "Programado",
    campaign:              "Campaña",
    distribution_pipeline: "Pipeline",
    product_approved:      "Producto aprobado",
    catalog_updated:       "Catálogo actualizado",
    retry:                 "Reintento",
    webhook:               "Webhook",
  };
  return labels[trigger] ?? trigger;
}

// ── Status chip variants ──────────────────────────────────────────────────────

const STATUS_VARIANT: Record<string, string> = {
  draft:      "draft",
  planned:    "scheduled",
  blocked:    "critical",
  queued:     "queued",
  preparing:  "default",
  publishing: "running",
  published:  "ok",
  partial:    "warning",
  failed:     "critical",
  retrying:   "retry-scheduled",
  cancelled:  "stale",
  archived:   "muted",
};

export function getPublishingStatusVariant(status: string): string {
  return STATUS_VARIANT[status] ?? "default";
}

// ── Priority variants ─────────────────────────────────────────────────────────

const PRIORITY_VARIANT: Record<string, string> = {
  critical: "critical",
  high:     "warning",
  medium:   "default",
  low:      "muted",
};

export function getPublishingPriorityVariant(priority: string): string {
  return PRIORITY_VARIANT[priority] ?? "default";
}

// ── Destination brand colors ──────────────────────────────────────────────────

const DESTINATION_COLOR: Record<string, string> = {
  shopify:   "#96BF48",
  instagram: "#E1306C",
  facebook:  "#1877F2",
  tiktok:    "#000000",
  whatsapp:  "#25D366",
  youtube:   "#FF0000",
  landing:   "#004AAD",
  catalog:   "#7c3aed",
  ads:       "#F59E0B",
  email:     "#6b7280",
};

export function getDestinationColor(dest: string): string {
  return DESTINATION_COLOR[dest] ?? "#9ca3af";
}

// ── Health display ────────────────────────────────────────────────────────────

const HEALTH_COLOR: Record<string, string> = {
  healthy:  "#16a34a",
  degraded: "#d97706",
  blocked:  "#dc2626",
  critical: "#dc2626",
  offline:  "#9ca3af",
};

const HEALTH_VARIANT: Record<string, string> = {
  healthy:  "ok",
  degraded: "warning",
  blocked:  "critical",
  critical: "critical",
  offline:  "stale",
};

export function getPublishingHealthColor(level: string): string {
  return HEALTH_COLOR[level] ?? "#9ca3af";
}

export function getPublishingHealthVariant(level: string): string {
  return HEALTH_VARIANT[level] ?? "default";
}

export function getPublishingHealthLabel(level: string): string {
  const labels: Record<string, string> = {
    healthy:  "Publishing OS operativo",
    degraded: "Publicaciones con incidencias",
    blocked:  "Plans bloqueados — acción requerida",
    critical: "Fallo crítico en publishing",
  };
  return labels[level] ?? level;
}

// ── Progress display ──────────────────────────────────────────────────────────

export function getProgressColor(pct: number): string {
  if (pct >= 80) return "#16a34a";
  if (pct >= 40) return "#d97706";
  return "#dc2626";
}

// ── Date display ──────────────────────────────────────────────────────────────

export function formatPublishingDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CO", {
    month:  "short",
    day:    "numeric",
    hour:   "2-digit",
    minute: "2-digit",
  });
}

export function formatScheduledCountdown(iso: string | null): string {
  if (!iso) return "Sin programar";
  const diff = new Date(iso).getTime() - Date.now();
  if (Math.abs(diff) < 60_000) return "Ahora";
  if (diff < 0) {
    const min = Math.round(Math.abs(diff) / 60_000);
    if (min < 60) return `Vencido hace ${min}m`;
    return `Vencido hace ${Math.round(min / 60)}h`;
  }
  const min = Math.round(diff / 60_000);
  if (min < 60) return `En ${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `En ${hr}h`;
  return `En ${Math.round(hr / 24)}d`;
}

// ── Event display ─────────────────────────────────────────────────────────────

export function getPublishingEventLabel(eventType: string): string {
  const labels: Record<string, string> = {
    "publishing.plan_created":        "Plan creado",
    "publishing.step_queued":         "Step en cola",
    "publishing.step_started":        "Step iniciado",
    "publishing.step_published":      "Step publicado",
    "publishing.step_failed":         "Step fallido",
    "publishing.step_retrying":       "Reintentando step",
    "publishing.plan_completed":      "Plan completado",
    "publishing.plan_blocked":        "Plan bloqueado",
    "publishing.dependency_resolved": "Dependencia resuelta",
    "publishing.schedule_missed":     "Programación vencida",
  };
  return labels[eventType] ?? eventType;
}

export function getPublishingEventColor(eventType: string): string {
  if (eventType.includes("failed") || eventType.includes("blocked") || eventType.includes("missed")) return "#dc2626";
  if (eventType.includes("completed") || eventType.includes("published")) return "#16a34a";
  if (eventType.includes("retrying")) return "#d97706";
  if (eventType.includes("created") || eventType.includes("queued")) return "#004AAD";
  return "#6b7280";
}
