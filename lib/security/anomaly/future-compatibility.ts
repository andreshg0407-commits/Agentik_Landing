/**
 * lib/security/anomaly/future-compatibility.ts
 *
 * AGENTIK-SECURITY-ANOMALY-DETECTION-01
 * Future Compatibility Contract — SIEM and External Integration Plans
 *
 * No server-only. Pure domain documentation + interface stubs.
 *
 * This file defines the integration contracts for future SIEM, SOAR,
 * and security platform connections. All structures are designed to be
 * serializable and compatible with industry-standard formats.
 *
 * Planned integrations:
 *   - Splunk Enterprise Security
 *   - Datadog Security Monitoring
 *   - Elastic Security (SIEM/XDR)
 *   - Microsoft Sentinel
 *   - AWS Security Hub (ASFF)
 *   - Google Cloud Security Command Center (SCC)
 *   - PagerDuty (SOC escalation)
 *   - Slack (SOC notifications)
 *   - JIRA (ticket creation from CRITICAL alerts)
 */

import type { AnomalyAlert, AnomalySignal, AnomalyType, AnomalySeverity } from "./anomaly-types";

// ── SIEM Integration Plan ─────────────────────────────────────────────────────

export type SiemProvider =
  | "SPLUNK"
  | "DATADOG"
  | "ELASTIC"
  | "MICROSOFT_SENTINEL"
  | "AWS_SECURITY_HUB"
  | "GOOGLE_SCC"
  | "CUSTOM";

export interface SiemIntegrationPlan {
  provider:          SiemProvider;
  description:       string;
  targetSprint:      string;
  eventFormat:       string;
  authMethod:        string;
  deliveryMethod:    string;
  bufferingStrategy: string;
  retryPolicy:       string;
  readinessStatus:   "PLANNED" | "IN_PROGRESS" | "READY";
}

