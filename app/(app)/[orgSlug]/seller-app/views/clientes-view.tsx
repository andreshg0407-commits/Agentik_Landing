/**
 * Seller App — Clientes (Customers) View + Detail.
 *
 * Sprint: AGENTIK-SELLER-APP-UI-02
 * Extracted from seller-app-shell.tsx.
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
import { SellerIcon, SearchField, StatusChip, EmptyState, appCard, btnPrimary } from "./seller-ui-kit";

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
  const [showInactiveOnly, setShowInactiveOnly] = useState(false);

  const inactiveSet = useMemo(() => new Set(inactiveCustomerIds), [inactiveCustomerIds]);

  const filtered = useMemo(() => {
    let list = customers;
    if (showInactiveOnly) list = list.filter(c => inactiveSet.has(c.id));
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.nit && c.nit.includes(q)) ||
        (c.city && c.city.toLowerCase().includes(q))
      );
    }
    return list;
  }, [customers, search, showInactiveOnly, inactiveSet]);

  return (
    <div style={{ padding: S[4] }}>
      <div style={{ marginBottom: S[3] }}>
        <SearchField value={search} onChange={setSearch} placeholder="Buscar cliente..." />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[4] }}>
        <button onClick={() => setShowInactiveOnly(false)} style={{
          ...filterBtnStyle, minHeight: 38, border: `1.5px solid ${!showInactiveOnly ? C.blueDark : C.line}`,
          background: !showInactiveOnly ? C.blueDark : C.white,
          color: !showInactiveOnly ? C.white : C.ink,
        }}>
          Todos ({customers.length})
        </button>
        <button onClick={() => setShowInactiveOnly(true)} style={{
          ...filterBtnStyle, minHeight: 38, border: `1.5px solid ${showInactiveOnly ? C.amberDark : C.line}`,
          background: showInactiveOnly ? C.amberDark : C.white,
          color: showInactiveOnly ? C.white : C.ink,
        }}>
          Inactivos +90d ({inactiveCustomerIds.length})
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="users" title={search ? "Sin resultados" : "Sin clientes"}
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
                inactiveInfo={inactiveInfo} onSelect={() => onSelectCustomer(c.id)} />
            );
          })}
        </div>
      )}
    </div>
  );
}

function CustomerCard({ customer, isInactive, inactiveInfo, onSelect }: {
  customer: SerializedCustomer;
  isInactive: boolean;
  inactiveInfo: SellerAppShellProps["inactiveCustomers"][number] | null;
  onSelect: () => void;
}) {
  const hasOverdue = customer.overdueReceivable > 0 && customer.maxDpd > 30;
  return (
    <button onClick={onSelect} style={{
      ...appCard,
      display: "flex", alignItems: "flex-start", gap: S[3], width: "100%",
      textAlign: "left", padding: S[3],
      border: `1px solid ${hasOverdue ? C.redBorder : isInactive ? C.amberBorder : C.line}`,
      cursor: "pointer", fontFamily: T.mono, minHeight: 76, touchAction: "manipulation",
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
          {customer.city ?? "\u2014"}{customer.nit ? ` \u00B7 ${customer.nit}` : ""}
        </span>
        <span style={{ display: "flex", justifyContent: "space-between", gap: S[2], fontSize: T.sz.xs, color: C.inkMid }}>
          <span style={{ minWidth: 0 }}>
            Cartera: <strong style={{ color: C.ink }}>{fmtCOP(customer.totalReceivable)}</strong>
            {customer.overdueReceivable > 0 && (
              <span style={{ color: C.red }}> ({fmtCOP(customer.overdueReceivable)} vencida)</span>
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

// ── Cliente Detail View ─────────────────────────────────────────────────────

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const customer = customers.find(c => c.id === customerId);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setContext(null);

    fetch(`/api/orgs/${orgSlug}/comercial/customer-context?customerId=${customerId}`)
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then(data => { if (!cancelled) { setContext(data); setLoading(false); } })
      .catch(() => { if (!cancelled) { setError("No se pudo cargar el detalle"); setLoading(false); } });

    return () => { cancelled = true; };
  }, [orgSlug, customerId]);

  return (
    <div style={{ padding: S[4] }}>
      <button onClick={onBack} style={{
        display: "flex", alignItems: "center", gap: S[1], border: "none",
        background: "transparent", cursor: "pointer", fontFamily: T.mono,
        fontSize: T.sz.md, fontWeight: T.wt.semibold, color: C.blueDark,
        padding: `${S[2]}px 0`, minHeight: 44, marginBottom: S[1], touchAction: "manipulation",
      }}>
        <SellerIcon name="back" size={17} color={C.blueDark} /> Clientes
      </button>

      <h2 style={{
        fontSize: T.sz.xl, fontWeight: T.wt.semibold, color: C.ink,
        margin: `0 0 ${S[1]}px`, fontFamily: T.mono,
      }}>
        {customer?.name ?? "Cliente"}
      </h2>
      <div style={{ fontSize: T.sz.xs, color: C.inkLight, marginBottom: S[3] }}>
        {customer?.city ?? "\u2014"}{customer?.nit ? ` \u00B7 NIT: ${customer.nit}` : ""}
      </div>

      {/* §20: cartera vencida >30d — advertencia fuerte y controlada (NO bloquea) */}
      {customer && customer.overdueReceivable > 0 && customer.maxDpd > 30 && (
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

      {/* Create order CTA — acción primaria (§19) */}
      {onCreateOrder && (
        <button
          onClick={() => onCreateOrder(customerId)}
          style={{ ...btnPrimary, marginBottom: S[4] }}
        >
          <SellerIcon name="cart" size={19} color={C.white} />
          Crear pedido
        </button>
      )}

      {customer && (
        <DetailSection title="Cartera">
          <div style={{ display: "flex", gap: S[3] }}>
            <DetailKpi label="Total" value={fmtCOP(customer.totalReceivable)} />
            <DetailKpi label="Vencida" value={fmtCOP(customer.overdueReceivable)}
              color={customer.overdueReceivable > 0 ? C.red : undefined} />
            <DetailKpi label="Max dias" value={customer.maxDpd > 0 ? `${customer.maxDpd}d` : "\u2014"}
              color={customer.maxDpd > 30 ? C.red : undefined} />
          </div>
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
          {context.receivables && (
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
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: `${S[1]}px 0`,
                  borderBottom: i < 4 ? `1px solid ${C.lineSubtle}` : undefined,
                  fontSize: T.sz.sm,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: T.wt.medium, color: C.ink }}>{p.referenceCode}</div>
                    <div style={{ color: C.inkLight, fontSize: T.sz.xs, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.description}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, marginLeft: S[2] }}>
                    <div style={{ fontWeight: T.wt.semibold }}>{p.totalUnits} uds</div>
                    <div style={{ fontSize: T.sz.xs, color: C.inkLight }}>{p.purchaseCount} pedidos</div>
                  </div>
                </div>
              ))}
            </DetailSection>
          )}

          <DetailSection title="Actividad reciente">
            <div style={{ display: "flex", gap: S[3] }}>
              <DetailKpi label="Pedidos 12M" value={String(context.totalOrdersL12)} />
              <DetailKpi label="Ult compra" value={fmtDaysAgo(context.lastPurchaseDate)} />
            </div>
          </DetailSection>
        </>
      )}
    </div>
  );
}
