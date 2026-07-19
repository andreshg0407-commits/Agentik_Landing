/**
 * lib/marketing-studio/ads/ads-validation-service.ts
 *
 * MARKETING-ADS-VALIDATION-01 — Servicio de Validación Previa de Anuncios
 * SERVER ONLY — @server-only
 *
 * Responsabilidad:
 *   - Validar un borrador de anuncio antes de enviarlo a aprobación.
 *   - Registrar cada validación en el Execution Registry (AgentExecution).
 *   - Nunca publicar, crear campañas ni gastar dinero.
 *   - Nunca guardar tokens ni secretos en el resultado.
 *   - Devolver resultado serializable seguro para el cliente.
 *
 * Flujo:
 *   1. Crear AgentExecution con status "validating".
 *   2. Ejecutar checks determinísticos en orden.
 *   3. Si todo pasa → completeExecution con status "ready".
 *   4. Si hay errors → completeExecution con status "blocked".
 *   5. Si solo warnings → completeExecution con status "needs_attention".
 *
 * Integra:
 *   - Execution Registry (createExecution, completeExecution, failExecution)
 *   - Ads Vault (resolveMetaAdsCredentials, resolveTikTokAdsCredentials)
 *   - Ads Accounts Config (getAdsAccountsConfigForPlatform)
 */
import "server-only";

import {
  createExecution,
  completeExecution,
  failExecution,
}                                          from "@/lib/execution/execution-registry";
import { markReadyForApproval }            from "@/lib/approval/approval-service";
import {
  resolveMetaAdsCredentials,
  resolveTikTokAdsCredentials,
}                                          from "./ads-vault";
import { getAdsAccountsConfigForPlatform } from "./ads-accounts-config-service";
import {
  ADS_VALIDATION_CODES,
}                                          from "./ads-validation-types";
import type {
  AdsValidationInput,
  AdsValidationResult,
  AdsValidationCheck,
  AdsValidationIssue,
  AdsValidationStatus,
  AdsValidationSeverity,
} from "./ads-validation-types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCheck(
  code:    string,
  label:   string,
  passed:  boolean,
  opts?: {
    severity?: AdsValidationSeverity;
    message?:  string;
    field?:    string;
  },
): { check: AdsValidationCheck; issue: AdsValidationIssue | null } {
  const check: AdsValidationCheck = {
    code,
    label,
    passed,
    severity: passed ? undefined : (opts?.severity ?? "error"),
    message:  opts?.message,
  };

  const issue: AdsValidationIssue | null = passed
    ? null
    : {
        code,
        severity: opts?.severity ?? "error",
        message:  opts?.message ?? label,
        field:    opts?.field,
      };

  return { check, issue };
}

function deriveStatus(checks: AdsValidationCheck[]): AdsValidationStatus {
  const hasError   = checks.some(c => !c.passed && c.severity === "error");
  const hasWarning = checks.some(c => !c.passed && c.severity === "warning");

  if (hasError)   return "blocked";
  if (hasWarning) return "needs_attention";
  return "ready";
}

function deriveSummary(status: AdsValidationStatus, errorCount: number, warningCount: number): string {
  if (status === "ready")           return "El anuncio está listo para enviar a revisión.";
  if (status === "needs_attention") return `El anuncio tiene ${warningCount} advertencia${warningCount !== 1 ? "s" : ""} que puedes corregir antes de enviarlo.`;
  return `El anuncio tiene ${errorCount} error${errorCount !== 1 ? "es" : ""} que impiden continuar. Corrígelos antes de intentar de nuevo.`;
}

const PLATFORM_LABELS: Record<string, string> = {
  meta:    "Meta (Facebook / Instagram)",
  tiktok:  "TikTok",
  google:  "Google",
  youtube: "YouTube",
};

// ── Validaciones individuales ─────────────────────────────────────────────────

async function checkPlatformSelected(
  input: AdsValidationInput,
): Promise<{ check: AdsValidationCheck; issue: AdsValidationIssue | null }> {
  const hasPlatform = input.plataformas.length > 0;
  return makeCheck(
    ADS_VALIDATION_CODES.MISSING_PLATFORM,
    "Plataforma seleccionada",
    hasPlatform,
    hasPlatform ? undefined : {
      severity: "error",
      message:  "Debes seleccionar al menos una plataforma para continuar.",
      field:    "plataformas",
    },
  );
}

