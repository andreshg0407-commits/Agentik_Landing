/**
 * /finanzas/torre-control/consignaciones
 *
 * Operational detail workspace — Consignaciones pendientes.
 * Shows pending deposit SaleRecord rows (B1/B2/H1/H2/CP) awaiting identification.
 * Navigated to from the Torre de Control Cartera y Riesgo section.
 *
 * State layer (UX-SYSTEM-03):
 *   - ?q=       initial search query (seeded into table client)
 *   - ?f=       initial fuente filter (B1/B2/H1/H2/CP)
 *   - ?returnTo= contextual back navigation
 *   - scroll    restored via WorkspaceScrollRestore
 */

import { requireTenant }              from "@/lib/tenant";
import { getPendingDepositDetail }    from "@/lib/finance/cobros-detail";
import { C }                          from "@/lib/ui/tokens";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { SummaryMetricRow }           from "@/components/workspace/summary-metric-row";
import { WorkspaceActions }           from "@/components/workspace/workspace-actions";
import { RelatedWorkspaces }          from "@/components/workspace/related-workspaces";
import { WorkspaceScrollRestore }     from "@/components/workspace/workspace-scroll-restore";
import { ConsignacionesTableClient }  from "./table-client";
import type { DepositRowSerial }      from "./table-client";
import { getInitialSearch, getInitialFilter, getReturnTo, getReturnLabel } from "@/lib/workspace/workspace-params";

export default async function ConsignacionesPage({
  params,
  searchParams,
}: {
  params:       Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ orgSlug }, sp] = await Promise.all([params, searchParams]);
  const ctx = await requireTenant(orgSlug);

  const initialSearch = getInitialSearch(sp);
  const initialFuente = getInitialFilter(sp);
  const returnTo      = getReturnTo(sp);
  const returnLabel   = getReturnLabel(returnTo);

  const records = await getPendingDepositDetail(ctx.orgId, 100).catch(() => []);

  const total = records.reduce((s, r) => s + r.amount, 0);
  const fmtCOP = (n: number) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

  const hasPending = records.length > 0;

  // Serialize dates for client component
  const serialized: DepositRowSerial[] = records.map(r => ({
    id:              r.id,
    comprobanteCode: r.comprobanteCode,
    customerName:    r.customerName ?? null,
    comprobante:     r.comprobante ?? null,
    saleDate:        r.saleDate.toISOString(),
    amount:          r.amount,
  }));

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <WorkspaceScrollRestore />

      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Finanzas" },
          { label: "Torre de Control", href: `/${orgSlug}/executive` },
          { label: "Consignaciones pendientes" },
        ]}
        title="Consignaciones pendientes"
        subtitle="Depósitos sin identificar · fuentes B1/B2/H1/H2/CP · bloquean flujo de caja"
        status={hasPending ? "warning" : "ok"}
        statusLabel={hasPending ? `${records.length} sin identificar` : "Sin pendientes"}
        contextualBackHref={returnTo ?? undefined}
        contextualBackLabel={returnLabel ?? undefined}
      />

      <SummaryMetricRow
        variant={hasPending ? "warning" : "normal"}
        metrics={[
          { label: "Monto pendiente", value: total > 0 ? fmtCOP(total) : "—",                                         accent: total > 0 ? C.amber : C.inkLight },
          { label: "Consignaciones",  value: records.length },
          { label: "Estado",          value: hasPending ? "Requieren identificación" : "Sin pendientes ✓",            accent: hasPending ? C.amber : C.green   },
        ]}
      />

      <WorkspaceActions actions={[
        { label: "Ver conciliación →",    href: `/${orgSlug}/reconciliation`,                                                                                                   variant: "primary"   },
        { label: "Cobros identificados",  href: `/${orgSlug}/finanzas/torre-control/cobros-identificados?returnTo=/${orgSlug}/finanzas/torre-control/consignaciones`,             variant: "secondary" },
        { label: "Torre de Control",      href: `/${orgSlug}/executive`,                                                                                                        variant: "ghost"     },
      ]} />

      <ConsignacionesTableClient
        records={serialized}
        initialSearch={initialSearch}
        initialFuente={initialFuente}
        fmtCOP={fmtCOP}
      />

      <RelatedWorkspaces
        title="Workspaces relacionados"
        items={[
          { label: "Cobros de hoy",            description: "Recibos del día operativo",           href: `/${orgSlug}/finanzas/torre-control/cobros-hoy`,           accent: C.green    },
          { label: "Cobros identificados",     description: "Composición R1/R2/Almacenes/Retail",  href: `/${orgSlug}/finanzas/torre-control/cobros-identificados`,  accent: C.blue     },
          { label: "Cuentas por pagar",        description: "Obligaciones operativas C1/G1/C2",    href: `/${orgSlug}/finanzas/torre-control/cuentas-por-pagar`,     accent: C.blueDark },
          { label: "Conciliación inteligente", description: "Gestionar cobros vs facturas",        href: `/${orgSlug}/reconciliation`,                               accent: C.brand    },
        ]}
      />

    </div>
  );
}
