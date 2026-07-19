/**
 * lib/copilot/navigation/copilot-action-map.ts
 *
 * Agentik Copilot — Category → Navigation Action Map
 * Sprint: AGENTIK-COPILOT-NAVIGATION-REAL-01
 *
 * Maps each DrawerCategory to a primary CopilotNavigationTarget and a set of
 * secondary quick action mini-cards. All destinations are semantic targets —
 * never strings or hardcoded paths.
 *
 * Architecture boundary: no React, no UI, no router — pure data.
 */

import type { CopilotNavigationTarget }  from "./copilot-navigation";
import type { CopilotActionKind }         from "@/lib/copilot/actions/action-types";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DrawerCategoryKey =
  | "attention"
  | "activeWork"
  | "pendingApprovals"
  | "suggestions"
  | "opportunities"
  | "followups"
  | "recentActivity"
  | "insights";

export interface QuickAction {
  /** Short action title: "Crear tarea de revisión" */
  label:       string;
  /** One-sentence description of what this action does. */
  description: string;
  /**
   * Semantic navigation target.
   * Set when this action opens a module (OPEN_MODULE kind).
   * null when the action is executed via the action executor instead.
   */
  target:      CopilotNavigationTarget | null;
  /**
   * Action kind for stub execution.
   * When set and kind !== "OPEN_MODULE", the action executor is called
   * instead of the navigation layer.
   * Omit (or set to "OPEN_MODULE") for pure navigation actions.
   */
  actionKind?: CopilotActionKind;
}

export interface CategoryActionMap {
  /** Primary navigation target for this drawer category. */
  primaryTarget: CopilotNavigationTarget;
  /** Up to 3 secondary quick action mini-cards. */
  quickActions:  QuickAction[];
}

// ── Map ───────────────────────────────────────────────────────────────────────

export const COPILOT_ACTION_MAP: Record<DrawerCategoryKey, CategoryActionMap> = {
  attention: {
    primaryTarget: "CONCILIATION",
    quickActions: [
      {
        label:       "Crear tarea de revisión",
        description: "Registra una tarea de seguimiento asociada al hallazgo.",
        target:      null,
        actionKind:  "CREATE_TASK",
      },
      {
        label:       "Solicitar aprobación",
        description: "Genera una solicitud formal de aprobación para este hallazgo.",
        target:      null,
        actionKind:  "REQUEST_APPROVAL",
      },
      {
        label:       "Ir a Tesorería",
        description: "Valida el impacto en flujo de caja y posición bancaria.",
        target:      "TREASURY",
      },
    ],
  },

  activeWork: {
    primaryTarget: "CONCILIATION",
    quickActions: [
      {
        label:       "Ver en Tesorería",
        description: "Revisa el impacto de los procesos activos en liquidez.",
        target:      "TREASURY",
      },
      {
        label:       "Revisar cartera",
        description: "Abre el módulo de cartera para validar saldos activos.",
        target:      "PORTFOLIO",
      },
      {
        label:       "Generar informe",
        description: "Produce un resumen del estado operativo actual.",
        target:      null,
        actionKind:  "GENERATE_REPORT",
      },
    ],
  },

  pendingApprovals: {
    primaryTarget: "APPROVALS",
    quickActions: [
      {
        label:       "Solicitar aprobación",
        description: "Crea una solicitud de aprobación formal para el elemento detectado.",
        target:      null,
        actionKind:  "REQUEST_APPROVAL",
      },
      {
        label:       "Ver documentos adjuntos",
        description: "Consulta los soportes vinculados a esta aprobación.",
        target:      "DOCUMENTS",
      },
      {
        label:       "Ir a Conciliación",
        description: "Valida el contexto contable antes de autorizar.",
        target:      "CONCILIATION",
      },
    ],
  },

  suggestions: {
    primaryTarget: "CONCILIATION",
    quickActions: [
      {
        label:       "Ir a Tesorería",
        description: "Aplica la recomendación directamente en tesorería.",
        target:      "TREASURY",
      },
      {
        label:       "Guardar como tarea",
        description: "Convierte la recomendación en una tarea accionable.",
        target:      null,
        actionKind:  "CREATE_TASK",
      },
      {
        label:       "Ver reportes relacionados",
        description: "Consulta el contexto histórico que motivó la recomendación.",
        target:      "REPORTS",
      },
    ],
  },

  opportunities: {
    primaryTarget: "COMMERCIAL",
    quickActions: [
      {
        label:       "Revisar cartera",
        description: "Identifica clientes con saldo o potencial activo.",
        target:      "PORTFOLIO",
      },
      {
        label:       "Crear plan de acción",
        description: "Registra los pasos para capturar esta oportunidad.",
        target:      null,
        actionKind:  "CREATE_TASK",
      },
      {
        label:       "Ver en Marketing",
        description: "Abre el estudio de campañas relacionadas.",
        target:      "MARKETING_STUDIO",
      },
    ],
  },

  followups: {
    primaryTarget: "CALENDAR",
    quickActions: [
      {
        label:       "Crear tarea vinculada",
        description: "Asocia una tarea operativa al seguimiento activo.",
        target:      null,
        actionKind:  "CREATE_TASK",
      },
      {
        label:       "Ir a Conciliación",
        description: "Revisa el estado contable relacionado al seguimiento.",
        target:      "CONCILIATION",
      },
      {
        label:       "Generar informe",
        description: "Produce un resumen de los seguimientos del período.",
        target:      null,
        actionKind:  "GENERATE_REPORT",
      },
    ],
  },

  recentActivity: {
    primaryTarget: "CONCILIATION",
    quickActions: [
      {
        label:       "Ver resumen en Cierre",
        description: "Revisa cómo la actividad reciente impacta el cierre.",
        target:      "CLOSING",
      },
      {
        label:       "Exportar actividad",
        description: "Genera un reporte de las tareas completadas recientemente.",
        target:      null,
        actionKind:  "GENERATE_REPORT",
      },
      {
        label:       "Ver en Tesorería",
        description: "Valida el efecto de la actividad en posición de caja.",
        target:      "TREASURY",
      },
    ],
  },

  insights: {
    primaryTarget: "TREASURY",
    quickActions: [
      {
        label:       "Ir a Conciliación",
        description: "Valida los hallazgos contra movimientos de conciliación.",
        target:      "CONCILIATION",
      },
      {
        label:       "Ver en Planeación",
        description: "Incorpora los hallazgos al modelo de planeación financiera.",
        target:      "PLANNING",
      },
      {
        label:       "Generar informe",
        description: "Exporta los hallazgos en formato ejecutivo.",
        target:      null,
        actionKind:  "GENERATE_REPORT",
      },
    ],
  },
};
