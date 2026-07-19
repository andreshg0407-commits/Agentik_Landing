/**
 * lib/marketing-studio/library/product-attributes.ts
 *
 * MS-04C — Dynamic Product Attribute System
 *
 * Flexible attribute schema for the Biblioteca approval flow and metadata layer.
 * Each product category carries suggested attributes that map to specific
 * destinations (Shopify, CRM, Catalog, WhatsApp, Ads).
 *
 * ── PRINCIPLES ────────────────────────────────────────────────────────────────
 *   - No rigid fields — every tenant can extend with custom attributes
 *   - Destination-aware — each attribute knows where it matters
 *   - Category-driven — schema varies by productCategory
 *   - No persistence here — this is the contract layer only
 *
 * ── CONSUMERS ─────────────────────────────────────────────────────────────────
 *   - ApprovalMetadataPanel (approval step UI)
 *   - AssetDetailDrawer (readiness computation)
 *   - readiness.ts (rule evaluation)
 *   - Future: Prisma AssetMetadata table
 */

// ── Destination types ──────────────────────────────────────────────────────────

export type AssetDestination =
  | "crm"
  | "shopify"
  | "catalog"
  | "whatsapp"
  | "ads"
  | "social"
  | "landing"
  | "all";

export const DESTINATION_LABELS: Record<AssetDestination, string> = {
  crm:      "CRM",
  shopify:  "Shopify",
  catalog:  "Catálogo",
  whatsapp: "WhatsApp",
  ads:      "Ads",
  social:   "Redes Sociales",
  landing:  "Landing",
  all:      "Todos",
};

// ── Attribute value types ──────────────────────────────────────────────────────

export type ProductAttributeValue = string | number | boolean | string[];

export type ProductAttributeType =
  | "text"
  | "number"
  | "boolean"
  | "select"
  | "multiselect"
  | "dimension"
  | "color";

// ── Attribute definition ───────────────────────────────────────────────────────

/**
 * ProductAttribute — a single metadata field definition.
 * `value` is undefined in schema definitions; filled in when applied to an asset.
 */
export interface ProductAttribute {
  /** Machine-readable key (e.g. "color", "material", "age_min"). */
  key:          string;
  /** Human-readable label in Spanish. */
  label:        string;
  /** Current value — undefined in schema templates, populated for asset instances. */
  value?:       ProductAttributeValue;
  type:         ProductAttributeType;
  /** If true, this field blocks readiness for its destination. */
  required?:    boolean;
  /** Which destination(s) this attribute unlocks or improves. */
  destination?: AssetDestination | AssetDestination[];
  placeholder?: string;
  /** Option list for select / multiselect types. */
  options?:     string[];
}

// ── Product categories ─────────────────────────────────────────────────────────

export type ProductCategory =
  | "toys"
  | "personal_care"
  | "clothing"
  | "food"
  | "electronics"
  | "furniture"
  | "generic";

export const PRODUCT_CATEGORIES: Record<ProductCategory, string> = {
  toys:          "Juguetes",
  personal_care: "Aseo y cuidado personal",
  clothing:      "Ropa y accesorios",
  food:          "Alimentos",
  electronics:   "Electrónica",
  furniture:     "Muebles y hogar",
  generic:       "General",
};

// ── Category attribute schemas ─────────────────────────────────────────────────

export interface ProductAttributeSchema {
  productCategory:     ProductCategory;
  label:               string;
  /** Pre-defined attributes suggested for this category. */
  suggestedAttributes: ProductAttribute[];
}

