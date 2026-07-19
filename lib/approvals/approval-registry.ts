/**
 * lib/approvals/approval-registry.ts
 *
 * Agentik — Approval Category Registry
 * Sprint: AGENTIK-APPROVALS-FOUNDATION-01
 *
 * Registers all approval sub-types per category.
 * Each entry describes a specific approval kind that can be requested
 * within a given business category.
 *
 * No React. No Prisma. No side effects.
 */

import type { ApprovalCategory } from "./approval-types";

// ── Registry entry ────────────────────────────────────────────────────────────

export interface ApprovalRegistryEntry {
  /** Unique key within the category. */
  key:                  string;
  /** Human-readable label for this approval type. */
  label:                string;
  /** Short description of what is being approved. */
  description:          string;
  /** Whether the approver must provide a comment when deciding. */
  requiresComment:      boolean;
  /** Whether this approval type supports an expiration date. */
  supportsExpiration:   boolean;
}

export type ApprovalRegistry = Record<ApprovalCategory, ApprovalRegistryEntry[]>;

// ── Registry ──────────────────────────────────────────────────────────────────

export const APPROVAL_REGISTRY: ApprovalRegistry = {

  FINANCIAL: [
    {
      key:                "extraordinary_payment",
      label:              "Pago extraordinario",
      description:        "Autorización de pago fuera de ciclo ordinario.",
      requiresComment:    true,
      supportsExpiration: true,
    },
    {
      key:                "bank_transfer",
      label:              "Transferencia bancaria",
      description:        "Autorización de transferencia entre cuentas.",
      requiresComment:    true,
      supportsExpiration: true,
    },
    {
      key:                "disbursement",
      label:              "Desembolso",
      description:        "Liberación de fondos para un fin específico.",
      requiresComment:    true,
      supportsExpiration: true,
    },
  ],

  COLLECTIONS: [
    {
      key:                "portfolio_write_off",
      label:              "Castigo cartera",
      description:        "Autorización para castigar saldo en mora.",
      requiresComment:    true,
      supportsExpiration: false,
    },
    {
      key:                "payment_agreement",
      label:              "Acuerdo de pago",
      description:        "Aprobación de acuerdo de pago con cliente.",
      requiresComment:    true,
      supportsExpiration: true,
    },
  ],

  COMMERCIAL: [
    {
      key:                "special_discount",
      label:              "Descuento especial",
      description:        "Autorización de descuento fuera de política comercial.",
      requiresComment:    true,
      supportsExpiration: true,
    },
    {
      key:                "inventory_transfer",
      label:              "Transferencia inventario",
      description:        "Autorización de movimiento de inventario entre puntos.",
      requiresComment:    false,
      supportsExpiration: false,
    },
  ],

  INVENTORY: [
    {
      key:                "inventory_adjustment",
      label:              "Ajuste inventario",
      description:        "Autorización de ajuste de cantidad en inventario.",
      requiresComment:    true,
      supportsExpiration: false,
    },
    {
      key:                "extraordinary_exit",
      label:              "Salida extraordinaria",
      description:        "Autorización de salida de mercancía fuera de ciclo.",
      requiresComment:    true,
      supportsExpiration: true,
    },
  ],

  MARKETING: [
    {
      key:                "campaign_approval",
      label:              "Campaña",
      description:        "Aprobación de campaña de marketing para publicación.",
      requiresComment:    false,
      supportsExpiration: true,
    },
    {
      key:                "budget_approval",
      label:              "Presupuesto",
      description:        "Autorización de presupuesto para campaña o acción.",
      requiresComment:    true,
      supportsExpiration: true,
    },
  ],

  OPERATIONS: [
    {
      key:                "operational_change",
      label:              "Cambio operativo",
      description:        "Autorización de cambio en proceso o procedimiento operativo.",
      requiresComment:    true,
      supportsExpiration: false,
    },
  ],

  COMPLIANCE: [
    {
      key:                "required_validation",
      label:              "Validación requerida",
      description:        "Validación obligatoria de cumplimiento normativo.",
      requiresComment:    true,
      supportsExpiration: false,
    },
  ],

  CUSTOM: [
    {
      key:                "custom_approval",
      label:              "Aprobación personalizada",
      description:        "Aprobación definida por el módulo o usuario.",
      requiresComment:    false,
      supportsExpiration: true,
    },
  ],

};

// ── Accessors ─────────────────────────────────────────────────────────────────

/**
 * Get all registry entries for a given category.
 */
export function getApprovalsByCategory(
  category: ApprovalCategory,
): ApprovalRegistryEntry[] {
  return APPROVAL_REGISTRY[category] ?? [];
}

/**
 * Find a specific entry by category + key.
 */
export function findApprovalEntry(
  category: ApprovalCategory,
  key:      string,
): ApprovalRegistryEntry | undefined {
  return APPROVAL_REGISTRY[category]?.find(e => e.key === key);
}
