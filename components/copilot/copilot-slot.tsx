"use client";

/**
 * components/copilot/copilot-slot.tsx
 *
 * Agentik Financial Copilot V1 — CopilotSlot UI.
 *
 * A contextual, non-intrusive signal card embedded inside a financial module
 * workspace. NOT a chat widget. NOT a floating overlay.
 *
 * Shows the highest-priority signal for the current module, with:
 *   - Severity indicator
 *   - Operational title + description
 *   - Expandable explainability (Level 1 — template-based)
 *   - Confidence chip
 *   - Single primary CTA that routes to the correct workspace
 *
 * When no signals: renders CopilotReadinessSlot (silent, informative).
 *
 * Rules:
 *   - All colors from C.* tokens
 *   - All typography from T.* tokens
 *   - All spacing from S.* tokens
 *   - No Tailwind color classes
 */

import { useState }              from "react";
import { useRouter }             from "next/navigation";
import { C, T, S, R, E }        from "@/lib/ui/tokens";
import type {
  CopilotSlotProps,
  CopilotSignal,
  SignalSeverity,
  ConfidenceLevel,
} from "@/lib/copilot/types";

// ── Severity palette ───────────────────────────────────────────────────────────

const SEVERITY_STYLE: Record<SignalSeverity, {
  bg:    string;
  border: string;
  dot:   string;
  text:  string;
  label: string;
}> = {
  critica:     { bg: C.redLight,   border: C.redBorder,   dot: C.red,    text: C.redDark,   label: "Crítica"     },
  elevada:     { bg: C.amberLight, border: C.amberBorder, dot: C.amber,  text: C.amberDark, label: "Elevada"     },
  vigilancia:  { bg: C.blueLight,  border: C.blueBorder,  dot: C.blue,   text: C.blue,      label: "Vigilancia"  },
  informativa: { bg: C.brandLight, border: C.brandBorder, dot: C.brand,  text: C.brand,     label: "Informativa" },
};

// ── Confidence palette ─────────────────────────────────────────────────────────

