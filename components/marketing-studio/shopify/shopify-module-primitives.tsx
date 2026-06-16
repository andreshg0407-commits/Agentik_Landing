/**
 * components/marketing-studio/shopify/shopify-module-primitives.tsx
 *
 * AGENTIK-COPILOT-BOUNDARIES-01 / SHOPIFY-MODULE-MATURITY-02
 * Shared presentational primitives for all Shopify module client components.
 *
 * Reused across:
 *   - estadisticas/statistics-client.tsx
 *   - promociones/promociones-client.tsx
 *   - operaciones/operaciones-client.tsx
 *
 * Future use:
 *   - Catálogos · Campañas · Analítica · Finanzas · Comercial · Inventario
 *
 * Architecture:
 *   - "use client" NOT declared — these are pure presentational fragments
 *     intended for use inside client components that declare "use client"
 *   - No AI, no Copilot, no business logic
 *   - Full Design System compliance: C.* / T.* / S[n] / R.* / E.*
 *   - No raw hex values, no Tailwind color classes
 */

import { C, T, S, R, E } from "@/lib/ui/tokens";

// ── ShopifyKpiCard ─────────────────────────────────────────────────────────────

export interface ShopifyKpiCardProps {
  /** Emoji or small icon */
  icon:       string;
  /** Metric label — appears at bottom of card */
  label:      string;
  /**
   * Computed value string to display.
   * Pass null to show the noDataHint instead.
   */
  value:      string | null;
  /** Supporting detail shown below the value */
  sub:        string | null;
  /**
   * Brief, factual description of the metric shown when value is null.
   * NOT a Sofia explanation — e.g. "Descuentos activos en la tienda".
   */
  noDataHint: string;
  /** Status variant drives the dot color */
  variant:    "ok" | "warning" | "critical" | "neutral";
  /** Opens the associated drawer */
  onClick:    () => void;
}

