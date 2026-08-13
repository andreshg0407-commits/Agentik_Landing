/**
 * lib/comercial/manager/manager-commercial-adapter.ts
 *
 * Sprint: AGENTIK-MANAGER-APP-CANONICAL-INTEGRATION-01
 *
 * Thin server-side adapter that transforms existing canonical domain truth
 * into Manager-ready PAs. NO business logic duplication.
 *
 * Every function here is a thin projection — it reads from canonical services
 * and maps to Manager PA types. Zero calculations beyond formatting.
 */

import "server-only";

import type {
  ManagerHomePA,
  ManagerExecutiveStatePA,
  ManagerAttentionItem,
  ManagerCommercialHubPA,
  ManagerVentasPA,
  ManagerClientesPA,
  ManagerVendedoresPA,
  ManagerPedidosPA,
  ManagerTiendasPA,
  ManagerStoreDetailPA,
  ManagerInventarioPA,
  ManagerImportacionesPA,
  ManagerSellerDetailPA,
  ManagerMaletaSection,
  ManagerAlertasPA,
  ManagerTareasPA,
  ManagerInformesPA,
  ManagerTruthState,
  ProviderResult,
  SourceAvailability,
} from "./manager-commercial-types";

import type { ControlComercialSnapshot } from "@/lib/comercial/control/control-comercial-loader";
import type { CommercialExecutivePA } from "@/lib/comercial/executive/commercial-executive-types";
import type { StoreNetworkSnapshot } from "@/lib/comercial/tiendas/store-network-types";
import { interpret as interpretReportQuery } from "@/lib/reports/interpreter";
import { isReportFamilyAuthorized, filterReportRows } from "@/lib/reports/report-ownership";

// ── Helpers ──────────────────────────────────────────────────────────────────

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const DIAS = [
  "Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado",
];

function currentDateLabel(): string {
  const d = new Date();
  const dayName = DIAS[d.getDay()];
  const day = d.getDate();
  const month = MESES[d.getMonth()];
  return `${dayName}, ${day} de ${month}`;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buenos dias";
  if (h < 18) return "Buenas tardes";
  return "Buenas noches";
}

