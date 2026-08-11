/**
 * lib/tenant/commercial-agreement-types.ts
 *
 * Types for tenant-level commercial agreements (bundles, custom pricing).
 *
 * Sprint: AGENTIK-CUSTOM-COMMERCIAL-AGREEMENTS-01
 *
 * SEPARATION LAW:
 *   TenantModule              = access authority ("can tenant use this module?")
 *   TenantModuleCommercialTerm = per-module price history
 *   TenantCommercialAgreement  = tenant-level negotiated agreement / bundle
 *
 * An agreement answers: "what does this tenant pay, and which modules are
 * covered by that payment?" It does NOT grant access — that remains TenantModule.
 */

import type { ModuleKey } from "./modules";

// Agreement types
export type AgreementType = "CUSTOM_BUNDLE";

export type AgreementStatus = "ACTIVE" | "EXPIRED" | "SUPERSEDED" | "DRAFT";

// Usage limit metric keys
//
// CONTRACTUAL UNIT LAW:
//   Metric keys represent the CONTRACTUAL unit the customer signed for.
//   whatsapp_conversations ≠ whatsapp_messages.
//   ai_chat_queries ≠ ai_credits.
//   Internal cost accounting (ai_credits) may still exist for Agentik's
//   internal billing, but the CONTRACTUAL entitlement uses the customer's unit.
//
export type UsageLimitMetricKey =
  | "ai_credits_monthly"
  | "ai_chat_queries_monthly"
  | "ai_videos_monthly"
  | "whatsapp_conversations_monthly"
  | "whatsapp_messages_monthly"
  | "automation_executions_monthly"
  | "storage_gb"
  | "image_units_monthly"
  | "video_seconds_monthly"
  | "accounting_documents_monthly";

export type UsageLimitPolicy = "HARD_CAP" | "SOFT_CAP" | "ADVISORY";

// Tracking readiness
export type UsageTrackingReadiness =
  | "PRODUCTION_READY"   // reliable counter exists + enforcement gate exists
  | "COUNTER_EXISTS"     // counter exists but no enforcement gate
  | "TRACKING_NOT_READY"; // no reliable counter

