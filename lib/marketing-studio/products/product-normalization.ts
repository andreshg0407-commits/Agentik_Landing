/**
 * lib/marketing-studio/products/product-normalization.ts
 *
 * MS-05A / MS-05F — Product Normalization Layer
 *
 * Transforms raw form inputs (from ApprovalMetadataPanel) into
 * normalized domain structures ready for persistence.
 *
 * ── RULES ─────────────────────────────────────────────────────────────────────
 *   - No side effects — pure transformation functions
 *   - No Prisma — input/output are domain types only
 *   - All strings trimmed and validated
 *   - Invalid inputs produce safe defaults via domain guards, never errors
 *   - organizationId only — no orgId, no tenantId
 */

import type {
  ApprovalFormInput,
  ProductAttributeRecord,
  AttributeValueType,
} from "./product-types";
import {
  UsagePermission,
  CommercialStatus,
  SyncChannel,
  type ProductStatus,
} from "./domain/product-enums";
import {
  usagePermissionGuard,
  commercialStatusGuard,
  parseChannels,
} from "./domain/product-guards";

// ── Normalized product create input ───────────────────────────────────────────

export interface NormalizedProductInput {
  organizationId:   string;
  name:             string;
  sku:              string | null;
  category:         string | null;
  status:           ProductStatus;
  description:      string | null;
  price:            number | null;
  currency:         string;
  usagePermission:  import("./domain/product-enums").UsagePermission;
  commercialStatus: import("./domain/product-enums").CommercialStatus;
  crmName:          string | null;
  productLine:      string | null;
  segment:          string | null;
  salesArgument:    string | null;
  availability:     string | null;
  notes:            string | null;
  enabledChannels:  import("./domain/product-enums").SyncChannel[];
}

export interface NormalizedApprovalInput {
  product:    NormalizedProductInput;
  attributes: Omit<ProductAttributeRecord, "id" | "productId" | "organizationId" | "createdAt" | "updatedAt">[];
  assetId:    string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function normalizePrice(raw: string): number | null {
  if (!raw || !raw.trim()) return null;
  const n = parseFloat(raw.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? null : n;
}

function trim(s: string): string | null {
  const t = s.trim();
  return t.length > 0 ? t : null;
}

// ── normalizeApprovalInput ─────────────────────────────────────────────────────

/**
 * normalizeApprovalInput — converts ApprovalMetadataPanel form data
 * into a fully validated, persistence-ready domain structure.
 * Uses domain guards for all enum fields — no unsafe casts.
 */
export function normalizeApprovalInput(input: ApprovalFormInput): NormalizedApprovalInput {
  const name = input.commercialName.trim() || "Sin nombre";

  const product: NormalizedProductInput = {
    organizationId:   input.organizationId,
    name,
    sku:              trim(input.sku),
    category:         trim(input.category),
    status:           "approved" as ProductStatus,
    description:      trim(input.shortDescription),
    price:            normalizePrice(input.price),
    currency:         "COP",
    usagePermission:  usagePermissionGuard.parse(input.usagePermission),
    commercialStatus: commercialStatusGuard.parse(input.commercialStatus),
    crmName:          trim(input.crmName) ?? trim(input.commercialName),
    productLine:      trim(input.productLine),
    segment:          trim(input.segment),
    salesArgument:    trim(input.salesArgument),
    availability:     trim(input.availability),
    notes:            trim(input.notes),
    enabledChannels:  parseChannels(input.channels),
  };

  // Build attribute records from dynamic attributes map
  const attributes: NormalizedApprovalInput["attributes"] = Object.entries(
    input.dynamicAttributes ?? {}
  )
    .filter(([, v]) => v.trim().length > 0)
    .map(([key, value]) => ({
      key,
      label:        key.replace(/_/g, " "),
      valueText:    value,
      valueNumber:  null,
      valueBoolean: null,
      valueJson:    null,
      type:         "text" as AttributeValueType,
      destination:  null,
    }));

  // Well-known fields as typed attributes for downstream channel use
  if (product.salesArgument) {
    attributes.push({
      key:          "sales_argument",
      label:        "Argumento de venta",
      valueText:    product.salesArgument,
      valueNumber:  null,
      valueBoolean: null,
      valueJson:    null,
      type:         "text" as AttributeValueType,
      destination:  SyncChannel.CRM,
    });
  }

  if (product.availability) {
    attributes.push({
      key:          "availability",
      label:        "Disponibilidad",
      valueText:    product.availability,
      valueNumber:  null,
      valueBoolean: null,
      valueJson:    null,
      type:         "text" as AttributeValueType,
      destination:  SyncChannel.CRM,
    });
  }

  return { product, attributes, assetId: input.assetId };
}

// ── buildProductDisplayName ────────────────────────────────────────────────────

/**
 * buildProductDisplayName — returns a canonical display name for a product.
 * Precedence: commercialName > sku > category > "Producto sin nombre"
 */
export function buildProductDisplayName(
  commercialName: string | null,
  sku:            string | null,
  category:       string | null,
): string {
  if (commercialName?.trim()) return commercialName.trim();
  if (sku?.trim()) return `SKU ${sku.trim()}`;
  if (category?.trim()) return category.trim();
  return "Producto sin nombre";
}
