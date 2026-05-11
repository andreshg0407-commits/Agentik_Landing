/**
 * /[orgSlug]/operaciones/pedidos
 *
 * Nodo central de operación: Pedidos del día.
 * Cada fila expone acciones directas — sin dropdowns, sin volver atrás.
 *
 * Flujo forward:
 *   Torre de Control → Pedidos del día → Cliente 360 | Detalle pedido | Crear acción
 *
 * Hooks para integración futura (sin hardcodear lógica):
 *   - status PENDIENTE/CONFIRMADO → hook para facturación
 *   - customerProfile.id         → hook para cartera
 *   - orderNumber                → hook para conciliación de pagos
 */

import Link                   from "next/link";
import { requireOrgAccess }   from "@/lib/auth/org-access";
import { prisma }             from "@/lib/prisma";
import { getLatestOrderDate } from "@/lib/orders/queries";
import { formatDateCol }      from "@/lib/utils/formatDate";

function fmtCOP(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP", maximumFractionDigits: 0,
  }).format(n);
}

const STATUS_LABEL: Record<string, string> = {
  PENDIENTE:   "Pendiente",
  CONFIRMADO:  "Confirmado",
  DESPACHADO:  "Despachado",
  FACTURADO:   "Facturado",
  CANCELADO:   "Cancelado",
};

const STATUS_COLOR: Record<string, { fg: string; bg: string; border: string }> = {
  PENDIENTE:  { fg: "#92400e", bg: "#fef3c7", border: "#fde68a" },
  CONFIRMADO: { fg: "#1e40af", bg: "#eff6ff", border: "#bfdbfe" },
  DESPACHADO: { fg: "#5b21b6", bg: "#f5f3ff", border: "#ddd6fe" },
  FACTURADO:  { fg: "#065f46", bg: "#ecfdf5", border: "#a7f3d0" },
  CANCELADO:  { fg: "#6b7280", bg: "#f9fafb", border: "#e5e7eb" },
};

type OrderRow = {
  id:           string;
  orderNumber:  string;
  customerName: string;
  customerNit:  string | null;
  amount:       unknown;
  status:       string;
  orderDate:    Date;
  sourceCode:   string;
};

type ProfileStub = {
  slug:          string;
  id:            string;
  nit:           string | null;
  sagTerceroId:  number | null;
};

