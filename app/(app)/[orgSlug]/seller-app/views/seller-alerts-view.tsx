/**
 * Seller App — Dedicated Alertas View.
 *
 * Sprint: AGENTIK-SELLER-APP-UI-03
 *
 * Full attention list with severity filtering.
 * Consumes FrontlineAttentionResult (already loaded by server page).
 *
 * Deep links: each alert type maps to a specific seller app destination.
 */
"use client";

import { useState, useMemo } from "react";
import { C, T, S, R } from "@/lib/ui/tokens";
import type {
  FrontlineAttentionItem,
  FrontlineAttentionResult,
  AttentionSeverity,
} from "@/lib/comercial/frontline";
import {
  SEV_BG, SEV_BORDER, SEV_TEXT,
  filterBtnStyle, fmtDaysAgo,
  type SellerTab,
} from "./seller-app-shared";
import { SellerIcon, StatusChip, EmptyState } from "./seller-ui-kit";

// ── Filter tabs ─────────────────────────────────────────────────────────────

type AlertFilter = "all" | "critical" | "warning" | "info";

const FILTERS: Array<{ key: AlertFilter; label: string }> = [
  { key: "all", label: "Todas" },
  { key: "critical", label: "Criticas" },
  { key: "warning", label: "Pendientes" },
  { key: "info", label: "Info" },
];

// ── Deep link mapping ───────────────────────────────────────────────────────

type DeepLinkTarget = { tab: SellerTab; context?: Record<string, string> };

function resolveDeepLink(item: FrontlineAttentionItem): DeepLinkTarget | null {
  switch (item.type) {
    case "SAMPLE_WITHDRAWAL_REQUIRED":
      return { tab: "maleta", context: { section: "retiro" } };
    case "PORTFOLIO_SUPPLY_REQUIRED":
    case "PORTFOLIO_COVERAGE_AT_RISK":
      return { tab: "maleta", context: { section: "surtido" } };
    case "ORDER_PENDING_SYNC":
    case "ORDER_SYNC_FAILED":
    case "ORDER_CONFIRMED":
      return item.orderId
        ? { tab: "pedidos", context: { orderId: item.orderId } }
        : { tab: "pedidos" };
    case "CUSTOMER_INACTIVE_90D":
      return item.customerId
        ? { tab: "clientes", context: { customerId: item.customerId } }
        : { tab: "clientes" };
    case "CUSTOMER_OVERDUE_WHILE_ORDERING":
    case "CUSTOMER_OVERDUE_RECEIVABLE":
      return item.customerId
        ? { tab: "clientes", context: { customerId: item.customerId } }
        : null;
    default:
      return null;
  }
}

// ── Type labels ─────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  SAMPLE_WITHDRAWAL_REQUIRED: "Retiro de muestra",
  PORTFOLIO_SUPPLY_REQUIRED: "Surtido requerido",
  PORTFOLIO_COVERAGE_AT_RISK: "Cobertura en riesgo",
  ORDER_PENDING_SYNC: "Pedido pendiente",
  ORDER_SYNC_FAILED: "Error sincronizacion",
  ORDER_CONFIRMED: "Pedido confirmado",
  CUSTOMER_INACTIVE_90D: "Cliente inactivo",
  CUSTOMER_OVERDUE_WHILE_ORDERING: "Cartera vencida",
  CUSTOMER_OVERDUE_RECEIVABLE: "Cartera vencida",
};

// ── Main View ───────────────────────────────────────────────────────────────