export const SIEM_INTEGRATION_PLANS: ReadonlyArray<SiemIntegrationPlan> = [
  {
    provider:          "SPLUNK",
    description:       "Ship AnomalyAlert events to Splunk via HTTP Event Collector (HEC). One event per alert state change. Sourcetype: agentik:anomaly:alert.",
    targetSprint:      "AGENTIK-SECURITY-SIEM-01",
    eventFormat:       "JSON over HTTP Event Collector (HEC). AnomalyAlert mapped to Splunk event with time, host, source, sourcetype, index fields.",
    authMethod:        "HEC token stored in Vault (VaultSecret with tag SIEM_SPLUNK). Never in env vars.",
    deliveryMethod:    "Async fire-and-forget via anomaly audit hook. Never blocks detection pipeline.",
    bufferingStrategy: "In-memory ring buffer (capacity: 1000). Flush on: buffer full, 5-second interval, or CRITICAL alert.",
    retryPolicy:       "3 retries with exponential backoff (1s, 2s, 4s). Dead-letter to anomaly audit log on exhaustion.",
    readinessStatus:   "PLANNED",
  },
  {
    provider:          "DATADOG",
    description:       "Ship AnomalySignal metrics and AnomalyAlert events to Datadog via DD Agent or HTTP API.",
    targetSprint:      "AGENTIK-SECURITY-SIEM-01",
    eventFormat:       "Datadog Events API v2. AnomalyAlert → DD event with alert_type (error/warning/info), tags (org_slug, severity, type, detector_id). Signals → DD custom metrics (agentik.anomaly.signal.weight gauge).",
    authMethod:        "DD API key + Application key stored in Vault. Never in env vars.",
    deliveryMethod:    "Async via anomaly audit hook. Metrics batch-flushed every 10s.",
    bufferingStrategy: "DD client batches metrics. Alerts delivered immediately (no buffering).",
    retryPolicy:       "2 retries. Dead-letter to anomaly audit log.",
    readinessStatus:   "PLANNED",
  },
  {
    provider:          "ELASTIC",
    description:       "Index AnomalyAlert and AnomalySignal documents into Elastic Security via Elasticsearch API or Elastic Agent.",
    targetSprint:      "AGENTIK-SECURITY-SIEM-02",
    eventFormat:       "ECS (Elastic Common Schema) 8.x. AnomalyAlert → ECS event.category: [intrusion_detection], event.type: [info|error], event.severity: 1–100. AnomalySignal → ECS event.category: [authentication|session|network].",
    authMethod:        "Elasticsearch API key or mTLS certificate stored in Vault.",
    deliveryMethod:    "Elasticsearch Bulk API. Batched async push. Never blocks detection.",
    bufferingStrategy: "In-memory queue (capacity: 2000). Flush on: queue full, 15-second interval.",
    retryPolicy:       "3 retries with jitter. Dead-letter to PostgreSQL anomaly_audit_events.",
    readinessStatus:   "PLANNED",
  },
  {
    provider:          "MICROSOFT_SENTINEL",
    description:       "Forward AnomalyAlert and AnomalySignal to Microsoft Sentinel via Azure Monitor Data Collection API.",
    targetSprint:      "AGENTIK-SECURITY-SIEM-02",
    eventFormat:       "Azure Monitor JSON (CommonSecurityLog / custom ASIM table). AnomalyAlert maps to SecurityAlert table. Type field maps to Azure SecurityAlert.AlertType.",
    authMethod:        "Azure AD Service Principal (client_id + client_secret) stored in Vault. AAD token refreshed every 55 minutes.",
    deliveryMethod:    "Azure Monitor Data Collection Endpoint (DCE). Async HTTP POST. Batched.",
    bufferingStrategy: "In-memory queue. Flush every 30s or on CRITICAL alert.",
    retryPolicy:       "Azure SDK retry policy (3 retries, exponential backoff with jitter).",
    readinessStatus:   "PLANNED",
  },
  {
    provider:          "AWS_SECURITY_HUB",
    description:       "Publish AnomalyAlert findings to AWS Security Hub via ASFF (Amazon Security Finding Format).",
    targetSprint:      "AGENTIK-SECURITY-SIEM-03",
    eventFormat:       "ASFF 1.0. AnomalyAlert → Security Hub Finding with Types: Software and Configuration Checks/Industry and Regulatory Standards or Unusual Behaviors/User. Severity.Label maps from AnomalySeverity: LOW→LOW, MEDIUM→MEDIUM, HIGH→HIGH, CRITICAL→CRITICAL.",
    authMethod:        "AWS IAM Role with SecurityHub:BatchImportFindings permission. Credentials from IAM role assumption or access key in Vault.",
    deliveryMethod:    "AWS SDK BatchImportFindings API. Max 100 findings per call. Async.",
    bufferingStrategy: "In-memory queue. Flush on: 100 findings accumulated or 60s interval.",
    retryPolicy:       "AWS SDK retry policy (3 retries). Dead-letter to anomaly audit log.",
    readinessStatus:   "PLANNED",
  },
  {
    provider:          "GOOGLE_SCC",
    description:       "Publish AnomalyAlert findings to Google Cloud Security Command Center (SCC) via Finding API.",
    targetSprint:      "AGENTIK-SECURITY-SIEM-03",
    eventFormat:       "SCC Finding v2. AnomalyAlert → SCC Finding with category: ANOMALY_{TYPE}, state: ACTIVE/INACTIVE, severity: LOW/MEDIUM/HIGH/CRITICAL. Signal details in sourceProperties.",
    authMethod:        "GCP Service Account key (JSON) stored in Vault. Credentials refreshed via googleapis auth.",
    deliveryMethod:    "Google Cloud SCC findings.create API. Async. One finding per OPEN alert.",
    bufferingStrategy: "Async per-alert. No batching required — SCC handles concurrency.",
    retryPolicy:       "GCP client library retry policy (3 retries). Dead-letter to anomaly audit log.",
    readinessStatus:   "PLANNED",
  },
];

// ── SOC Workflow Future Contract ──────────────────────────────────────────────