// Core agreement type (matches Prisma model shape)
export interface CommercialAgreement {
  id: string;
  organizationId: string;
  agreementType: AgreementType;
  monthlyPriceCents: number;
  currency: string;
  effectiveFrom: string;     // ISO 8601
  effectiveTo: string | null; // null = indefinite
  status: AgreementStatus;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

// Agreement module membership
export interface AgreementModule {
  id: string;
  agreementId: string;
  moduleKey: ModuleKey;
}

// Agreement usage limit
export interface AgreementUsageLimit {
  id: string;
  agreementId: string;
  metricKey: UsageLimitMetricKey;
  includedQuantity: number;
  policy: UsageLimitPolicy;
  /** Overage price per unit in integer cents. null = no overage pricing defined. */
  overagePriceCents: number | null;
  /** Currency for overage pricing. null if no overage pricing. */
  overageCurrency: string | null;
}

// Input types for creating/updating agreements
export interface CreateAgreementInput {
  organizationId: string;
  agreementType: AgreementType;
  monthlyPriceCents: number;
  currency: string;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  note?: string;
  includedModuleKeys: ModuleKey[];
  usageLimits?: CreateUsageLimitInput[];
}

export interface CreateUsageLimitInput {
  metricKey: UsageLimitMetricKey;
  includedQuantity: number;
  policy: UsageLimitPolicy;
  /** Overage price per unit in integer cents. null = no overage pricing defined. */
  overagePriceCents?: number | null;
  /** Currency for overage pricing. Required if overagePriceCents is set. */
  overageCurrency?: string | null;
}

// Billing preview integration
export interface BundleBillingLineItem {
  agreementId: string;
  agreementType: AgreementType;
  monthlyPriceCents: number;
  currency: string;
  includedModuleKeys: ModuleKey[];
  note: string | null;
}

// Full agreement with relations loaded
export interface CommercialAgreementFull extends CommercialAgreement {
  modules: AgreementModule[];
  usageLimits: AgreementUsageLimit[];
}

// Usage limit evaluation status
export type UsageLimitEvalStatus =
  | "WITHIN_ALLOWANCE"     // current + proposed <= included
  | "LIMIT_EXCEEDED"       // current + proposed > included
  | "TRACKING_NOT_READY"   // no reliable counter — cannot evaluate
  | "NO_LIMIT_DEFINED";    // no limit for this metric in agreement

// Usage limit check result
export interface UsageLimitCheckResult {
  metricKey: UsageLimitMetricKey;
  status: UsageLimitEvalStatus;
  allowed: boolean;
  currentUsage: number;
  includedQuantity: number;
  remaining: number;
  policy: UsageLimitPolicy;
  trackingReadiness: UsageTrackingReadiness;
  /** Overage info — present only when LIMIT_EXCEEDED and overage pricing exists. */
  overage: {
    excessUnits: number;
    overagePriceCents: number;
    overageCurrency: string;
    overageTotalCents: number;
  } | null;
}

// Usage metric registry — documents what exists
//
// TRACKING_NOT_READY means: no reliable counter exists for this contractual unit.
// This is NOT certified zero consumption — it is honest absence of measurement.
//
export const USAGE_METRIC_READINESS: Record<UsageLimitMetricKey, UsageTrackingReadiness> = {
  ai_credits_monthly:             "PRODUCTION_READY",
  ai_chat_queries_monthly:        "TRACKING_NOT_READY",  // contractual unit ≠ ai_credits
  ai_videos_monthly:              "TRACKING_NOT_READY",  // contract = video COUNT; only videoSeconds exists in DB
  whatsapp_conversations_monthly: "TRACKING_NOT_READY",  // contractual unit ≠ messages
  whatsapp_messages_monthly:      "TRACKING_NOT_READY",
  automation_executions_monthly:  "COUNTER_EXISTS",
  storage_gb:                     "TRACKING_NOT_READY",
  image_units_monthly:            "COUNTER_EXISTS",
  video_seconds_monthly:          "COUNTER_EXISTS",       // internal metric, NOT contractual video count
  accounting_documents_monthly:   "TRACKING_NOT_READY",   // no document counter yet
};

// ── Castillitos contractual limits (proposal 2026-03-09) ──────────────────
// These are the CONTRACTUAL limits from the original customer proposal.
// They use the CUSTOMER'S unit, not Agentik's internal unit.
//
// CASTILLITOS_CONTRACT_LIMITS is a reference constant — it does NOT
// automatically create an agreement. Admin must explicitly configure.

export const CASTILLITOS_CONTRACT_LIMITS: readonly {
  metricKey: UsageLimitMetricKey;
  includedQuantity: number;
  policy: UsageLimitPolicy;
  overagePriceCents: number | null;
  overageCurrency: string | null;
  contractualNote: string;
}[] = [
  {
    metricKey: "whatsapp_conversations_monthly",
    includedQuantity: 2000,
    policy: "SOFT_CAP",
    overagePriceCents: null,
    overageCurrency: null,
    contractualNote: "2000 conversaciones/mes. No overage price defined in proposal.",
  },
  {
    metricKey: "ai_chat_queries_monthly",
    includedQuantity: 2000,
    policy: "SOFT_CAP",
    overagePriceCents: null,
    overageCurrency: null,
    contractualNote: "2000 consultas IA/mes. No overage price defined in proposal.",
  },
  {
    metricKey: "image_units_monthly",
    includedQuantity: 400,
    policy: "SOFT_CAP",
    overagePriceCents: 5,   // USD 0.05 = 5 cents
    overageCurrency: "USD",
    contractualNote: "400 imágenes/mes. Extra: USD 0.05/imagen.",
  },
  {
    metricKey: "ai_videos_monthly",
    includedQuantity: 80,
    policy: "SOFT_CAP",
    overagePriceCents: 50,  // USD 0.50 = 50 cents
    overageCurrency: "USD",
    contractualNote: "80 videos/mes. Extra: USD 0.50/video. Unit = generated video COUNT, NOT seconds.",
  },
  {
    metricKey: "accounting_documents_monthly",
    includedQuantity: 2000,
    policy: "SOFT_CAP",
    overagePriceCents: 2,   // USD 0.02 = 2 cents
    overageCurrency: "USD",
    contractualNote: "2000 documentos contables/mes. Extra: USD 0.02/documento.",
  },
];

// ── Castillitos product mapping (proposal 2026-03-09) ──────────────────────
//
// Maps the 5 contractual functional areas to current Agentik product keys.
//
// Source: Original proposal ("Propuesta comercial Agentik para Castillitos")
//
// CONTRACT AREA                                   → PRODUCT KEYS
// ───────────────────────────────────────────────────────────────────────────
// Automatización de Marketing y Contenido          → marketing_studio
// Ventas, CRM y Agente de WhatsApp                 → sales, whatsapp
// Gestión Administrativa y Financiera Inteligente  → finance, collections
// Producción, Inventarios y Operación              → production
// Módulo Gerencial con IA                          → dashboard, torre_control, copilot
//
// MAPPING RATIONALE for "Módulo Gerencial con IA":
//   dashboard     = Centro de Operaciones (KPIs operativos, panel principal)
//   torre_control = Torre de Control / Executive (vista ejecutiva + alertas estratégicas)
//   copilot       = IA Copilot (consultas de negocio en lenguaje natural,
//                   agente de inteligencia empresarial)
//                   Includes submodules: strategic_memory, prompts, playbooks, ai_lab
//
// These 9 product keys are the FULL contractual coverage.
// Admin must use exactly these when configuring the CUSTOM_BUNDLE agreement.

export const CASTILLITOS_CURRENT_PRODUCT_MAPPING: {
  contractArea: string;
  productKeys: ModuleKey[];
}[] = [
  {
    contractArea: "Automatización de Marketing y Contenido",
    productKeys: ["marketing_studio"],
  },
  {
    contractArea: "Ventas, CRM y Agente de WhatsApp",
    productKeys: ["sales", "whatsapp"],
  },
  {
    contractArea: "Gestión Administrativa y Financiera Inteligente",
    productKeys: ["finance", "collections"],
  },
  {
    contractArea: "Producción, Inventarios y Operación",
    productKeys: ["production"],
  },
  {
    contractArea: "Módulo Gerencial con IA",
    productKeys: ["dashboard", "torre_control", "copilot"],
  },
];

/** All 9 product keys covered by the Castillitos contract. */
export const CASTILLITOS_BUNDLE_MODULE_KEYS: ModuleKey[] =
  CASTILLITOS_CURRENT_PRODUCT_MAPPING.flatMap(m => m.productKeys);
