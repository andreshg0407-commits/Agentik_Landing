/**
 * lib/copilot/rail-density.ts
 *
 * Agentik Copilot — Rail Density System
 *
 * Sprint: AGENTIK-COPILOT-SURFACE-SEGREGATION-01 — Block B1
 *
 * Computes cognitive pressure and recommends section collapse
 * to keep the tenant executive rail at ≤8 visible blocks.
 *
 * RULE: Tenant executive rail NEVER exceeds 8 visible blocks.
 *       Infrastructure (internal_ops/super_admin) may be dense.
 */

import type { CopilotSurface, RailDensityLevel, SectionGroup } from "./surface-types";
import type { ResolvedSection } from "./surface-resolver";
import { resolveDensityLevel } from "./surface-resolver";

// ── Max density thresholds ────────────────────────────────────────────────────

const TENANT_MAX_VISIBLE = 8;
const TENANT_WARN_VISIBLE = 6;

// ── Cognitive pressure ────────────────────────────────────────────────────────

export type CognitivePressure =
  | "calm"      // ≤5 visible — ideal tenant state
  | "focused"   // 6–7 visible — acceptable
  | "loaded"    // 8 visible — at tenant limit
  | "overloaded"; // >8 — only acceptable for infrastructure surfaces

// ── Rail density state ────────────────────────────────────────────────────────

export interface RailDensityState {
  surface:           CopilotSurface;
  totalVisible:      number;
  densityLevel:      RailDensityLevel;
  cognitivePressure: CognitivePressure;
  atTenantLimit:     boolean;    // true when totalVisible >= TENANT_MAX_VISIBLE
  collapseRecommended: boolean;  // true when pressure >= "loaded"
  collapseTargets:   string[];   // sectionIds recommended for collapse
  summary:           string;
}

// ── Compute rail density ──────────────────────────────────────────────────────

/**
 * Computes the full density state for a resolved section list.
 */
export function computeRailDensity(
  surface:  CopilotSurface,
  sections: ResolvedSection[],
): RailDensityState {
  const visible     = sections.filter(s => s.visible);
  const totalVisible = visible.length;

  const densityLevel      = resolveDensityLevel(totalVisible);
  const cognitivePressure = resolveCognitivePressure(surface, totalVisible);
  const atTenantLimit     = isTenantSurface(surface) && totalVisible >= TENANT_MAX_VISIBLE;
  const collapseRecommended = cognitivePressure === "loaded" || cognitivePressure === "overloaded";
  const collapseTargets   = collapseRecommended
    ? recommendSectionCollapse(visible, totalVisible)
    : [];

  return {
    surface,
    totalVisible,
    densityLevel,
    cognitivePressure,
    atTenantLimit,
    collapseRecommended,
    collapseTargets,
    summary: buildDensitySummary(cognitivePressure, totalVisible, collapseTargets),
  };
}

// ── Cognitive pressure resolver ───────────────────────────────────────────────

/**
 * Resolves cognitive pressure from total visible count and surface type.
 */
export function resolveCognitivePressure(
  surface:      CopilotSurface,
  totalVisible: number,
): CognitivePressure {
  // Infrastructure surfaces can be dense without pressure penalty
  if (!isTenantSurface(surface)) {
    return totalVisible > 12 ? "overloaded" : "focused";
  }

  if (totalVisible <= 5)  return "calm";
  if (totalVisible <= 7)  return "focused";
  if (totalVisible <= 8)  return "loaded";
  return "overloaded";
}

// ── Section collapse recommender ──────────────────────────────────────────────

/**
 * Recommends which sections to collapse to reduce density.
 * Priority: collapse coordination group first, then low-priority operations.
 */
export function recommendSectionCollapse(
  visible:      ResolvedSection[],
  totalVisible: number,
): string[] {
  if (totalVisible <= TENANT_WARN_VISIBLE) return [];

  const targets: string[] = [];
  const excess = totalVisible - TENANT_WARN_VISIBLE;

  // Step 1: Collapse coordination group (lowest urgency)
  const coordination = visible
    .filter(s => s.group === "coordination" && s.collapsible)
    .sort((a, b) => b.priority - a.priority); // lowest priority first

  for (const s of coordination) {
    if (targets.length >= excess) break;
    targets.push(s.sectionId);
  }

  // Step 2: Collapse low-priority operations (if still over)
  if (targets.length < excess) {
    const ops = visible
      .filter(s => s.group === "operations" && s.collapsible && s.priority > 11)
      .sort((a, b) => b.priority - a.priority);

    for (const s of ops) {
      if (targets.length >= excess) break;
      targets.push(s.sectionId);
    }
  }

  return targets;
}

// ── Group density ─────────────────────────────────────────────────────────────

/**
 * Returns visible section count per group.
 */
export function getGroupDensity(
  sections: ResolvedSection[],
): Record<SectionGroup, number> {
  const counts: Record<SectionGroup, number> = {
    executive:      0,
    operations:     0,
    coordination:   0,
    infrastructure: 0,
  };

  for (const s of sections) {
    if (s.visible && s.group in counts) {
      counts[s.group as SectionGroup]++;
    }
  }

  return counts;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isTenantSurface(surface: CopilotSurface): boolean {
  return (
    surface === "tenant_executive" ||
    surface === "tenant_operational" ||
    surface === "tenant_enterprise"
  );
}

function buildDensitySummary(
  pressure:       CognitivePressure,
  totalVisible:   number,
  collapseTargets: string[],
): string {
  switch (pressure) {
    case "calm":
      return `${totalVisible} sección${totalVisible !== 1 ? "es" : ""} visible${totalVisible !== 1 ? "s" : ""} — densidad óptima`;
    case "focused":
      return `${totalVisible} secciones — dentro del rango ejecutivo`;
    case "loaded":
      return `${totalVisible} secciones — al límite. ${collapseTargets.length > 0 ? `Colapsar: ${collapseTargets.join(", ")}` : "Evaluar colapso manual"}`;
    case "overloaded":
      return `${totalVisible} secciones — sobrecarga cognitiva. Reducir secciones visibles`;
  }
}
