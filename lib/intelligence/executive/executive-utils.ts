/**
 * executive-utils.ts
 *
 * Shared utility functions for the Executive Intelligence Engine.
 */

import type { DailyKpi } from "./executive-types";

export function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

export function startOfYesterday(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return startOfDay(d);
}

export function buildKpi(value: number, previousValue: number): DailyKpi {
  const delta = value - previousValue;
  const deltaPercent = previousValue > 0
    ? Math.round((delta / previousValue) * 100)
    : value > 0 ? 100 : 0;
  return { value, previousValue, delta, deltaPercent };
}

let alertCounter = 0;
export function nextAlertId(): string {
  alertCounter++;
  return `alert-${Date.now()}-${alertCounter}`;
}

let timelineCounter = 0;
export function nextTimelineId(): string {
  timelineCounter++;
  return `tl-${Date.now()}-${timelineCounter}`;
}
