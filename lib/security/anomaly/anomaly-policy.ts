/**
 * lib/security/anomaly/anomaly-policy.ts
 *
 * AGENTIK-SECURITY-ANOMALY-DETECTION-01
 * Detection Policy Engine — Configurable Thresholds
 *
 * No server-only. No Prisma. Pure domain data.
 * Policies are independent of the detection engine.
 */

import type { AnomalyType, AnomalySeverity } from "./anomaly-types";

// ── AnomalyPolicy ─────────────────��─────────────────────────────���─────────────

export interface AnomalyPolicy {
  /** Stable unique policy identifier. */
  id:            string;
  /** Human-readable name. */
  name:          string;
  /** AnomalyType this policy governs. */
  type:          AnomalyType;
  /** Severity if threshold is crossed. */
  severity:      AnomalySeverity;
  /** Event count required to trigger (0 = always trigger). */
  threshold:     number;
  /** Rolling time window in seconds. */
  windowSeconds: number;
  /** Whether this policy is active. */
  enabled:       boolean;
  /** Human-readable description of what this policy detects. */
  description:   string;
  /** Weight contribution when triggered (0–100). */
  weight:        number;
}

// ── Policy Registry ─────────────────��─────────────────────────────────────────

export const ANOMALY_POLICIES: AnomalyPolicy[] = [

  // ── Login Failure Spike ──────────────────────────────────────────────────────
  {
    id:            "LOGIN_FAILURE_SPIKE_5_10M",
    name:          "Login Failure Spike",
    type:          "LOGIN_FAILURE_SPIKE",
    severity:      "MEDIUM",
    threshold:     5,
    windowSeconds: 600,   // 10 min
    enabled:       true,
    description:   "5 or more failed logins within a 10-minute window.",
    weight:        30,
  },
  {
    id:            "LOGIN_FAILURE_SPIKE_15_5M",
    name:          "Login Failure Spike — Severe",
    type:          "LOGIN_FAILURE_SPIKE",
    severity:      "HIGH",
    threshold:     15,
    windowSeconds: 300,   // 5 min
    enabled:       true,
    description:   "15 or more failed logins within a 5-minute window.",
    weight:        60,
  },

  // ── MFA Failure Spike ────────────────────────────────────────────────────────
  {
    id:            "MFA_FAILURE_SPIKE_5_10M",
    name:          "MFA Failure Spike",
    type:          "MFA_FAILURE_SPIKE",
    severity:      "MEDIUM",
    threshold:     5,
    windowSeconds: 600,   // 10 min
    enabled:       true,
    description:   "5 or more failed MFA attempts within a 10-minute window.",
    weight:        35,
  },
  {
    id:            "MFA_FAILURE_SPIKE_10_5M",
    name:          "MFA Failure Spike — Severe",
    type:          "MFA_FAILURE_SPIKE",
    severity:      "HIGH",
    threshold:     10,
    windowSeconds: 300,   // 5 min
    enabled:       true,
    description:   "10 or more failed MFA attempts within a 5-minute window.",
    weight:        70,
  },

  // ── New Device ─────────────────────────────────────────────��─────────────────
  {
    id:            "NEW_DEVICE_FIRST_SEEN",
    name:          "New Device First Seen",
    type:          "NEW_DEVICE",
    severity:      "LOW",
    threshold:     1,
    windowSeconds: 0,
    enabled:       true,
    description:   "User authenticated from a device not previously seen.",
    weight:        20,
  },

  // ─�� New Country ───────────────���──────────────────────────────────────────────
  {
    id:            "NEW_COUNTRY_FIRST_SEEN",
    name:          "New Country First Seen",
    type:          "NEW_COUNTRY",
    severity:      "MEDIUM",
    threshold:     1,
    windowSeconds: 0,
    enabled:       true,
    description:   "User authenticated from a country not previously seen.",
    weight:        40,
  },

  // ── New IP ────────────────��──────────────────────────────────────────────────
  {
    id:            "NEW_IP_FIRST_SEEN",
    name:          "New IP First Seen",
    type:          "NEW_IP",
    severity:      "LOW",
    threshold:     1,
    windowSeconds: 0,
    enabled:       true,
    description:   "User authenticated from an IP not previously seen.",
    weight:        15,
  },

  // ── Vault Access Spike ───────────────���───────────────────────────────────────
  {
    id:            "VAULT_ACCESS_SPIKE_10_5M",
    name:          "Vault Access Spike",
    type:          "VAULT_ACCESS_SPIKE",
    severity:      "HIGH",
    threshold:     10,
    windowSeconds: 300,   // 5 min
    enabled:       true,
    description:   "10 or more Vault secret accesses within a 5-minute window.",
    weight:        65,
  },
  {
    id:            "VAULT_ACCESS_SPIKE_30_10M",
    name:          "Vault Access Spike — Severe",
    type:          "VAULT_ACCESS_SPIKE",
    severity:      "CRITICAL",
    threshold:     30,
    windowSeconds: 600,   // 10 min
    enabled:       true,
    description:   "30 or more Vault secret accesses within a 10-minute window (possible enumeration).",
    weight:        90,
  },

  // ── KMS Usage Spike ──────────────��────────────────────────────���──────────────
  {
    id:            "KMS_USAGE_SPIKE_20_10M",
    name:          "KMS Usage Spike",
    type:          "KMS_USAGE_SPIKE",
    severity:      "HIGH",
    threshold:     20,
    windowSeconds: 600,   // 10 min
    enabled:       true,
    description:   "20 or more KMS operations within a 10-minute window.",
    weight:        60,
  },

  // ��─ Secret Rotation Spike ────────────────────────────────────────────��───────
  {
    id:            "SECRET_ROTATION_SPIKE_5_10M",
    name:          "Secret Rotation Spike",
    type:          "SECRET_ROTATION_SPIKE",
    severity:      "HIGH",
    threshold:     5,
    windowSeconds: 600,   // 10 min
    enabled:       true,
    description:   "5 or more secret rotations within a 10-minute window (possible sabotage).",
    weight:        70,
  },

  // ── Privilege Escalation ─────────��────────────────────────────────────��──────
  {
    id:            "PRIVILEGE_ESCALATION_ANY",
    name:          "Privilege Escalation Attempt",
    type:          "PRIVILEGE_ESCALATION",
    severity:      "HIGH",
    threshold:     1,
    windowSeconds: 0,
    enabled:       true,
    description:   "Any attempt to access resources above the subject's permission level.",
    weight:        75,
  },

  // ── Cross-Tenant Attempt ─────────────────────────────────────────────────────
  {
    id:            "CROSS_TENANT_ATTEMPT_ANY",
    name:          "Cross-Tenant Access Attempt",
    type:          "CROSS_TENANT_ATTEMPT",
    severity:      "CRITICAL",
    threshold:     1,
    windowSeconds: 0,
    enabled:       true,
    description:   "Any attempt to access another tenant's data or resources.",
    weight:        100,
  },

  // ── Agent Permission Violation ───────────────────────────────────────────────
  {
    id:            "AGENT_PERMISSION_VIOLATION_ANY",
    name:          "Agent Permission Violation",
    type:          "AGENT_PERMISSION_VIOLATION",
    severity:      "HIGH",
    threshold:     1,
    windowSeconds: 0,
    enabled:       true,
    description:   "Agent attempted an operation outside its declared capabilities.",
    weight:        80,
  },

  // ── Critical Admin Without MFA ──────���───────────────────���────────────────────
  {
    id:            "HIGH_RISK_SESSION_NO_MFA",
    name:          "High-Risk Operation Without MFA",
    type:          "HIGH_RISK_SESSION",
    severity:      "HIGH",
    threshold:     1,
    windowSeconds: 0,
    enabled:       true,
    description:   "Critical administrative operation attempted without MFA verification.",
    weight:        80,
  },
];

// ── Policy Queries ────────────────────────────────────────────────────────────

export function getPoliciesForType(type: AnomalyType): AnomalyPolicy[] {
  return ANOMALY_POLICIES.filter(p => p.type === type && p.enabled);
}

export function getPolicyById(id: string): AnomalyPolicy | undefined {
  return ANOMALY_POLICIES.find(p => p.id === id);
}

export function getEnabledPolicies(): AnomalyPolicy[] {
  return ANOMALY_POLICIES.filter(p => p.enabled);
}

export function getPoliciesForSeverity(severity: AnomalySeverity): AnomalyPolicy[] {
  return ANOMALY_POLICIES.filter(p => p.severity === severity && p.enabled);
}
