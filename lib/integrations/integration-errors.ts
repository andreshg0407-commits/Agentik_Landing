/**
 * lib/integrations/integration-errors.ts
 *
 * MS-10 — Integration Error Hierarchy
 *
 * Typed errors for the integration runtime.
 * ── SECURITY ──────────────────────────────────────────────────────────────────
 *   Error messages MUST NOT contain token values, secrets, or credentials.
 *   Only safe metadata (provider name, connectionId, status codes) is allowed.
 */

// ── Base ──────────────────────────────────────────────────────────────────────

export class IntegrationError extends Error {
  public readonly code:           string;
  public readonly provider:       string | undefined;
  public readonly organizationId: string | undefined;

  constructor(
    message:        string,
    code:           string,
    provider?:      string,
    organizationId?: string,
  ) {
    super(message);
    this.name           = "IntegrationError";
    this.code           = code;
    this.provider       = provider;
    this.organizationId = organizationId;
  }
}

// ── Auth / token errors ───────────────────────────────────────────────────────

export class IntegrationAuthError extends IntegrationError {
  constructor(message: string, provider: string, organizationId: string) {
    super(message, "AUTH_ERROR", provider, organizationId);
    this.name = "IntegrationAuthError";
  }
}

export class IntegrationTokenExpiredError extends IntegrationError {
  constructor(provider: string, organizationId: string) {
    super(
      `Integration token expired for provider: ${provider}`,
      "TOKEN_EXPIRED",
      provider,
      organizationId,
    );
    this.name = "IntegrationTokenExpiredError";
  }
}

export class IntegrationTokenRevocationError extends IntegrationError {
  constructor(provider: string, organizationId: string) {
    super(
      `Integration access revoked for provider: ${provider}`,
      "TOKEN_REVOKED",
      provider,
      organizationId,
    );
    this.name = "IntegrationTokenRevocationError";
  }
}

// ── Connection errors ─────────────────────────────────────────────────────────

export class IntegrationNotConnectedError extends IntegrationError {
  constructor(provider: string, organizationId: string) {
    super(
      `No active connection for provider: ${provider}`,
      "NOT_CONNECTED",
      provider,
      organizationId,
    );
    this.name = "IntegrationNotConnectedError";
  }
}

export class IntegrationDisabledError extends IntegrationError {
  constructor(provider: string, organizationId: string) {
    super(
      `Integration disabled for provider: ${provider}`,
      "INTEGRATION_DISABLED",
      provider,
      organizationId,
    );
    this.name = "IntegrationDisabledError";
  }
}

// ── Security errors ───────────────────────────────────────────────────────────

export class IntegrationWebhookVerificationError extends IntegrationError {
  constructor(provider: string) {
    super(
      `Webhook HMAC verification failed for provider: ${provider}`,
      "WEBHOOK_VERIFICATION_FAILED",
      provider,
    );
    this.name = "IntegrationWebhookVerificationError";
  }
}

export class IntegrationStateError extends IntegrationError {
  constructor(message: string) {
    super(message, "INVALID_STATE");
    this.name = "IntegrationStateError";
  }
}

export class IntegrationCsrfError extends IntegrationError {
  constructor() {
    super("OAuth state mismatch — possible CSRF attack", "CSRF_STATE_MISMATCH");
    this.name = "IntegrationCsrfError";
  }
}

// ── API errors ────────────────────────────────────────────────────────────────

export class IntegrationRateLimitError extends IntegrationError {
  public readonly retryAfterSeconds: number | undefined;

  constructor(provider: string, retryAfterSeconds?: number) {
    super(`API rate limit exceeded for provider: ${provider}`, "RATE_LIMIT", provider);
    this.name              = "IntegrationRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class IntegrationApiError extends IntegrationError {
  public readonly statusCode: number;
  public readonly apiCode:    string | undefined;

  constructor(
    provider:   string,
    statusCode: number,
    apiCode?:   string,
  ) {
    super(
      `API error from ${provider}: HTTP ${statusCode}${apiCode ? ` (${apiCode})` : ""}`,
      "API_ERROR",
      provider,
    );
    this.name       = "IntegrationApiError";
    this.statusCode = statusCode;
    this.apiCode    = apiCode;
  }
}

// ── Vault errors ──────────────────────────────────────────────────────────────

export class IntegrationVaultError extends IntegrationError {
  constructor(message: string) {
    super(message, "VAULT_ERROR");
    this.name = "IntegrationVaultError";
  }
}

// ── Helper ────────────────────────────────────────────────────────────────────

export function isIntegrationError(err: unknown): err is IntegrationError {
  return err instanceof IntegrationError;
}
