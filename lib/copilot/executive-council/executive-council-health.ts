// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 35: Health Check

import type { ExecutiveCouncilSession } from "./executive-council-types";

export type CouncilHealthStatus = "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "EMPTY";

export interface CouncilHealthReport {
  readonly orgSlug:        string;
  readonly status:         CouncilHealthStatus;
  readonly sessionCount:   number;
  readonly recentSessions: number;
  readonly escalations:    number;
  readonly issues:         string[];
  readonly checkedAt:      string;
}

export function checkExecutiveCouncilHealth(
  orgSlug:  string,
  sessions: ExecutiveCouncilSession[]
): CouncilHealthReport {
  try {
    const scoped       = sessions.filter((s) => s.orgSlug === orgSlug);
    const issues:       string[] = [];

    if (scoped.length === 0) {
      return {
        orgSlug, status: "EMPTY", sessionCount: 0, recentSessions: 0, escalations: 0,
        issues: ["Sin sesiones de consejo disponibles"],
        checkedAt: new Date().toISOString(),
      };
    }

    const escalations  = scoped.filter((s) => s.outcome === "ESCALATION_REQUIRED").length;
    const avgScore     = scoped.reduce((s, x) => s + x.sessionScore, 0) / scoped.length;
    const criticals    = scoped.flatMap((s) => s.opinions.flatMap((o) => o.findings)).filter((f) => f.severity === "CRITICAL").length;

    if (escalations > 0) issues.push(`${escalations} sesión(es) requieren escalación ejecutiva`);
    if (avgScore < 0.35)  issues.push(`Puntaje promedio bajo: ${Math.round(avgScore * 100)}%`);
    if (criticals > 2)    issues.push(`${criticals} hallazgos críticos sin resolver`);

    const status: CouncilHealthStatus =
      escalations > 0 ? "DEGRADED"
      : avgScore < 0.25 ? "UNAVAILABLE"
      : issues.length > 0 ? "DEGRADED"
      : "HEALTHY";

    return {
      orgSlug,
      status,
      sessionCount:   scoped.length,
      recentSessions: scoped.length, // in-memory; Prisma impl would filter by date
      escalations,
      issues,
      checkedAt:      new Date().toISOString(),
    };
  } catch {
    return {
      orgSlug, status: "UNAVAILABLE", sessionCount: 0, recentSessions: 0, escalations: 0,
      issues: ["Error al verificar salud del consejo"],
      checkedAt: new Date().toISOString(),
    };
  }
}

export function isExecutiveCouncilHealthy(report: CouncilHealthReport): boolean {
  return report.status === "HEALTHY";
}
