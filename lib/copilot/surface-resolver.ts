/**
 * lib/copilot/surface-resolver.ts
 *
 * Agentik Copilot — Surface Section Resolver
 *
 * Sprint: AGENTIK-COPILOT-SURFACE-SEGREGATION-01 — Block A3
 *
 * Resolves which sections are visible for a given surface context.
 * Considers: role, tenant type, runtime state, governance, incident pressure.
 *
 * Output drives both the rail renderer and the density system.
 */

import type { CopilotSurface, SurfaceSectionRule, SurfaceVisibility, RailDensityLevel } from "./surface-types";
import { SURFACE_SECTION_REGISTRY, getSectionsForSurface } from "./surface-registry";

// ── Resolution context ────────────────────────────────────────────────────────

export interface SurfaceResolutionContext {
  surface:           CopilotSurface;

  // Operational signals that drive contextual activation
  hasActiveAlerts:   boolean;
  hasActiveTasks:    boolean;
  hasSupervisedExec: boolean;
  hasIncidents:      boolean;
  runtimeHealthy:    boolean;     // true = healthy, false = degraded/blocked
  governanceBlocked: boolean;
  hasCollaborationContext: boolean;
  hasStrategicMemory: boolean;
  hasCapabilities:   boolean;
}

// ── Resolved section ──────────────────────────────────────────────────────────

export interface ResolvedSection {
  sectionId:    string;
  label:        string;
  visible:      boolean;
  group:        string;
  priority:     number;
  collapsible:  boolean;
  defaultOpen:  boolean;
  reason:       string;           // Why visible or hidden (debug/trace)
}

// ── Resolution result ─────────────────────────────────────────────────────────

export interface SurfaceResolutionResult {
  surface:          CopilotSurface;
  visibleSections:  ResolvedSection[];
  hiddenSections:   ResolvedSection[];
  totalVisible:     number;
  densityLevel:     RailDensityLevel;
  densitySummary:   string;
}

// ── Core: resolve surface sections ───────────────────────────────────────────

/**
 * Resolves all sections for a given surface context.
 * Returns visible + hidden sections with reasons.
 */
export function resolveSurfaceSections(
  ctx: SurfaceResolutionContext,
): SurfaceResolutionResult {
  const candidates = getSectionsForSurface(ctx.surface);

  const visibleSections: ResolvedSection[] = [];
  const hiddenSections:  ResolvedSection[] = [];

  for (const rule of candidates) {
    const { visible, reason } = resolveSectionVisibility(rule, ctx);

    const resolved: ResolvedSection = {
      sectionId:   rule.sectionId,
      label:       rule.label,
      visible,
      group:       rule.group,
      priority:    rule.priority,
      collapsible: rule.collapsible,
      defaultOpen: rule.defaultOpen,
      reason,
    };

    if (visible) {
      visibleSections.push(resolved);
    } else {
      hiddenSections.push(resolved);
    }
  }

  const totalVisible = visibleSections.length;
  const densityLevel = resolveDensityLevel(totalVisible);
  const densitySummary = summarizeSurfaceDensity(densityLevel, totalVisible, ctx.surface);

  return {
    surface: ctx.surface,
    visibleSections,
    hiddenSections,
    totalVisible,
    densityLevel,
    densitySummary,
  };
}

// ── Section visibility resolver ───────────────────────────────────────────────

/**
 * Determines if a section should be visible given the current context.
 */
export function resolveSectionVisibility(
  rule: SurfaceSectionRule,
  ctx: SurfaceResolutionContext,
): { visible: boolean; reason: string } {
  // 1. Surface not in allowed list — always hidden
  if (!rule.surfaces.includes(ctx.surface)) {
    return { visible: false, reason: "surface_not_allowed" };
  }

  // 2. Infrastructure sections require internal surface
  if (rule.visibility === "internal_only") {
    const isInternal = ctx.surface === "internal_ops" || ctx.surface === "super_admin";
    return isInternal
      ? { visible: true,  reason: "internal_surface_confirmed" }
      : { visible: false, reason: "infrastructure_hidden_from_tenant" };
  }

  // 3. Always sections — always visible if surface matches
  if (rule.visibility === "always") {
    return { visible: true, reason: "always_visible" };
  }

  // 4. Contextual sections — driven by operational signals
  if (rule.visibility === "contextual") {
    return resolveContextualSection(rule.sectionId, ctx);
  }

  // 5. Hidden sections — never visible
  return { visible: false, reason: "section_hidden" };
}