const CONFIDENCE_STYLE: Record<ConfidenceLevel, { text: string; label: string }> = {
  ALTA:           { text: C.green,      label: "Confianza alta"     },
  MEDIA:          { text: C.blue,       label: "Confianza media"    },
  BAJA:           { text: C.amber,      label: "Confianza baja"     },
  BASADA_EN_REGLA:{ text: C.inkLight,   label: "Basada en regla"    },
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function ConfidenceChip({ level, score }: { level: ConfidenceLevel; score: number }) {
  const cs = CONFIDENCE_STYLE[level];
  return (
    <span style={{
      fontFamily:    T.mono,
      fontSize:      T.sz.xs,
      fontWeight:    T.wt.medium,
      color:         cs.text,
      background:    "transparent",
      letterSpacing: "0.02em",
    }}>
      {cs.label} · {score}%
    </span>
  );
}

function SignalCard({ signal, orgSlug }: { signal: CopilotSignal; orgSlug: string }) {
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();
  const ss = SEVERITY_STYLE[signal.severity];

  return (
    <div style={{
      background:   ss.bg,
      border:       `1px solid ${ss.border}`,
      borderRadius:  R.lg,
      padding:       S[4],
      boxShadow:     E.xs,
    }}>
      {/* Header */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        gap:             S[2],
        marginBottom:    S[2],
      }}>
        {/* Severity dot */}
        <span style={{
          width:        6,
          height:       6,
          borderRadius: R.pill,
          background:   ss.dot,
          flexShrink:   0,
        }} />
        {/* Severity label */}
        <span style={{
          fontFamily: T.mono,
          fontSize:   T.sz.xs,
          fontWeight: T.wt.semibold,
          color:      ss.text,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}>
          Señal {ss.label}
        </span>
      </div>

      {/* Title */}
      <p style={{
        fontFamily:   T.mono,
        fontSize:     T.sz.md,
        fontWeight:   T.wt.semibold,
        color:        C.ink,
        margin:       0,
        marginBottom: S[1],
        lineHeight:   1.4,
      }}>
        {signal.titulo}
      </p>

      {/* Description */}
      <p style={{
        fontFamily:   T.sans,
        fontSize:     T.sz.base,
        fontWeight:   T.wt.normal,
        color:        C.inkMid,
        margin:       0,
        marginBottom: S[3],
        lineHeight:   1.6,
      }}>
        {signal.descripcion}
      </p>

      {/* Explainability toggle + confidence */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        marginBottom:   expanded ? S[2] : S[3],
        flexWrap:       "wrap",
        gap:             S[1],
      }}>
        <button
          onClick={() => setExpanded(v => !v)}
          style={{
            background:    "none",
            border:        "none",
            padding:       0,
            cursor:        "pointer",
            fontFamily:    T.mono,
            fontSize:      T.sz.xs,
            fontWeight:    T.wt.medium,
            color:         C.inkLight,
            letterSpacing: "0.01em",
            textDecoration: "underline",
            textUnderlineOffset: 2,
          }}
        >
          {expanded ? "Ocultar explicación" : "¿Por qué esta señal?"}
        </button>
        <ConfidenceChip level={signal.confidence.level} score={signal.confidence.score} />
      </div>

      {/* Expandable explanation */}
      {expanded && (
        <p style={{
          fontFamily:   T.sans,
          fontSize:     T.sz.base,
          fontWeight:   T.wt.normal,
          color:        C.inkMid,
          margin:       0,
          marginBottom: S[3],
          padding:      S[3],
          background:   C.white,
          border:       `1px solid ${ss.border}`,
          borderRadius:  R.md,
          lineHeight:   1.7,
        }}>
          {signal.explicacion}
        </p>
      )}

      {/* CTA */}
      <button
        onClick={() => router.push(signal.targetPath)}
        style={{
          display:       "inline-flex",
          alignItems:    "center",
          gap:            S[1],
          background:    C.blueDark,
          color:         C.white,
          border:        "none",
          borderRadius:   R.md,
          padding:       `${S[2]}px ${S[4]}px`,
          fontFamily:    T.mono,
          fontSize:      T.sz.base,
          fontWeight:    T.wt.semibold,
          cursor:        "pointer",
          letterSpacing: "0.01em",
          transition:    "opacity 150ms ease",
        }}
        onMouseEnter={e => (e.currentTarget.style.opacity = "0.88")}
        onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
      >
        {signal.accion}
        <span style={{ fontSize: T.sz.sm, opacity: 0.8 }}>→</span>
      </button>
    </div>
  );
}

// ── Additional signals strip ───────────────────────────────────────────────────

