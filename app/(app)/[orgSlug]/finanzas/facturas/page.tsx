/**
 * /[orgSlug]/finanzas/facturas
 *
 * Vista operativa: Facturas emitidas hoy — SaleRecord (F1: FE FD FC FG FA FW).
 * Destino desde "Facturas emitidas hoy" en Torre de Control.
 */

import Link                     from "next/link";
import { requireOrgAccess }     from "@/lib/auth/org-access";
import { prisma }               from "@/lib/prisma";
import { getInvoiceSourceCodes } from "@/lib/castillitos/source-rules";
import { formatDateCol }         from "@/lib/utils/formatDate";

function fmtCOP(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style:                 "currency",
    currency:              "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

const COMP_LABEL: Record<string, string> = {
  FE: "Empresa",
  FD: "San Diego",
  FC: "Centro",
  FG: "Gran Plaza",
  FA: "Caldas",
  FW: "Web",
};

export default async function FacturasDiaPage({
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

  // ── Load rows ──────────────────────────────────────────────────────────────
  const rows: Array<{
    id:               string;
    documentNumber:   string | null;
    customerName:     string | null;
    amount:           unknown;
    comprobanteCode:  string | null;
    saleDate:         Date | null;
    sellerName:       string | null;
  }> = dayStart && dayEnd
    ? await db.saleRecord.findMany({
        where: {
          organizationId: orgId,
          saleDate:        { gte: dayStart, lt: dayEnd },
          comprobanteCode: { in: b1InvCodes },
          productLine:     { not: { startsWith: "Total" } },
        },
        orderBy: [{ amount: "desc" }],
        select: {
          id: true, documentNumber: true, customerName: true, amount: true,
          comprobanteCode: true, saleDate: true, sellerName: true,
        },
        take: 500,
      }).catch(() => [])
    : [];

  const totalAmount = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const opLabel     = dayStart ? formatDateCol(dayStart) : "sin datos";

  return (
    <div style={{ fontFamily: "monospace", maxWidth: 1100 }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        <Link href={`/${orgSlug}/executive`} style={{ color: "#9ca3af", textDecoration: "none" }}>
          Torre de Control
        </Link>
        {" · "}
        <Link href={`/${orgSlug}/finanzas/facturas`} style={{ color: "#9ca3af", textDecoration: "none" }}>
          Finanzas
        </Link>
        {" · "}Facturas emitidas hoy
      </div>

      {/* Header */}
      <div style={{ marginBottom: 20, paddingBottom: 12, borderBottom: "1.5px solid #111" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "#111", letterSpacing: "-0.02em" }}>
            Facturas emitidas hoy
          </h1>
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            Día operativo SAG: <strong style={{ color: "#111" }}>{opLabel}</strong>
          </span>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "#6b7280" }}>
            {rows.length} fila{rows.length !== 1 ? "s" : ""} · {fmtCOP(totalAmount)}
          </span>
        </div>
        <div style={{ marginTop: 6, fontSize: 10, color: "#9ca3af" }}>
          Fuente: SaleRecord F1 · {b1InvCodes.join(", ")}
        </div>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: "32px 0", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
          Sin facturas F1 en el último día operativo SAG.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                {["Documento", "Cliente", "Monto", "Canal", "Vendedor", "Fecha"].map(h => (
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
                  <td style={{ padding: "8px 10px", color: "#374151", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.customerName ?? "—"}
                  </td>
                  <td style={{ padding: "8px 10px", color: "#111", fontWeight: 600, textAlign: "right" }}>
                    {fmtCOP(Number(row.amount ?? 0))}
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                      background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe",
                    }}>
                      {row.comprobanteCode ?? "—"}
                      {row.comprobanteCode && COMP_LABEL[row.comprobanteCode]
                        ? ` · ${COMP_LABEL[row.comprobanteCode]}`
                        : ""}
                    </span>
                  </td>
                  <td style={{ padding: "8px 10px", color: "#6b7280" }}>
                    {row.sellerName ?? "—"}
                  </td>
                  <td style={{ padding: "8px 10px", color: "#6b7280" }}>
                    {row.saleDate ? formatDateCol(row.saleDate) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 20, fontSize: 10, color: "#9ca3af" }}>
        Fuente: SaleRecord (SAG F1) · Día operativo: {opLabel} · {rows.length} filas · excluye líneas Total/Subtotal
      </div>
    </div>
  );
}