async function checkGoogleYouTubeWarning(
  input: AdsValidationInput,
): Promise<{ check: AdsValidationCheck; issue: AdsValidationIssue | null } | null> {
  const hasGoogle  = input.plataformas.includes("google");
  const hasYoutube = input.plataformas.includes("youtube");

  if (!hasGoogle && !hasYoutube) return null;

  const label = [hasGoogle && "Google", hasYoutube && "YouTube"].filter(Boolean).join(" / ");

  return makeCheck(
    ADS_VALIDATION_CODES.PLATFORM_NOT_READY,
    `${label} — preparación futura`,
    false,
    {
      severity: "warning",
      message:  `${label} aún no está listo para publicación real. Puedes preparar el anuncio, pero no publicarlo todavía.`,
      field:    "plataformas",
    },
  );
}

async function checkMetaSubchannel(
  input: AdsValidationInput,
): Promise<{ check: AdsValidationCheck; issue: AdsValidationIssue | null } | null> {
  if (!input.plataformas.includes("meta")) return null;

  const hasSubchannel = input.metaSubchannels.length > 0;
  return makeCheck(
    ADS_VALIDATION_CODES.MISSING_META_SUBCHANNEL,
    "Subcanal de Meta seleccionado",
    hasSubchannel,
    hasSubchannel ? undefined : {
      severity: "error",
      message:  "Selecciona Facebook, Instagram o ambos para continuar con Meta.",
      field:    "metaSubchannels",
    },
  );
}

async function checkMetaAdAccount(
  input: AdsValidationInput,
): Promise<{ check: AdsValidationCheck; issue: AdsValidationIssue | null } | null> {
  if (!input.plataformas.includes("meta")) return null;

  const config = await getAdsAccountsConfigForPlatform(input.organizationId, "meta");
  const hasAccount = !!config?.selectedAdAccountId;

  return makeCheck(
    ADS_VALIDATION_CODES.MISSING_AD_ACCOUNT,
    "Cuenta publicitaria de Meta seleccionada",
    hasAccount,
    hasAccount ? undefined : {
      severity: "error",
      message:  "No hay una cuenta publicitaria de Meta seleccionada. Configúrala en la sección de cuentas.",
      field:    "meta_account",
    },
  );
}

async function checkMetaFacebookPage(
  input: AdsValidationInput,
): Promise<{ check: AdsValidationCheck; issue: AdsValidationIssue | null } | null> {
  if (!input.plataformas.includes("meta")) return null;
  if (!input.metaSubchannels.includes("facebook")) return null;

  const config = await getAdsAccountsConfigForPlatform(input.organizationId, "meta");
  const hasPage = !!config?.selectedPageId;

  return makeCheck(
    ADS_VALIDATION_CODES.MISSING_FACEBOOK_PAGE,
    "Página de Facebook asociada",
    hasPage,
    hasPage ? undefined : {
      severity: "warning",
      message:  "Se recomienda tener una Página de Facebook seleccionada para anuncios en Facebook.",
      field:    "meta_page",
    },
  );
}

async function checkMetaInstagramProfile(
  input: AdsValidationInput,
): Promise<{ check: AdsValidationCheck; issue: AdsValidationIssue | null } | null> {
  if (!input.plataformas.includes("meta")) return null;
  if (!input.metaSubchannels.includes("instagram")) return null;

  const config = await getAdsAccountsConfigForPlatform(input.organizationId, "meta");
  const hasIg  = !!config?.selectedInstagramAccountId;

  return makeCheck(
    ADS_VALIDATION_CODES.MISSING_INSTAGRAM_PROFILE,
    "Perfil de Instagram asociado",
    hasIg,
    hasIg ? undefined : {
      severity: "warning",
      message:  "Se recomienda tener un perfil de Instagram seleccionado para anuncios en Instagram.",
      field:    "meta_instagram",
    },
  );
}

async function checkTikTokAdvertiser(
  input: AdsValidationInput,
): Promise<{ check: AdsValidationCheck; issue: AdsValidationIssue | null } | null> {
  if (!input.plataformas.includes("tiktok")) return null;

  const config = await getAdsAccountsConfigForPlatform(input.organizationId, "tiktok");
  const hasAdv = !!config?.selectedAdvertiserId;

  return makeCheck(
    ADS_VALIDATION_CODES.MISSING_ADVERTISER,
    "Cuenta de anunciante TikTok seleccionada",
    hasAdv,
    hasAdv ? undefined : {
      severity: "error",
      message:  "No hay una cuenta de anunciante de TikTok seleccionada. Configúrala en la sección de cuentas.",
      field:    "tiktok_advertiser",
    },
  );
}

