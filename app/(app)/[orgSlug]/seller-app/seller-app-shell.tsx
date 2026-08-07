/**
 * Seller App Shell — Mobile-first operational surface.
 *
 * Sprint: AGENTIK-SELLER-APP-UI-01
 *
 * "use client" — receives flat props from server page.
 * Primary target: 390px.
 * Bottom navigation: Inicio, Clientes, Nuevo pedido, Mi maleta, Pedidos
 * Block 1: Inicio + Clientes fully implemented. Others = routed placeholders.
 */
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { C, T, S, R, E } from "@/lib/ui/tokens";
import type {
  FrontlineAttentionItem,
  FrontlineAttentionResult,
  AttentionSeverity,
  CustomerCommercialContext,
} from "@/lib/comercial/frontline";
import type { SellerAppFeatureFlags } from "@/lib/comercial/frontline";

// ── Types ────────────────────────────────────────────────────────────────────

type SellerTab = "inicio" | "clientes" | "nuevo_pedido" | "mi_maleta" | "pedidos";

interface SerializedCustomer {
  id: string;
  name: string;
  nit: string | null;
  city: string | null;
  sellerSlug: string | null;
  totalReceivable: number;
  overdueReceivable: number;
  maxDpd: number;
  lastPurchaseDate: string | null;
}

interface SellerIdentityProps {
  sellerId: string | null;
  sellerName: string | null;
  sellerSlug: string | null;
  role: string;
  mappingSource: string;
  isSellerScoped: boolean;
  isManagerOrAbove: boolean;
}

interface SellerAppShellProps {
  orgSlug: string;
  orgId: string;
  sellerIdentity: SellerIdentityProps;
  attention: FrontlineAttentionResult;
  customers: SerializedCustomer[];
  inactiveCustomerIds: string[];
  inactiveCustomers: Array<{
    customerId: string;
    customerName: string;
    classification: string;
    lastPurchaseDate: string | null;
    daysSinceLastPurchase: number | null;
    receivables: { total: number; overdue: number; maxDaysOverdue: number } | null;
  }>;
  features: SellerAppFeatureFlags;
}

// ── Format helpers ───────────────────────────────────────────────────────────

function fmtCOP(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  if (n === 0) return "\u2014";
  return `$${n.toLocaleString("es-CO")}`;
}

function fmtDaysAgo(iso: string | null): string {
  if (!iso) return "\u2014";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return "Hoy";
  if (days === 1) return "Ayer";
  return `${days}d`;
}

// ── Severity colors ──────────────────────────────────────────────────────────

const SEV_BG: Record<AttentionSeverity, string> = {
  critical: C.redLight,
  warning: C.amberLight,
  info: C.blueLight,
};
const SEV_BORDER: Record<AttentionSeverity, string> = {
  critical: C.redBorder,
  warning: C.amberBorder,
  info: C.blueBorder,
};
const SEV_TEXT: Record<AttentionSeverity, string> = {
  critical: C.redDark,
  warning: C.amberDark,
  info: C.blue,
};
const SEV_ICON: Record<AttentionSeverity, string> = {
  critical: "\u26A0",
  warning: "\u25B2",
  info: "\u2139",
};

// ── Nav items ────────────────────────────────────────────────────────────────

const NAV_ITEMS: Array<{ key: SellerTab; label: string; icon: string }> = [
  { key: "inicio", label: "Inicio", icon: "\u2302" },
  { key: "clientes", label: "Clientes", icon: "\uD83D\uDC64" },
  { key: "nuevo_pedido", label: "Pedido", icon: "\u002B" },
  { key: "mi_maleta", label: "Maleta", icon: "\uD83D\uDCBC" },
  { key: "pedidos", label: "Pedidos", icon: "\uD83D\uDCCB" },
];

// ── Main Shell ───────────────────────────────────────────────────────────────

