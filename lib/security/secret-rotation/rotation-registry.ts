/**
 * lib/security/secret-rotation/rotation-registry.ts
 *
 * AGENTIK-SECURITY-SECRET-ROTATION-01
 * Rotation Registry — Rotatable Secret Catalog
 *
 * Registers all secrets that can be rotated in the Agentik platform.
 * Each entry defines metadata about the secret — never the value.
 *
 * No Prisma. No server-only. No crypto. Pure domain registry.
 */

import type { RotationRiskLevel } from "./rotation-types";

// ── Registry Entry ────────────────────────────────────────────────────────────

export interface RotationRegistryEntry {
  /** Stable unique identifier for this secret class. */
  id:                       string;
  /** Human-readable name. */
  name:                     string;
  /** What this secret grants access to. */
  description:              string;
  /** The external provider that owns this secret. */
  provider:                 string;
  /** Inherent risk level of this secret class. */
  riskLevel:                RotationRiskLevel;
  /** Whether rotation is currently supported. */
  rotationSupported:        boolean;
  /** How often (in days) this secret class should be rotated. */
  recommendedRotationDays:  number;
  /** Whether this secret can be rotated without service interruption. */
  supportsZeroDowntime:     boolean;
  /** Whether approval is required for rotation. */
  requiresApproval:         boolean;
  /** Whether double approval is required (for CRITICAL secrets). */
  requiresDoubleApproval:   boolean;
  /** Optional environment variable name that holds this secret. */
  envVarName?:              string;
  /** Notes on rotation procedure. */
  rotationNotes?:           string;
}

// ── Registry ──────────────────────────────────────────────────────────────────

export const ROTATION_REGISTRY: ReadonlyArray<RotationRegistryEntry> = [
  {
    id:                      "OPENAI_API_KEY",
    name:                    "OpenAI API Key",
    description:             "Authentication key for OpenAI API. Grants access to GPT models and embeddings.",
    provider:                "openai",
    riskLevel:               "HIGH",
    rotationSupported:       true,
    recommendedRotationDays: 90,
    supportsZeroDowntime:    true,
    requiresApproval:        true,
    requiresDoubleApproval:  false,
    envVarName:              "OPENAI_API_KEY",
    rotationNotes:           "Generate new key in OpenAI dashboard. Activate after validation. Old key revocable immediately.",
  },
  {
    id:                      "ANTHROPIC_API_KEY",
    name:                    "Anthropic API Key",
    description:             "Authentication key for Anthropic Claude API. Grants access to Claude models.",
    provider:                "anthropic",
    riskLevel:               "HIGH",
    rotationSupported:       true,
    recommendedRotationDays: 90,
    supportsZeroDowntime:    true,
    requiresApproval:        true,
    requiresDoubleApproval:  false,
    envVarName:              "ANTHROPIC_API_KEY",
    rotationNotes:           "Generate new key in Anthropic console. Activate after validation. Old key revocable immediately.",
  },
  {
    id:                      "META_ACCESS_TOKEN",
    name:                    "Meta Graph API Access Token",
    description:             "OAuth access token for Meta Graph API. Grants access to Facebook/Instagram business accounts.",
    provider:                "meta",
    riskLevel:               "HIGH",
    rotationSupported:       true,
    recommendedRotationDays: 60,
    supportsZeroDowntime:    false,
    requiresApproval:        true,
    requiresDoubleApproval:  false,
    rotationNotes:           "Tokens expire. Re-authorize via OAuth flow. Grace period needed for active campaigns.",
  },
  {
    id:                      "WHATSAPP_TOKEN",
    name:                    "WhatsApp Business API Token",
    description:             "Access token for WhatsApp Business API. Enables customer messaging.",
    provider:                "meta",
    riskLevel:               "HIGH",
    rotationSupported:       true,
    recommendedRotationDays: 60,
    supportsZeroDowntime:    false,
    requiresApproval:        true,
    requiresDoubleApproval:  false,
    rotationNotes:           "Token rotation interrupts in-flight messages. Requires grace period. Verify delivery after activation.",
  },
  {
    id:                      "TIKTOK_TOKEN",
    name:                    "TikTok Business API Token",
    description:             "Access token for TikTok for Business API. Grants advertising and analytics access.",
    provider:                "tiktok",
    riskLevel:               "MEDIUM",
    rotationSupported:       true,
    recommendedRotationDays: 60,
    supportsZeroDowntime:    true,
    requiresApproval:        false,
    requiresDoubleApproval:  false,
    rotationNotes:           "Re-authorize via OAuth. Token expiry managed by TikTok.",
  },
  {
    id:                      "SHOPIFY_TOKEN",
    name:                    "Shopify Private App Token",
    description:             "API access token for Shopify store. Grants access to orders, products, and inventory.",
    provider:                "shopify",
    riskLevel:               "MEDIUM",
    rotationSupported:       true,
    recommendedRotationDays: 180,
    supportsZeroDowntime:    true,
    requiresApproval:        false,
    requiresDoubleApproval:  false,
    rotationNotes:           "Generate new token in Shopify partner dashboard. Old token can be deactivated after validation.",
  },
  {
    id:                      "DIAN_CERTIFICATE",
    name:                    "DIAN Digital Signing Certificate",
    description:             "PKCS#12 certificate for electronic invoicing with DIAN (Colombian tax authority). Grants legal signing authority.",
    provider:                "dian",
    riskLevel:               "CRITICAL",
    rotationSupported:       true,
    recommendedRotationDays: 365,
    supportsZeroDowntime:    false,
    requiresApproval:        true,
    requiresDoubleApproval:  true,
    rotationNotes:           "Certificate renewal requires DIAN process. Double approval required. Mandatory grace period. Verify DTE signing after activation.",
  },
  {
    id:                      "DIAN_PASSWORD",
    name:                    "DIAN Certificate Password",
    description:             "Password for the DIAN PKCS#12 certificate. Required for digital signing operations.",
    provider:                "dian",
    riskLevel:               "CRITICAL",
    rotationSupported:       true,
    recommendedRotationDays: 365,
    supportsZeroDowntime:    false,
    requiresApproval:        true,
    requiresDoubleApproval:  true,
    rotationNotes:           "Must be rotated together with certificate. Double approval required.",
  },
  {
    id:                      "ERP_API_KEY",
    name:                    "ERP System API Key",
    description:             "API key for ERP system integration (SAP, Siigo, etc.). Grants access to financial and operational data.",
    provider:                "erp",
    riskLevel:               "HIGH",
    rotationSupported:       true,
    recommendedRotationDays: 90,
    supportsZeroDowntime:    true,
    requiresApproval:        true,
    requiresDoubleApproval:  false,
    rotationNotes:           "Generate new key in ERP admin. Validate sync before revoking old key.",
  },
  {
    id:                      "WEBHOOK_SECRET",
    name:                    "Webhook Signing Secret",
    description:             "HMAC signing secret used to verify webhook payloads from external providers.",
    provider:                "internal",
    riskLevel:               "MEDIUM",
    rotationSupported:       true,
    recommendedRotationDays: 180,
    supportsZeroDowntime:    false,
    requiresApproval:        false,
    requiresDoubleApproval:  false,
    rotationNotes:           "Rolling rotation: activate new secret, keep old for grace period to process in-flight webhooks.",
  },
] as const;