async function checkMetaCredentials(
  input: AdsValidationInput,
): Promise<{ check: AdsValidationCheck; issue: AdsValidationIssue | null } | null> {
  if (!input.plataformas.includes("meta")) return null;

  const creds = await resolveMetaAdsCredentials(input.tenantId);

  if (creds.source === "NOT_CONFIGURED") {
    return makeCheck(
      ADS_VALIDATION_CODES.CREDENTIALS_UNAVAILABLE,
      "Credenciales de Meta disponibles",
      false,
      {
        severity: "error",
        message:  "No se encontraron credenciales de Meta. Configúralas en Conexiones antes de continuar.",
        field:    "meta_credentials",
      },
    );
  }

  if (creds.source === "ENV_DEV_FALLBACK") {
    return makeCheck(
      ADS_VALIDATION_CODES.CREDENTIALS_ENV_ONLY,
      "Credenciales de Meta disponibles",
      true,
      {
        severity: "warning",
        message:  "Las credenciales de Meta se están leyendo del entorno de desarrollo. En producción usa la Bóveda.",
        field:    "meta_credentials",
      },
    );
  }

  // VAULT — OK
  return makeCheck(
    ADS_VALIDATION_CODES.CREDENTIALS_UNAVAILABLE,
    "Credenciales de Meta disponibles",
    true,
  );
}

async function checkTikTokCredentials(
  input: AdsValidationInput,
): Promise<{ check: AdsValidationCheck; issue: AdsValidationIssue | null } | null> {
  if (!input.plataformas.includes("tiktok")) return null;

  const creds = await resolveTikTokAdsCredentials(input.tenantId);

  if (creds.source === "NOT_CONFIGURED") {
    return makeCheck(
      ADS_VALIDATION_CODES.CREDENTIALS_UNAVAILABLE,
      "Credenciales de TikTok disponibles",
      false,
      {
        severity: "error",
        message:  "No se encontraron credenciales de TikTok. Configúralas en Conexiones antes de continuar.",
        field:    "tiktok_credentials",
      },
    );
  }

  if (creds.source === "ENV_DEV_FALLBACK") {
    return makeCheck(
      ADS_VALIDATION_CODES.CREDENTIALS_ENV_ONLY,
      "Credenciales de TikTok disponibles",
      true,
      {
        severity: "warning",
        message:  "Las credenciales de TikTok se están leyendo del entorno de desarrollo. En producción usa la Bóveda.",
        field:    "tiktok_credentials",
      },
    );
  }

  return makeCheck(
    ADS_VALIDATION_CODES.CREDENTIALS_UNAVAILABLE,
    "Credenciales de TikTok disponibles",
    true,
  );
}

function checkObjective(
  input: AdsValidationInput,
): { check: AdsValidationCheck; issue: AdsValidationIssue | null } {
  const has = !!input.objetivo;
  return makeCheck(
    ADS_VALIDATION_CODES.MISSING_OBJECTIVE,
    "Objetivo del anuncio configurado",
    has,
    has ? undefined : {
      severity: "error",
      message:  "Selecciona el objetivo del anuncio antes de validar.",
      field:    "objetivo",
    },
  );
}

function checkAsset(
  input: AdsValidationInput,
): { check: AdsValidationCheck; issue: AdsValidationIssue | null } {
  const has = input.hasAsset;
  return makeCheck(
    ADS_VALIDATION_CODES.MISSING_ASSET,
    "Recurso creativo seleccionado",
    has,
    has ? undefined : {
      severity: "error",
      message:  "Debes seleccionar un recurso creativo (imagen o video) para el anuncio.",
      field:    "assets",
    },
  );
}

function checkContent(
  input: AdsValidationInput,
): { check: AdsValidationCheck; issue: AdsValidationIssue | null } {
  const has = input.textoPrincipal.trim().length > 0;
  return makeCheck(
    ADS_VALIDATION_CODES.MISSING_CONTENT,
    "Texto principal o contenido generado",
    has,
    has ? undefined : {
      severity: "error",
      message:  "El anuncio necesita un texto principal antes de enviarse a revisión.",
      field:    "textoPrincipal",
    },
  );
}

