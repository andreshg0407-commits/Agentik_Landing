/**
 * lib/security/security-signals.ts
 *
 * Agentik — Security Foundation — Security Signals
 * Sprint: AGENTIK-SECURITY-FOUNDATION-01
 *
 * Security signals are anomalies or risk indicators detected by the
 * Security Foundation layer. They are prepared for future consumption
 * by the Executive Brain (AGENTIK-EXECUTIVE-BRAIN-02).
 *
 * No integration with Executive Brain yet — this is the domain definition.
 * Signals are generated deterministically from security events and contexts.
 *
 * No AI. No server-only. No Prisma.
 */

import type { SecuritySeverity, SecuritySignalId, SecurityEvent } from "./security-types";
import type { AccessContext } from "./access-context";

// ── Security Signal ───────────────────────────────────────────────────────────

/**
 * SecuritySignal — a named, serializable risk indicator.
 *
 * Signals aggregate patterns across events and contexts into a
 * human-readable risk assessment. They are the bridge between
 * raw security events and actionable intelligence.
 */
export interface SecuritySignal {
  /** Unique instance identifier for this signal occurrence. */
  id:           string;
  /** The well-known signal type. */
  signalId:     SecuritySignalId;
  /** Human-readable signal title. */
  title:        string;
  /** Detailed explanation of what triggered this signal. */
  description:  string;
  /** Severity of the risk. */
  severity:     SecuritySeverity;
  /** Tenant scope. */
  orgSlug:      string;
  /** Optional: the resource that triggered the signal. */
  resource?:    string;
  /** Supporting evidence (event IDs or context metadata). */
  evidence:     string[];
  /** ISO 8601 timestamp when the signal was generated. */
  generatedAt:  string;
}

// ── Signal Definitions ────────────────────────────────────────────────────────

interface SignalDefinition {
  signalId:    SecuritySignalId;
  title:       string;
  description: string;
  severity:    SecuritySeverity;
}

const SIGNAL_DEFINITIONS: Record<SecuritySignalId, SignalDefinition> = {
  TENANT_BOUNDARY_VIOLATION: {
    signalId:    "TENANT_BOUNDARY_VIOLATION",
    title:       "Tenant Boundary Violation",
    description: "An actor attempted to access a resource owned by a different tenant. This is a critical security violation.",
    severity:    "CRITICAL",
  },
  UNCLASSIFIED_SENSITIVE_DATA: {
    signalId:    "UNCLASSIFIED_SENSITIVE_DATA",
    title:       "Unclassified Sensitive Data",
    description: "A resource that appears to contain sensitive data was accessed without a registered classification. This creates audit and compliance gaps.",
    severity:    "MEDIUM",
  },
  UNAUDITED_ACCESS: {
    signalId:    "UNAUDITED_ACCESS",
    title:       "Unaudited Access to Sensitive Resource",
    description: "A CONFIDENTIAL or RESTRICTED resource was accessed without producing an audit event. This violates the AUDIT_REQUIRED policy.",
    severity:    "HIGH",
  },
  POLICY_VIOLATION: {
    signalId:    "POLICY_VIOLATION",
    title:       "Security Policy Violation",
    description: "A security policy was violated. Access was denied and the violation has been recorded.",
    severity:    "HIGH",
  },
  SECRET_EXPOSURE_RISK: {
    signalId:    "SECRET_EXPOSURE_RISK",
    title:       "Secret Exposure Risk",
    description: "A secret, token, or certificate was accessed in a way that may expose it to unauthorized parties (logs, exports, or UI responses).",
    severity:    "CRITICAL",
  },
};

// ── ID Generator ──────────────────────────────────────────────────────────────

let _sigCounter = 0;

function generateSignalId(): string {
  _sigCounter = (_sigCounter + 1) % 1_000_000;
  return `ssig-${Date.now()}-${String(_sigCounter).padStart(6, "0")}`;
}

// ── Signal Factories ──────────────────────────────────────────────────────────

