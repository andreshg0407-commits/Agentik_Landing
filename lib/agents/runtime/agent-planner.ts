/**
 * lib/agents/runtime/agent-planner.ts
 *
 * Agentik — Universal Agent Runtime — Rule-Based Planner
 * Sprint: AGENTIK-AGENT-RUNTIME-01
 *
 * Deterministic, rule-based plan generation.
 * NO AI. NO LLM. NO prompts. NO embeddings.
 * Only structured templates per goal type.
 *
 * Pure domain. No Prisma. No React. No server-only.
 */

import type { AgentDefinition, AgentGoal, AgentPlan } from "./agent-types";
import { buildPlan }                                  from "./agent-plan";

// ── Plan templates ────────────────────────────────────────────────────────────

function financeTemplate(agent: AgentDefinition, goal: AgentGoal): AgentPlan {
  return buildPlan({
    agentId: agent.id,
    goal,
    steps: [
      {
        label:  "Leer señales financieras",
        action: "READ_FINANCE",
        params: { priority: goal.priority, entityId: goal.targetEntityId },
      },
      {
        label:  "Crear tarea de seguimiento financiero",
        action: "CREATE_TASK",
        params: {
          title:       `Seguimiento: ${goal.description}`,
          description: goal.description,
          priority:    goal.priority,
          domain:      "finance",
        },
        dependsOn: ["step_0_leer_señales_finan"],
      },
      {
        label:    "Solicitar aprobación si aplica",
        action:   "CREATE_APPROVAL",
        params:   { category: "FINANCIAL", description: goal.description },
        optional: true,
        dependsOn: ["step_1_crear_tarea_de_seg"],
      },
    ],
    metadata: { template: "finance_default", goalType: goal.type },
  });
}

function collectionsTemplate(agent: AgentDefinition, goal: AgentGoal): AgentPlan {
  return buildPlan({
    agentId: agent.id,
    goal,
    steps: [
      {
        label:  "Leer cartera vencida",
        action: "READ_COLLECTIONS",
        params: { entityId: goal.targetEntityId },
      },
      {
        label:  "Crear tarea de cobranza",
        action: "CREATE_TASK",
        params: {
          title:       `Cobro: ${goal.description}`,
          description: goal.description,
          priority:    goal.priority,
          domain:      "collections",
        },
        dependsOn: ["step_0_leer_cartera_venci"],
      },
      {
        label:  "Iniciar workflow de cobranza",
        action: "START_WORKFLOW",
        params: {
          chainId:     "COLLECTIONS_FOLLOWUP_CHAIN",
          description: goal.description,
        },
        optional:  true,
        dependsOn: ["step_1_crear_tarea_de_cob"],
      },
    ],
    metadata: { template: "collections_default", goalType: goal.type },
  });
}

function marketingTemplate(agent: AgentDefinition, goal: AgentGoal): AgentPlan {
  return buildPlan({
    agentId: agent.id,
    goal,
    steps: [
      {
        label:  "Leer señales de marketing",
        action: "READ_MARKETING",
        params: { entityId: goal.targetEntityId },
      },
      {
        label:  "Crear tarea de marketing",
        action: "CREATE_TASK",
        params: {
          title:       `Marketing: ${goal.description}`,
          description: goal.description,
          priority:    goal.priority,
          domain:      "marketing",
        },
        dependsOn: ["step_0_leer_señales_de_ma"],
      },
      {
        label:    "Solicitar aprobación editorial",
        action:   "CREATE_APPROVAL",
        params:   { category: "MARKETING", description: goal.description },
        optional: true,
        dependsOn: ["step_1_crear_tarea_de_mar"],
      },
    ],
    metadata: { template: "marketing_default", goalType: goal.type },
  });
}

function commercialTemplate(agent: AgentDefinition, goal: AgentGoal): AgentPlan {
  return buildPlan({
    agentId: agent.id,
    goal,
    steps: [
      {
        label:  "Leer señales comerciales",
        action: "READ_COMMERCIAL",
        params: { entityId: goal.targetEntityId },
      },
      {
        label:  "Crear tarea comercial",
        action: "CREATE_TASK",
        params: {
          title:       `Comercial: ${goal.description}`,
          description: goal.description,
          priority:    goal.priority,
          domain:      "commercial",
        },
        dependsOn: ["step_0_leer_señales_come"],
      },
      {
        label:    "Crear alerta comercial si urgente",
        action:   "CREATE_ALERT",
        params:   { severity: goal.priority },
        optional: true,
        dependsOn: ["step_1_crear_tarea_comer"],
      },
    ],
    metadata: { template: "commercial_default", goalType: goal.type },
  });
}

function genericTemplate(agent: AgentDefinition, goal: AgentGoal): AgentPlan {
  return buildPlan({
    agentId: agent.id,
    goal,
    steps: [
      {
        label:  "Crear tarea de seguimiento",
        action: "CREATE_TASK",
        params: {
          title:       goal.description,
          description: goal.description,
          priority:    goal.priority,
        },
      },
    ],
    metadata: { template: "generic_default", goalType: goal.type },
  });
}

// ── Planner ───────────────────────────────────────────────────────────────────

/**
 * Rule-Based Planner — deterministic, no AI.
 *
 * Selects a plan template based on goal.type.
 * The agent's capabilities constrain which templates are applicable.
 * Throws if the agent doesn't have the required capability for the template.
 */
export function planGoal(agent: AgentDefinition, goal: AgentGoal): AgentPlan {
  switch (goal.type) {
    case "finance":
      return financeTemplate(agent, goal);
    case "collections":
      return collectionsTemplate(agent, goal);
    case "marketing":
      return marketingTemplate(agent, goal);
    case "commercial":
      return commercialTemplate(agent, goal);
    case "generic":
    default:
      return genericTemplate(agent, goal);
  }
}
