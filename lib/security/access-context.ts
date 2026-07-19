/**
 * lib/security/access-context.ts
 *
 * Agentik — Security Foundation — Access Context
 * Sprint: AGENTIK-SECURITY-FOUNDATION-01
 *
 * Defines the AccessContext — the structured representation of "who is
 * doing what to which resource at what time" in Agentik.
 *
 * Every security evaluation, audit event, and policy check is grounded
 * in an AccessContext. This ensures consistent, auditable security decisions
 * across all layers of the platform.
 *
 * Pure domain — no Prisma, no server-only, no side effects.
 */

import type { AccessAction, SecurityActorType } from "./security-types";

// ── Access Context ────────────────────────────────────────────────────────────

/**
 * AccessContext — structured representation of a security-relevant action.
 *
 * All fields are JSON-serializable (string timestamps, no Date objects).
 */
export interface AccessContext {
  /**
   * The tenant making the request.
   * This is the ACTOR's tenant — may differ from the resource's tenant
   * in cross-tenant scenarios (which are denied by default).
   */
  orgSlug:    string;

  /**
   * The identity performing the action.
   * Examples: userId, agentId, "system", "cron", "integration:shopify"
   */
  actorId:    string;

  /** Classification of the actor. */
  actorType:  SecurityActorType;

  /**
   * The resource being accessed.
   * Use the pattern: "{assetType}:{resourceId}"
   * Examples:
   *   "copilot-memory:m123"
   *   "playbook:pb456"
   *   "integration:shopify"
   *   "executive-context:castillitos"
   *   "ai-token:anthropic"
   */
  resource:   string;

  /** The action being performed on the resource. */
  action:     AccessAction;

  /**
   * ISO 8601 timestamp of when the context was created.
   * Set at creation time — do not mutate after creation.
   */
  timestamp:  string;

  /**
   * Optional: the tenant that OWNS the resource.
   * Set when the resource may belong to a different tenant (cross-tenant scenarios).
   * Defaults to orgSlug when not specified.
   */
  resourceOrgSlug?: string;

  /**
   * Optional request correlation ID for distributed tracing.
   */
  requestId?: string;

  /**
   * Optional module that initiated the access.
   * Examples: "finance", "copilot", "marketing-studio", "reconciliation"
   */
  module?: string;
}

// ── Builder ───────────────────────────────────────────────────────────────────

/**
 * buildAccessContext — create a well-formed AccessContext.
 *
 * Validates that required fields are non-empty.
 * Returns a frozen, JSON-serializable object.
 *
 * @param orgSlug   — the requesting tenant
 * @param actorId   — the actor identity
 * @param actorType — the actor classification
 * @param resource  — the resource being accessed
 * @param action    — the action being performed
 * @param options   — optional fields
 */
export function buildAccessContext(
  orgSlug:    string,
  actorId:    string,
  actorType:  SecurityActorType,
  resource:   string,
  action:     AccessAction,
  options: {
    resourceOrgSlug?: string;
    requestId?:       string;
    module?:          string;
  } = {},
): AccessContext {
  return {
    orgSlug:         orgSlug   || "unknown",
    actorId:         actorId   || "unknown",
    actorType,
    resource:        resource  || "unknown-resource",
    action,
    timestamp:       new Date().toISOString(),
    resourceOrgSlug: options.resourceOrgSlug,
    requestId:       options.requestId,
    module:          options.module,
  };
}

/**
 * buildSystemContext — create an AccessContext for system-initiated actions.
 *
 * Used for cron jobs, background workers, and internal platform operations.
 */
export function buildSystemContext(
  orgSlug:  string,
  resource: string,
  action:   AccessAction,
  module?:  string,
): AccessContext {
  return buildAccessContext(orgSlug, "system", "SYSTEM", resource, action, { module });
}

/**
 * buildAgentContext — create an AccessContext for agent-initiated actions.
 */
export function buildAgentContext(
  orgSlug:  string,
  agentId:  string,
  resource: string,
  action:   AccessAction,
  module?:  string,
): AccessContext {
  return buildAccessContext(orgSlug, agentId, "AGENT", resource, action, { module });
}

/**
 * buildIntegrationContext — create an AccessContext for integration-initiated actions.
 */
export function buildIntegrationContext(
  orgSlug:      string,
  integrationId: string,
  resource:     string,
  action:       AccessAction,
): AccessContext {
  return buildAccessContext(orgSlug, integrationId, "INTEGRATION", resource, action);
}

// ── Validators ────────────────────────────────────────────────────────────────

/**
 * isValidAccessContext — validates a context has all required non-empty fields.
 */
export function isValidAccessContext(ctx: AccessContext): boolean {
  return (
    typeof ctx.orgSlug    === "string" && ctx.orgSlug.length > 0 &&
    typeof ctx.actorId    === "string" && ctx.actorId.length > 0 &&
    typeof ctx.actorType  === "string" && ctx.actorType.length > 0 &&
    typeof ctx.resource   === "string" && ctx.resource.length > 0 &&
    typeof ctx.action     === "string" && ctx.action.length > 0 &&
    typeof ctx.timestamp  === "string" && ctx.timestamp.length > 0
  );
}

/**
 * getEffectiveResourceOrg — return the org that owns the resource.
 * Falls back to the actor's orgSlug when resourceOrgSlug is not set.
 */
export function getEffectiveResourceOrg(ctx: AccessContext): string {
  return ctx.resourceOrgSlug ?? ctx.orgSlug;
}
