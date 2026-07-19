/**
 * lib/marketing-studio/ads/ads-execution-smoke.ts
 *
 * MARKETING-ADS-EXECUTION-01 — Smoke Checks del Ejecutor de Anuncios
 *
 * Checks determinísticos sin llamadas externas (no Prisma, no Meta, no TikTok).
 * Valida la lógica de snapshots, hashes de versión y estructura de resultados.
 */

import {
  computeApprovalVersion,
  ADS_EXECUTION_ERROR_CODES,
} from "./ads-execution-types";
import type {
  ApprovedExecutionSnapshot,
  AdsExecutionResult,
  AdsExecutionPlatformResult,
} from "./ads-execution-types";

// ── Resultado de smoke ────────────────────────────────────────────────────────

export interface AdsExecutionSmokeResult {
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

// ── Snapshot de prueba ────────────────────────────────────────────────────────

const BASE_FIELDS = {
  plataformas:    ["meta"] as string[],
  objetivo:       "mensajes",
  monto:          "100",
  moneda:         "USD",
  tipoPres:       "diario",
  inicio:         "2026-08-01",
  fin:            "2026-08-15",
  textoPrincipal: "¡Descubre nuestros productos!",
  urlDestino:     "https://tienda.ejemplo.com",
  destino:        "sitio" as string | null,
};

function buildSnapshot(overrides: Partial<ApprovedExecutionSnapshot> = {}): ApprovedExecutionSnapshot {
  return {
    approvalVersion:        computeApprovalVersion(BASE_FIELDS),
    snapshotAt:             "2026-08-01T00:00:00.000Z",
    plataformas:            BASE_FIELDS.plataformas,
    metaSubchannels:        ["facebook", "instagram"],
    objetivo:               BASE_FIELDS.objetivo,
    assets:                 [{ id: "asset-1", source: "biblioteca", label: "Imagen principal" }],
    textoPrincipal:         BASE_FIELDS.textoPrincipal,
    cta:                    "Comprar ahora",
    hashtags:               "#oferta #nuevo",
    destino:                BASE_FIELDS.destino,
    urlDestino:             BASE_FIELDS.urlDestino,
    whatsappNumber:         "",
    pais:                   "CO",
    ciudad:                 "Bogotá",
    edadMin:                "18",
    edadMax:                "55",
    intereses:              "moda, accesorios",
    publico:                "audience-1",
    monto:                  BASE_FIELDS.monto,
    moneda:                 BASE_FIELDS.moneda,
    tipoPres:               "diario",
    inicio:                 BASE_FIELDS.inicio,
    fin:                    BASE_FIELDS.fin,
    metaAdAccountId:        "act_123456",
    metaAdAccountName:      "Cuenta Principal",
    metaPageId:             "page_789",
    metaPageName:           "Mi Página",
    metaInstagramAccountId: "ig_456",
    tiktokAdvertiserId:     null,
    tiktokAdvertiserName:   null,
    ...overrides,
  };
}

// ── Simulación de checks del ejecutor (sin DB) ────────────────────────────────

function simulateSnapshotCheck(
  status:   string,
  snapshot: ApprovedExecutionSnapshot | undefined | null,
): { ok: boolean; errorCode?: string } {
  if (status !== "approved") {
    return { ok: false, errorCode: ADS_EXECUTION_ERROR_CODES.NOT_APPROVED };
  }
  if (!snapshot || !snapshot.approvalVersion || !snapshot.plataformas) {
    return { ok: false, errorCode: ADS_EXECUTION_ERROR_CODES.MISSING_SNAPSHOT };
  }
  return { ok: true };
}

function simulateExecution(
  snapshot:         ApprovedExecutionSnapshot,
  metaSuccess:      boolean,
  tiktokSuccess:    boolean,
): AdsExecutionResult {
  const platformResults: AdsExecutionPlatformResult[] = [];

  for (const platform of snapshot.plataformas) {
    if (platform === "meta") {
      platformResults.push(
        metaSuccess
          ? { platform: "meta",   success: true,  campaignId: "camp_meta_123", adsetId: "adset_456", adId: "ad_789", creativeId: "cre_012" }
          : { platform: "meta",   success: false, errorCode: ADS_EXECUTION_ERROR_CODES.META_API_ERROR, errorMessage: "Meta API unavailable" },
      );
    }
    if (platform === "tiktok") {
      platformResults.push(
        tiktokSuccess
          ? { platform: "tiktok", success: true,  campaignId: "camp_tt_123", adsetId: "adgroup_456", adId: "ad_tt_789" }
          : { platform: "tiktok", success: false, errorCode: ADS_EXECUTION_ERROR_CODES.TIKTOK_API_ERROR, errorMessage: "TikTok API unavailable" },
      );
    }
  }

  const succeeded = platformResults.filter(r => r.success);
  const failed    = platformResults.filter(r => !r.success);
  const allFailed  = failed.length === platformResults.length;
  const allSuccess = succeeded.length === platformResults.length;

  const status: AdsExecutionResult["status"] =
    allSuccess ? "completed" :
    allFailed  ? "failed"    : "partial";

  const externalReferenceIds: Record<string, string> = {};
  for (const r of platformResults) {
    if (r.success) {
      if (r.platform === "meta")   { if (r.campaignId) externalReferenceIds["meta_campaign_id"] = r.campaignId; }
      if (r.platform === "tiktok") { if (r.campaignId) externalReferenceIds["tiktok_campaign_id"] = r.campaignId; }
    }
  }

  return {
    executionId:          "exec-smoke-1",
    status,
    platformResults,
    externalReferenceIds,
    summary:              status === "completed" ? "Campaña creada en PAUSA." : "Falló la publicación.",
    executedAt:           new Date().toISOString(),
    errorCode:            allFailed ? (failed[0]?.errorCode ?? ADS_EXECUTION_ERROR_CODES.INTERNAL_ERROR) : undefined,
    errorMessage:         allFailed ? failed.map(r => r.errorMessage).filter(Boolean).join("; ") : undefined,
  };
}

// ── Casos de prueba ───────────────────────────────────────────────────────────

export function runAdsExecutionSmokeChecks(): AdsExecutionSmokeResult {
  const results: AdsExecutionSmokeResult["results"] = [];
  let passed = 0;
  let failed = 0;

  function assert(name: string, cond: boolean, reason?: string) {
    const r = check(name, cond, reason);
    results.push(r);
    if (cond) passed++; else failed++;
  }

  // ── 1. Approved sin snapshot → bloqueado ────────────────────────────────
  {
    const r = simulateSnapshotCheck("approved", null);
    assert(
      "approved sin snapshot → MISSING_SNAPSHOT",
      !r.ok && r.errorCode === ADS_EXECUTION_ERROR_CODES.MISSING_SNAPSHOT,
      `esperado MISSING_SNAPSHOT, recibido: ok=${r.ok} errorCode=${r.errorCode}`,
    );
  }

  // ── 2. Approved con snapshot válido → permitido ──────────────────────────
  {
    const snapshot = buildSnapshot();
    const r = simulateSnapshotCheck("approved", snapshot);
    assert(
      "approved con snapshot válido → ok",
      r.ok && !r.errorCode,
      `esperado ok=true, recibido: ok=${r.ok} errorCode=${r.errorCode}`,
    );
  }

  // ── 3. Estado no-approved → bloqueado ────────────────────────────────────
  {
    const snapshot = buildSnapshot();
    for (const status of ["pending", "validating", "awaiting_approval", "executing", "completed", "failed", "cancelled"] as const) {
      const r = simulateSnapshotCheck(status, snapshot);
      assert(
        `estado "${status}" → NOT_APPROVED`,
        !r.ok && r.errorCode === ADS_EXECUTION_ERROR_CODES.NOT_APPROVED,
        `esperado NOT_APPROVED para status=${status}`,
      );
    }
  }

  // ── 4. Modificación posterior → invalida aprobación ─────────────────────
  {
    const originalHash = computeApprovalVersion(BASE_FIELDS);
    const modifiedHash = computeApprovalVersion({ ...BASE_FIELDS, monto: "999" });
    assert(
      "modificar monto cambia el hash → invalidación detectada",
      originalHash !== modifiedHash,
      "El hash debe cambiar si el monto cambia",
    );

    const unchangedHash = computeApprovalVersion(BASE_FIELDS);
    assert(
      "mismo borrador → mismo hash (determinístico)",
      originalHash === unchangedHash,
      "El hash debe ser determinístico para el mismo borrador",
    );
  }

  // ── 5. Execution completada guarda IDs externos ──────────────────────────
  {
    const snapshot = buildSnapshot();
    const result   = simulateExecution(snapshot, true, false);
    assert(
      "execution completada → status completed",
      result.status === "completed",
      `esperado completed, recibido: ${result.status}`,
    );
    assert(
      "execution completada → meta_campaign_id en externalReferenceIds",
      !!result.externalReferenceIds["meta_campaign_id"],
      "Falta meta_campaign_id en externalReferenceIds",
    );
    assert(
      "execution completada → executionId presente",
      !!result.executionId,
      "Falta executionId en resultado",
    );
    assert(
      "execution completada → executedAt presente",
      !!result.executedAt,
      "Falta executedAt en resultado",
    );
  }

  // ── 6. Execution fallida registra error ─────────────────────────────────
  {
    const snapshot = buildSnapshot({ plataformas: ["meta"] });
    const result   = simulateExecution(snapshot, false, false);
    assert(
      "execution fallida → status failed",
      result.status === "failed",
      `esperado failed, recibido: ${result.status}`,
    );
    assert(
      "execution fallida → errorCode presente",
      !!result.errorCode,
      "Falta errorCode en resultado fallido",
    );
    assert(
      "execution fallida → errorMessage no vacío",
      !!result.errorMessage,
      "Falta errorMessage en resultado fallido",
    );
    assert(
      "execution fallida → externalReferenceIds vacío",
      Object.keys(result.externalReferenceIds).length === 0,
      "No deben registrarse IDs externos en ejecución fallida",
    );
  }

  // ── 7. Ningún secreto en snapshot ────────────────────────────────────────
  {
    const snapshot   = buildSnapshot();
    const serialized = JSON.stringify(snapshot).toLowerCase();
    const forbidden  = ["accesstoken", "access_token", "token", "secret", "password", "bearer", "apikey", "api_key"];
    const found      = forbidden.filter(f => serialized.includes(f));
    assert(
      "snapshot no expone secretos ni tokens",
      found.length === 0,
      `Campos prohibidos encontrados en snapshot: ${found.join(", ")}`,
    );
  }

  // ── 8. Ejecución parcial (una plataforma falla) ──────────────────────────
  {
    const snapshot = buildSnapshot({ plataformas: ["meta", "tiktok"] });
    const result   = simulateExecution(snapshot, true, false);
    assert(
      "ejecución parcial → status partial",
      result.status === "partial",
      `esperado partial, recibido: ${result.status}`,
    );
    assert(
      "ejecución parcial → meta_campaign_id presente",
      !!result.externalReferenceIds["meta_campaign_id"],
      "Falta meta_campaign_id en ejecución parcial",
    );
    assert(
      "ejecución parcial → tiktok_campaign_id ausente",
      !result.externalReferenceIds["tiktok_campaign_id"],
      "tiktok_campaign_id no debe estar en ejecución parcial si TikTok falló",
    );
  }

  return { total: results.length, passed, failed, results };
}
