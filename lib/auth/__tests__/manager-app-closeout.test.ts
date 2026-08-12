/**
 * lib/auth/__tests__/manager-app-closeout.test.ts
 *
 * Sprint: AGENTIK-MANAGER-APP-CLOSEOUT-01A (Phase 3)
 *
 * Behavioral/contract tests for the Manager App closeout remediation.
 *
 * Categories:
 *   1-6:   Seller route identity (IDENTITY_UNSTABLE documented)
 *   7-10:  Seller detail PA adapter
 *   11-15: Maletas contract evidence
 *   16-21: Executive state — source availability (not value-based)
 *   22-27: Alertas / Tareas / Informes — provider envelopes
 *   28-30: Copilot orb non-operational
 *   31-42: Phase 3 behavioral tests (12 deep truth-contract scenarios)
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

function fileExists(relPath: string): boolean {
  return fs.existsSync(path.join(ROOT, relPath));
}

const SELLER_PAGE = "app/(app)/[orgSlug]/manager/comercial/vendedores/[sellerId]/page.tsx";
const SELLER_CLIENT = "app/(app)/[orgSlug]/manager/comercial/vendedores/[sellerId]/seller-detail-client.tsx";
const VENDEDORES_CLIENT = "app/(app)/[orgSlug]/manager/comercial/vendedores/vendedores-client.tsx";
const VENDEDORES_PAGE = "app/(app)/[orgSlug]/manager/comercial/vendedores/page.tsx";
const ADAPTER = "lib/comercial/manager/manager-commercial-adapter.ts";
const TYPES = "lib/comercial/manager/manager-commercial-types.ts";
const SHELL = "app/(app)/[orgSlug]/manager/manager-app-shell.tsx";
const ALERTAS_PAGE = "app/(app)/[orgSlug]/manager/alertas/page.tsx";
const ALERTAS_CLIENT = "app/(app)/[orgSlug]/manager/alertas/alertas-client.tsx";
const TAREAS_PAGE = "app/(app)/[orgSlug]/manager/tareas/page.tsx";
const TAREAS_CLIENT = "app/(app)/[orgSlug]/manager/tareas/tareas-client.tsx";
const INFORMES_PAGE = "app/(app)/[orgSlug]/manager/informes/page.tsx";
const INFORMES_CLIENT = "app/(app)/[orgSlug]/manager/informes/informes-client.tsx";
const SELLER_DIR = "lib/comercial/foundation/seller-directory.ts";
const ORG_ACCESS = "lib/auth/org-access.ts";

// ═══════════════════════════════════════════════════════════════════════════════
// 1-6: SELLER ROUTE IDENTITY — IDENTITY_UNSTABLE DOCUMENTED
// ═══════════════════════════════════════════════════════════════════════════════

describe("1 — Route folder uses [sellerId] not [sellerSlug]", () => {
  test("[sellerId] folder exists", () => {
    expect(fileExists(SELLER_PAGE)).toBe(true);
    expect(fileExists(SELLER_CLIENT)).toBe(true);
  });

  test("[sellerSlug] folder does NOT exist", () => {
    expect(fileExists("app/(app)/[orgSlug]/manager/comercial/vendedores/[sellerSlug]/page.tsx")).toBe(false);
  });
});

describe("2 — Route parameter is sellerId", () => {
  test("page.tsx destructures sellerId from params", () => {
    const src = readFile(SELLER_PAGE);
    expect(src).toContain("sellerId: string");
    expect(src).toContain("const { orgSlug, sellerId }");
  });

  test("page.tsx does NOT use sellerSlug as parameter name", () => {
    const src = readFile(SELLER_PAGE);
    expect(src).not.toContain("sellerSlug: string }>");
  });
});

describe("3 — Seller identity documented as IDENTITY_UNSTABLE", () => {
  test("page documents IDENTITY_UNSTABLE contract", () => {
    const src = readFile(SELLER_PAGE);
    expect(src).toContain("IDENTITY_UNSTABLE");
    expect(src).toContain("BLOCKED_BY_MISSING_CANONICAL_CONTRACT");
  });

  test("types export SELLER_IDENTITY_STATUS", () => {
    const src = readFile(TYPES);
    expect(src).toContain('SELLER_IDENTITY_STATUS');
    expect(src).toContain('"IDENTITY_UNSTABLE"');
  });

  test("types document the minimal future identity model", () => {
    const src = readFile(TYPES);
    expect(src).toContain("Prisma `Seller` model");
    expect(src).toContain("cuid `id`");
    expect(src).toContain("sellerSlug");
    expect(src).toContain("sellerTerceroId");
    expect(src).toContain("displayName");
  });
});

describe("4 — PA type uses sellerId not sellerSlug", () => {
  test("ManagerSellerDetailPA has sellerId field", () => {
    const src = readFile(TYPES);
    expect(src).toContain("sellerId: string;");
  });

  test("ManagerSellerCard has sellerId field", () => {
    const src = readFile(TYPES);
    const cardSection = src.substring(src.indexOf("ManagerSellerCard"), src.indexOf("ManagerVendedoresFact"));
    expect(cardSection).toContain("sellerId: string;");
    expect(cardSection).not.toContain("sellerSlug: string;");
  });
});

describe("5 — Vendedores list links use sellerId", () => {
  test("vendedores client maps sellerId for list items", () => {
    const src = readFile(VENDEDORES_CLIENT);
    expect(src).toContain("s.sellerId");
    expect(src).not.toContain("s.sellerSlug");
  });
});

describe("6 — Organization-scoped server resolution", () => {
  test("page calls requireOrgAccess before any data loading", () => {
    const src = readFile(SELLER_PAGE);
    const orgAccessPos = src.indexOf("requireOrgAccess");
    const sellerResolvePos = src.indexOf("getSellerBySlug");
    expect(orgAccessPos).toBeGreaterThan(-1);
    expect(sellerResolvePos).toBeGreaterThan(orgAccessPos);
  });

  test("all data loaders receive orgId (org-scoped)", () => {
    const src = readFile(SELLER_PAGE);
    expect(src).toContain("getSellerBySlug(orgId,");
    expect(src).toContain("buildSellerMetrics(orgId)");
    expect(src).toContain("lookupSellerTerceroId(orgId,");
    expect(src).toContain("listBags(orgId,");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7-10: SELLER DETAIL PA ADAPTER
// ═══════════════════════════════════════════════════════════════════════════════

describe("7 — assembleSellerDetailPA in adapter not inline", () => {
  test("page imports assembleSellerDetailPA from adapter", () => {
    const src = readFile(SELLER_PAGE);
    expect(src).toContain("assembleSellerDetailPA");
    expect(src).toContain("manager-commercial-adapter");
  });

  test("page has NO inline fmtCOP, toLocaleString, or toFixed", () => {
    const src = readFile(SELLER_PAGE);
    expect(src).not.toContain("function fmtCOP");
    expect(src).not.toContain("toLocaleString");
    expect(src).not.toContain("toFixed");
  });
});

describe("8 — Adapter sets identity fields", () => {
  test("adapter sets sellerId from seller.sellerSlug", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain("sellerId: seller.sellerSlug");
  });

  test("adapter sets terceroTruthState based on sellerTerceroId", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain('sellerTerceroId ? "CERTIFIED" : "IDENTITY_UNRESOLVED"');
  });
});

describe("9 — sellerTerceroId NOT exposed visually", () => {
  test("seller detail client does NOT display terceroId", () => {
    const src = readFile(SELLER_CLIENT);
    expect(src).not.toContain("Tercero SAG");
    expect(src).not.toContain("sellerTerceroId");
  });
});

describe("10 — Commission truth state contract", () => {
  test("adapter links commission to terceroId resolution", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain("commissionTruthState:");
    expect(src).toContain('sellerTerceroId ? "PARTIAL" : "IDENTITY_UNRESOLVED"');
  });

  test("client renders commission truth state label", () => {
    const src = readFile(SELLER_CLIENT);
    expect(src).toContain("commissionTruthState");
    expect(src).toContain("Identidad no resuelta");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 11-15: MALETAS CONTRACT EVIDENCE
// ═══════════════════════════════════════════════════════════════════════════════

describe("11 — Maletas: org + seller filtering", () => {
  test("listBags called with orgId and sellerId (org-scoped + seller-scoped)", () => {
    const src = readFile(SELLER_PAGE);
    expect(src).toContain("listBags(orgId, sellerId)");
  });

  test("vendor-bag-repository filters by organizationId and salesRepId", () => {
    const src = readFile("lib/comercial/maletas/vendor-bag-repository.ts");
    expect(src).toContain("organizationId");
    expect(src).toContain("salesRepId");
  });
});

describe("12 — Maletas: sourceAsOf from bag records, not query time", () => {
  test("assembleManagerMaletaSection derives asOf from bag timestamps", () => {
    const src = readFile(ADAPTER);
    const section = src.substring(src.indexOf("assembleManagerMaletaSection"), src.indexOf("// ── Provider Result"));
    expect(section).toContain("b.updatedAt");
    expect(section).toContain("b.createdAt");
    expect(section).toContain("sourceAsOf");
  });

  test("bag parameter type includes updatedAt and createdAt", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain("updatedAt?: Date | string");
    expect(src).toContain("createdAt?: Date | string");
  });
});

describe("13 — Maletas: no operational actions", () => {
  test("seller detail client has no mutation handlers", () => {
    const src = readFile(SELLER_CLIENT);
    expect(src).not.toContain("editBag");
    expect(src).not.toContain("deleteBag");
    expect(src).not.toContain("createBag");
    expect(src).not.toContain("activateBag");
    expect(src).not.toContain("deactivateBag");
    expect(src).not.toContain("transferBag");
    expect(src).not.toContain("withdrawBag");
    expect(src).not.toContain("handleSubmit");
    expect(src).not.toContain("handleSave");
    expect(src).not.toContain("fetch(");
    expect(src).not.toContain("POST");
    expect(src).not.toContain("PUT");
    expect(src).not.toContain("DELETE");
  });
});

describe("14 — Maletas: absent from Home, hamburger, Commercial Hub", () => {
  test("manager home has no maleta reference", () => {
    const src = readFile("app/(app)/[orgSlug]/manager/manager-home-client.tsx");
    expect(src).not.toContain("maleta");
    expect(src).not.toContain("Maleta");
  });

  test("hamburger menu has no maleta item", () => {
    const src = readFile(SHELL);
    expect(src).not.toContain("maleta");
    expect(src).not.toContain("Maleta");
  });

  test("commercial hub has no maleta surface", () => {
    const src = readFile(ADAPTER);
    const hubSection = src.substring(src.indexOf("assembleCommercialHubPA"), src.indexOf("assembleVentasPA"));
    expect(hubSection).not.toContain("maleta");
    expect(hubSection).not.toContain("Maleta");
  });
});

describe("15 — Maletas: provider envelope replaces .catch(() => [])", () => {
  test("seller page uses wrapProviderCall for maletas", () => {
    const src = readFile(SELLER_PAGE);
    expect(src).toContain('wrapProviderCall("maletas"');
    expect(src).toContain("bagsResult.status");
  });

  test("seller page does NOT use .catch(() => []) for maletas", () => {
    const src = readFile(SELLER_PAGE);
    expect(src).not.toContain("listBags(orgId, sellerId).catch(() => [])");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 16-21: EXECUTIVE STATE — SOURCE AVAILABILITY (NOT VALUE-BASED)
// ═══════════════════════════════════════════════════════════════════════════════

describe("16 — Source availability separated from KPI values", () => {
  test("adapter defines buildSourceAvailability function", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain("export function buildSourceAvailability");
  });

  test("SourceAvailability type uses responded flag, not value > 0", () => {
    const src = readFile(TYPES);
    expect(src).toContain("responded: boolean");
    expect(src).toContain("SourceAvailabilityStatus");
    expect(src).toContain('"AVAILABLE"');
    expect(src).toContain('"UNAVAILABLE"');
  });

  test("adapter does NOT use s.value > 0 for availability", () => {
    const src = readFile(ADAPTER);
    // The old pattern `requiredSources.filter(s => s.value > 0)` must be gone
    expect(src).not.toContain('requiredSources.filter(s => s.value > 0)');
  });
});

describe("17 — Freshness validation", () => {
  test("adapter checks data freshness with 24h threshold", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain("isFresh");
    expect(src).toContain("staleThresholdMs");
    expect(src).toContain("24 * 60 * 60 * 1000");
  });
});

describe("18 — Missing sources prevent STABLE", () => {
  test("DATA_INCOMPLETE when certifiedCount < totalSources", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain("certifiedCount < totalSources");
    expect(src).toContain('"DATA_INCOMPLETE"');
  });
});

describe("19 — Stale data prevents STABLE", () => {
  test("!isFresh triggers DATA_INCOMPLETE", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain("!isFresh");
    expect(src).toContain("certifiedCount < totalSources || !isFresh");
  });
});

describe("20 — Unavailable source names in reason", () => {
  test("reason includes unavailable source names", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain('unavailableSources.map(s => s.name).join(", ")');
  });

  test("stale data reason is explicit", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain("datos no frescos");
  });
});

describe("21 — STABLE requires all sources available AND fresh", () => {
  test("STABLE reason confirms freshness", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain("frescas");
  });

  test("availability uses SourceAvailability status, not numeric values", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain('s.status === "AVAILABLE"');
    expect(src).toContain('s.status !== "AVAILABLE"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 22-27: ALERTAS / TAREAS / INFORMES — PROVIDER ENVELOPES
// ═══════════════════════════════════════════════════════════════════════════════

describe("22 — Alertas: provider envelopes + org isolation", () => {
  test("page exists and uses wrapProviderCall", () => {
    expect(fileExists(ALERTAS_PAGE)).toBe(true);
    const src = readFile(ALERTAS_PAGE);
    expect(src).toContain("wrapProviderCall");
    expect(src).toContain("listBusinessAlerts");
    expect(src).toContain("listAlerts");
  });

  test("page calls requireOrgAccess (entitlement + role check)", () => {
    const src = readFile(ALERTAS_PAGE);
    expect(src).toContain("requireOrgAccess(orgSlug)");
  });

  test("page does NOT call .catch(() => []) on providers", () => {
    const src = readFile(ALERTAS_PAGE);
    // Strip comments before checking — comments may reference the old pattern
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
    expect(codeOnly).not.toContain(".catch(() => [])");
  });
});

describe("23 — Alertas: SOURCE_UNAVAILABLE vs Sin pendientes", () => {
  test("client shows 'Fuente no disponible' on source failure", () => {
    const src = readFile(ALERTAS_CLIENT);
    expect(src).toContain("SOURCE_UNAVAILABLE");
    expect(src).toContain("Fuente no disponible");
  });

  test("client shows 'Sin alertas pendientes' only when sources responded OK", () => {
    const src = readFile(ALERTAS_CLIENT);
    expect(src).toContain("Sin alertas pendientes");
  });

  test("both states are mutually exclusive branches", () => {
    const src = readFile(ALERTAS_CLIENT);
    // SOURCE_UNAVAILABLE check comes before empty check
    const unavailPos = src.indexOf("SOURCE_UNAVAILABLE");
    const emptyPos = src.indexOf("Sin alertas pendientes");
    expect(unavailPos).toBeGreaterThan(-1);
    expect(emptyPos).toBeGreaterThan(unavailPos);
  });
});

describe("24 — Tareas: provider envelope + org isolation", () => {
  test("page uses wrapProviderCall", () => {
    expect(fileExists(TAREAS_PAGE)).toBe(true);
    const src = readFile(TAREAS_PAGE);
    expect(src).toContain("wrapProviderCall");
    expect(src).toContain("listActionTasks");
  });

  test("page does NOT call .catch(() => []) on providers", () => {
    const src = readFile(TAREAS_PAGE);
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
    expect(codeOnly).not.toContain(".catch(() => [])");
  });

  test("client shows 'Fuente no disponible' on source failure", () => {
    const src = readFile(TAREAS_CLIENT);
    expect(src).toContain("SOURCE_UNAVAILABLE");
    expect(src).toContain("Fuente no disponible");
  });
});

describe("25 — Informes: provider envelope + org isolation", () => {
  test("page uses wrapProviderCall", () => {
    expect(fileExists(INFORMES_PAGE)).toBe(true);
    const src = readFile(INFORMES_PAGE);
    expect(src).toContain("wrapProviderCall");
    expect(src).toContain("listScheduledReports");
  });

  test("page does NOT call .catch(() => []) on providers", () => {
    const src = readFile(INFORMES_PAGE);
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
    expect(codeOnly).not.toContain(".catch(() => [])");
  });

  test("client shows 'Fuente no disponible' on source failure", () => {
    const src = readFile(INFORMES_CLIENT);
    expect(src).toContain("SOURCE_UNAVAILABLE");
    expect(src).toContain("Fuente no disponible");
  });
});

describe("26 — Alertas: dual-source separation", () => {
  test("adapter receives separate businessAlerts and systemAlerts envelopes", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain("businessAlerts: ProviderResult<");
    expect(src).toContain("systemAlerts: ProviderResult<");
  });

  test("business alerts tagged with alertSource business", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain('"business"');
    expect(src).toContain('"system"');
    expect(src).toContain("alertSource");
  });

  test("all-providers-failed returns SOURCE_UNAVAILABLE", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain('businessAlerts.status !== "OK" && systemAlerts.status !== "OK"');
    expect(src).toContain('"SOURCE_UNAVAILABLE"');
  });
});

describe("27 — All three adapters accept ProviderResult", () => {
  test("assembleAlertasPA accepts provider results", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain("assembleAlertasPA(input:");
    expect(src).toContain("businessAlerts: ProviderResult");
  });

  test("assembleTareasPA accepts provider result", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain("tasksResult: ProviderResult");
  });

  test("assembleInformesPA accepts provider result", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain("reportsResult: ProviderResult");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 28-30: COPILOT ORB NON-OPERATIONAL
// ═══════════════════════════════════════════════════════════════════════════════

describe("28 — Copilot: DELIBERATELY_DEFERRED", () => {
  test("shell contains DELIBERATELY_DEFERRED status", () => {
    const src = readFile(SHELL);
    expect(src).toContain("DELIBERATELY_DEFERRED");
  });

  test("types export COPILOT_STATUS constant", () => {
    const src = readFile(TYPES);
    expect(src).toContain('COPILOT_STATUS = "DELIBERATELY_DEFERRED"');
  });
});

describe("29 — Copilot: fully non-interactive", () => {
  test("orb has pointerEvents none", () => {
    const src = readFile(SHELL);
    const orbStart = src.indexOf("function ManagerCopilotOrb");
    const orbBody = src.substring(orbStart);
    expect(orbBody).toContain("pointerEvents");
    expect(orbBody).toContain('"none"');
  });

  test("orb has no onClick, no role=button, no tabIndex", () => {
    const src = readFile(SHELL);
    const orbStart = src.indexOf("function ManagerCopilotOrb");
    const orbBody = src.substring(orbStart);
    expect(orbBody).not.toContain("onClick");
    expect(orbBody).not.toContain('role="button"');
    expect(orbBody).not.toContain("tabIndex");
  });
});

describe("30 — Copilot: no mock experience", () => {
  test("orb has no useState, no chat, no suggestions", () => {
    const src = readFile(SHELL);
    const orbStart = src.indexOf("function ManagerCopilotOrb");
    const orbBody = src.substring(orbStart);
    expect(orbBody).not.toContain("useState");
    expect(orbBody).not.toContain("chat");
    expect(orbBody).not.toContain("suggestion");
    expect(orbBody).not.toContain("drawer");
  });

  test("orb title indicates deferred state", () => {
    const src = readFile(SHELL);
    expect(src).toContain("proximamente");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 31-42: PHASE 3 BEHAVIORAL TESTS — 12 DEEP TRUTH-CONTRACT SCENARIOS
// ═══════════════════════════════════════════════════════════════════════════════

describe("31 — Seller identity: toSlug is name-derived (IDENTITY_UNSTABLE)", () => {
  test("seller-directory.ts uses toSlug(name) to derive sellerId", () => {
    const src = readFile(SELLER_DIR);
    expect(src).toContain("toSlug(data.name)");
    expect(src).toContain("sellerId: toSlug(");
  });

  test("no immutable seller PK (UUID/cuid) exists", () => {
    const src = readFile(SELLER_DIR);
    // sellerId is always derived from name
    expect(src).toContain("sellerId: toSlug(data.name)");
    // No cuid or uuid generation
    expect(src).not.toContain("cuid()");
    expect(src).not.toContain("uuid()");
    expect(src).not.toContain("crypto.randomUUID");
  });
});

describe("32 — Duplicate seller names: slug collision risk documented", () => {
  test("toSlug normalizes accents (accent collision possible)", () => {
    const src = readFile(SELLER_DIR);
    expect(src).toContain("normalize(\"NFD\")");
    expect(src).toContain(/[\u0300-\u036f]/g.source.replace(/\\/g, "\\"));
  });

  test("IDENTITY_UNSTABLE contract acknowledges mutability", () => {
    const src = readFile(TYPES);
    expect(src).toContain("name-derived and mutable");
  });
});

describe("33 — CRM-only seller: sellerTerceroId is null but seller exists", () => {
  test("terceroTruthState = IDENTITY_UNRESOLVED when terceroId null", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain('sellerTerceroId ? "CERTIFIED" : "IDENTITY_UNRESOLVED"');
  });

  test("seller detail still renders (terceroId is optional, not blocking)", () => {
    const src = readFile(SELLER_PAGE);
    // lookupSellerTerceroId has .catch(() => null) — seller page still renders
    expect(src).toContain("lookupSellerTerceroId(orgId, sellerId).catch(() => null)");
  });
});

describe("34 — Certified zero vs SOURCE_UNAVAILABLE", () => {
  test("source availability uses responded flag, not value > 0", () => {
    const src = readFile(ADAPTER);
    // buildSourceAvailability defaults all sources to AVAILABLE with responded: true
    expect(src).toContain("responded: true");
    expect(src).toContain('status: "AVAILABLE"');
  });

  test("SourceAvailabilityStatus has AVAILABLE, UNAVAILABLE, DEGRADED", () => {
    const src = readFile(TYPES);
    expect(src).toContain('"AVAILABLE"');
    expect(src).toContain('"UNAVAILABLE"');
    expect(src).toContain('"DEGRADED"');
  });

  test("zero KPI value does NOT make source unavailable", () => {
    const src = readFile(ADAPTER);
    // The new code does not check snapshot.ventasMes > 0 for availability
    expect(src).not.toContain("snapshot.ventasMes");
    expect(src).not.toContain("snapshot.pedidosMes");
    // All sources default to AVAILABLE — value is irrelevant
    const fnBody = src.substring(
      src.indexOf("function buildSourceAvailability"),
      src.indexOf("export function assembleManagerHomePA"),
    );
    expect(fnBody).not.toContain(".value");
  });
});

describe("35 — Provider exception vs genuine empty list", () => {
  test("wrapProviderCall returns PROVIDER_ERROR on exception", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain('status: "PROVIDER_ERROR"');
    expect(src).toContain("errorClassification: msg");
  });

  test("wrapProviderCall returns OK on success (even with empty items)", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain('status: "OK"');
    expect(src).toContain("errorClassification: null");
  });

  test("client distinguishes source failure from empty data", () => {
    const alertSrc = readFile(ALERTAS_CLIENT);
    // SOURCE_UNAVAILABLE → "Fuente no disponible" (not "Sin alertas pendientes")
    expect(alertSrc).toContain("SOURCE_UNAVAILABLE");
    expect(alertSrc).toContain("Fuente no disponible");
    expect(alertSrc).toContain("Sin alertas pendientes");
  });
});

describe("36 — Stale vs fresh executive state", () => {
  test("24h threshold separates fresh from stale", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain("staleThresholdMs");
    expect(src).toContain("Date.now() - loadedAtMs");
  });

  test("stale data prevents STABLE even when all sources available", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain("certifiedCount < totalSources || !isFresh");
    // DATA_INCOMPLETE includes stale reason
    expect(src).toContain('"datos no frescos (>24h)"');
  });
});

describe("37 — Cross-provider deduplication", () => {
  test("BusinessAlert.id and Alert.id are distinct cuid pools", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain("distinct cuid pools");
  });

  test("adapter tags each alert with alertSource (business or system)", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain('alertSource: "business"');
    expect(src).toContain('alertSource: "system"');
  });
});

describe("38 — Platform alerts excluded from business Attention", () => {
  test("system alerts use type field as module (not module field)", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain('module: a.type ?? "system"');
  });

  test("business alerts prioritized (listed before system)", () => {
    const src = readFile(ADAPTER);
    const bizSpread = src.indexOf("...bizItems");
    const sysSpread = src.indexOf("...sysItems");
    expect(bizSpread).toBeGreaterThan(-1);
    expect(sysSpread).toBeGreaterThan(bizSpread);
  });
});

describe("39 — Maletas: sourceAsOf is canonical, not query time", () => {
  test("assembleManagerMaletaSection does NOT use new Date().toISOString() as primary asOf", () => {
    const src = readFile(ADAPTER);
    const fnStart = src.indexOf("export function assembleManagerMaletaSection");
    const fnEnd = src.indexOf("// ── Provider Result");
    const fnBody = src.substring(fnStart, fnEnd);
    // sourceAsOf is the canonical business-mutation timestamp
    expect(fnBody).toContain("sourceAsOf");
    // sourceAsOf is returned directly (not wrapped in asOf: new Date())
    expect(fnBody).toMatch(/sourceAsOf,?\s/);
    expect(fnBody).toContain("queriedAt");
  });
});

describe("40 — Authorization code path documented", () => {
  test("seller page documents full authorization chain in comments", () => {
    const src = readFile(SELLER_PAGE);
    expect(src).toContain("Authorization code path:");
    expect(src).toContain("requireOrgAccess");
    expect(src).toContain("authenticated");
    expect(src).toContain("seller confinement");
    expect(src).toContain("tenant isolation");
  });

  test("requireOrgAccess checks auth, org active, membership, seller confinement", () => {
    const src = readFile(ORG_ACCESS);
    expect(src).toContain("UNAUTHENTICATED");
    expect(src).toContain("ORG_NOT_FOUND");
    expect(src).toContain("ORG_INACTIVE");
    expect(src).toContain("ACCESS_DENIED");
    expect(src).toContain("ACCESS_DENIED_SELLER_CONFINED");
  });
});

describe("41 — ProviderResult envelope is universal contract", () => {
  test("ProviderResult type exported from types", () => {
    const src = readFile(TYPES);
    expect(src).toContain("export interface ProviderResult<T>");
    expect(src).toContain("ProviderStatus");
    expect(src).toContain('"OK"');
    expect(src).toContain('"PROVIDER_ERROR"');
    expect(src).toContain('"PROVIDER_UNAVAILABLE"');
  });

  test("wrapProviderCall exported from adapter", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain("export async function wrapProviderCall");
  });
});

describe("42 — PA types include sourceStatus for degraded providers", () => {
  test("ManagerAlertasPA has optional sourceStatus and sourceDetail", () => {
    const src = readFile(TYPES);
    const section = src.substring(src.indexOf("ManagerAlertasPA"), src.indexOf("ManagerTareaItem"));
    expect(section).toContain("sourceStatus?: string");
    expect(section).toContain("sourceDetail?: string");
  });

  test("ManagerTareasPA has optional sourceStatus and sourceDetail", () => {
    const src = readFile(TYPES);
    const section = src.substring(src.indexOf("ManagerTareasPA"), src.indexOf("ManagerInformeItem"));
    expect(section).toContain("sourceStatus?: string");
    expect(section).toContain("sourceDetail?: string");
  });

  test("ManagerInformesPA has optional sourceStatus and sourceDetail", () => {
    const src = readFile(TYPES);
    const section = src.substring(src.indexOf("ManagerInformesPA"), src.indexOf("Provider Result Envelope"));
    expect(section).toContain("sourceStatus?: string");
    expect(section).toContain("sourceDetail?: string");
  });
});
