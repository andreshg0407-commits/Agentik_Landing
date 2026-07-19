/**
 * crm-activity-alert.ts
 *
 * VENDEDORES-CLEANUP-01 — Phase 4
 *
 * Reusable alert model for CRM activity monitoring.
 * Consumed by: Vendedores, Control Comercial, Dashboard Ejecutivo, Copilot.
 *
 * Pure function — no DB, no side effects, no server-only.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CrmActivityAlert {
  id: "crm_activity_low";
  severity: "warning" | "critical";
  title: string;
  detail: string;
  daysSinceLastActivity: number;
  threshold: number;
}

// ── Config ────────────────────────────────────────────────────────────────────

/** Days without CRM activity before triggering alert */
const CRM_ACTIVITY_THRESHOLD_DAYS = 60;

// ── Builder ───────────────────────────────────────────────────────────────────

/**
 * Evaluate CRM activity and return alert if applicable.
 *
 * @param lastActivityAt ISO date string of last CRM quote (max issuedAt)
 * @returns Alert object or null if activity is recent enough
 */
export function evaluateCrmActivityAlert(
  lastActivityAt: string | null,
): CrmActivityAlert | null {
  if (!lastActivityAt) {
    return {
      id: "crm_activity_low",
      severity: "critical",
      title: "Sin actividad CRM registrada",
      detail: "No se encontraron cotizaciones en el sistema CRM. Verificar uso operativo del CRM por parte del equipo comercial.",
      daysSinceLastActivity: Infinity,
      threshold: CRM_ACTIVITY_THRESHOLD_DAYS,
    };
  }

  const daysSince = Math.round(
    (Date.now() - new Date(lastActivityAt).getTime()) / (24 * 60 * 60 * 1000),
  );

  if (daysSince <= CRM_ACTIVITY_THRESHOLD_DAYS) return null;

  return {
    id: "crm_activity_low",
    severity: daysSince > 120 ? "critical" : "warning",
    title: "Actividad CRM baja",
    detail: `CRM sin actividad comercial reciente (${daysSince} dias). Verificar si el equipo comercial esta registrando cotizaciones y pedidos en CRM.`,
    daysSinceLastActivity: daysSince,
    threshold: CRM_ACTIVITY_THRESHOLD_DAYS,
  };
}
