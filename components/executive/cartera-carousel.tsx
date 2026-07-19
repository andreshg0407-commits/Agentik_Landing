"use client";

import { useState } from "react";
import { C, T, S, R } from "@/lib/ui/tokens";

export interface RiskCard {
  id:        string;
  label:     string;
  value:     string;
  sub:       string;
  severity:  "ok" | "warning" | "critical" | "neutral";
  href:      string;
  ctaLabel?: string;
  /** true when value is text (client name) — renders smaller */
  compact?:  boolean;
}

const SEV: Record<RiskCard["severity"], {
  accent:      string;
  headerBg:    string;
  badgeBg:     string;
  badgeColor:  string;
  badgeLabel:  string;
  hoverBorder: string;
}> = {
  neutral:  { accent: C.inkGhost, headerBg: C.surfaceAlt, badgeBg: C.lineSubtle, badgeColor: C.inkFaint,  badgeLabel: "",         hoverBorder: "#9ca3af"  },
  ok:       { accent: "#4ade80",  headerBg: "#f0fdf4",    badgeBg: "#dcfce7",    badgeColor: "#16a34a",   badgeLabel: "Normal",   hoverBorder: "#22c55e"  },
  warning:  { accent: "#fbbf24",  headerBg: "#fffbeb",    badgeBg: "#fef3c7",    badgeColor: "#92400e",   badgeLabel: "Atencion", hoverBorder: "#f59e0b"  },
  critical: { accent: "#f87171",  headerBg: "#fff1f2",    badgeBg: "#fee2e2",    badgeColor: "#dc2626",   badgeLabel: "Critico",  hoverBorder: "#ef4444"  },
};

// Respects prefers-reduced-motion
const DOT_TRANSITION = "width 0.18s ease, background 0.18s ease";

