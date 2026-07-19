/**
 * lib/copilot/next-step-engine.ts
 *
 * Agentik Copilot — Contextual Next Step Engine V1
 *
 * Replaces the static computeNextSteps() function in right-ops-rail.tsx.
 * Next steps are now derived from ACTUAL signal evidence + operational context,
 * not from the current module path alone.
 *
 * Priority hierarchy:
 *   1. Signal-driven steps (specific, evidence-based)
 *   2. Context-driven steps (from OperationalContext state)
 *   3. Module-fallback steps (if no signal or context match)
 *
 * Each step has a reason — why Copilot suggests this specific action now.
 * This reason is used internally (not shown in V1 UI, but ready for V2).
 *
 * Sprint: AGENTIK-COPILOT-SIGNAL-ENGINE-01
 */

import type { OperationalContext } from "./context-engine";
import type { PrioritizedSignal }  from "./priority-engine";

// ── Output type ───────────────────────────────────────────────────────────────

export interface NextOperationalStep {
  label:    string;   // Short actionable label for the UI
  href:     string;   // Full resolved URL
  reason:   string;   // Why Copilot suggests this now (internal, for V2 display)
  priority: "critical" | "elevated" | "normal";
}

// ── Step factories ────────────────────────────────────────────────────────────

type StepFactory = (orgSlug: string, ctx: OperationalContext) => NextOperationalStep | null;

/** Signal-driven steps: fire based on evidence in OperationalContext.finance */
const SIGNAL_DRIVEN_FACTORIES: StepFactory[] = [

  // Critical close blockage
  (orgSlug, ctx) => {
    if (!ctx.finance.blockedClose || ctx.finance.closeBlockedDays < 7) return null;
    return {
      label:    "Resolver excepciones críticas en Conciliación",
      href:     `/${orgSlug}/finanzas/conciliacion`,
      reason:   `El cierre está bloqueado hace ${ctx.finance.closeBlockedDays} días por excepciones sin resolver`,
      priority: ctx.finance.closeBlockedDays >= 14 ? "critical" : "elevated",
    };
  },

  // Treasury below 15 days runway
  (orgSlug, ctx) => {
    if (ctx.finance.runwayDays >= 15) return null;
    return {
      label:    "Revisar y priorizar cobros del día",
      href:     `/${orgSlug}/finanzas/cobros-hoy`,
      reason:   `Cobertura de caja en ${ctx.finance.runwayDays} días — cobros urgentes`,
      priority: "critical",
    };
  },

  // Treasury between 15–30 days (at risk)
  (orgSlug, ctx) => {
    if (ctx.finance.runwayDays >= 30 || ctx.finance.runwayDays < 15) return null;
    return {
      label:    "Revisar cobertura de caja actual",
      href:     `/${orgSlug}/finanzas/tesoreria`,
      reason:   `Cobertura de ${ctx.finance.runwayDays} días está por debajo del umbral objetivo de 30 días`,
      priority: "elevated",
    };
  },

  // Budget over-executing (>115%)
  (orgSlug, ctx) => {
    if (ctx.finance.budgetVelocityRatio < 1.15) return null;
    return {
      label:    "Corregir desviación presupuestal al alza",
      href:     `/${orgSlug}/finanzas/planeacion`,
      reason:   `Ejecución presupuestal al ${Math.round(ctx.finance.budgetVelocityRatio * 100)}% del ritmo planificado`,
      priority: "elevated",
    };
  },

  // Budget under-executing (<65%)
  (orgSlug, ctx) => {
    if (ctx.finance.budgetVelocityRatio >= 0.65) return null;
    return {
      label:    "Revisar subejección presupuestal",
      href:     `/${orgSlug}/finanzas/planeacion`,
      reason:   `Ejecución presupuestal al ${Math.round(ctx.finance.budgetVelocityRatio * 100)}% — riesgo de cierre con subejección`,
      priority: "normal",
    };
  },

  // Many pending reconciliations
  (orgSlug, ctx) => {
    if (ctx.finance.pendingConciliations < 3) return null;
    return {
      label:    "Validar cobros identificados pendientes",
      href:     `/${orgSlug}/finanzas/cobros-identificados`,
      reason:   `${ctx.finance.pendingConciliations} excepciones críticas abiertas en conciliación`,
      priority: ctx.finance.pendingConciliations >= 5 ? "elevated" : "normal",
    };
  },

  // Blocked close → validate documents
  (orgSlug, ctx) => {
    if (!ctx.finance.blockedClose) return null;
    return {
      label:    "Confirmar documentos del período",
      href:     `/${orgSlug}/finanzas/documentos`,
      reason:   "El cierre bloqueado requiere validación de documentos del período",
      priority: "normal",
    };
  },
];