// ── Index ─────────────────────────────────────────────────────────────────────

const _registryIndex = new Map<string, RotationRegistryEntry>(
  ROTATION_REGISTRY.map(e => [e.id, e]),
);

// ── Lookup Helpers ────────────────────────────────────────────────────────────

export function getRotationEntry(id: string): RotationRegistryEntry | undefined {
  return _registryIndex.get(id);
}

export function isRotatable(id: string): boolean {
  return _registryIndex.get(id)?.rotationSupported ?? false;
}

export function getEntriesByRisk(riskLevel: RotationRiskLevel): RotationRegistryEntry[] {
  return ROTATION_REGISTRY.filter(e => e.riskLevel === riskLevel);
}

export function getEntriesRequiringApproval(): RotationRegistryEntry[] {
  return ROTATION_REGISTRY.filter(e => e.requiresApproval);
}

export function getEntriesRequiringDoubleApproval(): RotationRegistryEntry[] {
  return ROTATION_REGISTRY.filter(e => e.requiresDoubleApproval);
}

export function getAllRotatableIds(): string[] {
  return ROTATION_REGISTRY.filter(e => e.rotationSupported).map(e => e.id);
}

export function getRegistrySummary(): {
  total:              number;
  critical:           number;
  high:               number;
  medium:             number;
  low:                number;
  rotationSupported:  number;
  requiresApproval:   number;
  requiresDoubleApproval: number;
  avgRotationDays:    number;
} {
  const total = ROTATION_REGISTRY.length;
  const sumDays = ROTATION_REGISTRY.reduce((s, e) => s + e.recommendedRotationDays, 0);
  return {
    total,
    critical:               ROTATION_REGISTRY.filter(e => e.riskLevel === "CRITICAL").length,
    high:                   ROTATION_REGISTRY.filter(e => e.riskLevel === "HIGH").length,
    medium:                 ROTATION_REGISTRY.filter(e => e.riskLevel === "MEDIUM").length,
    low:                    ROTATION_REGISTRY.filter(e => e.riskLevel === "LOW").length,
    rotationSupported:      ROTATION_REGISTRY.filter(e => e.rotationSupported).length,
    requiresApproval:       ROTATION_REGISTRY.filter(e => e.requiresApproval).length,
    requiresDoubleApproval: ROTATION_REGISTRY.filter(e => e.requiresDoubleApproval).length,
    avgRotationDays:        total > 0 ? Math.round(sumDays / total) : 0,
  };
}
