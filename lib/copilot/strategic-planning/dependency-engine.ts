// AGENTIK-STRATEGIC-PLANNING-01
// Phase 5 — Dependency Engine
// Detects dependencies, blockers, prerequisites, and conflicts.
// NEVER executes. NEVER modifies data.

import type { StrategicDependency, StrategicInitiative, DependencyType } from "./strategic-planning-types";
import { generateDependencyId } from "./strategic-planning-identity";

// ── Builder ───────────────────────────────────────────────────────────────────

export function createDependency(params: {
  orgSlug:     string;
  fromId:      string;
  toId:        string;
  type:        DependencyType;
  description: string;
  isBlocking?: boolean;
  metadata?:   Record<string, unknown>;
}): StrategicDependency {
  return {
    id:          generateDependencyId(),
    orgSlug:     params.orgSlug,
    fromId:      params.fromId,
    toId:        params.toId,
    type:        params.type,
    description: params.description,
    isBlocking:  params.isBlocking ?? (params.type === "REQUIRES" || params.type === "BLOCKS"),
    metadata:    params.metadata ?? {},
  };
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface DependencyValidationResult {
  readonly valid:            boolean;
  readonly circularPaths:    string[][];
  readonly blockingCount:    number;
  readonly warnings:         string[];
}

export function validateDependency(d: StrategicDependency): { valid: boolean; error?: string } {
  if (!d.fromId || !d.toId) return { valid: false, error: "Dependency requires fromId and toId" };
  if (d.fromId === d.toId)  return { valid: false, error: "Self-dependency detected" };
  return { valid: true };
}

// ── Circular dependency detection ─────────────────────────────────────────────

export function detectCircularDependencies(deps: StrategicDependency[]): string[][] {
  const circles: string[][] = [];
  const graph: Map<string, string[]> = new Map();

  for (const d of deps) {
    if (!graph.has(d.fromId)) graph.set(d.fromId, []);
    graph.get(d.fromId)!.push(d.toId);
  }

  function dfs(start: string, current: string, path: string[], visited: Set<string>): void {
    if (path.length > 1 && current === start) {
      circles.push([...path, current]);
      return;
    }
    if (visited.has(current)) return;
    visited.add(current);
    for (const next of (graph.get(current) ?? [])) {
      dfs(start, next, [...path, current], new Set(visited));
    }
  }

  const allNodes = new Set([...graph.keys()]);
  for (const node of allNodes) {
    dfs(node, node, [], new Set());
  }

  return circles.slice(0, 10);
}

// ── Find blocked initiatives ──────────────────────────────────────────────────

export function findBlockedInitiatives(
  initiatives:  StrategicInitiative[],
  dependencies: StrategicDependency[]
): StrategicInitiative[] {
  const blockingTargets = new Set(
    dependencies.filter((d) => d.isBlocking && d.type === "BLOCKS").map((d) => d.fromId)
  );
  return initiatives.filter((i) => blockingTargets.has(i.id));
}

// ── Aggregate ─────────────────────────────────────────────────────────────────

export function validateAllDependencies(deps: StrategicDependency[]): DependencyValidationResult {
  const warnings: string[] = [];
  const blockingCount = deps.filter((d) => d.isBlocking).length;
  const circles = detectCircularDependencies(deps);

  if (circles.length > 0) warnings.push(`${circles.length} circular dependency path(s) detected`);
  if (blockingCount > deps.length * 0.5) warnings.push("More than 50% of dependencies are blocking — plan may be over-constrained");

  return { valid: circles.length === 0, circularPaths: circles, blockingCount, warnings };
}

// ── Get dependencies for a node ───────────────────────────────────────────────

export function getDependenciesFor(nodeId: string, deps: StrategicDependency[]): StrategicDependency[] {
  return deps.filter((d) => d.fromId === nodeId || d.toId === nodeId);
}

export function getPrerequisitesFor(nodeId: string, deps: StrategicDependency[]): StrategicDependency[] {
  return deps.filter((d) => d.toId === nodeId && d.type === "REQUIRES");
}
