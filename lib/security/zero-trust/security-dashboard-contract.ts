/**
 * lib/security/zero-trust/security-dashboard-contract.ts
 *
 * AGENTIK-SECURITY-ZERO-TRUST-01
 * Security Dashboard Contract — Metrics and KPI Definitions (No UI)
 *
 * No server-only. No Prisma. Pure domain types and aggregation helpers.
 *
 * This file defines the contract for what the security dashboard consumes.
 * No rendering, no React, no Tailwind — types and builders only.
 *
 * Metrics:
 *   - Total evaluations (allow/deny/challenge)
 *   - Deny rate (per org, per resource, per agent)
 *   - Cross-tenant attempts
 *   - Agent scope violations
 *   - Integration blocks
 *   - Secret access denials
 *   - Session hijack signals
 *   - Trust score distribution
 *   - Risk level breakdown
 *   - Top denied resources
 */

import type { ZeroTrustRiskLevel } from "./zero-trust-types";
import type { SecurityEvent, SecurityEventSeverity } from "./security-events";

// ── Dashboard KPI Types ────────────────────────────────────────────────────────

export interface ZeroTrustSummaryKPIs {
  /** Total evaluations in the period. */
  totalEvaluations:      number;
  /** Evaluations that resulted in ALLOW. */
  totalAllowed:          number;
  /** Evaluations that resulted in DENY. */
  totalDenied:           number;
  /** Evaluations that resulted in CHALLENGE. */
  totalChallenged:       number;
  /** Deny rate as a percentage (0–100). */
  denyRate:              number;
  /** Critical risk events. */
  criticalEvents:        number;
  /** Events requiring immediate action. */
  requiresActionCount:   number;
  /** Period start (ISO). */
  periodStart:           string;
  /** Period end (ISO). */
  periodEnd:             string;
}

export interface ThreatBreakdown {
  crossTenantAttempts:    number;
  agentScopeViolations:   number;
  integrationBlocks:      number;
  secretAccessDenials:    number;
  sessionHijackSignals:   number;
  sessionExpiredEvents:   number;
}

export interface TrustScoreDistribution {
  /** Count of evaluations with score 0–30. */
  critical:  number;
  /** Count with score 31–50. */
  high:      number;
  /** Count with score 51–75. */
  medium:    number;
  /** Count with score 76–100. */
  low:       number;
}

export interface RiskLevelBreakdown {
  low:      number;
  medium:   number;
  high:     number;
  critical: number;
}

export interface TopDeniedResource {
  resourceType: string;
  denyCount:    number;
  lastDeniedAt: string;
}

export interface AgentSecurityMetrics {
  agentId:         string;
  scopeViolations: number;
  deniedRequests:  number;
  allowedRequests: number;
}

export interface IntegrationSecurityMetrics {
  integrationId:   string;
  blockedRequests: number;
  allowedRequests: number;
  lastBlockedAt:   string | null;
}

// ── Full Dashboard Payload ────────────────────────────────────────────────────

export interface ZeroTrustDashboardPayload {
  /** Summary KPIs. */
  summary:            ZeroTrustSummaryKPIs;
  /** Threat breakdown. */
  threats:            ThreatBreakdown;
  /** Trust score histogram. */
  scoreDistribution:  TrustScoreDistribution;
  /** Risk level breakdown. */
  riskBreakdown:      RiskLevelBreakdown;
  /** Top denied resources (up to 10). */
  topDenied:          TopDeniedResource[];
  /** Per-agent security metrics. */
  agentMetrics:       AgentSecurityMetrics[];
  /** Per-integration security metrics. */
  integrationMetrics: IntegrationSecurityMetrics[];
  /** Generated at ISO timestamp. */
  generatedAt:        string;
  /** Organization. */
  orgSlug:            string;
}

// ── Aggregation Helpers ───────────────────────────────────────────────────────

/**
 * buildZeroTrustDashboard — aggregate a list of SecurityEvents into a dashboard payload.
 *
 * Events are expected to be pre-filtered to the desired time window.
 */
export function buildZeroTrustDashboard(params: {
  orgSlug: string;
  events:  SecurityEvent[];
  periodStart: string;
  periodEnd:   string;
}): ZeroTrustDashboardPayload {
  const { orgSlug, events, periodStart, periodEnd } = params;

  const orgEvents = events.filter(e => e.orgSlug === orgSlug);

  const summary = buildSummaryKPIs(orgEvents, periodStart, periodEnd);
  const threats = buildThreatBreakdown(orgEvents);

  return {
    summary,
    threats,
    scoreDistribution:  buildScoreDistribution(orgEvents),
    riskBreakdown:      buildRiskBreakdown(orgEvents),
    topDenied:          buildTopDenied(orgEvents),
    agentMetrics:       buildAgentMetrics(orgEvents),
    integrationMetrics: buildIntegrationMetrics(orgEvents),
    generatedAt:        new Date().toISOString(),
    orgSlug,
  };
}

/**
 * buildEmptyDashboard — return a zeroed-out dashboard for orgs with no events.
 */
export function buildEmptyDashboard(orgSlug: string): ZeroTrustDashboardPayload {
  const now = new Date().toISOString();
  return {
    summary: {
      totalEvaluations: 0, totalAllowed: 0, totalDenied: 0,
      totalChallenged: 0, denyRate: 0, criticalEvents: 0,
      requiresActionCount: 0, periodStart: now, periodEnd: now,
    },
    threats:           { crossTenantAttempts: 0, agentScopeViolations: 0, integrationBlocks: 0, secretAccessDenials: 0, sessionHijackSignals: 0, sessionExpiredEvents: 0 },
    scoreDistribution: { critical: 0, high: 0, medium: 0, low: 0 },
    riskBreakdown:     { low: 0, medium: 0, high: 0, critical: 0 },
    topDenied:         [],
    agentMetrics:      [],
    integrationMetrics: [],
    generatedAt:       now,
    orgSlug,
  };
}

