/**
 * lib/security/anomaly/anomaly-readiness.ts
 *
 * AGENTIK-SECURITY-ANOMALY-DETECTION-01
 * Anomaly Readiness Scanner — Dependency Readiness Evaluation
 *
 * Server-only. Evaluates readiness of all anomaly detection dependencies.
 */

import "server-only";

import { anomalyRegistry } from "./anomaly-registry";
import { getCorrelationRules } from "./correlation-engine";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AnomalyReadinessStatus = "READY" | "PARTIAL" | "NOT_READY";

export interface AnomalySubsystemCheck {
  id:          string;
  name:        string;
  status:      AnomalyReadinessStatus;
  description: string;
  blockers?:   string[];
}

export interface AnomalyReadinessReport {
  overall:     AnomalyReadinessStatus;
  score:       number;   // 0–100
  checks:      AnomalySubsystemCheck[];
  generatedAt: string;
}

// ── scanAnomalyReadiness ──────────────────────────────────────────────────────

export function scanAnomalyReadiness(): AnomalyReadinessReport {
  const now    = new Date().toISOString();
  const checks = _runChecks();

  const ready    = checks.filter(c => c.status === "READY").length;
  const partial  = checks.filter(c => c.status === "PARTIAL").length;
  const notReady = checks.filter(c => c.status === "NOT_READY").length;

  const score = Math.round(
    (ready * 100 + partial * 50) / (checks.length * 100) * 100,
  );

  const overall: AnomalyReadinessStatus =
    notReady === 0 && partial === 0 ? "READY" :
    notReady  > 0 || score < 50     ? "NOT_READY" : "PARTIAL";

  return { overall, score, checks, generatedAt: now };
}

// ── Individual Checks ─────────────────────────────────────────────────────────

function _runChecks(): AnomalySubsystemCheck[] {
  return [
    _checkDetectorRegistry(),
    _checkMfaReadiness(),
    _checkVaultReadiness(),
    _checkKmsReadiness(),
    _checkCorrelationReadiness(),
    _checkRiskScoringReadiness(),
    _checkAuditReadiness(),
    _checkExecutiveBrainReadiness(),
    _checkZeroTrustReadiness(),
    _checkSocReadiness(),
  ];
}

function _checkDetectorRegistry(): AnomalySubsystemCheck {
  const count = anomalyRegistry.size();
  return {
    id:          "DETECTOR_REGISTRY",
    name:        "Detector Registry",
    status:      count >= 8 ? "READY" : count >= 5 ? "PARTIAL" : "NOT_READY",
    description: `${count} detectors registered. Target: 11 (all anomaly types covered).`,
    blockers:    count < 5 ? ["fewer than 5 detectors registered"] : undefined,
  };
}

function _checkMfaReadiness(): AnomalySubsystemCheck {
  const hasMfaDetector = anomalyRegistry.getDetectorsForType("MFA_FAILURE_SPIKE").length > 0;
  return {
    id:          "MFA_INTEGRATION",
    name:        "MFA Integration",
    status:      hasMfaDetector ? "READY" : "NOT_READY",
    description: "MFA failure events consumed via anomaly-mfa.ts integration adapter.",
    blockers:    hasMfaDetector ? undefined : ["mfa-failure-detector not registered"],
  };
}

function _checkVaultReadiness(): AnomalySubsystemCheck {
  const hasVaultDetector = anomalyRegistry.getDetectorsForType("VAULT_ACCESS_SPIKE").length > 0;
  return {
    id:          "VAULT_INTEGRATION",
    name:        "Vault Integration",
    status:      hasVaultDetector ? "READY" : "PARTIAL",
    description: "Vault access events consumed via anomaly-vault.ts integration adapter.",
    blockers:    hasVaultDetector ? undefined : ["vault-anomaly-detector not registered"],
  };
}

function _checkKmsReadiness(): AnomalySubsystemCheck {
  const hasKmsDetector = anomalyRegistry.getDetectorsForType("KMS_USAGE_SPIKE").length > 0;
  return {
    id:          "KMS_INTEGRATION",
    name:        "KMS Integration",
    status:      hasKmsDetector ? "READY" : "PARTIAL",
    description: "KMS operation events consumed via anomaly-kms.ts integration adapter.",
    blockers:    hasKmsDetector ? undefined : ["kms-anomaly-detector not registered"],
  };
}

function _checkCorrelationReadiness(): AnomalySubsystemCheck {
  const rules = getCorrelationRules();
  return {
    id:          "CORRELATION_ENGINE",
    name:        "Correlation Engine",
    status:      rules.length >= 5 ? "READY" : rules.length >= 2 ? "PARTIAL" : "NOT_READY",
    description: `${rules.length} correlation rules active.`,
  };
}

function _checkRiskScoringReadiness(): AnomalySubsystemCheck {
  return {
    id:          "RISK_SCORING",
    name:        "Risk Scoring Engine",
    status:      "READY",
    description: "0–100 risk scoring with severity mapping and diminishing-returns model active.",
  };
}

function _checkAuditReadiness(): AnomalySubsystemCheck {
  return {
    id:          "AUDIT",
    name:        "Anomaly Audit",
    status:      "READY",
    description: "In-memory anomaly audit log active. Fire-and-forget persistence ready.",
  };
}

function _checkExecutiveBrainReadiness(): AnomalySubsystemCheck {
  return {
    id:          "EXECUTIVE_BRAIN",
    name:        "Executive Brain Integration",
    status:      "PARTIAL",
    description: "Signal builder ready. Executive Brain API calls pending (AGENTIK-COPILOT-EXEC-01).",
    blockers:    ["executive brain API not yet connected"],
  };
}

function _checkZeroTrustReadiness(): AnomalySubsystemCheck {
  return {
    id:          "ZERO_TRUST",
    name:        "Zero Trust Integration",
    status:      "READY",
    description: "Trust penalty signals generated from anomaly alerts. Zero Trust evaluation bridge active.",
  };
}

function _checkSocReadiness(): AnomalySubsystemCheck {
  return {
    id:          "SOC_WORKFLOW",
    name:        "SOC Workflow Readiness",
    status:      "NOT_READY",
    description: "SOC workflow integration planned (AGENTIK-SECURITY-SOC-01). Alert structures are SOC-compatible.",
    blockers:    ["SOC workflow not yet implemented", "SIEM connectors not yet configured"],
  };
}