export const ATTRIBUTE_SCHEMAS: Record<ProductCategory, ProductAttributeSchema> = {
  toys: {
    productCategory: "toys",
    label:           "Juguetes",
    suggestedAttributes: [
      { key: "color",      label: "Color",              type: "color",       required: true,  destination: ["catalog", "shopify"] },
      { key: "material",   label: "Material",           type: "text",        required: true,  destination: ["shopify", "crm"] },
      { key: "age_min",    label: "Edad mínima",        type: "number",      required: true,  destination: ["shopify", "catalog", "crm"], placeholder: "3" },
      { key: "dimensions", label: "Medidas (cm)",       type: "dimension",   required: false, destination: "shopify" },
      { key: "batteries",  label: "Requiere pilas",     type: "boolean",     required: false, destination: ["shopify", "catalog"] },
      { key: "line",       label: "Línea / colección",  type: "text",        required: false, destination: "crm" },
    ],
  },
  personal_care: {
    productCategory: "personal_care",
    label:           "Aseo y cuidado personal",
    suggestedAttributes: [
      { key: "volume",     label: "Volumen (ml)",       type: "number",      required: true,  destination: ["shopify", "catalog", "whatsapp"], placeholder: "250" },
      { key: "material",   label: "Material / fórmula", type: "text",        required: true,  destination: "shopify" },
      { key: "dimensions", label: "Medidas (cm)",       type: "dimension",   required: false, destination: "catalog" },
      { key: "usage",      label: "Modo de uso",        type: "text",        required: false, destination: ["crm", "whatsapp"] },
      { key: "age_range",  label: "Edad / uso",         type: "text",        required: false, destination: "crm" },
    ],
  },
  clothing: {
    productCategory: "clothing",
    label:           "Ropa y accesorios",
    suggestedAttributes: [
      { key: "size",       label: "Talla",              type: "select",      required: true,  destination: ["shopify", "crm", "whatsapp"],
        options: ["XS", "S", "M", "L", "XL", "XXL", "Única"] },
      { key: "color",      label: "Color",              type: "color",       required: true,  destination: ["shopify", "catalog", "crm"] },
      { key: "material",   label: "Material",           type: "text",        required: true,  destination: "shopify" },
      { key: "gender",     label: "Género / línea",     type: "select",      required: false, destination: ["catalog", "crm"],
        options: ["Mujer", "Hombre", "Niño", "Niña", "Unisex"] },
      { key: "collection", label: "Colección",          type: "text",        required: false, destination: ["catalog", "ads"] },
    ],
  },
  food: {
    productCategory: "food",
    label:           "Alimentos",
    suggestedAttributes: [
      { key: "weight_g",   label: "Peso (g)",           type: "number",      required: true,  destination: ["shopify", "catalog"], placeholder: "500" },
      { key: "units",      label: "Unidades / paquete", type: "number",      required: false, destination: "shopify" },
      { key: "flavor",     label: "Sabor / variedad",   type: "text",        required: false, destination: ["catalog", "whatsapp"] },
      { key: "expiry",     label: "Vida útil aprox.",   type: "text",        required: false, destination: "shopify", placeholder: "12 meses" },
      { key: "allergens",  label: "Alérgenos",          type: "multiselect", required: false, destination: "shopify",
        options: ["Gluten", "Lácteos", "Maní", "Soya", "Huevo"] },
    ],
  },
  electronics: {
    productCategory: "electronics",
    label:           "Electrónica",
    suggestedAttributes: [
      { key: "model",         label: "Modelo / referencia", type: "text",    required: true,  destination: ["shopify", "crm"] },
      { key: "color",         label: "Color",               type: "color",   required: false, destination: ["shopify", "catalog"] },
      { key: "voltage",       label: "Voltaje",             type: "text",    required: false, destination: "shopify", placeholder: "110V / 220V" },
      { key: "warranty_mo",   label: "Garantía (meses)",    type: "number",  required: false, destination: ["shopify", "crm"] },
      { key: "compatibility", label: "Compatibilidad",      type: "text",    required: false, destination: ["crm", "whatsapp"] },
    ],
  },
  furniture: {
    productCategory: "furniture",
    label:           "Muebles y hogar",
    suggestedAttributes: [
      { key: "dimensions", label: "Medidas (cm)",        type: "dimension", required: true,  destination: ["shopify", "catalog"] },
      { key: "material",   label: "Material",            type: "text",      required: true,  destination: ["shopify", "crm"] },
      { key: "color",      label: "Color / acabado",     type: "color",     required: false, destination: ["shopify", "catalog"] },
      { key: "weight_kg",  label: "Peso (kg)",           type: "number",    required: false, destination: "shopify" },
      { key: "assembly",   label: "Requiere ensamble",   type: "boolean",   required: false, destination: ["shopify", "catalog"] },
    ],
  },
  generic: {
    productCategory: "generic",
    label:           "General",
    suggestedAttributes: [
      { key: "color",      label: "Color",               type: "color",     required: false, destination: "all" },
      { key: "material",   label: "Material",            type: "text",      required: false, destination: "all" },
      { key: "dimensions", label: "Medidas",             type: "dimension", required: false, destination: "all" },
      { key: "custom_1",   label: "Atributo personalizado 1", type: "text", required: false, destination: "all" },
      { key: "custom_2",   label: "Atributo personalizado 2", type: "text", required: false, destination: "all" },
    ],
  },
};

