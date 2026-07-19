/**
 * lib/copilot/cross-module-intelligence.ts
 *
 * Agentik Copilot — Cross-Module Intelligence Engine V1
 *
 * Detects relationships and cascading effects between modules.
 * Produces CrossModuleInsight objects that inform the "Lectura contextual" section
 * and the contextual recommendation engine.
 *
 * V1 relationships covered:
 *   Finanzas ↔ Cobranza    — cartera vencida afecta liquidez
 *   Marketing ↔ Ventas     — campaña puede responder a caída comercial
 *   Operaciones ↔ Finanzas — inventario bloqueado afecta caja
 *   Ventas ↔ WhatsApp      — baja conversión → acción comercial urgente
 *   Conciliación ↔ Cierre  — excepciones bloquean cierre
 *   Tesorería ↔ Planeación — cobertura real diverge de plan
 *
 * Sprint: AGENTIK-COPILOT-CONTEXT-ORCHESTRATION-01
 */

import type { CopilotContextSnapshot } from "./context-engine";

// ── Cross-module insight type ──────────────────────────────────────────────────

export type InsightSeverity = "critical" | "elevated" | "normal";

export interface CrossModuleInsight {
  id:          string;
  title:       string;         // Short: "Riesgo de liquidez detectado"
  description: string;         // One sentence: what the cross-module pattern means
  sourceMods:  string[];       // Modules driving this insight
  targetMods:  string[];       // Modules downstream-affected
  severity:    InsightSeverity;
  confidence:  number;         // 0–100
  actionHint:  string;         // Short recommended focus: "Revisar cobros del día"
  whyNow:      string;         // Why this matters right now in context
}

// ── Insight rule type ──────────────────────────────────────────────────────────

interface InsightRule {
  id:       string;
  evaluate: (ctx: CopilotContextSnapshot) => CrossModuleInsight | null;
}

// ── Insight rules registry ─────────────────────────────────────────────────────

