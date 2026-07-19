/**
 * lib/operational-map/workbook/generate-validation-workbook.ts
 *
 * Validation Workbook Generator Engine.
 *
 * Transforms OPERATIONAL_SOURCE_MAP into a fully structured workbook:
 *   - One row per validation question
 *   - SAG candidates parsed from possibleSources
 *   - Operational impact derived from priority + consumedBy
 *   - Scoring for meeting prioritization
 *   - Blocker detection
 *   - Cross-domain dependency map
 *
 * Pure functions — no Prisma, no React, no side effects.
 *
 * Sprint: AGENTIK-SAG-VALIDATION-WORKBOOK-01
 */

import {
  OPERATIONAL_SOURCE_MAP,
  type OperationalDomainKey,
  type OperationalSourceEntity,
  type OperationalSourcePriority,
} from "../operational-source-map";

import type {
  ValidationWorkbook,
  ValidationWorkbookRow,
  ValidationWorkbookDomain,
  WorkbookExecutiveSummary,
  OperationalBlocker,
  CrossDomainDependencyMap,
  DomainDependencyEdge,
  SagCandidate,
  WorkbookRowScores,
  ValidationBlockerLevel,
} from "./operational-validation-workbook-types";

// ─── Phase 3: SAG candidate parser ───────────────────────────────────────────

/**
 * Parses a single possibleSource string into a structured SagCandidate.
 *
 * Handles patterns like:
 *   "SELECT * FROM INVENTARIO"
 *   "SELECT * FROM INVENTARIO — tabla SAG_CONFIRMAR, campo SALDO/EXISTENCIA"
 *   "SAG_CONFIRMAR — ¿tabla BODEGAS?"
 *   "CARTERA.DIAS_MORA — validated"
 *   "SAG INVENTARIO (base)"
 *   "SaleRecord (SAG import)"
 *
 * Tolerant: never throws. Always returns a usable SagCandidate.
 */
export function parseSagCandidate(raw: string): SagCandidate {
  const u = raw.toUpperCase();

  // ── Extract SQL hint ────────────────────────────────────────────────────
  const sqlMatch = raw.match(/SELECT\s+\*\s+FROM\s+(\w+)/i);
  const sqlHint  = sqlMatch ? raw.substring(0, raw.indexOf(" —") > 0 ? raw.indexOf(" —") : raw.length).trim() : null;

  // ── Extract table name ──────────────────────────────────────────────────
  let table: string | null = null;

  // Pattern: FROM TABLENAME
  if (sqlMatch) {
    table = sqlMatch[1].toUpperCase();
  }
  // Pattern: "TABLENAME.FIELD"
  else if (/^[A-Z_]+\.[A-Z_]+/.test(u)) {
    table = u.split(".")[0];
  }
  // Pattern: "SAG TABLENAME" or "tabla TABLENAME"
  else {
    const sagTableMatch = raw.match(/(?:SAG|tabla)\s+([A-Z_]{3,})/i);
    if (sagTableMatch) {
      const candidate = sagTableMatch[1].toUpperCase();
      // Skip known non-table words
      if (!["CONFIRMAR", "PYA", "IMPORT", "INVENTARIO_CONFIRMAR"].includes(candidate)) {
        table = candidate;
      }
    }
  }

  // ── Extract field names ─────────────────────────────────────────────────
  const fields: string[] = [];

  // Pattern: "campo FIELD1/FIELD2/FIELD3"
  const campoMatch = raw.match(/campo\s+([\w\/,\s]+)/i);
  if (campoMatch) {
    campoMatch[1]
      .split(/[\/,\s]+/)
      .map(f => f.trim().toUpperCase())
      .filter(f => f.length > 1 && !/CONFIRMAR|SAG|FIELD/.test(f))
      .forEach(f => fields.push(f));
  }

  // Pattern: "TABLENAME.FIELDNAME"
  const dotFieldMatch = raw.match(/[A-Z_]+\.([A-Z_]+)/i);
  if (dotFieldMatch && !fields.includes(dotFieldMatch[1].toUpperCase())) {
    fields.push(dotFieldMatch[1].toUpperCase());
  }

  // ── Detect SAG_CONFIRMAR ─────────────────────────────────────────────────
  const needsConfirm = u.includes("SAG_CONFIRMAR") || u.includes("CONFIRMAR");

  return {
    table,
    fields,
    sqlHint,
    needsConfirm,
    rawSource: raw,
  };
}

