/**
 * lib/comercial/clientes/customer-sag-validation.ts
 *
 * Validates whether a customer has sufficient data to create a SAG order.
 * Pure function — no DB access, no side effects.
 *
 * Three readiness levels:
 *   CUSTOMER_IDENTIFIED   — sagCode exists, can be referenced
 *   ORDER_DRAFT_READY     — minimum data for a draft (sagCode + NIT)
 *   SAG_SUBMISSION_READY  — all mandatory SAG PD fields confirmed
 *
 * Sprint: AGENTIK-ORDERS-CUSTOMER-DATA-FOUNDATION-01
 */

import type {
  CanonicalCommercialCustomer,
  SagReadinessResult,
  SagReadinessBlocker,
  SagReadinessStatus,
  CustomerReadinessLevel,
} from "./canonical-customer-types";

/**
 * Validate whether a customer is ready for SAG order creation.
 *
 * READY      — SAG_SUBMISSION_READY: all mandatory fields, can send to SAG
 * DRAFT_ONLY — ORDER_DRAFT_READY or CUSTOMER_IDENTIFIED: can be saved as draft
 * BLOCKED    — not even identifiable as a SAG customer
 */
export function validateCustomerForSagOrder(
  customer: CanonicalCommercialCustomer,
  options?: {
    requireSeller?: boolean;
    requireAddress?: boolean;
    requirePriceList?: boolean;
    requireBranch?: boolean;
  },
): SagReadinessResult {
  const blockers: SagReadinessBlocker[] = [];

  // ── DRAFT_BLOCKER: prevents even draft creation ─────────────────────────
  // These make the customer unusable in any order context.

  if (!customer.sagCode) {
    blockers.push({
      field: "sagCode",
      reason: "Cliente sin codigo SAG — no puede sincronizarse a SAG",
      severity: "DRAFT_BLOCKER",
    });
  }

  // ── SUBMISSION_BLOCKER: prevents SAG submission but allows drafts ────────

  if (!customer.documentNumber && !customer.nitNormalized) {
    blockers.push({
      field: "documentNumber",
      reason: "Cliente sin NIT — requerido para documento SAG",
      severity: "SUBMISSION_BLOCKER",
    });
  }

  // Address: required for dispatch documents
  if (options?.requireAddress !== false && !customer.address) {
    blockers.push({
      field: "address",
      reason: "Direccion faltante — requerida para despacho",
      severity: "SUBMISSION_BLOCKER",
    });
  }

  // Seller: when SAG document requires VENDEDOR
  if (options?.requireSeller && customer.seller.confidence === "UNAVAILABLE") {
    blockers.push({
      field: "seller",
      reason: "Vendedor faltante — SAG requiere vendedor para el documento",
      severity: "SUBMISSION_BLOCKER",
    });
  }

  // Price list: when SAG requires PRECIO_VENTA
  if (options?.requirePriceList && customer.priceList.quality === "UNAVAILABLE") {
    blockers.push({
      field: "priceList",
      reason: "Lista de precios faltante",
      severity: "SUBMISSION_BLOCKER",
    });
  }

  // Branch: when customer has multiple branches and selection is required
  if (options?.requireBranch && customer.hasBranches && customer.branches.length > 1) {
    blockers.push({
      field: "branch",
      reason: "Cliente con multiples sucursales — seleccion requerida",
      severity: "SUBMISSION_BLOCKER",
    });
  }

  // ── Determine level and status ──────────────────────────────────────────

  const draftBlockers = blockers.filter(b => b.severity === "DRAFT_BLOCKER");
  const submissionBlockers = blockers.filter(b => b.severity === "SUBMISSION_BLOCKER");

  let level: CustomerReadinessLevel;
  let status: SagReadinessStatus;

  if (draftBlockers.length > 0) {
    // Cannot even be used in a draft
    level = "CUSTOMER_IDENTIFIED";
    status = "BLOCKED";
  } else if (submissionBlockers.length > 0) {
    // Can create draft but cannot submit to SAG
    level = "ORDER_DRAFT_READY";
    status = "DRAFT_ONLY";
  } else {
    // All mandatory fields present — can submit to SAG
    level = "SAG_SUBMISSION_READY";
    status = "READY";
  }

  return { status, level, blockers };
}

/**
 * Validate a specific branch for SAG order delivery.
 */
export function validateBranchForSagOrder(
  branch: { sagCustomerCode?: string; address?: string; city?: string },
): SagReadinessResult {
  const blockers: SagReadinessBlocker[] = [];

  if (!branch.sagCustomerCode) {
    blockers.push({
      field: "branchSagCode",
      reason: "Sucursal sin codigo SAG",
      severity: "SUBMISSION_BLOCKER",
    });
  }

  if (!branch.address) {
    blockers.push({
      field: "branchAddress",
      reason: "Sucursal sin direccion de entrega",
      severity: "SUBMISSION_BLOCKER",
    });
  }

  const hasBlockers = blockers.length > 0;
  return {
    status: hasBlockers ? "DRAFT_ONLY" : "READY",
    level: hasBlockers ? "ORDER_DRAFT_READY" : "SAG_SUBMISSION_READY",
    blockers,
  };
}
