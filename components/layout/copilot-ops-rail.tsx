"use client";

/**
 * components/layout/copilot-ops-rail.tsx
 *
 * Agentik Copilot — Operational Right Rail V1
 *
 * The permanent intelligent presence in the right rail.
 *
 * Sections:
 *   Header         — Agentik Copilot wordmark + active agent identity + status
 *   Señal Principal — Primary signal card + Acciones Sugeridas (NEW)
 *   Tareas Activas  — Tasks derived from active signals
 *   Alertas         — Real operational alerts
 *   Decisiones      — Pending approvals (internal only)
 *   Próximos Pasos  — Contextual navigation suggestions
 *   Memoria         — Operational events + capability hints
 *   Footer          — "Consultar a {agent}…" (future conversational)
 *
 * NOT a chat. No input. No conversation history.
 * Copilot is the transversal intelligence layer — NOT a sidebar assistant.
 *
 * Sprint: AGENTIK-COPILOT-OPERATIONS-01
 *
 * Rules:
 *   - All colors from C.* tokens — NO Tailwind color classes
 *   - All typography from T.* tokens
 *   - No action logic in this file — it lives in lib/copilot/actions.ts
 */

import { useState }  from "react";
import Link          from "next/link";
import Image         from "next/image";
import { C, T, S, R, E } from "@/lib/ui/tokens";
import type { CopilotActionColor, CopilotExecutionMode, CopilotActionPriority } from "@/lib/copilot/actions";
import type { ExecutionStatus } from "@/lib/copilot/execution-registry";
import { buildExecutionRequest } from "@/lib/copilot/execution-request";
import { executeAction }         from "@/lib/copilot/execution-handlers";
import { auditExecution }        from "@/lib/copilot/execution-audit";

// ── Serializable prop types (all safe to pass from Server → Client) ───────────

export type RailSeverity    = "critica" | "elevada" | "vigilancia" | "informativa";
export type RailRuntime     = "HEALTHY" | "SYNCING" | "STALE" | "DEGRADED";
export type RailTaskUrgency = "critical" | "elevated" | "normal";
export type RailAlertLevel  = "CRITICAL" | "WARNING" | "INFO";

export interface RailAgent {
  name:        string;
  displayName: string;   // "Luca · Marketing"
  title:       string;   // "Director Creativo IA"
  specialty:   string;
  avatar:      string;
  photo?:      string;
  accentColor: string;
}

export interface RailSignal {
  id:          string;
  severity:    RailSeverity;
  titulo:      string;
  descripcion: string;
  accion:      string;
  targetPath:  string;
  confidence:  number;  // 0–100
}

export interface RailTask {
  id:      string;
  label:   string;
  href:    string;
  urgency: RailTaskUrgency;
}

export interface RailAlert {
  id:    string;
  title: string;
  level: RailAlertLevel;
  meta:  string;
}

export interface RailNextStep {
  label: string;
  href:  string;
}

/** Fully-resolved action chip — derived from lib/copilot/actions.ts on server */
export interface RailAction {
  id:              string;
  label:           string;
  mode:            CopilotExecutionMode;
  priority:        CopilotActionPriority;
  color:           CopilotActionColor;
  href:            string;
  // Execution layer additions (AGENTIK-COPILOT-EXECUTION-LAYER-01)
  executionStatus?: ExecutionStatus;   // Policy result — how this chip should behave
  statusMessage?:   string;            // Short reason for blocked / approval states
  safetyMessage?:   string;            // Shown in inline confirm
  agentId?:         string;            // Agent that owns this action
  handlerKey?:      string;            // For client-side handler dispatch
  orgSlug?:         string;            // Needed for request building
  module?:          string;            // Module context
  signalId?:        string;            // Source signal (for audit)
  confidence?:      number;            // Signal confidence (for audit)
}

/** Context insight — derived from cross-module intelligence layer */
export interface RailContextInsight {
  agentName: string;
  text:      string;   // What the agent observes (1 sentence)
  whyNow:    string;   // Why it matters right now
  nextFocus: string;   // What to look at next (short action phrase)
  severity:  "critical" | "elevated" | "normal";
}

/** Operational memory event — derived from lib/copilot/operational-memory.ts */
export interface RailMemoryOp {
  text:      string;
  relative:  string;   // "ayer", "hace 2 días"
  agentName: string;
  type:      "detection" | "action" | "finding" | "approval";
}

/** Serializable timeline event — passed from server, safe for RSC props */
export interface RailTimelineEvent {
  id:           string;
  type:         string;
  title:        string;
  relativeTime: string;
  severity:     "critical" | "elevated" | "normal";
  module:       string;
}

/** Serializable compound operation step — safe for RSC props */
export interface RailOperationStep {
  id:               string;
  label:            string;
  module:           string;
  status:           string;   // "pending" | "ready" | "blocked" | "done"
  requiresApproval: boolean;
}

/** Serializable compound operation — dates stripped, readiness resolved on server */
export interface RailCompoundOperation {
  id:                 string;
  title:              string;
  objective:          string;
  status:             string;
  priority:           string;
  riskLevel:          string;
  executionReadiness: string;   // "ready" | "partial" | "blocked"
  estimatedOutcome:   string;
  readinessSummary:   string;
  steps:              RailOperationStep[];
  agentId:            string;
  involvedModules:    string[];
}

/** Serializable executive intent — dates stripped, pressure resolved on server */
export interface RailPrimaryIntent {
  id:                 string;
  type:               string;
  title:              string;
  objective:          string;
  status:             string;
  severity:           "critical" | "elevated" | "normal";
  pressure:           string;   // "urgent" | "high" | "medium" | "low"
  successCriteria:    string;
  module:             string;
  agentId:            string;
  suggestedActionIds: string[];
  continuityMarker?:  string;   // Memory-derived continuity phrase
}

/** Serializable execution preparation state — safe for RSC props */
export interface RailExecutionPrep {
  bundleTitle:            string;
  executionMode:          string;   // "draft" | "supervised" | "assisted" | "automatic"
  readiness:              string;   // "ready" | "partial" | "blocked"
  estimatedRisk:          string;   // "low" | "medium" | "high" | "critical"
  approvalLevel:          string;   // "none" | "low" | "medium" | "high" | "critical"
  approvalRisk?:          string;   // Human-readable approval risk summary
  requiresApproval:       boolean;
  executionState:         string;   // ExecutionState
  executionStateLabel:    string;
  executionStateSeverity: "critical" | "elevated" | "normal";
  blockers:               string[];
  warnings:               string[];
  governanceAllowed:      boolean;
  bundleSummary:          string;
  depSummary:             string;
  rollbackPossible:       boolean;
}

/** Serializable agent collaboration — safe for RSC props */
export interface RailAgentCollaboration {
  id:                   string;
  sourceAgentId:        string;
  targetAgentId:        string;
  type:                 string;   // "handoff"|"consultation"|"support_request"|"escalation"|"shared_context"
  status:               string;   // "proposed"|"active"|"waiting"|"resolved"|"blocked"
  reason:               string;
  relatedModule:        string;
  priority:             string;   // "urgent"|"high"|"medium"|"low"
  contextSummary:       string;
  expectedContribution: string;
  suggestedActionIds:   string[];
  memoryPhrase?:        string;   // Memory-derived continuity phrase
}

/** Serializable progress snapshot — dates stripped */
export interface RailProgressSnapshot {
  overallProgress: number;   // 0–100
  completedSteps:  number;
  activeSteps:     number;
  blockedSteps:    number;
  stalledSteps:    number;
  status:          string;   // "pending"|"active"|"progressing"|"stalled"|"blocked"|"completed"
  momentum:        string;   // "improving"|"stable"|"slowing"|"critical"
  lastMovementAt:  string;
}

/** Serializable accountability signal — primary signal only */
export interface RailAccountabilitySignal {
  id:                    string;
  severity:              "critical" | "elevated" | "normal";
  type:                  string;
  title:                 string;
  description:           string;
  escalationRecommended: boolean;
}

/** Serializable strategic memory entry — safe for RSC props */
export interface RailMemoryEntry {
  id:              string;
  type:            string;   // StrategicMemoryType
  title:           string;
  summary:         string;
  importance:      "low" | "medium" | "high" | "critical";
  continuityScore: number;   // 0–100
  relatedModules:  string[];
  relatedAgents:   string[];
  updatedAt:       string;   // Relative time string
}

/** Serializable capability availability result — safe for RSC props */
export interface RailCapabilityResult {
  capabilityId:   string;
  agentId:        string;
  name:           string;
  type:           string;   // CapabilityType
  availability:   string;   // "available" | "restricted" | "degraded" | "blocked"
  riskLevel:      string;   // "low" | "medium" | "high" | "critical"
  reason?:        string;
}

/** Serializable capability collaboration — safe for RSC props */
export interface RailCapabilityCollaboration {
  id:              string;
  participants:    string[];
  sharedCount:     number;
  delegationCount: number;
  summary:         string;
  priority:        string;   // "low" | "medium" | "high"
}

/** Serializable runtime orchestration state — safe for RSC props (OBSERVABILITY-01) */
export interface RailRuntimeStateData {
  health:             string;   // "healthy" | "syncing" | "degraded" | "stale" | "blocked" | "recovering"
  connectorReadiness: number;   // 0–100
  operationalMode:    string;   // "Nominal" | "Supervisado" | "Restringido" | etc.
  workloadSummary:    string;
  queuedCount:        number;
  blockedCount:       number;
  activeCount:        number;
  queueSummary:       string;
  runtimeSummary:     string;
}

/** Serializable integration gateway state — safe for RSC props (OBSERVABILITY-01) */
export interface RailGatewayData {
  readyCount:        number;
  blockedCount:      number;
  degradedCount:     number;
  dispatchAvailable: boolean;
  readinessPercent:  number;
}

/** Serializable observability state — safe for RSC props (OBSERVABILITY-01) */
export interface RailObservabilityData {
  health:                string;   // "green" | "yellow" | "red" | "grey"
  healthLabel:           string;
  healthColor:           string;
  activeIncidentCount:   number;
  criticalIncidentCount: number;
  incidentSummary:       string;
  traceSummary:          string;
  traceId:               string;
  traceOkCount:          number;
  traceWarnCount:        number;
  auditEventCount:       number;
  recentAuditEvents:     Array<{ type: string; title: string; severity: string; relativeTime: string }>;
  overallSummary:        string;
}

/** Serializable vault health state — safe for RSC props (SECURITY-VAULT-01) */
export interface RailVaultData {
  health:          string;   // "secure" | "warning" | "critical" | "empty"
  totalSecrets:    number;
  activeCount:     number;
  expiringCount:   number;
  expiredCount:    number;
  invalidCount:    number;
  revokedCount:    number;
  summary:         string;
  dispatchAllowed: boolean;
}

/** Serializable supervised dispatch readiness — safe for RSC props (SECURITY-VAULT-01) */
export interface RailDispatchData {
  canDispatch:            boolean;
  requiresApproval:       boolean;
  readyConnectorCount:    number;
  blockedConnectorCount:  number;
  readyConnectors:        string[];
  summaryLabel:           string;
}

/** Serializable incident console state — safe for RSC props (SECURITY-VAULT-01) */
export interface RailIncidentConsoleData {
  totalCount:      number;
  criticalCount:   number;
  highCount:       number;
  dispatchBlocked: boolean;
  affectedModules: string[];
  summary:         string;
  incidents:       Array<{
    id:              string;
    category:        string;
    severity:        string;
    title:           string;
    replayAvailable: boolean;
  }>;
}

/** Serializable replay session state — safe for RSC props (SECURITY-VAULT-01) */
export interface RailReplayData {
  replayId:        string;
  integrity:       string;   // "intact" | "partial" | "incomplete" | "corrupt"
  replayAvailable: boolean;
  auditContinuity: boolean;
  spanCount:       number;
  accountedSpans:  number;
  summary:         string;
}

/** Serializable tenant integrations state — safe for RSC props (TENANT-INTEGRATION-01) */
export interface RailTenantIntegrationsData {
  totalCount:        number;
  connectedCount:    number;
  degradedCount:     number;
  blockedCount:      number;
  expiringCount:     number;
  dispatchReadyCount: number;
  overallHealth:     string;   // "healthy" | "warning" | "critical" | "offline"
  summary:           string;
  connectors:        Array<{
    id:           string;
    name:         string;
    status:       string;
    dispatchReady: boolean;
    riskLevel:    string;
    scopes:       string[];
    expiresAt?:   string;
  }>;
}

/** Serializable n8n bridge state — safe for RSC props (TENANT-INTEGRATION-01) */
export interface RailBridgeData {
  bridgeStatus:        string;    // N8nBridgeStatus
  workflowName:        string;
  correlationId:       string;
  runtimeValidated:    boolean;
  vaultValidated:      boolean;
  governanceValidated: boolean;
  dispatchApproved:    boolean;
  replayLinked:        boolean;
  callbackStatus:      string;    // ExecutionCallbackStatus
  summary:             string;
  validationSummary:   string;
  blockReason?:        string;
}

/** Serializable control center state — safe for RSC props (TENANT-INTEGRATION-01) */
export interface RailControlCenterData {
  health:                string;   // "operational" | "degraded" | "critical" | "maintenance"
  runtimeHealth:         string;
  activeTenants:         number;
  degradedTenants:       number;
  activeExecutions:      number;
  blockedExecutions:     number;
  pendingApprovals:      number;
  incidentCount:         number;
  criticalIncidentCount: number;
  dispatchReady:         boolean;
  vaultHealth:           string;
  orchestrationHealth:   string;   // "green" | "yellow" | "red" | "grey"
  connectorReadiness:    number;   // 0–100
  systemPressure:        string;   // "nominal" | "elevated" | "high" | "critical"
  executionPressure:     string;   // "clear" | "pending" | "elevated" | "critical"
  tenantHealthSummary:   string;
  summary:               string;
}

/** Serializable supervised execution — safe for RSC props (Phase 8/V3) */
export interface RailSupervisedExecution {
  id:                    string;
  bundleId:              string;
  status:                string;   // SupervisedExecutionStatus
  executionMode:         string;   // "draft" | "supervised"
  requiresApproval:      boolean;
  approvedByHuman:       boolean;
  rollbackAvailable:     boolean;
  executionSummary:      string;
  governanceSummary:     string;
  readinessLabel:        string;
  estimatedRisk:         string;   // "low" | "medium" | "high" | "critical"
  actionCount:           number;
  actionTitle:           string;
  confirmationState:     string;   // "pending" | "approved" | "denied" | "expired"
  confirmationMessage:   string;
  rollbackSummary:       string;
  lifecycleSummary:      string;
  recentLifecycleEvents: Array<{ type: string; summary: string; actor: string; relativeTime: string }>;
  actionValid:           boolean;
}

// ── David Commercial data (AGENTIK-AGENT-DAVID-COMMERCIAL-TOOLS-01) ──────────

export interface RailDavidCriticalRef {
  reference:    string;
  description:  string;
  opState:      string;
  disponible:   number;
  minRequired:  number;
  suggestedQty: number;
}

export interface RailDavidData {
  executiveHeadline:  string;
  criticalRefs:       RailDavidCriticalRef[];
  /** null when no production suggestion is available */
  topSuggestion: { reference: string; description: string; qty: number; line: string } | null;
  signalCount:        number;
  dataState:          "REAL" | "PARTIAL" | "EMPTY";
  topSignalSeverity:  "critical" | "high" | "medium" | "low" | null;
}

