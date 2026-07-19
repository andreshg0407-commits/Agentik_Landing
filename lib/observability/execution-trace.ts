/**
 * lib/observability/execution-trace.ts
 *
 * Agentik — Execution Trace V1
 *
 * Block C of Sprint AGENTIK-RUNTIME-ORCHESTRATION-GATEWAY-OBSERVABILITY-01
 *
 * Builds a distributed trace of a Copilot execution session.
 * Each trace captures the full pipeline: signals → context → intents →
 * operations → governance → execution → dispatch → completion.
 *
 * V1: in-memory, derived from server pipeline state.
 * V4: persisted to Prisma.CopilotExecutionTrace + external APM.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type TraceSpanStatus =
  | "ok"       // Span completed successfully
  | "warning"  // Completed with warnings
  | "error"    // Span failed
  | "skipped"  // Not executed in this session
  | "pending"; // Waiting

export interface TraceSpan {
  id:         string;
  name:       string;         // Pipeline stage name
  status:     TraceSpanStatus;
  durationMs: number;         // V1: approximate / simulated
  summary:    string;
  metadata?:  Record<string, unknown>;
}

export interface ExecutionTrace {
  traceId:      string;
  orgSlug:      string;
  agentId:      string;
  sessionId:    string;
  startedAt:    string;       // ISO string
  spans:        TraceSpan[];
  overallStatus: TraceSpanStatus;
  summary:      string;
}

// ── Builder ────────────────────────────────────────────────────────────────────

/**
 * Builds an execution trace from the current server-side pipeline state.
 */
