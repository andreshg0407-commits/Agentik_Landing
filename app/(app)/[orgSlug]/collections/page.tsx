/**
 * app/(app)/[orgSlug]/collections/page.tsx
 *
 * Collections Work Queue — Cola de Cobranza.
 *
 * Displays a risk-sorted list of customers that require collection action today.
 * Each row shows overdue amount, DPD, risk tier, and the recommended next action.
 *
 * Desktop-only layout (full-width table). Server component — no client state.
 */

import Link                    from "next/link";
import { requireOrgAccess }    from "@/lib/auth/org-access";
import { getCollectionsQueue } from "@/lib/collections/queue";
import { getCarteraKpis }      from "@/lib/finance/cartera-kpis";
import { C, T, S, R }          from "@/lib/ui/tokens";
import { Panel, PanelHeader, Badge, KpiCard } from "@/components/shell/primitives";
import ActionButton            from "../_action-button";
import { OutcomeForm }         from "@/components/collections/outcome-form";
import RegisterPaymentButton   from "@/components/finance/register-payment-button";
import { FiscalWindowSelector } from "@/components/shell/fiscal-window-selector";
import {
  parseFiscalWindowMode,
  getFiscalWindow,
  CARTERA_WINDOW_MODES,
} from "@/lib/finance/fiscal-window";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCOP(n: number): string {
  if (n >= 1_000_000_000) return "$" + (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000)     return "$" + (n / 1_000_000).toFixed(0) + "M";
  return "$" + new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(n);
}

const TIER_BADGE: Record<string, { label: string; bg: string; color: string; border: string }> = {
  CRITICAL: { label: "CRÍTICO", bg: "#fef2f2", color: "#991b1b", border: "#fca5a5" },
  HIGH:     { label: "ALTO",    bg: "#fffbeb", color: "#92400e", border: "#fde68a" },
  MEDIUM:   { label: "MEDIO",   bg: "#fefce8", color: "#854d0e", border: "#fde047" },
  LOW:      { label: "BAJO",    bg: "#f0fdf4", color: "#14532d", border: "#bbf7d0" },
};

const CHANNEL_ICON: Record<string, string> = {
  whatsapp: "💬",
  call:     "📞",
  email:    "✉️",
  legal:    "⚖️",
};