/**
 * Parses all possibleSources for an entity.
 * Returns the best primary table and field candidates.
 */
export function parseSagCandidates(possibleSources: string[]): {
  candidates:          SagCandidate[];
  primaryTable:        string | null;
  primaryFields:       string[];
  primarySqlHint:      string | null;
} {
  const candidates = possibleSources.map(parseSagCandidate);

  // Primary: first candidate with a real table name
  const primary = candidates.find(c => c.table !== null) ?? candidates[0];

  return {
    candidates,
    primaryTable:    primary?.table ?? null,
    primaryFields:   primary?.fields ?? [],
    primarySqlHint:  primary?.sqlHint ?? null,
  };
}

// ─── Phase 4: Scoring ────────────────────────────────────────────────────────

const PRIORITY_WEIGHT: Record<OperationalSourcePriority, number> = {
  critical: 10,
  high:     7,
  medium:   4,
  low:      1,
};

/**
 * Computes the three scores for a workbook row.
 *
 * operationalCriticalityScore:
 *   priorityWeight × min(consumedBy.length, 8) × (isPending ? 2 : 1), capped at 100
 *
 * implementationDependencyScore:
 *   downstreamCount × 5, capped at 50
 *
 * meetingPriorityScore:
 *   operationalCriticalityScore + implementationDependencyScore
 */
export function computeScores(
  priority:      OperationalSourcePriority,
  consumedBy:    OperationalDomainKey[],
  isPending:     boolean,
  downstreamCount: number,
): WorkbookRowScores {
  const pw = PRIORITY_WEIGHT[priority];
  const operationalCriticalityScore = Math.min(
    100,
    pw * Math.min(consumedBy.length + 1, 8) * (isPending ? 2 : 1),
  );
  const implementationDependencyScore = Math.min(50, downstreamCount * 5);
  return {
    operationalCriticalityScore,
    implementationDependencyScore,
    meetingPriorityScore: operationalCriticalityScore + implementationDependencyScore,
  };
}

// ─── Blocker level from priority + status ────────────────────────────────────

function deriveBlockerLevel(
  priority: OperationalSourcePriority,
  status:   string,
): ValidationBlockerLevel {
  if (status === "confirmed" || status === "interno_agentik" || status === "crm") return "none";
  if (priority === "critical") return "critical";
  if (priority === "high")     return "high";
  if (priority === "medium")   return "medium";
  return "none";
}

// ─── Operational impact statement ────────────────────────────────────────────

function deriveImpact(
  entity:    OperationalSourceEntity,
  domainLabel: string,
): string {
  const domains = entity.consumedBy.map(k =>
    OPERATIONAL_SOURCE_MAP.find(d => d.key === k)?.label ?? k,
  ).join(", ");

  const priorityLabel: Record<OperationalSourcePriority, string> = {
    critical: "bloquea operación en producción",
    high:     "impacto operacional diario",
    medium:   "degrada inteligencia analítica",
    low:      "información no disponible",
  };

  if (entity.status === "pending_sag") {
    return `Sin confirmación SAG: ${priorityLabel[entity.priority]}. Afecta: ${domains || domainLabel}.`;
  }
  if (entity.status === "futuro") {
    return `Feature futuro: no bloquea operación actual pero es dependencia de ${domains || domainLabel}.`;
  }
  return `Impacto en: ${domains || domainLabel}.`;
}

// ─── Expected behavior ────────────────────────────────────────────────────────

function deriveExpectedBehavior(
  entity:    OperationalSourceEntity,
  question:  string,
): string {
  // Use the entity definition as the base expectation
  const def = entity.definition.length > 120
    ? entity.definition.substring(0, 120) + "…"
    : entity.definition;
  return `Agentik necesita: ${def}. Pregunta: ${question}`;
}

