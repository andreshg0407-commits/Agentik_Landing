"use client";

/**
 * components/marketing-studio/publishing/publishing-detail-drawer.tsx
 *
 * MS-17 — Publishing Center: Plan detail drawer.
 */

import { C, T, S }                   from "@/lib/ui/tokens";
import {
  getPublishingStatusVariant,
  getPublishingStatusLabel,
  getPublishingPriorityLabel,
  getPublishingTriggerLabel,
  getProgressColor,
  formatPublishingDate,
  formatScheduledCountdown,
} from "@/lib/marketing-studio/publishing/publishing-display";
import { PublishingStepTimeline }    from "./publishing-step-timeline";
import { PublishingActionCenter }    from "./publishing-action-center";
import type { PublishingPlan }       from "@/lib/marketing-studio/publishing/publishing-types";

interface Props {
  plan:    PublishingPlan | null;
  orgSlug: string;
  onClose: () => void;
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
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: color ?? C.ink, fontWeight: 500 }}>
        {value}
      </span>
    </div>
  );
}

export function PublishingDetailDrawer({ plan, orgSlug, onClose }: Props) {
  if (!plan) return null;

  const failedSteps   = plan.steps.filter(s => s.status === "failed").length;
  const blockedSteps  = plan.steps.filter(s => s.status === "blocked").length;
  const doneSteps     = plan.steps.filter(s => s.status === "published").length;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.18)", zIndex: 200 }} />
      <div style={{
        position:      "fixed",
        top:           0,
        right:         0,
        bottom:        0,
        width:         440,
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
          <div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.ink }}>
              Publishing Plan
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
              {getPublishingTriggerLabel(plan.trigger)} · {getPublishingPriorityLabel(plan.priority)}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: S[3] }}>
            <span className={`ag-op-status ag-op-status--${getPublishingStatusVariant(plan.status)}`}>
              {getPublishingStatusLabel(plan.status)}
            </span>
            <button
              onClick={onClose}
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}
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

          <Section title="Identificación">
            <KV label="Plan ID" value={<span style={{ fontSize: 9 }}>{plan.id}</span>} />
            <KV label="Progreso"  value={`${plan.progress}%`} color={getProgressColor(plan.progress)} />
            <KV label="Steps"
              value={`${doneSteps}/${plan.steps.length} (${failedSteps} fallidos, ${blockedSteps} bloqueados)`}
              color={failedSteps > 0 ? C.red : undefined}
            />
          </Section>

          <Section title="Programación">
            <KV label="Programado" value={formatScheduledCountdown(plan.scheduledAt)} />
            <KV label="Iniciado"   value={formatPublishingDate(plan.startedAt)} />
            <KV label="Completado" value={formatPublishingDate(plan.completedAt)} />
            <KV label="Creado"     value={formatPublishingDate(plan.createdAt)} />
          </Section>

          <Section title="Contexto">
            {plan.productId  && <KV label="Producto"  value={<span style={{ fontSize: 9 }}>{plan.productId}</span>} />}
            {plan.campaignId && <KV label="Contenido"  value="Vinculado" />}
            {plan.catalogId  && <KV label="Catálogo"  value={<span style={{ fontSize: 9 }}>{plan.catalogId}</span>} />}
            {!plan.productId && !plan.campaignId && !plan.catalogId && (
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>Sin contexto asociado</span>
            )}
          </Section>

          <Section title="Acciones">
            <PublishingActionCenter plan={plan} orgSlug={orgSlug} />
          </Section>

          <Section title={`Steps (${plan.steps.length})`}>
            <PublishingStepTimeline steps={plan.steps} />
          </Section>
        </div>
      </div>
    </>
  );
}
