/**
 * production-stage-catalog.ts
 *
 * PRODUCTION-STAGE-ACTIVATION-01 + HARDENING-01: Canonical Stage Catalog + Profiles.
 *
 * Static definitions for the 15 canonical stages and 6 production profiles.
 * Activation rules that map ProductionEventType → canonical stage.
 *
 * HARDENING-01 changes:
 * - Profiles now declare requiredStages, optionalStages, excludedStages
 * - PRODUCTION_MOVED_STAGE rule removed (too generic for multi-ERP safety)
 * - All rules carry confidence + requiresStageTo metadata
 *
 * No React. No Prisma. No server-only. Pure domain constants.
 */

import type {
  ProductionStageDefinition,
  ProductionStageCode,
  ProductionProfile,
  ProductionProfileId,
  ProductionStageActivationRule,
} from "./production-stage-types";

// ── 15 Canonical Stage Definitions ───────────────────────────────────────────

export const PRODUCTION_STAGE_CATALOG: readonly ProductionStageDefinition[] = [
  // PLANNING (0-1)
  {
    code: "production_order",
    category: "PLANNING",
    label: "Orden de Produccion",
    description: "Orden de produccion creada y activada en el ERP.",
    order: 0,
    erpObservable: true,
  },
  {
    code: "material_allocation",
    category: "PLANNING",
    label: "Reserva de Material",
    description: "Materiales reservados para la orden de produccion.",
    order: 1,
    erpObservable: false,
  },

  // TRANSFORMATION (2-5)
  {
    code: "material_consumption",
    category: "TRANSFORMATION",
    label: "Consumo de Materiales",
    description: "Retiro de materias primas e insumos de bodega.",
    order: 2,
    erpObservable: true,
  },
  {
    code: "cutting",
    category: "TRANSFORMATION",
    label: "Corte",
    description: "Proceso de corte de materiales.",
    order: 3,
    erpObservable: false,
  },
  {
    code: "printing",
    category: "TRANSFORMATION",
    label: "Estampacion",
    description: "Proceso de estampacion o impresion.",
    order: 4,
    erpObservable: false,
  },
  {
    code: "embroidery",
    category: "TRANSFORMATION",
    label: "Bordado",
    description: "Proceso de bordado.",
    order: 5,
    erpObservable: false,
  },

  // EXTERNAL (6-8)
  {
    code: "external_manufacturing",
    category: "EXTERNAL",
    label: "Confeccion Externa",
    description: "Material enviado a confeccionistas o talleres externos.",
    order: 6,
    erpObservable: true,
  },
  {
    code: "assembly",
    category: "EXTERNAL",
    label: "Ensamble",
    description: "Proceso de ensamble o armado.",
    order: 7,
    erpObservable: false,
  },
  {
    code: "third_party_services",
    category: "EXTERNAL",
    label: "Servicios de Terceros",
    description: "Servicios externos: estampado, bordado, acabados por terceros.",
    order: 8,
    erpObservable: true,
  },

  // CONTROL (9-10)
  {
    code: "finishing",
    category: "CONTROL",
    label: "Acabados",
    description: "Proceso de acabado final del producto.",
    order: 9,
    erpObservable: false,
  },
  {
    code: "quality_control",
    category: "CONTROL",
    label: "Control de Calidad",
    description: "Inspeccion y verificacion de calidad.",
    order: 10,
    erpObservable: false,
  },

  // LOGISTICS (11-13)
  {
    code: "packaging",
    category: "LOGISTICS",
    label: "Empaque",
    description: "Proceso de empaque y etiquetado.",
    order: 11,
    erpObservable: false,
  },
  {
    code: "finished_goods_entry",
    category: "LOGISTICS",
    label: "Entrada Producto Terminado",
    description: "Ingreso del producto terminado a bodega de producto terminado.",
    order: 12,
    erpObservable: true,
  },
  {
    code: "warehouse_transfer",
    category: "LOGISTICS",
    label: "Traslado de Bodega",
    description: "Transferencia entre bodegas o centros de distribucion.",
    order: 13,
    erpObservable: true,
  },

  // COMMERCIAL (14)
  {
    code: "commercially_available",
    category: "COMMERCIAL",
    label: "Disponible Comercialmente",
    description: "Producto disponible para venta y despacho.",
    order: 14,
    erpObservable: false,
  },
] as const;

// ── Stage Lookup ─────────────────────────────────────────────────────────────

const stageMap = new Map<string, ProductionStageDefinition>();
for (const stage of PRODUCTION_STAGE_CATALOG) {
  stageMap.set(stage.code, stage);
}

/** Get a stage definition by code. */
export function getStageDefinition(
  code: ProductionStageCode,
): ProductionStageDefinition | undefined {
  return stageMap.get(code);
}

