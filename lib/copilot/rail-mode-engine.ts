/**
 * lib/copilot/rail-mode-engine.ts
 *
 * Agentik Copilot — Rail Mode Engine V1
 *
 * Resolves the operational mode of the right rail based on context signals.
 * The rail mode drives:
 *   - header accent glow
 *   - section priority ordering
 *   - auto-collapse / auto-expand behavior
 *   - contextual badge label
 *   - visual density
 *
 * Sprint: AGENTIK-COPILOT-ADAPTIVE-RAIL-01
 */

import type { OperationalPriority } from "./context-engine";

// ── Rail mode type ─────────────────────────────────────────────────────────────

export type CopilotRailMode =
  | "critical"    // Critical signals active — urgent, focused, alert-forward
  | "monitoring"  // Active signals (non-critical) — watchful, attentive
  | "executive"   // Executive module, balanced — authoritative, structured
  | "analysis"    // Deep analysis modules (marketing, planning) — exploratory
  | "calm";       // No signals, routine state — minimal, open, breathing room

// ── Mode resolver input ────────────────────────────────────────────────────────

export interface RailModeInput {
  runtimeState:        "HEALTHY" | "SYNCING" | "STALE" | "DEGRADED";
  operationalPriority: OperationalPriority;
  activeModule:        string;
  criticalSignalCount: number;
  tenantState:         "healthy" | "degraded" | "critical";
}

// ── Mode resolution rules ──────────────────────────────────────────────────────

/**
 * Resolves the rail mode from context inputs.
 * Rules fire in priority order — first match wins.
 */
export function resolveRailMode(input: RailModeInput): CopilotRailMode {
  const { runtimeState, operationalPriority, activeModule, criticalSignalCount, tenantState } = input;

  // Rule 1: Critical system + critical signals → critical mode
  if (
    criticalSignalCount >= 1 ||
    tenantState === "critical" ||
    operationalPriority === "critical"
  ) {
    return "critical";
  }

  // Rule 2: Degraded/stale runtime with signals → monitoring
  if (
    (runtimeState === "DEGRADED" || runtimeState === "STALE") &&
    operationalPriority !== "idle"
  ) {
    return "monitoring";
  }

  // Rule 3: Active (non-critical) signals → monitoring
  if (operationalPriority === "elevated" || operationalPriority === "normal") {
    return "monitoring";
  }

  // Rule 4: Executive / Torre de Control with no signals → executive
  if (
    activeModule.startsWith("executive") ||
    activeModule.startsWith("finanzas") ||
    activeModule.startsWith("finance")
  ) {
    return "executive";
  }

  // Rule 5: Creative / analysis modules → analysis
  if (
    activeModule.startsWith("agentik/marketing-studio") ||
    activeModule.startsWith("agentik") ||
    activeModule.startsWith("reports")
  ) {
    return "analysis";
  }

  // Rule 6: All other modules with no signals → calm
  return "calm";
}

// ── Mode metadata ──────────────────────────────────────────────────────────────

/** Short contextual badge label for each mode */
const MODE_LABELS: Record<CopilotRailMode, string> = {
  critical:   "Atención prioritaria",
  monitoring: "Monitoreo activo",
  executive:  "Modo ejecutivo",
  analysis:   "Modo análisis",
  calm:       "Contexto estable",
};

/** Accent hex color for each mode — used for header glow and top strip */
const MODE_ACCENT: Record<CopilotRailMode, string> = {
  critical:   "#DC2626",  // red
  monitoring: "#D97706",  // amber
  executive:  "#004AAD",  // C.blueDark
  analysis:   "#7C3AED",  // C.brand (purple)
  calm:       "#16A34A",  // C.green
};

/** Glow shadow added to header card per mode (subtle — not gaming) */
const MODE_GLOW: Record<CopilotRailMode, string> = {
  critical:   "0 2px 18px rgba(0,18,40,.32), 0 0 0 1px rgba(220,38,38,.30), inset 0 1px 0 rgba(255,255,255,.05)",
  monitoring: "0 2px 16px rgba(0,18,40,.28), 0 0 0 1px rgba(217,119,6,.22), inset 0 1px 0 rgba(255,255,255,.04)",
  executive:  "0 2px 16px rgba(0,18,40,.28), 0 0 0 1px rgba(0,74,173,.32), inset 0 1px 0 rgba(255,255,255,.06)",
  analysis:   "0 2px 14px rgba(0,18,40,.26), 0 0 0 1px rgba(124,58,237,.20), inset 0 1px 0 rgba(255,255,255,.04)",
  calm:       "0 1px 8px rgba(0,18,40,.18), inset 0 1px 0 rgba(255,255,255,.03)",
};

/** Top strip gradient per mode */
const MODE_STRIP: Record<CopilotRailMode, string> = {
  critical:   "linear-gradient(90deg, #DC2626, #EF4444, #F87171)",
  monitoring: "linear-gradient(90deg, #B45309, #D97706, #F59E0B)",
  executive:  "linear-gradient(90deg, #004AAD, #1E63D8, #4F8FE8)",
  analysis:   "linear-gradient(90deg, #6D28D9, #7C3AED, #8B5CF6)",
  calm:       "linear-gradient(90deg, #15803D, #16A34A, #22C55E)",
};

export function getRailModeLabel(mode: CopilotRailMode): string {
  return MODE_LABELS[mode];
}

export function getRailModeAccent(mode: CopilotRailMode): string {
  return MODE_ACCENT[mode];
}

export function getRailModeGlow(mode: CopilotRailMode): string {
  return MODE_GLOW[mode];
}

export function getRailModeStrip(mode: CopilotRailMode): string {
  return MODE_STRIP[mode];
}
