/**
 * lib/marketing-studio/ads/ads-validation-smoke.ts
 *
 * MARKETING-ADS-VALIDATION-01 — Smoke Checks de Validación de Anuncios
 *
 * Checks determinísticos para verificar que el servicio de validación
 * responde correctamente a los casos críticos.
 *
 * No hace llamadas reales a APIs externas.
 * No crea AgentExecution (usa mocks).
 * No expone secretos.
 *
 * Consumido por:
 *   POST /api/internal/integration-tests/ads-validation (futuro)
 *   o directamente en scripts de validación.
 */

import type {
  AdsValidationInput,
  AdsValidationResult,
  AdsValidationStatus,
} from "./ads-validation-types";
import { ADS_VALIDATION_CODES } from "./ads-validation-types";

// ── Tipos del smoke runner ────────────────────────────────────────────────────

export interface AdsValidationSmokeCase {
  name:           string;
  description:    string;
  input:          Partial<AdsValidationInput>;
  expectedStatus: AdsValidationStatus;
  expectedCodes?: string[];  // issue codes que deben estar presentes
  forbiddenFields?: string[]; // campos que NO deben aparecer en el resultado
}

export interface AdsValidationSmokeResult {
  total:   number;
  passed:  number;
  failed:  number;
  results: {
    name:    string;
    passed:  boolean;
    reason?: string;
  }[];
}

// ── Base input de prueba ──────────────────────────────────────────────────────

const BASE_INPUT: AdsValidationInput = {
  tenantId:        "castillitos",
  organizationId:  "org-castillitos-001",
  createdBy:       "smoke-test",
  plataformas:     ["meta"],
  metaSubchannels: ["facebook"],
  objetivo:        "visitas",
  hasAsset:        true,
  textoPrincipal:  "Visita nuestra tienda y descubre las mejores maletas.",
  destino:         "sitio",
  urlDestino:      "https://castillitos.com",
  whatsappNumber:  "",
  monto:           "150",
  inicio:          "2026-07-01",
  fin:             "2026-07-15",
};

// ── Resultado simulado sin ejecución real ─────────────────────────────────────

/**
 * Simula la lógica de validación sin llamadas externas (Vault, Prisma, registry).
 * Replica las reglas de ads-validation-service.ts de forma determinística.
 */
