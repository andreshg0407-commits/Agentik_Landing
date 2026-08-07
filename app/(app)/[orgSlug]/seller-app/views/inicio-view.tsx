/**
 * Seller App — Home View.
 *
 * Sprint: AGENTIK-SELLER-APP-UI-02
 *
 * Home exposes:
 *   Action shortcuts: Tomar pedido, Clientes, Crear catalogo, Alertas, Mi maleta, Pedidos, Perfil
 *   Attention summary strip (critical/warning/total)
 *   Attention items (from FrontlineAttention)
 *
 * Catalog = feature-gated (Proximamente).
 */
"use client";

import { C, T, S, R, E } from "@/lib/ui/tokens";
import type {
  FrontlineAttentionItem,
  FrontlineAttentionResult,
  AttentionSeverity,
} from "@/lib/comercial/frontline";
import { SEV_BG, SEV_BORDER, SEV_TEXT, SEV_ICON, type SellerTab } from "./seller-app-shared";

// ── Action shortcut definitions ─────────────────────────────────────────────

interface HomeAction {
  key: string;
  label: string;
  icon: string;
  tab?: SellerTab;
  disabled?: boolean;
  disabledLabel?: string;
}

const HOME_ACTIONS: HomeAction[] = [
  { key: "pedido", label: "Tomar pedido", icon: "\u002B", tab: "nuevo_pedido" },
  { key: "clientes", label: "Clientes", icon: "\uD83D\uDC64", tab: "clientes" },
  { key: "catalogo", label: "Catalogo", icon: "\uD83D\uDCF7", disabled: true, disabledLabel: "Proximamente" },
  { key: "maleta", label: "Mi maleta", icon: "\uD83D\uDCBC", disabled: true, disabledLabel: "Proximamente" },
  { key: "pedidos", label: "Pedidos", icon: "\uD83D\uDCCB", tab: "pedidos" },
  { key: "perfil", label: "Perfil", icon: "\uD83D\uDC64", tab: "perfil" },
];

// ── Home View ───────────────────────────────────────────────────────────────

export function InicioView({
  attention,
  onNavigate,
}: {
  attention: FrontlineAttentionResult;
  orgSlug: string;
  onNavigate?: (tab: SellerTab) => void;
}) {
  const items = attention.items;
  const criticalCount = items.filter(i => i.severity === "critical").length;
  const warningCount = items.filter(i => i.severity === "warning").length;

  return (
    <div style={{ padding: S[4] }}>
      {/* Action shortcuts grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: S[2],
        marginBottom: S[4],
      }}>
        {HOME_ACTIONS.map(action => (
          <button
            key={action.key}
            onClick={() => {
              if (!action.disabled && action.tab && onNavigate) onNavigate(action.tab);
            }}
            disabled={action.disabled}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              padding: `${S[3]}px ${S[2]}px`,
              background: C.white,
              border: `1px solid ${C.line}`,
              borderRadius: R.lg,
              cursor: action.disabled ? "default" : "pointer",
              fontFamily: T.mono,
              opacity: action.disabled ? 0.5 : 1,
              minHeight: 72,
            }}
          >
            <span style={{ fontSize: 24, lineHeight: 1 }}>{action.icon}</span>
            <span style={{ fontSize: T.sz.xs, color: C.ink, fontWeight: T.wt.medium, textAlign: "center" }}>
              {action.label}
            </span>
            {action.disabled && action.disabledLabel && (
              <span style={{ fontSize: 9, color: C.inkLight }}>{action.disabledLabel}</span>
            )}
          </button>
        ))}
      </div>

      {/* Alertas section header */}
      <div style={{
        fontSize: T.sz.sm,
        fontWeight: T.wt.semibold,
        color: C.inkMid,
        textTransform: "uppercase" as const,
        letterSpacing: "0.03em",
        marginBottom: S[2],
      }}>
        Alertas
      </div>

      {/* Summary strip */}
      <div style={{ display: "flex", gap: S[2], marginBottom: S[3] }}>
        <SummaryChip label="Criticas" count={criticalCount} bg={C.redLight} color={C.redDark} border={C.redBorder} />
        <SummaryChip label="Alertas" count={warningCount} bg={C.amberLight} color={C.amberDark} border={C.amberBorder} />
        <SummaryChip label="Total" count={items.length} bg={C.blueLight} color={C.blue} border={C.blueBorder} />
      </div>

      {/* Attention items */}
      {items.length === 0 ? (
        <div style={{ textAlign: "center", padding: `${S[8]}px ${S[4]}px`, color: C.inkLight, fontSize: T.sz.md }}>
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

// ── Shared sub-components ───────────────────────────────────────────────────

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

function AttentionCard({ item }: { item: FrontlineAttentionItem }) {
  return (
    <div style={{
      padding: S[3], background: SEV_BG[item.severity],
      border: `1px solid ${SEV_BORDER[item.severity]}`, borderRadius: R.lg,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: S[2] }}>
        <span style={{ fontSize: T.sz.lg, color: SEV_TEXT[item.severity], flexShrink: 0, marginTop: 1 }}>
          {SEV_ICON[item.severity]}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: T.sz.sm, fontWeight: T.wt.medium, color: SEV_TEXT[item.severity], lineHeight: 1.4 }}>
            {item.title}
          </div>
          {item.suggestedAction && (
            <div style={{ fontSize: T.sz.xs, color: C.inkMid, marginTop: S[1] }}>
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
  const labels: Record<AttentionSeverity, string> = { critical: "Critica", warning: "Alerta", info: "Info" };
  return (
    <span style={{
      fontSize: T.sz.xs, fontWeight: T.wt.medium, color: SEV_TEXT[severity],
      background: "rgba(255,255,255,0.5)", padding: `2px ${S[2]}px`,
      borderRadius: R.pill, whiteSpace: "nowrap", flexShrink: 0,
    }}>
      {labels[severity]}
    </span>
  );
}
