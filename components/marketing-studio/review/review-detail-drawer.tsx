/**
 * components/marketing-studio/review/review-detail-drawer.tsx
 *
 * MS-07 — Review Detail Drawer
 *
 * Deep operational review of a single product. 12 sections:
 *   1. Operational summary
 *   2. Blocking issues
 *   3. Warning issues
 *   4. Destination status
 *   5. Sync state
 *   6. Publication state
 *   7. Missing assets / variants
 *   8. Luca signals
 *   9. Mila signals
 *  10. Suggested actions
 *  11. Stale detection
 *  12. Bulk action tray (visual architecture — no logic yet)
 *
 * Reuses ag-asset-drawer CSS class family for consistent drawer behavior.
 */

"use client";

import { C, T, S, R, E } from "@/lib/ui/tokens";
import type { ReviewQueueItem, BlockingIssue, WarningIssue, PriorityLevel } from "@/lib/marketing-studio/review/review-engine";
import { REVIEW_STATUS_LABEL, PRIORITY_LABEL } from "@/lib/marketing-studio/review/review-engine";

// ── Priority visual config (UI-layer only — uses C.* tokens) ─────────────────

const PRIORITY_CONFIG: Record<PriorityLevel, { bg: string; text: string; border: string }> = {
  critical: { bg: C.redLight,    text: C.red,      border: C.redBorder    },
  high:     { bg: C.amberLight,  text: C.amber,    border: C.amberBorder  },
  medium:   { bg: C.blueLight,   text: C.blueDark, border: C.blueBorder   },
  low:      { bg: C.surface,     text: C.inkLight, border: C.line         },
};

// ── Static config ─────────────────────────────────────────────────────────────

const CHANNEL_LABEL: Record<string, string> = {
  shopify:  "Shopify",
  crm:      "CRM",
  whatsapp: "WhatsApp",
  catalog:  "Catálogo",
  ads:      "Anuncios",
  landing:  "Página de destino",
};

const SYNC_STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  synced:         { color: C.green,    bg: C.greenLight,  label: "Sincronizado"  },
  failed:         { color: C.red,      bg: C.redLight,    label: "Sincronización fallida"  },
  pending:        { color: C.amber,    bg: C.amberLight,  label: "Pendiente"     },
  outdated:       { color: C.inkFaint, bg: C.surface,     label: "Desactualizado"},
  not_configured: { color: C.line,     bg: C.surfaceAlt,  label: "No configurado"},
};

const PUB_STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  published:   { color: C.blueDark, bg: C.blueLight,   label: "Publicado"     },
  unpublished: { color: C.inkLight, bg: C.surface,     label: "Sin publicar"  },
  scheduled:   { color: C.amber,    bg: C.amberLight,  label: "Programado"    },
  failed:      { color: C.red,      bg: C.redLight,    label: "Publicación falló" },
};

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children, accent }: { title: string; children: React.ReactNode; accent?: string }) {
  return (
    <div style={{ marginBottom: S[5] }}>
      <div style={{
        fontFamily:    T.mono, fontSize: 9, fontWeight: T.wt.bold,
        color:         accent ?? C.inkGhost,
        textTransform: "uppercase" as const,
        letterSpacing: "0.07em",
        marginBottom:  S[2],
        paddingBottom: S[2],
        borderBottom:  `1px solid ${C.lineSubtle}`,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

// ── Blocking issue row ────────────────────────────────────────────────────────

function IssueRow({ issue }: { issue: BlockingIssue }) {
  const isCritical = issue.severity === "critical";
  return (
    <div style={{
      display:      "flex", gap: S[2],
      padding:      `${S[2]}px ${S[3]}px`,
      background:   isCritical ? C.redLight   : C.amberLight,
      border:       `1px solid ${isCritical ? C.redBorder : C.amberBorder}`,
      borderRadius: R.md, marginBottom: S[2],
    }}>
      <div style={{
        width: 16, height: 16, borderRadius: "50%",
        background: isCritical ? C.red : C.amber,
        flexShrink: 0, display: "flex", alignItems: "center",
        justifyContent: "center",
        fontFamily: T.mono, fontSize: 8, fontWeight: T.wt.bold, color: C.white,
      }}>
        {isCritical ? "!" : "▲"}
      </div>
      <div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
          color: isCritical ? C.red : C.amber, marginBottom: 2 }}>
          {issue.label}
          {issue.channel && (
            <span style={{ fontWeight: T.wt.normal, marginLeft: S[2], color: isCritical ? C.red : C.amber, opacity: 0.8 }}>
              · {CHANNEL_LABEL[issue.channel] ?? issue.channel}
            </span>
          )}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkMid }}>
          {issue.detail}
        </div>
      </div>
    </div>
  );
}

