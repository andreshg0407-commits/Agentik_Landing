/**
 * lib/copilot/compound-operations.ts
 *
 * Agentik Copilot — Compound Operations Engine V1
 *
 * Phases 1 + 2 of Sprint AGENTIK-COPILOT-COMPOUND-OPERATIONS-01
 *
 * Converts executive intents into structured multi-step operation plans.
 * A compound operation is a coordinated sequence of actions across modules
 * that the agent proposes to resolve a sustained executive intent.
 *
 * V1: deterministic, no DB, no real execution.
 * V2: persist to CopilotOperationLog, track step completion.
 */

import type { CopilotContextSnapshot }  from "./context-engine";
import type { ExecutiveIntent }          from "./executive-intent";
import type { ContextualRecommendation } from "./contextual-recommendation-engine";
import type { CrossModuleInsight }       from "./cross-module-intelligence";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CompoundOperationStatus =
  | "proposed"
  | "ready"
  | "blocked"
  | "monitoring"
  | "completed";

export type CompoundOperationPriority = "urgent" | "high" | "medium" | "low";

export type StepStatus    = "pending" | "ready" | "blocked" | "done";
export type StepImpact    = "low" | "medium" | "high" | "critical";
export type StepDifficulty = "trivial" | "low" | "medium" | "high";

export interface CompoundOperationStep {
  id:                  string;
  label:               string;
  description:         string;
  module:              string;
  actionId?:           string;         // Maps to execution-registry action ID
  requiresApproval:    boolean;
  estimatedImpact:     StepImpact;
  estimatedDifficulty: StepDifficulty;
  status:              StepStatus;
}

export interface CompoundOperation {
  id:                 string;
  orgSlug:            string;
  agentId:            string;
  title:              string;
  objective:          string;
  reason:             string;
  relatedIntentId:    string;
  involvedModules:    string[];
  priority:           CompoundOperationPriority;
  status:             CompoundOperationStatus;
  estimatedOutcome:   string;
  riskLevel:          "low" | "medium" | "high" | "critical";
  executionReadiness: "ready" | "partial" | "blocked";
  steps:              CompoundOperationStep[];
  createdAt:          Date;
}

// ── Agent-specific step builder ───────────────────────────────────────────────
// Each agent orchestrates with a distinct style (Phase 9: Persona Orchestration)

type StepBlueprint = Pick<
  CompoundOperationStep,
  "id" | "label" | "description" | "module" | "actionId" | "requiresApproval" | "estimatedImpact" | "estimatedDifficulty"
>;

const LIQUIDITY_STEPS: Record<string, StepBlueprint[]> = {
  diego: [
    { id: "liq-1", label: "Clasificar cartera vencida",         description: "Identificar clientes con deuda > 30 días y priorizar por monto.",                    module: "collections",           actionId: "navigate_to_collections",     requiresApproval: false, estimatedImpact: "high",   estimatedDifficulty: "low"    },
    { id: "liq-2", label: "Revisar consignaciones sin aplicar", description: "Validar consignaciones bancarias pendientes de conciliación.",                        module: "finanzas/conciliacion", actionId: "navigate_to_reconciliation",  requiresApproval: false, estimatedImpact: "high",   estimatedDifficulty: "medium" },
    { id: "liq-3", label: "Priorizar cobros críticos",          description: "Activar gestión directa de cartera con vencimientos críticos.",                       module: "collections",           actionId: "navigate_to_collections",     requiresApproval: false, estimatedImpact: "critical", estimatedDifficulty: "medium" },
    { id: "liq-4", label: "Confirmar runway de tesorería",      description: "Verificar días de cobertura real vs. umbral operacional mínimo.",                     module: "finanzas/tesoreria",    actionId: "navigate_to_treasury",        requiresApproval: false, estimatedImpact: "high",   estimatedDifficulty: "trivial" },
    { id: "liq-5", label: "Validar excepciones de conciliación","description": "Revisar excepciones críticas abiertas que afectan el saldo conciliado.",             module: "finanzas/conciliacion", actionId: "navigate_to_reconciliation",  requiresApproval: false, estimatedImpact: "medium", estimatedDifficulty: "medium" },
  ],
  luca: [
    { id: "liq-1", label: "Evaluar impacto en momentum",        description: "Relacionar presión de liquidez con velocidad de cierre de deals.",                    module: "finanzas/tesoreria",    requiresApproval: false, estimatedImpact: "medium", estimatedDifficulty: "low"    },
    { id: "liq-2", label: "Revisar cartera activa",             description: "Identificar clientes con deuda vencida y oportunidad de reenganche.",                 module: "collections",           requiresApproval: false, estimatedImpact: "high",   estimatedDifficulty: "medium" },
    { id: "liq-3", label: "Proponer campaña de reactivación",   description: "Diseñar propuesta de campaña enfocada en recuperación de cartera activa.",            module: "agentik/marketing-studio", requiresApproval: false, estimatedImpact: "medium", estimatedDifficulty: "medium" },
    { id: "liq-4", label: "Confirmar liquidez disponible",      description: "Validar saldo actual y proyección a 30 días.",                                        module: "finanzas/tesoreria",    requiresApproval: false, estimatedImpact: "high",   estimatedDifficulty: "trivial" },
  ],
  _default: [
    { id: "liq-1", label: "Revisar cartera vencida",            description: "Identificar deuda vencida y estado de cobros activos.",                               module: "collections",           requiresApproval: false, estimatedImpact: "high",   estimatedDifficulty: "low"    },
    { id: "liq-2", label: "Validar consignaciones pendientes",  description: "Confirmar consignaciones sin aplicar que afectan liquidez.",                          module: "finanzas/conciliacion", requiresApproval: false, estimatedImpact: "high",   estimatedDifficulty: "medium" },
    { id: "liq-3", label: "Confirmar estado de tesorería",      description: "Revisar cobertura y runway operacional.",                                             module: "finanzas/tesoreria",    requiresApproval: false, estimatedImpact: "medium", estimatedDifficulty: "trivial" },
  ],
};

