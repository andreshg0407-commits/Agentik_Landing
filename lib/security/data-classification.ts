/**
 * lib/security/data-classification.ts
 *
 * Agentik — Security Foundation — Data Classification
 * Sprint: AGENTIK-SECURITY-FOUNDATION-01
 *
 * Deterministic, keyword-based data sensitivity classification.
 * No AI. No embeddings. No server-only. No Prisma.
 *
 * Classification hierarchy:
 *   RESTRICTED   — tokens, certificates, passwords, credentials
 *   CONFIDENTIAL — financial data, memory, playbooks, executive data, customer/employee records
 *   INTERNAL     — operational data, reports, logs, configurations
 *   PUBLIC       — publicly accessible content
 *
 * Fail-safe: unknown or unlabeled data defaults to INTERNAL.
 */

import type { DataSensitivity } from "./security-types";

// ── Keyword Maps ──────────────────────────────────────────────────────────────

/** Keywords that classify data as RESTRICTED (highest sensitivity). */
const RESTRICTED_KEYWORDS: string[] = [
  "token",
  "api_key",
  "apikey",
  "secret",
  "password",
  "contraseña",
  "clave",
  "credential",
  "credencial",
  "certificate",
  "certificado",
  "private_key",
  "private key",
  "pkcs12",
  "p12",
  "ssl",
  "tls",
  "oauth",
  "access_token",
  "refresh_token",
  "bearer",
  "webhook_secret",
  "dian_certificate",
  "dian_token",
  "bank_credential",
  "banking_credential",
  "pin",
  "signing_key",
];

/** Keywords that classify data as CONFIDENTIAL. */
const CONFIDENTIAL_KEYWORDS: string[] = [
  "financial",
  "financiero",
  "finanzas",
  "revenue",
  "ingresos",
  "profit",
  "ganancia",
  "margen",
  "margin",
  "budget",
  "presupuesto",
  "cash",
  "caja",
  "treasury",
  "tesorería",
  "bank_account",
  "cuenta_bancaria",
  "invoice",
  "factura",
  "payment",
  "pago",
  "cartera",
  "portfolio",
  "collections",
  "cobros",
  "overdue",
  "mora",
  "customer_record",
  "registro_cliente",
  "cliente",
  "employee",
  "empleado",
  "employee_record",
  "nómina",
  "nomina",
  "payroll",
  "salary",
  "salario",
  "strategic",
  "estratégico",
  "executive",
  "ejecutivo",
  "playbook",
  "memory",
  "memoria",
  "insight",
  "intelligence",
  "inteligencia",
  "reconciliation",
  "conciliacion",
  "conciliación",
  "cierre",
  "closing",
  "tax",
  "impuesto",
  "audit",
  "auditoría",
  "legal",
  "contract",
  "contrato",
  "third_party",
  "tercero",
  "proveedor",
  "vendor",
  "supplier",
];

/** Keywords that classify data as INTERNAL. */
const INTERNAL_KEYWORDS: string[] = [
  "report",
  "reporte",
  "log",
  "config",
  "configuración",
  "settings",
  "operational",
  "operacional",
  "task",
  "tarea",
  "workflow",
  "execution",
  "ejecución",
  "integration",
  "integration_status",
  "notification",
  "alert",
  "alerta",
  "metric",
  "métrica",
  "dashboard",
  "summary",
  "resumen",
];

// ── Classification Result ─────────────────────────────────────────────────────

export interface ClassificationResult {
  /** The determined sensitivity level. */
  sensitivity:    DataSensitivity;
  /** Why this classification was chosen. */
  reason:         string;
  /** Keywords that triggered the classification. */
  matchedKeywords: string[];
}

// ── Core Classifier ───────────────────────────────────────────────────────────

/**
 * classifyData — deterministic data sensitivity classification.
 *
 * Evaluates a resource label, type, or description against keyword maps.
 * Returns the highest matching sensitivity level.
 *
 * @param label       — resource name, type, or description to classify
 * @param contextTags — optional additional tags for classification hints
 */
