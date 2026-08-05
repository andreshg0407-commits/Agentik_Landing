/**
 * lib/comercial/tiendas/store-replenishment-document-xml.ts
 *
 * AGENTIK-STORES-SUPPLY-PLAN-RESERVATION-01 — XML export renderer.
 *
 * Renders a ReplenishmentDocumentSnapshot as Agentik Supply Plan XML v1.
 * This is NOT SAG XML — it is Agentik's own versioned export format.
 *
 * Schema: AgentikSupplyPlan v1
 *   - Namespace: agentik:supply-plan:v1
 *   - Encoding: UTF-8
 *   - All quantities from the persisted snapshot (no live data)
 *
 * PURE: no DB, no side effects. Client-safe.
 */

import type { ReplenishmentDocumentSnapshot } from "./store-replenishment-document-types";
import type { ReplenishmentDocumentStatus } from "./store-replenishment-document-types";

// ── XML escaping ────────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ── Renderer ────────────────────────────────────────────────────────────────

/**
 * Renders a ReplenishmentDocumentSnapshot as Agentik Supply Plan XML v1.
 * All data comes exclusively from the persisted snapshot.
 */
export function renderReplenishmentDocumentXml(
  snapshot: ReplenishmentDocumentSnapshot,
  status: ReplenishmentDocumentStatus,
): string {
  const sn = snapshot;

  const suggestionElements = sn.suggestions.map((sg, i) => `
    <Suggestion index="${i + 1}">
      <ReferenceCode>${escapeXml(sg.referenceCode)}</ReferenceCode>
      <ProductName>${escapeXml(sg.productName)}</ProductName>
      <StructureKey>${escapeXml(sg.structureKey)}</StructureKey>
      <CandidateType>${escapeXml(sg.candidateType)}</CandidateType>
      <Units>${sg.units}</Units>
      <Reasons>${sg.reasons.map(r => `
        <Reason>${escapeXml(r.detail)}</Reason>`).join("")}
      </Reasons>
    </Suggestion>`).join("");

  const withdrawalElements = sn.withdrawals.map((w, i) => `
    <Withdrawal index="${i + 1}">
      <Label>${escapeXml(w.label)}</Label>
      <StructureKey>${escapeXml(w.structureKey)}</StructureKey>
      <RequiredUnits>${w.requiredUnits}</RequiredUnits>
      <Action>RETIRO</Action>
    </Withdrawal>`).join("");

  const unallocatedElements = sn.unallocated.map((u, i) => `
    <UnallocatedNeed index="${i + 1}">
      <StructureKey>${escapeXml(u.structureKey)}</StructureKey>
      <RequiredUnits>${u.requiredUnits}</RequiredUnits>
      <ExecutableUnits>${u.executableUnits}</ExecutableUnits>
      <AllocatedUnits>${u.allocatedUnits}</AllocatedUnits>
      <TotalPendingUnits>${u.totalPendingUnits}</TotalPendingUnits>
      <Reason>${escapeXml(u.reason)}</Reason>
    </UnallocatedNeed>`).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<AgentikSupplyPlan xmlns="agentik:supply-plan:v1" schemaVersion="${sn.schemaVersion}">
  <Document>
    <DocumentNumber>${escapeXml(sn.documentNumber)}</DocumentNumber>
    <BatchId>${escapeXml(sn.batchId)}</BatchId>
    <StoreId>${escapeXml(sn.storeId)}</StoreId>
    <StoreName>${escapeXml(sn.storeName)}</StoreName>
    <Status>${escapeXml(status)}</Status>
    <PlanGeneratedAt>${escapeXml(sn.planGeneratedAt)}</PlanGeneratedAt>
    <DocumentGeneratedAt>${escapeXml(sn.documentGeneratedAt)}</DocumentGeneratedAt>
    <GeneratedBy>${escapeXml(sn.generatedBy)}</GeneratedBy>
  </Document>

  <Summary>
    <RequiredUnits>${sn.summary.requiredUnits}</RequiredUnits>
    <ExecutableUnits>${sn.summary.executableUnits}</ExecutableUnits>
    <AllocatedUnits>${sn.summary.allocatedUnits}</AllocatedUnits>
    <AllocationPendingUnits>${sn.summary.allocationPendingUnits}</AllocationPendingUnits>
    <TotalBusinessPendingUnits>${sn.summary.totalBusinessPendingUnits}</TotalBusinessPendingUnits>
    <WithdrawalUnits>${sn.summary.withdrawalUnits}</WithdrawalUnits>
    <ScarcityMaterializedGlobal>${sn.scarcityMaterializedGlobal}</ScarcityMaterializedGlobal>
    <ScarcityAffectedThisStore>${sn.scarcityAffectedThisStore}</ScarcityAffectedThisStore>
  </Summary>

  <Suggestions count="${sn.suggestions.length}">${suggestionElements}
  </Suggestions>

  <Withdrawals count="${sn.withdrawals.length}">${withdrawalElements}
  </Withdrawals>

  <UnallocatedNeeds count="${sn.unallocated.length}">${unallocatedElements}
  </UnallocatedNeeds>
</AgentikSupplyPlan>`;
}
