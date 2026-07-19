/**
 * lib/agent-runtime/workflow-router.ts
 *
 * Agentik Agent Runtime — Workflow Router
 *
 * Decides whether a workflow step executes via n8n or the internal runtime.
 *
 * Rule:
 *   n8n    → data movement, external APIs, integrations, scheduled jobs, webhooks
 *   internal → agent reasoning, tool calling, action lifecycle, context evaluation
 *
 * Sprint: AGENTIK-AGENT-RUNTIME-ARCHITECTURE-01
 */

import type { AgentDomain } from "./agent-types";

// ── Workflow executor ─────────────────────────────────────────────────────────

export type WorkflowExecutor =
  | "n8n"       // executed by n8n (external webhook or workflow ID)
  | "internal"; // executed by the Agentik agent runtime

// ── Workflow status ───────────────────────────────────────────────────────────

export type WorkflowStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

// ── Retry policy ──────────────────────────────────────────────────────────────

export interface RetryPolicy {
  maxAttempts:    number;
  backoffMs:      number;   // initial backoff in ms (doubles each retry)
  retryOn:        string[]; // error codes / messages that trigger a retry
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  backoffMs:   1000,
  retryOn:     ["TIMEOUT", "NETWORK_ERROR", "RATE_LIMIT"],
};

// ── Workflow step ─────────────────────────────────────────────────────────────

export interface WorkflowStep {
  id:          string;
  name:        string;
  executor:    WorkflowExecutor;
  /** For n8n steps: the workflow ID or webhook path */
  n8nRef?:     string;
  /** For internal steps: the tool ID from tool-registry */
  toolId?:     string;
  /** Optional condition — step only runs when true */
  condition?:  string;   // expression evaluated against previous step output
  /** Input mapping from previous step output or context */
  inputMap?:   Record<string, string>;
}

// ── Workflow definition ───────────────────────────────────────────────────────

export interface AgentWorkflow {
  id:          string;
  name:        string;
  domain:      AgentDomain;
  steps:       WorkflowStep[];
  retryPolicy: RetryPolicy;
  /** ISO timestamp of last execution */
  lastRunAt?:  string;
  status?:     WorkflowStatus;
}

// ── Routing logic ─────────────────────────────────────────────────────────────

/**
 * Classify whether a workflow step should run in n8n or internally.
 *
 * Heuristic:
 *   - Steps with external API calls, webhooks, or scheduled triggers → n8n
 *   - Steps with tool calling, agent reasoning, or action lifecycle → internal
 */
export function classifyWorkflowStep(step: WorkflowStep): WorkflowExecutor {
  return step.executor;
}

/**
 * Examples of n8n workflows (data & integrations):
 *   - SAG SOAP → parse → upsert CommercialCoverageSnapshot
 *   - Instagram post publish
 *   - WhatsApp collection reminder
 *   - Daily financial snapshot cron
 *   - Shopify catalog sync
 *
 * Examples of internal workflows (agent intelligence):
 *   - Evaluate coverage context → generate AgentAction
 *   - Check reconciliation status → suggest payment candidate
 *   - Analyze campaign signals → draft campaign brief
 */
export const N8N_WORKFLOW_EXAMPLES: string[] = [
  "sag-inventory-sync",
  "social-post-publish",
  "whatsapp-collection-reminder",
  "daily-financial-snapshot",
  "shopify-catalog-sync",
  "marketing-report-email",
];

export const INTERNAL_WORKFLOW_EXAMPLES: string[] = [
  "commercial-coverage-evaluation",
  "financial-reconciliation-triage",
  "collection-portfolio-review",
  "campaign-performance-analysis",
];
