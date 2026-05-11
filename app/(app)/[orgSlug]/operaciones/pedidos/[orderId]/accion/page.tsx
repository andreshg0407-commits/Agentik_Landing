/**
 * /[orgSlug]/operaciones/pedidos/[orderId]/accion
 *
 * Crear seguimiento / acción sobre un pedido.
 * Terminal del flujo operativo — después de crear la acción, avanza a Cliente 360.
 *
 * Flujo: Pedidos del día → Pedido → [este nodo] → Cliente 360
 */

import Link                 from "next/link";
import { redirect }         from "next/navigation";
import { notFound }         from "next/navigation";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { prisma }           from "@/lib/prisma";
import { formatDateCol }    from "@/lib/utils/formatDate";

export default async function CrearAccionPage({
  params,
  searchParams,
}: {
  params:       Promise<{ orgSlug: string; orderId: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { orgSlug, orderId } = await params;
  const sp                   = await searchParams;
  const fechaCtx             = sp.fecha        ?? "hoy";
  const fromCtx              = sp.from         ?? "pedidos";
  const preCustomerId        = sp.customerId   ?? "";
  const preCustomerSlug      = sp.customerSlug ?? "";

  const { organization, user } = await requireOrgAccess(orgSlug);
  const orgId                  = organization.id;
  const db                     = prisma as any;

  // ── Load order for context ─────────────────────────────────────────────────
  const order = await db.customerOrderRecord.findFirst({
    where:  { id: orderId, organizationId: orgId },
    select: { id: true, orderNumber: true, customerName: true, customerNit: true,
              amount: true, status: true, orderDate: true },
  }).catch(() => null);

  if (!order) notFound();

  // ── Resolve customer profile if not passed via URL ─────────────────────────
  let customerId   = preCustomerId;
  let customerSlug = preCustomerSlug;

  if (!customerId && order.customerNit) {
    const sagId = parseInt(order.customerNit, 10);
    if (!isNaN(sagId)) {
      const p = await db.customerProfile.findFirst({
        where:  { organizationId: orgId, sagTerceroId: sagId },
        select: { id: true, slug: true },
      }).catch(() => null);
      if (p) { customerId = p.id; customerSlug = p.slug; }
    }
  }

  const ctxParams = `fecha=${fechaCtx}&from=${fromCtx}`;

  // ── Server action — creates CRMActivity ────────────────────────────────────
  async function createAccion(formData: FormData) {
    "use server";
    const type    = (formData.get("type")    as string) || "NOTE";
    const subject = (formData.get("subject") as string) || "";
    const body    = (formData.get("body")    as string) || "";
    const cid     = (formData.get("customerId") as string) || null;
    const slug    = (formData.get("customerSlug") as string) || "";

    if (!subject.trim()) return; // client-side validation covers this but guard anyway

    await (prisma as any).cRMActivity.create({
      data: {
        organizationId: orgId,
        customerId:     cid || null,
        type,
        subject:        subject.trim(),
        body:           body.trim() || null,
        occurredAt:     new Date(),
        rawCrmJson: {
          source:      "operaciones/pedidos",
          orderId,
          orderNumber: order.orderNumber,
          pedidoFecha: order.orderDate,
          createdVia:  "flujo-operativo",
        },
      },
    });

    // Forward navigation: go to Cliente 360 if we have a slug, else back to order
    if (slug) {
      redirect(`/${orgSlug}/customer-360/${slug}?${ctxParams}&accion=creada`);
    } else {
      redirect(`/${orgSlug}/operaciones/pedidos/${orderId}?${ctxParams}`);
    }
  }

  const fmtCOP = (n: number) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

  return (
    <div style={{ fontFamily: "monospace", maxWidth: 620 }}>

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
        {" · "}
        <Link href={`/${orgSlug}/operaciones/pedidos/${orderId}?${ctxParams}`}
          style={{ color: "#9ca3af", textDecoration: "none" }}>
          Pedido {order.orderNumber}
        </Link>
        {" · "}Crear seguimiento
      </div>

      {/* Context card */}
      <div style={{
        border: "1px solid #e5e7eb", borderRadius: 6, padding: "10px 14px",
        marginBottom: 20, background: "#f9fafb",
        display: "flex", gap: 20, flexWrap: "wrap",
      }}>
        <div>
          <div style={{ fontSize: 9, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Pedido
          </div>
          <div style={{ fontSize: 13, fontWeight: 900, color: "#111" }}>{order.orderNumber}</div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Cliente
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#111" }}>{order.customerName}</div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Monto
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>
            {fmtCOP(Number(order.amount ?? 0))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Fecha
          </div>
          <div style={{ fontSize: 12, color: "#374151" }}>{formatDateCol(order.orderDate)}</div>
        </div>
      </div>

      {/* Form */}
      <form action={createAccion}>
        {/* Hidden context */}
        <input type="hidden" name="customerId"    value={customerId} />
        <input type="hidden" name="customerSlug"  value={customerSlug} />

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#374151",
            textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 5 }}>
            Tipo de acción
          </label>
          <select name="type" required style={inputStyle}>
            <option value="NOTE">Nota interna</option>
            <option value="CALL">Llamada</option>
            <option value="VISIT">Visita</option>
            <option value="EMAIL">Correo</option>
            <option value="MEETING">Reunión</option>
            <option value="OTHER">Otro</option>
          </select>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#374151",
            textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 5 }}>
            Asunto <span style={{ color: "#dc2626" }}>*</span>
          </label>
          <input
            type="text"
            name="subject"
            required
            placeholder={`Seguimiento pedido ${order.orderNumber} — ${order.customerName}`}
            defaultValue={`Seguimiento pedido ${order.orderNumber}`}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#374151",
            textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 5 }}>
            Notas
          </label>
          <textarea
            name="body"
            rows={4}
            placeholder="Descripción del seguimiento, acuerdo, resultado..."
            style={{ ...inputStyle, resize: "vertical", minHeight: 80 }}
          />
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="submit" style={{
            fontFamily:  "monospace", fontSize: 13, fontWeight: 700,
            padding:     "9px 24px", borderRadius: 5, border: "none",
            background:  "#111", color: "#fff", cursor: "pointer",
          }}>
            Crear seguimiento →
          </button>
          <Link href={`/${orgSlug}/operaciones/pedidos/${orderId}?${ctxParams}`}
            style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600,
              padding: "9px 16px", borderRadius: 5, textDecoration: "none",
              background: "#f9fafb", color: "#6b7280", border: "1px solid #e5e7eb" }}>
            Cancelar
          </Link>
        </div>

        <div style={{ marginTop: 12, fontSize: 10, color: "#9ca3af" }}>
          Al crear, serás llevado directamente a Cliente 360 para continuar operando.
        </div>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width:       "100%",
  fontFamily:  "monospace",
  fontSize:    12,
  padding:     "8px 10px",
  border:      "1px solid #d1d5db",
  borderRadius: 4,
  background:  "#fff",
  color:       "#111",
  boxSizing:   "border-box",
  outline:     "none",
};