export function SellerAlertsView({
  attention,
  onNavigate,
}: {
  attention: FrontlineAttentionResult;
  onNavigate?: (tab: SellerTab, context?: Record<string, string>) => void;
}) {
  const [filter, setFilter] = useState<AlertFilter>("all");
  const items = attention.items;

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter(i => i.severity === filter);
  }, [items, filter]);

  const criticalCount = items.filter(i => i.severity === "critical").length;
  const warningCount = items.filter(i => i.severity === "warning").length;
  const infoCount = items.filter(i => i.severity === "info").length;

  return (
    <div style={{ padding: S[4] }}>
      {/* Header */}
      <div style={{
        fontSize: T.sz.xl, fontWeight: T.wt.bold, color: C.titleDeep,
        marginBottom: S[3],
      }}>
        Alertas
      </div>

      {/* Summary strip */}
      <div style={{ display: "flex", gap: S[2], marginBottom: S[3] }}>
        <SummaryChip label="Criticas" count={criticalCount} bg={C.redLight} color={C.redDark} border={C.redBorder} />
        <SummaryChip label="Alertas" count={warningCount} bg={C.amberLight} color={C.amberDark} border={C.amberBorder} />
        <SummaryChip label="Info" count={infoCount} bg={C.blueLight} color={C.blue} border={C.blueBorder} />
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: S[1], marginBottom: S[3], overflowX: "auto" }}>
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              ...filterBtnStyle, minHeight: 38,
              background: filter === f.key ? C.blueDark : C.white,
              color: filter === f.key ? C.white : C.ink,
              border: `1.5px solid ${filter === f.key ? C.blueDark : C.line}`,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Alert items */}
      {filtered.length === 0 ? (
        <EmptyState
          icon="bell"
          title={filter === "all" ? "Sin alertas pendientes" : `Sin alertas ${FILTERS.find(f => f.key === filter)?.label.toLowerCase()}`}
          subtitle={filter === "all" ? "Todo al día en tu operación" : undefined}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
          {filtered.map((item, i) => (
            <AlertDetailCard
              key={item.deduplicationKey ?? i}
              item={item}
              onAction={() => {
                const target = resolveDeepLink(item);
                if (target && onNavigate) onNavigate(target.tab, target.context);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SummaryChip({ label, count, bg, color, border }: {
  label: string; count: number; bg: string; color: string; border: string;
}) {
  return (
    <div style={{
      flex: 1, padding: `${S[2]}px ${S[3]}px`, background: bg,
      border: `1px solid ${border}`, borderRadius: R.md, textAlign: "center",
    }}>
      <div style={{ fontSize: T.sz["2xl"], fontWeight: T.wt.bold, color }}>{count}</div>
      <div style={{ fontSize: T.sz.xs, color, opacity: 0.8 }}>{label}</div>
    </div>
  );
}

function AlertDetailCard({ item, onAction }: { item: FrontlineAttentionItem; onAction: () => void }) {
  const typeLabel = TYPE_LABELS[item.type] ?? item.type;
  const deepLink = resolveDeepLink(item);
  // §32: retiro de muestra — referencia visible + CTA específica
  const isWithdrawal = item.type === "SAMPLE_WITHDRAWAL_REQUIRED";
  const ctaLabel = isWithdrawal ? "Ver retiro" : "Ver detalle";

  return (
    <div style={{
      padding: S[3], background: SEV_BG[item.severity],
      border: `1px solid ${SEV_BORDER[item.severity]}`, borderRadius: 16,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: S[2] }}>
        {isWithdrawal ? (
          <span aria-hidden style={{
            width: 48, height: 48, borderRadius: 12, flexShrink: 0,
            background: "rgba(255,255,255,0.65)",
            display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden",
          }}>
            {item.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.imageUrl} alt={item.referenceCode ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
            ) : (
              <SellerIcon name="box" size={20} color={SEV_TEXT[item.severity]} />
            )}
          </span>
        ) : (
          <span style={{ flexShrink: 0, marginTop: 1 }}>
            <SellerIcon
              name={item.severity === "info" ? "info" : "alert"}
              size={17}
              color={SEV_TEXT[item.severity]}
            />
          </span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Type badge */}
          <div style={{
            fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: SEV_TEXT[item.severity],
            textTransform: "uppercase" as const, letterSpacing: "0.05em",
            marginBottom: 2, opacity: 0.85,
          }}>
            {typeLabel}
          </div>
          {/* Title */}
          <div style={{ fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: SEV_TEXT[item.severity], lineHeight: 1.45 }}>
            {item.title}
          </div>
          {/* Reference (retiro) */}
          {isWithdrawal && item.referenceCode && (
            <div style={{ fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink, marginTop: 2 }}>
              Ref. {item.referenceCode}
            </div>
          )}
          {/* Evidence summary — motivo real; en retiro se suma la acción clara */}
          {item.suggestedAction && (
            <div style={{ fontSize: T.sz.xs, color: C.inkMid, marginTop: S[1], lineHeight: 1.5 }}>
              {item.suggestedAction}
            </div>
          )}
          {isWithdrawal && (
            <div style={{ fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: SEV_TEXT[item.severity], marginTop: S[1] }}>
              Retira esta muestra de tu maleta
            </div>
          )}
          {/* Deep link CTA */}
          {deepLink && (
            <button
              onClick={onAction}
              style={{
                marginTop: S[2], padding: `${S[2]}px ${S[3]}px`, minHeight: 38,
                background: "rgba(255,255,255,0.8)", border: `1px solid ${SEV_BORDER[item.severity]}`,
                borderRadius: 12, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
                color: SEV_TEXT[item.severity], cursor: "pointer", fontFamily: T.mono,
                display: "inline-flex", alignItems: "center", gap: 5, touchAction: "manipulation",
              }}
            >
              {ctaLabel} <SellerIcon name="chevronRight" size={13} color={SEV_TEXT[item.severity]} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
