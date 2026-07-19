/**
 * lib/security/vault/secret-migration-registry.ts
 *
 * AGENTIK-SECURITY-VAULT-MIGRATION-01
 * Vault Migration Layer — Secret Migration Registry
 *
 * Canonical registry of all secret candidates pending migration to Vault.
 * Each entry documents:
 *   - What the secret is
 *   - Which provider owns it
 *   - Its risk level
 *   - Current migration status
 *
 * Status lifecycle:
 *   NOT_STARTED → READY → MIGRATED → VERIFIED
 *
 * No server-only. No Prisma. Pure domain data.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type SecretMigrationStatus = "NOT_STARTED" | "READY" | "MIGRATED" | "VERIFIED";

export type SecretRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface SecretMigrationCandidate {
  /** Canonical secret key — matches SECRET_KEYS constants. */
  id:              string;
  /** Human-readable name. */
  name:            string;
  /** Integration provider (e.g. "openai", "meta", "dian"). */
  provider:        string;
  /** Risk level if this secret is exposed. */
  riskLevel:       SecretRiskLevel;
  /** Current migration status. */
  migrationStatus: SecretMigrationStatus;
  /** Known legacy environment variable names for this secret. */
  legacyEnvNames:  string[];
  /** Description of what this secret is used for. */
  description:     string;
  /** Special handling requirements. */
  specialHandling?: string;
}

// ── Registry ──────────────────────────────────────────────────────────────────