const CLOSE_STEPS: Record<string, StepBlueprint[]> = {
  diego: [
    { id: "cls-1", label: "Revisar remisiones pendientes",      description: "Identificar remisiones sin documento soporte que bloquean cierre.",                   module: "finanzas/cierre",       requiresApproval: false, estimatedImpact: "high",   estimatedDifficulty: "medium" },
    { id: "cls-2", label: "Resolver excepciones críticas",      description: "Clasificar y resolver excepciones de conciliación que impiden cierre.",               module: "finanzas/conciliacion", actionId: "navigate_to_reconciliation", requiresApproval: true,  estimatedImpact: "critical", estimatedDifficulty: "high"   },
    { id: "cls-3", label: "Validar documentos bloqueados",      description: "Revisar facturas o notas crédito pendientes de validación.",                          module: "finanzas/cierre",       requiresApproval: false, estimatedImpact: "medium", estimatedDifficulty: "medium" },
    { id: "cls-4", label: "Confirmar cierre operativo",         description: "Ejecutar cierre una vez despejados todos los bloqueos identificados.",                 module: "finanzas/cierre",       requiresApproval: true,  estimatedImpact: "critical", estimatedDifficulty: "high"   },
  ],
  _default: [
    { id: "cls-1", label: "Revisar excepciones de conciliación","description": "Resolver excepciones críticas que bloquean el período.",                            module: "finanzas/conciliacion", requiresApproval: false, estimatedImpact: "critical", estimatedDifficulty: "high"   },
    { id: "cls-2", label: "Validar documentos pendientes",      description: "Confirmar facturas y remisiones requeridas.",                                          module: "finanzas/cierre",       requiresApproval: false, estimatedImpact: "medium", estimatedDifficulty: "medium" },
    { id: "cls-3", label: "Ejecutar cierre del período",        description: "Completar el cierre una vez despejados los bloqueos.",                                 module: "finanzas/cierre",       requiresApproval: true,  estimatedImpact: "critical", estimatedDifficulty: "high"   },
  ],
};

