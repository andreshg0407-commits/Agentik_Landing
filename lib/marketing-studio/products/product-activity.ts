/**
 * lib/marketing-studio/products/product-activity.ts
 *
 * MS-05E — Product Activity Timeline
 *
 * Formatting and display helpers for product activity events.
 * Used by the drawer's timeline section and future Copilot feeds.
 *
 * ── RULES ─────────────────────────────────────────────────────────────────────
 *   - No Prisma
 *   - No side effects
 *   - All timestamps formatted in Spanish locale
 */

import type { ProductActivityEvent, ProductEventType } from "./product-types";

// ── Event display config ───────────────────────────────────────────────────────

interface ActivityDisplayConfig {
  label:       string;
  description: (payload: Record<string, unknown>) => string;
  accentColor: "blue" | "green" | "amber" | "red" | "gray";
}

const ACTIVITY_CONFIG: Record<ProductEventType, ActivityDisplayConfig> = {
  PRODUCT_CREATED: {
    label:       "Producto creado",
    description: p => `Entidad de producto "${p.name ?? "—"}" creada en la Biblioteca`,
    accentColor: "blue",
  },
  PRODUCT_APPROVED: {
    label:       "Aprobado",
    description: p => `Asset aprobado como producto comercial${p.approvedBy ? ` por ${p.approvedBy}` : ""}`,
    accentColor: "green",
  },
  PRODUCT_UPDATED: {
    label:       "Metadata actualizada",
    description: p => {
      const fields = Array.isArray(p.changedFields) ? p.changedFields : [];
      return fields.length > 0
        ? `Campos actualizados: ${fields.slice(0, 3).join(", ")}${fields.length > 3 ? ` +${fields.length - 3}` : ""}`
        : "Metadata del producto actualizada";
    },
    accentColor: "blue",
  },
  PRODUCT_ATTRIBUTE_UPDATED: {
    label:       "Atributos actualizados",
    description: p => {
      const keys = Array.isArray(p.changedKeys) ? p.changedKeys : [];
      return `Atributos modificados: ${keys.join(", ")}`;
    },
    accentColor: "blue",
  },
  PRODUCT_VARIANT_CREATED: {
    label:       "Variante creada",
    description: p => `Nueva variante${p.sku ? ` SKU ${p.sku}` : ""} agregada al producto`,
    accentColor: "blue",
  },
  PRODUCT_CHANNEL_ENABLED: {
    label:       "Canal habilitado",
    description: p => `Canal ${p.channel ?? "—"} habilitado para sincronización`,
    accentColor: "green",
  },
  PRODUCT_READINESS_CHANGED: {
    label:       "Readiness actualizado",
    description: p => `${p.readyCount ?? 0} destinos listos · ${p.partialCount ?? 0} parciales`,
    accentColor: "amber",
  },
  PRODUCT_SYNC_FAILED: {
    label:       "Sync falló",
    description: p => `Error al sincronizar con ${p.channel ?? "destino"}: ${p.errorMessage ?? "error desconocido"}`,
    accentColor: "red",
  },
  PRODUCT_PUBLISHED: {
    label:       "Publicado",
    description: p => `Publicado en ${p.channel ?? "destino"}${p.externalId ? ` (ID: ${p.externalId})` : ""}`,
    accentColor: "green",
  },
  PRODUCT_ASSET_LINKED: {
    label:       "Asset vinculado",
    description: p => `Asset vinculado como ${p.role ?? "galería"}`,
    accentColor: "blue",
  },
};

// ── Formatted activity item ────────────────────────────────────────────────────

export interface FormattedActivityItem {
  id:          string;
  eventType:   ProductEventType;
  label:       string;
  description: string;
  accentColor: ActivityDisplayConfig["accentColor"];
  actor:       string | null;
  timestamp:   string;
  relativeTime: string;
}

/**
 * formatActivityEvent — converts a raw ProductActivityEvent into a
 * display-ready FormattedActivityItem.
 */
export function formatActivityEvent(event: ProductActivityEvent): FormattedActivityItem {
  const config = ACTIVITY_CONFIG[event.eventType];
  return {
    id:           event.id,
    eventType:    event.eventType,
    label:        config.label,
    description:  config.description(event.payload),
    accentColor:  config.accentColor,
    actor:        event.actorLabel ?? null,
    timestamp:    formatTimestamp(event.occurredAt),
    relativeTime: formatRelative(event.occurredAt),
  };
}

/**
 * buildActivityTimeline — formats and sorts a list of events for display.
 * Most recent first.
 */
export function buildActivityTimeline(
  events: ProductActivityEvent[],
  limit = 10,
): FormattedActivityItem[] {
  return [...events]
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    .slice(0, limit)
    .map(formatActivityEvent);
}

// ── Time formatting ────────────────────────────────────────────────────────────

function formatTimestamp(date: Date): string {
  try {
    return new Intl.DateTimeFormat("es-CO", {
      day:    "2-digit",
      month:  "short",
      hour:   "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 16);
  }
}

function formatRelative(date: Date): string {
  const diff   = Date.now() - date.getTime();
  const mins   = Math.floor(diff / 60_000);
  const hours  = Math.floor(diff / 3_600_000);
  const days   = Math.floor(diff / 86_400_000);

  if (mins < 1)   return "Ahora mismo";
  if (mins < 60)  return `Hace ${mins}m`;
  if (hours < 24) return `Hace ${hours}h`;
  if (days < 7)   return `Hace ${days}d`;
  return formatTimestamp(date);
}

// ── Activity summary ───────────────────────────────────────────────────────────

/**
 * getActivitySummary — returns a one-line summary of the most recent event.
 */
export function getActivitySummary(events: ProductActivityEvent[]): string {
  if (events.length === 0) return "Sin actividad registrada";
  const latest = events.reduce((a, b) =>
    a.occurredAt > b.occurredAt ? a : b
  );
  const config = ACTIVITY_CONFIG[latest.eventType];
  return `Último evento: ${config.label} · ${formatRelative(latest.occurredAt)}`;
}
