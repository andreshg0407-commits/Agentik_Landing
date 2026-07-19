/**
 * lib/security/rbac/integrations/vault-rbac.ts
 *
 * AGENTIK-SECURITY-RBAC-01
 * RBAC Integration — Vault Adapter
 *
 * Server-only. Domain-specific access checks for the Credential Vault.
 * Wraps the AuthorizationService with Vault-specific semantics.
 */

import "server-only";

import type { AccessResult } from "../rbac-types";
import { authorizationService } from "../authorization-service";

export class VaultRbac {
  /** Can the user read vault secrets? */
  canRead(userId: string, orgSlug: string): AccessResult {
    return authorizationService.canRead(userId, orgSlug, "VAULT");
  }

  /** Can the user write (store) vault secrets? */
  canWrite(userId: string, orgSlug: string): AccessResult {
    return authorizationService.canWrite(userId, orgSlug, "VAULT");
  }

  /** Can the user administer the vault (rotate keys, purge, configure)? */
  canAdmin(userId: string, orgSlug: string): AccessResult {
    return authorizationService.canAdmin(userId, orgSlug, "VAULT");
  }

  /** Boolean: can read vault. */
  isReadAllowed(userId: string, orgSlug: string): boolean {
    return this.canRead(userId, orgSlug).decision === "ALLOW";
  }

  /** Boolean: can write vault. */
  isWriteAllowed(userId: string, orgSlug: string): boolean {
    return this.canWrite(userId, orgSlug).decision === "ALLOW";
  }

  /** Boolean: can admin vault. */
  isAdminAllowed(userId: string, orgSlug: string): boolean {
    return this.canAdmin(userId, orgSlug).decision === "ALLOW";
  }

  /** Assert read — throws if denied. */
  assertCanRead(userId: string, orgSlug: string): void {
    const r = this.canRead(userId, orgSlug);
    if (r.decision !== "ALLOW") throw new Error(`VaultRbac: READ denied — ${r.reason}`);
  }

  /** Assert write — throws if denied. */
  assertCanWrite(userId: string, orgSlug: string): void {
    const r = this.canWrite(userId, orgSlug);
    if (r.decision !== "ALLOW") throw new Error(`VaultRbac: WRITE denied — ${r.reason}`);
  }

  /** Assert admin — throws if denied. */
  assertCanAdmin(userId: string, orgSlug: string): void {
    const r = this.canAdmin(userId, orgSlug);
    if (r.decision !== "ALLOW") throw new Error(`VaultRbac: ADMIN denied — ${r.reason}`);
  }
}

let _instance: VaultRbac | null = null;
export function getVaultRbac(): VaultRbac {
  if (!_instance) _instance = new VaultRbac();
  return _instance;
}

export const vaultRbac = new VaultRbac();
