/**
 * lib/operational-map/audit/operational-connection-audit-types.ts
 *
 * Operational Connection Audit — Type System.
 *
 * INTERNAL ONLY: SUPER_ADMIN / AGENTIK_ADMIN
 *
 * Audits the real connection state of every operational KPI:
 *   - What source SHOULD feed this KPI (design intent)
 *   - What source feeds it TODAY (actual state)
 *   - Connection health, freshness, confidence
 *   - Automatic flags: mock, partial, stale, wrong_source, manual
 *   - Readiness score per domain
 *
 * Sprint: AGENTIK-OPERATIONAL-CONNECTION-AUDIT-01
 */

import type {
  OperationalDomainKey,
  OperationalSourceOfTruth,
  OperationalSourcePriority,
  OperationalFrequency,
} from "../operational-source-map";

// ─── Connection health ─────────────────────────────────────────────────────────

/**
 * Current connection health of a KPI/entity's data source.
 *
 *   live          — active connector, real data, freshness within threshold
 *   mock          — UI shows placeholder/hardcoded data
 *   partial       — some fields real, others missing or mocked
 *   stale         — real source but data is older than freshness threshold
 *   disconnected  — source identified but no active connector built
 *   pending       — planned and scoped but not yet built
 *   wrong_source  — data present but arriving from wrong source
 *   manual        — data from manual uploads / CSV entry
 */
export type ConnectionHealth =
  | "live"
  | "mock"
  | "partial"
  | "stale"
  | "disconnected"
  | "pending"
  | "wrong_source"
  | "manual";

// ─── Data freshness ────────────────────────────────────────────────────────────

export type DataFreshness =
  | "realtime"    // streaming or < 1 hour
  | "today"       // < 24 hours
  | "yesterday"   // 24–48 hours
  | "week_old"    // 2–7 days
  | "month_old"   // 7+ days
  | "unknown";    // cannot determine

// ─── Confidence level ──────────────────────────────────────────────────────────

export type ConfidenceLevel =
  | "high"    // source confirmed, data validated end-to-end
  | "medium"  // source likely correct, not fully validated
  | "low"     // source suspected, data not validated
  | "none";   // completely unknown

// ─── Audit flags ──────────────────────────────────────────────────────────────

export interface AuditFlags {
  /** Data is hardcoded or placeholder in the UI */
  isMock:           boolean;
  /** Only some sub-fields are real; others missing or mocked */
  isPartial:        boolean;
  /** Real source exists but last sync exceeds acceptable freshness */
  isStale:          boolean;
  /** Data arrives from wrong source (e.g. Agentik computing what SAG should provide) */
  isWrongSource:    boolean;
  /** Data from manual upload or CSV entry rather than live connector */
  isManual:         boolean;
  /** No active connector — source identified but integration not built */
  isDisconnected:   boolean;
  /** SAG table/field/behavior has NOT been confirmed with SAG DBA */
  isSagUnvalidated: boolean;
}

// ─── SAG query status ─────────────────────────────────────────────────────────

export type SagQueryStatus =
  | "confirmed"       // SAG table and fields validated in production
  | "pending"         // Known table/field, not yet validated in instance
  | "placeholder"     // Table name guessed; needs SAG DBA confirmation
  | "not_applicable"; // Entity does not use SAG as source

// ─── KPI registry entry ───────────────────────────────────────────────────────

/**
 * Static declaration of a KPI's connection design and actual state.
 * Populated in operational-kpi-registry.ts.
 */
export interface KpiRegistryEntry {
  domain:             OperationalDomainKey;
  entityKey:          string;
  entityLabel:        string;
  kpiDefinition:      string;
  priority:           OperationalSourcePriority;
  frequency:          OperationalFrequency;
  sourceOfTruth:      OperationalSourceOfTruth;
  /** Intended design: what source should feed this KPI */
  expectedSources:    string[];
  /** Actual state: what feeds this KPI today */
  actualSources:      string[];
  connectionHealth:   ConnectionHealth;
  dataFreshness:      DataFreshness;
  confidenceLevel:    ConfidenceLevel;
  sagQueryStatus:     SagQueryStatus;
  sagTableConfirmed:  boolean;
  sagFieldsConfirmed: boolean;
  riskDescription:    string;
  recommendedAction:  string;
  /** Agentik modules that display or consume this KPI */
  affectedModules:    string[];
}

// ─── Single audit row ─────────────────────────────────────────────────────────

export interface OperationalConnectionAuditRow extends KpiRegistryEntry {
  /** Unique row ID within the audit */
  id:               string;
  /** Human-readable domain label derived from domain key */
  domainLabel:      string;
  /** Auto-detected flag set applied over the registry entry */
  flags:            AuditFlags;
  /** 0–1 weight of this row's contribution toward domain readiness */
  readinessWeight:  number;
  /** Whether this row counts as "ready" for the domain readiness score */
  isReady:          boolean;
  /** ISO timestamp of last known data sync (null if never) */
  lastSyncAt:       string | null;

  // ── Certification overlay (merged from DB) ────────────────────────────────
  /** Persistent certification status from DB (null = never certified) */
  certificationStatus:  string | null;
  /** True if marked production_ready in DB */
  productionReady:      boolean;
  /** Actor who last validated this KPI */
  validatedBy:          string | null;
  /** ISO timestamp of last validation */
  lastValidatedAt:      string | null;
  /** Confidence score 0–100 */
  confidenceScore:      number;
  /** Business team approval */
  businessApproved:     boolean;
  /** SAG DBA approval */
  sagApproved:          boolean;
  /** Operational Trust Score 0–100 */
  trustScore:           number;
  /** Trust grade A/B/C/D/F */
  trustGrade:           string;
}

// ─── Domain audit summary ─────────────────────────────────────────────────────

export interface DomainAuditSummary {
  domain:           OperationalDomainKey;
  label:            string;
  /** 0–100 weighted readiness score for this domain */
  readinessScore:   number;
  totalKpis:        number;
  byHealth: {
    live:         number;
    mock:         number;
    partial:      number;
    stale:        number;
    disconnected: number;
    pending:      number;
    wrong_source: number;
    manual:       number;
  };
  criticalIssues:   number;
  topBlockingKpi:   string | null;
}

// ─── Full audit ───────────────────────────────────────────────────────────────

export interface OperationalConnectionAudit {
  generatedAt:            string;
  organizationId:         string | null;

  rows:                   OperationalConnectionAuditRow[];
  byDomain:               DomainAuditSummary[];

  overallReadinessScore:  number;
  totalKpis:              number;
  totalIssues:            number;
  criticalIssues:         number;

  byFlag: {
    mock:           number;
    partial:        number;
    stale:          number;
    wrongSource:    number;
    manual:         number;
    disconnected:   number;
    sagUnvalidated: number;
  };
}

// ─── Export filter ────────────────────────────────────────────────────────────

export interface AuditExportFilter {
  domain?:      OperationalDomainKey;
  health?:      ConnectionHealth;
  priority?:    OperationalSourcePriority;
  flag?:        keyof AuditFlags;
  sagStatus?:   SagQueryStatus;
  onlyIssues?:  boolean;
}
