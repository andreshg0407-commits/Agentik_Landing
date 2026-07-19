/**
 * lib/copilot/section-groups.ts
 *
 * Agentik Copilot — Section Group Definitions
 *
 * Sprint: AGENTIK-COPILOT-SURFACE-SEGREGATION-01 — Block B3
 *
 * Defines the four display groups, their collapse behavior, and
 * the default open/closed state per surface.
 */

import type { CopilotSurface, SectionGroup } from "./surface-types";

// ── Group metadata ─────────────────────────────────────────────────────────────

export interface SectionGroupMeta {
  group:         SectionGroup;
  label:         string;
  description:   string;
  collapsible:   boolean;   // Whether the entire group can be collapsed
  defaultOpen:   boolean;   // Group-level default (individual sections override)
  dividerShown:  boolean;   // Whether a visual divider precedes this group in the rail
  maxVisible?:   number;    // Soft cap — sections beyond this are collapsed by default
}

// ── Group definitions ─────────────────────────────────────────────────────────

export const SECTION_GROUPS: Record<SectionGroup, SectionGroupMeta> = {

  executive: {
    group:        "executive",
    label:        "Ejecutivo",
    description:  "Signals, intents, plan operativo, seguimiento — núcleo del rail ejecutivo",
    collapsible:  false,  // Executive group is never collapsed as a whole
    defaultOpen:  true,
    dividerShown: false,  // First group — no leading divider
    maxVisible:   5,      // Max 5 always-on executive sections
  },

  operations: {
    group:        "operations",
    label:        "Operaciones",
    description:  "Alertas, tareas, ejecución supervisada — aparece cuando hay contexto operativo",
    collapsible:  true,
    defaultOpen:  true,
    dividerShown: true,
    maxVisible:   3,      // Alerts + Tasks + SupervisedExec max
  },

  coordination: {
    group:        "coordination",
    label:        "Coordinación",
    description:  "Memoria, capacidades, colaboración IA — contexto estratégico profundo",
    collapsible:  true,
    defaultOpen:  false,  // Starts collapsed — revealed on demand
    dividerShown: true,
    maxVisible:   3,
  },

  infrastructure: {
    group:        "infrastructure",
    label:        "Infraestructura",
    description:  "Runtime, vault, dispatch, bridge, control center — solo roles internos",
    collapsible:  true,
    defaultOpen:  true,   // Internal users see infrastructure open by default
    dividerShown: true,
    // No maxVisible — infrastructure can be dense
  },
};

// ── Surface-specific group defaults ──────────────────────────────────────────

/**
 * Returns the default open state for a group on a given surface.
 * Overrides the base group default for specific surfaces.
 */
export function getGroupDefaultOpen(
  group: SectionGroup,
  surface: CopilotSurface,
): boolean {
  // Infrastructure always starts open for internal roles
  if (group === "infrastructure") {
    return surface === "internal_ops" || surface === "super_admin";
  }

  // Coordination starts collapsed on all tenant surfaces
  if (group === "coordination") {
    return surface === "internal_ops" || surface === "super_admin";
  }

  // Operations defaults to open (alerts/tasks are urgent)
  if (group === "operations") return true;

  // Executive always open
  return true;
}

/**
 * Returns true if a group should display a leading divider on this surface.
 */
export function shouldShowGroupDivider(
  group: SectionGroup,
  surface: CopilotSurface,
  previousGroupHadContent: boolean,
): boolean {
  if (!previousGroupHadContent) return false;
  return SECTION_GROUPS[group].dividerShown;
}

/**
 * Returns the ordered list of groups for a surface.
 * Infrastructure appears last, only for internal surfaces.
 */
export function getGroupOrder(surface: CopilotSurface): SectionGroup[] {
  const isInternal = surface === "internal_ops" || surface === "super_admin";

  const base: SectionGroup[] = ["executive", "operations", "coordination"];
  return isInternal ? [...base, "infrastructure"] : base;
}

/**
 * Returns all section IDs that belong to a group and should be
 * collapsed by default when the group starts collapsed.
 */
export function getGroupInitialCollapsedSections(
  group: SectionGroup,
  surface: CopilotSurface,
): boolean {
  return !getGroupDefaultOpen(group, surface);
}
