// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 31: Compliance Integration
// Pure function — no try/catch. Fail-open only for reporting.

export type DirectionComplianceCheckId =
  | "TENANT_ISOLATION"
  | "SUGGESTED_ONLY"
  | "HAS_NORTH_STAR"
  | "HAS_OBJECTIVES"
  | "HAS_ALIGNMENT"
  | "HAS_NARRATIVE"
  | "HAS_LIMITATIONS"
  | "HAS_CONFIDENCE"
  | "HAS_SCORE"
  | "HAS_BRIEFING";

export interface DirectionComplianceCheck {
  readonly id:       DirectionComplianceCheckId;
  readonly label:    string;
  readonly pass:     boolean;
  readonly level:    "ERROR" | "WARN" | "INFO";
}

export interface DirectionComplianceReport {
  readonly orgSlug:   string;
  readonly checks:    DirectionComplianceCheck[];
  readonly passCount: number;
  readonly failCount: number;
  readonly warnCount: number;
  readonly isValid:   boolean;
}

export function assertDirectionTenantIsolation(orgSlug: string, reportOrgSlug: string): void {
  if (orgSlug !== reportOrgSlug) {
    throw new Error(
      `Direction tenant isolation violation: expected "${orgSlug}" but got "${reportOrgSlug}"`
    );
  }
}

export function runDirectionComplianceChecks(
  orgSlug: string,
  report: {
    orgSlug:    string;
    northStar:  unknown | null;
    objectives: unknown[];
    alignment:  unknown | null;
    narrative:  { limitations?: string };
    limitations: string[];
    score:      { overallScore: number };
    briefing:   unknown | null;
    confidence?: string;
  }
): DirectionComplianceReport {
  const checks: DirectionComplianceCheck[] = [
    {
      id:    "TENANT_ISOLATION",
      label: "Aislamiento de tenant",
      pass:  report.orgSlug === orgSlug,
      level: "ERROR",
    },
    {
      id:    "SUGGESTED_ONLY",
      label: "suggestedOnly en limitaciones",
      pass:  report.limitations.some((l) => l.includes("suggestedOnly")),
      level: "ERROR",
    },
    {
      id:    "HAS_NORTH_STAR",
      label: "Estrella norte definida",
      pass:  report.northStar !== null,
      level: "WARN",
    },
    {
      id:    "HAS_OBJECTIVES",
      label: "Objetivos estratégicos presentes",
      pass:  report.objectives.length > 0,
      level: "WARN",
    },
    {
      id:    "HAS_ALIGNMENT",
      label: "Evaluación de alineamiento presente",
      pass:  report.alignment !== null,
      level: "WARN",
    },
    {
      id:    "HAS_NARRATIVE",
      label: "Narrativa estratégica presente",
      pass:  typeof report.narrative?.limitations === "string",
      level: "ERROR",
    },
    {
      id:    "HAS_LIMITATIONS",
      label: "Limitaciones declaradas",
      pass:  report.limitations.length >= 2,
      level: "ERROR",
    },
    {
      id:    "HAS_CONFIDENCE",
      label: "Nivel de confianza declarado",
      pass:  !!report.confidence,
      level: "WARN",
    },
    {
      id:    "HAS_SCORE",
      label: "Score calculado",
      pass:  typeof report.score?.overallScore === "number",
      level: "ERROR",
    },
    {
      id:    "HAS_BRIEFING",
      label: "Briefing generado",
      pass:  report.briefing !== null,
      level: "INFO",
    },
  ];

  const passCount = checks.filter((c) => c.pass).length;
  const failCount = checks.filter((c) => !c.pass && c.level === "ERROR").length;
  const warnCount = checks.filter((c) => !c.pass && c.level === "WARN").length;

  return {
    orgSlug,
    checks,
    passCount,
    failCount,
    warnCount,
    isValid: failCount === 0,
  };
}
