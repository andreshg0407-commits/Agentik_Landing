/**
 * lib/comercial/tiendas/store-unit-needs-engine.ts
 *
 * AGENTIK-STORES-UNIT-BASED-NEEDS-ENGINE-01 — Brechas → necesidades en unidades.
 * (Rediseñado según la revisión arquitectónica: ajustes 2–11 incorporados.)
 *
 * Consumes VERBATIM the unit deficits produced by the certified coverage
 * engine (AGENTIK-STORES-UNIT-BASED-COVERAGE-ENGINE-01). This module NEVER
 * recalculates or reinterprets minimums, ideals, maximums, deficits, or
 * reference counts.
 *
 * PRINCIPLE:  Necesidad de negocio ≠ disponibilidad para satisfacerla.
 *   La disponibilidad limita la EJECUCIÓN (executableUnits); nunca reescribe
 *   la necesidad (requiredUnits).
 *
 * LAWS:
 *   1. STORE = UNITS. No calculation uses reference counts.
 *   2. Deficits verbatim. A structure not measured in UNITS aborts the WHOLE
 *      evaluation with InvalidStoreMeasurementUnitError — no partial results.
 *   3. Never exceed availability: executableUnits = min(required, eligible).
 *   4. NOT_FOUND ≠ 0:
 *        availability.has(key) === false  → SIN_DATOS_DISPONIBILIDAD
 *        CONOCIDA con eligible/blocked/total = 0 → SIN_DISPONIBILIDAD
 *      Unknown is never degraded to zero (in either direction).
 *   5. Availability invariant: eligibleUnits + blockedUnits === totalUnits,
 *      else AvailabilityInvariantError (rechazo, no normalización).
 *   6. Dirección operativa explícita: action REPOSICION | RETIRO.
 *      NO_AUTORIZADA → RETIRO: requiredUnits = unidades presentes no
 *      autorizadas, executable = required, pending = 0. La disponibilidad de
 *      reposición NUNCA consulta ni limita un retiro.
 *   7. Los retiros no se suman a las necesidades de reposición (summary
 *      separado por dirección).
 *
 * Pure functions — no DB, no Prisma, no server-only, no side effects.
 * Inputs are READ-ONLY: the engine never mutates structures, specialRules,
 * availability, or any unitRule received from Sprint 4.
 */

import type { UnitsRuleEvaluation, SpecialRuleEvaluation } from "./store-unit-coverage-engine";

// ── Typed errors (fallo total, nunca resultado parcial) ─────────────────────

export class InvalidStoreMeasurementUnitError extends Error {
  readonly code = "INVALID_STORE_MEASUREMENT_UNIT";
  constructor(structureKey: string, unit: string) {
    super(
      `[UNIT-NEEDS] Structure ${structureKey} is measured in ${unit}, not UNITS. ` +
      `STORE=UNITS is law (AGENTIK-DERROTERO-MEASUREMENT-SEMANTICS-01). ` +
      `The whole evaluation is aborted — no partial results.`,
    );
    this.name = "InvalidStoreMeasurementUnitError";
  }
}

export class AvailabilityInvariantError extends Error {
  readonly code = "AVAILABILITY_INVARIANT_VIOLATION";
  constructor(structureKey: string, eligible: number, blocked: number, total: number) {
    super(
      `[UNIT-NEEDS] Availability for ${structureKey} violates the invariant ` +
      `eligibleUnits(${eligible}) + blockedUnits(${blocked}) === totalUnits(${total}).`,
    );
    this.name = "AvailabilityInvariantError";
  }
}

// ── Availability contract (Ajustes 5 y 6) ────────────────────────────────────

export interface KnownStructureAvailability {
  readonly status: "CONOCIDA";
  /** Units from Rule-36-ELIGIBLE compatible references — the movable stock. */
  readonly eligibleUnits: number;
  /** Units from Rule-36-BLOCKED references — visible but not movable. */
  readonly blockedUnits: number;
  /** MUST equal eligibleUnits + blockedUnits (contract invariant). */
  readonly totalUnits: number;
}

export type StructureAvailability =
  | KnownStructureAvailability
  | { readonly status: "SIN_DATOS" };

// ── Need contract (Ajustes 3, 4, 9 y 11) ─────────────────────────────────────

