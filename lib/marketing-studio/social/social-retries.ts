/**
 * lib/marketing-studio/social/social-retries.ts
 *
 * MS-16 — Social Publishing Execution Engine: Retry + failure engine
 *
 * Pure computation. No Prisma. No async.
 */

import {
  SOCIAL_RETRY_POLICY,
  SOCIAL_FAILURE_TYPE,
  type SocialRetryPolicy,
  type SocialFailureType,
  type SocialPublication,
  type SocialRetryState,
} from "./social-types";

// ── Retry decision ─────────────────────────────────────────────────────────────

export function shouldRetryPublication(pub: SocialPublication): boolean {
  const { retry } = pub;

  // Exhausted retries
  if (retry.retryCount >= retry.maxRetries) return false;

  // Auth failures always require manual review
  if (retry.failureType === SOCIAL_FAILURE_TYPE.AUTH_FAILURE) return false;

  // Platform rejections (copyright, policy) are not auto-retried
  if (retry.failureType === SOCIAL_FAILURE_TYPE.PLATFORM_REJECTION) return false;

  // Invalid media is not retried without a new asset
  if (retry.failureType === SOCIAL_FAILURE_TYPE.INVALID_MEDIA) return false;

  // Caption errors require manual fix
  if (retry.failureType === SOCIAL_FAILURE_TYPE.CAPTION_ERROR) return false;

  return true;
}

// ── Retry delay (exponential backoff) ─────────────────────────────────────────

/**
 * Returns delay in milliseconds.
 * Base: 30s, multiplier: 2×, cap: 30 minutes.
 */
export function computeRetryDelay(
  retryCount: number,
  policy:     SocialRetryPolicy,
): number {
  if (policy === SOCIAL_RETRY_POLICY.IMMEDIATE) return 5_000;
  if (policy === SOCIAL_RETRY_POLICY.MANUAL_REVIEW) return Infinity;

  // Exponential: 30s * 2^n, capped at 30min
  const base  = 30_000;
  const delay = base * Math.pow(2, retryCount);
  return Math.min(delay, 30 * 60_000);
}

export function computeNextRetryAt(
  retryCount: number,
  policy:     SocialRetryPolicy,
  fromNow:    Date = new Date(),
): string | null {
  const delay = computeRetryDelay(retryCount, policy);
  if (!isFinite(delay)) return null;
  return new Date(fromNow.getTime() + delay).toISOString();
}

// ── Failure classification ─────────────────────────────────────────────────────

export function classifyPublicationFailure(rawError: string): SocialFailureType {
  const err = rawError.toLowerCase();

  if (err.includes("auth") || err.includes("token") || err.includes("401") || err.includes("403")) {
    return SOCIAL_FAILURE_TYPE.AUTH_FAILURE;
  }
  if (err.includes("rate") || err.includes("limit") || err.includes("429") || err.includes("quota")) {
    return SOCIAL_FAILURE_TYPE.RATE_LIMIT;
  }
  if (err.includes("media") || err.includes("format") || err.includes("codec") || err.includes("resolution")) {
    return SOCIAL_FAILURE_TYPE.INVALID_MEDIA;
  }
  if (err.includes("caption") || err.includes("hashtag") || err.includes("text") || err.includes("character")) {
    return SOCIAL_FAILURE_TYPE.CAPTION_ERROR;
  }
  if (err.includes("reject") || err.includes("policy") || err.includes("copyright") || err.includes("violation")) {
    return SOCIAL_FAILURE_TYPE.PLATFORM_REJECTION;
  }
  if (err.includes("timeout") || err.includes("timed out")) {
    return SOCIAL_FAILURE_TYPE.TIMEOUT;
  }
  if (err.includes("network") || err.includes("connection") || err.includes("econnreset") || err.includes("502") || err.includes("503")) {
    return SOCIAL_FAILURE_TYPE.NETWORK_FAILURE;
  }

  return SOCIAL_FAILURE_TYPE.UNKNOWN;
}

// ── Recovery suggestions ───────────────────────────────────────────────────────

export const RECOVERY_SUGGESTIONS: Record<SocialFailureType, string> = {
  auth_failure:       "Reconectar la integración del canal en Configuración → Conectores",
  network_failure:    "Verificar conectividad. El sistema reintentará automáticamente",
  rate_limit:         "Esperar ventana de rate limit. Reducir frecuencia de publicación",
  invalid_media:      "Resubir el asset con formato correcto (MP4 H.264, ratio 9:16 o 1:1)",
  caption_error:      "Revisar caption: longitud, hashtags y caracteres especiales",
  platform_rejection: "Revisar políticas de contenido de la plataforma. Modificar el asset",
  timeout:            "El sistema reintentará automáticamente en la próxima ventana",
  unknown:            "Revisar logs de ejecución. Contactar soporte si persiste",
};

export function buildRecoverySuggestions(
  failureType: SocialFailureType,
): { action: string; priority: "critical" | "high" | "medium" | "low" } {
  const PRIORITY_MAP: Record<SocialFailureType, "critical" | "high" | "medium" | "low"> = {
    auth_failure:       "critical",
    platform_rejection: "high",
    invalid_media:      "high",
    caption_error:      "medium",
    rate_limit:         "medium",
    network_failure:    "low",
    timeout:            "low",
    unknown:            "medium",
  };

  return {
    action:   RECOVERY_SUGGESTIONS[failureType],
    priority: PRIORITY_MAP[failureType] ?? "medium",
  };
}

// ── Retry policy derivation ────────────────────────────────────────────────────

export function deriveRetryPolicy(failureType: SocialFailureType): SocialRetryPolicy {
  const MANUAL: SocialFailureType[] = [
    SOCIAL_FAILURE_TYPE.AUTH_FAILURE,
    SOCIAL_FAILURE_TYPE.PLATFORM_REJECTION,
    SOCIAL_FAILURE_TYPE.INVALID_MEDIA,
    SOCIAL_FAILURE_TYPE.CAPTION_ERROR,
  ];
  const IMMEDIATE: SocialFailureType[] = [
    SOCIAL_FAILURE_TYPE.NETWORK_FAILURE,
    SOCIAL_FAILURE_TYPE.TIMEOUT,
  ];

  if ((MANUAL as SocialFailureType[]).includes(failureType)) return SOCIAL_RETRY_POLICY.MANUAL_REVIEW;
  if ((IMMEDIATE as SocialFailureType[]).includes(failureType)) return SOCIAL_RETRY_POLICY.IMMEDIATE;
  return SOCIAL_RETRY_POLICY.EXPONENTIAL;
}

// ── Build updated retry state ──────────────────────────────────────────────────

export function buildUpdatedRetryState(
  current:      SocialRetryState,
  failureType:  SocialFailureType,
  errorMessage: string,
): SocialRetryState {
  const policy       = deriveRetryPolicy(failureType);
  const newRetryCount = current.retryCount + 1;
  const nextRetryAt  = computeNextRetryAt(newRetryCount, policy);

  return {
    retryCount:    newRetryCount,
    maxRetries:    current.maxRetries,
    policy,
    nextRetryAt,
    lastFailureAt: new Date().toISOString(),
    failureType,
    errorMessage,
  };
}
