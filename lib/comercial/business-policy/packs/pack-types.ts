/**
 * lib/comercial/business-policy/packs/pack-types.ts
 *
 * Canonical types for Business Policy Packs.
 * A Pack groups all active policies for a tenant into a single
 * versioned, activatable container.
 *
 * Sprint: BUSINESS-POLICY-PACKS-01
 */

import type { PolicyCategory, BusinessPolicy } from "../policy-types";

// ── Pack Status ─────────────────────────────────────────────────────────────

export type PackStatus = "DRAFT" | "ACTIVE" | "DEPRECATED" | "ARCHIVED";

// ── Pack Reference ──────────────────────────────────────────────────────────

/**
 * A lightweight pointer from a Pack to one of its member policies.
 * The policy itself lives in the Policy Engine store;
 * the Pack only holds a reference.
 */
export interface BusinessPolicyPackReference {
  readonly policyId: string;
  readonly category: PolicyCategory;
  readonly policyName: string;
  readonly policyVersion: string;
  readonly addedAt: Date;
}

// ── Pack Version ────────────────────────────────────────────────────────────

export interface BusinessPolicyPackVersion {
  readonly version: string;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly activatedAt: Date | null;
  readonly deprecatedAt: Date | null;
  readonly previousVersion: string | null;
  readonly changeNote: string | null;
}

// ── Business Policy Pack ────────────────────────────────────────────────────

export interface BusinessPolicyPack {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: PackStatus;
  readonly categories: readonly PolicyCategory[];
  readonly policies: readonly BusinessPolicyPackReference[];
  readonly versionInfo: BusinessPolicyPackVersion;
  readonly tags: readonly string[];
  readonly metadata: Record<string, unknown>;
}

// ── Pack Summary ────────────────────────────────────────────────────────────

export interface BusinessPolicyPackSummary {
  readonly packId: string;
  readonly tenantId: string;
  readonly name: string;
  readonly version: string;
  readonly status: PackStatus;
  readonly categoryCount: number;
  readonly policyCount: number;
  readonly categories: readonly PolicyCategory[];
  readonly activatedAt: Date | null;
}

// ── Pack Activation ─────────────────────────────────────────────────────────

export interface BusinessPolicyPackActivation {
  readonly packId: string;
  readonly tenantId: string;
  readonly version: string;
  readonly activatedAt: Date;
  readonly activatedBy: string;
  readonly previousPackId: string | null;
  readonly previousVersion: string | null;
}

// ── Pack Validation ─────────────────────────────────────────────────────────

export type PackValidationSeverity = "ERROR" | "WARNING" | "INFO";

export interface PackValidationIssue {
  readonly field: string;
  readonly message: string;
  readonly severity: PackValidationSeverity;
}

export interface PackValidationResult {
  readonly valid: boolean;
  readonly issues: readonly PackValidationIssue[];
}

// ── Pack Diff ───────────────────────────────────────────────────────────────

export interface PackDiffEntry {
  readonly category: PolicyCategory;
  readonly policyId: string;
  readonly change: "ADDED" | "REMOVED" | "VERSION_CHANGED";
  readonly previousVersion: string | null;
  readonly newVersion: string | null;
}

export interface PackDiff {
  readonly fromVersion: string;
  readonly toVersion: string;
  readonly entries: readonly PackDiffEntry[];
}
