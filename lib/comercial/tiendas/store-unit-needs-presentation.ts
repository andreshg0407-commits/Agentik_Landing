/**
 * lib/comercial/tiendas/store-unit-needs-presentation.ts
 *
 * AGENTIK-STORES-NEEDS-TAB-PLAN-ALIGNMENT-01 — Presentación de necesidades
 * no asignadas para la pestaña Necesidades.
 *
 * LEY: la UI consume el resultado FINAL del StoreReplenishmentPlan (Sprint 6)
 * y NUNCA reconstruye lógica localmente. Una necesidad solo aparece como
 * "no asignada" cuando el Allocation Engine agotó misma referencia,
 * candidatos compatibles del subgrupo, disponibilidad global y reglas
 * comerciales — es decir, cuando figura en plan.unallocated.
 *
 * Este módulo PROYECTA campos certificados (unallocated del Sprint 6 +
 * disponibilidad de la necesidad del Sprint 5, unida por structureKey).
 * No inventa razones: cada código de display deriva determinísticamente de
 * (unallocated.reason × availability certificada), y el motivo del motor
 * viaja verbatim en engineReason.
 *
 * Client-safe: NO "server-only". Pure functions only.
 */

import type {
  StoreReplenishmentPlan,
  ReplenishmentSuggestion,
  UnallocatedNeed,
} from "./store-replenishment-allocation-engine";
import type { StoreUnitNeedsResult, UnitNeed } from "./store-unit-needs-engine";

// ── Display codes (derivados, nunca inventados) ──────────────────────────────

export type UnassignedDisplayCode =
  | "SIN_DATOS_DISPONIBILIDAD"           // el motor no tuvo datos de disponibilidad
  | "SIN_COMPATIBLES_CON_STOCK"          // 0 refs compatibles con stock en el subgrupo
  | "COMPATIBLES_EXCLUIDAS_POR_REGLAS"   // compatibles existen, pero Regla 36 las bloquea
  | "ASIGNACION_PARCIAL"                 // el motor asignó parte; el pool se agotó para el resto
  | "ESCASEZ_GLOBAL_POOL_AGOTADO";       // 0 asignadas: el pool fue consumido por asignaciones previas

export const UNASSIGNED_DISPLAY_DETAIL: Record<UnassignedDisplayCode, string> = {
  SIN_DATOS_DISPONIBILIDAD:
    "Sin datos de disponibilidad para esta estructura — el motor no degrada lo desconocido a cero.",
  SIN_COMPATIBLES_CON_STOCK:
    "No existen referencias compatibles con stock disponible en el subgrupo (misma referencia y sustitutos agotados).",
  COMPATIBLES_EXCLUIDAS_POR_REGLAS:
    "Existen referencias compatibles en el subgrupo, pero fueron excluidas por reglas comerciales (Regla 36 de escasez).",
  ASIGNACION_PARCIAL:
    "La necesidad fue cubierta parcialmente; el resto del stock elegible se agotó en esta corrida.",
  ESCASEZ_GLOBAL_POOL_AGOTADO:
    "No fue posible asignar unidades: el stock elegible del subgrupo fue consumido por asignaciones previas (escasez global).",
};

// ── Display item ─────────────────────────────────────────────────────────────

export interface UnassignedNeedDisplay {
  readonly structureKey: string;
  readonly label: string;
  readonly line: string;
  readonly requiredUnits: number;
  readonly executableUnits: number;
  readonly allocatedUnits: number;
  readonly pendingUnits: number;          // totalPendingUnits del motor, verbatim
  readonly code: UnassignedDisplayCode;
  readonly detail: string;
  /** Motivo del motor, VERBATIM (fuente certificada — nunca se reescribe). */
  readonly engineReason: UnallocatedNeed["reason"];
  /** Números certificados para tooltips/documentos — sin parsear texto. */
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
}

