/**
 * /finanzas/torre-control/cobros-hoy
 *
 * Operational detail workspace — Cobros recibidos hoy.
 * Shows CollectionRecord rows for the latest SAG operational day.
 * Navigated to from the Torre de Control executive dashboard card.
 *
 * State layer (UX-SYSTEM-03):
 *   - ?q=       initial search query (seeded into table client)
 *   - ?f=       initial fuente filter
 *   - ?returnTo= contextual back navigation
 *   - scroll    restored via WorkspaceScrollRestore
 */

import { requireTenant }                 from "@/lib/tenant";
import { getTodayCollectionDetail }      from "@/lib/finance/cobros-detail";
import { prisma }                        from "@/lib/prisma";
import { C, T, S, R, E }                from "@/lib/ui/tokens";
import { OperationalWorkspaceHeader }    from "@/components/workspace/operational-workspace-header";
import { SummaryMetricRow }              from "@/components/workspace/summary-metric-row";
import { WorkspaceActions }              from "@/components/workspace/workspace-actions";
import { RelatedWorkspaces }             from "@/components/workspace/related-workspaces";
import { WorkspaceScrollRestore }        from "@/components/workspace/workspace-scroll-restore";
import { CobrosHoyTableClient }          from "./table-client";
import type { CollectionRowSerial }      from "./table-client";
import { getInitialSearch, getInitialFilter, getReturnTo, getReturnLabel } from "@/lib/workspace/workspace-params";

export default async function CobrosHoyPage({
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

  // Determine the latest operational day with CollectionRecord data
  const latestRow = await (prisma as any).collectionRecord.findFirst({
    where:   { organizationId: ctx.orgId },
    orderBy: { collectionDate: "desc" },
    select:  { collectionDate: true },
  }).catch(() => null) as { collectionDate: Date } | null;

  let records: Awaited<ReturnType<typeof getTodayCollectionDetail>> = [];
  let opDayLabel = "—";

  if (latestRow?.collectionDate) {
    const d = latestRow.collectionDate;
    const opDayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const opDayEnd   = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
    records = await getTodayCollectionDetail(ctx.orgId, opDayStart, opDayEnd, 100).catch(() => []);
    opDayLabel = opDayStart.toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
  }

  const total = records.reduce((s, r) => s + r.amount, 0);
  const fmtCOP = (n: number) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

  // Serialize dates for client component
  const serialized: CollectionRowSerial[] = records.map(r => ({
    id:              r.id,
    comprobanteCode: r.comprobanteCode,
    customerName:    r.customerName ?? null,
    documentNumber:  r.documentNumber ?? null,
    collectionDate:  r.collectionDate.toISOString(),
    amount:          r.amount,
  }));

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <WorkspaceScrollRestore />

      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Finanzas" },
          { label: "Torre de Control", href: `/${orgSlug}/executive` },
          { label: "Cobros de hoy" },
        ]}
        title="Cobros recibidos"
        subtitle={`Día operativo SAG · ${opDayLabel} · ${records.length} registro${records.length !== 1 ? "s" : ""} · CollectionRecord`}
        status={records.length > 0 ? "ok" : "neutral"}
        statusLabel={records.length > 0 ? "Datos disponibles" : "Sin datos"}
        contextualBackHref={returnTo ?? undefined}
        contextualBackLabel={returnLabel ?? undefined}
      />

      <SummaryMetricRow metrics={[
        { label: "Total cobrado",  value: total > 0 ? fmtCOP(total) : "—" },
        { label: "Recibos",        value: records.length },
        { label: "Conciliación",   value: "Pendiente", accent: C.amber },
        { label: "Día operativo",  value: opDayLabel, note: "Último día SAG con datos" },
      ]} />

      <WorkspaceActions actions={[
        { label: "Gestionar conciliación →", href: `/${orgSlug}/reconciliation`,                                                                                    variant: "primary"   },
        { label: "Cobros identificados",     href: `/${orgSlug}/finanzas/torre-control/cobros-identificados?returnTo=/${orgSlug}/finanzas/torre-control/cobros-hoy`, variant: "secondary" },
        { label: "Torre de Control",         href: `/${orgSlug}/executive`,                                                                                         variant: "ghost"     },
      ]} />

      <CobrosHoyTableClient
        records={serialized}
        initialSearch={initialSearch}
        initialFuente={initialFuente}
        fmtCOP={fmtCOP}
      />

      <RelatedWorkspaces
        title="Workspaces relacionados"
        items={[
          { label: "Cobros identificados",     description: "Composición R1/R2/Almacenes/Retail",  href: `/${orgSlug}/finanzas/torre-control/cobros-identificados`,  accent: C.blue     },
          { label: "Consignaciones",           description: "Depósitos sin identificar",           href: `/${orgSlug}/finanzas/torre-control/consignaciones`,          accent: C.amber    },
          { label: "Cuentas por pagar",        description: "Obligaciones operativas C1/G1/C2",    href: `/${orgSlug}/finanzas/torre-control/cuentas-por-pagar`,       accent: C.blueDark },
          { label: "Conciliación inteligente", description: "Gestionar cobros vs facturas",        href: `/${orgSlug}/reconciliation`,                                 accent: C.brand    },
          { label: "Cartera",                  description: "Cartera vencida y aging",             href: `/${orgSlug}/collections`,                                    accent: C.brand    },
        ]}
      />

    </div>
  );
}