// ── Internal builders ─────────────────────────────────────────────────────────

function buildSummaryKPIs(
  events:      SecurityEvent[],
  periodStart: string,
  periodEnd:   string,
): ZeroTrustSummaryKPIs {
  const totalEvaluations = events.length;
  const totalAllowed     = events.filter(e => e.decision === "ALLOW").length;
  const totalDenied      = events.filter(e => e.decision === "DENY").length;
  const totalChallenged  = events.filter(e => e.decision === "CHALLENGE").length;
  const denyRate         = totalEvaluations > 0
    ? Math.round((totalDenied / totalEvaluations) * 100)
    : 0;
  const criticalEvents        = events.filter(e => e.riskLevel === "CRITICAL").length;
  const requiresActionCount   = events.filter(e => e.requiresAction).length;

  return {
    totalEvaluations, totalAllowed, totalDenied, totalChallenged,
    denyRate, criticalEvents, requiresActionCount, periodStart, periodEnd,
  };
}

function buildThreatBreakdown(events: SecurityEvent[]): ThreatBreakdown {
  return {
    crossTenantAttempts:  events.filter(e => e.eventType === "CROSS_TENANT_BLOCKED").length,
    agentScopeViolations: events.filter(e => e.eventType === "AGENT_SCOPE_BLOCKED").length,
    integrationBlocks:    events.filter(e => e.eventType === "INTEGRATION_BLOCKED").length,
    secretAccessDenials:  events.filter(e => e.eventType === "SECRET_ACCESS_DENIED").length,
    sessionHijackSignals: events.filter(e => e.eventType === "SESSION_HIJACK_DETECTED").length,
    sessionExpiredEvents: events.filter(e => e.eventType === "SESSION_EXPIRED").length,
  };
}

function buildScoreDistribution(_events: SecurityEvent[]): TrustScoreDistribution {
  // SecurityEvent doesn't carry trust score — that lives in ZeroTrustEvaluation.
  // Dashboard consumers with score access would pass scored events; we return zeroed here.
  return { critical: 0, high: 0, medium: 0, low: 0 };
}

function buildRiskBreakdown(events: SecurityEvent[]): RiskLevelBreakdown {
  const count: Record<ZeroTrustRiskLevel, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  for (const e of events) {
    count[e.riskLevel] = (count[e.riskLevel] ?? 0) + 1;
  }
  return { low: count.LOW, medium: count.MEDIUM, high: count.HIGH, critical: count.CRITICAL };
}

function buildTopDenied(events: SecurityEvent[]): TopDeniedResource[] {
  const counts = new Map<string, { count: number; lastAt: string }>();
  for (const e of events) {
    if (e.decision === "DENY") {
      const existing = counts.get(e.resourceType);
      if (!existing) {
        counts.set(e.resourceType, { count: 1, lastAt: e.occurredAt });
      } else {
        existing.count += 1;
        if (e.occurredAt > existing.lastAt) existing.lastAt = e.occurredAt;
      }
    }
  }

  return Array.from(counts.entries())
    .map(([resourceType, { count, lastAt }]) => ({
      resourceType,
      denyCount:    count,
      lastDeniedAt: lastAt,
    }))
    .sort((a, b) => b.denyCount - a.denyCount)
    .slice(0, 10);
}

function buildAgentMetrics(events: SecurityEvent[]): AgentSecurityMetrics[] {
  const agents = new Map<string, AgentSecurityMetrics>();
  for (const e of events) {
    if (e.subjectType !== "AGENT") continue;
    const agentId = e.subjectId;
    if (!agents.has(agentId)) {
      agents.set(agentId, { agentId, scopeViolations: 0, deniedRequests: 0, allowedRequests: 0 });
    }
    const m = agents.get(agentId)!;
    if (e.eventType === "AGENT_SCOPE_BLOCKED") m.scopeViolations += 1;
    if (e.decision === "DENY") m.deniedRequests += 1;
    else m.allowedRequests += 1;
  }
  return Array.from(agents.values());
}

function buildIntegrationMetrics(events: SecurityEvent[]): IntegrationSecurityMetrics[] {
  const integrations = new Map<string, IntegrationSecurityMetrics>();
  for (const e of events) {
    if (e.subjectType !== "INTEGRATION") continue;
    const integrationId = e.subjectId;
    if (!integrations.has(integrationId)) {
      integrations.set(integrationId, {
        integrationId, blockedRequests: 0, allowedRequests: 0, lastBlockedAt: null,
      });
    }
    const m = integrations.get(integrationId)!;
    if (e.decision === "DENY") {
      m.blockedRequests += 1;
      if (!m.lastBlockedAt || e.occurredAt > m.lastBlockedAt) {
        m.lastBlockedAt = e.occurredAt;
      }
    } else {
      m.allowedRequests += 1;
    }
  }
  return Array.from(integrations.values());
}

// ── Severity badge helper (for consumer use) ──────────────────────────────────

/**
 * severityToLabel — human-readable label for a severity level.
 */
export function severityToLabel(severity: SecurityEventSeverity): string {
  switch (severity) {
    case "CRITICAL": return "Crítico";
    case "HIGH":     return "Alto";
    case "WARNING":  return "Advertencia";
    case "INFO":     return "Info";
  }
}