// ─── Row ID generation ────────────────────────────────────────────────────────

function makeRowId(domainKey: string, entityKey: string, questionIndex: number): string {
  return `${domainKey}__${entityKey}__q${questionIndex}`;
}

// ─── Phase 11: Build downstream count map ────────────────────────────────────

function buildDownstreamCountMap(): Map<string, number> {
  // key = "domainKey__entityKey", value = # of entities that list this domain in consumedBy
  const map = new Map<string, number>();

  for (const domain of OPERATIONAL_SOURCE_MAP) {
    for (const entity of domain.entities) {
      // For each domain that consumes this entity, the entities in that consuming domain
      // depend on this one
      for (const consumerDomain of entity.consumedBy) {
        const key = `${domain.key}__${entity.key}`;
        const currentConsumers = OPERATIONAL_SOURCE_MAP
          .find(d => d.key === consumerDomain)
          ?.entities.length ?? 0;
        map.set(key, (map.get(key) ?? 0) + currentConsumers);
      }
    }
  }

  return map;
}

// ─── Phase 2: Core row generator ─────────────────────────────────────────────

function generateRowsForEntity(
  domainKey:       OperationalDomainKey,
  domainLabel:     string,
  entity:          OperationalSourceEntity,
  downstreamMap:   Map<string, number>,
): ValidationWorkbookRow[] {
  const isPending    = entity.status === "pending_sag";
  const downstreamCount = downstreamMap.get(`${domainKey}__${entity.key}`) ?? 0;
  const sagParsed    = parseSagCandidates(entity.possibleSources);
  const blockerLevel = deriveBlockerLevel(entity.priority, entity.status);
  const impact       = deriveImpact(entity, domainLabel);

  // Generate rows from sagValidationQuestions
  const questions = entity.sagValidationQuestions ?? [];

  // If no explicit questions but entity is pending_sag, generate a default question
  if (questions.length === 0 && isPending) {
    const scores = computeScores(entity.priority, entity.consumedBy, true, downstreamCount);
    return [{
      id:                   makeRowId(domainKey, entity.key, 0),
      domain:               domainKey,
      domainLabel,
      entityKey:            entity.key,
      entityLabel:          entity.label,
      sourceOfTruth:        entity.sourceOfTruth,
      priority:             entity.priority,
      frequency:            entity.frequency,
      blockerLevel,
      sagTableCandidate:    sagParsed.primaryTable,
      sagFieldCandidates:   sagParsed.primaryFields,
      sagSqlHint:           sagParsed.primarySqlHint,
      sagCandidates:        sagParsed.candidates,
      validationQuestion:   `Confirmar fuentes SAG para "${entity.label}": tablas, campos y comportamiento de filtros WHERE.`,
      expectedBehavior:     deriveExpectedBehavior(entity, "Confirmar nombre de tabla y campos"),
      operationalImpact:    impact,
      consumedBy:           entity.consumedBy,
      downstreamCount,
      answerState:          "pending",
      answer:               null,
      answeredBy:           null,
      answeredAt:           null,
      notes:                null,
      scores,
    }];
  }

  return questions.map((question, i) => {
    const scores = computeScores(entity.priority, entity.consumedBy, isPending, downstreamCount);
    return {
      id:                   makeRowId(domainKey, entity.key, i),
      domain:               domainKey,
      domainLabel,
      entityKey:            entity.key,
      entityLabel:          entity.label,
      sourceOfTruth:        entity.sourceOfTruth,
      priority:             entity.priority,
      frequency:            entity.frequency,
      blockerLevel,
      sagTableCandidate:    sagParsed.primaryTable,
      sagFieldCandidates:   sagParsed.primaryFields,
      sagSqlHint:           sagParsed.primarySqlHint,
      sagCandidates:        sagParsed.candidates,
      validationQuestion:   question,
      expectedBehavior:     deriveExpectedBehavior(entity, question),
      operationalImpact:    impact,
      consumedBy:           entity.consumedBy,
      downstreamCount,
      answerState:          "pending" as const,
      answer:               null,
      answeredBy:           null,
      answeredAt:           null,
      notes:                null,
      scores,
    };
  });
}

