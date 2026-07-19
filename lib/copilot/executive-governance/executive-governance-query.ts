// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 34: Governance Query Layer

import { prisma } from "@/lib/prisma";

export async function getGovernanceStats(orgSlug: string): Promise<{
  reportCount:    number;
  violationCount: number;
  escalationCount: number;
  avgComplianceScore: number;
}> {
  try {
    const [records] = await Promise.all([
      (prisma as any).governanceReportRecord.findMany({
        where:  { orgSlug },
        select: { complianceScore: true, violationCount: true, escalationCount: true },
      }),
    ]);
    const reportCount    = records.length;
    const violationCount = records.reduce((s: number, r: any) => s + (r.violationCount ?? 0), 0);
    const escalationCount = records.reduce((s: number, r: any) => s + (r.escalationCount ?? 0), 0);
    const avgComplianceScore = reportCount > 0
      ? records.reduce((s: number, r: any) => s + (r.complianceScore ?? 0), 0) / reportCount
      : 0;
    return { reportCount, violationCount, escalationCount, avgComplianceScore };
  } catch {
    return { reportCount: 0, violationCount: 0, escalationCount: 0, avgComplianceScore: 0 };
  }
}

export async function getGovernanceReportRecords(orgSlug: string, limit = 10): Promise<unknown[]> {
  try {
    return await (prisma as any).governanceReportRecord.findMany({
      where:   { orgSlug },
      orderBy: { createdAt: "desc" },
      take:    limit,
    });
  } catch {
    return [];
  }
}

export async function getLatestGovernanceReport(orgSlug: string): Promise<unknown | null> {
  try {
    return await (prisma as any).governanceReportRecord.findFirst({
      where:   { orgSlug },
      orderBy: { createdAt: "desc" },
    });
  } catch {
    return null;
  }
}

export async function getGovernanceViolationRecords(orgSlug: string, limit = 20): Promise<unknown[]> {
  try {
    return await (prisma as any).governanceViolationRecord.findMany({
      where:   { orgSlug },
      orderBy: { createdAt: "desc" },
      take:    limit,
    });
  } catch {
    return [];
  }
}

export async function getGovernanceEscalationRecords(orgSlug: string, limit = 10): Promise<unknown[]> {
  try {
    return await (prisma as any).governanceEscalationRecord.findMany({
      where:   { orgSlug },
      orderBy: { createdAt: "desc" },
      take:    limit,
    });
  } catch {
    return [];
  }
}
