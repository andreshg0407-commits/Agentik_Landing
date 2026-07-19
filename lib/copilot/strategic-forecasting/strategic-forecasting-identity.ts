// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 2: Identity Generation

let _counter = 0;
function next(): string {
  _counter = (_counter + 1) % 99999;
  return _counter.toString(36).padStart(3, "0");
}

export const FORECAST_ID_PREFIXES = [
  "forecast_",
  "scenario_",
  "fsignal_",
  "ftrend_",
  "ftraj_",
  "freport_",
  "fdigest_",
  "fbriefing_",
  "frisk_",
  "fopp_",
  "fassume_",
  "fevidence_",
  "frec_",
  "faud_",
] as const;

export type ForecastIdPrefix = (typeof FORECAST_ID_PREFIXES)[number];

export function generateForecastId(): string {
  return `forecast_${Date.now().toString(36)}_${next()}`;
}

export function generateScenarioId(): string {
  return `scenario_${Date.now().toString(36)}_${next()}`;
}

export function generateForecastSignalId(): string {
  return `fsignal_${Date.now().toString(36)}_${next()}`;
}

export function generateForecastTrendId(): string {
  return `ftrend_${Date.now().toString(36)}_${next()}`;
}

export function generateForecastTrajectoryId(): string {
  return `ftraj_${Date.now().toString(36)}_${next()}`;
}

export function generateForecastReportId(): string {
  return `freport_${Date.now().toString(36)}_${next()}`;
}

export function generateForecastDigestId(): string {
  return `fdigest_${Date.now().toString(36)}_${next()}`;
}

export function generateForecastBriefingId(): string {
  return `fbriefing_${Date.now().toString(36)}_${next()}`;
}

export function generateForecastRiskId(): string {
  return `frisk_${Date.now().toString(36)}_${next()}`;
}

export function generateForecastOpportunityId(): string {
  return `fopp_${Date.now().toString(36)}_${next()}`;
}

export function generateForecastAssumptionId(): string {
  return `fassume_${Date.now().toString(36)}_${next()}`;
}

export function generateForecastEvidenceId(): string {
  return `fevidence_${Date.now().toString(36)}_${next()}`;
}

export function generateForecastRecommendationId(): string {
  return `frec_${Date.now().toString(36)}_${next()}`;
}

export function generateForecastAuditId(): string {
  return `faud_${Date.now().toString(36)}_${next()}`;
}

export function validateForecastId(id: string): boolean {
  return FORECAST_ID_PREFIXES.some((prefix) => id.startsWith(prefix));
}

export function getForecastIdPrefix(id: string): ForecastIdPrefix | null {
  return FORECAST_ID_PREFIXES.find((prefix) => id.startsWith(prefix)) ?? null;
}
