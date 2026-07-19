/**
 * lib/security/anomaly/correlation-engine.ts
 *
 * AGENTIK-SECURITY-ANOMALY-DETECTION-01
 * Correlation Engine — Combines Signals Into Composite Alerts
 *
 * Server-only. Pure domain logic. No Prisma.
 *
 * Correlation rules:
 *   MFA_FAILURE_SPIKE + NEW_DEVICE + NEW_COUNTRY → HIGH_RISK_SESSION (CRITICAL)
 *   PRIVILEGE_ESCALATION + CROSS_TENANT_ATTEMPT → CRITICAL alert
 *   MFA_FAILURE_SPIKE + LOGIN_FAILURE_SPIKE → HIGH alert (credential stuffing)
 *   VAULT_ACCESS_SPIKE + KMS_USAGE_SPIKE → HIGH alert (key material extraction)
 *   AGENT_PERMISSION_VIOLATION × 3 → HIGH alert (agent compromise)
 */

import "server-only";

import type { AnomalySignal, AnomalyAlert, AnomalyType, AnomalySeverity } from "./anomaly-types";

let _idCounter = 0;
function _alertId(): string { return `corr-${Date.now()}-${++_idCounter}`; }

// ── Correlation Rule ──────────────────────────────────────────────────────────

interface CorrelationRule {
  id:          string;
  name:        string;
  /** AnomalyTypes that must ALL be present to trigger. */
  requires:    AnomalyType[];
  /** Resulting alert type. */
  resultType:  AnomalyType;
  severity:    AnomalySeverity;
  title:       (signals: AnomalySignal[]) => string;
  description: (signals: AnomalySignal[]) => string;
}

const CORRELATION_RULES: CorrelationRule[] = [
  {
    id:          "CORR_HIGH_RISK_SESSION",
    name:        "High-Risk Session Correlation",
    requires:    ["MFA_FAILURE_SPIKE", "NEW_DEVICE", "NEW_COUNTRY"],
    resultType:  "HIGH_RISK_SESSION",
    severity:    "CRITICAL",
    title:       () => "High-Risk Session Detected",
    description: (sigs) => {
      const org = sigs[0]?.orgSlug ?? "unknown";
      return `Correlated signals indicate a high-risk session for org ${org}: MFA failures, new device, and new country simultaneously.`;
    },
  },
  {
    id:          "CORR_CREDENTIAL_STUFFING",
    name:        "Credential Stuffing Pattern",
    requires:    ["MFA_FAILURE_SPIKE", "LOGIN_FAILURE_SPIKE"],
    resultType:  "HIGH_RISK_SESSION",
    severity:    "HIGH",
    title:       () => "Credential Stuffing Pattern Detected",
    description: (sigs) => {
      const org = sigs[0]?.orgSlug ?? "unknown";
      return `Correlated MFA and login failures suggest credential stuffing attack against org ${org}.`;
    },
  },
  {
    id:          "CORR_KEY_EXTRACTION",
    name:        "Key Material Extraction Pattern",
    requires:    ["VAULT_ACCESS_SPIKE", "KMS_USAGE_SPIKE"],
    resultType:  "HIGH_RISK_SESSION",
    severity:    "HIGH",
    title:       () => "Key Material Extraction Pattern",
    description: (sigs) => {
      const org = sigs[0]?.orgSlug ?? "unknown";
      return `Correlated Vault access spike and KMS usage spike suggest key material extraction attempt in org ${org}.`;
    },
  },
  {
    id:          "CORR_CRITICAL_CROSS_TENANT",
    name:        "Cross-Tenant + Privilege Escalation",
    requires:    ["CROSS_TENANT_ATTEMPT", "PRIVILEGE_ESCALATION"],
    resultType:  "CROSS_TENANT_ATTEMPT",
    severity:    "CRITICAL",
    title:       () => "Critical: Cross-Tenant + Privilege Escalation",
    description: (sigs) => {
      const org = sigs[0]?.orgSlug ?? "unknown";
      return `CRITICAL: Cross-tenant access attempt combined with privilege escalation detected in org ${org}.`;
    },
  },
  {
    id:          "CORR_AGENT_COMPROMISE",
    name:        "Agent Compromise Pattern",
    requires:    ["AGENT_PERMISSION_VIOLATION", "UNUSUAL_ACTIVITY"],
    resultType:  "AGENT_PERMISSION_VIOLATION",
    severity:    "HIGH",
    title:       (sigs) => {
      const agentId = sigs.find(s => s.agentId)?.agentId ?? "unknown";
      return `Agent Compromise Suspected: ${agentId}`;
    },
    description: (sigs) => {
      const agentId = sigs.find(s => s.agentId)?.agentId ?? "unknown";
      return `Agent ${agentId} shows correlated permission violations and unusual activity — possible agent compromise.`;
    },
  },
];

// ── correlateSignals ──────────────────────────────────────────────────────────

/**
 * correlateSignals — apply correlation rules to a set of signals.
 *
 * Returns correlated AnomalyAlerts (one per triggered rule).
 * Never throws — returns empty array on error.
 */
export function correlateSignals(
  signals: AnomalySignal[],
  orgSlug: string,
): AnomalyAlert[] {
  try {
    if (!signals.length || !orgSlug) return [];

    const orgSignals  = signals.filter(s => s.orgSlug === orgSlug);
    const presentTypes = new Set(orgSignals.map(s => s.type));
    const alerts: AnomalyAlert[] = [];
    const now = new Date().toISOString();

    for (const rule of CORRELATION_RULES) {
      const allPresent = rule.requires.every(t => presentTypes.has(t));
      if (!allPresent) continue;

      const relevantSignals = orgSignals.filter(s => rule.requires.includes(s.type));
      const riskScore = Math.min(100, relevantSignals.reduce((acc, s) => acc + s.weight, 0));

      alerts.push({
        id:           _alertId(),
        type:         rule.resultType,
        orgSlug,
        severity:     rule.severity,
        status:       "OPEN",
        title:        rule.title(relevantSignals),
        description:  rule.description(relevantSignals),
        signals:      relevantSignals,
        riskScore,
        createdAt:    now,
        updatedAt:    now,
        metadata:     { correlationRuleId: rule.id, correlationRuleName: rule.name },
        isCorrelated: true,
        sourceRule:   rule.id,
      });
    }

    return alerts;
  } catch {
    return [];
  }
}

/** Get the list of active correlation rules (for health/readiness). */
export function getCorrelationRules(): { id: string; name: string; requires: AnomalyType[] }[] {
  return CORRELATION_RULES.map(r => ({
    id:       r.id,
    name:     r.name,
    requires: r.requires,
  }));
}
