/**
 * lib/ui/status-labels.ts
 *
 * Single source of truth for all user-visible status, severity, and enum
 * label translations. Maps raw DB enum values → enterprise Spanish.
 *
 * Also exports badgeTone() for consistent badge colour across all pages.
 *
 * Usage:
 *   import { statusLabel, severityLabel, badgeTone } from "@/lib/ui/status-labels";
 *   <td>{statusLabel(doc.status)}</td>
 *   <span style={{ color: badgeTone(doc.status) }}>{statusLabel(doc.status)}</span>
 */

// ── Status labels ─────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, string> = {
  // Document lifecycle
  PENDING:         "Pendiente",
  PROCESSING:      "Procesando",
  PROCESSED:       "Procesado",
  REVIEWED:        "Revisado",
  REJECTED:        "Rechazado",
  ERROR:           "Error",
  // Run lifecycle
  QUEUED:          "En cola",
  RUNNING:         "En ejecución",
  SUCCEEDED:       "Completado",
  FAILED:          "Error",
  CANCELED:        "Cancelado",
  // Event lifecycle
  PROCESSED_EVENT: "Procesado",
  // Alert status
  OPEN:            "Abierta",
  ACKNOWLEDGED:    "Reconocida",
  RESOLVED:        "Resuelta",
  CLOSED:          "Cerrada",
  // Integration / Connector
  ACTIVE:          "Activo",
  INACTIVE:        "Inactivo",
  SYNCING:         "Sincronizando",
  // SAG write operations
  APPROVED:        "Aprobado",
  SENDING:         "Enviando",
  // Quote / opportunity
  DRAFT:           "Borrador",
  SENT:            "Enviado",
  ACCEPTED:        "Aceptado",
  EXPIRED:         "Vencido",
  BLOCKED:         "Bloqueado",
  // Generic
  DONE:            "Completado",
  SUCCESS:         "Exitoso",
  PARTIAL:         "Parcial",
};

/** Returns the Spanish label for any DB status enum value. Falls back to the raw value. */
export function statusLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return STATUS_MAP[value] ?? value;
}

// ── Severity labels ───────────────────────────────────────────────────────────

const SEVERITY_MAP: Record<string, string> = {
  CRITICAL: "Crítica",
  WARNING:  "Advertencia",
  INFO:     "Informativo",
};

/** Returns the Spanish label for an alert/event severity enum value. */
export function severityLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return SEVERITY_MAP[value] ?? value;
}

// ── Validation status labels ──────────────────────────────────────────────────

const VALIDATION_MAP: Record<string, string> = {
  VALID:            "Válido",
  INCOMPLETE:       "Incompleto",
  REVIEW_REQUIRED:  "Requiere revisión",
};

/** Returns the Spanish label for a document validation status enum value. */
export function validationLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return VALIDATION_MAP[value] ?? value;
}

// ── Processing mode labels ────────────────────────────────────────────────────

const PROCESSING_MODE_MAP: Record<string, string> = {
  "xml-first":            "XML",
  "xml-and-pdf":          "XML + PDF",
  "pdf-fallback":         "PDF",
  "manual-review-needed": "Revisión manual",
};

/** Returns the Spanish label for a document processing mode value. */
export function processingModeLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return PROCESSING_MODE_MAP[value] ?? value;
}

// ── CRM stage labels ─────────────────────────────────────────────────────────

const STAGE_MAP: Record<string, string> = {
  prospect:    "Prospecto",
  qualified:   "Calificado",
  proposal:    "Propuesta",
  negotiation: "Negociación",
  closed_won:  "Ganado",
  closed_lost: "Perdido",
};

/** Returns the Spanish label for a CRM opportunity stage value. */
export function stageLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return STAGE_MAP[value] ?? value;
}

// ── Badge tone ────────────────────────────────────────────────────────────────

const BADGE_TONE: Record<string, string> = {
  // Green — success / terminal-positive states
  PROCESSED:       "#060",
  REVIEWED:        "#060",
  SUCCEEDED:       "#060",
  PROCESSED_EVENT: "#060",
  RESOLVED:        "#060",
  ACTIVE:          "#060",
  DONE:            "#060",
  SUCCESS:         "#060",
  ACCEPTED:        "#2e7d32",
  // Amber — in-progress / attention states
  PROCESSING:      "#a60",
  RUNNING:         "#a60",
  OPEN:            "#a60",
  SYNCING:         "#a60",
  PARTIAL:         "#a60",
  WARNING:         "#b45309",
  SENT:            "#1565c0",
  // Red — failure / blocking states
  REJECTED:        "#c00",
  ERROR:           "#c00",
  FAILED:          "#c00",
  CRITICAL:        "#b71c1c",
  BLOCKED:         "#c00",
  EXPIRED:         "#b71c1c",
  // SAG write — in-flight
  APPROVED:        "#1565c0",
  SENDING:         "#a60",
  // Grey — neutral / waiting states
  PENDING:         "#888",
  QUEUED:          "#888",
  ACKNOWLEDGED:    "#888",
  CANCELED:        "#888",
  INACTIVE:        "#888",
  CLOSED:          "#888",
  DRAFT:           "#888",
  // Info
  INFO:            "#1565c0",
};

/**
 * Returns a hex colour for a status/severity badge.
 * Falls back to "#888" (neutral grey) for unmapped values.
 */
export function badgeTone(value: string | null | undefined): string {
  if (!value) return "#888";
  return BADGE_TONE[value] ?? "#888";
}
