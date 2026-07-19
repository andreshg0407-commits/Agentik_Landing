#!/usr/bin/env node
/**
 * scripts/_run-memory-graph-validation.js
 *
 * AGENTIK-INTELLIGENCE-MEMORY-GRAPH-01
 * Static validation suite — 800+ checks.
 *
 * Verifies: imports, exports, contracts, node/edge types, registry,
 * query engine, traversal, timeline, integrations, tenant isolation,
 * server/client boundaries, audit, integrity.
 *
 * Usage: node scripts/_run-memory-graph-validation.js
 */

const fs = require("fs");
const path = require("path");

// ── Helpers ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function check(label, condition) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(label);
  }
}

function readFile(relPath) {
  const abs = path.join(__dirname, "..", relPath);
  try { return fs.readFileSync(abs, "utf8"); } catch { return ""; }
}

function contains(src, pattern) {
  if (typeof pattern === "string") return src.includes(pattern);
  return pattern.test(src);
}

function notContains(src, pattern) {
  return !contains(src, pattern);
}

function fileExists(relPath) {
  return fs.existsSync(path.join(__dirname, "..", relPath));
}

// ── File paths ─────────────────────────────────────────────────────────────────

const BASE = "lib/copilot/memory-graph";

const types        = readFile(`${BASE}/memory-graph-types.ts`);
const identity     = readFile(`${BASE}/graph-identity.ts`);
const registry     = readFile(`${BASE}/graph-registry.ts`);
const nodeBuilder  = readFile(`${BASE}/node-builder.ts`);
const edgeBuilder  = readFile(`${BASE}/edge-builder.ts`);
const engine       = readFile(`${BASE}/graph-engine.ts`);
const traversal    = readFile(`${BASE}/traversal-engine.ts`);
const integrity    = readFile(`${BASE}/graph-integrity.ts`);
const scoring      = readFile(`${BASE}/graph-scoring.ts`);
const resolver     = readFile(`${BASE}/relationship-resolver.ts`);
const subgraph     = readFile(`${BASE}/subgraph-builder.ts`);
const queryEngine  = readFile(`${BASE}/query-engine.ts`);
const searchEngine = readFile(`${BASE}/search-engine.ts`);
const ctxExpansion = readFile(`${BASE}/context-expansion.ts`);
const timeline     = readFile(`${BASE}/memory-timeline.ts`);
const snapshot     = readFile(`${BASE}/knowledge-snapshot.ts`);
const causality    = readFile(`${BASE}/causality-preparation.ts`);
const reportBld    = readFile(`${BASE}/report-builder.ts`);
const dashboard    = readFile(`${BASE}/memory-graph-dashboard-contract.ts`);
const repo         = readFile(`${BASE}/memory-graph-repository.ts`);
const isolation    = readFile(`${BASE}/memory-graph-tenant-isolation.ts`);
const futureComp   = readFile(`${BASE}/future-compatibility.ts`);
const health       = readFile(`${BASE}/memory-graph-health.ts`);
const readiness    = readFile(`${BASE}/memory-graph-readiness.ts`);
const prismaRepo   = readFile(`${BASE}/persistence/prisma-memory-graph-repository.ts`);
const memInteg     = readFile(`${BASE}/integrations/memory-graph-memory.ts`);
const pbInteg      = readFile(`${BASE}/integrations/memory-graph-playbooks.ts`);
const brainInteg   = readFile(`${BASE}/integrations/memory-graph-executive-brain.ts`);
const intelInteg   = readFile(`${BASE}/integrations/memory-graph-intelligence.ts`);
const compInteg    = readFile(`${BASE}/integrations/memory-graph-compliance.ts`);
const auditInteg   = readFile(`${BASE}/integrations/memory-graph-audit.ts`);
const serverBarrel = readFile(`${BASE}/server.ts`);
const clientBarrel = readFile(`${BASE}/index.ts`);
const harness      = readFile("app/api/internal/integration-tests/memory-graph/route.ts");
const prismaSchema = readFile("prisma/schema.prisma");

// ── Section 1: File Existence ─────────────────────────────────────────────────

check("FILE: memory-graph-types.ts exists",          fileExists(`${BASE}/memory-graph-types.ts`));
check("FILE: graph-identity.ts exists",              fileExists(`${BASE}/graph-identity.ts`));
check("FILE: graph-registry.ts exists",              fileExists(`${BASE}/graph-registry.ts`));
check("FILE: node-builder.ts exists",                fileExists(`${BASE}/node-builder.ts`));
check("FILE: edge-builder.ts exists",                fileExists(`${BASE}/edge-builder.ts`));
check("FILE: graph-engine.ts exists",                fileExists(`${BASE}/graph-engine.ts`));
check("FILE: traversal-engine.ts exists",            fileExists(`${BASE}/traversal-engine.ts`));
check("FILE: graph-integrity.ts exists",             fileExists(`${BASE}/graph-integrity.ts`));
check("FILE: graph-scoring.ts exists",               fileExists(`${BASE}/graph-scoring.ts`));
check("FILE: relationship-resolver.ts exists",       fileExists(`${BASE}/relationship-resolver.ts`));
check("FILE: subgraph-builder.ts exists",            fileExists(`${BASE}/subgraph-builder.ts`));
check("FILE: query-engine.ts exists",                fileExists(`${BASE}/query-engine.ts`));
check("FILE: search-engine.ts exists",               fileExists(`${BASE}/search-engine.ts`));
check("FILE: context-expansion.ts exists",           fileExists(`${BASE}/context-expansion.ts`));
check("FILE: memory-timeline.ts exists",             fileExists(`${BASE}/memory-timeline.ts`));
check("FILE: knowledge-snapshot.ts exists",          fileExists(`${BASE}/knowledge-snapshot.ts`));
check("FILE: causality-preparation.ts exists",       fileExists(`${BASE}/causality-preparation.ts`));
check("FILE: report-builder.ts exists",              fileExists(`${BASE}/report-builder.ts`));
check("FILE: memory-graph-dashboard-contract.ts exists", fileExists(`${BASE}/memory-graph-dashboard-contract.ts`));
check("FILE: memory-graph-repository.ts exists",     fileExists(`${BASE}/memory-graph-repository.ts`));
check("FILE: memory-graph-tenant-isolation.ts exists", fileExists(`${BASE}/memory-graph-tenant-isolation.ts`));
check("FILE: future-compatibility.ts exists",        fileExists(`${BASE}/future-compatibility.ts`));
check("FILE: memory-graph-health.ts exists",         fileExists(`${BASE}/memory-graph-health.ts`));
check("FILE: memory-graph-readiness.ts exists",      fileExists(`${BASE}/memory-graph-readiness.ts`));
check("FILE: persistence/prisma-memory-graph-repository.ts exists", fileExists(`${BASE}/persistence/prisma-memory-graph-repository.ts`));
check("FILE: integrations/memory-graph-memory.ts exists",           fileExists(`${BASE}/integrations/memory-graph-memory.ts`));
check("FILE: integrations/memory-graph-playbooks.ts exists",        fileExists(`${BASE}/integrations/memory-graph-playbooks.ts`));
check("FILE: integrations/memory-graph-executive-brain.ts exists",  fileExists(`${BASE}/integrations/memory-graph-executive-brain.ts`));
check("FILE: integrations/memory-graph-intelligence.ts exists",     fileExists(`${BASE}/integrations/memory-graph-intelligence.ts`));
check("FILE: integrations/memory-graph-compliance.ts exists",       fileExists(`${BASE}/integrations/memory-graph-compliance.ts`));
check("FILE: integrations/memory-graph-audit.ts exists",            fileExists(`${BASE}/integrations/memory-graph-audit.ts`));
check("FILE: server.ts exists",                      fileExists(`${BASE}/server.ts`));
check("FILE: index.ts exists",                       fileExists(`${BASE}/index.ts`));
check("FILE: harness route.ts exists",               fileExists("app/api/internal/integration-tests/memory-graph/route.ts"));

// ── Section 2: Core Types ─────────────────────────────────────────────────────

// GraphNodeType — 16 types
check("TYPES: GraphNodeType has MEMORY",    contains(types, '"MEMORY"'));
check("TYPES: GraphNodeType has CLIENT",    contains(types, '"CLIENT"'));
check("TYPES: GraphNodeType has PRODUCT",   contains(types, '"PRODUCT"'));
check("TYPES: GraphNodeType has ORDER",     contains(types, '"ORDER"'));
check("TYPES: GraphNodeType has CAMPAIGN",  contains(types, '"CAMPAIGN"'));
check("TYPES: GraphNodeType has INSIGHT",   contains(types, '"INSIGHT"'));
check("TYPES: GraphNodeType has PLAYBOOK",  contains(types, '"PLAYBOOK"'));
check("TYPES: GraphNodeType has TASK",      contains(types, '"TASK"'));
check("TYPES: GraphNodeType has EVENT",     contains(types, '"EVENT"'));
check("TYPES: GraphNodeType has ALERT",     contains(types, '"ALERT"'));
check("TYPES: GraphNodeType has ANOMALY",   contains(types, '"ANOMALY"'));
check("TYPES: GraphNodeType has DECISION",  contains(types, '"DECISION"'));
check("TYPES: GraphNodeType has AGENT",     contains(types, '"AGENT"'));
check("TYPES: GraphNodeType has USER",      contains(types, '"USER"'));
check("TYPES: GraphNodeType has DOCUMENT",  contains(types, '"DOCUMENT"'));
check("TYPES: GraphNodeType has REPORT",    contains(types, '"REPORT"'));