export type UnitNeedSource = "ESTRUCTURA" | "REGLA_ESPECIAL";

/** Dirección operativa explícita — el Sprint 6 no debe inferirla de estados. */
export type UnitNeedAction = "REPOSICION" | "RETIRO";

/** Capacidad de ejecución — dimensión separada de la acción. */
export type UnitNeedExecutionStatus =
  | "COMPLETA"                  // executable covers the full requirement
  | "PARCIAL"                   // some units executable, not all
  | "SIN_DISPONIBILIDAD"        // availability KNOWN to be zero
  | "SIN_DATOS_DISPONIBILIDAD"; // availability UNKNOWN (never treated as 0)

/** Severidad canónica — mismo vocabulario del Sprint 4 (sin traducciones). */
export type UnitNeedSeverity = Exclude<SpecialRuleEvaluation["severity"], "none">;

// ── Priority (Ajuste 8: determinista y explicable) ───────────────────────────

export const UNIT_NEED_PRIORITY = {
  /** Retirar lo que no debe estar precede a cualquier reposición. */
  UNAUTHORIZED_REMOVAL: 500,
  /** Estructura sin ninguna referencia con stock. */
  NO_COVERAGE: 400,
  /** Estructura por debajo del mínimo de su regla. */
  BELOW_MINIMUM: 300,
  /** Regla especial (cupo por tienda) incumplida. */
  SPECIAL_RULE_MISSING: 250,
  /** Estructura sobre el mínimo pero bajo el ideal. */
  TO_IDEAL: 100,
} as const;

export type UnitNeedPriorityClass = keyof typeof UNIT_NEED_PRIORITY;

/**
 * Deterministic total order:
 *   1. priorityClass (per UNIT_NEED_PRIORITY, desc)
 *   2. priorityScore = requiredUnits (desc)
 *   3. structureKey (asc) — explicit tie-breaker
 */
export function compareUnitNeeds(a: UnitNeed, b: UnitNeed): number {
  const classDiff = UNIT_NEED_PRIORITY[b.priorityClass] - UNIT_NEED_PRIORITY[a.priorityClass];
  if (classDiff !== 0) return classDiff;
  if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
  return a.structureKey < b.structureKey ? -1 : a.structureKey > b.structureKey ? 1 : 0;
}

// ── UnitNeed ─────────────────────────────────────────────────────────────────

export interface UnitNeed {
  readonly structureKey: string;
  readonly label: string;
  readonly line: string;
  readonly source: UnitNeedSource;
  readonly action: UnitNeedAction;

  /** La necesidad de negocio — nunca reescrita por disponibilidad. */
  readonly requiredUnits: number;
  /** Lo ejecutable hoy: min(required, eligible) · retiro: = required · null si SIN_DATOS. */
  readonly executableUnits: number | null;
  /** required − executable · null si SIN_DATOS. */
  readonly pendingUnits: number | null;

  /** Trazabilidad de cobertura — solo cuando source = ESTRUCTURA. */
  readonly deficitToMin: number | null;
  readonly deficitToIdeal: number | null;

  /** Disponibilidad consultada — null para RETIRO (no aplica por ley 6). */
  readonly availability: StructureAvailability | null;

  readonly executionStatus: UnitNeedExecutionStatus;
  readonly severity: UnitNeedSeverity;
  readonly priorityClass: UnitNeedPriorityClass;
  readonly priorityScore: number;
}

// ── Summary (Ajuste 7: direcciones separadas) ────────────────────────────────

export interface StoreUnitNeedsSummary {
  readonly storeId: string;
  readonly structuresEvaluated: number;
  readonly replenishment: {
    readonly requiredUnits: number;
    readonly executableUnits: number;          // solo disponibilidad CONOCIDA
    readonly pendingUnits: number;             // solo disponibilidad CONOCIDA
    readonly unknownAvailabilityUnits: number; // required de necesidades SIN_DATOS
    readonly needCount: number;
  };
  readonly removals: {
    readonly requiredUnits: number;
    readonly needCount: number;
  };
  readonly coverage: {
    readonly fullyCoverableCount: number;
    readonly partiallyCoverableCount: number;
    readonly unavailableCount: number;
    readonly unknownAvailabilityCount: number;
  };
}