export default function CarteraCarousel({ cards }: { cards: RiskCard[] }) {
  const [page,       setPage]       = useState(0);
  const [hoveredId,  setHoveredId]  = useState<string | null>(null);
  const [focusedBtn, setFocusedBtn] = useState<string | null>(null);

  const PER_PAGE   = 3;
  const totalPages = Math.ceil(cards.length / PER_PAGE);
  const visible    = cards.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  const prevDisabled = page === 0;
  const nextDisabled = page === totalPages - 1;

  const navBtnStyle = (disabled: boolean, focused: boolean): React.CSSProperties => ({
    fontFamily:    T.mono,
    fontSize:      T.sz["2xs"],
    fontWeight:    T.wt.bold,
    color:         disabled ? C.inkGhost : C.inkMid,
    background:    "none",
    border:        "none",
    cursor:        disabled ? "not-allowed" : "pointer",
    padding:       "6px 10px",
    minHeight:     44,
    minWidth:      44,
    opacity:       disabled ? 0.35 : 1,
    letterSpacing: "0.03em",
    outline:       focused && !disabled ? "2px solid #1e40af" : "none",
    outlineOffset: 2,
    transition:    "opacity 0.15s",
  });

  return (
    <div
      role="region"
      aria-label="Indicadores de cartera y riesgo"
      style={{ marginBottom: S[4] }}
    >

      {/* ── Page label — "Señales de riesgo" / "Aging" / etc. ── */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        marginBottom:   S[2],
      }}>
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz["2xs"],
          fontWeight:    T.wt.bold,
          color:         C.inkFaint,
          textTransform: "uppercase" as const,
          letterSpacing: "0.06em",
        }}>
          {page === 0 ? "Señales críticas · accion inmediata"
         : page === 1 ? "Aging · vencimiento por tramo"
         : page === 2 ? "Cartera critica · cobros F1"
         :              "Cobros por canal"}
        </span>
        <span style={{
          fontFamily: T.mono,
          fontSize:   T.sz["2xs"],
          color:      C.inkFaint,
        }}>
          {page + 1} / {totalPages}
        </span>
      </div>

      {/* ── 3 cards row ── */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap:                 S[3],
        marginBottom:        S[3],
      }}>
        {visible.map((card) => {
          const sev     = SEV[card.severity];
          const isHover = hoveredId === card.id;

          return (
            <a
              key={card.id}
              href={card.href}
              aria-label={`${card.label}: ${card.value}`}
              onMouseEnter={() => setHoveredId(card.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{ textDecoration: "none", display: "flex" }}
            >
              <div style={{
                flex:          1,
                border:        `1.5px solid ${isHover ? sev.hoverBorder : C.line}`,
                borderLeft:    `4px solid ${sev.accent}`,
                borderRadius:  R.md,
                overflow:      "hidden",
                background:    isHover ? sev.headerBg : C.white,
                display:       "flex",
                flexDirection: "column" as const,
                minHeight:     156,
                cursor:        "pointer",
                transition:    "border-color 0.15s, background 0.15s, box-shadow 0.15s",
                boxShadow:     isHover
                  ? "0 4px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)"
                  : "none",
              }}>

                {/* Header */}
                <div style={{
                  background:   sev.headerBg,
                  borderBottom: `1px solid ${C.lineSubtle}`,
                  padding:      `${S[2]}px ${S[3]}px`,
                  display:      "flex",
                  alignItems:   "center",
                  gap:          6,
                  flexShrink:   0,
                }}>
                  <div style={{
                    width: 7, height: 7, borderRadius: "50%",
                    background: sev.accent, flexShrink: 0,
                  }} />
                  <span style={{
                    fontFamily:    T.sans,
                    fontSize:      T.sz["2xs"],
                    fontWeight:    T.wt.bold,
                    color:         card.severity === "critical" ? "#dc2626" : C.inkMid,
                    textTransform: "uppercase" as const,
                    letterSpacing: "0.06em",
                    flex:          1,
                    lineHeight:    1.2,
                  }}>
                    {card.label}
                  </span>
                  {sev.badgeLabel && (
                    <span style={{
                      fontFamily:    T.mono,
                      fontSize:      9,
                      fontWeight:    T.wt.bold,
                      background:    sev.badgeBg,
                      color:         sev.badgeColor,
                      padding:       "2px 6px",
                      borderRadius:  3,
                      flexShrink:    0,
                      letterSpacing: "0.04em",
                    }}>
                      {sev.badgeLabel}
                    </span>
                  )}
                </div>

                {/* Body */}
                <div style={{
                  padding: `${S[3]}px ${S[3]}px ${S[2]}px`,
                  flex:    1,
                }}>
                  <div style={{
                    fontFamily:    T.mono,
                    fontSize:      card.compact ? 18 : card.value === "—" || card.value === "$0" ? 24 : 30,
                    fontWeight:    T.wt.black,
                    color:         card.severity === "critical" ? "#dc2626"
                                 : card.value === "—" || card.value === "$0" ? C.inkGhost
                                 : C.ink,
                    letterSpacing: card.compact ? "-0.01em" : "-0.025em",
                    lineHeight:    1.1,
                    marginBottom:  6,
                    wordBreak:     "break-word" as const,
                  }}>
                    {card.value}
                  </div>
                  <div style={{
                    fontFamily: T.mono,
                    fontSize:   T.sz.xs,
                    color:      card.severity === "critical" ? "#dc262680" : C.inkFaint,
                    lineHeight: 1.4,
                  }}>
                    {card.sub}
                  </div>
                </div>

                {/* CTA */}
                <div style={{
                  padding:        `${S[1] + 2}px ${S[3]}px`,
                  borderTop:      `1px solid ${C.lineSubtle}`,
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "flex-end",
                  flexShrink:     0,
                  background:     isHover ? `${sev.accent}10` : "transparent",
                  transition:     "background 0.15s",
                }}>
                  <span style={{
                    fontFamily: T.mono,
                    fontSize:   T.sz.xs,
                    fontWeight: T.wt.bold,
                    color:      card.severity === "critical" ? "#dc2626" : "#1e40af",
                    transition: "color 0.15s",
                  }}>
                    {card.ctaLabel ?? "Ver detalle →"}
                  </span>
                </div>

              </div>
            </a>
          );
        })}
      </div>

      {/* ── Navigation ── */}
      {totalPages > 1 && (
        <div style={{
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          gap:            S[2],
          paddingBottom:  S[1],
        }}>
          {/* Prev */}
          <button
            onClick={() => !prevDisabled && setPage(p => p - 1)}
            disabled={prevDisabled}
            aria-label="Pagina anterior"
            onFocus={() => setFocusedBtn("prev")}
            onBlur={() => setFocusedBtn(null)}
            style={navBtnStyle(prevDisabled, focusedBtn === "prev")}
          >
            ← anterior
          </button>

          {/* Dot indicators */}
          <div
            role="tablist"
            aria-label="Paginas de cartera"
            style={{ display: "flex", gap: 5, alignItems: "center" }}
          >
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                role="tab"
                aria-selected={i === page}
                aria-label={`Pagina ${i + 1} de ${totalPages}`}
                onClick={() => setPage(i)}
                onFocus={() => setFocusedBtn(`dot-${i}`)}
                onBlur={() => setFocusedBtn(null)}
                style={{
                  width:         i === page ? 18 : 5,
                  height:        5,
                  borderRadius:  3,
                  background:    i === page ? "#1e40af" : C.lineSubtle,
                  border:        "none",
                  cursor:        "pointer",
                  padding:       0,
                  minWidth:      5,
                  minHeight:     5,
                  transition:    DOT_TRANSITION,
                  outline:       focusedBtn === `dot-${i}` ? "2px solid #1e40af" : "none",
                  outlineOffset: 2,
                }}
              />
            ))}
          </div>

          {/* Next */}
          <button
            onClick={() => !nextDisabled && setPage(p => p + 1)}
            disabled={nextDisabled}
            aria-label="Pagina siguiente"
            onFocus={() => setFocusedBtn("next")}
            onBlur={() => setFocusedBtn(null)}
            style={navBtnStyle(nextDisabled, focusedBtn === "next")}
          >
            siguiente →
          </button>
        </div>
      )}

      {/* Page counter */}
      {totalPages > 1 && (
        <div style={{
          textAlign:     "center" as const,
          fontFamily:    T.mono,
          fontSize:      T.sz["2xs"],
          color:         C.inkGhost,
          marginTop:     2,
          letterSpacing: "0.03em",
        }}>
          {page + 1} / {totalPages}
        </div>
      )}

    </div>
  );
}
