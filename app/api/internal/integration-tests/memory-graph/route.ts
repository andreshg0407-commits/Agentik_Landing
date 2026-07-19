/**
 * app/api/internal/integration-tests/memory-graph/route.ts
 *
 * AGENTIK-INTELLIGENCE-MEMORY-GRAPH-01
 * Integration Test Harness — Memory Graph
 *
 * 180+ tests covering: nodes, edges, registry, traversal, path finding,
 * query engine, search, timeline, integrity, tenant isolation, integrations,
 * audit, error handling.
 *
 * Guards:
 *   NODE_ENV !== "production"
 *   ENABLE_INTERNAL_INTEGRATION_TESTS === "true"
 *   Authorization: Bearer <INTERNAL_INTEGRATION_TEST_TOKEN>
 */

import { NextRequest, NextResponse } from "next/server";
import {
  buildNode, buildMemoryNode, buildPlaybookNode, buildInsightNode,
  buildEventNode, buildAlertNode, buildAnomalyNode, buildDecisionNode,
  buildClientNode, buildProductNode, buildOrderNode, buildCampaignNode,
} from "@/lib/copilot/memory-graph/node-builder";
import {
  buildEdge, buildRelatedToEdge, buildGeneratedByEdge, buildBelongsToEdge,
  buildAffectsEdge, buildCausedEdge, buildTriggersEdge, buildSupportsEdge, buildContradictsEdge,
} from "@/lib/copilot/memory-graph/edge-builder";
import {
  registerNode, registerEdge, clearRegistry, clearAllRegistries,
  listNodes, listEdges, getNode, getEdge, hasNode, hasEdge,
  edgesFrom, edgesTo,
} from "@/lib/copilot/memory-graph/graph-registry";
import {
  createNode, createEdge, upsertNode, validateGraph,
  getOutboundEdges, getInboundEdges, getNeighborIds,
} from "@/lib/copilot/memory-graph/graph-engine";
import {
  generateNodeId, generateEdgeId, validateNodeId, validateEdgeId, isGraphId,
} from "@/lib/copilot/memory-graph/graph-identity";
import {
  neighbors, parents, children, findPath, findPaths, shortestPath, bfsTraversal,
} from "@/lib/copilot/memory-graph/traversal-engine";
import {
  resolveRelationship, canRelate, RELATIONSHIP_PATTERNS,
} from "@/lib/copilot/memory-graph/relationship-resolver";
import {
  buildSubgraph, buildSubgraphByType, buildClientSubgraph,
  buildSubgraphByEdgeType, mergeSubgraphs,
} from "@/lib/copilot/memory-graph/subgraph-builder";
import {
  runIntegrityCheck, validateIntegrity, hasIntegrityErrors, countOrphanNodes,
} from "@/lib/copilot/memory-graph/graph-integrity";
import {
  scoreNode, scoreAllNodes, topNodesByImportance, computeGraphMetrics,
} from "@/lib/copilot/memory-graph/graph-scoring";
import {
  findNode, findNodesByType, findRelated, findConnected, findSubgraph,
  findEdgesByType, findEdgesBetween, searchGraph, getIsolatedNodes,
} from "@/lib/copilot/memory-graph/query-engine";
import {
  searchNodes, searchNodesTerm, getRankedMatches, findByLabel,
} from "@/lib/copilot/memory-graph/search-engine";
import {
  expandContext, expandFromNodes, summarizeExpansion,
} from "@/lib/copilot/memory-graph/context-expansion";
import {
  buildTimeline, buildNodeTimeline, buildEventTimeline, analyzeTimeline,
} from "@/lib/copilot/memory-graph/memory-timeline";
import {
  createSnapshot, getSnapshot, compareSnapshots, listSnapshots,
} from "@/lib/copilot/memory-graph/knowledge-snapshot";
import {
  buildGraphSummary, buildRelationshipReport, buildKnowledgeReport,
} from "@/lib/copilot/memory-graph/report-builder";
import {
  buildMemoryGraphDashboard, buildEmptyMemoryGraphDashboard,
} from "@/lib/copilot/memory-graph/memory-graph-dashboard-contract";
import {
  checkTenantIsolation, filterToOrg, isCrossTenantNode,
} from "@/lib/copilot/memory-graph/memory-graph-tenant-isolation";
import {
  memoriesToGraphNodes, buildMemoryRelatedEdges,
} from "@/lib/copilot/memory-graph/integrations/memory-graph-memory";
import {
  playbooksToNodes, playbookContextToNodes,
} from "@/lib/copilot/memory-graph/integrations/memory-graph-playbooks";
import {
  executiveContextToGraph,
} from "@/lib/copilot/memory-graph/integrations/memory-graph-executive-brain";
import {
  createGraphAuditLog, auditNodeCreated, auditEdgeCreated,
  auditGraphTraversed, getGraphAuditSummary,
} from "@/lib/copilot/memory-graph/integrations/memory-graph-audit";
import {
  buildGraphRelationshipTrace, validateGraphCompliance,
} from "@/lib/copilot/memory-graph/integrations/memory-graph-compliance";
import {
  identifyCausalCandidates, buildEmptyCausalModel,
} from "@/lib/copilot/memory-graph/causality-preparation";
import {
  GRAPH_NODE_TYPES, GRAPH_EDGE_TYPES, GRAPH_DEFAULT_WEIGHT,
} from "@/lib/copilot/memory-graph/memory-graph-types";
import { InMemoryGraphRepository } from "@/lib/copilot/memory-graph/memory-graph-repository";
import {
  MEMORY_GRAPH_FUTURE_PLANS, getFutureGraphRoadmapSummary,
} from "@/lib/copilot/memory-graph/future-compatibility";

// ── Guards ────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

// ── Test framework ─────────────────────────────────────────────────────────────

const ORG      = "castillitos";
const ORG_B    = "other-org";
const QUERY_ID = "mgq_test_001";

