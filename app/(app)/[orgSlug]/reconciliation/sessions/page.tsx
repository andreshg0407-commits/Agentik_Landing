/**
 * Sessions index page — server component.
 *
 * AGENTIK-RECON-SESSIONS-02
 * Lists all reconciliation sessions for the org, sorted by most recent.
 * Each row links to the session detail workspace.
 */

import Link                    from "next/link";
import { requireOrgAccess }    from "@/lib/auth/org-access";
import { getSessionsIndex }    from "@/lib/reconciliation/session-detail-service";
import { C, T, S, R, E, panel, panelHeader } from "@/lib/ui/tokens";
import type { ReconciliationSessionStatus } from "@/lib/reconciliation/session-types";

// ── Status badge config (server-safe — no CSS classes, inline styles only) ────

const STATUS_BADGE: Record<ReconciliationSessionStatus, { bg: string; color: string; border: string; label: string }> = {
  draft:                { bg: C.surface,    color: C.inkLight,  border: C.line,        label: "Borrador"    },
  ready:                { bg: C.blueLight,  color: C.blueDark,  border: C.blueBorder,  label: "Listo"       },
  running:              { bg: C.blueLight,  color: C.blueDark,  border: C.blueBorder,  label: "Ejecutando"  },
  needs_review:         { bg: C.amberLight, color: C.amberDark, border: C.amberBorder, label: "En Revisión" },
  partially_reconciled: { bg: C.amberLight, color: C.amberDark, border: C.amberBorder, label: "Parcial"     },
  reconciled:           { bg: C.greenLight, color: C.greenDark, border: C.greenBorder, label: "Conciliado"  },
  closed:               { bg: C.surface,    color: C.inkLight,  border: C.line,        label: "Cerrado"     },
  failed:               { bg: C.redLight,   color: C.redDark,   border: C.redBorder,   label: "Error"       },
  cancelled:            { bg: C.surface,    color: C.inkFaint,  border: C.line,        label: "Cancelado"   },
};

