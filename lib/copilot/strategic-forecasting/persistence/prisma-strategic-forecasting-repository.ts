// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 31: Prisma Repository

import { prisma } from "@/lib/prisma";
import type { StrategicForecast, ForecastStatus } from "../strategic-forecasting-types";
import type { StrategicForecastingRepository } from "../strategic-forecasting-repository";

export class PrismaStrategicForecastingRepository
  implements StrategicForecastingRepository
{
  async saveForecast(forecast: StrategicForecast): Promise<void> {
    await (prisma as any).strategicForecastRecord.upsert({
      where: { id: forecast.id },
      update: {
        orgSlug:       forecast.orgSlug,
        status:        forecast.status,
        horizon:       forecast.horizon,
        domain:        forecast.domain,
        forecastScore: forecast.forecastScore,
        confidenceLevel: forecast.confidence.level,
        confidenceScore: forecast.confidence.score,
        reportJson:    JSON.stringify(forecast.report),
        limitations:   forecast.limitations,
        metadata:      JSON.stringify(forecast.metadata),
        updatedAt:     new Date(),
      },
      create: {
        id:            forecast.id,
        orgSlug:       forecast.orgSlug,
        status:        forecast.status,
        horizon:       forecast.horizon,
        domain:        forecast.domain,
        forecastScore: forecast.forecastScore,
        confidenceLevel: forecast.confidence.level,
        confidenceScore: forecast.confidence.score,
        reportJson:    JSON.stringify(forecast.report),
        limitations:   forecast.limitations,
        metadata:      JSON.stringify(forecast.metadata),
        createdAt:     new Date(forecast.createdAt),
        updatedAt:     new Date(forecast.updatedAt),
      },
    });
  }

  async getForecast(orgSlug: string, id: string): Promise<StrategicForecast | null> {
    try {
      const record = await (prisma as any).strategicForecastRecord.findFirst({
        where: { id, orgSlug },
      });
      if (!record) return null;
      return deserializeForecastRecord(record);
    } catch {
      return null;
    }
  }

  async queryForecasts(orgSlug: string, status?: ForecastStatus): Promise<StrategicForecast[]> {
    try {
      const where: Record<string, unknown> = { orgSlug };
      if (status) where["status"] = status;
      const records = await (prisma as any).strategicForecastRecord.findMany({
        where,
        orderBy: { createdAt: "desc" },
      });
      return records.map(deserializeForecastRecord).filter(Boolean) as StrategicForecast[];
    } catch {
      return [];
    }
  }

  async archiveForecast(orgSlug: string, id: string): Promise<void> {
    await (prisma as any).strategicForecastRecord.updateMany({
      where:  { id, orgSlug },
      data:   { status: "ARCHIVED", updatedAt: new Date() },
    });
  }
}

function deserializeForecastRecord(record: any): StrategicForecast | null {
  try {
    const report = JSON.parse(record.reportJson ?? "null");
    if (!report) return null;
    return {
      id:            record.id,
      orgSlug:       record.orgSlug,
      status:        record.status as ForecastStatus,
      horizon:       record.horizon,
      domain:        record.domain,
      report,
      forecastScore: record.forecastScore,
      confidence: {
        level:         record.confidenceLevel,
        score:         record.confidenceScore,
        evidenceCount: 0,
        limitations:   [],
        rationale:     "",
      },
      limitations:   record.limitations ?? [],
      metadata:      JSON.parse(record.metadata ?? "{}"),
      createdAt:     record.createdAt.toISOString(),
      updatedAt:     record.updatedAt.toISOString(),
    };
  } catch {
    return null;
  }
}
