// AGENTIK-STRATEGIC-ADVISOR-01 — Phase 35: Future Compatibility
// Planned capabilities catalogue — no logic, no execution, no imports

export type PlannedCapabilityStatus =
  | "ROADMAP"     // Defined but not started
  | "RESEARCH"    // Under design investigation
  | "BLOCKED";    // Waiting on prerequisite system

export interface PlannedStrategicCapability {
  readonly id:           string;
  readonly name:         string;
  readonly description:  string;
  readonly status:       PlannedCapabilityStatus;
  readonly sprint:       string;              // Planned sprint ID
  readonly blockedBy:    string[];            // Module IDs or sprint IDs blocking this
  readonly estimatedPhase: number;           // Approx phase count to implement
}

// ── Catalogue ─────────────────────────────────────────────────────────────────

export const PLANNED_STRATEGIC_CAPABILITIES: PlannedStrategicCapability[] = [
  {
    id:           "BOARD_INTELLIGENCE",
    name:         "Board Intelligence",
    description:  "Specialized advisory layer for board-level strategic governance: board packet generation, director briefings, strategic oversight reports, and governance risk detection.",
    status:       "ROADMAP",
    sprint:       "AGENTIK-BOARD-INTELLIGENCE-01",
    blockedBy:    ["AGENTIK-STRATEGIC-ADVISOR-01"],
    estimatedPhase: 30,
  },
  {
    id:           "STRATEGIC_FORECASTING",
    name:         "Strategic Forecasting",
    description:  "Probabilistic forward-looking projections grounded in learning patterns, historical outcomes, and executive brain signals — not AI speculation.",
    status:       "ROADMAP",
    sprint:       "AGENTIK-STRATEGIC-FORECASTING-01",
    blockedBy:    ["AGENTIK-STRATEGIC-ADVISOR-01", "AGENTIK-LEARNING-FRAMEWORK-01"],
    estimatedPhase: 35,
  },
  {
    id:           "STRATEGIC_SIMULATIONS",
    name:         "Strategic Simulations",
    description:  "What-if simulation engine: model the impact of strategic decisions (pricing changes, market entry, cost cuts) against known patterns and historical evidence.",
    status:       "RESEARCH",
    sprint:       "AGENTIK-STRATEGIC-SIMULATIONS-01",
    blockedBy:    ["AGENTIK-STRATEGIC-FORECASTING-01", "AGENTIK-MEMORY-GRAPH-01"],
    estimatedPhase: 40,
  },
  {
    id:           "AUTONOMOUS_PLANNING",
    name:         "Autonomous Planning",
    description:  "Supervised autonomous planning: the advisor proposes strategic plans, milestones, and resource allocations that humans review and approve before execution.",
    status:       "ROADMAP",
    sprint:       "AGENTIK-AUTONOMOUS-PLANNING-01",
    blockedBy:    ["AGENTIK-STRATEGIC-SIMULATIONS-01", "AGENTIK-AGENT-RUNTIME-01"],
    estimatedPhase: 50,
  },
  {
    id:           "STRATEGIC_MENTOR",
    name:         "Strategic Mentor",
    description:  "Longitudinal learning-based mentorship layer: tracks leadership decisions over time, identifies growth areas, provides adaptive coaching aligned to org goals.",
    status:       "RESEARCH",
    sprint:       "AGENTIK-STRATEGIC-MENTOR-01",
    blockedBy:    ["AGENTIK-STRATEGIC-ADVISOR-01", "AGENTIK-EXECUTIVE-BRAIN-02"],
    estimatedPhase: 28,
  },
  {
    id:           "EXECUTIVE_COUNCIL",
    name:         "Executive Council",
    description:  "Multi-agent executive council simulation: dedicated agents for CFO, CMO, COO, and CPO advisory roles, each with domain-specific reasoning. Requires full agent autonomy stack.",
    status:       "BLOCKED",
    sprint:       "AGENTIK-EXECUTIVE-COUNCIL-01",
    blockedBy:    [
      "AGENTIK-STRATEGIC-ADVISOR-01",
      "AGENTIK-AUTONOMOUS-PLANNING-01",
      "AGENTIK-AGENT-RUNTIME-01",
    ],
    estimatedPhase: 60,
  },
];

// ── Lookup helpers ─────────────────────────────────────────────────────────────

export function getPlannedCapability(id: string): PlannedStrategicCapability | undefined {
  return PLANNED_STRATEGIC_CAPABILITIES.find((c) => c.id === id);
}

export function getCapabilitiesByStatus(status: PlannedCapabilityStatus): PlannedStrategicCapability[] {
  return PLANNED_STRATEGIC_CAPABILITIES.filter((c) => c.status === status);
}
