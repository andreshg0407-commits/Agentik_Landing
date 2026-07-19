/**
 * lib/comercial/business-policy/templates/store/store-policy-template-builders.ts
 *
 * Builders (FASE 4).
 * Each builder takes generic parameters and produces a BusinessPolicy
 * compatible with the Policy Engine. No registration, no activation.
 *
 * Sprint: STORE-POLICY-TEMPLATES-01
 */

import type { BusinessPolicy, BusinessPolicyParameter } from "../../policy-types";
import type {
  TemplateInstantiationInput,
  TemplateValidationResult,
} from "./store-policy-template-types";
import { getTemplateByType } from "./store-policy-template-registry";
import { validateInstantiation } from "./store-policy-template-validation";
import { PRECEDENCE_VALUES } from "./store-policy-template-types";

// ── Builder Result ──────────────────────────────────────────────────────────

export interface TemplateBuildResult {
  readonly success: boolean;
  readonly policy: BusinessPolicy | null;
  readonly validation: TemplateValidationResult;
}

// ── Generic Builder ─────────────────────────────────────────────────────────

function buildFromTemplate(input: TemplateInstantiationInput): TemplateBuildResult {
  const template = getTemplateByType(
    // Resolve template type from templateId
    (() => {
      const tpl = (() => {
        // Import inline to avoid circular — just look up by ID
        const { getTemplate } = require("./store-policy-template-registry");
        return getTemplate(input.templateId);
      })();
      return tpl?.templateType;
    })() as any,
  );

  if (!template) {
    return {
      success: false,
      policy: null,
      validation: {
        valid: false,
        issues: [{ field: "templateId", message: `Template "${input.templateId}" not found`, severity: "ERROR" }],
      },
    };
  }

  const validation = validateInstantiation(input, template);
  if (!validation.valid) {
    return { success: false, policy: null, validation };
  }

  const parameters: BusinessPolicyParameter[] = Object.entries(input.parameterValues).map(
    ([name, value]) => {
      const descriptor = [...template.requiredParameters, ...template.optionalParameters].find(p => p.name === name);
      return {
        name,
        type: descriptor?.type ?? "STRING",
        value,
        description: descriptor?.description ?? null,
        unit: descriptor?.unit ?? null,
      };
    },
  );

  const basePriority = PRECEDENCE_VALUES[template.precedenceGroup] ?? 200;

  const policy: BusinessPolicy = {
    id: `${template.templateType.toLowerCase()}-${input.tenantId}-${Date.now()}`,
    tenantId: input.tenantId,
    category: template.category,
    name: input.policyName,
    description: input.policyDescription,
    scopes: input.scopeBindings.map(s => ({ scope: s.scope, scopeValue: s.scopeValue })),
    conditions: input.conditionValues.map(c => ({ field: c.field, operator: c.operator, value: c.value, description: null })),
    actions: template.supportedActions.filter(a => a.required).map(a => ({ type: a.type, target: a.target, value: null, description: a.description })),
    parameters,
    priority: input.priority || basePriority,
    status: "DRAFT",
    versionInfo: {
      version: "1.0.0",
      createdAt: new Date(),
      createdBy: input.createdBy,
      activatedAt: null,
      deprecatedAt: null,
      previousVersion: null,
      changeNote: `Instantiated from template ${template.templateId} v${template.version}`,
    },
    tags: [...input.tags, `template:${template.templateId}`],
    metadata: {
      sourceTemplate: template.templateId,
      sourceTemplateVersion: template.version,
      precedenceGroup: template.precedenceGroup,
    },
  };

  return { success: true, policy, validation };
}

// ── Specific Builders ───────────────────────────────────────────────────────

export function buildStoreCoverageTemplate(input: TemplateInstantiationInput): TemplateBuildResult {
  return buildForType("tpl-store-coverage", input);
}

export function buildStoreAssortmentTemplate(input: TemplateInstantiationInput): TemplateBuildResult {
  return buildForType("tpl-store-assortment", input);
}

export function buildStoreSizeTargetTemplate(input: TemplateInstantiationInput): TemplateBuildResult {
  return buildForType("tpl-store-size-target", input);
}

export function buildStoreStockRestrictionTemplate(input: TemplateInstantiationInput): TemplateBuildResult {
  return buildForType("tpl-store-stock-restriction", input);
}

export function buildStoreProductExceptionTemplate(input: TemplateInstantiationInput): TemplateBuildResult {
  return buildForType("tpl-store-product-exception", input);
}

export function buildStoreDeviationAlertTemplate(input: TemplateInstantiationInput): TemplateBuildResult {
  return buildForType("tpl-store-deviation-alert", input);
}

// ── Helper ──────────────────────────────────────────────────────────────────

function buildForType(expectedTemplateId: string, input: TemplateInstantiationInput): TemplateBuildResult {
  // Ensure the input templateId matches
  const correctedInput = { ...input, templateId: expectedTemplateId };

  const { getTemplate } = require("./store-policy-template-registry") as typeof import("./store-policy-template-registry");
  const template = getTemplate(expectedTemplateId);

  if (!template) {
    return {
      success: false,
      policy: null,
      validation: {
        valid: false,
        issues: [{ field: "templateId", message: `Template "${expectedTemplateId}" not found in registry`, severity: "ERROR" }],
      },
    };
  }

  const validation = validateInstantiation(correctedInput, template);
  if (!validation.valid) {
    return { success: false, policy: null, validation };
  }

  const parameters: BusinessPolicyParameter[] = Object.entries(correctedInput.parameterValues).map(
    ([name, value]) => {
      const descriptor = [...template.requiredParameters, ...template.optionalParameters].find(p => p.name === name);
      return {
        name,
        type: descriptor?.type ?? "STRING",
        value,
        description: descriptor?.description ?? null,
        unit: descriptor?.unit ?? null,
      };
    },
  );

  const basePriority = PRECEDENCE_VALUES[template.precedenceGroup] ?? 200;

  const policy: BusinessPolicy = {
    id: `${template.templateType.toLowerCase()}-${correctedInput.tenantId}-${Date.now()}`,
    tenantId: correctedInput.tenantId,
    category: template.category,
    name: correctedInput.policyName,
    description: correctedInput.policyDescription,
    scopes: correctedInput.scopeBindings.map(s => ({ scope: s.scope, scopeValue: s.scopeValue })),
    conditions: correctedInput.conditionValues.map(c => ({ field: c.field, operator: c.operator, value: c.value, description: null })),
    actions: template.supportedActions.filter(a => a.required).map(a => ({ type: a.type, target: a.target, value: null, description: a.description })),
    parameters,
    priority: correctedInput.priority || basePriority,
    status: "DRAFT",
    versionInfo: {
      version: "1.0.0",
      createdAt: new Date(),
      createdBy: correctedInput.createdBy,
      activatedAt: null,
      deprecatedAt: null,
      previousVersion: null,
      changeNote: `Instantiated from template ${template.templateId} v${template.version}`,
    },
    tags: [...correctedInput.tags, `template:${template.templateId}`],
    metadata: {
      sourceTemplate: template.templateId,
      sourceTemplateVersion: template.version,
      precedenceGroup: template.precedenceGroup,
    },
  };

  return { success: true, policy, validation };
}
