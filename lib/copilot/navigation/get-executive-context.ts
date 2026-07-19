/**
 * lib/copilot/navigation/get-executive-context.ts
 *
 * Agentik Copilot — Executive Impact Context
 * Sprint: AGENTIK-COPILOT-EXECUTIVE-CONTEXT-01
 *
 * Resolves the executive-level business impact for each drawer category.
 * Answers the three executive questions at a glance:
 *   - Qué pasa.
 *   - Qué tan grave es.
 *   - Qué debería hacer.
 *
 * Values are fixture-based for preview. Future: derive from ViewModel signals.
 *
 * Architecture boundary: no React, no UI — pure data.
 */

import type { DrawerCategoryKey } from "./copilot-action-map";

// ── Types ─────────────────────────────────────────────────────────────────────

export type UrgencyLevel = "Alta" | "Media" | "Baja";

export interface ExecutiveContext {
  /** Quantified or qualified impact: "$4.250.000 pendientes", "12 clientes afectados" */
  impactLabel: string;
  /** Business risk if unresolved: "Cierre contable incompleto" */
  riskLabel:   string;
  /** Urgency tier */
  urgency:     UrgencyLevel;
  /** Affected business area */
  areaLabel:   string;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

type ContextFixture = (count: number) => ExecutiveContext;

const EXECUTIVE_FIXTURES: Record<DrawerCategoryKey, ContextFixture> = {
  attention: (n) => ({
    impactLabel: n >= 3
      ? "$10.500.000 pendientes de validación"
      : "$4.250.000 pendientes de validación",
    riskLabel:   "Cierre contable incompleto",
    urgency:     n >= 3 ? "Alta" : "Alta",
    areaLabel:   "Conciliación",
  }),

  activeWork: (_) => ({
    impactLabel: "3 procesos en ejecución simultánea",
    riskLabel:   "Retraso si se interrumpe el flujo",
    urgency:     "Media",
    areaLabel:   "Conciliación",
  }),

  pendingApprovals: (n) => ({
    impactLabel: n > 1
      ? `${n} acciones bloqueadas sin autorización`
      : "1 acción bloqueada sin autorización",
    riskLabel:   "Operación pausada hasta autorización",
    urgency:     n >= 2 ? "Alta" : "Media",
    areaLabel:   "Aprobaciones",
  }),

  suggestions: (_) => ({
    impactLabel: "Optimización operativa disponible",
    riskLabel:   "Eficiencia reducida sin aplicar mejoras",
    urgency:     "Media",
    areaLabel:   "Operación general",
  }),

  opportunities: (_) => ({
    impactLabel: "12 clientes con potencial activo",
    riskLabel:   "Retraso en recaudo si no se actúa",
    urgency:     "Media",
    areaLabel:   "Cobranza",
  }),

  followups: (n) => ({
    impactLabel: `${n} compromisos sin confirmar`,
    riskLabel:   "Pérdida de seguimiento operativo",
    urgency:     n >= 3 ? "Alta" : "Media",
    areaLabel:   "Agenda",
  }),

  recentActivity: (_) => ({
    impactLabel: "Actividad completada sin incidentes",
    riskLabel:   "Bajo — operación estable",
    urgency:     "Baja",
    areaLabel:   "Conciliación",
  }),

  insights: (_) => ({
    impactLabel: "Hallazgos financieros relevantes detectados",
    riskLabel:   "Decisiones sin contexto completo",
    urgency:     "Media",
    areaLabel:   "Tesorería",
  }),
};

// ── Resolver ──────────────────────────────────────────────────────────────────

export function getExecutiveContext(
  category: DrawerCategoryKey,
  count:    number,
): ExecutiveContext {
  return EXECUTIVE_FIXTURES[category](count);
}