export default async function PedidosDiaPage({
  params,
  searchParams,
}: {
  params:       Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { orgSlug }      = await params;
  const sp               = await searchParams;
  const fechaCtx         = sp.fecha ?? "hoy";   // context passed from Torre de Control
  const { organization } = await requireOrgAccess(orgSlug);
  const orgId            = organization.id;
  const db               = prisma as any;

  // ── Resolve latest order operational date ──────────────────────────────────
  const latestOrderDate = await getLatestOrderDate(orgId).catch(() => null);
  const dayStart: Date | null = latestOrderDate
    ? (() => { const d = new Date(latestOrderDate); d.setUTCHours(0, 0, 0, 0); return d; })()
    : null;
  const dayEnd: Date | null = dayStart
    ? new Date(dayStart.getTime() + 86_400_000)
    : null;

  // ── Load orders ────────────────────────────────────────────────────────────
  const orders: OrderRow[] = dayStart && dayEnd
    ? await db.customerOrderRecord.findMany({
        where:   { organizationId: orgId, orderDate: { gte: dayStart, lt: dayEnd } },
        orderBy: [{ status: "asc" }, { amount: "desc" }],
        select:  {
          id: true, orderNumber: true, customerName: true,
          customerNit: true, amount: true, status: true,
          orderDate: true, sourceCode: true,
        },
      }).catch(() => [])
    : [];

  // ── Resolve CustomerProfile slugs (bulk, one query) ────────────────────────
  // CustomerOrderRecord.customerNit = SAG tercero ID as string (e.g. "526")
  // CustomerProfile.sagTerceroId    = same value as integer
  const uniqueSagIds = [
    ...new Set(
      orders
        .map(o => o.customerNit ? parseInt(o.customerNit, 10) : null)
        .filter((n): n is number => n !== null && !isNaN(n))
    ),
  ];

  const profileStubs: ProfileStub[] = uniqueSagIds.length > 0
    ? await db.customerProfile.findMany({
        where:  { organizationId: orgId, sagTerceroId: { in: uniqueSagIds } },
        select: { slug: true, id: true, nit: true, sagTerceroId: true },
      }).catch(() => [])
    : [];

  // Map: SAG tercero ID string → profile stub
  const profileMap = new Map<string, ProfileStub>(
    profileStubs.map((p: ProfileStub) => [String(p.sagTerceroId), p])
  );

  const totalAmount = orders.reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const opLabel     = dayStart ? formatDateCol(dayStart) : "sin datos";

  // Status counts for summary strip
  const byStatus = orders.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1;
    return acc;
  }, {});

  // ── Context params to forward through all navigation links ─────────────────
  const ctxParams = `fecha=${fechaCtx}&from=pedidos`;

  return (
    <div style={{ fontFamily: "monospace", maxWidth: 1200 }}>

      {/* Breadcrumb */}
      <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 10,
        textTransform: "uppercase", letterSpacing: "0.05em" }}>
        <Link href={`/${orgSlug}/executive`} style={{ color: "#9ca3af", textDecoration: "none" }}>
          Torre de Control
        </Link>
        {" · "}Operaciones · Pedidos del día
      </div>

      {/* Header */}
      <div style={{ marginBottom: 16, paddingBottom: 12, borderBottom: "1.5px solid #111" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "#111", letterSpacing: "-0.02em" }}>
            Pedidos del día
          </h1>
          <span style={{ fontSize: 11, color: "#6b7280" }}>
            Día operativo: <strong style={{ color: "#111" }}>{opLabel}</strong>
          </span>
          <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: "#111" }}>
            {orders.length} pedido{orders.length !== 1 ? "s" : ""} · {fmtCOP(totalAmount)}
          </span>
        </div>

        {/* Status summary strip */}
        {orders.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            {Object.entries(byStatus).map(([st, cnt]) => {
              const c = STATUS_COLOR[st] ?? { fg: "#6b7280", bg: "#f9fafb", border: "#e5e7eb" };
              return (
                <span key={st} style={{
                  fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 4,
                  background: c.bg, color: c.fg, border: `1px solid ${c.border}`,
                }}>
                  {STATUS_LABEL[st] ?? st}: {cnt}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {orders.length === 0 ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
          Sin pedidos en el último día operativo SAG.
          <div style={{ marginTop: 12 }}>
            <Link href={`/${orgSlug}/executive`}
              style={{ color: "#1d4ed8", textDecoration: "none", fontSize: 12, fontWeight: 600 }}>
              Volver a Torre de Control
            </Link>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {orders.map(order => {
            const profile  = profileMap.get(order.customerNit ?? "");
            const statusC  = STATUS_COLOR[order.status] ?? { fg: "#6b7280", bg: "#f9fafb", border: "#e5e7eb" };
            const amount   = Number(order.amount ?? 0);
            // Hooks for future integration — exposed as booleans
            const canBill  = order.status === "PENDIENTE" || order.status === "CONFIRMADO";
            const isClosed = order.status === "FACTURADO" || order.status === "CANCELADO";

            return (
              <div key={order.id} style={{
                border:       "1px solid #e5e7eb",
                borderRadius: 6,
                background:   "#fff",
                overflow:     "hidden",
              }}>
                {/* Row: data columns */}
                <div style={{
                  display:             "grid",
                  gridTemplateColumns: "minmax(60px,80px) minmax(180px,1fr) 110px 110px 80px 70px",
                  alignItems:          "center",
                  padding:             "10px 14px",
                  gap:                 12,
                  borderBottom:        "1px solid #f3f4f6",
                }}>
                  {/* Pedido ID */}
                  <div>
                    <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      Pedido
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: "#111" }}>
                      {order.orderNumber}
                    </div>
                  </div>

                  {/* Cliente */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#111",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {order.customerName}
                    </div>
                    <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>
                      {profile?.nit
                        ? `NIT ${profile.nit}`
                        : order.customerNit
                          ? `SAG #${order.customerNit}`
                          : "Sin identificador"}
                    </div>
                  </div>

                  {/* Monto */}
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase" }}>Monto</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>{fmtCOP(amount)}</div>
                  </div>

                  {/* Estado */}
                  <div>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 4,
                      background: statusC.bg, color: statusC.fg, border: `1px solid ${statusC.border}`,
                    }}>
                      {STATUS_LABEL[order.status] ?? order.status}
                    </span>
                  </div>

                  {/* Fecha */}
                  <div>
                    <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase" }}>Fecha</div>
                    <div style={{ fontSize: 11, color: "#374151" }}>{formatDateCol(order.orderDate)}</div>
                  </div>

                  {/* Canal / origen */}
                  <div>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                      background: "#f0f9ff", color: "#0369a1", border: "1px solid #bae6fd",
                    }}>
                      {order.sourceCode}
                    </span>
                  </div>
                </div>

                {/* Actions row */}
                <div style={{
                  display:        "flex",
                  gap:            6,
                  padding:        "8px 14px",
                  background:     "#fafafa",
                  flexWrap:       "wrap",
                  alignItems:     "center",
                }}>
                  {/* 1. Ver Cliente 360 */}
                  {profile ? (
                    <Link
                      href={`/${orgSlug}/customer-360/${profile.slug}?${ctxParams}`}
                      style={actionBtn("blue")}
                    >
                      Cliente 360
                    </Link>
                  ) : (
                    <span style={{ ...actionBtn("gray"), opacity: 0.5, cursor: "not-allowed" }}>
                      Cliente 360 (sin perfil)
                    </span>
                  )}

                  {/* 2. Ver pedido / documento */}
                  <Link
                    href={`/${orgSlug}/operaciones/pedidos/${order.id}?${ctxParams}`}
                    style={actionBtn("neutral")}
                  >
                    Ver pedido
                  </Link>

                  {/* 3. Crear acción / seguimiento */}
                  {!isClosed && (
                    <Link
                      href={`/${orgSlug}/operaciones/pedidos/${order.id}/accion?${ctxParams}${profile ? `&customerId=${profile.id}&customerSlug=${profile.slug}` : ""}`}
                      style={actionBtn("green")}
                    >
                      Crear seguimiento
                    </Link>
                  )}

                  {/* 4. Facturar / validar — hook para integración futura */}
                  {canBill && (
                    <span
                      title="Facturación desde SAG — disponible en próximo sprint"
                      style={{ ...actionBtn("amber"), opacity: 0.45, cursor: "not-allowed" }}
                    >
                      Facturar
                    </span>
                  )}

                  {/* Cartera hook — shown only when customer has a profile */}
                  {profile && !isClosed && (
                    <Link
                      href={`/${orgSlug}/customer-360/${profile.slug}?tab=cartera&${ctxParams}`}
                      style={{ ...actionBtn("red"), opacity: 0.75 }}
                    >
                      Ver cartera
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer / context strip */}
      <div style={{ marginTop: 20, fontSize: 10, color: "#9ca3af",
        display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <span>
          Fuente: CustomerOrderRecord (SAG PD) · Día operativo: {opLabel} ·{" "}
          {profileStubs.length} perfiles resueltos de {uniqueSagIds.length} terceros
        </span>
        <Link href={`/${orgSlug}/executive`} style={{ color: "#6b7280", textDecoration: "none", fontWeight: 600 }}>
          Torre de Control →
        </Link>
      </div>
    </div>
  );
}

// ── Style helpers ─────────────────────────────────────────────────────────────

type BtnVariant = "blue" | "green" | "neutral" | "gray" | "amber" | "red";

const BTN_STYLES: Record<BtnVariant, React.CSSProperties> = {
  blue:    { background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" },
  green:   { background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0" },
  neutral: { background: "#f9fafb", color: "#374151", border: "1px solid #e5e7eb" },
  gray:    { background: "#f3f4f6", color: "#9ca3af", border: "1px solid #e5e7eb" },
  amber:   { background: "#fffbeb", color: "#92400e", border: "1px solid #fde68a" },
  red:     { background: "#fff1f2", color: "#9f1239", border: "1px solid #fecdd3" },
};

function actionBtn(variant: BtnVariant): React.CSSProperties {
  return {
    ...BTN_STYLES[variant],
    display:        "inline-block",
    fontFamily:     "monospace",
    fontSize:       10,
    fontWeight:     700,
    padding:        "3px 10px",
    borderRadius:   4,
    textDecoration: "none",
    whiteSpace:     "nowrap",
    cursor:         "pointer",
    lineHeight:     "1.6",
  };
}
