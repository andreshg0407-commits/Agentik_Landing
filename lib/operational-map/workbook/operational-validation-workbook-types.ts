/**
 * lib/operational-map/workbook/operational-validation-workbook-types.ts
 *
 * Validation Workbook — Type System.
 *
 * The workbook is the operational translation of OPERATIONAL_SOURCE_MAP
 * into a human-usable instrument for SAG technical meetings, onboarding,
 * and integration governance.
 *
 * Each WorkbookRow represents one unit of SAG validation work:
 *   - One question to ask the SAG DBA / team
 *   - One operational entity that depends on the answer
 *   - A clear impact statement if unresolved
 *
 * Sprint: AGENTIK-SAG-VALIDATION-WORKBOOK-01
 */

import type {
  OperationalDomainKey,
  OperationalSourceOfTruth,
  OperationalSourcePriority,
  OperationalFrequency,
} from "../operational-source-map";

// ─── Answer state ─────────────────────────────────────────────────────────────

/**
 * Lifecycle state of a single validation question.
 *
 *   pending         — not yet asked / no answer recorded
 *   answered        — SAG confirmed the answer; operationally unblocked
 *   blocked         — SAG cannot answer (missing feature, undocumented, etc.)
 *   not_applicable  — this entity does not apply to this org/configuration
 */
export type ValidationWorkbookAnswerState =
  | "pending"
  | "answered"
  | "blocked"
  | "not_applicable";

// ─── Priority ─────────────────────────────────────────────────────────────────

export type ValidationWorkbookPriority = OperationalSourcePriority;

// ─── Blocker level ────────────────────────────────────────────────────────────

/**
 * How much this unresolved question blocks operational readiness.
 *
 *   critical  — blocks a live operational flow today
 *   high      — blocks a planned feature within current sprint scope
 *   medium    — blocks analytics / intelligence enrichment
 *   none      — informational — nice to know but not blocking
 */
export type ValidationBlockerLevel =
  | "critical"
  | "high"
  | "medium"
  | "none";

// ─── View types ───────────────────────────────────────────────────────────────

export type WorkbookView =
  | "executive"     // Aggregated by domain, status only
  | "technical"     // Full table with SAG candidates and SQL hints
  | "domain"        // Single domain deep-dive
  | "priority"      // Sorted by meetingPriorityScore desc
  | "blockers";     // Only critical/high blocker rows

// ─── Parsed SAG candidate ─────────────────────────────────────────────────────

/**
 * Extracted from possibleSources[] strings.
 * Parsed by parseSagCandidates() in the generator.
 */
export interface SagCandidate {
  /** Candidate SAG table name (e.g. "INVENTARIO") */
  table:          string | null;
  /** Candidate SAG field names (e.g. ["SALDO", "EXISTENCIA", "CANTIDAD"]) */
  fields:         string[];
  /** Raw SQL hint if a SELECT pattern was found */
  sqlHint:        string | null;
  /** Whether this candidate is marked as needing confirmation */
  needsConfirm:   boolean;
  /** Full raw source string */
  rawSource:      string;
}

// ─── Scores ───────────────────────────────────────────────────────────────────

export interface WorkbookRowScores {
  /**
   * How operationally critical is this entity?
   * priority × consumedBy.length × (isPending ? 2 : 1)
   * Range: 0–100
   */
  operationalCriticalityScore:    number;
  /**
   * How many other entities depend on this one being resolved?
   * Computed from cross-domain dependency analysis.
   * Range: 0–50
   */
  implementationDependencyScore:  number;
  /**
   * Combined meeting priority — use this to sort the agenda.
   * = operationalCriticalityScore + implementationDependencyScore
   * Range: 0–150
   */
  meetingPriorityScore:           number;
}

// ─── Single workbook row ──────────────────────────────────────────────────────

/**
 * One row in the validation workbook.
 *
 * Corresponds to either:
 *   a) One sagValidationQuestion from an entity, or
 *   b) One pending_sag entity without explicit questions (generates a default question)
 */
export interface ValidationWorkbookRow {
  /** Unique row identifier within the workbook */
  id:                   string;

  // ── Context ──────────────────────────────────────────────────────────────
  domain:               OperationalDomainKey;
  domainLabel:          string;
  entityKey:            string;
  entityLabel:          string;

  // ── Ownership ─────────────────────────────────────────────────────────────
  sourceOfTruth:        OperationalSourceOfTruth;

  // ── Classification ────────────────────────────────────────────────────────
  priority:             ValidationWorkbookPriority;
  frequency:            OperationalFrequency;
  blockerLevel:         ValidationBlockerLevel;

