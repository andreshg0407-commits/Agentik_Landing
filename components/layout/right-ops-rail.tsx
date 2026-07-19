/**
 * components/layout/right-ops-rail.tsx
 *
 * Agentik Copilot — Right Rail Server Shell
 * Sprint: AGENTIK-COPILOT-RIGHT-RAIL-OWNERSHIP-01
 *
 * Fetches real data (signals, alerts, tasks, decisions),
 * serializes to plain props, delegates rendering to CopilotOpsRail (client).
 *
 * No chat. No generic sections. Copilot owns this rail.
 */

import type { Role } from "@prisma/client";
import { prisma }    from "@/lib/prisma";
import { isInternalRole }    from "@/lib/auth/module-access";
import { evaluateAllSignals } from "@/lib/copilot/signal-engine";
import type { CopilotSignal, SignalEngineResult } from "@/lib/copilot/types";
import { getAgentForPathname, getMemoryHints }          from "@/lib/copilot/agents";
import { resolveCopilotContext }                         from "@/lib/copilot/copilot-context-resolver";
import { getActionsForSignal }                          from "@/lib/copilot/actions";
import { getOperationalMemory }                         from "@/lib/copilot/operational-memory";
import { buildOperationalContext, buildCopilotContextSnapshot } from "@/lib/copilot/context-engine";
import { prioritizeSignals }                            from "@/lib/copilot/priority-engine";
import { computeDecisions }                             from "@/lib/copilot/decision-engine";
import { computeNextOperationalSteps }                  from "@/lib/copilot/next-step-engine";
import { getExecutableAction }                          from "@/lib/copilot/execution-registry";
import { evaluateExecutionPolicy }                      from "@/lib/copilot/execution-policy";
import { computeCrossModuleInsights, getPrimaryInsight } from "@/lib/copilot/cross-module-intelligence";
import { computeContextualRecommendations, getPrimaryRecommendation } from "@/lib/copilot/contextual-recommendation-engine";
import {
  resolveRailMode,
  getRailModeLabel,
  getRailModeAccent,
  getRailModeGlow,
  getRailModeStrip,
} from "@/lib/copilot/rail-mode-engine";
import { resolveRailSectionPriority } from "@/lib/copilot/rail-priority";
import { buildExecutiveTimeline, serializeTimeline } from "@/lib/copilot/executive-timeline";
import { computeExecutiveIntents }                  from "@/lib/copilot/executive-intent";
import type { ExecutiveIntent }                     from "@/lib/copilot/executive-intent";
import { getIntentMemory, mergeIntentMemory, summarizeIntentContinuity } from "@/lib/copilot/intent-memory";
import { getPrimaryExecutiveIntent }                from "@/lib/copilot/intent-priority";
import type { IntentPressure }                      from "@/lib/copilot/intent-priority";
import { computeCompoundOperations }                from "@/lib/copilot/compound-operations";
import type { CompoundOperation }                   from "@/lib/copilot/compound-operations";
import { computeExecutionReadiness }                from "@/lib/copilot/operation-readiness";
import { getPrimaryCompoundOperation }              from "@/lib/copilot/compound-priority";
import { buildExecutionBundle }                     from "@/lib/copilot/execution-bundles";
import { computeOperationProgress, summarizeOperationProgress } from "@/lib/copilot/operation-progress";
import { buildTrackedSteps }                       from "@/lib/copilot/step-tracking";
import { computeAccountabilitySignals, summarizeOperationalRisk } from "@/lib/copilot/accountability-engine";
import { getFollowupMemory, buildFollowupNarrative } from "@/lib/copilot/followup-memory";
import { getPrimaryAccountabilitySignal, resolveAccountabilityPressure } from "@/lib/copilot/accountability-priority";
import { computeAgentCollaborations }            from "@/lib/copilot/agent-collaboration";
import { getHandoffMemory, mergeHandoffMemory, summarizeHandoffContinuity } from "@/lib/copilot/handoff-memory";
import { getPrimaryAgentCollaboration, resolveCollaborationPressure } from "@/lib/copilot/collaboration-priority";
import { buildHandoffExecutionDraft }            from "@/lib/copilot/collaboration-actions";
import { resolveExecutionDependencies, detectExecutionBlockers, summarizeExecutionDependencies } from "@/lib/copilot/execution-dependencies";
import { resolveApprovalLevel, buildApprovalRequest, summarizeApprovalRisk } from "@/lib/copilot/approval-engine";
import { resolveExecutionState, summarizeExecutionState, resolveExecutionMode } from "@/lib/copilot/execution-state-machine";
import { evaluateExecutionGovernance } from "@/lib/copilot/execution-governance";
import { summarizeBundleExecution } from "@/lib/copilot/execution-bundles";
import { buildStrategicMemory, summarizeStrategicMemory, scoreMemoryContinuity } from "@/lib/copilot/strategic-memory";
import { buildMemoryIndex, queryRelevantMemory, resolveMemoryPriority } from "@/lib/copilot/memory-index";
import { getAgentCapabilities, resolveCapabilityAvailability, summarizeCapabilityState } from "@/lib/copilot/capability-resolver";
import { evaluateCapabilitiesGovernance, summarizeCapabilityGovernance } from "@/lib/copilot/capability-governance";
import { buildCapabilityCollaboration, summarizeCapabilitySharing } from "@/lib/copilot/capability-sharing";
import { getPrimaryExecutionAction, validateExecutionAction } from "@/lib/copilot/execution-actions";
import { buildRuntimeState }                            from "@/lib/runtime/runtime-state";
import { buildOrchestrationState, getOrchestrationModeLabel } from "@/lib/runtime/orchestration-state";
import { buildAllAgentWorkloads, summarizeAgentWorkloads } from "@/lib/runtime/agent-workload";
import { buildExecutionQueue }                          from "@/lib/runtime/execution-queue";
import { buildGatewayReadiness }                        from "@/lib/integrations/integration-gateway";
import { buildExecutionTrace, getTraceSummary }         from "@/lib/observability/execution-trace";
import { buildAuditTrail, getRecentAuditEvents }        from "@/lib/observability/audit-events";
import { detectIncidents, summarizeIncidents }          from "@/lib/observability/incident-detection";
import { buildOrchestrationLog, getHealthColor, getHealthLabel } from "@/lib/observability/orchestration-log";
import { prepareSupervisedExecution, summarizeSupervisedExecution } from "@/lib/copilot/supervised-execution";
import { buildExecutionConfirmation, resolveExecutionConfirmation, summarizeExecutionConfirmation } from "@/lib/copilot/execution-confirmation";
import { buildRollbackOperation, summarizeRollbackCapability } from "@/lib/copilot/execution-rollback";
import { buildExecutionLifecycle, getRecentLifecycleEvents, summarizeExecutionLifecycle } from "@/lib/copilot/execution-lifecycle";
import { buildTenantVaultSnapshot, vaultAllowsDispatch } from "@/lib/security/vault/vault-core";
import { validateDispatchReadiness } from "@/lib/integrations/supervised-dispatch";
import { buildReplaySession, summarizeReplaySession } from "@/lib/observability/operation-replay";
import { buildIncidentConsole, summarizeIncidentImpact } from "@/lib/observability/incident-console";
import { buildTenantConnectorState, summarizeTenantConnectorHealth } from "@/lib/integrations/tenant-connector-manager";
import type { RealConnectorId } from "@/lib/integrations/real-connectors";
import { buildN8nExecutionBridge, summarizeN8nBridge, validateN8nBridge } from "@/lib/integrations/n8n-execution-bridge";
import { buildExecutionCallback } from "@/lib/integrations/execution-callbacks";
import { buildControlCenterState } from "@/lib/control-center/control-center-state";
import { buildGlobalOrchestration, resolveSystemPressure } from "@/lib/control-center/global-orchestration";
import { buildExecutionMonitor } from "@/lib/control-center/execution-monitor";
import { buildTenantHealthMap } from "@/lib/control-center/tenant-health";
import type { RailSectionKey } from "@/lib/copilot/rail-priority";
import type { CopilotTimelineEventSerial } from "@/lib/copilot/executive-timeline";
import { CopilotOpsRail } from "@/components/layout/copilot-ops-rail";
import type {
  RailAgent,
  RailAction,
  RailMemoryOp,
  RailSignal,
  RailTask,
  RailAlert,
  RailNextStep,
  RailRuntime,
  RailContextInsight,
  RailMemoryEntry,
  RailCapabilityResult,
  RailCapabilityCollaboration,
  RailRuntimeStateData,
  RailGatewayData,
  RailObservabilityData,
  RailVaultData,
  RailDispatchData,
  RailIncidentConsoleData,
  RailReplayData,
  RailTenantIntegrationsData,
  RailBridgeData,
  RailControlCenterData,
  RailDavidData,
} from "@/components/layout/copilot-ops-rail";
import { buildDiegoExecutiveSummary }     from "@/lib/copilot/diego";
import { buildDavidCommercialSummary, serializeDavidSummary } from "@/lib/copilot/david";

