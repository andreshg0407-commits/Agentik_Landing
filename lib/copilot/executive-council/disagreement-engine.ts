// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 15: Disagreement Engine
// Detects and structures inter-perspective disagreements in the council.

import type { ExecutiveOpinion, ExecutiveDisagreement, CouncilFindingSeverity } from "./executive-council-types";
import { newDisagreementId } from "./executive-council-identity";

export function detectDisagreements(
  orgSlug:   string,
  sessionId: string,
  opinions:  ExecutiveOpinion[]
): ExecutiveDisagreement[] {
  try {
    if (opinions.length < 2) return [];

    const disagreements: ExecutiveDisagreement[] = [];
    const PRIORITY_RANK: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

    // Detect conflicts between pairs of opinions
    for (let i = 0; i < opinions.length; i++) {
      for (let j = i + 1; j < opinions.length; j++) {
        const a = opinions[i];
        const b = opinions[j];

        const aHasOppose = a.arguments.some((arg) => arg.type === "OPPOSE" && arg.strength !== "WEAK");
        const bHasOppose = b.arguments.some((arg) => arg.type === "OPPOSE" && arg.strength !== "WEAK");

        // Significant priority gap → potential conflict
        const priorityGap = Math.abs(PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);

        if ((aHasOppose || bHasOppose) && priorityGap >= 1) {
          const higherPriorityOp = PRIORITY_RANK[a.priority] >= PRIORITY_RANK[b.priority] ? a : b;
          const severity: CouncilFindingSeverity =
            higherPriorityOp.priority === "CRITICAL" ? "CRITICAL"
            : higherPriorityOp.priority === "HIGH" ? "HIGH"
            : "MEDIUM";

          const pointOfConflict = aHasOppose && bHasOppose
            ? `Ambas perspectivas (${a.perspective} y ${b.perspective}) presentan oposición activa`
            : aHasOppose
            ? `${a.perspective} opone el enfoque de ${b.perspective}`
            : `${b.perspective} opone el enfoque de ${a.perspective}`;

          const canBeResolved  = severity !== "CRITICAL" || priorityGap === 1;
          const resolutionPath = canBeResolved
            ? "Revisión conjunta de evidencias y ajuste de prioridades"
            : "Escalación ejecutiva requerida — posiciones irreconciliables sin decisión directiva";

          disagreements.push({
            id:               newDisagreementId(),
            orgSlug,
            sessionId,
            title:            `Desacuerdo: ${a.perspective} ↔ ${b.perspective}`,
            description:      `Las perspectivas ${a.perspective} y ${b.perspective} presentan posiciones conflictivas sobre el tema del consejo.`,
            perspectiveA:     a.perspective,
            perspectiveB:     b.perspective,
            pointOfConflict,
            severity,
            canBeResolved,
            resolutionPath,
            metadata:         {
              engine:       "DISAGREEMENT",
              priorityA:    a.priority,
              priorityB:    b.priority,
              priorityGap,
            },
          });
        }
      }
    }

    // Deduplicate by perspective pair
    const seen = new Set<string>();
    return disagreements.filter((d) => {
      const key = [d.perspectiveA, d.perspectiveB].sort().join(":");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch {
    return [];
  }
}

export function getBlockingDisagreements(disagreements: ExecutiveDisagreement[]): ExecutiveDisagreement[] {
  return disagreements.filter((d) => d.severity === "CRITICAL" && !d.canBeResolved);
}

export function getResolvableDisagreements(disagreements: ExecutiveDisagreement[]): ExecutiveDisagreement[] {
  return disagreements.filter((d) => d.canBeResolved);
}

export function summarizeDisagreements(disagreements: ExecutiveDisagreement[]): string {
  if (disagreements.length === 0) return "Sin desacuerdos detectados entre perspectivas";
  const blocking = getBlockingDisagreements(disagreements);
  if (blocking.length > 0) {
    return `${blocking.length} desacuerdo(s) bloqueante(s) entre: ${blocking.map((d) => `${d.perspectiveA}↔${d.perspectiveB}`).join(", ")}`;
  }
  return `${disagreements.length} desacuerdo(s) detectado(s), todos resolubles con revisión conjunta`;
}
