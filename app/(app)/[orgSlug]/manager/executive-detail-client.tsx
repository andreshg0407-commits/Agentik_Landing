/**
 * Executive Detail — generic drill-down pattern for Manager App insights.
 *
 * Sprint: AGENTIK-MANAGER-APP-FOUNDATION-01
 *
 * When a manager taps an executive insight (e.g., "253 referencias en baja
 * rotación"), this component renders an EXECUTIVE DETAIL presentation instead
 * of navigating to the operational Importaciones page.
 *
 * Structure:
 *   title          — insight headline
 *   summary        — 1-2 sentence explanation
 *   evidence       — canonical facts behind the insight
 *   entities       — top affected entities (references, customers, etc.)
 *   freshness      — data timestamp
 *   nextSteps      — suggested actions (no operational mutations)
 *   Ask Copilot    — affordance to trigger Copilot conversation
 *
 * No operational mutations. No desktop navigation. Presentation only.
 */
"use client";

import { C, T, S, R, E } from "@/lib/ui/tokens";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ExecutiveDetailEntity {
  label:  string;
  value:  string;
  accent?: string;
}

export interface ExecutiveDetailProps {
  title:      string;
  summary:    string;
  evidence:   string[];
  entities:   ExecutiveDetailEntity[];
  freshness:  string;
  nextSteps:  string[];
  onBack:     () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function ExecutiveDetailClient({
  title,
  summary,
  evidence,
  entities,
  freshness,
  nextSteps,
  onBack,
}: ExecutiveDetailProps) {
  return (
    <div style={{
      padding:    `${S[4]}px ${S[4]}px ${S[6]}px`,
      maxWidth:   640,
      margin:     "0 auto",
      fontFamily: T.sans,
    }}>
      {/* Back */}
      <button
        onClick={onBack}
        style={{
          all:        "unset",
          cursor:     "pointer",
          fontFamily: T.mono,
          fontSize:   T.sz.xs,
          color:      C.blueDark,
          marginBottom: S[3],
          display:    "block",
        }}
      >
        ‹ Volver
      </button>

      {/* Title */}
      <h2 style={{
        margin:        0,
        fontSize:      20,
        fontWeight:    T.wt.bold,
        color:         C.titleDeep,
        letterSpacing: "-0.3px",
        marginBottom:  S[2],
      }}>
        {title}
      </h2>

      {/* Summary */}
      <p style={{
        fontSize:   T.sz.sm,
        color:      C.inkLight,
        lineHeight: 1.6,
        marginBottom: S[4],
        margin:     `0 0 ${S[4]}px`,
      }}>
        {summary}
      </p>

      {/* Evidence */}
      {evidence.length > 0 && (
        <section style={{ marginBottom: S[4] }}>
          <div style={{
            fontFamily:    T.mono,
            fontSize:      T.sz["2xs"],
            fontWeight:    T.wt.semibold,
            color:         C.inkFaint,
            textTransform: "uppercase" as const,
            letterSpacing: "0.08em",
            marginBottom:  S[2],
          }}>
            Evidencia
          </div>
          {evidence.map((e, i) => (
            <div key={i} style={{
              display:    "flex",
              alignItems: "flex-start",
              gap:        S[2],
              marginBottom: S[1],
            }}>
              <span style={{
                width:        5,
                height:       5,
                borderRadius: "50%",
                background:   C.blueDark,
                flexShrink:   0,
                marginTop:    7,
              }} />
              <span style={{
                fontSize:   T.sz.sm,
                color:      C.ink,
                lineHeight: 1.5,
              }}>
                {e}
              </span>
            </div>
          ))}
        </section>
      )}

      {/* Top affected entities */}
      {entities.length > 0 && (
        <section style={{ marginBottom: S[4] }}>
          <div style={{
            fontFamily:    T.mono,
            fontSize:      T.sz["2xs"],
            fontWeight:    T.wt.semibold,
            color:         C.inkFaint,
            textTransform: "uppercase" as const,
            letterSpacing: "0.08em",
            marginBottom:  S[2],
          }}>
            Entidades afectadas
          </div>
          <div style={{
            background:   "#fff",
            border:       `1px solid ${C.line}`,
            borderRadius: R.md,
            overflow:     "hidden",
          }}>
            {entities.map((ent, i) => (
              <div key={i} style={{
                display:      "flex",
                justifyContent: "space-between",
                alignItems:   "center",
                padding:      `${S[2]}px ${S[3]}px`,
                borderBottom: i < entities.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
              }}>
                <span style={{
                  fontFamily: T.mono,
                  fontSize:   T.sz.xs,
                  color:      C.ink,
                }}>
                  {ent.label}
                </span>
                <span style={{
                  fontFamily: T.mono,
                  fontSize:   T.sz.xs,
                  fontWeight: T.wt.semibold,
                  color:      ent.accent ?? C.blueDark,
                }}>
                  {ent.value}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Next steps */}
      {nextSteps.length > 0 && (
        <section style={{ marginBottom: S[4] }}>
          <div style={{
            fontFamily:    T.mono,
            fontSize:      T.sz["2xs"],
            fontWeight:    T.wt.semibold,
            color:         C.inkFaint,
            textTransform: "uppercase" as const,
            letterSpacing: "0.08em",
            marginBottom:  S[2],
          }}>
            Siguientes pasos
          </div>
          {nextSteps.map((step, i) => (
            <div key={i} style={{
              fontSize:     T.sz.sm,
              color:        C.ink,
              lineHeight:   1.5,
              marginBottom: S[1],
              paddingLeft:  S[2],
            }}>
              {i + 1}. {step}
            </div>
          ))}
        </section>
      )}

      {/* Freshness */}
      <div style={{
        fontFamily:    T.mono,
        fontSize:      T.sz["2xs"],
        color:         C.inkGhost,
        letterSpacing: "0.04em",
        marginBottom:  S[4],
      }}>
        Datos al {freshness}
      </div>

      {/* Ask Copilot affordance */}
      <button
        style={{
          all:            "unset",
          cursor:         "default",
          display:        "flex",
          alignItems:     "center",
          gap:            S[2],
          padding:        `${S[3]}px ${S[4]}px`,
          background:     "rgba(0,74,173,0.04)",
          border:         `1px solid ${C.line}`,
          borderRadius:   R.md,
          width:          "100%",
          boxSizing:      "border-box",
          opacity:        0.65,
        }}
      >
        <div style={{
          width:          28,
          height:         28,
          borderRadius:   "50%",
          background:     "linear-gradient(135deg, #004AAD 0%, #1E63D8 100%)",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          flexShrink:     0,
        }}>
          <span style={{
            fontFamily: T.mono,
            fontSize:   12,
            fontWeight: T.wt.bold,
            color:      "#fff",
          }}>
            A
          </span>
        </div>
        <span style={{
          fontFamily: T.mono,
          fontSize:   T.sz.xs,
          color:      C.inkLight,
        }}>
          Preguntar a Copilot sobre este tema — próximamente
        </span>
      </button>
    </div>
  );
}
