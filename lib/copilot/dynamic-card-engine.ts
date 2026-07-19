/**
 * lib/copilot/dynamic-card-engine.ts
 *
 * Agentik Copilot — Dynamic Card Engine
 *
 * Sprint: AGENTIK-COPILOT-THREE-CARD-RAIL-01 — Block C
 *
 * Consumes the full internal pipeline (signals, intents, memory,
 * governance, runtime, execution, accountability) and produces
 * three condensed card payloads for the executive rail surface.
 *
 * PRINCIPLE: system complexity → executive simplicity.
 * All infrastructure exists and runs. Only the surface changes.
 */

// ── Card payload types ────────────────────────────────────────────────────────

export type InsightSentiment = "positive" | "neutral" | "warning" | "critical";

export interface OperationalInsightCard {
  headline:       string;           // "¡Todo en orden!" / "Señales detectadas"
  summary:        string;           // 1–2 lines of business context
  suggestion?:    string;           // Actionable suggestion label
  suggestionHref?: string;          // Target path
  sentiment:      InsightSentiment;
  // Optional mini KPI block (right side of card)
  kpiLabel?:      string;           // "Módulo activo"
  kpiValue?:      string;           // "SAG · ERP"
  kpiDelta?:      string;           // "Activo"
  kpiPositive?:   boolean;
}

export interface AlertCardItem {
  id:          string;
  title:       string;
  description: string;
  severity:    "critical" | "high" | "medium" | "low";
  href?:       string;
}

export interface AlertCard {
  count:        number;
  urgencyLabel: string;             // "Atención inmediata requerida" / "Sin alertas"
  items:        AlertCardItem[];    // Top 3
  viewAllHref:  string;
}

export interface TaskCardItem {
  id:      string;
  label:   string;
  dueLabel: string;                // "Hoy" | "Mañana" | "Esta semana" | date label
  urgency: "critical" | "elevated" | "normal";
  href:    string;
}

export interface TaskCard {
  count:       number;
  subtitle:    string;
  items:       TaskCardItem[];     // Top 5
  viewAllHref: string;
}

// ── Input types ───────────────────────────────────────────────────────────────

export interface CardEngineInput {
  orgSlug:      string;
  moduleLabel:  string;
  runtimeState: string;

  // Business signals
  signalCount:         number;
  criticalSignalCount: number;
  primarySignalTitle?: string;
  primarySignalDesc?:  string;

  // Intents & operations
  primaryIntentTitle?:     string;
  primaryIntentObjective?: string;
  primaryIntentPressure?:  string;

  // Contextual intelligence
  contextInsightText?:  string;
  continuityMarker?:    string;

  // Memory
  memoryPriority?:          string;
  memoryContinuityScore?:   number;

  // Execution
  hasSupervisedExec:         boolean;
  supervisedExecStatus?:     string;
  supervisedExecTitle?:      string;
  pendingApprovals:          number;

  // Accountability
  accountabilityPressure?: string;
  primaryAccountabilityTitle?: string;

  // Collaboration
  collaborationPressure?: string;

  // Alerts
  alertItems: Array<{
    id:    string;
    title: string;
    meta:  string;
    level: "CRITICAL" | "WARNING" | "INFO";
    href?: string;
  }>;
  incidentCount:    number;
  criticalIncidents: number;

  // Tasks
  taskItems: Array<{
    id:      string;
    label:   string;
    urgency: "critical" | "elevated" | "normal";
    href:    string;
  }>;
  totalTaskCount:   number;
  nextStepItems: Array<{
    label: string;
    href:  string;
  }>;
}

// ── Card builders ─────────────────────────────────────────────────────────────

/**
 * Resolves the OperationalInsightCard from all internal signals.
 * Priority: critical signals → supervised exec → intent → context → runtime → positive
 */
