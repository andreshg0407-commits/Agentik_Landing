/**
 * lib/security/rbac/integrations/executive-rbac.ts
 *
 * AGENTIK-SECURITY-RBAC-01
 * RBAC Integration — Executive Brain Adapter
 *
 * Server-only. Domain-specific access checks for the Executive Brain module.
 */

import "server-only";

import type { AccessResult } from "../rbac-types";
import { authorizationService } from "../authorization-service";

export class ExecutiveRbac {
  /** Can the user view the executive intelligence context? */
  canView(userId: string, orgSlug: string): AccessResult {
    return authorizationService.canView(userId, orgSlug, "EXECUTIVE_BRAIN");
  }

  /** Can the user administer the executive brain (configure, reset)? */
  canAdmin(userId: string, orgSlug: string): AccessResult {
    return authorizationService.canAdmin(userId, orgSlug, "EXECUTIVE_BRAIN");
  }

  // ── Boolean helpers ─────────────────────────────────────────────────────

  isViewAllowed(userId: string, orgSlug: string): boolean {
    return this.canView(userId, orgSlug).decision === "ALLOW";
  }

  isAdminAllowed(userId: string, orgSlug: string): boolean {
    return this.canAdmin(userId, orgSlug).decision === "ALLOW";
  }

  // ── Guards ──────────────────────────────────────────────────────────────

  assertCanView(userId: string, orgSlug: string): void {
    const r = this.canView(userId, orgSlug);
    if (r.decision !== "ALLOW") throw new Error(`ExecutiveRbac: VIEW denied — ${r.reason}`);
  }

  assertCanAdmin(userId: string, orgSlug: string): void {
    const r = this.canAdmin(userId, orgSlug);
    if (r.decision !== "ALLOW") throw new Error(`ExecutiveRbac: ADMIN denied — ${r.reason}`);
  }
}

let _instance: ExecutiveRbac | null = null;
export function getExecutiveRbac(): ExecutiveRbac {
  if (!_instance) _instance = new ExecutiveRbac();
  return _instance;
}

export const executiveRbac = new ExecutiveRbac();
