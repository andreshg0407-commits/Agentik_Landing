/**
 * lib/agents/runtime/agent-plan.ts
 *
 * Agentik — Universal Agent Runtime — Plan Model & Factory
 * Sprint: AGENTIK-AGENT-RUNTIME-01
 *
 * Factory functions for building AgentPlan and AgentPlanStep.
 * No AI. No LLM. No Prisma. Pure domain.
 */

import type { AgentId, AgentGoal, AgentPlan, AgentPlanStep, AgentCapabilityType } from "./agent-types";

// ── ID generation ─────────────────────────────────────────────────────────────

let _seq = 0;
function nextId(): string {
  _seq++;
  return `${Date.now()}_${(_seq).toString(36)}`;
}

export function createPlanId(): string {
  return `plan_${nextId()}`;
}

export function createStepId(label: string, index: number): string {
  const slug = label.toLowerCase().replace(/\s+/g, "_").slice(0, 20);
  return `step_${index}_${slug}`;
}

// ── Step factory ──────────────────────────────────────────────────────────────

export interface StepInput {
  label:       string;
  action:      AgentCapabilityType;
  params?:     Record<string, unknown>;
  dependsOn?:  string[];
  optional?:   boolean;
}

export function buildStep(input: StepInput, index: number): AgentPlanStep {
  return {
    id:         createStepId(input.label, index),
    label:      input.label,
    action:     input.action,
    params:     input.params ?? {},
    dependsOn:  input.dependsOn,
    optional:   input.optional ?? false,
  };
}

// ── Plan factory ──────────────────────────────────────────────────────────────

export interface PlanInput {
  agentId:   AgentId;
  goal:      AgentGoal;
  steps:     StepInput[];
  metadata?: Record<string, unknown>;
}

export function buildPlan(input: PlanInput): AgentPlan {
  const steps = input.steps.map((s, i) => buildStep(s, i));
  return {
    id:             createPlanId(),
    agentId:        input.agentId,
    goal:           input.goal,
    steps,
    estimatedSteps: steps.length,
    createdAt:      new Date().toISOString(),
    metadata:       input.metadata ?? {},
  };
}
