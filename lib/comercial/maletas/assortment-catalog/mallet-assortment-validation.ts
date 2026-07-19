/**
 * lib/comercial/maletas/assortment-catalog/mallet-assortment-validation.ts
 *
 * Validation for catalogs and evaluation inputs.
 *
 * Sprint: CASTILLITOS-MALLET-POLICIES-01
 */

import type {
  MalletAssortmentCatalog,
  MalletAssortmentEvaluationInput,
  CatalogValidationResult,
  CatalogValidationIssue,
} from "./mallet-assortment-types";

// ── Catalog Validation ──────────────────────────────────────────────────────

export function validateCatalog(
  catalog: MalletAssortmentCatalog,
): CatalogValidationResult {
  const issues: CatalogValidationIssue[] = [];

  if (!catalog.catalogId || catalog.catalogId.trim().length === 0) {
    issues.push({ field: "catalogId", message: "catalogId is required", severity: "ERROR" });
  }
  if (!catalog.tenantId || catalog.tenantId.trim().length === 0) {
    issues.push({ field: "tenantId", message: "tenantId is required", severity: "ERROR" });
  }
  if (!catalog.name || catalog.name.trim().length === 0) {
    issues.push({ field: "name", message: "name is required", severity: "ERROR" });
  }
  if (!catalog.version || catalog.version.trim().length === 0) {
    issues.push({ field: "version", message: "version is required", severity: "ERROR" });
  }
  if (!catalog.commercialWorld) {
    issues.push({ field: "commercialWorld", message: "commercialWorld is required", severity: "ERROR" });
  }
  if (catalog.commercialWorld !== "TEXTIL" && catalog.commercialWorld !== "IMPORTACION") {
    issues.push({ field: "commercialWorld", message: "commercialWorld must be TEXTIL or IMPORTACION", severity: "ERROR" });
  }
  if (!catalog.status) {
    issues.push({ field: "status", message: "status is required", severity: "ERROR" });
  }
  if (!catalog.groups || catalog.groups.length === 0) {
    issues.push({ field: "groups", message: "At least one group is required", severity: "ERROR" });
  }

  // Validate groups
  const groupCodes = new Set<string>();
  for (const group of catalog.groups) {
    if (!group.groupCode || group.groupCode.trim().length === 0) {
      issues.push({ field: "groups.groupCode", message: "groupCode is required", severity: "ERROR" });
    }
    if (!group.groupName || group.groupName.trim().length === 0) {
      issues.push({ field: "groups.groupName", message: "groupName is required", severity: "ERROR" });
    }
    if (groupCodes.has(group.groupCode)) {
      issues.push({ field: "groups.groupCode", message: `Duplicate group code: ${group.groupCode}`, severity: "ERROR" });
    }
    groupCodes.add(group.groupCode);

    if (!group.entries || group.entries.length === 0) {
      issues.push({ field: `groups.${group.groupCode}.entries`, message: `Group ${group.groupCode} has no entries`, severity: "WARNING" });
    }

    // Validate entries within group
    const subgroupCodes = new Set<string>();
    for (const ent of group.entries) {
      if (!ent.subgroupName || ent.subgroupName.trim().length === 0) {
        issues.push({ field: `groups.${group.groupCode}.entries.subgroupName`, message: "subgroupName is required", severity: "ERROR" });
      }
      if (ent.targetUnits < 0) {
        issues.push({ field: `groups.${group.groupCode}.entries.targetUnits`, message: "targetUnits must be >= 0", severity: "ERROR" });
      }
      if (ent.minUnits !== null && ent.minUnits < 0) {
        issues.push({ field: `groups.${group.groupCode}.entries.minUnits`, message: "minUnits must be >= 0", severity: "ERROR" });
      }
      if (ent.maxUnits !== null && ent.maxUnits < 0) {
        issues.push({ field: `groups.${group.groupCode}.entries.maxUnits`, message: "maxUnits must be >= 0", severity: "ERROR" });
      }
      if (ent.minUnits !== null && ent.maxUnits !== null && ent.minUnits > ent.maxUnits) {
        issues.push({ field: `groups.${group.groupCode}.entries`, message: "minUnits must be <= maxUnits", severity: "ERROR" });
      }

      const key = ent.subgroupCode ?? ent.subgroupName;
      if (subgroupCodes.has(key)) {
        issues.push({ field: `groups.${group.groupCode}.entries`, message: `Duplicate subgroup in group ${group.groupCode}: ${key}`, severity: "ERROR" });
      }
      subgroupCodes.add(key);
    }
  }

  // Evidence validation
  if (!catalog.evidence) {
    issues.push({ field: "evidence", message: "evidence is required", severity: "ERROR" });
  }

  return {
    valid: issues.filter((i) => i.severity === "ERROR").length === 0,
    issues,
  };
}

// ── Evaluation Input Validation ─────────────────────────────────────────────

export function validateEvaluationInput(
  input: MalletAssortmentEvaluationInput,
): CatalogValidationResult {
  const issues: CatalogValidationIssue[] = [];

  if (!input.tenantId || input.tenantId.trim().length === 0) {
    issues.push({ field: "tenantId", message: "tenantId is required", severity: "ERROR" });
  }
  if (!input.malletId || input.malletId.trim().length === 0) {
    issues.push({ field: "malletId", message: "malletId is required", severity: "ERROR" });
  }
  if (!input.vendorId || input.vendorId.trim().length === 0) {
    issues.push({ field: "vendorId", message: "vendorId is required", severity: "ERROR" });
  }
  if (!input.catalog) {
    issues.push({ field: "catalog", message: "catalog is required", severity: "ERROR" });
  }
  if (input.catalog && input.catalog.status !== "ACTIVE") {
    issues.push({ field: "catalog.status", message: "catalog must be ACTIVE", severity: "ERROR" });
  }
  if (input.catalog && input.catalog.tenantId !== input.tenantId) {
    issues.push({ field: "catalog.tenantId", message: "catalog tenantId must match input tenantId", severity: "ERROR" });
  }
  if (!input.traceId || input.traceId.trim().length === 0) {
    issues.push({ field: "traceId", message: "traceId is required", severity: "ERROR" });
  }

  return {
    valid: issues.filter((i) => i.severity === "ERROR").length === 0,
    issues,
  };
}