  // ── SAG specifics ──────────────────────────────────────────────────────────
  /** Primary SAG candidate table extracted from possibleSources */
  sagTableCandidate:    string | null;
  /** Candidate field names extracted from possibleSources */
  sagFieldCandidates:   string[];
  /** SQL hint extracted from possibleSources */
  sagSqlHint:           string | null;
  /** Full parsed SAG candidates for this entity */
  sagCandidates:        SagCandidate[];

  // ── The question ──────────────────────────────────────────────────────────
  /** The concrete validation question for the SAG meeting */
  validationQuestion:   string;
  /**
   * What behavior Agentik expects/needs from SAG.
   * Derived from entity definition.
   */
  expectedBehavior:     string;
  /**
   * Operational impact if this question is left unresolved.
   * Derived from priority + consumedBy.
   */
  operationalImpact:    string;

  // ── Dependencies ──────────────────────────────────────────────────────────
  /** Domains that consume this entity */
  consumedBy:           OperationalDomainKey[];
  /** Number of downstream entities that depend on this */
  downstreamCount:      number;

  // ── Answer tracking ───────────────────────────────────────────────────────
  answerState:          ValidationWorkbookAnswerState;
  answer:               string | null;
  answeredBy:           string | null;
  answeredAt:           string | null;
  notes:                string | null;

  // ── Scoring ───────────────────────────────────────────────────────────────
  scores:               WorkbookRowScores;
}

// ─── Domain group ─────────────────────────────────────────────────────────────

export interface ValidationWorkbookDomain {
  key:          OperationalDomainKey;
  label:        string;
  description:  string;
  rows:         ValidationWorkbookRow[];
  /** Count of rows by answer state */
  stats: {
    total:          number;
    pending:        number;
    answered:       number;
    blocked:        number;
    not_applicable: number;
    criticalOpen:   number;
  };
  /** Aggregate priority score for this domain */
  domainPriorityScore: number;
}

// ─── Executive summary ────────────────────────────────────────────────────────

export interface WorkbookExecutiveSummary {
  generatedAt:         string;
  totalEntities:       number;
  totalQuestions:      number;
  byStatus: {
    confirmed:         number;
    pending_sag:       number;
    interno_agentik:   number;
    crm:               number;
    futuro:            number;
  };
  byAnswerState: {
    pending:           number;
    answered:          number;
    blocked:           number;
    not_applicable:    number;
  };
  criticalBlockers:    number;
  highBlockers:        number;
  readinessScore:      number; // 0–100: % of critical questions answered
  topBlockingDomains:  Array<{ domain: OperationalDomainKey; label: string; openCount: number }>;
  criticalQuestions:   ValidationWorkbookRow[];
}

// ─── Operational blocker ──────────────────────────────────────────────────────

export interface OperationalBlocker {
  id:                   string;
  blockerLevel:         ValidationBlockerLevel;
  domain:               OperationalDomainKey;
  domainLabel:          string;
  entityKey:            string;
  entityLabel:          string;
  reason:               string;
  /** Operational flows that are currently degraded because of this blocker */
  degradedFlows:        string[];
  /** The workbook row(s) that must be resolved to unblock */
  rowIds:               string[];
}

// ─── Cross-domain dependency ──────────────────────────────────────────────────

export interface DomainDependencyEdge {
  from:        OperationalDomainKey;
  to:          OperationalDomainKey;
  entityKey:   string;
  entityLabel: string;
  /** True if the upstream entity is currently pending_sag (dependency is at risk) */
  isAtRisk:    boolean;
}

export interface CrossDomainDependencyMap {
  edges:       DomainDependencyEdge[];
  /** Domains that are upstream (produce data consumed by others) */
  upstream:    OperationalDomainKey[];
  /** Domains that are purely downstream (consume but don't produce critical entities) */
  downstream:  OperationalDomainKey[];
  /** Domains with broken upstream dependencies (pending_sag blocking them) */
  atRisk:      OperationalDomainKey[];
}

// ─── Full workbook ────────────────────────────────────────────────────────────

export interface ValidationWorkbook {
  /** ISO generation timestamp */
  generatedAt:        string;
  /** Org this workbook was generated for (null = system-level) */
  organizationId:     string | null;

  // ── All rows ──────────────────────────────────────────────────────────────
  rows:               ValidationWorkbookRow[];

  // ── Grouped views ─────────────────────────────────────────────────────────
  byDomain:           ValidationWorkbookDomain[];
  blockers:           OperationalBlocker[];
  dependencyMap:      CrossDomainDependencyMap;
  executiveSummary:   WorkbookExecutiveSummary;
}
