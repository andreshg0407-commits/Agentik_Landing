/**
 * lib/comercial/business-policy/templates/store/store-policy-template-validation.ts
 *
 * Validation for Store Policy Templates and their instantiation inputs (FASE 5).
 *
 * Sprint: STORE-POLICY-TEMPLATES-01
 */

import type {
  StorePolicyTemplate,
  TemplateValidationResult,
  TemplateValidationIssue,
  TemplateValidationSeverity,
  TemplateInstantiationInput,
} from "./store-policy-template-types";
import { ALL_STORE_TEMPLATE_TYPES } from "./store-policy-template-types";
import { ALL_POLICY_CATEGORIES, ALL_POLICY_SCOPES } from "../../policy-types";

// ── Validate Template ───────────────────────────────────────────────────────

export function validateTemplate(template: StorePolicyTemplate): TemplateValidationResult {
  const issues: TemplateValidationIssue[] = [];

  // templateId
  if (!template.templateId || template.templateId.trim() === "") {
    issues.push(issue("templateId", "Template ID is required", "ERROR"));
  }

  // templateType
  if (!ALL_STORE_TEMPLATE_TYPES.includes(template.templateType)) {
    issues.push(issue("templateType", `Invalid template type: "${template.templateType}"`, "ERROR"));
  }

  // category
  if (!ALL_POLICY_CATEGORIES.includes(template.category)) {
    issues.push(issue("category", `Invalid category: "${template.category}"`, "ERROR"));
  }

  // displayName
  if (!template.displayName || template.displayName.trim() === "") {
    issues.push(issue("displayName", "Display name is required", "ERROR"));
  }

  // description
  if (!template.description || template.description.trim() === "") {
    issues.push(issue("description", "Description is required", "ERROR"));
  }

  // supportedScopes
  if (template.supportedScopes.length === 0) {
    issues.push(issue("supportedScopes", "At least one supported scope is required", "ERROR"));
  }
  for (const scope of template.supportedScopes) {
    if (!ALL_POLICY_SCOPES.includes(scope)) {
      issues.push(issue("supportedScopes", `Invalid scope: "${scope}"`, "ERROR"));
    }
  }

  // Duplicate scopes
  const scopeSet = new Set<string>();
  for (const scope of template.supportedScopes) {
    if (scopeSet.has(scope)) {
      issues.push(issue("supportedScopes", `Duplicate scope: "${scope}"`, "ERROR"));
    }
    scopeSet.add(scope);
  }

  // version
  if (!template.version || template.version.trim() === "") {
    issues.push(issue("version", "Version is required", "ERROR"));
  }

  // metadata
  if (!template.metadata) {
    issues.push(issue("metadata", "Metadata is required", "ERROR"));
  } else {
    if (!template.metadata.author) issues.push(issue("metadata.author", "Author is required", "ERROR"));
    if (!template.metadata.createdAt) issues.push(issue("metadata.createdAt", "Created date is required", "ERROR"));
    if (!template.metadata.usageHint) issues.push(issue("metadata.usageHint", "Usage hint is required", "ERROR"));
  }

  // precedenceGroup
  if (!template.precedenceGroup) {
    issues.push(issue("precedenceGroup", "Precedence group is required", "ERROR"));
  }

  // Duplicate parameter names
  const allParams = [...template.requiredParameters, ...template.optionalParameters];
  const paramNames = new Set<string>();
  for (const p of allParams) {
    if (paramNames.has(p.name)) {
      issues.push(issue("parameters", `Duplicate parameter name: "${p.name}"`, "ERROR"));
    }
    paramNames.add(p.name);
  }

  // PLANNED templates should have no required parameters
  if (template.status === "PLANNED" && template.requiredParameters.length > 0) {
    issues.push(issue("requiredParameters", "Planned templates should not have required parameters", "WARNING"));
  }

  return {
    valid: issues.every(i => i.severity !== "ERROR"),
    issues,
  };
}

// ── Validate Instantiation ──────────────────────────────────────────────────

