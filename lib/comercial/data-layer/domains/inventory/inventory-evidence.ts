/**
 * domains/inventory/inventory-evidence.ts
 *
 * Evidence chains: provenance and trustworthiness of inventory data.
 * Every inventory position should be traceable back to its source.
 *
 * Sprint: INVENTORY-DOMAIN-01
 */

// -- Evidence Level ---------------------------------------------------------

export type InventoryEvidenceLevel =
  | "OPERATIONALLY_VALIDATED"  // Confirmed via live sync + cross-domain check
  | "SYNC_CONFIRMED"          // Came from a successful sync run
  | "MANUAL_ENTRY"            // Entered manually (upload, form)
  | "DERIVED"                 // Calculated from other data
  | "ESTIMATED"               // No direct observation, inferred
  | "UNKNOWN";                // No provenance information

// -- Evidence Record --------------------------------------------------------

export interface InventoryEvidence {
  /** Product reference code */
  readonly referenceCode: string;
  /** Location code */
  readonly locationCode: string;

  /** Evidence level for this position */
  readonly level: InventoryEvidenceLevel;

  /** Source system that provided this data */
  readonly sourceSystem: string;
  /** Adapter that processed the data */
  readonly adapterId: string;
  /** Correlation ID of the sync run */
  readonly correlationId: string;

  /** When the source system last confirmed this value */
  readonly confirmedAt: Date;
  /** How old the evidence is (seconds since confirmation) */
  readonly ageSeconds: number;

  /** Whether a cross-domain validation was performed */
  readonly crossValidated: boolean;
  /** Cross-validation result (null if not performed) */
  readonly crossValidationResult: CrossValidationResult | null;

  /** Confidence score 0.0 - 1.0 */
  readonly confidence: number;

  /** Human-readable provenance description */
  readonly provenance: string;
}

// -- Cross Validation -------------------------------------------------------

export interface CrossValidationResult {
  /** Domains that were checked */
  readonly domainsChecked: string[];
  /** Whether all domains agree */
  readonly consistent: boolean;
  /** Discrepancies found */
  readonly discrepancies: CrossValidationDiscrepancy[];
}

export interface CrossValidationDiscrepancy {
  readonly domain: string;
  readonly field: string;
  readonly expectedValue: unknown;
  readonly observedValue: unknown;
  readonly severity: "LOW" | "MEDIUM" | "HIGH";
}

// -- Evidence Summary -------------------------------------------------------

export interface InventoryEvidenceSummary {
  readonly tenantId: string;
  readonly observedAt: Date;
  /** Distribution by evidence level */
  readonly distribution: Record<InventoryEvidenceLevel, number>;
  /** Total positions with evidence */
  readonly totalPositions: number;
  /** Average confidence */
  readonly averageConfidence: number;
  /** Positions with no evidence */
  readonly unknownCount: number;
}
