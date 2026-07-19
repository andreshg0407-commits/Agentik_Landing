/**
 * lib/comercial/tiendas/store-transfer-types.ts
 *
 * Type system for store replenishment proposals.
 * Pure types — no runtime logic, no Prisma.
 *
 * Sprint: COMERCIAL-TIENDAS-TRANSFERENCIAS-04
 */

// ── Proposal status lifecycle ────────────────────────────────────────────────

export type ProposalStatus =
  | "borrador"
  | "en_revision"
  | "aprobado"
  | "rechazado"
  | "preparado_para_sag"
  | "enviado_sag"
  | "error_sag"
  | "archivado";

// ── Line types ──────────────────────────────────────────────────────────────

export type ProposalLineType =
  | "transferencia_exacta"
  | "transferencia_parcial"
  | "produccion_sugerida"
  | "alternativa_secundaria";

// ── Proposal line ───────────────────────────────────────────────────────────

export interface StoreReplenishmentProposalLine {
  id:              string;
  referenceCode:   string;
  productName:     string;
  size:            string;
  color:           string;
  missingUnits:    number;
  availableInMain: number;
  transferUnits:   number;
  productionUnits: number;
  lineType:        ProposalLineType;
  comment:         string;
  removed:         boolean;
}

// ── SAG payload (prepared, not sent) ────────────────────────────────────────

export type SagMovementType = "transfer" | "production_request";

export interface SagPayloadLine {
  referenceCode: string;
  size:          string;
  color:         string;
  quantity:      number;
  movementType:  SagMovementType;
}

export interface PreparedSagPayload {
  sourceWarehouseCode: string;
  targetWarehouseCode: string;
  lines:               SagPayloadLine[];
}

// ── Proposal summary ────────────────────────────────────────────────────────

export interface ProposalSummary {
  totalLines:          number;
  activeLines:         number;
  exactTransferUnits:  number;
  partialTransferUnits: number;
  productionUnits:     number;
  alternativeUnits:    number;
  totalTransferUnits:  number;
  totalProductionUnits: number;
}

// ── Full proposal ───────────────────────────────────────────────────────────

export interface StoreReplenishmentProposal {
  id:                    string;
  storeId:               string;
  storeName:             string;
  sourceWarehouseCode:   string;
  sourceWarehouseName:   string;
  targetWarehouseCode:   string;
  lines:                 StoreReplenishmentProposalLine[];
  summary:               ProposalSummary;
  status:                ProposalStatus;
  preparedSagPayload:    PreparedSagPayload | null;
  createdBy:             string;
  createdAt:             string;
  updatedAt:             string;
}

// ── Proposal card (for list view) ───────────────────────────────────────────

export interface ProposalCard {
  id:              string;
  storeId:         string;
  storeName:       string;
  status:          ProposalStatus;
  activeLines:     number;
  transferUnits:   number;
  productionUnits: number;
  createdAt:       string;
  updatedAt:       string;
}

// ── Duplicate check result ──────────────────────────────────────────────────

export interface DuplicateCheckResult {
  hasDuplicate:     boolean;
  existingProposal: ProposalCard | null;
}
