/**
 * lib/marketing-studio/ads/ads-validation-types.ts
 *
 * MARKETING-ADS-VALIDATION-01 — Tipos de Validación Previa de Anuncios
 *
 * Tipos serializables — seguros para boundary RSC → client.
 * No importa librerías server-only ni Prisma desde aquí.
 * No contiene tokens, secretos ni valores cifrados.
 */

// ── Enums de dominio ──────────────────────────────────────────────────────────

/**
 * Severidad de un issue de validación.
 *
 * error   — impide enviar a aprobación (blocked).
 * warning — corrección recomendada pero no obligatoria (needs_attention).
 * info    — observación informativa sin impacto en el estado.
 */
export type AdsValidationSeverity = "error" | "warning" | "info";

/**
 * Estado final de la validación.
 *
 * ready            — el borrador está listo para enviar a revisión.
 * needs_attention  — hay advertencias corregibles; puede continuar con cuidado.
 * blocked          — hay errores que impiden continuar.
 */
export type AdsValidationStatus = "ready" | "needs_attention" | "blocked";

// ── Issue individual ──────────────────────────────────────────────────────────

/**
 * Un hallazgo de validación — serializable y seguro para el cliente.
 * Nunca incluye tokens, secretos ni stacktraces.
 */
export interface AdsValidationIssue {
  /** Identificador de la regla que generó el issue (e.g. "MISSING_ACCOUNT"). */
  code:     string;
  /** Severidad del hallazgo. */
  severity: AdsValidationSeverity;
  /**
   * Mensaje en español empresarial LATAM para mostrar al operador.
   * Sin jerga técnica. Sin tokens. Sin secrets.
   */
  message:  string;
  /**
   * Campo o sección del wizard al que se refiere el issue.
   * Útil para resaltar la sección con error en la UI.
   */
  field?:   string;
}

// ── Check de validación ───────────────────────────────────────────────────────

/**
 * Resultado de una validación individual (una regla de la lista).
 * La UI los muestra como checklist: ✓ / ⚠ / ✗.
 */
export interface AdsValidationCheck {
  /** Código único de la regla. */
  code:     string;
  /** Etiqueta para mostrar en la UI (e.g. "Cuenta seleccionada"). */
  label:    string;
  /** Si el check pasó exitosamente. */
  passed:   boolean;
  /** Severidad en caso de fallo. Undefined si pasó. */
  severity?: AdsValidationSeverity;
  /** Mensaje informativo o de error. */
  message?: string;
}

// ── Input de validación ───────────────────────────────────────────────────────

/**
 * Input que recibe el servicio de validación.
 * Contiene el borrador del anuncio y el contexto del tenant.
 * No incluye tokens ni secrets — estos se resuelven internamente via Vault.
 */
export interface AdsValidationInput {
  /** Identificador del tenant (orgSlug). Obligatorio. */
  tenantId:    string;
  /** Identificador interno de la organización (UUID). Obligatorio. */
  organizationId: string;
  /** Actor que solicita la validación (userId o "system"). */
  createdBy:   string;

  // ── Campos del borrador del anuncio ──────────────────────────────────────
  /** Plataformas seleccionadas (e.g. ["meta", "tiktok"]). */
  plataformas:     string[];
  /** Subcanales de Meta seleccionados (e.g. ["facebook", "instagram"]). */
  metaSubchannels: string[];
  /** Objetivo del anuncio. */
  objetivo:        string | null;
  /** ¿Tiene al menos un recurso creativo seleccionado? */
  hasAsset:        boolean;
  /** Texto principal del anuncio. */
  textoPrincipal:  string;
  /** Destino configurado (whatsapp / sitio / landing). */
  destino:         string | null;
  /** URL de destino (cuando aplica). */
  urlDestino:      string;
  /** Número de WhatsApp (cuando el destino es WhatsApp). */
  whatsappNumber:  string;
  /** Monto de presupuesto (string del wizard). */
  monto:           string;
  /** Fecha de inicio (ISO string). */
  inicio:          string;
  /** Fecha de fin (ISO string). */
  fin:             string;
}

// ── Resultado de validación ───────────────────────────────────────────────────

/**
 * Resultado completo de una validación — serializable y seguro para el cliente.
 * Registrado en el Execution Registry como AgentExecution.
 */
export interface AdsValidationResult {
  /** ID del AgentExecution creado en el Execution Registry. */
  executionId:  string | null;
  /** Estado final de la validación. */
  status:       AdsValidationStatus;
  /** Lista de checks ejecutados (para checklist en UI). */
  checks:       AdsValidationCheck[];
  /** Issues con severidad error o warning (subset de checks). */
  issues:       AdsValidationIssue[];
  /** Conteo de errores (severity=error). */
  errorCount:   number;
  /** Conteo de advertencias (severity=warning). */
  warningCount: number;
  /** Timestamp ISO de cuándo se completó la validación. */
  validatedAt:  string;
  /**
   * Mensaje de resumen para mostrar en la UI.
   * En español empresarial LATAM.
   */
  summary:      string;
}

// ── Respuesta de la API route ─────────────────────────────────────────────────

/** Respuesta de POST /api/orgs/[orgSlug]/marketing-studio/ads/validate */
export interface AdsValidationApiResponse {
  validationResult: AdsValidationResult;
  executionId:      string | null;
}

// ── Códigos de error de validación ────────────────────────────────────────────

/** Códigos canónicos de validación — usados en AdsValidationIssue.code. */
export const ADS_VALIDATION_CODES = {
  // Tenant y contexto
  MISSING_TENANT:           "MISSING_TENANT",
  // Plataforma
  MISSING_PLATFORM:         "MISSING_PLATFORM",
  PLATFORM_NOT_READY:       "PLATFORM_NOT_READY",   // Google/YouTube — futuro
  // Cuenta publicitaria
  MISSING_AD_ACCOUNT:       "MISSING_AD_ACCOUNT",
  MISSING_ADVERTISER:       "MISSING_ADVERTISER",
  MISSING_META_SUBCHANNEL:  "MISSING_META_SUBCHANNEL",
  MISSING_FACEBOOK_PAGE:    "MISSING_FACEBOOK_PAGE",
  MISSING_INSTAGRAM_PROFILE:"MISSING_INSTAGRAM_PROFILE",
  // Credenciales
  CREDENTIALS_UNAVAILABLE:  "CREDENTIALS_UNAVAILABLE",
  CREDENTIALS_ENV_ONLY:     "CREDENTIALS_ENV_ONLY",
  // Objetivo
  MISSING_OBJECTIVE:        "MISSING_OBJECTIVE",
  // Recurso creativo
  MISSING_ASSET:            "MISSING_ASSET",
  // Contenido
  MISSING_CONTENT:          "MISSING_CONTENT",
  // Destino
  MISSING_DESTINATION:      "MISSING_DESTINATION",
  MISSING_URL:              "MISSING_URL",
  MISSING_WHATSAPP:         "MISSING_WHATSAPP",
  // Presupuesto
  MISSING_BUDGET:           "MISSING_BUDGET",
  INVALID_BUDGET:           "INVALID_BUDGET",
  // Duración
  MISSING_DATES:            "MISSING_DATES",
  INVALID_DATES:            "INVALID_DATES",
} as const;

export type AdsValidationCode = typeof ADS_VALIDATION_CODES[keyof typeof ADS_VALIDATION_CODES];