export function SellerAppShell(props: SellerAppShellProps) {
  const [activeTab, setActiveTab] = useState<SellerTab>("inicio");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const handleSelectCustomer = useCallback((id: string) => {
    setSelectedCustomerId(id);
  }, []);

  const handleBackFromDetail = useCallback(() => {
    setSelectedCustomerId(null);
  }, []);

  return (
    <div style={{
      fontFamily: T.mono,
      fontSize: T.sz.base,
      color: C.ink,
      background: C.surface,
      minHeight: "100dvh",
      display: "flex",
      flexDirection: "column",
      maxWidth: 430,
      margin: "0 auto",
      position: "relative",
    }}>
      {/* Header */}
      <header style={{
        padding: `${S[3]}px ${S[4]}px`,
        background: C.blueDark,
        color: C.white,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: T.sz.lg, fontWeight: T.wt.semibold }}>
            {props.sellerIdentity.sellerName ?? "Vendedor"}
          </div>
          <div style={{ fontSize: T.sz.xs, opacity: 0.7 }}>
            {props.sellerIdentity.isManagerOrAbove ? "Administrador" : "Vendedor"}
          </div>
        </div>
        <div style={{
          width: 32, height: 32, borderRadius: R.pill,
          background: "rgba(255,255,255,0.2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: T.sz.lg, fontWeight: T.wt.bold,
        }}>
          {(props.sellerIdentity.sellerName ?? "V")[0].toUpperCase()}
        </div>
      </header>

      {/* Content */}
      <main style={{ flex: 1, overflow: "auto", paddingBottom: 64 }}>
        {activeTab === "inicio" && (
          <InicioView attention={props.attention} orgSlug={props.orgSlug} />
        )}
        {activeTab === "clientes" && !selectedCustomerId && (
          <ClientesView
            customers={props.customers}
            inactiveCustomerIds={props.inactiveCustomerIds}
            inactiveCustomers={props.inactiveCustomers}
            orgSlug={props.orgSlug}
            orgId={props.orgId}
            onSelectCustomer={handleSelectCustomer}
          />
        )}
        {activeTab === "clientes" && selectedCustomerId && (
          <ClienteDetailView
            customerId={selectedCustomerId}
            orgSlug={props.orgSlug}
            orgId={props.orgId}
            customers={props.customers}
            onBack={handleBackFromDetail}
          />
        )}
        {activeTab === "nuevo_pedido" && <PlaceholderView title="Nuevo pedido" />}
        {activeTab === "mi_maleta" && <PlaceholderView title="Mi maleta" />}
        {activeTab === "pedidos" && <PlaceholderView title="Pedidos" />}
      </main>

      {/* Bottom nav */}
      <nav style={{
        position: "fixed",
        bottom: 0,
        left: "50%",
        transform: "translateX(-50%)",
        width: "100%",
        maxWidth: 430,
        background: C.white,
        borderTop: `1px solid ${C.line}`,
        display: "flex",
        boxShadow: E.md,
        zIndex: 100,
      }}>
        {NAV_ITEMS.map(item => {
          const isActive = activeTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => { setActiveTab(item.key); setSelectedCustomerId(null); }}
              style={{
                flex: 1,
                padding: `${S[2]}px 0`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: isActive ? C.blueDark : C.inkLight,
                fontFamily: T.mono,
                fontSize: T.sz.xs,
                fontWeight: isActive ? T.wt.semibold : T.wt.normal,
                transition: "color 0.15s",
              }}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

// ── Inicio View ──────────────────────────────────────────────────────────────

function InicioView({
  attention,
  orgSlug,
}: {
  attention: FrontlineAttentionResult;
  orgSlug: string;
}) {
  const items = attention.items;
  const criticalCount = items.filter(i => i.severity === "critical").length;
  const warningCount = items.filter(i => i.severity === "warning").length;

  return (
    <div style={{ padding: S[4] }}>
      {/* Summary strip */}
      <div style={{
        display: "flex",
        gap: S[2],
        marginBottom: S[4],
      }}>
        <SummaryChip
          label="Criticas"
          count={criticalCount}
          bg={C.redLight}
          color={C.redDark}
          border={C.redBorder}
        />
        <SummaryChip
          label="Alertas"
          count={warningCount}
          bg={C.amberLight}
          color={C.amberDark}
          border={C.amberBorder}
        />
        <SummaryChip
          label="Total"
          count={items.length}
          bg={C.blueLight}
          color={C.blue}
          border={C.blueBorder}
        />
      </div>

      {/* Attention items */}
      {items.length === 0 ? (
        <div style={{
          textAlign: "center",
          padding: `${S[10]}px ${S[4]}px`,
          color: C.inkLight,
          fontSize: T.sz.md,
        }}>
          Sin alertas pendientes
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
          {items.map((item, i) => (
            <AttentionCard key={item.deduplicationKey ?? i} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryChip({
  label,
  count,
  bg,
  color,
  border,
}: {
  label: string;
  count: number;
  bg: string;
  color: string;
  border: string;
}) {
  return (
    <div style={{
      flex: 1,
      padding: `${S[2]}px ${S[3]}px`,
      background: bg,
      border: `1px solid ${border}`,
      borderRadius: R.md,
      textAlign: "center",
    }}>
      <div style={{ fontSize: T.sz["2xl"], fontWeight: T.wt.bold, color }}>
        {count}
      </div>
      <div style={{ fontSize: T.sz.xs, color, opacity: 0.8 }}>
        {label}
      </div>
    </div>
  );
}

function AttentionCard({ item }: { item: FrontlineAttentionItem }) {
  return (
    <div style={{
      padding: S[3],
      background: SEV_BG[item.severity],
      border: `1px solid ${SEV_BORDER[item.severity]}`,
      borderRadius: R.lg,
    }}>
      <div style={{
        display: "flex",
        alignItems: "flex-start",
        gap: S[2],
      }}>
        <span style={{
          fontSize: T.sz.lg,
          color: SEV_TEXT[item.severity],
          flexShrink: 0,
          marginTop: 1,
        }}>
          {SEV_ICON[item.severity]}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: T.sz.sm,
            fontWeight: T.wt.medium,
            color: SEV_TEXT[item.severity],
            lineHeight: 1.4,
          }}>
            {item.title}
          </div>
          {item.suggestedAction && (
            <div style={{
              fontSize: T.sz.xs,
              color: C.inkMid,
              marginTop: S[1],
            }}>
              {item.suggestedAction}
            </div>
          )}
        </div>
        <SeverityBadge severity={item.severity} />
      </div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: AttentionSeverity }) {
  const labels: Record<AttentionSeverity, string> = {
    critical: "Critica",
    warning: "Alerta",
    info: "Info",
  };
  return (
    <span style={{
      fontSize: T.sz.xs,
      fontWeight: T.wt.medium,
      color: SEV_TEXT[severity],
      background: "rgba(255,255,255,0.5)",
      padding: `2px ${S[2]}px`,
      borderRadius: R.pill,
      whiteSpace: "nowrap",
      flexShrink: 0,
    }}>
      {labels[severity]}
    </span>
  );
}

// ── Clientes View ────────────────────────────────────────────────────────────

function ClientesView({
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

    if (showInactiveOnly) {
      list = list.filter(c => inactiveSet.has(c.id));
    }

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
      {/* Search */}
      <input
        type="text"
        placeholder="Buscar cliente..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          width: "100%",
          padding: `${S[2]}px ${S[3]}px`,
          border: `1px solid ${C.line}`,
          borderRadius: R.md,
          fontFamily: T.mono,
          fontSize: T.sz.md,
          background: C.white,
          outline: "none",
          boxSizing: "border-box",
          marginBottom: S[3],
        }}
      />

      {/* Inactive filter */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: S[2],
        marginBottom: S[4],
      }}>
        <button
          onClick={() => setShowInactiveOnly(false)}
          style={{
            ...filterBtn,
            background: !showInactiveOnly ? C.blueDark : C.white,
            color: !showInactiveOnly ? C.white : C.inkMid,
            border: `1px solid ${!showInactiveOnly ? C.blueDark : C.line}`,
          }}
        >
          Todos ({customers.length})
        </button>
        <button
          onClick={() => setShowInactiveOnly(true)}
          style={{
            ...filterBtn,
            background: showInactiveOnly ? C.amberDark : C.white,
            color: showInactiveOnly ? C.white : C.inkMid,
            border: `1px solid ${showInactiveOnly ? C.amberDark : C.line}`,
          }}
        >
          Inactivos +90d ({inactiveCustomerIds.length})
        </button>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div style={{
          textAlign: "center",
          padding: `${S[10]}px ${S[4]}px`,
          color: C.inkLight,
          fontSize: T.sz.md,
        }}>
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
              <CustomerCard
                key={c.id}
                customer={c}
                isInactive={isInactive}
                inactiveInfo={inactiveInfo}
                onSelect={() => onSelectCustomer(c.id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

const filterBtn: React.CSSProperties = {
  padding: `${S[1]}px ${S[3]}px`,
  borderRadius: R.pill,
  fontFamily: T.mono,
  fontSize: T.sz.sm,
  fontWeight: T.wt.medium,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

function CustomerCard({
  customer,
  isInactive,
  inactiveInfo,
  onSelect,
}: {
  customer: SerializedCustomer;
  isInactive: boolean;
  inactiveInfo: SellerAppShellProps["inactiveCustomers"][number] | null;
  onSelect: () => void;
}) {
  const hasOverdue = customer.overdueReceivable > 0 && customer.maxDpd > 30;

  return (
    <button
      onClick={onSelect}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: S[3],
        background: C.white,
        border: `1px solid ${hasOverdue ? C.redBorder : isInactive ? C.amberBorder : C.line}`,
        borderRadius: R.lg,
        cursor: "pointer",
        fontFamily: T.mono,
      }}
    >
      {/* Row 1: Name + badges */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: S[1],
        marginBottom: S[1],
      }}>
        <span style={{
          fontSize: T.sz.md,
          fontWeight: T.wt.semibold,
          color: C.ink,
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {customer.name}
        </span>
        {isInactive && (
          <span style={{
            fontSize: T.sz.xs,
            color: C.amberDark,
            background: C.amberLight,
            padding: `1px ${S[1]}px`,
            borderRadius: R.sm,
            whiteSpace: "nowrap",
          }}>
            {inactiveInfo?.daysSinceLastPurchase
              ? `${inactiveInfo.daysSinceLastPurchase}d`
              : "Sin compras"}
          </span>
        )}
        {hasOverdue && (
          <span style={{
            fontSize: T.sz.xs,
            color: C.redDark,
            background: C.redLight,
            padding: `1px ${S[1]}px`,
            borderRadius: R.sm,
            whiteSpace: "nowrap",
          }}>
            {customer.maxDpd}d vencido
          </span>
        )}
      </div>

      {/* Row 2: City + NIT */}
      <div style={{
        fontSize: T.sz.xs,
        color: C.inkLight,
        marginBottom: S[1],
      }}>
        {customer.city ?? "\u2014"}{customer.nit ? ` \u00B7 ${customer.nit}` : ""}
      </div>

      {/* Row 3: Cartera + Last purchase */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: T.sz.xs,
        color: C.inkMid,
      }}>
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

// ── Cliente Detail View ──────────────────────────────────────────────────────

function ClienteDetailView({
  customerId,
  orgSlug,
  orgId,
  customers,
  onBack,
}: {
  customerId: string;
  orgSlug: string;
  orgId: string;
  customers: SerializedCustomer[];
  onBack: () => void;
}) {
  const [context, setContext] = useState<CustomerCommercialContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const customer = customers.find(c => c.id === customerId);

  // Load commercial context on mount / customerId change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setContext(null);

    fetch(`/api/orgs/${orgSlug}/comercial/customer-context?customerId=${customerId}`)
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then(data => {
        if (!cancelled) { setContext(data); setLoading(false); }
      })
      .catch(() => {
        if (!cancelled) { setError("No se pudo cargar el detalle"); setLoading(false); }
      });

    return () => { cancelled = true; };
  }, [orgSlug, customerId]);

  return (
    <div style={{ padding: S[4] }}>
      {/* Back button + name */}
      <button
        onClick={onBack}
        style={{
          display: "flex",
          alignItems: "center",
          gap: S[1],
          border: "none",
          background: "transparent",
          cursor: "pointer",
          fontFamily: T.mono,
          fontSize: T.sz.md,
          color: C.blueDark,
          padding: 0,
          marginBottom: S[3],
        }}
      >
        \u2190 Clientes
      </button>

      <h2 style={{
        fontSize: T.sz.xl,
        fontWeight: T.wt.semibold,
        color: C.ink,
        margin: `0 0 ${S[1]}px`,
        fontFamily: T.mono,
      }}>
        {customer?.name ?? "Cliente"}
      </h2>
      <div style={{ fontSize: T.sz.xs, color: C.inkLight, marginBottom: S[4] }}>
        {customer?.city ?? "\u2014"}{customer?.nit ? ` \u00B7 NIT: ${customer.nit}` : ""}
      </div>

      {/* Cartera summary (from list data — always available) */}
      {customer && (
        <DetailSection title="Cartera">
          <div style={{ display: "flex", gap: S[3] }}>
            <DetailKpi label="Total" value={fmtCOP(customer.totalReceivable)} />
            <DetailKpi
              label="Vencida"
              value={fmtCOP(customer.overdueReceivable)}
              color={customer.overdueReceivable > 0 ? C.red : undefined}
            />
            <DetailKpi
              label="Max dias"
              value={customer.maxDpd > 0 ? `${customer.maxDpd}d` : "\u2014"}
              color={customer.maxDpd > 30 ? C.red : undefined}
            />
          </div>
        </DetailSection>
      )}

      {/* Loading / Error states */}
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

      {/* Context loaded */}
      {context && !loading && (
        <>
          {/* Receivables detail (from API) */}
          {context.receivables && (
            <DetailSection title="Detalle cartera">
              <div style={{ display: "flex", gap: S[3], flexWrap: "wrap" }}>
                <DetailKpi label="Documentos vencidos" value={String(context.receivables.overdueDocumentCount)} />
                <DetailKpi label="Max dias vencido" value={`${context.receivables.maxDaysOverdue}d`} />
              </div>
            </DetailSection>
          )}

          {/* Top products by units */}
          {context.topProductsByUnits.length > 0 && (
            <DetailSection title="Top productos (unidades)">
              {context.topProductsByUnits.slice(0, 5).map((p, i) => (
                <div key={p.referenceCode} style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: `${S[1]}px 0`,
                  borderBottom: i < 4 ? `1px solid ${C.lineSubtle}` : undefined,
                  fontSize: T.sz.sm,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: T.wt.medium, color: C.ink }}>
                      {p.referenceCode}
                    </div>
                    <div style={{
                      color: C.inkLight,
                      fontSize: T.sz.xs,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {p.description}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, marginLeft: S[2] }}>
                    <div style={{ fontWeight: T.wt.semibold }}>{p.totalUnits} uds</div>
                    <div style={{ fontSize: T.sz.xs, color: C.inkLight }}>
                      {p.purchaseCount} pedidos
                    </div>
                  </div>
                </div>
              ))}
            </DetailSection>
          )}

          {/* Recent activity */}
          <DetailSection title="Actividad reciente">
            <div style={{ display: "flex", gap: S[3] }}>
              <DetailKpi label="Pedidos 12M" value={String(context.totalOrdersL12)} />
              <DetailKpi
                label="Ult compra"
                value={fmtDaysAgo(context.lastPurchaseDate)}
              />
            </div>
          </DetailSection>
        </>
      )}
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      marginBottom: S[4],
      background: C.white,
      border: `1px solid ${C.line}`,
      borderRadius: R.lg,
      overflow: "hidden",
    }}>
      <div style={{
        padding: `${S[2]}px ${S[3]}px`,
        background: C.surfaceAlt,
        borderBottom: `1px solid ${C.line}`,
        fontSize: T.sz.sm,
        fontWeight: T.wt.semibold,
        color: C.inkMid,
        textTransform: "uppercase" as const,
        letterSpacing: "0.03em",
      }}>
        {title}
      </div>
      <div style={{ padding: S[3] }}>
        {children}
      </div>
    </div>
  );
}

function DetailKpi({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: T.sz.xs, color: C.inkLight, marginBottom: 2 }}>{label}</div>
      <div style={{
        fontSize: T.sz.lg,
        fontWeight: T.wt.semibold,
        color: color ?? C.ink,
      }}>
        {value}
      </div>
    </div>
  );
}

// ── Placeholder View ─────────────────────────────────────────────────────────

function PlaceholderView({ title }: { title: string }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: `${S[12]}px ${S[4]}px`,
      color: C.inkLight,
      textAlign: "center",
    }}>
      <div style={{ fontSize: T.sz["2xl"], fontWeight: T.wt.semibold, marginBottom: S[2] }}>
        {title}
      </div>
      <div style={{ fontSize: T.sz.md }}>
        Disponible en la siguiente version
      </div>
    </div>
  );
}
