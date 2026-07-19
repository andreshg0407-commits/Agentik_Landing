import type { ActivitySummary } from "./activity-summary";

export type OperationalStatus = "stable" | "attention" | "critical" | "unknown";

export interface BusinessStatus {
  status: OperationalStatus;
  reason: string;
}

// Priority order: critical > attention > stable > unknown
export function deriveBusinessStatus(summary: ActivitySummary): BusinessStatus {
  if (summary.runs.total === 0 && summary.alerts.total === 0 && summary.events.total === 0) {
    return { status: "unknown", reason: "No recent activity." };
  }

  if (summary.alerts.critical > 0) {
    return {
      status: "critical",
      reason: `${summary.alerts.critical} critical alert(s) open.`,
    };
  }

  if (summary.alerts.warning > 0 || summary.runs.failed > 0 || summary.events.failed > 0) {
    const reasons: string[] = [];
    if (summary.runs.failed > 0) reasons.push(`${summary.runs.failed} run(s) failed`);
    if (summary.alerts.warning > 0) reasons.push(`${summary.alerts.warning} warning(s) open`);
    if (summary.events.failed > 0) reasons.push(`${summary.events.failed} event(s) failed`);
    return { status: "attention", reason: reasons.join(", ") + "." };
  }

  return { status: "stable", reason: "All systems operating normally." };
}