export function ShopifyKpiCard({
  icon, label, value, sub, noDataHint, variant, onClick,
}: ShopifyKpiCardProps) {
  const dotColor =
    variant === "ok"       ? C.green   :
    variant === "warning"  ? C.amber   :
    variant === "critical" ? C.red     : C.inkFaint;

  return (
    <button
      onClick={onClick}
      style={{
        flex:          "1 1 200px",
        minWidth:      0,
        border:        `1px solid ${C.line}`,
        borderRadius:  R.xl,
        padding:       `${S[4]}px`,
        background:    C.white,
        boxShadow:     E.xs,
        textAlign:     "left" as const,
        cursor:        "pointer",
        display:       "flex",
        flexDirection: "column" as const,
        gap:           S[1],
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{
          width: 8, height: 8, borderRadius: "50%",
          background: dotColor, flexShrink: 0,
        }} />
      </div>

      {value !== null ? (
        <>
          <div style={{
            fontFamily: T.mono, fontSize: T.sz["2xl"],
            fontWeight: T.wt.bold, color: C.titleDeep, lineHeight: 1.15,
          }}>
            {value}
          </div>
          {sub && (
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
              {sub}
            </div>
          )}
        </>
      ) : (
        <div style={{
          fontFamily: T.mono, fontSize: T.sz.xs,
          color: C.inkFaint, lineHeight: 1.55, marginTop: S[1],
        }}>
          {noDataHint}
        </div>
      )}

      <div style={{
        fontFamily: T.mono, fontSize: T.sz.xs,
        color: C.inkFaint, marginTop: "auto", paddingTop: S[2],
      }}>
        {label}
      </div>
    </button>
  );
}

// ── ShopifyDrawerSection ───────────────────────────────────────────────────────

export function ShopifyDrawerSection({
  title,
  children,
}: {
  title:    string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: S[5] }}>
      <div style={{
        fontFamily:    T.mono,
        fontSize:      T.sz.xs,
        fontWeight:    T.wt.semibold,
        color:         C.inkFaint,
        textTransform: "uppercase" as const,
        letterSpacing: "0.09em",
        marginBottom:  S[3],
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

// ── ShopifyDrawerAction ────────────────────────────────────────────────────────

export function ShopifyDrawerAction({
  label,
  intent,
  executing,
  result,
  onExecute,
}: {
  label:     string;
  intent:    string;
  executing: string | null;
  result?:   { status: string; message: string };
  onExecute: (intent: string) => void;
}) {
  const isRunning = executing === intent;

  return (
    <div style={{ marginBottom: S[2] }}>
      <button
        onClick={() => onExecute(intent)}
        disabled={!!executing}
        style={{
          display:      "block",
          width:        "100%",
          textAlign:    "left" as const,
          fontFamily:   T.mono,
          fontSize:     T.sz.sm,
          color:        isRunning ? C.inkFaint : C.blueDark,
          background:   C.blueLight,
          border:       `1px solid ${C.blueBorder}`,
          borderRadius: R.lg,
          padding:      `${S[2]}px ${S[3]}px`,
          cursor:       executing ? "default" : "pointer",
          opacity:      executing && !isRunning ? 0.5 : 1,
        }}
      >
        {isRunning ? "Procesando…" : `→ ${label}`}
      </button>
      {result && (
        <div style={{
          fontFamily: T.mono, fontSize: T.sz.xs, marginTop: S[1],
          color: result.status === "ok" ? C.green : C.red,
        }}>
          {result.message}
        </div>
      )}
    </div>
  );
}

// ── ShopifyPlaceholderRow ──────────────────────────────────────────────────────

export function ShopifyPlaceholderRow() {
  return (
    <div className="ag-op-row" style={{ alignItems: "center", gap: S[3] }}>
      <div style={{ flex: 1 }}>
        <div style={{ width: "50%", height: 10, borderRadius: R.sm, background: C.surfaceAlt }} />
        <div style={{ width: "35%", height: 8,  borderRadius: R.sm, background: C.surfaceAlt, marginTop: 5 }} />
      </div>
      <div style={{ width: 52, height: 8, borderRadius: R.sm,  background: C.surfaceAlt }} />
      <div style={{ width: 44, height: 8, borderRadius: R.pill, background: C.surfaceAlt }} />
    </div>
  );
}

// ── ShopifyConnectCTA ──────────────────────────────────────────────────────────

/**
 * Primary connection call-to-action shown inside the activation guide.
 * Renders as a styled <a> tag — no JS required.
 */
export function ShopifyConnectCTA({
  orgSlug,
  label = "Conectar tienda Shopify",
}: {
  orgSlug: string;
  label?:  string;
}) {
  return (
    <a
      href={`/${orgSlug}/agentik/marketing-studio/shopify`}
      style={{
        display:        "inline-block",
        marginTop:      S[3],
        fontFamily:     T.mono,
        fontSize:       T.sz.sm,
        fontWeight:     T.wt.semibold,
        color:          C.white,
        background:     C.blueDark,
        border:         `1px solid ${C.blueDark}`,
        borderRadius:   R.lg,
        padding:        `${S[2]}px ${S[4]}px`,
        textDecoration: "none",
      }}
    >
      {label}
    </a>
  );
}

// ── ShopifyDistributionBar ─────────────────────────────────────────────────────

export interface DistributionSegment {
  /** Legend label */
  label: string;
  /** Raw count — used to compute proportional fill */
  count: number;
  /** Token color value */
  color: string;
}

/**
 * Proportional horizontal bar with optional legend.
 * When total is 0, renders a grey placeholder track.
 */
export function ShopifyDistributionBar({
  segments,
  showLegend = true,
}: {
  segments:    DistributionSegment[];
  showLegend?: boolean;
}) {
  const total = segments.reduce((acc, s) => acc + s.count, 0);

  if (total === 0) {
    return (
      <div>
        <div style={{ height: 6, background: C.surfaceAlt, borderRadius: R.pill }} />
        {showLegend && (
          <div style={{ display: "flex", gap: S[3], marginTop: S[2], flexWrap: "wrap" as const }}>
            {segments.map((seg, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: S[1] }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.surfaceAlt }} />
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{seg.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", height: 6, borderRadius: R.pill, overflow: "hidden" }}>
        {segments.filter(s => s.count > 0).map((seg, i) => (
          <div key={i} style={{
            flex:       seg.count,
            background: seg.color,
            marginLeft: i > 0 ? 1 : 0,
            minWidth:   2,
          }} />
        ))}
      </div>
      {showLegend && (
        <div style={{ display: "flex", gap: S[3], marginTop: S[2], flexWrap: "wrap" as const }}>
          {segments.map((seg, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: S[1] }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: seg.color }} />
              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                {seg.label} · {seg.count}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ShopifyStageFlow ───────────────────────────────────────────────────────────

export interface StageFlowItem {
  label: string;
  /** null renders a placeholder "–" in surfaceAlt color */
  count: number | null;
  color: string;
}

/**
 * Horizontal pipeline of labelled stages with "→" separators.
 * Designed for flows like: Pedido → Pago → Preparación → Envío → Entrega.
 */
export function ShopifyStageFlow({ stages }: { stages: StageFlowItem[] }) {
  const fmt = (n: number) => new Intl.NumberFormat("es-CO").format(n);

  const nodes: React.ReactNode[] = [];
  stages.forEach((stage, i) => {
    nodes.push(
      <div key={`s${i}`} style={{ textAlign: "center" as const, minWidth: 56, flex: 1 }}>
        <div style={{
          fontFamily: T.mono, fontSize: T.sz["2xl"], fontWeight: T.wt.bold,
          color: stage.count !== null ? stage.color : C.surfaceAlt,
          lineHeight: 1.1,
        }}>
          {stage.count !== null ? fmt(stage.count) : "–"}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 2 }}>
          {stage.label}
        </div>
      </div>,
    );
    if (i < stages.length - 1) {
      nodes.push(
        <span key={`a${i}`} style={{
          color: C.lineSubtle, fontFamily: T.mono, fontSize: T.sz.xs, flexShrink: 0,
        }}>→</span>,
      );
    }
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
      {nodes}
    </div>
  );
}

// ── ShopifyRiskMeter ───────────────────────────────────────────────────────────

/**
 * Thin horizontal level indicator for operational risk.
 * Callers compute the level and label from their domain data.
 */
export function ShopifyRiskMeter({
  level,
  label,
}: {
  level: "ok" | "warning" | "critical";
  label: string;
}) {
  const color = level === "critical" ? C.red : level === "warning" ? C.amber : C.green;
  const fill  = level === "critical" ? "92%" : level === "warning" ? "52%" : "14%";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: S[3] }}>
      <div style={{ flex: 1, height: 4, background: C.surfaceAlt, borderRadius: R.pill, overflow: "hidden" }}>
        <div style={{ height: "100%", width: fill, background: color, borderRadius: R.pill }} />
      </div>
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color, flexShrink: 0 }}>{label}</span>
    </div>
  );
}

// ── ShopifyActivationTimeline ──────────────────────────────────────────────────

/**
 * Two-mode activation guide:
 *   compact  → single green/amber strip when connected
 *   expanded → step-by-step checklist with CTA when onboarding
 */
export function ShopifyActivationTimeline({
  steps,
  connected,
  orgSlug,
  compactText,
  criticalCount = 0,
}: {
  /** Step labels in order */
  steps:        string[];
  connected:    boolean;
  orgSlug:      string;
  /** Text shown in compact strip when connected */
  compactText:  string;
  /** If > 0, compact strip turns amber/red */
  criticalCount?: number;
}) {
  if (connected) {
    const alertMode = criticalCount > 0;
    return (
      <div style={{
        background:   alertMode ? C.amberLight  : C.greenLight,
        border:       `1px solid ${alertMode ? C.amberBorder : C.greenBorder}`,
        borderRadius: R.xl,
        padding:      `${S[2]}px ${S[4]}px`,
        fontFamily:   T.mono,
        fontSize:     T.sz.xs,
        color:        alertMode ? C.amber : C.green,
        display:      "flex",
        alignItems:   "center",
        gap:          S[2],
      }}>
        <span>{alertMode ? "⚠" : "✓"}</span>
        <span>{compactText}</span>
      </div>
    );
  }

  return (
    <div style={{
      border:       `1px solid ${C.line}`,
      borderRadius: R.xl,
      padding:      `${S[4]}px ${S[5]}px`,
      background:   C.white,
      boxShadow:    E.xs,
    }}>
      <div style={{
        fontFamily:    T.mono,
        fontSize:      T.sz.xs,
        fontWeight:    T.wt.semibold,
        color:         C.inkFaint,
        textTransform: "uppercase" as const,
        letterSpacing: "0.09em",
        marginBottom:  S[3],
      }}>
        Pasos de activación
      </div>
      <div style={{ display: "flex", gap: S[2], alignItems: "center", flexWrap: "wrap" as const }}>
        {steps.map((step, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: S[2] }}>
            <div style={{
              width:           22,
              height:          22,
              borderRadius:    "50%",
              background:      i === 0 && connected ? C.blueDark : C.surfaceAlt,
              border:          `1px solid ${i === 0 && connected ? C.blueDark : C.line}`,
              display:         "flex",
              alignItems:      "center",
              justifyContent:  "center",
              flexShrink:      0,
            }}>
              {i === 0 && connected
                ? <span style={{ color: C.white, fontSize: 9, fontWeight: T.wt.bold }}>✓</span>
                : <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{i + 1}</span>
              }
            </div>
            <span style={{
              fontFamily: T.mono,
              fontSize:   T.sz.xs,
              color:      i === 0 && !connected ? C.blueDark : C.inkFaint,
              fontWeight: i === 0 && !connected ? T.wt.semibold : T.wt.normal,
            }}>
              {step}
            </span>
            {i < steps.length - 1 && (
              <span style={{ color: C.lineSubtle, fontFamily: T.mono, fontSize: T.sz.xs }}>→</span>
            )}
          </div>
        ))}
      </div>
      <ShopifyConnectCTA orgSlug={orgSlug} />
    </div>
  );
}
