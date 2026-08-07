/**
 * Seller App — Shared types, helpers, and primitives.
 *
 * Sprint: AGENTIK-SELLER-APP-UI-02
 * Sprint: AGENTIK-SELLER-APP-UI-03
 * Extracted from seller-app-shell.tsx for maintainability.
 */
"use client";

import { C, T, S, R } from "@/lib/ui/tokens";
import type {
  AttentionSeverity,
} from "@/lib/comercial/frontline";
import type { SellerAppFeatureFlags } from "@/lib/comercial/frontline";

// ── Types ────────────────────────────────────────────────────────────────────

export type SellerTab = "inicio" | "clientes" | "nuevo_pedido" | "pedidos" | "maleta" | "alertas" | "perfil";

// ── Serialized portfolio types (from server) ────────────────────────────────

export interface SerializedPortfolioRef {
  reference: string;
  description: string;
  line: string;
  sizeClass: string | null;
  centralAvailable: number;
  commercialHealth: string;
  suggestedAction: string;
  imageUrl: string | null;
  state: string; // "vigente" | "reemplazar" | etc.
}

export interface SerializedPortfolio {
  vendorId: string;
  vendorName: string;
  isActive: boolean;
  totalRefs: number;
  totalUnits: number;
  health: string;
  replaceRefs: number;
  healthyRefs: number;
  refs: SerializedPortfolioRef[];
}

export interface SerializedSupplyNeed {
  subgroupName: string;
  brand: string | null;
  commercialWorld: string;
  missingReferences: number;
  bestAction: string;
  bestActionExplanation: string;
  candidateCount: number;
}

// ── Serialized order types (from server) ────────────────────────────────────

export interface SerializedOrderCard {
  id: string;
  consecutivo: number;
  customerName: string;
  sellerName: string;
  totalReferences: number;
  totalUnits: number;
  totalValue: number;
  status: string;
  origin: string;
  syncState: string;
  createdAt: string;
  lastSyncAt: string | null;
  fulfillmentStatus: string; // FulfillmentStageStatus: COMPLETED | IN_PROGRESS | NOT_STARTED | NOT_AVAILABLE
  fulfillmentPercent: number | null; // null = NOT_AVAILABLE (no data source)
  channel: string | null;
}

export interface SerializedCustomer {
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

export interface SellerIdentityProps {
  sellerId: string | null;
  sellerName: string | null;
  sellerSlug: string | null;
  role: string;
  mappingSource: string;
  isSellerScoped: boolean;
  isManagerOrAbove: boolean;
}

export interface SellerAppShellProps {
  orgSlug: string;
  orgId: string;
  sellerIdentity: SellerIdentityProps;
  attention: import("@/lib/comercial/frontline").FrontlineAttentionResult;
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
  // Block 3: Portfolio + Orders
  portfolio: SerializedPortfolio | null;
  supplyNeeds: SerializedSupplyNeed[];
  orders: SerializedOrderCard[];
}

// ── Format helpers ──────────────────────────────────────────────────────────

export function fmtCOP(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  if (n === 0) return "\u2014";
  return `$${n.toLocaleString("es-CO")}`;
}

export function fmtDaysAgo(iso: string | null): string {
  if (!iso) return "\u2014";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return "Hoy";
  if (days === 1) return "Ayer";
  return `${days}d`;
}

// ── Severity colors ─────────────────────────────────────────────────────────

export const SEV_BG: Record<AttentionSeverity, string> = {
  critical: C.redLight,
  warning: C.amberLight,
  info: C.blueLight,
};
export const SEV_BORDER: Record<AttentionSeverity, string> = {
  critical: C.redBorder,
  warning: C.amberBorder,
  info: C.blueBorder,
};
export const SEV_TEXT: Record<AttentionSeverity, string> = {
  critical: C.redDark,
  warning: C.amberDark,
  info: C.blue,
};
export const SEV_ICON: Record<AttentionSeverity, string> = {
  critical: "\u26A0",
  warning: "\u25B2",
  info: "\u2139",
};

// ── Shared UI primitives ────────────────────────────────────────────────────

export function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
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

export function DetailKpi({
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

export const filterBtnStyle: React.CSSProperties = {
  padding: `${S[1]}px ${S[3]}px`,
  borderRadius: R.pill,
  fontFamily: T.mono,
  fontSize: T.sz.sm,
  fontWeight: T.wt.medium,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