// ── Contextual section activation ────────────────────────────────────────────

function resolveContextualSection(
  sectionId: string,
  ctx: SurfaceResolutionContext,
): { visible: boolean; reason: string } {
  switch (sectionId) {
    case "alertas-operacionales":
      return ctx.hasActiveAlerts
        ? { visible: true,  reason: "active_alerts_present" }
        : { visible: false, reason: "no_active_alerts" };

    case "tareas-activas":
      return ctx.hasActiveTasks
        ? { visible: true,  reason: "active_tasks_present" }
        : { visible: false, reason: "no_active_tasks" };

    case "operacion-supervisada":
      return ctx.hasSupervisedExec
        ? { visible: true,  reason: "supervised_execution_active" }
        : { visible: false, reason: "no_supervised_execution" };

    case "colaboracion-ia":
      return ctx.hasCollaborationContext
        ? { visible: true,  reason: "collaboration_context_active" }
        : { visible: false, reason: "no_collaboration_context" };

    case "memoria-estrategica":
      return ctx.hasStrategicMemory
        ? { visible: true,  reason: "strategic_memory_present" }
        : { visible: false, reason: "no_strategic_memory" };

    case "capacidades-activas":
      return ctx.hasCapabilities
        ? { visible: true,  reason: "capabilities_present" }
        : { visible: false, reason: "no_active_capabilities" };

    default:
      // Unknown contextual section — show by default
      return { visible: true, reason: "contextual_default_visible" };
  }
}

// ── Density level resolver ────────────────────────────────────────────────────

/**
 * Resolves the rail density level from total visible section count.
 */
export function resolveDensityLevel(totalVisible: number): RailDensityLevel {
  if (totalVisible <= 3) return "minimal";
  if (totalVisible <= 5) return "focused";
  if (totalVisible <= 8) return "active";
  return "dense";
}

// ── Density summary ───────────────────────────────────────────────────────────

/**
 * Returns a 1-line surface density summary.
 */
export function summarizeSurfaceDensity(
  density: RailDensityLevel,
  totalVisible: number,
  surface: CopilotSurface,
): string {
  const surfaceLabel = resolveSurfaceLabel(surface);
  switch (density) {
    case "minimal":  return `${surfaceLabel} — ${totalVisible} sección${totalVisible !== 1 ? "es" : ""} — vista mínima`;
    case "focused":  return `${surfaceLabel} — ${totalVisible} secciones — vista ejecutiva`;
    case "active":   return `${surfaceLabel} — ${totalVisible} secciones — contexto operativo activo`;
    case "dense":    return `${surfaceLabel} — ${totalVisible} secciones — vista de infraestructura completa`;
  }
}

// ── Filter helpers ────────────────────────────────────────────────────────────

/**
 * Returns only the sections that should be rendered for a surface.
 * Shorthand for resolveSurfaceSections when you only need visible sections.
 */
export function filterRailSections(
  ctx: SurfaceResolutionContext,
): ResolvedSection[] {
  return resolveSurfaceSections(ctx).visibleSections;
}

/**
 * Returns true if a section should be visible in the current context.
 */
export function isSectionVisible(sectionId: string, ctx: SurfaceResolutionContext): boolean {
  const rule = SURFACE_SECTION_REGISTRY.find(r => r.sectionId === sectionId);
  if (!rule) return false;
  return resolveSectionVisibility(rule, ctx).visible;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveSurfaceLabel(surface: CopilotSurface): string {
  switch (surface) {
    case "tenant_executive":  return "Ejecutivo";
    case "tenant_operational": return "Operativo";
    case "tenant_enterprise": return "Enterprise";
    case "internal_ops":      return "Ops Interna";
    case "infrastructure":    return "Infraestructura";
    case "super_admin":       return "Super Admin";
  }
}