const INSIGHT_RULES: InsightRule[] = [

  // ── Rule 1: Reconciliation exceptions → close blocked ────────────────────
  {
    id: "recon-blocks-close",
    evaluate: (ctx) => {
      const hasReconSignal  = ctx.secondarySignals.concat(ctx.primarySignal ?? [])
        .some(s => s.ruleId === "reconciliation.pending_critical");
      const hasCloseSignal  = ctx.secondarySignals.concat(ctx.primarySignal ?? [])
        .some(s => s.ruleId === "financial_close.blocked");

      if (!hasReconSignal && !hasCloseSignal) return null;

      const isBoth    = hasReconSignal && hasCloseSignal;
      const severity: InsightSeverity = isBoth ? "critical" : "elevated";

      return {
        id:          "recon-blocks-close",
        title:       "Conciliación bloquea el cierre financiero",
        description: "Las excepciones abiertas en conciliación impiden completar el cierre del período.",
        sourceMods:  ["finanzas/conciliacion"],
        targetMods:  ["finanzas/cierre", "executive"],
        severity,
        confidence:  isBoth ? 95 : 78,
        actionHint:  "Resolver excepciones críticas en Conciliación",
        whyNow:      isBoth
          ? "Ambas señales activas simultáneamente — cierre completamente bloqueado"
          : "La señal activa indica riesgo directo sobre el cierre del período",
      };
    },
  },

  // ── Rule 2: Treasury low + reconciliation pending ──────────────────────────
  {
    id: "treasury-recon-pressure",
    evaluate: (ctx) => {
      const hasTreasury = ctx.secondarySignals.concat(ctx.primarySignal ?? [])
        .some(s => s.ruleId === "treasury.low_coverage");
      const hasRecon    = ctx.secondarySignals.concat(ctx.primarySignal ?? [])
        .some(s => s.ruleId === "reconciliation.pending_critical");

      if (!hasTreasury || !hasRecon) return null;

      return {
        id:          "treasury-recon-pressure",
        title:       "Liquidez comprometida + conciliación pendiente",
        description: "La cobertura de caja está en riesgo mientras hay cobros sin aplicar en conciliación.",
        sourceMods:  ["finanzas/tesoreria", "finanzas/conciliacion"],
        targetMods:  ["finanzas/cierre", "finanzas/planeacion"],
        severity:    "critical",
        confidence:  90,
        actionHint:  "Priorizar conciliación para liberar cobros aplicados",
        whyNow:      "Resolver conciliación puede mejorar el saldo real de tesorería",
      };
    },
  },

  // ── Rule 3: Budget over-execution + treasury low ───────────────────────────
  {
    id: "budget-drains-treasury",
    evaluate: (ctx) => {
      const hasBudget   = ctx.secondarySignals.concat(ctx.primarySignal ?? [])
        .some(s => s.ruleId === "budget.velocity_exceeded");
      const hasTreasury = ctx.secondarySignals.concat(ctx.primarySignal ?? [])
        .some(s => s.ruleId === "treasury.low_coverage");

      if (!hasBudget || !hasTreasury) return null;

      return {
        id:          "budget-drains-treasury",
        title:       "Ejecución presupuestal acelera agotamiento de liquidez",
        description: "El ritmo de gasto supera el plan mientras la cobertura de caja es baja.",
        sourceMods:  ["finanzas/planeacion"],
        targetMods:  ["finanzas/tesoreria", "finanzas/cierre"],
        severity:    "critical",
        confidence:  88,
        actionHint:  "Revisar y frenar compromisos variables del período",
        whyNow:      "La combinación de ambas señales crea presión financiera convergente",
      };
    },
  },

  // ── Rule 4: Single treasury signal (standalone) ────────────────────────────
  {
    id: "treasury-standalone",
    evaluate: (ctx) => {
      const allSignals = ctx.secondarySignals.concat(ctx.primarySignal ?? []);
      const hasTreasury = allSignals.some(s => s.ruleId === "treasury.low_coverage");
      const hasOther    = allSignals.some(s => s.ruleId !== "treasury.low_coverage");

      // Only fire when treasury is the ONLY signal (otherwise rule 2 or 3 catches it)
      if (!hasTreasury || hasOther) return null;

      return {
        id:          "treasury-standalone",
        title:       "Cobertura de caja requiere atención",
        description: "La liquidez operacional está por debajo del umbral recomendado.",
        sourceMods:  ["finanzas/tesoreria"],
        targetMods:  ["finanzas/cierre", "finanzas/planeacion"],
        severity:    "elevated",
        confidence:  82,
        actionHint:  "Revisar cobros del día y consignaciones pendientes",
        whyNow:      ctx.activeModule.startsWith("finanzas")
          ? "Estás en el módulo financiero — este es el momento de actuar"
          : "La cobertura de caja afecta la operación de todos los módulos",
      };
    },
  },

  // ── Rule 5: Marketing → Sales (commercial pressure) ───────────────────────
  // V1: commercial signals not yet live — fires only when commercial context detected
  {
    id: "marketing-supports-sales",
    evaluate: (ctx) => {
      // Only relevant when user is in commercial modules
      const inCommercial = ctx.activeModule.startsWith("sales")
        || ctx.activeModule.startsWith("pipeline")
        || ctx.activeModule.startsWith("comercial");

      if (!inCommercial) return null;
      // No active signals needed — fires as proactive cross-module awareness
      if (ctx.operationalPriority !== "idle" && ctx.operationalPriority !== "normal") return null;

      return {
        id:          "marketing-supports-sales",
        title:       "Marketing puede apoyar el pipeline comercial",
        description: "Una campaña activa puede acelerar el cierre de oportunidades estancadas en el pipeline.",
        sourceMods:  ["agentik/marketing-studio"],
        targetMods:  ["sales", "pipeline"],
        severity:    "normal",
        confidence:  65,
        actionHint:  "Revisar campañas activas en Marketing Studio",
        whyNow:      "El pipeline comercial se beneficia de activación de marketing en este período",
      };
    },
  },

  // ── Rule 6: Stale runtime → data quality risk ─────────────────────────────
  {
    id: "stale-data-risk",
    evaluate: (ctx) => {
      if (ctx.runtimeState !== "STALE" && ctx.runtimeState !== "DEGRADED") return null;

      return {
        id:          "stale-data-risk",
        title:       "Datos del contexto desactualizados",
        description: "El motor de señales está en estado degradado — algunas métricas pueden no reflejar la realidad actual.",
        sourceMods:  ["integrations"],
        targetMods:  ["finanzas/tesoreria", "finanzas/conciliacion", "executive"],
        severity:    "elevated",
        confidence:  85,
        actionHint:  "Revisar estado de integraciones y re-sincronizar",
        whyNow:      ctx.runtimeState === "DEGRADED"
          ? "El contexto está degradado — las recomendaciones pueden ser imprecisas"
          : "Los datos están desactualizados — espera sincronización o fuerza re-sync",
      };
    },
  },
];

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Computes cross-module insights from the current operational context snapshot.
 * Returns insights sorted by severity: critical → elevated → normal.
 * V1: deterministic, no LLM, pure rule evaluation.
 */
export function computeCrossModuleInsights(
  context: CopilotContextSnapshot,
): CrossModuleInsight[] {
  const PRIORITY: Record<InsightSeverity, number> = { critical: 0, elevated: 1, normal: 2 };

  return INSIGHT_RULES
    .map(rule => rule.evaluate(context))
    .filter((i): i is CrossModuleInsight => i !== null)
    .sort((a, b) => PRIORITY[a.severity] - PRIORITY[b.severity]);
}

/**
 * Returns the single most relevant insight for the "Lectura contextual" section.
 * Prioritizes insights whose targetMods include the active module.
 */
export function getPrimaryInsight(
  context:  CopilotContextSnapshot,
  insights: CrossModuleInsight[],
): CrossModuleInsight | null {
  if (insights.length === 0) return null;

  // Prefer insights relevant to the active module
  const moduleRelevant = insights.find(i =>
    i.targetMods.some(m => context.activeModule.startsWith(m) || m.startsWith(context.activeModule)) ||
    i.sourceMods.some(m => context.activeModule.startsWith(m) || m.startsWith(context.activeModule))
  );

  return moduleRelevant ?? insights[0] ?? null;
}