export function resolveOperationalInsight(input: CardEngineInput): OperationalInsightCard {
  const { orgSlug, moduleLabel, runtimeState } = input;

  // 1. Critical state
  if (input.criticalSignalCount > 0 || input.criticalIncidents > 0) {
    return {
      headline:   "Señales críticas detectadas",
      summary:    input.primarySignalDesc ?? input.primarySignalTitle ?? "Revisar señales activas de alta prioridad",
      suggestion: input.nextStepItems[0]?.label,
      suggestionHref: input.nextStepItems[0]?.href,
      sentiment:  "critical",
      kpiLabel:   "Señales",
      kpiValue:   String(input.signalCount),
      kpiPositive: false,
    };
  }

  // 2. Degraded runtime
  if (runtimeState === "DEGRADED" || runtimeState === "STALE") {
    return {
      headline:   "Contexto parcial — monitoreo activo",
      summary:    "El sistema opera con información actualizada parcialmente. Los datos críticos siguen disponibles.",
      suggestion: "Verificar sincronización de datos",
      sentiment:  "warning",
      kpiLabel:   "Runtime",
      kpiValue:   runtimeState === "DEGRADED" ? "Degradado" : "Desactualizado",
      kpiPositive: false,
    };
  }

  // 3. Supervised execution pending approval
  if (input.hasSupervisedExec && input.pendingApprovals > 0) {
    return {
      headline:   "Operación supervisada en curso",
      summary:    input.supervisedExecTitle ?? "Hay operaciones supervisadas esperando aprobación",
      suggestion: "Revisar y aprobar operación",
      suggestionHref: `/${orgSlug}/agentik`,
      sentiment:  "warning",
      kpiLabel:   "Aprobaciones",
      kpiValue:   String(input.pendingApprovals),
      kpiPositive: false,
    };
  }

  // 4. Accountability pressure
  if (input.accountabilityPressure === "urgent" || input.accountabilityPressure === "high") {
    return {
      headline:   "Seguimiento requerido",
      summary:    input.primaryAccountabilityTitle ?? "Hay operaciones con seguimiento pendiente",
      suggestion: input.nextStepItems[0]?.label,
      suggestionHref: input.nextStepItems[0]?.href,
      sentiment:  "warning",
    };
  }

  // 5. Active signals — elevated
  if (input.signalCount > 0) {
    return {
      headline:   "Señales operativas detectadas",
      summary:    input.primarySignalDesc ?? input.primaryIntentObjective ?? "Se detectaron señales en el módulo activo",
      suggestion: input.nextStepItems[0]?.label ?? input.primarySignalTitle,
      suggestionHref: input.nextStepItems[0]?.href,
      sentiment:  "neutral",
      kpiLabel:   "Señales activas",
      kpiValue:   String(input.signalCount),
      kpiPositive: true,
    };
  }

  // 6. Intent / context insight
  if (input.primaryIntentObjective || input.contextInsightText) {
    return {
      headline:   input.primaryIntentTitle ?? "Foco operativo activo",
      summary:    input.primaryIntentObjective ?? input.contextInsightText ?? "",
      suggestion: input.continuityMarker ?? input.nextStepItems[0]?.label,
      suggestionHref: input.nextStepItems[0]?.href,
      sentiment:  "neutral",
      kpiLabel:   moduleLabel,
      kpiValue:   "Activo",
      kpiPositive: true,
    };
  }

  // 7. Healthy — positive
  return {
    headline:   "Todo en orden",
    summary:    `${moduleLabel} opera con normalidad. Sistema estable y sin alertas activas.`,
    suggestion: input.nextStepItems[0]?.label,
    suggestionHref: input.nextStepItems[0]?.href,
    sentiment:  "positive",
    kpiLabel:   "Estado",
    kpiValue:   "Estable",
    kpiPositive: true,
  };
}

/**
 * Resolves the AlertCard from business alerts + incidents.
 */
export function resolvePriorityAlerts(input: CardEngineInput): AlertCard {
  const { orgSlug } = input;

  const items: AlertCardItem[] = [
    ...input.alertItems.slice(0, 3).map(a => ({
      id:          a.id,
      title:       a.title,
      description: a.meta,
      severity:    (a.level === "CRITICAL" ? "critical" : a.level === "WARNING" ? "high" : "medium") as AlertCardItem["severity"],
      href:        a.href ?? `/${orgSlug}/alerts`,
    })),
  ].slice(0, 4);

  const count = Math.max(input.alertItems.length, input.incidentCount);

  return {
    count,
    urgencyLabel: count === 0
      ? "Sin alertas activas"
      : input.criticalIncidents > 0 || items.some(i => i.severity === "critical")
        ? "Atención inmediata requerida"
        : "Alertas pendientes de revisión",
    items,
    viewAllHref: `/${orgSlug}/alerts`,
  };
}

/**
 * Resolves the TaskCard from tasks + supervised exec + next steps.
 */
export function resolveActiveTasks(input: CardEngineInput): TaskCard {
  const { orgSlug } = input;

  // Merge tasks + supervised exec item if pending
  const items: TaskCardItem[] = [];

  if (input.hasSupervisedExec && input.pendingApprovals > 0 && input.supervisedExecTitle) {
    items.push({
      id:       "supervised-exec",
      label:    input.supervisedExecTitle,
      dueLabel: "Hoy",
      urgency:  "critical",
      href:     `/${orgSlug}/agentik`,
    });
  }

  for (const t of input.taskItems.slice(0, 4)) {
    items.push({
      id:       t.id,
      label:    t.label,
      dueLabel: t.urgency === "critical" ? "Hoy" : t.urgency === "elevated" ? "Mañana" : "Próximo",
      urgency:  t.urgency,
      href:     t.href,
    });
  }

  // Pad with next steps if short
  if (items.length < 3) {
    for (const ns of input.nextStepItems.slice(0, 3 - items.length)) {
      items.push({
        id:       `ns-${ns.label}`,
        label:    ns.label,
        dueLabel: "Sugerido",
        urgency:  "normal",
        href:     ns.href,
      });
    }
  }

  const count = input.totalTaskCount + (input.hasSupervisedExec && input.pendingApprovals > 0 ? 1 : 0);

  return {
    count,
    subtitle: count === 0 ? "Sin tareas pendientes" : "Pendientes y próximas acciones",
    items: items.slice(0, 5),
    viewAllHref: `/${orgSlug}/agentik`,
  };
}

/**
 * Summarizes the full executive state in one sentence.
 */
export function summarizeExecutiveState(input: CardEngineInput): string {
  if (input.criticalSignalCount > 0) {
    return `${input.criticalSignalCount} señal${input.criticalSignalCount > 1 ? "es" : ""} crítica${input.criticalSignalCount > 1 ? "s" : ""} — atención requerida`;
  }
  if (input.pendingApprovals > 0) {
    return `${input.pendingApprovals} aprobación${input.pendingApprovals > 1 ? "es" : ""} pendiente${input.pendingApprovals > 1 ? "s" : ""}`;
  }
  if (input.signalCount > 0) {
    return `${input.signalCount} señal${input.signalCount > 1 ? "es" : ""} operativa${input.signalCount > 1 ? "s" : ""} activa${input.signalCount > 1 ? "s" : ""}`;
  }
  return "Sistema operando con normalidad";
}