export interface StoreUnitNeedsResult {
  readonly storeId: string;
  readonly needs: readonly UnitNeed[];
  readonly summary: StoreUnitNeedsSummary;
}

// ── Input (Ajuste 2: solo lectura, verbatim Sprint 4) ────────────────────────

export interface UnitNeedsStructureInput {
  readonly structureKey: string;
  readonly label: string;
  readonly line: string;
  readonly structuralCoverageStatus: "CUBIERTA" | "SIN_COBERTURA";
  /** VERBATIM from the certified coverage engine. Read-only. */
  readonly unitRule: UnitsRuleEvaluation;
}

export interface UnitNeedsInput {
  readonly storeId: string;
  readonly structures: readonly UnitNeedsStructureInput[];
  readonly specialRules: readonly SpecialRuleEvaluation[];
  readonly availability: ReadonlyMap<string, StructureAvailability>;
}

// ── Internals ────────────────────────────────────────────────────────────────

function validateAvailability(structureKey: string, av: StructureAvailability): StructureAvailability {
  if (av.status === "CONOCIDA" && av.eligibleUnits + av.blockedUnits !== av.totalUnits) {
    // Ley 5 — rechazo, no normalización.
    throw new AvailabilityInvariantError(structureKey, av.eligibleUnits, av.blockedUnits, av.totalUnits);
  }
  return av;
}

function resolveExecution(
  structureKey: string,
  requiredUnits: number,
  availabilityMap: ReadonlyMap<string, StructureAvailability>,
): {
  availability: StructureAvailability;
  executableUnits: number | null;
  pendingUnits: number | null;
  executionStatus: UnitNeedExecutionStatus;
} {
  // Ley 4 — invariante contractual: clave AUSENTE es SIN_DATOS. Nunca `?? cero`.
  if (!availabilityMap.has(structureKey)) {
    return {
      availability: { status: "SIN_DATOS" },
      executableUnits: null,
      pendingUnits: null,
      executionStatus: "SIN_DATOS_DISPONIBILIDAD",
    };
  }

  const av = validateAvailability(structureKey, availabilityMap.get(structureKey)!);
  if (av.status === "SIN_DATOS") {
    return {
      availability: av,
      executableUnits: null,
      pendingUnits: null,
      executionStatus: "SIN_DATOS_DISPONIBILIDAD",
    };
  }

  // Ley 3 — nunca exceder disponibilidad elegible.
  const executableUnits = Math.min(requiredUnits, Math.max(0, av.eligibleUnits));
  const pendingUnits = requiredUnits - executableUnits;
  const executionStatus: UnitNeedExecutionStatus =
    executableUnits >= requiredUnits && requiredUnits > 0 ? "COMPLETA"
    : executableUnits > 0 ? "PARCIAL"
    : "SIN_DISPONIBILIDAD";

  return { availability: av, executableUnits, pendingUnits, executionStatus };
}

// ── Engine ───────────────────────────────────────────────────────────────────

/**
 * Convert certified coverage deficits into unit needs.
 *
 * Total-failure semantics: any structure not measured in UNITS, or any
 * availability violating its invariant, aborts the WHOLE evaluation via a
 * typed error. No partial results are ever returned.
 */
