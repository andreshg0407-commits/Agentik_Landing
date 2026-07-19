/**
 * lib/security/rbac/integrations/autonomous-rbac.ts
 *
 * AGENTIK-SECURITY-RBAC-01
 * RBAC Integration — Autonomous Operations Adapter
 *
 * Server-only. Domain-specific access checks for supervised agent dispatch,
 * approval workflows, and autonomous operation management.
 */

import "server-only";

import type { AccessResult } from "../rbac-types";
import { authorizationService } from "../authorization-service";

export class AutonomousRbac {
  /** Can the user trigger autonomous agent executions? */
  canExecute(userId: string, orgSlug: string): AccessResult {
    return authorizationService.canExecute(userId, orgSlug, "AUTONOMOUS");
  }

  /** Can the user approve autonomous operations? */
  canApprove(userId: string, orgSlug: string): AccessResult {
    return authorizationService.canApprove(userId, orgSlug, "AUTONOMOUS");
  }

  /** Can the user administer autonomous operations (configure, terminate, audit)? */
  canAdmin(userId: string, orgSlug: string): AccessResult {
    return authorizationService.canAdmin(userId, orgSlug, "AUTONOMOUS");
  }

  // ── Boolean helpers ─────────────────────────────────────────────────────

  isExecuteAllowed(userId: string, orgSlug: string): boolean {
    return this.canExecute(userId, orgSlug).decision === "ALLOW";
  }

  isApproveAllowed(userId: string, orgSlug: string): boolean {
    return this.canApprove(userId, orgSlug).decision === "ALLOW";
  }

  isAdminAllowed(userId: string, orgSlug: string): boolean {
    return this.canAdmin(userId, orgSlug).decision === "ALLOW";
  }

  // ── Guards ──────────────────────────────────────────────────────────────

  assertCanExecute(userId: string, orgSlug: string): void {
    const r = this.canExecute(userId, orgSlug);
    if (r.decision !== "ALLOW") throw new Error(`AutonomousRbac: EXECUTE denied — ${r.reason}`);
  }

  assertCanApprove(userId: string, orgSlug: string): void {
    const r = this.canApprove(userId, orgSlug);
    if (r.decision !== "ALLOW") throw new Error(`AutonomousRbac: APPROVE denied — ${r.reason}`);
  }

  assertCanAdmin(userId: string, orgSlug: string): void {
    const r = this.canAdmin(userId, orgSlug);
    if (r.decision !== "ALLOW") throw new Error(`AutonomousRbac: ADMIN denied — ${r.reason}`);
  }
}

let _instance: AutonomousRbac | null = null;
export function getAutonomousRbac(): AutonomousRbac {
  if (!_instance) _instance = new AutonomousRbac();
  return _instance;
}

export const autonomousRbac = new AutonomousRbac();