function checkBudget(
  input: AdsValidationInput,
): { check: AdsValidationCheck; issue: AdsValidationIssue | null } {
  const raw   = input.monto.trim();
  const value = parseFloat(raw.replace(/[^0-9.]/g, ""));

  if (!raw) {
    return makeCheck(ADS_VALIDATION_CODES.MISSING_BUDGET, "Presupuesto válido", false, {
      severity: "error",
      message:  "Define el presupuesto del anuncio antes de validar.",
      field:    "monto",
    });
  }

  if (isNaN(value) || value <= 0) {
    return makeCheck(ADS_VALIDATION_CODES.INVALID_BUDGET, "Presupuesto válido", false, {
      severity: "error",
      message:  "El presupuesto debe ser mayor a cero.",
      field:    "monto",
    });
  }

  return makeCheck(ADS_VALIDATION_CODES.MISSING_BUDGET, "Presupuesto válido", true);
}

function checkDates(
  input: AdsValidationInput,
): { check: AdsValidationCheck; issue: AdsValidationIssue | null } {
  const hasInicio = !!input.inicio;
  const hasFin    = !!input.fin;

  if (!hasInicio) {
    return makeCheck(ADS_VALIDATION_CODES.MISSING_DATES, "Duración configurada", false, {
      severity: "error",
      message:  "Define la fecha de inicio del anuncio.",
      field:    "inicio",
    });
  }

  if (!hasFin) {
    return makeCheck(ADS_VALIDATION_CODES.MISSING_DATES, "Duración configurada", false, {
      severity: "warning",
      message:  "Se recomienda definir una fecha de fin para controlar el gasto.",
      field:    "fin",
    });
  }

  const start = new Date(input.inicio);
  const end   = new Date(input.fin);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return makeCheck(ADS_VALIDATION_CODES.INVALID_DATES, "Duración configurada", false, {
      severity: "error",
      message:  "Las fechas del anuncio no son válidas.",
      field:    "inicio",
    });
  }

  if (end <= start) {
    return makeCheck(ADS_VALIDATION_CODES.INVALID_DATES, "Duración configurada", false, {
      severity: "error",
      message:  "La fecha de fin debe ser posterior a la fecha de inicio.",
      field:    "fin",
    });
  }

  return makeCheck(ADS_VALIDATION_CODES.MISSING_DATES, "Duración configurada", true);
}

function checkDestination(
  input: AdsValidationInput,
): { check: AdsValidationCheck; issue: AdsValidationIssue | null } | null {
  const obj = input.objetivo;
  if (!obj) return null;

  // Objetivos que requieren destino configurado
  const needsDest = ["mensajes", "visitas", "ventas"].includes(obj);
  if (!needsDest) return null;

  if (obj === "mensajes") {
    const ok = !!(input.destino || input.whatsappNumber);
    return makeCheck(ADS_VALIDATION_CODES.MISSING_DESTINATION, "Destino de mensajes configurado", ok, ok ? undefined : {
      severity: "error",
      message:  "Para el objetivo Mensajes debes configurar un destino (WhatsApp, sitio o landing).",
      field:    "destino",
    });
  }

  // Visitas / Ventas → necesita URL
  const hasUrl = input.urlDestino.trim().length > 0;
  return makeCheck(ADS_VALIDATION_CODES.MISSING_URL, "Destino configurado", hasUrl, hasUrl ? undefined : {
    severity: "error",
    message:  "Para el objetivo Visitas o Ventas debes indicar la URL de destino.",
    field:    "urlDestino",
  });
}

// ── Función principal ─────────────────────────────────────────────────────────

/**
 * Valida un borrador de anuncio antes de enviarlo a aprobación.
 *
 * - Crea un AgentExecution en el Execution Registry.
 * - Ejecuta checks determinísticos.
 * - Completa o falla el execution según resultado.
 * - Devuelve resultado serializable — seguro para el cliente.
 * - Nunca publica ni ejecuta anuncios.
 * - Nunca expone tokens ni secretos.
 */
