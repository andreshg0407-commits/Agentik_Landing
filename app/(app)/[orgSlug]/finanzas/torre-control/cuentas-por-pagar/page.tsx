/**
 * /finanzas/torre-control/cuentas-por-pagar
 *
 * Operational detail workspace — Cuentas por pagar.
 * Shows AP obligation documents (C1/G1/C2) from SaleRecord.
 * Navigated to from the Torre de Control Tesorería Operativa section.
 *
 * Data limitation: SAG SOAP does not populate `amount` for AP codes.
 * amounts show as 0; only document counts and supplier identity are reliable.
 *
 * State layer (UX-SYSTEM-03):
 *   - ?q=       initial search query (seeded into table client)
 *   - ?f=       initial tipo filter (C1/G1/C2)
 *   - ?returnTo= contextual back navigation
 *   - scroll    restored via WorkspaceScrollRestore
 */

import { requireTenant }                         from "@/lib/tenant";
import { getApDocumentDetail, getOldestApRecord } from "@/lib/finance/ap-kpis";
import { C, T, S, R }                            from "@/lib/ui/tokens";
import { OperationalWorkspaceHeader }            from "@/components/workspace/operational-workspace-header";
import { SummaryMetricRow }                      from "@/components/workspace/summary-metric-row";
import { WorkspaceActions }                      from "@/components/workspace/workspace-actions";
import { RelatedWorkspaces }                     from "@/components/workspace/related-workspaces";
import { WorkspaceScrollRestore }                from "@/components/workspace/workspace-scroll-restore";
import { CuentasPorPagarTableClient }            from "./table-client";
import type { ApRowSerial }                      from "./table-client";
import { getInitialSearch, getInitialFilter, getReturnTo, getReturnLabel } from "@/lib/workspace/workspace-params";

export default async function CuentasPorPagarPage({
  params,
  searchParams,
}: {
  params:       Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ orgSlug }, sp] = await Promise.all([params, searchParams]);
  const ctx = await requireTenant(orgSlug);

  const initialSearch = getInitialSearch(sp);
  const initialTipo   = getInitialFilter(sp);
  const returnTo      = getReturnTo(sp);
  const returnLabel   = getReturnLabel(returnTo);

  const [records, oldestAp] = await Promise.all([
    getApDocumentDetail(ctx.orgId, undefined, 100).catch(() => []),
    getOldestApRecord(ctx.orgId).catch(() => null),
  ]);

  const fmtCOP = (n: number) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

  const totalAmount = records.reduce((s, r) => s + r.amount, 0);
  const hasAmounts  = totalAmount > 0;

  const summaryMetrics = [
    { label: "Documentos", value: records.length },
    { label: "Monto neto",  value: hasAmounts ? fmtCOP(totalAmount) : "sin detalle SAG", accent: C.inkLight },
    ...(oldestAp ? [{ label: "Obligación más antigua", value: oldestAp.customerName ?? "Proveedor desconocido", note: oldestAp.saleDate.toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" }) + " · fecha doc (proxy)" }] : []),
  ];

  // Serialize dates for client component
  const serialized: ApRowSerial[] = records.map(r => ({
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
          { label: "Cuentas por pagar" },
        ]}
        title="Cuentas por pagar"
        subtitle="Obligaciones operativas · documentos C1/G1/C2 · fuente SAG"
        status={records.length > 0 ? "warning" : "neutral"}
        statusLabel={records.length > 0 ? `${records.length} documentos activos` : "Sin documentos"}
        contextualBackHref={returnTo ?? undefined}
        contextualBackLabel={returnLabel ?? undefined}
      />

      {/* Data gap notice */}
      {!hasAmounts && records.length > 0 && (
        <div style={{
          padding:      `${S[2]}px ${S[4]}px`,
          background:   C.amberLight,
          border:       `1px solid ${C.amberBorder}`,
          borderRadius: R.lg,
          marginBottom: S[4],
          fontFamily:   T.mono,
          fontSize:     T.sz.xs,
          color:        C.amberDark,
        }}>
          Aviso: SAG SOAP no envía montos para los códigos de comprobante C1/G1/C2.
          Los montos aparecen como $0. Solo el conteo de documentos y los proveedores son confiables.
        </div>
      )}

      <SummaryMetricRow metrics={summaryMetrics} />

      <WorkspaceActions actions={[
        { label: "Ir a Tesorería →",  href: `/${orgSlug}/finance`,                                                                                                            variant: "primary",  accent: "#1e40af" },
        { label: "Consignaciones",    href: `/${orgSlug}/finanzas/torre-control/consignaciones?returnTo=/${orgSlug}/finanzas/torre-control/cuentas-por-pagar`,                 variant: "secondary" },
        { label: "Torre de Control",  href: `/${orgSlug}/executive`,                                                                                                          variant: "ghost"     },
      ]} />

      <CuentasPorPagarTableClient
        records={serialized}
        initialSearch={initialSearch}
        initialTipo={initialTipo}
        fmtCOP={fmtCOP}
      />

      <RelatedWorkspaces
        title="Workspaces relacionados"
        items={[
          { label: "Cobros de hoy",            description: "Recibos del día operativo",           href: `/${orgSlug}/finanzas/torre-control/cobros-hoy`,           accent: C.green  },
          { label: "Cobros identificados",     description: "Composición R1/R2/Almacenes/Retail",  href: `/${orgSlug}/finanzas/torre-control/cobros-identificados`,  accent: C.blue   },
          { label: "Consignaciones",           description: "Depósitos sin identificar",           href: `/${orgSlug}/finanzas/torre-control/consignaciones`,        accent: C.amber  },
          { label: "Conciliación inteligente", description: "Gestionar cobros vs facturas",        href: `/${orgSlug}/reconciliation`,                               accent: C.brand  },
        ]}
      />

    </div>
  );
}
