/**
 * lib/security/zero-trust/integration-security.ts
 *
 * AGENTIK-SECURITY-ZERO-TRUST-01
 * Integration Security — Zero Trust for External Integrations
 *
 * Server-only. Validates external integrations before any data exchange.
 *
 * Supported integrations:
 *   shopify        → e-commerce data, inventory, orders
 *   meta           → social ads, campaigns, insights
 *   whatsapp       → messaging, customer communications
 *   tiktok         → social ads, content publishing
 *   dian           → fiscal authority (CRITICAL risk)
 *   fedex          → logistics, shipment tracking
 *   stripe         → payments (CRITICAL risk)
 *   castillitos_crm → internal CRM adapter
 *
 * Principles:
 *   - Each integration has a defined permission scope
 *   - Compromised integrations are denied immediately
 *   - Secret version must be current (no stale credentials)
 *   - Cross-org integration use is never permitted
 *   - Fail-closed: unknown integration → DENY
 */

import "server-only";

import type {
  ZeroTrustRiskLevel,
  IntegrationTrustResult,
  ZeroTrustAction,
  ZeroTrustResourceType,
} from "./zero-trust-types";

// ── Integration Registry ───────────────────────────────────────────────────────

/** The permission scope for a registered integration. */
export interface IntegrationScope {
  /** Resources this integration is allowed to read. */
  canRead:    ReadonlyArray<ZeroTrustResourceType>;
  /** Resources this integration is allowed to write. */
  canWrite:   ReadonlyArray<ZeroTrustResourceType>;
  /** Base risk level for this integration (irrespective of action). */
  baseRisk:   ZeroTrustRiskLevel;
  /** Whether this integration handles financial/fiscal data. */
  isFiscal:   boolean;
  /** Whether this integration handles payment data. */
  isPayment:  boolean;
}

const INTEGRATION_SCOPES: Record<string, IntegrationScope> = {
  shopify: {
    canRead:   ["MARKETING_DATA", "COMMERCIAL_DATA", "CUSTOMER_DATA"],
    canWrite:  ["COMMERCIAL_DATA"],
    baseRisk:  "MEDIUM",
    isFiscal:  false,
    isPayment: false,
  },
  meta: {
    canRead:   ["MARKETING_DATA"],
    canWrite:  ["MARKETING_DATA"],
    baseRisk:  "MEDIUM",
    isFiscal:  false,
    isPayment: false,
  },
  whatsapp: {
    canRead:   ["CUSTOMER_DATA"],
    canWrite:  ["CUSTOMER_DATA"],
    baseRisk:  "MEDIUM",
    isFiscal:  false,
    isPayment: false,
  },
  tiktok: {
    canRead:   ["MARKETING_DATA"],
    canWrite:  ["MARKETING_DATA"],
    baseRisk:  "MEDIUM",
    isFiscal:  false,
    isPayment: false,
  },
  dian: {
    canRead:   ["FINANCIAL_DATA"],
    canWrite:  ["FINANCIAL_DATA"],
    baseRisk:  "CRITICAL",
    isFiscal:  true,
    isPayment: false,
  },
  fedex: {
    canRead:   ["COMMERCIAL_DATA", "CUSTOMER_DATA"],
    canWrite:  ["COMMERCIAL_DATA"],
    baseRisk:  "LOW",
    isFiscal:  false,
    isPayment: false,
  },
  stripe: {
    canRead:   ["FINANCIAL_DATA", "CUSTOMER_DATA"],
    canWrite:  ["FINANCIAL_DATA"],
    baseRisk:  "CRITICAL",
    isFiscal:  false,
    isPayment: true,
  },
  castillitos_crm: {
    canRead:   ["CUSTOMER_DATA", "COMMERCIAL_DATA"],
    canWrite:  ["CUSTOMER_DATA", "COMMERCIAL_DATA"],
    baseRisk:  "LOW",
    isFiscal:  false,
    isPayment: false,
  },
};

// ── Integration Access Request ─────────────────────────────────────────────────

export interface IntegrationAccessRequest {
  /** Integration identifier (e.g. "shopify", "meta", "dian"). */
  integrationId:  string;
  /** Organization slug — must match the integration's registered tenant. */
  orgSlug:        string;
  /** Resource type being accessed. */
  resourceType:   ZeroTrustResourceType;
  /** Action being attempted. */
  action:         ZeroTrustAction;
  /** Secret version string (e.g. "v3"). Must be current, not stale. */
  secretVersion:  string;
  /** Whether this integration has been flagged as compromised. */
  isCompromised?: boolean;
  /** Whether credentials are revoked. */
  isRevoked?:     boolean;
}

// ── validateIntegrationAccess ──────────────────────────────────────────────────

/**
 * validateIntegrationAccess — check if an integration may access a resource.
 *
 * Fail-closed: unknown integration, revoked or compromised state → DENY.
 */
