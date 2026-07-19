/**
 * lib/copilot/executive-brain/executive-signal-registry.ts
 *
 * Agentik — Executive Brain — Signal Registry
 * Sprint: AGENTIK-EXECUTIVE-BRAIN-01
 *
 * Catalog of known executive signals with their default metadata.
 * Used by the signal collector to produce consistent, identifiable signals.
 *
 * Each registry entry defines the structural metadata for a signal type.
 * Actual instances are created with additional context by the collector.
 *
 * Pure domain. No Prisma. No server-only. No React.
 */

import type {
  ExecutiveSignalSeverity,
  ExecutiveSignalDirection,
  ExecutiveSignalCategory,
} from "./executive-brain-types";

// ── Registry entry type ───────────────────────────────────────────────────────

export interface SignalRegistryEntry {
  id:          string;
  title:       string;
  description: string;
  category:    ExecutiveSignalCategory;
  severity:    ExecutiveSignalSeverity;
  direction:   ExecutiveSignalDirection;
  /** Default confidence for this signal type when no specific evidence. */
  defaultConfidence: number;
}

// ── Signal catalog ────────────────────────────────────────────────────────────

export const SIGNAL_REGISTRY: Readonly<Record<string, SignalRegistryEntry>> = {

  // ── Finance signals ────────────────────────────────────────────────────────

  FINANCE_LOW_CASH: {
    id:                "FINANCE_LOW_CASH",
    title:             "Liquidez baja",
    description:       "El saldo de caja disponible está por debajo del umbral operativo recomendado.",
    category:          "FINANCE",
    severity:          "CRITICAL",
    direction:         "DECLINING",
    defaultConfidence: 0.8,
  },

  FINANCE_MARGIN_DROP: {
    id:                "FINANCE_MARGIN_DROP",
    title:             "Caída de margen",
    description:       "El margen operativo ha disminuido respecto al período anterior.",
    category:          "FINANCE",
    severity:          "HIGH",
    direction:         "DECLINING",
    defaultConfidence: 0.7,
  },

  FINANCE_RECONCILIATION_PENDING: {
    id:                "FINANCE_RECONCILIATION_PENDING",
    title:             "Conciliación pendiente",
    description:       "Existen movimientos bancarios sin conciliar que requieren atención.",
    category:          "FINANCE",
    severity:          "HIGH",
    direction:         "STABLE",
    defaultConfidence: 0.9,
  },

  FINANCE_CLOSING_IN_PROGRESS: {
    id:                "FINANCE_CLOSING_IN_PROGRESS",
    title:             "Cierre financiero en proceso",
    description:       "El proceso de cierre mensual o trimestral está activo y requiere seguimiento.",
    category:          "FINANCE",
    severity:          "MEDIUM",
    direction:         "STABLE",
    defaultConfidence: 0.85,
  },

  FINANCE_STABLE: {
    id:                "FINANCE_STABLE",
    title:             "Finanzas estables",
    description:       "Los indicadores financieros muestran estabilidad operativa.",
    category:          "FINANCE",
    severity:          "LOW",
    direction:         "STABLE",
    defaultConfidence: 0.6,
  },

  // ── Commercial signals ─────────────────────────────────────────────────────

  COMMERCIAL_SALES_GROWTH: {
    id:                "COMMERCIAL_SALES_GROWTH",
    title:             "Crecimiento en ventas",
    description:       "Las ventas están superando el objetivo del período.",
    category:          "COMMERCIAL",
    severity:          "LOW",
    direction:         "IMPROVING",
    defaultConfidence: 0.75,
  },

  COMMERCIAL_SALES_DECLINE: {
    id:                "COMMERCIAL_SALES_DECLINE",
    title:             "Caída en ventas",
    description:       "Las ventas están por debajo del objetivo del período.",
    category:          "COMMERCIAL",
    severity:          "HIGH",
    direction:         "DECLINING",
    defaultConfidence: 0.75,
  },

  COMMERCIAL_PIPELINE_WEAK: {
    id:                "COMMERCIAL_PIPELINE_WEAK",
    title:             "Pipeline comercial débil",
    description:       "El pipeline de oportunidades no alcanza para cubrir la meta del próximo ciclo.",
    category:          "COMMERCIAL",
    severity:          "HIGH",
    direction:         "DECLINING",
    defaultConfidence: 0.65,
  },

  // ── Collections signals ────────────────────────────────────────────────────

  COLLECTIONS_OVERDUE_PORTFOLIO: {
    id:                "COLLECTIONS_OVERDUE_PORTFOLIO",
    title:             "Cartera vencida elevada",
    description:       "Existe un volumen significativo de facturas vencidas sin recuperar.",
    category:          "COLLECTIONS",
    severity:          "CRITICAL",
    direction:         "DECLINING",
    defaultConfidence: 0.85,
  },

  COLLECTIONS_RECOVERY_IMPROVEMENT: {
    id:                "COLLECTIONS_RECOVERY_IMPROVEMENT",
    title:             "Mejora en recaudo",
    description:       "El índice de recuperación de cartera está mejorando.",
    category:          "COLLECTIONS",
    severity:          "LOW",
    direction:         "IMPROVING",
    defaultConfidence: 0.7,
  },

  COLLECTIONS_CRITICAL_CLIENT: {
    id:                "COLLECTIONS_CRITICAL_CLIENT",
    title:             "Cliente crítico en mora",
    description:       "Un cliente clave tiene una deuda vencida que requiere gestión inmediata.",
    category:          "COLLECTIONS",
    severity:          "CRITICAL",
    direction:         "DECLINING",
    defaultConfidence: 0.9,
  },

  // ── Marketing signals ──────────────────────────────────────────────────────

  MARKETING_CAMPAIGN_SUCCESS: {
    id:                "MARKETING_CAMPAIGN_SUCCESS",
    title:             "Campaña exitosa",
    description:       "Una campaña activa está superando los indicadores de rendimiento esperados.",
    category:          "MARKETING",
    severity:          "LOW",
    direction:         "IMPROVING",
    defaultConfidence: 0.7,
  },

  MARKETING_CAMPAIGN_UNDERPERFORMING: {
    id:                "MARKETING_CAMPAIGN_UNDERPERFORMING",
    title:             "Campaña por debajo del objetivo",
    description:       "Una campaña activa no está alcanzando los indicadores de rendimiento esperados.",
    category:          "MARKETING",
    severity:          "MEDIUM",
    direction:         "DECLINING",
    defaultConfidence: 0.65,
  },

  MARKETING_INTEGRATION_ISSUE: {
    id:                "MARKETING_INTEGRATION_ISSUE",
    title:             "Integración de marketing pendiente",
    description:       "Una integración de canal de marketing está pendiente o tiene problemas.",
    category:          "MARKETING",
    severity:          "MEDIUM",
    direction:         "STABLE",
    defaultConfidence: 0.7,
  },

  // ── Operations signals ─────────────────────────────────────────────────────

  OPERATIONS_PROCESS_BLOCKED: {
    id:                "OPERATIONS_PROCESS_BLOCKED",
    title:             "Proceso operativo bloqueado",
    description:       "Un proceso operativo crítico está detenido o requiere intervención.",
    category:          "OPERATIONS",
    severity:          "HIGH",
    direction:         "STABLE",
    defaultConfidence: 0.8,
  },

  OPERATIONS_STABLE: {
    id:                "OPERATIONS_STABLE",
    title:             "Operaciones estables",
    description:       "Los procesos operativos están funcionando dentro de parámetros normales.",
    category:          "OPERATIONS",
    severity:          "LOW",
    direction:         "STABLE",
    defaultConfidence: 0.6,
  },

  // ── Executive signals ──────────────────────────────────────────────────────

  EXECUTIVE_CRITICAL_ALERT: {
    id:                "EXECUTIVE_CRITICAL_ALERT",
    title:             "Alerta ejecutiva crítica",
    description:       "Existe una situación que requiere atención ejecutiva inmediata.",
    category:          "EXECUTIVE",
    severity:          "CRITICAL",
    direction:         "DECLINING",
    defaultConfidence: 0.9,
  },

  EXECUTIVE_STRATEGIC_OPPORTUNITY: {
    id:                "EXECUTIVE_STRATEGIC_OPPORTUNITY",
    title:             "Oportunidad estratégica activa",
    description:       "Existe una oportunidad estratégica que puede aprovecharse en este período.",
    category:          "EXECUTIVE",
    severity:          "HIGH",
    direction:         "IMPROVING",
    defaultConfidence: 0.7,
  },

  EXECUTIVE_REVIEW_REQUIRED: {
    id:                "EXECUTIVE_REVIEW_REQUIRED",
    title:             "Revisión ejecutiva requerida",
    description:       "Hay decisiones o revisiones ejecutivas pendientes que requieren atención.",
    category:          "EXECUTIVE",
    severity:          "MEDIUM",
    direction:         "STABLE",
    defaultConfidence: 0.75,
  },
};

// ── Lookup helpers ────────────────────────────────────────────────────────────

/**
 * Get a registry entry by signal ID.
 * Returns undefined if not found.
 */
export function getSignalEntry(signalId: string): SignalRegistryEntry | undefined {
  return SIGNAL_REGISTRY[signalId];
}

/**
 * Get all registry entries for a given category.
 */
export function getSignalsByCategory(
  category: ExecutiveSignalCategory,
): SignalRegistryEntry[] {
  return Object.values(SIGNAL_REGISTRY).filter(e => e.category === category);
}

/**
 * Get all registry entries at or above a given severity.
 */
export function getSignalsBySeverity(
  severity: ExecutiveSignalSeverity,
): SignalRegistryEntry[] {
  const rank: Record<ExecutiveSignalSeverity, number> = { CRITICAL:3, HIGH:2, MEDIUM:1, LOW:0 };
  return Object.values(SIGNAL_REGISTRY).filter(e => rank[e.severity] >= rank[severity]);
}
