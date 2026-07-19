/**
 * lib/comercial/importaciones/import-data-loader.ts
 *
 * Data loader that constructs ImportReferenceInput[] from Prisma data
 * for the Import Decision Engine.
 *
 * Reuses the existing import-service.ts data pipeline (listImportedReferences)
 * and transforms ImportedReference → ImportReferenceInput.
 *
 * Data sources:
 *   - ProductEntity (LINEA "5" = imported accessories)
 *   - ProductInventoryLevel (import warehouses 24, 42-46)
 *   - CustomerOrderLine + CustomerOrderRecord (product-level sales)
 *   - CommercialProductDataSource (SAG v_articulos PV3/PV4, C1/C2 receipts)
 *
 * Sprint: COMMERCIAL-DATA-CONNECTIVITY-01
 */

import { listImportedReferences } from "./import-service";
import type { ImportReferenceInput, ImportPolicyContext } from "./import-policy-types";
import type { ImportedReference } from "./import-types";

/**
 * Load ImportReferenceInput[] from real Prisma data via import-service.
 *
 * This is the bridge between persisted SAG data and the pure Import Decision Engine.
 * The engine never touches Prisma — this loader is the sole data provider.
 */
export async function loadImportReferenceInputs(
  orgId: string,
): Promise<ImportReferenceInput[]> {
  const refs = await listImportedReferences(orgId);
  return refs.map(mapToEngineInput);
}

/**
 * Build the ImportPolicyContext from an orgId.
 */
export function buildImportPolicyContext(orgId: string): ImportPolicyContext {
  return { tenantId: orgId };
}

/**
 * Transform an ImportedReference (service output) to ImportReferenceInput (engine input).
 *
 * Field mapping:
 *   reference       ← ImportedReference.reference (ProductEntity.externalId)
 *   description     ← ImportedReference.description (ProductEntity.name)
 *   group           ← "IMPORTACION" (all import products are LINEA 5)
 *   subgroup        ← null (SAG subgroup not mapped for import products)
 *   size            ← null (import accessories don't use talla/color)
 *   currentInventory ← ImportedReference.remaining (import warehouse stock)
 *   totalSold       ← ImportedReference.soldNet (gross - returns)
 *   sales6m         ← ImportedReference.salesTotal6m
 *   sales6mMonthly  ← computed from sales6mNet / 6 (monthly data requires detail loader)
 *   lastEntryDate   ← ImportedReference.lastEntryDate (from SAG C1/C2 receipts)
 *   daysSinceLastEntry ← ImportedReference.daysSinceLastEntry
 *   batchCount      ← ImportedReference.batchCount (from SAG receipts)
 *   percentSold     ← ImportedReference.percentSold (null when totalImported unknown)
 *   pricePV3        ← ImportedReference.pricePV3 (SAG v_articulos)
 *   pricePV4        ← ImportedReference.pricePV4 (SAG v_articulos)
 *   dominantChannel ← ImportedReference.dominantChannel (per-line classification)
 */
function mapToEngineInput(ref: ImportedReference): ImportReferenceInput {
  // Build approximate monthly sales array from 6m total
  // import-service provides salesTotal6m but not per-month breakdown at this level.
  // Use uniform distribution as approximation. The detail endpoint has real monthly data.
  const sales6mMonthly = buildMonthlySalesApprox(ref.salesTotal6m);

  return {
    reference: ref.reference,
    description: ref.description,
    group: "IMPORTACION",
    subgroup: null,
    size: null,
    currentInventory: ref.remaining,
    totalSold: ref.soldNet,
    sales6m: ref.salesTotal6m,
    sales6mMonthly,
    lastEntryDate: ref.lastEntryDate,
    daysSinceLastEntry: ref.daysSinceLastEntry,
    batchCount: ref.batchCount,
    percentSold: ref.percentSold,
    pricePV3: ref.pricePV3,
    pricePV4: ref.pricePV4,
    dominantChannel: ref.dominantChannel,
  };
}

/**
 * Build approximate monthly sales distribution from 6-month total.
 * Returns 6-element array. Uniform distribution when no monthly detail available.
 */
function buildMonthlySalesApprox(sales6m: number): number[] {
  if (sales6m <= 0) return [0, 0, 0, 0, 0, 0];
  const perMonth = Math.round(sales6m / 6);
  const remainder = sales6m - perMonth * 6;
  const arr = Array(6).fill(perMonth) as number[];
  // Put remainder in the most recent month
  arr[5] += remainder;
  return arr;
}
