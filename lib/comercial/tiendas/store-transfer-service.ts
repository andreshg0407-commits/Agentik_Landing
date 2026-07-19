/**
 * lib/comercial/tiendas/store-transfer-service.ts
 *
 * Service for store replenishment proposals.
 * Persists proposals in AgentExecution via metadataJson.
 *
 * SERVER ONLY — never import from client components.
 *
 * Sprint: COMERCIAL-TIENDAS-TRANSFERENCIAS-04
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import type {
  StoreReplenishmentProposal,
  StoreReplenishmentProposalLine,
  ProposalStatus,
  ProposalSummary,
  ProposalCard,
  ProposalLineType,
  DuplicateCheckResult,
  PreparedSagPayload,
  SagPayloadLine,
} from "./store-transfer-types";
import type { ReplenishmentSuggestion, SuggestionType } from "./store-replenishment-types";

// ── Constants ─────────────────────────────────────────────────────────────────

const MODULE    = "comercial";
const OPERATION = "COMERCIAL_STORE_REPLENISHMENT_PROPOSAL";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const execDb = () => (prisma as any).agentExecution;

// ── Active statuses (not terminal) ──────────────────────────────────────────

const ACTIVE_STATUSES: ProposalStatus[] = [
  "borrador",
  "en_revision",
  "aprobado",
  "preparado_para_sag",
];

// ── Suggestion → Line type mapping ──────────────────────────────────────────

const SUGGESTION_TO_LINE: Record<SuggestionType, ProposalLineType> = {
  exact_transfer:       "transferencia_exacta",
  partial_transfer:     "transferencia_parcial",
  production_needed:    "produccion_sugerida",
  substitute_available: "alternativa_secundaria",
};

// ── Summary calculation ─────────────────────────────────────────────────────

function calculateSummary(lines: StoreReplenishmentProposalLine[]): ProposalSummary {
  const active = lines.filter(l => !l.removed);
  let exactTransfer = 0, partialTransfer = 0, production = 0, alternative = 0;

  for (const l of active) {
    switch (l.lineType) {
      case "transferencia_exacta":    exactTransfer   += l.transferUnits; break;
      case "transferencia_parcial":   partialTransfer += l.transferUnits; break;
      case "produccion_sugerida":     production      += l.productionUnits; break;
      case "alternativa_secundaria":  alternative     += l.transferUnits; break;
    }
  }

  return {
    totalLines:           lines.length,
    activeLines:          active.length,
    exactTransferUnits:   exactTransfer,
    partialTransferUnits: partialTransfer,
    productionUnits:      production,
    alternativeUnits:     alternative,
    totalTransferUnits:   exactTransfer + partialTransfer + alternative,
    totalProductionUnits: production,
  };
}

// ── SAG payload builder ─────────────────────────────────────────────────────

function buildSagPayload(
  sourceWarehouseCode: string,
  targetWarehouseCode: string,
  lines: StoreReplenishmentProposalLine[],
): PreparedSagPayload {
  const sagLines: SagPayloadLine[] = [];

  for (const l of lines) {
    if (l.removed) continue;

    if (l.transferUnits > 0) {
      sagLines.push({
        referenceCode: l.referenceCode,
        size:          l.size,
        color:         l.color,
        quantity:      l.transferUnits,
        movementType:  "transfer",
      });
    }

    if (l.productionUnits > 0) {
      sagLines.push({
        referenceCode: l.referenceCode,
        size:          l.size,
        color:         l.color,
        quantity:      l.productionUnits,
        movementType:  "production_request",
      });
    }
  }

  return { sourceWarehouseCode, targetWarehouseCode, lines: sagLines };
}

// ── Row → Proposal mapping ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToProposal(row: any): StoreReplenishmentProposal {
  const meta = (row.metadataJson ?? {}) as Record<string, unknown>;
  const lines = (meta.lines ?? []) as StoreReplenishmentProposalLine[];
  const summary = (meta.summary ?? calculateSummary(lines)) as ProposalSummary;

  return {
    id:                  row.id,
    storeId:             (meta.storeId as string) ?? "",
    storeName:           (meta.storeName as string) ?? "",
    sourceWarehouseCode: (meta.sourceWarehouseCode as string) ?? "",
    sourceWarehouseName: (meta.sourceWarehouseName as string) ?? "",
    targetWarehouseCode: (meta.targetWarehouseCode as string) ?? "",
    lines,
    summary,
    status:              (meta.status as ProposalStatus) ?? row.status ?? "borrador",
    preparedSagPayload:  (meta.preparedSagPayload as PreparedSagPayload | null) ?? null,
    createdBy:           row.createdBy ?? "usuario",
    createdAt:           row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt:           row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt ?? row.createdAt),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToCard(row: any): ProposalCard {
  const meta = (row.metadataJson ?? {}) as Record<string, unknown>;
  const summary = (meta.summary ?? {}) as Partial<ProposalSummary>;

  return {
    id:              row.id,
    storeId:         (meta.storeId as string) ?? "",
    storeName:       (meta.storeName as string) ?? "",
    status:          (meta.status as ProposalStatus) ?? "borrador",
    activeLines:     summary.activeLines ?? 0,
    transferUnits:   summary.totalTransferUnits ?? 0,
    productionUnits: summary.totalProductionUnits ?? 0,
    createdAt:       row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt:       row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt ?? row.createdAt),
  };
}

// ── Duplicate check ─────────────────────────────────────────────────────────

export async function checkDuplicateProposal(
  orgId:   string,
  storeId: string,
): Promise<DuplicateCheckResult> {
  try {
    const rows = await execDb().findMany({
      where: {
        tenantId:  orgId,
        module:    MODULE,
        operation: OPERATION,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const match = rows.find((r: any) => {
      const meta = (r.metadataJson ?? {}) as Record<string, unknown>;
      const status = (meta.status as string) ?? "";
      return (meta.storeId as string) === storeId && ACTIVE_STATUSES.includes(status as ProposalStatus);
    });

    if (match) {
      return { hasDuplicate: true, existingProposal: rowToCard(match) };
    }
  } catch {
    // DB not available — no duplicate found
  }

  return { hasDuplicate: false, existingProposal: null };
}

// ── Create proposal from suggestions ────────────────────────────────────────

export async function createProposalFromSuggestions(
  orgId: string,
  opts: {
    storeId:             string;
    storeName:           string;
    sourceWarehouseCode: string;
    sourceWarehouseName: string;
    targetWarehouseCode: string;
    suggestions:         ReplenishmentSuggestion[];
    createdBy:           string;
  },
): Promise<StoreReplenishmentProposal> {
  const lines: StoreReplenishmentProposalLine[] = opts.suggestions.map((s, i) => ({
    id:              `line-${i + 1}`,
    referenceCode:   s.referenceCode,
    productName:     s.productName,
    size:            s.size,
    color:           s.color,
    missingUnits:    s.missingUnits,
    availableInMain: s.exactAvailableUnits,
    transferUnits:   s.suggestedTransferUnits,
    productionUnits: s.productionSuggestedUnits,
    lineType:        SUGGESTION_TO_LINE[s.suggestionType],
    comment:         "",
    removed:         false,
  }));

  const summary = calculateSummary(lines);
  const now = new Date().toISOString();
  const status: ProposalStatus = "borrador";

  const metadataJson = {
    storeId:             opts.storeId,
    storeName:           opts.storeName,
    sourceWarehouseCode: opts.sourceWarehouseCode,
    sourceWarehouseName: opts.sourceWarehouseName,
    targetWarehouseCode: opts.targetWarehouseCode,
    lines,
    summary,
    status,
    createdBy:           opts.createdBy,
    createdAt:           now,
    updatedAt:           now,
    preparedSagPayload:  null,
  };

  const row = await execDb().create({
    data: {
      tenantId:     orgId,
      module:       MODULE,
      operation:    OPERATION,
      status:       "pending",
      createdBy:    opts.createdBy,
      intent:       `Propuesta de surtido para ${opts.storeName}`,
      metadataJson,
    },
  });

  return rowToProposal(row);
}

// ── Get single proposal ─────────────────────────────────────────────────────

export async function getProposal(
  orgId:      string,
  proposalId: string,
): Promise<StoreReplenishmentProposal | null> {
  try {
    const row = await execDb().findFirst({
      where: {
        id:        proposalId,
        tenantId:  orgId,
        module:    MODULE,
        operation: OPERATION,
      },
    });
    return row ? rowToProposal(row) : null;
  } catch {
    return null;
  }
}

// ── List proposals ──────────────────────────────────────────────────────────

export async function listProposals(orgId: string): Promise<ProposalCard[]> {
  try {
    const rows = await execDb().findMany({
      where: {
        tenantId:  orgId,
        module:    MODULE,
        operation: OPERATION,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rows.map((r: any) => rowToCard(r));
  } catch {
    return [];
  }
}

// ── Update proposal line ────────────────────────────────────────────────────

export async function updateProposalLine(
  orgId:      string,
  proposalId: string,
  lineId:     string,
  updates:    {
    transferUnits?:   number;
    productionUnits?: number;
    comment?:         string;
    removed?:         boolean;
  },
): Promise<StoreReplenishmentProposal | null> {
  const proposal = await getProposal(orgId, proposalId);
  if (!proposal) return null;
  if (proposal.status !== "borrador") return proposal; // only edit in borrador

  const lines = proposal.lines.map(l => {
    if (l.id !== lineId) return l;
    return {
      ...l,
      transferUnits:   updates.transferUnits   ?? l.transferUnits,
      productionUnits: updates.productionUnits ?? l.productionUnits,
      comment:         updates.comment         ?? l.comment,
      removed:         updates.removed         ?? l.removed,
    };
  });

  return await saveProposalLines(orgId, proposalId, lines, proposal.status);
}

// ── Status transitions ──────────────────────────────────────────────────────

export async function submitProposalForReview(
  orgId: string, proposalId: string,
): Promise<StoreReplenishmentProposal | null> {
  return await transitionStatus(orgId, proposalId, "borrador", "en_revision");
}

export async function approveProposal(
  orgId: string, proposalId: string,
): Promise<StoreReplenishmentProposal | null> {
  return await transitionStatus(orgId, proposalId, "en_revision", "aprobado");
}

export async function rejectProposal(
  orgId: string, proposalId: string,
): Promise<StoreReplenishmentProposal | null> {
  return await transitionStatus(orgId, proposalId, "en_revision", "rechazado");
}

export async function returnToDraft(
  orgId: string, proposalId: string,
): Promise<StoreReplenishmentProposal | null> {
  const proposal = await getProposal(orgId, proposalId);
  if (!proposal) return null;
  if (!["en_revision", "aprobado"].includes(proposal.status)) return proposal;
  return await setProposalStatus(orgId, proposalId, "borrador", null);
}

export async function markPreparedForSag(
  orgId: string, proposalId: string,
): Promise<StoreReplenishmentProposal | null> {
  const proposal = await getProposal(orgId, proposalId);
  if (!proposal || proposal.status !== "aprobado") return proposal;

  const payload = buildSagPayload(
    proposal.sourceWarehouseCode,
    proposal.targetWarehouseCode,
    proposal.lines,
  );

  return await setProposalStatus(orgId, proposalId, "preparado_para_sag", payload);
}

export async function archiveProposal(
  orgId: string, proposalId: string,
): Promise<StoreReplenishmentProposal | null> {
  return await setProposalStatus(orgId, proposalId, "archivado", undefined);
}

// ── Internal helpers ────────────────────────────────────────────────────────

async function transitionStatus(
  orgId:      string,
  proposalId: string,
  fromStatus: ProposalStatus,
  toStatus:   ProposalStatus,
): Promise<StoreReplenishmentProposal | null> {
  const proposal = await getProposal(orgId, proposalId);
  if (!proposal) return null;
  if (proposal.status !== fromStatus) return proposal;
  return await setProposalStatus(orgId, proposalId, toStatus, undefined);
}

async function setProposalStatus(
  orgId:      string,
  proposalId: string,
  status:     ProposalStatus,
  sagPayload: PreparedSagPayload | null | undefined,
): Promise<StoreReplenishmentProposal | null> {
  const proposal = await getProposal(orgId, proposalId);
  if (!proposal) return null;

  const now = new Date().toISOString();
  const metadataJson = {
    storeId:             proposal.storeId,
    storeName:           proposal.storeName,
    sourceWarehouseCode: proposal.sourceWarehouseCode,
    sourceWarehouseName: proposal.sourceWarehouseName,
    targetWarehouseCode: proposal.targetWarehouseCode,
    lines:               proposal.lines,
    summary:             proposal.summary,
    status,
    createdBy:           proposal.createdBy,
    createdAt:           proposal.createdAt,
    updatedAt:           now,
    preparedSagPayload:  sagPayload !== undefined ? sagPayload : proposal.preparedSagPayload,
  };

  const row = await execDb().update({
    where: { id: proposalId },
    data:  { metadataJson },
  });

  return rowToProposal(row);
}

async function saveProposalLines(
  orgId:      string,
  proposalId: string,
  lines:      StoreReplenishmentProposalLine[],
  status:     ProposalStatus,
): Promise<StoreReplenishmentProposal | null> {
  const proposal = await getProposal(orgId, proposalId);
  if (!proposal) return null;

  const summary = calculateSummary(lines);
  const now = new Date().toISOString();

  const metadataJson = {
    storeId:             proposal.storeId,
    storeName:           proposal.storeName,
    sourceWarehouseCode: proposal.sourceWarehouseCode,
    sourceWarehouseName: proposal.sourceWarehouseName,
    targetWarehouseCode: proposal.targetWarehouseCode,
    lines,
    summary,
    status,
    createdBy:           proposal.createdBy,
    createdAt:           proposal.createdAt,
    updatedAt:           now,
    preparedSagPayload:  proposal.preparedSagPayload,
  };

  const row = await execDb().update({
    where: { id: proposalId },
    data:  { metadataJson },
  });

  return rowToProposal(row);
}