// ── Propagation impact ─────────────────────────────────────────────────────────

/**
 * ProductPropagationImpact — describes what downstream systems are affected
 * when an asset attribute changes.
 *
 * Used in the drawer to warn the user before confirming a change.
 * No real propagation happens yet — this is the contract for MS-05+.
 */
export interface ProductPropagationImpact {
  assetId:              string;
  affectedDestinations: AssetDestination[];
  affectedCatalogs?:    string[];
  affectedProducts?:    string[];
  requiresApproval?:    boolean;
  summary:              string;
}

/** Maps field keys to the destinations they affect when changed. */
const FIELD_IMPACT_MAP: Record<string, AssetDestination[]> = {
  name:             ["shopify", "catalog", "crm", "whatsapp", "ads"],
  commercialName:   ["shopify", "catalog", "crm", "whatsapp", "ads"],
  sku:              ["shopify", "crm"],
  category:         ["shopify", "catalog", "ads"],
  hasPrice:         ["shopify", "crm", "whatsapp"],
  price:            ["shopify", "crm", "whatsapp"],
  hasDescription:   ["shopify", "catalog", "ads", "landing"],
  description:      ["shopify", "catalog", "ads", "landing"],
  color:            ["shopify", "catalog", "crm"],
  size:             ["shopify", "crm", "whatsapp"],
  availability:     ["shopify", "crm", "whatsapp"],
  channels:         ["shopify", "catalog", "crm", "whatsapp", "ads", "landing"],
  salesArgument:    ["crm", "whatsapp"],
  productLine:      ["crm", "catalog"],
};

/**
 * computePropagationImpact — derives which downstream destinations are affected
 * when a set of fields change for an asset.
 *
 * @param assetId       — asset being changed
 * @param changedFields — list of field keys that were modified
 * @param activeChannels — current channel list (limits scope)
 */
export function computePropagationImpact(
  assetId:        string,
  changedFields:  string[],
  activeChannels: string[],
): ProductPropagationImpact {
  const affected = new Set<AssetDestination>();

  for (const field of changedFields) {
    const dests = FIELD_IMPACT_MAP[field] ?? [];
    for (const d of dests) affected.add(d);
  }

  // Intersect with active channels where applicable
  const CH_TO_DEST: Record<string, AssetDestination> = {
    shopify:   "shopify",
    catalog:   "catalog",
    crm:       "crm",
    whatsapp:  "whatsapp",
    ads:       "ads",
  };
  const activeDests = new Set(
    activeChannels.map(ch => CH_TO_DEST[ch]).filter(Boolean) as AssetDestination[]
  );

  const filteredAffected = [...affected].filter(
    d => activeDests.size === 0 || activeDests.has(d)
  );

  const requiresApproval =
    filteredAffected.includes("shopify") || filteredAffected.includes("crm");

  const summary =
    filteredAffected.length === 0
      ? "Sin impacto en destinos activos."
      : `Este cambio puede actualizar: ${filteredAffected.map(d => DESTINATION_LABELS[d]).join(", ")}.`;

  return {
    assetId,
    affectedDestinations: filteredAffected,
    requiresApproval,
    summary,
  };
}