// ─── Phase 10: Blocker detection ─────────────────────────────────────────────

/**
 * Detects operational blockers from all workbook rows.
 *
 * A blocker is created when:
 * - An entity is critical + pending_sag (blocks live operation)
 * - An entity is high + pending_sag + consumed by ≥2 domains
 * - An entity has no possibleSources (ownership unclear)
 */
export function detectOperationalBlockers(
  rows: ValidationWorkbookRow[],
): OperationalBlocker[] {
  const blockers: OperationalBlocker[] = [];
  const seen = new Set<string>(); // prevent duplicates per entity

  for (const row of rows) {
    const entityId = `${row.domain}__${row.entityKey}`;
    if (seen.has(entityId)) continue;

    const isBlocking =
      row.blockerLevel === "critical" ||
      (row.blockerLevel === "high" && row.consumedBy.length >= 2);

    if (!isBlocking) continue;
    seen.add(entityId);

    const degradedFlows = row.consumedBy.map(k =>
      OPERATIONAL_SOURCE_MAP.find(d => d.key === k)?.label ?? k,
    );

    let reason: string;
    if (row.sagTableCandidate === null && row.sagCandidates.every(c => c.needsConfirm)) {
      reason = `Sin tabla SAG confirmada para "${row.entityLabel}" — fuente desconocida`;
    } else if (row.sagTableCandidate) {
      reason = `Tabla SAG "${row.sagTableCandidate}" no validada — campos y comportamiento WHERE pendientes`;
    } else {
      reason = `Entidad "${row.entityLabel}" marcada como pendiente_sag sin fuente SAG definida`;
    }

    blockers.push({
      id:           `blocker__${entityId}`,
      blockerLevel: row.blockerLevel,
      domain:       row.domain,
      domainLabel:  row.domainLabel,
      entityKey:    row.entityKey,
      entityLabel:  row.entityLabel,
      reason,
      degradedFlows,
      rowIds:       rows
        .filter(r => r.domain === row.domain && r.entityKey === row.entityKey)
        .map(r => r.id),
    });
  }

  // Sort: critical first, then by degradedFlows.length desc
  return blockers.sort((a, b) => {
    if (a.blockerLevel !== b.blockerLevel) {
      return a.blockerLevel === "critical" ? -1 : 1;
    }
    return b.degradedFlows.length - a.degradedFlows.length;
  });
}

// ─── Phase 11: Cross-domain dependency map ───────────────────────────────────

/**
 * Builds a directed cross-domain dependency graph.
 *
 * Edge A → B means: domain A produces something consumed by domain B.
 * isAtRisk = true when the producing entity is pending_sag.
 */
export function buildCrossDomainDependencyMap(
  rows: ValidationWorkbookRow[],
): CrossDomainDependencyMap {
  const edges: DomainDependencyEdge[] = [];
  const upstreamSet  = new Set<OperationalDomainKey>();
  const atRiskSet    = new Set<OperationalDomainKey>();

  // Build edges from entity consumedBy
  for (const domain of OPERATIONAL_SOURCE_MAP) {
    for (const entity of domain.entities) {
      for (const consumerKey of entity.consumedBy) {
        if (consumerKey === domain.key) continue; // skip self-loops
        const isPending = entity.status === "pending_sag";

        edges.push({
          from:        domain.key,
          to:          consumerKey,
          entityKey:   entity.key,
          entityLabel: entity.label,
          isAtRisk:    isPending,
        });

        upstreamSet.add(domain.key);
        if (isPending) atRiskSet.add(consumerKey);
      }
    }
  }

  // Downstream = domains that appear only as targets, never as sources
  const allDomains    = new Set(OPERATIONAL_SOURCE_MAP.map(d => d.key));
  const downstreamSet = new Set<OperationalDomainKey>();
  for (const d of allDomains) {
    if (!upstreamSet.has(d)) downstreamSet.add(d);
  }

  return {
    edges,
    upstream:   Array.from(upstreamSet),
    downstream: Array.from(downstreamSet),
    atRisk:     Array.from(atRiskSet),
  };
}

