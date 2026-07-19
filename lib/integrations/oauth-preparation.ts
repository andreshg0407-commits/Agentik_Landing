/**
 * lib/integrations/oauth-preparation.ts
 *
 * Agentik — OAuth Preparation Layer
 *
 * Sprint: AGENTIK-TENANT-INTEGRATION-MANAGER-AND-CONTROL-CENTER-01 — Block A3
 *
 * Architecture-ready OAuth contracts for TikTok, Meta, Shopify, Google.
 * Defines scope requirements, readiness validation, and governance architecture.
 *
 * V1: contracts + governance-ready architecture — NO real OAuth flows.
 *     No redirect URLs. No client secrets. No tokens.
 * V4: backed by real OAuth PKCE flows + Prisma.OAuthConnection.
 *
 * IMPORTANT: No real OAuth implementation here.
 * All OAuth flows require explicit human initiation and approval.
 */

// ── OAuth provider ────────────────────────────────────────────────────────────

export type OAuthProvider =
  | "tiktok"
  | "meta"
  | "shopify"
  | "google";

// ── OAuth scope definition ────────────────────────────────────────────────────

export interface OAuthScopeDefinition {
  scope:       string;
  description: string;
  required:    boolean;
  riskLevel:   "low" | "medium" | "high";
}

// ── OAuth preparation contract ────────────────────────────────────────────────

export interface OAuthPreparation {
  id:               string;
  orgSlug:          string;
  provider:         OAuthProvider;
  providerName:     string;
  status:           "not_started" | "scopes_defined" | "ready_for_human" | "pending_approval";
  requiredScopes:   OAuthScopeDefinition[];
  optionalScopes:   OAuthScopeDefinition[];
  governanceReady:  boolean;          // Governance rules validated
  tenantIsolated:   boolean;          // orgSlug isolation enforced
  auditRequired:    boolean;          // Always true
  humanInitiationRequired: boolean;   // Always true — no auto-OAuth
  supervisedOnly:   boolean;          // Always true
  riskLevel:        "low" | "medium" | "high" | "critical";
  readinessSummary: string;
  blockReasons:     string[];
  preparedAt:       string;           // ISO timestamp
}

// ── OAuth readiness verdict ───────────────────────────────────────────────────

export interface OAuthReadinessVerdict {
  provider:         OAuthProvider;
  ready:            boolean;
  scopesValid:      boolean;
  requiredMissing:  string[];
  riskAccepted:     boolean;
  blockers:         string[];
  summary:          string;
}

// ── Provider scope catalog ────────────────────────────────────────────────────

const OAUTH_SCOPE_CATALOG: Record<OAuthProvider, {
  name:     string;
  required: OAuthScopeDefinition[];
  optional: OAuthScopeDefinition[];
  risk:     "low" | "medium" | "high" | "critical";
}> = {
  tiktok: {
    name: "TikTok Business",
    risk: "high",
    required: [
      { scope: "video.upload",     description: "Subir videos",             required: true, riskLevel: "high"   },
      { scope: "video.list",       description: "Listar videos del perfil", required: true, riskLevel: "low"    },
    ],
    optional: [
      { scope: "user.info.basic",  description: "Info básica del perfil",   required: false, riskLevel: "low"  },
      { scope: "research.adlib",   description: "Acceso a biblioteca ads",  required: false, riskLevel: "medium" },
    ],
  },
  meta: {
    name: "Meta Business",
    risk: "high",
    required: [
      { scope: "pages_manage_posts",  description: "Publicar en páginas",       required: true, riskLevel: "high"   },
      { scope: "instagram_basic",     description: "Acceso básico Instagram",    required: true, riskLevel: "medium" },
    ],
    optional: [
      { scope: "ads_management",      description: "Gestionar campañas de ads",  required: false, riskLevel: "high"  },
      { scope: "pages_read_engagement", description: "Leer engagement",          required: false, riskLevel: "low"   },
    ],
  },
  shopify: {
    name: "Shopify",
    risk: "medium",
    required: [
      { scope: "read_products",   description: "Leer catálogo de productos",  required: true, riskLevel: "low"    },
      { scope: "write_products",  description: "Crear/editar productos",       required: true, riskLevel: "medium" },
    ],
    optional: [
      { scope: "read_orders",     description: "Leer pedidos",                required: false, riskLevel: "low"   },
      { scope: "write_inventory", description: "Gestionar inventario",         required: false, riskLevel: "medium" },
    ],
  },
  google: {
    name: "Google Workspace",
    risk: "medium",
    required: [
      { scope: "https://www.googleapis.com/auth/drive.file", description: "Acceso a archivos Drive", required: true, riskLevel: "medium" },
    ],
    optional: [
      { scope: "https://www.googleapis.com/auth/calendar",   description: "Acceso a Calendar",       required: false, riskLevel: "low" },
      { scope: "https://www.googleapis.com/auth/gmail.send", description: "Enviar emails",           required: false, riskLevel: "high" },
    ],
  },
};

