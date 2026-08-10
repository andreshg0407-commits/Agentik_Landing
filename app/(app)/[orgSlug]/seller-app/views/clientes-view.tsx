/**
 * Seller App — Clientes (CRM móvil) + Cliente 360.
 *
 * Sprint: AGENTIK-SELLER-APP-UI-02
 * Sprint: AGENTIK-SELLER-APP-CLIENTS-360-V1-01
 *
 * Clientes = CRM del vendedor, NO selector de pedido:
 *   - Filtros V1: Todos · Cartera vencida · Top clientes · +90 días sin comprar
 *   - Cliente 360: identidad/contacto · estado comercial · última compra ·
 *     ventas 12M · cartera certificada · top productos · pedidos recientes ·
 *     acciones (Crear pedido / Llamar / WhatsApp cuando el teléfono es válido)
 *
 * "Crear pedido" abre el flujo canónico con el cliente autorizado preseleccionado
 * (handler existente del shell). El viewer scope se hereda del servidor — esta
 * vista no consulta nada fuera de las rutas autorizadas.
 */
"use client";

import { useState, useEffect, useMemo } from "react";
import { C, T, S, R } from "@/lib/ui/tokens";
import type { CustomerCommercialContext } from "@/lib/comercial/frontline";
import {
  type SerializedCustomer,
  type SellerAppShellProps,
  fmtCOP,
  fmtDaysAgo,
  filterBtnStyle,
  DetailSection,
  DetailKpi,
} from "./seller-app-shared";
import { SellerIcon, SearchField, StatusChip, EmptyState, appCard, btnPrimary, btnSecondary } from "./seller-ui-kit";

// ── Contacto: validez de teléfono (Colombia) ────────────────────────────────
// Llamar: cualquier número con >= 7 dígitos. WhatsApp: celular CO válido
// (10 dígitos iniciando en 3, o ya con indicativo 573). Si no es válido, la
// acción NO se muestra — nunca un botón muerto.

export function telHref(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 ? `tel:${digits.length === 10 ? "+57" + digits : digits}` : null;
}

export function waHref(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("3")) return `https://wa.me/57${digits}`;
  if (digits.length === 12 && digits.startsWith("573")) return `https://wa.me/${digits}`;
  return null;
}

// ── Filtros V1 (CRM, no picker) ─────────────────────────────────────────────

export type ClientesFilter = "todos" | "cartera" | "top" | "inactivos";

const TOP_CLIENTES_N = 10;

// ── Clientes List ───────────────────────────────────────────────────────────

