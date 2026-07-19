/**
 * /[orgSlug]/agentik/marketing-studio/review
 *
 * MS-07 — Review Center
 *
 * Operational command center for product/asset review, blocking resolution,
 * and multi-channel publication readiness.
 *
 * ── Blueprint layers ────────────────────────────────────────────────────────
 *   1. OperationalWorkspaceHeader   (Module Pulse Header)
 *   2. Operational Alert Strip      (Control tower KPIs)
 *   3. Luca + Mila Summary Signals  (Agent intelligence bars)
 *   4. ReviewQueue                  (Priority queue + filters + drawer)
 *
 * ── Data ─────────────────────────────────────────────────────────────────────
 *   Real: listProductConsoleItems → buildReviewQueue → buildAlertSummary
 *
 * ── No Prisma changes · no engine changes · no SAG adapter changes ───────────
 */

import { redirect }                 from "next/navigation";
import { requireOrgAccess }         from "@/lib/auth/org-access";
import { canAccessMarketingStudio } from "@/lib/auth/module-access";
import { listProductConsoleItems }  from "@/lib/marketing-studio/products/product-query-service";
import {
  buildReviewQueue,
  buildAlertSummary,
}                                   from "@/lib/marketing-studio/review/review-engine";
import { C, T, S, R, E }           from "@/lib/ui/tokens";
import {
  OperationalWorkspaceHeader,
}                                   from "@/components/workspace/operational-workspace-header";
import { ReviewQueue }              from "@/components/marketing-studio/review/review-queue";

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ReviewCenterPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }                  = await params;
  const { membership, organization } = await requireOrgAccess(orgSlug);
  if (!canAccessMarketingStudio(membership.role)) redirect(`/${orgSlug}/agentik`);

  // ── Real data ──
  const products  = await listProductConsoleItems(organization.id);
  const queue     = buildReviewQueue(products);
  const alerts    = buildAlertSummary(queue);

  // ── Header status ──
  const headerStatus =
    alerts.blocked > 0 || alerts.syncFailed > 0 ? "warning" :
    alerts.ready > 0                              ? "ok"      :
    "ok";

  const headerStatusLabel =
    alerts.blocked > 0
      ? `${alerts.blocked} producto${alerts.blocked > 1 ? "s" : ""} bloqueado${alerts.blocked > 1 ? "s" : ""}`
      : alerts.ready > 0
        ? `${alerts.ready} listo${alerts.ready > 1 ? "s" : ""} para publicar`
        : `${alerts.total} en revisión`;

  // ── Luca top signal ──
  const lucaHighValue = queue.filter(
    i => i.readinessScore >= 70 && i.pendingDestinations.length > 0,
  ).length;

  // ── Mila top signal ──
  const milaWhatsappReady = queue.filter(
    i => i.readyDestinations.includes("whatsapp") &&
         i.publicationSummary.find(p => p.channel === "whatsapp")?.publicationStatus !== "published",
  ).length;

  return (
    <div style={{ fontFamily: T.mono, maxWidth: 1080 }}>

      {/* ── 1. Header ── */}
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Marketing Studio", href: `/${orgSlug}/agentik/marketing-studio` },
          { label: "Review Center" },
        ]}
        title="Review Center"
        subtitle="Control operacional de productos — bloqueos, readiness, sync y publicación multicanal."
        status={headerStatus}
        statusLabel={headerStatusLabel}
      />

      {/* ── 2. Operational Alert Strip ── */}
      {alerts.total > 0 ? (
        <div style={{
          display:             "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap:                 S[3],
          marginBottom:        S[5],
        }}>
          <AlertCard value={alerts.blocked}         label="Bloqueados"         sub="requieren acción inmediata" dot={C.red}      />
          <AlertCard value={alerts.syncFailed}      label="Sincronización fallida" sub="dato en canal desactualizado" dot={C.red}   />
          <AlertCard value={alerts.shopifyReady}    label="Listos — Shopify"      sub="pendientes de publicación" dot={C.green}    />
          <AlertCard value={alerts.missingVariants} label="Sin variantes"          sub="Anuncios bloqueados" dot={C.amber}        />
        </div>
      ) : (
        <div style={{
          padding:      `${S[4]}px ${S[5]}px`,
          background:   C.greenLight,
          border:       `1px solid ${C.greenBorder}`,
          borderRadius: R.md,
          marginBottom: S[5],
          fontFamily:   T.mono, fontSize: T.sz.xs, color: C.green, fontWeight: T.wt.semibold,
        }}>
          Sin productos en cola de revisión — aprueba assets desde Foto Estudio para comenzar.
        </div>
      )}

      {/* ── Secondary alert row ── */}
      {alerts.total > 0 && (
        <div style={{
          display:             "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap:                 S[3],
          marginBottom:        S[5],
        }}>
          <AlertCard value={alerts.requiresReview}  label="Requieren revisión"  sub="advertencias activas"    dot={C.amber}    />
          <AlertCard value={alerts.partiallyReady}  label="Parcialmente listos" sub="metadata incompleta"     dot={C.amber}    />
          <AlertCard value={alerts.stale}           label="Sin actividad"       sub="más de 30 días"          dot={C.inkFaint} />
          <AlertCard value={alerts.published}       label="Publicados"          sub="en al menos un canal"    dot={C.blueDark} />
        </div>
      )}

      {/* ── 3. Agent Signals ── */}
      {alerts.total > 0 && (
        <div style={{ display: "flex", gap: S[3], marginBottom: S[5], flexWrap: "wrap" as const }}>

          {/* Luca signal */}
          <div style={{
            flex:         "1 1 auto",
            display:      "flex", alignItems: "center", gap: S[2],
            padding:      `${S[2]}px ${S[3]}px`,
            background:   "linear-gradient(135deg, #001E4A 0%, #003A8A 100%)",
            borderRadius: R.md,
            border:       "1px solid #002866",
            minWidth:     220,
          }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "rgba(255,255,255,.5)", flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: "rgba(255,255,255,.90)" }}>
                {lucaHighValue > 0
                  ? `${lucaHighValue} productos con readiness alto listos para activar`
                  : "Sin oportunidades de activación inmediata detectadas"}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: "rgba(255,255,255,.45)", marginTop: 2 }}>
                {lucaHighValue > 0
                  ? "Readiness ≥70 — canal asignado pero sin publicar"
                  : "Completa metadata para desbloquear oportunidades"}
              </div>
            </div>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold,
              color: "rgba(255,255,255,.35)", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
              Luca · IA
            </span>
          </div>

          {/* Mila signal */}
          <div style={{
            flex:         "1 1 auto",
            display:      "flex", alignItems: "center", gap: S[2],
            padding:      `${S[2]}px ${S[3]}px`,
            background:   C.greenLight,
            borderRadius: R.md,
            border:       `1px solid ${C.greenBorder}`,
            minWidth:     220,
          }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.green, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.greenDark }}>
                {milaWhatsappReady > 0
                  ? `${milaWhatsappReady} productos listos para WhatsApp — sin publicar`
                  : "Sin productos pendientes para catálogo WhatsApp"}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, marginTop: 2 }}>
                {milaWhatsappReady > 0
                  ? "Activa el catálogo para aumentar conversión en ventas directas"
                  : "Agrega disponibilidad de stock para habilitar WhatsApp"}
              </div>
            </div>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold,
              color: C.green, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
              Mila · CRM
            </span>
          </div>
        </div>
      )}

      {/* ── 4. Review Queue ── */}
      <div style={{
        background:   C.white,
        border:       `1px solid ${C.line}`,
        borderRadius: R.md,
        padding:      S[4],
        boxShadow:    E.sm,
      }}>
        <div style={{
          display:      "flex",
          alignItems:   "center",
          gap:          S[3],
          marginBottom: S[4],
        }}>
          <div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink }}>
              Cola de revisión
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: 2 }}>
              {alerts.total} producto{alerts.total !== 1 ? "s" : ""} · ordenados por prioridad operacional
            </div>
          </div>
        </div>

        <ReviewQueue items={queue} orgSlug={orgSlug} />
      </div>

      {/* ── Footer legend ── */}
      <div style={{
        display:    "flex", alignItems: "center", gap: S[3],
        marginTop:  S[8], paddingTop: S[4],
        borderTop:  `1px solid ${C.lineSubtle}`, flexWrap: "wrap" as const,
      }}>
        {LEGEND.map(s => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: S[1],
            fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot,
              display: "inline-block", flexShrink: 0 }} />
            {s.label}
          </div>
        ))}
        <div style={{ marginLeft: "auto", fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost }}>
          MS-07 Review Center · prioridad computada · bloqueos por canal
        </div>
      </div>

    </div>
  );
}

