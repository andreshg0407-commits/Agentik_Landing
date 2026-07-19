// AGENTIK-EXECUTIVE-BRAIN-02
// Phase 31 — Copilot Intelligence Module Registry
// Authoritative registry of all intelligence modules in the Agentik Copilot stack

export type IntelligenceModuleStatus =
  | "ACTIVE"      // Fully operational
  | "BETA"        // Available but not production-hardened
  | "PLANNED"     // Roadmap — not yet implemented
  | "DEPRECATED"; // Replaced by newer version

export type IntelligenceModuleCategory =
  | "MEMORY"       // Persistent memory and knowledge storage
  | "REASONING"    // Cross-domain reasoning and signal analysis
  | "LEARNING"     // Pattern learning and outcome tracking
  | "EXECUTIVE"    // Executive intelligence and strategic synthesis
  | "GRAPH"        // Graph-based relationship intelligence
  | "PLAYBOOKS"    // Playbook retrieval and matching
  | "COMPLIANCE";  // Compliance governance and policy checking

export interface IntelligenceModuleEntry {
  readonly id:          string;
  readonly name:        string;
  readonly description: string;
  readonly category:    IntelligenceModuleCategory;
  readonly status:      IntelligenceModuleStatus;
  readonly version:     string;
  readonly sprint:      string;                  // Which sprint delivered this
  readonly barrel:      string;                  // Import path (server barrel)
  readonly clientBarrel: string | null;          // Client-safe barrel (if exists)
  readonly hasDb:       boolean;                 // Persists to DB
  readonly hasPrisma:   boolean;                 // Has Prisma repository
  readonly hasHealth:   boolean;                 // Has health check function
  readonly hasReadiness: boolean;                // Has readiness evaluator
  readonly depends:     string[];                // Module IDs this consumes
}

// ── Registry ──────────────────────────────────────────────────────────────────

