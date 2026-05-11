/**
 * /finanzas/torre-control/cobros-identificados
 *
 * Operational detail workspace — Cobros identificados (composición).
 * Shows the breakdown of identified collections by SAG source group.
 * Navigated to from the Torre de Control Cartera y Riesgo section.
 */

import { requireTenant }      from "@/lib/tenant";
import { getCobrosBreakdown } from "@/lib/finance/cobros-breakdown";
import { C, T, S, R, E }     from "@/lib/ui/tokens";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { SummaryMetricRow }           from "@/components/workspace/summary-metric-row";
import { WorkspaceActions }           from "@/components/workspace/workspace-actions";
import { RelatedWorkspaces }          from "@/components/workspace/related-workspaces";
import { WorkspaceScrollRestore }     from "@/components/workspace/workspace-scroll-restore";
import { getReturnTo, getReturnLabel } from "@/lib/workspace/workspace-params";

export default async function CobrosIdentificadosPage({
  params,
  searchParams,
}: {
  params:       Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ orgSlug }, sp] = await Promise.all([params, searchParams]);
  const ctx = await requireTenant(orgSlug);

  const returnTo    = getReturnTo(sp);
  const returnLabel = getReturnLabel(returnTo);

  // No window argument → full history (window is optional in getCobrosBreakdown)
  const bd = await getCobrosBreakdown(ctx.orgId).catch(() => null);

  const fmtCOP = (n: number) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

  type GroupRow = {
    code:   string;
    label:  string;
    amount: number;
    count:  number;
    accent: string;
    note?:  string;
  };

  const groups: GroupRow[] = bd ? [
    {
      code:   "R1",
      label:  "Cobros Empresa F1",
      amount: bd.empresa.r1.amount,
      count:  bd.empresa.r1.count,
      accent: "#0369a1",
      note:   "Pagos facturación oficial",
    },
    {
      code:   "R2",
      label:  "Cobros Empresa F2",
      amount: bd.empresa.r2.amount,
      count:  bd.empresa.r2.count,
      accent: "#0891b2",
      note:   "Remisiones y despachos directos",
    },
    {
      code:   "RS/RC/RG/RA",
      label:  "Recaudos POS Almacenes",
      amount: bd.almacenes.amount,
      count:  bd.almacenes.count,
      accent: "#7c3aed",
      note:   "Caja directa tiendas propias",
    },
    {
      code:   "AN",
      label:  "Retail Financiero",
      amount: bd.retailFinanciero.amount,
      count:  bd.retailFinanciero.count,
      accent: "#059669",
      note:   "Anticipos Sistecredit",
    },
  ] : [];

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <WorkspaceScrollRestore />

      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Finanzas" },
          { label: "Torre de Control", href: `/${orgSlug}/executive` },
          { label: "Cobros identificados" },
        ]}
        title="Cobros identificados"
        subtitle="Composición por grupo de fuente SAG · historia completa"
        status={bd && bd.totalCobros > 0 ? "ok" : "neutral"}
        statusLabel={bd && bd.totalCobros > 0 ? `${bd.totalCobrosCount} recibos` : "Sin datos"}
        contextualBackHref={returnTo ?? undefined}
        contextualBackLabel={returnLabel ?? undefined}
      />

      {bd && (
        <SummaryMetricRow metrics={[
          { label: "Total cobros",             value: bd.totalCobros > 0 ? fmtCOP(bd.totalCobros) : "—" },
          { label: "Recibos",                  value: bd.totalCobrosCount },
          { label: "Empresa F1+F2",            value: bd.empresa.total > 0 ? fmtCOP(bd.empresa.total) : "—", accent: C.blue },
          {
            label:  "Consignaciones pendientes",
            value:  bd.consignacionesPendientes.amount > 0 ? fmtCOP(bd.consignacionesPendientes.amount) : "—",
            accent: bd.consignacionesPendientes.amount > 0 ? C.amber : C.inkLight,
            note:   bd.consignacionesPendientes.count > 0 ? `${bd.consignacionesPendientes.count} docs` : undefined,
          },
        ]} />
      )}

      <WorkspaceActions actions={[
        { label: "Gestionar conciliación →", href: `/${orgSlug}/reconciliation`,                                    variant: "primary"   },
        { label: "Ver consignaciones",       href: `/${orgSlug}/finanzas/torre-control/consignaciones?returnTo=/${orgSlug}/finanzas/torre-control/cobros-identificados`, variant: "secondary" },
        { label: "Ver cartera",              href: `/${orgSlug}/collections`,                                       variant: "secondary" },
        { label: "Torre de Control",         href: `/${orgSlug}/executive`,                                         variant: "ghost"     },
      ]} />

      {/* ── Group cards ───────────────────────────────────────────────────── */}
      {!bd ? (
        <div style={{
          padding:      S[10],
          textAlign:    "center",
          color:        C.inkLight,
          fontFamily:   T.mono,
          fontSize:     T.sz.sm,
          border:       `1px solid ${C.line}`,
          borderRadius: R.xl,
        }}>
          Sin datos de cobros disponibles.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
          {groups.map(g => (
            <div key={g.code} style={{
              border:         `1px solid ${C.line}`,
              borderLeft:     `4px solid ${g.accent}`,
              borderRadius:   R.xl,
              padding:        `${S[3]}px ${S[4]}px`,
              background:     C.white,
              boxShadow:      E.xs,
              display:        "flex",
              alignItems:     "center",
              justifyContent: "space-between",
            }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: 2 }}>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: g.accent }}>
                    {g.code}
                  </span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
                    {g.label}
                  </span>
                </div>
                {g.note && (
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                    {g.note}
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: g.amount > 0 ? C.ink : C.inkGhost }}>
                  {g.amount > 0 ? fmtCOP(g.amount) : "—"}
                </div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                  {g.count} recibo{g.count !== 1 ? "s" : ""}
                </div>
              </div>
            </div>
          ))}

          {/* Consignaciones notice */}
          {bd.consignacionesPendientes.count > 0 && (
            <div style={{
              border:         `1px solid ${C.amberBorder}`,
              borderLeft:     `4px solid ${C.amber}`,
              borderRadius:   R.xl,
              padding:        `${S[3]}px ${S[4]}px`,
              background:     C.amberLight,
              boxShadow:      E.xs,
              display:        "flex",
              alignItems:     "center",
              justifyContent: "space-between",
            }}>
              <div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.amberDark, marginBottom: 2 }}>
                  CP / B1 / B2 / H1 / H2 — Consignaciones sin identificar
                </div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amberDark }}>
                  No contabilizadas como cobros · requieren identificación y conciliación
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.amber }}>
                  {bd.consignacionesPendientes.amount > 0
                    ? fmtCOP(bd.consignacionesPendientes.amount)
                    : `${bd.consignacionesPendientes.count} docs`}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <RelatedWorkspaces
        title="Workspaces relacionados"
        items={[
          { label: "Cobros de hoy",            description: "Recibos del día operativo",          href: `/${orgSlug}/finanzas/torre-control/cobros-hoy`,           accent: C.green    },
          { label: "Consignaciones",           description: "Depósitos sin identificar",          href: `/${orgSlug}/finanzas/torre-control/consignaciones`,        accent: C.amber    },
          { label: "Cuentas por pagar",        description: "Obligaciones operativas C1/G1/C2",  href: `/${orgSlug}/finanzas/torre-control/cuentas-por-pagar`,     accent: C.blueDark },
          { label: "Conciliación inteligente", description: "Gestionar cobros vs facturas",       href: `/${orgSlug}/reconciliation`,                               accent: C.brand    },
          { label: "Cartera",                  description: "Cartera vencida y aging",            href: `/${orgSlug}/collections`,                                  accent: "#7c3aed"  },
        ]}
      />

    </div>
  );
}
