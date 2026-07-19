/**
 * lib/comercial/business-policy/packs/pack-validation.ts
 *
 * Structural validation for Policy Packs (FASE 6).
 *
 * Validates:
 *   - Duplicate categories
 *   - Duplicate policies
 *   - Invalid references
 *   - Wrong tenant
 *   - Empty pack
 *   - Missing categories
 *
 * Sprint: BUSINESS-POLICY-PACKS-01
 */

import type {
  BusinessPolicyPack,
  PackValidationResult,
  PackValidationIssue,
  PackValidationSeverity,
} from "./pack-types";
import { ALL_POLICY_CATEGORIES } from "../policy-types";

// ── Validate Pack ───────────────────────────────────────────────────────────

export function validatePack(pack: BusinessPolicyPack): PackValidationResult {
  const issues: PackValidationIssue[] = [];

  // ID
  if (!pack.id || pack.id.trim() === "") {
    issues.push(issue("id", "Pack ID is required", "ERROR"));
  }

  // Tenant
  if (!pack.tenantId || pack.tenantId.trim() === "") {
    issues.push(issue("tenantId", "Tenant ID is required", "ERROR"));
  }

  // Name
  if (!pack.name || pack.name.trim() === "") {
    issues.push(issue("name", "Pack name is required", "ERROR"));
  }

  // Version
  if (!pack.versionInfo.version || pack.versionInfo.version.trim() === "") {
    issues.push(issue("versionInfo.version", "Version is required", "ERROR"));
  }

  if (!pack.versionInfo.createdBy || pack.versionInfo.createdBy.trim() === "") {
    issues.push(issue("versionInfo.createdBy", "Created by is required", "ERROR"));
  }

  // Empty pack
  if (pack.categories.length === 0) {
    issues.push(issue("categories", "Pack has no categories", "ERROR"));
  }

  if (pack.policies.length === 0) {
    issues.push(issue("policies", "Pack has no policies", "WARNING"));
  }

  // Invalid categories
  for (const cat of pack.categories) {
    if (!ALL_POLICY_CATEGORIES.includes(cat)) {
      issues.push(issue("categories", `Invalid category: "${cat}"`, "ERROR"));
    }
  }

  // Duplicate categories
  const seenCategories = new Set<string>();
  for (const cat of pack.categories) {
    if (seenCategories.has(cat)) {
      issues.push(issue("categories", `Duplicate category: "${cat}"`, "ERROR"));
    }
    seenCategories.add(cat);
  }

  // Duplicate policies
  const seenPolicies = new Set<string>();
  for (const ref of pack.policies) {
    if (seenPolicies.has(ref.policyId)) {
      issues.push(issue("policies", `Duplicate policy: "${ref.policyId}"`, "ERROR"));
    }
    seenPolicies.add(ref.policyId);
  }

  // Policy category must be in pack categories
  for (const ref of pack.policies) {
    if (!pack.categories.includes(ref.category)) {
      issues.push(issue(
        "policies",
        `Policy "${ref.policyId}" has category "${ref.category}" not in pack categories`,
        "ERROR",
      ));
    }
  }

  // Categories with no policies (warning)
  const policyCats = new Set(pack.policies.map(p => p.category));
  for (const cat of pack.categories) {
    if (!policyCats.has(cat)) {
      issues.push(issue("categories", `Category "${cat}" has no policies assigned`, "WARNING"));
    }
  }

  return {
    valid: issues.every(i => i.severity !== "ERROR"),
    issues,
  };
}

// ── Helper ──────────────────────────────────────────────────────────────────

function issue(field: string, message: string, severity: PackValidationSeverity): PackValidationIssue {
  return { field, message, severity };
}
