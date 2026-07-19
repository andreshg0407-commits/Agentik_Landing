// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 28: Audit Integration

import { generateForecastAuditId } from "../strategic-forecasting-identity";

export type ForecastAuditEventType =
  | "FORECAST_INITIATED"
  | "FORECAST_COMPLETED"
  | "SCENARIO_GENERATED"
  | "RISK_IDENTIFIED"
  | "OPPORTUNITY_IDENTIFIED"
  | "ASSUMPTION_DECLARED"
  | "CONFIDENCE_COMPUTED"
  | "NARRATIVE_GENERATED"
  | "TENANT_ISOLATION_VERIFIED";

export interface ForecastAuditEvent {
  readonly id:         string;
  readonly orgSlug:    string;
  readonly sessionId:  string;
  readonly eventType:  ForecastAuditEventType;
  readonly summary:    string;
  readonly metadata:   Record<string, unknown>;
  readonly createdAt:  string;
}

export function auditForecastInitiated(
  orgSlug: string,
  sessionId: string,
  horizon: string
): ForecastAuditEvent {
  return {
    id:        generateForecastAuditId(),
    orgSlug,
    sessionId,
    eventType: "FORECAST_INITIATED",
    summary:   `Proyección estratégica iniciada para ${orgSlug} — horizonte: ${horizon}`,
    metadata:  { horizon, suggestedOnly: true },
    createdAt: new Date().toISOString(),
  };
}

export function auditForecastCompleted(
  orgSlug: string,
  sessionId: string,
  forecastScore: number,
  status: string
): ForecastAuditEvent {
  return {
    id:        generateForecastAuditId(),
    orgSlug,
    sessionId,
    eventType: "FORECAST_COMPLETED",
    summary:   `Proyección completada — score: ${(forecastScore * 100).toFixed(0)}%, estado: ${status}`,
    metadata:  { forecastScore, status, suggestedOnly: true },
    createdAt: new Date().toISOString(),
  };
}

export function auditScenarioGenerated(
  orgSlug: string,
  sessionId: string,
  scenarioType: string,
  probability: number
): ForecastAuditEvent {
  return {
    id:        generateForecastAuditId(),
    orgSlug,
    sessionId,
    eventType: "SCENARIO_GENERATED",
    summary:   `Escenario generado: ${scenarioType} — probabilidad estimada: ${(probability * 100).toFixed(0)}%`,
    metadata:  { scenarioType, probability, suggestedOnly: true },
    createdAt: new Date().toISOString(),
  };
}

export function auditRiskIdentified(
  orgSlug: string,
  sessionId: string,
  riskTitle: string,
  compositeRisk: number
): ForecastAuditEvent {
  return {
    id:        generateForecastAuditId(),
    orgSlug,
    sessionId,
    eventType: "RISK_IDENTIFIED",
    summary:   `Riesgo identificado: ${riskTitle} — riesgo compuesto: ${(compositeRisk * 100).toFixed(0)}%`,
    metadata:  { riskTitle, compositeRisk },
    createdAt: new Date().toISOString(),
  };
}

export function auditTenantIsolationVerified(
  orgSlug: string,
  sessionId: string
): ForecastAuditEvent {
  return {
    id:        generateForecastAuditId(),
    orgSlug,
    sessionId,
    eventType: "TENANT_ISOLATION_VERIFIED",
    summary:   `Aislamiento de tenant verificado para ${orgSlug}`,
    metadata:  { orgSlug },
    createdAt: new Date().toISOString(),
  };
}