export interface CopilotOpsRailProps {
  orgSlug:          string;
  moduleLabel:      string;
  runtimeState:     RailRuntime;
  agent:            RailAgent;
  signals:          RailSignal[];
  tasks:            RailTask[];
  totalTasksCount:  number;
  alerts:           RailAlert[];
  totalAlertsCount: number;
  decisions:        number;
  decisionsHref:    string;
  nextSteps:        RailNextStep[];
  memoryItems:      string[];        // Capability hints
  suggestedActions: RailAction[];    // Contextual action chips
  operationalMemory: RailMemoryOp[]; // Past operational events
  contextInsight?:  RailContextInsight; // Cross-module intelligence (ORCHESTRATION-01)
  // Adaptive rail (ADAPTIVE-RAIL-01)
  railMode?:       string;             // "critical" | "monitoring" | "executive" | "analysis" | "calm"
  railModeLabel?:  string;             // Short contextual badge label
  modeGlow?:       string;             // Box-shadow string for header card
  modeStrip?:      string;             // Gradient string for top accent strip
  sectionOrder?:   Record<string, number>; // CSS order values per section key
  timelineEvents?: RailTimelineEvent[];    // Executive activity feed
  // Executive intent (EXECUTIVE-INTENT-01)
  primaryIntent?:      RailPrimaryIntent;    // Primary sustained executive intent
  intentContinuity?:   string;               // "Prioridad activa desde sesión anterior"
  // Compound operations (COMPOUND-OPERATIONS-01)
  primaryOperation?:   RailCompoundOperation; // Primary structured operation plan
  // Accountability layer (ACCOUNTABILITY-01)
  progressSnapshot?:              RailProgressSnapshot;       // Operation progress state
  primaryAccountabilitySignal?:   RailAccountabilitySignal;   // Highest-priority accountability signal
  accountabilityPressure?:        string;                     // "urgent"|"high"|"medium"|"low"
  followupNarrative?:             string[];                   // 2–3 lines of agent follow-up prose
  progressSummary?:               string;                     // Single-line progress summary
  // Multi-agent collaboration (MULTI-AGENT-DELEGATION-01)
  primaryCollaboration?:          RailAgentCollaboration;     // Primary agent collaboration
  collaborationPressure?:         string;                     // "urgent"|"high"|"medium"|"low"
  handoffContinuity?:             string;                     // Memory-derived continuity phrase
  // Execution Layer V2 (EXECUTION-LAYER-V2-FOUNDATION-01)
  executionPrep?:                 RailExecutionPrep;          // Execution preparation state
  // Supervised Execution (EXECUTION-LAYER-V3-CONTROLLED-OPS-01)
  supervisedExecution?:           RailSupervisedExecution;    // V3 supervised execution state
  // Strategic Memory (STRATEGIC-MEMORY-AND-CAPABILITIES-01 — Phase A)
  strategicMemory?:               RailMemoryEntry[];          // Top 2 relevant memory entries
  memorySummary?:                 string;                     // 1-line memory state summary
  memoryContinuityScore?:         number;                     // 0–100 memory continuity
  memoryPriority?:                string;                     // "low"|"medium"|"high"|"critical"
  // Capability Registry (STRATEGIC-MEMORY-AND-CAPABILITIES-01 — Phase B)
  activeCapabilities?:            RailCapabilityResult[];     // Resolved capabilities for active agent
  capabilitySummary?:             string;                     // 1-line capability state summary
  capabilityGovernanceSummary?:   string;                     // 1-line governance summary
  capabilityCollaboration?:       RailCapabilityCollaboration; // Cross-agent capability sharing
  capabilitySharingSummary?:      string;                     // 1-line sharing summary
  // Runtime Orchestration + Observability (RUNTIME-ORCHESTRATION-GATEWAY-OBSERVABILITY-01)
  runtimeStateData?:              RailRuntimeStateData;       // Runtime health + queue state
  gatewayData?:                   RailGatewayData;            // Integration gateway readiness
  observabilityData?:             RailObservabilityData;      // Orchestration log + incidents
  // Security Vault + Real Connectors (SECURITY-VAULT-AND-REAL-CONNECTORS-01)
  vaultData?:                     RailVaultData;              // Tenant vault health
  dispatchData?:                  RailDispatchData;           // Supervised dispatch readiness
  incidentConsoleData?:           RailIncidentConsoleData;    // Incident console
  replayData?:                    RailReplayData;             // Replay session state
  // Tenant Integration Manager + Control Center (TENANT-INTEGRATION-MANAGER-01)
  tenantIntegrationsData?:        RailTenantIntegrationsData; // Tenant connector states
  bridgeData?:                    RailBridgeData;             // n8n bridge state
  controlCenterData?:             RailControlCenterData;      // Global control center
  // Surface segregation (COPILOT-SURFACE-SEGREGATION-01)
  // isInternal = true means: show deep infrastructure sections (console surfaces only).
  // On all operational/tenant surfaces this is false even for SUPER_ADMIN.
  isInternal?:                    boolean;
  // isInternalUser = true means: user has an internal role (SUPER_ADMIN/AGENTIK_ADMIN).
  // Used to suppress the "acceso interno" placeholder for internal users on tenant surfaces.
  isInternalUser?:                boolean;
  // David commercial copilot data (AGENTIK-AGENT-DAVID-COMMERCIAL-TOOLS-01)
  davidData?:                     RailDavidData | null;
}

// ── Status palette ─────────────────────────────────────────────────────────────

const STATUS_DOT: Record<RailRuntime | "action_required", string> = {
  HEALTHY:         C.green,
  SYNCING:         C.blue,
  STALE:           C.amber,
  DEGRADED:        C.amber,
  action_required: C.red,
};

const STATUS_CHIP_BG: Record<RailRuntime | "action_required", string> = {
  HEALTHY:         "rgba(22,163,74,.16)",
  SYNCING:         "rgba(3,105,161,.16)",
  STALE:           "rgba(217,119,6,.16)",
  DEGRADED:        "rgba(217,119,6,.16)",
  action_required: "rgba(220,38,38,.18)",
};

const STATUS_CHIP_TEXT: Record<RailRuntime | "action_required", string> = {
  HEALTHY:         C.green,
  SYNCING:         C.blue,
  STALE:           C.amber,
  DEGRADED:        C.amber,
  action_required: C.red,
};

function computeStatusLabel(
  statusKey: RailRuntime | "action_required",
  signals:   RailSignal[],
  alerts:    RailAlert[],
): string {
  const critCount = signals.filter(s => s.severity === "critica").length;
  if (critCount >= 2)       return "Riesgo financiero moderado";
  if (critCount === 1)      return "Señales detectadas";
  if (signals.length > 0)  return "Monitoreo activo";
  if (alerts.length > 0)   return "Alertas activas";
  const LABEL: Record<RailRuntime | "action_required", string> = {
    HEALTHY:         "Operación estable",
    SYNCING:         "Actualizando contexto",
    STALE:           "Datos con retraso",
    DEGRADED:        "Contexto parcial",
    action_required: "Atención requerida",
  };
  return LABEL[statusKey];
}

// ── Signal severity palette ────────────────────────────────────────────────────

const SIG: Record<RailSeverity, {
  dot: string; bg: string; border: string; label: string; lcolor: string;
}> = {
  critica:     { dot: C.red,    bg: C.redLight,   border: C.redBorder,   label: "Crítica",     lcolor: C.redDark   },
  elevada:     { dot: C.amber,  bg: C.amberLight, border: C.amberBorder, label: "Elevada",     lcolor: C.amberDark },
  vigilancia:  { dot: C.blue,   bg: C.blueLight,  border: C.blueBorder,  label: "Vigilancia",  lcolor: C.blue      },
  informativa: { dot: C.brand,  bg: C.brandLight, border: C.brandBorder, label: "Informativa", lcolor: C.brand     },
};

const URGENCY_DOT: Record<RailTaskUrgency, string> = {
  critical: C.red,
  elevated: C.amber,
  normal:   C.blueDark,
};

// ── Alert level palette ────────────────────────────────────────────────────────

const ALERT_LVL: Record<RailAlertLevel, { chip: string; chipText: string; chipBorder: string }> = {
  CRITICAL: { chip: C.redLight,   chipText: C.redDark,   chipBorder: C.redBorder   },
  WARNING:  { chip: C.amberLight, chipText: C.amberDark, chipBorder: C.amberBorder },
  INFO:     { chip: C.blueLight,  chipText: C.blue,      chipBorder: C.blueBorder  },
};

const ALERT_LVL_LABEL: Record<RailAlertLevel, string> = {
  CRITICAL: "CRÍTICA", WARNING: "ATENCIÓN", INFO: "INFO",
};

// ── Action chip palette ────────────────────────────────────────────────────────

const ACTION_CHIP: Record<CopilotActionColor, { bg: string; text: string; border: string; hoverBorder: string }> = {
  blue:  { bg: "#EEF5FF",      text: C.blueDark,  border: "rgba(0,74,173,.22)",  hoverBorder: "rgba(0,74,173,.50)"  },
  amber: { bg: C.amberLight,   text: C.amberDark, border: C.amberBorder,         hoverBorder: C.amber               },
  red:   { bg: C.redLight,     text: C.redDark,   border: C.redBorder,           hoverBorder: C.red                 },
  green: { bg: C.greenLight,   text: C.green,     border: C.greenBorder,         hoverBorder: C.green               },
};

// ── Memory importance palette ─────────────────────────────────────────────────

const IMPORTANCE_PALETTE: Record<"low" | "medium" | "high" | "critical", {
  bg: string; border: string; text: string; label: string;
}> = {
  critical: { bg: C.redLight,   border: C.redBorder,   text: C.redDark,   label: "Crítico"  },
  high:     { bg: C.amberLight, border: C.amberBorder, text: C.amberDark, label: "Alto"     },
  medium:   { bg: "#EEF5FF",    border: "rgba(0,74,173,.18)", text: C.blueDark, label: "Medio" },
  low:      { bg: C.surface,    border: C.line,        text: C.inkFaint,  label: "Bajo"     },
};

// ── Supervised execution status palette ───────────────────────────────────────

const EXEC_STATUS_PALETTE: Record<string, {
  bg: string; border: string; text: string; dot: string; label: string;
}> = {
  prepared:              { bg: "#EEF5FF",    border: "rgba(0,74,173,.18)", text: C.blueDark,   dot: C.blue,  label: "Preparado"           },
  awaiting_confirmation: { bg: C.amberLight, border: C.amberBorder,       text: C.amberDark,  dot: C.amber, label: "Confirmación pendiente"},
  approved:              { bg: C.greenLight, border: C.greenBorder,       text: C.green,      dot: C.green, label: "Aprobado"             },
  executing:             { bg: "#EEF5FF",    border: "rgba(0,74,173,.30)", text: C.blueDark,   dot: C.blue,  label: "Ejecutando"          },
  completed:             { bg: C.greenLight, border: C.greenBorder,       text: C.green,      dot: C.green, label: "Completado"           },
  failed:                { bg: C.redLight,   border: C.redBorder,         text: C.redDark,    dot: C.red,   label: "Error"               },
  rolled_back:           { bg: C.surface,    border: C.line,              text: C.inkFaint,   dot: C.inkGhost, label: "Revertido"        },
};

const CONFIRM_STATE_DOT: Record<string, string> = {
  pending:  C.amber,
  approved: C.green,
  denied:   C.red,
  expired:  C.inkFaint,
};

// ── Capability availability palette ───────────────────────────────────────────

const AVAIL_PALETTE: Record<string, {
  dot: string; text: string; label: string;
}> = {
  available:   { dot: C.green,    text: C.green,    label: "Activa"     },
  restricted:  { dot: C.amber,    text: C.amberDark,label: "Restringida"},
  degraded:    { dot: C.amber,    text: C.amberDark,label: "Degradada"  },
  blocked:     { dot: C.red,      text: C.redDark,  label: "Bloqueada"  },
};

// ── Memory event type labels ───────────────────────────────────────────────────

const MEM_TYPE_COLOR: Record<RailMemoryOp["type"], string> = {
  detection: C.blue,
  action:    C.blueDark,
  finding:   C.amber,
  approval:  C.green,
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionLabel({ label, count, urgent, collapsible, collapsed, onToggle }: {
  label: string; count?: number; urgent?: boolean;
  collapsible?: boolean; collapsed?: boolean; onToggle?: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: S[1] + 2 }}>
      <button
        onClick={collapsible ? onToggle : undefined}
        style={{
          background: "none", border: "none", padding: 0,
          cursor: collapsible ? "pointer" : "default",
          display: "flex", alignItems: "center", gap: 4,
        }}
      >
        <span style={{
          fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
          color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.11em",
        }}>
          {label}
        </span>
        {collapsible && (
          <span style={{ fontFamily: T.mono, fontSize: 8, color: C.inkGhost, lineHeight: 1, marginTop: 1 }}>
            {collapsed ? "▸" : "▾"}
          </span>
        )}
      </button>
      {count !== undefined && count > 0 && (
        <span style={{
          fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold,
          color:      urgent ? C.redDark  : C.blueDark,
          background: urgent ? C.redLight : "#EEF5FF",
          border:     `1px solid ${urgent ? C.redBorder : "rgba(0,74,173,.18)"}`,
          borderRadius: R.pill, padding: "1px 6px", lineHeight: 1,
        }}>
          {count}
        </span>
      )}
    </div>
  );
}

function Divider() {
  return (
    <div style={{ height: 1, background: "rgba(0,74,173,.08)", marginTop: S[3], marginBottom: S[3], flexShrink: 0 }} />
  );
}

// ── Primary signal card ────────────────────────────────────────────────────────

function SignalCard({ signal }: { signal: RailSignal }) {
  const [showExp, setShowExp] = useState(false);
  const s = SIG[signal.severity];

  return (
    <div style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: R.md, padding: S[3], boxShadow: E.xs }}>
      <div style={{ display: "flex", alignItems: "center", gap: S[1], marginBottom: S[1] }}>
        <span style={{ width: 5, height: 5, borderRadius: R.pill, background: s.dot, flexShrink: 0, display: "inline-block" }} />
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: s.lcolor, textTransform: "uppercase" as const, letterSpacing: "0.07em" }}>
          Señal {s.label}
        </span>
        <span style={{ marginLeft: "auto", fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
          {signal.confidence}%
        </span>
      </div>

      <p style={{ fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.semibold, color: C.ink, margin: 0, marginBottom: 4, lineHeight: 1.35 }}>
        {signal.titulo}
      </p>

      <p style={{
        fontFamily: T.sans, fontSize: T.sz["2xs"], color: C.inkMid, margin: 0, marginBottom: S[2], lineHeight: 1.55,
        display: "-webkit-box" as unknown as undefined,
        WebkitLineClamp: showExp ? undefined : 2,
        WebkitBoxOrient: "vertical" as unknown as undefined,
        overflow: showExp ? "visible" : "hidden",
      }}>
        {signal.descripcion}
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: S[2], flexWrap: "wrap" as const }}>
        <Link href={signal.targetPath} style={{ textDecoration: "none" }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            background: C.blueDark, color: C.white, borderRadius: R.sm,
            padding: `3px ${S[2]}px`, fontFamily: T.mono, fontSize: T.sz["2xs"],
            fontWeight: T.wt.semibold, letterSpacing: "0.01em", cursor: "pointer",
          }}>
            {signal.accion}
            <span style={{ opacity: 0.75 }}>→</span>
          </span>
        </Link>
        <button
          onClick={() => setShowExp(v => !v)}
          style={{
            background: "none", border: "none", padding: 0, cursor: "pointer",
            fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint,
            textDecoration: "underline", textUnderlineOffset: 2,
          }}
        >
          {showExp ? "menos" : "¿por qué?"}
        </button>
      </div>
    </div>
  );
}

// ── No-signal state ────────────────────────────────────────────────────────────

function AllClearState() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: S[2], padding: `${S[2]}px ${S[3]}px`, background: C.greenLight, border: `1px solid ${C.greenBorder}`, borderRadius: R.md }}>
      <span style={{ width: 5, height: 5, borderRadius: R.pill, background: C.green, flexShrink: 0, display: "inline-block" }} />
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.green, fontWeight: T.wt.medium }}>
        Sin señales activas
      </span>
    </div>
  );
}

// ── Execution status palette ───────────────────────────────────────────────────

const EXEC_BADGE: Record<ExecutionStatus, { label: string; bg: string; text: string }> = {
  ready:                 { label: "LISTO",       bg: C.greenLight,  text: C.green    },
  requires_confirmation: { label: "CONFIRMAR",   bg: C.amberLight,  text: C.amberDark},
  requires_approval:     { label: "APROBACIÓN",  bg: "#FFF7ED",     text: "#92400E"  },
  blocked:               { label: "BLOQUEADO",   bg: C.surface,     text: C.inkFaint },
  unsupported:           { label: "PRONTO",      bg: C.surface,     text: C.inkGhost },
};

const RISK_DOT: Record<string, string> = {
  low:      C.green,
  medium:   C.amber,
  high:     C.red,
  critical: C.red,
};

// ── Inline confirmation component ──────────────────────────────────────────────

interface ConfirmInlineProps {
  action:      RailAction;
  onConfirm:   () => void;
  onCancel:    () => void;
}