// ── Props ───────────────────────────────────────────────────────────────────

interface RightOpsRailProps {
  orgSlug:  string;
  orgId:    string;
  pathname: string;
  role:     Role;
}

// ── Console surface detection ────────────────────────────────────────────────
// Infrastructure rail sections are only visible on dedicated console/admin routes.
// On all operational/tenant surfaces (including /agentik workspaces) the rail stays clean.

function isConsoleSurface(pathname: string): boolean {
  const segs = pathname.split("/").filter(Boolean).slice(1); // drop orgSlug
  const first = segs[0] ?? "";
  return ["runs", "integrations", "sag", "settings", "control-center"].includes(first);
}

// ── Module label derivation ─────────────────────────────────────────────────

const MODULE_LABEL_MAP: Record<string, string> = {
  "finanzas/tesoreria":    "Tesorería Operativa",
  "finanzas/cierre":       "Cierre Financiero",
  "finanzas/conciliacion": "Conciliación",
  "finanzas/planeacion":   "Planeación Financiera",
  "finanzas":              "Módulo Financiero",
  "executive":             "Torre de Control",
  "agentik":               "Agentik",
  "dashboard":             "Panel Principal",
  "sales":                 "Ventas",
  "collections":           "Cobros",
  "pipeline":              "Pipeline",
  "customer-360":          "Customer 360",
  "integrations":          "Integraciones",
  "alerts":                "Alertas",
  "finance":               "Finanzas",
  "reports":               "Informes",
};

function deriveModuleLabel(pathname: string): string {
  const segs     = pathname.split("/").filter(Boolean).slice(1); // drop orgSlug
  const fullPath = segs.join("/");
  const twoSegs  = segs.slice(0, 2).join("/");
  const oneSeg   = segs[0] ?? "";
  return (
    MODULE_LABEL_MAP[fullPath] ??
    MODULE_LABEL_MAP[twoSegs]  ??
    MODULE_LABEL_MAP[oneSeg]   ??
    "Operaciones"
  );
}

// ── Signal → rail mappers ───────────────────────────────────────────────────

function toRailSignal(s: CopilotSignal, orgSlug: string): RailSignal {
  return {
    id:          s.id,
    severity:    s.severity,
    titulo:      s.titulo,
    descripcion: s.descripcion,
    accion:      s.accion,
    targetPath:  `/${orgSlug}${s.targetPath}`,
    confidence:  s.confidence.score,
  };
}

function signalToTask(s: CopilotSignal, orgSlug: string): RailTask {
  return {
    id:      `task-${s.id}`,
    label:   s.accion,
    href:    `/${orgSlug}${s.targetPath}`,
    urgency: s.severity === "critica" ? "critical"
           : s.severity === "elevada" ? "elevated"
           : "normal",
  };
}

// ── Component ───────────────────────────────────────────────────────────────

