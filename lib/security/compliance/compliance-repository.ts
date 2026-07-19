/**
 * lib/security/compliance/compliance-repository.ts
 *
 * AGENTIK-SECURITY-COMPLIANCE-01
 * Compliance & Governance — Repository Contract + In-Memory Implementation
 *
 * No server-only. Interface contract usable from client types.
 * Prisma implementation: persistence/prisma-compliance-repository.ts
 */

import type {
  ComplianceEvidence,
  ComplianceFinding,
  ComplianceResult,
  ComplianceStatus,
  ComplianceFramework,
} from "./compliance-types";

// ── ComplianceRepository ──────────────────────────────────────────────────────

/**
 * ComplianceRepository — storage contract for compliance data.
 * All operations are multi-tenant: every method requires orgSlug.
 */
export interface ComplianceRepository {
  /** Persist a piece of compliance evidence. */
  saveEvidence(evidence: ComplianceEvidence): Promise<ComplianceResult<ComplianceEvidence>>;

  /** Persist a compliance finding. */
  saveFinding(finding: ComplianceFinding): Promise<ComplianceResult<ComplianceFinding>>;

  /** Get evidence by ID, scoped to org. */
  getEvidence(orgSlug: string, evidenceId: string): Promise<ComplianceEvidence | null>;

  /** Get a finding by ID, scoped to org. */
  getFinding(orgSlug: string, findingId: string): Promise<ComplianceFinding | null>;

  /** List evidence for a control within an org. */
  listEvidence(orgSlug: string, options?: {
    controlId?: string;
    since?:     string;   // ISO 8601
    limit?:     number;
  }): Promise<ComplianceEvidence[]>;

  /** List findings for an org. */
  listFindings(orgSlug: string, options?: {
    controlId?:  string;
    status?:     ComplianceStatus;
    framework?:  ComplianceFramework;
    limit?:      number;
  }): Promise<ComplianceFinding[]>;

  /** Update a finding's status. */
  updateFindingStatus(
    orgSlug:   string,
    findingId: string,
    status:    ComplianceStatus,
  ): Promise<ComplianceResult<ComplianceFinding>>;

  /** Count findings by status for an org. */
  countFindingsByStatus(orgSlug: string): Promise<Record<ComplianceStatus, number>>;
}

// ── ComplianceControlStatus ───────────────────────────────────────────────────

/**
 * ComplianceControlStatusRecord — persisted control evaluation status.
 * Snapshot of a control's compliance state at a point in time.
 */
export interface ComplianceControlStatusRecord {
  id:          string;
  orgSlug:     string;
  controlId:   string;
  framework?:  ComplianceFramework;
  status:      ComplianceStatus;
  score:       number;
  evaluatedAt: string;
  validUntil?: string;
}

// ── InMemoryComplianceRepository ──────────────────────────────────────────────

/**
 * InMemoryComplianceRepository — in-memory implementation for tests and dev.
 * Not for production use.
 */
export class InMemoryComplianceRepository implements ComplianceRepository {
  private readonly _evidence = new Map<string, ComplianceEvidence>();
  private readonly _findings = new Map<string, ComplianceFinding>();

  async saveEvidence(evidence: ComplianceEvidence): Promise<ComplianceResult<ComplianceEvidence>> {
    try {
      if (!evidence.orgSlug) return { ok: false, error: "org_slug_required", severity: "HIGH" };
      this._evidence.set(`${evidence.orgSlug}::${evidence.id}`, evidence);
      return { ok: true, value: evidence };
    } catch {
      return { ok: false, error: "save_evidence_failed", severity: "HIGH" };
    }
  }

  async saveFinding(finding: ComplianceFinding): Promise<ComplianceResult<ComplianceFinding>> {
    try {
      if (!finding.orgSlug) return { ok: false, error: "org_slug_required", severity: "HIGH" };
      this._findings.set(`${finding.orgSlug}::${finding.id}`, finding);
      return { ok: true, value: finding };
    } catch {
      return { ok: false, error: "save_finding_failed", severity: "HIGH" };
    }
  }

  async getEvidence(orgSlug: string, evidenceId: string): Promise<ComplianceEvidence | null> {
    try {
      return this._evidence.get(`${orgSlug}::${evidenceId}`) ?? null;
    } catch {
      return null;
    }
  }

  async getFinding(orgSlug: string, findingId: string): Promise<ComplianceFinding | null> {
    try {
      return this._findings.get(`${orgSlug}::${findingId}`) ?? null;
    } catch {
      return null;
    }
  }

  async listEvidence(orgSlug: string, options?: {
    controlId?: string;
    since?:     string;
    limit?:     number;
  }): Promise<ComplianceEvidence[]> {
    try {
      let items = Array.from(this._evidence.values())
        .filter(e => e.orgSlug === orgSlug);
      if (options?.controlId) items = items.filter(e => e.controlId === options.controlId);
      if (options?.since)     items = items.filter(e => e.collectedAt >= options.since!);
      if (options?.limit)     items = items.slice(0, options.limit);
      return items;
    } catch {
      return [];
    }
  }

  async listFindings(orgSlug: string, options?: {
    controlId?: string;
    status?:    ComplianceStatus;
    framework?: ComplianceFramework;
    limit?:     number;
  }): Promise<ComplianceFinding[]> {
    try {
      let items = Array.from(this._findings.values())
        .filter(f => f.orgSlug === orgSlug);
      if (options?.controlId) items = items.filter(f => f.controlId === options.controlId);
      if (options?.status)    items = items.filter(f => f.status    === options.status);
      if (options?.framework) items = items.filter(f => f.framework === options.framework);
      if (options?.limit)     items = items.slice(0, options.limit);
      return items;
    } catch {
      return [];
    }
  }

  async updateFindingStatus(
    orgSlug:   string,
    findingId: string,
    status:    ComplianceStatus,
  ): Promise<ComplianceResult<ComplianceFinding>> {
    try {
      const key     = `${orgSlug}::${findingId}`;
      const finding = this._findings.get(key);
      if (!finding) return { ok: false, error: "finding_not_found", severity: "MEDIUM" };
      const updated = { ...finding, status };
      this._findings.set(key, updated);
      return { ok: true, value: updated };
    } catch {
      return { ok: false, error: "update_finding_failed", severity: "HIGH" };
    }
  }

  async countFindingsByStatus(orgSlug: string): Promise<Record<ComplianceStatus, number>> {
    const counts: Record<ComplianceStatus, number> = {
      COMPLIANT: 0, PARTIAL: 0, NON_COMPLIANT: 0, UNKNOWN: 0,
    };
    try {
      for (const f of this._findings.values()) {
        if (f.orgSlug === orgSlug) counts[f.status]++;
      }
    } catch { /* fail gracefully */ }
    return counts;
  }
}

/** inMemoryComplianceRepository — singleton for test use. */
export const inMemoryComplianceRepository = new InMemoryComplianceRepository();
