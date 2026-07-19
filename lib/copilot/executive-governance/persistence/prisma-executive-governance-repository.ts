// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 36: Prisma Repository

import { prisma } from "@/lib/prisma";
import type { ExecutiveGovernanceResult } from "../executive-governance-types";
import type { IExecutiveGovernanceRepository, GovernanceStoredEntry } from "../executive-governance-repository";

export class PrismaExecutiveGovernanceRepository implements IExecutiveGovernanceRepository {
  async save(result: ExecutiveGovernanceResult): Promise<GovernanceStoredEntry> {
    try {
      const record = await (prisma as any).governanceReportRecord.create({
        data: {
          orgSlug:         result.orgSlug,
          sessionId:       result.sessionId,
          overallScore:    result.score.overallScore,
          complianceScore: result.score.complianceScore,
          riskScore:       result.score.riskScore,
          status:          result.report.status,
          violationCount:  result.report.violations.length,
          escalationCount: result.report.escalations.length,
          findingCount:    result.report.assessment.findingCount,
          exceptionCount:  result.report.exceptions.length,
          payload:         JSON.stringify(result),
          createdAt:       result.createdAt,
        },
      });
      return record as GovernanceStoredEntry;
    } catch {
      throw new Error("Error persistiendo resultado de gobernanza en Prisma");
    }
  }

  async findLatest(orgSlug: string): Promise<GovernanceStoredEntry | null> {
    try {
      const record = await (prisma as any).governanceReportRecord.findFirst({
        where:   { orgSlug },
        orderBy: { createdAt: "desc" },
      });
      return record ?? null;
    } catch {
      return null;
    }
  }

  async findAll(orgSlug: string, limit = 10): Promise<GovernanceStoredEntry[]> {
    try {
      const records = await (prisma as any).governanceReportRecord.findMany({
        where:   { orgSlug },
        orderBy: { createdAt: "desc" },
        take:    limit,
      });
      return records ?? [];
    } catch {
      return [];
    }
  }

  async count(orgSlug: string): Promise<number> {
    try {
      return await (prisma as any).governanceReportRecord.count({
        where: { orgSlug },
      });
    } catch {
      return 0;
    }
  }
}

export const prismaGovernanceRepository = new PrismaExecutiveGovernanceRepository();
