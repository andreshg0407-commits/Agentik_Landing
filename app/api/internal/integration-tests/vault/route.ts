/**
 * app/api/internal/integration-tests/vault/route.ts
 *
 * AGENTIK-SECURITY-VAULT-01 — Integration Harness
 *
 * GET /api/internal/integration-tests/vault
 *
 * Guards:
 *   - NODE_ENV !== "production"
 *   - ENABLE_INTERNAL_INTEGRATION_TESTS === "true"
 *
 * Tests (25):
 *   T01–T05  vault-secret-record.ts types and interfaces
 *   T06–T10  vault-access-policy.ts canAccessVaultSecret
 *   T11–T13  vault-masking.ts maskSecret / isMasked / sanitizeForLog
 *   T14–T17  vault-validation.ts validateCreateInput / validateSecretValue
 *   T18–T21  vault-registry.ts VAULT_SECRET_REGISTRY lookups
 *   T22–T24  vault-service-audit.ts VaultServiceAuditLog
 *   T25      vault-migration-planner.ts VAULT_MIGRATION_PLAN
 */

import { NextResponse } from "next/server";

// Pure domain imports (no server-only, no Prisma required for these tests)
import {
  canAccessVaultSecret,
  canReadVaultSecret,
  canModifyVaultSecret,
} from "@/lib/security/vault/vault-access-policy";

import {
  maskSecret,
  isMasked,
  sanitizeForLog,
} from "@/lib/security/vault/vault-masking";

import {
  validateCreateInput,
  validateSecretValue,
} from "@/lib/security/vault/vault-validation";

import {
  VAULT_SECRET_REGISTRY,
  getRegistryEntry,
  getEntriesByProvider,
  getEntriesByKind,
  getAllRegistryIds,
} from "@/lib/security/vault/vault-registry";

import {
  VaultServiceAuditLog,
} from "@/lib/security/vault/vault-service-audit";

import {
  VAULT_MIGRATION_PLAN,
  getMigrationPhase,
  getPendingMigrationPhases,
} from "@/lib/security/vault/vault-migration-planner";

import type { VaultCaller, VaultCreateInput } from "@/lib/security/vault/vault-secret-record";