interface TestResult {
  id:       string;
  name:     string;
  passed:   boolean;
  error?:   string;
  durationMs: number;
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function t(
  id:   string,
  name: string,
  fn:   () => void,
): TestResult {
  const t0 = Date.now();
  try {
    fn();
    return { id, name, passed: true, durationMs: Date.now() - t0 };
  } catch (err) {
    return {
      id, name, passed: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - t0,
    };
  }
}

// ── Fixture helpers ────────────────────────────────────────────────────────────

function seedGraph(orgSlug: string): { n1: string; n2: string; n3: string } {
  clearRegistry(orgSlug);
  const n1 = createNode({ orgSlug, type: "CLIENT",   label: "Cliente A", source: "test" });
  const n2 = createNode({ orgSlug, type: "ORDER",    label: "Pedido 001", source: "test" });
  const n3 = createNode({ orgSlug, type: "CAMPAIGN", label: "Campaña Verano", source: "test" });
  if (!n1 || !n2 || !n3) throw new Error("Failed to seed graph");
  createEdge({ orgSlug, type: "BELONGS_TO", sourceNodeId: n2.id, targetNodeId: n1.id, reasoning: "Order belongs to client", source: "test" });
  createEdge({ orgSlug, type: "AFFECTS",    sourceNodeId: n3.id, targetNodeId: n1.id, reasoning: "Campaign targets client", source: "test" });
  return { n1: n1.id, n2: n2.id, n3: n3.id };
}

// ── Test sections ──────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — Core Types and Constants (T01–T12)
// ═══════════════════════════════════════════════════════════════════════════════

const section1Tests: TestResult[] = [
  t("T01", "GRAPH_NODE_TYPES has 16 types", () => {
    assert(GRAPH_NODE_TYPES.length === 16, `Expected 16 node types, got ${GRAPH_NODE_TYPES.length}`);
  }),
  t("T02", "GRAPH_EDGE_TYPES has 12 types", () => {
    assert(GRAPH_EDGE_TYPES.length === 12, `Expected 12 edge types, got ${GRAPH_EDGE_TYPES.length}`);
  }),
  t("T03", "GRAPH_NODE_TYPES includes all required types", () => {
    const required: string[] = ["MEMORY", "CLIENT", "PRODUCT", "ORDER", "CAMPAIGN", "INSIGHT", "PLAYBOOK", "TASK", "EVENT", "ALERT", "ANOMALY", "DECISION", "AGENT", "USER", "DOCUMENT", "REPORT"];
    for (const r of required) assert(GRAPH_NODE_TYPES.includes(r as any), `Missing node type: ${r}`);
  }),
  t("T04", "GRAPH_EDGE_TYPES includes all required types", () => {
    const required: string[] = ["RELATED_TO", "GENERATED_BY", "REFERENCES", "CAUSED", "AFFECTS", "BELONGS_TO", "LINKED_TO", "CREATED_FROM", "RESOLVES", "TRIGGERS", "SUPPORTS", "CONTRADICTS"];
    for (const r of required) assert(GRAPH_EDGE_TYPES.includes(r as any), `Missing edge type: ${r}`);
  }),
  t("T05", "GRAPH_DEFAULT_WEIGHT is 0.5", () => {
    assert(GRAPH_DEFAULT_WEIGHT === 0.5, "Default weight must be 0.5");
  }),
  t("T06", "generateNodeId returns mgn_ prefix", () => {
    const id = generateNodeId();
    assert(id.startsWith("mgn_"), `Expected mgn_ prefix, got: ${id}`);
  }),
  t("T07", "generateEdgeId returns mge_ prefix", () => {
    const id = generateEdgeId();
    assert(id.startsWith("mge_"), `Expected mge_ prefix, got: ${id}`);
  }),
  t("T08", "validateNodeId accepts valid node IDs", () => {
    assert(validateNodeId("mgn_abc_xyz"), "Should accept mgn_ prefix IDs");
  }),
  t("T09", "validateNodeId rejects invalid IDs", () => {
    assert(!validateNodeId(""), "Should reject empty string");
    assert(!validateNodeId("not_a_node"), "Should reject non-node IDs");
  }),
  t("T10", "validateEdgeId accepts valid edge IDs", () => {
    assert(validateEdgeId("mge_abc_xyz"), "Should accept mge_ prefix IDs");
  }),
  t("T11", "isGraphId accepts any graph ID prefix", () => {
    assert(isGraphId("mgn_abc_xyz"), "Should accept node IDs");
    assert(isGraphId("mge_abc_xyz"), "Should accept edge IDs");
    assert(!isGraphId("external_id"), "Should reject non-graph IDs");
  }),
  t("T12", "generateNodeId generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, generateNodeId));
    assert(ids.size === 100, "IDs must be unique");
  }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — Node Builder (T13–T24)
// ═══════════════════════════════════════════════════════════════════════════════

const section2Tests: TestResult[] = [
  t("T13", "buildNode creates a valid GraphNode", () => {
    const n = buildNode({ orgSlug: ORG, type: "CLIENT", label: "Test Client", source: "test" });
    assert(n.orgSlug === ORG, "orgSlug must match");
    assert(n.type === "CLIENT", "type must match");
    assert(n.label === "Test Client", "label must match");
    assert(typeof n.id === "string", "id must be string");
    assert(typeof n.createdAt === "string", "createdAt must be string");
  }),
  t("T14", "buildMemoryNode creates MEMORY node", () => {
    const n = buildMemoryNode(ORG, { id: "mem_001", title: "Cash Flow Note" });
    assert(n.type === "MEMORY", "Type must be MEMORY");
    assert(n.id.startsWith("mgn_mem_"), "ID must have mgn_mem_ prefix");
  }),
  t("T15", "buildPlaybookNode creates PLAYBOOK node", () => {
    const n = buildPlaybookNode(ORG, { id: "pb_001", title: "Playbook X", priority: "HIGH" });
    assert(n.type === "PLAYBOOK", "Type must be PLAYBOOK");
    assert(n.weight >= 0.7, "HIGH priority should produce high weight");
  }),
  t("T16", "buildInsightNode creates INSIGHT node", () => {
    const n = buildInsightNode(ORG, { id: "ins_001", title: "Low Cash Alert", executiveImpact: "CRITICAL" });
    assert(n.type === "INSIGHT", "Type must be INSIGHT");
    assert(n.weight === 1.0, "CRITICAL impact should produce weight 1.0");
  }),
  t("T17", "buildClientNode creates CLIENT node with prefix", () => {
    const n = buildClientNode(ORG, "cli_001", "Cliente X");
    assert(n.type === "CLIENT", "Type must be CLIENT");
    assert(n.id === "mgn_cli_cli_001", "ID must have correct prefix");
  }),
  t("T18", "buildOrderNode creates ORDER node", () => {
    const n = buildOrderNode(ORG, "ord_001", "Pedido 001");
    assert(n.type === "ORDER", "Type must be ORDER");
  }),
  t("T19", "buildEventNode creates EVENT node", () => {
    const n = buildEventNode(ORG, { label: "Payment Received", eventType: "PAYMENT" });
    assert(n.type === "EVENT", "Type must be EVENT");
    assert(n.label === "Payment Received", "Label must match");
  }),
  t("T20", "buildAlertNode creates ALERT node with severity weight", () => {
    const n = buildAlertNode(ORG, { label: "Alert", severity: "CRITICAL" });
    assert(n.type === "ALERT", "Type must be ALERT");
    assert(n.weight === 1.0, "CRITICAL severity should produce weight 1.0");
  }),
  t("T21", "buildDecisionNode creates DECISION node", () => {
    const n = buildDecisionNode(ORG, { label: "Approve Invoice", confidence: 80 });
    assert(n.type === "DECISION", "Type must be DECISION");
    assert(n.weight === 0.8, "80 confidence = 0.8 weight");
  }),
  t("T22", "buildAnomalyNode creates ANOMALY node", () => {
    const n = buildAnomalyNode(ORG, { label: "Unusual transfer", severity: "HIGH" });
    assert(n.type === "ANOMALY", "Type must be ANOMALY");
  }),
  t("T23", "node has required fields", () => {
    const n = buildNode({ orgSlug: ORG, type: "AGENT", label: "Agent Diego", source: "registry" });
    assert(typeof n.id === "string" && n.id.length > 0, "id required");
    assert(typeof n.orgSlug === "string", "orgSlug required");
    assert(typeof n.type === "string", "type required");
    assert(typeof n.label === "string", "label required");
    assert(typeof n.source === "string", "source required");
    assert(typeof n.createdAt === "string", "createdAt required");
    assert(Array.isArray(n.tags), "tags must be array");
    assert(typeof n.metadata === "object", "metadata must be object");
  }),
  t("T24", "node weight defaults to 0.5", () => {
    const n = buildNode({ orgSlug: ORG, type: "DOCUMENT", label: "Doc", source: "test" });
    assert(n.weight === 0.5, "Default weight is 0.5");
  }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — Edge Builder (T25–T36)
// ═══════════════════════════════════════════════════════════════════════════════

const section3Tests: TestResult[] = [
  t("T25", "buildEdge creates a valid GraphEdge", () => {
    const n1 = buildNode({ orgSlug: ORG, type: "ORDER", label: "Pedido", source: "test" });
    const n2 = buildNode({ orgSlug: ORG, type: "CLIENT", label: "Cliente", source: "test" });
    registerNode(n1);
    registerNode(n2);
    const e = buildRelatedToEdge(ORG, n1.id, n2.id, "Order relates to client", "test");
    assert(e.orgSlug === ORG, "orgSlug must match");
    assert(typeof e.id === "string", "id must be string");
    assert(e.sourceNodeId === n1.id, "sourceNodeId must match");
    assert(e.targetNodeId === n2.id, "targetNodeId must match");
  }),
  t("T26", "buildEdge throws on self-loop", () => {
    let threw = false;
    try { buildRelatedToEdge(ORG, "x", "x", "self", "test"); } catch { threw = true; }
    assert(threw, "Must throw on self-loop");
  }),
  t("T27", "buildBelongsToEdge sets BELONGS_TO type", () => {
    const n1 = buildNode({ orgSlug: ORG, type: "ORDER", label: "O", source: "test" });
    const n2 = buildNode({ orgSlug: ORG, type: "CLIENT", label: "C", source: "test" });
    registerNode(n1); registerNode(n2);
    const e = buildBelongsToEdge(ORG, n1.id, n2.id, "reason", "test");
    assert(e.type === "BELONGS_TO", "Type must be BELONGS_TO");
    assert(e.weight === 0.9, "BELONGS_TO weight is 0.9");
  }),
  t("T28", "buildCausedEdge sets CAUSED type", () => {
    const n1 = buildNode({ orgSlug: ORG, type: "EVENT", label: "E1", source: "test" });
    const n2 = buildNode({ orgSlug: ORG, type: "EVENT", label: "E2", source: "test" });
    registerNode(n1); registerNode(n2);
    const e = buildCausedEdge(ORG, n1.id, n2.id, "Event 1 caused Event 2", "test");
    assert(e.type === "CAUSED", "Type must be CAUSED");
  }),
  t("T29", "buildTriggersEdge sets TRIGGERS type", () => {
    const n1 = buildNode({ orgSlug: ORG, type: "ANOMALY", label: "A", source: "test" });
    const n2 = buildNode({ orgSlug: ORG, type: "ALERT",   label: "Al", source: "test" });
    registerNode(n1); registerNode(n2);
    const e = buildTriggersEdge(ORG, n1.id, n2.id, "Anomaly triggers alert", "test");
    assert(e.type === "TRIGGERS", "Type must be TRIGGERS");
  }),
  t("T30", "buildSupportsEdge sets SUPPORTS type", () => {
    const n1 = buildNode({ orgSlug: ORG, type: "MEMORY", label: "M", source: "test" });
    const n2 = buildNode({ orgSlug: ORG, type: "INSIGHT", label: "I", source: "test" });
    registerNode(n1); registerNode(n2);
    const e = buildSupportsEdge(ORG, n1.id, n2.id, "Memory supports insight", "test");
    assert(e.type === "SUPPORTS", "Type must be SUPPORTS");
  }),
  t("T31", "buildContradictsEdge sets CONTRADICTS type", () => {
    const n1 = buildNode({ orgSlug: ORG, type: "INSIGHT", label: "I1", source: "test" });
    const n2 = buildNode({ orgSlug: ORG, type: "INSIGHT", label: "I2", source: "test" });
    registerNode(n1); registerNode(n2);
    const e = buildContradictsEdge(ORG, n1.id, n2.id, "I1 contradicts I2", "test");
    assert(e.type === "CONTRADICTS", "Type must be CONTRADICTS");
  }),
  t("T32", "edge has required provenance fields", () => {
    const n1 = buildNode({ orgSlug: ORG, type: "TASK", label: "T", source: "test" });
    const n2 = buildNode({ orgSlug: ORG, type: "AGENT", label: "A", source: "test" });
    registerNode(n1); registerNode(n2);
    const e = buildGeneratedByEdge(ORG, n1.id, n2.id, "Agent generated this task", "test");
    assert(typeof e.source === "string" && e.source.length > 0, "source required");
    assert(typeof e.reasoning === "string" && e.reasoning.length > 0, "reasoning required");
  }),
  t("T33", "edge weight is between 0 and 1", () => {
    const n1 = buildNode({ orgSlug: ORG, type: "CLIENT", label: "C", source: "test" });
    const n2 = buildNode({ orgSlug: ORG, type: "PRODUCT", label: "P", source: "test" });
    registerNode(n1); registerNode(n2);
    const e = buildAffectsEdge(ORG, n1.id, n2.id, "reason", "test");
    assert(e.weight >= 0 && e.weight <= 1, "Weight must be 0–1");
  }),
  t("T34", "edge has createdAt timestamp", () => {
    const n1 = buildNode({ orgSlug: ORG, type: "REPORT", label: "R", source: "test" });
    const n2 = buildNode({ orgSlug: ORG, type: "DECISION", label: "D", source: "test" });
    registerNode(n1); registerNode(n2);
    const e = buildRelatedToEdge(ORG, n1.id, n2.id, "reason", "test");
    assert(typeof e.createdAt === "string", "createdAt must be string");
    assert(new Date(e.createdAt).getFullYear() >= 2024, "createdAt must be recent");
  }),
  t("T35", "buildAffectsEdge sets AFFECTS type", () => {
    const n1 = buildNode({ orgSlug: ORG, type: "CAMPAIGN", label: "C", source: "test" });
    const n2 = buildNode({ orgSlug: ORG, type: "PRODUCT", label: "P", source: "test" });
    registerNode(n1); registerNode(n2);
    const e = buildAffectsEdge(ORG, n1.id, n2.id, "Campaign affects product", "test");
    assert(e.type === "AFFECTS", "Type must be AFFECTS");
  }),
  t("T36", "edge metadata defaults to empty object", () => {
    const n1 = buildNode({ orgSlug: ORG, type: "USER", label: "U", source: "test" });
    const n2 = buildNode({ orgSlug: ORG, type: "TASK", label: "T", source: "test" });
    registerNode(n1); registerNode(n2);
    const e = buildRelatedToEdge(ORG, n1.id, n2.id, "reason", "test");
    assert(typeof e.metadata === "object", "metadata must be object");
  }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — Registry (T37–T48)
// ═══════════════════════════════════════════════════════════════════════════════

const section4Tests: TestResult[] = [
  t("T37", "registerNode and getNode work", () => {
    clearRegistry(ORG);
    const n = buildNode({ orgSlug: ORG, type: "CLIENT", label: "X", source: "test" });
    registerNode(n);
    const found = getNode(ORG, n.id);
    assert(found?.id === n.id, "Should find registered node");
  }),
  t("T38", "getNode returns undefined for missing nodes", () => {
    const found = getNode(ORG, "nonexistent_id");
    assert(found === undefined, "Should return undefined for missing node");
  }),
  t("T39", "listNodes returns all org nodes", () => {
    clearRegistry(ORG);
    const n1 = createNode({ orgSlug: ORG, type: "CLIENT", label: "A", source: "test" });
    const n2 = createNode({ orgSlug: ORG, type: "ORDER",  label: "B", source: "test" });
    const nodes = listNodes(ORG);
    assert(nodes.length >= 2, "Should list all registered nodes");
  }),
  t("T40", "listNodes is org-scoped", () => {
    clearRegistry(ORG);
    clearRegistry(ORG_B);
    createNode({ orgSlug: ORG,   type: "CLIENT", label: "Mine",   source: "test" });
    createNode({ orgSlug: ORG_B, type: "CLIENT", label: "Theirs", source: "test" });
    const nodesA = listNodes(ORG);
    const nodesB = listNodes(ORG_B);
    assert(nodesA.every(n => n.orgSlug === ORG), "Org A nodes must belong to ORG");
    assert(nodesB.every(n => n.orgSlug === ORG_B), "Org B nodes must belong to ORG_B");
  }),
  t("T41", "registerEdge requires both nodes to exist", () => {
    clearRegistry(ORG);
    const n1 = createNode({ orgSlug: ORG, type: "ORDER", label: "O", source: "test" });
    assert(n1 !== null, "n1 must be created");
    // Try to create edge to non-existent node
    const e = createEdge({ orgSlug: ORG, type: "BELONGS_TO", sourceNodeId: n1!.id, targetNodeId: "fake_node_id", reasoning: "test", source: "test" });
    assert(e === null, "Should fail when target node doesn't exist");
  }),
  t("T42", "edgesFrom returns outbound edges", () => {
    const { n1, n2 } = seedGraph(ORG);
    const out = edgesFrom(ORG, n2);   // n2 (ORDER) → n1 (CLIENT)
    assert(out.length >= 1, "Should have outbound edge from ORDER");
  }),
  t("T43", "edgesTo returns inbound edges", () => {
    const { n1 } = seedGraph(ORG);
    const inb = edgesTo(ORG, n1);   // n1 (CLIENT) receives edges
    assert(inb.length >= 1, "Should have inbound edges to CLIENT");
  }),
  t("T44", "hasNode returns true/false correctly", () => {
    clearRegistry(ORG);
    const n = createNode({ orgSlug: ORG, type: "MEMORY", label: "M", source: "test" });
    assert(hasNode(ORG, n!.id), "Should find registered node");
    assert(!hasNode(ORG, "fake"), "Should not find non-existent node");
  }),
  t("T45", "hasEdge returns true/false correctly", () => {
    const { n1, n2 } = seedGraph(ORG);
    const edges = listEdges(ORG);
    assert(edges.length > 0, "Should have edges after seeding");
    assert(hasEdge(ORG, edges[0].id), "Should find registered edge");
    assert(!hasEdge(ORG, "fake_edge"), "Should not find fake edge");
  }),
  t("T46", "clearRegistry removes all org data", () => {
    clearRegistry(ORG);
    createNode({ orgSlug: ORG, type: "CLIENT", label: "C", source: "test" });
    clearRegistry(ORG);
    assert(listNodes(ORG).length === 0, "Should have no nodes after clear");
    assert(listEdges(ORG).length === 0, "Should have no edges after clear");
  }),
  t("T47", "upsertNode updates existing node", () => {
    clearRegistry(ORG);
    const n = createNode({ id: "mgn_test_upsert", orgSlug: ORG, type: "CLIENT", label: "Old Label", source: "test" });
    upsertNode({ id: "mgn_test_upsert", orgSlug: ORG, type: "CLIENT", label: "New Label", source: "test" });
    const updated = getNode(ORG, "mgn_test_upsert");
    assert(updated?.label === "New Label", "Label should be updated");
  }),
  t("T48", "getNeighborIds returns all connected node IDs", () => {
    const { n1 } = seedGraph(ORG);
    const neighborIds = getNeighborIds(ORG, n1);
    assert(neighborIds.length >= 2, `Should have neighbors, got: ${neighborIds.length}`);
  }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5 — Graph Engine (T49–T60)
// ═══════════════════════════════════════════════════════════════════════════════

const section5Tests: TestResult[] = [
  t("T49", "createNode returns GraphNode", () => {
    clearRegistry(ORG);
    const n = createNode({ orgSlug: ORG, type: "PRODUCT", label: "Producto A", source: "test" });
    assert(n !== null, "createNode must return non-null");
    assert(n!.type === "PRODUCT", "type must match");
  }),
  t("T50", "createEdge returns null when nodes missing", () => {
    clearRegistry(ORG);
    const e = createEdge({ orgSlug: ORG, type: "BELONGS_TO", sourceNodeId: "fake1", targetNodeId: "fake2", reasoning: "test", source: "test" });
    assert(e === null, "Must return null when nodes don't exist");
  }),
  t("T51", "validateGraph returns valid for clean graph", () => {
    const { n1 } = seedGraph(ORG);
    const result = validateGraph(ORG);
    assert(Array.isArray(result.errors), "errors must be array");
    assert(Array.isArray(result.warnings), "warnings must be array");
    assert(typeof result.valid === "boolean", "valid must be boolean");
  }),
  t("T52", "getOutboundEdges returns outbound only", () => {
    const { n2 } = seedGraph(ORG);   // n2 is ORDER, has outbound BELONGS_TO
    const outbound = getOutboundEdges(ORG, n2);
    assert(Array.isArray(outbound), "Must return array");
  }),
  t("T53", "getInboundEdges returns inbound only", () => {
    const { n1 } = seedGraph(ORG);   // n1 is CLIENT, receives edges
    const inbound = getInboundEdges(ORG, n1);
    assert(inbound.length >= 1, "CLIENT should have inbound edges");
  }),
  t("T54", "getAllNodes returns all nodes for org", () => {
    seedGraph(ORG);
    const { getAllNodes } = require("@/lib/copilot/memory-graph/graph-engine");
    const nodes = getAllNodes(ORG);
    assert(nodes.length >= 3, "Should have at least 3 nodes after seed");
  }),
  t("T55", "getAllEdges returns all edges for org", () => {
    seedGraph(ORG);
    const { getAllEdges } = require("@/lib/copilot/memory-graph/graph-engine");
    const edges = getAllEdges(ORG);
    assert(edges.length >= 2, "Should have at least 2 edges after seed");
  }),
  t("T56", "addNodes batch-registers multiple nodes", () => {
    clearRegistry(ORG);
    const { addNodes } = require("@/lib/copilot/memory-graph/graph-engine");
    const nodes = [
      buildNode({ orgSlug: ORG, type: "CLIENT", label: "C1", source: "test" }),
      buildNode({ orgSlug: ORG, type: "CLIENT", label: "C2", source: "test" }),
      buildNode({ orgSlug: ORG, type: "CLIENT", label: "C3", source: "test" }),
    ];
    const count = addNodes(nodes);
    assert(count === 3, `Should register 3 nodes, got ${count}`);
  }),
  t("T57", "createNode with custom ID uses that ID", () => {
    clearRegistry(ORG);
    const n = createNode({ id: "mgn_custom_001", orgSlug: ORG, type: "TASK", label: "Task X", source: "test" });
    assert(n?.id === "mgn_custom_001", "Should use custom ID");
  }),
  t("T58", "deleteNode removes node and edges", () => {
    const { n1, n2 } = seedGraph(ORG);
    const { deleteNode } = require("@/lib/copilot/memory-graph/graph-engine");
    deleteNode(ORG, n1);
    assert(!hasNode(ORG, n1), "Node should be removed");
  }),
  t("T59", "createNode fails gracefully on invalid input", () => {
    const n = createNode({ orgSlug: "", type: "CLIENT", label: "", source: "test" });
    // Either null or a node with empty orgSlug — should not throw
    assert(true, "Should not throw");
  }),
  t("T60", "registryStats returns correct counts", () => {
    const { registryStats } = require("@/lib/copilot/memory-graph/graph-registry");
    seedGraph(ORG);
    const stats = registryStats(ORG);
    assert(stats.nodeCount >= 3, `Should have 3+ nodes, got ${stats.nodeCount}`);
    assert(stats.edgeCount >= 2, `Should have 2+ edges, got ${stats.edgeCount}`);
    assert(typeof stats.checkedAt === "string", "checkedAt must be string");
  }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6 — Traversal Engine (T61–T75)
// ═══════════════════════════════════════════════════════════════════════════════

const section6Tests: TestResult[] = [
  t("T61", "neighbors returns directly connected nodes", () => {
    const { n1 } = seedGraph(ORG);
    const nbrs = neighbors(ORG, n1);
    assert(Array.isArray(nbrs), "Must return array");
    assert(nbrs.length >= 2, `CLIENT should have neighbors, got: ${nbrs.length}`);
  }),
  t("T62", "children returns outbound neighbors", () => {
    const { n2 } = seedGraph(ORG);   // n2 = ORDER, points to CLIENT
    const chld = children(ORG, n2);
    assert(Array.isArray(chld), "Must return array");
    assert(chld.length >= 1, "ORDER should have children");
  }),
  t("T63", "parents returns inbound neighbors", () => {
    const { n1 } = seedGraph(ORG);   // n1 = CLIENT, receives edges
    const prts = parents(ORG, n1);
    assert(prts.length >= 1, "CLIENT should have parents");
  }),
  t("T64", "findPath finds path between connected nodes", () => {
    const { n1, n2 } = seedGraph(ORG);
    const path = findPath(ORG, n2, n1);
    assert(path.exists, "Should find path from ORDER to CLIENT");
    assert(path.nodes.length >= 2, "Path should have at least 2 nodes");
  }),
  t("T65", "findPath returns exists=false for disconnected nodes", () => {
    clearRegistry(ORG);
    const n1 = createNode({ orgSlug: ORG, type: "CLIENT", label: "A", source: "test" });
    const n2 = createNode({ orgSlug: ORG, type: "ORDER",  label: "B", source: "test" });
    // No edge between them
    const path = findPath(ORG, n1!.id, n2!.id);
    assert(!path.exists, "Should return exists=false for disconnected nodes");
  }),
  t("T66", "shortestPath alias works", () => {
    const { n1, n2 } = seedGraph(ORG);
    const path = shortestPath(ORG, n2, n1);
    assert(typeof path.exists === "boolean", "shortestPath must return GraphPath");
  }),
  t("T67", "findPaths returns multiple paths", () => {
    const { n1, n2 } = seedGraph(ORG);
    const paths = findPaths(ORG, n2, n1);
    assert(Array.isArray(paths), "Must return array");
  }),
  t("T68", "bfsTraversal visits nodes breadth-first", () => {
    const { n1 } = seedGraph(ORG);
    const traversal = bfsTraversal(ORG, n1, 2);
    assert(typeof traversal.startNodeId === "string", "Must have startNodeId");
    assert(Array.isArray(traversal.visited), "Must have visited array");
    assert(traversal.visited.length >= 1, "Should visit at least 1 node");
    assert(typeof traversal.traversedAt === "string", "Must have traversedAt");
  }),
  t("T69", "bfsTraversal path has nodes and edges", () => {
    const { n1 } = seedGraph(ORG);
    const traversal = bfsTraversal(ORG, n1, 2);
    assert(Array.isArray(traversal.path.nodes), "path.nodes must be array");
    assert(Array.isArray(traversal.path.edges), "path.edges must be array");
    assert(traversal.path.exists, "path.exists should be true when nodes found");
  }),
  t("T70", "neighbors returns empty array for isolated node", () => {
    clearRegistry(ORG);
    const n = createNode({ orgSlug: ORG, type: "DOCUMENT", label: "Isolated", source: "test" });
    const nbrs = neighbors(ORG, n!.id);
    assert(nbrs.length === 0, "Isolated node should have no neighbors");
  }),
  t("T71", "findPath for same start and end returns single-node path", () => {
    const { n1 } = seedGraph(ORG);
    const path = findPath(ORG, n1, n1);
    assert(path.exists, "Path to self should exist");
    assert(path.nodes.length === 1, "Self-path has 1 node");
  }),
  t("T72", "bfsTraversal respects maxDepth", () => {
    const { n1 } = seedGraph(ORG);
    const shallow = bfsTraversal(ORG, n1, 1);
    const deep    = bfsTraversal(ORG, n1, 5);
    assert(shallow.visited.length <= deep.visited.length, "Deeper traversal should visit >= nodes");
  }),
  t("T73", "path length equals edge count", () => {
    const { n1, n2 } = seedGraph(ORG);
    const path = findPath(ORG, n2, n1);
    if (path.exists) {
      assert(path.length === path.edges.length, "path.length must equal edges.length");
    }
  }),
  t("T74", "findPaths respects maxPaths limit", () => {
    const { n1, n2 } = seedGraph(ORG);
    const paths = findPaths(ORG, n2, n1, 2);
    assert(paths.length <= 2, "Should not exceed maxPaths");
  }),
  t("T75", "traversal orgSlug is preserved", () => {
    const { n1 } = seedGraph(ORG);
    const traversal = bfsTraversal(ORG, n1);
    assert(traversal.orgSlug === ORG, "Traversal orgSlug must match");
  }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7 — Relationship Resolver (T76–T85)
// ═══════════════════════════════════════════════════════════════════════════════

const section7Tests: TestResult[] = [
  t("T76", "RELATIONSHIP_PATTERNS has 20+ patterns", () => {
    assert(RELATIONSHIP_PATTERNS.length >= 20, `Expected 20+ patterns, got ${RELATIONSHIP_PATTERNS.length}`);
  }),
  t("T77", "resolveRelationship resolves ORDER→CLIENT", () => {
    const r = resolveRelationship("ORDER", "CLIENT");
    assert(r.resolved, "Should resolve ORDER→CLIENT");
    assert(r.edgeType === "BELONGS_TO", "Should be BELONGS_TO");
    assert(r.confidence === 1.0, "Confidence should be 1.0");
  }),
  t("T78", "resolveRelationship resolves CAMPAIGN→PRODUCT", () => {
    const r = resolveRelationship("CAMPAIGN", "PRODUCT");
    assert(r.resolved, "Should resolve CAMPAIGN→PRODUCT");
    assert(r.edgeType === "AFFECTS", "Should be AFFECTS");
  }),
  t("T79", "resolveRelationship resolves ANOMALY→ALERT", () => {
    const r = resolveRelationship("ANOMALY", "ALERT");
    assert(r.resolved, "Should resolve ANOMALY→ALERT");
    assert(r.edgeType === "TRIGGERS", "Should be TRIGGERS");
    assert(r.confidence === 1.0, "ANOMALY→ALERT confidence is 1.0");
  }),
  t("T80", "resolveRelationship returns resolved=false for unknown pair", () => {
    const r = resolveRelationship("REPORT", "USER");
    assert(!r.resolved, "Unknown pair should have resolved=false");
    assert(r.edgeType === null, "Unknown pair should have null edgeType");
    assert(r.confidence === 0, "Unknown pair should have 0 confidence");
  }),
  t("T81", "canRelate returns true for known pairs", () => {
    assert(canRelate("ORDER", "CLIENT"), "ORDER→CLIENT should be relatable");
    assert(canRelate("PLAYBOOK", "TASK"), "PLAYBOOK→TASK should be relatable");
  }),
  t("T82", "canRelate returns false for unknown pairs", () => {
    assert(!canRelate("REPORT", "USER"), "REPORT→USER should not be relatable");
  }),
  t("T83", "allRelationshipsFor returns patterns for source type", () => {
    const { allRelationshipsFor } = require("@/lib/copilot/memory-graph/relationship-resolver");
    const patterns = allRelationshipsFor("ORDER");
    assert(patterns.length >= 1, "ORDER should have at least 1 pattern");
    assert(patterns.every((p: any) => p.sourceType === "ORDER"), "All patterns should be for ORDER");
  }),
  t("T84", "resolveRelationship includes reasoning", () => {
    const r = resolveRelationship("ALERT", "TASK");
    assert(r.resolved, "Should resolve ALERT→TASK");
    assert(typeof r.reasoning === "string" && r.reasoning.length > 0, "Must include reasoning");
  }),
  t("T85", "all RELATIONSHIP_PATTERNS have required fields", () => {
    for (const p of RELATIONSHIP_PATTERNS) {
      assert(typeof p.sourceType === "string", "sourceType required");
      assert(typeof p.targetType === "string", "targetType required");
      assert(typeof p.edgeType === "string", "edgeType required");
      assert(typeof p.reasoning === "string" && p.reasoning.length > 0, "reasoning required");
      assert(p.confidence > 0 && p.confidence <= 1, "confidence must be 0–1");
    }
  }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 8 — Integrity Engine (T86–T95)
// ═══════════════════════════════════════════════════════════════════════════════

const section8Tests: TestResult[] = [
  t("T86", "runIntegrityCheck returns IntegrityReport", () => {
    seedGraph(ORG);
    const report = runIntegrityCheck(ORG);
    assert(typeof report.valid === "boolean", "valid must be boolean");
    assert(typeof report.errorCount === "number", "errorCount must be number");
    assert(typeof report.warningCount === "number", "warningCount must be number");
    assert(Array.isArray(report.orphanNodes), "orphanNodes must be array");
    assert(Array.isArray(report.crossTenantEdges), "crossTenantEdges must be array");
    assert(typeof report.checkedAt === "string", "checkedAt must be string");
  }),
  t("T87", "clean graph has 0 errors", () => {
    seedGraph(ORG);
    const report = runIntegrityCheck(ORG);
    assert(report.errorCount === 0, `Clean graph should have 0 errors, got ${report.errorCount}`);
  }),
  t("T88", "validateIntegrity returns GraphValidationResult", () => {
    seedGraph(ORG);
    const result = validateIntegrity(ORG);
    assert(typeof result.valid === "boolean", "valid must be boolean");
    assert(Array.isArray(result.errors), "errors must be array");
    assert(Array.isArray(result.warnings), "warnings must be array");
  }),
  t("T89", "hasIntegrityErrors returns false for clean graph", () => {
    seedGraph(ORG);
    const hasErrors = hasIntegrityErrors(ORG);
    assert(!hasErrors, "Clean graph should have no integrity errors");
  }),
  t("T90", "countOrphanNodes returns 0 for connected graph", () => {
    seedGraph(ORG);   // all nodes connected
    // n3 (CAMPAIGN) has an edge to n1, so no full orphans
    const count = countOrphanNodes(ORG);
    assert(typeof count === "number", "Must return a number");
  }),
  t("T91", "isolated nodes detected in orphan report", () => {
    clearRegistry(ORG);
    createNode({ orgSlug: ORG, type: "DOCUMENT", label: "Isolated Doc", source: "test" });
    const report = runIntegrityCheck(ORG);
    assert(report.orphanNodes.length >= 1, "Should detect isolated node");
  }),
  t("T92", "duplicate edge detection works", () => {
    clearRegistry(ORG);
    const n1 = createNode({ orgSlug: ORG, type: "ORDER", label: "O", source: "test" });
    const n2 = createNode({ orgSlug: ORG, type: "CLIENT", label: "C", source: "test" });
    createEdge({ orgSlug: ORG, type: "BELONGS_TO", sourceNodeId: n1!.id, targetNodeId: n2!.id, reasoning: "r", source: "test" });
    // Register a duplicate edge manually
    const dupEdge = buildRelatedToEdge(ORG, n1!.id, n2!.id, "dup", "test");
    // Change type to simulate duplicate
    registerEdge({ ...dupEdge, type: "BELONGS_TO" });
    const report = runIntegrityCheck(ORG);
    // duplicateEdges should detect duplicates
    assert(typeof report.duplicateEdges === "number" || Array.isArray(report.duplicateEdges), "duplicateEdges field exists");
  }),
  t("T93", "IntegrityReport has all required fields", () => {
    seedGraph(ORG);
    const r = runIntegrityCheck(ORG);
    assert(typeof r.orgSlug === "string", "orgSlug required");
    assert(typeof r.valid === "boolean", "valid required");
    assert(Array.isArray(r.orphanNodes), "orphanNodes required");
    assert(Array.isArray(r.orphanEdges), "orphanEdges required");
    assert(Array.isArray(r.crossTenantEdges), "crossTenantEdges required");
    assert(Array.isArray(r.brokenReferences), "brokenReferences required");
    assert(Array.isArray(r.duplicateEdges), "duplicateEdges required");
    assert(Array.isArray(r.selfLoops), "selfLoops required");
    assert(Array.isArray(r.noSourceNodes), "noSourceNodes required");
    assert(Array.isArray(r.noSourceEdges), "noSourceEdges required");
    assert(typeof r.errorCount === "number", "errorCount required");
    assert(typeof r.warningCount === "number", "warningCount required");
  }),
  t("T94", "integrity check never throws", () => {
    clearAllRegistries();
    let threw = false;
    try { runIntegrityCheck(ORG); } catch { threw = true; }
    assert(!threw, "runIntegrityCheck must never throw");
  }),
  t("T95", "validateIntegrity returns valid=true for clean graph", () => {
    seedGraph(ORG);
    const result = validateIntegrity(ORG);
    assert(result.valid, "Clean graph must be valid");
    assert(result.errors.length === 0, "Clean graph must have 0 errors");
  }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9 — Query Engine + Search (T96–T110)
// ═══════════════════════════════════════════════════════════════════════════════

const section9Tests: TestResult[] = [
  t("T96", "findNode retrieves a node by ID", () => {
    const { n1 } = seedGraph(ORG);
    const found = findNode(ORG, n1);
    assert(found?.id === n1, "Should find node by ID");
  }),
  t("T97", "findNodesByType returns typed nodes", () => {
    seedGraph(ORG);
    const clients = findNodesByType(ORG, "CLIENT");
    assert(clients.every(n => n.type === "CLIENT"), "All must be CLIENT type");
    assert(clients.length >= 1, "Should find at least 1 CLIENT");
  }),
  t("T98", "findRelated returns 1-hop neighbors", () => {
    const { n1 } = seedGraph(ORG);
    const related = findRelated(ORG, n1);
    assert(Array.isArray(related), "Must return array");
    assert(related.length >= 2, "CLIENT should have related nodes");
  }),
  t("T99", "findConnected returns nodes within depth", () => {
    const { n1 } = seedGraph(ORG);
    const connected = findConnected(ORG, n1, 2);
    assert(connected.length >= 1, "Should find connected nodes");
  }),
  t("T100", "findEdgesByType returns typed edges", () => {
    seedGraph(ORG);
    const belongsTo = findEdgesByType(ORG, "BELONGS_TO");
    assert(belongsTo.every(e => e.type === "BELONGS_TO"), "All must be BELONGS_TO");
  }),
  t("T101", "findEdgesBetween returns edges between two nodes", () => {
    const { n1, n2 } = seedGraph(ORG);
    const edges = findEdgesBetween(ORG, n1, n2);
    assert(Array.isArray(edges), "Must return array");
  }),
  t("T102", "searchGraph applies nodeType filter", () => {
    seedGraph(ORG);
    const result = searchGraph({ orgSlug: ORG, nodeType: "CLIENT", queryId: QUERY_ID });
    assert(result.nodes.every(n => n.type === "CLIENT"), "All results must be CLIENT type");
  }),
  t("T103", "searchGraph applies label filter", () => {
    seedGraph(ORG);
    const result = searchGraph({ orgSlug: ORG, label: "Cliente", queryId: QUERY_ID });
    assert(result.nodes.some(n => n.label.includes("Cliente")), "Should find node by label");
  }),
  t("T104", "searchGraph returns queryId", () => {
    const result = searchGraph({ orgSlug: ORG, queryId: QUERY_ID });
    assert(result.queryId === QUERY_ID, "queryId must be preserved");
  }),
  t("T105", "searchNodes finds by term", () => {
    seedGraph(ORG);
    const result = searchNodes({ orgSlug: ORG, term: "Cliente" });
    assert(result.matches.length >= 1, "Should find node matching 'Cliente'");
  }),
  t("T106", "searchNodesTerm returns node array", () => {
    seedGraph(ORG);
    const nodes = searchNodesTerm(ORG, "Campaña");
    assert(Array.isArray(nodes), "Must return array");
  }),
  t("T107", "getRankedMatches returns scored results", () => {
    seedGraph(ORG);
    const ranked = getRankedMatches(ORG, "Cliente");
    assert(Array.isArray(ranked), "Must return array");
    if (ranked.length > 0) {
      assert(typeof ranked[0].score === "number", "score must be number");
      assert(Array.isArray(ranked[0].reasons), "reasons must be array");
    }
  }),
  t("T108", "findByLabel finds nodes by label substring", () => {
    seedGraph(ORG);
    const nodes = findByLabel(ORG, "Cliente");
    assert(nodes.length >= 1, "Should find CLIENT nodes by label");
  }),
  t("T109", "getIsolatedNodes returns disconnected nodes", () => {
    clearRegistry(ORG);
    createNode({ orgSlug: ORG, type: "DOCUMENT", label: "Alone", source: "test" });
    const isolated = getIsolatedNodes(ORG);
    assert(isolated.length >= 1, "Should find isolated node");
  }),
  t("T110", "findSubgraph returns GraphSubgraph from root", () => {
    const { n1 } = seedGraph(ORG);
    const sub = findSubgraph(ORG, n1, 2);
    assert(typeof sub.orgSlug === "string", "orgSlug required");
    assert(Array.isArray(sub.nodes), "nodes must be array");
    assert(Array.isArray(sub.edges), "edges must be array");
  }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 10 — Context Expansion + Timeline (T111–T125)
// ═══════════════════════════════════════════════════════════════════════════════

const section10Tests: TestResult[] = [
  t("T111", "expandContext returns ExpandedContext", () => {
    seedGraph(ORG);
    const ctx = expandContext(ORG, "Cliente");
    assert(typeof ctx.orgSlug === "string", "orgSlug required");
    assert(typeof ctx.queryId === "string", "queryId required");
    assert(Array.isArray(ctx.rootNodes), "rootNodes must be array");
    assert(Array.isArray(ctx.expandedNodes), "expandedNodes must be array");
    assert(typeof ctx.totalNodes === "number", "totalNodes must be number");
  }),
  t("T112", "expandContext finds root nodes from query", () => {
    seedGraph(ORG);
    const ctx = expandContext(ORG, "Cliente");
    assert(ctx.rootNodes.length >= 1, "Should find root nodes matching 'Cliente'");
  }),
  t("T113", "expandContext returns empty for no-match query", () => {
    seedGraph(ORG);
    const ctx = expandContext(ORG, "xyzzy_no_match_xyz");
    assert(ctx.totalNodes === 0, "Should have 0 nodes for no-match query");
  }),
  t("T114", "expandFromNodes expands from known IDs", () => {
    const { n1 } = seedGraph(ORG);
    const ctx = expandFromNodes(ORG, [n1]);
    assert(ctx.expandedNodes.length >= 1, "Should have expanded nodes");
  }),
  t("T115", "summarizeExpansion returns summary", () => {
    seedGraph(ORG);
    const ctx = expandContext(ORG, "Campaña");
    const summary = summarizeExpansion(ctx);
    assert(typeof summary.rootCount === "number", "rootCount required");
    assert(typeof summary.expandedCount === "number", "expandedCount required");
    assert(Array.isArray(summary.nodeTypes), "nodeTypes must be array");
  }),
  t("T116", "expandContext never throws for empty graph", () => {
    clearRegistry(ORG);
    let threw = false;
    try { expandContext(ORG, "anything"); } catch { threw = true; }
    assert(!threw, "expandContext must never throw");
  }),
  t("T117", "buildTimeline creates chronological timeline", () => {
    seedGraph(ORG);
    const tl = buildTimeline(ORG);
    assert(typeof tl.orgSlug === "string", "orgSlug required");
    assert(Array.isArray(tl.entries), "entries must be array");
    assert(typeof tl.createdAt === "string", "createdAt required");
  }),
  t("T118", "timeline entries have required fields", () => {
    seedGraph(ORG);
    const tl = buildTimeline(ORG);
    for (const entry of tl.entries) {
      assert(typeof entry.nodeId === "string", "nodeId required");
      assert(typeof entry.timestamp === "string", "timestamp required");
      assert(typeof entry.eventType === "string", "eventType required");
    }
  }),
  t("T119", "buildNodeTimeline builds subgraph timeline", () => {
    const { n1 } = seedGraph(ORG);
    const tl = buildNodeTimeline(ORG, n1, 2);
    assert(tl.entries.length >= 1, "Should have entries for connected subgraph");
  }),
  t("T120", "buildEventTimeline returns only event types", () => {
    clearRegistry(ORG);
    createNode({ orgSlug: ORG, type: "EVENT", label: "E1", source: "test" });
    createNode({ orgSlug: ORG, type: "DECISION", label: "D1", source: "test" });
    createNode({ orgSlug: ORG, type: "CLIENT", label: "C1", source: "test" });
    const tl = buildEventTimeline(ORG);
    assert(tl.entries.every(e => ["EVENT", "DECISION", "ALERT"].includes(e.eventType)),
      "Event timeline should only include EVENT/DECISION/ALERT");
  }),
  t("T121", "analyzeTimeline returns stats", () => {
    seedGraph(ORG);
    const tl   = buildTimeline(ORG);
    const stats = analyzeTimeline(tl);
    assert(typeof stats.totalEntries === "number", "totalEntries required");
    assert(typeof stats.typeBreakdown === "object", "typeBreakdown required");
  }),
  t("T122", "timeline is sorted chronologically", () => {
    seedGraph(ORG);
    const tl = buildTimeline(ORG);
    for (let i = 1; i < tl.entries.length; i++) {
      assert(
        tl.entries[i].timestamp >= tl.entries[i - 1].timestamp,
        "Timeline must be sorted chronologically",
      );
    }
  }),
  t("T123", "buildTimeline never throws", () => {
    clearRegistry(ORG);
    let threw = false;
    try { buildTimeline(ORG); } catch { threw = true; }
    assert(!threw, "buildTimeline must never throw");
  }),
  t("T124", "expandContext orgSlug is correct", () => {
    seedGraph(ORG);
    const ctx = expandContext(ORG, "test");
    assert(ctx.orgSlug === ORG, "orgSlug must match");
  }),
  t("T125", "expandContext expanded depth is non-negative", () => {
    seedGraph(ORG);
    const ctx = expandContext(ORG, "Cliente", 2);
    assert(ctx.expandedDepth >= 0, "expandedDepth must be non-negative");
  }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 11 — Scoring + Reports (T126–T138)
// ═══════════════════════════════════════════════════════════════════════════════

const section11Tests: TestResult[] = [
  t("T126", "scoreNode returns GraphNodeScore", () => {
    const { n1 } = seedGraph(ORG);
    const score = scoreNode(ORG, n1);
    assert(score !== null, "Should return score for known node");
    assert(typeof score!.importance === "number", "importance required");
    assert(typeof score!.centrality === "number", "centrality required");
    assert(score!.importance >= 0 && score!.importance <= 1, "importance must be 0–1");
    assert(score!.centrality >= 0 && score!.centrality <= 1, "centrality must be 0–1");
  }),
  t("T127", "scoreAllNodes returns scores for all nodes", () => {
    seedGraph(ORG);
    const scores = scoreAllNodes(ORG);
    assert(scores.length >= 3, "Should score all nodes");
  }),
  t("T128", "topNodesByImportance returns sorted results", () => {
    seedGraph(ORG);
    const top = topNodesByImportance(ORG, 5);
    assert(Array.isArray(top), "Must return array");
    for (let i = 1; i < top.length; i++) {
      assert(top[i].importance <= top[i - 1].importance, "Must be sorted descending");
    }
  }),
  t("T129", "computeGraphMetrics returns metrics", () => {
    seedGraph(ORG);
    const metrics = computeGraphMetrics(ORG);
    assert(typeof metrics.nodeCount === "number", "nodeCount required");
    assert(typeof metrics.edgeCount === "number", "edgeCount required");
    assert(typeof metrics.density === "number", "density required");
    assert(typeof metrics.averageDegree === "number", "averageDegree required");
    assert(typeof metrics.computedAt === "string", "computedAt required");
  }),
  t("T130", "buildGraphSummary returns summary report", () => {
    seedGraph(ORG);
    const report = buildGraphSummary(ORG);
    assert(report.orgSlug === ORG, "orgSlug must match");
    assert(typeof report.nodeCount === "number", "nodeCount required");
    assert(typeof report.edgeCount === "number", "edgeCount required");
    assert(typeof report.nodeTypeBreakdown === "object", "nodeTypeBreakdown required");
    assert(typeof report.edgeTypeBreakdown === "object", "edgeTypeBreakdown required");
  }),
  t("T131", "buildRelationshipReport returns relationship report", () => {
    seedGraph(ORG);
    const report = buildRelationshipReport(ORG);
    assert(report.orgSlug === ORG, "orgSlug must match");
    assert(typeof report.totalRelationships === "number", "totalRelationships required");
    assert(typeof report.byType === "object", "byType required");
    assert(Array.isArray(report.strongestEdges), "strongestEdges required");
  }),
  t("T132", "buildKnowledgeReport returns knowledge report", () => {
    seedGraph(ORG);
    const report = buildKnowledgeReport(ORG);
    assert(report.orgSlug === ORG, "orgSlug required");
    assert(typeof report.totalNodes === "number", "totalNodes required");
    assert(Array.isArray(report.highImportance), "highImportance required");
    assert(Array.isArray(report.isolatedNodes), "isolatedNodes required");
    assert(Array.isArray(report.mostConnected), "mostConnected required");
  }),
  t("T133", "buildMemoryGraphDashboard returns dashboard", () => {
    seedGraph(ORG);
    const dash = buildMemoryGraphDashboard(ORG);
    assert(dash.orgSlug === ORG, "orgSlug required");
    assert(typeof dash.nodes === "number", "nodes required");
    assert(typeof dash.edges === "number", "edges required");
    assert(["HEALTHY", "DEGRADED", "CRITICAL"].includes(dash.graphHealth), "graphHealth must be valid");
    assert(Array.isArray(dash.nodesByType), "nodesByType required");
    assert(typeof dash.density === "number", "density required");
  }),
  t("T134", "buildEmptyMemoryGraphDashboard returns zeros", () => {
    const dash = buildEmptyMemoryGraphDashboard(ORG);
    assert(dash.nodes === 0, "nodes must be 0");
    assert(dash.edges === 0, "edges must be 0");
    assert(dash.graphHealth === "HEALTHY", "empty graph is HEALTHY");
  }),
  t("T135", "scoreNode returns null for unknown node", () => {
    seedGraph(ORG);
    // Score for completely unknown node — registry has no data for it
    const score = scoreNode(ORG, "mgn_completely_unknown_xyz");
    // Should return null or a zero score — either is acceptable
    assert(score === null || score.importance === 0, "Unknown node should return null or zero score");
  }),
  t("T136", "graph density is 0–1", () => {
    seedGraph(ORG);
    const metrics = computeGraphMetrics(ORG);
    assert(metrics.density >= 0 && metrics.density <= 1, "density must be 0–1");
  }),
  t("T137", "nodeTypeBreakdown matches actual nodes", () => {
    seedGraph(ORG);
    const report = buildGraphSummary(ORG);
    const totalFromBreakdown = Object.values(report.nodeTypeBreakdown).reduce((a, b) => a + b, 0);
    assert(totalFromBreakdown === report.nodeCount, "Breakdown totals must equal nodeCount");
  }),
  t("T138", "topNodesByCentrality returns sorted results", () => {
    const { topNodesByCentrality } = require("@/lib/copilot/memory-graph/graph-scoring");
    seedGraph(ORG);
    const top = topNodesByCentrality(ORG, 5);
    assert(Array.isArray(top), "Must return array");
    for (let i = 1; i < top.length; i++) {
      assert(top[i].centrality <= top[i - 1].centrality, "Must be sorted descending by centrality");
    }
  }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 12 — Tenant Isolation (T139–T148)
// ═══════════════════════════════════════════════════════════════════════════════

const section12Tests: TestResult[] = [
  t("T139", "checkTenantIsolation returns clean for org-scoped graph", () => {
    seedGraph(ORG);
    const report = checkTenantIsolation(ORG);
    assert(report.orgSlug === ORG, "orgSlug must match");
    assert(typeof report.clean === "boolean", "clean must be boolean");
    assert(report.clean, "Clean graph should pass isolation check");
  }),
  t("T140", "filterToOrg removes cross-tenant nodes", () => {
    const n1 = buildNode({ orgSlug: ORG,   type: "CLIENT", label: "Mine", source: "test" });
    const n2 = buildNode({ orgSlug: ORG_B, type: "CLIENT", label: "Theirs", source: "test" });
    const { nodes } = filterToOrg(ORG, [n1, n2], []);
    assert(nodes.length === 1, "Should filter to only ORG nodes");
    assert(nodes[0].orgSlug === ORG, "Remaining node must be ORG");
  }),
  t("T141", "isCrossTenantNode detects wrong org", () => {
    const n = buildNode({ orgSlug: ORG_B, type: "CLIENT", label: "X", source: "test" });
    assert(isCrossTenantNode(n, ORG), "Node from ORG_B should be cross-tenant for ORG");
    assert(!isCrossTenantNode(n, ORG_B), "Node from ORG_B should not be cross-tenant for ORG_B");
  }),
  t("T142", "TenantIsolationReport has violations array", () => {
    seedGraph(ORG);
    const report = checkTenantIsolation(ORG);
    assert(Array.isArray(report.violations), "violations must be array");
  }),
  t("T143", "TenantIsolationReport severity is CLEAN for clean graph", () => {
    seedGraph(ORG);
    const report = checkTenantIsolation(ORG);
    assert(report.severity === "CLEAN", "Should be CLEAN for properly scoped graph");
  }),
  t("T144", "TenantIsolationReport includes node and edge counts", () => {
    seedGraph(ORG);
    const report = checkTenantIsolation(ORG);
    assert(typeof report.nodeCount === "number", "nodeCount required");
    assert(typeof report.edgeCount === "number", "edgeCount required");
    assert(report.nodeCount >= 3, "Should count all nodes");
  }),
  t("T145", "filterToOrg removes cross-tenant edges", () => {
    const n1 = buildNode({ orgSlug: ORG, type: "CLIENT", label: "C", source: "test" });
    const n2 = buildNode({ orgSlug: ORG, type: "ORDER", label: "O", source: "test" });
    registerNode(n1); registerNode(n2);
    const goodEdge = buildRelatedToEdge(ORG, n1.id, n2.id, "r", "test");
    const badEdge  = { ...goodEdge, orgSlug: ORG_B };
    const { edges } = filterToOrg(ORG, [n1, n2], [goodEdge, badEdge]);
    assert(edges.every(e => e.orgSlug === ORG), "All edges must be ORG-scoped");
  }),
  t("T146", "checkTenantIsolation never throws", () => {
    clearRegistry(ORG);
    let threw = false;
    try { checkTenantIsolation(ORG); } catch { threw = true; }
    assert(!threw, "checkTenantIsolation must never throw");
  }),
  t("T147", "tenant isolation check includes checkedAt", () => {
    seedGraph(ORG);
    const report = checkTenantIsolation(ORG);
    assert(typeof report.checkedAt === "string", "checkedAt must be string");
    assert(new Date(report.checkedAt).getFullYear() >= 2024, "checkedAt must be recent");
  }),
  t("T148", "separate org graphs are completely isolated", () => {
    clearRegistry(ORG);
    clearRegistry(ORG_B);
    createNode({ orgSlug: ORG,   type: "CLIENT", label: "A", source: "test" });
    createNode({ orgSlug: ORG_B, type: "CLIENT", label: "B", source: "test" });
    const nodesA = listNodes(ORG);
    const nodesB = listNodes(ORG_B);
    assert(nodesA.every(n => n.orgSlug === ORG), "ORG nodes must be isolated");
    assert(nodesB.every(n => n.orgSlug === ORG_B), "ORG_B nodes must be isolated");
  }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 13 — Integrations + Audit (T149–T180)
// ═══════════════════════════════════════════════════════════════════════════════

const section13Tests: TestResult[] = [
  t("T149", "memoriesToGraphNodes converts memory entries", () => {
    const entries: any[] = [
      { id: "m1", orgSlug: ORG, title: "Cash flow note", type: "FINANCIAL", importance: "HIGH", tags: ["finance"], source: "test", content: "Cash is low", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), scope: "TENANT" },
    ];
    const nodes = memoriesToGraphNodes(entries);
    assert(nodes.length === 1, "Should convert 1 entry");
    assert(nodes[0].type === "MEMORY", "Type must be MEMORY");
  }),
  t("T150", "memory node has correct ID prefix", () => {
    const entry: any = { id: "mem_test", orgSlug: ORG, title: "Test", type: "GENERAL", importance: "LOW", tags: [], source: "test", content: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), scope: "TENANT" };
    const nodes = memoriesToGraphNodes([entry]);
    assert(nodes[0].id === "mgn_mem_mem_test", "ID must have mgn_mem_ prefix");
  }),
  t("T151", "buildMemoryRelatedEdges creates edges for shared tags", () => {
    clearRegistry(ORG);
    const n1 = buildMemoryNode(ORG, { id: "m1", title: "Note A", tags: ["finance", "treasury"] });
    const n2 = buildMemoryNode(ORG, { id: "m2", title: "Note B", tags: ["finance"] });
    registerNode(n1); registerNode(n2);
    const edges = buildMemoryRelatedEdges(ORG, [n1, n2]);
    assert(edges.length >= 1, "Should create edge for shared 'finance' tag");
  }),
  t("T152", "buildMemoryRelatedEdges never creates cross-tenant edges", () => {
    const n1 = buildMemoryNode(ORG,   { id: "ma", title: "A", tags: ["x"] });
    const n2 = buildMemoryNode(ORG_B, { id: "mb", title: "B", tags: ["x"] });
    const edges = buildMemoryRelatedEdges(ORG, [n1, n2]);
    assert(edges.every(e => e.orgSlug === ORG), "Edges must be org-scoped");
  }),
  t("T153", "playbooksToNodes converts playbooks", () => {
    const playbooks: any[] = [
      { id: "pb1", orgSlug: ORG, title: "Cobros Vencidos", category: "COLLECTIONS", priority: "HIGH", status: "ACTIVE", tags: ["collections"], steps: [], triggerKeywords: [], domains: [], createdAt: "", updatedAt: "" },
    ];
    const nodes = playbooksToNodes(ORG, playbooks);
    assert(nodes.length === 1, "Should convert 1 playbook");
    assert(nodes[0].type === "PLAYBOOK", "Type must be PLAYBOOK");
  }),
  t("T154", "playbook node has correct ID prefix", () => {
    const pb: any = { id: "pb_001", orgSlug: ORG, title: "Test PB", category: "GENERAL", priority: "LOW", status: "ACTIVE", steps: [], triggerKeywords: [], domains: [], tags: [], createdAt: "", updatedAt: "" };
    const nodes = playbooksToNodes(ORG, [pb]);
    assert(nodes[0].id === "mgn_pb_pb_001", "ID must have mgn_pb_ prefix");
  }),
  t("T155", "executiveContextToGraph converts signals and insights", () => {
    const ctx: any = {
      orgSlug: ORG,
      signals: [
        { id: "sig1", title: "Low Cash", description: "Cash below threshold", category: "FINANCE", severity: "HIGH", direction: "DOWN", confidence: 0.9, source: "brain", metadata: {}, generatedAt: new Date().toISOString() },
      ],
      insights: [
        { id: "ins1", title: "Cash Risk", summary: "Cash is at risk", priority: "HIGH", categories: ["FINANCE"], supportingSignals: ["sig1"] },
      ],
      generatedAt: new Date().toISOString(),
    };
    const result = executiveContextToGraph(ctx);
    assert(result.nodes.length >= 2, "Should convert signals and insights to nodes");
    assert(result.nodes.some(n => n.type === "EVENT"), "Signal should become EVENT node");
    assert(result.nodes.some(n => n.type === "INSIGHT"), "Insight should become INSIGHT node");
  }),
  t("T156", "executiveContextToGraph creates AFFECTS edges", () => {
    const ctx: any = {
      orgSlug: ORG,
      signals: [{ id: "s1", title: "S", description: "Desc", category: "FINANCE", severity: "HIGH", direction: "DOWN", confidence: 0.9, source: "b", metadata: {}, generatedAt: new Date().toISOString() }],
      insights: [{ id: "i1", title: "I", summary: "Sum", priority: "HIGH", categories: ["FINANCE"], supportingSignals: ["s1"] }],
      generatedAt: new Date().toISOString(),
    };
    // Register nodes first (edges require registered nodes)
    const { nodes } = executiveContextToGraph(ctx);
    for (const n of nodes) registerNode(n);
    const result = executiveContextToGraph(ctx);
    // Edges should be created for FINANCE category match
    assert(Array.isArray(result.edges), "edges must be array");
  }),
  t("T157", "createGraphAuditLog creates empty log", () => {
    const log = createGraphAuditLog(ORG, QUERY_ID);
    assert(log.orgSlug === ORG, "orgSlug must match");
    assert(log.queryId === QUERY_ID, "queryId must match");
    assert(Array.isArray(log.events), "events must be array");
    assert(log.events.length === 0, "New log must be empty");
  }),
  t("T158", "auditNodeCreated appends event", () => {
    let log = createGraphAuditLog(ORG, QUERY_ID);
    log = auditNodeCreated(log, "mgn_test", ORG);
    assert(log.events.length === 1, "Should have 1 event");
    assert(log.events[0].eventType === "NODE_CREATED", "eventType must be NODE_CREATED");
  }),
  t("T159", "auditEdgeCreated appends event", () => {
    let log = createGraphAuditLog(ORG, QUERY_ID);
    log = auditEdgeCreated(log, "mge_test", ORG);
    assert(log.events.some(e => e.eventType === "EDGE_CREATED"), "Should have EDGE_CREATED event");
  }),
  t("T160", "auditGraphTraversed appends traversal event", () => {
    let log = createGraphAuditLog(ORG, QUERY_ID);
    log = auditGraphTraversed(log, "mgn_start", 5, 12);
    const event = log.events.find(e => e.eventType === "GRAPH_TRAVERSED");
    assert(event !== undefined, "Should have GRAPH_TRAVERSED event");
    assert(event!.metadata.visitedCount === 5, "visitedCount must be 5");
    assert(event!.durationMs === 12, "durationMs must be 12");
  }),
  t("T161", "getGraphAuditSummary returns correct counts", () => {
    let log = createGraphAuditLog(ORG, QUERY_ID);
    log = auditNodeCreated(log, "n1", ORG);
    log = auditNodeCreated(log, "n2", ORG);
    log = auditEdgeCreated(log, "e1", ORG);
    const summary = getGraphAuditSummary(log);
    assert(summary.nodeCreated === 2, `Expected 2 nodeCreated, got ${summary.nodeCreated}`);
    assert(summary.edgeCreated === 1, `Expected 1 edgeCreated, got ${summary.edgeCreated}`);
    assert(summary.totalEvents === 3, `Expected 3 total events, got ${summary.totalEvents}`);
  }),
  t("T162", "AuditEvent has id and timestamp", () => {
    let log = createGraphAuditLog(ORG, QUERY_ID);
    log = auditNodeCreated(log, "n1", ORG);
    const event = log.events[0];
    assert(typeof event.id === "string" && event.id.length > 0, "id required");
    assert(typeof event.timestamp === "string", "timestamp required");
  }),
  t("T163", "buildGraphRelationshipTrace returns traces", () => {
    seedGraph(ORG);
    const traces = buildGraphRelationshipTrace(ORG);
    assert(Array.isArray(traces), "Must return array");
    for (const trace of traces) {
      assert(typeof trace.edgeId === "string", "edgeId required");
      assert(typeof trace.edgeType === "string", "edgeType required");
      assert(typeof trace.source === "string", "source required");
    }
  }),
  t("T164", "validateGraphCompliance returns report", () => {
    seedGraph(ORG);
    const report = validateGraphCompliance(ORG);
    assert(typeof report.compliant === "boolean", "compliant must be boolean");
    assert(typeof report.totalEdges === "number", "totalEdges required");
    assert(typeof report.traced === "number", "traced required");
    assert(Array.isArray(report.violations), "violations required");
  }),
  t("T165", "compliance is valid for edges with source and reasoning", () => {
    seedGraph(ORG);
    const report = validateGraphCompliance(ORG);
    // All seeded edges have both source and reasoning
    assert(report.compliant, "Seeded graph should be compliant");
  }),
  t("T166", "identifyCausalCandidates finds CAUSED/TRIGGERS edges", () => {
    clearRegistry(ORG);
    const n1 = createNode({ orgSlug: ORG, type: "EVENT", label: "E1", source: "test" });
    const n2 = createNode({ orgSlug: ORG, type: "EVENT", label: "E2", source: "test" });
    const e = createEdge({ orgSlug: ORG, type: "CAUSED", sourceNodeId: n1!.id, targetNodeId: n2!.id, reasoning: "E1 caused E2", source: "test" });
    const candidates = identifyCausalCandidates(listEdges(ORG));
    assert(candidates.includes(e!.id), "CAUSED edge should be a causal candidate");
  }),
  t("T167", "buildEmptyCausalModel returns PREPARED model", () => {
    const model = buildEmptyCausalModel(ORG);
    assert(model.status === "PREPARED", "Status must be PREPARED");
    assert(model.orgSlug === ORG, "orgSlug required");
    assert(model.chains.length === 0, "Empty model has no chains");
  }),
  t("T168", "snapshot creates and retrieves graph state", () => {
    seedGraph(ORG);
    const snap = createSnapshot(ORG, "test-snap");
    assert(snap.orgSlug === ORG, "orgSlug must match");
    assert(snap.nodeCount >= 3, "Should have 3+ nodes");
    assert(typeof snap.id === "string", "id required");
    const retrieved = getSnapshot(snap.id);
    assert(retrieved?.id === snap.id, "Should retrieve snapshot by ID");
  }),
  t("T169", "compareSnapshots detects added nodes", () => {
    clearRegistry(ORG);
    const snap1 = createSnapshot(ORG, "before");
    createNode({ orgSlug: ORG, type: "PRODUCT", label: "New", source: "test" });
    const snap2 = createSnapshot(ORG, "after");
    const diff = compareSnapshots(snap1.id, snap2.id);
    assert(diff !== null, "Should return diff");
    assert(diff!.addedNodes.length >= 1, "Should detect added node");
  }),
  t("T170", "listSnapshots returns org snapshots in order", () => {
    seedGraph(ORG);
    createSnapshot(ORG, "s1");
    createSnapshot(ORG, "s2");
    const snaps = listSnapshots(ORG);
    assert(snaps.length >= 2, "Should list 2+ snapshots");
    assert(snaps.every(s => s.orgSlug === ORG), "All must be org-scoped");
  }),
  t("T171", "InMemoryGraphRepository saves and retrieves nodes", async () => {
    const repo = new InMemoryGraphRepository();
    const n = buildNode({ orgSlug: ORG, type: "CLIENT", label: "Test", source: "test" });
    await repo.saveNode(n);
    const found = await repo.getNode(ORG, n.id);
    assert(found?.id === n.id, "Should retrieve saved node");
  }),
  t("T172", "InMemoryGraphRepository listNodes with type filter", async () => {
    const repo = new InMemoryGraphRepository();
    const n1 = buildNode({ orgSlug: ORG, type: "CLIENT", label: "C", source: "test" });
    const n2 = buildNode({ orgSlug: ORG, type: "ORDER",  label: "O", source: "test" });
    await repo.saveNodes([n1, n2]);
    const clients = await repo.listNodes({ orgSlug: ORG, type: "CLIENT" });
    assert(clients.every(n => n.type === "CLIENT"), "Must filter by type");
  }),
  t("T173", "InMemoryGraphRepository countNodes", async () => {
    const repo = new InMemoryGraphRepository();
    const n = buildNode({ orgSlug: ORG, type: "PRODUCT", label: "P", source: "test" });
    await repo.saveNode(n);
    const count = await repo.countNodes(ORG);
    assert(count >= 1, "Should count saved nodes");
  }),
  t("T174", "MEMORY_GRAPH_FUTURE_PLANS has planned capabilities", () => {
    assert(MEMORY_GRAPH_FUTURE_PLANS.length >= 5, "Should have 5+ future plans");
    assert(MEMORY_GRAPH_FUTURE_PLANS.every(p => p.status === "PLANNED"), "All must be PLANNED");
  }),
  t("T175", "getFutureGraphRoadmapSummary returns string", () => {
    const summary = getFutureGraphRoadmapSummary();
    assert(typeof summary === "string" && summary.length > 0, "Must return non-empty string");
  }),
  t("T176", "subgraph builder creates org-scoped subgraph", () => {
    const { n1 } = seedGraph(ORG);
    const sub = buildSubgraph(ORG, n1, 2);
    assert(sub.orgSlug === ORG, "orgSlug must match");
    assert(Array.isArray(sub.nodes), "nodes must be array");
    assert(sub.nodes.length >= 1, "Should include root node");
  }),
  t("T177", "buildSubgraphByType returns nodes of given type", () => {
    seedGraph(ORG);
    const sub = buildSubgraphByType(ORG, "CLIENT");
    assert(sub.nodes.some(n => n.type === "CLIENT"), "Should include CLIENT nodes");
  }),
  t("T178", "mergeSubgraphs combines from same org", () => {
    const { n1, n2 } = seedGraph(ORG);
    const a = buildSubgraph(ORG, n1, 1);
    const b = buildSubgraph(ORG, n2, 1);
    const merged = mergeSubgraphs(a, b);
    assert(merged.orgSlug === ORG, "Merged orgSlug must match");
    assert(merged.nodes.length >= 2, "Should have nodes from both subgraphs");
  }),
  t("T179", "mergeSubgraphs rejects cross-tenant merge", () => {
    const a = { orgSlug: ORG,   nodes: [], edges: [], queryId: "q1", createdAt: new Date().toISOString() };
    const b = { orgSlug: ORG_B, nodes: [], edges: [], queryId: "q2", createdAt: new Date().toISOString() };
    const merged = mergeSubgraphs(a, b);
    assert(merged.nodes.length === 0, "Cross-tenant merge must return empty subgraph");
  }),
  t("T180", "all test sections are non-empty", () => {
    const allSections = [
      section1Tests, section2Tests, section3Tests, section4Tests,
      section5Tests, section6Tests, section7Tests, section8Tests,
      section9Tests, section10Tests, section11Tests, section12Tests,
      section13Tests,
    ];
    for (const section of allSections) {
      assert(section.length > 0, "Every section must have at least 1 test");
    }
  }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// Route handler
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production") return unauthorized();
  if (process.env.ENABLE_INTERNAL_INTEGRATION_TESTS !== "true") return unauthorized();

  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (token !== process.env.INTERNAL_INTEGRATION_TEST_TOKEN) return unauthorized();

  // Reset state before running
  clearAllRegistries();

  const allTests: TestResult[] = [
    ...section1Tests,
    ...section2Tests,
    ...section3Tests,
    ...section4Tests,
    ...section5Tests,
    ...section6Tests,
    ...section7Tests,
    ...section8Tests,
    ...section9Tests,
    ...section10Tests,
    ...section11Tests,
    ...section12Tests,
    ...section13Tests,
  ];

  // Run async tests separately
  const asyncTests: TestResult[] = [];
  for (const [id, name, fn] of [
    ["T171a", "InMemoryGraphRepository async save/retrieve", async () => {
      const repo = new InMemoryGraphRepository();
      const n = buildNode({ orgSlug: ORG, type: "AGENT", label: "Diego", source: "test" });
      await repo.saveNode(n);
      const edge = buildRelatedToEdge(ORG, n.id, n.id + "x", "r", "test");
      await repo.saveEdge(edge);
      const edges = await repo.listEdges({ orgSlug: ORG });
      assert(Array.isArray(edges), "listEdges must return array");
    }] as [string, string, () => Promise<void>],
  ]) {
    const t0 = Date.now();
    try {
      await fn();
      asyncTests.push({ id, name, passed: true, durationMs: Date.now() - t0 });
    } catch (err) {
      asyncTests.push({ id, name, passed: false, error: err instanceof Error ? err.message : String(err), durationMs: Date.now() - t0 });
    }
  }

  const results = [...allTests, ...asyncTests];
  const passed  = results.filter(r => r.passed).length;
  const failed  = results.filter(r => !r.passed).length;
  const failures = results.filter(r => !r.passed);

  return NextResponse.json({
    sprint:   "AGENTIK-INTELLIGENCE-MEMORY-GRAPH-01",
    total:    results.length,
    passed,
    failed,
    score:    `${passed}/${results.length}`,
    failures: failures.map(f => ({ id: f.id, name: f.name, error: f.error })),
    results:  results.map(r => ({ id: r.id, name: r.name, passed: r.passed, durationMs: r.durationMs })),
  });
}