function makeSignal(
  signalId:  SecuritySignalId,
  orgSlug:   string,
  evidence:  string[],
  resource?: string,
): SecuritySignal {
  const def = SIGNAL_DEFINITIONS[signalId];
  return {
    id:          generateSignalId(),
    signalId:    def.signalId,
    title:       def.title,
    description: def.description,
    severity:    def.severity,
    orgSlug,
    resource,
    evidence,
    generatedAt: new Date().toISOString(),
  };
}

// ── Signal Generators ─────────────────────────────────────────────────────────

/**
 * detectTenantBoundaryViolation — generates a TENANT_BOUNDARY_VIOLATION signal
 * when the access context shows cross-tenant access.
 */
export function detectTenantBoundaryViolation(ctx: AccessContext): SecuritySignal | undefined {
  const resourceOrg = ctx.resourceOrgSlug ?? ctx.orgSlug;
  if (ctx.orgSlug === resourceOrg) return undefined;

  return makeSignal(
    "TENANT_BOUNDARY_VIOLATION",
    ctx.orgSlug,
    [`actor=${ctx.actorId}`, `resource=${ctx.resource}`, `resourceOrg=${resourceOrg}`],
    ctx.resource,
  );
}

/**
 * detectUnclassifiedSensitiveData — generates a signal when a resource
 * accessed by a context could not be classified.
 */
export function detectUnclassifiedSensitiveData(
  orgSlug:  string,
  resource: string,
  reason:   string,
): SecuritySignal {
  return makeSignal(
    "UNCLASSIFIED_SENSITIVE_DATA",
    orgSlug,
    [`resource=${resource}`, `reason=${reason}`],
    resource,
  );
}

/**
 * detectUnauditedAccess — generates UNAUDITED_ACCESS signal when a sensitive
 * resource access has no corresponding audit event.
 */
export function detectUnauditedAccess(
  orgSlug:  string,
  resource: string,
  actorId:  string,
): SecuritySignal {
  return makeSignal(
    "UNAUDITED_ACCESS",
    orgSlug,
    [`resource=${resource}`, `actor=${actorId}`],
    resource,
  );
}

/**
 * detectPolicyViolation — generates a POLICY_VIOLATION signal.
 */
export function detectPolicyViolation(
  orgSlug:   string,
  policyId:  string,
  resource:  string,
  reason:    string,
): SecuritySignal {
  return makeSignal(
    "POLICY_VIOLATION",
    orgSlug,
    [`policy=${policyId}`, `resource=${resource}`, `reason=${reason}`],
    resource,
  );
}

/**
 * detectSecretExposureRisk — generates a SECRET_EXPOSURE_RISK signal.
 */
export function detectSecretExposureRisk(
  orgSlug:    string,
  secretRef:  string,
  context:    string,
): SecuritySignal {
  return makeSignal(
    "SECRET_EXPOSURE_RISK",
    orgSlug,
    [`secret=${secretRef}`, `context=${context}`],
    secretRef,
  );
}

/**
 * analyzeEventsForSignals — scan a batch of SecurityEvents and produce
 * all applicable signals.
 */
export function analyzeEventsForSignals(
  events: SecurityEvent[],
  orgSlug: string,
): SecuritySignal[] {
  const signals: SecuritySignal[] = [];

  for (const event of events) {
    if (event.orgSlug !== orgSlug) continue;

    if (event.eventType === "POLICY_VIOLATION") {
      signals.push(makeSignal(
        "POLICY_VIOLATION",
        orgSlug,
        [event.id],
        event.resource,
      ));
    }

    if (event.eventType === "SECRET_ACCESSED" && event.category === "SECRET") {
      // Secret access is expected — only flag if metadata indicates exposure risk
      const exposed = event.metadata["exposed"] === true;
      if (exposed) {
        signals.push(makeSignal(
          "SECRET_EXPOSURE_RISK",
          orgSlug,
          [event.id],
          event.resource,
        ));
      }
    }
  }

  return signals;
}

// ── Lookup ────────────────────────────────────────────────────────────────────

/** Get the definition for a well-known signal type. */
export function getSignalDefinition(signalId: SecuritySignalId): SignalDefinition {
  return SIGNAL_DEFINITIONS[signalId];
}

/** All known signal IDs. */
export const ALL_SIGNAL_IDS: SecuritySignalId[] = Object.keys(SIGNAL_DEFINITIONS) as SecuritySignalId[];