const COMMERCIAL_STEPS: Record<string, StepBlueprint[]> = {
  luca: [
    { id: "com-1", label: "Revisar caída de ventas",            description: "Identificar período y canales con menor rendimiento.",                                module: "sales",                 requiresApproval: false, estimatedImpact: "high",   estimatedDifficulty: "low"    },
    { id: "com-2", label: "Activar campaña correctiva",         description: "Proponer y activar campaña enfocada en segmento de mayor riesgo.",                    module: "agentik/marketing-studio", requiresApproval: false, estimatedImpact: "high",   estimatedDifficulty: "medium" },
    { id: "com-3", label: "Revisar conversaciones WhatsApp",    description: "Revisar leads activos en WhatsApp y priorizar respuestas.",                           module: "agentik",               requiresApproval: false, estimatedImpact: "medium", estimatedDifficulty: "low"    },
    { id: "com-4", label: "Confirmar pipeline actualizado",     description: "Validar oportunidades activas y etapas de avance.",                                   module: "pipeline",              requiresApproval: false, estimatedImpact: "medium", estimatedDifficulty: "trivial" },
  ],
  mila: [
    { id: "com-1", label: "Identificar oportunidades estancadas","description": "Revisar deals sin actividad en los últimos 7 días.",                               module: "pipeline",              requiresApproval: false, estimatedImpact: "high",   estimatedDifficulty: "low"    },
    { id: "com-2", label: "Activar seguimiento prioritario",    description: "Contactar leads de alto valor sin respuesta reciente.",                               module: "sales",                 requiresApproval: false, estimatedImpact: "high",   estimatedDifficulty: "medium" },
    { id: "com-3", label: "Revisar conversiones recientes",     description: "Confirmar cierres en proceso y sus probabilidades.",                                  module: "pipeline",              requiresApproval: false, estimatedImpact: "medium", estimatedDifficulty: "trivial" },
    { id: "com-4", label: "Proponer campaña de recuperación",   description: "Coordinar con Luca una campaña para reactivar oportunidades perdidas.",               module: "agentik/marketing-studio", requiresApproval: false, estimatedImpact: "medium", estimatedDifficulty: "medium" },
  ],
  _default: [
    { id: "com-1", label: "Revisar velocidad de ventas",        description: "Comparar período actual vs. promedio histórico.",                                     module: "sales",                 requiresApproval: false, estimatedImpact: "medium", estimatedDifficulty: "low"    },
    { id: "com-2", label: "Revisar campañas activas",           description: "Validar rendimiento de campañas en ejecución.",                                       module: "agentik/marketing-studio", requiresApproval: false, estimatedImpact: "medium", estimatedDifficulty: "trivial" },
    { id: "com-3", label: "Proponer acción correctiva",         description: "Diseñar respuesta al deterioro detectado.",                                           module: "agentik",               requiresApproval: false, estimatedImpact: "high",   estimatedDifficulty: "medium" },
  ],
};

const INTEGRATION_STEPS: Record<string, StepBlueprint[]> = {
  sofi: [
    { id: "int-1", label: "Auditar conectores activos",         description: "Verificar estado de cada conector y fuente de datos registrada.",                     module: "integrations",          requiresApproval: false, estimatedImpact: "high",   estimatedDifficulty: "low"    },
    { id: "int-2", label: "Forzar re-sincronización",           description: "Reiniciar el ciclo de sincronización en fuentes con estado STALE.",                   module: "integrations",          requiresApproval: false, estimatedImpact: "high",   estimatedDifficulty: "medium" },
    { id: "int-3", label: "Verificar fuentes de datos SAG",     description: "Confirmar que las fuentes SAG/PYA están sincronizando correctamente.",                 module: "integrations",          requiresApproval: false, estimatedImpact: "critical", estimatedDifficulty: "medium" },
    { id: "int-4", label: "Confirmar estabilidad de contexto",  description: "Validar que el motor de señales vuelve a estado HEALTHY.",                            module: "integrations",          requiresApproval: false, estimatedImpact: "high",   estimatedDifficulty: "trivial" },
  ],
  _default: [
    { id: "int-1", label: "Revisar fuentes con retraso",        description: "Identificar fuentes STALE o DEGRADED.",                                               module: "integrations",          requiresApproval: false, estimatedImpact: "high",   estimatedDifficulty: "low"    },
    { id: "int-2", label: "Forzar sincronización",              description: "Iniciar re-sincronización de fuentes críticas.",                                      module: "integrations",          requiresApproval: false, estimatedImpact: "high",   estimatedDifficulty: "medium" },
    { id: "int-3", label: "Confirmar estado del runtime",       description: "Validar que el motor de señales opera en estado HEALTHY.",                            module: "integrations",          requiresApproval: false, estimatedImpact: "medium", estimatedDifficulty: "trivial" },
  ],
};

