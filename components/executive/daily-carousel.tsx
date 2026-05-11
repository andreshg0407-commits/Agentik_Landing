"use client";

import { useState } from "react";
import { C, T, S } from "@/lib/ui/tokens";

export interface DailyCard {
  id:       string;
  label:    string;
  value:    string;
  sub:      string;
  dotColor: string;
  href:     string;
  urgent:   boolean;
  severity: "ok" | "warning" | "critical" | "neutral";
}

const SEV: Record<DailyCard["severity"], {
  dotColor:    string;
  statusColor: string;
}> = {
  neutral:  { dotColor: "#d1d5db", statusColor: "#9ca3af" },
  ok:       { dotColor: "#22c55e", statusColor: "#16a34a" },
  warning:  { dotColor: "#f59e0b", statusColor: "#b45309" },
  critical: { dotColor: "#ef4444", statusColor: "#dc2626" },
};

const DOT_TRANSITION = "width 0.18s ease, background 0.18s ease";

export default function DailyCarousel({ cards }: { cards: DailyCard[] }) {
  const [page,       setPage]       = useState(0);
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
    outline:       focused && !disabled ? `2px solid ${C.blueDark}` : "none",
    outlineOffset: 2,
    transition:    "opacity 0.15s",
  });

  return (
    <div role="region" aria-label="Indicadores del dia">

      {/* ── KPI cards ── */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap:                 S[3],
        marginBottom:        S[3],
      }}>
        {visible.map((card) => {
          const sev = SEV[card.severity];

          return (
            <a
              key={card.id}
              href={card.href}
              className={`ag-kpi-card${card.severity === "critical" ? " ag-urgent" : card.severity === "warning" ? " ag-warning" : ""}`}
              aria-label={`${card.label}: ${card.value}`}
              style={{
                display:       "flex",
                flexDirection: "column",
                padding:       "22px 24px 18px 28px",
                minHeight:     160,
              }}
            >
              {/* Left brand bar */}
              <div className="ag-kpi-bar" />

              {/* Status dot — top right */}
              <div style={{
                position:     "absolute",
                top:          12,
                right:        14,
                width:        7,
                height:       7,
                borderRadius: "50%",
                background:   sev.dotColor,
                flexShrink:   0,
              }} />

              {/* Label */}
              <div style={{
                fontFamily:    T.mono,
                fontSize:      T.sz["2xs"],
                fontWeight:    T.wt.bold,
                color:         card.urgent ? "#dc2626" : C.inkFaint,
                textTransform: "uppercase" as const,
                letterSpacing: "0.06em",
                lineHeight:    1.3,
                marginBottom:  S[3],
              }}>
                {card.label}
              </div>

              {/* Value — ag-kpi-number--xl enforces containment via §17.       */}
              {/* title attribute shows full number on hover — tooltip fallback.   */}
              <div
                className="ag-kpi-number ag-kpi-number--xl"
                title={card.value}
                style={{
                  fontFamily:   T.mono,
                  color:        card.urgent        ? "#dc2626"
                              : card.value === "—" ? C.inkGhost
                              : C.ink,
                  marginBottom: S[3],
                }}
              >
                {card.value}
              </div>

              {/* Sub context */}
              <div style={{
                fontFamily: T.mono,
                fontSize:   T.sz.xs,
                color:      card.urgent ? "#dc262685" : C.inkFaint,
                lineHeight: 1.5,
                flex:       1,
              }}>
                {card.sub}
              </div>

              {/* Footer CTA — contextual to severity */}
              <div style={{
                marginTop:  S[2],
                paddingTop: S[1] + 2,
                borderTop:  `1px dotted ${C.lineSubtle}`,
                fontFamily: T.mono,
                fontSize:   T.sz["2xs"],
                fontWeight: T.wt.semibold,
                color:      card.severity === "critical" ? "#dc2626"
                          : card.severity === "warning"  ? "#b45309"
                          : C.blueDark,
              }}>
                {card.severity === "critical" ? "Resolver ahora →"
                : card.severity === "warning"  ? "Revisar situación →"
                : "Ver detalle →"}
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

          <div
            role="tablist"
            aria-label="Paginas de indicadores"
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
                  background:    i === page ? C.blueDark : C.lineSubtle,
                  border:        "none",
                  cursor:        "pointer",
                  padding:       0,
                  minWidth:      5,
                  minHeight:     5,
                  transition:    DOT_TRANSITION,
                  outline:       focusedBtn === `dot-${i}` ? `2px solid ${C.blueDark}` : "none",
                  outlineOffset: 2,
                }}
              />
            ))}
          </div>

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
