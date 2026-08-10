/**
 * Seller App — Mi Maleta / Mostrario View.
 *
 * Sprint: AGENTIK-SELLER-APP-UI-03
 *
 * Seller sees ONLY their own portfolio (server-scoped).
 * Three areas: Muestras, Retiro, Plan surtido.
 * No manager derrotero editing. No business rule recomputation.
 */
"use client";

import { useState, useMemo } from "react";
import { C, T, S, R } from "@/lib/ui/tokens";
import {
  DetailSection, filterBtnStyle,
  type SerializedPortfolio, type SerializedPortfolioRef, type SerializedSupplyNeed,
} from "./seller-app-shared";
import { SellerIcon, appCard, EmptyState } from "./seller-ui-kit";

// ── Sub-views ───────────────────────────────────────────────────────────────

type PortfolioSection = "muestras" | "retiro" | "surtido";

const SECTIONS: Array<{ key: PortfolioSection; label: string }> = [
  { key: "muestras", label: "Muestras" },
  { key: "retiro", label: "Retiro" },
  { key: "surtido", label: "Plan surtido" },
];

// ── Main View ───────────────────────────────────────────────────────────────

export function SellerPortfolioView({
  portfolio,
  supplyNeeds,
  initialSection,
}: {
  portfolio: SerializedPortfolio | null;
  supplyNeeds: SerializedSupplyNeed[];
  initialSection?: string;
}) {
  const [section, setSection] = useState<PortfolioSection>(
    (initialSection as PortfolioSection) ?? "muestras",
  );

  if (!portfolio) {
    return (
      <div style={{ padding: S[4] }}>
        <div style={{ fontSize: T.sz.xl, fontWeight: T.wt.bold, color: C.titleDeep, marginBottom: S[2] }}>Mi portafolio</div>
        <EmptyState icon="box" title="No tienes un portafolio asignado"
          subtitle="Contacta a tu administrador para que te asigne un portafolio comercial" />
      </div>
    );
  }

  const vigentes = useMemo(
    () => portfolio.refs.filter(r => r.state !== "reemplazar"),
    [portfolio.refs],
  );
  const retiro = useMemo(
    () => portfolio.refs.filter(r => r.state === "reemplazar"),
    [portfolio.refs],
  );

  return (
    <div style={{ padding: S[4] }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: S[3],
      }}>
        <div>
          <div style={{ fontSize: T.sz.xl, fontWeight: T.wt.bold, color: C.titleDeep }}>
            Mi portafolio
          </div>
          <div style={{ fontSize: T.sz.xs, color: C.inkLight }}>
            {portfolio.vendorName}
          </div>
        </div>
        <HealthBadge health={portfolio.health} />
      </div>

      {/* KPI strip */}
      <div style={{ ...appCard, display: "flex", gap: S[2], marginBottom: S[3], padding: S[3] }}>
        <KpiChip label="Muestras" value={String(vigentes.length)} />
        <KpiChip label="Retiro" value={String(retiro.length)} color={retiro.length > 0 ? C.redDark : undefined} />
        <KpiChip label="Surtido" value={String(supplyNeeds.length)} color={supplyNeeds.length > 0 ? C.amberDark : undefined} />
      </div>

      {/* Section tabs */}
      <div style={{ display: "flex", gap: S[1], marginBottom: S[3] }}>
        {SECTIONS.map(s => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            style={{
              ...filterBtnStyle,
              flex: 1, minHeight: 38,
              background: section === s.key ? C.blueDark : C.white,
              color: section === s.key ? C.white : C.ink,
              border: `1.5px solid ${section === s.key ? C.blueDark : C.line}`,
              textAlign: "center",
            }}
          >
            {s.label}
            {s.key === "retiro" && retiro.length > 0 && (
              <span style={{ marginLeft: 4, fontSize: 9, fontWeight: T.wt.bold }}>
                {retiro.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {section === "muestras" && <MuestrasSection refs={vigentes} />}
      {section === "retiro" && <RetiroSection refs={retiro} />}
      {section === "surtido" && <SurtidoSection needs={supplyNeeds} />}
    </div>
  );
}

// ── Muestras ────────────────────────────────────────────────────────────────

function MuestrasSection({ refs }: { refs: SerializedPortfolioRef[] }) {
  if (refs.length === 0) {
    return <EmptySection message="No tienes muestras activas" />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
      {refs.map(r => (
        <RefCard key={r.reference} ref_={r} />
      ))}
    </div>
  );
}

// ── Retiro ──────────────────────────────────────────────────────────────────

function RetiroSection({ refs }: { refs: SerializedPortfolioRef[] }) {
  if (refs.length === 0) {
    return <EmptySection message="No tienes muestras para retirar" />;
  }

  return (
    <div>
      <div style={{
        padding: S[3], background: C.redLight, border: `1px solid ${C.redBorder}`,
        borderRadius: R.lg, marginBottom: S[3],
        fontSize: T.sz.sm, color: C.redDark,
      }}>
        Retira estas muestras de tu portafolio. El stock central esta agotado o por debajo del umbral.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
        {refs.map(r => (
          <RefCard key={r.reference} ref_={r} isRetiro />
        ))}
      </div>
    </div>
  );
}

// ── Plan surtido ────────────────────────────────────────────────────────────

function SurtidoSection({ needs }: { needs: SerializedSupplyNeed[] }) {
  if (needs.length === 0) {
    return <EmptySection message="Tu portafolio esta completo, no hay posiciones faltantes" />;
  }

  return (
    <div>
      <div style={{
        padding: S[3], background: C.blueLight, border: `1px solid ${C.blueBorder}`,
        borderRadius: R.lg, marginBottom: S[3],
        fontSize: T.sz.sm, color: C.blue,
      }}>
        Posiciones del derrotero que faltan en tu portafolio. Tu administrador coordinara el envio.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
        {needs.map(n => (
          <SupplyNeedCard key={`${n.subgroupName}:${n.brand}`} need={n} />
        ))}
      </div>
    </div>
  );
}

// ── Shared sub-components ───────────────────────────────────────────────────

function RefCard({ ref_, isRetiro }: { ref_: SerializedPortfolioRef; isRetiro?: boolean }) {
  const borderColor = isRetiro ? C.redBorder : C.line;
  return (
    <div style={{
      ...appCard,
      display: "flex", gap: S[3], padding: S[3],
      border: `1px solid ${borderColor}`,
    }}>
      {/* Thumbnail */}
      <div style={{
        width: 56, height: 56, borderRadius: R.md,
        background: C.surfaceAlt, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden",
      }}>
        {ref_.imageUrl ? (
          <img
            src={ref_.imageUrl}
            alt={ref_.reference}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            loading="lazy"
          />
        ) : (
          <span style={{ fontSize: T.sz.xs, color: C.inkLight }}>
            {ref_.line}
          </span>
        )}
      </div>
      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
          {ref_.reference}
        </div>
        <div style={{
          fontSize: T.sz.xs, color: C.inkMid, marginTop: 1,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {ref_.description}
        </div>
        <div style={{ display: "flex", gap: S[2], marginTop: S[1], alignItems: "center" }}>
          <span style={{ fontSize: T.sz.xs, color: C.inkLight }}>{ref_.line}</span>
          {isRetiro && (
            <span style={{
              fontSize: T.sz.xs, padding: `2px ${S[2]}px`, background: C.redLight,
              color: C.redDark, borderRadius: R.pill, fontWeight: T.wt.bold,
            }}>
              Retirar
            </span>
          )}
          {!isRetiro && (
            <HealthDot health={ref_.commercialHealth} />
          )}
        </div>
      </div>
      {/* Stock */}
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
          {ref_.centralAvailable}
        </div>
        <div style={{ fontSize: 9, color: C.inkLight }}>stock</div>
      </div>
    </div>
  );
}

function SupplyNeedCard({ need }: { need: SerializedSupplyNeed }) {
  const actionLabels: Record<string, { label: string; color: string }> = {
    REEMPLAZAR_BODEGA: { label: "Bodega", color: C.green },
    COMPLETAR_DESDE_OP: { label: "Produccion", color: C.amberDark },
    SIN_COBERTURA: { label: "Sin cobertura", color: C.redDark },
  };
  const action = actionLabels[need.bestAction] ?? { label: need.bestAction, color: C.inkMid };

  return (
    <div style={{ ...appCard, padding: S[3] }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
            {need.subgroupName}
          </div>
          <div style={{ fontSize: T.sz.xs, color: C.inkMid, marginTop: 1 }}>
            {need.brand ? `${need.brand} · ` : ""}{need.commercialWorld}
          </div>
        </div>
        <span style={{
          fontSize: T.sz.xs, padding: `2px ${S[2]}px`,
          background: "rgba(0,0,0,0.04)", color: action.color,
          borderRadius: R.sm, fontWeight: T.wt.medium,
        }}>
          {action.label}
        </span>
      </div>
      <div style={{ fontSize: T.sz.xs, color: C.inkLight, marginTop: S[1] }}>
        {need.bestActionExplanation}
      </div>
      {need.candidateCount > 0 && (
        <div style={{ fontSize: T.sz.xs, color: C.blue, marginTop: S[1] }}>
          {need.candidateCount} candidato{need.candidateCount > 1 ? "s" : ""} disponible{need.candidateCount > 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}

function HealthBadge({ health }: { health: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    SANA: { label: "Sana", bg: C.greenLight, color: C.green },
    EN_RIESGO: { label: "En riesgo", bg: C.amberLight, color: C.amberDark },
    CRITICA: { label: "Critica", bg: C.redLight, color: C.redDark },
  };
  const h = map[health] ?? { label: health, bg: C.surfaceAlt, color: C.inkMid };
  return (
    <span style={{
      fontSize: T.sz.xs, padding: `2px ${S[2]}px`, background: h.bg,
      color: h.color, borderRadius: R.pill, fontWeight: T.wt.medium,
    }}>
      {h.label}
    </span>
  );
}

function HealthDot({ health }: { health: string }) {
  const colorMap: Record<string, string> = {
    SANA: C.green, SALUDABLE: C.green,
    EN_RIESGO: C.amber, RIESGO: C.amber,
    CRITICA: C.red, SIN_DATOS: C.inkLight,
  };
  const c = colorMap[health] ?? C.inkLight;
  return (
    <span style={{
      width: 6, height: 6, borderRadius: "50%", background: c,
      display: "inline-block",
    }} />
  );
}

function KpiChip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div style={{ fontSize: T.sz.xl, fontWeight: T.wt.bold, color: color ?? C.ink }}>{value}</div>
      <div style={{ fontSize: T.sz.xs, color: C.inkLight }}>{label}</div>
    </div>
  );
}

function EmptySection({ message }: { message: string }) {
  return <EmptyState icon="box" title={message} />;
}