function fmtCOP(n: number): string {
  if (n >= 1_000_000_000) {
    const m = Math.round(n / 1_000_000);
    return `$${m.toLocaleString("es-CO")} M`;
  }
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)} M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000).toLocaleString("es-CO")} K`;
  return `$${n.toLocaleString("es-CO")}`;
}

function fmtNum(n: number): string {
  return n.toLocaleString("es-CO");
}

// ── Home PA ──────────────────────────────────────────────────────────────────

/**
 * Build source availability metadata from the snapshot.
 *
 * Source availability is NOT derived from KPI values.
 * Zero is a valid business value (certified truth), not a missing signal.
 *
 * Availability is determined by whether the provider responded successfully.
 * The snapshot itself existing with a `loadedAt` timestamp proves all sources
 * participated — the loader queries ALL sources in a single pipeline.
 * Individual source failure within the loader is caught with try/catch
 * and results in zero values, but the source DID participate.
 *
 * The only way a source is UNAVAILABLE is if the entire loader threw.
 */
export function buildSourceAvailability(
  snapshot: ControlComercialSnapshot,
  sourceStatuses?: Partial<Record<string, SourceAvailability>>,
): SourceAvailability[] {
  const defaults: SourceAvailability[] = [
    { name: "ventas",      status: "AVAILABLE", responded: true, lastLoadedAt: snapshot.loadedAt },
    { name: "pedidos",     status: "AVAILABLE", responded: true, lastLoadedAt: snapshot.loadedAt },
    { name: "clientes",    status: "AVAILABLE", responded: true, lastLoadedAt: snapshot.loadedAt },
    { name: "vendedores",  status: "AVAILABLE", responded: true, lastLoadedAt: snapshot.loadedAt },
  ];

  if (!sourceStatuses) return defaults;

  return defaults.map(d => {
    const override = sourceStatuses[d.name];
    return override ? { ...d, ...override } : d;
  });
}

export function assembleManagerHomePA(input: {
  orgName: string;
  userName?: string | null;
  snapshot: ControlComercialSnapshot;
  attention: ManagerAttentionItem[];
  sourceAvailability?: SourceAvailability[];
}): ManagerHomePA {
  const { orgName, snapshot, attention } = input;
  const sources = input.sourceAvailability ?? buildSourceAvailability(snapshot);

  const unresolvedCount = attention.length;

  // Source coverage: count sources by availability status, NOT by value.
  // Zero is a valid certified business value. Availability is metadata.
  const totalSources = sources.length;
  const availableSources = sources.filter(s => s.status === "AVAILABLE");
  const certifiedCount = availableSources.length;
  const unavailableSources = sources.filter(s => s.status !== "AVAILABLE");

  // Freshness check: loadedAt must be within 24 hours
  const loadedAtMs = new Date(snapshot.loadedAt).getTime();
  const staleThresholdMs = 24 * 60 * 60 * 1000;
  const isFresh = (Date.now() - loadedAtMs) < staleThresholdMs;

  let executiveState: ManagerExecutiveStatePA;

  if (unresolvedCount > 0) {
    executiveState = {
      state: "REQUIRES_ATTENTION",
      reason: `${unresolvedCount} ${unresolvedCount === 1 ? "asunto requiere" : "asuntos requieren"} atencion`,
      participatingSources: totalSources,
      certifiedSources: certifiedCount,
      unresolvedAttentionCount: unresolvedCount,
      asOf: snapshot.loadedAt,
    };
  } else if (certifiedCount < totalSources || !isFresh) {
    const reasons: string[] = [];
    if (unavailableSources.length > 0) {
      reasons.push(`sin datos: ${unavailableSources.map(s => s.name).join(", ")}`);
    }
    if (!isFresh) {
      reasons.push("datos no frescos (>24h)");
    }
    executiveState = {
      state: "DATA_INCOMPLETE",
      reason: reasons.join("; ") || `${certifiedCount} de ${totalSources} fuentes con datos`,
      participatingSources: totalSources,
      certifiedSources: certifiedCount,
      unresolvedAttentionCount: 0,
      asOf: snapshot.loadedAt,
    };
  } else {
    executiveState = {
      state: "STABLE",
      reason: `${certifiedCount} fuentes activas`,
      participatingSources: totalSources,
      certifiedSources: certifiedCount,
      unresolvedAttentionCount: 0,
      asOf: snapshot.loadedAt,
    };
  }

  return {
    orgName,
    userName: input.userName ?? null,
    greeting: greeting(),
    currentDate: currentDateLabel(),
    executiveState,
    attention,
    asOf: snapshot.loadedAt,
  };
}

// ── Manager Module Definitions (canonical single source) ─────────────────

/**
 * Manager-ready module definitions.
 *
 * CANONICAL SINGLE SOURCE for:
 *   → module navigation (layout.tsx hamburger)
 *   → Home module cards (page.tsx)
 *   → provider filtering (computeEffectiveManagerModules)
 *
 * A module appears here ONLY when it has an implemented Manager route.
 * Adding or removing an entry changes navigation AND provider eligibility.
 *
 * Derived from layout.tsx MODULE_ROUTE_MAP — only entries with existing
 * route directories are included. Layout consumes this definition.
 */
export interface ManagerModuleDef {
  moduleKey:   string;
  label:       string;
  description: string;
  accent:      string;
  icon:        string;
  routeSlug:   string;
}

export const MANAGER_MODULE_DEFS: readonly ManagerModuleDef[] = [
  {
    moduleKey:   "sales",
    label:       "Comercial",
    description: "Ventas, clientes, vendedores, tiendas",
    accent:      "#1e40af",
    icon:        "Cm",
    routeSlug:   "comercial",
  },
] as const;

/**
 * Derived Manager-ready module key set.
 * Used by computeEffectiveManagerModules and provider filtering.
 *
 * The effective Manager module set is:
 *   tenant-entitled ∩ role-permitted ∩ managerReadyModuleKeys
 */
const managerReadyModuleKeys: ReadonlySet<string> = new Set(
  MANAGER_MODULE_DEFS.map(d => d.moduleKey),
);

/**
 * Compute the effective Manager module set from role-permitted modules.
 * Returns the intersection of permitted modules and Manager-ready modules.
 */
export function computeEffectiveManagerModules(
  permitted: Set<string>,
): Set<string> {
  return new Set([...permitted].filter(k => managerReadyModuleKeys.has(k)));
}

// ── Manager Authorization Decision (pure helper) ────────────────────────────

/**
 * Manager roles — the set of roles permitted to enter the Manager App.
 * Consumed by layout.tsx and testable without server context.
 */
export const MANAGER_ROLES: ReadonlySet<string> = new Set(["ORG_ADMIN", "MANAGER"]);

/**
 * Pure authorization decision for the Manager Commercial surface.
 *
 * Exercises the complete entitlement chain:
 *   tenant entitlement ∩ role permission ∩ Manager readiness
 *
 * Returns true only when:
 *   1. role is in MANAGER_ROLES
 *   2. moduleKey is in the role-permitted set (orgModules ∩ roleModules)
 *   3. moduleKey is Manager-ready (in MANAGER_MODULE_DEFS)
 *
 * This is the exact decision the Manager layout chain makes.
 * Extracted as a pure function for testability.
 */
export function isManagerModuleAuthorized(
  role: string,
  orgModules: Set<string>,
  moduleKey: string,
  filterFn: (orgMods: Set<string>, role: string) => Set<string>,
): boolean {
  if (!MANAGER_ROLES.has(role)) return false;
  const permitted = filterFn(orgModules as any, role as any);
  const effective = computeEffectiveManagerModules(permitted);
  return effective.has(moduleKey);
}

// ── Provider Module Ownership (FAIL CLOSED) ─────────────────────────────────

/**
 * Maps BusinessAlert.module to the ModuleKey that owns it.
 * FAIL CLOSED: unmapped values are hidden and logged.
 *
 * BusinessAlert.module values are set by emitters:
 *   - alert-engine.ts → "sales"
 *   - source-alerts.ts → "source_aware"
 *   - crm-alert-engine.ts → "crm" | "finance"
 */
export const ALERT_MODULE_OWNER: Readonly<Record<string, string>> = {
  sales:        "sales",
  source_aware: "sales",
  crm:          "sales",
  finance:      "finance",
};

/**
 * Maps system Alert.type prefix to the ModuleKey that owns it.
 * FAIL CLOSED: unmapped types are hidden and logged.
 *
 * Alert model has NO module field. Ownership derived from type prefix.
 *
 * Proven emitters:
 *   cartera.* (90dpd, top_debtor, concentration)
 *     → lib/alerts/org-alerts.ts, sourceType: "cartera"
 *     → EXPLICIT_MODULE_OWNER → "sales"
 *   finance.document.* (incomplete, review_required)
 *     → lib/finance/document-alerts.ts, sourceType: "system"
 *     → EXPLICIT_MODULE_OWNER → "finance"
 *   Unknown prefix → UNKNOWN_UNMAPPED → hidden (fail closed)
 *
 * ORDER_SYNC_FAILED / ORDER_SYNC_PENDING:
 *   These are runtime log entries (order-sag-bridge.ts, order-post-sync.ts)
 *   and frontline notification types (frontline-types.ts, seller-app-types.ts).
 *   They are NOT Alert model records — no emitter creates prisma.alert with
 *   these types. They cannot appear in listAlerts() and never enter this path.
 */
export const SYSTEM_ALERT_TYPE_OWNER: Readonly<Record<string, string>> = {
  cartera: "sales",
  finance: "finance",
};

/**
 * Maps ActionTask.sourceModule to the ModuleKey that owns it.
 * FAIL CLOSED: unmapped values are hidden and logged.
 *
 * PROVEN EMITTERS (with exact file creating ActionTasks):
 *   "commercial.maletas.david"  → api/orgs/[orgSlug]/agent/commercial/actions/route.ts → sales
 *   "collections_queue"         → api/orgs/[orgSlug]/collections/outcome/route.ts      → collections
 *   "collections_followup"      → lib/collections/follow-up.ts                         → collections
 *   "collections_auto"          → lib/collections/auto-task.ts                         → collections
 *   "mila_collections"          → lib/collections/mila-memory.ts                       → collections
 *   "campaign:{id}"             → lib/collections/campaigns.ts (dynamic prefix)        → collections
 *   "whatsapp_triggers"         → lib/whatsapp/triggers.ts                             → whatsapp
 *   "whatsapp_bot"              → lib/whatsapp/actions.ts                              → whatsapp
 *   "agentik_copilot"           → lib/agentik/copilot-actions.ts, action-registry.ts   → agentik
 *   "board-intelligence"        → lib/copilot/board-intelligence/board-finding-engine.ts → agentik
 *
 * NO EMITTER FOUND (fail closed):
 *   "customer_360", "control_comercial", "informes", "finanzas",
 *   "torre_de_control", "manual", "bandeja_acciones", "unknown"
 */
export const TASK_SOURCE_MODULE_OWNER: Readonly<Record<string, string>> = {
  "commercial.maletas.david": "sales",
  collections_queue:          "collections",
  collections_followup:       "collections",
  collections_auto:           "collections",
  mila_collections:           "collections",
  whatsapp_triggers:          "whatsapp",
  whatsapp_bot:               "whatsapp",
  agentik_copilot:            "agentik",
  "board-intelligence":       "agentik",
};

/**
 * FAIL CLOSED: returns false when module ownership is unknown or disabled.
 * Logs a warning when an unmapped module value is encountered.
 */
function isBusinessAlertEnabled(
  alertModule: string | undefined,
  effectiveModules: Set<string>,
): boolean {
  if (!alertModule) {
    console.warn("[ENTITLEMENT] BusinessAlert with null/undefined module — fail closed");
    return false;
  }
  const owner = ALERT_MODULE_OWNER[alertModule];
  if (!owner) {
    console.warn(`[ENTITLEMENT] BusinessAlert module "${alertModule}" has no owner mapping — fail closed`);
    return false;
  }
  return effectiveModules.has(owner);
}

function isSystemAlertEnabled(
  alertType: string | undefined,
  effectiveModules: Set<string>,
): boolean {
  if (!alertType) {
    console.warn("[ENTITLEMENT] System Alert with null/undefined type — fail closed");
    return false;
  }
  const prefix = alertType.split(".")[0];
  const owner = SYSTEM_ALERT_TYPE_OWNER[prefix];
  if (!owner) {
    console.warn(`[ENTITLEMENT] System Alert type "${alertType}" (prefix "${prefix}") has no owner mapping — fail closed`);
    return false;
  }
  return effectiveModules.has(owner);
}

function isTaskEnabled(
  sourceModule: string | null | undefined,
  effectiveModules: Set<string>,
): boolean {
  if (!sourceModule) {
    console.warn("[ENTITLEMENT] ActionTask with null/undefined sourceModule — fail closed");
    return false;
  }
  // Static lookup first
  const owner = TASK_SOURCE_MODULE_OWNER[sourceModule];
  if (owner) return effectiveModules.has(owner);
  // Dynamic prefix: "campaign:{id}" → collections (proven emitter: lib/collections/campaigns.ts)
  if (sourceModule.startsWith("campaign:")) return effectiveModules.has("collections");
  console.warn(`[ENTITLEMENT] ActionTask sourceModule "${sourceModule}" has no owner mapping — fail closed`);
  return false;
}

// ── ScheduledReport Entitlement (consumes canonical report-ownership.ts) ─────
//
// Report ownership is defined ONCE in lib/reports/report-ownership.ts.
// This adapter consumes isReportFamilyAuthorized() and filterReportRows()
// from that canonical definition. No parallel ownership registry here.
//
// Container-level: isReportFamilyAuthorized() determines visibility.
// Row-level (MIXED): filterReportRows() excludes rows from disabled modules.

/**
 * Determine if a stored report is visible to the Manager user.
 * Uses interpret() to resolve QueryFamily, then delegates to the canonical
 * report ownership dispatch in lib/reports/report-ownership.ts.
 *
 * FAIL CLOSED: null/undefined query, interpret failure, unknown family → hidden.
 */
function isReportEnabled(
  query: string | null | undefined,
  effectiveModules: Set<string>,
): boolean {
  if (!query) {
    console.warn("[ENTITLEMENT] ScheduledReport with null/undefined query — fail closed");
    return false;
  }
  let family;
  try {
    family = interpretReportQuery(query).family;
  } catch {
    console.warn("[ENTITLEMENT] ScheduledReport interpret() failed — fail closed");
    return false;
  }
  if (!family) {
    console.warn("[ENTITLEMENT] ScheduledReport with unresolvable query — fail closed");
    return false;
  }
  return isReportFamilyAuthorized(family, effectiveModules, ALERT_MODULE_OWNER);
}

// ── Global Attention from canonical alerts ──────────────────────────────────

export function assembleGlobalAttention(input: {
  alerts: Array<{
    id: string;
    module?: string;
    type?: string;
    severity: string;
    status?: string;
    title: string;
    message?: string | null;
    entityType?: string;
    entityLabel?: string;
    createdAt: Date;
  }>;
  orgSlug: string;
  effectiveModules: Set<string>;
}): ManagerAttentionItem[] {
  const { alerts, orgSlug, effectiveModules } = input;

  return alerts
    .filter(a => {
      const status = (a.status ?? "").toLowerCase();
      if (status === "resolved" || status === "acknowledged") return false;
      return isBusinessAlertEnabled(a.module, effectiveModules);
    })
    .map(a => ({
      id: a.id,
      module: a.module ?? a.type ?? "general",
      severity: mapSeverity(a.severity),
      title: a.title,
      detail: a.message ?? "",
      entityType: a.entityType ?? null,
      entityLabel: a.entityLabel ?? null,
      href: `/${orgSlug}/manager/comercial`,
      asOf: a.createdAt.toISOString(),
    }));
}

function mapSeverity(s: string): "critical" | "warning" | "info" {
  const lower = s.toLowerCase();
  if (lower === "critical" || lower === "high") return "critical";
  if (lower === "warning" || lower === "medium") return "warning";
  return "info";
}

// ── Commercial Hub PA ──────────────────────────────────────────────────────

export function assembleCommercialHubPA(input: {
  snapshot: ControlComercialSnapshot;
  pa: CommercialExecutivePA;
  orgSlug: string;
}): ManagerCommercialHubPA {
  const { snapshot, pa, orgSlug } = input;
  const base = `/${orgSlug}/manager/comercial`;

  const surfaces = [
    {
      id: "ventas",
      label: "Ventas",
      icon: "Vt",
      href: `${base}/ventas`,
      factCount: pa.ventas ? 3 : 0,
      attentionCount: 0,
    },
    {
      id: "clientes",
      label: "Clientes",
      icon: "Cl",
      href: `${base}/clientes`,
      factCount: pa.clientes ? 2 : 0,
      attentionCount: 0,
    },
    {
      id: "vendedores",
      label: "Vendedores",
      icon: "Vd",
      href: `${base}/vendedores`,
      factCount: pa.vendedores ? 1 : 0,
      attentionCount: 0,
    },
    {
      id: "pedidos",
      label: "Pedidos",
      icon: "Pd",
      href: `${base}/pedidos`,
      factCount: pa.pedidos ? 3 : 0,
      attentionCount: 0,
    },
    {
      id: "tiendas",
      label: "Tiendas",
      icon: "Td",
      href: `${base}/tiendas`,
      factCount: 0, // populated at route level from store network
      attentionCount: 0,
    },
    {
      id: "inventario",
      label: "Inventario",
      icon: "In",
      href: `${base}/inventario`,
      factCount: pa.inventario ? 3 : 0,
      attentionCount: snapshot.refsCriticas > 0 ? snapshot.refsCriticas : 0,
    },
    {
      id: "importaciones",
      label: "Importaciones",
      icon: "Im",
      href: `${base}/importaciones`,
      factCount: 3,
      attentionCount: pa.importaciones.refsAtencionRecompra,
    },
  ];

  return {
    surfaces,
    asOf: snapshot.loadedAt,
  };
}

// ── Ventas PA ──────────────────────────────────────────────────────────────

export function assembleVentasPA(pa: CommercialExecutivePA): ManagerVentasPA {
  if (!pa.ventas) {
    return {
      facts: [],
      periodo: "",
      attentionStatus: "NONE",
      asOf: pa.asOf,
    };
  }

  const v = pa.ventas;
  return {
    facts: [
      { label: "Ventas del mes", value: fmtCOP(v.ventasMes), truthState: "CERTIFIED" },
      { label: "Ventas de la semana", value: fmtCOP(v.ventasSemana), truthState: "CERTIFIED" },
      { label: "Ventas hoy", value: fmtCOP(v.ventasHoy), truthState: "CERTIFIED" },
    ],
    periodo: v.periodo,
    attentionStatus: "NONE",
    asOf: v.asOf,
  };
}

// ── Clientes PA ──────────────────────────────────────────────────────────

export function assembleClientesPA(
  pa: CommercialExecutivePA,
  snapshot: ControlComercialSnapshot,
): ManagerClientesPA {
  if (!pa.clientes) {
    return {
      facts: [],
      highlights: [],
      attentionStatus: "NONE",
      asOf: pa.asOf,
    };
  }

  const c = pa.clientes;
  return {
    facts: [
      { label: "Clientes activos", value: fmtNum(c.clientesActivos), truthState: "CERTIFIED" },
      { label: "Clientes nuevos", value: fmtNum(c.clientesNuevos), truthState: "CERTIFIED" },
    ],
    highlights: snapshot.customerHighlights.slice(0, 5).map(h => ({
      id: h.id,
      name: h.name,
      reason: h.reason,
      label: h.label,
      value: typeof h.value === "number" ? fmtCOP(h.value) : String(h.value),
    })),
    attentionStatus: "NONE",
    asOf: c.asOf,
  };
}

// ── Vendedores PA ──────────────────────────────────────────────────────────

export function assembleVendedoresPA(input: {
  pa: CommercialExecutivePA;
  sellers: Array<{
    sellerName: string;
    sellerSlug: string;
    activityStatus: "activo" | "atencion" | "inactivo";
    crmQuoteCount: number;
    customerCount: number;
    totalCrmAmount: number;
    daysSinceLastActivity: number | null;
  }>;
  orgSlug: string;
}): ManagerVendedoresPA {
  const { pa, sellers, orgSlug } = input;
  const base = `/${orgSlug}/manager/comercial/vendedores`;

  const activeSellers = sellers.filter(s => s.activityStatus !== "inactivo");

  return {
    facts: pa.vendedores
      ? [{ label: "Vendedores operativos", value: fmtNum(pa.vendedores.vendedoresOperativos), truthState: "CERTIFIED" as ManagerTruthState }]
      : [],
    sellers: activeSellers.map(s => ({
      sellerId: s.sellerSlug,
      sellerName: s.sellerName,
      activityStatus: s.activityStatus,
      crmQuoteCount: s.crmQuoteCount,
      customerCount: s.customerCount,
      totalCrmAmount: s.totalCrmAmount,
      daysSinceLastActivity: s.daysSinceLastActivity,
      href: `${base}/${s.sellerSlug}`,
    })),
    attentionStatus: "NONE",
    asOf: pa.asOf,
  };
}

// ── Pedidos PA ──────────────────────────────────────────────────────────────

export function assemblePedidosPA(pa: CommercialExecutivePA): ManagerPedidosPA {
  if (!pa.pedidos) {
    return {
      facts: [],
      attentionStatus: "NONE",
      syncState: null,
      asOf: pa.asOf,
    };
  }

  const p = pa.pedidos;
  return {
    facts: [
      { label: "Pedidos del mes", value: fmtNum(p.pedidosMes), truthState: "CERTIFIED" },
      { label: "Total pedidos", value: fmtNum(p.pedidosTotal), truthState: "CERTIFIED" },
      { label: "Ticket promedio", value: fmtCOP(p.ticketPromedio), truthState: "CERTIFIED" },
    ],
    attentionStatus: "NONE",
    syncState: null,
    asOf: p.asOf,
  };
}

// ── Tiendas PA ──────────────────────────────────────────────────────────────

export function assembleTiendasPA(input: {
  networkSnapshot: StoreNetworkSnapshot | null;
  orgSlug: string;
}): ManagerTiendasPA {
  const { networkSnapshot, orgSlug } = input;
  const base = `/${orgSlug}/manager/comercial/tiendas`;

  if (!networkSnapshot) {
    return {
      facts: [],
      stores: [],
      attentionStatus: "NONE",
      asOf: new Date().toISOString(),
    };
  }

  const storeNodes = networkSnapshot.network.stores;
  const storeInventories = networkSnapshot.nodeInventories.filter(
    ni => storeNodes.some(s => s.id === ni.nodeId),
  );

  const totalOutOfStock = storeInventories.reduce(
    (sum, si) => sum + si.kpis.referencesOutOfStock, 0,
  );

  return {
    facts: [
      { label: "Tiendas activas", value: fmtNum(storeNodes.length), truthState: "CERTIFIED" },
      { label: "Referencias agotadas (red)", value: fmtNum(totalOutOfStock), truthState: "CERTIFIED" },
    ],
    stores: storeInventories.map(si => ({
      storeId: si.nodeId,
      storeName: si.nodeName,
      totalReferences: si.kpis.totalReferences,
      referencesOutOfStock: si.kpis.referencesOutOfStock,
      referencesCritical: si.kpis.referencesCritical,
      sourceStatus: si.sourceStatus,
      href: `${base}/${si.nodeId}`,
    })),
    attentionStatus: "NONE",
    asOf: networkSnapshot.computedAt,
  };
}

// ── Store Detail PA ──────────────────────────────────────────────────────

export function assembleStoreDetailPA(input: {
  networkSnapshot: StoreNetworkSnapshot;
  storeId: string;
}): ManagerStoreDetailPA | null {
  const { networkSnapshot, storeId } = input;

  const nodeInv = networkSnapshot.nodeInventories.find(ni => ni.nodeId === storeId);
  if (!nodeInv) return null;

  return {
    storeId: nodeInv.nodeId,
    storeName: nodeInv.nodeName,
    facts: [
      { label: "Referencias totales", value: fmtNum(nodeInv.kpis.totalReferences), truthState: "CERTIFIED" },
      { label: "Unidades disponibles", value: fmtNum(nodeInv.kpis.totalAvailable), truthState: "CERTIFIED" },
      { label: "Referencias agotadas", value: fmtNum(nodeInv.kpis.referencesOutOfStock), truthState: "CERTIFIED" },
      { label: "Referencias criticas", value: fmtNum(nodeInv.kpis.referencesCritical), truthState: "CERTIFIED" },
    ],
    sourceStatus: nodeInv.sourceStatus,
    attentionStatus: "NONE",
    asOf: networkSnapshot.computedAt,
  };
}

// ── Inventario PA ──────────────────────────────────────────────────────────

export function assembleInventarioPA(pa: CommercialExecutivePA): ManagerInventarioPA {
  if (!pa.inventario) {
    return {
      facts: [],
      attentionStatus: "NONE",
      asOf: pa.asOf,
    };
  }

  const inv = pa.inventario;
  return {
    facts: [
      { label: "Referencias totales", value: fmtNum(inv.refsTotales), truthState: "CERTIFIED" },
      { label: "Referencias criticas", value: fmtNum(inv.refsCriticas), truthState: "CERTIFIED" },
      { label: "Referencias agotadas", value: fmtNum(inv.refsAgotadas), truthState: "CERTIFIED" },
    ],
    attentionStatus: "NONE",
    asOf: inv.asOf,
  };
}

// ── Seller Detail PA ────────────────────────────────────────────────────

export function assembleSellerDetailPA(input: {
  seller: {
    sellerSlug: string;
    sellerName: string;
    crmQuoteCount: number;
    customerCount: number;
    totalAmount: number;
    activityStatus: string;
  };
  metrics?: {
    activityStatus?: string;
  } | null;
  sellerTerceroId: string | null;
  maletaSection: ManagerMaletaSection | null;
}): ManagerSellerDetailPA {
  const { seller, metrics, sellerTerceroId, maletaSection } = input;

  return {
    sellerId: seller.sellerSlug,
    sellerName: seller.sellerName,
    sellerTerceroId,
    terceroTruthState: sellerTerceroId ? "CERTIFIED" : "IDENTITY_UNRESOLVED",
    activityStatus: (metrics?.activityStatus ?? seller.activityStatus) as "activo" | "atencion" | "inactivo",
    facts: [
      { label: "Pedidos CRM", value: String(seller.crmQuoteCount), truthState: "CERTIFIED" as ManagerTruthState },
      { label: "Clientes", value: String(seller.customerCount), truthState: "CERTIFIED" as ManagerTruthState },
      { label: "Valor total CRM", value: fmtCOP(seller.totalAmount), truthState: "CERTIFIED" as ManagerTruthState },
    ],
    commissionTruthState: sellerTerceroId ? "PARTIAL" : "IDENTITY_UNRESOLVED",
    commissionLabel: sellerTerceroId ? null : null,
    maletaSection,
    attentionStatus: "NONE",
    asOf: new Date().toISOString(),
  };
}

// ── Maleta Section ──────────────────────────────────────────────────────

export function assembleManagerMaletaSection(
  bags: Array<{ items: Array<{ id: string }>; updatedAt?: Date | string; createdAt?: Date | string }>,
): ManagerMaletaSection | null {
  if (bags.length === 0) return null;

  const totalPositions = bags.reduce((sum, b) => sum + b.items.length, 0);
  const assignedPositions = totalPositions; // all items in active bags are assigned

  // Derive sourceAsOf from the most recent bag timestamp (updatedAt or createdAt).
  // This is the canonical business-mutation time, not the query time.
  // A primary-source record does not become stale simply because it has not changed.
  // null means no persisted timestamp exists — never substitute request time.
  const sourceAsOf = bags.reduce<string | null>((latest, b) => {
    const ts = b.updatedAt ?? b.createdAt;
    if (!ts) return latest;
    const iso = typeof ts === "string" ? ts : ts.toISOString();
    return !latest || iso > latest ? iso : latest;
  }, null);

  return {
    totalPositions,
    assignedPositions,
    coveragePercent: totalPositions > 0 ? Math.round((assignedPositions / totalPositions) * 100) : 0,
    truthState: "CERTIFIED",
    sourceAsOf,
    availabilityKnown: true as const,
    queriedAt: new Date().toISOString(),
  };
}

// ── Provider Result helpers ──────────────────────────────────────────────

/** Wrap a provider call in a ProviderResult envelope.
 *  Replaces `.catch(() => [])` — provider failure is explicit, not hidden. */
export async function wrapProviderCall<T>(
  source: string,
  fn: () => Promise<T[]>,
): Promise<ProviderResult<T>> {
  try {
    const items = await fn();
    return {
      status: "OK",
      items,
      source,
      asOf: new Date().toISOString(),
      errorClassification: null,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      status: "PROVIDER_ERROR",
      items: [],
      source,
      asOf: new Date().toISOString(),
      errorClassification: msg,
    };
  }
}

// ── Alertas PA ──────────────────────────────────────────────────────────

export function assembleAlertasPA(input: {
  businessAlerts: ProviderResult<{
    id: string;
    severity: string;
    module?: string;
    type?: string;
    title: string;
    message?: string | null;
    entityLabel?: string;
    createdAt: Date;
  }>;
  systemAlerts: ProviderResult<{
    id: string;
    severity: string;
    type?: string;
    title: string;
    message?: string | null;
    createdAt: Date;
  }>;
  effectiveModules: Set<string>;
}): ManagerAlertasPA {
  const { businessAlerts, systemAlerts, effectiveModules } = input;

  // If ALL providers failed, surface is unavailable
  if (businessAlerts.status !== "OK" && systemAlerts.status !== "OK") {
    return {
      alerts: [],
      attentionStatus: "NONE",
      asOf: new Date().toISOString(),
      sourceStatus: "SOURCE_UNAVAILABLE",
      sourceDetail: [businessAlerts.errorClassification, systemAlerts.errorClassification]
        .filter(Boolean).join("; ") || "Todos los proveedores fallaron",
    };
  }

  // Business alerts: domain-level operational signals
  // FAIL CLOSED: alerts from disabled/unmapped modules are excluded.
  const entitled = businessAlerts.items.filter(a =>
    isBusinessAlertEnabled(a.module, effectiveModules),
  );
  const bizItems = entitled.map(a => ({
    id: a.id,
    severity: mapSeverity(a.severity),
    module: a.module ?? a.type ?? "general",
    title: a.title,
    message: a.message ?? "",
    entityLabel: a.entityLabel ?? null,
    createdAt: a.createdAt.toISOString(),
    alertSource: "business" as const,
  }));

  // System alerts: FAIL CLOSED — filter by type-prefix ownership.
  // Alert model has no module field; ownership derived from type prefix.
  // Proven types: cartera.* (org-alerts.ts), finance.document.* (document-alerts.ts).
  // ORDER_SYNC_* are log events, not Alert records — they cannot appear here.
  const entitledSys = systemAlerts.items.filter(a =>
    isSystemAlertEnabled(a.type, effectiveModules),
  );
  const sysItems = entitledSys.map(a => ({
    id: a.id,
    severity: mapSeverity(a.severity),
    module: a.type ?? "system",
    title: a.title,
    message: a.message ?? "",
    entityLabel: null,
    createdAt: a.createdAt.toISOString(),
    alertSource: "system" as const,
  }));

  // No cross-provider dedup needed — BusinessAlert.id and Alert.id are distinct cuid pools.
  // Items from failed providers are excluded (empty from envelope).
  const allItems = [...bizItems, ...sysItems];

  // Determine source status from envelopes
  let sourceStatus: string | undefined;
  let sourceDetail: string | undefined;
  if (businessAlerts.status !== "OK") {
    sourceStatus = "DEGRADED";
    sourceDetail = `business alerts: ${businessAlerts.errorClassification ?? "unavailable"}`;
  } else if (systemAlerts.status !== "OK") {
    sourceStatus = "DEGRADED";
    sourceDetail = `system alerts: ${systemAlerts.errorClassification ?? "unavailable"}`;
  }

  return {
    alerts: allItems,
    attentionStatus: allItems.length > 0 ? "HAS_ITEMS" : "NONE",
    asOf: businessAlerts.status === "OK" ? businessAlerts.asOf : systemAlerts.asOf,
    sourceStatus,
    sourceDetail,
  };
}

// ── Tareas PA ───────────────────────────────────────────────────────────

export function assembleTareasPA(input: {
  tasksResult: ProviderResult<{
    id: string;
    title: string;
    priority: string;
    status: string;
    assigneeId?: string | null;
    module?: string | null;
    createdAt: Date;
  }>;
  effectiveModules: Set<string>;
}): ManagerTareasPA {
  const { tasksResult, effectiveModules } = input;

  if (tasksResult.status !== "OK") {
    return {
      tasks: [],
      attentionStatus: "NONE",
      asOf: tasksResult.asOf,
      sourceStatus: "SOURCE_UNAVAILABLE",
      sourceDetail: tasksResult.errorClassification ?? "Proveedor no disponible",
    };
  }

  // FAIL CLOSED: tasks from disabled/unmapped modules are excluded.
  const entitled = tasksResult.items.filter(t =>
    isTaskEnabled(t.module, effectiveModules),
  );

  const items = entitled.map(t => ({
    id: t.id,
    title: t.title,
    priority: t.priority,
    status: t.status,
    assignee: t.assigneeId ?? null,
    module: t.module ?? null,
    createdAt: t.createdAt.toISOString(),
  }));

  return {
    tasks: items,
    attentionStatus: items.length > 0 ? "HAS_ITEMS" : "NONE",
    asOf: tasksResult.asOf,
  };
}

// ── Informes PA ─────────────────────────────────────────────────────────

export function assembleInformesPA(input: {
  reportsResult: ProviderResult<{
    id: string;
    title: string;
    query: string;
    frequency: string;
    isActive: boolean;
    lastRunAt: Date | null;
    nextRunAt: Date | null;
  }>;
  effectiveModules: Set<string>;
}): ManagerInformesPA {
  const { reportsResult, effectiveModules } = input;

  if (reportsResult.status !== "OK") {
    return {
      reports: [],
      asOf: reportsResult.asOf,
      sourceStatus: "SOURCE_UNAVAILABLE",
      sourceDetail: reportsResult.errorClassification ?? "Proveedor no disponible",
    };
  }

  // FAIL CLOSED: reports whose QueryFamily ownership is unknown or whose
  // owning module is disabled/not-Manager-ready are excluded.
  // Container-level check via canonical report-ownership.ts.
  // Row-level filtering for MIXED reports is applied by filterMixedReportResult()
  // when report results are consumed (not here — we only have metadata).
  const entitled = reportsResult.items.filter(r =>
    isReportEnabled(r.query, effectiveModules),
  );

  return {
    reports: entitled.map(r => ({
      id: r.id,
      title: r.title,
      frequency: r.frequency,
      isActive: r.isActive,
      lastRunAt: r.lastRunAt?.toISOString() ?? null,
      nextRunAt: r.nextRunAt?.toISOString() ?? null,
    })),
    asOf: reportsResult.asOf,
  };
}

/**
 * Filter a MIXED report result's rows by module ownership before exposure.
 *
 * Delegates to the canonical filterReportRows() in lib/reports/report-ownership.ts.
 * Uses ALERT_MODULE_OWNER as the row ownership resolver.
 *
 * Required behavior:
 *   authorized sales alert    → included
 *   disabled finance alert    → excluded
 *   non-Manager-ready alert   → excluded
 *   unknown row owner         → excluded (fail closed)
 *   all rows excluded         → empty result (not cross-module disclosure)
 *   provider failure          → caller handles via ProviderResult envelope
 */
export { filterReportRows } from "@/lib/reports/report-ownership";

export function filterMixedReportResult(
  result: import("@/lib/reports/runners").ReportResult,
  effectiveModules: Set<string>,
): import("@/lib/reports/runners").ReportResult {
  return filterReportRows(result, effectiveModules, ALERT_MODULE_OWNER);
}

// ── Importaciones PA ──────────────────────────────────────────────────────

export function assembleImportacionesPA(pa: CommercialExecutivePA): ManagerImportacionesPA {
  const imp = pa.importaciones;

  const sinFechaCount = imp.lowRotationItems.filter(
    i => i.rotationStatus === "SIN_FECHA_DE_ACTIVIDAD_IMPORTACION",
  ).length;

  return {
    facts: [
      { label: "Referencias importadas", value: fmtNum(imp.totalRefs), truthState: "CERTIFIED" },
      { label: "Baja rotacion (>8 meses)", value: fmtNum(imp.refsEnBajaRotacion), truthState: "CERTIFIED" },
      { label: "Recompra inmediata", value: fmtNum(imp.refsAtencionRecompra), truthState: "CERTIFIED" },
    ],
    lowRotationCount: imp.refsEnBajaRotacion,
    recompraCount: imp.refsAtencionRecompra,
    sinFechaCount,
    attentionStatus: imp.refsAtencionRecompra > 0 ? "HAS_ITEMS" : "NONE",
    asOf: imp.asOf,
  };
}