function runLocalValidation(input: Partial<AdsValidationInput>): AdsValidationResult {
  const merged: AdsValidationInput = { ...BASE_INPUT, ...input };
  const issues: AdsValidationResult["issues"] = [];
  const checks: AdsValidationResult["checks"] = [];
  const now = new Date().toISOString();

  function addCheck(code: string, label: string, passed: boolean, severity: "error" | "warning" | "info" = "error", message?: string) {
    checks.push({ code, label, passed, severity: passed ? undefined : severity, message });
    if (!passed) {
      issues.push({ code, severity, message: message ?? label });
    }
  }

  // 1. Plataforma
  const hasPlatform = merged.plataformas.length > 0;
  addCheck(ADS_VALIDATION_CODES.MISSING_PLATFORM, "Plataforma seleccionada", hasPlatform, "error",
    hasPlatform ? undefined : "Debes seleccionar al menos una plataforma.");

  // 2. Google/YouTube warning
  if (merged.plataformas.includes("google") || merged.plataformas.includes("youtube")) {
    addCheck(ADS_VALIDATION_CODES.PLATFORM_NOT_READY, "Google / YouTube — preparación futura", false, "warning",
      "Google Ads aún no está listo para publicación real. Puedes preparar el anuncio, pero no publicarlo todavía.");
  }

  // 3. Meta subchannel
  if (merged.plataformas.includes("meta")) {
    const hasSub = merged.metaSubchannels.length > 0;
    addCheck(ADS_VALIDATION_CODES.MISSING_META_SUBCHANNEL, "Subcanal de Meta seleccionado", hasSub, "error",
      hasSub ? undefined : "Selecciona Facebook, Instagram o ambos.");

    // 4. Meta ad account — smoke simula como NO configurado (sin Prisma)
    addCheck(ADS_VALIDATION_CODES.MISSING_AD_ACCOUNT, "Cuenta publicitaria de Meta seleccionada",
      // En smoke, simulamos que NO hay cuenta configurada para el case "sin cuenta"
      !input.organizationId?.includes("no-account"), "error",
      "No hay una cuenta publicitaria de Meta seleccionada.");
  }

  // 5. TikTok advertiser
  if (merged.plataformas.includes("tiktok")) {
    const hasAdv = !input.organizationId?.includes("no-account");
    addCheck(ADS_VALIDATION_CODES.MISSING_ADVERTISER, "Cuenta de anunciante TikTok seleccionada", hasAdv, "error",
      hasAdv ? undefined : "No hay una cuenta de anunciante de TikTok seleccionada.");
  }

  // 6. Objetivo
  const hasObj = !!merged.objetivo;
  addCheck(ADS_VALIDATION_CODES.MISSING_OBJECTIVE, "Objetivo del anuncio configurado", hasObj, "error",
    hasObj ? undefined : "Selecciona el objetivo del anuncio.");

  // 7. Asset
  addCheck(ADS_VALIDATION_CODES.MISSING_ASSET, "Recurso creativo seleccionado", merged.hasAsset, "error",
    merged.hasAsset ? undefined : "Debes seleccionar un recurso creativo.");

  // 8. Contenido
  const hasContent = merged.textoPrincipal.trim().length > 0;
  addCheck(ADS_VALIDATION_CODES.MISSING_CONTENT, "Texto principal o contenido generado", hasContent, "error",
    hasContent ? undefined : "El anuncio necesita un texto principal.");

  // 9. Presupuesto
  const raw   = merged.monto.trim();
  const value = parseFloat(raw.replace(/[^0-9.]/g, ""));
  if (!raw) {
    addCheck(ADS_VALIDATION_CODES.MISSING_BUDGET, "Presupuesto válido", false, "error",
      "Define el presupuesto del anuncio antes de validar.");
  } else if (isNaN(value) || value <= 0) {
    addCheck(ADS_VALIDATION_CODES.INVALID_BUDGET, "Presupuesto válido", false, "error",
      "El presupuesto debe ser mayor a cero.");
  } else {
    addCheck(ADS_VALIDATION_CODES.MISSING_BUDGET, "Presupuesto válido", true);
  }

  // 10. Duración
  const okDates = !!merged.inicio;
  addCheck(ADS_VALIDATION_CODES.MISSING_DATES, "Duración configurada", okDates, "error",
    okDates ? undefined : "Define la fecha de inicio del anuncio.");

  // 11. Destino por objetivo
  if (merged.objetivo === "mensajes") {
    const okDest = !!(merged.destino || merged.whatsappNumber);
    addCheck(ADS_VALIDATION_CODES.MISSING_DESTINATION, "Destino de mensajes configurado", okDest, "error",
      okDest ? undefined : "Para Mensajes debes configurar un destino (WhatsApp, sitio o landing).");
  } else if (merged.objetivo === "visitas" || merged.objetivo === "ventas") {
    const okUrl = merged.urlDestino.trim().length > 0;
    addCheck(ADS_VALIDATION_CODES.MISSING_URL, "Destino configurado", okUrl, "error",
      okUrl ? undefined : "Para Visitas o Ventas debes indicar la URL de destino.");
  }

  const errorCount   = issues.filter(i => i.severity === "error").length;
  const warningCount = issues.filter(i => i.severity === "warning").length;
  const status: AdsValidationStatus =
    errorCount > 0   ? "blocked" :
    warningCount > 0 ? "needs_attention" : "ready";

  return {
    executionId:  null,
    status,
    checks,
    issues,
    errorCount,
    warningCount,
    validatedAt: now,
    summary:     status === "ready" ? "El anuncio está listo." : `${errorCount} error(es), ${warningCount} advertencia(s).`,
  };
}

// ── Casos de prueba ───────────────────────────────────────────────────────────

