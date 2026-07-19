// AGENTIK-STRATEGIC-SIMULATIONS-01
// Phase 5 — Variable Engine
// Registers, updates, and validates simulation variables.
// NEVER executes. NEVER modifies data.

import type { SimulationVariable, SimulationScenarioVariant } from "./strategic-simulation-types";
import type { StrategicDomain } from "../strategic-advisor/strategic-advisor-types";
import { generateVariableId } from "./strategic-simulation-identity";

// ── Factory ───────────────────────────────────────────────────────────────────

export function registerVariable(params: {
  name:              string;
  description:       string;
  domain:            StrategicDomain;
  unit:              string;
  baselineValue:     number;
  optimisticValue:   number;
  pessimisticValue:  number;
  conservativeValue: number;
  currentValue?:     number;
  isControllable?:   boolean;
  sensitivity?:      "LOW" | "MEDIUM" | "HIGH";
  metadata?:         Record<string, unknown>;
}): SimulationVariable {
  return {
    id:                generateVariableId(),
    name:              params.name,
    description:       params.description,
    domain:            params.domain,
    unit:              params.unit,
    baselineValue:     params.baselineValue,
    optimisticValue:   params.optimisticValue,
    pessimisticValue:  params.pessimisticValue,
    conservativeValue: params.conservativeValue,
    currentValue:      params.currentValue ?? params.baselineValue,
    isControllable:    params.isControllable ?? false,
    sensitivity:       params.sensitivity ?? "MEDIUM",
    metadata:          params.metadata ?? {},
  };
}

// ── Update ────────────────────────────────────────────────────────────────────

export function updateVariable(
  variable: SimulationVariable,
  newCurrentValue: number
): SimulationVariable {
  return { ...variable, currentValue: newCurrentValue };
}

export function applyVariantToVariable(
  variable: SimulationVariable,
  variant: SimulationScenarioVariant
): SimulationVariable {
  const valueMap: Record<SimulationScenarioVariant, number> = {
    OPTIMISTIC:    variable.optimisticValue,
    CONSERVATIVE:  variable.conservativeValue,
    PESSIMISTIC:   variable.pessimisticValue,
    CUSTOM:        variable.currentValue,
  };
  return { ...variable, currentValue: valueMap[variant] };
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface VariableValidationResult {
  readonly valid:    boolean;
  readonly warnings: string[];
  readonly errors:   string[];
}

export function validateVariable(v: SimulationVariable): VariableValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  if (!v.name || v.name.trim().length === 0) errors.push("Variable name required");
  if (v.pessimisticValue > v.baselineValue) warnings.push(`Variable "${v.name}": pessimistic > baseline — check sign convention`);
  if (v.optimisticValue < v.baselineValue)  warnings.push(`Variable "${v.name}": optimistic < baseline — check sign convention`);

  return { valid: errors.length === 0, warnings, errors };
}

// ── Analysis ──────────────────────────────────────────────────────────────────

export function getHighSensitivityVariables(variables: SimulationVariable[]): SimulationVariable[] {
  return variables.filter((v) => v.sensitivity === "HIGH");
}

export function getControllableVariables(variables: SimulationVariable[]): SimulationVariable[] {
  return variables.filter((v) => v.isControllable);
}

export function computeVariableRange(v: SimulationVariable): number {
  return Math.abs(v.optimisticValue - v.pessimisticValue);
}

export function buildDefaultVariables(domain: StrategicDomain): SimulationVariable[] {
  const map: Record<string, Array<{ name: string; unit: string; baseline: number; opt: number; pess: number; cons: number; ctrl: boolean; sens: "LOW" | "MEDIUM" | "HIGH" }>> = {
    FINANCE: [
      { name: "Días de cobro promedio", unit: "días", baseline: 45, opt: 30, pess: 90, cons: 50, ctrl: true, sens: "HIGH" },
      { name: "Margen operativo", unit: "%", baseline: 18, opt: 25, pess: 8, cons: 16, ctrl: true, sens: "HIGH" },
    ],
    COMMERCIAL: [
      { name: "Tasa de conversión comercial", unit: "%", baseline: 22, opt: 35, pess: 12, cons: 20, ctrl: true, sens: "HIGH" },
      { name: "Ticket promedio", unit: "MXN", baseline: 15000, opt: 20000, pess: 10000, cons: 14000, ctrl: false, sens: "MEDIUM" },
    ],
    OPERATIONS: [
      { name: "Eficiencia operativa", unit: "%", baseline: 75, opt: 90, pess: 55, cons: 72, ctrl: true, sens: "MEDIUM" },
    ],
  };

  const varDefs = map[domain] ?? map["FINANCE"];
  return varDefs.map((d) =>
    registerVariable({
      name: d.name, description: d.name, domain, unit: d.unit,
      baselineValue: d.baseline, optimisticValue: d.opt, pessimisticValue: d.pess,
      conservativeValue: d.cons, isControllable: d.ctrl, sensitivity: d.sens,
    })
  );
}