export interface SocWorkflowPlan {
  id:               string;
  name:             string;
  description:      string;
  triggerCondition: string;
  outputAction:     string;
  targetSprint:     string;
  readinessStatus:  "PLANNED" | "IN_PROGRESS" | "READY";
}

export const SOC_WORKFLOW_PLANS: ReadonlyArray<SocWorkflowPlan> = [
  {
    id:               "SOC_AUTO_TICKET",
    name:             "Auto-Ticket CRITICAL Alerts",
    description:      "Automatically create a JIRA or ServiceNow ticket for every CRITICAL alert. Ticket includes alert ID, type, orgSlug, riskScore, top signals, and correlation rule.",
    triggerCondition: "AnomalyAlert.severity === 'CRITICAL' && AnomalyAlert.status === 'OPEN'",
    outputAction:     "POST /jira/issue or /servicenow/incident with structured payload. Alert ID stored in ticket external ref.",
    targetSprint:     "AGENTIK-SECURITY-SOC-01",
    readinessStatus:  "PLANNED",
  },
  {
    id:               "SOC_PAGERDUTY",
    name:             "PagerDuty Escalation for HIGH+ Alerts",
    description:      "Trigger PagerDuty incident for unacknowledged HIGH or CRITICAL alerts older than 15 minutes. De-duplicate by orgSlug + type + alert ID.",
    triggerCondition: "AnomalyAlert.severity in ['HIGH', 'CRITICAL'] && alert age > 15min && status === 'OPEN'",
    outputAction:     "PagerDuty Events API v2. Events Integration key stored in Vault.",
    targetSprint:     "AGENTIK-SECURITY-SOC-01",
    readinessStatus:  "PLANNED",
  },
  {
    id:               "SOC_SLACK",
    name:             "Slack SOC Channel Notifications",
    description:      "Post structured alert summaries to a designated Slack security channel. Includes org, severity badge, risk score, top detectors, and acknowledge button.",
    triggerCondition: "Any new OPEN AnomalyAlert with severity HIGH or CRITICAL.",
    outputAction:     "Slack Block Kit message via Incoming Webhook. Webhook URL in Vault.",
    targetSprint:     "AGENTIK-SECURITY-SOC-01",
    readinessStatus:  "PLANNED",
  },
  {
    id:               "SOC_SOAR",
    name:             "SOAR Playbook Trigger",
    description:      "Trigger SOAR (Splunk SOAR, Palo Alto XSOAR, or n8n) playbooks for automated triage. Map AnomalyType to playbook ID. Playbook handles enrichment and optional analyst notification.",
    triggerCondition: "AnomalyAlert produced by correlation engine (isCorrelated === true).",
    outputAction:     "POST to SOAR webhook with full AnomalyAlert + signals payload. SOAR selects playbook by alert.type.",
    targetSprint:     "AGENTIK-SECURITY-SOAR-01",
    readinessStatus:  "PLANNED",
  },
];

// ── Alert Serialization Format (SIEM-compatible) ──────────────────────────────

/**
 * SiemAlertPayload — normalized alert structure for SIEM export.
 * All SIEM adapters should normalize AnomalyAlert to this format
 * before applying provider-specific mapping.
 */
export interface SiemAlertPayload {
  alertId:        string;
  orgSlug:        string;
  type:           AnomalyType;
  severity:       AnomalySeverity;
  status:         string;
  riskScore:      number;
  title:          string;
  description:    string;
  isCorrelated:   boolean;
  sourceRule:     string | null;
  signalCount:    number;
  topDetectors:   string[];
  createdAt:      string;
  updatedAt:      string;
  resolvedAt:     string | null;
  /** SIEM-specific: Unix epoch seconds for time-series indexing. */
  epochSeconds:   number;
}

/**
 * siemAlertFromAnomalyAlert — normalize AnomalyAlert to SiemAlertPayload.
 * Pure function — no side effects. Safe to call anywhere.
 */
