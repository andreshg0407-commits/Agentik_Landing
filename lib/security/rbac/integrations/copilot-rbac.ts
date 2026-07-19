/**
 * lib/security/rbac/integrations/copilot-rbac.ts
 *
 * AGENTIK-SECURITY-RBAC-01
 * RBAC Integration — Copilot Adapter
 *
 * Server-only. Domain-specific access checks for Copilot, Agent Memory, and Playbooks.
 */

import "server-only";

import type { AccessResult } from "../rbac-types";
import { authorizationService } from "../authorization-service";

export class CopilotRbac {
  /** Can the user execute Copilot tasks? */
  canExecute(userId: string, orgSlug: string): AccessResult {
    return authorizationService.canExecute(userId, orgSlug, "COPILOT");
  }

  /** Can the user administer Copilot? */
  canAdmin(userId: string, orgSlug: string): AccessResult {
    return authorizationService.canAdmin(userId, orgSlug, "COPILOT");
  }

  /** Can the user read agent memory? */
  canReadMemory(userId: string, orgSlug: string): AccessResult {
    return authorizationService.canRead(userId, orgSlug, "MEMORY");
  }

  /** Can the user write agent memory? */
  canWriteMemory(userId: string, orgSlug: string): AccessResult {
    return authorizationService.canWrite(userId, orgSlug, "MEMORY");
  }

  /** Can the user administer agent memory? */
  canAdminMemory(userId: string, orgSlug: string): AccessResult {
    return authorizationService.canAdmin(userId, orgSlug, "MEMORY");
  }

  /** Can the user view playbooks? */
  canViewPlaybooks(userId: string, orgSlug: string): AccessResult {
    return authorizationService.canView(userId, orgSlug, "PLAYBOOKS");
  }

  /** Can the user manage playbooks (create/update)? */
  canManagePlaybooks(userId: string, orgSlug: string): AccessResult {
    return authorizationService.canManage(userId, orgSlug, "PLAYBOOKS");
  }

  /** Can the user administer playbooks? */
  canAdminPlaybooks(userId: string, orgSlug: string): AccessResult {
    return authorizationService.canAdmin(userId, orgSlug, "PLAYBOOKS");
  }

  // ── Boolean helpers ─────────────────────────────────────────────────────

  isExecuteAllowed(userId: string, orgSlug: string): boolean {
    return this.canExecute(userId, orgSlug).decision === "ALLOW";
  }

  isMemoryReadAllowed(userId: string, orgSlug: string): boolean {
    return this.canReadMemory(userId, orgSlug).decision === "ALLOW";
  }

  isMemoryWriteAllowed(userId: string, orgSlug: string): boolean {
    return this.canWriteMemory(userId, orgSlug).decision === "ALLOW";
  }

  isPlaybookViewAllowed(userId: string, orgSlug: string): boolean {
    return this.canViewPlaybooks(userId, orgSlug).decision === "ALLOW";
  }

  isPlaybookManageAllowed(userId: string, orgSlug: string): boolean {
    return this.canManagePlaybooks(userId, orgSlug).decision === "ALLOW";
  }

  // ── Guards ──────────────────────────────────────────────────────────────

  assertCanExecute(userId: string, orgSlug: string): void {
    const r = this.canExecute(userId, orgSlug);
    if (r.decision !== "ALLOW") throw new Error(`CopilotRbac: EXECUTE denied — ${r.reason}`);
  }

  assertCanReadMemory(userId: string, orgSlug: string): void {
    const r = this.canReadMemory(userId, orgSlug);
    if (r.decision !== "ALLOW") throw new Error(`CopilotRbac: MEMORY_READ denied — ${r.reason}`);
  }

  assertCanManagePlaybooks(userId: string, orgSlug: string): void {
    const r = this.canManagePlaybooks(userId, orgSlug);
    if (r.decision !== "ALLOW") throw new Error(`CopilotRbac: PLAYBOOK_MANAGE denied — ${r.reason}`);
  }
}

let _instance: CopilotRbac | null = null;
export function getCopilotRbac(): CopilotRbac {
  if (!_instance) _instance = new CopilotRbac();
  return _instance;
}

export const copilotRbac = new CopilotRbac();