const STABILITY_STEPS: Record<string, StepBlueprint[]> = {
  _default: [
    { id: "sta-1", label: "Revisar módulos operativos",         description: "Confirmar que todos los módulos activos reportan estado normal.",                     module: "executive",             requiresApproval: false, estimatedImpact: "low",    estimatedDifficulty: "trivial" },
    { id: "sta-2", label: "Revisar alertas abiertas",           description: "Clasificar y descartar alertas de bajo riesgo.",                                      module: "alerts",                requiresApproval: false, estimatedImpact: "low",    estimatedDifficulty: "trivial" },
    { id: "sta-3", label: "Confirmar integraciones activas",    description: "Verificar que todas las fuentes de datos están sincronizadas.",                       module: "integrations",          requiresApproval: false, estimatedImpact: "medium", estimatedDifficulty: "trivial" },
  ],
};

function getSteps(
  table:   Record<string, StepBlueprint[]>,
  agentId: string,
): CompoundOperationStep[] {
  const blueprints = table[agentId] ?? table["_default"] ?? [];
  return blueprints.map(b => ({ ...b, status: "pending" as StepStatus }));
}

// ── Operation rules ────────────────────────────────────────────────────────────

interface OperationRule {
  evaluate: (
    ctx:             CopilotContextSnapshot,
    intent:          ExecutiveIntent | null,
    insights:        CrossModuleInsight[],
    recommendations: ContextualRecommendation[],
  ) => CompoundOperation | null;
}