// ─── Executive summary ────────────────────────────────────────────────────────

export function generateExecutiveSummary(
  rows:     ValidationWorkbookRow[],
  blockers: OperationalBlocker[],
): WorkbookExecutiveSummary {
  const now = new Date().toISOString();

  // Count entity statuses from source map
  let confirmed = 0, pendingSag = 0, internoAgentik = 0, crm = 0, futuro = 0;
  for (const d of OPERATIONAL_SOURCE_MAP) {
    for (const e of d.entities) {
      if (e.status === "confirmed")        confirmed++;
      else if (e.status === "pending_sag") pendingSag++;
      else if (e.status === "interno_agentik") internoAgentik++;
      else if (e.status === "crm")         crm++;
      else if (e.status === "futuro")      futuro++;
    }
  }

  const totalEntities = confirmed + pendingSag + internoAgentik + crm + futuro;

  // Answer states
  const byAnswerState = { pending: 0, answered: 0, blocked: 0, not_applicable: 0 };
  for (const row of rows) byAnswerState[row.answerState]++;

  // Critical blockers
  const criticalBlockers = blockers.filter(b => b.blockerLevel === "critical").length;
  const highBlockers     = blockers.filter(b => b.blockerLevel === "high").length;

  // Readiness: % of critical questions answered
  const criticalRows  = rows.filter(r => r.priority === "critical");
  const answeredCrit  = criticalRows.filter(r => r.answerState === "answered").length;
  const readinessScore = criticalRows.length > 0
    ? Math.round((answeredCrit / criticalRows.length) * 100)
    : 100;

  // Top blocking domains
  const domainOpenCount = new Map<OperationalDomainKey, number>();
  for (const row of rows) {
    if (row.answerState === "pending" && row.blockerLevel !== "none") {
      domainOpenCount.set(row.domain, (domainOpenCount.get(row.domain) ?? 0) + 1);
    }
  }
  const topBlockingDomains = Array.from(domainOpenCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([domain, openCount]) => ({
      domain,
      label: OPERATIONAL_SOURCE_MAP.find(d => d.key === domain)?.label ?? domain,
      openCount,
    }));

  const criticalQuestions = rows
    .filter(r => r.priority === "critical" && r.answerState === "pending")
    .sort((a, b) => b.scores.meetingPriorityScore - a.scores.meetingPriorityScore)
    .slice(0, 10);

  return {
    generatedAt:       now,
    totalEntities,
    totalQuestions:    rows.length,
    byStatus: { confirmed, pending_sag: pendingSag, interno_agentik: internoAgentik, crm, futuro },
    byAnswerState,
    criticalBlockers,
    highBlockers,
    readinessScore,
    topBlockingDomains,
    criticalQuestions,
  };
}

// ─── Domain grouping ──────────────────────────────────────────────────────────

export function groupWorkbookByDomain(
  rows: ValidationWorkbookRow[],
): ValidationWorkbookDomain[] {
  const domainMap = new Map<OperationalDomainKey, ValidationWorkbookRow[]>();

  for (const row of rows) {
    const existing = domainMap.get(row.domain) ?? [];
    existing.push(row);
    domainMap.set(row.domain, existing);
  }

  return OPERATIONAL_SOURCE_MAP.map(sourceDomain => {
    const domainRows = domainMap.get(sourceDomain.key) ?? [];
    const stats = {
      total:          domainRows.length,
      pending:        domainRows.filter(r => r.answerState === "pending").length,
      answered:       domainRows.filter(r => r.answerState === "answered").length,
      blocked:        domainRows.filter(r => r.answerState === "blocked").length,
      not_applicable: domainRows.filter(r => r.answerState === "not_applicable").length,
      criticalOpen:   domainRows.filter(r => r.priority === "critical" && r.answerState === "pending").length,
    };
    const domainPriorityScore = domainRows.reduce(
      (sum, r) => sum + r.scores.meetingPriorityScore, 0,
    );
    return {
      key:                sourceDomain.key,
      label:              sourceDomain.label,
      description:        sourceDomain.description,
      rows:               domainRows.sort((a, b) => b.scores.meetingPriorityScore - a.scores.meetingPriorityScore),
      stats,
      domainPriorityScore,
    };
  }).filter(d => d.rows.length > 0);
}

