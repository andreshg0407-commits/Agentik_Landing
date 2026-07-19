/**
 * lib/marketing-studio/distribution/distribution-display.ts
 *
 * MS-14 — Distribution Runtime: Display helpers
 *
 * Pure functions — no Prisma, no async, no side effects.
 * Safe for use in RSC and client components.
 */

import {
  DISTRIBUTION_STATUS,
  DISTRIBUTION_HEALTH_LEVEL,
  DISTRIBUTION_CHANNEL_LABEL,
  PIPELINE_TYPE_LABEL,
  VARIANT_PURPOSE_LABEL,
  type DistributionStatus,
  type DistributionHealthLevel,
  type DistributionChannel,
  type DistributionPipelineType,
  type VariantPurpose,
} from "./distribution-types";

// ── Status display ─────────────────────────────────────────────────────────────

export const DISTRIBUTION_STATUS_LABEL: Record<DistributionStatus, string> = {
  draft:      "Borrador",
  scheduled:  "Programado",
  queued:     "En Cola",
  publishing: "Publicando",
  published:  "Publicado",
  partial:    "Parcial",
  failed:     "Fallido",
  stale:      "Desactualizado",
  archived:   "Archivado",
};

export const DISTRIBUTION_STATUS_VARIANT: Record<DistributionStatus, string> = {
  draft:      "draft",
  scheduled:  "scheduled",
  queued:     "queued",
  publishing: "running",
  published:  "ok",
  partial:    "warning",
  failed:     "critical",
  stale:      "stale",
  archived:   "archived",
};

export function getDistributionStatusLabel(status: string): string {
  return DISTRIBUTION_STATUS_LABEL[status as DistributionStatus] ?? status;
}

export function getDistributionStatusVariant(status: string): string {
  return DISTRIBUTION_STATUS_VARIANT[status as DistributionStatus] ?? "default";
}

// ── Health display ─────────────────────────────────────────────────────────────

export const DISTRIBUTION_HEALTH_LABEL: Record<DistributionHealthLevel, string> = {
  healthy:    "Saludable",
  degraded:   "Degradado",
  blocked:    "Bloqueado",
  incomplete: "Incompleto",
  unknown:    "Desconocido",
};

export const DISTRIBUTION_HEALTH_VARIANT: Record<DistributionHealthLevel, string> = {
  healthy:    "ok",
  degraded:   "warning",
  blocked:    "critical",
  incomplete: "warning",
  unknown:    "default",
};

export function getHealthLabel(level: string): string {
  return DISTRIBUTION_HEALTH_LABEL[level as DistributionHealthLevel] ?? level;
}

export function getHealthVariant(level: string): string {
  return DISTRIBUTION_HEALTH_VARIANT[level as DistributionHealthLevel] ?? "default";
}

// ── Coverage display ───────────────────────────────────────────────────────────

export function formatCoveragePct(pct: number): string {
  return `${Math.round(pct)}%`;
}

export function getCoverageVariant(pct: number): string {
  if (pct >= 80) return "ok";
  if (pct >= 50) return "warning";
  return "critical";
}

// ── Channel label ──────────────────────────────────────────────────────────────

export function getChannelLabel(channel: string): string {
  return DISTRIBUTION_CHANNEL_LABEL[channel as DistributionChannel] ?? channel;
}

// ── Pipeline type label ────────────────────────────────────────────────────────

export function getPipelineTypeLabel(type: string): string {
  return PIPELINE_TYPE_LABEL[type as DistributionPipelineType] ?? type;
}

// ── Variant purpose label ──────────────────────────────────────────────────────

export function getVariantPurposeLabel(purpose: string): string {
  return VARIANT_PURPOSE_LABEL[purpose as VariantPurpose] ?? purpose;
}

// ── Date formatting ────────────────────────────────────────────────────────────

export function formatDistributionDate(isoString: string | null): string {
  if (!isoString) return "—";
  const d = new Date(isoString);
  return d.toLocaleString("es-CO", {
    month:  "short",
    day:    "numeric",
    hour:   "2-digit",
    minute: "2-digit",
  });
}

export function formatScheduledDate(isoString: string | null): string {
  if (!isoString) return "Sin fecha";
  const d   = new Date(isoString);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffMs < 0) return "Vencido";
  if (diffHours < 1) return "En menos de 1h";
  if (diffHours < 24) return `En ${Math.round(diffHours)}h`;

  return d.toLocaleString("es-CO", {
    weekday: "short",
    month:   "short",
    day:     "numeric",
    hour:    "2-digit",
    minute:  "2-digit",
  });
}

// ── Urgency display ────────────────────────────────────────────────────────────

export const URGENCY_VARIANT: Record<string, string> = {
  critical: "critical",
  high:     "warning",
  medium:   "default",
  low:      "muted",
};

export function getUrgencyVariant(urgency: string): string {
  return URGENCY_VARIANT[urgency] ?? "default";
}

export const URGENCY_LABEL: Record<string, string> = {
  critical: "Crítico",
  high:     "Alto",
  medium:   "Medio",
  low:      "Bajo",
};

export function getUrgencyLabel(urgency: string): string {
  return URGENCY_LABEL[urgency] ?? urgency;
}