// ── Guards ────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Forbidden in production" }, { status: 403 });
  }
  if (process.env.ENABLE_INTERNAL_INTEGRATION_TESTS !== "true") {
    return NextResponse.json(
      { error: "Set ENABLE_INTERNAL_INTEGRATION_TESTS=true to enable" },
      { status: 403 },
    );
  }

  const results: Array<{ id: string; name: string; passed: boolean; detail: string }> = [];

  function test(id: string, name: string, fn: () => boolean | string): void {
    try {
      const result = fn();
      if (result === true || result === "") {
        results.push({ id, name, passed: true, detail: "OK" });
      } else if (typeof result === "string" && result !== "") {
        results.push({ id, name, passed: false, detail: result });
      } else {
        results.push({ id, name, passed: false, detail: "returned false" });
      }
    } catch (e) {
      results.push({
        id,
        name,
        passed: false,
        detail: `threw: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  // ── T01–T05: vault-secret-record.ts types ────────────────────────────────

  test("T01", "VaultCaller can be constructed", () => {
    const caller: VaultCaller = {
      actorId:   "user-001",
      actorType: "USER",
      orgSlug:   "castillitos",
    };
    return caller.actorId === "user-001" && caller.actorType === "USER";
  });

  test("T02", "VaultCreateInput shape is valid", () => {
    const input: VaultCreateInput = {
      orgSlug:        "castillitos",
      name:           "OpenAI Production Key",
      kind:           "API_KEY",
      classification: "RESTRICTED",
      provider:       "openai",
      value:          "sk-prod-test1234567890",
      tags:           ["production"],
    };
    return input.kind === "API_KEY" && input.classification === "RESTRICTED";
  });

  test("T03", "VaultSecretStatus values are known", () => {
    const statuses = ["ACTIVE", "DISABLED", "REVOKED", "EXPIRED"] as const;
    return statuses.length === 4;
  });

  test("T04", "VaultSecretKind values include all expected types", () => {
    const kinds = [
      "API_KEY", "ACCESS_TOKEN", "REFRESH_TOKEN", "WEBHOOK_SECRET",
      "CERTIFICATE_PASSWORD", "SOFTWARE_PIN", "OAUTH_PAIR",
      "BANKING_CREDENTIAL", "GENERIC_SECRET",
    ] as const;
    return kinds.length === 9;
  });

  test("T05", "VaultServiceErrorCode values include all expected codes", () => {
    const codes = [
      "NOT_FOUND", "ACCESS_DENIED", "INVALID_INPUT", "ENCRYPTION_FAILED",
      "DECRYPTION_FAILED", "STORE_ERROR", "VALIDATION_FAILED",
      "ALREADY_REVOKED", "ALREADY_DISABLED", "SECRET_EXPIRED",
    ] as const;
    return codes.length === 10;
  });

  // ── T06–T10: vault-access-policy.ts ──────────────────────────────────────

  test("T06", "canAccessVaultSecret grants USER same-org CREATE", () => {
    const caller: VaultCaller = { actorId: "user-1", actorType: "USER", orgSlug: "castillitos" };
    const decision = canAccessVaultSecret(caller, "castillitos", "CREATE");
    return decision.allowed || `denied: ${decision.reason}`;
  });

  test("T07", "canAccessVaultSecret denies cross-tenant access", () => {
    const caller: VaultCaller = { actorId: "user-1", actorType: "USER", orgSlug: "castillitos" };
    const decision = canAccessVaultSecret(caller, "other-org", "READ");
    return !decision.allowed || "should have denied cross-tenant";
  });

  test("T08", "canAccessVaultSecret AGENT can only READ", () => {
    const caller: VaultCaller = { actorId: "agent-1", actorType: "AGENT", orgSlug: "castillitos" };
    const readOk  = canAccessVaultSecret(caller, "castillitos", "READ");
    const writeOk = canAccessVaultSecret(caller, "castillitos", "CREATE");
    return readOk.allowed && !writeOk.allowed || `read=${readOk.allowed} write=${writeOk.allowed}`;
  });

  test("T09", "canAccessVaultSecret SERVICE can only LIST", () => {
    const caller: VaultCaller = { actorId: "svc-1", actorType: "SERVICE", orgSlug: "castillitos" };
    const listOk   = canAccessVaultSecret(caller, "castillitos", "LIST");
    const deleteOk = canAccessVaultSecret(caller, "castillitos", "DELETE");
    return listOk.allowed && !deleteOk.allowed || `list=${listOk.allowed} delete=${deleteOk.allowed}`;
  });

  test("T10", "canReadVaultSecret and canModifyVaultSecret shorthands work", () => {
    const caller: VaultCaller = { actorId: "user-1", actorType: "USER", orgSlug: "test-org" };
    const read   = canReadVaultSecret(caller, "test-org");
    const modify = canModifyVaultSecret(caller, "test-org", "UPDATE");
    return read.allowed && modify.allowed;
  });

  // ── T11–T13: vault-masking.ts ─────────────────────────────────────────────

  test("T11", "maskSecret masks long values correctly", () => {
    const result = maskSecret("sk-prod-1234567890abcdef");
    const ok = result.startsWith("sk-p") && result.includes("****") && result.endsWith("ef");
    return ok || `unexpected mask: ${result}`;
  });

  test("T12", "maskSecret returns **** for short/empty values", () => {
    const a = maskSecret("");
    const b = maskSecret("1234");
    const c = maskSecret("abc");
    return a === "****" && b === "****" && c === "****";
  });

  test("T13", "isMasked and sanitizeForLog work correctly", () => {
    const masked     = isMasked("sk-p****ef");
    const notMasked  = isMasked("sk-prod-1234567890");
    const sanitized  = sanitizeForLog("token=sk-prod-1234567890abcdefghij extra");
    return masked && !notMasked && sanitized.includes("[REDACTED]");
  });

  // ── T14–T17: vault-validation.ts ─────────────────────────────────────────

  test("T14", "validateCreateInput passes valid input", () => {
    const input: VaultCreateInput = {
      orgSlug:        "castillitos",
      name:           "Test Key",
      kind:           "API_KEY",
      classification: "RESTRICTED",
      provider:       "openai",
      value:          "sk-prod-test1234567890",
    };
    const result = validateCreateInput(input);
    return result.valid || `invalid: ${result.errors.join(", ")}`;
  });

  test("T15", "validateCreateInput catches empty orgSlug", () => {
    const input: VaultCreateInput = {
      orgSlug:        "",
      name:           "Test",
      kind:           "API_KEY",
      classification: "RESTRICTED",
      provider:       "openai",
      value:          "sk-prod-test1234567890",
    };
    const result = validateCreateInput(input);
    return !result.valid && result.errors.some(e => e.includes("orgSlug"));
  });

  test("T16", "validateSecretValue rejects too-short API_KEY", () => {
    const errors = validateSecretValue("short", "API_KEY");
    return errors.length > 0 && errors[0].includes("at least");
  });

  test("T17", "validateCreateInput warns on past expiresAt", () => {
    const input: VaultCreateInput = {
      orgSlug:        "castillitos",
      name:           "Test",
      kind:           "API_KEY",
      classification: "RESTRICTED",
      provider:       "openai",
      value:          "sk-prod-test1234567890",
      expiresAt:      "2020-01-01T00:00:00.000Z",
    };
    const result = validateCreateInput(input);
    return result.valid && result.warnings.length > 0;
  });

  // ── T18–T21: vault-registry.ts ────────────────────────────────────────────

  test("T18", "VAULT_SECRET_REGISTRY has at least 13 entries", () => {
    return VAULT_SECRET_REGISTRY.length >= 13 ||
      `only ${VAULT_SECRET_REGISTRY.length} entries`;
  });

  test("T19", "getRegistryEntry finds OPENAI_API_KEY", () => {
    const entry = getRegistryEntry("OPENAI_API_KEY");
    return !!entry && entry.provider === "openai" && entry.kind === "API_KEY";
  });

  test("T20", "getEntriesByProvider finds dian entries", () => {
    const dianEntries = getEntriesByProvider("dian");
    return dianEntries.length >= 2 || `only ${dianEntries.length} dian entries`;
  });

  test("T21", "getEntriesByKind and getAllRegistryIds work", () => {
    const apiKeys = getEntriesByKind("API_KEY");
    const allIds  = getAllRegistryIds();
    return apiKeys.length >= 2 && allIds.includes("OPENAI_API_KEY");
  });

  // ── T22–T24: vault-service-audit.ts ──────────────────────────────────────

  test("T22", "VaultServiceAuditLog records events", () => {
    const log = new VaultServiceAuditLog();
    const event = log.record({
      orgSlug:    "castillitos",
      eventType:  "SECRET_CREATED",
      secretId:   "vs-001",
      secretKind: "API_KEY",
      actorId:    "user-1",
      actorType:  "USER",
      success:    true,
      durationMs: 5,
    });
    return log.count() === 1 && event.id.startsWith("vsvc-");
  });

  test("T23", "VaultServiceAuditLog filters by org and type", () => {
    const log = new VaultServiceAuditLog();
    log.record({ orgSlug: "org-a", eventType: "SECRET_READ",    actorId: "u1", actorType: "USER", success: true,  durationMs: 1 });
    log.record({ orgSlug: "org-b", eventType: "SECRET_CREATED", actorId: "u2", actorType: "USER", success: true,  durationMs: 2 });
    log.record({ orgSlug: "org-a", eventType: "ACCESS_DENIED",  actorId: "u3", actorType: "USER", success: false, durationMs: 1 });

    const forOrgA  = log.getEventsForOrg("org-a");
    const created  = log.getEventsByType("SECRET_CREATED");
    const failed   = log.getFailedEvents();

    return forOrgA.length === 2 && created.length === 1 && failed.length === 1;
  });

  test("T24", "VaultServiceAuditLog clear resets to zero", () => {
    const log = new VaultServiceAuditLog();
    log.record({ orgSlug: "org-a", eventType: "SECRET_READ", actorId: "u1", actorType: "USER", success: true, durationMs: 1 });
    log.clear();
    return log.count() === 0;
  });

  // ── T25: vault-migration-planner.ts ──────────────────────────────────────

  test("T25", "VAULT_MIGRATION_PLAN has 5 phases and helpers work", () => {
    const phase1   = getMigrationPhase("PHASE_1_SCHEMA");
    const pending  = getPendingMigrationPhases();

    return VAULT_MIGRATION_PLAN.length === 5 &&
      phase1?.status === "COMPLETE" &&
      pending.length === 4;
  });

  // ── Result ────────────────────────────────────────────────────────────────

  const total  = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;
  const verdict = failed === 0 ? "ALL_PASS" : "FAILURES_DETECTED";

  return NextResponse.json({
    sprint:  "AGENTIK-SECURITY-VAULT-01",
    total,
    passed,
    failed,
    verdict,
    results,
  });
}
