/**
 * lib/tenant/module-catalog.ts
 *
 * Global module catalog — single source of truth for module metadata.
 *
 * Sprint: AGENTIK-TENANT-MODULE-ENTITLEMENTS-BILLING-01
 *
 * Every ModuleKey has exactly one catalog entry defining:
 *   - Human-readable name and description (Spanish)
 *   - Whether the module is sellable (billable to tenants)
 *   - Category for grouping in admin UI
 *
 * PRICING LAW:
 *   defaultMonthlyPriceCents: number | null
 *     null = NO GLOBAL PRICE DEFINED (not free — price decision required)
 *     0    = explicitly included at no additional cost
 *
 *   No invented prices. Only prices approved by commercial authority.
 *   Internal and platform_admin modules are never sellable.
 */

import type { ModuleKey } from "./modules";

// ── Types ────────────────────────────────────────────────────────────────────

export type ModuleCategory =
  | "operations"       // Core business modules
  | "intelligence"     // AI / copilot modules
  | "channel"          // Communication channels
  | "internal"         // Agentik platform internals
  | "platform_admin";  // SUPER_ADMIN platform management

export interface ModuleCatalogEntry {
  key:              ModuleKey;
  name:             string;
  description:      string;
  category:         ModuleCategory;
  /** Whether this module can be sold / billed to tenants. */
  sellable:         boolean;
  /**
   * Default monthly price in integer cents.
   *   null = no global price defined (price decision required per tenant)
   *   0    = explicitly included at no additional cost
   * Non-sellable modules always have null.
   */
  defaultMonthlyPriceCents: number | null;
}

// ── Catalog ──────────────────────────────────────────────────────────────────

