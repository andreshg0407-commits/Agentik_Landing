// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 10: Governance Control Engine

import type {
  GovernanceControl,
  GovernanceControlType,
  GovernanceDomain,
} from "./executive-governance-types";
import { generateControlId } from "./executive-governance-identity";

export interface RawControlInput {
  readonly title:        string;
  readonly description:  string;
  readonly type:         GovernanceControlType;
  readonly domain:       GovernanceDomain;
  readonly effectiveness: number; // 0–1
  readonly policyIds?:   string[];
  readonly isAutomated:  boolean;
}

export interface ControlEvaluationResult {
  readonly controlId:    string;
  readonly effectScore:  number;
  readonly gaps:         string[];
  readonly notes:        string;
}

export function buildControl(
  orgSlug: string,
  sessionId: string,
  input: RawControlInput
): GovernanceControl {
  try {
    return {
      id:           generateControlId(),
      orgSlug,
      sessionId,
      title:        input.title,
      description:  input.description,
      type:         input.type,
      domain:       input.domain,
      effectiveness: Math.max(0, Math.min(1, input.effectiveness)),
      isAutomated:  input.isAutomated,
      policyIds:    input.policyIds ?? [],
      createdAt:    new Date().toISOString(),
    };
  } catch {
    return buildEmptyControl(orgSlug, sessionId);
  }
}

export function buildControls(
  orgSlug: string,
  sessionId: string,
  inputs: RawControlInput[]
): GovernanceControl[] {
  try {
    return inputs.map((i) => buildControl(orgSlug, sessionId, i));
  } catch {
    return [];
  }
}

export function identifyControls(
  orgSlug: string,
  sessionId: string,
  inputs: RawControlInput[]
): GovernanceControl[] {
  return buildControls(orgSlug, sessionId, inputs);
}

export function evaluateControl(control: GovernanceControl): ControlEvaluationResult {
  try {
    const gaps: string[] = [];
    let effectScore      = control.effectiveness;

    if (control.policyIds.length === 0) {
      gaps.push("Control sin política de respaldo");
      effectScore = Math.max(0, effectScore - 0.05);
    }
    if (!control.isAutomated) {
      gaps.push("Control manual — mayor exposición a error humano");
    }
    if (control.effectiveness < 0.50) {
      gaps.push("Efectividad de control por debajo del umbral mínimo");
    }

    return {
      controlId:  control.id,
      effectScore,
      gaps,
      notes: gaps.length === 0 ? "Control en operación completa" : `Brechas detectadas: ${gaps.length}`,
    };
  } catch {
    return {
      controlId:  control.id,
      effectScore: 0,
      gaps:        ["Error al evaluar control"],
      notes:       "Error de evaluación",
    };
  }
}

export function evaluateControls(controls: GovernanceControl[]): ControlEvaluationResult[] {
  try {
    return controls.map((c) => evaluateControl(c));
  } catch {
    return [];
  }
}

export function rankControls(controls: GovernanceControl[]): GovernanceControl[] {
  try {
    return [...controls].sort((a, b) => b.effectiveness - a.effectiveness);
  } catch {
    return controls;
  }
}

export function getAutomatedControls(controls: GovernanceControl[]): GovernanceControl[] {
  try {
    return controls.filter((c) => c.isAutomated);
  } catch {
    return [];
  }
}

export function calculateControlCoverage(controls: GovernanceControl[]): number {
  try {
    if (controls.length === 0) return 0;
    return controls.reduce((s, c) => s + c.effectiveness, 0) / controls.length;
  } catch {
    return 0;
  }
}

export function buildDefaultControls(orgSlug: string, sessionId: string): GovernanceControl[] {
  const defaults: RawControlInput[] = [
    {
      title:        "Control de umbrales financieros",
      description:  "Monitoreo automático de transacciones sobre umbral de aprobación",
      type:         "PREVENTIVE",
      domain:       "FINANCIAL",
      effectiveness: 0.90,
      isAutomated:  true,
    },
    {
      title:        "Control de conflictos de interés",
      description:  "Revisión manual de declaraciones de conflicto antes de decisiones estratégicas",
      type:         "DETECTIVE",
      domain:       "LEGAL",
      effectiveness: 0.70,
      isAutomated:  false,
    },
    {
      title:        "Control de riesgo operacional",
      description:  "Monitoreo de indicadores clave de riesgo operacional",
      type:         "DETECTIVE",
      domain:       "RISK",
      effectiveness: 0.75,
      isAutomated:  true,
    },
    {
      title:        "Control de cumplimiento regulatorio",
      description:  "Revisión periódica de cumplimiento ante organismos reguladores",
      type:         "CORRECTIVE",
      domain:       "REGULATORY",
      effectiveness: 0.65,
      isAutomated:  false,
    },
  ];
  try {
    return defaults.map((d) => buildControl(orgSlug, sessionId, d));
  } catch {
    return [];
  }
}

function buildEmptyControl(orgSlug: string, sessionId: string): GovernanceControl {
  return {
    id:           generateControlId(),
    orgSlug,
    sessionId,
    title:        "Control no disponible",
    description:  "",
    type:         "PREVENTIVE",
    domain:       "CROSS_DOMAIN",
    effectiveness: 0,
    isAutomated:  false,
    policyIds:    [],
    createdAt:    new Date().toISOString(),
  };
}
