/**
 * Seller App — Home View.
 *
 * Sprint: AGENTIK-SELLER-APP-UI-02
 * Sprint: AGENTIK-SELLER-APP-UI-03 (enable Maleta + Alertas shortcuts)
 *
 * Home exposes:
 *   Action shortcuts: Tomar pedido, Clientes, Mi maleta, Pedidos, Alertas, Perfil
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
  SellerAppFeatureFlags,
} from "@/lib/comercial/frontline";
import { useSellerLocation } from "@/hooks/use-seller-location";
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

function buildHomeActions(features: SellerAppFeatureFlags): HomeAction[] {
  return [
    { key: "pedido", label: "Tomar pedido", icon: "\u002B", tab: "nuevo_pedido" },
    { key: "clientes", label: "Clientes", icon: "\uD83D\uDC64", tab: "clientes" },
    { key: "maleta", label: "Mi maleta", icon: "\uD83D\uDCBC", tab: "maleta" },
    { key: "pedidos", label: "Pedidos", icon: "\uD83D\uDCCB", tab: "pedidos" },
    { key: "alertas", label: "Alertas", icon: "\u26A0", tab: "alertas" },
    {
      key: "catalogo",
      label: "Crear catalogo",
      icon: "\uD83D\uDCF7",
      disabled: !features.SELLER_CATALOG_GENERATION,
      disabledLabel: features.SELLER_CATALOG_GENERATION ? undefined : "Proximamente",
    },
    { key: "perfil", label: "Perfil", icon: "\uD83D\uDC64", tab: "perfil" },
  ];
}

// ── Home View ───────────────────────────────────────────────────────────────

export function InicioView({
  attention,
  features,
  onNavigate,
}: {
  attention: FrontlineAttentionResult;
  orgSlug: string;
  features: SellerAppFeatureFlags;
  onNavigate?: (tab: SellerTab) => void;
}) {
  const items = attention.items;
  const criticalCount = items.filter(i => i.severity === "critical").length;
  const warningCount = items.filter(i => i.severity === "warning").length;
  const homeActions = buildHomeActions(features);
  const { permission, location, requestLocation } = useSellerLocation();

  return (
    <div style={{ padding: S[4] }}>
      {/* Location strip — truthful state */}
      <LocationStrip
        permission={permission}
        location={location}
        onRequest={requestLocation}
      />

      {/* Action shortcuts grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: S[2],
        marginBottom: S[4],
      }}>
        {homeActions.map(action => (
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

// ── Location strip (truthful states) ────────────────────────────────────────

function LocationStrip({
  permission,
  location,
  onRequest,
}: {
  permission: import("@/hooks/use-seller-location").LocationPermission;
  location: import("@/hooks/use-seller-location").SellerLocation | null;
  onRequest: () => void;
}) {
  // idle: not requested yet — show button to request
  if (permission === "idle") {
    return (
      <button
        onClick={onRequest}
        style={{
          display: "flex", alignItems: "center", gap: S[2],
          width: "100%", padding: `${S[2]}px ${S[3]}px`,
          background: C.blueLight, border: `1px solid ${C.blueBorder}`,
          borderRadius: R.md, cursor: "pointer", fontFamily: T.mono,
          fontSize: T.sz.xs, color: C.blue, marginBottom: S[3],
        }}
      >
        <span style={{ fontSize: 14 }}>{"\uD83D\uDCCD"}</span>
        Activar ubicacion
      </button>
    );
  }

  // requesting: waiting for browser response
  if (permission === "requesting") {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: S[2],
        padding: `${S[2]}px ${S[3]}px`, background: C.surfaceAlt,
        border: `1px solid ${C.line}`, borderRadius: R.md,
        fontSize: T.sz.xs, color: C.inkMid, marginBottom: S[3],
      }}>
        <span style={{ fontSize: 14 }}>{"\uD83D\uDCCD"}</span>
        Obteniendo ubicacion...
      </div>
    );
  }

  // denied: user denied permission
  if (permission === "denied") {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: S[2],
        padding: `${S[2]}px ${S[3]}px`, background: C.amberLight,
        border: `1px solid ${C.amberBorder}`, borderRadius: R.md,
        fontSize: T.sz.xs, color: C.amberDark, marginBottom: S[3],
      }}>
        <span style={{ fontSize: 14 }}>{"\uD83D\uDCCD"}</span>
        Ubicacion desactivada
      </div>
    );
  }

  // unavailable: device doesn't support geolocation
  if (permission === "unavailable") {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: S[2],
        padding: `${S[2]}px ${S[3]}px`, background: C.surfaceAlt,
        border: `1px solid ${C.line}`, borderRadius: R.md,
        fontSize: T.sz.xs, color: C.inkLight, marginBottom: S[3],
      }}>
        <span style={{ fontSize: 14 }}>{"\uD83D\uDCCD"}</span>
        Ubicacion no disponible
      </div>
    );
  }

  // granted: truthful presentation — no raw coordinates
  if (permission === "granted" && location) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: S[2],
        padding: `${S[2]}px ${S[3]}px`, background: C.greenLight,
        border: `1px solid ${C.greenBorder}`, borderRadius: R.md,
        fontSize: T.sz.xs, color: C.green, marginBottom: S[3],
      }}>
        <span style={{ fontSize: 14 }}>{"\uD83D\uDCCD"}</span>
        <span>Ubicacion activa</span>
        <span style={{ opacity: 0.7 }}>{"\u00B7"} Ciudad no disponible</span>
      </div>
    );
  }

  return null;
}