export default async function RightOpsRail({
  orgSlug,
  orgId,
  pathname,
  role,
}: RightOpsRailProps) {
  const isInternal = isInternalRole(role);
  // showInfra: show deep infrastructure rail sections only on console/admin surfaces.
  // On all operational and AI-workspace routes the rail stays clean (Header + Signals + Alerts + Tasks).
  const showInfra  = isInternal && isConsoleSurface(pathname);

  const isFinancialSurface  = pathname.includes("/finanzas/") || pathname.includes("/executive");
  const isCommercialSurface = pathname.includes("/comercial/");

  const [diegoContext, davidRaw] = await Promise.all([
    isFinancialSurface
      ? buildDiegoExecutiveSummary(orgId).catch(() => null)
      : Promise.resolve(null),
    isCommercialSurface
      ? buildDavidCommercialSummary(orgId).catch(() => null)
      : Promise.resolve(null),
  ]);

  const davidSerial = davidRaw ? serializeDavidSummary(davidRaw) : null;
  const davidData: RailDavidData | null = davidSerial ? {
    executiveHeadline: davidSerial.executiveHeadline,
    criticalRefs:      davidSerial.criticalRefs.map(r => ({
      reference:    r.reference,
      description:  r.description,
      opState:      r.opState,
      disponible:   r.disponible,
      minRequired:  r.minRequired,
      suggestedQty: r.suggestedQty,
    })),
    topSuggestion: davidSerial.topProductionSuggestion ? {
      reference:   davidSerial.topProductionSuggestion.reference,
      description: davidSerial.topProductionSuggestion.description,
      qty:         davidSerial.topProductionSuggestion.qty,
      line:        davidSerial.topProductionSuggestion.line,
    } : null,
    signalCount:       davidSerial.signalCount,
    dataState:         davidSerial.dataState,
    topSignalSeverity: davidSerial.topSignalSeverity,
  } : null;

  const [copilot, rawAlerts, pendingApprovals] = await Promise.all([

    evaluateAllSignals(orgId, orgSlug, { bypassCooldown: true }).catch(
      (): SignalEngineResult => ({
        signals:     [],
        runtime: {
          state:           "DEGRADED",
          lastEvaluatedAt: new Date(),
          activeSignals:   0,
          staleRules:      [],
          degradedRules:   [],
        },
        evaluatedAt: new Date(),
      }),
    ),

    prisma.businessAlert.findMany({
      where:   { organizationId: orgId, status: "OPEN" },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      take:    5,
      select:  { id: true, title: true, severity: true, module: true, entityLabel: true },
    }).catch(() => [] as { id: string; title: string; severity: string; module: string; entityLabel: string }[]),

    isInternal
      ? ((prisma as any).sagWriteOperation.count({
          where: { organizationId: orgId, status: "PENDING" },
        }) as Promise<number>).catch(() => 0)
      : Promise.resolve(0),
  ]);

  // ── Derive serializable props ──────────────────────────────────────────────

  const moduleLabel  = deriveModuleLabel(pathname);
  const railSignals  = copilot.signals.map(s => toRailSignal(s, orgSlug));
  const railTasks    = copilot.signals.map(s => signalToTask(s, orgSlug));
  const runtimeState = copilot.runtime.state as RailRuntime;

  // ── Operational brain ─────────────────────────────────────────────────────
  const opContext   = buildOperationalContext(orgSlug, copilot, rawAlerts.length, pendingApprovals as number);
  const prioritized = prioritizeSignals(copilot.signals);
  const _decisions  = computeDecisions(opContext, prioritized); // ready for V2 UI wiring
  const rawNextSteps = computeNextOperationalSteps(prioritized, opContext, pathname, orgSlug);
  const nextSteps: RailNextStep[] = rawNextSteps.map(s => ({ label: s.label, href: s.href }));

  // ── Context Orchestration layer ────────────────────────────────────────────
  const ctxSnapshot   = buildCopilotContextSnapshot(orgSlug, pathname, copilot, rawAlerts.length, pendingApprovals as number);
  const crossInsights = computeCrossModuleInsights(ctxSnapshot);
  const recommendations = computeContextualRecommendations(ctxSnapshot, crossInsights);
  const topInsight      = getPrimaryInsight(ctxSnapshot, crossInsights);
  const _topRec         = getPrimaryRecommendation(ctxSnapshot, recommendations); // V2: wire to UI

  // Derive RailContextInsight — Diego on finance, David on commercial, fallback to cross-module
  const contextInsight: RailContextInsight | null = diegoContext ? {
    agentName: "Diego",
    text:      diegoContext.executiveHeadline,
    whyNow:    diegoContext.integritySummary,
    nextFocus: diegoContext.recommendedFocus,
    severity:  diegoContext.signals.some(s => s.severity === "critical")
      ? "critical" as const
      : diegoContext.signals.some(s => s.severity === "high") || diegoContext.graphIssueCount > 0
        ? "elevated" as const
        : "normal" as const,
  } : davidData && davidData.dataState !== "EMPTY" ? {
    agentName: "David",
    text:      davidData.executiveHeadline,
    whyNow:    `${davidData.criticalRefs.length} referencia${davidData.criticalRefs.length !== 1 ? "s" : ""} crítica${davidData.criticalRefs.length !== 1 ? "s" : ""} monitoreada${davidData.criticalRefs.length !== 1 ? "s" : ""}`,
    nextFocus: davidData.topSuggestion
      ? `Solicitar producción ${davidData.topSuggestion.reference} (${davidData.topSuggestion.qty} uds)`
      : "Revisar cobertura mínima por referencia",
    severity:  davidData.topSignalSeverity === "critical" ? "critical" as const
      : davidData.topSignalSeverity === "high" ? "elevated" as const
      : "normal" as const,
  } : topInsight ? {
    agentName:  ctxSnapshot.activeAgentName,
    text:       topInsight.description,
    whyNow:     topInsight.whyNow,
    nextFocus:  topInsight.actionHint,
    severity:   topInsight.severity,
  } : null;

  // ── Critical signal count (shared by intent + rail mode) ──────────────────
  const criticalSignalCount = copilot.signals.filter(s => s.severity === "critica").length;

  // ── Executive Intents ─────────────────────────────────────────────────────
  const rawIntents    = computeExecutiveIntents(ctxSnapshot, crossInsights, recommendations);
  const intentMemory  = getIntentMemory(orgSlug, ctxSnapshot.activeAgentId);
  const mergedIntents = mergeIntentMemory(rawIntents, intentMemory) as ExecutiveIntent[];
  const primaryIntent = getPrimaryExecutiveIntent(
    mergedIntents,
    copilot.runtime.state as "HEALTHY" | "SYNCING" | "STALE" | "DEGRADED",
    criticalSignalCount,
  );
  const intentContinuity = summarizeIntentContinuity(
    mergedIntents as Array<ExecutiveIntent & { sessionCount?: number }>
  );

  // ── Compound Operations ────────────────────────────────────────────────────
  const rawOperations     = computeCompoundOperations(
    ctxSnapshot,
    primaryIntent ?? null,
    recommendations,
    crossInsights,
  );
  const primaryOperation  = getPrimaryCompoundOperation(
    rawOperations,
    copilot.runtime.state,
    ctxSnapshot.operationalPriority,
    primaryIntent?.pressure ?? "medium",
  );
  const operationReadiness = primaryOperation
    ? computeExecutionReadiness(
        primaryOperation,
        copilot.runtime.state as "HEALTHY" | "SYNCING" | "STALE" | "DEGRADED",
        pendingApprovals as number,
      )
    : null;
  const _executionBundles = primaryOperation ? buildExecutionBundle(primaryOperation) : []; // V2: pass to execution layer

  // ── Accountability layer ────────────────────────────────────────────────────
  const _trackedSteps      = primaryOperation
    ? buildTrackedSteps(primaryOperation, copilot.runtime.state)
    : [];
  const progressSnapshot   = primaryOperation
    ? computeOperationProgress(primaryOperation, copilot.runtime.state)
    : null;
  const accountabilitySignals = (primaryOperation && progressSnapshot)
    ? computeAccountabilitySignals(
        primaryOperation,
        progressSnapshot,
        copilot.runtime.state,
        primaryIntent ?? null,
        pendingApprovals as number,
      )
    : [];
  const primaryFollowupMemory = primaryOperation
    ? getFollowupMemory(orgSlug, primaryOperation.id, ctxSnapshot.activeAgentId, primaryOperation)
    : null;
  const accountabilityPressure = resolveAccountabilityPressure(
    accountabilitySignals,
    copilot.runtime.state,
    primaryFollowupMemory,
  );
  const followupNarrative = (primaryFollowupMemory && primaryOperation)
    ? buildFollowupNarrative(
        ctxSnapshot.activeAgentId,
        primaryFollowupMemory,
        accountabilitySignals,
        primaryOperation,
      )
    : [];
  const primaryAccountabilitySignal = getPrimaryAccountabilitySignal(
    accountabilitySignals,
    primaryFollowupMemory,
  );
  const progressSummary = progressSnapshot ? summarizeOperationProgress(progressSnapshot) : null;
  const _operationalRiskSummary = summarizeOperationalRisk(accountabilitySignals); // V2: wire to status strip

  // ── Agent Collaborations ────────────────────────────────────────────────────
  const rawCollaborations = computeAgentCollaborations({
    context:           ctxSnapshot,
    primaryIntent:     primaryIntent ?? null,
    primaryOperation:  primaryOperation ?? null,
    accountabilitySignals,
    recommendations,
    insights:          crossInsights,
  });
  // Merge handoff memory into each collaboration
  const mergedCollaborations = rawCollaborations.map(c => {
    const memory = getHandoffMemory(orgSlug, c.sourceAgentId, c.targetAgentId);
    return mergeHandoffMemory(c, memory);
  });
  const primaryCollaboration = getPrimaryAgentCollaboration(
    mergedCollaborations,
    copilot.runtime.state,
    Object.fromEntries(mergedCollaborations.map(c => [c.id, (c as any).memoryAttempts ?? 0])),
  );
  const collaborationPressure = resolveCollaborationPressure(
    mergedCollaborations,
    copilot.runtime.state,
    accountabilitySignals,
  );
  const handoffContinuity = summarizeHandoffContinuity(mergedCollaborations, orgSlug);
  const _handoffDraft = primaryCollaboration
    ? buildHandoffExecutionDraft(primaryCollaboration)
    : null; // V2: pass draft to execution layer

  // ── Execution Layer V2 Foundation ─────────────────────────────────────────
  // Build V2 bundles (with runtimeState for approval escalation)
  const executionBundlesV2 = primaryOperation
    ? buildExecutionBundle(primaryOperation, copilot.runtime.state)
    : [];
  const primaryBundle = executionBundlesV2[0] ?? null;

  // Resolve execution dependencies
  const execDependencies = primaryOperation
    ? resolveExecutionDependencies(primaryOperation, copilot.runtime.state, pendingApprovals as number)
    : [];
  const execBlockers     = detectExecutionBlockers(execDependencies);
  const hasExecBlockers  = execBlockers.length > 0;
  const depSummary       = summarizeExecutionDependencies(execDependencies);

  // Approval level + request for primary bundle
  const bundleApprovalLevel = primaryBundle
    ? resolveApprovalLevel({
        estimatedImpact:  primaryBundle.estimatedImpact,
        requiresApproval: primaryBundle.requiresApproval,
        runtimeState:     copilot.runtime.state,
        affectedModules:  primaryBundle.affectedModules,
      })
    : "none";
  const approvalRequest = (primaryBundle && bundleApprovalLevel !== "none")
    ? buildApprovalRequest({
        bundleId:        primaryBundle.id,
        bundleTitle:     primaryBundle.title,
        executionGroup:  primaryBundle.executionGroup,
        agentId:         ctxSnapshot.activeAgentId,
        approvalLevel:   bundleApprovalLevel,
        affectedModules: primaryBundle.affectedModules,
        estimatedImpact: primaryBundle.estimatedImpact,
        runtimeState:    copilot.runtime.state,
      })
    : null;
  const approvalRiskSummary = approvalRequest ? summarizeApprovalRisk(approvalRequest) : null;

  // Execution mode V2
  const execModeV2 = resolveExecutionMode({
    approvalLevel: bundleApprovalLevel,
    runtimeState:  copilot.runtime.state,
    hasBlockers:   hasExecBlockers,
  });

  // Governance evaluation
  const governanceResult = primaryBundle
    ? evaluateExecutionGovernance({
        runtimeState:     copilot.runtime.state,
        tenantState:      ctxSnapshot.tenantState,
        approvalLevel:    bundleApprovalLevel,
        affectedModules:  primaryBundle.affectedModules,
        executionMode:    execModeV2,
        hasBlockers:      hasExecBlockers,
        agentId:          ctxSnapshot.activeAgentId,
        pendingApprovals: pendingApprovals as number,
      })
    : null;

  // Execution state
  const executionState = resolveExecutionState({
    hasBlockers:      hasExecBlockers || !(governanceResult?.allowed ?? true),
    approvalLevel:    bundleApprovalLevel,
    readiness:        primaryBundle?.readiness ?? "partial",
    pendingApprovals: pendingApprovals as number,
  });
  const executionStateSummary = summarizeExecutionState(executionState);
  const bundleExecutionSummary = primaryBundle ? summarizeBundleExecution({
    ...primaryBundle,
    approvalLevel: bundleApprovalLevel,
    executionMode:  execModeV2,
  }) : null;

  // ── Strategic Memory ──────────────────────────────────────────────────────
  const strategicMemory = buildStrategicMemory(
    ctxSnapshot,
    accountabilitySignals,
    mergedCollaborations,
    mergedIntents,
  );
  const memoryIndex            = buildMemoryIndex(strategicMemory);
  const relevantMemory         = queryRelevantMemory(
    memoryIndex,
    ctxSnapshot.activeModule,
    ctxSnapshot.activeAgentId,
    3,
  );
  const memorySummary          = summarizeStrategicMemory(relevantMemory);
  const memoryContinuityScore  = scoreMemoryContinuity(relevantMemory);
  const memoryPriority         = resolveMemoryPriority(memoryIndex);

  // ── Capability Registry + Resolver ────────────────────────────────────────
  const agentCapabilityResults = getAgentCapabilities(
    ctxSnapshot.activeAgentId,
    copilot.runtime.state,
    ctxSnapshot.tenantState,
    pendingApprovals as number,
  );
  const activeCapabilities = resolveCapabilityAvailability(
    agentCapabilityResults,
    ctxSnapshot.activeModule,
  );
  const capabilitySummary = summarizeCapabilityState(
    activeCapabilities,
    ctxSnapshot.activeAgentId,
  );

  // ── Capability Governance ─────────────────────────────────────────────────
  const capabilityGovernanceMap = evaluateCapabilitiesGovernance(
    activeCapabilities,
    copilot.runtime.state,
    ctxSnapshot.tenantState,
    pendingApprovals as number,
  );
  const capabilityGovernanceSummary = summarizeCapabilityGovernance(
    activeCapabilities,
    capabilityGovernanceMap,
  );

  // ── Capability Sharing ────────────────────────────────────────────────────
  const capabilityCollaboration   = buildCapabilityCollaboration(
    ctxSnapshot.activeAgentId,
    activeCapabilities,
  );
  const capabilitySharingSummary  = summarizeCapabilitySharing(capabilityCollaboration);

  // ── Runtime Orchestration ─────────────────────────────────────────────────
  const runtimeStateObj = buildRuntimeState(orgSlug, copilot.runtime.state);
  const agentWorkloads  = buildAllAgentWorkloads({
    primaryAgentId:    ctxSnapshot.activeAgentId,
    primaryOps:        rawOperations.length,
    pendingApprovals:  pendingApprovals as number,
    collaborationCount: mergedCollaborations.length,
    runtimeState:      copilot.runtime.state,
  });
  const workloadSummary = summarizeAgentWorkloads(agentWorkloads);

  // ── Integration Gateway ────────────────────────────────────────────────────
  const gatewayReadiness = buildGatewayReadiness(orgSlug, copilot.runtime.state);

  // ── Supervised Execution (V3) ─────────────────────────────────────────────
  const primaryActionContract = getPrimaryExecutionAction(
    ctxSnapshot.activeAgentId,
    ctxSnapshot.activeModule,
  );
  const actionValidation = primaryActionContract
    ? validateExecutionAction(primaryActionContract, copilot.runtime.state)
    : null;

  const supervisedExecution = (primaryBundle && primaryOperation)
    ? prepareSupervisedExecution({
        bundle:           primaryBundle,
        operation:        primaryOperation,
        agentId:          ctxSnapshot.activeAgentId,
        orgSlug,
        runtimeState:     copilot.runtime.state,
        tenantState:      ctxSnapshot.tenantState,
        pendingApprovals: pendingApprovals as number,
      })
    : null;

  // Confirmation gate
  const executionConfirmation = supervisedExecution
    ? resolveExecutionConfirmation(
        buildExecutionConfirmation({
          executionId:           supervisedExecution.id,
          requestedByAgent:      ctxSnapshot.activeAgentId,
          requiresHumanApproval: supervisedExecution.requiresApproval,
          operationTitle:        supervisedExecution.actions[0]?.title,
        }),
      )
    : null;

  // Rollback record
  const rollbackRecord = supervisedExecution
    ? buildRollbackOperation(
        supervisedExecution.id,
        supervisedExecution.rollbackAvailable,
      )
    : null;

  // Lifecycle tracking
  const executionLifecycle = supervisedExecution
    ? buildExecutionLifecycle(supervisedExecution)
    : null;
  const recentLifecycleEvents   = getRecentLifecycleEvents(executionLifecycle, 3);
  const executionLifecycleSummary = summarizeExecutionLifecycle(executionLifecycle);
  const supervisedExecSummary   = summarizeSupervisedExecution(supervisedExecution);
  const confirmationSummary     = summarizeExecutionConfirmation(executionConfirmation);
  const rollbackSummary         = summarizeRollbackCapability(rollbackRecord);

  // ── Execution Queue + Orchestration State ────────────────────────────────
  const executionQueue = buildExecutionQueue({
    orgSlug,
    executionId:      supervisedExecution?.id,
    agentId:          supervisedExecution ? ctxSnapshot.activeAgentId : undefined,
    status:           supervisedExecution?.status,
    requiresApproval: supervisedExecution?.requiresApproval,
    runtimeState:     copilot.runtime.state,
  });
  const orchestrationState = buildOrchestrationState(runtimeStateObj, executionQueue, agentWorkloads);
  const orchModeLabel      = getOrchestrationModeLabel(orchestrationState.orchestrationMode);

  // ── Observability: Execution Trace ────────────────────────────────────────
  const execTrace = buildExecutionTrace({
    orgSlug,
    agentId:           ctxSnapshot.activeAgentId,
    runtimeState:      copilot.runtime.state,
    hasSignals:        copilot.signals.length > 0,
    hasIntents:        mergedIntents.length > 0,
    hasOperations:     rawOperations.length > 0,
    hasBundle:         !!primaryBundle,
    hasExecution:      !!supervisedExecution,
    governanceAllowed: governanceResult?.allowed ?? true,
    integrationReady:  gatewayReadiness.readyCount > 0,
  });
  const traceSummary = getTraceSummary(execTrace);

  // ── Observability: Audit Trail ────────────────────────────────────────────
  const auditTrail = buildAuditTrail({
    orgSlug,
    agentId:                  ctxSnapshot.activeAgentId,
    runtimeState:             copilot.runtime.state,
    governanceAllowed:        governanceResult?.allowed ?? true,
    governanceReason:         governanceResult?.warnings?.[0],
    hasExecution:             !!supervisedExecution,
    executionStatus:          supervisedExecution?.status,
    hasApprovalRequest:       !!approvalRequest,
    integrationDraftCreated:  false,
  });
  const recentAuditEvents = getRecentAuditEvents(auditTrail, 3);

  // ── Observability: Incident Detection ────────────────────────────────────
  const incidents = detectIncidents({
    orgSlug,
    agentId:                ctxSnapshot.activeAgentId,
    runtimeState:           copilot.runtime.state,
    connectorDegradedCount: runtimeStateObj.degradedCount,
    connectorBlockedCount:  runtimeStateObj.blockedCount,
    governanceAllowed:      governanceResult?.allowed ?? true,
    executionStatus:        supervisedExecution?.status,
    queueBlockedCount:      executionQueue.blockedCount,
    workloadLevel:          agentWorkloads.find(w => w.agentId === ctxSnapshot.activeAgentId)?.workloadLevel,
    pendingApprovals:       pendingApprovals as number,
  });
  const incidentSummary = summarizeIncidents(incidents);

  // ── Observability: Orchestration Log ─────────────────────────────────────
  const orchLog = buildOrchestrationLog(orgSlug, execTrace, auditTrail, incidents);

  // ── Security Vault Pipeline ───────────────────────────────────────────────
  const vaultSnapshot = buildTenantVaultSnapshot(
    orgSlug,
    copilot.runtime.state,
    ["sag-erp"],   // PLACEHOLDER: V4 — driven by real Prisma Integration lookup
  );
  const vaultDispatchAllowed = vaultAllowsDispatch(vaultSnapshot);

  // ── Supervised Dispatch Readiness ─────────────────────────────────────────
  const dispatchReadiness = validateDispatchReadiness({
    orgSlug,
    runtimeState:      copilot.runtime.state,
    vaultSnapshot,
    governanceAllowed: governanceResult?.allowed ?? true,
  });

  // ── Replay Session ────────────────────────────────────────────────────────
  const replaySession  = buildReplaySession(execTrace);
  const replaySummary  = summarizeReplaySession(replaySession);

  // Update execution trace with vault + connector + dispatch + replay signals
  const execTraceV2 = buildExecutionTrace({
    orgSlug,
    agentId:              ctxSnapshot.activeAgentId,
    runtimeState:         copilot.runtime.state,
    hasSignals:           copilot.signals.length > 0,
    hasIntents:           mergedIntents.length > 0,
    hasOperations:        rawOperations.length > 0,
    hasBundle:            !!primaryBundle,
    hasExecution:         !!supervisedExecution,
    governanceAllowed:    governanceResult?.allowed ?? true,
    integrationReady:     gatewayReadiness.readyCount > 0,
    vaultHealth:          vaultSnapshot.health,
    vaultValidated:       vaultDispatchAllowed,
    connectorReadyCount:  dispatchReadiness.readyConnectors.length,
    connectorTotalCount:  dispatchReadiness.readyConnectors.length + dispatchReadiness.blockedConnectors.length,
    dispatchReady:        dispatchReadiness.canDispatch,
    hasReplayRef:         replaySession.replayAvailable,
    replayId:             replaySession.replayId,
  });

  // ── Incident Console ──────────────────────────────────────────────────────
  const incidentConsole = buildIncidentConsole({
    orgSlug,
    runtimeState:          copilot.runtime.state,
    vaultHealth:           vaultSnapshot.health,
    governanceAllowed:     governanceResult?.allowed ?? true,
    connectorBlockedCount: runtimeStateObj.blockedCount,
    connectorDegradedCount: runtimeStateObj.degradedCount,
    dispatchBlocked:       !dispatchReadiness.canDispatch,
    executionQueueBlocked: executionQueue.blockedCount > 0,
    auditContinuity:       replaySession.auditContinuity,
    replaySession,
  });
  const incidentImpact = summarizeIncidentImpact(incidentConsole);

  // ── Tenant Connector States ───────────────────────────────────────────────
  const tenantConnectors = (["sag-erp"] as RealConnectorId[]).map(connectorId =>
    buildTenantConnectorState({
      orgSlug,
      connectorId,
      runtimeState:      copilot.runtime.state,
      vaultSnapshot,
      governanceAllowed: governanceResult?.allowed ?? true,
      replayContinuity:  replaySession.auditContinuity,
    })
  );
  const connectorHealthSummary = summarizeTenantConnectorHealth(tenantConnectors);

  // ── n8n Execution Bridge ──────────────────────────────────────────────────
  const n8nBridge = buildN8nExecutionBridge({
    orgSlug,
    executionId:       supervisedExecution?.id ?? `stub-${orgSlug}`,
    workflowId:        "wf-agentik-main",
    workflowName:      "Agentik Main Pipeline",
    runtimeState:      copilot.runtime.state,
    vaultHealth:       vaultSnapshot.health,
    governanceAllowed: governanceResult?.allowed ?? true,
    replaySession,
  });
  const n8nBridgeSummary    = summarizeN8nBridge(n8nBridge);
  const n8nBridgeValidation = validateN8nBridge(n8nBridge);

  // ── Execution Callbacks ───────────────────────────────────────────────────
  const executionCallbackDraft = buildExecutionCallback({
    orgSlug,
    type:          "n8n_status",
    executionId:   n8nBridge.executionId,
    correlationId: n8nBridge.correlationId,
    workflowId:    n8nBridge.workflowId,
    replayRef:     replaySession.replayId,
  });

  // ── Execution Monitor ─────────────────────────────────────────────────────
  const executionMonitor = buildExecutionMonitor({
    orgSlug,
    supervisedExecution: supervisedExecution ?? undefined,
    blockedDispatchCount: dispatchReadiness.blockedConnectors.length,
    pendingApprovals:     pendingApprovals as number,
    replayIntegrity:      replaySession.integrity,
  });

  // ── Control Center State ──────────────────────────────────────────────────
  const controlCenterState = buildControlCenterState({
    orgSlug,
    runtimeState:          copilot.runtime.state,
    vaultHealth:           vaultSnapshot.health,
    activeExecutions:      executionMonitor.activeCount,
    blockedExecutions:     executionMonitor.blockedCount,
    pendingApprovals:      pendingApprovals as number,
    incidentCount:         incidentConsole.length,
    criticalIncidentCount: incidentImpact.criticalCount,
    dispatchReady:         dispatchReadiness.canDispatch,
    connectorReadiness:    orchestrationState.connectorReadiness,
    orchestrationHealth:   orchLog.health as "green" | "yellow" | "red" | "grey",
    replayContinuity:      replaySession.auditContinuity,
  });

  // ── Global Orchestration ──────────────────────────────────────────────────
  const globalOrchestration = buildGlobalOrchestration({
    orgSlug,
    orchestrationMode:    orchestrationState.orchestrationMode,
    runtimeState:         copilot.runtime.state,
    totalQueueDepth:      executionQueue.totalQueued,
    blockedQueueCount:    executionQueue.blockedCount,
    activeWorkloads:      agentWorkloads.length,
    incidentCount:        incidentConsole.length,
    criticalIncidentCount: incidentImpact.criticalCount,
    governanceBlockCount: governanceResult?.allowed === false ? 1 : 0,
    replayContinuity:     replaySession.auditContinuity,
    connectorReadiness:   orchestrationState.connectorReadiness,
  });

  // ── Tenant Health Map ─────────────────────────────────────────────────────
  const tenantHealthMap = buildTenantHealthMap([{
    orgSlug,
    tenantName:         "Castillitos",
    runtimeState:       copilot.runtime.state,
    vaultHealth:        vaultSnapshot.health,
    integrationSummary: connectorHealthSummary,
    incidentCount:      incidentConsole.length,
    criticalIncidents:  incidentImpact.criticalCount,
    governanceBlocked:  !(governanceResult?.allowed ?? true),
    executionCapacity:  globalOrchestration.executionCapacity,
    dispatchReady:      dispatchReadiness.canDispatch,
    replayContinuity:   replaySession.auditContinuity,
  }]);

  // ── Adaptive rail mode ─────────────────────────────────────────────────────
  const railMode = resolveRailMode({
    runtimeState:        copilot.runtime.state as "HEALTHY" | "SYNCING" | "STALE" | "DEGRADED",
    operationalPriority: ctxSnapshot.operationalPriority,
    activeModule:        ctxSnapshot.activeModule,
    criticalSignalCount,
    tenantState:         ctxSnapshot.tenantState,
  });
  const railModeLabel   = getRailModeLabel(railMode);
  const modeGlow        = getRailModeGlow(railMode);
  const modeStrip       = getRailModeStrip(railMode);
  const sectionPriority = resolveRailSectionPriority(railMode);
  const sectionOrder: Record<string, number> = {};
  sectionPriority.order.forEach((key, idx) => { sectionOrder[key] = idx; });
  const timelineEvents: CopilotTimelineEventSerial[] =
    serializeTimeline(buildExecutiveTimeline(
      ctxSnapshot,
      mergedIntents,
      rawOperations,
      accountabilitySignals,
      primaryFollowupMemory,
      mergedCollaborations,
      executionBundlesV2,
      relevantMemory,
      activeCapabilities,
      supervisedExecution,
      executionLifecycle,
    ));

  // ── Agent + memory ────────────────────────────────────────────────────────
  // V2: registry-driven context resolution (AGENTIK-COPILOT-CORE-02)
  const copilotCtx   = resolveCopilotContext({ pathname, orgSlug, isInternal });
  const registryAgent = copilotCtx.activeAgent;
  const legacyAgent   = getAgentForPathname(pathname); // kept for memoryHints only
  const railAgent: RailAgent = {
    name:        registryAgent.name,
    displayName: registryAgent.displayName,
    title:       registryAgent.role,
    specialty:   registryAgent.specialty,
    avatar:      registryAgent.avatar,
    photo:       registryAgent.avatar,  // V2: single avatar field
    accentColor: registryAgent.accentColor,
  };
  const memoryItems = getMemoryHints(legacyAgent, pathname);

  // ── Suggested actions (derived from primary signal + execution policy) ───
  const primaryCopilotSignal = copilot.signals[0] ?? null;
  const resolvedActions = primaryCopilotSignal
    ? getActionsForSignal(primaryCopilotSignal, pathname, orgSlug)
    : [];

  // Derive module string for policy context (e.g. "finanzas/planeacion")
  const moduleSegs = pathname.split("/").filter(Boolean).slice(1);
  const activeModule = moduleSegs.slice(0, 2).join("/");

  const suggestedActions: RailAction[] = resolvedActions.map(action => {
    const execAction = getExecutableAction(action.id);

    // Action not in registry → treat as unsupported (future capability)
    if (!execAction) {
      return { ...action, executionStatus: "unsupported" as const };
    }

    const policy = evaluateExecutionPolicy(execAction, role, copilot.runtime.state);

    return {
      ...action,
      executionStatus: policy.status,
      statusMessage:   policy.reason,
      safetyMessage:   policy.safetyMessage,
      agentId:         execAction.agentId,
      handlerKey:      execAction.handlerKey,
      orgSlug,
      module:          activeModule,
      signalId:        primaryCopilotSignal?.id,
      confidence:      primaryCopilotSignal?.confidence?.score,
    };
  });

  // ── Operational memory ────────────────────────────────────────────────────
  const opsMemoryRaw = getOperationalMemory(pathname);
  const operationalMemory: RailMemoryOp[] = opsMemoryRaw.map(m => ({
    text:      m.text,
    relative:  m.relative,
    agentName: m.agentName,
    type:      m.type,
  }));

  const railAlerts: RailAlert[] = rawAlerts.map(a => ({
    id:    a.id,
    title: a.title,
    level: (a.severity as string) === "CRITICAL" ? "CRITICAL" as const
         : (a.severity as string) === "WARNING"  ? "WARNING"  as const
         : "INFO" as const,
    meta:  `${capitalize(a.module)} · ${a.entityLabel}`,
  }));

  return (
    <CopilotOpsRail
      orgSlug={orgSlug}
      moduleLabel={moduleLabel}
      runtimeState={runtimeState}
      agent={railAgent}
      signals={railSignals}
      tasks={railTasks}
      totalTasksCount={railTasks.length}
      alerts={railAlerts}
      totalAlertsCount={rawAlerts.length}
      decisions={pendingApprovals as number}
      decisionsHref={`/${orgSlug}/sag/write`}
      nextSteps={nextSteps}
      memoryItems={memoryItems}
      suggestedActions={suggestedActions}
      operationalMemory={operationalMemory}
      contextInsight={contextInsight ?? undefined}
      railMode={railMode}
      railModeLabel={railModeLabel}
      modeGlow={modeGlow}
      modeStrip={modeStrip}
      sectionOrder={sectionOrder}
      timelineEvents={timelineEvents}
      primaryIntent={primaryIntent ? {
        id:               primaryIntent.id,
        type:             primaryIntent.type,
        title:            primaryIntent.title,
        objective:        primaryIntent.objective,
        status:           primaryIntent.status,
        severity:         primaryIntent.severity,
        pressure:         primaryIntent.pressure,
        successCriteria:  primaryIntent.successCriteria,
        module:           primaryIntent.module,
        agentId:          primaryIntent.agentId,
        suggestedActionIds: primaryIntent.suggestedActionIds,
        continuityMarker: (primaryIntent as any).continuityMarker as string | undefined,
      } : undefined}
      intentContinuity={intentContinuity ?? undefined}
      primaryOperation={primaryOperation ? {
        id:                 primaryOperation.id,
        title:              primaryOperation.title,
        objective:          primaryOperation.objective,
        status:             primaryOperation.status,
        priority:           primaryOperation.priority,
        riskLevel:          primaryOperation.riskLevel,
        executionReadiness: operationReadiness?.readiness ?? primaryOperation.executionReadiness,
        estimatedOutcome:   primaryOperation.estimatedOutcome,
        readinessSummary:   operationReadiness?.summary ?? "",
        steps:              primaryOperation.steps.slice(0, 4).map(s => ({
          id:     s.id,
          label:  s.label,
          module: s.module,
          status: s.status,
          requiresApproval: s.requiresApproval,
        })),
        agentId:     primaryOperation.agentId,
        involvedModules: primaryOperation.involvedModules,
      } : undefined}
      progressSnapshot={progressSnapshot ? {
        overallProgress: progressSnapshot.overallProgress,
        completedSteps:  progressSnapshot.completedSteps,
        activeSteps:     progressSnapshot.activeSteps,
        blockedSteps:    progressSnapshot.blockedSteps,
        stalledSteps:    progressSnapshot.stalledSteps,
        status:          progressSnapshot.status,
        momentum:        progressSnapshot.momentum,
        lastMovementAt:  progressSnapshot.lastMovementAt,
      } : undefined}
      primaryAccountabilitySignal={primaryAccountabilitySignal ? {
        id:                    primaryAccountabilitySignal.id,
        severity:              primaryAccountabilitySignal.severity,
        type:                  primaryAccountabilitySignal.type,
        title:                 primaryAccountabilitySignal.title,
        description:           primaryAccountabilitySignal.description,
        escalationRecommended: primaryAccountabilitySignal.escalationRecommended,
      } : undefined}
      accountabilityPressure={accountabilityPressure}
      followupNarrative={followupNarrative.length > 0 ? followupNarrative : undefined}
      progressSummary={progressSummary ?? undefined}
      primaryCollaboration={primaryCollaboration ? {
        id:                   primaryCollaboration.id,
        sourceAgentId:        primaryCollaboration.sourceAgentId,
        targetAgentId:        primaryCollaboration.targetAgentId,
        type:                 primaryCollaboration.type,
        status:               primaryCollaboration.status,
        reason:               primaryCollaboration.reason,
        relatedModule:        primaryCollaboration.relatedModule,
        priority:             primaryCollaboration.priority,
        contextSummary:       primaryCollaboration.contextSummary,
        expectedContribution: primaryCollaboration.expectedContribution,
        suggestedActionIds:   primaryCollaboration.suggestedActionIds,
        memoryPhrase:         (primaryCollaboration as any).memoryPhrase as string | undefined,
      } : undefined}
      collaborationPressure={collaborationPressure}
      handoffContinuity={handoffContinuity ?? undefined}
      strategicMemory={relevantMemory.slice(0, 2).map((m): RailMemoryEntry => ({
        id:              m.id,
        type:            m.type,
        title:           m.title,
        summary:         m.summary,
        importance:      m.importance,
        continuityScore: m.continuityScore,
        relatedModules:  m.relatedModules,
        relatedAgents:   m.relatedAgents,
        updatedAt:       m.updatedAt,
      }))}
      memorySummary={memorySummary}
      memoryContinuityScore={memoryContinuityScore}
      memoryPriority={memoryPriority}
      activeCapabilities={activeCapabilities.map((r): RailCapabilityResult => ({
        capabilityId:  r.capability.id,
        agentId:       r.capability.agentId,
        name:          r.capability.name,
        type:          r.capability.type,
        availability:  r.availability,
        riskLevel:     r.capability.riskLevel,
        reason:        r.reason,
      }))}
      capabilitySummary={capabilitySummary}
      capabilityGovernanceSummary={capabilityGovernanceSummary}
      capabilityCollaboration={capabilityCollaboration ? ({
        id:              capabilityCollaboration.id,
        participants:    capabilityCollaboration.participants,
        sharedCount:     capabilityCollaboration.sharedCapabilities.length,
        delegationCount: capabilityCollaboration.delegations.length,
        summary:         capabilityCollaboration.summary,
        priority:        capabilityCollaboration.priority,
      } satisfies RailCapabilityCollaboration) : undefined}
      capabilitySharingSummary={capabilitySharingSummary}
      supervisedExecution={supervisedExecution ? {
        id:                  supervisedExecution.id,
        bundleId:            supervisedExecution.bundleId,
        status:              supervisedExecution.status,
        executionMode:       supervisedExecution.executionMode,
        requiresApproval:    supervisedExecution.requiresApproval,
        approvedByHuman:     supervisedExecution.approvedByHuman,
        rollbackAvailable:   supervisedExecution.rollbackAvailable,
        executionSummary:    supervisedExecSummary,
        governanceSummary:   supervisedExecution.governanceSummary,
        readinessLabel:      supervisedExecution.readinessLabel,
        estimatedRisk:       supervisedExecution.estimatedRisk,
        actionCount:         supervisedExecution.actions.length,
        actionTitle:         supervisedExecution.actions[0]?.title ?? "",
        confirmationState:   executionConfirmation?.confirmationState ?? "pending",
        confirmationMessage: confirmationSummary,
        rollbackSummary:     rollbackSummary,
        lifecycleSummary:    executionLifecycleSummary,
        recentLifecycleEvents,
        actionValid:         actionValidation?.valid ?? true,
      } : undefined}
      executionPrep={primaryBundle ? {
        bundleTitle:      primaryBundle.title,
        executionMode:    execModeV2,
        readiness:        primaryBundle.readiness,
        estimatedRisk:    primaryBundle.estimatedRisk,
        approvalLevel:    bundleApprovalLevel,
        approvalRisk:     approvalRiskSummary ?? undefined,
        requiresApproval: primaryBundle.requiresApproval,
        executionState:   executionState,
        executionStateLabel: executionStateSummary.label,
        executionStateSeverity: executionStateSummary.severity,
        blockers:         execBlockers.map(b => b.description),
        warnings:         governanceResult?.warnings ?? [],
        governanceAllowed: governanceResult?.allowed ?? true,
        bundleSummary:    bundleExecutionSummary ?? "",
        depSummary,
        rollbackPossible: primaryBundle.rollbackPossible,
      } : undefined}
      runtimeStateData={{
        health:             runtimeStateObj.state,
        connectorReadiness: orchestrationState.connectorReadiness,
        operationalMode:    orchModeLabel,
        workloadSummary,
        queuedCount:        executionQueue.totalQueued,
        blockedCount:       executionQueue.blockedCount,
        activeCount:        executionQueue.activeCount,
        queueSummary:       executionQueue.queueSummary,
        runtimeSummary:     runtimeStateObj.summary,
      }}
      gatewayData={{
        readyCount:         gatewayReadiness.readyCount,
        blockedCount:       gatewayReadiness.blockedCount,
        degradedCount:      gatewayReadiness.degradedCount,
        dispatchAvailable:  gatewayReadiness.dispatchAvailable,
        readinessPercent:   gatewayReadiness.readinessPercent,
      }}
      observabilityData={{
        health:                orchLog.health,
        healthLabel:           getHealthLabel(orchLog.health),
        healthColor:           getHealthColor(orchLog.health),
        activeIncidentCount:   orchLog.activeIncidentCount,
        criticalIncidentCount: orchLog.criticalIncidentCount,
        incidentSummary,
        traceSummary:          traceSummary.summary,
        traceId:               traceSummary.traceId,
        traceOkCount:          traceSummary.okCount,
        traceWarnCount:        traceSummary.warnCount,
        auditEventCount:       orchLog.auditEventCount,
        recentAuditEvents,
        overallSummary:        orchLog.overallSummary,
      }}
      vaultData={{
        health:        vaultSnapshot.health,
        totalSecrets:  vaultSnapshot.totalSecrets,
        activeCount:   vaultSnapshot.activeCount,
        expiringCount: vaultSnapshot.expiringCount,
        expiredCount:  vaultSnapshot.expiredCount,
        invalidCount:  vaultSnapshot.invalidCount,
        revokedCount:  vaultSnapshot.revokedCount,
        summary:       vaultSnapshot.summary,
        dispatchAllowed: vaultDispatchAllowed,
      }}
      dispatchData={{
        canDispatch:         dispatchReadiness.canDispatch,
        requiresApproval:    dispatchReadiness.requiresApproval,
        readyConnectorCount: dispatchReadiness.readyConnectors.length,
        blockedConnectorCount: dispatchReadiness.blockedConnectors.length,
        readyConnectors:     dispatchReadiness.readyConnectors,
        summaryLabel:        dispatchReadiness.summaryLabel,
      }}
      incidentConsoleData={{
        totalCount:      incidentImpact.totalCount,
        criticalCount:   incidentImpact.criticalCount,
        highCount:       incidentImpact.highCount,
        dispatchBlocked: incidentImpact.dispatchBlocked,
        affectedModules: incidentImpact.affectedModules,
        summary:         incidentImpact.summary,
        incidents:       incidentConsole.slice(0, 3).map(i => ({
          id:          i.id,
          category:    i.category,
          severity:    i.severity,
          title:       i.title,
          replayAvailable: i.replayAvailable,
        })),
      }}
      replayData={{
        replayId:        replaySummary.replayId,
        integrity:       replaySummary.integrity,
        replayAvailable: replaySummary.replayAvailable,
        auditContinuity: replaySummary.auditContinuity,
        spanCount:       replaySummary.spanCount,
        accountedSpans:  replaySummary.accountedSpans,
        summary:         replaySummary.summary,
      }}
      tenantIntegrationsData={{
        totalCount:        connectorHealthSummary.totalCount,
        connectedCount:    connectorHealthSummary.connectedCount,
        degradedCount:     connectorHealthSummary.degradedCount,
        blockedCount:      connectorHealthSummary.blockedCount,
        expiringCount:     connectorHealthSummary.expiringCount,
        dispatchReadyCount: connectorHealthSummary.dispatchReadyCount,
        overallHealth:     connectorHealthSummary.overallHealth,
        summary:           connectorHealthSummary.summary,
        connectors:        tenantConnectors.slice(0, 4).map(c => ({
          id:           c.integrationId,
          name:         c.integrationName,
          status:       c.status,
          dispatchReady: c.dispatchReady,
          riskLevel:    c.riskLevel,
          scopes:       c.scopes.filter(s => s.granted).map(s => s.scope),
          expiresAt:    c.expiresAt,
        })),
      }}
      bridgeData={{
        bridgeStatus:     n8nBridge.bridgeStatus,
        workflowName:     n8nBridge.workflowName,
        correlationId:    n8nBridge.correlationId,
        runtimeValidated: n8nBridge.runtimeValidated,
        vaultValidated:   n8nBridge.vaultValidated,
        governanceValidated: n8nBridge.governanceValidated,
        dispatchApproved: n8nBridge.dispatchApproved,
        replayLinked:     !!n8nBridge.replayReference,
        callbackStatus:   executionCallbackDraft.status,
        summary:          n8nBridgeSummary,
        validationSummary: n8nBridgeValidation.summary,
        blockReason:      n8nBridge.blockReason,
      }}
      controlCenterData={{
        health:                controlCenterState.health,
        runtimeHealth:         controlCenterState.runtimeHealth,
        activeTenants:         controlCenterState.activeTenants,
        degradedTenants:       controlCenterState.degradedTenants,
        activeExecutions:      controlCenterState.activeExecutions,
        blockedExecutions:     controlCenterState.blockedExecutions,
        pendingApprovals:      controlCenterState.pendingApprovals,
        incidentCount:         controlCenterState.incidentCount,
        criticalIncidentCount: controlCenterState.criticalIncidentCount,
        dispatchReady:         controlCenterState.dispatchReady,
        vaultHealth:           controlCenterState.vaultHealth,
        orchestrationHealth:   controlCenterState.orchestrationHealth,
        connectorReadiness:    controlCenterState.connectorReadiness,
        systemPressure:        globalOrchestration.systemPressure,
        executionPressure:     executionMonitor.pressure,
        tenantHealthSummary:   tenantHealthMap.summary,
        summary:               controlCenterState.summary,
      }}
      isInternal={showInfra}
      isInternalUser={isInternal}
      davidData={davidData}
    />
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