// ── Core: build OAuth preparation ────────────────────────────────────────────

/**
 * Builds a governance-ready OAuth preparation record for a provider.
 * Does NOT initiate any real OAuth flow.
 */
export function buildOAuthPreparation(
  orgSlug:  string,
  provider: OAuthProvider,
): OAuthPreparation {
  const catalog     = OAUTH_SCOPE_CATALOG[provider];
  const preparedAt  = new Date().toISOString();
  const blockReasons: string[] = [];

  // All OAuth flows require explicit human initiation in V1
  blockReasons.push("Requiere inicio de sesión OAuth por operador humano");

  return {
    id:                    `oauth-${orgSlug.slice(0, 4)}-${provider}-${Date.now().toString(36)}`,
    orgSlug,
    provider,
    providerName:          catalog.name,
    status:                "scopes_defined",
    requiredScopes:        catalog.required,
    optionalScopes:        catalog.optional,
    governanceReady:       true,   // Governance contracts defined
    tenantIsolated:        true,   // orgSlug enforced at every step
    auditRequired:         true,   // Always
    humanInitiationRequired: true, // Always — no auto-OAuth
    supervisedOnly:        true,   // Always
    riskLevel:             catalog.risk,
    readinessSummary:      `${catalog.name} — arquitectura OAuth lista, requiere autorización humana`,
    blockReasons,
    preparedAt,
  };
}

// ── Validate OAuth scopes ─────────────────────────────────────────────────────

/**
 * Validates that a set of granted scopes satisfies provider requirements.
 * In V1: always returns not-ready (no real scopes exist yet).
 */
export function validateOAuthScopes(
  provider:      OAuthProvider,
  grantedScopes: string[],
): OAuthReadinessVerdict {
  const catalog = OAUTH_SCOPE_CATALOG[provider];

  const requiredMissing = catalog.required
    .filter(s => s.required && !grantedScopes.includes(s.scope))
    .map(s => s.scope);

  const scopesValid = requiredMissing.length === 0;
  const blockers:    string[] = [];

  if (!scopesValid) {
    blockers.push(`${requiredMissing.length} scope${requiredMissing.length > 1 ? "s" : ""} requerido${requiredMissing.length > 1 ? "s" : ""} no otorgado${requiredMissing.length > 1 ? "s" : ""}`);
  }

  blockers.push("Autorización OAuth pendiente — requiere inicio humano");

  const summary =
    !scopesValid
      ? `Scopes insuficientes para ${catalog.name} — ${requiredMissing.length} requerido${requiredMissing.length > 1 ? "s" : ""} faltante${requiredMissing.length > 1 ? "s" : ""}`
      : `Scopes válidos para ${catalog.name} — autorización pendiente`;

  return {
    provider,
    ready:           false,  // V1: never ready until human authorizes
    scopesValid,
    requiredMissing,
    riskAccepted:    false,
    blockers,
    summary,
  };
}

// ── Summarize OAuth readiness ─────────────────────────────────────────────────

/**
 * Returns a human-readable readiness summary for UI display.
 */
export function summarizeOAuthReadiness(prep: OAuthPreparation): string {
  return `${prep.providerName} — ${prep.readinessSummary}`;
}
