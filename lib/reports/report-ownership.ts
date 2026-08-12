/**
 * lib/reports/report-ownership.ts
 *
 * Sprint: AGENTIK-MANAGER-CANONICAL-CONNECTION-PATCH-01G
 *
 * Canonical report dispatch definition — single source of truth for:
 *   QueryFamily → runner → model → ownership classification → row-level behavior
 *
 * Consumers (Manager adapter, Informes PA, etc.) import from here.
 * No parallel ownership registries elsewhere.
 *
 * FAIL CLOSED: unknown family/owner → hidden.
 */

import type { QueryFamily } from "./interpreter";
import type { ModuleKey } from "@/lib/tenant/modules";
import type { ReportResult } from "./runners";

// ── Discriminated ownership types ───────────────────────────────────────────

/**
 * Report ownership classification — discriminated union.
 *
 * MODULE_OWNER:     All rows belong to a single canonical ModuleKey.
 * MIXED_ROW_OWNER:  Rows belong to different modules. Row-level filtering required.
 *                   `rowModuleField` names the field on each row that carries the module.
 *                   `rowOwnershipResolver` names the registry used to map row values → ModuleKey.
 */
export type ReportOwnership =
  | { readonly kind: "MODULE_OWNER"; readonly moduleKey: ModuleKey }
  | {
      readonly kind: "MIXED_ROW_OWNER";
      readonly rowModuleField: string;
      readonly rowOwnershipResolver: string;
    };

// ── Dispatch entry ──────────────────────────────────────────────────────────

export interface ReportFamilyDispatch {
  readonly family: QueryFamily;
  readonly runner: string;
  readonly primaryModel: string;
  readonly ownership: ReportOwnership;
}

// ── Canonical dispatch table ────────────────────────────────────────────────
//
// PROVEN EVIDENCE per entry:
//
//   cartera_vencida    → runCarteraVencida    → CustomerReceivable.findMany({organizationId})
//                        CustomerReceivable has NO module field. All receivables are sales domain.
//                        Evidence: runners.ts lines 70-135, Prisma model CustomerReceivable.
//
//   pedidos            → runPedidos           → CRMQuote.findMany({organizationId})
//                        CRMQuote has NO module field. All quotes are sales domain.
//                        Evidence: runners.ts lines 139-213, Prisma model CRMQuote.
//
//   cotizaciones       → runCotizaciones      → CRMQuote (alias of runPedidos)
//                        Same model, same ownership.
//                        Evidence: runners.ts lines 217-222.
//
//   clientes           → runClientes          → CustomerProfile.findMany({organizationId})
//                        CustomerProfile has NO module field. All profiles are sales domain.
//                        Evidence: runners.ts lines 226-287, Prisma model CustomerProfile.
//
//   clientes_inactivos → runClientesInactivos → CustomerProfile.findMany({organizationId})
//                        Same model as clientes.
//                        Evidence: runners.ts lines 291-352.
//
//   top_clientes       → runTopClientes       → CustomerProfile.findMany({organizationId})
//                        Same model as clientes.
//                        Evidence: runners.ts lines 356-417.
//
//   sin_facturar       → runSinFacturar       → CRMQuote.findMany({organizationId})
//                        Same model as pedidos, filtered by SAG sync state.
//                        Evidence: runners.ts lines 421-486.
//
//   alertas_criticas   → runAlertasCriticas   → BusinessAlert.findMany({organizationId, status:"OPEN", severity:"CRITICAL"})
//                        BusinessAlert.module is a String field that can be "sales"|"finance"|"production".
//                        Runner applies NO module filter — returns alerts from ALL modules.
//                        Row-level filtering required via ALERT_MODULE_OWNER.
//                        Evidence: runners.ts lines 490-536, Prisma model BusinessAlert.module.

export const REPORT_FAMILY_DISPATCH: ReadonlyArray<ReportFamilyDispatch> = [
  {
    family:       "cartera_vencida",
    runner:       "runCarteraVencida",
    primaryModel: "CustomerReceivable",
    ownership:    { kind: "MODULE_OWNER", moduleKey: "sales" },
  },
  {
    family:       "pedidos",
    runner:       "runPedidos",
    primaryModel: "CRMQuote",
    ownership:    { kind: "MODULE_OWNER", moduleKey: "sales" },
  },
  {
    family:       "cotizaciones",
    runner:       "runCotizaciones",
    primaryModel: "CRMQuote",
    ownership:    { kind: "MODULE_OWNER", moduleKey: "sales" },
  },
  {
    family:       "clientes",
    runner:       "runClientes",
    primaryModel: "CustomerProfile",
    ownership:    { kind: "MODULE_OWNER", moduleKey: "sales" },
  },
  {
    family:       "clientes_inactivos",
    runner:       "runClientesInactivos",
    primaryModel: "CustomerProfile",
    ownership:    { kind: "MODULE_OWNER", moduleKey: "sales" },
  },
  {
    family:       "top_clientes",
    runner:       "runTopClientes",
    primaryModel: "CustomerProfile",
    ownership:    { kind: "MODULE_OWNER", moduleKey: "sales" },
  },
  {
    family:       "sin_facturar",
    runner:       "runSinFacturar",
    primaryModel: "CRMQuote",
    ownership:    { kind: "MODULE_OWNER", moduleKey: "sales" },
  },
  {
    family:       "alertas_criticas",
    runner:       "runAlertasCriticas",
    primaryModel: "BusinessAlert",
    ownership:    {
      kind:                  "MIXED_ROW_OWNER",
      rowModuleField:        "module",
      rowOwnershipResolver:  "ALERT_MODULE_OWNER",
    },
  },
] as const;