const PRIORITY_DOT: Record<string, string> = {
  URGENT: C.red,
  HIGH:   C.amber,
  MEDIUM: C.amberMid,
  LOW:    C.inkLight,
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function CollectionsQueuePage({
  params,
  searchParams,
}: {
  params:       Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orgSlug }      = await params;
  const sp               = await searchParams;
  const windowParam      = typeof sp.window === "string" ? sp.window : undefined;
  // Default for collections: current_and_prior — ensures carry-over balances are visible
  const windowMode       = parseFiscalWindowMode(windowParam, "current_year");
  const fiscalWindow     = getFiscalWindow(windowMode);

  const { organization } = await requireOrgAccess(orgSlug);
  const orgId            = organization.id;

  const [queue, kpis] = await Promise.all([
    getCollectionsQueue(orgId, 100, fiscalWindow).catch(() => []),
    getCarteraKpis(orgId, fiscalWindow).catch(() => null),
  ]);

  const urgentCount = queue.filter(r => r.suggestedAction.priority === "URGENT").length;
  const highCount   = queue.filter(r => r.suggestedAction.priority === "HIGH").length;

  return (
    <div style={{ fontFamily: "monospace", maxWidth: 1100 }}>

      {/* ── Breadcrumb ── */}
      <div style={{ fontSize: T.sz.sm, color: C.inkFaint, marginBottom: S[1] + 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        <Link href={`/${orgSlug}/dashboard`} style={{ color: C.inkFaint, textDecoration: "none" }}>
          {organization.name}
        </Link>
        {" "} › Cola de Cobranza
      </div>

      {/* ── Header ── */}
      <div style={{ marginBottom: 24, paddingBottom: 16, borderBottom: `1.5px solid ${C.ink}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: S[3] }}>
          <div>
            <h1 style={{ margin: 0, fontSize: T.sz["3xl"], fontWeight: T.wt.black, color: C.ink, letterSpacing: "-0.02em" }}>
              Cola de Cobranza
            </h1>
            <div style={{ fontSize: T.sz.sm, color: C.inkLight, marginTop: 3 }}>
              {organization.name} · Clientes con cartera vencida ordenados por riesgo · <span style={{ color: "#7c3aed", fontWeight: 700 }}>{fiscalWindow.label}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: S[2], marginLeft: "auto", alignItems: "center" }}>
          {urgentCount > 0 && (
            <Badge variant="danger">{urgentCount} URGENTE{urgentCount > 1 ? "S" : ""}</Badge>
          )}
          {highCount > 0 && (
            <Badge variant="warning">{highCount} ALTO{highCount > 1 ? "S" : ""}</Badge>
          )}
          <Badge variant="neutral">{queue.length} EN COLA</Badge>
          <Link
            href={`/${orgSlug}/collections/performance`}
            style={{
              fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.brand,
              background: "#f5f3ff", border: "1px solid #ddd6fe",
              borderRadius: 4, padding: "3px 10px", textDecoration: "none",
              fontFamily: "monospace",
            }}
          >
            📊 Rendimiento →
          </Link>
          </div>
        </div>

        {/* ── Fiscal window selector ── */}
        <FiscalWindowSelector
          currentMode={windowMode}
          baseHref={`/${orgSlug}/collections`}
          defaultMode="current_year"
          modes={CARTERA_WINDOW_MODES}
        />
      </div>

      {/* ── KPI summary ── */}
      {kpis?.hasData && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: S[3], marginBottom: S[5] }}>
          <KpiCard
            label="Cartera vencida total"
            sublabel={`${kpis.activeDebtors} clientes activos`}
            value={fmtCOP(kpis.overdueReceivable)}
            dotColor={C.red}
            urgent={kpis.overdueRatio > 30}
          />
          <KpiCard
            label="Ratio de mora"
            sublabel="sobre saldo total"
            value={kpis.overdueRatio.toFixed(1) + "%"}
            dotColor={kpis.overdueRatio > 30 ? C.red : C.amber}
            urgent={kpis.overdueRatio > 30}
          />
          <KpiCard
            label="DPD máximo"
            sublabel={kpis.count90Plus > 0 ? `${kpis.count90Plus} clientes +90d` : "sin mora crítica"}
            value={kpis.maxDpd > 0 ? `+${kpis.maxDpd}d` : "—"}
            dotColor={kpis.maxDpd > 90 ? C.red : C.amber}
            urgent={kpis.maxDpd > 90}
          />
          <KpiCard
            label="Mayor deudor"
            sublabel={kpis.topDebtor ? `${kpis.concentrationRisk.toFixed(0)}% del total` : "—"}
            value={kpis.topDebtor ? fmtCOP(kpis.topDebtor.overdueReceivable) : "—"}
            dotColor={kpis.concentrationRisk > 20 ? C.amber : C.inkLight}
          />
        </div>
      )}

      {/* ── Empty state ── */}
      {queue.length === 0 && (
        <Panel>
          <div style={{ padding: `${S[6]}px ${S[5]}px`, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: S[2] }}>✓</div>
            <div style={{ fontWeight: T.wt.bold, color: C.green, fontSize: T.sz.lg }}>
              Sin cartera vencida
            </div>
            <div style={{ color: C.inkFaint, fontSize: T.sz.sm, marginTop: S[1] }}>
              No hay clientes con saldo vencido actualmente. Vuelve más tarde.
            </div>
          </div>
        </Panel>
      )}

      {/* ── Queue table ── */}
      {queue.length > 0 && (
        <Panel>
          <PanelHeader
            title="💰 Cola de cobranza — acción por cliente"
            badge={<Badge variant={urgentCount > 0 ? "danger" : "warning"}>
              {urgentCount > 0 ? `${urgentCount} urgentes` : `${queue.length} en cola`}
            </Badge>}
            cta={{ label: "Ver cartera →", href: `/${orgSlug}/customer-360?hasOverdue=true` }}
          />
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "monospace", fontSize: T.sz.sm }}>
              <thead>
                <tr style={{ background: C.surfaceAlt }}>
                  {["#", "Cliente", "Vencido", "Total", "DPD", "Riesgo", "Score", "Acción sugerida", "Canal", "Acción"].map((h, i) => (
                    <th key={h} style={{
                      padding: `${S[2]}px ${S[3]}px`,
                      textAlign: i >= 2 && i <= 6 ? "right" : "left",
                      fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.inkLight,
                      textTransform: "uppercase", letterSpacing: "0.05em",
                      borderBottom: `1px solid ${C.lineSubtle}`,
                      whiteSpace: "nowrap",
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queue.map((row, i) => {
                  const tier    = TIER_BADGE[row.riskTier] ?? TIER_BADGE.LOW;
                  const action  = row.suggestedAction;
                  const dotColor = PRIORITY_DOT[action.priority] ?? C.inkLight;

                  return (
                    <tr
                      key={row.slug}
                      style={{
                        background:  i % 2 === 0 ? C.white : C.surface,
                        borderLeft:  action.priority === "URGENT"
                          ? `3px solid ${C.red}`
                          : action.priority === "HIGH"
                          ? `3px solid ${C.amber}`
                          : "3px solid transparent",
                      }}
                    >
                      {/* # */}
                      <td style={{ padding: `${S[2]}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, color: C.inkFaint, fontSize: T.sz.xs, width: 32 }}>
                        {i + 1}
                      </td>

                      {/* Cliente */}
                      <td style={{ padding: `${S[2]}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                          <Link href={`/${orgSlug}/customer-360?slug=${row.slug}`} style={{ textDecoration: "none" }}>
                            <span style={{ fontWeight: T.wt.semibold, color: C.brand }}>
                              {row.name.length > 28 ? row.name.slice(0, 28) + "…" : row.name}
                            </span>
                          </Link>
                          {row.isCarryOver && (
                            <span style={{
                              fontSize: 9, fontWeight: 700,
                              color: "#92400e", background: "#fffbeb",
                              border: "1px solid #fde68a",
                              borderRadius: 3, padding: "1px 5px",
                              whiteSpace: "nowrap",
                            }}>
                              carry-over
                            </span>
                          )}
                        </div>
                        {row.sellerName && (
                          <div style={{ fontSize: T.sz.xs, color: C.inkFaint }}>
                            {row.sellerName}
                          </div>
                        )}
                      </td>

                      {/* Vencido */}
                      <td style={{ padding: `${S[2]}px ${S[3]}px`, textAlign: "right", borderBottom: `1px solid ${C.lineSubtle}` }}>
                        <span style={{ fontWeight: T.wt.bold, color: C.red }}>
                          {fmtCOP(row.overdueReceivable)}
                        </span>
                      </td>

                      {/* Total */}
                      <td style={{ padding: `${S[2]}px ${S[3]}px`, textAlign: "right", borderBottom: `1px solid ${C.lineSubtle}`, color: C.inkMid }}>
                        {fmtCOP(row.totalReceivable)}
                      </td>

                      {/* DPD */}
                      <td style={{ padding: `${S[2]}px ${S[3]}px`, textAlign: "right", borderBottom: `1px solid ${C.lineSubtle}` }}>
                        <span style={{ fontWeight: T.wt.bold, color: dotColor }}>
                          {row.maxDpd > 0 ? `+${row.maxDpd}d` : "Al día"}
                        </span>
                      </td>

                      {/* Riesgo tier */}
                      <td style={{ padding: `${S[2]}px ${S[3]}px`, textAlign: "right", borderBottom: `1px solid ${C.lineSubtle}` }}>
                        <span style={{
                          background: tier.bg, color: tier.color,
                          border: `1px solid ${tier.border}`,
                          borderRadius: R.sm, padding: "1px 6px",
                          fontSize: T.sz.xs, fontWeight: T.wt.bold,
                        }}>
                          {tier.label}
                        </span>
                      </td>

                      {/* Score */}
                      <td style={{ padding: `${S[2]}px ${S[3]}px`, textAlign: "right", borderBottom: `1px solid ${C.lineSubtle}` }}>
                        <span style={{ color: row.riskScore != null && row.riskScore >= 70 ? C.red : C.inkMid }}>
                          {row.riskScore != null ? row.riskScore : "—"}
                        </span>
                      </td>

                      {/* Acción sugerida */}
                      <td style={{ padding: `${S[2]}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                          <span style={{ fontSize: T.sz.xs, color: C.inkMid }}>
                            {action.label}
                          </span>
                        </div>
                        <div style={{ fontSize: T.sz.xs, color: C.inkFaint, marginTop: 2, maxWidth: 200, lineHeight: 1.3 }}>
                          {action.rationale}
                        </div>
                      </td>

                      {/* Canal */}
                      <td style={{ padding: `${S[2]}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, textAlign: "center" }}>
                        <span title={action.channel} style={{ fontSize: 16 }}>
                          {CHANNEL_ICON[action.channel] ?? "—"}
                        </span>
                      </td>

                      {/* Action button */}
                      <td style={{ padding: `${S[1]}px ${S[2]}px`, borderBottom: `1px solid ${C.lineSubtle}` }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                          <RegisterPaymentButton
                            orgSlug={orgSlug}
                            customerNit={row.nit ?? undefined}
                            customerName={row.name}
                          />
                          <OutcomeForm
                            orgSlug={orgSlug}
                            customerSlug={row.slug}
                            customerName={row.name}
                            currentDpd={row.maxDpd}
                            overdueAmount={row.overdueReceivable}
                          />
                          <ActionButton
                            orgSlug={orgSlug}
                            label="Crear tarea"
                            variant={action.priority === "URGENT" ? "danger" : "outline"}
                            size="sm"
                            prefill={{
                              actionType:   "CREAR_ACCION_COBRANZA",
                              targetType:   "customer",
                              targetId:     row.slug,
                              targetLabel:  row.name,
                              sourceModule: "collections_queue",
                              title:        `Cobranza — ${row.name}`,
                              description:  `${action.label}\n\n${action.scriptHint}\n\nCartera vencida: ${fmtCOP(row.overdueReceivable)} · DPD: +${row.maxDpd}d`,
                              priority:     action.priority as "URGENT" | "HIGH" | "MEDIUM" | "LOW",
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* ── Footer ── */}
      <div style={{ fontSize: T.sz.xs, color: C.inkGhost, textAlign: "right", paddingTop: S[2], paddingBottom: S[4] }}>
        Cola de Cobranza · {organization.name} · {queue.length} clientes con saldo vencido
      </div>
    </div>
  );
}
