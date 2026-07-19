/**
 * lib/copilot/navigation/get-primary-action.ts
 *
 * Agentik Copilot — Primary Action Resolver
 * Sprint: AGENTIK-COPILOT-NAVIGATION-REAL-01
 *
 * Given an open drawer category and a count, resolves the primary recommended
 * action the agent surfaces to the user. Returns a fully typed PrimaryAction
 * object ready for UI consumption.
 *
 * Architecture boundary: no React, no UI, no router — pure data.
 */

import {
  NAVIGATION_META,
  type CopilotNavigationTarget,
}                           from "./copilot-navigation";
import {
  COPILOT_ACTION_MAP,
  type DrawerCategoryKey,
  type QuickAction,
}                           from "./copilot-action-map";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActionPriority = "critical" | "high" | "normal";

export interface PrimaryAction {
  /** Short imperative title: "Revisar excepciones pendientes" */
  title:        string;
  /** One-sentence explanation displayed below the title. */
  description:  string;
  /** CTA button label — derived from NAVIGATION_META[target].label. */
  ctaLabel:     string;
  /** Semantic navigation target for the primary CTA. */
  target:       CopilotNavigationTarget;
  /** Visual priority — affects accent and urgency indicators. */
  priority:     ActionPriority;
  /** Up to 3 secondary quick action mini-cards. */
  quickActions: QuickAction[];
}

// ── Per-category copy ─────────────────────────────────────────────────────────

interface ActionCopy {
  title:       (count: number, agentName: string) => string;
  description: (count: number) => string;
  priority:    (count: number) => ActionPriority;
}

const ACTION_COPY: Record<DrawerCategoryKey, ActionCopy> = {
  attention: {
    title:       (n, _) => n > 1 ? `Revisar ${n} excepciones pendientes` : "Revisar excepción pendiente",
    description: (n)    => n > 1
      ? "Existen movimientos que requieren validación manual antes del próximo cierre."
      : "Hay un movimiento que requiere validación manual antes del próximo cierre.",
    priority:    (n)    => n >= 3 ? "critical" : n >= 1 ? "high" : "normal",
  },
  activeWork: {
    title:       (_, agent) => `Ver progreso de ${agent}`,
    description: (_)        => "El agente está procesando operaciones en tiempo real. Puedes revisar el avance en el módulo correspondiente.",
    priority:    (_)        => "normal",
  },
  pendingApprovals: {
    title:       (n, _) => n > 1 ? `Autorizar ${n} acciones en espera` : "Autorizar acción en espera",
    description: (n)    => n > 1
      ? "Estas acciones están bloqueadas hasta recibir tu autorización."
      : "Esta acción está bloqueada hasta recibir tu autorización.",
    priority:    (n)    => n >= 2 ? "high" : "normal",
  },
  suggestions: {
    title:       (n, agent) => n > 1 ? `Revisar recomendaciones de ${agent}` : `Revisar recomendación de ${agent}`,
    description: (_)        => "El agente preparó recomendaciones contextuales basadas en el estado operativo actual.",
    priority:    (_)        => "normal",
  },
  opportunities: {
    title:       (n, _) => n > 1 ? `Explorar ${n} oportunidades detectadas` : "Explorar oportunidad detectada",
    description: (n)    => n > 1
      ? "El agente identificó áreas con potencial de mejora operativa o comercial."
      : "El agente identificó un área con potencial de mejora operativa o comercial.",
    priority:    (_)    => "normal",
  },
  followups: {
    title:       (n, _) => n > 1 ? `Confirmar ${n} seguimientos programados` : "Confirmar seguimiento programado",
    description: (_)    => "Hay seguimientos activos que requieren tu confirmación o reprogramación.",
    priority:    (n)    => n >= 3 ? "high" : "normal",
  },
  recentActivity: {
    title:       (_, agent) => `Revisar actividad reciente de ${agent}`,
    description: (n)        => n > 1
      ? `El agente completó ${n} tareas. Puedes revisar el detalle o exportar el resumen.`
      : "El agente completó una tarea. Puedes revisar el detalle o exportar el resumen.",
    priority:    (_)        => "normal",
  },
  insights: {
    title:       (n, _) => n > 1 ? `Revisar ${n} hallazgos del contexto` : "Revisar hallazgo del contexto",
    description: (_)    => "El agente analizó el contexto operativo y encontró hallazgos relevantes para la toma de decisiones.",
    priority:    (n)    => n >= 2 ? "high" : "normal",
  },
};

// ── Resolver ──────────────────────────────────────────────────────────────────

export function getPrimaryAction(
  category:  DrawerCategoryKey,
  count:     number,
  agentName: string,
): PrimaryAction {
  const copy      = ACTION_COPY[category];
  const actionMap = COPILOT_ACTION_MAP[category];
  const meta      = NAVIGATION_META[actionMap.primaryTarget];

  return {
    title:        copy.title(count, agentName),
    description:  copy.description(count),
    ctaLabel:     meta.label,
    target:       actionMap.primaryTarget,
    priority:     copy.priority(count),
    quickActions: actionMap.quickActions,
  };
}
