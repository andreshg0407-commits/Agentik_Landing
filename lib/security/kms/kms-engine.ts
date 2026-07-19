/**
 * lib/security/kms/kms-engine.ts
 *
 * AGENTIK-SECURITY-KMS-01
 * KMS Engine — Central Orchestrator for All Key Operations
 *
 * Server-only. All KMS operations go through this class.
 *
 * Responsibilities:
 *   1. Resolve the correct provider for the operation
 *   2. Validate RBAC permissions
 *   3. Validate Zero Trust context
 *   4. Execute the provider operation
 *   5. Update the key registry
 *   6. Emit an audit event
 *   7. Return a typed result — never key material
 *
 * Fail-closed: any error in steps 1–3 → DENY without provider call.
 */

import "server-only";

import type { KmsProviderType, KmsOperation, KmsResult, KmsAccessContext } from "./kms-types";
import { KMS_OPERATION_RISK } from "./kms-types";
import type { KmsKeyMetadata, KmsKeyCreateInput, KmsEncryptedEnvelope } from "./kms-key";
import type { KmsEncryptParams, KmsDecryptParams, KmsRotateParams, KmsKeyLifecycleParams, KmsDecryptResult } from "./kms-provider";
import { resolveProvider }  from "./provider-registry";
import { registerKey, getKeyByAlias, updateKey, removeKey } from "./key-registry";
import { recordKmsEvent }   from "./kms-audit";
import { checkKmsRbac }     from "./integrations/kms-rbac";
import { checkKmsZeroTrust } from "./integrations/kms-zero-trust";

// ── KmsEngine ─────────────────────────────────────────────────────────────────

export class KmsEngine {
  private readonly _defaultProvider: KmsProviderType;

  constructor(defaultProvider: KmsProviderType = "LOCAL") {
    this._defaultProvider = defaultProvider;
  }

  // ── generateKey ─────────────────────────────────────────────────────────────

  async generateKey(
    input:   KmsKeyCreateInput,
    context: KmsAccessContext,
  ): Promise<KmsResult<KmsKeyMetadata>> {
    const gate = await this._gate(context, "GENERATE_KEY");
    if (!gate.ok) return gate;

    const providerResult = resolveProvider(input.provider ?? this._defaultProvider);
    if (!providerResult.ok) {
      await this._auditDeny(context, "GENERATE_KEY", providerResult.error);
      return providerResult;
    }

    const result = await providerResult.value.generateKey(input);

    if (result.ok) {
      registerKey(result.value);
      await this._auditSuccess(context, "KEY_GENERATED", result.value.keyId);
    } else {
      await this._auditDeny(context, "GENERATE_KEY", result.error);
    }

    return result;
  }

  // ── encrypt ─────────────────────────────────────────────────────────────────

  async encrypt(
    params:  KmsEncryptParams,
    context: KmsAccessContext,
  ): Promise<KmsResult<KmsEncryptedEnvelope>> {
    const gate = await this._gate(context, "ENCRYPT");
    if (!gate.ok) return gate;

    const providerResult = this._resolveForKey(params.keyAlias, params.orgSlug);
    if (!providerResult.ok) {
      await this._auditDeny(context, "ENCRYPT", providerResult.error);
      return providerResult;
    }

    const result = await providerResult.value.encrypt(params);

    if (result.ok) {
      await this._auditSuccess(context, "KEY_USED", result.value.keyRef.keyId);
    } else {
      await this._auditDeny(context, "ENCRYPT", result.error);
    }

    return result;
  }

  // ── decrypt ─────────────────────────────────────────────────────────────────

  async decrypt(
    params:  KmsDecryptParams,
    context: KmsAccessContext,
  ): Promise<KmsResult<KmsDecryptResult>> {
    const gate = await this._gate(context, "DECRYPT");
    if (!gate.ok) return gate;

    const providerResult = resolveProvider(this._defaultProvider);
    if (!providerResult.ok) {
      await this._auditDeny(context, "DECRYPT", providerResult.error);
      return providerResult;
    }

    const result = await providerResult.value.decrypt(params);

    if (result.ok) {
      await this._auditSuccess(context, "KEY_USED", params.envelope.keyRef.keyId);
    } else {
      await this._auditDeny(context, "DECRYPT", result.error);
    }

    return result;
  }

  // ── rotateKey ───────────────────────────────────────────────────────────────

  async rotateKey(
    params:  KmsRotateParams,
    context: KmsAccessContext,
  ): Promise<KmsResult<{ previousVersion: number; newVersion: number; metadata: KmsKeyMetadata }>> {
    const gate = await this._gate(context, "ROTATE_KEY");
    if (!gate.ok) return gate;

    const providerResult = this._resolveForKey(params.keyAlias, params.orgSlug);
    if (!providerResult.ok) {
      await this._auditDeny(context, "ROTATE_KEY", providerResult.error);
      return providerResult;
    }

    const result = await providerResult.value.rotateKey(params);

    if (result.ok) {
      registerKey(result.value.metadata);
      await this._auditSuccess(context, "KEY_ROTATED", result.value.metadata.keyId);
    } else {
      await this._auditDeny(context, "ROTATE_KEY", result.error);
    }

    return result;
  }

  // ── disableKey ──────────────────────────────────────────────────────────────

  async disableKey(
    params:  KmsKeyLifecycleParams,
    context: KmsAccessContext,
  ): Promise<KmsResult<KmsKeyMetadata>> {
    return this._lifecycleOp(params, context, "DISABLE_KEY", "KEY_DISABLED");
  }

  // ── enableKey ───────────────────────────────────────────────────────────────