function CopilotActionConfirmInline({ action, onConfirm, onCancel }: ConfirmInlineProps) {
  const riskKey  = action.priority === "critical" ? "high"
                 : action.priority === "elevated"  ? "medium" : "low";
  const riskDot  = RISK_DOT[riskKey] ?? C.amber;
  const riskLabel = action.priority === "critical" ? "Riesgo alto"
                  : action.priority === "elevated"  ? "Riesgo medio" : "Riesgo bajo";

  return (
    <div style={{
      marginTop:    S[1] + 2,
      padding:      `${S[2]}px`,
      background:   C.amberLight,
      border:       `1px solid ${C.amberBorder}`,
      borderRadius:  R.sm,
    }}>
      {/* Risk + safety message */}
      <div style={{ display: "flex", alignItems: "center", gap: S[1], marginBottom: S[1] }}>
        <span style={{ width: 5, height: 5, borderRadius: R.pill, background: riskDot, flexShrink: 0, display: "inline-block" }} />
        <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.semibold, color: C.amberDark, letterSpacing: "0.04em" }}>
          {riskLabel}
        </span>
      </div>
      {action.safetyMessage && (
        <p style={{ fontFamily: T.sans, fontSize: T.sz["2xs"], color: C.inkMid, margin: 0, marginBottom: S[1] + 2, lineHeight: 1.5 }}>
          {action.safetyMessage}
        </p>
      )}
      {/* Confirm / Cancel */}
      <div style={{ display: "flex", gap: S[1] }}>
        <button
          onClick={onConfirm}
          style={{
            flex:         1,
            background:   C.blueDark,
            color:        C.white,
            border:       "none",
            borderRadius:  R.sm,
            padding:      `4px ${S[2]}px`,
            fontFamily:   T.mono,
            fontSize:     T.sz["2xs"],
            fontWeight:   T.wt.semibold,
            cursor:       "pointer",
            lineHeight:   1.5,
          }}
        >
          Confirmar
        </button>
        <button
          onClick={onCancel}
          style={{
            flex:         1,
            background:   C.white,
            color:        C.inkMid,
            border:       `1px solid ${C.line}`,
            borderRadius:  R.sm,
            padding:      `4px ${S[2]}px`,
            fontFamily:   T.mono,
            fontSize:     T.sz["2xs"],
            cursor:       "pointer",
            lineHeight:   1.5,
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ── Suggested actions block ────────────────────────────────────────────────────

function SuggestedActionsBlock({ actions }: { actions: RailAction[] }) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [resultMap,    setResultMap]    = useState<Record<string, string>>({});

  if (actions.length === 0) return null;

  async function handleConfirm(action: RailAction) {
    setConfirmingId(null);

    const policy = {
      allowed:              true,
      status:               "requires_confirmation" as const,
      requiresConfirmation: true,
      requiresApproval:     false,
      safetyMessage:        action.safetyMessage,
    };

    const request = buildExecutionRequest({
      actionId:       action.id,
      agentId:        action.agentId  ?? "diego",
      orgSlug:        action.orgSlug  ?? "",
      module:         action.module   ?? "",
      policy,
      source:         "signal",
      sourceSignalId: action.signalId,
      confidence:     action.confidence,
      payload:        { targetPath: action.href },
    });

    const result = await executeAction(request, action.handlerKey ?? "navigate_to_module");

    // Audit (fire-and-forget)
    void auditExecution({
      executionRequestId: request.id,
      actionId:           action.id,
      agentId:            action.agentId  ?? "diego",
      orgSlug:            action.orgSlug  ?? "",
      module:             action.module   ?? "",
      policyStatus:       policy.status,
      policyAllowed:      policy.allowed,
      resultStatus:       result.status,
      resultMessage:      result.message,
      targetPath:         result.targetPath,
      draftId:            result.draftId,
      sourceSignalId:     action.signalId,
      confidence:         action.confidence,
      safetyMessage:      action.safetyMessage,
    });

    setResultMap(prev => ({ ...prev, [action.id]: result.message }));

    // For navigate results, redirect after brief feedback
    if (result.status === "navigated" && result.targetPath && typeof window !== "undefined") {
      setTimeout(() => { window.location.href = result.targetPath!; }, 600);
    }
  }

  return (
    <div style={{ marginTop: S[2] + 2 }}>
      <div style={{
        fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
        color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.08em",
        marginBottom: S[1] + 2,
      }}>
        Acciones sugeridas
      </div>
      <div style={{ display: "flex", flexWrap: "wrap" as const, gap: S[1] }}>
        {actions.map(action => {
          const cs      = ACTION_CHIP[action.color];
          const status  = action.executionStatus ?? (action.mode === "instant" ? "ready" : "unsupported");
          const badge   = EXEC_BADGE[status];
          const isDone  = resultMap[action.id] !== undefined;
          const isConf  = confirmingId === action.id;

          // ── Ready or requires_confirmation → full-color interactive chip ───
          if (status === "ready" || status === "requires_confirmation") {
            const isClickable = !isDone;
            const clickHandler = status === "requires_confirmation"
              ? () => { if (!isDone) setConfirmingId(isConf ? null : action.id); }
              : undefined;

            const chip = (
              <span
                key={action.id}
                onClick={clickHandler}
                style={{
                  display:      "inline-flex",
                  alignItems:   "center",
                  gap:           4,
                  background:   isDone ? C.greenLight : cs.bg,
                  color:        isDone ? C.green : cs.text,
                  border:       `1px solid ${isDone ? C.greenBorder : cs.border}`,
                  borderRadius:  R.sm,
                  padding:      `3px ${S[2]}px`,
                  fontFamily:   T.mono,
                  fontSize:     T.sz["2xs"],
                  fontWeight:   action.priority === "critical" ? T.wt.bold : T.wt.medium,
                  cursor:       isClickable ? "pointer" : "default",
                  lineHeight:   1.5,
                  transition:   "border-color 120ms, opacity 120ms",
                }}
                onMouseEnter={e => { if (isClickable && !isDone) { (e.currentTarget as HTMLElement).style.borderColor = cs.hoverBorder; (e.currentTarget as HTMLElement).style.opacity = "0.90"; }}}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = isDone ? C.greenBorder : cs.border; (e.currentTarget as HTMLElement).style.opacity = "1"; }}
              >
                {isDone ? resultMap[action.id] : action.label}
                {/* Status badge */}
                {!isDone && status !== "ready" && (
                  <span style={{
                    fontSize: 7, fontWeight: T.wt.bold,
                    background: badge.bg, color: badge.text,
                    borderRadius: R.xs, padding: "1px 3px",
                    letterSpacing: "0.04em", marginLeft: 2,
                  }}>
                    {badge.label}
                  </span>
                )}
              </span>
            );

            // For ready + navigate mode, wrap in Link
            if (status === "ready" && action.mode === "instant") {
              return (
                <Link key={action.id} href={action.href} style={{ textDecoration: "none" }}>
                  {chip}
                </Link>
              );
            }

            return (
              <div key={action.id} style={{ width: "100%" }}>
                {chip}
                {/* Inline confirmation panel */}
                {isConf && !isDone && (
                  <CopilotActionConfirmInline
                    action={action}
                    onConfirm={() => handleConfirm(action)}
                    onCancel={() => setConfirmingId(null)}
                  />
                )}
              </div>
            );
          }

          // ── requires_approval → muted chip with badge ───────────────────────
          if (status === "requires_approval") {
            return (
              <span key={action.id} title={action.statusMessage} style={{
                display:      "inline-flex",
                alignItems:   "center",
                gap:           4,
                background:   C.surface,
                color:        C.inkFaint,
                border:       `1px solid ${C.line}`,
                borderRadius:  R.sm,
                padding:      `3px ${S[2]}px`,
                fontFamily:   T.mono,
                fontSize:     T.sz["2xs"],
                cursor:       "not-allowed",
                lineHeight:   1.5,
                opacity:      0.75,
              }}>
                {action.label}
                <span style={{ fontSize: 7, fontWeight: T.wt.bold, color: "#92400E", background: "#FFF7ED", borderRadius: R.xs, padding: "1px 3px", letterSpacing: "0.04em", marginLeft: 2 }}>
                  {badge.label}
                </span>
              </span>
            );
          }

          // ── blocked → muted chip with reason ────────────────────────────────
          if (status === "blocked") {
            return (
              <span key={action.id} title={action.safetyMessage} style={{
                display:      "inline-flex",
                alignItems:   "center",
                gap:           4,
                background:   C.surface,
                color:        C.inkFaint,
                border:       `1px dashed ${C.line}`,
                borderRadius:  R.sm,
                padding:      `3px ${S[2]}px`,
                fontFamily:   T.mono,
                fontSize:     T.sz["2xs"],
                cursor:       "not-allowed",
                lineHeight:   1.5,
                opacity:      0.55,
              }}>
                {action.label}
                {action.statusMessage && (
                  <span style={{ fontSize: 7, color: C.inkGhost, letterSpacing: "0.04em", marginLeft: 2 }}>
                    {action.statusMessage}
                  </span>
                )}
              </span>
            );
          }

          // ── unsupported → greyed-out "PRONTO" ───────────────────────────────
          return (
            <span key={action.id} style={{
              display:      "inline-flex",
              alignItems:   "center",
              gap:           3,
              background:   C.surface,
              color:        C.inkFaint,
              border:       `1px solid ${C.line}`,
              borderRadius:  R.sm,
              padding:      `3px ${S[2]}px`,
              fontFamily:   T.mono,
              fontSize:     T.sz["2xs"],
              cursor:       "not-allowed",
              lineHeight:   1.5,
              opacity:      0.60,
            }}>
              {action.label}
              <span style={{ fontSize: 7, color: C.inkGhost, letterSpacing: "0.04em", marginLeft: 2 }}>PRONTO</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── Lectura contextual card ────────────────────────────────────────────────────

const INSIGHT_BORDER: Record<RailContextInsight["severity"], string> = {
  critical: C.red,
  elevated: C.amber,
  normal:   C.blueDark,
};

const INSIGHT_DOT: Record<RailContextInsight["severity"], string> = {
  critical: C.red,
  elevated: C.amber,
  normal:   C.blue,
};

function ContextInsightCard({ insight, agent }: { insight: RailContextInsight; agent: RailAgent }) {
  const borderColor = INSIGHT_BORDER[insight.severity];
  const dotColor    = INSIGHT_DOT[insight.severity];

  return (
    <div style={{
      marginTop:    S[2] + 2,
      padding:      `${S[2]}px ${S[2] + 2}px`,
      background:   "rgba(0,74,173,.04)",
      border:       "1px solid rgba(0,74,173,.10)",
      borderLeft:   `3px solid ${borderColor}`,
      borderRadius:  R.sm,
    }}>
      {/* Header: agent name + "observa" */}
      <div style={{ display: "flex", alignItems: "center", gap: S[1], marginBottom: S[1] }}>
        <span style={{ width: 4, height: 4, borderRadius: R.pill, background: dotColor, display: "inline-block", flexShrink: 0 }} />
        <span style={{
          fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.semibold,
          color: C.blueDark, letterSpacing: "0.05em", textTransform: "uppercase" as const,
        }}>
          {insight.agentName} observa
        </span>
      </div>

      {/* Main observation */}
      <p style={{
        fontFamily: T.sans, fontSize: T.sz["2xs"], color: C.ink,
        margin: 0, marginBottom: S[1], lineHeight: 1.5,
        fontWeight: T.wt.medium,
      }}>
        {insight.text}
      </p>

      {/* Why now */}
      <p style={{
        fontFamily: T.sans, fontSize: T.sz["2xs"], color: C.inkMid,
        margin: 0, marginBottom: S[1] + 2, lineHeight: 1.45,
      }}>
        {insight.whyNow}
      </p>

      {/* Next focus */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontFamily: T.mono, fontSize: 9, color: C.blueDark, opacity: 0.6 }}>›</span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.blueDark, fontWeight: T.wt.medium }}>
          {insight.nextFocus}
        </span>
      </div>
    </div>
  );
}

// ── Task row ──────────────────────────────────────────────────────────────────

function TaskRow({ task }: { task: RailTask }) {
  return (
    <Link href={task.href} style={{ textDecoration: "none", display: "block" }}>
      <div
        style={{ display: "flex", alignItems: "center", gap: S[1] + 2, padding: `5px ${S[2]}px`, borderRadius: R.sm, cursor: "pointer", transition: "background 120ms ease" }}
        onMouseEnter={e => (e.currentTarget.style.background = C.surfaceAlt)}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
      >
        <span style={{ width: 4, height: 4, borderRadius: R.pill, background: URGENCY_DOT[task.urgency], flexShrink: 0, display: "inline-block" }} />
        <span style={{ flex: 1, fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, lineHeight: 1.3 }}>
          {task.label}
        </span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.blueDark, flexShrink: 0, opacity: 0.7 }}>→</span>
      </div>
    </Link>
  );
}

// ── Alert row ─────────────────────────────────────────────────────────────────

function AlertRow({ alert }: { alert: RailAlert }) {
  const lv = ALERT_LVL[alert.level];
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: S[1] + 2, padding: "5px 0", borderBottom: `1px solid rgba(0,74,173,.06)` }}>
      <span style={{ fontFamily: T.mono, fontSize: 8, fontWeight: T.wt.bold, color: lv.chipText, background: lv.chip, border: `1px solid ${lv.chipBorder}`, borderRadius: R.xs, padding: "1px 4px", flexShrink: 0, lineHeight: 1.6, letterSpacing: "0.04em" }}>
        {ALERT_LVL_LABEL[alert.level]}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, lineHeight: 1.3 }}>
          {alert.title}
        </div>
        <div style={{ fontFamily: T.sans, fontSize: 8, color: C.inkFaint, marginTop: 1 }}>
          {alert.meta}
        </div>
      </div>
    </div>
  );
}

// ── Operational memory item ────────────────────────────────────────────────────

function MemoryOpRow({ item }: { item: RailMemoryOp }) {
  const dotColor = MEM_TYPE_COLOR[item.type];
  return (
    <div style={{
      padding:    `${S[1] + 2}px ${S[2]}px`,
      background: "rgba(0,74,173,.03)",
      border:     "1px solid rgba(0,74,173,.08)",
      borderRadius: R.sm,
    }}>
      <div style={{ fontFamily: T.sans, fontSize: T.sz["2xs"], color: C.inkMid, lineHeight: 1.45, marginBottom: 3 }}>
        {item.text}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: S[1] }}>
        <span style={{ width: 4, height: 4, borderRadius: R.pill, background: dotColor, display: "inline-block", flexShrink: 0 }} />
        <span style={{ fontFamily: T.mono, fontSize: 8, color: dotColor, fontWeight: T.wt.semibold }}>
          {item.agentName}
        </span>
        <span style={{ fontFamily: T.mono, fontSize: 8, color: C.inkGhost }}>·</span>
        <span style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint }}>
          {item.relative}
        </span>
      </div>
    </div>
  );
}

// ── Capability hint item ───────────────────────────────────────────────────────

function MemoryHintRow({ text }: { text: string }) {
  return (
    <div style={{
      padding:    `${S[1] + 2}px ${S[2]}px`,
      background: "rgba(0,74,173,.05)",
      border:     "1px solid rgba(0,74,173,.10)",
      borderLeft: "2px solid rgba(0,74,173,.28)",
      borderRadius: R.sm,
    }}>
      <span style={{ fontFamily: T.sans, fontSize: T.sz["2xs"], color: C.inkMid, lineHeight: 1.5 }}>
        {text}
      </span>
    </div>
  );
}

// ── Timeline severity palette ──────────────────────────────────────────────────

const TIMELINE_DOT: Record<string, string> = {
  critical: C.red,
  elevated: C.amber,
  normal:   C.blue,
};

// ── Executive timeline feed ────────────────────────────────────────────────────

function ExecutiveTimelineFeed({ events }: { events: RailTimelineEvent[] }) {
  const visible = events.slice(0, 3);
  if (visible.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {visible.map((ev, i) => (
        <div
          key={ev.id}
          style={{
            display:    "flex",
            alignItems: "flex-start",
            gap:         S[1] + 2,
            padding:    `4px 0`,
            borderBottom: i < visible.length - 1 ? `1px solid rgba(0,74,173,.05)` : "none",
          }}
        >
          {/* Dot + vertical line */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, paddingTop: 4 }}>
            <span style={{
              width: 5, height: 5, borderRadius: R.pill,
              background: TIMELINE_DOT[ev.severity] ?? C.blue,
              display: "inline-block", flexShrink: 0,
            }} />
            {i < visible.length - 1 && (
              <div style={{ width: 1, minHeight: 10, flex: 1, background: "rgba(0,74,173,.10)", marginTop: 2 }} />
            )}
          </div>

          {/* Text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.ink,
              lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis",
              whiteSpace: "nowrap" as const,
            }}>
              {ev.title}
            </div>
            <div style={{ display: "flex", gap: S[1], marginTop: 1 }}>
              <span style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint }}>{ev.relativeTime}</span>
              <span style={{ fontFamily: T.mono, fontSize: 8, color: C.inkGhost }}>·</span>
              <span style={{
                fontFamily: T.mono, fontSize: 8, color: C.inkGhost,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
              }}>
                {ev.module}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Intent pressure palette ────────────────────────────────────────────────────

const PRESSURE_ACCENT: Record<string, string> = {
  urgent: C.red,
  high:   C.amber,
  medium: C.blueDark,
  low:    C.blue,
};

const PRESSURE_BG: Record<string, string> = {
  urgent: C.redLight,
  high:   C.amberLight,
  medium: "#EEF5FF",
  low:    "rgba(0,74,173,.04)",
};

const PRESSURE_BORDER: Record<string, string> = {
  urgent: C.redBorder,
  high:   C.amberBorder,
  medium: "rgba(0,74,173,.18)",
  low:    "rgba(0,74,173,.10)",
};

const STATUS_LABEL: Record<string, string> = {
  active:    "Activo",
  watching:  "Vigilando",
  blocked:   "Bloqueado",
  escalated: "Escalado",
  resolved:  "Resuelto",
};

// ── Executive focus card ───────────────────────────────────────────────────────

function ExecutiveFocusCard({
  intent,
  continuity,
  orgSlug,
}: {
  intent:     RailPrimaryIntent;
  continuity: string | undefined;
  orgSlug:    string;
}) {
  const pressureAccent = PRESSURE_ACCENT[intent.pressure] ?? C.blueDark;
  const pressureBg     = PRESSURE_BG[intent.pressure]     ?? "rgba(0,74,173,.04)";
  const pressureBorder = PRESSURE_BORDER[intent.pressure] ?? "rgba(0,74,173,.10)";

  // Derive primary action link from module
  const MODULE_HREF: Record<string, string> = {
    "finanzas/tesoreria":    `/${orgSlug}/finanzas/tesoreria`,
    "finanzas/cierre":       `/${orgSlug}/finanzas`,
    "finanzas/conciliacion": `/${orgSlug}/reconciliation`,
    "integrations":          `/${orgSlug}/integrations`,
    "sales":                 `/${orgSlug}/sales`,
    "pipeline":              `/${orgSlug}/pipeline`,
  };
  const actionHref = MODULE_HREF[intent.module] ?? `/${orgSlug}/executive`;

  return (
    <div style={{
      padding:      `${S[2] + 1}px ${S[2] + 2}px`,
      background:   pressureBg,
      border:       `1px solid ${pressureBorder}`,
      borderLeft:   `3px solid ${pressureAccent}`,
      borderRadius:  R.md,
      boxShadow:    E.xs,
    }}>
      {/* Header: pressure dot + status */}
      <div style={{ display: "flex", alignItems: "center", gap: S[1], marginBottom: S[1] + 1 }}>
        <span style={{
          width: 4, height: 4, borderRadius: R.pill,
          background: pressureAccent, display: "inline-block", flexShrink: 0,
        }} />
        <span style={{
          fontFamily: T.mono, fontSize: 8, fontWeight: T.wt.semibold,
          color: pressureAccent, letterSpacing: "0.07em", textTransform: "uppercase" as const,
        }}>
          {STATUS_LABEL[intent.status] ?? intent.status}
        </span>
        {continuity && (
          <>
            <span style={{ fontFamily: T.mono, fontSize: 8, color: C.inkGhost }}>·</span>
            <span style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, letterSpacing: "0.03em" }}>
              {continuity}
            </span>
          </>
        )}
      </div>

      {/* Title — what the agent is doing */}
      <p style={{
        fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
        color: C.ink, margin: 0, marginBottom: S[1], lineHeight: 1.35,
      }}>
        {intent.title}
      </p>

      {/* Objective */}
      <p style={{
        fontFamily: T.sans, fontSize: T.sz["2xs"], color: C.inkMid,
        margin: 0, marginBottom: S[1] + 1, lineHeight: 1.5,
      }}>
        {intent.objective}
      </p>

      {/* Success criteria */}
      <p style={{
        fontFamily: T.sans, fontSize: T.sz["2xs"], color: C.inkFaint,
        margin: 0, marginBottom: S[2], lineHeight: 1.45,
        fontStyle: "italic" as const,
      }}>
        Criterio: {intent.successCriteria}
      </p>

      {/* CTA */}
      <Link href={actionHref} style={{ textDecoration: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: pressureAccent, opacity: 0.7 }}>›</span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: pressureAccent, fontWeight: T.wt.medium }}>
            {intent.module === "finanzas/tesoreria" ? "Revisar cobranza prioritaria"
             : intent.module === "finanzas/cierre"  ? "Revisar excepciones de cierre"
             : intent.module === "integrations"     ? "Revisar integraciones"
             : "Ir al módulo"}
          </span>
        </div>
      </Link>

      {/* Continuity memory marker (if from past session) */}
      {intent.continuityMarker && (
        <div style={{ marginTop: S[1] + 2, paddingTop: S[1], borderTop: `1px solid ${pressureBorder}` }}>
          <span style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, letterSpacing: "0.03em" }}>
            {intent.continuityMarker}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Operation plan card ────────────────────────────────────────────────────────

