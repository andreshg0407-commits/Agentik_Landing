/**
 * lib/comercial/business-policy/policy-validation.ts
 *
 * Policy Validation (FASE 8 - validatePolicy).
 * Structural validation of policy definitions.
 *
 * Sprint: BUSINESS-POLICY-ENGINE-01
 */

import type {
  BusinessPolicy,
  PolicyValidationResult,
  PolicyValidationIssue,
  PolicyValidationSeverity,
} from "./policy-types";
import { ALL_POLICY_CATEGORIES, ALL_POLICY_SCOPES } from "./policy-types";
import { isScopeAllowed, getRequiredParameters } from "./policy-registry";

// ── Validate ────────────────────────────────────────────────────────────────

export function validatePolicy(policy: BusinessPolicy): PolicyValidationResult {
  const issues: PolicyValidationIssue[] = [];

  // ID
  if (!policy.id || policy.id.trim() === "") {
    issues.push(issue("id", "Policy ID is required", "ERROR"));
  }

  // Tenant
  if (!policy.tenantId || policy.tenantId.trim() === "") {
    issues.push(issue("tenantId", "Tenant ID is required", "ERROR"));
  }

  // Category
  if (!ALL_POLICY_CATEGORIES.includes(policy.category)) {
    issues.push(issue("category", `Invalid category: "${policy.category}"`, "ERROR"));
  }

  // Name
  if (!policy.name || policy.name.trim() === "") {
    issues.push(issue("name", "Policy name is required", "ERROR"));
  }

  // Priority
  if (typeof policy.priority !== "number" || policy.priority < 0) {
    issues.push(issue("priority", "Priority must be a non-negative number", "ERROR"));
  }

  // Scopes
  for (const s of policy.scopes) {
    if (!ALL_POLICY_SCOPES.includes(s.scope)) {
      issues.push(issue("scopes", `Invalid scope: "${s.scope}"`, "ERROR"));
    } else if (!isScopeAllowed(policy.category, s.scope)) {
      issues.push(issue("scopes", `Scope "${s.scope}" is not allowed for category "${policy.category}"`, "WARNING"));
    }
  }

  // Required parameters
  const required = getRequiredParameters(policy.category);
  const paramNames = new Set(policy.parameters.map(p => p.name));
  for (const rp of required) {
    if (!paramNames.has(rp)) {
      issues.push(issue("parameters", `Required parameter "${rp}" is missing`, "ERROR"));
    }
  }

  // Version info
  if (!policy.versionInfo.version || policy.versionInfo.version.trim() === "") {
    issues.push(issue("versionInfo.version", "Version is required", "ERROR"));
  }

  if (!policy.versionInfo.createdBy || policy.versionInfo.createdBy.trim() === "") {
    issues.push(issue("versionInfo.createdBy", "Created by is required", "ERROR"));
  }

  // Conditions
  for (let i = 0; i < policy.conditions.length; i++) {
    const c = policy.conditions[i];
    if (!c.field || c.field.trim() === "") {
      issues.push(issue(`conditions[${i}].field`, "Condition field is required", "ERROR"));
    }
    if (!c.operator) {
      issues.push(issue(`conditions[${i}].operator`, "Condition operator is required", "ERROR"));
    }
  }

  // Actions
  for (let i = 0; i < policy.actions.length; i++) {
    const a = policy.actions[i];
    if (!a.type) {
      issues.push(issue(`actions[${i}].type`, "Action type is required", "ERROR"));
    }
    if (!a.target || a.target.trim() === "") {
      issues.push(issue(`actions[${i}].target`, "Action target is required", "ERROR"));
    }
  }

  // No actions and no parameters is suspicious
  if (policy.actions.length === 0 && policy.parameters.length === 0) {
    issues.push(issue("actions", "Policy has no actions and no parameters — it has no effect", "WARNING"));
  }

  return {
    valid: issues.every(i => i.severity !== "ERROR"),
    issues,
  };
}

// ── Helper ──────────────────────────────────────────────────────────────────

function issue(field: string, message: string, severity: PolicyValidationSeverity): PolicyValidationIssue {
  return { field, message, severity };
}
