/**
 * app/(app)/[orgSlug]/agentik/control-center/page.tsx
 *
 * Agentik Internal Control Center
 *
 * Sprint: AGENTIK-COPILOT-SURFACE-SEGREGATION-01 — Block C
 *
 * INTERNAL ONLY — restricted to AGENTIK_ADMIN and SUPER_ADMIN.
 * Tenant users are redirected to /dashboard.
 *
 * Shows: Runtime, Vault, Dispatch, Replay, Gateway, Observabilidad,
 *        Bridge, Incidentes, Tenant Health, Global Orchestration.
 */

import { redirect }         from "next/navigation";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { isInternalRole }   from "@/lib/auth/module-access";
import { C, T, S, R }       from "@/lib/ui/tokens";

import { buildTenantVaultSnapshot, vaultAllowsDispatch } from "@/lib/security/vault/vault-core";
import { validateDispatchReadiness }   from "@/lib/integrations/supervised-dispatch";
import { buildReplaySession, summarizeReplaySession } from "@/lib/observability/operation-replay";
import { buildIncidentConsole, summarizeIncidentImpact } from "@/lib/observability/incident-console";
import { buildTenantConnectorState, summarizeTenantConnectorHealth } from "@/lib/integrations/tenant-connector-manager";
import type { RealConnectorId }        from "@/lib/integrations/real-connectors";
import { buildN8nExecutionBridge, validateN8nBridge, summarizeN8nBridge } from "@/lib/integrations/n8n-execution-bridge";
import { buildControlCenterState }     from "@/lib/control-center/control-center-state";
import { buildGlobalOrchestration }    from "@/lib/control-center/global-orchestration";
import { buildExecutionMonitor }       from "@/lib/control-center/execution-monitor";
import { buildTenantHealthMap }        from "@/lib/control-center/tenant-health";
import { buildRuntimeState }           from "@/lib/runtime/runtime-state";
import { buildGatewayReadiness }       from "@/lib/integrations/integration-gateway";
import { buildExecutionTrace }         from "@/lib/observability/execution-trace";
import { detectIncidents, summarizeIncidents } from "@/lib/observability/incident-detection";
import { buildOrchestrationLog }       from "@/lib/observability/orchestration-log";
import { buildAuditTrail }             from "@/lib/observability/audit-events";
import { buildExecutionQueue }         from "@/lib/runtime/execution-queue";
import { buildAllAgentWorkloads }      from "@/lib/runtime/agent-workload";
import { buildOrchestrationState }     from "@/lib/runtime/orchestration-state";
import { evaluateAllSignals }          from "@/lib/copilot/signal-engine";
import type { SignalEngineResult }     from "@/lib/copilot/types";

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AgentikControlCenterPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }                        = await params;
  const { user, organization, membership } = await requireOrgAccess(orgSlug);
  const orgId                              = organization.id;

  // Gate: internal roles only
  if (!isInternalRole(membership.role)) {
    redirect(`/${orgSlug}/dashboard`);
  }

  // ── Pipeline ─────────────────────────────────────────────────────────────

  const copilot = await evaluateAllSignals(orgId, orgSlug, { bypassCooldown: true }).catch(
    (): SignalEngineResult => ({
      signals:     [],
      runtime: { state: "DEGRADED", lastEvaluatedAt: new Date(), activeSignals: 0, staleRules: [], degradedRules: [] },
      evaluatedAt: new Date(),
    }),
  );

  const runtimeStateStr = copilot.runtime.state;

  // Runtime
  const runtimeStateObj = buildRuntimeState(orgSlug, runtimeStateStr);
  const agentWorkloads  = buildAllAgentWorkloads({
    primaryAgentId:    "agentik-ops",
    primaryOps:        0,
    pendingApprovals:  0,
    collaborationCount: 0,
    runtimeState:      runtimeStateStr,
  });
  const execQueue = buildExecutionQueue({
    orgSlug,
    runtimeState: runtimeStateStr,
  });
  const orchestrationState = buildOrchestrationState(runtimeStateObj, execQueue, agentWorkloads);

  // Gateway + observability
  const gateway = buildGatewayReadiness(orgSlug, runtimeStateStr);

  const execTrace = buildExecutionTrace({
    orgSlug,
    agentId:          "agentik-ops",
    runtimeState:     runtimeStateStr,
    hasSignals:       copilot.signals.length > 0,
    hasIntents:       false,
    hasOperations:    false,
    hasBundle:        false,
    hasExecution:     false,
    governanceAllowed: true,
    integrationReady: gateway.readyCount > 0,
  });

  const rawIncidents = detectIncidents({
    orgSlug,
    agentId:                "agentik-ops",
    runtimeState:           runtimeStateStr,
    connectorDegradedCount: runtimeStateObj.degradedCount,
    connectorBlockedCount:  runtimeStateObj.blockedCount,
    governanceAllowed:      true,
    queueBlockedCount:      execQueue.blockedCount,
    pendingApprovals:       0,
  });
  const auditTrail = buildAuditTrail({
    orgSlug, agentId: "agentik-ops", runtimeState: runtimeStateStr,
    governanceAllowed: true, hasExecution: false, hasApprovalRequest: false, integrationDraftCreated: false,
  });
  const orchLog = buildOrchestrationLog(orgSlug, execTrace, auditTrail, rawIncidents);

  // Vault
  const vaultSnapshot        = buildTenantVaultSnapshot(orgSlug, runtimeStateStr, ["sag-erp"]);
  const vaultDispatchAllowed = vaultAllowsDispatch(vaultSnapshot);

  // Dispatch
  const dispatchReadiness = validateDispatchReadiness({
    orgSlug,
    runtimeState:      runtimeStateStr,
    vaultSnapshot,
    governanceAllowed: true,
  });

  // Replay
  const replaySession = buildReplaySession(execTrace);
  const replaySummary = summarizeReplaySession(replaySession);

  // Incident console
  const incidentConsole = buildIncidentConsole({
    orgSlug,
    runtimeState:           runtimeStateStr,
    vaultHealth:            vaultSnapshot.health,
    governanceAllowed:      true,
    connectorBlockedCount:  runtimeStateObj.blockedCount,
    connectorDegradedCount: runtimeStateObj.degradedCount,
    dispatchBlocked:        !dispatchReadiness.canDispatch,
    executionQueueBlocked:  execQueue.blockedCount > 0,
    auditContinuity:        replaySession.auditContinuity,
    replaySession,
  });
  const incidentImpact = summarizeIncidentImpact(incidentConsole);

  // Tenant connectors
  const tenantConnectors = (["sag-erp"] as RealConnectorId[]).map(connectorId =>
    buildTenantConnectorState({
      orgSlug,
      connectorId,
      runtimeState:      runtimeStateStr,
      vaultSnapshot,
      governanceAllowed: true,
      replayContinuity:  replaySession.auditContinuity,
    })
  );
  const connectorHealthSummary = summarizeTenantConnectorHealth(tenantConnectors);

  // n8n Bridge
  const n8nBridge = buildN8nExecutionBridge({
    orgSlug,
    executionId:       `cc-${orgSlug}`,
    workflowId:        "wf-agentik-main",
    workflowName:      "Agentik Main Pipeline",
    runtimeState:      runtimeStateStr,
    vaultHealth:       vaultSnapshot.health,
    governanceAllowed: true,
    replaySession,
  });
  const n8nBridgeSummary    = summarizeN8nBridge(n8nBridge);
  const n8nBridgeValidation = validateN8nBridge(n8nBridge);

  // Execution monitor
  const executionMonitor = buildExecutionMonitor({
    orgSlug,
    blockedDispatchCount: dispatchReadiness.blockedConnectors.length,
    pendingApprovals:     0,
    replayIntegrity:      replaySession.integrity,
  });

  // Global orchestration
  const globalOrchestration = buildGlobalOrchestration({
    orgSlug,
    orchestrationMode:    orchestrationState.orchestrationMode,
    runtimeState:         runtimeStateStr,
    totalQueueDepth:      execQueue.totalQueued,
    blockedQueueCount:    execQueue.blockedCount,
    activeWorkloads:      agentWorkloads.length,
    incidentCount:        incidentConsole.length,
    criticalIncidentCount: incidentImpact.criticalCount,
    governanceBlockCount: 0,
    replayContinuity:     replaySession.auditContinuity,
    connectorReadiness:   orchestrationState.connectorReadiness,
  });

  // Tenant health map
  const tenantHealthMap = buildTenantHealthMap([{
    orgSlug,
    tenantName:         organization.name ?? orgSlug,
    runtimeState:       runtimeStateStr,
    vaultHealth:        vaultSnapshot.health,
    integrationSummary: connectorHealthSummary,
    incidentCount:      incidentConsole.length,
    criticalIncidents:  incidentImpact.criticalCount,
    governanceBlocked:  false,
    executionCapacity:  globalOrchestration.executionCapacity,
    dispatchReady:      dispatchReadiness.canDispatch,
    replayContinuity:   replaySession.auditContinuity,
  }]);

  // Control center state
  const controlCenterState = buildControlCenterState({
    orgSlug,
    runtimeState:          runtimeStateStr,
    vaultHealth:           vaultSnapshot.health,
    activeExecutions:      executionMonitor.activeCount,
    blockedExecutions:     executionMonitor.blockedCount,
    pendingApprovals:      0,
    incidentCount:         incidentConsole.length,
    criticalIncidentCount: incidentImpact.criticalCount,
    dispatchReady:         dispatchReadiness.canDispatch,
    connectorReadiness:    orchestrationState.connectorReadiness,
    orchestrationHealth:   orchLog.health as "green" | "yellow" | "red" | "grey",
    replayContinuity:      replaySession.auditContinuity,
  });

  // ── Health helpers ────────────────────────────────────────────────────────

  const healthDot = (h: string) =>
    h === "healthy" || h === "operational" || h === "secure" || h === "green" ? C.green :
    h === "degraded" || h === "warning" || h === "yellow"                     ? C.amber :
    h === "critical" || h === "blocked" || h === "red"                        ? C.red   : C.inkGhost;

  const healthLbl = (h: string) =>
    h === "healthy"     ? "Nominal"     :
    h === "operational" ? "Operativo"   :
    h === "secure"      ? "Seguro"      :
    h === "degraded"    ? "Degradado"   :
    h === "warning"     ? "Advertencia" :
    h === "critical"    ? "Crítico"     :
    h === "blocked"     ? "Bloqueado"   :
    h;

  const chip = (label: string, ok: boolean) => ({
    label,
    bg:     ok ? "rgba(22,163,74,.12)"  : "rgba(220,38,38,.12)",
    border: ok ? "rgba(22,163,74,.25)"  : "rgba(220,38,38,.25)",
    color:  ok ? C.green                : C.red,
  });

  const gatewayHealth = gateway.readinessPercent > 80 ? "healthy" : gateway.readinessPercent > 40 ? "degraded" : "critical";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: S[6], maxWidth: 1200, margin: "0 auto" }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: S[6] }}>
        <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[1] }}>
          <span style={{
            fontFamily: T.mono, fontSize: "9px", letterSpacing: "0.1em",
            color: "rgba(0,74,173,.6)", background: "rgba(0,74,173,.08)",
            border: "1px solid rgba(0,74,173,.15)", borderRadius: R.xs, padding: "2px 6px",
          }}>
            AGENTIK · INTERNAL
          </span>
          <span style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkGhost, letterSpacing: "0.05em" }}>
            {user.email}
          </span>
        </div>
        <h1 style={{ fontFamily: T.mono, fontSize: T.sz.xl, fontWeight: T.wt.semibold, color: C.ink, margin: 0 }}>
          Control Center
        </h1>
        <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, margin: `${S[1]}px 0 0` }}>
          Infraestructura operativa — runtime, vault, dispatch, replay, bridge · {orgSlug}
        </p>
      </div>

      {/* ── Top-level health strip ──────────────────────────────────────────── */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: S[3],
        marginBottom: S[6],
      }}>
        {[
          { label: "Runtime",  health: runtimeStateObj.state },
          { label: "Vault",    health: vaultSnapshot.health },
          { label: "Gateway",  health: gatewayHealth },
          { label: "Dispatch", health: dispatchReadiness.canDispatch ? "healthy" : "critical" },
          { label: "Sistema",  health: controlCenterState.health },
        ].map(({ label, health }) => (
          <div key={label} style={{
            background: C.white, border: `1px solid ${C.line}`, borderRadius: R.md,
            padding: `${S[3]}px`, textAlign: "center",
          }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: S[1] }}>
              <span style={{ width: 8, height: 8, borderRadius: R.pill, background: healthDot(health), display: "inline-block" }} />
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.ink, fontWeight: T.wt.semibold }}>{label}</div>
            <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint, marginTop: 2 }}>{healthLbl(health)}</div>
          </div>
        ))}
      </div>

      {/* ── Two-column layout ───────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[4] }}>

        {/* ── RUNTIME CARD ───────────────────────────────────────────────── */}
        <div style={{ background: C.white, border: `1px solid ${C.line}`, borderRadius: R.md, padding: S[4] }}>
          <CardTitle>Runtime</CardTitle>
          <Rows>
            <Row label="Estado"     value={healthLbl(runtimeStateObj.state)} />
            <Row label="Modo"       value={orchestrationState.orchestrationMode} />
            <Row label="Queue"      value={`${execQueue.totalQueued} queued · ${execQueue.blockedCount} blocked`} />
            <Row label="Conectores" value={`${gateway.readyCount} / ${gateway.readyCount + gateway.blockedCount} listos`} />
          </Rows>
        </div>

        {/* ── VAULT CARD ─────────────────────────────────────────────────── */}
        <div style={{ background: C.white, border: `1px solid ${C.line}`, borderRadius: R.md, padding: S[4] }}>
          <CardTitle>Vault</CardTitle>
          <Rows>
            <Row label="Salud"      value={healthLbl(vaultSnapshot.health)} />
            <Row label="Secretos"   value={`${vaultSnapshot.totalSecrets} total · ${vaultSnapshot.activeCount} activos`} />
            <Row label="Expiración" value={vaultSnapshot.expiringCount > 0 ? `${vaultSnapshot.expiringCount} por vencer` : "Sin vencimientos"} />
            <Row label="Revocados"  value={vaultSnapshot.revokedCount > 0 ? `${vaultSnapshot.revokedCount} revocados` : "—"} />
            <Row label="Dispatch"   value={vaultDispatchAllowed ? "Permitido" : "Bloqueado"} urgent={!vaultDispatchAllowed} />
          </Rows>
        </div>

        {/* ── DISPATCH CARD ──────────────────────────────────────────────── */}
        <div style={{ background: C.white, border: `1px solid ${C.line}`, borderRadius: R.md, padding: S[4] }}>
          <CardTitle>Dispatch</CardTitle>
          <Rows>
            <Row label="Puede despachar" value={dispatchReadiness.canDispatch ? "Sí" : "No"} urgent={!dispatchReadiness.canDispatch} />
            <Row label="Requiere aprob." value={dispatchReadiness.requiresApproval ? "Sí" : "No"} />
            <Row label="Conectores OK"   value={`${dispatchReadiness.readyConnectors.length}`} />
            <Row label="Bloqueados"      value={`${dispatchReadiness.blockedConnectors.length}`} urgent={dispatchReadiness.blockedConnectors.length > 0} />
            <Row label="Resumen"         value={dispatchReadiness.summaryLabel} />
          </Rows>
        </div>

        {/* ── REPLAY CARD ────────────────────────────────────────────────── */}
        <div style={{ background: C.white, border: `1px solid ${C.line}`, borderRadius: R.md, padding: S[4] }}>
          <CardTitle>Replay</CardTitle>
          <Rows>
            <Row label="Integridad"  value={replaySession.integrity} urgent={replaySession.integrity === "corrupt" || replaySession.integrity === "incomplete"} />
            <Row label="Disponible"  value={replaySession.replayAvailable ? "Sí" : "No"} />
            <Row label="Continuidad" value={replaySession.auditContinuity ? "Íntegra" : "Con brechas"} urgent={!replaySession.auditContinuity} />
            <Row label="Spans"       value={`${replaySession.accountedSpans} / ${replaySession.spanCount}`} />
            <Row label="Replay ID"   value={replaySession.replayId} />
          </Rows>
        </div>

        {/* ── BRIDGE CARD ────────────────────────────────────────────────── */}
        <div style={{ background: C.white, border: `1px solid ${C.line}`, borderRadius: R.md, padding: S[4] }}>
          <CardTitle>n8n Bridge</CardTitle>
          <Rows>
            <Row label="Estado"    value={n8nBridge.bridgeStatus} />
            <Row label="Workflow"  value={n8nBridge.workflowName} />
            <Row label="Runtime"   value={n8nBridge.runtimeValidated ? "OK" : "Fallo"} urgent={!n8nBridge.runtimeValidated} />
            <Row label="Vault"     value={n8nBridge.vaultValidated ? "OK" : "Fallo"} urgent={!n8nBridge.vaultValidated} />
            <Row label="Dispatch"  value={n8nBridge.dispatchApproved ? "Aprobado" : "Pendiente"} urgent={!n8nBridge.dispatchApproved} />
            <Row label="Correlation" value={n8nBridge.correlationId} />
          </Rows>
          {n8nBridge.blockReason && (
            <div style={{ marginTop: S[2], fontFamily: T.mono, fontSize: "9px", color: C.red, background: "rgba(220,38,38,.06)", border: "1px solid rgba(220,38,38,.15)", borderRadius: R.xs, padding: `${S[1]}px` }}>
              {n8nBridge.blockReason}
            </div>
          )}
        </div>

        {/* ── INCIDENTES CARD ────────────────────────────────────────────── */}
        <div style={{ background: C.white, border: `1px solid ${C.line}`, borderRadius: R.md, padding: S[4] }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: S[2] }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink }}>Incidentes</span>
            {incidentImpact.totalCount > 0 && (
              <span style={{
                fontFamily: T.mono, fontSize: "9px", color: C.red,
                background: "rgba(220,38,38,.1)", border: "1px solid rgba(220,38,38,.2)",
                borderRadius: R.xs, padding: "1px 5px",
              }}>
                {incidentImpact.totalCount} activo{incidentImpact.totalCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          {incidentConsole.length === 0 ? (
            <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkGhost }}>Sin incidentes activos</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: S[1] }}>
              {incidentConsole.slice(0, 4).map((inc, i) => (
                <div key={inc.id ?? i} style={{
                  display: "flex", alignItems: "flex-start", gap: S[1],
                  padding: `${S[1]}px`, borderRadius: R.xs,
                  background: inc.severity === "critical" ? "rgba(220,38,38,.04)" : "transparent",
                }}>
                  <span style={{
                    width: 5, height: 5, borderRadius: R.pill, flexShrink: 0, marginTop: 3,
                    background: inc.severity === "critical" ? C.red : inc.severity === "high" ? C.amber : C.inkGhost,
                  }} />
                  <div>
                    <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.ink }}>{inc.title}</div>
                    <div style={{ fontFamily: T.mono, fontSize: "8px", color: C.inkFaint }}>{inc.category} · {inc.severity}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── CONTROL CENTER SUMMARY ─────────────────────────────────────── */}
        <div style={{ background: C.white, border: `1px solid ${C.line}`, borderRadius: R.md, padding: S[4], gridColumn: "1 / -1" }}>
          <CardTitle>Estado Global</CardTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: S[3], marginBottom: S[3] }}>
            {[
              { label: "Tenants activos",  value: controlCenterState.activeTenants },
              { label: "Ejecuciones",       value: controlCenterState.activeExecutions },
              { label: "Bloqueadas",        value: controlCenterState.blockedExecutions },
              { label: "Incidentes",        value: controlCenterState.incidentCount },
            ].map(({ label, value }) => (
              <div key={label} style={{ textAlign: "center", padding: S[2], background: C.surface, borderRadius: R.sm }}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.semibold, color: C.ink }}>{value}</div>
                <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
            {[
              chip("Presión sistema", globalOrchestration.systemPressure === "nominal"),
              chip("Dispatch",        controlCenterState.dispatchReady),
              chip("Tenant health",   tenantHealthMap.overallHealth === "healthy"),
              chip("Exec. pressure",  executionMonitor.pressure === "clear"),
            ].map(c => (
              <span key={c.label} style={{
                fontFamily: T.mono, fontSize: "9px", color: c.color,
                background: c.bg, border: `1px solid ${c.border}`,
                borderRadius: R.xs, padding: "2px 7px",
              }}>
                {c.label}
              </span>
            ))}
          </div>
          {controlCenterState.summary && (
            <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkGhost, marginTop: S[2], borderTop: `1px solid ${C.line}`, paddingTop: S[2] }}>
              {controlCenterState.summary}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ── Micro components ──────────────────────────────────────────────────────────

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[2] }}>
      {children}
    </div>
  );
}

function Rows({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: S[1] }}>{children}</div>;
}

function Row({
  label, value, urgent = false,
}: {
  label:   string;
  value:   string | number;
  urgent?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
      <span style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkGhost, flexShrink: 0 }}>{label}</span>
      <span style={{
        fontFamily: T.mono, fontSize: "9px",
        color:      urgent ? C.red : C.ink,
        textAlign:  "right", wordBreak: "break-all",
      }}>
        {value}
      </span>
    </div>
  );
}