export function classifyData(
  label:        string,
  contextTags:  string[] = [],
): ClassificationResult {
  const normalized = `${label} ${contextTags.join(" ")}`.toLowerCase();

  // Check RESTRICTED first (highest priority)
  const restrictedMatches = RESTRICTED_KEYWORDS.filter(kw => normalized.includes(kw));
  if (restrictedMatches.length > 0) {
    return {
      sensitivity:     "RESTRICTED",
      reason:          "Resource contains secret, credential, or certificate data.",
      matchedKeywords: restrictedMatches,
    };
  }

  // Check CONFIDENTIAL
  const confidentialMatches = CONFIDENTIAL_KEYWORDS.filter(kw => normalized.includes(kw));
  if (confidentialMatches.length > 0) {
    return {
      sensitivity:     "CONFIDENTIAL",
      reason:          "Resource contains financial, personal, or strategic business data.",
      matchedKeywords: confidentialMatches,
    };
  }

  // Check INTERNAL
  const internalMatches = INTERNAL_KEYWORDS.filter(kw => normalized.includes(kw));
  if (internalMatches.length > 0) {
    return {
      sensitivity:     "INTERNAL",
      reason:          "Resource contains operational or configuration data.",
      matchedKeywords: internalMatches,
    };
  }

  // Default: INTERNAL (fail safe — not PUBLIC, not secret, but not fully open)
  return {
    sensitivity:     "INTERNAL",
    reason:          "No classification keywords matched — defaulting to INTERNAL (fail safe).",
    matchedKeywords: [],
  };
}

/**
 * classifyResourceById — classify by well-known Agentik resource identifiers.
 *
 * Provides explicit classification for known platform resources.
 * Falls back to classifyData() for unknown identifiers.
 */
export function classifyResourceById(resourceId: string): ClassificationResult {
  const id = resourceId.toLowerCase();

  // Explicit overrides for well-known resources
  const EXPLICIT_MAP: Record<string, DataSensitivity> = {
    "ai_token":           "RESTRICTED",
    "whatsapp_token":     "RESTRICTED",
    "dian_certificate":   "RESTRICTED",
    "bank_account":       "RESTRICTED",
    "oauth_token":        "RESTRICTED",
    "webhook_secret":     "RESTRICTED",
    "signing_key":        "RESTRICTED",
    "copilot_memory":     "CONFIDENTIAL",
    "playbook":           "CONFIDENTIAL",
    "executive_context":  "CONFIDENTIAL",
    "customer_record":    "CONFIDENTIAL",
    "employee_record":    "CONFIDENTIAL",
    "financial_report":   "CONFIDENTIAL",
    "reconciliation":     "CONFIDENTIAL",
    "treasury":           "CONFIDENTIAL",
    "integration_config": "INTERNAL",
    "workflow_run":       "INTERNAL",
    "task":               "INTERNAL",
    "notification":       "INTERNAL",
  };

  for (const [key, sensitivity] of Object.entries(EXPLICIT_MAP)) {
    if (id.includes(key)) {
      return {
        sensitivity,
        reason:          `Known resource type "${key}" maps to ${sensitivity}.`,
        matchedKeywords: [key],
      };
    }
  }

  // Fall back to keyword classification
  return classifyData(resourceId);
}

/**
 * isHighSensitivity — true when data is CONFIDENTIAL or RESTRICTED.
 */
export function isHighSensitivity(sensitivity: DataSensitivity): boolean {
  return sensitivity === "CONFIDENTIAL" || sensitivity === "RESTRICTED";
}

/**
 * requiresAudit — true when access to this data must be audited.
 */
export function requiresAudit(sensitivity: DataSensitivity): boolean {
  return sensitivity === "CONFIDENTIAL" || sensitivity === "RESTRICTED";
}

/**
 * requiresEncryption — true when this data must be encrypted at rest.
 * (Implementation deferred to AGENTIK-SECURITY-ENCRYPTION-01)
 */
export function requiresEncryption(sensitivity: DataSensitivity): boolean {
  return sensitivity === "RESTRICTED";
}
