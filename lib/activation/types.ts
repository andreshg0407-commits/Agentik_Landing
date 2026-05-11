/**
 * lib/activation/types.ts
 *
 * Sprint TA-04 — Shared types for the Connector Activation domain.
 *
 * These types form the contracts for:
 *   - Connector validation (Phase C)
 *   - FUENTES discovery (Phase D)
 *   - Connector provisioning (Phase E)
 *   - Activation diagnostics (Phase F)
 *
 * Design rules:
 *   - All types are provider-agnostic unless explicitly scoped.
 *   - Monetary / ERP-specific semantics stay in adapters, not here.
 *   - No Prisma imports — this file has zero DB dependencies.
 *   - Stateless data-only; no functions.
 */

// ── Activation lifecycle ──────────────────────────────────────────────────────

/**
 * Canonical activation steps in order.
 * Each step maps to one OnboardingChecklist boolean field.
 *
 * Steps may be skipped when not applicable (e.g. shopify_connected for
 * an ERP-only tenant), but order is preserved for diagnostic reporting.
 */
export type ActivationStep =
  | "organization_created"     // Org row exists in DB
  | "erp_connected"            // Connector row created, credentials stored
  | "erp_validated"            // testConnection() returned ok: true
  | "fuentes_verified"         // FUENTES map discovered (SAG only)
  | "initial_sync_completed"   // At least one successful sync run per module
  | "modules_enabled"          // TenantModule rows written for chosen bundle
  | "shopify_connected"        // Shopify connector active (opt-in)
  | "whatsapp_connected"       // WhatsApp connector active (opt-in)
  | "onboarding_complete";     // All required steps done, completedAt set

// ── Provider registry ─────────────────────────────────────────────────────────

/**
 * Known provider identifiers.
 * Matches the `source` field stored in Connector.source in Prisma.
 *
 * sag_pya_soap — SAG PYA SOAP (ERP, receivables, movements, collections)
 * siigo        — Siigo accounting ERP (future)
 * shopify      — Shopify e-commerce (orders, products, customers)
 * whatsapp     — WhatsApp Business (conversations, opt-in)
 * tiktok       — TikTok Ads / TikTok Shop (future)
 * meta_ads     — Meta (Facebook + Instagram) Ads (future)
 */
export type ActivationProvider =
  | "sag_pya_soap"
  | "siigo"
  | "shopify"
  | "whatsapp"
  | "tiktok"
  | "meta_ads";

// ── Diagnostics ───────────────────────────────────────────────────────────────

/**
 * Structured diagnostic object emitted at each activation step.
 *
 * Powers:
 *   - Onboarding UI progress indicators
 *   - Copilot onboarding assistant (future)
 *   - Tenant activation dashboard (future)
 *   - Admin remediation scripts
 */
export interface ActivationDiagnostic {
  success:         boolean;
  step:            ActivationStep;
  /** Machine-readable failure code. Undefined when success = true. */
  reason?:
    | "connectivity_failed"
    | "authentication_failed"
    | "database_not_found"
    | "missing_fuentes_rows"
    | "empty_sample"
    | "org_not_found"
    | "connector_create_failed"
    | "checklist_update_failed"
    | "unsupported_provider"
    | "unknown";
  /** Human-readable explanation of the failure. */
  message?:        string;
  /** Non-fatal issues detected during validation. */
  warnings:        string[];
  /** Actionable next steps for the operator. */
  recommendations: string[];
  /** Extra diagnostic data (row counts, detected values, etc). */
  metadata:        Record<string, unknown>;
}

// ── Connector validation ───────────────────────────────────────────────────────

/**
 * Input to validateConnector().
 * Credentials are passed as a typed-safe opaque blob per provider.
 */
export interface ConnectorValidationInput {
  provider:     ActivationProvider;
  credentials:  Record<string, unknown>;
}

/**
 * Normalised validation result.
 *
 * `step` indicates how far the validation pipeline progressed before
 * stopping. On success all 4 steps have been passed.
 */
export interface ConnectorValidationResult {
  ok:               boolean;
  provider:         ActivationProvider;
  /** Last step attempted. */
  step:             "connectivity" | "authentication" | "metadata" | "sample_data";
  /** Detected company/database name from the ERP (for display). */
  companyName?:     string;
  /** Database identifier returned or inferred by the ERP. */
  detectedDatabase?: string;
  /** Row count from the sample probe query. */
  sampleRowCount?:  number;
  warnings:         string[];
  errors:           string[];
  /** Provider-specific extra metadata (e.g. SAG s_empresa, token expiry). */
  metadata:         Record<string, unknown>;
}

