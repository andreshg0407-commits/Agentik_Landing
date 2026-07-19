/**
 * lib/security/anomaly/integrations/anomaly-session.ts
 *
 * AGENTIK-SECURITY-ANOMALY-DETECTION-01
 * Anomaly ← Session Integration
 *
 * Server-only. Consumes session binding events for device change detection.
 */

import "server-only";

import type { AnomalyContext } from "../anomaly-types";

// ── Session Event Input ───────────────────────────────────────────────────────

export interface SessionAnomalyEventInput {
  orgSlug:      string;
  userId:       string;
  sessionId:    string;
  deviceId?:    string;
  userAgent?:   string;
  ipAddress?:   string;
  country?:     string;
  trustScore?:  number;
  isNewDevice?: boolean;
  isNewCountry?: boolean;
  isNewIp?:     boolean;
  timestamp?:   string;
}

// ── sessionEventToAnomalyContext ──────────────────────────────────────────────

/**
 * sessionEventToAnomalyContext — convert a session event to AnomalyContext.
 */
export function sessionEventToAnomalyContext(input: SessionAnomalyEventInput): AnomalyContext {
  return {
    orgSlug:    input.orgSlug,
    userId:     input.userId,
    sessionId:  input.sessionId,
    deviceId:   input.deviceId,
    userAgent:  input.userAgent,
    ipAddress:  input.ipAddress,
    country:    input.country,
    timestamp:  input.timestamp ?? new Date().toISOString(),
    eventData:  {
      isNewDevice:  input.isNewDevice  ?? false,
      isNewCountry: input.isNewCountry ?? false,
      isNewIp:      input.isNewIp      ?? false,
      trustScore:   input.trustScore,
      deviceId:     input.deviceId,
      userAgent:    input.userAgent ? input.userAgent.slice(0, 120) : undefined,
    },
  };
}

/**
 * isHighRiskSession — quick heuristic for session risk.
 * Returns true if the session has multiple risk indicators.
 */
export function isHighRiskSession(input: SessionAnomalyEventInput): boolean {
  const riskCount =
    (input.isNewDevice  ? 1 : 0) +
    (input.isNewCountry ? 1 : 0) +
    (input.isNewIp      ? 1 : 0) +
    ((input.trustScore !== undefined && input.trustScore < 30) ? 1 : 0);

  return riskCount >= 2;
}