const CATALOG: ReadonlyArray<ModuleCatalogEntry> = [
  // ── Operations ─────────────────────────────────────────────────────────────
  {
    key: "dashboard",        name: "Centro de Operaciones",
    description: "Panel operativo principal con KPIs y estado del negocio.",
    category: "operations",  sellable: true,  defaultMonthlyPriceCents: null,
  },
  {
    key: "torre_control",    name: "Torre de Control",
    description: "Vista ejecutiva con inteligencia operacional y drill-down.",
    category: "operations",  sellable: true,  defaultMonthlyPriceCents: null,
  },
  {
    key: "finance",          name: "Finanzas",
    description: "Tesoreria, cierre, planeacion y documentos financieros.",
    category: "operations",  sellable: true,  defaultMonthlyPriceCents: null,
  },
  {
    key: "sales",            name: "Comercial",
    description: "Control comercial, pedidos, clientes, vendedores, inventario.",
    category: "operations",  sellable: true,  defaultMonthlyPriceCents: null,
  },
  {
    key: "collections",      name: "Cobranza",
    description: "Cola de cobranza, campanas, rendimiento de recaudo.",
    category: "operations",  sellable: true,  defaultMonthlyPriceCents: null,
  },
  {
    key: "workforce",        name: "Workforce",
    description: "Gestion de recursos humanos e integracion GOCEN.",
    category: "operations",  sellable: true,  defaultMonthlyPriceCents: null,
  },
  {
    key: "alerts",           name: "Alertas",
    description: "Sistema de alertas operacionales y escalamiento.",
    category: "operations",  sellable: true,  defaultMonthlyPriceCents: null,
  },
  {
    key: "documents",        name: "Documentos",
    description: "Gestion documental empresarial.",
    category: "operations",  sellable: true,  defaultMonthlyPriceCents: null,
  },
  {
    key: "knowledge",        name: "Conocimiento",
    description: "Base de conocimiento empresarial.",
    category: "operations",  sellable: true,  defaultMonthlyPriceCents: null,
  },
  {
    key: "inventory",        name: "Inventario",
    description: "Gestion de inventario con inteligencia de abastecimiento.",
    category: "operations",  sellable: false, defaultMonthlyPriceCents: null,
    // SUBMODULE of "sales" product — not independently sellable.
  },
  {
    key: "production",       name: "Produccion",
    description: "Control de produccion, ordenes y trazabilidad.",
    category: "operations",  sellable: true,  defaultMonthlyPriceCents: null,
    // SELLABLE_PRODUCT — separate navigation domain from Comercial.
  },
  {
    key: "purchases",        name: "Compras",
    description: "Gestion de compras y proveedores.",
    category: "operations",  sellable: false, defaultMonthlyPriceCents: null,
    // PRODUCT_DECISION_REQUIRED — no commercial product decision yet.
  },
  {
    key: "dispatch",         name: "Despacho",
    description: "Logistica de despacho y seguimiento de envios.",
    category: "operations",  sellable: false, defaultMonthlyPriceCents: null,
    // PRODUCT_DECISION_REQUIRED — no commercial product decision yet.
  },

  // ── Intelligence (AI layer) ────────────────────────────────────────────────
  {
    key: "marketing_studio", name: "Marketing Studio",
    description: "Foto estudio, biblioteca creativa, redes sociales y Shopify.",
    category: "intelligence", sellable: true, defaultMonthlyPriceCents: null,
  },
  {
    key: "copilot",          name: "IA Copilot",
    description: "Asistente de inteligencia artificial empresarial.",
    category: "intelligence", sellable: true, defaultMonthlyPriceCents: null,
  },
  {
    key: "strategic_memory", name: "Memoria Estrategica",
    description: "Grafo de conocimiento persistente para decision ejecutiva.",
    category: "intelligence", sellable: true, defaultMonthlyPriceCents: null,
  },
  {
    key: "prompts",          name: "Biblioteca de Prompts",
    description: "Prompts empresariales reutilizables.",
    category: "intelligence", sellable: true, defaultMonthlyPriceCents: null,
  },
  {
    key: "playbooks",        name: "Playbooks IA",
    description: "Guias operacionales inteligentes.",
    category: "intelligence", sellable: true, defaultMonthlyPriceCents: null,
  },
  {
    key: "ai_lab",           name: "Lab IA",
    description: "Experimentos y prototipos de inteligencia artificial.",
    category: "intelligence", sellable: true, defaultMonthlyPriceCents: null,
  },

  // ── Channels ───────────────────────────────────────────────────────────────
  {
    key: "whatsapp",         name: "WhatsApp Business AI",
    description: "Canal WhatsApp con inteligencia conversacional.",
    category: "channel",     sellable: true,  defaultMonthlyPriceCents: null,
  },

  // ── Internal (Agentik platform) ────────────────────────────────────────────
  {
    key: "agentik",          name: "Agentik Console",
    description: "Consola interna de administracion Agentik.",
    category: "internal",    sellable: false, defaultMonthlyPriceCents: null,
  },
  {
    key: "runs",             name: "Ejecuciones",
    description: "Monitor de ejecuciones de agentes.",
    category: "internal",    sellable: false, defaultMonthlyPriceCents: null,
  },
  {
    key: "events",           name: "Eventos",
    description: "Bus de eventos del sistema.",
    category: "internal",    sellable: false, defaultMonthlyPriceCents: null,
  },
  {
    key: "agents",           name: "Agentes",
    description: "Registro y configuracion de agentes IA.",
    category: "internal",    sellable: false, defaultMonthlyPriceCents: null,
  },
  {
    key: "integrations",     name: "Integraciones",
    description: "Conectores SAG y servicios externos.",
    category: "internal",    sellable: false, defaultMonthlyPriceCents: null,
  },
  {
    key: "settings",         name: "Configuracion",
    description: "Ajustes generales del sistema.",
    category: "internal",    sellable: false, defaultMonthlyPriceCents: null,
  },

  // ── Platform Admin ─────────────────────────────────────────────────────────
  {
    key: "tenants_admin",       name: "Gestion de Tenants",
    description: "Administracion de organizaciones (SUPER_ADMIN).",
    category: "platform_admin", sellable: false, defaultMonthlyPriceCents: null,
  },
  {
    key: "plans_admin",         name: "Planes y Facturacion",
    description: "Gestion de planes y facturacion (SUPER_ADMIN).",
    category: "platform_admin", sellable: false, defaultMonthlyPriceCents: null,
  },
  {
    key: "feature_flags_admin", name: "Feature Flags",
    description: "Banderas de funcionalidad (SUPER_ADMIN).",
    category: "platform_admin", sellable: false, defaultMonthlyPriceCents: null,
  },
];

