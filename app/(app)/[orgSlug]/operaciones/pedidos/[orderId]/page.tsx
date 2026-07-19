/**
 * /[orgSlug]/operaciones/pedidos/[orderId]
 *
 * Detalle de un pedido. Nodo intermedio del flujo operativo.
 * Permite avanzar hacia Cliente 360 o crear una acción — sin volver atrás.
 *
 * Flujo: Pedidos del día → [este nodo] → Cliente 360 | Crear seguimiento
 */

import Link                   from "next/link";
import { notFound }           from "next/navigation";
import { requireOrgAccess }   from "@/lib/auth/org-access";
import { prisma }             from "@/lib/prisma";
import { formatDateCol }      from "@/lib/utils/formatDate";

function fmtCOP(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP", maximumFractionDigits: 0,
  }).format(n);
}

const STATUS_LABEL: Record<string, string> = {
  PENDIENTE:  "Pendiente",
  CONFIRMADO: "Confirmado",
  DESPACHADO: "Despachado",
  FACTURADO:  "Facturado",
  CANCELADO:  "Cancelado",
};

const STATUS_COLOR: Record<string, { fg: string; bg: string; border: string }> = {
  PENDIENTE:  { fg: "#92400e", bg: "#fef3c7", border: "#fde68a" },
  CONFIRMADO: { fg: "#1e40af", bg: "#eff6ff", border: "#bfdbfe" },
  DESPACHADO: { fg: "#5b21b6", bg: "#f5f3ff", border: "#ddd6fe" },
  FACTURADO:  { fg: "#065f46", bg: "#ecfdf5", border: "#a7f3d0" },
  CANCELADO:  { fg: "#6b7280", bg: "#f9fafb", border: "#e5e7eb" },
};

