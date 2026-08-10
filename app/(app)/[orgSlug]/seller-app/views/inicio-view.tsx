/**
 * Seller App — Home View.
 *
 * Sprint: AGENTIK-SELLER-APP-UI-02
 * Sprint: AGENTIK-SELLER-APP-UI-03 (enable Maleta + Alertas shortcuts)
 * Sprint: AGENTIK-SELLER-APP-UX-01 (visual delivery pass)
 *
 * Home (CONTRATO LOCKED — §45):
 *   Acción dominante: Crear nuevo pedido (§8)
 *   Atajos: Clientes · Crear catálogo (gated) · Alertas (conteo real) · Mi portafolio
 *   Ubicación compacta (estados veraces) + vista previa de alertas (feed completo en Alertas).
 *
 * Catalog = feature-gated (Próximamente). Presentación only.
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
import { SEV_BG, SEV_BORDER, SEV_TEXT, type SellerTab } from "./seller-app-shared";
import { SellerIcon, SectionLabel, appCard, StatusChip } from "./seller-ui-kit";

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
  const unresolvedCount = items.length;
  const { permission, location, requestLocation } = useSellerLocation();
  const catalogEnabled = features.SELLER_CATALOG_GENERATION;

  return (
    <div style={{ padding: `${S[2]}px ${S[4]}px ${S[4]}px` }}>
      {/* Ubicación — compacta, jamás dominante (§35) */}
      <LocationStrip permission={permission} location={location} onRequest={requestLocation} />

      {/* ── ACCIÓN DOMINANTE (§8): Crear nuevo pedido ── */}
      <button
        onClick={() => onNavigate?.("nuevo_pedido")}
        style={{
          display: "flex", alignItems: "center", gap: S[4],
          width: "100%", minHeight: 116, padding: `${S[4]}px ${S[4]}px`,
          borderRadius: 20, border: "none", cursor: "pointer", textAlign: "left",
          background: `linear-gradient(135deg, ${C.blueDark} 0%, ${C.titleDeep} 100%)`,
          color: C.white, fontFamily: T.sans,
          boxShadow: "0 10px 28px rgba(0,74,173,0.32)",
          marginBottom: S[3], touchAction: "manipulation",
        }}
      >
        <span style={{
          width: 56, height: 56, borderRadius: 16, flexShrink: 0,
          background: "rgba(255,255,255,0.16)", border: "1px solid rgba(255,255,255,0.22)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <SellerIcon name="cart" size={28} color={C.white} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 19, fontWeight: T.wt.bold, lineHeight: 1.3, letterSpacing: "-0.3px" }}>
            Crear nuevo pedido
          </span>
          <span style={{ display: "block", fontSize: T.sz.sm, opacity: 0.85, marginTop: 3 }}>
            Registrar pedido del cliente
          </span>
        </span>
        <span aria-hidden style={{
          width: 40, height: 40, borderRadius: R.pill, flexShrink: 0,
          background: "rgba(255,255,255,0.16)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <SellerIcon name="arrowRight" size={20} color={C.white} />
        </span>
      </button>

      {/* ── Atajos secundarios (§9): 2 columnas ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
        <HomeShortcut
          icon="users" tint={C.blueLight} iconColor={C.blueDark}
          label="Clientes" subtitle="Consultar cartera y compras"
          onPress={() => onNavigate?.("clientes")}
        />
        <HomeShortcut
          icon="camera" tint={C.greenLight} iconColor={C.green}
          label="Crear catálogo"
          subtitle={catalogEnabled ? "Generar catálogo" : "Próximamente"}
          disabled={!catalogEnabled}
          onPress={catalogEnabled ? () => undefined : undefined}
        />
        <HomeShortcut
          icon="bell" tint={C.amberLight} iconColor={C.amber}
          label="Alertas"
          subtitle={unresolvedCount > 0 ? `${unresolvedCount} sin revisar` : "Al día"}
          subtitleColor={unresolvedCount > 0 ? C.amber : undefined}
          onPress={() => onNavigate?.("alertas")}
        />
        <HomeShortcut
          icon="box" tint={C.surfaceAlt} iconColor={C.titleDeep}
          label="Mi portafolio" subtitle="Mi mostrario"
          onPress={() => onNavigate?.("maleta")}
        />
      </div>

      {/* ── Vista previa de alertas (feed completo en la vista Alertas) ── */}
      {items.length > 0 && (
        <>
          <SectionLabel right={
            <button
              onClick={() => onNavigate?.("alertas")}
              style={{
                border: "none", background: "transparent", cursor: "pointer",
                fontFamily: T.sans, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                color: C.blueDark, padding: `${S[1]}px 0`, display: "flex", alignItems: "center", gap: 3,
              }}
            >
              Ver todas ({items.length}) <SellerIcon name="chevronRight" size={13} color={C.blueDark} />
            </button>
          }>
            Requiere atención
          </SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
            {items.slice(0, 3).map((item, i) => (
              <AttentionCard key={item.deduplicationKey ?? i} item={item} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Atajo secundario ────────────────────────────────────────────────────────

function HomeShortcut({
  icon, tint, iconColor, label, subtitle, subtitleColor, disabled, onPress,
}: {
  icon: string; tint: string; iconColor: string;
  label: string; subtitle: string; subtitleColor?: string;
  disabled?: boolean; onPress?: () => void;
}) {
  return (
    <button
      onClick={onPress}
      disabled={disabled}
      style={{
        ...appCard,
        display: "flex", flexDirection: "column", alignItems: "flex-start", gap: S[2],
        padding: S[4], minHeight: 122, textAlign: "left",
        cursor: disabled ? "default" : "pointer", fontFamily: T.sans,
        opacity: disabled ? 0.62 : 1, position: "relative",
        touchAction: "manipulation",
      }}
    >
      <span style={{
        width: 46, height: 46, borderRadius: 14, background: tint,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <SellerIcon name={icon} size={22} color={iconColor} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.ink, lineHeight: 1.3 }}>
          {label}
        </span>
        <span style={{ display: "block", fontSize: T.sz.xs, color: subtitleColor ?? C.inkLight, marginTop: 2, lineHeight: 1.45 }}>
          {subtitle}
        </span>
      </span>
      {!disabled && (
        <span aria-hidden style={{ position: "absolute", right: S[3], bottom: S[3] }}>
          <SellerIcon name="chevronRight" size={16} color={C.inkGhost} />
        </span>
      )}
    </button>
  );
}

// ── Alert preview card ──────────────────────────────────────────────────────

function AttentionCard({ item }: { item: FrontlineAttentionItem }) {
  return (
    <div style={{
      padding: S[3], background: SEV_BG[item.severity],
      border: `1px solid ${SEV_BORDER[item.severity]}`, borderRadius: 16,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: S[2] }}>
        <span style={{ flexShrink: 0, marginTop: 1 }}>
          <SellerIcon
            name={item.severity === "info" ? "info" : "alert"}
            size={17}
            color={SEV_TEXT[item.severity]}
          />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: SEV_TEXT[item.severity], lineHeight: 1.45 }}>
            {item.title}
          </div>
          {item.suggestedAction && (
            <div style={{ fontSize: T.sz.xs, color: C.inkMid, marginTop: S[1], lineHeight: 1.45 }}>
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
  const labels: Record<AttentionSeverity, string> = { critical: "Crítica", warning: "Alerta", info: "Info" };
  return (
    <StatusChip bg="rgba(255,255,255,0.6)" color={SEV_TEXT[severity]}>
      {labels[severity]}
    </StatusChip>
  );
}

// ── Location strip (truthful states — §35) ──────────────────────────────────

function LocationStrip({
  permission,
  location,
  onRequest,
}: {
  permission: import("@/hooks/use-seller-location").LocationPermission;
  location: import("@/hooks/use-seller-location").SellerLocation | null;
  onRequest: () => void;
}) {
  const base = {
    display: "flex", alignItems: "center", gap: S[2],
    padding: `${S[1]}px ${S[2]}px`, borderRadius: R.pill,
    fontSize: T.sz.xs, fontFamily: T.sans, marginBottom: S[3],
    width: "fit-content" as const, maxWidth: "100%",
  };

  // idle: not requested yet — show button to request
  if (permission === "idle") {
    return (
      <button onClick={onRequest} style={{
        ...base, background: C.blueLight, border: `1px solid ${C.blueBorder}`,
        color: C.blueDark, cursor: "pointer", minHeight: 44, touchAction: "manipulation",
      }}>
        <SellerIcon name="pin" size={13} color={C.blueDark} />
        Activar ubicación
      </button>
    );
  }

  // requesting: waiting for browser response
  if (permission === "requesting") {
    return (
      <div style={{ ...base, background: C.surfaceAlt, border: `1px solid ${C.line}`, color: C.inkMid }}>
        <SellerIcon name="pin" size={13} color={C.inkMid} />
        Obteniendo ubicación...
      </div>
    );
  }

  // denied: user denied permission
  if (permission === "denied") {
    return (
      <div style={{ ...base, background: C.amberLight, border: `1px solid ${C.amberBorder}`, color: C.amberDark }}>
        <SellerIcon name="pin" size={13} color={C.amberDark} />
        Ubicación desactivada
      </div>
    );
  }

  // unavailable: device doesn't support geolocation
  if (permission === "unavailable") {
    return (
      <div style={{ ...base, background: C.surfaceAlt, border: `1px solid ${C.line}`, color: C.inkLight }}>
        <SellerIcon name="pin" size={13} color={C.inkLight} />
        Ubicación no disponible
      </div>
    );
  }

  // granted: truthful presentation — no raw coordinates; ready for real city later
  if (permission === "granted" && location) {
    return (
      <div style={{ ...base, background: C.greenLight, border: `1px solid ${C.greenBorder}`, color: C.green }}>
        <SellerIcon name="pin" size={13} color={C.green} />
        <span>Ubicación activa</span>
        <span style={{ opacity: 0.7 }}>· Ciudad no disponible</span>
      </div>
    );
  }

  return null;
}