const READINESS_BADGE: Record<string, { label: string; bg: string; text: string; border: string }> = {
  ready:   { label: "LISTO",    bg: C.greenLight,  text: C.green,    border: C.greenBorder  },
  partial: { label: "PARCIAL",  bg: C.amberLight,  text: C.amberDark, border: C.amberBorder },
  blocked: { label: "BLOQUEADO",bg: C.redLight,    text: C.redDark,  border: C.redBorder    },
};

const RISK_STRIP: Record<string, string> = {
  critical: C.red,
  high:     C.amber,
  medium:   C.blueDark,
  low:      C.blue,
};

function OperationPlanCard({ op }: { op: RailCompoundOperation }) {
  const badge      = READINESS_BADGE[op.executionReadiness] ?? READINESS_BADGE.partial!;
  const stripColor = RISK_STRIP[op.riskLevel] ?? C.blueDark;

  return (
    <div style={{
      padding:      `${S[2] + 1}px ${S[2] + 2}px`,
      background:   "rgba(0,74,173,.03)",
      border:       "1px solid rgba(0,74,173,.10)",
      borderLeft:   `3px solid ${stripColor}`,
      borderRadius:  R.md,
    }}>
      {/* Header: readiness badge + title */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: S[1], marginBottom: S[1] + 1 }}>
        <p style={{
          fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
          color: C.ink, margin: 0, lineHeight: 1.3, flex: 1,
        }}>
          {op.title}
        </p>
        <span style={{
          fontFamily: T.mono, fontSize: 7, fontWeight: T.wt.bold,
          color: badge.text, background: badge.bg, border: `1px solid ${badge.border}`,
          borderRadius: R.xs, padding: "1px 5px", letterSpacing: "0.05em",
          flexShrink: 0, lineHeight: 1.6,
        }}>
          {badge.label}
        </span>
      </div>

      {/* Objective */}
      <p style={{
        fontFamily: T.sans, fontSize: T.sz["2xs"], color: C.inkMid,
        margin: 0, marginBottom: S[2], lineHeight: 1.45,
      }}>
        {op.objective}
      </p>

      {/* Steps — sequential flow */}
      <div style={{ display: "flex", flexDirection: "column", gap: 1, marginBottom: S[2] }}>
        {op.steps.map((step, i) => (
          <div key={step.id} style={{ display: "flex", alignItems: "flex-start", gap: S[1] + 1 }}>
            {/* Step number dot */}
            <div style={{
              width: 14, height: 14, borderRadius: R.pill,
              background: step.status === "done"    ? C.green     :
                          step.status === "blocked"  ? C.redLight  :
                          i === 0                    ? "rgba(0,74,173,.15)" : "rgba(0,74,173,.07)",
              border: `1px solid ${
                step.status === "done"   ? C.greenBorder  :
                step.status === "blocked" ? C.redBorder   :
                "rgba(0,74,173,.20)"
              }`,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, marginTop: 2,
            }}>
              <span style={{
                fontFamily: T.mono, fontSize: 7, fontWeight: T.wt.bold,
                color: step.status === "done" ? C.green : C.blueDark,
                lineHeight: 1,
              }}>
                {i + 1}
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{
                fontFamily: T.mono, fontSize: T.sz["2xs"],
                color: step.status === "done" ? C.inkFaint : C.inkMid,
                lineHeight: 1.4,
                textDecoration: step.status === "done" ? "line-through" : "none",
              }}>
                {step.label}
              </span>
              {step.requiresApproval && (
                <span style={{
                  fontFamily: T.mono, fontSize: 7, color: C.amberDark,
                  background: C.amberLight, border: `1px solid ${C.amberBorder}`,
                  borderRadius: R.xs, padding: "0 3px", marginLeft: 4,
                  letterSpacing: "0.04em", lineHeight: 1.6,
                }}>
                  APROBACIÓN
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Readiness summary + outcome */}
      {op.readinessSummary && (
        <p style={{
          fontFamily: T.mono, fontSize: 8, color: C.inkFaint,
          margin: 0, marginBottom: S[1], letterSpacing: "0.02em",
        }}>
          {op.readinessSummary}
        </p>
      )}
      <p style={{
        fontFamily: T.sans, fontSize: T.sz["2xs"], color: C.inkFaint,
        margin: 0, lineHeight: 1.4, fontStyle: "italic" as const,
      }}>
        Resultado: {op.estimatedOutcome}
      </p>
    </div>
  );
}

// ── Operational status card (Phase 7) ─────────────────────────────────────────

const MOMENTUM_LABEL: Record<string, string> = {
  improving: "mejorando",
  stable:    "estable",
  slowing:   "perdiendo ritmo",
  critical:  "crítico",
};

const MOMENTUM_ICON: Record<string, string> = {
  improving: "↑",
  stable:    "→",
  slowing:   "↓",
  critical:  "⚠",
};

function OperationalStatusCard({
  snapshot,
  signal,
  pressure,
}: {
  snapshot: RailProgressSnapshot;
  signal?:  RailAccountabilitySignal;
  pressure: string;
}) {
  const pressureBorder =
    pressure === "urgent" ? C.red     :
    pressure === "high"   ? C.amber   :
    pressure === "medium" ? C.blueDark :
    C.line;

  const momentumColor =
    snapshot.momentum === "improving" ? C.green  :
    snapshot.momentum === "slowing"   ? C.amber  :
    snapshot.momentum === "critical"  ? C.red    :
    C.inkFaint;

  return (
    <div style={{
      background:   C.white,
      border:       `1px solid ${pressureBorder}`,
      borderRadius: R.md,
      padding:      `${S[2]}px`,
      transition:   "border-color 300ms ease",
    }}>
      {/* Progress row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: S[1] }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, fontWeight: T.wt.semibold }}>
          Progreso del plan
        </span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, fontWeight: T.wt.black }}>
          {snapshot.overallProgress}%
        </span>
      </div>

      {/* Momentum + step counts row */}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap" as const, gap: "3px 6px", marginBottom: signal ? S[1] : 0 }}>
        <span style={{ fontFamily: T.mono, fontSize: 9, color: momentumColor }}>
          {MOMENTUM_ICON[snapshot.momentum] ?? "→"} {MOMENTUM_LABEL[snapshot.momentum] ?? snapshot.momentum}
        </span>
        {snapshot.activeSteps > 0 && (
          <>
            <span style={{ color: C.inkGhost, fontSize: 9 }}>·</span>
            <span style={{ fontFamily: T.mono, fontSize: 9, color: C.green }}>
              {snapshot.activeSteps} activo{snapshot.activeSteps > 1 ? "s" : ""}
            </span>
          </>
        )}
        {snapshot.blockedSteps > 0 && (
          <>
            <span style={{ color: C.inkGhost, fontSize: 9 }}>·</span>
            <span style={{ fontFamily: T.mono, fontSize: 9, color: C.red }}>
              {snapshot.blockedSteps} bloqueado{snapshot.blockedSteps > 1 ? "s" : ""}
            </span>
          </>
        )}
        {snapshot.stalledSteps > 0 && (
          <>
            <span style={{ color: C.inkGhost, fontSize: 9 }}>·</span>
            <span style={{ fontFamily: T.mono, fontSize: 9, color: C.amber }}>
              {snapshot.stalledSteps} en espera
            </span>
          </>
        )}
        {snapshot.activeSteps === 0 && snapshot.blockedSteps === 0 && snapshot.stalledSteps === 0 && snapshot.completedSteps > 0 && (
          <>
            <span style={{ color: C.inkGhost, fontSize: 9 }}>·</span>
            <span style={{ fontFamily: T.mono, fontSize: 9, color: C.green }}>
              {snapshot.completedSteps} completado{snapshot.completedSteps > 1 ? "s" : ""}
            </span>
          </>
        )}
      </div>

      {/* Primary accountability signal (if any) */}
      {signal && (
        <div style={{
          marginTop:    S[1],
          padding:      `${S[1]}px ${S[1] + 2}px`,
          background:   signal.severity === "critical"
            ? "rgba(220,38,38,.06)"
            : signal.severity === "elevated"
            ? "rgba(217,119,6,.06)"
            : "rgba(0,74,173,.04)",
          borderLeft: `2px solid ${
            signal.severity === "critical" ? C.red   :
            signal.severity === "elevated" ? C.amber :
            C.blueDark
          }`,
          borderRadius: `0 ${R.sm}px ${R.sm}px 0`,
        }}>
          <p style={{ fontFamily: T.mono, fontSize: 9, color: C.inkMid, margin: 0, lineHeight: 1.4 }}>
            {signal.title}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Follow-up narrative card (Phase 8 + 11) ────────────────────────────────────

function FollowupNarrativeCard({ lines }: { lines: string[] }) {
  return (
    <div style={{
      background:   "rgba(0,74,173,.03)",
      border:       `1px solid rgba(0,74,173,.10)`,
      borderRadius: R.md,
      padding:      `${S[2]}px`,
    }}>
      {lines.map((line, i) => (
        <p key={i} style={{
          fontFamily:   T.sans,
          fontSize:     T.sz["2xs"],
          color:        C.inkMid,
          margin:       0,
          lineHeight:   1.5,
          marginBottom: i < lines.length - 1 ? S[1] : 0,
        }}>
          {line}
        </p>
      ))}
    </div>
  );
}

// ── Execution preparation card (Phase 8 + 10) ─────────────────────────────────

const READINESS_DOT: Record<string, string> = {
  ready:   "#16A34A",
  partial: "#D97706",
  blocked: "#DC2626",
};

const RISK_CHIP_BG: Record<string, string> = {
  critical: "rgba(220,38,38,.10)",
  high:     "rgba(217,119,6,.10)",
  medium:   "rgba(0,74,173,.08)",
  low:      "rgba(22,163,74,.08)",
};

const RISK_CHIP_COLOR: Record<string, string> = {
  critical: "#DC2626",
  high:     "#D97706",
  medium:   "#004AAD",
  low:      "#16A34A",
};

const MODE_LABEL: Record<string, string> = {
  draft:      "Borrador",
  supervised: "Supervisado",
  assisted:   "Asistido",
  automatic:  "Automático",
};

const APPROVAL_BADGE_BG: Record<string, string> = {
  critical: "rgba(220,38,38,.10)",
  high:     "rgba(217,119,6,.10)",
  medium:   "rgba(0,74,173,.08)",
  low:      "rgba(22,163,74,.06)",
  none:     "transparent",
};

function ExecutionPrepCard({ prep }: { prep: RailExecutionPrep }) {
  const stateColor =
    prep.executionStateSeverity === "critical" ? C.red   :
    prep.executionStateSeverity === "elevated" ? C.amber :
    C.green;

  return (
    <div style={{
      background:   C.white,
      border:       `1px solid ${prep.governanceAllowed ? C.line : C.redBorder ?? "#FECACA"}`,
      borderRadius: R.md,
      padding:      `${S[2]}px`,
      transition:   "border-color 300ms ease",
    }}>
      {/* Bundle title row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: S[1] }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.ink, fontWeight: T.wt.semibold }}>
          {prep.bundleTitle}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: READINESS_DOT[prep.readiness] ?? C.inkFaint, display: "inline-block", flexShrink: 0 }} />
          <span style={{ fontFamily: T.mono, fontSize: 9, color: READINESS_DOT[prep.readiness] ?? C.inkFaint }}>
            {prep.readiness === "ready" ? "Listo" : prep.readiness === "partial" ? "Parcial" : "Bloqueado"}
          </span>
        </div>
      </div>

      {/* Mode + Risk chips row */}
      <div style={{ display: "flex", alignItems: "center", gap: S[1], flexWrap: "wrap" as const, marginBottom: S[1] }}>
        {/* Execution mode chip */}
        <span style={{
          fontFamily: T.mono, fontSize: 9,
          background: "rgba(0,74,173,.07)", color: C.blueDark,
          borderRadius: R.xs, padding: "1px 5px",
          letterSpacing: "0.03em",
        }}>
          {MODE_LABEL[prep.executionMode] ?? prep.executionMode}
        </span>

        {/* Risk chip */}
        <span style={{
          fontFamily: T.mono, fontSize: 9,
          background: RISK_CHIP_BG[prep.estimatedRisk] ?? "rgba(0,0,0,.06)",
          color:      RISK_CHIP_COLOR[prep.estimatedRisk] ?? C.inkFaint,
          borderRadius: R.xs, padding: "1px 5px",
        }}>
          Riesgo {prep.estimatedRisk}
        </span>

        {/* Approval badge — Phase 10 Human-in-the-loop */}
        {prep.requiresApproval && (
          <span style={{
            fontFamily: T.mono, fontSize: 9,
            background: APPROVAL_BADGE_BG[prep.approvalLevel] ?? APPROVAL_BADGE_BG.medium,
            color:      RISK_CHIP_COLOR[prep.approvalLevel] ?? C.amber,
            borderRadius: R.xs, padding: "1px 5px",
            letterSpacing: "0.03em",
          }}>
            aprobación {prep.approvalLevel}
          </span>
        )}
      </div>

      {/* Blockers list */}
      {prep.blockers.length > 0 && (
        <div style={{ marginBottom: S[1] }}>
          <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, display: "block", marginBottom: 2 }}>
            Bloqueos:
          </span>
          {prep.blockers.slice(0, 2).map((b, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 3, marginBottom: 2 }}>
              <span style={{ fontFamily: T.mono, fontSize: 9, color: C.red, flexShrink: 0 }}>›</span>
              <span style={{ fontFamily: T.sans, fontSize: 9, color: C.inkMid, lineHeight: 1.4 }}>{b}</span>
            </div>
          ))}
        </div>
      )}

      {/* Warnings (Phase 10 governance hints) */}
      {prep.warnings.length > 0 && prep.blockers.length === 0 && (
        <div style={{ marginBottom: S[1] }}>
          {prep.warnings.slice(0, 1).map((w, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 3 }}>
              <span style={{ fontFamily: T.mono, fontSize: 9, color: C.amber, flexShrink: 0 }}>›</span>
              <span style={{ fontFamily: T.sans, fontSize: 9, color: C.inkMid, lineHeight: 1.4 }}>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Approval risk hint — Phase 10 */}
      {prep.approvalRisk && (
        <div style={{
          marginTop:    S[1],
          padding:      `${S[1]}px ${S[1] + 2}px`,
          background:   "rgba(217,119,6,.05)",
          borderLeft:   `2px solid ${C.amber}`,
          borderRadius: `0 ${R.sm}px ${R.sm}px 0`,
          marginBottom: S[1],
        }}>
          <p style={{ fontFamily: T.mono, fontSize: 9, color: C.amberDark, margin: 0, lineHeight: 1.4 }}>
            {prep.approvalRisk}
          </p>
        </div>
      )}

      {/* Execution state row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: `1px solid rgba(0,74,173,.06)`, paddingTop: S[1], marginTop: S[1] }}>
        <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>Estado:</span>
        <span style={{ fontFamily: T.mono, fontSize: 9, color: stateColor, fontWeight: T.wt.semibold }}>
          {prep.executionStateLabel}
        </span>
      </div>
    </div>
  );
}

// ── Agent collaboration card (Phase 6) ────────────────────────────────────────

const AGENT_ACCENT: Record<string, string> = {
  diego: "#004AAD",
  luca:  "#7c3aed",
  sofi:  "#0891b2",
  mila:  "#be185d",
};

const AGENT_AVATAR: Record<string, string> = {
  diego: "D",
  luca:  "L",
  sofi:  "S",
  mila:  "M",
};

const AGENT_SPECIALTY: Record<string, string> = {
  diego: "Finanzas",
  luca:  "Marketing",
  sofi:  "Técnico",
  mila:  "Ventas",
};

const TYPE_LABEL: Record<string, string> = {
  handoff:         "Handoff ejecutivo",
  consultation:    "Consulta técnica",
  support_request: "Apoyo recomendado",
  escalation:      "Escalación activa",
  shared_context:  "Contexto compartido",
};

const COLLAB_PRESSURE_BORDER: Record<string, string> = {
  urgent: "#DC2626",
  high:   "#D97706",
  medium: "#004AAD",
  low:    "rgba(0,74,173,.15)",
};

function AgentMiniChip({ agentId }: { agentId: string }) {
  const accent = AGENT_ACCENT[agentId] ?? "#666";
  const initial = AGENT_AVATAR[agentId] ?? agentId.charAt(0).toUpperCase();
  const specialty = AGENT_SPECIALTY[agentId] ?? agentId;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <div style={{
        width: 18, height: 18, borderRadius: "50%",
        background:  `linear-gradient(135deg, ${accent}EE 0%, ${accent}88 100%)`,
        border:      `1.5px solid ${accent}55`,
        display:     "flex", alignItems: "center", justifyContent: "center",
        flexShrink:  0,
      }}>
        <span style={{ fontFamily: T.mono, fontSize: 8, fontWeight: T.wt.black, color: "#fff", lineHeight: 1 }}>
          {initial}
        </span>
      </div>
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.ink, fontWeight: T.wt.semibold }}>
        {agentId.charAt(0).toUpperCase() + agentId.slice(1)}
      </span>
      <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
        · {specialty}
      </span>
    </div>
  );
}

function AgentCollaborationCard({
  collab,
  pressure,
}: {
  collab:   RailAgentCollaboration;
  pressure: string;
}) {
  const borderColor = COLLAB_PRESSURE_BORDER[pressure] ?? COLLAB_PRESSURE_BORDER.low;
  const typeLabel   = TYPE_LABEL[collab.type] ?? collab.type;

  return (
    <div style={{
      background:   C.white,
      border:       `1px solid ${borderColor}`,
      borderRadius: R.md,
      padding:      `${S[2]}px`,
      transition:   "border-color 300ms ease",
    }}>
      {/* Collaboration type badge */}
      <div style={{ marginBottom: S[1] + 2 }}>
        <span style={{
          fontFamily: T.mono, fontSize: 9,
          color: borderColor,
          letterSpacing: "0.05em",
          textTransform: "uppercase" as const,
          fontWeight: T.wt.semibold,
        }}>
          {typeLabel}
        </span>
      </div>

      {/* Source → Target row */}
      <div style={{ display: "flex", alignItems: "center", gap: S[1] + 2, marginBottom: S[1] + 2 }}>
        <AgentMiniChip agentId={collab.sourceAgentId} />
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>→</span>
        <AgentMiniChip agentId={collab.targetAgentId} />
      </div>

      {/* Reason */}
      <p style={{
        fontFamily: T.sans, fontSize: T.sz["2xs"], color: C.inkMid,
        margin: `0 0 ${S[1]}px`,
        lineHeight: 1.4,
      }}>
        {collab.reason}
      </p>

      {/* Expected contribution */}
      <div style={{
        padding:      `${S[1]}px ${S[1] + 2}px`,
        background:   "rgba(0,74,173,.04)",
        borderLeft:   `2px solid ${AGENT_ACCENT[collab.targetAgentId] ?? C.blueDark}`,
        borderRadius: `0 ${R.sm}px ${R.sm}px 0`,
        marginBottom: collab.suggestedActionIds.length > 0 ? S[1] : 0,
      }}>
        <p style={{ fontFamily: T.mono, fontSize: 9, color: C.inkMid, margin: 0, lineHeight: 1.4 }}>
          <span style={{ color: C.inkFaint }}>
            {collab.targetAgentId.charAt(0).toUpperCase() + collab.targetAgentId.slice(1)} debe:
          </span>
          {" "}{collab.expectedContribution}
        </p>
      </div>

      {/* Memory continuity phrase (Phase 8 / 3) */}
      {collab.memoryPhrase && (
        <p style={{
          fontFamily: T.sans, fontSize: 9, color: C.inkFaint,
          margin: `${S[1]}px 0 0`, lineHeight: 1.4, fontStyle: "italic" as const,
        }}>
          {collab.memoryPhrase}
        </p>
      )}

      {/* Primary suggested action */}
      {collab.suggestedActionIds[0] && (
        <div style={{ marginTop: S[1] }}>
          <span style={{
            fontFamily: T.mono, fontSize: 9,
            color: C.blueDark, opacity: 0.8,
          }}>
            › {collab.suggestedActionIds[0].replace(/_/g, " ")}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Collapsed section collapsed state helpers ──────────────────────────────────

function getInitialCollapsed(railMode?: string, isInternal = false): Record<string, boolean> {
  // Infrastructure sections start collapsed unless we are on an internal surface
  const infraDefaults: Record<string, boolean> = isInternal
    ? { replay: true, bridge: true, observability: true }
    : {};

  switch (railMode) {
    case "critical":   return { ...infraDefaults, memory: true, timeline: true };
    case "monitoring": return { ...infraDefaults, memory: true };
    case "calm":       return { ...infraDefaults, tasks: true, alerts: true, decisions: true };
    case "analysis":   return { ...infraDefaults, alerts: true, decisions: true };
    default:           return { ...infraDefaults };
  }
}

// ── Main component ─────────────────────────────────────────────────────────────

export function CopilotOpsRail({
  orgSlug,
  moduleLabel,
  runtimeState,
  agent,
  signals,
  tasks,
  totalTasksCount,
  alerts,
  totalAlertsCount,
  decisions,
  decisionsHref,
  nextSteps,
  memoryItems,
  suggestedActions,
  operationalMemory,
  contextInsight,
  railMode,
  railModeLabel,
  modeGlow,
  modeStrip,
  sectionOrder,
  timelineEvents,
  primaryIntent,
  intentContinuity,
  primaryOperation,
  progressSnapshot,
  primaryAccountabilitySignal,
  accountabilityPressure,
  followupNarrative,
  primaryCollaboration,
  collaborationPressure,
  executionPrep,
  supervisedExecution,
  strategicMemory,
  memorySummary,
  memoryContinuityScore,
  memoryPriority,
  activeCapabilities,
  capabilitySummary,
  capabilityGovernanceSummary,
  capabilityCollaboration,
  capabilitySharingSummary,
  runtimeStateData,
  gatewayData,
  observabilityData,
  vaultData,
  dispatchData,
  incidentConsoleData,
  replayData,
  tenantIntegrationsData,
  bridgeData,
  controlCenterData,
  isInternal = false,
  isInternalUser = false,
  davidData,
}: CopilotOpsRailProps) {
  const [tasksExpanded,       setTasksExpanded]       = useState(false);
  const [alertsExpanded,      setAlertsExpanded]      = useState(false);
  const [davidProposalState,  setDavidProposalState]  = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [sectionCollapsed, setSectionCollapsed] = useState<Record<string, boolean>>(() =>
    getInitialCollapsed(railMode, isInternal)
  );

  function toggleSection(key: string) {
    setSectionCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function ord(key: string, fallback: number): number {
    return sectionOrder?.[key] ?? fallback;
  }

  // ── Status (used by header card) ─────────────────────────────────────────
  const hasCritical  = signals.some(s => s.severity === "critica");
  const statusKey    = hasCritical ? "action_required" : runtimeState;
  const statusLabel  = computeStatusLabel(statusKey, signals, alerts);
  const statusDot    = STATUS_DOT[statusKey];
  const statusChipBg = STATUS_CHIP_BG[statusKey];
  const statusText   = STATUS_CHIP_TEXT[statusKey];

  // ── 3-card engine data ────────────────────────────────────────────────────
  const criticalSignalCount = signals.filter(s => s.severity === "critica").length;
  const elevatedSignalCount = signals.filter(s => s.severity === "elevada").length;
  const primarySignal       = signals[0] ?? null;

  const insightSentiment: "positive" | "neutral" | "warning" | "critical" =
    criticalSignalCount > 0 || (incidentConsoleData?.criticalCount ?? 0) > 0  ? "critical"  :
    runtimeState === "DEGRADED" || runtimeState === "STALE"                   ? "warning"   :
    elevatedSignalCount > 0 || decisions > 0                                  ? "warning"   :
    signals.length === 0                                                       ? "positive"  :
    "neutral";

  const insightHeadline =
    insightSentiment === "critical" ? "Señales críticas detectadas"        :
    insightSentiment === "warning"  ? (decisions > 0 ? "Aprobación pendiente" : "Atención recomendada") :
    insightSentiment === "positive" ? "Todo en orden"                      :
    primaryIntent?.title ?? "Monitoreo activo";

  const insightSummary =
    primarySignal?.descripcion ??
    primaryIntent?.objective   ??
    contextInsight?.text       ??
    `${moduleLabel} opera con normalidad. Sin alertas activas.`;

  const insightSuggestionLabel =
    nextSteps[0]?.label         ??
    suggestedActions[0]?.label  ??
    primaryIntent?.successCriteria;

  const insightSuggestionHref = nextSteps[0]?.href ?? suggestedActions[0]?.href;

  // Alert items — business alerts take priority; fall back to incidents
  const alertItems = alerts.slice(0, 4);
  const alertCount = Math.max(alerts.length, incidentConsoleData?.totalCount ?? 0);

  // Task items — include supervised exec approval as first task if pending
  type TaskItem = { id: string; label: string; dueLabel: string; urgency: string; href: string };
  const taskItems: TaskItem[] = [];
  if (supervisedExecution && supervisedExecution.confirmationState === "pending") {
    taskItems.push({
      id: "supexec", label: supervisedExecution.actionTitle || "Aprobar operación supervisada",
      dueLabel: "Hoy", urgency: "critical", href: `/${orgSlug}/agentik`,
    });
  }
  for (const t of tasks.slice(0, 4)) {
    taskItems.push({ id: t.id, label: t.label, dueLabel: t.urgency === "critical" ? "Hoy" : t.urgency === "elevated" ? "Mañana" : "Próximo", urgency: t.urgency, href: t.href });
  }
  for (const ns of nextSteps.slice(0, Math.max(0, 3 - taskItems.length))) {
    taskItems.push({ id: `ns-${ns.label}`, label: ns.label, dueLabel: "Sugerido", urgency: "normal", href: ns.href });
  }
  const taskCount = totalTasksCount + (supervisedExecution?.confirmationState === "pending" ? 1 : 0);

  // ── Rail visual system ─────────────────────────────────────────────────────
  const RAIL_BG     = "#F8F9FC";   // near-white editorial container
  const BODY_BG     = "#F1F3F8";   // soft cool gray body area

  // Header card — dark, institutional, Agentik OS anchor
  const CARD_BG     = "linear-gradient(160deg, #001535 0%, #002460 58%, #002E7A 100%)";
  const CARD_BR     = "rgba(0,74,173,.22)";
  const CARD_SHADOW = "0 4px 22px rgba(0,18,60,.14), 0 1px 3px rgba(0,18,60,.06), inset 0 1px 0 rgba(255,255,255,.05)";
  const TEXT_PRI    = "rgba(235,238,246,.94)";   // for header card text only
  const TEXT_SEC    = "rgba(235,238,246,.58)";
  const TEXT_MUT    = "rgba(235,238,246,.32)";

  // Executive cards — cool Agentik blue surfaces, urgency via border/accent only
  const execBg = (s: string) =>
    s === "critical" ? "#EDF2FF" : s === "warning" ? "#EEF4FF" : s === "positive" ? "#E8F2FF" : "#EAF1FF";
  const execBr = (s: string) =>
    s === "critical" ? "rgba(220,38,38,.22)" : s === "warning" ? "rgba(180,120,0,.16)" : s === "positive" ? "rgba(0,74,173,.16)" : "rgba(0,74,173,.13)";
  const execShadow = "0 1px 4px rgba(0,18,60,.07), 0 0 0 1px rgba(0,74,173,.08)";

  // Text tokens for light executive cards — cool-biased, legible
  const ET_PRI  = "#0A1628";   // near-black, cool tint
  const ET_SEC  = "#2C3A52";   // body copy — darker for legibility
  const ET_MUT  = "#536078";   // metadata — cooler mid-tone, not gray
  const ET_ACC  = "#004AAD";   // Agentik brand blue

  // Sentiment headline color (dark text on light card)
  const sentimentColor =
    insightSentiment === "critical" ? "#B91C1C" :
    insightSentiment === "warning"  ? "#92400E" :
    insightSentiment === "positive" ? "#065F46" :
    "#004AAD";

  // Alert severity colors on light backgrounds
  const ALERT_SEV: Record<string, string> = {
    CRITICAL: "#DC2626", WARNING: "#B45309", INFO: "#2563EB",
  };
  const ALERT_BG: Record<string, string> = {
    CRITICAL: "rgba(254,226,226,.80)", WARNING: "rgba(254,243,199,.80)", INFO: "rgba(219,234,254,.80)",
  };

  const TASK_DUE: Record<string, string> = {
    critical: "#059669", elevated: "#B45309", normal: ET_MUT, Hoy: "#059669", Mañana: "#B45309",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>

      {/* ── Top accent strip — adaptive color per rail mode ────────────────── */}
      <div style={{
        height: 3,
        background: modeStrip ?? "linear-gradient(90deg, #004AAD, #1E63D8, #4F8FE8)",
        flexShrink: 0,
        transition: "background 400ms ease",
      }} />

      {/* ── Header card — enterprise identity ─────────────────────────────── */}
      <div style={{ padding: `${S[3]}px ${S[3]}px ${S[2]}px`, background: RAIL_BG, flexShrink: 0 }}>
        <div style={{
          background:   "linear-gradient(150deg, #001028 0%, #001E50 50%, #002B72 100%)",
          borderRadius:  R.xl,
          border:       "1px solid rgba(0,74,173,.32)",
          boxShadow:    modeGlow ?? "0 6px 28px rgba(0,14,40,.32), 0 1px 3px rgba(0,14,40,.14), inset 0 1px 0 rgba(255,255,255,.06)",
          padding:      `${S[3]}px`,
          transition:   "box-shadow 400ms ease",
        }}>

          {/* Row 1: wordmark + status */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: S[2] + 2 }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: "rgba(255,255,255,.95)", letterSpacing: "0.015em" }}>
              <span style={{ fontWeight: T.wt.black, letterSpacing: "0.02em" }}>Agentik</span>
              {" "}
              <span style={{ fontWeight: T.wt.normal, opacity: 0.55 }}>Copilot</span>
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 4, background: statusChipBg, borderRadius: R.pill, padding: "2px 8px" }}>
              <span style={{ width: 5, height: 5, borderRadius: R.pill, background: statusDot, display: "inline-block", flexShrink: 0, boxShadow: `0 0 4px ${statusDot}88` }} />
              <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.semibold, color: statusText, whiteSpace: "nowrap" as const, letterSpacing: "0.04em" }}>
                {statusLabel}
              </span>
            </div>
          </div>

          {/* Row 2: agent identity — large avatar + name/specialty */}
          <div style={{ display: "flex", alignItems: "center", gap: S[2] + 2, marginBottom: S[2] }}>
            {/* Avatar — photo when available, letter fallback */}
            {agent.photo ? (
              <div style={{
                width: 42, height: 42, borderRadius: "50%",
                overflow:   "hidden",
                flexShrink: 0,
                border:     `2px solid ${agent.accentColor}60`,
                boxShadow:  `0 0 14px ${agent.accentColor}40, 0 2px 8px rgba(0,10,30,.30)`,
              }}>
                <Image
                  src={agent.photo}
                  alt={agent.name}
                  width={42}
                  height={42}
                  style={{ objectFit: "cover", objectPosition: "top center", display: "block" }}
                />
              </div>
            ) : (
              <div style={{
                width: 42, height: 42, borderRadius: "50%",
                background:  `linear-gradient(135deg, ${agent.accentColor} 0%, ${agent.accentColor}99 100%)`,
                border:      `2px solid ${agent.accentColor}60`,
                display:     "flex", alignItems: "center", justifyContent: "center",
                flexShrink:  0,
                boxShadow:   `0 0 14px ${agent.accentColor}40, 0 2px 8px rgba(0,10,30,.30)`,
              }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.md, fontWeight: T.wt.black, color: "#FFFFFF", lineHeight: 1 }}>
                  {agent.avatar}
                </span>
              </div>
            )}
            {/* displayName + title */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: "rgba(255,255,255,.95)", lineHeight: 1.2, letterSpacing: "0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                {agent.displayName}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: 9, color: `${agent.accentColor}CC`, letterSpacing: "0.04em", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                {agent.title}
              </div>
            </div>
          </div>

          {/* Row 3: estado simple — sin ruido técnico */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,.08)", paddingTop: S[1] + 2, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontFamily: T.mono, fontSize: 8, color: "rgba(255,255,255,.28)", letterSpacing: "0.06em", textTransform: "uppercase" as const }}>
              Agentik OS
            </span>
            <div style={{ fontFamily: T.mono, fontSize: 8, color: runtimeState === "HEALTHY" ? "rgba(110,231,183,.70)" : "rgba(252,211,77,.70)", flexShrink: 0 }}>
              {runtimeState === "HEALTHY" ? "↻ en vivo" : runtimeState === "SYNCING" ? "↻ sync" : "⚠ parcial"}
            </div>
          </div>

        </div>
      </div>

      {/* ── Executive 3-card body ───────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", background: BODY_BG, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: `${S[3]}px`, paddingTop: S[2] + 4, display: "flex", flexDirection: "column", gap: S[3] + 4 }}>

        {/* ── CARD 1 — ESTADO OPERATIVO ──────────────────────────────────── */}
        <div style={{
          background: execBg(insightSentiment), border: `1px solid ${execBr(insightSentiment)}`,
          borderRadius: R.xl, overflow: "hidden", boxShadow: execShadow,
        }}>
          {/* Card header */}
          <div style={{ display: "flex", alignItems: "center", gap: S[2], padding: `${S[3]}px ${S[3]}px ${S[1] + 2}px` }}>
            <div style={{
              width: 30, height: 30, borderRadius: R.md, flexShrink: 0,
              background: insightSentiment === "critical" ? "rgba(220,38,38,.10)" : insightSentiment === "warning" ? "rgba(180,120,0,.10)" : "rgba(0,74,173,.08)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={insightSentiment === "critical" ? "#DC2626" : insightSentiment === "warning" ? "#B45309" : ET_ACC} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.semibold, color: ET_MUT, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>Estado operativo</div>
            </div>
            <div style={{
              fontFamily: T.mono, fontSize: 8, letterSpacing: "0.04em", flexShrink: 0,
              color: runtimeState === "HEALTHY" ? "#065F46" : runtimeState === "SYNCING" ? ET_ACC : "#92400E",
              background: runtimeState === "HEALTHY" ? "rgba(5,150,105,.08)" : runtimeState === "SYNCING" ? "rgba(0,74,173,.08)" : "rgba(180,120,0,.08)",
              border: `1px solid ${runtimeState === "HEALTHY" ? "rgba(5,150,105,.15)" : runtimeState === "SYNCING" ? "rgba(0,74,173,.12)" : "rgba(180,120,0,.15)"}`,
              borderRadius: R.pill, padding: "1px 7px",
            }}>
              {runtimeState === "HEALTHY" ? "en vivo" : runtimeState === "SYNCING" ? "sync" : "parcial"}
            </div>
          </div>

          {/* Headline + body */}
          <div style={{ padding: `${S[1]}px ${S[3]}px ${S[3]}px` }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.md, fontWeight: T.wt.bold, color: sentimentColor, marginBottom: S[1] + 2, lineHeight: 1.3, letterSpacing: "-0.005em" }}>
              {insightHeadline}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: ET_SEC, lineHeight: 1.65, marginBottom: insightSuggestionLabel ? S[2] : 0 }}>
              {insightSummary}
            </div>
            {insightSuggestionLabel && (
              <div style={{ borderTop: `1px solid ${execBr(insightSentiment)}`, paddingTop: S[2], marginTop: S[1] }}>
                <span style={{ fontFamily: T.mono, fontSize: 8, color: ET_MUT, letterSpacing: "0.07em", textTransform: "uppercase" as const }}>Sugerencia · </span>
                {insightSuggestionHref ? (
                  <a href={insightSuggestionHref} style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: ET_ACC, textDecoration: "none" }}>
                    {insightSuggestionLabel} →
                  </a>
                ) : (
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: ET_SEC }}>{insightSuggestionLabel}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── CARD 2 — ALERTAS ───────────────────────────────────────────── */}
        {(() => {
          const alertSentiment = alertCount === 0 ? "positive" : alertItems.some(a => a.level === "CRITICAL") ? "critical" : "warning";
          return (
            <div style={{
              background: execBg(alertSentiment), border: `1px solid ${execBr(alertSentiment)}`,
              borderRadius: R.xl, overflow: "hidden", boxShadow: execShadow,
            }}>
              {/* Card header */}
              <div style={{ display: "flex", alignItems: "center", gap: S[2], padding: `${S[3]}px ${S[3]}px ${S[1] + 2}px` }}>
                <div style={{
                  width: 30, height: 30, borderRadius: R.md, flexShrink: 0,
                  background: alertCount > 0 ? "rgba(220,38,38,.09)" : "rgba(5,150,105,.08)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={alertCount > 0 ? "#DC2626" : "#059669"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.semibold, color: ET_MUT, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>Alertas</div>
                </div>
                {alertCount > 0 ? (
                  <div style={{ fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.bold, color: ALERT_SEV[alertItems[0]?.level ?? "CRITICAL"] ?? "#DC2626", background: ALERT_BG[alertItems[0]?.level ?? "CRITICAL"] ?? "rgba(254,226,226,.80)", borderRadius: R.pill, padding: "1px 8px", flexShrink: 0 }}>
                    {alertCount} activa{alertCount > 1 ? "s" : ""}
                  </div>
                ) : (
                  <div style={{ fontFamily: T.mono, fontSize: 8, color: "#065F46", background: "rgba(5,150,105,.08)", border: "1px solid rgba(5,150,105,.14)", borderRadius: R.pill, padding: "1px 7px", flexShrink: 0 }}>
                    nominal
                  </div>
                )}
              </div>

              {/* Alert list */}
              {alertItems.length === 0 ? (
                <div style={{ padding: `${S[1]}px ${S[3]}px ${S[3]}px`, fontFamily: T.mono, fontSize: T.sz.xs, color: ET_MUT, lineHeight: 1.5 }}>
                  Sin alertas activas · Sistema operando con normalidad
                </div>
              ) : (
                <div style={{ padding: `${S[1]}px ${S[2]}px ${S[2]}px`, display: "flex", flexDirection: "column", gap: 2 }}>
                  {alertItems.map(a => (
                    <a key={a.id} href={`/${orgSlug}/alerts`} style={{
                      display: "flex", alignItems: "center", gap: S[2],
                      padding: `${S[1] + 2}px ${S[2]}px`,
                      borderRadius: R.md,
                      background: "rgba(255,255,255,.55)",
                      border: `1px solid ${a.level === "CRITICAL" ? "rgba(220,38,38,.14)" : a.level === "WARNING" ? "rgba(180,120,0,.12)" : "rgba(37,99,235,.10)"}`,
                      textDecoration: "none",
                      transition: "background 150ms",
                    }}>
                      {/* Severity dot */}
                      <span style={{ width: 6, height: 6, borderRadius: R.pill, background: ALERT_SEV[a.level] ?? ET_MUT, flexShrink: 0, display: "inline-block" }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: T.sans, fontSize: T.sz.xs, fontWeight: T.wt.medium, color: ET_PRI, lineHeight: 1.3 }}>{a.title}</div>
                        <div style={{ fontFamily: T.mono, fontSize: 9, color: ET_MUT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, marginTop: 1 }}>{a.meta}</div>
                      </div>
                      <span style={{ fontFamily: T.mono, fontSize: 9, color: ALERT_SEV[a.level] ?? ET_MUT, flexShrink: 0 }}>
                        {a.level === "CRITICAL" ? "Crítico" : a.level === "WARNING" ? "Alto" : "Info"} ›
                      </span>
                    </a>
                  ))}
                  <a href={`/${orgSlug}/alerts`} style={{ display: "block", textAlign: "center" as const, fontFamily: T.mono, fontSize: 9, color: ET_ACC, padding: `${S[2]}px`, textDecoration: "none", marginTop: 2, opacity: 0.75 }}>
                    Ver todas las alertas →
                  </a>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── CARD 3 — TAREAS ────────────────────────────────────────────── */}
        {(() => {
          const hasCriticalTask = taskItems.some(t => t.urgency === "critical");
          const taskSentiment = hasCriticalTask ? "warning" : "neutral";
          return (
            <div style={{
              background: execBg(taskSentiment), border: `1px solid ${execBr(taskSentiment)}`,
              borderRadius: R.xl, overflow: "hidden", boxShadow: execShadow,
            }}>
              {/* Card header */}
              <div style={{ display: "flex", alignItems: "center", gap: S[2], padding: `${S[3]}px ${S[3]}px ${S[1] + 2}px` }}>
                <div style={{
                  width: 30, height: 30, borderRadius: R.md, flexShrink: 0,
                  background: "rgba(0,74,173,.07)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ET_ACC} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.semibold, color: ET_MUT, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>Tareas</div>
                </div>
                {taskCount > 0 ? (
                  <div style={{ fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.semibold, color: ET_ACC, background: "rgba(0,74,173,.08)", border: "1px solid rgba(0,74,173,.12)", borderRadius: R.pill, padding: "1px 8px", flexShrink: 0 }}>
                    {taskCount}
                  </div>
                ) : (
                  <div style={{ fontFamily: T.mono, fontSize: 8, color: ET_MUT, background: "rgba(107,114,128,.07)", border: "1px solid rgba(107,114,128,.12)", borderRadius: R.pill, padding: "1px 7px", flexShrink: 0 }}>
                    sin pendientes
                  </div>
                )}
              </div>

              {/* Task list */}
              {taskItems.length === 0 ? (
                <div style={{ padding: `${S[1]}px ${S[3]}px ${S[3]}px`, fontFamily: T.mono, fontSize: T.sz.xs, color: ET_MUT, lineHeight: 1.5 }}>
                  Sin tareas pendientes · Todo en orden
                </div>
              ) : (
                <div style={{ padding: `${S[1]}px ${S[2]}px ${S[2]}px`, display: "flex", flexDirection: "column", gap: 2 }}>
                  {taskItems.map(t => (
                    <a key={t.id} href={t.href} style={{
                      display: "flex", alignItems: "center", gap: S[2],
                      padding: `${S[1] + 2}px ${S[2]}px`,
                      borderRadius: R.md,
                      background: "rgba(255,255,255,.55)",
                      border: "1px solid rgba(0,74,173,.07)",
                      textDecoration: "none",
                      transition: "background 150ms",
                    }}>
                      {/* Checkbox */}
                      <div style={{
                        width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                        border: `1.5px solid ${t.urgency === "critical" ? "#B45309" : t.urgency === "elevated" ? "rgba(180,120,0,.40)" : "rgba(0,74,173,.25)"}`,
                        background: "transparent",
                      }} />
                      <div style={{ flex: 1, fontFamily: T.sans, fontSize: T.sz.xs, color: ET_PRI, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, lineHeight: 1.3 }}>
                        {t.label}
                      </div>
                      <div style={{ fontFamily: T.mono, fontSize: 9, color: TASK_DUE[t.urgency] ?? ET_MUT, flexShrink: 0, fontWeight: t.urgency !== "normal" ? T.wt.semibold : T.wt.normal }}>
                        {t.dueLabel}
                      </div>
                    </a>
                  ))}
                  <a href={`/${orgSlug}/agentik`} style={{ display: "block", textAlign: "center" as const, fontFamily: T.mono, fontSize: 9, color: ET_ACC, padding: `${S[2]}px`, textDecoration: "none", marginTop: 2, opacity: 0.75 }}>
                    Ver todas las tareas →
                  </a>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── CARD 4 — DAVID COMERCIAL ─────────────────────────────────── */}
        {davidData && davidData.dataState !== "EMPTY" && davidData.criticalRefs.length > 0 && (() => {
          const sevColor = davidData.topSignalSeverity === "critical" ? "#DC2626"
            : davidData.topSignalSeverity === "high" ? "#B45309"
            : "#004AAD";
          const sevBg = davidData.topSignalSeverity === "critical" ? "rgba(254,226,226,.60)"
            : davidData.topSignalSeverity === "high" ? "rgba(254,243,199,.60)"
            : "rgba(219,234,254,.60)";
          const sevBorder = davidData.topSignalSeverity === "critical" ? "rgba(220,38,38,.22)"
            : davidData.topSignalSeverity === "high" ? "rgba(180,120,0,.18)"
            : "rgba(0,74,173,.14)";
          return (
            <div style={{ background: sevBg, border: `1px solid ${sevBorder}`, borderRadius: R.xl, overflow: "hidden", boxShadow: execShadow }}>
              <div style={{ padding: `${S[2] + 2}px ${S[3]}px ${S[1]}px` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: S[1] + 2 }}>
                  <span style={{ fontFamily: T.mono, fontSize: 9, color: sevColor, textTransform: "uppercase" as const, letterSpacing: "0.07em", fontWeight: T.wt.semibold }}>
                    David · Comercial
                  </span>
                  {davidData.signalCount > 0 && (
                    <span style={{ fontFamily: T.mono, fontSize: 9, color: sevColor, background: "rgba(255,255,255,.50)", border: `1px solid ${sevBorder}`, borderRadius: R.xs, padding: "1px 6px" }}>
                      {davidData.signalCount} señal{davidData.signalCount > 1 ? "es" : ""}
                    </span>
                  )}
                </div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: ET_PRI, fontWeight: T.wt.semibold, lineHeight: 1.3, marginBottom: S[2] }}>
                  {davidData.executiveHeadline}
                </div>
                {davidData.criticalRefs.slice(0, 3).map(ref => (
                  <div key={ref.reference} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: `${S[1]}px 0`, borderTop: `1px solid ${sevBorder}` }}>
                    <div>
                      <span style={{ fontFamily: T.mono, fontSize: 10, color: ET_PRI, fontWeight: T.wt.semibold }}>{ref.reference}</span>
                      <span style={{ fontFamily: T.mono, fontSize: 9, color: ET_MUT, marginLeft: 4 }}>{ref.opState.replace("_", " ")}</span>
                    </div>
                    <span style={{ fontFamily: T.mono, fontSize: 9, color: ET_MUT, flexShrink: 0 }}>
                      {ref.disponible}/{ref.minRequired}
                    </span>
                  </div>
                ))}
                {davidData.topSuggestion && (
                  <div style={{ marginTop: S[2] }}>
                    {davidProposalState === "sent" ? (
                      <div style={{ fontFamily: T.mono, fontSize: 9, color: "#059669", background: "rgba(6,95,70,.08)", border: "1px solid rgba(6,95,70,.20)", borderRadius: R.sm, padding: `${S[1] + 1}px ${S[2]}px`, textAlign: "center" as const }}>
                        Propuesta enviada a aprobación
                      </div>
                    ) : (
                      <button
                        disabled={davidProposalState === "sending"}
                        style={{ width: "100%", fontFamily: T.mono, fontSize: 10, color: "#fff", background: davidProposalState === "sending" ? "rgba(0,74,173,.55)" : sevColor, border: "none", borderRadius: R.sm, padding: `${S[1] + 1}px ${S[2]}px`, cursor: davidProposalState === "sending" ? "not-allowed" : "pointer", fontWeight: T.wt.semibold, textAlign: "left" as const, opacity: davidProposalState === "sending" ? 0.7 : 1 }}
                        onClick={async () => {
                          const s = davidData.topSuggestion!;
                          setDavidProposalState("sending");
                          try {
                            const res = await fetch(`/api/orgs/${orgSlug}/agent/commercial/actions`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                reference:   s.reference,
                                description: s.description,
                                qty:         s.qty,
                                reason:      "Propuesta enviada desde rail David",
                                line:        s.line,
                              }),
                            });
                            setDavidProposalState(res.ok ? "sent" : "error");
                          } catch {
                            setDavidProposalState("error");
                          }
                        }}
                      >
                        {davidProposalState === "sending"
                          ? "Enviando propuesta…"
                          : `Enviar a aprobación · ${davidData.topSuggestion.reference} (${davidData.topSuggestion.qty} uds)`}
                      </button>
                    )}
                    {davidProposalState === "error" && (
                      <div style={{ fontFamily: T.mono, fontSize: 9, color: "#DC2626", marginTop: 4, textAlign: "center" as const }}>
                        Error al enviar propuesta
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        </div>{/* end padding wrapper */}

        {/* ── INFRASTRUCTURE SECTIONS — internal_ops / super_admin only ──────── */}
        {isInternal && (<>

        {/* ── RUNTIME ──────────────────────────────────────────────────────────── */}
        {runtimeStateData && (
          <div style={{ order: ord("runtime", 9), marginBottom: S[3] }}>
            <Divider />
            <SectionLabel
              label="Runtime"
              urgent={runtimeStateData.health === "degraded" || runtimeStateData.health === "blocked"}
              collapsible onToggle={() => toggleSection("runtime")}
              collapsed={!!sectionCollapsed.runtime}
            />
            {!sectionCollapsed.runtime && (
              <div style={{
                background:   C.white,
                border:       `1px solid ${
                  runtimeStateData.health === "degraded" || runtimeStateData.health === "blocked"
                    ? C.amberBorder : C.line
                }`,
                borderRadius: R.md,
                padding:      `${S[2]}px`,
              }}>
                {/* Health row */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: S[1] }}>
                  <div style={{ display: "flex", alignItems: "center", gap: S[1] }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: R.pill, display: "inline-block", flexShrink: 0,
                      background:
                        runtimeStateData.health === "healthy"    ? C.green    :
                        runtimeStateData.health === "syncing"    ? C.blue     :
                        runtimeStateData.health === "recovering" ? C.blue     :
                        runtimeStateData.health === "blocked"    ? C.red      :
                        C.amber,
                    }} />
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.ink, fontWeight: T.wt.semibold }}>
                      {runtimeStateData.health === "healthy"    ? "Nominal"     :
                       runtimeStateData.health === "syncing"    ? "Sincronizando":
                       runtimeStateData.health === "degraded"   ? "Degradado"   :
                       runtimeStateData.health === "stale"      ? "Desactualizado":
                       runtimeStateData.health === "blocked"    ? "Bloqueado"   :
                       runtimeStateData.health === "recovering" ? "Recuperando" :
                       runtimeStateData.health}
                    </span>
                  </div>
                  <span style={{
                    fontFamily: T.mono, fontSize: "9px", color: C.inkFaint,
                    background: C.surface, border: `1px solid ${C.line}`,
                    borderRadius: R.xs, padding: "1px 5px",
                  }}>
                    {runtimeStateData.operationalMode}
                  </span>
                </div>

                {/* Connector readiness bar */}
                <div style={{ display: "flex", alignItems: "center", gap: S[1] + 2, marginBottom: S[1] }}>
                  <div style={{ flex: 1, height: 3, background: C.line, borderRadius: R.pill, overflow: "hidden" }}>
                    <div style={{
                      width: `${runtimeStateData.connectorReadiness}%`,
                      height: "100%",
                      background: runtimeStateData.connectorReadiness >= 80 ? C.green
                                : runtimeStateData.connectorReadiness >= 50 ? C.amber
                                : C.red,
                      borderRadius: R.pill,
                      transition: "width 400ms ease",
                    }} />
                  </div>
                  <span style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint, flexShrink: 0 }}>
                    {runtimeStateData.connectorReadiness}% conectores
                  </span>
                </div>

                {/* Queue + workload summary */}
                <div style={{ display: "flex", gap: S[1], flexWrap: "wrap" as const }}>
                  {runtimeStateData.activeCount > 0 && (
                    <span style={{
                      fontFamily: T.mono, fontSize: "9px", color: C.blueDark,
                      background: "#EEF5FF", border: "1px solid rgba(0,74,173,.15)",
                      borderRadius: R.xs, padding: "1px 5px",
                    }}>
                      {runtimeStateData.activeCount} activa{runtimeStateData.activeCount > 1 ? "s" : ""}
                    </span>
                  )}
                  {runtimeStateData.queuedCount > 0 && (
                    <span style={{
                      fontFamily: T.mono, fontSize: "9px", color: C.amberDark,
                      background: C.amberLight, border: `1px solid ${C.amberBorder}`,
                      borderRadius: R.xs, padding: "1px 5px",
                    }}>
                      {runtimeStateData.queuedCount} en cola
                    </span>
                  )}
                  {runtimeStateData.blockedCount > 0 && (
                    <span style={{
                      fontFamily: T.mono, fontSize: "9px", color: C.redDark,
                      background: C.redLight, border: `1px solid ${C.redBorder}`,
                      borderRadius: R.xs, padding: "1px 5px",
                    }}>
                      {runtimeStateData.blockedCount} bloqueada{runtimeStateData.blockedCount > 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                {/* Runtime summary */}
                <div style={{
                  fontFamily: T.mono, fontSize: "9px", color: C.inkFaint,
                  borderTop: `1px solid rgba(0,74,173,.06)`, paddingTop: 4, marginTop: S[1],
                }}>
                  {runtimeStateData.runtimeSummary}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── GATEWAY ──────────────────────────────────────────────────────────── */}
        {gatewayData && (
          <div style={{ order: ord("gateway", 10), marginBottom: S[3] }}>
            <Divider />
            <SectionLabel
              label="Gateway"
              urgent={!gatewayData.dispatchAvailable && gatewayData.blockedCount > 0}
              collapsible onToggle={() => toggleSection("gateway")}
              collapsed={!!sectionCollapsed.gateway}
            />
            {!sectionCollapsed.gateway && (
              <div style={{
                background:   C.white,
                border:       `1px solid ${gatewayData.dispatchAvailable ? C.line : C.amberBorder}`,
                borderRadius: R.md,
                padding:      `${S[2]}px`,
              }}>
                {/* Readiness bar */}
                <div style={{ display: "flex", alignItems: "center", gap: S[1] + 2, marginBottom: S[1] }}>
                  <div style={{ flex: 1, height: 3, background: C.line, borderRadius: R.pill, overflow: "hidden" }}>
                    <div style={{
                      width: `${gatewayData.readinessPercent}%`,
                      height: "100%",
                      background: gatewayData.readinessPercent >= 80 ? C.green
                                : gatewayData.readinessPercent >= 40 ? C.amber
                                : C.red,
                      borderRadius: R.pill,
                      transition: "width 400ms ease",
                    }} />
                  </div>
                  <span style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint, flexShrink: 0 }}>
                    {gatewayData.readinessPercent}% listo
                  </span>
                </div>

                {/* Integration counts */}
                <div style={{ display: "flex", gap: S[1], flexWrap: "wrap" as const, marginBottom: S[1] }}>
                  {gatewayData.readyCount > 0 && (
                    <span style={{
                      fontFamily: T.mono, fontSize: "9px", color: C.green,
                      background: C.greenLight, border: `1px solid ${C.greenBorder}`,
                      borderRadius: R.xs, padding: "1px 5px",
                    }}>
                      {gatewayData.readyCount} operativa{gatewayData.readyCount > 1 ? "s" : ""}
                    </span>
                  )}
                  {gatewayData.degradedCount > 0 && (
                    <span style={{
                      fontFamily: T.mono, fontSize: "9px", color: C.amberDark,
                      background: C.amberLight, border: `1px solid ${C.amberBorder}`,
                      borderRadius: R.xs, padding: "1px 5px",
                    }}>
                      {gatewayData.degradedCount} degradada{gatewayData.degradedCount > 1 ? "s" : ""}
                    </span>
                  )}
                  {gatewayData.blockedCount > 0 && (
                    <span style={{
                      fontFamily: T.mono, fontSize: "9px", color: C.redDark,
                      background: C.redLight, border: `1px solid ${C.redBorder}`,
                      borderRadius: R.xs, padding: "1px 5px",
                    }}>
                      {gatewayData.blockedCount} no configurada{gatewayData.blockedCount > 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                {/* Dispatch status */}
                <div style={{ display: "flex", alignItems: "center", gap: S[1] }}>
                  <span style={{
                    width: 5, height: 5, borderRadius: R.pill, display: "inline-block", flexShrink: 0,
                    background: gatewayData.dispatchAvailable ? C.green : C.amber,
                  }} />
                  <span style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint }}>
                    {gatewayData.dispatchAvailable
                      ? "Despacho disponible — sujeto a aprobación"
                      : "Despacho no disponible — integraciones sin configurar"}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── OBSERVABILIDAD ───────────────────────────────────────────────────── */}
        {observabilityData && (
          <div style={{ order: ord("observability", 11), marginBottom: S[3] }}>
            <Divider />
            <SectionLabel
              label="Observabilidad"
              urgent={observabilityData.criticalIncidentCount > 0}
              collapsible onToggle={() => toggleSection("observability")}
              collapsed={!!sectionCollapsed.observability}
            />
            {!sectionCollapsed.observability && (
              <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>

                {/* Health card */}
                <div style={{
                  background:   C.white,
                  border:       `1px solid ${
                    observabilityData.health === "red"    ? C.redBorder   :
                    observabilityData.health === "yellow" ? C.amberBorder :
                    observabilityData.health === "green"  ? C.greenBorder :
                    C.line
                  }`,
                  borderRadius: R.md,
                  padding:      `${S[2]}px`,
                }}>
                  {/* Health row */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: S[1] }}>
                    <div style={{ display: "flex", alignItems: "center", gap: S[1] }}>
                      <span style={{
                        width: 7, height: 7, borderRadius: R.pill, display: "inline-block", flexShrink: 0,
                        background: observabilityData.healthColor,
                        boxShadow: `0 0 4px ${observabilityData.healthColor}55`,
                      }} />
                      <span style={{
                        fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                        color: observabilityData.healthColor,
                        textTransform: "uppercase" as const, letterSpacing: "0.07em",
                      }}>
                        {observabilityData.healthLabel}
                      </span>
                    </div>
                    <span style={{
                      fontFamily: T.mono, fontSize: "9px", color: C.inkGhost,
                      background: C.surface, border: `1px solid ${C.line}`,
                      borderRadius: R.xs, padding: "1px 5px",
                    }}>
                      #{observabilityData.traceId}
                    </span>
                  </div>

                  {/* Overall summary */}
                  <div style={{ fontFamily: T.sans, fontSize: T.sz["2xs"], color: C.inkMid, lineHeight: 1.4, marginBottom: S[1] }}>
                    {observabilityData.overallSummary}
                  </div>

                  {/* Trace + audit counts */}
                  <div style={{ display: "flex", gap: S[1], flexWrap: "wrap" as const }}>
                    <span style={{
                      fontFamily: T.mono, fontSize: "9px",
                      color: observabilityData.traceWarnCount > 0 ? C.amberDark : C.green,
                      background: observabilityData.traceWarnCount > 0 ? C.amberLight : C.greenLight,
                      border: `1px solid ${observabilityData.traceWarnCount > 0 ? C.amberBorder : C.greenBorder}`,
                      borderRadius: R.xs, padding: "1px 5px",
                    }}>
                      {observabilityData.traceOkCount} OK · {observabilityData.traceWarnCount} warn
                    </span>
                    {observabilityData.auditEventCount > 0 && (
                      <span style={{
                        fontFamily: T.mono, fontSize: "9px", color: C.inkFaint,
                        background: C.surface, border: `1px solid ${C.line}`,
                        borderRadius: R.xs, padding: "1px 5px",
                      }}>
                        {observabilityData.auditEventCount} evento{observabilityData.auditEventCount > 1 ? "s" : ""} auditados
                      </span>
                    )}
                    {observabilityData.activeIncidentCount > 0 && (
                      <span style={{
                        fontFamily: T.mono, fontSize: "9px", fontWeight: T.wt.bold,
                        color: observabilityData.criticalIncidentCount > 0 ? C.redDark : C.amberDark,
                        background: observabilityData.criticalIncidentCount > 0 ? C.redLight : C.amberLight,
                        border: `1px solid ${observabilityData.criticalIncidentCount > 0 ? C.redBorder : C.amberBorder}`,
                        borderRadius: R.xs, padding: "1px 5px",
                        textTransform: "uppercase" as const, letterSpacing: "0.05em",
                      }}>
                        {observabilityData.activeIncidentCount} incidente{observabilityData.activeIncidentCount > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>

                {/* Incident summary (if any active) */}
                {observabilityData.activeIncidentCount > 0 && (
                  <div style={{
                    fontFamily: T.mono, fontSize: "9px", color: C.inkFaint,
                    borderLeft: `2px solid ${observabilityData.criticalIncidentCount > 0 ? C.red : C.amber}`,
                    paddingLeft: S[1] + 2,
                  }}>
                    {observabilityData.incidentSummary}
                  </div>
                )}

                {/* Recent audit events */}
                {observabilityData.recentAuditEvents.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {observabilityData.recentAuditEvents.slice(0, 2).map((ev, i) => (
                      <div key={i} style={{
                        display: "flex", alignItems: "flex-start", gap: S[1],
                        padding: "3px 0",
                        borderBottom: i < 1 ? `1px solid rgba(0,74,173,.05)` : "none",
                      }}>
                        <span style={{
                          width: 4, height: 4, borderRadius: R.pill, flexShrink: 0,
                          display: "inline-block", marginTop: 3,
                          background:
                            ev.severity === "critical" ? C.red   :
                            ev.severity === "warning"  ? C.amber :
                            C.blue,
                        }} />
                        <span style={{
                          fontFamily: T.sans, fontSize: "9px", color: C.inkFaint,
                          flex: 1, lineHeight: 1.4,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
                        }}>
                          {ev.title}
                        </span>
                        <span style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkGhost, flexShrink: 0 }}>
                          {ev.relativeTime}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── VAULT ──────────────────────────────────────────────────────────── */}
        {vaultData && (
          <div style={{ order: ord("vault", 32), marginBottom: S[3] }}>
            <Divider />
            <SectionLabel
              label="Vault"
              urgent={vaultData.health === "critical"}
              collapsible onToggle={() => toggleSection("vault")}
              collapsed={!!sectionCollapsed.vault}
            />
            {!sectionCollapsed.vault && (
              <div style={{
                background: C.white,
                border: `1px solid ${vaultData.health === "critical" ? C.redBorder : vaultData.health === "warning" ? C.amberBorder : C.line}`,
                borderRadius: R.md, padding: `${S[2]}px`,
                display: "flex", flexDirection: "column", gap: S[2],
              }}>
                {/* Health row */}
                <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: R.pill, flexShrink: 0,
                    background:
                      vaultData.health === "critical" ? C.red   :
                      vaultData.health === "warning"  ? C.amber :
                      vaultData.health === "secure"   ? C.green :
                      C.inkGhost,
                    boxShadow:
                      vaultData.health === "critical" ? `0 0 4px ${C.red}88`   :
                      vaultData.health === "warning"  ? `0 0 4px ${C.amber}88` :
                      vaultData.health === "secure"   ? `0 0 4px ${C.green}88` :
                      "none",
                  }} />
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.ink, fontWeight: T.wt.semibold, flex: 1 }}>
                    {vaultData.health === "critical" ? "Crítico" :
                     vaultData.health === "warning"  ? "Advertencia" :
                     vaultData.health === "secure"   ? "Seguro" : "Vacío"}
                  </span>
                  <span style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint }}>
                    {vaultData.totalSecrets} secreto{vaultData.totalSecrets !== 1 ? "s" : ""}
                  </span>
                </div>
                {/* Summary */}
                <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint, lineHeight: 1.4 }}>
                  {vaultData.summary}
                </div>
                {/* Status chips */}
                <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 4 }}>
                  {vaultData.activeCount > 0 && (
                    <span style={{
                      fontFamily: T.mono, fontSize: "9px", padding: "2px 6px",
                      borderRadius: R.xs, color: C.greenDark, background: C.greenLight,
                      border: `1px solid ${C.greenBorder}`,
                    }}>
                      {vaultData.activeCount} activo{vaultData.activeCount > 1 ? "s" : ""}
                    </span>
                  )}
                  {vaultData.expiringCount > 0 && (
                    <span style={{
                      fontFamily: T.mono, fontSize: "9px", padding: "2px 6px",
                      borderRadius: R.xs, color: C.amberDark, background: C.amberLight,
                      border: `1px solid ${C.amberBorder}`,
                    }}>
                      {vaultData.expiringCount} expirando
                    </span>
                  )}
                  {(vaultData.expiredCount + vaultData.invalidCount + vaultData.revokedCount) > 0 && (
                    <span style={{
                      fontFamily: T.mono, fontSize: "9px", padding: "2px 6px",
                      borderRadius: R.xs, color: C.redDark, background: C.redLight,
                      border: `1px solid ${C.redBorder}`,
                    }}>
                      {vaultData.expiredCount + vaultData.invalidCount + vaultData.revokedCount} bloqueado{(vaultData.expiredCount + vaultData.invalidCount + vaultData.revokedCount) > 1 ? "s" : ""}
                    </span>
                  )}
                  <span style={{
                    fontFamily: T.mono, fontSize: "9px", padding: "2px 6px",
                    borderRadius: R.xs,
                    color:      vaultData.dispatchAllowed ? C.greenDark : C.redDark,
                    background: vaultData.dispatchAllowed ? C.greenLight : C.redLight,
                    border: `1px solid ${vaultData.dispatchAllowed ? C.greenBorder : C.redBorder}`,
                  }}>
                    {vaultData.dispatchAllowed ? "dispatch OK" : "dispatch bloqueado"}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── DISPATCH ───────────────────────────────────────────────────────── */}
        {dispatchData && (
          <div style={{ order: ord("dispatch", 33), marginBottom: S[3] }}>
            <Divider />
            <SectionLabel
              label="Dispatch"
              urgent={!dispatchData.canDispatch}
              collapsible onToggle={() => toggleSection("dispatch")}
              collapsed={!!sectionCollapsed.dispatch}
            />
            {!sectionCollapsed.dispatch && (
              <div style={{
                background: C.white,
                border: `1px solid ${!dispatchData.canDispatch ? C.amberBorder : C.line}`,
                borderRadius: R.md, padding: `${S[2]}px`,
                display: "flex", flexDirection: "column", gap: S[2],
              }}>
                {/* Readiness bar */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint }}>
                      Conectores listos
                    </span>
                    <span style={{ fontFamily: T.mono, fontSize: "9px", color: C.ink }}>
                      {dispatchData.readyConnectorCount}/{dispatchData.readyConnectorCount + dispatchData.blockedConnectorCount}
                    </span>
                  </div>
                  <div style={{ height: 3, background: C.surface, borderRadius: R.pill, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: R.pill,
                      width: `${
                        dispatchData.readyConnectorCount + dispatchData.blockedConnectorCount > 0
                          ? Math.round(dispatchData.readyConnectorCount / (dispatchData.readyConnectorCount + dispatchData.blockedConnectorCount) * 100)
                          : 0
                      }%`,
                      background: dispatchData.canDispatch ? C.green : C.amber,
                      transition: "width 0.4s ease",
                    }} />
                  </div>
                </div>
                {/* Summary */}
                <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint, lineHeight: 1.4 }}>
                  {dispatchData.summaryLabel}
                </div>
                {/* Chips */}
                <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 4 }}>
                  <span style={{
                    fontFamily: T.mono, fontSize: "9px", padding: "2px 6px", borderRadius: R.xs,
                    color:      dispatchData.canDispatch ? C.greenDark : C.redDark,
                    background: dispatchData.canDispatch ? C.greenLight : C.redLight,
                    border: `1px solid ${dispatchData.canDispatch ? C.greenBorder : C.redBorder}`,
                  }}>
                    {dispatchData.canDispatch ? "disponible" : "bloqueado"}
                  </span>
                  {dispatchData.requiresApproval && (
                    <span style={{
                      fontFamily: T.mono, fontSize: "9px", padding: "2px 6px", borderRadius: R.xs,
                      color: C.amberDark, background: C.amberLight, border: `1px solid ${C.amberBorder}`,
                    }}>
                      requiere aprobación
                    </span>
                  )}
                  {dispatchData.blockedConnectorCount > 0 && (
                    <span style={{
                      fontFamily: T.mono, fontSize: "9px", padding: "2px 6px", borderRadius: R.xs,
                      color: C.redDark, background: C.redLight, border: `1px solid ${C.redBorder}`,
                    }}>
                      {dispatchData.blockedConnectorCount} bloqueado{dispatchData.blockedConnectorCount > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── INCIDENTES ─────────────────────────────────────────────────────── */}
        {incidentConsoleData && incidentConsoleData.totalCount > 0 && (
          <div style={{ order: ord("incidentes", 34), marginBottom: S[3] }}>
            <Divider />
            <SectionLabel
              label="Incidentes"
              urgent={incidentConsoleData.criticalCount > 0}
              collapsible onToggle={() => toggleSection("incidentes")}
              collapsed={!!sectionCollapsed.incidentes}
            />
            {!sectionCollapsed.incidentes && (
              <div style={{
                background: C.white,
                border: `1px solid ${incidentConsoleData.criticalCount > 0 ? C.redBorder : C.amberBorder}`,
                borderRadius: R.md, padding: `${S[2]}px`,
                display: "flex", flexDirection: "column", gap: S[2],
              }}>
                {/* Impact summary */}
                <div style={{
                  padding: `${S[2]}px`, borderRadius: R.sm,
                  borderLeft: `2px solid ${incidentConsoleData.criticalCount > 0 ? C.red : C.amber}`,
                  background: incidentConsoleData.criticalCount > 0 ? C.redLight : C.amberLight,
                }}>
                  <span style={{ fontFamily: T.mono, fontSize: "9px", color: incidentConsoleData.criticalCount > 0 ? C.redDark : C.amberDark }}>
                    {incidentConsoleData.summary}
                  </span>
                </div>
                {/* Incident list */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {incidentConsoleData.incidents.map(inc => (
                    <div key={inc.id} style={{
                      display: "flex", alignItems: "flex-start", gap: S[2],
                      padding: `${S[1]}px ${S[2]}px`,
                      background: C.surface, borderRadius: R.xs, border: `1px solid ${C.line}`,
                    }}>
                      <span style={{
                        width: 5, height: 5, borderRadius: R.pill, flexShrink: 0, marginTop: 3,
                        background:
                          inc.severity === "critical" ? C.red   :
                          inc.severity === "high"     ? C.amber : C.blue,
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontFamily: T.mono, fontSize: "9px", color: C.ink,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
                        }}>
                          {inc.title}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                          <span style={{ fontFamily: T.mono, fontSize: "8px", color: C.inkGhost }}>
                            {inc.category}
                          </span>
                          {inc.replayAvailable && (
                            <span style={{ fontFamily: T.mono, fontSize: "8px", color: C.blueDark }}>
                              replay
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Affected modules */}
                {incidentConsoleData.affectedModules.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 4 }}>
                    {incidentConsoleData.affectedModules.slice(0, 4).map(m => (
                      <span key={m} style={{
                        fontFamily: T.mono, fontSize: "8px", padding: "1px 5px",
                        borderRadius: R.xs, color: C.inkFaint,
                        background: C.surface, border: `1px solid ${C.line}`,
                      }}>
                        {m}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── REPLAY ─────────────────────────────────────────────────────────── */}
        {replayData && replayData.replayAvailable && (
          <div style={{ order: ord("replay", 35), marginBottom: S[3] }}>
            <Divider />
            <SectionLabel
              label="Replay"
              urgent={replayData.integrity === "corrupt" || !replayData.auditContinuity}
              collapsible onToggle={() => toggleSection("replay")}
              collapsed={!!sectionCollapsed.replay}
            />
            {!sectionCollapsed.replay && (
              <div style={{
                background: C.white,
                border: `1px solid ${replayData.integrity === "corrupt" ? C.redBorder : !replayData.auditContinuity ? C.amberBorder : C.line}`,
                borderRadius: R.md, padding: `${S[2]}px`,
                display: "flex", flexDirection: "column", gap: S[2],
              }}>
                {/* Integrity row */}
                <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: R.pill, flexShrink: 0,
                    background:
                      replayData.integrity === "intact"     ? C.green  :
                      replayData.integrity === "partial"    ? C.amber  :
                      replayData.integrity === "incomplete" ? C.amber  : C.red,
                  }} />
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.ink, fontWeight: T.wt.semibold, flex: 1 }}>
                    {replayData.integrity === "intact"     ? "Integridad completa" :
                     replayData.integrity === "partial"    ? "Integridad parcial"  :
                     replayData.integrity === "incomplete" ? "Incompleto"          :
                     "Comprometido"}
                  </span>
                  <span style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint }}>
                    {replayData.accountedSpans}/{replayData.spanCount}
                  </span>
                </div>
                {/* Summary */}
                <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint, lineHeight: 1.4 }}>
                  {replayData.summary}
                </div>
                {/* Chips */}
                <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 4 }}>
                  <span style={{
                    fontFamily: T.mono, fontSize: "9px", padding: "2px 6px",
                    borderRadius: R.xs, color: C.inkFaint,
                    background: C.surface, border: `1px solid ${C.line}`,
                  }}>
                    #{replayData.replayId.slice(-8)}
                  </span>
                  <span style={{
                    fontFamily: T.mono, fontSize: "9px", padding: "2px 6px", borderRadius: R.xs,
                    color:      replayData.auditContinuity ? C.greenDark : C.amberDark,
                    background: replayData.auditContinuity ? C.greenLight : C.amberLight,
                    border: `1px solid ${replayData.auditContinuity ? C.greenBorder : C.amberBorder}`,
                  }}>
                    {replayData.auditContinuity ? "auditoría continua" : "gap de auditoría"}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── INTEGRACIONES TENANT ─────────────────────────────────────────── */}
        {tenantIntegrationsData && (
          <div style={{ order: ord("integraciones", 36), marginBottom: S[3] }}>
            <Divider />
            <SectionLabel
              label="Integraciones"
              urgent={tenantIntegrationsData.blockedCount > 0}
              collapsible onToggle={() => toggleSection("integraciones")}
              collapsed={!!sectionCollapsed.integraciones}
            />
            {!sectionCollapsed.integraciones && (
              <div style={{
                background: C.white,
                border: `1px solid ${tenantIntegrationsData.blockedCount > 0 ? C.redBorder : tenantIntegrationsData.degradedCount > 0 ? C.amberBorder : C.line}`,
                borderRadius: R.md, padding: `${S[2]}px`,
                display: "flex", flexDirection: "column", gap: S[2],
              }}>
                {/* Health row */}
                <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: R.pill, flexShrink: 0,
                    background:
                      tenantIntegrationsData.overallHealth === "critical" ? C.red   :
                      tenantIntegrationsData.overallHealth === "warning"  ? C.amber :
                      tenantIntegrationsData.overallHealth === "healthy"  ? C.green :
                      C.inkGhost,
                  }} />
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.ink, fontWeight: T.wt.semibold, flex: 1 }}>
                    {tenantIntegrationsData.connectedCount} activa{tenantIntegrationsData.connectedCount !== 1 ? "s" : ""}
                    {tenantIntegrationsData.dispatchReadyCount > 0 && ` · ${tenantIntegrationsData.dispatchReadyCount} listas`}
                  </span>
                  <span style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint }}>
                    {tenantIntegrationsData.totalCount} total
                  </span>
                </div>
                {/* Summary */}
                <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint, lineHeight: 1.4 }}>
                  {tenantIntegrationsData.summary}
                </div>
                {/* Connector chips */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {tenantIntegrationsData.connectors.map(c => (
                    <div key={c.id} style={{
                      display: "flex", alignItems: "center", gap: S[2],
                      padding: `${S[1]}px ${S[2]}px`,
                      background: C.surface, borderRadius: R.xs, border: `1px solid ${C.line}`,
                    }}>
                      <span style={{
                        width: 5, height: 5, borderRadius: R.pill, flexShrink: 0,
                        background:
                          c.status === "connected" ? C.green  :
                          c.status === "degraded"  ? C.amber  :
                          c.status === "expiring"  ? C.amber  :
                          c.status === "blocked"   ? C.red    : C.inkGhost,
                      }} />
                      <span style={{
                        fontFamily: T.mono, fontSize: "9px", color: C.ink, flex: 1,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
                      }}>
                        {c.name}
                      </span>
                      <span style={{
                        fontFamily: T.mono, fontSize: "8px", padding: "1px 5px",
                        borderRadius: R.xs,
                        color:      c.dispatchReady ? C.greenDark : C.inkFaint,
                        background: c.dispatchReady ? C.greenLight : C.surface,
                        border: `1px solid ${c.dispatchReady ? C.greenBorder : C.line}`,
                      }}>
                        {c.dispatchReady ? "dispatch OK" : c.status}
                      </span>
                    </div>
                  ))}
                </div>
                {/* Status chips */}
                <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 4 }}>
                  {tenantIntegrationsData.expiringCount > 0 && (
                    <span style={{
                      fontFamily: T.mono, fontSize: "9px", padding: "2px 6px", borderRadius: R.xs,
                      color: C.amberDark, background: C.amberLight, border: `1px solid ${C.amberBorder}`,
                    }}>
                      {tenantIntegrationsData.expiringCount} expirando
                    </span>
                  )}
                  {tenantIntegrationsData.blockedCount > 0 && (
                    <span style={{
                      fontFamily: T.mono, fontSize: "9px", padding: "2px 6px", borderRadius: R.xs,
                      color: C.redDark, background: C.redLight, border: `1px solid ${C.redBorder}`,
                    }}>
                      {tenantIntegrationsData.blockedCount} bloqueada{tenantIntegrationsData.blockedCount > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── BRIDGE ───────────────────────────────────────────────────────────── */}
        {bridgeData && (
          <div style={{ order: ord("bridge", 37), marginBottom: S[3] }}>
            <Divider />
            <SectionLabel
              label="Bridge"
              urgent={bridgeData.bridgeStatus === "blocked"}
              collapsible onToggle={() => toggleSection("bridge")}
              collapsed={!!sectionCollapsed.bridge}
            />
            {!sectionCollapsed.bridge && (
              <div style={{
                background: C.white,
                border: `1px solid ${bridgeData.bridgeStatus === "blocked" ? C.redBorder : C.line}`,
                borderRadius: R.md, padding: `${S[2]}px`,
                display: "flex", flexDirection: "column", gap: S[2],
              }}>
                {/* Status row */}
                <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: R.pill, flexShrink: 0,
                    background:
                      bridgeData.bridgeStatus === "blocked"          ? C.red   :
                      bridgeData.bridgeStatus === "governance_ready" ? C.amber :
                      bridgeData.bridgeStatus === "dispatch_ready"   ? C.green :
                      C.blue,
                  }} />
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.ink, fontWeight: T.wt.semibold, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                    {bridgeData.workflowName}
                  </span>
                </div>
                {/* Summary */}
                <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint, lineHeight: 1.4 }}>
                  {bridgeData.bridgeStatus === "blocked" && bridgeData.blockReason
                    ? bridgeData.blockReason
                    : bridgeData.validationSummary}
                </div>
                {/* Gate chips */}
                <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 4 }}>
                  {[
                    { label: "runtime",    ok: bridgeData.runtimeValidated    },
                    { label: "vault",      ok: bridgeData.vaultValidated      },
                    { label: "gobernanza", ok: bridgeData.governanceValidated  },
                    { label: "replay",     ok: bridgeData.replayLinked         },
                    { label: "aprobado",   ok: bridgeData.dispatchApproved     },
                  ].map(gate => (
                    <span key={gate.label} style={{
                      fontFamily: T.mono, fontSize: "9px", padding: "2px 6px", borderRadius: R.xs,
                      color:      gate.ok ? C.greenDark : C.inkFaint,
                      background: gate.ok ? C.greenLight : C.surface,
                      border: `1px solid ${gate.ok ? C.greenBorder : C.line}`,
                    }}>
                      {gate.label}
                    </span>
                  ))}
                </div>
                {/* Correlation + callback */}
                <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 4 }}>
                  <span style={{
                    fontFamily: T.mono, fontSize: "9px", padding: "2px 6px", borderRadius: R.xs,
                    color: C.inkFaint, background: C.surface, border: `1px solid ${C.line}`,
                  }}>
                    #{bridgeData.correlationId.slice(-8)}
                  </span>
                  <span style={{
                    fontFamily: T.mono, fontSize: "9px", padding: "2px 6px", borderRadius: R.xs,
                    color:      bridgeData.callbackStatus === "delivered" ? C.greenDark : C.inkFaint,
                    background: bridgeData.callbackStatus === "delivered" ? C.greenLight : C.surface,
                    border: `1px solid ${bridgeData.callbackStatus === "delivered" ? C.greenBorder : C.line}`,
                  }}>
                    cb: {bridgeData.callbackStatus}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── CONTROL CENTER ───────────────────────────────────────────────────── */}
        {controlCenterData && (
          <div style={{ order: ord("control-center", 38), marginBottom: S[3] }}>
            <Divider />
            <SectionLabel
              label="Control Center"
              urgent={controlCenterData.health === "critical" || controlCenterData.systemPressure === "critical"}
              collapsible onToggle={() => toggleSection("control-center")}
              collapsed={!!sectionCollapsed["control-center"]}
            />
            {!sectionCollapsed["control-center"] && (
              <div style={{
                background: C.white,
                border: `1px solid ${
                  controlCenterData.health === "critical" ? C.redBorder :
                  controlCenterData.health === "degraded" ? C.amberBorder : C.line
                }`,
                borderRadius: R.md, padding: `${S[2]}px`,
                display: "flex", flexDirection: "column", gap: S[2],
              }}>
                {/* Health row */}
                <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: R.pill, flexShrink: 0,
                    background:
                      controlCenterData.health === "critical"    ? C.red   :
                      controlCenterData.health === "degraded"    ? C.amber :
                      controlCenterData.health === "operational" ? C.green : C.inkGhost,
                    boxShadow:
                      controlCenterData.health === "critical"    ? `0 0 5px ${C.red}88`   :
                      controlCenterData.health === "operational" ? `0 0 5px ${C.green}44` : "none",
                  }} />
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.ink, fontWeight: T.wt.semibold, flex: 1 }}>
                    {controlCenterData.health === "critical"    ? "Crítico" :
                     controlCenterData.health === "degraded"    ? "Degradado" :
                     controlCenterData.health === "operational" ? "Operativo" : "Mantenimiento"}
                  </span>
                  <span style={{
                    fontFamily: T.mono, fontSize: "9px", padding: "1px 5px",
                    borderRadius: R.xs, color: C.inkFaint, background: C.surface, border: `1px solid ${C.line}`,
                  }}>
                    {controlCenterData.connectorReadiness}% conectores
                  </span>
                </div>
                {/* Summary */}
                <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint, lineHeight: 1.4 }}>
                  {controlCenterData.summary}
                </div>
                {/* Metrics row */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                  {[
                    { label: "Runtime",    value: controlCenterData.runtimeHealth,     highlight: controlCenterData.runtimeHealth === "degraded" || controlCenterData.runtimeHealth === "blocked" },
                    { label: "Vault",      value: controlCenterData.vaultHealth,       highlight: controlCenterData.vaultHealth === "critical" || controlCenterData.vaultHealth === "warning" },
                    { label: "Tenants",    value: `${controlCenterData.activeTenants} activos${controlCenterData.degradedTenants > 0 ? ` · ${controlCenterData.degradedTenants} degradados` : ""}`, highlight: controlCenterData.degradedTenants > 0 },
                    { label: "Incidentes", value: controlCenterData.incidentCount === 0 ? "ninguno" : `${controlCenterData.criticalIncidentCount > 0 ? controlCenterData.criticalIncidentCount + " crít · " : ""}${controlCenterData.incidentCount} total`, highlight: controlCenterData.criticalIncidentCount > 0 },
                  ].map(m => (
                    <div key={m.label} style={{
                      background: C.surface, borderRadius: R.xs, border: `1px solid ${C.line}`,
                      padding: `${S[1]}px ${S[2]}px`,
                    }}>
                      <div style={{ fontFamily: T.mono, fontSize: "8px", color: C.inkGhost, marginBottom: 1 }}>{m.label}</div>
                      <div style={{ fontFamily: T.mono, fontSize: "9px", color: m.highlight ? C.amberDark : C.ink }}>
                        {m.value}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Pressure + dispatch chips */}
                <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 4 }}>
                  <span style={{
                    fontFamily: T.mono, fontSize: "9px", padding: "2px 6px", borderRadius: R.xs,
                    color:
                      controlCenterData.systemPressure === "critical" ? C.redDark   :
                      controlCenterData.systemPressure === "high"     ? C.amberDark :
                      controlCenterData.systemPressure === "elevated" ? C.amberDark :
                      C.greenDark,
                    background:
                      controlCenterData.systemPressure === "critical" ? C.redLight   :
                      controlCenterData.systemPressure === "high"     ? C.amberLight :
                      controlCenterData.systemPressure === "elevated" ? C.amberLight :
                      C.greenLight,
                    border: `1px solid ${
                      controlCenterData.systemPressure === "critical" ? C.redBorder   :
                      controlCenterData.systemPressure === "high"     ? C.amberBorder :
                      controlCenterData.systemPressure === "elevated" ? C.amberBorder :
                      C.greenBorder
                    }`,
                  }}>
                    {controlCenterData.systemPressure === "nominal" ? "nominal" : `presión ${controlCenterData.systemPressure}`}
                  </span>
                  {controlCenterData.pendingApprovals > 0 && (
                    <span style={{
                      fontFamily: T.mono, fontSize: "9px", padding: "2px 6px", borderRadius: R.xs,
                      color: C.amberDark, background: C.amberLight, border: `1px solid ${C.amberBorder}`,
                    }}>
                      {controlCenterData.pendingApprovals} aprobación{controlCenterData.pendingApprovals > 1 ? "es" : ""}
                    </span>
                  )}
                  <span style={{
                    fontFamily: T.mono, fontSize: "9px", padding: "2px 6px", borderRadius: R.xs,
                    color:      controlCenterData.dispatchReady ? C.greenDark : C.redDark,
                    background: controlCenterData.dispatchReady ? C.greenLight : C.redLight,
                    border: `1px solid ${controlCenterData.dispatchReady ? C.greenBorder : C.redBorder}`,
                  }}>
                    {controlCenterData.dispatchReady ? "dispatch OK" : "dispatch bloqueado"}
                  </span>
                </div>
                {/* Tenant health summary */}
                <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkGhost, lineHeight: 1.4, borderTop: `1px solid ${C.line}`, paddingTop: S[1] }}>
                  {controlCenterData.tenantHealthSummary}
                </div>
              </div>
            )}
          </div>
        )}

        </>)}
        {/* ── END INFRASTRUCTURE SECTIONS ──────────────────────────────────── */}

        {/* ── PROGRESSIVE DISCLOSURE — shown only for non-internal tenant users ─ */}
        {/* Hidden for internal users (SUPER_ADMIN/AGENTIK_ADMIN) regardless of surface */}
        {!isInternal && !isInternalUser && (
          <div style={{ padding: `0 ${S[3]}px`, marginBottom: S[1] }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: `${S[1]}px ${S[2]}px`,
              background: "rgba(0,74,173,.04)",
              border: "1px solid rgba(0,74,173,.10)",
              borderRadius: R.sm,
              cursor: "not-allowed", opacity: 0.55,
            }}>
              <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkGhost, letterSpacing: "0.05em" }}>
                Infraestructura — acceso interno
              </span>
              <span style={{ fontFamily: T.mono, fontSize: 8, color: C.blueDark, background: "rgba(0,74,173,.08)", border: "1px solid rgba(0,74,173,.14)", borderRadius: R.xs, padding: "1px 5px", opacity: 0.7 }}>
                ADMIN
              </span>
            </div>
          </div>
        )}

        {/* ── SPACER ─────────────────────────────────────────────────────────── */}
        <div style={{ flex: 1 }} />

        {/* ── COPILOT CONVERSACIONAL — próximamente ──────────────────────────── */}
        <div style={{ borderTop: "1px solid rgba(0,74,173,.08)", padding: `${S[3]}px` }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: `${S[2]}px ${S[2] + 2}px`,
            background: C.white,
            border: "1px solid rgba(0,74,173,.10)",
            borderRadius: R.md,
            boxShadow: "0 1px 3px rgba(0,18,60,.05)",
            opacity: 0.55, cursor: "not-allowed",
          }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
              Consultar a {agent.name}…
            </span>
            <span style={{ fontFamily: T.mono, fontSize: 8, color: C.blueDark, background: "rgba(0,74,173,.07)", border: "1px solid rgba(0,74,173,.14)", borderRadius: R.xs, padding: "1px 6px", letterSpacing: "0.05em", opacity: 0.8 }}>
              pronto
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}
