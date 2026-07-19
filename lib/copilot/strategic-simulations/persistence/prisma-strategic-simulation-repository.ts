// AGENTIK-STRATEGIC-SIMULATIONS-01
// Phase 27 — Prisma Simulation Repository
// Uses (prisma as any).modelName pattern until prisma generate runs.

import type { StrategicSimulationRepository } from "../strategic-simulation-repository";
import type { SimulationRecord, SimulationQuery } from "../strategic-simulation-types";
import { prisma } from "@/lib/prisma";
import { filterSimulationRecords } from "../strategic-simulation-query";

export class PrismaStrategicSimulationRepository implements StrategicSimulationRepository {

  async saveSimulationRecord(record: SimulationRecord): Promise<SimulationRecord> {
    await (prisma as any).strategicSimulationRecord.upsert({
      where: { id: record.id },
      create: {
        id:              record.id,
        orgSlug:         record.orgSlug,
        category:        record.category,
        domain:          record.domain,
        title:           record.title,
        summary:         record.summary,
        confidence:      record.confidence,
        confidenceScore: record.confidenceScore,
        status:          record.status,
        metadata:        record.metadata,
        simulatedAt:     new Date(record.simulatedAt),
      },
      update: {
        title:           record.title,
        summary:         record.summary,
        confidence:      record.confidence,
        confidenceScore: record.confidenceScore,
        status:          record.status,
        metadata:        record.metadata,
      },
    });
    return record;
  }

  async findSimulationRecords(query: SimulationQuery): Promise<SimulationRecord[]> {
    const rows = await (prisma as any).strategicSimulationRecord.findMany({
      where: {
        orgSlug:  query.orgSlug,
        ...(query.category ? { category: query.category } : {}),
        ...(query.domain   ? { domain:   query.domain   } : {}),
        ...(query.status   ? { status:   query.status   } : {}),
      },
      orderBy: { simulatedAt: "desc" },
      take: query.limit ?? 50,
    });

    const records: SimulationRecord[] = rows.map(_mapRow);
    return filterSimulationRecords(records, query);
  }

  async findSimulationRecordById(id: string, orgSlug: string): Promise<SimulationRecord | null> {
    const row = await (prisma as any).strategicSimulationRecord.findFirst({
      where: { id, orgSlug },
    });
    return row ? _mapRow(row) : null;
  }

  async countSimulationRecords(orgSlug: string): Promise<number> {
    return (prisma as any).strategicSimulationRecord.count({ where: { orgSlug } });
  }
}

// ── Mapping ───────────────────────────────────────────────────────────────────

function _mapRow(row: any): SimulationRecord {
  return {
    id:              row.id,
    orgSlug:         row.orgSlug,
    category:        row.category,
    domain:          row.domain,
    title:           row.title,
    summary:         row.summary,
    confidence:      row.confidence,
    confidenceScore: row.confidenceScore,
    status:          row.status,
    metadata:        row.metadata ?? {},
    simulatedAt:     row.simulatedAt instanceof Date
      ? row.simulatedAt.toISOString()
      : String(row.simulatedAt),
  };
}
