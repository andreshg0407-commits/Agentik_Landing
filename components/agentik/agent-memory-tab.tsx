/**
 * components/agentik/agent-memory-tab.tsx
 *
 * Agentik Agent Workspace — Memory Tab
 *
 * Sprint: AGENTIK-MEMORY-INTELLIGENCE-REFINEMENT-01
 *
 * Refined memory intelligence system:
 *   A — Priority: subtle left-bar + tiny semantic label
 *   B — Lifecycle: colored dot next to date — memory feels alive
 *   C — Progressive disclosure: top items visible, expand on demand
 *   D — Relevance ordering: data ordered by operational relevance (in registry)
 *   E — Last impact: "◆ active this week" — contextual aliveness
 *   F — Compression: tight layout, no redundant metadata
 *   G — Typography: readable without losing enterprise density
 *   H — Confidence semantic: alta / estable / parcial / limitada
 *   I — Gaps as missing capabilities, not tasks
 */

"use client";

import { useState } from "react";
import { C, T, S, R, E } from "@/lib/ui/tokens";
import type { CopilotAgent, MemoryPriority, MemoryLifecycle } from "@/lib/copilot/agents";

// ── Visual config ─────────────────────────────────────────────────────────────

// Bloque A — Priority: subtle left accent bar color
function priorityBar(priority: MemoryPriority, accentColor: string): string {
  switch (priority) {
    case "critical":    return "#ef4444";
    case "strategic":   return accentColor;
    case "operational": return "#3b82f6";
    case "contextual":  return C.lineSubtle;
  }
}

// Tiny priority label — shown only for critical and strategic
const PRIORITY_LABEL: Partial<Record<MemoryPriority, string>> = {
  critical:  "CRÍTICO",
  strategic: "ESTRATÉGICO",
};

// Bloque B — Lifecycle dot
const LIFECYCLE_DOT: Record<MemoryLifecycle, string> = {
  active:   "#22c55e",
  evolving: "#3b82f6",
  stale:    "#f59e0b",
  archived: C.inkGhost,
};

const LIFECYCLE_LABEL: Record<MemoryLifecycle, string> = {
  active:   "activo",
  evolving: "en cambio",
  stale:    "desfasado",
  archived: "archivado",
};

// Rule priority chip
const RULE_PRIORITY = {
  critical: { chipBg: "#FFF1F1", chipColor: "#dc2626", chipBorder: "#FCA5A5", label: "CRÍTICA"  },
  high:     { chipBg: "#FFFBEB", chipColor: "#d97706", chipBorder: "#FCD34D", label: "ALTA"     },
  medium:   { chipBg: "#EFF6FF", chipColor: "#2563eb", chipBorder: "#BFDBFE", label: "MEDIA"    },
  low:      { chipBg: C.surface, chipColor: C.inkLight, chipBorder: C.line,   label: "BAJA"     },
} as const;

// Gap status
const GAP_STATUS = {
  pendiente: { bg: "#FFFBEB", color: "#d97706", border: "#FCD34D", label: "PENDIENTE" },
  parcial:   { bg: "#EFF6FF", color: "#2563eb", border: "#BFDBFE", label: "PARCIAL"   },
  bloqueado: { bg: "#FFF1F1", color: "#dc2626", border: "#FCA5A5", label: "BLOQUEADO" },
} as const;

// Bloque H — Confidence semantic
const CONFIDENCE_CONFIG = {
  alta:     { label: "Alta confianza",      color: "#16a34a", bg: "#F0FDF4", border: "#BBF7D0" },
  estable:  { label: "Confianza estable",   color: "#2563eb", bg: "#EFF6FF", border: "#BFDBFE" },
  parcial:  { label: "Contexto parcial",    color: "#d97706", bg: "#FFFBEB", border: "#FCD34D" },
  limitada: { label: "Validación limitada", color: C.inkLight, bg: C.surface, border: C.line   },
} as const;

// ── Micro-styles ──────────────────────────────────────────────────────────────

const overline = {
  fontFamily:    T.mono,
  fontSize:      T.sz["2xs"],
  fontWeight:    T.wt.semibold,
  letterSpacing: "0.09em",
  textTransform: "uppercase" as const,
  color:         C.inkFaint,
};