export function validateInstantiation(
  input: TemplateInstantiationInput,
  template: StorePolicyTemplate,
): TemplateValidationResult {
  const issues: TemplateValidationIssue[] = [];

  // Template must be active
  if (template.status !== "ACTIVE") {
    issues.push(issue("templateId", `Template "${template.templateId}" is ${template.status}, cannot instantiate`, "ERROR"));
  }

  // tenantId
  if (!input.tenantId || input.tenantId.trim() === "") {
    issues.push(issue("tenantId", "Tenant ID is required", "ERROR"));
  }

  // policyName
  if (!input.policyName || input.policyName.trim() === "") {
    issues.push(issue("policyName", "Policy name is required", "ERROR"));
  }

  // createdBy
  if (!input.createdBy || input.createdBy.trim() === "") {
    issues.push(issue("createdBy", "Created by is required", "ERROR"));
  }

  // Scope bindings must be in supported scopes
  for (const binding of input.scopeBindings) {
    if (!template.supportedScopes.includes(binding.scope)) {
      issues.push(issue("scopeBindings", `Scope "${binding.scope}" not supported by template "${template.templateType}"`, "ERROR"));
    }
  }

  // Required parameters must be provided
  for (const param of template.requiredParameters) {
    if (!(param.name in input.parameterValues)) {
      issues.push(issue("parameterValues", `Required parameter "${param.name}" is missing`, "ERROR"));
    }
  }

  // Parameter values must match constraints
  for (const param of [...template.requiredParameters, ...template.optionalParameters]) {
    const value = input.parameterValues[param.name];
    if (value === undefined) continue;

    if (param.type === "NUMBER" && typeof value !== "number") {
      issues.push(issue("parameterValues", `Parameter "${param.name}" must be a number`, "ERROR"));
    }

    if (param.type === "STRING" && typeof value !== "string") {
      issues.push(issue("parameterValues", `Parameter "${param.name}" must be a string`, "ERROR"));
    }

    if (param.type === "BOOLEAN" && typeof value !== "boolean") {
      issues.push(issue("parameterValues", `Parameter "${param.name}" must be a boolean`, "ERROR"));
    }

    if (param.constraints && typeof value === "number") {
      if (param.constraints.min !== undefined && value < param.constraints.min) {
        issues.push(issue("parameterValues", `Parameter "${param.name}" must be >= ${param.constraints.min}`, "ERROR"));
      }
      if (param.constraints.max !== undefined && value > param.constraints.max) {
        issues.push(issue("parameterValues", `Parameter "${param.name}" must be <= ${param.constraints.max}`, "ERROR"));
      }
    }

    if (param.constraints?.allowedValues && !param.constraints.allowedValues.includes(value)) {
      issues.push(issue("parameterValues", `Parameter "${param.name}" must be one of: ${param.constraints.allowedValues.join(", ")}`, "ERROR"));
    }
  }

  // Unknown parameters
  const knownParams = new Set([
    ...template.requiredParameters.map(p => p.name),
    ...template.optionalParameters.map(p => p.name),
  ]);
  for (const key of Object.keys(input.parameterValues)) {
    if (!knownParams.has(key)) {
      issues.push(issue("parameterValues", `Unknown parameter: "${key}"`, "WARNING"));
    }
  }

  // Conditions must use allowed operators
  for (const cond of input.conditionValues) {
    const condDesc = template.supportedConditions.find(c => c.field === cond.field);
    if (!condDesc) {
      issues.push(issue("conditionValues", `Unknown condition field: "${cond.field}"`, "WARNING"));
    } else if (!condDesc.allowedOperators.includes(cond.operator)) {
      issues.push(issue("conditionValues", `Operator "${cond.operator}" not allowed for field "${cond.field}"`, "ERROR"));
    }
  }

  // Required conditions
  for (const condDesc of template.supportedConditions) {
    if (condDesc.required && !input.conditionValues.some(c => c.field === condDesc.field)) {
      issues.push(issue("conditionValues", `Required condition "${condDesc.field}" is missing`, "ERROR"));
    }
  }

  return {
    valid: issues.every(i => i.severity !== "ERROR"),
    issues,
  };
}

// ── Helper ──────────────────────────────────────────────────────────────────

function issue(field: string, message: string, severity: TemplateValidationSeverity): TemplateValidationIssue {
  return { field, message, severity };
}
