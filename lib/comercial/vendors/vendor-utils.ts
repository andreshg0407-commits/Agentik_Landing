/**
 * vendor-utils.ts
 *
 * COMERCIAL-VENDEDORES-LIVE-01
 * Shared utilities for vendor engines.
 */

let _alertSeq = 0;
let _recSeq = 0;

export function nextAlertId(): string {
  return `va-${Date.now()}-${++_alertSeq}`;
}

export function nextRecId(): string {
  return `vr-${Date.now()}-${++_recSeq}`;
}

export function toSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfWeek(): Date {
  const d = startOfToday();
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
}

export function startOfMonth(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfToday(): Date {
  const d = startOfToday();
  d.setDate(d.getDate() + 1);
  return d;
}
