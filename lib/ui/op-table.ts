/**
 * lib/ui/op-table.ts
 *
 * Agentik Enterprise OS — Operational Table Standard
 *
 * Shared style helpers for ALL operational table rows across the enterprise shell.
 * Enforces consistent action columns, truncated text zones, and status/CTA separation.
 *
 * ── AGENTIK OPERATIONAL TABLE RULE ───────────────────────────────────────────
 *
 *  ANY operational table with variable-length columns MUST use CSS grid, not flex.
 *
 *  WHY: flex with flex:1 creates voids, misalignment, and variable-width buttons.
 *       CSS grid forces all rows to share fixed column widths — ensuring that every
 *       badge, every button, and every text cell aligns vertically across all rows.
 *
 *  RULE: gridTemplateColumns = "<fixed>px <flexible>fr <fixed>px <action>px"
 *        Never use flex for the outer row of a financial data table.
 *
 *  APPLIES TO: Finanzas · Documentos · Conciliación · Tesorería · all future modules.
 *
 * ── STYLE RULES ───────────────────────────────────────────────────────────────
 *  1. opActionBtn       → minWidth:112px, height:28px, inline-flex centered — always
 *  2. opActionCol       → flex:0 0 140px min, paddingRight for safe edge clearance
 *  3. opStatusActionCol → badge stacked above button, never on same line
 *  4. opFlexZone        → flex:1 minWidth:0 — all variable-length content zones
 *  5. opTruncateSpan    → overflow+ellipsis+nowrap+block — variable text spans
 *  6. opTruncateInline  → overflow+ellipsis+nowrap — inline flex text
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * ── AGENTIK COLUMN DISTRIBUTION RULE (PERMANENT) ────────────────────────────
 *
 *  In operational tables, column roles are fixed:
 *    • STATUS and ACTION columns → always fixed-width (px or explicit minmax)
 *    • INFORMATION and CONTEXT columns → flexible (fr / minmax)
 *    • Never allow badges or action buttons to push lateral layout
 *
 *  Correct pattern:
 *    gridTemplateColumns: "56px minmax(240px,1.8fr) minmax(160px,1fr) 140px 148px"
 *    //                     ID   ← label (flex) →   ← context (flex) →  STATUS  ACTION
 *
 *  Use columnGap (not gap) when row padding already provides vertical rhythm.
 *  columnGap: 28 is the standard separation for financial operational tables.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * ── AGENTIK OPERATIONAL PALETTE RULE (PERMANENT) ──────────────────────────────
 *
 *  Operational tables do NOT use strong colors as their base.
 *  Strong colors (red, amber, green) belong ONLY in:
 *    • Section headers (accent border)
 *    • Status badges (ag-op-status variants)
 *    • Indicator dots and progress systems
 *    • CTA buttons for critical actions
 *    • Left-border severity stripes on rows
 *
 *  Table backgrounds, text, and layout structure stay neutral (white / surface / ink tones).
 *  This prevents dashboards from feeling like alarm consoles.
 *
 *  Violating this rule → saturated, unreadable, unprofessional dashboards.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 */

import type { CSSProperties } from "react";
import { T, S, R }            from "./tokens";

// ── 1. Action button ──────────────────────────────────────────────────────────

/**
 * Standardized operational action button style.
 * Pass the semantic color for this table context.
 *
 * Usage:
 *   <button style={opActionBtn(C.amber)}>Aprobar →</button>
 *   <button style={{ ...opActionBtn(C.blueDark), transition: "background 0.1s" }}>Ver →</button>
 */
export const opActionBtn = (color: string): CSSProperties => ({
  fontFamily:     T.mono,
  fontSize:       T.sz["2xs"],
  fontWeight:     700,
  color,
  background:     `${color}12`,
  border:         `1px solid ${color}40`,
  borderRadius:   R.sm,
  padding:        `0 ${S[3]}px`,
  cursor:         "pointer",
  whiteSpace:     "nowrap",
  minWidth:       112,
  height:         28,
  display:        "inline-flex",
  alignItems:     "center",
  justifyContent: "center",
  flexShrink:     0,
});

// ── 2. Action column containers ───────────────────────────────────────────────

/**
 * Right-side action column. Contains only the action button.
 * Default width: 140px.
 *
 * Usage:
 *   <div style={opActionCol()}>...</div>
 *   <div style={opActionCol(160)}>...</div>
 */
export const opActionCol = (widthPx = 140): CSSProperties => ({
  flex:           `0 0 ${widthPx}px`,
  display:        "flex",
  justifyContent: "flex-end",
  paddingRight:   S[2],
});

/**
 * Right-side column when a row needs BOTH a status badge AND an action button.
 * Stacks badge above button — separated, never on the same line.
 * Default width: 148px.
 *
 * Usage:
 *   <div style={opStatusActionCol()}>
 *     <span className="ag-op-status ag-op-status--ok">Listo</span>
 *     <button style={opActionBtn(C.green)}>Generar →</button>
 *   </div>
 */
export const opStatusActionCol = (widthPx = 148): CSSProperties => ({
  flex:           `0 0 ${widthPx}px`,
  display:        "flex",
  flexDirection:  "column",
  alignItems:     "flex-end",
  gap:            S[1],
  paddingRight:   S[2],
});

// ── 3. Text zones ─────────────────────────────────────────────────────────────

/**
 * Flexible content zone for variable-length left/centre content.
 * Always apply to the container div, not the text span directly.
 *
 * Usage:
 *   <div style={opFlexZone}>
 *     <span style={opTruncateSpan}>{item.label}</span>
 *   </div>
 */
export const opFlexZone: CSSProperties = {
  flex:     1,
  minWidth: 0,
};

/**
 * Truncation for variable-length text in block context (span inside grid cell).
 *
 * Usage:
 *   <span style={opTruncateSpan}>{item.nombre}</span>
 */
export const opTruncateSpan: CSSProperties = {
  overflow:     "hidden",
  textOverflow: "ellipsis",
  whiteSpace:   "nowrap",
  display:      "block",
};

/**
 * Truncation for variable-length text in inline flex context.
 *
 * Usage:
 *   <span style={opTruncateInline}>{item.label}</span>
 */
export const opTruncateInline: CSSProperties = {
  overflow:     "hidden",
  textOverflow: "ellipsis",
  whiteSpace:   "nowrap",
};
