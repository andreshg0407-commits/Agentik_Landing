/**
 * contracts/external-reference.ts
 *
 * Contract for referencing records in external systems (ERP, CRM, etc.).
 */

// ── External Reference ──────────────────────────────────────────────────────

export interface ExternalReference {
  /** Identifier in the external system */
  readonly externalId: string;

  /** System that owns this reference */
  readonly system: ExternalSystem;

  /** Table or resource within the system */
  readonly resource: string;

  /** Optional secondary key (e.g., composite PKs) */
  readonly secondaryId?: string;

  /** Raw external data preserved for audit/debugging */
  readonly rawPayload?: Record<string, unknown>;
}

// ── External System ─────────────────────────────────────────────────────────

export interface ExternalSystem {
  /** System type identifier */
  readonly type: ExternalSystemType;

  /** Instance identifier (for multi-instance ERPs) */
  readonly instanceId: string;

  /** Human-readable label */
  readonly label: string;
}

export type ExternalSystemType =
  | "SAG_PYA"
  | "SIIGO"
  | "SUITECRM"
  | "WMS"
  | "POS"
  | "CUSTOM";
