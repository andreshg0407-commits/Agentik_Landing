/**
 * lib/comercial/business-policy/templates/store/index.ts
 *
 * Public barrel for Store Policy Templates.
 *
 * Sprint: STORE-POLICY-TEMPLATES-01
 */

// ── Types ───────────────────────────────────────────────────────────────────

export type {
  StorePolicyTemplateType,
  TemplateStatus,
  PrecedenceGroup,
  StorePolicyTemplate,
  TemplateMetadata,
  TemplateParameterDescriptor,
  ParameterConstraints,
  TemplateConditionDescriptor,
  TemplateActionDescriptor,
  TemplateInstantiationInput,
  TemplateValidationResult,
  TemplateValidationIssue,
  TemplateValidationSeverity,
} from "./store-policy-template-types";

export {
  ACTIVE_TEMPLATE_TYPES,
  PLANNED_TEMPLATE_TYPES,
  ALL_STORE_TEMPLATE_TYPES,
  PRECEDENCE_VALUES,
} from "./store-policy-template-types";

// ── Registry ────────────────────────────────────────────────────────────────

export {
  registerTemplate,
  getTemplate,
  getTemplateByType,
  listTemplates,
  resolveTemplate,
  _clearTemplateRegistry,
} from "./store-policy-template-registry";

// ── Validation ──────────────────────────────────────────────────────────────

export {
  validateTemplate,
  validateInstantiation,
} from "./store-policy-template-validation";

// ── Builders ────────────────────────────────────────────────────────────────

export {
  buildStoreCoverageTemplate,
  buildStoreAssortmentTemplate,
  buildStoreSizeTargetTemplate,
  buildStoreStockRestrictionTemplate,
  buildStoreProductExceptionTemplate,
  buildStoreDeviationAlertTemplate,
} from "./store-policy-template-builders";

export type { TemplateBuildResult } from "./store-policy-template-builders";
