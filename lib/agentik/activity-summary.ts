import type { AlertSeverity, AlertStatus, EventStatus, RunStatus } from "@prisma/client";

// Minimal shape of raw activity — compatible with what getOrgDashboardActivity
// and getWorkspaceDashboardActivity already return.
interface RawRun {
  status: RunStatus;
}

interface RawAlert {
  severity: AlertSeverity;
  status: AlertStatus;
}

interface RawEvent {
  status: EventStatus;
}

export interface ActivitySummary {
  runs: {
    total: number;
    succeeded: number;
    failed: number;
    running: number;
  };
  alerts: {
    total: number;
    open: number;
    critical: number;
    warning: number;
  };
  events: {
    total: number;
    pending: number;
    failed: number;
  };
}

export function summarizeActivity(activity: {
  runs: RawRun[];
  alerts: RawAlert[];
  events: RawEvent[];
}): ActivitySummary {
  return {
    runs: {
      total: activity.runs.length,
      succeeded: activity.runs.filter((r) => r.status === "SUCCEEDED").length,
      failed: activity.runs.filter((r) => r.status === "FAILED").length,
      running: activity.runs.filter((r) => r.status === "RUNNING").length,
    },
    alerts: {
      total: activity.alerts.length,
      open: activity.alerts.filter((a) => a.status === "OPEN").length,
      critical: activity.alerts.filter((a) => a.severity === "CRITICAL" && a.status === "OPEN").length,
      warning: activity.alerts.filter((a) => a.severity === "WARNING" && a.status === "OPEN").length,
    },
    events: {
      total: activity.events.length,
      pending: activity.events.filter((e) => e.status === "PENDING").length,
      failed: activity.events.filter((e) => e.status === "FAILED").length,
    },
  };
}