// ── Index maps ───────────────────────────────────────────────────────────────

const BY_KEY = new Map<ModuleKey, ModuleCatalogEntry>(
  CATALOG.map(e => [e.key, e]),
);

// ── Commercial Product → Internal Module Mapping ────────────────────────────
//
// A COMMERCIAL PRODUCT MODULE is what a tenant contracts and pays monthly for.
// An INTERNAL MODULE KEY is what navigation and permissions use internally.
//
// Example: "Comercial" is ONE contracted product that includes internal keys
// [sales, inventory, production, purchases, dispatch].
//
// When a commercial product is activated, ALL its included internal module keys
// get enabled. When deactivated, ALL are disabled.
//
// The billing unit is the PRODUCT, not each internal key.
//
// Module keys NOT listed in any product mapping are either:
//   - Independently sellable products (e.g. "whatsapp", "copilot")
//   - Internal-only keys (e.g. "agentik", "runs") — never billed
//
// Classification of every MODULE_KEY:
//
//   SELLABLE_PRODUCT     — independently contracted + billed
//   SUBMODULE            — included in a parent product, not independently billed
//   INTERNAL_ONLY        — Agentik platform infrastructure, never billed
//   PLATFORM_ADMIN       — SUPER_ADMIN platform management, never billed

export type ModuleClassification =
  | "SELLABLE_PRODUCT"           // independently contracted + billed
  | "SUBMODULE"                  // included in a parent product, not independently billed
  | "PRODUCT_DECISION_REQUIRED"  // exists as MODULE_KEY but no commercial product decision yet
  | "INTERNAL_ONLY"              // Agentik platform infrastructure, never billed
  | "PLATFORM_ADMIN";            // SUPER_ADMIN platform management, never billed

export interface CommercialProductMapping {
  /** The commercial product key (= the billing unit). */
  productKey: ModuleKey;
  /** Human-readable product name. */
  productName: string;
  /** Internal module keys included when this product is active. */
  includedModuleKeys: readonly ModuleKey[];
}

/**
 * Commercial product → internal module key mappings.
 *
 * When a product is activated, all its includedModuleKeys are enabled.
 * The product key itself is always the first element of includedModuleKeys.
 */
export const COMMERCIAL_PRODUCT_MAPPINGS: readonly CommercialProductMapping[] = [
  // ── Established products ──────────────────────────────────────────────────
  //
  // NAVIGATION TRUTH (from module-nav-config.ts):
  //   - "Comercial" domain (opts.hasSales): Maletas, Inventario, Importaciones,
  //     Pedidos, Tiendas, Clientes, Vendedores, Control Comercial.
  //     All surfaces gated by "sales" module key.
  //   - "Producción" domain (opts.hasProduction): SEPARATE domain with its own
  //     sidebar. Panel, Órdenes, Timeline, Etapas, Consumos, Costos, Alertas.
  //     Production is NOT a submodule of Commercial.
  //
  // MAPPING RULE:
  //   A product includes ONLY the module keys that share its navigation domain.
  //   "inventory" lives inside the Comercial sidebar → included in sales product.
  //   "production" has its own sidebar domain → separate product.
  //   "purchases" and "dispatch" have no independent navigation domain yet →
  //   PRODUCT_DECISION_REQUIRED (not auto-bundled).
  //
  {
    productKey: "sales",
    productName: "Comercial",
    includedModuleKeys: ["sales", "inventory"],
  },
  {
    productKey: "production",
    productName: "Producción",
    includedModuleKeys: ["production"],
  },
  {
    productKey: "finance",
    productName: "Finanzas",
    includedModuleKeys: ["finance"],
  },
  // ── Independently sellable products ───────────────────────────────────────
  {
    productKey: "dashboard",
    productName: "Centro de Operaciones",
    includedModuleKeys: ["dashboard"],
  },
  {
    productKey: "torre_control",
    productName: "Torre de Control",
    includedModuleKeys: ["torre_control"],
  },
  {
    productKey: "collections",
    productName: "Cobranza",
    includedModuleKeys: ["collections"],
  },
  {
    productKey: "workforce",
    productName: "Workforce",
    includedModuleKeys: ["workforce"],
  },
  {
    productKey: "alerts",
    productName: "Alertas",
    includedModuleKeys: ["alerts"],
  },
  {
    productKey: "documents",
    productName: "Documentos",
    includedModuleKeys: ["documents"],
  },
  {
    productKey: "knowledge",
    productName: "Conocimiento",
    includedModuleKeys: ["knowledge"],
  },
  {
    productKey: "marketing_studio",
    productName: "Marketing Studio",
    includedModuleKeys: ["marketing_studio"],
  },
  {
    productKey: "copilot",
    productName: "IA Copilot",
    includedModuleKeys: ["copilot", "strategic_memory", "prompts", "playbooks", "ai_lab"],
  },
  {
    productKey: "whatsapp",
    productName: "WhatsApp Business AI",
    includedModuleKeys: ["whatsapp"],
  },
];