export function ClientesView({
  customers,
  inactiveCustomerIds,
  inactiveCustomers,
  orgSlug,
  orgId,
  onSelectCustomer,
}: {
  customers: SerializedCustomer[];
  inactiveCustomerIds: string[];
  inactiveCustomers: SellerAppShellProps["inactiveCustomers"];
  orgSlug: string;
  orgId: string;
  onSelectCustomer: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ClientesFilter>("todos");

  const inactiveSet = useMemo(() => new Set(inactiveCustomerIds), [inactiveCustomerIds]);

  // Cartera vencida: SOLO con verdad certificada (SAFETY-LOCK-P0)
  const overdueIds = useMemo(() => new Set(
    customers
      .filter(c => c.receivableTruthStatus === "CERTIFIED" && c.overdueReceivable > 0)
      .map(c => c.id),
  ), [customers]);

  // Top clientes: ranking por ventas facturadas 12M (read model canónico)
  const topIds = useMemo(() => new Set(
    [...customers]
      .filter(c => c.sales12M > 0)
      .sort((a, b) => b.sales12M - a.sales12M)
      .slice(0, TOP_CLIENTES_N)
      .map(c => c.id),
  ), [customers]);

  const filtered = useMemo(() => {
    let list = customers;
    if (filter === "cartera") list = list.filter(c => overdueIds.has(c.id));
    else if (filter === "top") {
      list = [...list].filter(c => topIds.has(c.id)).sort((a, b) => b.sales12M - a.sales12M);
    } else if (filter === "inactivos") list = list.filter(c => inactiveSet.has(c.id));
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.nit && c.nit.includes(q)) ||
        (c.city && c.city.toLowerCase().includes(q))
      );
    }
    return list;
  }, [customers, search, filter, inactiveSet, overdueIds, topIds]);

  const chips: Array<{ key: ClientesFilter; label: string; count: number; activeBg: string }> = [
    { key: "todos", label: "Todos", count: customers.length, activeBg: C.blueDark },
    { key: "cartera", label: "Cartera vencida", count: overdueIds.size, activeBg: C.redDark },
    { key: "top", label: "Top clientes", count: topIds.size, activeBg: C.blueDark },
    { key: "inactivos", label: "+90 días sin comprar", count: inactiveSet.size, activeBg: C.amberDark },
  ];

  return (
    <div style={{ padding: S[4] }}>
      <div style={{ marginBottom: S[3] }}>
        <SearchField value={search} onChange={setSearch} placeholder="Buscar cliente..." />
      </div>

      {/* Filtros V1 — scroll horizontal, táctil */}
      <div style={{
        display: "flex", gap: S[2],
        overflowX: "auto", WebkitOverflowScrolling: "touch",
        margin: `0 -${S[4]}px ${S[4]}px`, padding: `0 ${S[4]}px`,
      }}>
        {chips.map(ch => {
          const active = filter === ch.key;
          return (
            <button key={ch.key} onClick={() => setFilter(ch.key)} style={{
              ...filterBtnStyle, minHeight: 38, flexShrink: 0,
              border: `1.5px solid ${active ? ch.activeBg : C.line}`,
              background: active ? ch.activeBg : C.white,
              color: active ? C.white : C.ink,
              touchAction: "manipulation",
            }}>
              {ch.label} ({ch.count})
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="users" title={search ? "Sin resultados" : "Sin clientes en este filtro"}
          subtitle={search ? "Prueba con otro nombre, NIT o ciudad" : undefined} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
          {filtered.map(c => {
            const isInactive = inactiveSet.has(c.id);
            const inactiveInfo = isInactive
              ? inactiveCustomers.find(ic => ic.customerId === c.id) ?? null
              : null;
            return (
              <CustomerCard key={c.id} customer={c} isInactive={isInactive}
                isTop={topIds.has(c.id)} showSales={filter === "top"}
                inactiveInfo={inactiveInfo} onSelect={() => onSelectCustomer(c.id)} />
            );
          })}
        </div>
      )}
    </div>
  );
}

function CustomerCard({ customer, isInactive, isTop, showSales, inactiveInfo, onSelect }: {
  customer: SerializedCustomer;
  isInactive: boolean;
  isTop: boolean;
  showSales: boolean;
  inactiveInfo: SellerAppShellProps["inactiveCustomers"][number] | null;
  onSelect: () => void;
}) {
  // AGENTIK-RECEIVABLES-SAFETY-LOCK-P0: suppress overdue presentation
  // when receivable data is not certified.
  const isCertified = customer.receivableTruthStatus === "CERTIFIED";
  const hasOverdue = isCertified && customer.overdueReceivable > 0 && customer.maxDpd > 30;
  return (
    <button onClick={onSelect} style={{
      ...appCard,
      display: "flex", alignItems: "flex-start", gap: S[3], width: "100%",
      textAlign: "left", padding: S[3],
      border: `1px solid ${hasOverdue ? C.redBorder : isInactive ? C.amberBorder : C.line}`,
      cursor: "pointer", fontFamily: T.sans, minHeight: 76, touchAction: "manipulation",
    }}>
      <span aria-hidden style={{
        width: 42, height: 42, borderRadius: 13, flexShrink: 0,
        background: hasOverdue ? C.redLight : C.blueLight,
        color: hasOverdue ? C.redDark : C.blueDark,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: T.sz.lg, fontWeight: T.wt.bold,
      }}>
        {(customer.name || "C")[0].toUpperCase()}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: S[1], marginBottom: 2 }}>
          <span style={{
            fontSize: T.sz.md, fontWeight: T.wt.bold, color: C.ink, flex: 1, minWidth: 0,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {customer.name}
          </span>
          {isTop && showSales && (
            <StatusChip bg={C.blueLight} color={C.blueDark}>Top</StatusChip>
          )}
          {isInactive && (
            <StatusChip bg={C.amberLight} color={C.amberDark}>
              {inactiveInfo?.daysSinceLastPurchase ? `${inactiveInfo.daysSinceLastPurchase}d` : "Sin compras"}
            </StatusChip>
          )}
          {hasOverdue && (
            <StatusChip bg={C.redLight} color={C.redDark}>{customer.maxDpd}d vencido</StatusChip>
          )}
        </span>
        <span style={{ display: "block", fontSize: T.sz.xs, color: C.inkLight, marginBottom: S[1] }}>
          {customer.city ?? "—"}{customer.nit ? ` · ${customer.nit}` : ""}
        </span>
        <span style={{ display: "flex", justifyContent: "space-between", gap: S[2], fontSize: T.sz.xs, color: C.inkMid }}>
          <span style={{ minWidth: 0 }}>
            {showSales ? (
              <>12M: <strong style={{ color: C.ink }}>{fmtCOP(customer.sales12M)}</strong> {"·"} {customer.orders12M} pedidos</>
            ) : (
              <>
                Cartera: <strong style={{ color: C.ink }}>{fmtCOP(customer.totalReceivable)}</strong>
                {isCertified && customer.overdueReceivable > 0 && (
                  <span style={{ color: C.red }}> ({fmtCOP(customer.overdueReceivable)} vencida)</span>
                )}
              </>
            )}
          </span>
          <span style={{ whiteSpace: "nowrap" }}>Ult: {fmtDaysAgo(customer.lastPurchaseDate)}</span>
        </span>
      </span>
      <span aria-hidden style={{ alignSelf: "center" }}>
        <SellerIcon name="chevronRight" size={16} color={C.inkGhost} />
      </span>
    </button>
  );
}

// ── Cliente 360 ─────────────────────────────────────────────────────────────

interface RecentOrder {
  orderNumber: string;
  orderDate: string;
  status: string;
  amount: number;
  totalUnits: number | null;
  lineCount: number | null;
}

const ORDER_STATUS_CHIP: Record<string, { bg: string; color: string; label: string }> = {
  FACTURADO: { bg: C.greenLight, color: C.greenDark, label: "Facturado" },
  PENDIENTE: { bg: C.amberLight, color: C.amberDark, label: "Pendiente" },
  CANCELADO: { bg: C.redLight, color: C.redDark, label: "Cancelado" },
};

export function ClienteDetailView({
  customerId,
  orgSlug,
  orgId,
  customers,
  onBack,
  onCreateOrder,
}: {
  customerId: string;
  orgSlug: string;
  orgId: string;
  customers: SerializedCustomer[];
  onBack: () => void;
  onCreateOrder?: (customerId: string) => void;
}) {
  const [context, setContext] = useState<CustomerCommercialContext | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const customer = customers.find(c => c.id === customerId);
  const tel = telHref(customer?.phone ?? null);
  const wa = waHref(customer?.phone ?? null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setContext(null);
    setRecentOrders(null);

    // Contexto 360 + pedidos recientes en paralelo (ambas rutas con viewer scope)
    fetch(`/api/orgs/${orgSlug}/comercial/customer-context?customerId=${customerId}`)
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then(data => { if (!cancelled) { setContext(data); setLoading(false); } })
      .catch(() => { if (!cancelled) { setError("No se pudo cargar el detalle"); setLoading(false); } });

    fetch(`/api/orgs/${orgSlug}/comercial/customer-recent-orders?customerId=${customerId}`)
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then(data => { if (!cancelled) setRecentOrders(Array.isArray(data.orders) ? data.orders : []); })
      .catch(() => { if (!cancelled) setRecentOrders([]); });

    return () => { cancelled = true; };
  }, [orgSlug, customerId]);

  // GAP GATE: "+90 días sin comprar" EXIGE lastPurchaseDate real; un cliente
  // sin historial de compras es otro estado (nunca se muestra como +90d).
  const hasPurchaseHistory = !!customer?.lastPurchaseDate;
  const isInactive90 = hasPurchaseHistory
    ? (Date.now() - new Date(customer!.lastPurchaseDate!).getTime()) / 86_400_000 > 90
    : false;

  return (
    <div style={{ padding: S[4] }}>
      <button onClick={onBack} style={{
        display: "flex", alignItems: "center", gap: S[1], border: "none",
        background: "transparent", cursor: "pointer", fontFamily: T.sans,
        fontSize: T.sz.md, fontWeight: T.wt.semibold, color: C.blueDark,
        padding: `${S[2]}px 0`, minHeight: 44, marginBottom: S[1], touchAction: "manipulation",
      }}>
        <SellerIcon name="back" size={17} color={C.blueDark} /> Clientes
      </button>

      {/* Identidad / contacto */}
      <h2 style={{
        fontSize: T.sz.xl, fontWeight: T.wt.semibold, color: C.ink,
        margin: `0 0 ${S[1]}px`, fontFamily: T.sans,
      }}>
        {customer?.name ?? "Cliente"}
      </h2>
      <div style={{ fontSize: T.sz.xs, color: C.inkLight, marginBottom: S[3] }}>
        {customer?.city ?? "—"}
        {customer?.nit ? ` · NIT: ${customer.nit}` : ""}
        {customer?.phone ? ` · ${customer.phone}` : ""}
      </div>

      {/* §20: cartera vencida >30d — advertencia fuerte y controlada (NO bloquea) */}
      {/* AGENTIK-RECEIVABLES-SAFETY-LOCK-P0: only show when truthStatus === CERTIFIED */}
      {customer && customer.receivableTruthStatus === "CERTIFIED" && customer.overdueReceivable > 0 && customer.maxDpd > 30 && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: S[2],
          padding: S[3], marginBottom: S[3],
          background: C.redLight, border: `1px solid ${C.redBorder}`, borderRadius: 16,
        }}>
          <SellerIcon name="alert" size={18} color={C.redDark} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: T.sz.md, fontWeight: T.wt.bold, color: C.redDark }}>
              Cartera vencida
            </div>
            <div style={{ fontSize: T.sz.sm, color: C.redDark, marginTop: 2, lineHeight: 1.5 }}>
              {fmtCOP(customer.overdueReceivable)} vencida · hasta {customer.maxDpd} días.
              Puedes registrar el pedido; queda como advertencia.
            </div>
          </div>
        </div>
      )}

      {/* Acciones — Crear pedido (flujo canónico, cliente preseleccionado) + contacto */}
      {onCreateOrder && (
        <button
          onClick={() => onCreateOrder(customerId)}
          style={{ ...btnPrimary, marginBottom: (tel || wa) ? S[2] : S[4] }}
        >
          <SellerIcon name="cart" size={19} color={C.white} />
          Crear pedido
        </button>
      )}
      {(tel || wa) && (
        <div style={{ display: "flex", gap: S[2], marginBottom: S[4] }}>
          {tel && (
            <a href={tel} style={{ ...btnSecondary, flex: 1, textDecoration: "none" }}>
              <SellerIcon name="phone" size={18} color={C.blueDark} />
              Llamar
            </a>
          )}
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer"
              style={{ ...btnSecondary, flex: 1, textDecoration: "none" }}>
              <SellerIcon name="whatsapp" size={18} color={C.blueDark} />
              WhatsApp
            </a>
          )}
        </div>
      )}

      {/* Estado comercial */}
      {customer && (
        <DetailSection title="Estado comercial">
          <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[3], flexWrap: "wrap" }}>
            {!hasPurchaseHistory ? (
              <StatusChip bg={C.surfaceAlt} color={C.inkMid}>Sin historial de compras</StatusChip>
            ) : isInactive90 ? (
              <StatusChip bg={C.amberLight} color={C.amberDark}>+90 días sin comprar</StatusChip>
            ) : (
              <StatusChip bg={C.greenLight} color={C.greenDark}>Activo</StatusChip>
            )}
            {customer.receivableTruthStatus === "CERTIFIED" && customer.overdueReceivable > 0 && (
              <StatusChip bg={C.redLight} color={C.redDark}>Cartera vencida</StatusChip>
            )}
          </div>
          <div style={{ display: "flex", gap: S[3] }}>
            <DetailKpi label="Ventas 12M" value={fmtCOP(customer.sales12M)} />
            <DetailKpi label="Pedidos 12M" value={String(customer.orders12M)} />
            <DetailKpi label="Ult. compra" value={fmtDaysAgo(customer.lastPurchaseDate)} />
          </div>
        </DetailSection>
      )}

      {/* Cartera certificada */}
      {customer && (
        <DetailSection title="Cartera">
          {customer.receivableTruthStatus === "CERTIFIED" ? (
            <div style={{ display: "flex", gap: S[3] }}>
              <DetailKpi label="Total" value={fmtCOP(customer.totalReceivable)} />
              <DetailKpi label="Vencida" value={fmtCOP(customer.overdueReceivable)}
                color={customer.overdueReceivable > 0 ? C.red : undefined} />
              <DetailKpi label="Max dias" value={customer.maxDpd > 0 ? `${customer.maxDpd}d` : "—"}
                color={customer.maxDpd > 30 ? C.red : undefined} />
            </div>
          ) : (
            <div style={{ fontSize: T.sz.sm, color: C.inkLight, fontStyle: "italic" }}>
              Información de cartera en validación
            </div>
          )}
        </DetailSection>
      )}

      {loading && (
        <div style={{ textAlign: "center", padding: S[8], color: C.inkLight, fontSize: T.sz.md }}>
          Cargando detalle...
        </div>
      )}
      {error && (
        <div style={{ textAlign: "center", padding: S[8], color: C.red, fontSize: T.sz.md }}>
          {error}
        </div>
      )}

      {context && !loading && (
        <>
          {context.receivables && customer?.receivableTruthStatus === "CERTIFIED" && (
            <DetailSection title="Detalle cartera">
              <div style={{ display: "flex", gap: S[3], flexWrap: "wrap" }}>
                <DetailKpi label="Documentos vencidos" value={String(context.receivables.overdueDocumentCount)} />
                <DetailKpi label="Max dias vencido" value={`${context.receivables.maxDaysOverdue}d`} />
              </div>
            </DetailSection>
          )}

          {context.topProductsByUnits.length > 0 && (
            <DetailSection title="Top productos (unidades)">
              {context.topProductsByUnits.slice(0, 5).map((p, i) => (
                <div key={p.referenceCode} style={{
                  display: "flex", alignItems: "center", gap: S[2],
                  padding: `${S[1]}px 0`,
                  borderBottom: i < 4 ? `1px solid ${C.lineSubtle}` : undefined,
                  fontSize: T.sz.sm,
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    background: C.surfaceAlt, overflow: "hidden",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {p.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.thumbnailUrl} alt="" loading="lazy" style={{
                        width: 32, height: 32, objectFit: "cover", display: "block",
                      }} />
                    ) : (
                      <span style={{ fontSize: 10, color: C.inkFaint, fontWeight: T.wt.medium }}>
                        {p.referenceCode.replace(/[^A-Z0-9]/gi, "").slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: T.wt.medium, color: C.ink }}>{p.referenceCode}</div>
                    <div style={{ color: C.inkLight, fontSize: T.sz.xs, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.description}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, marginLeft: S[2], fontVariantNumeric: "tabular-nums" }}>
                    <div style={{ fontWeight: T.wt.semibold }}>{p.totalUnits} uds</div>
                    <div style={{ fontSize: T.sz.xs, color: C.inkLight }}>{p.purchaseCount} pedidos</div>
                  </div>
                </div>
              ))}
            </DetailSection>
          )}
        </>
      )}

      {/* Pedidos recientes (read model canónico local) */}
      {recentOrders !== null && recentOrders.length > 0 && (
        <DetailSection title="Pedidos recientes">
          {recentOrders.map((o, i) => {
            const chip = ORDER_STATUS_CHIP[o.status] ?? { bg: C.surfaceAlt, color: C.inkMid, label: o.status };
            return (
              <div key={`${o.orderNumber}-${i}`} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: `${S[2]}px 0`,
                borderBottom: i < recentOrders.length - 1 ? `1px solid ${C.lineSubtle}` : undefined,
                fontSize: T.sz.sm,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                    <span style={{ fontWeight: T.wt.semibold, color: C.ink }}>#{o.orderNumber}</span>
                    <StatusChip bg={chip.bg} color={chip.color}>{chip.label}</StatusChip>
                  </div>
                  <div style={{ color: C.inkLight, fontSize: T.sz.xs, marginTop: 2 }}>
                    {new Date(o.orderDate).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}
                    {o.lineCount != null ? ` · ${o.lineCount} ref` : ""}
                    {o.totalUnits != null ? ` · ${Math.round(o.totalUnits)} uds` : ""}
                  </div>
                </div>
                <div style={{ fontWeight: T.wt.semibold, color: C.ink, flexShrink: 0, marginLeft: S[2] }}>
                  {fmtCOP(o.amount)}
                </div>
              </div>
            );
          })}
        </DetailSection>
      )}
    </div>
  );
}
