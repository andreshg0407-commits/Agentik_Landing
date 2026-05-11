/**
 * /[orgSlug]/comercial/ventas
 *
 * Vista operativa: Ventas del día — SaleRecord (F1: FE FD FC FG FA FW).
 * Destino desde "Ventas del día" en Torre de Control.
 */

import Link                      from "next/link";
import { requireOrgAccess }      from "@/lib/auth/org-access";
import { prisma }                from "@/lib/prisma";
import { getInvoiceSourceCodes } from "@/lib/castillitos/source-rules";
import { formatDateCol }         from "@/lib/utils/formatDate";

function fmtCOP(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style:                 "currency",
    currency:              "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

export default async function VentasDiaPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }      = await params;
  const { organization } = await requireOrgAccess(orgSlug);
  const orgId            = organization.id;
  const db               = prisma as any;
  const b1InvCodes       = getInvoiceSourceCodes();

  // ── Resolve latest invoice operational date ────────────────────────────────
  const latestOpRow = await db.saleRecord.findFirst({
    where:   { organizationId: orgId, comprobanteCode: { in: b1InvCodes } },
    orderBy: { saleDate: "desc" },
    select:  { saleDate: true },
  }).catch(() => null) as { saleDate: Date } | null;

  const latestOpDate: Date | null = latestOpRow?.saleDate ?? null;
  const dayStart: Date | null = latestOpDate
    ? (() => { const d = new Date(latestOpDate); d.setUTCHours(0, 0, 0, 0); return d; })()
    : null;
  const dayEnd: Date | null = dayStart
    ? new Date(dayStart.getTime() + 86_400_000)
    : null;

  // ── Channel breakdown (summary) ────────────────────────────────────────────
  type ChannelRow = { comprobanteCode: string | null; total: number; count: number };
  const channelBreakdown: ChannelRow[] = dayStart && dayEnd
    ? await db.saleRecord.groupBy({
        by:    ["comprobanteCode"],
        where: {
          organizationId: orgId,
          saleDate:        { gte: dayStart, lt: dayEnd },
          comprobanteCode: { in: b1InvCodes },
          productLine:     { not: { startsWith: "Total" } },
        },
        _sum:   { amount: true },
        _count: { _all: true },
        orderBy: { _sum: { amount: "desc" } },
      }).then((rows: any[]) =>
        rows.map(r => ({
          comprobanteCode: r.comprobanteCode as string | null,
          total:           Number(r._sum.amount ?? 0),
          count:           r._count._all as number,
        }))
      ).catch(() => [])
    : [];

  // ── Detail rows ────────────────────────────────────────────────────────────
  const rows: Array<{
    id:              string;
    documentNumber:  string | null;
    customerName:    string | null;
    amount:          unknown;
    comprobanteCode: string | null;
    productLine:     string | null;
    sellerName:      string | null;
    saleDate:        Date | null;
  }> = dayStart && dayEnd
    ? await db.saleRecord.findMany({
        where: {
          organizationId: orgId,
          saleDate:        { gte: dayStart, lt: dayEnd },
          comprobanteCode: { in: b1InvCodes },
          productLine:     { not: { startsWith: "Total" } },
        },
        orderBy: [{ comprobanteCode: "asc" }, { amount: "desc" }],
        select: {
          id: true, documentNumber: true, customerName: true, amount: true,
          comprobanteCode: true, productLine: true, sellerName: true, saleDate: true,
        },
        take: 500,
      }).catch(() => [])
    : [];

  const grandTotal  = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const opLabel     = dayStart ? formatDateCol(dayStart) : "sin datos";

  return (
    <div style={{ fontFamily: "monospace", maxWidth: 1100 }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        <Link href={`/${orgSlug}/executive`} style={{ color: "#9ca3af", textDecoration: "none" }}>
          Torre de Control
        </Link>
        {" · "}
        <Link href={`/${orgSlug}/comercial/ventas`} style={{ color: "#9ca3af", textDecoration: "none" }}>
          Comercial
        </Link>
        {" · "}Ventas del día
      </div>

      {/* Header */}
      <div style={{ marginBottom: 20, paddingBottom: 12, borderBottom: "1.5px solid #111" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "#111", letterSpacing: "-0.02em" }}>
            Ventas del día
          </h1>
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            Día operativo SAG: <strong style={{ color: "#111" }}>{opLabel}</strong>
          </span>
          <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: "#111" }}>
            {fmtCOP(grandTotal)}
          </span>
        </div>
        <div style={{ marginTop: 6, fontSize: 10, color: "#9ca3af" }}>
          Fuente: SaleRecord F1 · {b1InvCodes.join(", ")}
        </div>
      </div>

      {grandTotal === 0 ? (
        <div style={{ padding: "32px 0", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
          Sin ventas F1 en el último día operativo SAG.
        </div>
      ) : (
        <>
          {/* Channel summary strip */}
          {channelBreakdown.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              {channelBreakdown.map(ch => (
                <div key={ch.comprobanteCode ?? "null"} style={{
                  border: "1px solid #e5e7eb", borderRadius: 6, padding: "8px 14px",
                  background: "#fff", minWidth: 120,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
                    {ch.comprobanteCode ?? "—"}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: "#111" }}>
                    {fmtCOP(ch.total)}
                  </div>
                  <div style={{ fontSize: 10, color: "#9ca3af" }}>
                    {ch.count} fila{ch.count !== 1 ? "s" : ""}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Detail table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                  {["Documento", "Cliente", "Monto", "Canal", "Línea", "Vendedor"].map(h => (
                    <th key={h} style={{
                      padding: "8px 10px", textAlign: "left", fontWeight: 700,
                      fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em",
                      color: "#6b7280", whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.id} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb", borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "8px 10px", color: "#111", fontWeight: 700 }}>
                      {row.documentNumber ?? <span style={{ color: "#ccc" }}>—</span>}
                    </td>
                    <td style={{ padding: "8px 10px", color: "#374151", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.customerName ?? "—"}
                    </td>
                    <td style={{ padding: "8px 10px", color: "#111", fontWeight: 600, textAlign: "right" }}>
                      {fmtCOP(Number(row.amount ?? 0))}
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                        background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0",
                      }}>
                        {row.comprobanteCode ?? "—"}
                      </span>
                    </td>
                    <td style={{ padding: "8px 10px", color: "#6b7280", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.productLine ?? "—"}
                    </td>
                    <td style={{ padding: "8px 10px", color: "#6b7280" }}>
                      {row.sellerName ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div style={{ marginTop: 20, fontSize: 10, color: "#9ca3af" }}>
        Fuente: SaleRecord (SAG F1) · Día operativo: {opLabel} · {rows.length} filas
      </div>
    </div>
  );
}