// ── FUENTES discovery ─────────────────────────────────────────────────────────

/**
 * One row from the SAG FUENTES table, normalised to camelCase.
 *
 * Original SAG column names (confirmed from live 2026-04-11):
 *   ka_ni_fuente        — integer PK
 *   k_sc_codigo_fuente  — short code (e.g. "FE", "R1", "PD")
 *   sc_descripcion      — human label (e.g. "Factura Electrónica Empresa")
 *   sc_cobrar_pagar     — 'C' = AR (Cobrar) | 'P' = AP (Pagar)
 *   k_n_clase_fuente    — class: 4 = customer order (PD)
 */
export interface FuenteRow {
  kaNiFuente:     number;
  codigoFuente:   string;
  descripcion?:   string;
  cobrarPagar?:   "C" | "P" | string;
  claseFuente?:   number;
}

/**
 * Full FUENTES discovery report.
 *
 * `fuentesMap` is the ready-to-store Record<number, string> intended for
 * connector.config.fuentesMap (TA-03 contract).
 */
export interface FuentesDiscoveryResult {
  ok:          boolean;
  rows:        FuenteRow[];
  /** kaNiFuente (number) → codigoFuente. Ready for connector.config.fuentesMap. */
  fuentesMap:  Record<number, string>;
  warnings:    string[];
  errors:      string[];
  summary: {
    total:        number;
    /** Codes where sc_cobrar_pagar = 'C' (AR documents). */
    arCodes:      string[];
    /** Codes where sc_cobrar_pagar = 'P' (AP payables). */
    apCodes:      string[];
    /** Codes where k_n_clase_fuente = 4 (customer orders). */
    orderCodes:   string[];
  };
}

// ── Provisioning ──────────────────────────────────────────────────────────────

/**
 * Input to provisionConnector().
 * All fields are org-scoped and provider-agnostic.
 */
export interface ProvisionConnectorInput {
  organizationId: string;
  provider:       ActivationProvider;
  /** Display name for the connector (shown in UI). */
  name:           string;
  /** Provider-specific credentials. Stored encrypted in Connector.config. */
  credentials:    Record<string, unknown>;
  /**
   * ERP metadata detected during validation (e.g. companyName, databaseId).
   * Merged into Connector.config for traceability.
   */
  metadata?:      Record<string, unknown>;
  /**
   * FUENTES registry (sag_pya_soap only).
   * Key = kaNiFuente (number), value = codigoFuente (string).
   * When absent, adapter falls back to Castillitos rules.
   */
  fuentesMap?:    Record<number, string>;
  /**
   * Sync modules to enable on this connector.
   * When omitted, provider default modules are used.
   */
  modules?:       string[];
  /**
   * Whether to skip validation before provisioning.
   * Only set true when credentials were already validated in a prior step.
   * Default: false.
   */
  skipValidation?: boolean;
}

/**
 * Result of provisionConnector().
 *
 * Always returns a full diagnostics array so the caller can present
 * step-by-step progress regardless of success or failure.
 */
export interface ProvisionResult {
  ok:          boolean;
  connectorId?: string;
  diagnostics: ActivationDiagnostic[];
  warnings:    string[];
  errors:      string[];
}

// ── Provider defaults ─────────────────────────────────────────────────────────

/**
 * Default sync modules per provider.
 * Used when ProvisionConnectorInput.modules is not specified.
 */
export const PROVIDER_DEFAULT_MODULES: Record<ActivationProvider, string[]> = {
  sag_pya_soap: ["customers", "receivables", "movements"],
  siigo:        ["customers", "invoices"],
  shopify:      ["orders", "customers", "inventory"],
  whatsapp:     [],
  tiktok:       [],
  meta_ads:     [],
};

/**
 * Whether a provider requires FUENTES discovery during activation.
 * Currently only SAG PYA SOAP needs it; other providers do not have FUENTES.
 */
export const PROVIDER_NEEDS_FUENTES: Record<ActivationProvider, boolean> = {
  sag_pya_soap: true,
  siigo:        false,
  shopify:      false,
  whatsapp:     false,
  tiktok:       false,
  meta_ads:     false,
};