/**
 * Returns the classification of every module key.
 */
/**
 * Module keys that exist in MODULE_KEYS but have no established commercial
 * product decision yet. They are NOT auto-bundled into any product and
 * NOT independently sellable until commercial authority decides.
 *
 * "purchases" and "dispatch" have no independent navigation domain —
 * their commercial packaging is undecided.
 */
const PRODUCT_DECISION_REQUIRED_KEYS: Set<ModuleKey> = new Set([
  "purchases", "dispatch",
]);

export function classifyModuleKey(key: ModuleKey): ModuleClassification {
  // Internal-only keys
  const INTERNAL_KEYS: Set<ModuleKey> = new Set([
    "agentik", "runs", "events", "agents", "integrations", "settings",
  ]);
  if (INTERNAL_KEYS.has(key)) return "INTERNAL_ONLY";

  // Platform admin keys
  const PLATFORM_ADMIN_KEYS: Set<ModuleKey> = new Set([
    "tenants_admin", "plans_admin", "feature_flags_admin",
  ]);
  if (PLATFORM_ADMIN_KEYS.has(key)) return "PLATFORM_ADMIN";

  // Keys with no commercial product decision yet
  if (PRODUCT_DECISION_REQUIRED_KEYS.has(key)) return "PRODUCT_DECISION_REQUIRED";

  // Check if this key is a product key (sellable)
  const isProduct = COMMERCIAL_PRODUCT_MAPPINGS.some(p => p.productKey === key);
  if (isProduct) return "SELLABLE_PRODUCT";

  // Check if this key is included as a submodule in any product
  const isSubmodule = COMMERCIAL_PRODUCT_MAPPINGS.some(p =>
    p.includedModuleKeys.includes(key) && p.productKey !== key,
  );
  if (isSubmodule) return "SUBMODULE";

  // Fallback — shouldn't happen if mappings are complete
  return "PRODUCT_DECISION_REQUIRED";
}

/**
 * Returns the commercial product mapping for a given product key.
 */
export function getProductMapping(productKey: ModuleKey): CommercialProductMapping | undefined {
  return COMMERCIAL_PRODUCT_MAPPINGS.find(p => p.productKey === productKey);
}

/**
 * Returns the parent product key for a given internal module key.
 * Returns the key itself if it IS a product key.
 * Returns undefined if it's an internal-only key.
 */
export function getParentProductKey(moduleKey: ModuleKey): ModuleKey | undefined {
  const mapping = COMMERCIAL_PRODUCT_MAPPINGS.find(p =>
    p.includedModuleKeys.includes(moduleKey),
  );
  return mapping?.productKey;
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Returns the catalog entry for a module key, or undefined if not found. */
export function getModuleCatalogEntry(key: ModuleKey): ModuleCatalogEntry | undefined {
  return BY_KEY.get(key);
}

/** Returns all catalog entries. */
export function getAllModuleCatalogEntries(): readonly ModuleCatalogEntry[] {
  return CATALOG;
}

/** Returns only sellable modules (billable to tenants). */
export function getSellableModules(): readonly ModuleCatalogEntry[] {
  return CATALOG.filter(e => e.sellable);
}

/** Returns modules by category. */
export function getModulesByCategory(
  category: ModuleCategory,
): readonly ModuleCatalogEntry[] {
  return CATALOG.filter(e => e.category === category);
}
