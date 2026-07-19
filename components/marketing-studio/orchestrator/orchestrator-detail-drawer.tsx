"use client";

/**
 * components/marketing-studio/orchestrator/orchestrator-detail-drawer.tsx
 *
 * MS-17 — Orchestrator Runtime: 12-section enterprise plan detail drawer
 */

import { C, T, S, R } from "@/lib/ui/tokens";
import {
  ORCHESTRATOR_STATUS_LABEL,
  ORCHESTRATOR_PLAN_TYPE_LABEL,
  ORCHESTRATOR_STAGE_STATUS_LABEL,
  ORCHESTRATOR_JOB_TYPE_LABEL,
  ORCHESTRATOR_CHANNEL_LABEL,
  getOrchestratorStatusVariant,
  getStageStatusIcon,
  getChannelColor,
  getProgressColor,
  getRecommendationSourceLabel,
  getRecommendationSourceColor,
  formatOrchestratorDate,
  formatCountdown,
  formatDurationMs,
  getPlanTypeIcon,
} from "@/lib/marketing-studio/orchestrator/orchestrator-display";
import { OrchestratorActionCenter }        from "./orchestrator-action-center";
import type {
  OrchestratorPlan,
  OrchestratorRecommendation,
} from "@/lib/marketing-studio/orchestrator/orchestrator-types";

interface Props {
  plan:            OrchestratorPlan | null;
  recommendations: OrchestratorRecommendation[];
  orgSlug:         string;
  onClose:         () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: S[5] }}>
      <div style={{
        fontFamily:    T.mono,
        fontSize:      T.sz.xs,
        color:         C.inkLight,
        fontWeight:    600,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        marginBottom:  S[2],
        paddingBottom: S[1],
        borderBottom:  `1px solid ${C.lineSubtle}`,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function KV({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: `${S[1]}px 0` }}>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>{label}</span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: color ?? C.inkMid, fontWeight: 500 }}>
        {value}
      </span>
    </div>
  );
}