// ── Lookup index (QueryFamily → dispatch entry) ────────────────────────────

const DISPATCH_INDEX: ReadonlyMap<QueryFamily, ReportFamilyDispatch> = new Map(
  REPORT_FAMILY_DISPATCH.map(d => [d.family, d]),
);

/**
 * Resolve the dispatch entry for a QueryFamily.
 * Returns undefined if the family is unknown (fail closed).
 */
export function getReportDispatch(family: QueryFamily): ReportFamilyDispatch | undefined {
  return DISPATCH_INDEX.get(family);
}

// ── Container-level authorization ───────────────────────────────────────────

/**
 * Determines if a report family is visible to a user given their effective modules.
 *
 * MODULE_OWNER:     visible when the owning ModuleKey is in effectiveModules.
 * MIXED_ROW_OWNER:  visible when at least one contributing module is in effectiveModules.
 *                   The contributing modules are derived from the row ownership resolver.
 *
 * FAIL CLOSED: unknown family → false.
 */
export function isReportFamilyAuthorized(
  family: QueryFamily,
  effectiveModules: Set<string>,
  alertModuleOwner: Readonly<Record<string, string>>,
): boolean {
  const dispatch = DISPATCH_INDEX.get(family);
  if (!dispatch) {
    console.warn(`[REPORT_OWNERSHIP] Unknown QueryFamily "${family}" — fail closed`);
    return false;
  }

  const { ownership } = dispatch;

  if (ownership.kind === "MODULE_OWNER") {
    return effectiveModules.has(ownership.moduleKey);
  }

  if (ownership.kind === "MIXED_ROW_OWNER") {
    // Visible if user has any module that contributes rows to this report.
    const contributingModules = new Set(Object.values(alertModuleOwner));
    for (const mod of contributingModules) {
      if (effectiveModules.has(mod)) return true;
    }
    return false;
  }

  // Exhaustive — should never reach here. Fail closed.
  return false;
}

// ── Row-level filtering for MIXED reports ───────────────────────────────────

/**
 * Filters a MIXED ReportResult's rows by module ownership.
 *
 * For each row, the module field value is resolved through alertModuleOwner
 * to determine which ModuleKey owns it. Rows whose owner is not in
 * effectiveModules are excluded. Rows with unknown/missing module are excluded
 * (fail closed).
 *
 * MODULE_OWNER reports pass through unfiltered (all rows belong to one module).
 *
 * Returns a new ReportResult with filtered rows and updated totalRows.
 */
export function filterReportRows(
  result: ReportResult,
  effectiveModules: Set<string>,
  alertModuleOwner: Readonly<Record<string, string>>,
): ReportResult {
  const dispatch = DISPATCH_INDEX.get(result.queryFamily);
  if (!dispatch) {
    // Unknown family — return empty result (fail closed).
    return { ...result, rows: [], totalRows: 0 };
  }

  const { ownership } = dispatch;

  // Single-module reports: no row-level filtering needed.
  // The container-level check already verified the module is authorized.
  if (ownership.kind === "MODULE_OWNER") {
    return result;
  }

  // MIXED: filter each row by its module field.
  const { rowModuleField } = ownership;

  const filteredRows = result.rows.filter(row => {
    const rowModule = row[rowModuleField];
    if (rowModule == null || typeof rowModule !== "string") {
      // Missing module value on row — fail closed.
      console.warn(`[REPORT_OWNERSHIP] MIXED row missing "${rowModuleField}" — excluded`);
      return false;
    }
    const owner = alertModuleOwner[rowModule];
    if (!owner) {
      // Unknown module value — fail closed.
      console.warn(`[REPORT_OWNERSHIP] MIXED row module "${rowModule}" has no owner — excluded`);
      return false;
    }
    return effectiveModules.has(owner);
  });

  return {
    ...result,
    rows:      filteredRows,
    totalRows: filteredRows.length,
  };
}
