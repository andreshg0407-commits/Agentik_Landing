// AGENTIK-EXECUTIVE-BRAIN-02
// Phase 16 — Memory Graph Integration

import type { GraphNode, GraphEdge } from "../../memory-graph/memory-graph-types";
import type { ExecutiveTheme, ExecutiveDomain } from "../executive-brain-types";
import { generateEbv2Id, confidenceFromScore } from "../executive-brain-types";

export interface GraphExecContext {
  readonly orgSlug: string;
  readonly keyNodes: GraphNode[];
  readonly strategicEdges: GraphEdge[];
  readonly dominantDomains: ExecutiveDomain[];
  readonly graphDensity: number; // 0–1
}

export function buildGraphExecContext(
  orgSlug: string,
  nodes: GraphNode[],
  edges: GraphEdge[]
): GraphExecContext {
  const scopedNodes = nodes.filter((n) => n.orgSlug === orgSlug);
  const scopedEdges = edges.filter((e) => e.orgSlug === orgSlug);

  const keyNodes = scopedNodes
    .filter((n) => n.weight >= 0.6 && (n.type === "DECISION" || n.type === "INSIGHT" || n.type === "ALERT"))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 10);

  const strategicEdges = scopedEdges
    .filter((e) => e.weight >= 0.5 && (e.type === "CAUSED" || e.type === "SUPPORTS" || e.type === "CONTRADICTS"))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 20);

  const domainMap: Record<string, number> = {};
  for (const node of scopedNodes) {
    const domain = _inferDomainFromNode(node);
    domainMap[domain] = (domainMap[domain] ?? 0) + node.weight;
  }
  const dominantDomains = Object.entries(domainMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([d]) => d as ExecutiveDomain);

  const graphDensity = scopedNodes.length > 0
    ? Math.min(scopedEdges.length / (scopedNodes.length * (scopedNodes.length - 1) || 1), 1)
    : 0;

  return {
    orgSlug,
    keyNodes,
    strategicEdges,
    dominantDomains,
    graphDensity: Math.round(graphDensity * 100) / 100,
  };
}

export function extractThemesFromGraph(
  orgSlug: string,
  nodes: GraphNode[],
  edges: GraphEdge[]
): ExecutiveTheme[] {
  const context = buildGraphExecContext(orgSlug, nodes, edges);
  const themes: ExecutiveTheme[] = [];

  for (const domain of context.dominantDomains) {
    const domainNodes = context.keyNodes.filter((n) => _inferDomainFromNode(n) === domain);
    if (domainNodes.length === 0) continue;

    themes.push({
      id: generateEbv2Id("theme"),
      orgSlug,
      type: _domainToThemeType(domain),
      title: `Actividad significativa en ${domain}`,
      description: `El grafo de memoria muestra ${domainNodes.length} nodo(s) clave en ${domain} con conexiones relevantes.`,
      domain,
      priority: domainNodes.some((n) => n.type === "ALERT") ? "HIGH" : "MEDIUM",
      confidence: confidenceFromScore(context.graphDensity * 0.8 + 0.2),
      evidenceIds: domainNodes.map((n) => n.id),
      metadata: { source: "MEMORY_GRAPH", nodeCount: domainNodes.length },
    });
  }

  return themes;
}

export function getStrategicRelationships(
  orgSlug: string,
  edges: GraphEdge[]
): GraphEdge[] {
  return edges
    .filter(
      (e) =>
        e.orgSlug === orgSlug &&
        (e.type === "CAUSED" || e.type === "SUPPORTS" || e.type === "CONTRADICTS") &&
        e.weight >= 0.5
    )
    .sort((a, b) => b.weight - a.weight);
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _inferDomainFromNode(node: GraphNode): ExecutiveDomain {
  const tagDomains = node.tags?.map((t) => t.toUpperCase());
  if (tagDomains?.includes("FINANCE") || tagDomains?.includes("TREASURY")) return "FINANCE";
  if (tagDomains?.includes("COMMERCIAL") || tagDomains?.includes("SALES")) return "COMMERCIAL";
  if (tagDomains?.includes("MARKETING")) return "MARKETING";
  if (tagDomains?.includes("OPERATIONS")) return "OPERATIONS";
  if (tagDomains?.includes("COMPLIANCE")) return "COMPLIANCE";
  if (node.type === "DECISION") return "EXECUTIVE";
  return "CROSS_DOMAIN";
}

function _domainToThemeType(domain: ExecutiveDomain): ExecutiveTheme["type"] {
  const map: Record<ExecutiveDomain, ExecutiveTheme["type"]> = {
    FINANCE: "FINANCIAL_HEALTH",
    COMMERCIAL: "CUSTOMER_SUCCESS",
    MARKETING: "GROWTH",
    OPERATIONS: "OPERATIONAL_EXCELLENCE",
    EXECUTIVE: "STRATEGIC_ALIGNMENT",
    COMPLIANCE: "COMPLIANCE",
    TECHNOLOGY: "INNOVATION",
    PEOPLE: "TALENT",
    CROSS_DOMAIN: "CROSS_DOMAIN",
  };
  return map[domain] ?? "CROSS_DOMAIN";
}
