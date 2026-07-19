/**
 * lib/copilot/surface-types.ts
 *
 * Agentik Copilot — Surface Type System
 *
 * Sprint: AGENTIK-COPILOT-SURFACE-SEGREGATION-01 — Block A1
 *
 * Defines the formal separation between:
 *   - Tenant executive surfaces (clean, executive-grade, action-forward)
 *   - Infrastructure surfaces (deep, technical, internal-only)
 *
 * PRINCIPLE: system existence ≠ system visibility.
 * Everything continues to run. Only what tenants SEE changes.
 */

// ── Surface types ─────────────────────────────────────────────────────────────

/**
 * CopilotSurface defines who is consuming the rail and what context they operate in.
 *
 * tenant_executive   — Business user: executive, manager, org admin.
 *                      Sees: signals, intents, operations, accountability, next steps.
 *                      Hidden: runtime, vault, dispatch, observability, control center.
 *
 * tenant_operational — Operational staff: operator, billing, collections.
 *                      Sees: tasks, alerts, next steps, basic execution state.
 *                      Hidden: strategic memory, capabilities, infrastructure.
 *
 * tenant_enterprise  — ORG_ADMIN with enterprise context.
 *                      Sees: everything tenant-facing, plus integration status summary.
 *                      Hidden: raw infrastructure metrics.
 *
 * internal_ops       — AGENTIK_ADMIN. Internal platform operations.
 *                      Sees: infrastructure, runtime, vault, dispatch, control center.
 *                      Hidden: tenant business data.
 *
 * infrastructure     — Full infrastructure view.
 *                      Sees: all infrastructure sections.
 *                      Context: monitoring, debugging, incident response.
 *
 * super_admin        — SUPER_ADMIN. Override — sees everything.
 */
export type CopilotSurface =
  | "tenant_executive"
  | "tenant_operational"
  | "tenant_enterprise"
  | "internal_ops"
  | "infrastructure"
  | "super_admin";

// ── Section visibility ────────────────────────────────────────────────────────

/**
 * SurfaceVisibility controls how a section appears on a given surface.
 *
 * always          — Always rendered, never hidden.
 * contextual      — Rendered only when operationally relevant (signals, incidents, etc.).
 * hidden          — Never rendered on this surface.
 * internal_only   — Rendered only on internal_ops / super_admin surfaces.
 */
export type SurfaceVisibility =
  | "always"
  | "contextual"
  | "hidden"
  | "internal_only";

// ── Surface section rule ──────────────────────────────────────────────────────

/**
 * SurfaceSectionRule defines how a rail section behaves on each surface.
 */
export interface SurfaceSectionRule {
  sectionId:    string;
  label:        string;
  surfaces:     CopilotSurface[];   // Which surfaces this section can appear on
  visibility:   SurfaceVisibility;  // Base visibility rule
  priority:     number;             // Display priority (lower = higher priority)
  collapsible:  boolean;            // Can the user collapse it?
  defaultOpen:  boolean;            // Open by default on first load?
  group:        SectionGroup;       // Which display group it belongs to
}

// ── Section groups ────────────────────────────────────────────────────────────

/**
 * SectionGroup defines which visual group a section belongs to.
 * Groups drive collapsible clusters and density management.
 */
export type SectionGroup =
  | "executive"       // Core executive sections (always visible for tenants)
  | "operations"      // Task/alert/execution sections (contextual)
  | "coordination"    // Memory, capabilities, collaboration
  | "infrastructure"; // Runtime, vault, dispatch, observability (internal only)

// ── Density level ─────────────────────────────────────────────────────────────

/**
 * RailDensityLevel describes how "loaded" the rail is at a given moment.
 */
export type RailDensityLevel =
  | "minimal"   // 1–3 visible sections — calm, open
  | "focused"   // 4–5 sections — executive standard
  | "active"    // 6–8 sections — operational context present
  | "dense";    // 9+ sections — infrastructure/super_admin only