// ── Shared sub-components ─────────────────────────────────────────────────────

function SectionHeader({
  label,
  count,
  accentColor,
}: {
  label:       string;
  count:       number;
  accentColor: string;
}) {
  return (
    <div style={{
      display:       "flex",
      alignItems:    "center",
      gap:           S[2],
      padding:       `${S[2]}px ${S[4]}px`,
      background:    "#F8FAFC",
      borderBottom:  `1px solid ${C.lineSubtle}`,
    }}>
      <span style={{
        width:        3,
        height:       12,
        background:   accentColor,
        borderRadius: 2,
        display:      "inline-block",
        flexShrink:   0,
        opacity:      0.7,
      }} />
      <span style={{ ...overline }}>{label}</span>
      <span style={{
        fontFamily:    T.mono,
        fontSize:      T.sz["2xs"],
        color:         C.inkGhost,
        marginLeft:    "auto",
        letterSpacing: "0.03em",
      }}>
        {count}
      </span>
    </div>
  );
}

// Bloque B — Lifecycle + date row
function LifecycleDate({ lifecycle, date }: { lifecycle: MemoryLifecycle; date: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
      <span style={{
        width:        5,
        height:       5,
        borderRadius: "50%",
        background:   LIFECYCLE_DOT[lifecycle],
        display:      "inline-block",
        flexShrink:   0,
      }} />
      <span style={{
        fontFamily:    T.mono,
        fontSize:      T.sz["2xs"],
        color:         C.inkGhost,
        letterSpacing: "0.02em",
      }}>
        {date}
      </span>
    </div>
  );
}

// Bloque E — Last impact inline note
function LastImpact({ text, accentColor }: { text: string; accentColor: string }) {
  return (
    <div style={{
      display:    "flex",
      alignItems: "center",
      gap:        S[1],
      marginTop:  3,
    }}>
      <span style={{
        fontSize:   8,
        color:      accentColor,
        opacity:    0.55,
        flexShrink: 0,
        lineHeight: 1,
      }}>
        ◆
      </span>
      <span style={{
        fontFamily: T.mono,
        fontSize:   T.sz["2xs"],
        color:      C.inkFaint,
        lineHeight: 1.4,
        fontStyle:  "italic",
      }}>
        {text}
      </span>
    </div>
  );
}