export function siemAlertFromAnomalyAlert(
  alert: AnomalyAlert,
): SiemAlertPayload {
  const detectors = Array.from(
    new Set(alert.signals.map(s => s.detectorId)),
  );

  return {
    alertId:      alert.id,
    orgSlug:      alert.orgSlug,
    type:         alert.type,
    severity:     alert.severity,
    status:       alert.status,
    riskScore:    alert.riskScore,
    title:        alert.title,
    description:  alert.description,
    isCorrelated: alert.isCorrelated,
    sourceRule:   alert.sourceRule ?? null,
    signalCount:  alert.signals.length,
    topDetectors: detectors.slice(0, 5),
    createdAt:    alert.createdAt,
    updatedAt:    alert.updatedAt,
    resolvedAt:   alert.resolvedAt ?? null,
    epochSeconds: Math.floor(new Date(alert.createdAt).getTime() / 1000),
  };
}

/**
 * siemSignalFromAnomalySignal — normalize AnomalySignal to a SIEM-compatible flat record.
 * Used for metric indexing in Datadog, Elastic, and Splunk.
 */
export interface SiemSignalRecord {
  signalId:    string;
  orgSlug:     string;
  type:        AnomalyType;
  severity:    AnomalySeverity;
  weight:      number;
  detectorId:  string;
  occurredAt:  string;
  epochSeconds: number;
  userId:      string | null;
  agentId:     string | null;
  alertId:     string | null;
}

export function siemSignalFromAnomalySignal(
  signal: AnomalySignal,
): SiemSignalRecord {
  return {
    signalId:    signal.id,
    orgSlug:     signal.orgSlug,
    type:        signal.type,
    severity:    signal.severity,
    weight:      signal.weight,
    detectorId:  signal.detectorId,
    occurredAt:  signal.occurredAt,
    epochSeconds: Math.floor(new Date(signal.occurredAt).getTime() / 1000),
    userId:      signal.userId   ?? null,
    agentId:     signal.agentId  ?? null,
    alertId:     null, // populated by consumer if known
  };
}

// ── ML Baseline Future Contract ───────────────────────────────────────────────

/**
 * BaselineDetectionPlan — placeholder for future ML-based anomaly detection.
 * Current detectors use deterministic threshold rules.
 * Sprint AGENTIK-SECURITY-ANOMALY-ML-01 will add statistical baselines.
 */
export interface BaselineDetectionPlan {
  id:           string;
  anomalyType:  AnomalyType;
  method:       string;
  description:  string;
  targetSprint: string;
}

export const BASELINE_DETECTION_PLANS: ReadonlyArray<BaselineDetectionPlan> = [
  {
    id:           "BASELINE_LOGIN_FAILURES",
    anomalyType:  "LOGIN_FAILURE_SPIKE",
    method:       "Rolling Z-Score",
    description:  "Compute 7-day rolling mean and stddev of login failure rate per org. Alert when current rate exceeds mean + 3σ. Avoids alert fatigue from orgs with normally high failure rates.",
    targetSprint: "AGENTIK-SECURITY-ANOMALY-ML-01",
  },
  {
    id:           "BASELINE_VAULT_ACCESS",
    anomalyType:  "VAULT_ACCESS_SPIKE",
    method:       "EWMA (Exponential Weighted Moving Average)",
    description:  "Track per-org vault access rate with EWMA decay (α=0.3). Alert when rate > 3x EWMA. Faster adaptation to new usage patterns than fixed thresholds.",
    targetSprint: "AGENTIK-SECURITY-ANOMALY-ML-01",
  },
  {
    id:           "BASELINE_AGENT_VIOLATIONS",
    anomalyType:  "AGENT_PERMISSION_VIOLATION",
    method:       "Isolation Forest",
    description:  "Train a lightweight Isolation Forest on per-agent action vectors. Anomaly score > 0.7 triggers signal. Detects unusual tool combinations even without threshold breach.",
    targetSprint: "AGENTIK-SECURITY-ANOMALY-ML-02",
  },
];
