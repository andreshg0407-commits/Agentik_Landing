/**
 * lib/copilot/rail-priority.ts
 *
 * Agentik Copilot — Rail Section Priority Engine V1
 *
 * Determines the display order of sections in the right rail based on
 * the current rail mode. Higher-priority sections render first.
 *
 * Section keys map directly to section IDs in copilot-ops-rail.tsx.
 *
 * Sprint: AGENTIK-COPILOT-ADAPTIVE-RAIL-01
 */

import type { CopilotRailMode } from "./rail-mode-engine";

// ── Section key type ───────────────────────────────────────────────────────────

export type RailSectionKey =
  | "signal"      // Primary signal + suggested actions + insight
  | "tasks"       // Tasks derived from signals
  | "alerts"      // Operational alerts
  | "decisions"   // Pending approvals (internal)
  | "nextsteps"   // Contextual next step suggestions
  | "memory"      // Operational memory + capability hints
  | "timeline";   // Executive activity timeline

// ── Section visibility rules ───────────────────────────────────────────────────

export interface SectionConfig {
  key:              RailSectionKey;
  autoExpanded:     boolean;   // Whether to auto-expand in this mode
  collapsed:        boolean;   // Whether to start collapsed
  prominent:        boolean;   // Whether to visually emphasize this section
}

export interface RailSectionPriority {
  order:    RailSectionKey[];   // Sections in priority order (first = most important)
  configs:  SectionConfig[];    // Per-section configuration
}

// ── Priority definitions per mode ─────────────────────────────────────────────

const PRIORITIES: Record<CopilotRailMode, RailSectionPriority> = {

  // ── critical: urgent, alert-forward ─────────────────────────────────────────
  critical: {
    order: ["signal", "alerts", "decisions", "tasks", "nextsteps", "memory", "timeline"],
    configs: [
      { key: "signal",    autoExpanded: true,  collapsed: false, prominent: true  },
      { key: "alerts",    autoExpanded: true,  collapsed: false, prominent: true  },
      { key: "decisions", autoExpanded: true,  collapsed: false, prominent: false },
      { key: "tasks",     autoExpanded: true,  collapsed: false, prominent: false },
      { key: "nextsteps", autoExpanded: false, collapsed: false, prominent: false },
      { key: "memory",    autoExpanded: false, collapsed: true,  prominent: false },
      { key: "timeline",  autoExpanded: false, collapsed: true,  prominent: false },
    ],
  },

  // ── monitoring: watchful, balanced but signal-first ──────────────────────────
  monitoring: {
    order: ["signal", "tasks", "alerts", "nextsteps", "decisions", "memory", "timeline"],
    configs: [
      { key: "signal",    autoExpanded: true,  collapsed: false, prominent: true  },
      { key: "tasks",     autoExpanded: true,  collapsed: false, prominent: false },
      { key: "alerts",    autoExpanded: false, collapsed: false, prominent: false },
      { key: "nextsteps", autoExpanded: false, collapsed: false, prominent: false },
      { key: "decisions", autoExpanded: false, collapsed: false, prominent: false },
      { key: "memory",    autoExpanded: false, collapsed: true,  prominent: false },
      { key: "timeline",  autoExpanded: false, collapsed: false, prominent: false },
    ],
  },

  // ── executive: authoritative, structured, balanced ──────────────────────────
  executive: {
    order: ["signal", "nextsteps", "tasks", "alerts", "decisions", "timeline", "memory"],
    configs: [
      { key: "signal",    autoExpanded: false, collapsed: false, prominent: false },
      { key: "nextsteps", autoExpanded: false, collapsed: false, prominent: true  },
      { key: "tasks",     autoExpanded: false, collapsed: false, prominent: false },
      { key: "alerts",    autoExpanded: false, collapsed: false, prominent: false },
      { key: "decisions", autoExpanded: false, collapsed: false, prominent: false },
      { key: "timeline",  autoExpanded: false, collapsed: false, prominent: false },
      { key: "memory",    autoExpanded: false, collapsed: false, prominent: false },
    ],
  },

  // ── analysis: insight-first, exploratory ─────────────────────────────────────
  analysis: {
    order: ["signal", "nextsteps", "memory", "tasks", "alerts", "timeline", "decisions"],
    configs: [
      { key: "signal",    autoExpanded: true,  collapsed: false, prominent: true  },
      { key: "nextsteps", autoExpanded: true,  collapsed: false, prominent: false },
      { key: "memory",    autoExpanded: true,  collapsed: false, prominent: true  },
      { key: "tasks",     autoExpanded: false, collapsed: false, prominent: false },
      { key: "alerts",    autoExpanded: false, collapsed: true,  prominent: false },
      { key: "timeline",  autoExpanded: false, collapsed: false, prominent: false },
      { key: "decisions", autoExpanded: false, collapsed: true,  prominent: false },
    ],
  },

  // ── calm: minimal, open, memory-forward ─────────────────────────────────────
  calm: {
    order: ["nextsteps", "signal", "memory", "timeline", "tasks", "alerts", "decisions"],
    configs: [
      { key: "nextsteps", autoExpanded: false, collapsed: false, prominent: true  },
      { key: "signal",    autoExpanded: false, collapsed: false, prominent: false },
      { key: "memory",    autoExpanded: true,  collapsed: false, prominent: false },
      { key: "timeline",  autoExpanded: false, collapsed: false, prominent: false },
      { key: "tasks",     autoExpanded: false, collapsed: true,  prominent: false },
      { key: "alerts",    autoExpanded: false, collapsed: true,  prominent: false },
      { key: "decisions", autoExpanded: false, collapsed: true,  prominent: false },
    ],
  },
};

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Returns the section priority configuration for a given rail mode.
 */
export function resolveRailSectionPriority(mode: CopilotRailMode): RailSectionPriority {
  return PRIORITIES[mode] ?? PRIORITIES["executive"]!;
}

/**
 * Returns the CSS `order` value for a section key in a given mode.
 * Lower = rendered first visually.
 */
export function getSectionOrder(
  priority: RailSectionPriority,
  key:      RailSectionKey,
): number {
  const idx = priority.order.indexOf(key);
  return idx >= 0 ? idx : 99;
}

/**
 * Returns the SectionConfig for a specific section key.
 */
export function getSectionConfig(
  priority: RailSectionPriority,
  key:      RailSectionKey,
): SectionConfig {
  return (
    priority.configs.find(c => c.key === key) ??
    { key, autoExpanded: false, collapsed: false, prominent: false }
  );
}