export function buildExecutionTrace(params: {
  orgSlug:              string;
  agentId:              string;
  runtimeState:         string;
  hasSignals:           boolean;
  hasIntents:           boolean;
  hasOperations:        boolean;
  hasBundle:            boolean;
  hasExecution:         boolean;
  governanceAllowed:    boolean;
  integrationReady:     boolean;
  // V2 — vault + connector + dispatch + replay
  vaultHealth?:         string;   // "secure" | "warning" | "critical" | "empty"
  vaultValidated?:      boolean;
  connectorReadyCount?: number;
  connectorTotalCount?: number;
  dispatchReady?:       boolean;
  hasReplayRef?:        boolean;
  replayId?:            string;
}): ExecutionTrace {
  const {
    orgSlug, agentId, runtimeState, hasSignals, hasIntents,
    hasOperations, hasBundle, hasExecution, governanceAllowed, integrationReady,
    vaultHealth, vaultValidated, connectorReadyCount, connectorTotalCount,
    dispatchReady, hasReplayRef, replayId,
  } = params;

  const spans: TraceSpan[] = [
    {
      id:         "span-signals",
      name:       "Signal Engine",
      status:     runtimeState === "DEGRADED" ? "warning" : hasSignals ? "ok" : "ok",
      durationMs: 12,
      summary:    hasSignals ? "Señales evaluadas" : "Sin señales activas",
    },
    {
      id:         "span-context",
      name:       "Context Engine",
      status:     "ok",
      durationMs: 3,
      summary:    "Contexto operativo construido",
    },
    {
      id:         "span-memory",
      name:       "Strategic Memory",
      status:     "ok",
      durationMs: 2,
      summary:    "Memoria estratégica cargada",
    },
    {
      id:         "span-intents",
      name:       "Executive Intents",
      status:     hasIntents ? "ok" : "skipped",
      durationMs: hasIntents ? 4 : 0,
      summary:    hasIntents ? "Intenciones ejecutivas resueltas" : "Sin intenciones activas",
    },
    {
      id:         "span-operations",
      name:       "Compound Operations",
      status:     hasOperations ? "ok" : "skipped",
      durationMs: hasOperations ? 6 : 0,
      summary:    hasOperations ? "Operaciones compuestas planificadas" : "Sin operaciones activas",
    },
    {
      id:         "span-capabilities",
      name:       "Capability Resolution",
      status:     "ok",
      durationMs: 2,
      summary:    "Capacidades del agente resueltas",
    },
    {
      id:         "span-governance",
      name:       "Execution Governance",
      status:     governanceAllowed ? "ok" : "warning",
      durationMs: 3,
      summary:    governanceAllowed ? "Gobernanza: ejecución permitida" : "Gobernanza: restricciones activas",
    },
    {
      id:         "span-bundle",
      name:       "Execution Bundle",
      status:     hasBundle ? "ok" : "skipped",
      durationMs: hasBundle ? 5 : 0,
      summary:    hasBundle ? "Bundle de ejecución preparado" : "Sin bundle activo",
    },
    {
      id:         "span-execution",
      name:       "Supervised Execution",
      status:     hasExecution ? "ok" : "skipped",
      durationMs: hasExecution ? 8 : 0,
      summary:    hasExecution ? "Ejecución supervisada preparada" : "Sin ejecución activa",
    },
    {
      id:         "span-gateway",
      name:       "Integration Gateway",
      status:     integrationReady ? "ok" : "warning",
      durationMs: integrationReady ? 2 : 1,
      summary:    integrationReady ? "Gateway: integraciones listas" : "Gateway: sin integraciones configuradas",
    },
    {
      id:         "span-vault",
      name:       "Vault Validation",
      status:     vaultHealth === "critical" ? "error"
                : vaultHealth === "warning"  ? "warning"
                : vaultValidated             ? "ok"
                : "skipped",
      durationMs: vaultValidated ? 4 : 0,
      summary:    vaultHealth === "critical" ? "Vault crítico — secretos bloqueados"
                : vaultHealth === "warning"  ? "Vault con advertencias — rotación recomendada"
                : vaultValidated             ? "Vault validado — secretos activos"
                : "Vault no evaluado",
      metadata: vaultHealth ? { health: vaultHealth } : undefined,
    },
    {
      id:         "span-connectors",
      name:       "Connector Readiness",
      status:     connectorReadyCount !== undefined && connectorTotalCount !== undefined
                    ? connectorReadyCount === 0       ? "warning"
                    : connectorReadyCount < (connectorTotalCount ?? 1) ? "warning"
                    : "ok"
                  : "skipped",
      durationMs: connectorReadyCount !== undefined ? 3 : 0,
      summary:    connectorReadyCount !== undefined && connectorTotalCount !== undefined
                    ? `${connectorReadyCount}/${connectorTotalCount} conectores listos`
                  : "Conectores no evaluados",
      metadata:   connectorReadyCount !== undefined
                    ? { readyCount: connectorReadyCount, totalCount: connectorTotalCount }
                    : undefined,
    },
    {
      id:         "span-dispatch",
      name:       "Dispatch Readiness",
      status:     dispatchReady === true  ? "ok"
                : dispatchReady === false ? "warning"
                : "skipped",
      durationMs: dispatchReady !== undefined ? 2 : 0,
      summary:    dispatchReady === true  ? "Despacho supervisado disponible"
                : dispatchReady === false ? "Despacho bloqueado — condiciones no cumplidas"
                : "Despacho no evaluado",
    },
    {
      id:         "span-replay",
      name:       "Replay Reference",
      status:     hasReplayRef ? "ok" : "skipped",
      durationMs: hasReplayRef ? 1 : 0,
      summary:    hasReplayRef
                    ? `Replay disponible${replayId ? ` — ${replayId}` : ""}`
                  : "Sin referencia de replay",
      metadata:   replayId ? { replayId } : undefined,
    },
  ];

  const errorSpans   = spans.filter(s => s.status === "error");
  const warningSpans = spans.filter(s => s.status === "warning");

  const overallStatus: TraceSpanStatus =
    errorSpans.length > 0   ? "error"   :
    warningSpans.length > 0 ? "warning" : "ok";

  const totalMs = spans.reduce((sum, s) => sum + s.durationMs, 0);

  const summary =
    overallStatus === "error"   ? `${errorSpans.length} error${errorSpans.length !== 1 ? "es" : ""} en pipeline` :
    overallStatus === "warning" ? `${warningSpans.length} advertencia${warningSpans.length !== 1 ? "s" : ""} — operativo` :
    `Pipeline completo — ${totalMs}ms`;

  return {
    traceId:       crypto.randomUUID().slice(0, 12),
    orgSlug,
    agentId,
    sessionId:     `session-${Date.now().toString(36)}`,
    startedAt:     new Date().toISOString(),
    spans,
    overallStatus,
    summary,
  };
}

/**
 * Returns serializable trace summary for rail display.
 */
export function getTraceSummary(trace: ExecutionTrace): {
  traceId:   string;
  status:    string;
  summary:   string;
  spanCount: number;
  okCount:   number;
  warnCount: number;
} {
  return {
    traceId:   trace.traceId,
    status:    trace.overallStatus,
    summary:   trace.summary,
    spanCount: trace.spans.length,
    okCount:   trace.spans.filter(s => s.status === "ok").length,
    warnCount: trace.spans.filter(s => s.status === "warning" || s.status === "error").length,
  };
}