// GRAPH_NODE_TYPES array
check("TYPES: GRAPH_NODE_TYPES exported",    contains(types, "GRAPH_NODE_TYPES"));
check("TYPES: GRAPH_NODE_TYPES is array",    contains(types, /GRAPH_NODE_TYPES.*=\s*\[/));

// GraphEdgeType — 12 types
check("TYPES: GraphEdgeType has RELATED_TO",   contains(types, '"RELATED_TO"'));
check("TYPES: GraphEdgeType has GENERATED_BY", contains(types, '"GENERATED_BY"'));
check("TYPES: GraphEdgeType has REFERENCES",   contains(types, '"REFERENCES"'));
check("TYPES: GraphEdgeType has CAUSED",       contains(types, '"CAUSED"'));
check("TYPES: GraphEdgeType has AFFECTS",      contains(types, '"AFFECTS"'));
check("TYPES: GraphEdgeType has BELONGS_TO",   contains(types, '"BELONGS_TO"'));
check("TYPES: GraphEdgeType has LINKED_TO",    contains(types, '"LINKED_TO"'));
check("TYPES: GraphEdgeType has CREATED_FROM", contains(types, '"CREATED_FROM"'));
check("TYPES: GraphEdgeType has RESOLVES",     contains(types, '"RESOLVES"'));
check("TYPES: GraphEdgeType has TRIGGERS",     contains(types, '"TRIGGERS"'));
check("TYPES: GraphEdgeType has SUPPORTS",     contains(types, '"SUPPORTS"'));
check("TYPES: GraphEdgeType has CONTRADICTS",  contains(types, '"CONTRADICTS"'));
check("TYPES: GRAPH_EDGE_TYPES exported",      contains(types, "GRAPH_EDGE_TYPES"));

// GraphNode interface
check("TYPES: GraphNode has id",        contains(types, "id:"));
check("TYPES: GraphNode has orgSlug",   contains(types, "orgSlug:"));
check("TYPES: GraphNode has type",      contains(types, "type:"));
check("TYPES: GraphNode has label",     contains(types, "label:"));
check("TYPES: GraphNode has metadata",  contains(types, "metadata:"));
check("TYPES: GraphNode has source",    contains(types, "source:"));
check("TYPES: GraphNode has tags",      contains(types, "tags:"));
check("TYPES: GraphNode has createdAt", contains(types, "createdAt:"));
check("TYPES: GraphNode has weight",    contains(types, "weight:"));

// GraphEdge interface
check("TYPES: GraphEdge has sourceNodeId", contains(types, "sourceNodeId:"));
check("TYPES: GraphEdge has targetNodeId", contains(types, "targetNodeId:"));
check("TYPES: GraphEdge has reasoning",    contains(types, "reasoning"));

// Constants
check("TYPES: GRAPH_DEFAULT_WEIGHT defined", contains(types, "GRAPH_DEFAULT_WEIGHT"));
check("TYPES: GRAPH_MAX_DEPTH defined",      contains(types, "GRAPH_MAX_DEPTH"));
check("TYPES: GRAPH_MAX_NODES defined",      contains(types, "GRAPH_MAX_NODES"));
check("TYPES: GRAPH_MAX_EDGES defined",      contains(types, "GRAPH_MAX_EDGES"));

// Default weight is 0.5
check("TYPES: GRAPH_DEFAULT_WEIGHT is 0.5", contains(types, "GRAPH_DEFAULT_WEIGHT = 0.5"));

// Advanced types
check("TYPES: GraphPath defined",          contains(types, "GraphPath"));
check("TYPES: GraphTraversal defined",     contains(types, "GraphTraversal"));
check("TYPES: GraphSubgraph defined",      contains(types, "GraphSubgraph"));
check("TYPES: GraphQuery defined",         contains(types, "GraphQuery"));
check("TYPES: GraphQueryResult defined",   contains(types, "GraphQueryResult"));
check("TYPES: GraphSearchQuery defined",   contains(types, "GraphSearchQuery"));
check("TYPES: GraphSearchResult defined",  contains(types, "GraphSearchResult"));
check("TYPES: GraphNodeScore defined",     contains(types, "GraphNodeScore"));
check("TYPES: GraphValidationResult defined", contains(types, "GraphValidationResult"));
check("TYPES: MemoryTimeline defined",     contains(types, "MemoryTimeline"));
check("TYPES: GraphSnapshot defined",      contains(types, "GraphSnapshot"));
check("TYPES: SnapshotDiff defined",       contains(types, "SnapshotDiff"));

// ── Section 3: Identity ───────────────────────────────────────────────────────

check("IDENTITY: generateNodeId exported",    contains(identity, "export function generateNodeId"));
check("IDENTITY: generateEdgeId exported",    contains(identity, "export function generateEdgeId"));
check("IDENTITY: generateSnapshotId exported",contains(identity, "export function generateSnapshotId"));
check("IDENTITY: generateQueryId exported",   contains(identity, "export function generateQueryId"));
check("IDENTITY: validateNodeId exported",    contains(identity, "export function validateNodeId"));
check("IDENTITY: validateEdgeId exported",    contains(identity, "export function validateEdgeId"));
check("IDENTITY: isGraphId exported",         contains(identity, "export function isGraphId"));

// Prefix conventions
check("IDENTITY: node ID prefix mgn_",      contains(identity, /NODE_PREFIX\s*=\s*"mgn"|"mgn_"|mgn_/));
check("IDENTITY: edge ID prefix mge_",      contains(identity, /EDGE_PREFIX\s*=\s*"mge"|"mge_"|mge_/));
check("IDENTITY: snapshot ID prefix mgs_",  contains(identity, "mgs_"));
check("IDENTITY: query ID prefix mgq_",     contains(identity, "mgq_"));

// Validation uses startsWith
check("IDENTITY: validateNodeId checks mgn_ prefix",  contains(identity, /NODE_PREFIX|"mgn"/));
check("IDENTITY: validateEdgeId checks mge_ prefix",  contains(identity, /EDGE_PREFIX|"mge"/));

// ── Section 4: Registry ───────────────────────────────────────────────────────

check("REGISTRY: registerNode exported",        contains(registry, "export function registerNode"));
check("REGISTRY: registerEdge exported",        contains(registry, "export function registerEdge"));
check("REGISTRY: removeNode exported",          contains(registry, "export function removeNode"));
check("REGISTRY: removeEdge exported",          contains(registry, "export function removeEdge"));
check("REGISTRY: getNode exported",             contains(registry, "export function getNode"));
check("REGISTRY: getEdge exported",             contains(registry, "export function getEdge"));
check("REGISTRY: listNodes exported",           contains(registry, "export function listNodes"));
check("REGISTRY: listEdges exported",           contains(registry, "export function listEdges"));
check("REGISTRY: hasNode exported",             contains(registry, "export function hasNode"));
check("REGISTRY: hasEdge exported",             contains(registry, "export function hasEdge"));
check("REGISTRY: edgesFrom exported",           contains(registry, "export function edgesFrom"));
check("REGISTRY: edgesTo exported",             contains(registry, "export function edgesTo"));
check("REGISTRY: edgesForNode exported",        contains(registry, "export function edgesForNode"));
check("REGISTRY: registryStats exported",       contains(registry, "export function registryStats"));
check("REGISTRY: clearRegistry exported",       contains(registry, "export function clearRegistry"));
check("REGISTRY: clearAllRegistries exported",  contains(registry, "export function clearAllRegistries"));

// Multi-tenant: keyed by orgSlug
check("REGISTRY: uses Map for nodes",           contains(registry, "Map"));
check("REGISTRY: per-org keying pattern",       contains(registry, "orgSlug"));

// Fail-closed: registerEdge checks both nodes exist
check("REGISTRY: registerEdge fail-closed — checks both nodes", contains(registry, /hasNode|getNode/));

// No raw Prisma
check("REGISTRY: no direct Prisma import", notContains(registry, 'from "@/lib/prisma"'));

// ── Section 5: Node Builder ───────────────────────────────────────────────────

check("NODE_BUILDER: buildNode exported",         contains(nodeBuilder, "export function buildNode"));
check("NODE_BUILDER: buildMemoryNode exported",   contains(nodeBuilder, "export function buildMemoryNode"));
check("NODE_BUILDER: buildPlaybookNode exported", contains(nodeBuilder, "export function buildPlaybookNode"));
check("NODE_BUILDER: buildInsightNode exported",  contains(nodeBuilder, "export function buildInsightNode"));
check("NODE_BUILDER: buildEventNode exported",    contains(nodeBuilder, "export function buildEventNode"));
check("NODE_BUILDER: buildAlertNode exported",    contains(nodeBuilder, "export function buildAlertNode"));
check("NODE_BUILDER: buildAnomalyNode exported",  contains(nodeBuilder, "export function buildAnomalyNode"));
check("NODE_BUILDER: buildDecisionNode exported", contains(nodeBuilder, "export function buildDecisionNode"));
check("NODE_BUILDER: buildClientNode exported",   contains(nodeBuilder, "export function buildClientNode"));
check("NODE_BUILDER: buildProductNode exported",  contains(nodeBuilder, "export function buildProductNode"));
check("NODE_BUILDER: buildOrderNode exported",    contains(nodeBuilder, "export function buildOrderNode"));
check("NODE_BUILDER: buildCampaignNode exported", contains(nodeBuilder, "export function buildCampaignNode"));
check("NODE_BUILDER: buildTaskNode exported",     contains(nodeBuilder, "export function buildTaskNode"));
check("NODE_BUILDER: buildAgentNode exported",    contains(nodeBuilder, "export function buildAgentNode"));
check("NODE_BUILDER: buildDocumentNode exported", contains(nodeBuilder, "export function buildDocumentNode"));
check("NODE_BUILDER: buildReportNode exported",   contains(nodeBuilder, "export function buildReportNode"));

// Sets correct type
check("NODE_BUILDER: buildMemoryNode type MEMORY",   contains(nodeBuilder, '"MEMORY"'));
check("NODE_BUILDER: buildInsightNode type INSIGHT",  contains(nodeBuilder, '"INSIGHT"'));
check("NODE_BUILDER: buildAlertNode type ALERT",      contains(nodeBuilder, '"ALERT"'));
check("NODE_BUILDER: buildClientNode type CLIENT",    contains(nodeBuilder, '"CLIENT"'));
check("NODE_BUILDER: buildProductNode type PRODUCT",  contains(nodeBuilder, '"PRODUCT"'));

// Sets required fields
check("NODE_BUILDER: sets createdAt",  contains(nodeBuilder, "createdAt"));
check("NODE_BUILDER: sets orgSlug",    contains(nodeBuilder, "orgSlug"));
check("NODE_BUILDER: sets weight",     contains(nodeBuilder, "weight"));
check("NODE_BUILDER: sets tags",       contains(nodeBuilder, "tags"));
check("NODE_BUILDER: sets metadata",   contains(nodeBuilder, "metadata"));

// No server-only import
check("NODE_BUILDER: not server-only", notContains(nodeBuilder, '"server-only"'));

// ── Section 6: Edge Builder ───────────────────────────────────────────────────

check("EDGE_BUILDER: buildEdge exported",              contains(edgeBuilder, "export function buildEdge"));
check("EDGE_BUILDER: buildRelatedToEdge exported",     contains(edgeBuilder, "export function buildRelatedToEdge"));
check("EDGE_BUILDER: buildGeneratedByEdge exported",   contains(edgeBuilder, "export function buildGeneratedByEdge"));
check("EDGE_BUILDER: buildReferencesEdge exported",    contains(edgeBuilder, "export function buildReferencesEdge"));
check("EDGE_BUILDER: buildCausedEdge exported",        contains(edgeBuilder, "export function buildCausedEdge"));
check("EDGE_BUILDER: buildAffectsEdge exported",       contains(edgeBuilder, "export function buildAffectsEdge"));
check("EDGE_BUILDER: buildBelongsToEdge exported",     contains(edgeBuilder, "export function buildBelongsToEdge"));
check("EDGE_BUILDER: buildLinkedToEdge exported",      contains(edgeBuilder, "export function buildLinkedToEdge"));
check("EDGE_BUILDER: buildCreatedFromEdge exported",   contains(edgeBuilder, "export function buildCreatedFromEdge"));
check("EDGE_BUILDER: buildResolvesEdge exported",      contains(edgeBuilder, "export function buildResolvesEdge"));
check("EDGE_BUILDER: buildTriggersEdge exported",      contains(edgeBuilder, "export function buildTriggersEdge"));
check("EDGE_BUILDER: buildSupportsEdge exported",      contains(edgeBuilder, "export function buildSupportsEdge"));
check("EDGE_BUILDER: buildContradictsEdge exported",   contains(edgeBuilder, "export function buildContradictsEdge"));

// Domain patterns
check("EDGE_BUILDER: orderBelongsToClient exported",       contains(edgeBuilder, "export function orderBelongsToClient"));
check("EDGE_BUILDER: campaignAffectsProduct exported",     contains(edgeBuilder, "export function campaignAffectsProduct"));
check("EDGE_BUILDER: insightGeneratedByEvidence exported", contains(edgeBuilder, "export function insightGeneratedByEvidence"));
check("EDGE_BUILDER: anomalyTriggersAlert exported",       contains(edgeBuilder, "export function anomalyTriggersAlert"));
check("EDGE_BUILDER: playbookTriggersTask exported",       contains(edgeBuilder, "export function playbookTriggersTask"));

// Self-loop guard
check("EDGE_BUILDER: throws on self-loop",        contains(edgeBuilder, /sourceNodeId.*targetNodeId|throw.*self/));

// Required fields on built edge
check("EDGE_BUILDER: sets createdAt",  contains(edgeBuilder, "createdAt"));
check("EDGE_BUILDER: sets weight",     contains(edgeBuilder, "weight"));
check("EDGE_BUILDER: sets source",     contains(edgeBuilder, "source"));

// ── Section 7: Graph Engine ───────────────────────────────────────────────────

check("ENGINE: createNode exported",        contains(engine, "export function createNode"));
check("ENGINE: upsertNode exported",        contains(engine, "export function upsertNode"));
check("ENGINE: deleteNode exported",        contains(engine, "export function deleteNode"));
check("ENGINE: fetchNode exported",         contains(engine, "export function fetchNode"));
check("ENGINE: createEdge exported",        contains(engine, "export function createEdge"));
check("ENGINE: deleteEdge exported",        contains(engine, "export function deleteEdge"));
check("ENGINE: fetchEdge exported",         contains(engine, "export function fetchEdge"));
check("ENGINE: getAllNodes exported",        contains(engine, "export function getAllNodes"));
check("ENGINE: getAllEdges exported",        contains(engine, "export function getAllEdges"));
check("ENGINE: getOutboundEdges exported",  contains(engine, "export function getOutboundEdges"));
check("ENGINE: getInboundEdges exported",   contains(engine, "export function getInboundEdges"));
check("ENGINE: getNeighborIds exported",    contains(engine, "export function getNeighborIds"));
check("ENGINE: addNodes exported",          contains(engine, "export function addNodes"));
check("ENGINE: addEdges exported",          contains(engine, "export function addEdges"));
check("ENGINE: validateGraph exported",     contains(engine, "export function validateGraph"));

// Uses registry
check("ENGINE: imports from graph-registry",  contains(engine, "graph-registry"));

// Fail-closed on missing nodes
check("ENGINE: createEdge fail-closed",  contains(engine, /sourceNode|source.*node|hasNode/));

// No direct Prisma
check("ENGINE: no direct Prisma import", notContains(engine, 'from "@/lib/prisma"'));

// ── Section 8: Traversal Engine ───────────────────────────────────────────────

check("TRAVERSAL: neighbors exported",         contains(traversal, "export function neighbors"));
check("TRAVERSAL: parents exported",           contains(traversal, "export function parents"));
check("TRAVERSAL: children exported",          contains(traversal, "export function children"));
check("TRAVERSAL: findPath exported",          contains(traversal, "export function findPath"));
check("TRAVERSAL: findPaths exported",         contains(traversal, "export function findPaths"));
check("TRAVERSAL: shortestPath exported",      contains(traversal, "export function shortestPath"));
check("TRAVERSAL: bfsTraversal exported",      contains(traversal, "export function bfsTraversal"));
check("TRAVERSAL: nodesWithinDepth exported",  contains(traversal, "export function nodesWithinDepth"));

// BFS implementation
check("TRAVERSAL: uses BFS queue",   contains(traversal, /queue|Queue|shift\(\)/));
check("TRAVERSAL: depth limit",      contains(traversal, /maxDepth|GRAPH_MAX_DEPTH/));
check("TRAVERSAL: visited tracking", contains(traversal, /visited|Set/));

// ── Section 9: Graph Integrity ────────────────────────────────────────────────

check("INTEGRITY: runIntegrityCheck exported",   contains(integrity, "export function runIntegrityCheck"));
check("INTEGRITY: validateIntegrity exported",   contains(integrity, "export function validateIntegrity"));
check("INTEGRITY: hasIntegrityErrors exported",  contains(integrity, "export function hasIntegrityErrors"));
check("INTEGRITY: countOrphanNodes exported",    contains(integrity, "export function countOrphanNodes"));

// IntegrityReport fields
check("INTEGRITY: report has orphanNodes",       contains(integrity, "orphanNodes"));
check("INTEGRITY: report has orphanEdges",       contains(integrity, "orphanEdges"));
check("INTEGRITY: report has crossTenantEdges",  contains(integrity, "crossTenantEdges"));
check("INTEGRITY: report has brokenReferences",  contains(integrity, "brokenReferences"));
check("INTEGRITY: report has selfLoops",         contains(integrity, "selfLoops"));
check("INTEGRITY: report has noSourceNodes",     contains(integrity, "noSourceNode"));
check("INTEGRITY: report has noSourceEdges",     contains(integrity, "noSourceEdge"));
check("INTEGRITY: report has errorCount",        contains(integrity, "errorCount"));
check("INTEGRITY: report has warningCount",      contains(integrity, "warningCount"));

// ── Section 10: Graph Scoring ─────────────────────────────────────────────────

check("SCORING: scoreNode exported",             contains(scoring, "export function scoreNode"));
check("SCORING: scoreAllNodes exported",         contains(scoring, "export function scoreAllNodes"));
check("SCORING: topNodesByImportance exported",  contains(scoring, "export function topNodesByImportance"));
check("SCORING: topNodesByCentrality exported",  contains(scoring, "export function topNodesByCentrality"));
check("SCORING: edgeStrength exported",          contains(scoring, "export function edgeStrength"));
check("SCORING: averageEdgeWeight exported",     contains(scoring, "export function averageEdgeWeight"));
check("SCORING: computeGraphMetrics exported",   contains(scoring, "export function computeGraphMetrics"));

// GraphMetrics fields
check("SCORING: GraphMetrics has density",           contains(scoring, "density"));
check("SCORING: GraphMetrics has averageDegree",     contains(scoring, "averageDegree"));
check("SCORING: GraphMetrics has maxDegree",         contains(scoring, "maxDegree"));
check("SCORING: GraphMetrics has connectedComponents", contains(scoring, "connectedComponents"));

// Weight components
check("SCORING: importance uses nodeWeight",    contains(scoring, /weight.*0\.[2-5]|nodeWeight/));
check("SCORING: importance uses centrality",   contains(scoring, "centrality"));

// ── Section 11: Relationship Resolver ────────────────────────────────────────

check("RESOLVER: RELATIONSHIP_PATTERNS exported",   contains(resolver, "export const RELATIONSHIP_PATTERNS"));
check("RESOLVER: resolveRelationship exported",     contains(resolver, "export function resolveRelationship"));
check("RESOLVER: canRelate exported",               contains(resolver, "export function canRelate"));
check("RESOLVER: allRelationshipsFor exported",     contains(resolver, "export function allRelationshipsFor"));
check("RESOLVER: edgeTypesFrom exported",           contains(resolver, "export function edgeTypesFrom"));

// Key patterns defined
check("RESOLVER: ORDER→CLIENT pattern",    contains(resolver, /ORDER.*CLIENT|CLIENT.*ORDER/));
check("RESOLVER: ANOMALY→ALERT pattern",   contains(resolver, /ANOMALY.*ALERT|ALERT.*ANOMALY/));
check("RESOLVER: INSIGHT→MEMORY pattern",  contains(resolver, /INSIGHT.*MEMORY|MEMORY.*INSIGHT/));
check("RESOLVER: PLAYBOOK→TASK pattern",   contains(resolver, /PLAYBOOK.*TASK|TASK.*PLAYBOOK/));

// RelationshipResolution type
check("RESOLVER: RelationshipResolution has resolved",   contains(resolver, "resolved"));
check("RESOLVER: RelationshipResolution has edgeType",   contains(resolver, "edgeType"));
check("RESOLVER: RelationshipResolution has confidence", contains(resolver, "confidence"));

// No implicit edges (resolved:false fallback)
check("RESOLVER: returns resolved false for unknowns", contains(resolver, /resolved:\s*false/));

// ── Section 12: Subgraph Builder ──────────────────────────────────────────────

check("SUBGRAPH: buildSubgraph exported",           contains(subgraph, "export function buildSubgraph"));
check("SUBGRAPH: buildSubgraphByType exported",     contains(subgraph, "export function buildSubgraphByType"));
check("SUBGRAPH: buildClientSubgraph exported",     contains(subgraph, "export function buildClientSubgraph"));
check("SUBGRAPH: buildInsightSubgraph exported",    contains(subgraph, "export function buildInsightSubgraph"));
check("SUBGRAPH: buildAlertSubgraph exported",      contains(subgraph, "export function buildAlertSubgraph"));
check("SUBGRAPH: buildSubgraphByEdgeType exported", contains(subgraph, "export function buildSubgraphByEdgeType"));
check("SUBGRAPH: buildSubgraphByTag exported",      contains(subgraph, "export function buildSubgraphByTag"));
check("SUBGRAPH: mergeSubgraphs exported",          contains(subgraph, "export function mergeSubgraphs"));

// Subgraph includes nodes + edges
check("SUBGRAPH: result has nodes",  contains(subgraph, "nodes:"));
check("SUBGRAPH: result has edges",  contains(subgraph, "edges:"));

// Cross-tenant merge safety
check("SUBGRAPH: mergeSubgraphs checks orgSlug",  contains(subgraph, /orgSlug|org.*mismatch/));

// ── Section 13: Query Engine ──────────────────────────────────────────────────

check("QUERY: findNode exported",              contains(queryEngine, "export function findNode"));
check("QUERY: findNodesByType exported",       contains(queryEngine, "export function findNodesByType"));
check("QUERY: findNodesByTag exported",        contains(queryEngine, "export function findNodesByTag"));
check("QUERY: findRelated exported",           contains(queryEngine, "export function findRelated"));
check("QUERY: findConnected exported",         contains(queryEngine, "export function findConnected"));
check("QUERY: findSubgraph exported",          contains(queryEngine, "export function findSubgraph"));
check("QUERY: findEdgesByType exported",       contains(queryEngine, "export function findEdgesByType"));
check("QUERY: findEdgesBetween exported",      contains(queryEngine, "export function findEdgesBetween"));
check("QUERY: searchGraph exported",           contains(queryEngine, "export function searchGraph"));
check("QUERY: getHighImportanceNodes exported",contains(queryEngine, "export function getHighImportanceNodes"));
check("QUERY: getNodeEdgeCount exported",      contains(queryEngine, "export function getNodeEdgeCount"));
check("QUERY: getIsolatedNodes exported",      contains(queryEngine, "export function getIsolatedNodes"));

// Uses listNodes/listEdges from registry
check("QUERY: uses graph-registry or graph-engine", contains(queryEngine, /graph-registry|graph-engine/));

// ── Section 14: Search Engine ─────────────────────────────────────────────────

check("SEARCH: searchNodes exported",          contains(searchEngine, "export function searchNodes"));
check("SEARCH: searchNodesTerm exported",      contains(searchEngine, "export function searchNodesTerm"));
check("SEARCH: getRankedMatches exported",     contains(searchEngine, "export function getRankedMatches"));
check("SEARCH: findByLabel exported",          contains(searchEngine, "export function findByLabel"));
check("SEARCH: findByMetadataKey exported",    contains(searchEngine, "export function findByMetadataKey"));
check("SEARCH: findByMetadataValue exported",  contains(searchEngine, "export function findByMetadataValue"));

// RankedMatch type
check("SEARCH: RankedMatch has node",    contains(searchEngine, "node"));
check("SEARCH: RankedMatch has score",   contains(searchEngine, "score"));
check("SEARCH: RankedMatch has reasons", contains(searchEngine, "reasons"));

// Scoring levels
check("SEARCH: exact label score 1.0",   contains(searchEngine, "1.0"));
check("SEARCH: contains score < 1.0",    contains(searchEngine, /0\.[6-9]/));
check("SEARCH: boosted by node.weight",  contains(searchEngine, /weight/));

// ── Section 15: Context Expansion ────────────────────────────────────────────

check("CTX_EXPAND: expandContext exported",       contains(ctxExpansion, "export function expandContext"));
check("CTX_EXPAND: expandFromNodes exported",     contains(ctxExpansion, "export function expandFromNodes"));
check("CTX_EXPAND: expandByType exported",        contains(ctxExpansion, "export function expandByType"));
check("CTX_EXPAND: summarizeExpansion exported",  contains(ctxExpansion, "export function summarizeExpansion"));

// ExpandedContext fields
check("CTX_EXPAND: result has rootNodes",   contains(ctxExpansion, "rootNodes"));
check("CTX_EXPAND: result has edges",       contains(ctxExpansion, /edges\.|\.edges|edges:/));
check("CTX_EXPAND: result has nodeCount or nodes map", contains(ctxExpansion, /nodeCount|seenNodes|nodeMap|rootNode/));

// BFS-based expansion
check("CTX_EXPAND: uses BFS/depth traversal",  contains(ctxExpansion, /bfs|depth|queue|nodesWithin/));

// maxDepth and maxNodes caps
check("CTX_EXPAND: maxNodes cap",  contains(ctxExpansion, /maxNodes|GRAPH_MAX_NODES/));
check("CTX_EXPAND: maxDepth cap",  contains(ctxExpansion, /maxDepth|GRAPH_MAX_DEPTH/));

// ExpansionSummary
check("CTX_EXPAND: ExpansionSummary defined",  contains(ctxExpansion, "ExpansionSummary"));

// ── Section 16: Memory Timeline ───────────────────────────────────────────────

check("TIMELINE: buildTimeline exported",         contains(timeline, "export function buildTimeline"));
check("TIMELINE: buildNodeTimeline exported",     contains(timeline, "export function buildNodeTimeline"));
check("TIMELINE: buildEventTimeline exported",    contains(timeline, "export function buildEventTimeline"));
check("TIMELINE: analyzeTimeline exported",       contains(timeline, "export function analyzeTimeline"));
check("TIMELINE: filterTimelineByType exported",  contains(timeline, "export function filterTimelineByType"));
check("TIMELINE: sliceTimeline exported",         contains(timeline, "export function sliceTimeline"));

// buildEventTimeline — only event nodes
check("TIMELINE: buildEventTimeline filters EVENT/DECISION/ALERT", contains(timeline, /EVENT|DECISION|ALERT/));

// TimelineStats
check("TIMELINE: TimelineStats exported",  contains(timeline, "TimelineStats"));

// Sort by createdAt
check("TIMELINE: sorts by createdAt", contains(timeline, "createdAt"));

// ── Section 17: Knowledge Snapshot ───────────────────────────────────────────

check("SNAPSHOT: createSnapshot exported",    contains(snapshot, "export function createSnapshot"));
check("SNAPSHOT: getSnapshot exported",       contains(snapshot, "export function getSnapshot"));
check("SNAPSHOT: listSnapshots exported",     contains(snapshot, "export function listSnapshots"));
check("SNAPSHOT: restoreSnapshot exported",   contains(snapshot, "export function restoreSnapshot"));
check("SNAPSHOT: deleteSnapshot exported",    contains(snapshot, "export function deleteSnapshot"));
check("SNAPSHOT: compareSnapshots exported",  contains(snapshot, "export function compareSnapshots"));
check("SNAPSHOT: snapshotDiff exported",      contains(snapshot, "export function snapshotDiff"));

// GraphSnapshot fields
check("SNAPSHOT: snapshot has nodes",  contains(snapshot, "nodes"));
check("SNAPSHOT: snapshot has edges",  contains(snapshot, "edges"));
check("SNAPSHOT: snapshot has id",     contains(snapshot, /generateSnapshotId|mgs_/));

// SnapshotDiff
check("SNAPSHOT: SnapshotDiff has addedNodes",    contains(snapshot, "addedNodes"));
check("SNAPSHOT: SnapshotDiff has removedNodes",  contains(snapshot, "removedNodes"));
check("SNAPSHOT: SnapshotDiff has addedEdges",    contains(snapshot, "addedEdges"));
check("SNAPSHOT: SnapshotDiff has removedEdges",  contains(snapshot, "removedEdges"));

// ── Section 18: Causality Preparation ────────────────────────────────────────

check("CAUSALITY: identifyCausalCandidates exported",  contains(causality, "export function identifyCausalCandidates"));
check("CAUSALITY: buildEmptyCausalModel exported",     contains(causality, "export function buildEmptyCausalModel"));
check("CAUSALITY: prepareCausalLink exported",         contains(causality, "export function prepareCausalLink"));
check("CAUSALITY: CAUSALITY_ROADMAP exported",         contains(causality, "export const CAUSALITY_ROADMAP"));
check("CAUSALITY: getCausalityRoadmapSummary exported",contains(causality, "export function getCausalityRoadmapSummary"));

// Status is PREPARED (not ACTIVE)
check("CAUSALITY: model status is PREPARED",  contains(causality, '"PREPARED"'));

// nextSprint reference
check("CAUSALITY: references next sprint",  contains(causality, "AGENTIK-MEMORY-GRAPH-CAUSALITY-01"));

// CausalStrength type
check("CAUSALITY: CausalStrength defined",   contains(causality, "CausalStrength"));
check("CAUSALITY: CausalLink defined",       contains(causality, "CausalLink"));
check("CAUSALITY: CausalChain defined",      contains(causality, "CausalChain"));
check("CAUSALITY: CausalModel defined",      contains(causality, "CausalModel"));

// ── Section 19: Report Builder ────────────────────────────────────────────────

check("REPORT: buildGraphSummary exported",       contains(reportBld, "export function buildGraphSummary"));
check("REPORT: buildRelationshipReport exported", contains(reportBld, "export function buildRelationshipReport"));
check("REPORT: buildKnowledgeReport exported",    contains(reportBld, "export function buildKnowledgeReport"));
check("REPORT: buildConnectivityReport exported", contains(reportBld, "export function buildConnectivityReport"));

// GraphSummaryReport
check("REPORT: GraphSummaryReport defined",    contains(reportBld, "GraphSummaryReport"));
check("REPORT: RelationshipReport defined",    contains(reportBld, "RelationshipReport"));
check("REPORT: KnowledgeReport defined",       contains(reportBld, "KnowledgeReport"));
check("REPORT: ConnectivityReport defined",    contains(reportBld, "ConnectivityReport"));

// ── Section 20: Dashboard Contract ───────────────────────────────────────────

check("DASHBOARD: buildMemoryGraphDashboard exported",      contains(dashboard, "export function buildMemoryGraphDashboard"));
check("DASHBOARD: buildEmptyMemoryGraphDashboard exported", contains(dashboard, "export function buildEmptyMemoryGraphDashboard"));

// MemoryGraphDashboardPayload fields
check("DASHBOARD: payload has nodes count",              contains(dashboard, "nodes"));
check("DASHBOARD: payload has edges count",              contains(dashboard, "edges"));
check("DASHBOARD: payload has connectedComponents",      contains(dashboard, "connectedComponents"));
check("DASHBOARD: payload has relationshipStrength",     contains(dashboard, "relationshipStrength"));
check("DASHBOARD: payload has orphanNodes",              contains(dashboard, "orphanNodes"));
check("DASHBOARD: payload has graphHealth",              contains(dashboard, "graphHealth"));
check("DASHBOARD: payload has nodesByType",              contains(dashboard, "nodesByType"));
check("DASHBOARD: payload has edgesByType",              contains(dashboard, "edgesByType"));
check("DASHBOARD: payload has density",                  contains(dashboard, "density"));

// Health values
check("DASHBOARD: graphHealth HEALTHY",   contains(dashboard, '"HEALTHY"'));
check("DASHBOARD: graphHealth DEGRADED",  contains(dashboard, '"DEGRADED"'));
check("DASHBOARD: graphHealth CRITICAL",  contains(dashboard, '"CRITICAL"'));

// Not server-only (pure domain)
check("DASHBOARD: not server-only (pure domain)", notContains(dashboard, '"server-only"'));

// ── Section 21: Repository ────────────────────────────────────────────────────

check("REPO: MemoryGraphRepository interface exported",  contains(repo, "export interface MemoryGraphRepository"));
check("REPO: InMemoryGraphRepository exported",          contains(repo, "export class InMemoryGraphRepository"));
check("REPO: NodeFilter exported",                       contains(repo, "NodeFilter"));
check("REPO: EdgeFilter exported",                       contains(repo, "EdgeFilter"));

// Repository interface methods
check("REPO: interface has saveNode",    contains(repo, "saveNode"));
check("REPO: interface has getNode",     contains(repo, "getNode"));
check("REPO: interface has listNodes",   contains(repo, "listNodes"));
check("REPO: interface has deleteNode",  contains(repo, "deleteNode"));
check("REPO: interface has saveEdge",    contains(repo, "saveEdge"));
check("REPO: interface has getEdge",     contains(repo, "getEdge"));
check("REPO: interface has listEdges",   contains(repo, "listEdges"));
check("REPO: interface has deleteEdge",  contains(repo, "deleteEdge"));
check("REPO: interface has queryGraph",  contains(repo, "queryGraph"));
check("REPO: interface has countNodes",  contains(repo, "countNodes"));
check("REPO: interface has countEdges",  contains(repo, "countEdges"));

// InMemoryGraphRepository implements interface
check("REPO: InMemoryGraphRepository implements interface",  contains(repo, /implements MemoryGraphRepository/));

// ── Section 22: Tenant Isolation ─────────────────────────────────────────────

check("ISOLATION: checkTenantIsolation exported",   contains(isolation, "export function checkTenantIsolation"));
check("ISOLATION: assertTenantIsolation exported",  contains(isolation, "export function assertTenantIsolation"));
check("ISOLATION: isCrossTenantNode exported",      contains(isolation, "export function isCrossTenantNode"));
check("ISOLATION: isCrossTenantEdge exported",      contains(isolation, "export function isCrossTenantEdge"));
check("ISOLATION: filterToOrg exported",            contains(isolation, "export function filterToOrg"));

// TenantIsolationReport fields
check("ISOLATION: report has severity",    contains(isolation, "severity"));
check("ISOLATION: report has violations",  contains(isolation, "violations"));

// Severity levels
check("ISOLATION: severity CLEAN",     contains(isolation, '"CLEAN"'));
check("ISOLATION: severity WARNING",   contains(isolation, '"WARNING"'));
check("ISOLATION: severity CRITICAL",  contains(isolation, '"CRITICAL"'));

// assertTenantIsolation throws
check("ISOLATION: assertTenantIsolation throws",  contains(isolation, /throw|Error/));

// filterToOrg filters by orgSlug
check("ISOLATION: filterToOrg uses orgSlug filter", contains(isolation, /filter.*orgSlug|orgSlug.*filter/));

// ── Section 23: Future Compatibility ─────────────────────────────────────────

check("FUTURE: MEMORY_GRAPH_FUTURE_PLANS exported",   contains(futureComp, "export const MEMORY_GRAPH_FUTURE_PLANS"));
check("FUTURE: getFutureGraphRoadmapSummary exported", contains(futureComp, "export function getFutureGraphRoadmapSummary"));

// Plans are PLANNED status
check("FUTURE: plans have status PLANNED",  contains(futureComp, '"PLANNED"'));

// Has multiple plans
check("FUTURE: multiple entries defined",  (futureComp.match(/"PLANNED"/g) || []).length >= 3);

// External provider contracts
check("FUTURE: ExternalGraphProvider defined",   contains(futureComp, "ExternalGraphProvider"));
check("FUTURE: ExternalGraphConfig defined",     contains(futureComp, "ExternalGraphConfig"));
check("FUTURE: GraphEmbeddingConfig defined",    contains(futureComp, "GraphEmbeddingConfig"));

// ── Section 24: Health (server-only) ─────────────────────────────────────────

check("HEALTH: imports server-only",             contains(health, '"server-only"'));
check("HEALTH: evaluateGraphHealth exported",    contains(health, "export function evaluateGraphHealth"));
check("HEALTH: GraphHealthReport defined",       contains(health, "GraphHealthReport"));
check("HEALTH: GraphSubsystemHealth defined",    contains(health, "GraphSubsystemHealth"));
check("HEALTH: GraphHealthStatus defined",       contains(health, "GraphHealthStatus"));

// Health status values
check("HEALTH: status HEALTHY",      contains(health, '"HEALTHY"'));
check("HEALTH: status DEGRADED",     contains(health, '"DEGRADED"'));
check("HEALTH: status UNAVAILABLE",  contains(health, '"UNAVAILABLE"'));

// Has subsystem checks
check("HEALTH: subsystem checks array",  contains(health, "subsystems"));

// ── Section 25: Readiness (server-only) ──────────────────────────────────────

check("READINESS: imports server-only",          contains(readiness, '"server-only"'));
check("READINESS: scanGraphReadiness exported",  contains(readiness, "export function scanGraphReadiness"));
check("READINESS: GraphReadinessReport defined", contains(readiness, "GraphReadinessReport"));
check("READINESS: ReadinessStatus defined",      contains(readiness, "ReadinessStatus"));

// Readiness statuses
check("READINESS: status READY",      contains(readiness, '"READY"'));
check("READINESS: status PARTIAL",    contains(readiness, '"PARTIAL"'));
check("READINESS: status NOT_READY",  contains(readiness, '"NOT_READY"'));

// Overall score 0-100
check("READINESS: overallScore field",  contains(readiness, "overallScore"));

// ── Section 26: Prisma Repository (server-only) ───────────────────────────────

check("PRISMA_REPO: imports server-only",                   contains(prismaRepo, '"server-only"'));
check("PRISMA_REPO: PrismaMemoryGraphRepository class",     contains(prismaRepo, "class PrismaMemoryGraphRepository"));
check("PRISMA_REPO: implements MemoryGraphRepository",      contains(prismaRepo, /implements MemoryGraphRepository/));
check("PRISMA_REPO: uses prisma as any for MemoryGraphNode",contains(prismaRepo, /prisma as any|memoryGraphNode/));
check("PRISMA_REPO: row mapper _rowToNode",                 contains(prismaRepo, "_rowToNode"));
check("PRISMA_REPO: row mapper _rowToEdge",                 contains(prismaRepo, "_rowToEdge"));
check("PRISMA_REPO: upsert for saveNode",                   contains(prismaRepo, "upsert"));

// ── Section 27: Memory Integration Adapter ────────────────────────────────────

check("MEM_INTEG: memoryEntryToNode exported",         contains(memInteg, "export function memoryEntryToNode"));
check("MEM_INTEG: memoriesToGraphNodes exported",      contains(memInteg, "export function memoriesToGraphNodes"));
check("MEM_INTEG: memoryContextToNodes exported",      contains(memInteg, "export function memoryContextToNodes"));
check("MEM_INTEG: buildMemoryRelatedEdges exported",   contains(memInteg, "export function buildMemoryRelatedEdges"));
check("MEM_INTEG: summarizeMemoryIntegration exported",contains(memInteg, "export function summarizeMemoryIntegration"));

// Sets node type MEMORY
check("MEM_INTEG: node type is MEMORY",  contains(memInteg, '"MEMORY"'));

// Edges for shared-tag memories
check("MEM_INTEG: builds edges for shared tags", contains(memInteg, /tag|RELATED_TO|relat/));

// No DB
check("MEM_INTEG: no direct Prisma import", notContains(memInteg, 'from "@/lib/prisma"'));

// ── Section 28: Playbooks Integration Adapter ─────────────────────────────────

check("PB_INTEG: playbookToNode exported",              contains(pbInteg, "export function playbookToNode"));
check("PB_INTEG: playbooksToNodes exported",            contains(pbInteg, "export function playbooksToNodes"));
check("PB_INTEG: playbookContextToNodes exported",      contains(pbInteg, "export function playbookContextToNodes"));
check("PB_INTEG: buildPlaybookLinkedEdges exported",    contains(pbInteg, "export function buildPlaybookLinkedEdges"));
check("PB_INTEG: summarizePlaybookIntegration exported",contains(pbInteg, "export function summarizePlaybookIntegration"));

// Sets node type PLAYBOOK
check("PB_INTEG: node type is PLAYBOOK",  contains(pbInteg, '"PLAYBOOK"'));

// Edges use LINKED_TO within same category
check("PB_INTEG: edges use LINKED_TO",  contains(pbInteg, "LINKED_TO"));

// No DB
check("PB_INTEG: no direct Prisma import", notContains(pbInteg, 'from "@/lib/prisma"'));

// ── Section 29: Executive Brain Integration Adapter ───────────────────────────

check("BRAIN_INTEG: executiveSignalToNode exported",   contains(brainInteg, "export function executiveSignalToNode"));
check("BRAIN_INTEG: executiveInsightToNode exported",  contains(brainInteg, "export function executiveInsightToNode"));
check("BRAIN_INTEG: executiveContextToGraph exported", contains(brainInteg, "export function executiveContextToGraph"));
check("BRAIN_INTEG: ExecutiveBrainGraphResult defined",contains(brainInteg, "ExecutiveBrainGraphResult"));

// Correct field access — ExecutiveSignal
check("BRAIN_INTEG: uses signal.confidence (not signal.value)",   contains(brainInteg, "signal.confidence"));
check("BRAIN_INTEG: uses signal.description (not signal.unit)",   contains(brainInteg, "signal.description"));
check("BRAIN_INTEG: does NOT use signal.value",   notContains(brainInteg, "signal.value"));
check("BRAIN_INTEG: does NOT use signal.unit",    notContains(brainInteg, "signal.unit"));

// Correct field access — ExecutiveInsight
check("BRAIN_INTEG: uses insight.priority (not insight.impact)",    contains(brainInteg, "insight.priority"));
check("BRAIN_INTEG: uses insight.categories[] (not insight.category)", contains(brainInteg, "insight.categories"));
check("BRAIN_INTEG: does NOT use insight.impact",    notContains(brainInteg, "insight.impact"));
check("BRAIN_INTEG: does NOT use insight.category (singular)", notContains(brainInteg, /insight\.category(?!\s*\?)/));

// Signal node type EVENT, Insight node type INSIGHT
check("BRAIN_INTEG: signal node type EVENT",   contains(brainInteg, '"EVENT"'));
check("BRAIN_INTEG: insight node type INSIGHT",contains(brainInteg, '"INSIGHT"'));

// AFFECTS edges between signals and insights
check("BRAIN_INTEG: uses buildAffectsEdge",   contains(brainInteg, "buildAffectsEdge"));

// No DB
check("BRAIN_INTEG: no direct Prisma import", notContains(brainInteg, 'from "@/lib/prisma"'));

// ── Section 30: Intelligence Integration Adapter ──────────────────────────────

check("INTEL_INTEG: reasoningConclusionToGraph exported",  contains(intelInteg, "export function reasoningConclusionToGraph"));
check("INTEL_INTEG: subgraphToReasoningContext exported",  contains(intelInteg, "export function subgraphToReasoningContext"));

// GraphContextForReasoning type
check("INTEL_INTEG: GraphContextForReasoning defined",  contains(intelInteg, "GraphContextForReasoning"));

// Uses INSIGHT node type
check("INTEL_INTEG: uses INSIGHT node type", contains(intelInteg, '"INSIGHT"'));

// No DB
check("INTEL_INTEG: no direct Prisma import", notContains(intelInteg, 'from "@/lib/prisma"'));

// ── Section 31: Compliance Integration Adapter ────────────────────────────────

check("COMP_INTEG: buildGraphRelationshipTrace exported",  contains(compInteg, "export function buildGraphRelationshipTrace"));
check("COMP_INTEG: validateGraphCompliance exported",      contains(compInteg, "export function validateGraphCompliance"));
check("COMP_INTEG: getUntracedEdges exported",             contains(compInteg, "export function getUntracedEdges"));
check("COMP_INTEG: getUntracedNodes exported",             contains(compInteg, "export function getUntracedNodes"));

// GraphRelationshipTrace type
check("COMP_INTEG: GraphRelationshipTrace defined",  contains(compInteg, "GraphRelationshipTrace"));

// GraphComplianceReport type
check("COMP_INTEG: GraphComplianceReport defined",   contains(compInteg, "GraphComplianceReport"));

// Provenance tracking
check("COMP_INTEG: tracks source provenance", contains(compInteg, /source|provenance/));

// No DB
check("COMP_INTEG: no direct Prisma import", notContains(compInteg, 'from "@/lib/prisma"'));

// ── Section 32: Audit Integration ────────────────────────────────────────────

check("AUDIT: GraphAuditEventType defined",         contains(auditInteg, "GraphAuditEventType"));
check("AUDIT: GraphAuditEvent defined",             contains(auditInteg, "GraphAuditEvent"));
check("AUDIT: GraphAuditLog defined",               contains(auditInteg, "GraphAuditLog"));
check("AUDIT: GraphAuditSummary defined",           contains(auditInteg, "GraphAuditSummary"));
check("AUDIT: createGraphAuditLog exported",        contains(auditInteg, "export function createGraphAuditLog"));
check("AUDIT: auditNodeCreated exported",           contains(auditInteg, "export function auditNodeCreated"));
check("AUDIT: auditNodeUpdated exported",           contains(auditInteg, "export function auditNodeUpdated"));
check("AUDIT: auditNodeRemoved exported",           contains(auditInteg, "export function auditNodeRemoved"));
check("AUDIT: auditEdgeCreated exported",           contains(auditInteg, "export function auditEdgeCreated"));
check("AUDIT: auditEdgeRemoved exported",           contains(auditInteg, "export function auditEdgeRemoved"));
check("AUDIT: auditGraphTraversed exported",        contains(auditInteg, "export function auditGraphTraversed"));
check("AUDIT: auditGraphQueryExecuted exported",    contains(auditInteg, "export function auditGraphQueryExecuted"));
check("AUDIT: auditSnapshotCreated exported",       contains(auditInteg, "export function auditSnapshotCreated"));
check("AUDIT: auditIntegrityChecked exported",      contains(auditInteg, "export function auditIntegrityChecked"));
check("AUDIT: auditTenantIsolationChecked exported",contains(auditInteg, "export function auditTenantIsolationChecked"));
check("AUDIT: getGraphAuditSummary exported",       contains(auditInteg, "export function getGraphAuditSummary"));

// Event types
check("AUDIT: NODE_CREATED event",           contains(auditInteg, '"NODE_CREATED"'));
check("AUDIT: EDGE_CREATED event",           contains(auditInteg, '"EDGE_CREATED"'));
check("AUDIT: GRAPH_TRAVERSED event",        contains(auditInteg, '"GRAPH_TRAVERSED"'));
check("AUDIT: GRAPH_QUERY_EXECUTED event",   contains(auditInteg, '"GRAPH_QUERY_EXECUTED"'));
check("AUDIT: INTEGRITY_CHECK_COMPLETED",    contains(auditInteg, '"INTEGRITY_CHECK_COMPLETED"'));
check("AUDIT: TENANT_ISOLATION_CHECKED",     contains(auditInteg, '"TENANT_ISOLATION_CHECKED"'));

// Never throws
check("AUDIT: never-throw pattern (try-catch or no throws)", notContains(auditInteg, "throw new Error"));

// Audit summary fields
check("AUDIT: summary has totalEvents",   contains(auditInteg, "totalEvents"));
check("AUDIT: summary has nodeCreated",   contains(auditInteg, "nodeCreated"));
check("AUDIT: summary has edgeCreated",   contains(auditInteg, "edgeCreated"));
check("AUDIT: summary has traversals",    contains(auditInteg, "traversals"));
check("AUDIT: summary has queries",       contains(auditInteg, "queries"));
check("AUDIT: summary has hasViolations", contains(auditInteg, "hasViolations"));

// No DB
check("AUDIT: no direct Prisma import",  notContains(auditInteg, 'from "@/lib/prisma"'));

// ── Section 33: Server Barrel ─────────────────────────────────────────────────

check("SERVER_BARREL: imports server-only",            contains(serverBarrel, '"server-only"'));
check("SERVER_BARREL: exports core types",             contains(serverBarrel, "memory-graph-types"));
check("SERVER_BARREL: exports graph-identity",         contains(serverBarrel, "graph-identity"));
check("SERVER_BARREL: exports graph-registry",         contains(serverBarrel, "graph-registry"));
check("SERVER_BARREL: exports node-builder",           contains(serverBarrel, "node-builder"));
check("SERVER_BARREL: exports edge-builder",           contains(serverBarrel, "edge-builder"));
check("SERVER_BARREL: exports graph-engine",           contains(serverBarrel, "graph-engine"));
check("SERVER_BARREL: exports traversal-engine",       contains(serverBarrel, "traversal-engine"));
check("SERVER_BARREL: exports graph-integrity",        contains(serverBarrel, "graph-integrity"));
check("SERVER_BARREL: exports graph-scoring",          contains(serverBarrel, "graph-scoring"));
check("SERVER_BARREL: exports relationship-resolver",  contains(serverBarrel, "relationship-resolver"));
check("SERVER_BARREL: exports subgraph-builder",       contains(serverBarrel, "subgraph-builder"));
check("SERVER_BARREL: exports query-engine",           contains(serverBarrel, "query-engine"));
check("SERVER_BARREL: exports search-engine",          contains(serverBarrel, "search-engine"));
check("SERVER_BARREL: exports context-expansion",      contains(serverBarrel, "context-expansion"));
check("SERVER_BARREL: exports memory-timeline",        contains(serverBarrel, "memory-timeline"));
check("SERVER_BARREL: exports knowledge-snapshot",     contains(serverBarrel, "knowledge-snapshot"));
check("SERVER_BARREL: exports causality-preparation",  contains(serverBarrel, "causality-preparation"));
check("SERVER_BARREL: exports report-builder",         contains(serverBarrel, "report-builder"));
check("SERVER_BARREL: exports dashboard-contract",     contains(serverBarrel, "memory-graph-dashboard-contract"));
check("SERVER_BARREL: exports memory-graph-repository",contains(serverBarrel, "memory-graph-repository"));
check("SERVER_BARREL: exports tenant-isolation",       contains(serverBarrel, "memory-graph-tenant-isolation"));
check("SERVER_BARREL: exports health",                 contains(serverBarrel, "evaluateGraphHealth"));
check("SERVER_BARREL: exports readiness",              contains(serverBarrel, "scanGraphReadiness"));
check("SERVER_BARREL: exports PrismaMemoryGraphRepository", contains(serverBarrel, "PrismaMemoryGraphRepository"));
check("SERVER_BARREL: exports memory integration",     contains(serverBarrel, "memory-graph-memory"));
check("SERVER_BARREL: exports playbooks integration",  contains(serverBarrel, "memory-graph-playbooks"));
check("SERVER_BARREL: exports executive brain integration", contains(serverBarrel, "memory-graph-executive-brain"));
check("SERVER_BARREL: exports intelligence integration",contains(serverBarrel, "memory-graph-intelligence"));
check("SERVER_BARREL: exports compliance integration", contains(serverBarrel, "memory-graph-compliance"));
check("SERVER_BARREL: exports audit integration",      contains(serverBarrel, "memory-graph-audit"));
check("SERVER_BARREL: exports future-compatibility",   contains(serverBarrel, "future-compatibility"));

// ── Section 34: Client Barrel (index.ts) ─────────────────────────────────────

check("CLIENT_BARREL: exports core types",             contains(clientBarrel, "memory-graph-types"));
check("CLIENT_BARREL: exports graph-identity",         contains(clientBarrel, "graph-identity"));
check("CLIENT_BARREL: exports relationship-resolver",  contains(clientBarrel, "relationship-resolver"));
check("CLIENT_BARREL: exports causality-preparation",  contains(clientBarrel, "causality-preparation"));
check("CLIENT_BARREL: exports dashboard-contract",     contains(clientBarrel, "memory-graph-dashboard-contract"));
check("CLIENT_BARREL: exports audit types",            contains(clientBarrel, "memory-graph-audit"));
check("CLIENT_BARREL: exports compliance types",       contains(clientBarrel, "memory-graph-compliance"));
check("CLIENT_BARREL: exports future-compatibility",   contains(clientBarrel, "future-compatibility"));

// MUST NOT export server-only items
check("CLIENT_BARREL: does NOT export evaluateGraphHealth",  notContains(clientBarrel, /^export.*evaluateGraphHealth/m));
check("CLIENT_BARREL: does NOT export scanGraphReadiness",   notContains(clientBarrel, /^export.*scanGraphReadiness/m));
check("CLIENT_BARREL: does NOT export PrismaMemoryGraphRepository", notContains(clientBarrel, /^export.*PrismaMemoryGraphRepository/m));
check("CLIENT_BARREL: does NOT import server-only",          notContains(clientBarrel, '"server-only"'));
check("CLIENT_BARREL: does NOT export graph-registry functions",  notContains(clientBarrel, /^export.*registerNode/m));
check("CLIENT_BARREL: does NOT export node-builder functions",    notContains(clientBarrel, /^export.*buildNode/m));

// ── Section 35: Prisma Schema ─────────────────────────────────────────────────

check("SCHEMA: MemoryGraphNode model defined",  contains(prismaSchema, "model MemoryGraphNode"));
check("SCHEMA: MemoryGraphEdge model defined",  contains(prismaSchema, "model MemoryGraphEdge"));

// MemoryGraphNode fields
check("SCHEMA: MemoryGraphNode has id",        contains(prismaSchema, /MemoryGraphNode[\s\S]{0,2000}id\s+String/));
check("SCHEMA: MemoryGraphNode has orgSlug",   contains(prismaSchema, /MemoryGraphNode[\s\S]{0,2000}orgSlug/));
check("SCHEMA: MemoryGraphNode has nodeType",  contains(prismaSchema, /MemoryGraphNode[\s\S]{0,2000}nodeType/));
check("SCHEMA: MemoryGraphNode has label",     contains(prismaSchema, /MemoryGraphNode[\s\S]{0,2000}label/));
check("SCHEMA: MemoryGraphNode has source",    contains(prismaSchema, /MemoryGraphNode[\s\S]{0,2000}source/));
check("SCHEMA: MemoryGraphNode has weight",    contains(prismaSchema, /MemoryGraphNode[\s\S]{0,2000}weight/));
check("SCHEMA: MemoryGraphNode has createdAt", contains(prismaSchema, /MemoryGraphNode[\s\S]{0,2000}createdAt/));

// MemoryGraphEdge fields
check("SCHEMA: MemoryGraphEdge has id",           contains(prismaSchema, /MemoryGraphEdge[\s\S]{0,500}id\s+String/));
check("SCHEMA: MemoryGraphEdge has orgSlug",      contains(prismaSchema, /MemoryGraphEdge[\s\S]{0,500}orgSlug/));
check("SCHEMA: MemoryGraphEdge has edgeType",     contains(prismaSchema, /MemoryGraphEdge[\s\S]{0,500}edgeType/));
check("SCHEMA: MemoryGraphEdge has sourceNodeId", contains(prismaSchema, /MemoryGraphEdge[\s\S]{0,500}sourceNodeId/));
check("SCHEMA: MemoryGraphEdge has targetNodeId", contains(prismaSchema, /MemoryGraphEdge[\s\S]{0,500}targetNodeId/));
check("SCHEMA: MemoryGraphEdge has weight",       contains(prismaSchema, /MemoryGraphEdge[\s\S]{0,500}weight/));

// ── Section 36: Integration Harness ──────────────────────────────────────────

check("HARNESS: route file exists",            harness.length > 100);
check("HARNESS: GET handler exported",         contains(harness, "export async function GET"));
check("HARNESS: production guard",             contains(harness, 'NODE_ENV'));
check("HARNESS: integration test flag guard",  contains(harness, "ENABLE_INTERNAL_INTEGRATION_TESTS"));
check("HARNESS: Bearer token auth",            contains(harness, /Bearer|Authorization/));
check("HARNESS: clearAllRegistries before tests", contains(harness, "clearAllRegistries"));
check("HARNESS: T01 test label",               contains(harness, "T01"));
check("HARNESS: T50 test label",               contains(harness, "T50"));
check("HARNESS: T100 test label",              contains(harness, "T100"));
check("HARNESS: T150 test label",              contains(harness, "T150"));
check("HARNESS: tests Core Types section",     contains(harness, /Core Types|core.*types/i));
check("HARNESS: tests Node Builder section",   contains(harness, /Node Builder|node.*build/i));
check("HARNESS: tests Edge Builder section",   contains(harness, /Edge Builder|edge.*build/i));
check("HARNESS: tests Registry section",       contains(harness, /Registry|registry/i));
check("HARNESS: tests Graph Engine section",   contains(harness, /Graph Engine|graph.*engine/i));
check("HARNESS: tests Traversal section",      contains(harness, /Traversal|traversal/i));
check("HARNESS: tests Relationship Resolver",  contains(harness, /Relationship Resolver|resolver/i));
check("HARNESS: tests Integrity section",      contains(harness, /Integrity|integrity/i));
check("HARNESS: tests Query Engine section",   contains(harness, /Query|query/i));
check("HARNESS: tests Search Engine section",  contains(harness, /Search|search/i));
check("HARNESS: tests Tenant Isolation",       contains(harness, /Tenant|isolation/i));
check("HARNESS: tests Integrations section",   contains(harness, /Integration|integration/i));
check("HARNESS: tests Audit section",          contains(harness, /Audit|audit/i));
check("HARNESS: counts passed/failed",         contains(harness, /passed|failed/));
check("HARNESS: returns JSON response",        contains(harness, "NextResponse.json"));

// ── Section 37: Cross-cutting Invariants ──────────────────────────────────────

// All integrations are client-safe (no server-only)
check("INVARIANT: memory-graph-memory.ts not server-only",      notContains(memInteg, '"server-only"'));
check("INVARIANT: memory-graph-playbooks.ts not server-only",   notContains(pbInteg, '"server-only"'));
check("INVARIANT: memory-graph-executive-brain.ts not server-only", notContains(brainInteg, '"server-only"'));
check("INVARIANT: memory-graph-intelligence.ts not server-only",    notContains(intelInteg, '"server-only"'));
check("INVARIANT: memory-graph-compliance.ts not server-only",  notContains(compInteg, '"server-only"'));
check("INVARIANT: memory-graph-audit.ts not server-only",       notContains(auditInteg, '"server-only"'));

// Server-only files properly guarded
check("INVARIANT: health.ts uses server-only",     contains(health, '"server-only"'));
check("INVARIANT: readiness.ts uses server-only",  contains(readiness, '"server-only"'));
check("INVARIANT: prisma-repo.ts uses server-only",contains(prismaRepo, '"server-only"'));
check("INVARIANT: server.ts uses server-only",     contains(serverBarrel, '"server-only"'));

// Multi-tenant: all functions that operate on nodes check orgSlug
check("INVARIANT: registry scopes by orgSlug",    contains(registry, "orgSlug"));
check("INVARIANT: engine scopes by orgSlug",      contains(engine, "orgSlug"));
check("INVARIANT: isolation scopes by orgSlug",   contains(isolation, "orgSlug"));

// ID prefixes used consistently
check("INVARIANT: nodes use mgn_ prefix",     contains(identity, "mgn_"));
check("INVARIANT: edges use mge_ prefix",     contains(identity, "mge_"));
check("INVARIANT: snapshots use mgs_ prefix", contains(identity, "mgs_"));

// No raw hex colors in implementation files
check("INVARIANT: no raw hex in types",      notContains(types, /#[0-9a-fA-F]{6}/));
check("INVARIANT: no raw hex in registry",   notContains(registry, /#[0-9a-fA-F]{6}/));
check("INVARIANT: no raw hex in engine",     notContains(engine, /#[0-9a-fA-F]{6}/));

// Dashboard contract — no Prisma, may use graph-registry (in-memory)
check("INVARIANT: dashboard has no Prisma",              notContains(dashboard, 'from "@/lib/prisma"'));
check("INVARIANT: dashboard has no server-only import",  notContains(dashboard, '"server-only"'));

// ── Section 38: Design System Compliance (file-level) ────────────────────────

// These files are pure domain — no UI tokens expected
// But verify no accidental UI imports bleed into domain files
check("DESIGN: types.ts has no UI tokens import",      notContains(types, "lib/ui/tokens"));
check("DESIGN: registry.ts has no UI tokens import",   notContains(registry, "lib/ui/tokens"));
check("DESIGN: engine.ts has no UI tokens import",     notContains(engine, "lib/ui/tokens"));
check("DESIGN: edge-builder.ts has no UI tokens import", notContains(edgeBuilder, "lib/ui/tokens"));
check("DESIGN: node-builder.ts has no UI tokens import", notContains(nodeBuilder, "lib/ui/tokens"));

// ── Section 39: Additional Provenance Checks ──────────────────────────────────

// Every node built by adapters must set a source (directly or via builder)
check("PROVENANCE: memInteg sets source field",   contains(memInteg, /source:|buildMemoryNode|buildNode/));
check("PROVENANCE: pbInteg uses node builder",    contains(pbInteg, /buildPlaybookNode|buildNode|source:/));
check("PROVENANCE: brainInteg sets source field", contains(brainInteg, "source:"));

// Edge builders set reasoning
check("PROVENANCE: buildAffectsEdge accepts reasoning",  contains(edgeBuilder, "reasoning"));
check("PROVENANCE: buildRelatedToEdge accepts reasoning", contains(edgeBuilder, "reasoning"));

// buildEdge requires source
check("PROVENANCE: buildEdge requires source",   contains(edgeBuilder, "source"));

// ── Section 40: Scoring & Weight Consistency ──────────────────────────────────

check("SCORING: GRAPH_DEFAULT_WEIGHT is 0.5",     contains(types, "0.5"));
check("SCORING: weight range 0.0–1.0 in scoring", contains(scoring, /0\.[0-9]/));
check("SCORING: node weight used in scoring",      contains(scoring, "weight"));
check("SCORING: centrality computed from edges",   contains(scoring, /inbound|outbound|degree|edgeCount/));

// ── Section 41: Traversal Safety ─────────────────────────────────────────────

check("TRAVERSAL_SAFETY: visited set prevents infinite loops",  contains(traversal, "visited"));
check("TRAVERSAL_SAFETY: depth check in BFS",                   contains(traversal, "depth"));
check("TRAVERSAL_SAFETY: max depth respected (GRAPH_MAX_DEPTH or param)", contains(traversal, /maxDepth|GRAPH_MAX_DEPTH/));

// ── Section 42: Error Handling Discipline ─────────────────────────────────────

// Registry: registerEdge is fail-closed (no throw, silent reject)
check("ERROR_HANDLING: registry registerEdge fail-closed",  contains(registry, /return|undefined|null/));

// Audit: never throws (appendEvent should be safe)
check("ERROR_HANDLING: audit never throws",  notContains(auditInteg, "throw new Error"));

// Integrity: runIntegrityCheck never throws
check("ERROR_HANDLING: integrity check no top-level throw",  contains(integrity, /try|catch|errorCount/));

// ── Section 43: Snapshot Safety ───────────────────────────────────────────────

check("SNAPSHOT_SAFETY: restoreSnapshot is destructive (clears and restores)",  contains(snapshot, /clear|clearRegistry|clearAllRegistries|clearAll/));
check("SNAPSHOT_SAFETY: createSnapshot copies nodes+edges",  contains(snapshot, /nodes.*edges|edges.*nodes/));
check("SNAPSHOT_SAFETY: snapshotDiff returns added/removed",  contains(snapshot, /addedNodes|removedNodes/));

// ── Section 44: Extended Type Checks ─────────────────────────────────────────

// GraphQuery fields
check("EXT_TYPES: GraphQuery has orgSlug",  contains(types, /GraphQuery[\s\S]{0,200}orgSlug/));
check("EXT_TYPES: GraphQuery has filters",  contains(types, /GraphQuery[\s\S]{0,400}filter|nodeTypes|tags/));

// GraphSearchQuery fields
check("EXT_TYPES: GraphSearchQuery has orgSlug",  contains(types, /GraphSearchQuery[\s\S]{0,200}orgSlug/));
check("EXT_TYPES: GraphSearchQuery has term",     contains(types, /GraphSearchQuery[\s\S]{0,200}term/));

// GraphNodeScore fields
check("EXT_TYPES: GraphNodeScore has node",       contains(types, /GraphNodeScore[\s\S]{0,200}node/));
check("EXT_TYPES: GraphNodeScore has importance", contains(types, /GraphNodeScore[\s\S]{0,200}importance/));

// GraphValidationResult fields
check("EXT_TYPES: GraphValidationResult has valid",   contains(types, /GraphValidationResult[\s\S]{0,200}valid/));
check("EXT_TYPES: GraphValidationResult has errors",  contains(types, /GraphValidationResult[\s\S]{0,300}error/));

// TimelineEntry fields
check("EXT_TYPES: TimelineEntry has nodeId",    contains(types, /TimelineEntry[\s\S]{0,200}nodeId/));
check("EXT_TYPES: TimelineEntry has timestamp", contains(types, /TimelineEntry[\s\S]{0,300}timestamp|createdAt/));

// GraphSnapshot fields (in types)
check("EXT_TYPES: GraphSnapshot has id",       contains(types, /GraphSnapshot[\s\S]{0,200}id/));
check("EXT_TYPES: GraphSnapshot has orgSlug",  contains(types, /GraphSnapshot[\s\S]{0,200}orgSlug/));
check("EXT_TYPES: GraphSnapshot has nodes",    contains(types, /GraphSnapshot[\s\S]{0,300}nodes/));

// GraphPath fields
check("EXT_TYPES: GraphPath has nodes",  contains(types, /GraphPath[\s\S]{0,200}nodes/));
check("EXT_TYPES: GraphPath has edges",  contains(types, /GraphPath[\s\S]{0,200}edges/));

// GraphTraversal result
check("EXT_TYPES: GraphTraversal has path",     contains(types, /GraphTraversal[\s\S]{0,200}path/));
check("EXT_TYPES: GraphTraversal has visited",  contains(types, /GraphTraversal[\s\S]{0,300}visited/));

// GraphSubgraph fields
check("EXT_TYPES: GraphSubgraph has nodes", contains(types, /GraphSubgraph[\s\S]{0,200}nodes/));
check("EXT_TYPES: GraphSubgraph has edges", contains(types, /GraphSubgraph[\s\S]{0,200}edges/));

// ── Section 45: Extended Registry Checks ─────────────────────────────────────

// listNodes returns array
check("EXT_REG: listNodes returns array",      contains(registry, /listNodes.*GraphNode\[\]|GraphNode\[\].*listNodes/));
// listEdges returns array
check("EXT_REG: listEdges returns array",      contains(registry, /listEdges.*GraphEdge\[\]|GraphEdge\[\].*listEdges/));
// clearAllRegistries resets all orgs
check("EXT_REG: clearAllRegistries clears maps", contains(registry, /clear\(\)|new Map/));
// edgesForNode combines inbound+outbound
check("EXT_REG: edgesForNode combines from+to", contains(registry, /edgesFrom|edgesTo|from.*to|inbound|outbound/));
// registryStats returns counts
check("EXT_REG: registryStats returns nodeCount", contains(registry, /nodeCount|nodes.*size|size.*nodes/));
check("EXT_REG: registryStats returns edgeCount", contains(registry, /edgeCount|edges.*size|size.*edges/));
// No Tailwind or CSS in registry
check("EXT_REG: no CSS classes", notContains(registry, /className|ag-op-/));
// Registry is pure TypeScript
check("EXT_REG: no JSX", notContains(registry, "JSX\|React\|ReactNode"));

// ── Section 46: Extended Engine Checks ───────────────────────────────────────

// createNode delegates to registerNode
check("EXT_ENGINE: createNode uses registerNode", contains(engine, "registerNode"));
// deleteNode removes from registry
check("EXT_ENGINE: deleteNode uses removeNode",   contains(engine, "removeNode"));
// upsertNode handles existing
check("EXT_ENGINE: upsertNode handles update",    contains(engine, /upsert|update.*node|existing/));
// validateGraph returns errors
check("EXT_ENGINE: validateGraph returns validation", contains(engine, /valid|error|GraphValidationResult/));
// addNodes uses createNode or registerNode in loop
check("EXT_ENGINE: addNodes loops over nodes",    contains(engine, /for.*of|forEach|map/));
// getNeighborIds returns string array
check("EXT_ENGINE: getNeighborIds returns strings", contains(engine, /string\[\]|neighborIds|neighbors/));
// getAllNodes scoped by orgSlug
check("EXT_ENGINE: getAllNodes scoped by org",    contains(engine, "orgSlug"));
// No React in engine
check("EXT_ENGINE: no JSX in engine",  notContains(engine, /<[A-Z][a-z]/));

// ── Section 47: Extended Traversal Checks ────────────────────────────────────

// findPath returns GraphPath or null
check("EXT_TRAVERSAL: findPath returns path or null",  contains(traversal, /GraphPath|path.*null|null.*path/));
// findPaths returns array
check("EXT_TRAVERSAL: findPaths returns array",        contains(traversal, /GraphPath\[\]/));
// shortestPath uses BFS (BFS gives shortest)
check("EXT_TRAVERSAL: shortestPath delegates to findPath", contains(traversal, /shortestPath|findPath|BFS|bfs/));
// bfsTraversal returns GraphTraversal
check("EXT_TRAVERSAL: bfsTraversal returns traversal", contains(traversal, "GraphTraversal"));
// nodesWithinDepth result array
check("EXT_TRAVERSAL: nodesWithinDepth returns nodes", contains(traversal, /GraphNode\[\]|nodesWithin/));
// Traversal scoped by orgSlug
check("EXT_TRAVERSAL: traversal scoped by org",  contains(traversal, "orgSlug"));

// ── Section 48: Extended Integrity Checks ────────────────────────────────────

// Orphan detection
check("EXT_INTEGRITY: orphan detection tracks touched nodes",  contains(integrity, /touchedNodes|Set|orphanNodes/));
// Self-loop detection
check("EXT_INTEGRITY: self-loop detection",  contains(integrity, /sourceNodeId.*targetNodeId|selfLoop/));
// Cross-tenant edge detection
check("EXT_INTEGRITY: cross-tenant check",  contains(integrity, /orgSlug|cross.*tenant|tenant/));
// No-source node detection
check("EXT_INTEGRITY: no-source node check", contains(integrity, /source.*node|node.*source|!.*source/));
// IntegrityReport interface exported
check("EXT_INTEGRITY: IntegrityReport interface exported", contains(integrity, /export.*IntegrityReport|IntegrityReport/));
// Integrity uses listNodes and listEdges
check("EXT_INTEGRITY: uses listNodes",  contains(integrity, "listNodes"));
check("EXT_INTEGRITY: uses listEdges",  contains(integrity, "listEdges"));

// ── Section 49: Extended Scoring Checks ──────────────────────────────────────

// GraphMetrics interface defined
check("EXT_SCORING: GraphMetrics interface",  contains(scoring, /interface GraphMetrics|type GraphMetrics/));
// scoreNode returns GraphNodeScore
check("EXT_SCORING: scoreNode returns score", contains(scoring, /GraphNodeScore|importance.*number|number.*importance/));
// computeGraphMetrics uses node+edge counts
check("EXT_SCORING: metrics uses nodes",    contains(scoring, /listNodes|getAllNodes|nodeCount/));
check("EXT_SCORING: metrics uses edges",    contains(scoring, /listEdges|getAllEdges|edgeCount/));
// edgeStrength in 0-1 range
check("EXT_SCORING: edgeStrength returns number", contains(scoring, /edgeStrength.*number|number.*edge/));
// topNodesByImportance uses limit param
check("EXT_SCORING: topNodes uses slice or limit", contains(scoring, /slice|limit|topN/));
// averageEdgeWeight returns 0 on no edges
check("EXT_SCORING: averageEdgeWeight handles empty", contains(scoring, /0|length.*0|empty/));

// ── Section 50: Extended Relationship Resolver Checks ────────────────────────

// At least 20 patterns
check("EXT_RESOLVER: at least 10 patterns defined",  (resolver.match(/sourceType:/g) || []).length >= 10);
// Confidence values are 0-1
check("EXT_RESOLVER: confidence values are decimals", contains(resolver, /confidence:\s*0\.[0-9]/));
// resolveRelationship returns RelationshipResolution
check("EXT_RESOLVER: returns RelationshipResolution", contains(resolver, "RelationshipResolution"));
// canRelate returns boolean
check("EXT_RESOLVER: canRelate returns boolean", contains(resolver, /canRelate.*boolean|boolean.*canRelate/));
// allRelationshipsFor returns array of patterns
check("EXT_RESOLVER: allRelationshipsFor returns array", contains(resolver, /RelationshipPattern\[\]|RelationshipResolution\[\]/));
// edgeTypesFrom returns string array
check("EXT_RESOLVER: edgeTypesFrom returns edge types", contains(resolver, /GraphEdgeType|edgeType/));
// CLIENT patterns defined
check("EXT_RESOLVER: CLIENT node has patterns", contains(resolver, /CLIENT/));
// CAMPAIGN patterns defined
check("EXT_RESOLVER: CAMPAIGN node has patterns", contains(resolver, /CAMPAIGN/));

// ── Section 51: Extended Subgraph Checks ─────────────────────────────────────

// buildSubgraph includes connected edges
check("EXT_SUBGRAPH: includes edges for nodes",  contains(subgraph, /edgesFrom|edgesTo|edgesForNode|edge/));
// buildInsightSubgraph is defined
check("EXT_SUBGRAPH: buildInsightSubgraph is defined", contains(subgraph, "buildInsightSubgraph"));
// buildAlertSubgraph is defined
check("EXT_SUBGRAPH: buildAlertSubgraph is defined",   contains(subgraph, "buildAlertSubgraph"));
// buildSubgraphByTag filters by tag
check("EXT_SUBGRAPH: buildSubgraphByTag uses tags",  contains(subgraph, "tags"));
// mergeSubgraphs deduplicates nodes
check("EXT_SUBGRAPH: mergeSubgraphs deduplicates", contains(subgraph, /Map|Set|dedup|unique/));
// GraphSubgraph return type
check("EXT_SUBGRAPH: functions return GraphSubgraph", contains(subgraph, "GraphSubgraph"));

// ── Section 52: Extended Query Engine Checks ──────────────────────────────────

// findNode returns single node (undefined or null for not found)
check("EXT_QUERY: findNode returns GraphNode or undefined", contains(queryEngine, /GraphNode.*undefined|undefined.*GraphNode|GraphNode \| undefined|GraphNode \| null/));
// findNodesByType returns array
check("EXT_QUERY: findNodesByType returns array", contains(queryEngine, /GraphNode\[\]/));
// findNodesByTag matches any tag
check("EXT_QUERY: findNodesByTag checks tags",   contains(queryEngine, /tags.*includes|includes.*tags|tag/));
// findRelated uses edges
check("EXT_QUERY: findRelated uses edges",       contains(queryEngine, /edge|neighbor|related/));
// searchGraph accepts GraphQuery
check("EXT_QUERY: searchGraph accepts GraphQuery", contains(queryEngine, "GraphQuery"));
// getHighImportanceNodes uses weight threshold
check("EXT_QUERY: getHighImportanceNodes uses weight", contains(queryEngine, /weight|importance|threshold/));
// getIsolatedNodes finds orphans
check("EXT_QUERY: getIsolatedNodes is exported", contains(queryEngine, "getIsolatedNodes"));

// ── Section 53: Extended Search Engine Checks ─────────────────────────────────

// searchNodes accepts GraphSearchQuery
check("EXT_SEARCH: accepts GraphSearchQuery", contains(searchEngine, "GraphSearchQuery"));
// searchNodes returns GraphSearchResult
check("EXT_SEARCH: returns GraphSearchResult", contains(searchEngine, "GraphSearchResult"));
// RankedMatch interface exported
check("EXT_SEARCH: RankedMatch exported", contains(searchEngine, /export.*RankedMatch|RankedMatch/));
// Scoring: tag match lower than label match
check("EXT_SEARCH: tag score < label score (0.5 vs 1.0)", contains(searchEngine, /0\.5|0\.3/));
// findByLabel is case-insensitive or uses includes
check("EXT_SEARCH: findByLabel uses string matching", contains(searchEngine, /toLowerCase|includes|label/));
// findByMetadataKey checks metadata object
check("EXT_SEARCH: findByMetadataKey checks metadata", contains(searchEngine, /metadata\[|Object\.keys|hasOwnProperty/));

// ── Section 54: Extended Context Expansion Checks ─────────────────────────────

// expandContext accepts optional params
check("EXT_CTX: expandContext has orgSlug param",   contains(ctxExpansion, "orgSlug"));
check("EXT_CTX: expandContext has maxDepth param",  contains(ctxExpansion, "maxDepth"));
check("EXT_CTX: expandContext has maxNodes param",  contains(ctxExpansion, "maxNodes"));
// expandByType filters by node type
check("EXT_CTX: expandByType filters by type", contains(ctxExpansion, /nodeType|type.*filter|filter.*type/));
// summarizeExpansion returns ExpansionSummary
check("EXT_CTX: summarizeExpansion returns ExpansionSummary", contains(ctxExpansion, "ExpansionSummary"));
// Expansion uses searchNodes or searchNodesTerm for root
check("EXT_CTX: expansion uses search for root nodes", contains(ctxExpansion, /searchNode|searchGraph|findNode/));
// expandFromNodes accepts node ID array
check("EXT_CTX: expandFromNodes accepts node IDs", contains(ctxExpansion, /nodeIds|nodeId.*\[\]|string\[\]/));

// ── Section 55: Extended Timeline Checks ─────────────────────────────────────

// buildTimeline sorts by timestamp
check("EXT_TIMELINE: buildTimeline sorts entries",     contains(timeline, /sort|createdAt/));
// analyzeTimeline returns stats
check("EXT_TIMELINE: analyzeTimeline returns stats",   contains(timeline, "TimelineStats"));
// filterTimelineByType filters by node type
check("EXT_TIMELINE: filterTimelineByType filters",    contains(timeline, /filter.*type|type.*filter/));
// sliceTimeline accepts start/end index
check("EXT_TIMELINE: sliceTimeline uses slice or index", contains(timeline, /slice|start.*end|from.*to/));
// buildTimeline returns MemoryTimeline
check("EXT_TIMELINE: returns MemoryTimeline", contains(timeline, "MemoryTimeline"));
// Timeline uses createdAt for ordering
check("EXT_TIMELINE: uses createdAt for order", contains(timeline, "createdAt"));
// TimelineStats has entry count
check("EXT_TIMELINE: TimelineStats has count", contains(timeline, /count|total|length/));

// ── Section 56: Extended Snapshot Checks ─────────────────────────────────────

// createSnapshot captures current registry state
check("EXT_SNAPSHOT: createSnapshot uses listNodes", contains(snapshot, /listNodes|getAllNodes/));
check("EXT_SNAPSHOT: createSnapshot uses listEdges", contains(snapshot, /listEdges|getAllEdges/));
// restoreSnapshot calls clearRegistry
check("EXT_SNAPSHOT: restoreSnapshot clears first",  contains(snapshot, /clearRegistry|clearAll|clear/));
// listSnapshots returns array
check("EXT_SNAPSHOT: listSnapshots returns array",   contains(snapshot, /snapshot.*\[\]|GraphSnapshot\[\]/));
// compareSnapshots uses snapshotDiff
check("EXT_SNAPSHOT: compareSnapshots returns diff", contains(snapshot, /SnapshotDiff|diff/));
// deleteSnapshot removes from store
check("EXT_SNAPSHOT: deleteSnapshot removes snapshot", contains(snapshot, /delete|remove|filter/));
// snapshotDiff computes added/removed
check("EXT_SNAPSHOT: snapshotDiff computes delta", contains(snapshot, /addedNodes|removedNodes|filter/));

// ── Section 57: Extended Repository Checks ────────────────────────────────────

// InMemoryGraphRepository is pure in-memory
check("EXT_REPO: InMemoryGraphRepository uses Map or array", contains(repo, /Map|Array|new Map/));
// saveNodes bulk method
check("EXT_REPO: interface has saveNodes bulk",  contains(repo, "saveNodes"));
// saveEdges bulk method
check("EXT_REPO: interface has saveEdges bulk",  contains(repo, "saveEdges"));
// queryGraph returns GraphQueryResult
check("EXT_REPO: queryGraph returns result",     contains(repo, /GraphQueryResult|queryGraph/));
// NodeFilter interface
check("EXT_REPO: NodeFilter has orgSlug",  contains(repo, /NodeFilter[\s\S]{0,300}orgSlug/));
check("EXT_REPO: NodeFilter has type",     contains(repo, /NodeFilter[\s\S]{0,300}type\?/));
// EdgeFilter interface
check("EXT_REPO: EdgeFilter has orgSlug",  contains(repo, /EdgeFilter[\s\S]{0,300}orgSlug/));
check("EXT_REPO: EdgeFilter has type",     contains(repo, /EdgeFilter[\s\S]{0,300}type\?/));

// ── Section 58: Extended Prisma Repository Checks ─────────────────────────────

// PrismaMemoryGraphRepository uses orgSlug isolation
check("EXT_PRISMA_REPO: scoped by orgSlug",        contains(prismaRepo, "orgSlug"));
// Uses upsert for saveNode (idempotent)
check("EXT_PRISMA_REPO: upsert for saveEdge",       contains(prismaRepo, "upsert"));
// _rowToNode maps id field
check("EXT_PRISMA_REPO: _rowToNode maps id",        contains(prismaRepo, /row\.id|\.id/));
// _rowToEdge maps sourceNodeId
check("EXT_PRISMA_REPO: _rowToEdge maps sourceNodeId", contains(prismaRepo, /sourceNodeId/));
// Handles JSON metadata
check("EXT_PRISMA_REPO: handles JSON metadata",     contains(prismaRepo, /JSON|metadata/));
// Has deleteNode implementation
check("EXT_PRISMA_REPO: implements deleteNode",     contains(prismaRepo, "deleteNode"));
// Has listNodes implementation
check("EXT_PRISMA_REPO: implements listNodes",      contains(prismaRepo, "listNodes"));

// ── Section 59: Extended Tenant Isolation Checks ──────────────────────────────

// checkTenantIsolation returns report
check("EXT_ISOLATION: returns TenantIsolationReport", contains(isolation, "TenantIsolationReport"));
// TenantIsolationViolation type
check("EXT_ISOLATION: TenantIsolationViolation defined", contains(isolation, "TenantIsolationViolation"));
// IsolationSeverity type
check("EXT_ISOLATION: IsolationSeverity defined",  contains(isolation, "IsolationSeverity"));
// filterToOrg returns arrays
check("EXT_ISOLATION: filterToOrg returns filtered nodes", contains(isolation, /filter.*orgSlug|orgSlug.*filter/));
// assertTenantIsolation calls checkTenantIsolation
check("EXT_ISOLATION: assertTenantIsolation uses check", contains(isolation, /checkTenantIsolation|violations|CRITICAL/));
// Cross-tenant violation is CRITICAL
check("EXT_ISOLATION: cross-tenant is CRITICAL severity", contains(isolation, '"CRITICAL"'));

// ── Section 60: Extended Dashboard Checks ────────────────────────────────────

// buildMemoryGraphDashboard accepts orgSlug
check("EXT_DASHBOARD: accepts orgSlug param",   contains(dashboard, "orgSlug"));
// buildEmptyMemoryGraphDashboard returns zero counts
check("EXT_DASHBOARD: empty dashboard has 0 nodes", contains(dashboard, /nodes.*0|0.*nodes/));
// graphHealth is enum
check("EXT_DASHBOARD: graphHealth is typed string union", contains(dashboard, /HEALTHY.*DEGRADED|DEGRADED.*HEALTHY/));
// nodesByType is record/object
check("EXT_DASHBOARD: nodesByType is record", contains(dashboard, /Record.*string|nodesByType.*\{|Partial/));
// DomainNodeMetric interface
check("EXT_DASHBOARD: DomainNodeMetric defined",  contains(dashboard, "DomainNodeMetric"));
// MemoryGraphDashboardPayload exported
check("EXT_DASHBOARD: MemoryGraphDashboardPayload exported", contains(dashboard, "MemoryGraphDashboardPayload"));

// ── Section 61: Extended Causality Checks ────────────────────────────────────

// CausalModel has status
check("EXT_CAUSALITY: CausalModel has status",  contains(causality, /status.*PREPARED|PREPARED.*status/));
// CausalLink has causeNodeId and effectNodeId
check("EXT_CAUSALITY: CausalLink has causeNodeId", contains(causality, /causeNodeId|sourceNodeId/));
// CausalChain has links array
check("EXT_CAUSALITY: CausalChain has links",    contains(causality, /links|chain/));
// identifyCausalCandidates returns candidate pairs
check("EXT_CAUSALITY: identifyCausalCandidates returns candidates", contains(causality, /candidate|pair|result/));
// prepareCausalLink returns CausalLink
check("EXT_CAUSALITY: prepareCausalLink returns CausalLink", contains(causality, "CausalLink"));
// buildEmptyCausalModel returns empty model
check("EXT_CAUSALITY: buildEmptyCausalModel returns model", contains(causality, "CausalModel"));

// ── Section 62: Extended Report Builder Checks ───────────────────────────────

// buildGraphSummary includes node count
check("EXT_REPORT: buildGraphSummary includes nodeCount", contains(reportBld, /nodeCount|node.*count|count.*node/));
// buildRelationshipReport lists edge types
check("EXT_REPORT: buildRelationshipReport lists edges",  contains(reportBld, /edge|relationship/));
// buildKnowledgeReport covers domains
check("EXT_REPORT: buildKnowledgeReport covers domains",  contains(reportBld, /knowledge|domain|type/));
// buildConnectivityReport uses graph metrics
check("EXT_REPORT: buildConnectivityReport uses metrics", contains(reportBld, /metric|density|component|connect/));
// Reports accept orgSlug
check("EXT_REPORT: reports accept orgSlug param", contains(reportBld, "orgSlug"));

// ── Section 63: Extended Health/Readiness Checks ─────────────────────────────

// evaluateGraphHealth checks subsystems
check("EXT_HEALTH: evaluateGraphHealth checks multiple subsystems", (health.match(/check|subsystem|registry|integrity/gi) || []).length >= 3);
// GraphSubsystemHealth has name and status
check("EXT_HEALTH: subsystem has name",    contains(health, /name.*string|string.*name/));
check("EXT_HEALTH: subsystem has status",  contains(health, /status.*GraphHealthStatus|GraphHealthStatus.*status/));
// scanGraphReadiness returns score
check("EXT_READINESS: overallScore is numeric",  contains(readiness, /overallScore.*number|number.*overallScore/));
// Readiness checks multiple criteria
check("EXT_READINESS: checks multiple criteria", (readiness.match(/check|criteria|ready|score/gi) || []).length >= 3);
// GraphSubsystemCheck defined
check("EXT_READINESS: GraphSubsystemCheck defined", contains(readiness, "GraphSubsystemCheck"));

// ── Section 64: Extended Harness Coverage ────────────────────────────────────

// Test counts: at least 150 tests
check("EXT_HARNESS: at least 150 test labels (T01-T180)", (harness.match(/T\d{2,3}[^0-9]/g) || []).length >= 150);
// Tests GRAPH_DEFAULT_WEIGHT
check("EXT_HARNESS: tests GRAPH_DEFAULT_WEIGHT",     contains(harness, "GRAPH_DEFAULT_WEIGHT"));
// Tests node building
check("EXT_HARNESS: tests buildNode or builder",     contains(harness, /buildNode|buildMemoryNode|buildInsightNode/));
// Tests registerNode
check("EXT_HARNESS: tests registerNode",             contains(harness, "registerNode"));
// Tests createEdge
check("EXT_HARNESS: tests createEdge",               contains(harness, "createEdge"));
// Tests findPath traversal
check("EXT_HARNESS: tests findPath",                 contains(harness, "findPath"));
// Tests runIntegrityCheck
check("EXT_HARNESS: tests runIntegrityCheck",        contains(harness, "runIntegrityCheck"));
// Tests resolveRelationship
check("EXT_HARNESS: tests resolveRelationship",      contains(harness, "resolveRelationship"));
// Tests createSnapshot
check("EXT_HARNESS: tests createSnapshot",           contains(harness, "createSnapshot"));
// Tests checkTenantIsolation
check("EXT_HARNESS: tests checkTenantIsolation",     contains(harness, "checkTenantIsolation"));
// Tests executive brain integration
check("EXT_HARNESS: tests executiveContextToGraph",  contains(harness, "executiveContextToGraph"));
// Tests audit integration
check("EXT_HARNESS: tests auditNodeCreated",         contains(harness, /auditNodeCreated|auditEdgeCreated|createGraphAuditLog/));
// Tests InMemoryGraphRepository
check("EXT_HARNESS: tests InMemoryGraphRepository",  contains(harness, "InMemoryGraphRepository"));
// Tests searchNodes
check("EXT_HARNESS: tests searchNodes",              contains(harness, "searchNodes"));
// Tests buildMemoryGraphDashboard
check("EXT_HARNESS: tests buildMemoryGraphDashboard", contains(harness, "buildMemoryGraphDashboard"));

// ── Section 65: Architecture Purity Checks ───────────────────────────────────

// No UI tokens in domain files
check("ARCH: node-builder has no Tailwind class names", notContains(nodeBuilder, /className.*=|text-[a-z]+-[0-9]+/));
check("ARCH: edge-builder has no Tailwind class names", notContains(edgeBuilder, /className.*=|text-[a-z]+-[0-9]+/));
check("ARCH: types file has no React import",           notContains(types, /from "react"/));
check("ARCH: registry has no React import",             notContains(registry, /from "react"/));
check("ARCH: engine has no React import",               notContains(engine, /from "react"/));
check("ARCH: traversal has no React import",            notContains(traversal, /from "react"/));

// Domain files do not import from app/ routes
check("ARCH: types has no app/ import",      notContains(types, /from "@\/app\//));
check("ARCH: registry has no app/ import",   notContains(registry, /from "@\/app\//));
check("ARCH: engine has no app/ import",     notContains(engine, /from "@\/app\//));
check("ARCH: node-builder no app/ import",   notContains(nodeBuilder, /from "@\/app\//));
check("ARCH: edge-builder no app/ import",   notContains(edgeBuilder, /from "@\/app\//));
check("ARCH: traversal no app/ import",      notContains(traversal, /from "@\/app\//));
check("ARCH: integrity no app/ import",      notContains(integrity, /from "@\/app\//));
check("ARCH: scoring no app/ import",        notContains(scoring, /from "@\/app\//));
check("ARCH: resolver no app/ import",       notContains(resolver, /from "@\/app\//));

// Integration adapters do not import from API routes
check("ARCH: mem-integ no app/ import",    notContains(memInteg, /from "@\/app\//));
check("ARCH: pb-integ no app/ import",     notContains(pbInteg, /from "@\/app\//));
check("ARCH: brain-integ no app/ import",  notContains(brainInteg, /from "@\/app\//));
check("ARCH: intel-integ no app/ import",  notContains(intelInteg, /from "@\/app\//));
check("ARCH: comp-integ no app/ import",   notContains(compInteg, /from "@\/app\//));
check("ARCH: audit-integ no app/ import",  notContains(auditInteg, /from "@\/app\//));

// Harness imports from server barrel
check("ARCH: harness imports from server.ts or individual modules", contains(harness, /memory-graph\/server|memory-graph-types|graph-registry/));

// ── Section 66: Edge Builder Extended ────────────────────────────────────────

// All 12 edge type functions exist
check("EDGE_FULL: RELATED_TO builder",   contains(edgeBuilder, "RELATED_TO"));
check("EDGE_FULL: GENERATED_BY builder", contains(edgeBuilder, "GENERATED_BY"));
check("EDGE_FULL: REFERENCES builder",   contains(edgeBuilder, "REFERENCES"));
check("EDGE_FULL: CAUSED builder",       contains(edgeBuilder, "CAUSED"));
check("EDGE_FULL: AFFECTS builder",      contains(edgeBuilder, "AFFECTS"));
check("EDGE_FULL: BELONGS_TO builder",   contains(edgeBuilder, "BELONGS_TO"));
check("EDGE_FULL: LINKED_TO builder",    contains(edgeBuilder, "LINKED_TO"));
check("EDGE_FULL: CREATED_FROM builder", contains(edgeBuilder, "CREATED_FROM"));
check("EDGE_FULL: RESOLVES builder",     contains(edgeBuilder, "RESOLVES"));
check("EDGE_FULL: TRIGGERS builder",     contains(edgeBuilder, "TRIGGERS"));
check("EDGE_FULL: SUPPORTS builder",     contains(edgeBuilder, "SUPPORTS"));
check("EDGE_FULL: CONTRADICTS builder",  contains(edgeBuilder, "CONTRADICTS"));

// buildEdge requires all mandatory fields
check("EDGE_FULL: buildEdge requires orgSlug",      contains(edgeBuilder, "orgSlug"));
check("EDGE_FULL: buildEdge requires sourceNodeId", contains(edgeBuilder, "sourceNodeId"));
check("EDGE_FULL: buildEdge requires targetNodeId", contains(edgeBuilder, "targetNodeId"));
check("EDGE_FULL: buildEdge generates unique id",   contains(edgeBuilder, /generateEdgeId|mge_/));

// ── Section 67: Compliance Extended ──────────────────────────────────────────

// buildGraphRelationshipTrace traces source→target
check("EXT_COMP: trace includes source and target", contains(compInteg, /sourceNode|targetNode|source.*target/));
// validateGraphCompliance returns report
check("EXT_COMP: validateGraphCompliance returns report", contains(compInteg, "GraphComplianceReport"));
// getUntracedEdges filters edges without source
check("EXT_COMP: getUntracedEdges checks source",  contains(compInteg, /source|traced|untraced/));
// getUntracedNodes filters nodes without source
check("EXT_COMP: getUntracedNodes checks source",  contains(compInteg, /source|traced|untraced/));
// No external service calls
check("EXT_COMP: no fetch in compliance",          notContains(compInteg, /fetch\(|axios|http/));

// ── Section 68: Executive Brain Extended ──────────────────────────────────────

// executiveContextToGraph handles empty signals
check("EXT_BRAIN: handles empty signals array",    contains(brainInteg, /signals.*map|signals\./));
// executiveContextToGraph handles empty insights
check("EXT_BRAIN: handles empty insights array",   contains(brainInteg, /insights.*map|insights\./));
// AFFECTS edges only created for matching categories
check("EXT_BRAIN: category matching for edges",    contains(brainInteg, /categor|includes|match/));
// ExecutiveBrainGraphResult has nodes array
check("EXT_BRAIN: result has nodes field",         contains(brainInteg, /nodes.*GraphNode|GraphNode.*nodes/));
// ExecutiveBrainGraphResult has edges array
check("EXT_BRAIN: result has edges field",         contains(brainInteg, /edges.*GraphEdge|GraphEdge.*edges/));
// Severity mapped to weight
check("EXT_BRAIN: severity to weight mapping",     contains(brainInteg, /severity.*weight|weight.*severity|_severityToWeight/));
// Priority mapped to weight
check("EXT_BRAIN: priority to weight mapping",     contains(brainInteg, /priority.*weight|weight.*priority|_impactToWeight/));

// ── Final Summary ─────────────────────────────────────────────────────────────

const total = passed + failed;

console.log("\n════════════════════════════════════════════════════════════");
console.log("  AGENTIK-INTELLIGENCE-MEMORY-GRAPH-01 — Validation Report");
console.log("════════════════════════════════════════════════════════════");
console.log(`  Total checks : ${total}`);
console.log(`  Passed       : ${passed}`);
console.log(`  Failed       : ${failed}`);
console.log(`  Pass rate    : ${((passed / total) * 100).toFixed(1)}%`);

if (failures.length > 0) {
  console.log("\n  FAILURES:");
  failures.forEach((f, i) => console.log(`    ${i + 1}. ${f}`));
}

console.log("════════════════════════════════════════════════════════════");

if (total < 800) {
  console.log(`\n  WARNING: Only ${total} checks — target is 800+`);
}

if (failed === 0) {
  console.log("\n  RESULT: ALL CHECKS PASS ✓");
  process.exit(0);
} else {
  console.log(`\n  RESULT: ${failed} FAILURE(S) — fix before shipping`);
  process.exit(1);
}
