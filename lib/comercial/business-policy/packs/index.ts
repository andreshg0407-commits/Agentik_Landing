/**
 * lib/comercial/business-policy/packs/index.ts
 *
 * Public barrel for Business Policy Packs.
 *
 * Sprint: BUSINESS-POLICY-PACKS-01
 */

// ── Types ───────────────────────────────────────────────────────────────────

export type {
  PackStatus,
  BusinessPolicyPack,
  BusinessPolicyPackVersion,
  BusinessPolicyPackSummary,
  BusinessPolicyPackActivation,
  BusinessPolicyPackReference,
  PackValidationResult,
  PackValidationIssue,
  PackValidationSeverity,
  PackDiff,
  PackDiffEntry,
} from "./pack-types";

// ── Engine API ──────────────────────────────────────────────────────────────

export {
  registerPack,
  activatePack,
  deactivatePack,
  listPacks,
  resolveActivePack,
  buildPackSummary,
  createPackVersion,
  diffPacks,
  getPoliciesForCategory,
  resolvePackPolicyIds,
  _clearPackStore,
} from "./pack-engine";

export type {
  RegisterPackResult,
  ListPacksFilter,
} from "./pack-engine";

// ── Validation ──────────────────────────────────────────────────────────────

export { validatePack } from "./pack-validation";