  async enableKey(
    params:  KmsKeyLifecycleParams,
    context: KmsAccessContext,
  ): Promise<KmsResult<KmsKeyMetadata>> {
    return this._lifecycleOp(params, context, "ENABLE_KEY", "KEY_ENABLED");
  }

  // ── deleteKey ───────────────────────────────────────────────────────────────

  async deleteKey(
    params:  KmsKeyLifecycleParams,
    context: KmsAccessContext,
  ): Promise<KmsResult<{ deleted: boolean; keyAlias: string }>> {
    const gate = await this._gate(context, "DELETE_KEY");
    if (!gate.ok) return gate;

    const providerResult = this._resolveForKey(params.keyAlias, params.orgSlug);
    if (!providerResult.ok) {
      await this._auditDeny(context, "DELETE_KEY", providerResult.error);
      return providerResult;
    }

    // Retrieve keyId for registry cleanup
    const keyResult = getKeyByAlias(params.orgSlug, params.keyAlias);
    const keyId = keyResult.ok ? keyResult.value.keyId : "unknown";

    const result = await providerResult.value.deleteKey(params);

    if (result.ok) {
      removeKey(keyId, params.orgSlug);
      await this._auditSuccess(context, "KEY_DELETED", keyId);
    } else {
      await this._auditDeny(context, "DELETE_KEY", result.error);
    }

    return result;
  }

  // ── getKeyMetadata ──────────────────────────────────────────────────────────

  async getKeyMetadata(
    keyAlias: string,
    orgSlug:  string,
    context:  KmsAccessContext,
  ): Promise<KmsResult<KmsKeyMetadata>> {
    const gate = await this._gate(context, "GENERATE_KEY");
    if (!gate.ok) return gate;

    // Try registry first
    const registryResult = getKeyByAlias(orgSlug, keyAlias);
    if (registryResult.ok) return registryResult;

    // Fall back to provider
    const providerResult = resolveProvider(this._defaultProvider);
    if (!providerResult.ok) return providerResult;

    return providerResult.value.getKeyMetadata(keyAlias, orgSlug);
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async _gate(context: KmsAccessContext, operation: KmsOperation): Promise<KmsResult<true>> {
    // RBAC check
    const rbacResult = checkKmsRbac({ subjectId: context.subjectId, subjectType: context.subjectType, orgSlug: context.orgSlug, operation });
    if (!rbacResult.allowed) {
      await this._auditDeny(context, operation, `rbac_denied:${rbacResult.reasons.join(",")}`);
      return { ok: false, error: `rbac_denied:${rbacResult.reasons.join(",")}`, riskLevel: "CRITICAL" };
    }

    // Zero Trust check
    const ztResult = checkKmsZeroTrust({ ...context, operation });
    if (ztResult.decision !== "ALLOW") {
      await this._auditDeny(context, operation, `zero_trust_denied:${ztResult.reasons.join(",")}`);
      return { ok: false, error: `zero_trust_denied:${ztResult.reasons.join(",")}`, riskLevel: KMS_OPERATION_RISK[operation] };
    }

    return { ok: true, value: true };
  }

  private _resolveForKey(keyAlias: string, orgSlug: string) {
    const keyResult = getKeyByAlias(orgSlug, keyAlias);
    if (keyResult.ok) {
      return resolveProvider(keyResult.value.provider);
    }
    return resolveProvider(this._defaultProvider);
  }

  private async _lifecycleOp(
    params:       KmsKeyLifecycleParams,
    context:      KmsAccessContext,
    operation:    KmsOperation,
    auditEvent:   "KEY_DISABLED" | "KEY_ENABLED" | "KEY_DELETED",
  ): Promise<KmsResult<KmsKeyMetadata>> {
    const gate = await this._gate(context, operation);
    if (!gate.ok) return gate;

    const providerResult = this._resolveForKey(params.keyAlias, params.orgSlug);
    if (!providerResult.ok) {
      await this._auditDeny(context, operation, providerResult.error);
      return providerResult;
    }

    const providerMethod = operation === "DISABLE_KEY" ? "disableKey"
      : operation === "ENABLE_KEY" ? "enableKey"
      : "disableKey";

    const result = await providerResult.value[providerMethod](params);

    if (result.ok) {
      updateKey(result.value.keyId, params.orgSlug, { status: result.value.status });
      await this._auditSuccess(context, auditEvent, result.value.keyId);
    } else {
      await this._auditDeny(context, operation, result.error);
    }

    return result;
  }

  private async _auditSuccess(context: KmsAccessContext, eventType: string, keyId: string): Promise<void> {
    await recordKmsEvent({
      eventType:   eventType as "KEY_GENERATED" | "KEY_USED" | "KEY_ROTATED" | "KEY_DISABLED" | "KEY_ENABLED" | "KEY_DELETED",
      orgSlug:     context.orgSlug,
      subjectId:   context.subjectId,
      subjectType: context.subjectType,
      keyId,
      keyAlias:    context.keyAlias,
      operation:   context.operation,
      success:     true,
      reasons:     [],
    });
  }

  private async _auditDeny(context: KmsAccessContext, operation: KmsOperation, reason: string): Promise<void> {
    await recordKmsEvent({
      eventType:   "KMS_ACCESS_DENIED",
      orgSlug:     context.orgSlug,
      subjectId:   context.subjectId,
      subjectType: context.subjectType,
      keyId:       context.keyId ?? "unknown",
      keyAlias:    context.keyAlias,
      operation,
      success:     false,
      reasons:     [reason],
    });
  }
}

/** Default KMS engine instance — uses LOCAL provider. */
export const kmsEngine = new KmsEngine("LOCAL");