export function buildStoreUnitNeeds(input: UnitNeedsInput): StoreUnitNeedsResult {
  // Ley 2 — precondición sobre TODAS las estructuras antes de emitir nada.
  for (const s of input.structures) {
    if (s.unitRule.measurementUnit !== "UNITS") {
      throw new InvalidStoreMeasurementUnitError(s.structureKey, s.unitRule.measurementUnit);
    }
  }

  const needs: UnitNeed[] = [];

  // ── Estructuras (REPOSICION) ──────────────────────────────────────────────
  for (const s of input.structures) {
    // Déficits VERBATIM — nunca recalculados de umbrales.
    const requiredUnits = s.unitRule.deficitToIdeal;
    if (requiredUnits <= 0) continue;   // saludable/exceso: sin necesidad

    const exec = resolveExecution(s.structureKey, requiredUnits, input.availability);
    const isUncovered = s.structuralCoverageStatus === "SIN_COBERTURA";
    const belowMin = s.unitRule.deficitToMin > 0;

    const priorityClass: UnitNeedPriorityClass =
      isUncovered ? "NO_COVERAGE" : belowMin ? "BELOW_MINIMUM" : "TO_IDEAL";

    needs.push({
      structureKey: s.structureKey,
      label: s.label,
      line: s.line,
      source: "ESTRUCTURA",
      action: "REPOSICION",
      requiredUnits,
      executableUnits: exec.executableUnits,
      pendingUnits: exec.pendingUnits,
      deficitToMin: s.unitRule.deficitToMin,
      deficitToIdeal: s.unitRule.deficitToIdeal,
      availability: exec.availability,
      executionStatus: exec.executionStatus,
      severity: isUncovered ? "high" : belowMin ? "medium" : "low",
      priorityClass,
      priorityScore: requiredUnits,
    });
  }

  // ── Reglas especiales (verbatim Sprint 4) ─────────────────────────────────
  for (const r of input.specialRules) {
    if (r.status === "FALTANTE") {
      const requiredUnits = r.gapUnits;   // verbatim
      const key = `ESPECIAL|${r.pattern}`;
      const exec = resolveExecution(key, requiredUnits, input.availability);
      needs.push({
        structureKey: key,
        label: r.label,
        line: "ESPECIALES",
        source: "REGLA_ESPECIAL",
        action: "REPOSICION",
        requiredUnits,
        executableUnits: exec.executableUnits,
        pendingUnits: exec.pendingUnits,
        deficitToMin: null,
        deficitToIdeal: null,
        availability: exec.availability,
        executionStatus: exec.executionStatus,
        severity: "medium",
        priorityClass: "SPECIAL_RULE_MISSING",
        priorityScore: requiredUnits,
      });
    } else if (r.status === "NO_AUTORIZADA") {
      // Ley 6 — RETIRO: la disponibilidad de reposición NO se consulta ni limita.
      needs.push({
        structureKey: `ESPECIAL|${r.pattern}`,
        label: r.label,
        line: "ESPECIALES",
        source: "REGLA_ESPECIAL",
        action: "RETIRO",
        requiredUnits: r.gapUnits,        // unidades presentes no autorizadas
        executableUnits: r.gapUnits,      // el retiro siempre es ejecutable
        pendingUnits: 0,
        deficitToMin: null,
        deficitToIdeal: null,
        availability: null,               // no aplica a retiros
        executionStatus: "COMPLETA",
        severity: "high",
        priorityClass: "UNAUTHORIZED_REMOVAL",
        priorityScore: r.gapUnits,
      });
    }
    // EXCEDENTE / CUMPLIDA: no generan UnitNeed.
  }

  needs.sort(compareUnitNeeds);

  // ── Summary (direcciones separadas — ley 7) ───────────────────────────────
  const repl = needs.filter(n => n.action === "REPOSICION");
  const remv = needs.filter(n => n.action === "RETIRO");
  const replKnown = repl.filter(n => n.availability?.status === "CONOCIDA");
  const replUnknown = repl.filter(n => n.executionStatus === "SIN_DATOS_DISPONIBILIDAD");

  const summary: StoreUnitNeedsSummary = {
    storeId: input.storeId,
    structuresEvaluated: input.structures.length,
    replenishment: {
      requiredUnits: repl.reduce((t, n) => t + n.requiredUnits, 0),
      executableUnits: replKnown.reduce((t, n) => t + (n.executableUnits ?? 0), 0),
      pendingUnits: replKnown.reduce((t, n) => t + (n.pendingUnits ?? 0), 0),
      unknownAvailabilityUnits: replUnknown.reduce((t, n) => t + n.requiredUnits, 0),
      needCount: repl.length,
    },
    removals: {
      requiredUnits: remv.reduce((t, n) => t + n.requiredUnits, 0),
      needCount: remv.length,
    },
    coverage: {
      fullyCoverableCount: repl.filter(n => n.executionStatus === "COMPLETA").length,
      partiallyCoverableCount: repl.filter(n => n.executionStatus === "PARCIAL").length,
      unavailableCount: repl.filter(n => n.executionStatus === "SIN_DISPONIBILIDAD").length,
      unknownAvailabilityCount: replUnknown.length,
    },
  };

  return { storeId: input.storeId, needs, summary };
}
