/**
 * dashboard-widgets.ts
 *
 * EXECUTIVE-OPERATIONAL-DASHBOARD-04
 * Widget configuration types for dashboard cards.
 *
 * No Prisma. No React. No server-only. Pure domain types.
 */

// -- Severity Color -----------------------------------------------------------

/** Map severity to semantic color keys. */
export function severityColor(severity: string): {
  bg: string;
  border: string;
  text: string;
  dot: string;
} {
  switch (severity) {
    case "critical":
      return { bg: "#fff0f0", border: "#fca5a5", text: "#991b1b", dot: "#dc2626" };
    case "high":
      return { bg: "#fffbeb", border: "#fde68a", text: "#92400e", dot: "#d97706" };
    case "medium":
      return { bg: "#eff6ff", border: "#bfdbfe", text: "#0369a1", dot: "#0369a1" };
    case "low":
      return { bg: "#f0fdf4", border: "#bbf7d0", text: "#14532d", dot: "#16a34a" };
    default:
      return { bg: "#f8f9fb", border: "#e5e7eb", text: "#6b7280", dot: "#9ca3af" };
  }
}

// -- Health Color -------------------------------------------------------------

/** Map health level to colors. */
export function healthColor(level: string): {
  bg: string;
  text: string;
  label: string;
} {
  switch (level) {
    case "excellent":
      return { bg: "#16a34a", text: "#ffffff", label: "Excelente" };
    case "good":
      return { bg: "#22c55e", text: "#ffffff", label: "Bueno" };
    case "caution":
      return { bg: "#d97706", text: "#ffffff", label: "Precaucion" };
    case "warning":
      return { bg: "#f59e0b", text: "#1e1e2e", label: "Alerta" };
    case "critical":
      return { bg: "#dc2626", text: "#ffffff", label: "Critico" };
    default:
      return { bg: "#9ca3af", text: "#ffffff", label: "Desconocido" };
  }
}

// -- Entry Type Icon ----------------------------------------------------------

/** Map timeline entry type to an emoji-free label. */
export function entryTypeLabel(type: string): string {
  switch (type) {
    case "signal":   return "SIGNAL";
    case "event":    return "EVENT";
    case "rule":     return "RULE";
    case "plan":     return "PLAN";
    case "decision": return "DECISION";
    case "action":   return "ACTION";
    default:         return "INFO";
  }
}

// -- Action Status Label ------------------------------------------------------

/** Map action status to display label. */
export function actionStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: "Borrador",
    pending_approval: "Pendiente aprobacion",
    approved: "Aprobada",
    rejected: "Rechazada",
    ready: "Lista",
    running: "En ejecucion",
    completed: "Completada",
    failed: "Fallida",
    cancelled: "Cancelada",
    expired: "Expirada",
    skipped: "Omitida",
  };
  return labels[status] ?? status;
}

// -- Approval Status Label ----------------------------------------------------

/** Map approval status to display label. */
export function approvalStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    not_required: "No requerida",
    required: "Requerida",
    pending: "Pendiente",
    approved: "Aprobada",
    rejected: "Rechazada",
    expired: "Expirada",
  };
  return labels[status] ?? status;
}