export async function validateAdDraft(
  input: AdsValidationInput,
): Promise<AdsValidationResult> {
  const validatedAt = new Date().toISOString();

  // ── 1. Crear execution en el registry ─────────────────────────────────────

  const platformLabel = input.plataformas
    .map(p => PLATFORM_LABELS[p] ?? p)
    .join(", ");

  const execution = await createExecution({
    tenantId:  input.tenantId,
    module:    "ads",
    provider:  "ads",
    operation: "VALIDATE_AD",
    intent:    "Validar anuncio antes de publicación",
    createdBy: input.createdBy,
    metadata: {
      plataformas: input.plataformas,
      objetivo:    input.objetivo,
      presupuesto: input.monto,
      inicio:      input.inicio,
      fin:         input.fin,
    },
  });

  const executionId = execution?.id ?? null;

  // ── 2. Ejecutar checks ─────────────────────────────────────────────────────

  try {
    // Los checks asíncronos de cuentas y credenciales se pueden paralelizar
    // por plataforma, pero se ejecutan secuencialmente para simplicidad y
    // legibilidad del checklist ordenado.

    const rawResults = await Promise.all([
      checkPlatformSelected(input),
      checkGoogleYouTubeWarning(input),
      checkMetaSubchannel(input),
      checkMetaAdAccount(input),
      checkMetaFacebookPage(input),
      checkMetaInstagramProfile(input),
      checkTikTokAdvertiser(input),
      checkMetaCredentials(input),
      checkTikTokCredentials(input),
      Promise.resolve(checkObjective(input)),
      Promise.resolve(checkAsset(input)),
      Promise.resolve(checkContent(input)),
      Promise.resolve(checkBudget(input)),
      Promise.resolve(checkDates(input)),
      Promise.resolve(checkDestination(input)),
    ]);

    // Filtrar nulls (checks omitidos porque la plataforma no aplica)
    const results = rawResults.filter((r): r is NonNullable<typeof r> => r !== null);

    const checks: AdsValidationCheck[]  = results.map(r => r.check);
    const issues: AdsValidationIssue[]  = results.map(r => r.issue).filter((i): i is AdsValidationIssue => i !== null);

    const errorCount   = issues.filter(i => i.severity === "error").length;
    const warningCount = issues.filter(i => i.severity === "warning").length;
    const status       = deriveStatus(checks);
    const summary      = deriveSummary(status, errorCount, warningCount);

    // ── 3. Actualizar execution ──────────────────────────────────────────────

    if (executionId) {
      const validationMeta = {
        validationStatus: status,
        errorCount,
        warningCount,
        checksCount:  checks.length,
        issuesCount:  issues.length,
        plataformas:  input.plataformas,
        objetivo:     input.objetivo,
        presupuesto:  input.monto,
        inicio:       input.inicio,
        fin:          input.fin,
      };

      if (status === "blocked") {
        // Errores de validación → falla el registro para auditoría
        await failExecution(executionId, input.tenantId, {
          errorCode:    "VALIDATION_FAILED",
          errorMessage: `${errorCount} error${errorCount !== 1 ? "es" : ""} de validación impiden continuar.`,
          summary,
          metadata:     validationMeta,
        });
      } else if (status === "ready") {
        // Validación exitosa → transicionar a awaiting_approval.
        // Copilot o el operador deben aprobar explícitamente antes de ejecutar.
        await markReadyForApproval(executionId, input.tenantId, { summary, ...validationMeta });
      } else {
        // needs_attention → completa con advertencias; el operador puede corregir y revalidar
        await completeExecution(executionId, input.tenantId, {
          summary,
          metadata: validationMeta,
        });
      }
    }

    return {
      executionId,
      status,
      checks,
      issues,
      errorCount,
      warningCount,
      validatedAt,
      summary,
    };
  } catch (err) {
    // Fail-safe: si la validación falla por error interno, no bloquear al usuario
    console.error("[ads-validation] validateAdDraft failed:", err);

    if (executionId) {
      await failExecution(executionId, input.tenantId, {
        errorCode:    "INTERNAL_ERROR",
        errorMessage: "Error interno al ejecutar la validación.",
        summary:      "La validación no pudo completarse por un error interno.",
      });
    }

    return {
      executionId,
      status:       "blocked",
      checks:       [],
      issues:       [{
        code:     ADS_VALIDATION_CODES.MISSING_TENANT,
        severity: "error",
        message:  "La validación no pudo completarse por un error interno. Intenta nuevamente.",
      }],
      errorCount:   1,
      warningCount: 0,
      validatedAt,
      summary:      "La validación no pudo completarse. Intenta nuevamente.",
    };
  }
}