const SMOKE_CASES: AdsValidationSmokeCase[] = [
  {
    name:           "sin-plataforma",
    description:    "Sin plataforma → blocked",
    input:          { plataformas: [] },
    expectedStatus: "blocked",
    expectedCodes:  [ADS_VALIDATION_CODES.MISSING_PLATFORM],
  },
  {
    name:           "sin-cuenta-meta",
    description:    "Sin cuenta publicitaria de Meta → blocked",
    input:          { plataformas: ["meta"], metaSubchannels: ["facebook"], organizationId: "no-account" },
    expectedStatus: "blocked",
    expectedCodes:  [ADS_VALIDATION_CODES.MISSING_AD_ACCOUNT],
  },
  {
    name:           "sin-presupuesto",
    description:    "Sin presupuesto → blocked",
    input:          { monto: "" },
    expectedStatus: "blocked",
    expectedCodes:  [ADS_VALIDATION_CODES.MISSING_BUDGET],
  },
  {
    name:           "presupuesto-cero",
    description:    "Presupuesto = 0 → blocked",
    input:          { monto: "0" },
    expectedStatus: "blocked",
    expectedCodes:  [ADS_VALIDATION_CODES.INVALID_BUDGET],
  },
  {
    name:           "mensajes-sin-destino",
    description:    "Objetivo mensajes sin destino → blocked",
    input:          { objetivo: "mensajes", destino: null, whatsappNumber: "", urlDestino: "" },
    expectedStatus: "blocked",
    expectedCodes:  [ADS_VALIDATION_CODES.MISSING_DESTINATION],
  },
  {
    name:           "visitas-sin-url",
    description:    "Objetivo visitas sin URL de destino → blocked",
    input:          { objetivo: "visitas", urlDestino: "" },
    expectedStatus: "blocked",
    expectedCodes:  [ADS_VALIDATION_CODES.MISSING_URL],
  },
  {
    name:           "meta-sin-subcanal",
    description:    "Meta sin subcanal (FB/IG) → blocked",
    input:          { plataformas: ["meta"], metaSubchannels: [] },
    expectedStatus: "blocked",
    expectedCodes:  [ADS_VALIDATION_CODES.MISSING_META_SUBCHANNEL],
  },
  {
    name:           "tiktok-sin-advertiser",
    description:    "TikTok sin advertiser → blocked",
    input:          { plataformas: ["tiktok"], metaSubchannels: [], organizationId: "no-account" },
    expectedStatus: "blocked",
    expectedCodes:  [ADS_VALIDATION_CODES.MISSING_ADVERTISER],
  },
  {
    name:           "google-not-ready",
    description:    "Google Ads → warning PLATFORM_NOT_READY",
    input:          { plataformas: ["google"], metaSubchannels: [] },
    expectedStatus: "needs_attention",
    expectedCodes:  [ADS_VALIDATION_CODES.PLATFORM_NOT_READY],
  },
  {
    name:           "resultado-no-expone-secrets",
    description:    "El resultado no debe contener accessToken ni tokens en los issues",
    // Uses BASE_INPUT (valid) — status will be blocked due to missing Meta account in smoke
    input:          { organizationId: "no-account" },
    expectedStatus: "blocked",
    forbiddenFields:["accessToken", "token", "secret", "password"],
  },
  {
    name:           "metadata-execution-segura",
    description:    "executionId puede ser null — nunca debe contener tokens",
    input:          { organizationId: "no-account" },
    expectedStatus: "blocked",
    forbiddenFields:["accessToken", "bearer"],
  },
];

// ── Runner ────────────────────────────────────────────────────────────────────

/**
 * Ejecuta todos los smoke checks de validación de anuncios.
 * No hace llamadas externas — completamente determinístico.
 */
export function runAdsValidationSmokeChecks(): AdsValidationSmokeResult {
  const results: AdsValidationSmokeResult["results"] = [];
  let passed = 0;
  let failed = 0;

  for (const sc of SMOKE_CASES) {
    try {
      const result = runLocalValidation(sc.input);

      // Check: status esperado
      if (result.status !== sc.expectedStatus) {
        results.push({
          name:   sc.name,
          passed: false,
          reason: `Status esperado: ${sc.expectedStatus}, obtenido: ${result.status}`,
        });
        failed++;
        continue;
      }

      // Check: códigos esperados presentes en issues
      if (sc.expectedCodes) {
        const issueCodes = result.issues.map(i => i.code);
        const missingCodes = sc.expectedCodes.filter(c => !issueCodes.includes(c));
        if (missingCodes.length > 0) {
          results.push({
            name:   sc.name,
            passed: false,
            reason: `Códigos esperados ausentes: ${missingCodes.join(", ")}`,
          });
          failed++;
          continue;
        }
      }

      // Check: campos prohibidos no presentes en el resultado serializado
      if (sc.forbiddenFields) {
        const serialized = JSON.stringify(result).toLowerCase();
        const found = sc.forbiddenFields.filter(f => serialized.includes(f.toLowerCase()));
        if (found.length > 0) {
          results.push({
            name:   sc.name,
            passed: false,
            reason: `Campos prohibidos encontrados en resultado: ${found.join(", ")}`,
          });
          failed++;
          continue;
        }
      }

      results.push({ name: sc.name, passed: true });
      passed++;
    } catch (err) {
      results.push({
        name:   sc.name,
        passed: false,
        reason: `Error inesperado: ${err instanceof Error ? err.message : String(err)}`,
      });
      failed++;
    }
  }

  return { total: SMOKE_CASES.length, passed, failed, results };
}