// ── Warning row ───────────────────────────────────────────────────────────────

function WarningRow({ issue }: { issue: WarningIssue }) {
  return (
    <div style={{
      display: "flex", gap: S[2], alignItems: "flex-start",
      padding: `${S[2]}px ${S[3]}px`,
      background: C.surface, border: `1px solid ${C.line}`,
      borderRadius: R.md, marginBottom: S[2],
    }}>
      <span style={{ color: C.inkFaint, fontFamily: T.mono, fontSize: T.sz.sm, flexShrink: 0 }}>◆</span>
      <div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.inkMid, marginBottom: 2 }}>
          {issue.label}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
          {issue.detail}
        </div>
      </div>
    </div>
  );
}

// ── Signal block ──────────────────────────────────────────────────────────────

function SignalBlock({ signal, agentName }: {
  signal:    { key: string; label: string; detail: string; level: string };
  agentName: string;
}) {
  const isOpportunity = signal.level === "opportunity";
  const isWarning     = signal.level === "warning";
  const color  = isOpportunity ? C.blueDark : isWarning ? C.amber : C.inkLight;
  const bg     = isOpportunity ? C.blueLight : isWarning ? C.amberLight : C.surface;
  const border = isOpportunity ? C.blueBorder : isWarning ? C.amberBorder : C.line;

  return (
    <div style={{
      display: "flex", gap: S[2], alignItems: "flex-start",
      padding: `${S[2]}px ${S[3]}px`,
      background: bg, border: `1px solid ${border}`,
      borderRadius: R.md, marginBottom: S[2],
    }}>
      <div style={{
        width: 6, height: 6, borderRadius: "50%",
        background: color, flexShrink: 0, marginTop: 4,
      }} />
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: 2 }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color }}>
            {signal.label}
          </span>
          <span style={{ fontFamily: T.mono, fontSize: 8, color, opacity: 0.6,
            textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
            {agentName}
          </span>
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkMid }}>
          {signal.detail}
        </div>
      </div>
    </div>
  );
}

// ── Destination matrix row ────────────────────────────────────────────────────

function DestinationRow({ channel, readiness, sync, publication }: {
  channel:     string;
  readiness:   "ready" | "partial" | "blocked" | "none";
  sync:        string;
  publication: string;
}) {
  const rdColor = readiness === "ready" ? C.green : readiness === "partial" ? C.amber : readiness === "blocked" ? C.red : C.inkGhost;
  const rdLabel = readiness === "ready" ? "Listo" : readiness === "partial" ? "Parcial" : readiness === "blocked" ? "Bloqueado" : "—";
  const syncCfg = SYNC_STATUS_CONFIG[sync] ?? SYNC_STATUS_CONFIG.not_configured;
  const pubCfg  = PUB_STATUS_CONFIG[publication] ?? PUB_STATUS_CONFIG.unpublished;

  return (
    <div style={{
      display:       "grid",
      gridTemplateColumns: "80px 1fr 1fr 1fr",
      gap:           S[2], alignItems: "center",
      padding:       `${S[2]}px 0`,
      borderBottom:  `1px solid ${C.lineSubtle}`,
    }}>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink }}>
        {CHANNEL_LABEL[channel] ?? channel}
      </span>
      <span style={{ fontFamily: T.mono, fontSize: 9, color: rdColor, fontWeight: T.wt.semibold }}>
        {rdLabel}
      </span>
      <span style={{
        fontFamily: T.mono, fontSize: 9,
        color: syncCfg.color, background: syncCfg.bg,
        padding: "1px 6px", borderRadius: R.sm,
        display: "inline-block",
      }}>
        {syncCfg.label}
      </span>
      <span style={{
        fontFamily: T.mono, fontSize: 9,
        color: pubCfg.color, background: pubCfg.bg,
        padding: "1px 6px", borderRadius: R.sm,
        display: "inline-block",
      }}>
        {pubCfg.label}
      </span>
    </div>
  );
}