/** Module-fallback steps: contextual suggestions when no signals are active */
function getFallbackSteps(pathname: string, orgSlug: string): NextOperationalStep[] {
  const segs = pathname.split("/").filter(Boolean).slice(1);
  const path = segs.join("/");

  if (path.startsWith("finanzas/tesoreria")) return [
    { label: "Ver cobros del día",                  href: `/${orgSlug}/finanzas/cobros-hoy`,          reason: "Módulo activo",    priority: "normal" },
    { label: "Revisar consignaciones bancarias",    href: `/${orgSlug}/finanzas/consignaciones`,       reason: "Módulo activo",    priority: "normal" },
    { label: "Consultar plan de pagos",             href: `/${orgSlug}/finanzas/cuentas-por-pagar`,    reason: "Módulo activo",    priority: "normal" },
  ];
  if (path.startsWith("finanzas/conciliacion")) return [
    { label: "Revisar excepciones abiertas",        href: `/${orgSlug}/finanzas/conciliacion`,         reason: "Módulo activo",    priority: "normal" },
    { label: "Validar cobros identificados",        href: `/${orgSlug}/finanzas/cobros-identificados`, reason: "Módulo activo",    priority: "normal" },
    { label: "Revisar consignaciones bancarias",    href: `/${orgSlug}/finanzas/consignaciones`,       reason: "Módulo activo",    priority: "normal" },
  ];
  if (path.startsWith("finanzas/cierre")) return [
    { label: "Validar estado de conciliación",      href: `/${orgSlug}/finanzas/conciliacion`,         reason: "Módulo activo",    priority: "normal" },
    { label: "Revisar saldo de tesorería",          href: `/${orgSlug}/finanzas/tesoreria`,            reason: "Módulo activo",    priority: "normal" },
    { label: "Confirmar documentos del período",    href: `/${orgSlug}/finanzas/documentos`,           reason: "Módulo activo",    priority: "normal" },
  ];
  if (path.startsWith("finanzas/planeacion")) return [
    { label: "Comparar real vs. presupuesto",       href: `/${orgSlug}/finanzas/planeacion`,           reason: "Módulo activo",    priority: "normal" },
    { label: "Actualizar proyección de cobros",     href: `/${orgSlug}/finanzas/tesoreria`,            reason: "Módulo activo",    priority: "normal" },
    { label: "Ver reporte ejecutivo",               href: `/${orgSlug}/executive`,                     reason: "Módulo activo",    priority: "normal" },
  ];
  return [
    { label: "Torre de Control",                    href: `/${orgSlug}/executive`,                     reason: "Vista general",    priority: "normal" },
    { label: "Revisar alertas operacionales",       href: `/${orgSlug}/alerts`,                        reason: "Alertas activas",  priority: "normal" },
    { label: "Panel financiero",                    href: `/${orgSlug}/finanzas/tesoreria`,             reason: "Acceso directo",   priority: "normal" },
  ];
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Computes the top 3 contextual next steps for the operator.
 * Steps are derived from signal evidence and operational context,
 * not from the current URL alone.
 */
export function computeNextOperationalSteps(
  prioritized: PrioritizedSignal[],
  context:     OperationalContext,
  pathname:    string,
  orgSlug:     string,
): NextOperationalStep[] {
  const PRIORITY_ORDER = { critical: 0, elevated: 1, normal: 2 };

  // ── 1. Collect signal-driven steps ────────────────────────────────────────
  const signalDriven: NextOperationalStep[] = SIGNAL_DRIVEN_FACTORIES
    .map(factory => factory(orgSlug, context))
    .filter((s): s is NextOperationalStep => s !== null)
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

  // ── 2. Fill remaining with fallback steps (up to 3 total) ─────────────────
  const remaining = Math.max(0, 3 - signalDriven.length);
  const fallback  = remaining > 0 ? getFallbackSteps(pathname, orgSlug).slice(0, remaining) : [];

  // Deduplicate by href
  const seen = new Set<string>();
  const all  = [...signalDriven, ...fallback].filter(s => {
    if (seen.has(s.href)) return false;
    seen.add(s.href);
    return true;
  });

  return all.slice(0, 3);
}
