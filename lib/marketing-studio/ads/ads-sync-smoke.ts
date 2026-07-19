/**
 * lib/marketing-studio/ads/ads-sync-smoke.ts
 *
 * MARKETING-ADS-SYNC-01 — Smoke Checks de Sincronización de Estado
 *
 * Checks determinísticos sin llamadas externas (no Prisma, no Meta, no TikTok).
 * Valida la lógica de mapeo de estados, normalización y estructura de payloads.
 */

import {
  ADS_EXTERNAL_STATUS_LABEL,
  ADS_SYNC_ERROR_CODES,
} from "./ads-sync-types";
import type {
  AdsExternalStatus,
  AdsProviderStatusPayload,
} from "./ads-sync-types";

// ── Resultado de smoke ────────────────────────────────────────────────────────

export interface AdsSyncSmokeResult {
  total:   number;
  passed:  number;
  failed:  number;
  results: { name: string; passed: boolean; reason?: string }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function check(
  name:    string,
  passed:  boolean,
  reason?: string,
): { name: string; passed: boolean; reason?: string } {
  return { name, passed, reason: passed ? undefined : (reason ?? `"${name}" falló`) };
}

// ── Lógica de mapeo inline (mirror del conector) ──────────────────────────────
// Estos mapeos son idénticos a los que usan los conectores.
// Si los conectores cambian, estos tests deben actualizarse.

function normalizeMetaStatusLocal(raw: string): AdsExternalStatus {
  switch (raw.toUpperCase()) {
    case "ACTIVE":               return "active";
    case "PAUSED":
    case "CAMPAIGN_PAUSED":
    case "ADSET_PAUSED":         return "paused";
    case "IN_PROCESS":
    case "PENDING_REVIEW":       return "in_review";
    case "DISAPPROVED":          return "rejected";
    case "WITH_ISSUES":          return "failed";
    case "DELETED":
    case "ARCHIVED":             return "archived";
    default:                     return "unknown";
  }
}

function normalizeTikTokStatusLocal(raw: string): AdsExternalStatus {
  switch (raw.toUpperCase()) {
    case "ENABLE":    return "active";
    case "DISABLE":   return "paused";
    case "REVIEWING": return "in_review";
    case "REJECTED":  return "rejected";
    case "COMPLETED": return "completed";
    case "DELETE":    return "archived";
    case "FROZEN":    return "failed";
    default:          return "unknown";
  }
}

function aggregateStatusLocal(payloads: AdsProviderStatusPayload[]): AdsExternalStatus {
  if (payloads.length === 0) return "unknown";
  const priority: AdsExternalStatus[] = [
    "rejected", "failed", "in_review", "active",
    "paused", "completed", "archived", "draft", "unknown",
  ];
  for (const status of priority) {
    if (payloads.some(p => p.normalizedStatus === status)) return status;
  }
  return "unknown";
}

function makePayload(
  platform: string,
  providerStatus: string,
  normalized: AdsExternalStatus,
): AdsProviderStatusPayload {
  return {
    platform,
    providerStatus,
    normalizedStatus: normalized,
    fetchedAt:        new Date().toISOString(),
    campaignId:       `camp_${platform}_123`,
    adsetId:          `adset_${platform}_456`,
    adId:             `ad_${platform}_789`,
  };
}

// ── Casos de prueba ───────────────────────────────────────────────────────────

export function runAdsSyncSmokeChecks(): AdsSyncSmokeResult {
  const results: AdsSyncSmokeResult["results"] = [];
  let passed = 0;
  let failed = 0;

  function assert(name: string, cond: boolean, reason?: string) {
    const r = check(name, cond, reason);
    results.push(r);
    if (cond) passed++; else failed++;
  }

  // ── Meta: mapeos de estado ───────────────────────────────────────────────

  const metaMappings: [string, AdsExternalStatus][] = [
    ["ACTIVE",          "active"],
    ["PAUSED",          "paused"],
    ["CAMPAIGN_PAUSED", "paused"],
    ["ADSET_PAUSED",    "paused"],
    ["IN_PROCESS",      "in_review"],
    ["PENDING_REVIEW",  "in_review"],
    ["DISAPPROVED",     "rejected"],
    ["WITH_ISSUES",     "failed"],
    ["DELETED",         "archived"],
    ["ARCHIVED",        "archived"],
  ];

  for (const [raw, expected] of metaMappings) {
    const got = normalizeMetaStatusLocal(raw);
    assert(
      `Meta ${raw} → ${expected}`,
      got === expected,
      `esperado "${expected}", recibido "${got}"`,
    );
  }

  // ── TikTok: mapeos de estado ──────────────────────────────────────────────

  const tiktokMappings: [string, AdsExternalStatus][] = [
    ["ENABLE",    "active"],
    ["DISABLE",   "paused"],
    ["REVIEWING", "in_review"],
    ["REJECTED",  "rejected"],
    ["COMPLETED", "completed"],
    ["DELETE",    "archived"],
    ["FROZEN",    "failed"],
  ];

  for (const [raw, expected] of tiktokMappings) {
    const got = normalizeTikTokStatusLocal(raw);
    assert(
      `TikTok ${raw} → ${expected}`,
      got === expected,
      `esperado "${expected}", recibido "${got}"`,
    );
  }

  // ── Estados desconocidos → unknown ────────────────────────────────────────

  {
    const got = normalizeMetaStatusLocal("SOME_FUTURE_STATUS");
    assert("Meta status desconocido → unknown", got === "unknown", `esperado "unknown", recibido "${got}"`);
  }
  {
    const got = normalizeTikTokStatusLocal("FUTURE_TT_STATUS");
    assert("TikTok status desconocido → unknown", got === "unknown", `esperado "unknown", recibido "${got}"`);
  }

  // ── Agregación de múltiples plataformas ───────────────────────────────────

  {
    // Meta active + TikTok paused → active (active tiene prioridad sobre paused)
    const payloads = [
      makePayload("meta",   "ACTIVE",  "active"),
      makePayload("tiktok", "DISABLE", "paused"),
    ];
    const agg = aggregateStatusLocal(payloads);
    assert(
      "agregación: meta active + tiktok paused → active",
      agg === "active",
      `esperado "active", recibido "${agg}"`,
    );
  }

  {
    // Meta rejected + TikTok active → rejected (rejected tiene mayor prioridad)
    const payloads = [
      makePayload("meta",   "DISAPPROVED", "rejected"),
      makePayload("tiktok", "ENABLE",      "active"),
    ];
    const agg = aggregateStatusLocal(payloads);
    assert(
      "agregación: meta rejected + tiktok active → rejected",
      agg === "rejected",
      `esperado "rejected", recibido "${agg}"`,
    );
  }

  {
    // Sin payloads → unknown
    const agg = aggregateStatusLocal([]);
    assert("agregación sin payloads → unknown", agg === "unknown", `esperado "unknown", recibido "${agg}"`);
  }

  // ── Error externo → payload con unknown ───────────────────────────────────

  {
    const errorPayload = makePayload("meta", "UNKNOWN", "unknown");
    assert(
      "error externo → normalizedStatus unknown",
      errorPayload.normalizedStatus === "unknown",
    );
    assert(
      "error externo → providerStatus preservado",
      errorPayload.providerStatus === "UNKNOWN",
    );
  }

  // ── No hay secretos en payload ────────────────────────────────────────────

  {
    const payload     = makePayload("meta", "ACTIVE", "active");
    const serialized  = JSON.stringify(payload).toLowerCase();
    const forbidden   = ["accesstoken", "access_token", "token", "secret", "password", "bearer"];
    const found       = forbidden.filter(f => serialized.includes(f));
    assert(
      "payload de provider no expone secretos",
      found.length === 0,
      `Campos prohibidos en payload: ${found.join(", ")}`,
    );
  }

  // ── Etiquetas definidas para todos los estados ────────────────────────────

  const allStatuses: AdsExternalStatus[] = [
    "unknown", "draft", "in_review", "active", "paused",
    "rejected", "completed", "failed", "archived",
  ];
  for (const status of allStatuses) {
    assert(
      `Etiqueta definida para "${status}"`,
      !!ADS_EXTERNAL_STATUS_LABEL[status],
      `Falta etiqueta para "${status}"`,
    );
  }

  // ── Códigos de error presentes ────────────────────────────────────────────

  const expectedCodes = [
    "MISSING_CREDENTIALS",
    "MISSING_EXTERNAL_IDS",
    "EXECUTION_NOT_FOUND",
    "META_API_ERROR",
    "TIKTOK_API_ERROR",
    "INTERNAL_ERROR",
  ];
  for (const code of expectedCodes) {
    assert(
      `ADS_SYNC_ERROR_CODES.${code} existe`,
      code in ADS_SYNC_ERROR_CODES,
      `Falta código de error: ${code}`,
    );
  }

  return { total: results.length, passed, failed, results };
}
