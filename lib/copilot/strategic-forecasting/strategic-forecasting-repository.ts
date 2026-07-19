// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 30: Repository Interface + In-Memory Implementation

import type { StrategicForecast, ForecastStatus } from "./strategic-forecasting-types";

export interface StrategicForecastingRepository {
  saveForecast(forecast: StrategicForecast): Promise<void>;
  getForecast(orgSlug: string, id: string): Promise<StrategicForecast | null>;
  queryForecasts(orgSlug: string, status?: ForecastStatus): Promise<StrategicForecast[]>;
  archiveForecast(orgSlug: string, id: string): Promise<void>;
}

export class InMemoryStrategicForecastingRepository
  implements StrategicForecastingRepository
{
  private readonly store = new Map<string, StrategicForecast>();

  private key(orgSlug: string, id: string): string {
    return `${orgSlug}:${id}`;
  }

  async saveForecast(forecast: StrategicForecast): Promise<void> {
    this.store.set(this.key(forecast.orgSlug, forecast.id), forecast);
  }

  async getForecast(orgSlug: string, id: string): Promise<StrategicForecast | null> {
    return this.store.get(this.key(orgSlug, id)) ?? null;
  }

  async queryForecasts(orgSlug: string, status?: ForecastStatus): Promise<StrategicForecast[]> {
    const results: StrategicForecast[] = [];
    for (const forecast of this.store.values()) {
      if (forecast.orgSlug !== orgSlug) continue;
      if (status && forecast.status !== status) continue;
      results.push(forecast);
    }
    return results.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async archiveForecast(orgSlug: string, id: string): Promise<void> {
    const forecast = await this.getForecast(orgSlug, id);
    if (forecast) {
      const archived = { ...forecast, status: "ARCHIVED" as ForecastStatus, updatedAt: new Date().toISOString() };
      this.store.set(this.key(orgSlug, id), archived);
    }
  }
}