export interface StoreNeedsTabPresentation {
  readonly storeId: string;
  /** Sugerencias del plan para esta tienda (incluye sustitutos del subgrupo). */
  readonly suggestions: readonly ReplenishmentSuggestion[];
  /** Título certificado: "Necesidades no asignadas" (nunca "sin solución"). */
  readonly unassignedTitle: "Necesidades no asignadas";
  readonly unassigned: readonly UnassignedNeedDisplay[];
  readonly totals: {
    readonly suggestedUnits: number;
    readonly unassignedCount: number;
    readonly unassignedPendingUnits: number;
  };
}

// ── Derivación del código de display (proyección, no recalculo) ──────────────

export function deriveUnassignedDisplayCode(
  u: UnallocatedNeed,
  need: UnitNeed | undefined,
): UnassignedDisplayCode {
  switch (u.reason) {
    case "SIN_DATOS_DISPONIBILIDAD":
      return "SIN_DATOS_DISPONIBILIDAD";
    case "SIN_DISPONIBILIDAD": {
      // CONTRATO (AGENTIK-NEEDS-RULE36-DIAGNOSIS-FIX-01): la disponibilidad
      // del Sprint 5 se calcula POR TIENDA DESTINO con el predicado canónico
      // de la Regla 36 (store-rule36-eligibility). blockedUnits son unidades
      // bloqueadas PARA ESTA tienda — nunca un agregado global ni de otra
      // tienda. Con el predicado canónico, una tienda permitida (Centro/
      // Caldas) jamás acumula blockedUnits por Regla 36, así que este código
      // no puede aparecer para ellas por esa vía.
      const av = need?.availability;
      if (av && av.status === "CONOCIDA" && av.blockedUnits > 0) {
        return "COMPATIBLES_EXCLUIDAS_POR_REGLAS";
      }
      return "SIN_COMPATIBLES_CON_STOCK";
    }
    case "POOL_AGOTADO":
      return u.allocatedUnits > 0 ? "ASIGNACION_PARCIAL" : "ESCASEZ_GLOBAL_POOL_AGOTADO";
  }
}

// ── Presentación (fuente única: plan + necesidades certificadas) ─────────────

export function buildStoreNeedsTabPresentation(
  plan: Pick<StoreReplenishmentPlan, "suggestions" | "unallocated">,
  storeNeeds: Pick<StoreUnitNeedsResult, "storeId" | "needs">,
): StoreNeedsTabPresentation {
  const storeId = storeNeeds.storeId;
  const needByKey = new Map(storeNeeds.needs.map(n => [n.structureKey, n]));

  const suggestions = plan.suggestions.filter(s => s.storeId === storeId);

  const unassigned: UnassignedNeedDisplay[] = plan.unallocated
    .filter(u => u.storeId === storeId)
    .map(u => {
      const need = needByKey.get(u.structureKey);
      const code = deriveUnassignedDisplayCode(u, need);
      const av = need?.availability;
      return {
        structureKey: u.structureKey,
        label: need?.label ?? u.structureKey,
        line: need?.line ?? "",
        requiredUnits: u.requiredUnits,
        executableUnits: u.executableUnits,
        allocatedUnits: u.allocatedUnits,
        pendingUnits: u.totalPendingUnits,
        code,
        detail: UNASSIGNED_DISPLAY_DETAIL[code],
        engineReason: u.reason,
        metadata: {
          requiredUnits: u.requiredUnits,
          executableUnits: u.executableUnits,
          allocatedUnits: u.allocatedUnits,
          unallocatedExecutableUnits: u.unallocatedExecutableUnits,
          totalPendingUnits: u.totalPendingUnits,
          ...(av && av.status === "CONOCIDA"
            ? { eligibleUnits: av.eligibleUnits, blockedUnits: av.blockedUnits, totalUnits: av.totalUnits }
            : { availability: "SIN_DATOS" }),
        },
      };
    });

  return {
    storeId,
    suggestions,
    unassignedTitle: "Necesidades no asignadas",
    unassigned,
    totals: {
      suggestedUnits: suggestions.reduce((t, s) => t + s.units, 0),
      unassignedCount: unassigned.length,
      unassignedPendingUnits: unassigned.reduce((t, u) => t + u.pendingUnits, 0),
    },
  };
}