export const SECRET_MIGRATION_REGISTRY: ReadonlyArray<SecretMigrationCandidate> = [
  // ── AI Providers ──────────────────────────────────────────────────────────

  {
    id:              "OPENAI_API_KEY",
    name:            "OpenAI API Key",
    provider:        "openai",
    riskLevel:       "CRITICAL",
    migrationStatus: "READY",
    legacyEnvNames:  ["OPENAI_API_KEY", "OPENAI_KEY", "OPENAI_TOKEN"],
    description:     "OpenAI API key — billing exposure if leaked. All AI completions depend on this.",
  },
  {
    id:              "ANTHROPIC_API_KEY",
    name:            "Anthropic API Key",
    provider:        "anthropic",
    riskLevel:       "CRITICAL",
    migrationStatus: "READY",
    legacyEnvNames:  ["ANTHROPIC_API_KEY", "ANTHROPIC_KEY", "CLAUDE_API_KEY"],
    description:     "Anthropic API key — billing exposure if leaked. Powers Claude models.",
  },

  // ── Meta / Social ─────────────────────────────────────────────────────────

  {
    id:              "META_ACCESS_TOKEN",
    name:            "Meta Page Access Token",
    provider:        "meta",
    riskLevel:       "HIGH",
    migrationStatus: "READY",
    legacyEnvNames:  ["META_ACCESS_TOKEN", "META_TOKEN", "FACEBOOK_ACCESS_TOKEN", "FB_ACCESS_TOKEN"],
    description:     "Meta Graph API long-lived page access token. Controls social publishing.",
  },

  // ── WhatsApp ──────────────────────────────────────────────────────────────

  {
    id:              "WHATSAPP_TOKEN",
    name:            "WhatsApp Business Token",
    provider:        "whatsapp",
    riskLevel:       "HIGH",
    migrationStatus: "READY",
    legacyEnvNames:  ["WHATSAPP_TOKEN", "WHATSAPP_ACCESS_TOKEN", "WA_TOKEN"],
    description:     "WhatsApp Business Platform access token for messaging.",
  },

  // ── TikTok ────────────────────────────────────────────────────────────────

  {
    id:              "TIKTOK_TOKEN",
    name:            "TikTok Business Access Token",
    provider:        "tiktok",
    riskLevel:       "HIGH",
    migrationStatus: "READY",
    legacyEnvNames:  ["TIKTOK_TOKEN", "TIKTOK_ACCESS_TOKEN", "TIKTOK_API_TOKEN"],
    description:     "TikTok Business API access token for ad management and content.",
  },

  // ── Shopify ───────────────────────────────────────────────────────────────

  {
    id:              "SHOPIFY_TOKEN",
    name:            "Shopify Admin API Token",
    provider:        "shopify",
    riskLevel:       "HIGH",
    migrationStatus: "READY",
    legacyEnvNames:  ["SHOPIFY_ACCESS_TOKEN", "SHOPIFY_TOKEN", "SHOPIFY_ADMIN_TOKEN"],
    description:     "Shopify Admin API access token — full store access.",
  },
  {
    id:              "SHOPIFY_WEBHOOK_SECRET",
    name:            "Shopify Webhook Secret",
    provider:        "shopify",
    riskLevel:       "MEDIUM",
    migrationStatus: "READY",
    legacyEnvNames:  ["SHOPIFY_WEBHOOK_SECRET", "SHOPIFY_WEBHOOK_TOKEN"],
    description:     "HMAC secret for verifying Shopify webhook signatures.",
  },

  // ── DIAN ─────────────────────────────────────────────────────────────────

  {
    id:              "DIAN_CERTIFICATE",
    name:            "DIAN Certificate (PKCS#12)",
    provider:        "dian",
    riskLevel:       "CRITICAL",
    migrationStatus: "READY",
    legacyEnvNames:  ["DIAN_CERTIFICATE_PATH", "DIAN_CERT_PATH", "DIAN_P12_PATH"],
    description:     "DIAN electronic certificate for electronic invoicing. Regulatory impact if compromised.",
    specialHandling: "PKCS#12 binary — path-based in legacy, base64-encoded in Vault",
  },
  {
    id:              "DIAN_PASSWORD",
    name:            "DIAN Certificate Password",
    provider:        "dian",
    riskLevel:       "CRITICAL",
    migrationStatus: "READY",
    legacyEnvNames:  ["DIAN_CERTIFICATE_PASSWORD", "DIAN_CERT_PASSWORD", "DIAN_P12_PASSWORD"],
    description:     "Password for DIAN PKCS#12 certificate. Needed to unlock the cert at runtime.",
    specialHandling: "Never log. Never include in error messages.",
  },

  // ── ERP ───────────────────────────────────────────────────────────────────

  {
    id:              "ERP_PASSWORD",
    name:            "ERP API Password",
    provider:        "erp",
    riskLevel:       "HIGH",
    migrationStatus: "NOT_STARTED",
    legacyEnvNames:  ["ERP_PASSWORD", "ERP_API_PASSWORD", "SAG_PASSWORD"],
    description:     "ERP system password — controls SAG/PYA integration.",
  },
  {
    id:              "ERP_API_KEY",
    name:            "ERP API Key",
    provider:        "erp",
    riskLevel:       "HIGH",
    migrationStatus: "NOT_STARTED",
    legacyEnvNames:  ["ERP_API_KEY", "SAG_API_KEY", "ERP_KEY"],
    description:     "ERP system API key for SAG inventory and order data.",
  },
  {
    id:              "ERP_WEBHOOK_SECRET",
    name:            "ERP Webhook Secret",
    provider:        "erp",
    riskLevel:       "MEDIUM",
    migrationStatus: "NOT_STARTED",
    legacyEnvNames:  ["ERP_WEBHOOK_SECRET", "ERP_WEBHOOK_TOKEN"],
    description:     "HMAC secret for verifying ERP webhook signatures.",
  },
] as const;

// ── Lookup helpers ────────────────────────────────────────────────────────────

export function getMigrationCandidate(id: string): SecretMigrationCandidate | undefined {
  return SECRET_MIGRATION_REGISTRY.find(c => c.id === id);
}

export function getCandidatesByStatus(
  status: SecretMigrationStatus,
): SecretMigrationCandidate[] {
  return SECRET_MIGRATION_REGISTRY.filter(c => c.migrationStatus === status);
}

export function getCandidatesByRisk(
  riskLevel: SecretRiskLevel,
): SecretMigrationCandidate[] {
  return SECRET_MIGRATION_REGISTRY.filter(c => c.riskLevel === riskLevel);
}

export function getCandidatesByProvider(provider: string): SecretMigrationCandidate[] {
  return SECRET_MIGRATION_REGISTRY.filter(c => c.provider === provider);
}

export function getCriticalRiskCandidates(): SecretMigrationCandidate[] {
  return SECRET_MIGRATION_REGISTRY.filter(c => c.riskLevel === "CRITICAL");
}

export function getPendingCandidates(): SecretMigrationCandidate[] {
  return SECRET_MIGRATION_REGISTRY.filter(
    c => c.migrationStatus === "NOT_STARTED" || c.migrationStatus === "READY",
  );
}