export default async function PedidoDetailPage({
  params,
  searchParams,
}: {
  params:       Promise<{ orgSlug: string; orderId: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { orgSlug, orderId } = await params;
  const sp                   = await searchParams;
  const fechaCtx             = sp.fecha ?? "hoy";
  const fromCtx              = sp.from  ?? "pedidos";

  const { organization } = await requireOrgAccess(orgSlug);
  const orgId            = organization.id;
  const db               = prisma as any;

  // ── Load order ─────────────────────────────────────────────────────────────
  const order = await db.customerOrderRecord.findFirst({
    where:  { id: orderId, organizationId: orgId },
    select: {
      id: true, orderNumber: true, erpMovId: true,
      customerName: true, customerNit: true,
      amount: true, currency: true, status: true,
      sourceCode: true, orderDate: true, syncedAt: true,
    },
  }).catch(() => null) as {
    id: string; orderNumber: string; erpMovId: number;
    customerName: string; customerNit: string | null;
    amount: unknown; currency: string; status: string;
    sourceCode: string; orderDate: Date; syncedAt: Date;
  } | null;

  if (!order) notFound();

  // ── Resolve CustomerProfile ────────────────────────────────────────────────
  const sagId = order.customerNit ? parseInt(order.customerNit, 10) : null;
  const profile = sagId && !isNaN(sagId)
    ? await db.customerProfile.findFirst({
        where:  { organizationId: orgId, sagTerceroId: sagId },
        select: { slug: true, id: true, nit: true, name: true, ltv: true,
                  totalSalesL12: true, overdueReceivable: true, healthScore: true },
      }).catch(() => null)
    : null;

  const statusC   = STATUS_COLOR[order.status] ?? { fg: "#6b7280", bg: "#f9fafb", border: "#e5e7eb" };
  const amount    = Number(order.amount ?? 0);
  const canAct    = order.status !== "CANCELADO";
  const isClosed  = order.status === "FACTURADO" || order.status === "CANCELADO";
  const ctxParams = `fecha=${fechaCtx}&from=${fromCtx}`;

  return (
    <div style={{ fontFamily: "monospace", maxWidth: 860 }}>

      {/* Breadcrumb */}
      <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 10,
        textTransform: "uppercase", letterSpacing: "0.05em" }}>
        <Link href={`/${orgSlug}/executive`} style={{ color: "#9ca3af", textDecoration: "none" }}>
          Torre de Control
        </Link>
        {" · "}
        <Link href={`/${orgSlug}/operaciones/pedidos?${ctxParams}`}
          style={{ color: "#9ca3af", textDecoration: "none" }}>
          Pedidos del día
        </Link>
        {" · "}Pedido {order.orderNumber}
      </div>

      {/* Header card */}
      <div style={{ border: "1.5px solid #111", borderRadius: 6, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ background: "#111", color: "#fff", padding: "10px 16px",
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em" }}>
            Pedido {order.orderNumber}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 4,
            background: statusC.bg, color: statusC.fg, border: `1px solid ${statusC.border}`,
          }}>
            {STATUS_LABEL[order.status] ?? order.status}
          </span>
          <span style={{ marginLeft: "auto", fontSize: 16, fontWeight: 900 }}>
            {fmtCOP(amount)}
          </span>
        </div>

        {/* Data grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0 }}>
          {[
            { label: "Cliente", value: order.customerName },
            { label: "NIT / SAG ID",  value: profile?.nit ? `NIT ${profile.nit}` : order.customerNit ? `SAG #${order.customerNit}` : "—" },
            { label: "Fecha",         value: formatDateCol(order.orderDate) },
            { label: "Canal / origen", value: order.sourceCode },
            { label: "ERP Mov ID",   value: String(order.erpMovId) },
            { label: "Sincronizado",  value: formatDateCol(order.syncedAt) },
          ].map((item, idx) => (
            <div key={idx} style={{
              padding:     "10px 16px",
              borderRight: (idx % 3 < 2) ? "1px solid #f3f4f6" : "none",
              borderBottom: idx < 3 ? "1px solid #f3f4f6" : "none",
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#9ca3af",
                textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>
                {item.label}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Customer profile card (if resolved) */}
      {profile && (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 6, marginBottom: 16, overflow: "hidden" }}>
          <div style={{ background: "#f9fafb", padding: "8px 16px", borderBottom: "1px solid #e5e7eb",
            fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Perfil de cliente resuelto
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0 }}>
            {[
              { label: "LTV",           value: profile.ltv != null ? fmtCOP(Number(profile.ltv)) : "—" },
              { label: "Ventas L12M",   value: profile.totalSalesL12 != null ? fmtCOP(Number(profile.totalSalesL12)) : "—" },
              { label: "Cartera vencida", value: profile.overdueReceivable != null ? fmtCOP(Number(profile.overdueReceivable)) : "—" },
              { label: "Health score",  value: profile.healthScore != null ? `${profile.healthScore}/100` : "—" },
            ].map((item, idx) => (
              <div key={idx} style={{
                padding:     "10px 14px",
                borderRight: idx < 3 ? "1px solid #f3f4f6" : "none",
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#9ca3af",
                  textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>
                  {item.label}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions — visible, forward-only */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {profile && (
          <Link
            href={`/${orgSlug}/customer-360/${profile.slug}?${ctxParams}`}
            style={primaryBtn}
          >
            Ver Cliente 360 →
          </Link>
        )}

        {canAct && (
          <Link
            href={`/${orgSlug}/operaciones/pedidos/${order.id}/accion?${ctxParams}${profile ? `&customerId=${profile.id}&customerSlug=${profile.slug}` : ""}`}
            style={secondaryBtn}
          >
            Crear seguimiento
          </Link>
        )}

        {profile && (
          <Link
            href={`/${orgSlug}/customer-360/${profile.slug}?tab=cartera&${ctxParams}`}
            style={ghostBtn}
          >
            Ver cartera del cliente
          </Link>
        )}

        {/* Facturar hook — future sprint */}
        {(order.status === "PENDIENTE" || order.status === "CONFIRMADO") && (
          <span title="Disponible en próximo sprint — requiere integración SAG facturación"
            style={{ ...ghostBtn, opacity: 0.4, cursor: "not-allowed" }}>
            Facturar (próximamente)
          </span>
        )}
      </div>

      {/* Navigation context note */}
      <div style={{ fontSize: 10, color: "#9ca3af", borderTop: "1px solid #f3f4f6", paddingTop: 10,
        display: "flex", justifyContent: "space-between" }}>
        <span>Pedido {order.orderNumber} · SAG PD · erpMovId={order.erpMovId}</span>
        <Link href={`/${orgSlug}/operaciones/pedidos?${ctxParams}`}
          style={{ color: "#6b7280", textDecoration: "none", fontWeight: 600 }}>
          Lista de pedidos del día →
        </Link>
      </div>
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  display: "inline-block", fontFamily: "monospace", fontSize: 12, fontWeight: 700,
  padding: "8px 18px", borderRadius: 5, textDecoration: "none",
  background: "#111", color: "#fff", border: "1px solid #111",
  whiteSpace: "nowrap",
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block", fontFamily: "monospace", fontSize: 12, fontWeight: 700,
  padding: "8px 18px", borderRadius: 5, textDecoration: "none",
  background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0",
  whiteSpace: "nowrap",
};

const ghostBtn: React.CSSProperties = {
  display: "inline-block", fontFamily: "monospace", fontSize: 12, fontWeight: 600,
  padding: "8px 18px", borderRadius: 5, textDecoration: "none",
  background: "#f9fafb", color: "#374151", border: "1px solid #e5e7eb",
  whiteSpace: "nowrap",
};