const MONTH_NAMES = ["","Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
function fmtPeriodo(p: string | null): string {
  if (!p) return "—";
  const m = Number(p.slice(4));
  return `${MONTH_NAMES[m] ?? p.slice(4)} ${p.slice(0, 4)}`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtPct(n: number): string { return `${n.toFixed(1)}%`; }

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function SessionsIndexPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }      = await params;
  const { organization } = await requireOrgAccess(orgSlug);

  const sessions = await getSessionsIndex(organization.id, 50);

  const cols = "140px 1fr 100px 80px 80px 110px 110px";

  return (
    <div style={{ minHeight: "100vh", background: C.surface, fontFamily: T.sans }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: `${S[4]}px ${S[4]}px ${S[10]}px` }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: S[4] }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: S[1], marginBottom: S[1] }}>
              <Link href={`/${orgSlug}/reconciliation`} style={{ fontSize: T.sz.xs, color: C.blue, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: T.sz.base }}>←</span>
                Conciliación
              </Link>
              <span style={{ color: C.inkGhost }}>/</span>
              <span style={{ fontSize: T.sz.xs, color: C.inkLight }}>Sesiones</span>
            </div>
            <h1 style={{ margin: 0, fontSize: T.sz["2xl"], fontWeight: T.wt.semibold, color: C.ink }}>
              Sesiones de Conciliación
            </h1>
            <p style={{ margin: `${S[1]}px 0 0`, fontSize: T.sz.base, color: C.inkLight }}>
              {sessions.length} sesion{sessions.length !== 1 ? "es" : ""} · ordenadas por más reciente
            </p>
          </div>
        </div>

        {/* Sessions table */}
        {sessions.length === 0 ? (
          <div style={{ ...panel, padding: `${S[10]}px ${S[5]}px`, textAlign: "center" as const }}>
            <div style={{ fontSize: T.sz.lg, color: C.inkLight, marginBottom: S[1] }}>
              Sin sesiones registradas
            </div>
            <div style={{ fontSize: T.sz.base, color: C.inkFaint }}>
              Las sesiones se crean al ejecutar una conciliación desde el módulo principal.
            </div>
          </div>
        ) : (
          <div style={{ ...panel }}>
            {/* Table header */}
            <div style={{
              ...panelHeader,
              display:             "grid",
              gridTemplateColumns: cols,
              gap:                 0,
              padding:             0,
            }}>
              {["Código", "Título", "Estado", "Período", "Runs", "Actualizado", "Match"].map(h => (
                <div key={h} style={{
                  padding:       `${S[2]}px ${S[3]}px`,
                  fontSize:      T.sz.xs,
                  fontWeight:    T.wt.semibold,
                  color:         C.inkLight,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase" as const,
                  fontFamily:    T.sans,
                }}>
                  {h}
                </div>
              ))}
            </div>

            {/* Rows */}
            {sessions.map((s, i) => {
              const badge   = STATUS_BADGE[s.status];
              const isLast  = i === sessions.length - 1;
              return (
                <Link key={s.id} href={`/${orgSlug}/reconciliation/sessions/${s.id}`} style={{ textDecoration: "none" }}>
                  <div style={{
                    display:             "grid",
                    gridTemplateColumns: cols,
                    gap:                 0,
                    borderBottom:        isLast ? "none" : `1px solid ${C.lineSubtle}`,
                    cursor:              "pointer",
                    transition:          "background 120ms",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = C.surfaceAlt; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = ""; }}>

                    {/* Code */}
                    <div style={{ padding: `${S[2]}px ${S[3]}px`, display: "flex", alignItems: "center" }}>
                      <span style={{
                        fontSize:     T.sz.xs,
                        fontFamily:   T.mono,
                        fontWeight:   T.wt.semibold,
                        color:        C.blueDark,
                        background:   C.blueLight,
                        border:       `1px solid ${C.blueBorder}`,
                        borderRadius: R.sm,
                        padding:      "2px 6px",
                      }}>
                        {s.sessionCode}
                      </span>
                    </div>

                    {/* Title */}
                    <div style={{ padding: `${S[2]}px ${S[3]}px`, display: "flex", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: T.sz.base, fontWeight: T.wt.medium, color: C.ink }}>
                          {s.title}
                        </div>
                        <div style={{ fontSize: T.sz.xs, color: C.inkLight, fontFamily: T.mono, marginTop: 1 }}>
                          {s.sourceALabel} ↔ {s.sourceBLabel}
                        </div>
                      </div>
                    </div>

                    {/* Status */}
                    <div style={{ padding: `${S[2]}px ${S[3]}px`, display: "flex", alignItems: "center" }}>
                      <span style={{
                        fontSize:     T.sz.xs,
                        fontFamily:   T.sans,
                        fontWeight:   T.wt.medium,
                        background:   badge.bg,
                        color:        badge.color,
                        border:       `1px solid ${badge.border}`,
                        borderRadius: R.pill,
                        padding:      "2px 8px",
                        whiteSpace:   "nowrap" as const,
                      }}>
                        {badge.label}
                      </span>
                    </div>

                    {/* Period */}
                    <div style={{ padding: `${S[2]}px ${S[3]}px`, display: "flex", alignItems: "center", fontFamily: T.mono, fontSize: T.sz.base, color: C.inkMid, fontVariantNumeric: "tabular-nums" }}>
                      {fmtPeriodo(s.period)}
                    </div>

                    {/* Run count */}
                    <div style={{ padding: `${S[2]}px ${S[3]}px`, display: "flex", alignItems: "center", fontFamily: T.mono, fontSize: T.sz.base, color: C.inkMid, fontVariantNumeric: "tabular-nums" }}>
                      {s.runCount}
                    </div>

                    {/* Updated */}
                    <div style={{ padding: `${S[2]}px ${S[3]}px`, display: "flex", alignItems: "center", fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, fontVariantNumeric: "tabular-nums" }}>
                      {fmtDate(s.updatedAt)}
                    </div>

                    {/* Match rate */}
                    <div style={{ padding: `${S[2]}px ${S[3]}px`, display: "flex", alignItems: "center" }}>
                      {s.summaryJson ? (
                        <span style={{
                          fontSize:           T.sz.xs,
                          fontFamily:         T.mono,
                          fontVariantNumeric: "tabular-nums",
                          fontWeight:         T.wt.semibold,
                          color:              s.summaryJson.matchRate >= 95 ? C.greenDark : s.summaryJson.matchRate >= 80 ? C.amberDark : C.redDark,
                        }}>
                          {fmtPct(s.summaryJson.matchRate)}
                        </span>
                      ) : (
                        <span style={{ fontSize: T.sz.xs, color: C.inkFaint }}>—</span>
                      )}
                    </div>

                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