// Bloque C — Expand/collapse toggle
function ExpandToggle({
  hiddenCount,
  expanded,
  onToggle,
}: {
  hiddenCount: number;
  expanded:    boolean;
  onToggle:    () => void;
}) {
  if (hiddenCount === 0 && !expanded) return null;
  return (
    <button
      onClick={onToggle}
      style={{
        fontFamily:    T.mono,
        fontSize:      T.sz.xs,
        color:         C.blueDark,
        background:    "none",
        border:        "none",
        cursor:        "pointer",
        padding:       `${S[2]}px ${S[4]}px`,
        width:         "100%",
        textAlign:     "left" as const,
        borderTop:     `1px solid ${C.lineSubtle}`,
        letterSpacing: "0.02em",
        opacity:       0.8,
      }}
    >
      {expanded
        ? "↑ contraer"
        : `→ ver ${hiddenCount} más`
      }
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const DEFAULT_VISIBLE = 3;

export function AgentMemoryTab({ agent }: { agent: CopilotAgent }) {
  const { memory, accentColor } = agent;

  // Bloque C — per-section collapse state
  const [patternsExpanded, setPatternsExpanded] = useState(false);
  const [rulesExpanded,    setRulesExpanded   ] = useState(false);
  const [gapsExpanded,     setGapsExpanded    ] = useState(false);

  const visiblePatterns = patternsExpanded
    ? memory.learnedPatterns
    : memory.learnedPatterns.slice(0, DEFAULT_VISIBLE);
  const hiddenPatterns = memory.learnedPatterns.length - DEFAULT_VISIBLE;

  const visibleRules = rulesExpanded
    ? memory.operationalRules
    : memory.operationalRules.slice(0, DEFAULT_VISIBLE);
  const hiddenRules = memory.operationalRules.length - DEFAULT_VISIBLE;

  const visibleGaps = gapsExpanded
    ? memory.gaps
    : memory.gaps.slice(0, DEFAULT_VISIBLE);
  const hiddenGaps = memory.gaps.length - DEFAULT_VISIBLE;

  const hasAnyMemory =
    memory.strategicContext.length > 0 ||
    memory.learnedPatterns.length  > 0 ||
    memory.operationalRules.length > 0 ||
    memory.gaps.length             > 0;

  // Empty state
  if (!hasAnyMemory) {
    return (
      <div style={{
        padding:    `${S[8]}px ${S[6]}px`,
        background: C.surface,
        border:     `1px dashed ${C.line}`,
        borderRadius: R.xl,
        textAlign:  "center" as const,
      }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz["3xl"], fontWeight: T.wt.black, color: accentColor, opacity: 0.25, marginBottom: S[3] }}>
          M
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.md, fontWeight: T.wt.semibold, color: C.inkMid, marginBottom: S[2] }}>
          Memoria operacional vacía
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
          Sin contexto, patrones ni reglas registradas.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>

      {/* ══════════════════════════════════════════════════════════════════════
          1. STRATEGIC CONTEXT — full-width knowledge registry
      ══════════════════════════════════════════════════════════════════════ */}
      {memory.strategicContext.length > 0 && (
        <div style={{
          background:   "linear-gradient(180deg, #FFFFFF 0%, #FAFBFD 100%)",
          border:       `1px solid ${C.line}`,
          borderRadius: R.card,
          overflow:     "hidden",
          boxShadow:    E.sm,
        }}>
          <SectionHeader
            label="Contexto estratégico"
            count={memory.strategicContext.length}
            accentColor={accentColor}
          />

          {memory.strategicContext.map((ctx, i) => {
            const isArchived = ctx.lifecycle === "archived";
            const pLabel = PRIORITY_LABEL[ctx.priority];
            return (
              <div key={i} style={{
                display:      "flex",
                gap:          S[4],
                padding:      `${S[2] + 2}px ${S[4]}px ${S[2] + 2}px ${S[3]}px`,
                borderBottom: i < memory.strategicContext.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
                alignItems:   "flex-start",
                opacity:      isArchived ? 0.5 : 1,
                /* Bloque A — subtle left priority bar */
                borderLeft:   `3px solid ${priorityBar(ctx.priority, accentColor)}`,
              }}>

                {/* Left: title + body + lastImpact */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: S[2], marginBottom: 3 }}>
                    <span style={{
                      fontFamily: T.mono,
                      fontSize:   T.sz.sm,
                      fontWeight: T.wt.semibold,
                      color:      C.ink,
                      lineHeight: 1.3,
                    }}>
                      {ctx.title}
                    </span>
                    {/* Bloque A — tiny priority label for critical/strategic only */}
                    {pLabel && (
                      <span style={{
                        fontFamily:    T.mono,
                        fontSize:      7,
                        fontWeight:    T.wt.bold,
                        color:         priorityBar(ctx.priority, accentColor),
                        letterSpacing: "0.08em",
                        opacity:       0.7,
                        flexShrink:    0,
                      }}>
                        {pLabel}
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontFamily: T.mono,
                    fontSize:   T.sz.xs,
                    color:      C.inkLight,
                    lineHeight: 1.6,
                  }}>
                    {ctx.body}
                  </div>
                  {/* Bloque E — last impact */}
                  {ctx.lastImpact && <LastImpact text={ctx.lastImpact} accentColor={accentColor} />}
                </div>

                {/* Right: scope + lifecycle + date */}
                <div style={{
                  display:       "flex",
                  flexDirection: "column",
                  alignItems:    "flex-end",
                  gap:           4,
                  flexShrink:    0,
                }}>
                  <span style={{
                    fontFamily:   T.mono,
                    fontSize:     T.sz["2xs"],
                    color:        accentColor,
                    background:   `${accentColor}0C`,
                    border:       `1px solid ${accentColor}18`,
                    borderRadius: R.xs,
                    padding:      "1px 7px",
                    lineHeight:   1.6,
                    whiteSpace:   "nowrap" as const,
                  }}>
                    {ctx.scope}
                  </span>
                  {/* Bloque B — lifecycle dot + date */}
                  <LifecycleDate lifecycle={ctx.lifecycle} date={ctx.updatedAt} />
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          2. LEARNED PATTERNS — 2-column grid, progressively disclosed
      ══════════════════════════════════════════════════════════════════════ */}
      {memory.learnedPatterns.length > 0 && (
        <div>
          <div style={{
            display:      "flex",
            alignItems:   "center",
            gap:          S[2],
            marginBottom: S[2],
            padding:      `0 2px`,
          }}>
            <span style={{ width: 3, height: 12, background: accentColor, borderRadius: 2, display: "inline-block", opacity: 0.7 }} />
            <span style={{ ...overline }}>Patrones aprendidos</span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost, marginLeft: "auto" }}>
              {memory.learnedPatterns.length}
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: S[3] }}>
            {visiblePatterns.map((pattern, i) => {
              const conf     = CONFIDENCE_CONFIG[pattern.confidenceLevel];
              const isArchived = pattern.lifecycle === "archived";
              const pLabel   = PRIORITY_LABEL[pattern.priority];
              return (
                <div key={i} style={{
                  background:    C.white,
                  border:        `1px solid ${C.line}`,
                  /* Bloque A — priority as top border */
                  borderTop:     `2px solid ${priorityBar(pattern.priority, accentColor)}`,
                  borderRadius:  R.card,
                  overflow:      "hidden",
                  boxShadow:     E.xs,
                  opacity:       isArchived ? 0.5 : 1,
                  display:       "flex",
                  flexDirection: "column",
                }}>

                  {/* Card header row */}
                  <div style={{
                    display:        "flex",
                    alignItems:     "center",
                    justifyContent: "space-between",
                    padding:        `${S[2]}px ${S[3]}px ${S[1]}px`,
                    borderBottom:   `1px solid ${C.lineSubtle}`,
                    background:     "#FAFBFC",
                  }}>
                    {/* Pattern number + optional priority label */}
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{
                        fontFamily:    T.mono,
                        fontSize:      8,
                        fontWeight:    T.wt.bold,
                        color:         priorityBar(pattern.priority, accentColor),
                        letterSpacing: "0.10em",
                        opacity:       0.65,
                      }}>
                        {`PTN ${String(i + 1).padStart(2, "0")}`}
                      </span>
                      {pLabel && (
                        <span style={{
                          fontFamily:    T.mono,
                          fontSize:      7,
                          fontWeight:    T.wt.bold,
                          color:         priorityBar(pattern.priority, accentColor),
                          letterSpacing: "0.08em",
                          opacity:       0.55,
                        }}>
                          · {pLabel}
                        </span>
                      )}
                    </div>
                    {/* Bloque H — confidence semantic badge */}
                    <span style={{
                      fontFamily:   T.mono,
                      fontSize:     T.sz["2xs"],
                      fontWeight:   T.wt.semibold,
                      color:        conf.color,
                      background:   conf.bg,
                      border:       `1px solid ${conf.border}`,
                      borderRadius: R.pill,
                      padding:      "1px 7px",
                      lineHeight:   1.6,
                      whiteSpace:   "nowrap" as const,
                    }}>
                      {conf.label}
                    </span>
                  </div>

                  {/* Card body */}
                  <div style={{ padding: `${S[2] + 1}px ${S[3]}px ${S[2]}px`, flex: 1 }}>
                    <div style={{
                      fontFamily:   T.mono,
                      fontSize:     T.sz.sm,
                      fontWeight:   T.wt.semibold,
                      color:        C.ink,
                      lineHeight:   1.3,
                      marginBottom: 4,
                    }}>
                      {pattern.title}
                    </div>
                    {/* Bloque F — description compact */}
                    <div style={{
                      fontFamily: T.mono,
                      fontSize:   T.sz.xs,
                      color:      C.inkMid,
                      lineHeight: 1.6,
                    }}>
                      {pattern.description}
                    </div>
                    {/* Bloque E — last impact */}
                    {pattern.lastImpact && <LastImpact text={pattern.lastImpact} accentColor={accentColor} />}
                  </div>

                  {/* Card footer: source + lifecycle + date */}
                  <div style={{
                    display:        "flex",
                    alignItems:     "center",
                    justifyContent: "space-between",
                    padding:        `${S[1] + 1}px ${S[3]}px`,
                    borderTop:      `1px solid ${C.lineSubtle}`,
                    background:     "#FAFBFC",
                  }}>
                    <span style={{
                      fontFamily:   T.mono,
                      fontSize:     T.sz["2xs"],
                      color:        C.inkFaint,
                      background:   C.surface,
                      border:       `1px solid ${C.lineSubtle}`,
                      borderRadius: R.xs,
                      padding:      "1px 6px",
                      lineHeight:   1.6,
                    }}>
                      {pattern.source}
                    </span>
                    <LifecycleDate lifecycle={pattern.lifecycle} date={pattern.updatedAt} />
                  </div>

                </div>
              );
            })}
          </div>

          {/* Bloque C — expand toggle for patterns */}
          {hiddenPatterns > 0 && (
            <ExpandToggle
              hiddenCount={patternsExpanded ? 0 : hiddenPatterns}
              expanded={patternsExpanded}
              onToggle={() => setPatternsExpanded(p => !p)}
            />
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          3 + 4. OPERATIONAL RULES (3fr) | MEMORY GAPS (2fr)
      ══════════════════════════════════════════════════════════════════════ */}
      {(memory.operationalRules.length > 0 || memory.gaps.length > 0) && (
        <div style={{
          display:             "grid",
          gridTemplateColumns: "3fr 2fr",
          gap:                 S[3],
          alignItems:          "start",
        }}>

          {/* ── Operational Rules ──────────────────────────────────────────── */}
          {memory.operationalRules.length > 0 && (
            <div style={{
              background:   C.white,
              border:       `1px solid ${C.line}`,
              borderRadius: R.card,
              overflow:     "hidden",
              boxShadow:    E.sm,
            }}>
              <SectionHeader
                label="Reglas operacionales"
                count={memory.operationalRules.length}
                accentColor={accentColor}
              />

              {visibleRules.map((rule, i) => {
                const prio = RULE_PRIORITY[rule.priority];
                const isArchived = rule.lifecycle === "archived";
                return (
                  <div key={i} style={{
                    display:      "flex",
                    gap:          S[3],
                    padding:      `${S[2] + 2}px ${S[4]}px ${S[2] + 2}px ${S[3]}px`,
                    borderBottom: i < visibleRules.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
                    alignItems:   "flex-start",
                    opacity:      isArchived ? 0.5 : 1,
                    /* Bloque A — rule priority as left bar (uses execution urgency color) */
                    borderLeft:   `3px solid ${prio.chipColor}`,
                  }}>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Rule + priority chip */}
                      <div style={{ display: "flex", alignItems: "flex-start", gap: S[2], marginBottom: 4 }}>
                        <span style={{
                          fontFamily:  T.mono,
                          fontSize:    T.sz.sm,
                          fontWeight:  T.wt.semibold,
                          color:       C.ink,
                          lineHeight:  1.3,
                          flex:        1,
                        }}>
                          {rule.rule}
                        </span>
                        <span style={{
                          fontFamily:    T.mono,
                          fontSize:      T.sz["2xs"],
                          fontWeight:    T.wt.semibold,
                          color:         prio.chipColor,
                          background:    prio.chipBg,
                          border:        `1px solid ${prio.chipBorder}`,
                          borderRadius:  R.pill,
                          padding:       "1px 7px",
                          letterSpacing: "0.05em",
                          lineHeight:    1.6,
                          flexShrink:    0,
                          whiteSpace:    "nowrap" as const,
                        }}>
                          {prio.label}
                        </span>
                      </div>
                      {/* Reason — Bloque G: slightly more contrast */}
                      <div style={{
                        fontFamily: T.mono,
                        fontSize:   T.sz.xs,
                        color:      C.inkMid,
                        lineHeight: 1.6,
                      }}>
                        {rule.reason}
                      </div>
                      {/* Bloque E — last impact */}
                      {rule.lastImpact && <LastImpact text={rule.lastImpact} accentColor={accentColor} />}
                      {/* Bloque B — lifecycle */}
                      <div style={{ marginTop: 3 }}>
                        <LifecycleDate lifecycle={rule.lifecycle} date={LIFECYCLE_LABEL[rule.lifecycle]} />
                      </div>
                    </div>

                  </div>
                );
              })}

              {/* Bloque C — expand toggle for rules */}
              <ExpandToggle
                hiddenCount={rulesExpanded ? 0 : Math.max(0, hiddenRules)}
                expanded={rulesExpanded}
                onToggle={() => setRulesExpanded(p => !p)}
              />
            </div>
          )}

          {/* ── Memory Gaps — missing capabilities ─────────────────────────── */}
          {memory.gaps.length > 0 && (
            <div style={{
              background:   C.white,
              border:       `1px solid ${C.line}`,
              borderRadius: R.card,
              overflow:     "hidden",
              boxShadow:    E.sm,
            }}>
              <SectionHeader
                label="Capacidades faltantes"
                count={memory.gaps.length}
                accentColor={accentColor}
              />

              {visibleGaps.map((gap, i) => {
                const st = GAP_STATUS[gap.status];
                const isArchived = gap.lifecycle === "archived";
                const pLabel = PRIORITY_LABEL[gap.priority];
                return (
                  <div key={i} style={{
                    padding:      `${S[2] + 2}px ${S[4]}px ${S[2] + 2}px ${S[3]}px`,
                    borderBottom: i < visibleGaps.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
                    opacity:      isArchived ? 0.5 : 1,
                    /* Bloque A — priority left bar */
                    borderLeft:   `3px solid ${priorityBar(gap.priority, accentColor)}`,
                  }}>

                    {/* Title + status chip */}
                    <div style={{ display: "flex", alignItems: "flex-start", gap: S[2], marginBottom: 3 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: S[1] }}>
                          <span style={{
                            fontFamily:  T.mono,
                            fontSize:    T.sz.sm,
                            fontWeight:  T.wt.semibold,
                            color:       C.ink,
                            lineHeight:  1.3,
                          }}>
                            {gap.title}
                          </span>
                          {pLabel && (
                            <span style={{
                              fontFamily:    T.mono,
                              fontSize:      7,
                              fontWeight:    T.wt.bold,
                              color:         priorityBar(gap.priority, accentColor),
                              letterSpacing: "0.08em",
                              opacity:       0.6,
                              flexShrink:    0,
                            }}>
                              {pLabel}
                            </span>
                          )}
                        </div>
                      </div>
                      <span style={{
                        fontFamily:    T.mono,
                        fontSize:      T.sz["2xs"],
                        fontWeight:    T.wt.semibold,
                        color:         st.color,
                        background:    st.bg,
                        border:        `1px solid ${st.border}`,
                        borderRadius:  R.pill,
                        padding:       "1px 7px",
                        letterSpacing: "0.05em",
                        lineHeight:    1.6,
                        flexShrink:    0,
                        whiteSpace:    "nowrap" as const,
                      }}>
                        {st.label}
                      </span>
                    </div>

                    {/* Impact */}
                    <div style={{
                      fontFamily:   T.mono,
                      fontSize:     T.sz.xs,
                      color:        C.inkMid,
                      lineHeight:   1.6,
                      marginBottom: S[2],
                    }}>
                      {gap.impact}
                    </div>

                    {/* Bloque I — capability framing (not a task) */}
                    <div style={{
                      display:    "flex",
                      alignItems: "flex-start",
                      gap:        S[1],
                      paddingTop: S[2],
                      borderTop:  `1px solid ${C.lineSubtle}`,
                    }}>
                      <span style={{
                        fontFamily:    T.mono,
                        fontSize:      T.sz["2xs"],
                        fontWeight:    T.wt.semibold,
                        color:         accentColor,
                        opacity:       0.65,
                        letterSpacing: "0.07em",
                        textTransform: "uppercase" as const,
                        flexShrink:    0,
                        paddingTop:    1,
                      }}>
                        Capacidad →
                      </span>
                      <span style={{
                        fontFamily: T.mono,
                        fontSize:   T.sz["2xs"],
                        color:      C.inkMid,
                        lineHeight: 1.6,
                      }}>
                        {gap.capability}
                      </span>
                    </div>

                  </div>
                );
              })}

              {/* Bloque C — expand toggle for gaps */}
              <ExpandToggle
                hiddenCount={gapsExpanded ? 0 : Math.max(0, hiddenGaps)}
                expanded={gapsExpanded}
                onToggle={() => setGapsExpanded(p => !p)}
              />
            </div>
          )}

        </div>
      )}

    </div>
  );
}