/** Get all stages for a category. */
export function getStagesByCategory(
  category: ProductionStageDefinition["category"],
): ProductionStageDefinition[] {
  return PRODUCTION_STAGE_CATALOG.filter(s => s.category === category);
}

// ── 6 Production Profiles (HARDENING-01: required/optional/excluded) ─────────

export const PRODUCTION_PROFILES: Record<ProductionProfileId, ProductionProfile> = {
  textile_full: {
    id: "textile_full",
    name: "Textil Completo",
    description: "Ciclo textil completo con confeccion externa, servicios de terceros, y acabados.",
    stages: [
      "production_order",
      "material_allocation",
      "material_consumption",
      "cutting",
      "printing",
      "embroidery",
      "external_manufacturing",
      "assembly",
      "third_party_services",
      "finishing",
      "quality_control",
      "packaging",
      "finished_goods_entry",
    ],
    observableStages: [
      "production_order",
      "material_consumption",
      "external_manufacturing",
      "third_party_services",
      "finished_goods_entry",
    ],
    requiredStages: [
      "production_order",
      "material_consumption",
      "finished_goods_entry",
    ],
    optionalStages: [
      "material_allocation",
      "cutting",
      "printing",
      "embroidery",
      "external_manufacturing",
      "assembly",
      "third_party_services",
      "finishing",
      "quality_control",
      "packaging",
    ],
    excludedStages: [
      "warehouse_transfer",
      "commercially_available",
    ],
  },

  textile_basic: {
    id: "textile_basic",
    name: "Textil Basico",
    description: "Ciclo textil sin confeccion externa. Produccion interna completa.",
    stages: [
      "production_order",
      "material_consumption",
      "cutting",
      "finishing",
      "quality_control",
      "packaging",
      "finished_goods_entry",
    ],
    observableStages: [
      "production_order",
      "material_consumption",
      "finished_goods_entry",
    ],
    requiredStages: [
      "production_order",
      "material_consumption",
      "finished_goods_entry",
    ],
    optionalStages: [
      "cutting",
      "finishing",
      "quality_control",
      "packaging",
    ],
    excludedStages: [
      "material_allocation",
      "printing",
      "embroidery",
      "external_manufacturing",
      "assembly",
      "third_party_services",
      "warehouse_transfer",
      "commercially_available",
    ],
  },

  external_manufacturing: {
    id: "external_manufacturing",
    name: "Manufactura Externa",
    description: "Produccion delegada a talleres externos. Insumos salen, producto terminado regresa.",
    stages: [
      "production_order",
      "material_consumption",
      "external_manufacturing",
      "third_party_services",
      "finished_goods_entry",
    ],
    observableStages: [
      "production_order",
      "material_consumption",
      "external_manufacturing",
      "third_party_services",
      "finished_goods_entry",
    ],
    requiredStages: [
      "production_order",
      "external_manufacturing",
      "finished_goods_entry",
    ],
    optionalStages: [
      "material_consumption",
      "third_party_services",
    ],
    excludedStages: [
      "material_allocation",
      "cutting",
      "printing",
      "embroidery",
      "assembly",
      "finishing",
      "quality_control",
      "packaging",
      "warehouse_transfer",
      "commercially_available",
    ],
  },

  import_reception: {
    id: "import_reception",
    name: "Recepcion de Importaciones",
    description: "Producto terminado recibido de importacion. Sin ciclo productivo local.",
    stages: [
      "production_order",
      "finished_goods_entry",
      "warehouse_transfer",
      "commercially_available",
    ],
    observableStages: [
      "production_order",
      "finished_goods_entry",
      "warehouse_transfer",
    ],
    requiredStages: [
      "production_order",
      "finished_goods_entry",
    ],
    optionalStages: [
      "warehouse_transfer",
      "commercially_available",
    ],
    excludedStages: [
      "material_allocation",
      "material_consumption",
      "cutting",
      "printing",
      "embroidery",
      "external_manufacturing",
      "assembly",
      "third_party_services",
      "finishing",
      "quality_control",
      "packaging",
    ],
  },

  contract_manufacturing: {
    id: "contract_manufacturing",
    name: "Maquila",
    description: "Fabricacion por contrato. El cliente suministra materiales, nosotros fabricamos.",
    stages: [
      "production_order",
      "material_consumption",
      "cutting",
      "assembly",
      "quality_control",
      "packaging",
      "finished_goods_entry",
    ],
    observableStages: [
      "production_order",
      "material_consumption",
      "finished_goods_entry",
    ],
    requiredStages: [
      "production_order",
      "material_consumption",
      "assembly",
      "finished_goods_entry",
    ],
    optionalStages: [
      "cutting",
      "quality_control",
      "packaging",
    ],
    excludedStages: [
      "material_allocation",
      "printing",
      "embroidery",
      "external_manufacturing",
      "third_party_services",
      "finishing",
      "warehouse_transfer",
      "commercially_available",
    ],
  },

  custom: {
    id: "custom",
    name: "Personalizado",
    description: "Perfil personalizado. Todas las etapas incluidas, minimo requerido.",
    stages: PRODUCTION_STAGE_CATALOG.map(s => s.code),
    observableStages: PRODUCTION_STAGE_CATALOG.filter(s => s.erpObservable).map(s => s.code),
    requiredStages: [
      "production_order",
      "finished_goods_entry",
    ],
    optionalStages: PRODUCTION_STAGE_CATALOG
      .filter(s => s.code !== "production_order" && s.code !== "finished_goods_entry")
      .map(s => s.code),
    excludedStages: [],
  },
};