// ── Page-local AlertCard ───────────────────────────────────────────────────────

function AlertCard({
  value, label, sub, dot,
}: {
  value: number; label: string; sub?: string; dot: string;
}) {
  return (
    <div style={{
      background:   C.white, border: `1px solid ${C.line}`,
      borderRadius: R.md, padding: `${S[3]}px ${S[4]}px`,
      boxShadow:    E.sm, position: "relative" as const, overflow: "hidden" as const,
    }}>
      <div style={{
        position: "absolute" as const, left: 0, top: 0, bottom: 0,
        width: 3, background: dot,
        borderRadius: `${R.md}px 0 0 ${R.md}px`,
      }} />
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xl"], fontWeight: T.wt.bold,
        color: C.ink, lineHeight: 1, fontVariantNumeric: "tabular-nums", marginBottom: S[1] }}>
        {value}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
        color: C.inkMid, marginBottom: sub ? 2 : 0 }}>
        {label}
      </div>
      {sub && (
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Static legend ──────────────────────────────────────────────────────────────

const LEGEND = [
  { dot: C.red,      label: "Bloqueado — acción requerida"  },
  { dot: C.amber,    label: "Requiere atención / parcial"   },
  { dot: C.green,    label: "Listo para publicar"           },
  { dot: C.blueDark, label: "Publicado en al menos un canal"},
  { dot: C.inkFaint, label: "Sin actividad reciente"        },
];
