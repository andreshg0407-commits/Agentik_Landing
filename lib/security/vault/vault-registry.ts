/**
 * lib/security/vault/vault-registry.ts
 *
 * AGENTIK-SECURITY-VAULT-01
 * Standalone Org-Scoped Secret Vault — Known Secret Registry
 *
 * Catalog of well-known secret names with recommended kinds and classifications.
 * Helps callers pick the correct kind + classification for common secrets.
 *
 * Not exhaustive — any secret can be created with GENERIC_SECRET.
 * No server-only, no Prisma, no React.
 */

import type { VaultSecretClassification, VaultSecretKind } from "./vault-secret-record";

// ── Registry entry ────────────────────────────────────────────────────────────

export interface VaultRegistryEntry {
  /** Canonical ID for this well-known secret type. */
  id:             string;
  /** Human-readable display name. */
  name:           string;
  /** Provider slug (e.g. "openai", "meta", "dian"). */
  provider:       string;
  /** Recommended VaultSecretKind. */
  kind:           VaultSecretKind;
  /** Recommended data sensitivity classification. */
  classification: VaultSecretClassification;
  /** Short description of what this secret is used for. */
  description:    string;
  /** Example pattern — never a real secret. */
  examplePattern: string;
}

// ── Registry ──────────────────────────────────────────────────────────────────

export const VAULT_SECRET_REGISTRY: ReadonlyArray<VaultRegistryEntry> = [
  // ── AI providers ───────────────────────────────────────────────────────────

  {
    id:             "OPENAI_API_KEY",
    name:           "OpenAI API Key",
    provider:       "openai",
    kind:           "API_KEY",
    classification: "RESTRICTED",
    description:    "OpenAI API key for GPT-4 and related services.",
    examplePattern: "sk-prod-...",
  },
  {
    id:             "ANTHROPIC_API_KEY",
    name:           "Anthropic API Key",
    provider:       "anthropic",
    kind:           "API_KEY",
    classification: "RESTRICTED",
    description:    "Anthropic API key for Claude models.",
    examplePattern: "sk-ant-api03-...",
  },

  // ── Social / Meta ──────────────────────────────────────────────────────────

  {
    id:             "META_ACCESS_TOKEN",
    name:           "Meta Page Access Token",
    provider:       "meta",
    kind:           "ACCESS_TOKEN",
    classification: "RESTRICTED",
    description:    "Meta Graph API long-lived page access token.",
    examplePattern: "EAAG...",
  },
  {
    id:             "META_APP_SECRET",
    name:           "Meta App Secret",
    provider:       "meta",
    kind:           "WEBHOOK_SECRET",
    classification: "RESTRICTED",
    description:    "Meta app secret used to verify webhook signatures.",
    examplePattern: "abc123...",
  },

  // ── TikTok ─────────────────────────────────────────────────────────────────

  {
    id:             "TIKTOK_ACCESS_TOKEN",
    name:           "TikTok Business Access Token",
    provider:       "tiktok",
    kind:           "ACCESS_TOKEN",
    classification: "RESTRICTED",
    description:    "TikTok Business API access token.",
    examplePattern: "act.example...",
  },

  // ── Shopify ────────────────────────────────────────────────────────────────

  {
    id:             "SHOPIFY_ADMIN_TOKEN",
    name:           "Shopify Admin API Token",
    provider:       "shopify",
    kind:           "ACCESS_TOKEN",
    classification: "RESTRICTED",
    description:    "Shopify Admin API access token for a store.",
    examplePattern: "shpat_...",
  },
  {
    id:             "SHOPIFY_WEBHOOK_SECRET",
    name:           "Shopify Webhook Secret",
    provider:       "shopify",
    kind:           "WEBHOOK_SECRET",
    classification: "RESTRICTED",
    description:    "Secret used to verify Shopify webhook HMAC signatures.",
    examplePattern: "shpss_...",
  },

  // ── DIAN (Colombia) ────────────────────────────────────────────────────────

  {
    id:             "DIAN_CERTIFICATE_PASSWORD",
    name:           "DIAN Certificate Password",
    provider:       "dian",
    kind:           "CERTIFICATE_PASSWORD",
    classification: "RESTRICTED",
    description:    "Password for the PKCS#12 DIAN electronic certificate.",
    examplePattern: "(alphanumeric password)",
  },
  {
    id:             "DIAN_SOFTWARE_PIN",
    name:           "DIAN Software PIN",
    provider:       "dian",
    kind:           "SOFTWARE_PIN",
    classification: "RESTRICTED",
    description:    "PIN used for DIAN habilitación and producción registration.",
    examplePattern: "(numeric or alphanumeric PIN)",
  },

  // ── WhatsApp ───────────────────────────────────────────────────────────────

  {
    id:             "WHATSAPP_ACCESS_TOKEN",
    name:           "WhatsApp Business Access Token",
    provider:       "whatsapp",
    kind:           "ACCESS_TOKEN",
    classification: "RESTRICTED",
    description:    "WhatsApp Business Platform access token.",
    examplePattern: "EAAG...",
  },

  // ── Banking ────────────────────────────────────────────────────────────────

  {
    id:             "BANKING_API_CREDENTIAL",
    name:           "Banking API Credential",
    provider:       "banking",
    kind:           "BANKING_CREDENTIAL",
    classification: "RESTRICTED",
    description:    "Banking API username/password/apiKey bundle.",
    examplePattern: "(credential bundle)",
  },

  // ── Generic ────────────────────────────────────────────────────────────────

  {
    id:             "GENERIC_WEBHOOK_SECRET",
    name:           "Generic Webhook Secret",
    provider:       "generic",
    kind:           "WEBHOOK_SECRET",
    classification: "CONFIDENTIAL",
    description:    "Generic HMAC webhook signature verification secret.",
    examplePattern: "(random hex string)",
  },
] as const;

// ── Lookup helpers ────────────────────────────────────────────────────────────

export function getRegistryEntry(id: string): VaultRegistryEntry | undefined {
  return VAULT_SECRET_REGISTRY.find(e => e.id === id);
}

export function getEntriesByProvider(provider: string): VaultRegistryEntry[] {
  return VAULT_SECRET_REGISTRY.filter(e => e.provider === provider);
}

export function getEntriesByKind(kind: VaultSecretKind): VaultRegistryEntry[] {
  return VAULT_SECRET_REGISTRY.filter(e => e.kind === kind);
}

export function getAllRegistryIds(): string[] {
  return VAULT_SECRET_REGISTRY.map(e => e.id);
}