// ── Activation Rules (HARDENING-01: removed PRODUCTION_MOVED_STAGE) ──────────

/**
 * Default activation rules that map ProductionEventType → canonical stage.
 *
 * HARDENING-01 changes:
 * - Removed PRODUCTION_MOVED_STAGE generic rule (F4-01: too dangerous for multi-ERP)
 * - Added confidence and requiresStageTo to all rules
 * - PRODUCTION_MOVED_STAGE events should be handled via stageTo-based mapping
 *   in the engine, not via a static rule
 */
export const DEFAULT_ACTIVATION_RULES: readonly ProductionStageActivationRule[] = [
  // OP → production_order
  {
    eventType: "PRODUCTION_ORDER_CREATED",
    sourceDocumentType: null,
    activatesStage: "production_order",
    ruleName: "OP creates production order stage",
    confidence: "universal",
    requiresStageTo: false,
  },
  {
    eventType: "PRODUCTION_ORDER_UPDATED",
    sourceDocumentType: null,
    activatesStage: "production_order",
    ruleName: "OP update confirms production order stage",
    confidence: "universal",
    requiresStageTo: false,
  },

  // Material events
  {
    eventType: "MATERIAL_RESERVED",
    sourceDocumentType: null,
    activatesStage: "material_allocation",
    ruleName: "Material reservation activates allocation stage",
    confidence: "universal",
    requiresStageTo: false,
  },
  {
    eventType: "MATERIAL_CONSUMED",
    sourceDocumentType: null,
    activatesStage: "material_consumption",
    ruleName: "CN activates material consumption stage",
    confidence: "universal",
    requiresStageTo: false,
  },

  // External processing
  {
    eventType: "EXTERNAL_SERVICE_STARTED",
    sourceDocumentType: null,
    activatesStage: "external_manufacturing",
    ruleName: "PC/external service start activates external manufacturing",
    confidence: "universal",
    requiresStageTo: false,
  },
  {
    eventType: "EXTERNAL_SERVICE_COMPLETED",
    sourceDocumentType: null,
    activatesStage: "third_party_services",
    ruleName: "EC/external service completion activates third party services",
    confidence: "universal",
    requiresStageTo: false,
  },

  // PRODUCTION_MOVED_STAGE intentionally NOT mapped here (HARDENING-01 F4-01).
  // This event is too generic — ERPs like Odoo/SAP emit it for ANY operation.
  // Instead, the engine uses stageTo-based mapping when stageTo is available.

  // Completion
  {
    eventType: "PRODUCTION_COMPLETED",
    sourceDocumentType: null,
    activatesStage: "finished_goods_entry",
    ruleName: "ET activates finished goods entry stage",
    confidence: "universal",
    requiresStageTo: false,
  },
  {
    eventType: "FINISHED_GOODS_RECEIVED",
    sourceDocumentType: null,
    activatesStage: "finished_goods_entry",
    ruleName: "PT/finished goods received activates finished goods entry",
    confidence: "universal",
    requiresStageTo: false,
  },

  // Transfers
  {
    eventType: "PRODUCTION_TRANSFERRED",
    sourceDocumentType: null,
    activatesStage: "warehouse_transfer",
    ruleName: "MV/transfer activates warehouse transfer stage",
    confidence: "universal",
    requiresStageTo: false,
  },

  // Quality
  {
    eventType: "QUALITY_CHECK_STARTED",
    sourceDocumentType: null,
    activatesStage: "quality_control",
    ruleName: "Quality check start activates quality control stage",
    confidence: "universal",
    requiresStageTo: false,
  },
  {
    eventType: "QUALITY_CHECK_COMPLETED",
    sourceDocumentType: null,
    activatesStage: "quality_control",
    ruleName: "Quality check completion confirms quality control stage",
    confidence: "universal",
    requiresStageTo: false,
  },
] as const;

/** Get the profile for a given ID. Falls back to "custom" if not found. */
export function getProductionProfile(
  profileId: ProductionProfileId,
): ProductionProfile {
  return PRODUCTION_PROFILES[profileId] ?? PRODUCTION_PROFILES.custom;
}
