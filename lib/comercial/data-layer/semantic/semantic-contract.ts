/**
 * semantic/semantic-contract.ts
 *
 * Semantic layer infrastructure contracts.
 * Translates physical ERP codes into canonical business concepts.
 */

// ── Semantic Mapping Contract ───────────────────────────────────────────────

export interface SemanticMappingContract<TPhysical, TCanonical> {
  /** Map a physical code to its canonical concept */
  resolve(physical: TPhysical): SemanticResolution<TCanonical> | null;

  /** List all known mappings */
  listMappings(): SemanticMapping<TPhysical, TCanonical>[];

  /** Check if a physical code is recognized */
  isKnown(physical: TPhysical): boolean;
}

// ── Semantic Resolution ─────────────────────────────────────────────────────

export interface SemanticResolution<TCanonical> {
  /** The resolved canonical concept */
  readonly concept: TCanonical;

  /** Confidence of this resolution (0..1) */
  readonly confidence: number;

  /** Evidence supporting this resolution */
  readonly evidence: SemanticEvidence;
}

// ── Semantic Evidence ───────────────────────────────────────────────────────

export interface SemanticEvidence {
  /** How was this mapping established */
  readonly source: SemanticEvidenceSource;

  /** Human-readable explanation */
  readonly explanation: string;

  /** When this evidence was last verified */
  readonly verifiedAt: Date;
}

export type SemanticEvidenceSource =
  | "DOCUMENTATION"
  | "HEURISTIC"
  | "USER_CONFIRMED"
  | "INFERRED";

// ── Semantic Mapping ────────────────────────────────────────────────────────

export interface SemanticMapping<TPhysical, TCanonical> {
  readonly physical: TPhysical;
  readonly canonical: TCanonical;
  readonly confidence: number;
  readonly source: SemanticEvidenceSource;
}

// ── Semantic Normalizer ─────────────────────────────────────────────────────

export interface SemanticNormalizer<TInput, TOutput> {
  /** Normalize a raw value into its canonical form */
  normalize(input: TInput): SemanticNormalizationResult<TOutput>;
}

export interface SemanticNormalizationResult<T> {
  readonly normalized: T | null;
  readonly original: unknown;
  readonly confidence: number;
  readonly lossless: boolean;
}

// ── Semantic Validation ─────────────────────────────────────────────────────

export interface SemanticValidation {
  /** Validate that a canonical value is semantically correct */
  validate(value: unknown, concept: string): SemanticValidationResult;
}

export interface SemanticValidationResult {
  readonly valid: boolean;
  readonly issues: SemanticValidationIssue[];
}

export interface SemanticValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly severity: "ERROR" | "WARNING";
}

// ── Semantic Confidence ─────────────────────────────────────────────────────

export interface SemanticConfidence {
  /** Overall confidence of the semantic interpretation */
  readonly score: number;

  /** Factors that contribute to this confidence */
  readonly factors: SemanticConfidenceFactor[];
}

export interface SemanticConfidenceFactor {
  readonly name: string;
  readonly score: number;
  readonly weight: number;
}