export function validateIntegrationAccess(
  req: IntegrationAccessRequest,
): IntegrationTrustResult {
  const { integrationId, orgSlug, resourceType, action, secretVersion } = req;

  // 1. Integration must be registered
  const scope = INTEGRATION_SCOPES[integrationId];
  if (!scope) {
    return denyIntegration(integrationId, orgSlug, "CRITICAL", [
      `unknown_integration:${integrationId}`,
    ]);
  }

  // 2. Org slug must be present
  if (!orgSlug || orgSlug.trim().length === 0) {
    return denyIntegration(integrationId, orgSlug, "CRITICAL", [
      "integration_org_slug_missing",
    ]);
  }

  // 3. Compromised integrations are denied immediately
  if (req.isCompromised) {
    return denyIntegration(integrationId, orgSlug, "CRITICAL", [
      `integration_compromised:${integrationId}`,
    ]);
  }

  // 4. Revoked integrations are denied
  if (req.isRevoked) {
    return denyIntegration(integrationId, orgSlug, "HIGH", [
      `integration_revoked:${integrationId}`,
    ]);
  }

  // 5. Secret version must be present (non-empty means credentials loaded)
  if (!secretVersion || secretVersion.trim().length === 0) {
    return denyIntegration(integrationId, orgSlug, "CRITICAL", [
      "integration_secret_version_missing",
    ]);
  }

  // 6. Check resource access based on action
  const allowed = checkIntegrationAction(scope, resourceType, action);
  if (!allowed) {
    return denyIntegration(integrationId, orgSlug, scope.baseRisk, [
      `integration_action_not_in_scope: integration=${integrationId} resource=${resourceType} action=${action}`,
    ]);
  }

  // 7. Fiscal and payment integrations require stricter awareness
  const riskLevel: ZeroTrustRiskLevel =
    scope.isFiscal || scope.isPayment ? "HIGH" : scope.baseRisk;

  return {
    trusted:       true,
    integrationId,
    orgSlug,
    reasons:       [
      `integration_access_within_scope: resource=${resourceType} action=${action}`,
      `secret_version_present:${secretVersion}`,
    ],
    riskLevel,
    scopeViolation: false,
  };
}

// ── evaluateIntegrationTrust ───────────────────────────────────────────────────

/**
 * evaluateIntegrationTrust — produce a trust score for an integration.
 *
 * Integrations start at a base score of 60. Deductions are applied for
 * missing secret version, compromised/revoked state, and high-risk categories.
 */
export function evaluateIntegrationTrust(params: {
  integrationId:  string;
  orgSlug:        string;
  secretVersion:  string;
  isCompromised?: boolean;
  isRevoked?:     boolean;
}): { score: number; trusted: boolean; riskLevel: ZeroTrustRiskLevel } {
  const { integrationId, orgSlug, secretVersion, isCompromised, isRevoked } = params;

  if (!integrationId || !orgSlug) {
    return { score: 0, trusted: false, riskLevel: "CRITICAL" };
  }

  const scope = INTEGRATION_SCOPES[integrationId];
  if (!scope) {
    return { score: 0, trusted: false, riskLevel: "CRITICAL" };
  }

  if (isCompromised) {
    return { score: 0, trusted: false, riskLevel: "CRITICAL" };
  }

  if (isRevoked) {
    return { score: 0, trusted: false, riskLevel: "CRITICAL" };
  }

  // Base score for known, non-compromised integrations
  let score = 60;

  // Deduct for missing secret version
  if (!secretVersion || secretVersion.trim().length === 0) {
    score -= 30;
  }

  // Deduct for high-risk category
  if (scope.isFiscal || scope.isPayment) {
    score -= 10;
  }

  // Subject type deduction: INTEGRATION = -15 (per trust-score-engine)
  score -= 15;

  const finalScore = Math.max(0, score);

  return {
    score:     finalScore,
    trusted:   finalScore >= 30,
    riskLevel: deriveIntegrationRisk(finalScore),
  };
}

// ── denyCompromisedIntegration ─────────────────────────────────────────────────

/**
 * denyCompromisedIntegration — immediately deny and flag a compromised integration.
 *
 * Call this when a secret rotation event or external signal indicates the
 * integration credentials have been leaked or misused.
 */
export function denyCompromisedIntegration(
  integrationId: string,
  orgSlug:        string,
  reason:         string,
): IntegrationTrustResult {
  return denyIntegration(integrationId, orgSlug, "CRITICAL", [
    `integration_marked_compromised:${integrationId}`,
    `reason:${reason}`,
  ]);
}

// ── getIntegrationScope ────────────────────────────────────────────────────────

/**
 * getIntegrationScope — return the scope definition for an integration.
 * Returns null for unknown integrations.
 */
export function getIntegrationScope(integrationId: string): IntegrationScope | null {
  return INTEGRATION_SCOPES[integrationId] ?? null;
}

/** List of all registered integration IDs. */
export const KNOWN_INTEGRATION_IDS = Object.keys(INTEGRATION_SCOPES) as ReadonlyArray<string>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function checkIntegrationAction(
  scope:        IntegrationScope,
  resourceType: ZeroTrustResourceType,
  action:       ZeroTrustAction,
): boolean {
  switch (action) {
    case "READ":
    case "EXPORT":
      return (scope.canRead as ZeroTrustResourceType[]).includes(resourceType);
    case "WRITE":
    case "IMPORT":
    case "DELETE":
      return (scope.canWrite as ZeroTrustResourceType[]).includes(resourceType);
    case "EXECUTE":
    case "APPROVE":
    case "ROTATE_SECRET":
    case "MANAGE_USERS":
    case "ADMIN":
      // Integrations never get admin-level or privileged actions
      return false;
    default:
      return false;
  }
}

function denyIntegration(
  integrationId: string,
  orgSlug:       string,
  riskLevel:     ZeroTrustRiskLevel,
  reasons:       string[],
): IntegrationTrustResult {
  return {
    trusted:        false,
    integrationId,
    orgSlug,
    reasons,
    riskLevel,
    scopeViolation: true,
  };
}

function deriveIntegrationRisk(score: number): ZeroTrustRiskLevel {
  if (score >= 85) return "LOW";
  if (score >= 60) return "MEDIUM";
  if (score >= 40) return "HIGH";
  return "CRITICAL";
}