const OPERATION_RULES: OperationRule[] = [

  // ── Protect liquidity ──────────────────────────────────────────────────────
  {
    evaluate: (ctx, intent, insights) => {
      if (intent?.type !== "protect_liquidity") return null;

      const hasRecon     = insights.some(i => i.id === "recon-blocks-close" || i.id === "treasury-recon-pressure");
      const hasBudget    = insights.some(i => i.id === "budget-drains-treasury");
      const allSignals   = [...ctx.secondarySignals, ...(ctx.primarySignal ? [ctx.primarySignal] : [])];
      const hasTreasury  = allSignals.some(s => s.ruleId === "treasury.low_coverage");

      const riskLevel = (hasTreasury && hasRecon) || hasBudget ? "critical" :
                        hasTreasury                             ? "high"     : "medium";
      const priority: CompoundOperationPriority =
        riskLevel === "critical" ? "urgent" : riskLevel === "high" ? "high" : "medium";
      const readiness: CompoundOperation["executionReadiness"] =
        ctx.runtimeState === "DEGRADED" ? "blocked" :
        ctx.runtimeState === "STALE"    ? "partial"  : "ready";

      return {
        id:               `op-liquidity-${ctx.orgSlug}`,
        orgSlug:          ctx.orgSlug,
        agentId:          ctx.activeAgentId,
        title:            "Proteger liquidez operativa",
        objective:        "Reducir presión financiera identificando cobros, consignaciones y conciliaciones críticas.",
        reason:           "Señales activas de cobertura de caja baja y cartera vencida sin gestión.",
        relatedIntentId:  intent.id,
        involvedModules:  ["collections", "finanzas/tesoreria", "finanzas/conciliacion"],
        priority,
        status:           readiness === "blocked" ? "blocked" : "proposed",
        estimatedOutcome: "Reducir presión financiera y desbloquear flujo operativo.",
        riskLevel,
        executionReadiness: readiness,
        steps:            getSteps(LIQUIDITY_STEPS, ctx.activeAgentId),
        createdAt:        new Date(),
      };
    },
  },

  // ── Unblock financial close ────────────────────────────────────────────────
  {
    evaluate: (ctx, intent, insights) => {
      if (intent?.type !== "unblock_close") return null;

      const hasRecon = insights.some(i => i.id === "recon-blocks-close");
      const priority: CompoundOperationPriority = hasRecon ? "urgent" : "high";
      const readiness: CompoundOperation["executionReadiness"] =
        ctx.runtimeState === "DEGRADED" ? "blocked" : "partial";

      return {
        id:               `op-close-${ctx.orgSlug}`,
        orgSlug:          ctx.orgSlug,
        agentId:          ctx.activeAgentId,
        title:            "Preparar cierre financiero",
        objective:        "Resolver todos los bloqueos de conciliación y documentación para completar el cierre del período.",
        reason:           "El cierre financiero está bloqueado por excepciones críticas de conciliación.",
        relatedIntentId:  intent.id,
        involvedModules:  ["finanzas/cierre", "finanzas/conciliacion"],
        priority,
        status:           "blocked",
        estimatedOutcome: "Cierre del período ejecutado con todas las cuentas cuadradas.",
        riskLevel:        "critical",
        executionReadiness: readiness,
        steps:            getSteps(CLOSE_STEPS, ctx.activeAgentId),
        createdAt:        new Date(),
      };
    },
  },

  // ── Recover commercial rhythm ──────────────────────────────────────────────
  {
    evaluate: (ctx, intent) => {
      if (intent?.type !== "recover_commercial") return null;

      return {
        id:               `op-commercial-${ctx.orgSlug}`,
        orgSlug:          ctx.orgSlug,
        agentId:          ctx.activeAgentId,
        title:            "Recuperar ritmo comercial",
        objective:        "Activar campañas correctivas y priorizar seguimiento de oportunidades estancadas.",
        reason:           "El pipeline comercial requiere activación estratégica.",
        relatedIntentId:  intent.id,
        involvedModules:  ["sales", "pipeline", "agentik/marketing-studio"],
        priority:         "medium",
        status:           "proposed",
        estimatedOutcome: "Pipeline activo con al menos una campaña en ejecución y seguimiento de deals críticos.",
        riskLevel:        "low",
        executionReadiness: "ready",
        steps:            getSteps(COMMERCIAL_STEPS, ctx.activeAgentId),
        createdAt:        new Date(),
      };
    },
  },

  // ── Review integrations ────────────────────────────────────────────────────
  {
    evaluate: (ctx, intent) => {
      if (intent?.type !== "review_integrations") return null;

      const readiness: CompoundOperation["executionReadiness"] =
        ctx.runtimeState === "DEGRADED" ? "partial" : "ready";

      return {
        id:               `op-integrations-${ctx.orgSlug}`,
        orgSlug:          ctx.orgSlug,
        agentId:          ctx.activeAgentId,
        title:            "Revisar integraciones degradadas",
        objective:        "Restablecer sincronización de fuentes críticas y confirmar estabilidad del motor de señales.",
        reason:           `Runtime en estado ${ctx.runtimeState} — datos pueden ser imprecisos.`,
        relatedIntentId:  intent.id,
        involvedModules:  ["integrations"],
        priority:         "high",
        status:           "proposed",
        estimatedOutcome: "Runtime vuelve a HEALTHY con todas las fuentes sincronizadas.",
        riskLevel:        "medium",
        executionReadiness: readiness,
        steps:            getSteps(INTEGRATION_STEPS, ctx.activeAgentId),
        createdAt:        new Date(),
      };
    },
  },

  // ── Maintain stability ─────────────────────────────────────────────────────
  {
    evaluate: (ctx, intent) => {
      if (intent?.type !== "maintain_stability") return null;

      return {
        id:               `op-stability-${ctx.orgSlug}`,
        orgSlug:          ctx.orgSlug,
        agentId:          ctx.activeAgentId,
        title:            "Mantener operación estable",
        objective:        "Verificar estado de todos los módulos activos y confirmar normalidad operacional.",
        reason:           "Sin señales críticas — seguimiento rutinario de estabilidad.",
        relatedIntentId:  intent.id,
        involvedModules:  [ctx.activeModule, "alerts", "integrations"],
        priority:         "low",
        status:           "monitoring",
        estimatedOutcome: "Todos los módulos en estado saludable al cierre del día.",
        riskLevel:        "low",
        executionReadiness: "ready",
        steps:            getSteps(STABILITY_STEPS, ctx.activeAgentId),
        createdAt:        new Date(),
      };
    },
  },
];

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Computes compound operations from the full context pipeline.
 * The primary executive intent drives which operation plan is generated.
 * Only one operation per intent type is produced (single focus at a time).
 */
export function computeCompoundOperations(
  context:         CopilotContextSnapshot,
  primaryIntent:   ExecutiveIntent | null,
  recommendations: ContextualRecommendation[],
  insights:        CrossModuleInsight[],
): CompoundOperation[] {
  const PRIORITY_ORDER: Record<CompoundOperationPriority, number> = {
    urgent: 0, high: 1, medium: 2, low: 3,
  };

  return OPERATION_RULES
    .map(rule => rule.evaluate(context, primaryIntent, insights, recommendations))
    .filter((op): op is CompoundOperation => op !== null)
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}
