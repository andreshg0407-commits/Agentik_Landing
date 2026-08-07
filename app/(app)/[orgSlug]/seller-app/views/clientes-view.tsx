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
      <input
        type="text"
        placeholder="Buscar cliente..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          width: "100%", padding: `${S[2]}px ${S[3]}px`, border: `1px solid ${C.line}`,
          borderRadius: R.md, fontFamily: T.mono, fontSize: T.sz.md, background: C.white,
          outline: "none", boxSizing: "border-box", marginBottom: S[3],
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[4] }}>
        <button onClick={() => setShowInactiveOnly(false)} style={{
          ...filterBtnStyle,
          background: !showInactiveOnly ? C.blueDark : C.white,
          color: !showInactiveOnly ? C.white : C.inkMid,
          border: `1px solid ${!showInactiveOnly ? C.blueDark : C.line}`,
        }}>
          Todos ({customers.length})
        </button>
        <button onClick={() => setShowInactiveOnly(true)} style={{
          ...filterBtnStyle,
          background: showInactiveOnly ? C.amberDark : C.white,
          color: showInactiveOnly ? C.white : C.inkMid,
          border: `1px solid ${showInactiveOnly ? C.amberDark : C.line}`,
        }}>
          Inactivos +90d ({inactiveCustomerIds.length})
        </button>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: `${S[10]}px ${S[4]}px`, color: C.inkLight, fontSize: T.sz.md }}>
          {search ? "Sin resultados" : "Sin clientes"}
        </div>
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
      display: "block", width: "100%", textAlign: "left", padding: S[3],
      background: C.white, border: `1px solid ${hasOverdue ? C.redBorder : isInactive ? C.amberBorder : C.line}`,
      borderRadius: R.lg, cursor: "pointer", fontFamily: T.mono,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: S[1], marginBottom: S[1] }}>
        <span style={{
          fontSize: T.sz.md, fontWeight: T.wt.semibold, color: C.ink, flex: 1, minWidth: 0,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {customer.name}
        </span>
        {isInactive && (
          <span style={{
            fontSize: T.sz.xs, color: C.amberDark, background: C.amberLight,
            padding: `1px ${S[1]}px`, borderRadius: R.sm, whiteSpace: "nowrap",
          }}>
            {inactiveInfo?.daysSinceLastPurchase ? `${inactiveInfo.daysSinceLastPurchase}d` : "Sin compras"}
          </span>
        )}
        {hasOverdue && (
          <span style={{
            fontSize: T.sz.xs, color: C.redDark, background: C.redLight,
            padding: `1px ${S[1]}px`, borderRadius: R.sm, whiteSpace: "nowrap",
          }}>
            {customer.maxDpd}d vencido
          </span>
        )}
      </div>
      <div style={{ fontSize: T.sz.xs, color: C.inkLight, marginBottom: S[1] }}>
        {customer.city ?? "\u2014"}{customer.nit ? ` \u00B7 ${customer.nit}` : ""}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: T.sz.xs, color: C.inkMid }}>
        <span>
          Cartera: {fmtCOP(customer.totalReceivable)}
          {customer.overdueReceivable > 0 && (
            <span style={{ color: C.red }}> ({fmtCOP(customer.overdueReceivable)} vencida)</span>
          )}
        </span>
        <span>Ult: {fmtDaysAgo(customer.lastPurchaseDate)}</span>
      </div>
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
        fontSize: T.sz.md, color: C.blueDark, padding: 0, marginBottom: S[3],
      }}>
        {"\u2190"} Clientes
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

      {/* Create order CTA */}
      {onCreateOrder && (
        <button
          onClick={() => onCreateOrder(customerId)}
          style={{
            width: "100%", padding: `${S[2]}px ${S[4]}px`, marginBottom: S[4],
            background: C.blueDark, color: C.white, border: "none",
            borderRadius: R.md, fontFamily: T.mono, fontSize: T.sz.md,
            fontWeight: T.wt.semibold, cursor: "pointer",
          }}
        >
          + Crear pedido
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