export function OrchestratorDetailDrawer({ plan, recommendations, orgSlug, onClose }: Props) {
  if (!plan) return null;

  const planRecs      = recommendations.filter(r => r.planId === plan.id || r.planId === null);
  const errorBlockers = plan.blockers.filter(b => b.severity === "error" && !b.resolvedAt);
  const warnBlockers  = plan.blockers.filter(b => b.severity === "warning" && !b.resolvedAt);
  const allJobs       = plan.stages.flatMap(s => s.jobs);
  const failedJobs    = allJobs.filter(j => j.status === "failed");

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.18)", zIndex: 200 }} />
      <div style={{
        position:      "fixed",
        top:           0,
        right:         0,
        bottom:        0,
        width:         460,
        background:    C.surface,
        borderLeft:    `1px solid ${C.line}`,
        zIndex:        201,
        display:       "flex",
        flexDirection: "column",
        overflow:      "hidden",
      }}>

        {/* Header */}
        <div style={{
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          padding:        `${S[4]}px ${S[5]}px`,
          borderBottom:   `1px solid ${C.line}`,
          background:     C.surfaceAlt,
          flexShrink:     0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: S[3] }}>
            <span style={{ fontSize: 20, color: C.inkLight }}>{getPlanTypeIcon(plan.type)}</span>
            <div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.ink }}>
                {ORCHESTRATOR_PLAN_TYPE_LABEL[plan.type]}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
                {plan.id.slice(0, 16)}…
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: S[3] }}>
            <span className={`ag-op-status ag-op-status--${getOrchestratorStatusVariant(plan.status)}`}>
              {ORCHESTRATOR_STATUS_LABEL[plan.status]}
            </span>
            <button
              onClick={onClose}
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: T.mono, fontSize: T.sz.md, color: C.inkLight }}
            >✕</button>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ height: 4, background: C.lineSubtle, flexShrink: 0 }}>
          <div style={{
            height:     "100%",
            width:      `${plan.progress}%`,
            background: getProgressColor(plan.progress),
            transition: "width 0.3s ease",
          }} />
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: `${S[5]}px` }}>

          {/* §1 Overview */}
          <Section title="Overview">
            <KV label="Estado"        value={ORCHESTRATOR_STATUS_LABEL[plan.status]} />
            <KV label="Tipo"          value={ORCHESTRATOR_PLAN_TYPE_LABEL[plan.type]} />
            <KV label="Prioridad"     value={plan.priority.toUpperCase()} color={
              plan.priority === "critical" ? C.red : plan.priority === "high" ? C.amber : C.inkMid
            } />
            <KV label="Progreso"      value={`${plan.progress}%`} color={getProgressColor(plan.progress)} />
            <KV label="Estado operativo" value={`${plan.healthScore}/100`} color={
              plan.healthScore >= 70 ? C.green : plan.healthScore >= 40 ? C.amber : C.red
            } />
            <KV label="Preparación"      value={`${plan.readinessScore}/100`} />
          </Section>

          {/* §2 Stages */}
          <Section title={`Stages (${plan.stages.length})`}>
            {plan.stages.map(stage => (
              <div key={stage.id} style={{
                display:      "flex",
                alignItems:   "center",
                gap:          S[2],
                padding:      `${S[1]}px 0`,
                borderBottom: `1px solid ${C.lineSubtle}`,
              }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, width: 16, textAlign: "center" }}>
                  {getStageStatusIcon(stage.status)}
                </span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, flex: 1, color: C.inkMid }}>
                  {stage.label}
                </span>
                <span className={`ag-op-status ag-op-status--${
                  stage.status === "completed" ? "ok" :
                  stage.status === "running"   ? "syncing" :
                  stage.status === "failed"    ? "critical" :
                  stage.status === "blocked"   ? "critical" :
                  "draft"
                }`}>
                  {ORCHESTRATOR_STAGE_STATUS_LABEL[stage.status]}
                </span>
              </div>
            ))}
          </Section>

          {/* §3 Blockers */}
          <Section title={`Bloqueos (${errorBlockers.length + warnBlockers.length})`}>
            {errorBlockers.length === 0 && warnBlockers.length === 0 ? (
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.green }}>✓ Sin bloqueos</span>
            ) : (
              [...errorBlockers, ...warnBlockers].map(b => (
                <div key={b.id} style={{
                  padding:      `${S[2]}px`,
                  borderLeft:   `3px solid ${b.severity === "error" ? C.red : C.amber}`,
                  background:   b.severity === "error" ? C.redLight : C.amberLight,
                  borderRadius: `0 ${R.sm}px ${R.sm}px 0`,
                  marginBottom: S[2],
                }}>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: b.severity === "error" ? C.red : C.amber }}>
                    {b.code}
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, marginTop: 2 }}>
                    {b.description}
                  </div>
                  {b.autoAction && (
                    <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.blueDark, marginTop: 4, fontWeight: 600 }}>
                      → {b.autoAction}
                    </div>
                  )}
                </div>
              ))
            )}
          </Section>

          {/* §4 Retries */}
          <Section title="Reintentos">
            <KV label="Total retries" value={plan.retryCount}
              color={plan.retryCount > 0 ? C.amber : C.inkLight}
            />
            {failedJobs.map(j => (
              <div key={j.id} style={{ padding: `${S[1]}px 0`, borderBottom: `1px solid ${C.lineSubtle}` }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                    {ORCHESTRATOR_JOB_TYPE_LABEL[j.type]}
                  </span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.amber, fontWeight: 700 }}>
                    ↺ ×{j.retryCount}
                  </span>
                </div>
                {j.failReason && (
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red, marginTop: 2 }}>
                    {j.failReason}
                  </div>
                )}
              </div>
            ))}
            {failedJobs.length === 0 && (
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>Sin jobs fallidos</span>
            )}
          </Section>

          {/* §5 Jobs */}
          <Section title={`Jobs (${allJobs.length})`}>
            {allJobs.map(j => (
              <div key={j.id} style={{
                display:      "flex",
                alignItems:   "center",
                gap:          S[2],
                padding:      `${S[1]}px 0`,
                borderBottom: `1px solid ${C.lineSubtle}`,
              }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, flex: 1, color: C.inkMid }}>
                  {ORCHESTRATOR_JOB_TYPE_LABEL[j.type]}
                </span>
                <span style={{
                  fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint,
                }}>
                  {getStageStatusIcon(j.status)}
                </span>
              </div>
            ))}
          </Section>

          {/* §6 Dependencies */}
          <Section title="Dependencias">
            {plan.stages.filter(s => s.dependsOn.length > 0).map(s => (
              <div key={s.id} style={{ marginBottom: S[2] }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, fontWeight: 600 }}>
                  {s.label}
                </span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
                  {" "}requiere: {s.dependsOn.length} stage{s.dependsOn.length > 1 ? "s" : ""}
                </span>
              </div>
            ))}
            {plan.stages.every(s => s.dependsOn.length === 0) && (
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>Sin dependencias</span>
            )}
          </Section>

          {/* §7 Channels */}
          <Section title={`Canales (${plan.targetChannels.length})`}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: S[2] }}>
              {plan.targetChannels.map(ch => (
                <span key={ch} style={{
                  display:      "flex",
                  alignItems:   "center",
                  gap:          S[1],
                  fontFamily:   T.mono,
                  fontSize:     T.sz.xs,
                  color:        C.ink,
                  background:   C.surfaceAlt,
                  border:       `1px solid ${C.line}`,
                  borderRadius: R.sm,
                  padding:      `${S[1]}px ${S[2]}px`,
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: R.pill, background: getChannelColor(ch), display: "inline-block" }} />
                  {ORCHESTRATOR_CHANNEL_LABEL[ch]}
                </span>
              ))}
            </div>
          </Section>

          {/* §8 Execution metrics */}
          <Section title="Métricas de Ejecución">
            <KV label="Jobs totales"    value={plan.executionSummary.totalJobs} />
            <KV label="Completados"     value={plan.executionSummary.completedJobs} color={C.green} />
            <KV label="Fallidos"        value={plan.executionSummary.failedJobs}    color={plan.executionSummary.failedJobs > 0 ? C.red : C.inkLight} />
            <KV label="Bloqueados"      value={plan.executionSummary.blockedJobs}   color={plan.executionSummary.blockedJobs > 0 ? C.amber : C.inkLight} />
            <KV label="Duración prom."  value={formatDurationMs(plan.executionSummary.avgDurationMs)} />
            <KV label="Última actividad" value={formatOrchestratorDate(plan.executionSummary.lastActivityAt)} />
          </Section>

          {/* §9 Linked entities */}
          <Section title="Contexto">
            <KV label="Tipo entidad"   value={plan.sourceEntityType} />
            {plan.sourceEntityId && (
              <KV label="Entidad ID"   value={<span style={{ fontSize: 9 }}>{plan.sourceEntityId}</span>} />
            )}
            {!!plan.metadata.productId  && <KV label="Producto"  value={<span style={{ fontSize: 9 }}>{String(plan.metadata.productId)}</span>} />}
            {!!plan.metadata.campaignId && <KV label="Contenido"  value="Vinculado" />}
            {!!plan.metadata.catalogId  && <KV label="Catálogo"  value={<span style={{ fontSize: 9 }}>{String(plan.metadata.catalogId)}</span>} />}
          </Section>

          {/* §10 Recommendations */}
          <Section title={`Recomendaciones (${planRecs.length})`}>
            {planRecs.length === 0 ? (
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>Sin señales activas</span>
            ) : (
              planRecs.slice(0, 3).map(r => (
                <div key={r.id} style={{
                  borderLeft:   `3px solid ${getRecommendationSourceColor(r.source)}`,
                  padding:      `${S[2]}px ${S[3]}px`,
                  background:   C.surfaceAlt,
                  borderRadius: `0 ${R.sm}px ${R.sm}px 0`,
                  marginBottom: S[2],
                }}>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: getRecommendationSourceColor(r.source), fontWeight: 700, marginBottom: 2 }}>
                    {getRecommendationSourceLabel(r.source)}
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, fontWeight: 600, marginBottom: 2 }}>
                    {r.title}
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>
                    {r.description}
                  </div>
                </div>
              ))
            )}
          </Section>

          {/* §11 Activity */}
          <Section title="Programación">
            <KV label="Creado"     value={formatOrchestratorDate(plan.createdAt)} />
            <KV label="Programado" value={plan.scheduledAt ? formatCountdown(plan.scheduledAt) : "—"} />
            <KV label="Iniciado"   value={formatOrchestratorDate(plan.startedAt)} />
            <KV label="Completado" value={formatOrchestratorDate(plan.completedAt)} />
            <KV label="Fallido"    value={formatOrchestratorDate(plan.failedAt)} />
          </Section>

          {/* §12 Actions */}
          <Section title="Acciones">
            <OrchestratorActionCenter
              plan={plan}
              orgSlug={orgSlug}
            />
          </Section>

        </div>
      </div>
    </>
  );
}