// ─── Filtered views ───────────────────────────────────────────────────────────

export function getCriticalBlockingQuestions(
  rows: ValidationWorkbookRow[],
): ValidationWorkbookRow[] {
  return rows
    .filter(r => r.blockerLevel === "critical" && r.answerState === "pending")
    .sort((a, b) => b.scores.meetingPriorityScore - a.scores.meetingPriorityScore);
}

export function getPendingSagEntities(
  rows: ValidationWorkbookRow[],
): ValidationWorkbookRow[] {
  return rows
    .filter(r => r.answerState === "pending")
    .sort((a, b) => b.scores.meetingPriorityScore - a.scores.meetingPriorityScore);
}

export interface WorkbookStats {
  totalRows:          number;
  pendingRows:        number;
  answeredRows:       number;
  criticalPending:    number;
  highPending:        number;
  uniqueEntities:     number;
  uniqueDomains:      number;
  sagTablesNeeded:    string[];
  readinessPercent:   number;
}

export function getWorkbookStats(rows: ValidationWorkbookRow[]): WorkbookStats {
  const criticalRows = rows.filter(r => r.priority === "critical");
  const answered     = rows.filter(r => r.answerState === "answered").length;

  const tablesSet = new Set<string>();
  for (const row of rows) {
    if (row.sagTableCandidate) tablesSet.add(row.sagTableCandidate);
  }

  return {
    totalRows:       rows.length,
    pendingRows:     rows.filter(r => r.answerState === "pending").length,
    answeredRows:    answered,
    criticalPending: criticalRows.filter(r => r.answerState === "pending").length,
    highPending:     rows.filter(r => r.priority === "high" && r.answerState === "pending").length,
    uniqueEntities:  new Set(rows.map(r => `${r.domain}__${r.entityKey}`)).size,
    uniqueDomains:   new Set(rows.map(r => r.domain)).size,
    sagTablesNeeded: Array.from(tablesSet).sort(),
    readinessPercent: criticalRows.length > 0
      ? Math.round(criticalRows.filter(r => r.answerState === "answered").length / criticalRows.length * 100)
      : 100,
  };
}

// ─── Main workbook generator ──────────────────────────────────────────────────

/**
 * Generates the full validation workbook from OPERATIONAL_SOURCE_MAP.
 *
 * Only includes entities that have:
 *   - sagValidationQuestions[], or
 *   - status = pending_sag
 *
 * Entities with status = confirmed | interno_agentik | crm are skipped
 * unless they have explicit sagValidationQuestions.
 *
 * @param organizationId  Optional org context (for future per-tenant answers)
 */
export function generateValidationWorkbook(
  organizationId: string | null = null,
): ValidationWorkbook {
  const now = new Date().toISOString();
  const downstreamMap = buildDownstreamCountMap();
  const rows: ValidationWorkbookRow[] = [];

  for (const domain of OPERATIONAL_SOURCE_MAP) {
    for (const entity of domain.entities) {
      const hasQuestions = (entity.sagValidationQuestions ?? []).length > 0;
      const isPending    = entity.status === "pending_sag";
      const isFuturo     = entity.status === "futuro";

      if (!hasQuestions && !isPending && !isFuturo) continue;

      const entityRows = generateRowsForEntity(
        domain.key,
        domain.label,
        entity,
        downstreamMap,
      );
      rows.push(...entityRows);
    }
  }

  // Sort all rows by meetingPriorityScore desc
  rows.sort((a, b) => b.scores.meetingPriorityScore - a.scores.meetingPriorityScore);

  const byDomain      = groupWorkbookByDomain(rows);
  const blockers      = detectOperationalBlockers(rows);
  const dependencyMap = buildCrossDomainDependencyMap(rows);
  const executiveSummary = generateExecutiveSummary(rows, blockers);

  return {
    generatedAt:    now,
    organizationId,
    rows,
    byDomain,
    blockers,
    dependencyMap,
    executiveSummary,
  };
}
