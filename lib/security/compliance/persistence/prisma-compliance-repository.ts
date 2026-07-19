/**
 * lib/security/compliance/persistence/prisma-compliance-repository.ts
 *
 * AGENTIK-SECURITY-COMPLIANCE-01
 * Compliance & Governance — Prisma Repository Implementation
 *
 * Implements ComplianceRepository using PostgreSQL via Prisma.
 * Uses (prisma as any) until `prisma generate` runs.
 *
 * Server-only. Never import in client components.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import type {
  ComplianceEvidence,
  ComplianceFinding,
  ComplianceResult,
  ComplianceStatus,
  ComplianceFramework,
} from "../compliance-types";
import type { ComplianceRepository } from "../compliance-repository";

// ── PrismaComplianceRepository ────────────────────────────────────────────────

export class PrismaComplianceRepository implements ComplianceRepository {

  // ── Evidence ──────────────────────────────────────────────────────────────

  async saveEvidence(evidence: ComplianceEvidence): Promise<ComplianceResult<ComplianceEvidence>> {
    try {
      if (!evidence.orgSlug) return { ok: false, error: "org_slug_required", severity: "HIGH" };
      await (prisma as any).complianceEvidence.upsert({
        where: { id: evidence.id },
        update: {
          isSupporting: evidence.isSupporting,
          summary:      evidence.summary,
          data:         evidence.data,
          expiresAt:    evidence.expiresAt ? new Date(evidence.expiresAt) : null,
        },
        create: {
          id:           evidence.id,
          orgSlug:      evidence.orgSlug,
          controlId:    evidence.controlId,
          source:       evidence.source,
          isSupporting: evidence.isSupporting,
          summary:      evidence.summary,
          data:         evidence.data,
          collectedAt:  new Date(evidence.collectedAt),
          expiresAt:    evidence.expiresAt ? new Date(evidence.expiresAt) : null,
          actorId:      evidence.actorId ?? null,
          framework:    evidence.framework ?? null,
        },
      });
      return { ok: true, value: evidence };
    } catch (e) {
      return { ok: false, error: String(e), severity: "HIGH" };
    }
  }

  async saveFinding(finding: ComplianceFinding): Promise<ComplianceResult<ComplianceFinding>> {
    try {
      if (!finding.orgSlug) return { ok: false, error: "org_slug_required", severity: "HIGH" };
      await (prisma as any).complianceFinding.upsert({
        where: { id: finding.id },
        update: {
          status:      finding.status,
          score:       finding.score,
          type:        finding.type,
          severity:    finding.severity,
          title:       finding.title,
          summary:     finding.summary,
          violations:  finding.violations,
          evidenceIds: finding.evidenceIds,
        },
        create: {
          id:           finding.id,
          orgSlug:      finding.orgSlug,
          controlId:    finding.controlId,
          framework:    finding.framework ?? null,
          type:         finding.type,
          status:       finding.status,
          severity:     finding.severity,
          title:        finding.title,
          summary:      finding.summary,
          score:        finding.score,
          evidenceIds:  finding.evidenceIds,
          violations:   finding.violations,
          remediations: finding.remediations,
          evaluatedAt:  new Date(finding.evaluatedAt),
          validUntil:   finding.validUntil ? new Date(finding.validUntil) : null,
        },
      });
      return { ok: true, value: finding };
    } catch (e) {
      return { ok: false, error: String(e), severity: "HIGH" };
    }
  }

  async getEvidence(orgSlug: string, evidenceId: string): Promise<ComplianceEvidence | null> {
    try {
      const row = await (prisma as any).complianceEvidence.findFirst({
        where: { id: evidenceId, orgSlug },
      });
      if (!row) return null;
      return _rowToEvidence(row);
    } catch {
      return null;
    }
  }

  async getFinding(orgSlug: string, findingId: string): Promise<ComplianceFinding | null> {
    try {
      const row = await (prisma as any).complianceFinding.findFirst({
        where: { id: findingId, orgSlug },
      });
      if (!row) return null;
      return _rowToFinding(row);
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
      const where: Record<string, unknown> = { orgSlug };
      if (options?.controlId) where.controlId = options.controlId;
      if (options?.since)     where.collectedAt = { gte: new Date(options.since) };
      const rows = await (prisma as any).complianceEvidence.findMany({
        where,
        take:    options?.limit ?? 200,
        orderBy: { collectedAt: "desc" },
      });
      return rows.map(_rowToEvidence);
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
      const where: Record<string, unknown> = { orgSlug };
      if (options?.controlId) where.controlId = options.controlId;
      if (options?.status)    where.status     = options.status;
      if (options?.framework) where.framework  = options.framework;
      const rows = await (prisma as any).complianceFinding.findMany({
        where,
        take:    options?.limit ?? 200,
        orderBy: { evaluatedAt: "desc" },
      });
      return rows.map(_rowToFinding);
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
      const updated = await (prisma as any).complianceFinding.updateMany({
        where: { id: findingId, orgSlug },
        data:  { status },
      });
      if (updated.count === 0) {
        return { ok: false, error: "finding_not_found", severity: "MEDIUM" };
      }
      const row = await (prisma as any).complianceFinding.findFirst({ where: { id: findingId, orgSlug } });
      return { ok: true, value: _rowToFinding(row) };
    } catch (e) {
      return { ok: false, error: String(e), severity: "HIGH" };
    }
  }

  async countFindingsByStatus(orgSlug: string): Promise<Record<ComplianceStatus, number>> {
    const counts: Record<ComplianceStatus, number> = {
      COMPLIANT: 0, PARTIAL: 0, NON_COMPLIANT: 0, UNKNOWN: 0,
    };
    try {
      const rows = await (prisma as any).complianceFinding.groupBy({
        by:    ["status"],
        where: { orgSlug },
        _count: true,
      });
      for (const row of rows) {
        if (row.status in counts) counts[row.status as ComplianceStatus] += row._count ?? 1;
      }
    } catch { /* return defaults */ }
    return counts;
  }
}

