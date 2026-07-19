/**
 * domains/customer/customer-credit-profile.ts
 *
 * Normalizes raw SAG data into a CustomerCreditProfile.
 * Configuration only — no balances, no payments, no movements.
 * Those belong to CustomerReceivable / CollectionRecord.
 *
 * Sprint: CUSTOMER-SAG-ENRICHMENT-02
 */

import type { CustomerCreditProfile, CreditStatus, FieldEvidence } from "./customer-entities";
import type { CommercialIdentity, CommercialTimestamp, DataSourceMetadata } from "../../contracts";
import { buildCanonicalId } from "../../shared/identifiers";
import { normalizeInteger, normalizeBoolean, normalizeNullableString, normalizeDecimal } from "../../shared/normalizers";

// ── Raw Input ────────────────────────────────────────────────────────────────

export interface CreditProfileRawInput {
  readonly customerTaxId: string;

  /** Credit term in days (SAG DIAS_CREDITO or plazoCredito) */
  readonly plazoCredito?: unknown;

  /** Credit limit amount (SAG ss_cupo_credito) */
  readonly cupoCredito?: unknown;

  /** Credit enabled flag (SAG CREDITO) */
  readonly creditoHabilitado?: unknown;

  /** Commercial block flag (SAG bloqueo) */
  readonly bloqueoComercial?: unknown;

  /** Credit status from SAG */
  readonly estadoCredito?: unknown;

  /** Free-text conditions */
  readonly condicionesCredito?: unknown;

  /** Currency (default COP) */
  readonly moneda?: unknown;
}

// ── Context ──────────────────────────────────────────────────────────────────

export interface CreditProfileContext {
  readonly tenantId: string;
  readonly sourceSystem: string;
  readonly instanceId: string;
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly correlationId: string;
  readonly extractedAt: Date;
}

// ── Builder ──────────────────────────────────────────────────────────────────

export function normalizeCreditProfile(
  raw: CreditProfileRawInput,
  ctx: CreditProfileContext
): CustomerCreditProfile {
  const now = ctx.extractedAt;

  const identity: CommercialIdentity = {
    canonicalId: buildCanonicalId({
      tenantId: ctx.tenantId,
      domain: "CUSTOMER",
      entityType: "CreditProfile",
      naturalKey: raw.customerTaxId,
    }),
    tenantId: ctx.tenantId,
    domain: "CUSTOMER",
    naturalKey: raw.customerTaxId,
  };

  const sourceMetadata: DataSourceMetadata = {
    sourceType: ctx.sourceSystem as any,
    adapterId: ctx.adapterId,
    adapterVersion: ctx.adapterVersion,
    extractedAt: ctx.extractedAt,
    extractionMode: "FULL",
    correlationId: ctx.correlationId,
  };

  const timestamps: CommercialTimestamp = {
    createdAt: now,
    updatedAt: now,
    sourceModifiedAt: null,
    lastSyncAt: ctx.extractedAt,
  };

  // ── Normalize fields ───────────────────────────────────────────────────
  const plazoResult = normalizeInteger(raw.plazoCredito);
  const creditTermDays = plazoResult.ok && plazoResult.value != null ? Math.max(0, plazoResult.value) : 0;

  const cupoResult = normalizeDecimal(raw.cupoCredito);
  const creditLimit = cupoResult.ok && cupoResult.value != null ? cupoResult.value : null;

  const bloqueoResult = normalizeBoolean(raw.bloqueoComercial);
  const isBlocked = bloqueoResult.ok ? (bloqueoResult.value ?? false) : false;

  const creditoHabilitadoResult = normalizeBoolean(raw.creditoHabilitado);
  const condResult = normalizeNullableString(raw.condicionesCredito);
  const monedaResult = normalizeNullableString(raw.moneda);

  const creditStatus = deriveCreditStatus(
    creditoHabilitadoResult.ok ? creditoHabilitadoResult.value ?? null : null,
    isBlocked,
    creditTermDays,
    normalizeNullableString(raw.estadoCredito).ok ? normalizeNullableString(raw.estadoCredito).value : null
  );

  // ── Evidence ───────────────────────────────────────────────────────────
  const creditTermEvidence: FieldEvidence | null = raw.plazoCredito != null
    ? { source: "SAG", quality: "CONFIRMED", observedAt: now, rawValue: raw.plazoCredito, confidence: 0.9, note: null }
    : null;

  const creditLimitEvidence: FieldEvidence | null = creditLimit != null
    ? { source: "SAG", quality: "CONFIRMED", observedAt: now, rawValue: raw.cupoCredito, confidence: 0.9, note: null }
    : null;

  const blockEvidence: FieldEvidence | null = raw.bloqueoComercial != null
    ? { source: "SAG", quality: "CONFIRMED", observedAt: now, rawValue: raw.bloqueoComercial, confidence: 1.0, note: isBlocked ? "Customer has commercial credit block." : null }
    : null;

  return {
    identity,
    sourceMetadata,
    timestamps,
    schemaVersion: 1,
    customerTaxId: raw.customerTaxId,
    creditTermDays,
    creditLimit,
    creditLimitCurrency: monedaResult.ok && monedaResult.value ? monedaResult.value : "COP",
    isBlocked,
    creditStatus,
    conditions: condResult.ok ? condResult.value : null,
    creditTermEvidence,
    creditLimitEvidence,
    blockEvidence,
  };
}

// ── Derive Credit Status ─────────────────────────────────────────────────────

function deriveCreditStatus(
  creditEnabled: boolean | null,
  isBlocked: boolean,
  creditTermDays: number,
  rawEstado: string | null
): CreditStatus {
  // Explicit block
  if (isBlocked) return "BLOCKED";

  // Explicit raw status
  if (rawEstado != null) {
    const upper = rawEstado.toUpperCase().trim();
    if (upper === "APROBADO" || upper === "APPROVED" || upper === "ACTIVO") return "APPROVED";
    if (upper === "BLOQUEADO" || upper === "BLOCKED") return "BLOCKED";
    if (upper === "PENDIENTE" || upper === "PENDING") return "PENDING";
  }

  // Enabled flag
  if (creditEnabled === false) return "NOT_CONFIGURED";
  if (creditEnabled === true) return "APPROVED";

  // Infer from credit term
  if (creditTermDays > 0) return "APPROVED";

  return "UNKNOWN";
}
