// AGENTIK-STRATEGIC-SIMULATIONS-01
// Phase 2 — Simulation Identity
// ID generation with typed prefixes. Never persists. Never modifies data.

let _simCounter = 0;

function _next(): string {
  _simCounter = (_simCounter + 1) % 99999;
  return `${Date.now().toString(36)}_${_simCounter}`;
}

export function generateSimId():         string { return `sim_${_next()}`; }
export function generateScenarioId():    string { return `scenario_${_next()}`; }
export function generateOutcomeId():     string { return `outcome_${_next()}`; }
export function generateComparisonId():  string { return `comparison_${_next()}`; }
export function generateAssumptionId():  string { return `assump_${_next()}`; }
export function generateConstraintId():  string { return `constr_${_next()}`; }
export function generateVariableId():    string { return `var_${_next()}`; }
export function generateImpactId():      string { return `impact_${_next()}`; }
export function generateSimRiskId():     string { return `simrisk_${_next()}`; }
export function generateSimOppId():      string { return `simopp_${_next()}`; }
export function generateSimRecId():      string { return `simrec_${_next()}`; }
export function generateNarrativeId():   string { return `narr_${_next()}`; }