export const INTELLIGENCE_REGISTRY: IntelligenceModuleEntry[] = [
  {
    id:           "STRATEGIC_MEMORY",
    name:         "Strategic Memory",
    description:  "Persists and retrieves executive-level strategic knowledge: goals, risks, decisions, lessons, and commitments.",
    category:     "MEMORY",
    status:       "ACTIVE",
    version:      "1.0.0",
    sprint:       "AGENTIK-INTELLIGENCE-STRATEGIC-MEMORY-01",
    barrel:       "lib/copilot/strategic-memory/server",
    clientBarrel: "lib/copilot/strategic-memory/index",
    hasDb:        true,
    hasPrisma:    true,
    hasHealth:    true,
    hasReadiness: true,
    depends:      [],
  },
  {
    id:           "LEARNING_FRAMEWORK",
    name:         "Learning Framework",
    description:  "Tracks patterns, outcomes, and events to build an evolving model of what works and what doesn't.",
    category:     "LEARNING",
    status:       "ACTIVE",
    version:      "1.0.0",
    sprint:       "AGENTIK-LEARNING-FRAMEWORK-01",
    barrel:       "lib/copilot/learning/server",
    clientBarrel: "lib/copilot/learning/index",
    hasDb:        true,
    hasPrisma:    true,
    hasHealth:    true,
    hasReadiness: true,
    depends:      [],
  },
  {
    id:           "CROSS_MODULE_REASONING",
    name:         "Cross-Module Reasoning",
    description:  "Produces reasoning signals and chains by correlating data across all operational modules.",
    category:     "REASONING",
    status:       "ACTIVE",
    version:      "1.0.0",
    sprint:       "AGENTIK-CROSS-MODULE-REASONING-01",
    barrel:       "lib/copilot/cross-module-reasoning/server",
    clientBarrel: "lib/copilot/cross-module-reasoning/index",
    hasDb:        true,
    hasPrisma:    true,
    hasHealth:    true,
    hasReadiness: true,
    depends:      ["STRATEGIC_MEMORY"],
  },
  {
    id:           "MEMORY_GRAPH",
    name:         "Memory Graph",
    description:  "Models relationships between entities as a directed knowledge graph for traversal and pattern extraction.",
    category:     "GRAPH",
    status:       "ACTIVE",
    version:      "1.0.0",
    sprint:       "AGENTIK-MEMORY-GRAPH-01",
    barrel:       "lib/copilot/memory-graph/server",
    clientBarrel: "lib/copilot/memory-graph/index",
    hasDb:        true,
    hasPrisma:    true,
    hasHealth:    true,
    hasReadiness: true,
    depends:      ["STRATEGIC_MEMORY"],
  },
  {
    id:           "COPILOT_INTELLIGENCE_02",
    name:         "Copilot Intelligence V2",
    description:  "Deterministic multi-domain reasoning engine powering insight generation and contradiction detection.",
    category:     "REASONING",
    status:       "ACTIVE",
    version:      "2.0.0",
    sprint:       "AGENTIK-COPILOT-INTELLIGENCE-02",
    barrel:       "lib/copilot/intelligence/reasoning/server",
    clientBarrel: "lib/copilot/intelligence/reasoning/index",
    hasDb:        false,
    hasPrisma:    false,
    hasHealth:    true,
    hasReadiness: true,
    depends:      ["STRATEGIC_MEMORY", "CROSS_MODULE_REASONING", "MEMORY_GRAPH", "LEARNING_FRAMEWORK"],
  },
  {
    id:           "EXECUTIVE_BRAIN_V1",
    name:         "Executive Brain V1",
    description:  "Signal-aggregation executive brain — produces basic executive context from copilot signals.",
    category:     "EXECUTIVE",
    status:       "DEPRECATED",
    version:      "1.0.0",
    sprint:       "AGENTIK-COPILOT-CORE-02",
    barrel:       "lib/copilot/executive-brain/executive-brain-service",
    clientBarrel: null,
    hasDb:        false,
    hasPrisma:    false,
    hasHealth:    false,
    hasReadiness: false,
    depends:      [],
  },
  {
    id:           "EXECUTIVE_BRAIN_V2",
    name:         "Executive Brain V2",
    description:  "Full strategic executive intelligence layer. Synthesizes strategic memory, learning patterns, cross-module reasoning, memory graph, playbooks, and tenant profile into executive priorities, risks, opportunities, conflicts, narratives, digests, briefings, and agendas.",
    category:     "EXECUTIVE",
    status:       "ACTIVE",
    version:      "2.0.0",
    sprint:       "AGENTIK-EXECUTIVE-BRAIN-02",
    barrel:       "lib/copilot/executive-brain-v2/server",
    clientBarrel: "lib/copilot/executive-brain-v2/index",
    hasDb:        true,
    hasPrisma:    true,
    hasHealth:    true,
    hasReadiness: true,
    depends:      [
      "STRATEGIC_MEMORY",
      "LEARNING_FRAMEWORK",
      "CROSS_MODULE_REASONING",
      "MEMORY_GRAPH",
    ],
  },
  {
    id:           "STRATEGIC_ADVISOR",
    name:         "Strategic Advisor",
    description:  "Virtual strategic advisor that synthesizes all intelligence layers into concerns, opportunities, questions, recommendations, scenarios, challenges, focus areas, narratives, briefings, and digests.",
    category:     "EXECUTIVE",
    status:       "ACTIVE",
    version:      "1.0.0",
    sprint:       "AGENTIK-STRATEGIC-ADVISOR-01",
    barrel:       "lib/copilot/strategic-advisor/server",
    clientBarrel: "lib/copilot/strategic-advisor/index",
    hasDb:        true,
    hasPrisma:    true,
    hasHealth:    true,
    hasReadiness: true,
    depends:      [
      "STRATEGIC_MEMORY",
      "LEARNING_FRAMEWORK",
      "CROSS_MODULE_REASONING",
      "MEMORY_GRAPH",
      "EXECUTIVE_BRAIN_V2",
    ],
  },
  {
    id:           "STRATEGIC_SIMULATIONS",
    name:         "Strategic Simulations",
    description:  "Converts Agentik from strategic advisor to strategic simulator — models hypothetical scenarios, compares alternatives, projects risks/opportunities. Never forecasts, never executes, never modifies data.",
    category:     "EXECUTIVE",
    status:       "ACTIVE",
    version:      "1.0.0",
    sprint:       "AGENTIK-STRATEGIC-SIMULATIONS-01",
    barrel:       "lib/copilot/strategic-simulations/server",
    clientBarrel: "lib/copilot/strategic-simulations/index",
    hasDb:        true,
    hasPrisma:    true,
    hasHealth:    true,
    hasReadiness: true,
    depends:      [
      "STRATEGIC_ADVISOR",
      "STRATEGIC_MEMORY",
      "LEARNING_FRAMEWORK",
      "CROSS_MODULE_REASONING",
      "MEMORY_GRAPH",
      "EXECUTIVE_BRAIN_V2",
    ],
  },
  {
    id:           "STRATEGIC_PLANNING",
    name:         "Strategic Planning",
    description:  "Transforms recommendations, simulations, executive priorities, risks, opportunities, and strategic goals into structured business plans. Never executes, never modifies operational data, never assigns real tasks. All plans are suggestedOnly.",
    category:     "EXECUTIVE",
    status:       "ACTIVE",
    version:      "1.0.0",
    sprint:       "AGENTIK-STRATEGIC-PLANNING-01",
    barrel:       "lib/copilot/strategic-planning/server",
    clientBarrel: "lib/copilot/strategic-planning/index",
    hasPrisma:    true,
    hasDb:        true,
    hasHealth:    true,
    hasReadiness: true,
    depends:      [
      "STRATEGIC_MEMORY",
      "LEARNING_FRAMEWORK",
      "EXECUTIVE_BRAIN_V2",
      "STRATEGIC_ADVISOR",
      "STRATEGIC_SIMULATIONS",
      "CROSS_MODULE_REASONING",
    ],
  },
  // ── AGENTIK-EXECUTIVE-COUNCIL-01 ──────────────────────────────────────────
  {
    id:           "EXECUTIVE_COUNCIL",
    name:         "Executive Council",
    description:  "Multi-perspective deliberation layer. Analyzes situations from Finance, Commercial, Operations, Marketing, Collections, Strategy, Risk, and Compliance viewpoints to reach consensus or surface disagreements. Never executes. All recommendations suggestedOnly: true.",
    category:     "EXECUTIVE",
    status:       "ACTIVE",
    version:      "1.0.0",
    sprint:       "AGENTIK-EXECUTIVE-COUNCIL-01",
    barrel:       "lib/copilot/executive-council/server",
    clientBarrel: "lib/copilot/executive-council/index",
    hasPrisma:    true,
    hasDb:        true,
    hasHealth:    true,
    hasReadiness: true,
    depends:      [
      "EXECUTIVE_BRAIN_V2",
      "STRATEGIC_ADVISOR",
      "STRATEGIC_SIMULATIONS",
      "STRATEGIC_PLANNING",
      "STRATEGIC_MEMORY",
      "LEARNING_FRAMEWORK",
      "CROSS_MODULE_REASONING",
    ],
  },

  {
    id:           "BOARD_INTELLIGENCE",
    name:         "Board Intelligence",
    description:  "Highest-level strategic and governance analysis layer for board of directors and executive leadership. Consumes Executive Council, Executive Brain, Strategic Advisor, Simulations, and Planning to generate board-level assessments. Never executes. All recommendations suggestedOnly.",
    category:     "EXECUTIVE",
    status:       "ACTIVE",
    version:      "1.0.0",
    sprint:       "AGENTIK-BOARD-INTELLIGENCE-01",
    barrel:       "lib/copilot/board-intelligence/server",
    clientBarrel: "lib/copilot/board-intelligence/index",
    hasPrisma:    true,
    hasDb:        true,
    hasHealth:    true,
    hasReadiness: true,
    depends: [
      "EXECUTIVE_COUNCIL",
      "EXECUTIVE_BRAIN_V2",
      "STRATEGIC_ADVISOR",
      "STRATEGIC_SIMULATIONS",
      "STRATEGIC_PLANNING",
      "STRATEGIC_MEMORY",
      "LEARNING_FRAMEWORK",
      "CROSS_MODULE_REASONING",
    ],
  },

  {
    id:           "STRATEGIC_FORECASTING",
    name:         "Strategic Forecasting",
    description:  "First formal strategic projection layer. Transforms memory, learning, simulations, planning, executive deliberation, and board analysis into explainable future scenarios. Multi-tenant, fail-closed, probabilistic only. Never executes. All scenarios suggestedOnly.",
    category:     "EXECUTIVE",
    status:       "ACTIVE",
    version:      "1.0.0",
    sprint:       "AGENTIK-STRATEGIC-FORECASTING-01",
    barrel:       "lib/copilot/strategic-forecasting/server",
    clientBarrel: "lib/copilot/strategic-forecasting/index",
    hasPrisma:    true,
    hasDb:        true,
    hasHealth:    true,
    hasReadiness: true,
    depends: [
      "BOARD_INTELLIGENCE",
      "EXECUTIVE_COUNCIL",
      "EXECUTIVE_BRAIN_V2",
      "STRATEGIC_SIMULATIONS",
      "STRATEGIC_PLANNING",
      "STRATEGIC_MEMORY",
      "LEARNING_FRAMEWORK",
      "CROSS_MODULE_REASONING",
      "MEMORY_GRAPH",
    ],
  },
  {
    id:           "ENTERPRISE_DIRECTION",
    name:         "Enterprise Direction System",
    description:  "Transforms memory, learning, reasoning, simulations, planning, executive deliberation, board intelligence, and forecasting into a coherent strategic direction for the entire organization. Maintains North Star, aligns initiatives, detects strategic deviations, identifies direction conflicts, generates strategic narrative, digest, and briefing. All recommendations suggestedOnly. Never executes. Never modifies systems. Never replaces human direction.",
    category:     "EXECUTIVE",
    status:       "ACTIVE",
    version:      "1.0.0",
    sprint:       "AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01",
    barrel:       "lib/copilot/enterprise-direction/server",
    clientBarrel: "lib/copilot/enterprise-direction/index",
    hasPrisma:    true,
    hasDb:        true,
    hasHealth:    true,
    hasReadiness: true,
    depends: [
      "STRATEGIC_FORECASTING",
      "BOARD_INTELLIGENCE",
      "EXECUTIVE_COUNCIL",
      "EXECUTIVE_BRAIN_V2",
      "STRATEGIC_SIMULATIONS",
      "STRATEGIC_PLANNING",
      "STRATEGIC_MEMORY",
      "LEARNING_FRAMEWORK",
      "CROSS_MODULE_REASONING",
      "MEMORY_GRAPH",
    ],
  },
  {
    id:           "EXECUTIVE_GOVERNANCE",
    name:         "Executive Governance System",
    description:  "Formal corporate governance framework supervising decision alignment with policies, identifying exceptions and violations, managing authority levels, handling escalations, and ensuring strategic recommendations respect the governance framework. Never executes. Never approves automatically. Never replaces human approvers.",
    category:     "EXECUTIVE",
    status:       "ACTIVE",
    version:      "1.0.0",
    sprint:       "AGENTIK-EXECUTIVE-GOVERNANCE-01",
    barrel:       "lib/copilot/executive-governance/server",
    clientBarrel: "lib/copilot/executive-governance/index",
    hasPrisma:    true,
    hasDb:        true,
    hasHealth:    true,
    hasReadiness: true,
    depends: [
      "ENTERPRISE_DIRECTION",
      "STRATEGIC_FORECASTING",
      "EXECUTIVE_COUNCIL",
      "LEARNING_FRAMEWORK",
      "CROSS_MODULE_REASONING",
      "MEMORY_GRAPH",
      "SECURITY_COMPLIANCE",
    ],
  },

];

// ── Lookup helpers ─────────────────────────────────────────────────────────────

export function getIntelligenceModule(id: string): IntelligenceModuleEntry | undefined {
  return INTELLIGENCE_REGISTRY.find((m) => m.id === id);
}

export function getActiveModules(): IntelligenceModuleEntry[] {
  return INTELLIGENCE_REGISTRY.filter((m) => m.status === "ACTIVE");
}

export function getModulesByCategory(category: IntelligenceModuleCategory): IntelligenceModuleEntry[] {
  return INTELLIGENCE_REGISTRY.filter((m) => m.category === category);
}

export function getExecutiveModules(): IntelligenceModuleEntry[] {
  return INTELLIGENCE_REGISTRY.filter((m) => m.category === "EXECUTIVE" && m.status === "ACTIVE");
}

export function getDependents(moduleId: string): IntelligenceModuleEntry[] {
  return INTELLIGENCE_REGISTRY.filter((m) => m.depends.includes(moduleId));
}