function AdditionalSignalsStrip({
  count,
  signals,
}: {
  count: number;
  signals: CopilotSignal[];
}) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;

  return (
    <div style={{ marginTop: S[2] }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          background:    "none",
          border:        "none",
          padding:       0,
          cursor:        "pointer",
          fontFamily:    T.mono,
          fontSize:      T.sz.xs,
          color:         C.inkLight,
          display:       "flex",
          alignItems:    "center",
          gap:            S[1],
        }}
      >
        <span style={{
          background:   C.inkFaint,
          color:        C.white,
          borderRadius:  R.pill,
          padding:      `2px 6px`,
          fontSize:     T.sz["2xs"],
          fontWeight:   T.wt.semibold,
          fontFamily:   T.mono,
        }}>
          +{count}
        </span>
        {open ? "Ocultar señales adicionales" : `${count} señal${count > 1 ? "es" : ""} adicional${count > 1 ? "es" : ""}`}
      </button>

      {open && (
        <div style={{ marginTop: S[2], display: "flex", flexDirection: "column", gap: S[2] }}>
          {signals.map((s) => {
            const ss = SEVERITY_STYLE[s.severity];
            return (
              <div
                key={s.id}
                style={{
                  display:      "flex",
                  alignItems:   "center",
                  gap:           S[2],
                  padding:      `${S[2]}px ${S[3]}px`,
                  background:    ss.bg,
                  border:       `1px solid ${ss.border}`,
                  borderRadius:  R.md,
                }}
              >
                <span style={{
                  width:        5,
                  height:       5,
                  borderRadius:  R.pill,
                  background:    ss.dot,
                  flexShrink:   0,
                }} />
                <span style={{
                  fontFamily: T.mono,
                  fontSize:   T.sz.base,
                  color:      C.ink,
                  flex:       1,
                }}>
                  {s.titulo}
                </span>
                <span style={{
                  fontFamily: T.mono,
                  fontSize:   T.sz.xs,
                  color:      ss.text,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}>
                  {ss.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── No-signal state ────────────────────────────────────────────────────────────

function CopilotQuietState({ module }: { module: string }) {
  return (
    <div style={{
      display:        "flex",
      alignItems:     "center",
      gap:             S[2],
      padding:        `${S[2]}px ${S[3]}px`,
      background:     C.surface,
      border:         `1px solid ${C.line}`,
      borderRadius:    R.md,
    }}>
      <span style={{
        width:        6,
        height:       6,
        borderRadius:  R.pill,
        background:    C.green,
        flexShrink:   0,
      }} />
      <span style={{
        fontFamily: T.mono,
        fontSize:   T.sz.base,
        color:      C.inkLight,
      }}>
        Agentik no detecta señales activas en {module}
      </span>
    </div>
  );
}

// ── Degraded state ─────────────────────────────────────────────────────────────

function CopilotDegradedState() {
  return (
    <div style={{
      display:        "flex",
      alignItems:     "center",
      gap:             S[2],
      padding:        `${S[2]}px ${S[3]}px`,
      background:     C.amberLight,
      border:         `1px solid ${C.amberBorder}`,
      borderRadius:    R.md,
    }}>
      <span style={{
        fontFamily: T.mono,
        fontSize:   T.sz.base,
        color:      C.amberDark,
      }}>
        Motor de señales con datos incompletos — revise sincronización
      </span>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * CopilotSlot
 *
 * Drop-in contextual signal card for financial module pages.
 * Server component loads signals; this client component renders them.
 *
 * Usage:
 *   <CopilotSlot orgSlug={orgSlug} module="tesoreria" signals={signals} runtime={runtime} />
 */
export function CopilotSlot({
  orgSlug,
  module,
  signals,
  runtime,
  className,
}: CopilotSlotProps) {
  const moduleLabel: Record<string, string> = {
    planeacion:   "Planeación",
    tesoreria:    "Tesorería",
    cierre:       "Cierre",
    conciliacion: "Conciliación",
  };

  if (runtime.state === "DEGRADED" && signals.length === 0) {
    return (
      <div className={className}>
        <CopilotDegradedState />
      </div>
    );
  }

  if (signals.length === 0) {
    return (
      <div className={className}>
        <CopilotQuietState module={moduleLabel[module] ?? module} />
      </div>
    );
  }

  const [primary, ...rest] = signals;

  return (
    <div className={className} style={{ display: "flex", flexDirection: "column" }}>
      {/* Section label */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:           S[2],
        marginBottom:  S[2],
      }}>
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz.xs,
          fontWeight:    T.wt.semibold,
          color:         C.blueDark,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}>
          Agentik
        </span>
        <span style={{
          fontFamily: T.mono,
          fontSize:   T.sz.xs,
          color:      C.inkFaint,
        }}>
          ·
        </span>
        <span style={{
          fontFamily: T.mono,
          fontSize:   T.sz.xs,
          color:      C.inkLight,
        }}>
          {runtime.activeSignals === 1
            ? "1 señal activa"
            : `${runtime.activeSignals} señales activas`}
        </span>
      </div>

      {/* Primary signal card */}
      <SignalCard signal={primary} orgSlug={orgSlug} />

      {/* Additional signals */}
      {rest.length > 0 && (
        <AdditionalSignalsStrip count={rest.length} signals={rest} />
      )}
    </div>
  );
}