// ── Row mappers ────────────────────────────────────────────────────────────────

function _rowToEvidence(row: any): ComplianceEvidence {
  return {
    id:           row.id,
    orgSlug:      row.orgSlug,
    controlId:    row.controlId,
    source:       row.source,
    isSupporting: row.isSupporting,
    summary:      row.summary,
    data:         (row.data as Record<string, unknown>) ?? {},
    collectedAt:  row.collectedAt instanceof Date ? row.collectedAt.toISOString() : row.collectedAt,
    expiresAt:    row.expiresAt instanceof Date ? row.expiresAt.toISOString() : (row.expiresAt ?? undefined),
    actorId:      row.actorId ?? undefined,
    framework:    row.framework ?? undefined,
  };
}

function _rowToFinding(row: any): ComplianceFinding {
  return {
    id:           row.id,
    orgSlug:      row.orgSlug,
    controlId:    row.controlId,
    framework:    row.framework ?? undefined,
    type:         row.type,
    status:       row.status,
    severity:     row.severity,
    title:        row.title,
    summary:      row.summary,
    evidenceIds:  (row.evidenceIds as string[]) ?? [],
    violations:   (row.violations as any[]) ?? [],
    score:        row.score ?? 0,
    evaluatedAt:  row.evaluatedAt instanceof Date ? row.evaluatedAt.toISOString() : row.evaluatedAt,
    validUntil:   row.validUntil instanceof Date ? row.validUntil.toISOString() : (row.validUntil ?? undefined),
    remediations: (row.remediations as string[]) ?? [],
  };
}

// ── Singleton ─────────────────────────────────────────────────────────────────

export const prismaComplianceRepository = new PrismaComplianceRepository();
