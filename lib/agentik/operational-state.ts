/**
 * lib/agentik/operational-state.ts
 *
 * AGENTIK-CORE-STABILIZATION-01
 *
 * Centralized operational state system.
 * Single source of truth for all state badges, dots, borders, and backgrounds
 * across Workflows, Integrations, Capabilities, Memory, Execution Layer, and Agent Cards.
 *
 * Usage:
 *   import { OP_STATE, type OpStateKey } from "@/lib/agentik/operational-state";
 *   const cfg = OP_STATE["running"];
 *   <span style={{ color: cfg.text, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
 *     {cfg.label}
 *   </span>
 */

// ── State key ─────────────────────────────────────────────────────────────────

export type OpStateKey =
  | "healthy"
  | "running"
  | "syncing"
  | "degraded"
  | "blocked"
  | "pending"
  | "supervised"
  | "partial"
  | "disconnected"
  | "offline";

// ── Semantic severity — drives escalation logic and attention signals ──────────

export type OpSeverity =
  | "ok"       // System is healthy and operating normally
  | "info"     // Neutral operational activity
  | "caution"  // Potential issue — monitor
  | "warning"  // Requires attention, may impact operations
  | "critical" // Immediate action required
  | "inactive";// System not running — offline or disabled

// ── State definition ───────────────────────────────────────────────────────────

export interface OpStateDef {
  label:    string;         // Human-readable Spanish label (e.g. "Ejecutando")
  dot:      string;         // Dot/pulse indicator color
  text:     string;         // Badge text color
  bg:       string;         // Badge background color
  border:   string;         // Badge border color
  severity: OpSeverity;     // Semantic severity for escalation/attention logic
}

// ── State registry ─────────────────────────────────────────────────────────────

export const OP_STATE: Record<OpStateKey, OpStateDef> = {

  healthy: {
    label:    "Saludable",
    dot:      "#16a34a",
    text:     "#166534",
    bg:       "#f0fdf4",
    border:   "#bbf7d0",
    severity: "ok",
  },

  running: {
    label:    "Ejecutando",
    dot:      "#2563eb",
    text:     "#1e3a8a",
    bg:       "#eff6ff",
    border:   "#bfdbfe",
    severity: "info",
  },

  syncing: {
    label:    "Sincronizando",
    dot:      "#0284c7",
    text:     "#0c4a6e",
    bg:       "#f0f9ff",
    border:   "#bae6fd",
    severity: "info",
  },

  degraded: {
    label:    "Degradado",
    dot:      "#d97706",
    text:     "#92400e",
    bg:       "#fffbeb",
    border:   "#fde68a",
    severity: "warning",
  },

  blocked: {
    label:    "Bloqueado",
    dot:      "#dc2626",
    text:     "#7f1d1d",
    bg:       "#fef2f2",
    border:   "#fecaca",
    severity: "critical",
  },

  pending: {
    label:    "Pendiente",
    dot:      "#7c3aed",
    text:     "#4c1d95",
    bg:       "#f5f3ff",
    border:   "#ddd6fe",
    severity: "caution",
  },

  supervised: {
    label:    "Supervisado",
    dot:      "#9333ea",
    text:     "#581c87",
    bg:       "#faf5ff",
    border:   "#e9d5ff",
    severity: "caution",
  },

  partial: {
    label:    "Parcial",
    dot:      "#ea580c",
    text:     "#7c2d12",
    bg:       "#fff7ed",
    border:   "#fed7aa",
    severity: "warning",
  },

  disconnected: {
    label:    "Desconectado",
    dot:      "#9ca3af",
    text:     "#4b5563",
    bg:       "#f9fafb",
    border:   "#e5e7eb",
    severity: "caution",
  },

  offline: {
    label:    "Offline",
    dot:      "#6b7280",
    text:     "#374151",
    bg:       "#f9fafb",
    border:   "#e5e7eb",
    severity: "inactive",
  },
};

// ── Helper — severity → single-color accent ───────────────────────────────────

export const SEVERITY_BAR: Record<OpSeverity, string> = {
  ok:       "#16a34a",
  info:     "#2563eb",
  caution:  "#9333ea",
  warning:  "#d97706",
  critical: "#dc2626",
  inactive: "#d1d5db",
};

// ── Helper — get state or fall back gracefully ─────────────────────────────────

export function getOpState(key: string): OpStateDef {
  return OP_STATE[key as OpStateKey] ?? OP_STATE["offline"];
}