// ── Main drawer ───────────────────────────────────────────────────────────────

const ALL_CHANNELS = ["shopify", "crm", "whatsapp", "catalog", "ads", "landing"] as const;

interface ReviewDetailDrawerProps {
  item:    ReviewQueueItem | null;
  orgSlug: string;
  onClose: () => void;
}

export function ReviewDetailDrawer({ item, orgSlug, onClose }: ReviewDetailDrawerProps) {
  if (!item) return null;

  const pc = PRIORITY_CONFIG[item.priorityLevel];

  const channelReadiness = (ch: string): "ready" | "partial" | "blocked" | "none" => {
    if (item.readyDestinations.includes(ch as never))    return "ready";
    if (item.partialDestinations.includes(ch as never))  return "partial";
    if (item.blockedDestinations.includes(ch as never))  return "blocked";
    return "none";
  };

  const channelSync = (ch: string): string =>
    item.syncSummary.find(s => s.channel === ch)?.status ?? "not_configured";

  const channelPub = (ch: string): string =>
    item.publicationSummary.find(p => p.channel === ch)?.publicationStatus ?? "unpublished";

  return (
    <>
      {/* Backdrop */}
      <div
        className="ag-drawer-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="ag-asset-drawer" role="dialog" aria-label={`Revisión: ${item.productName}`}>

        {/* ── Header ── */}
        <div className="ag-drawer-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: 4 }}>
              {/* Priority badge */}
              <span style={{
                fontFamily: T.mono, fontSize: 8, fontWeight: T.wt.bold,
                padding: "2px 7px", borderRadius: R.pill,
                background: pc.bg, color: pc.text, border: `1px solid ${pc.border}`,
                textTransform: "uppercase" as const, letterSpacing: "0.07em",
              }}>
                {PRIORITY_LABEL[item.priorityLevel]}
              </span>
              {/* Review status */}
              <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
                {REVIEW_STATUS_LABEL[item.reviewStatus]}
              </span>
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
              {item.productName}
            </div>
            {item.sku && (
              <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, marginTop: 2 }}>
                {item.sku}
              </div>
            )}
          </div>

          <button className="ag-drawer-close" onClick={onClose} aria-label="Cerrar revisión">
            ✕
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="ag-drawer-body">

          {/* 1. Operational summary ── */}
          <Section title="Resumen operacional">
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
              gap: S[3], marginBottom: S[3],
            }}>
              {[
                { label: "Preparación", value: `${item.readinessScore}/100`, color: item.readinessScore >= 70 ? C.green : item.readinessScore >= 40 ? C.amber : C.red },
                { label: "Bloqueos",    value: String(item.blockingIssues.length), color: item.blockingIssues.length > 0 ? C.red : C.green },
                { label: "Pendientes",  value: String(item.pendingDestinations.length), color: C.inkMid },
              ].map(kpi => (
                <div key={kpi.label} style={{
                  background: C.white, border: `1px solid ${C.line}`,
                  borderRadius: R.md, padding: `${S[2]}px ${S[3]}px`,
                  boxShadow: E.xs,
                }}>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: kpi.color, lineHeight: 1 }}>
                    {kpi.value}
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, marginTop: 2 }}>
                    {kpi.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Readiness bar */}
            <div style={{ background: C.line, borderRadius: R.pill, height: 6, overflow: "hidden" }}>
              <div style={{
                width: `${item.readinessScore}%`, height: "100%",
                background: item.readinessScore >= 70 ? C.green : item.readinessScore >= 40 ? C.amber : C.red,
                borderRadius: R.pill, transition: "width 0.3s ease",
              }} />
            </div>
          </Section>

          {/* 2. Blocking issues ── */}
          {item.blockingIssues.length > 0 && (
            <Section title={`Problemas bloqueantes (${item.blockingIssues.length})`} accent={C.red}>
              {item.blockingIssues.map(issue => (
                <IssueRow key={issue.code} issue={issue} />
              ))}
            </Section>
          )}

          {/* 3. Warning issues ── */}
          {item.warningIssues.length > 0 && (
            <Section title={`Advertencias (${item.warningIssues.length})`} accent={C.amber}>
              {item.warningIssues.map(issue => (
                <WarningRow key={issue.code} issue={issue} />
              ))}
            </Section>
          )}

          {/* 4. Destination matrix ── */}
          <Section title="Destinos — Readiness · Sync · Publicación">
            <div style={{ marginBottom: S[2] }}>
              {/* Column labels */}
              <div style={{
                display: "grid", gridTemplateColumns: "80px 1fr 1fr 1fr",
                gap: S[2], paddingBottom: S[1], marginBottom: S[1],
              }}>
                {["Canal", "Preparación", "Sincronización", "Publicación"].map(h => (
                  <span key={h} style={{ fontFamily: T.mono, fontSize: 8, color: C.inkGhost,
                    textTransform: "uppercase" as const, letterSpacing: "0.06em", fontWeight: T.wt.bold }}>
                    {h}
                  </span>
                ))}
              </div>
              {ALL_CHANNELS.map(ch => (
                <DestinationRow
                  key={ch}
                  channel={ch}
                  readiness={channelReadiness(ch)}
                  sync={channelSync(ch)}
                  publication={channelPub(ch)}
                />
              ))}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkGhost, marginTop: S[2] }}>
              Sync = sincronización de datos · Publicación = visibilidad al público
            </div>
          </Section>

          {/* 5. Missing assets / variants ── */}
          {(item.missingPrimaryAsset || item.missingVariants || item.missingAssets) && (
            <Section title="Recursos y variantes" accent={C.amber}>
              {item.missingPrimaryAsset && (
                <div style={{
                  display: "flex", alignItems: "center", gap: S[2],
                  padding: `${S[2]}px ${S[3]}px`, background: C.redLight,
                  border: `1px solid ${C.redBorder}`, borderRadius: R.md, marginBottom: S[2],
                }}>
                  <span style={{ fontFamily: T.mono, fontSize: 9, color: C.red, fontWeight: T.wt.bold }}>
                    Sin imagen principal
                  </span>
                  <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkMid }}>
                    — ningún asset marcado como hero
                  </span>
                </div>
              )}
              {item.missingAssets && (
                <div style={{
                  display: "flex", alignItems: "center", gap: S[2],
                  padding: `${S[2]}px ${S[3]}px`, background: C.redLight,
                  border: `1px solid ${C.redBorder}`, borderRadius: R.md, marginBottom: S[2],
                }}>
                  <span style={{ fontFamily: T.mono, fontSize: 9, color: C.red, fontWeight: T.wt.bold }}>
                    Sin assets vinculados
                  </span>
                  <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkMid }}>
                    — el producto no tiene ningún asset
                  </span>
                </div>
              )}
              {item.missingVariants && (
                <div style={{
                  display: "flex", alignItems: "center", gap: S[2],
                  padding: `${S[2]}px ${S[3]}px`, background: C.amberLight,
                  border: `1px solid ${C.amberBorder}`, borderRadius: R.md, marginBottom: S[2],
                }}>
                  <span style={{ fontFamily: T.mono, fontSize: 9, color: C.amber, fontWeight: T.wt.bold }}>
                    Sin variantes de formato
                  </span>
                  <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkMid }}>
                    — Ads y Social requieren formatos 9:16
                  </span>
                </div>
              )}
            </Section>
          )}

          {/* 6. Luca signals ── */}
          {item.lucaSignals.length > 0 && (
            <Section title="Señales Luca — Reutilización e inteligencia visual">
              {item.lucaSignals.map(signal => (
                <SignalBlock key={signal.key} signal={signal} agentName="Luca · IA" />
              ))}
            </Section>
          )}

          {/* 7. Mila signals ── */}
          {item.milaSignals.length > 0 && (
            <Section title="Señales Mila — Ventas y distribución comercial">
              {item.milaSignals.map(signal => (
                <SignalBlock key={signal.key} signal={signal} agentName="Mila · CRM" />
              ))}
            </Section>
          )}

          {/* 8. Stale indicator ── */}
          {item.stale && (
            <Section title="Actividad" accent={C.inkFaint}>
              <div style={{
                display: "flex", alignItems: "center", gap: S[2],
                padding: `${S[2]}px ${S[3]}px`,
                background: C.surface, border: `1px solid ${C.line}`,
                borderRadius: R.md,
              }}>
                <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
                  Sin actividad reciente (+30 días). El producto puede estar desactualizado.
                </span>
              </div>
            </Section>
          )}

          {/* 9. Suggested actions ── */}
          {item.suggestedActions.length > 0 && (
            <Section title="Acciones sugeridas">
              {item.suggestedActions.map((action, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "flex-start", gap: S[2],
                  padding: `${S[2]}px ${S[3]}px`,
                  background: C.blueLight, border: `1px solid ${C.blueBorder}`,
                  borderRadius: R.md, marginBottom: S[2],
                }}>
                  <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.bold,
                    color: C.blueDark, flexShrink: 0 }}>
                    {i + 1}.
                  </span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.blueDark }}>
                    {action}
                  </span>
                </div>
              ))}
            </Section>
          )}

          {/* 10. Bulk action tray — visual architecture, no logic yet ── */}
          <Section title="Acciones operacionales">
            <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" as const }}>
              {[
                { label: "Ir a Biblioteca",    href: `/${orgSlug}/agentik/marketing-studio/biblioteca`, active: true  },
                { label: "Ir a Foto Estudio",  href: `/${orgSlug}/agentik/marketing-studio/foto-estudio/new`, active: true  },
                { label: "Publicar en Shopify", href: "#", active: false },
                { label: "Asignar canales",     href: "#", active: false },
                { label: "Generar variantes",   href: "#", active: false },
              ].map(action => (
                action.active ? (
                  <a
                    key={action.label}
                    href={action.href}
                    style={{
                      fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                      padding: `${S[2]}px ${S[3]}px`, borderRadius: R.md,
                      background: C.blueDark, color: C.white,
                      border: `1px solid ${C.blueDark}`,
                      textDecoration: "none", cursor: "pointer",
                    }}
                  >
                    {action.label}
                  </a>
                ) : (
                  <button
                    key={action.label}
                    disabled
                    style={{
                      fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                      padding: `${S[2]}px ${S[3]}px`, borderRadius: R.md,
                      background: C.surface, color: C.inkGhost,
                      border: `1px solid ${C.line}`,
                      cursor: "not-allowed", opacity: 0.6,
                    }}
                    title="Disponible próximamente"
                  >
                    {action.label}
                  </button>
                )
              ))}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkGhost, marginTop: S[2] }}>
              Publicación directa y asignación de canales disponibles en MS-08+.
            </div>
          </Section>

        </div>
      </div>
    </>
  );
}
