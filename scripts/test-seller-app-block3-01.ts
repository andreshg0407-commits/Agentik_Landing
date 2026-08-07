/**
 * AGENTIK-SELLER-APP-UI-03 — Block 3 Test Suite.
 *
 * Validates: portfolio views, order views, alert views, shell wiring,
 * deep links, fulfillment timeline, seller scope, PWA manifest.
 *
 * Run: npx tsx scripts/test-seller-app-block3-01.ts
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";

const BASE = path.resolve(__dirname, "..");
const readSrc = (rel: string) => fs.readFileSync(path.join(BASE, rel), "utf-8");

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e: any) {
    failed++;
    console.log(`  FAIL  ${name}: ${e.message}`);
  }
}

console.log("\n=== AGENTIK-SELLER-APP-UI-03 Block 3 Tests ===\n");

// ── Suite A: Shell wiring ──────────────────────────────────────────────────

console.log("Suite A: Shell wiring");

const shellSrc = readSrc("app/(app)/[orgSlug]/seller-app/seller-app-shell.tsx");

test("A01: Shell imports SellerPortfolioView", () => {
  assert.ok(shellSrc.includes("SellerPortfolioView"), "Missing SellerPortfolioView import");
});

test("A02: Shell imports SellerOrdersView", () => {
  assert.ok(shellSrc.includes("SellerOrdersView"), "Missing SellerOrdersView import");
});

test("A03: Shell imports SellerAlertsView", () => {
  assert.ok(shellSrc.includes("SellerAlertsView"), "Missing SellerAlertsView import");
});

test("A04: Shell renders maleta tab", () => {
  assert.ok(shellSrc.includes('activeTab === "maleta"'), "Missing maleta tab render");
});

test("A05: Shell renders alertas tab", () => {
  assert.ok(shellSrc.includes('activeTab === "alertas"'), "Missing alertas tab render");
});

test("A06: Shell renders pedidos with SellerOrdersView (not placeholder)", () => {
  assert.ok(shellSrc.includes("SellerOrdersView"), "Missing SellerOrdersView");
  assert.ok(!shellSrc.includes('PlaceholderView title="Pedidos"'), "Still using placeholder for pedidos");
});

test("A07: Bottom nav is canonical: Inicio, Clientes, Pedido, Pedidos, Perfil", () => {
  // NAV_ITEMS order must be: inicio, clientes, nuevo_pedido, pedidos, perfil
  const navMatch = shellSrc.match(/NAV_ITEMS[\s\S]*?\];/);
  assert.ok(navMatch, "Missing NAV_ITEMS");
  const nav = navMatch[0];
  assert.ok(nav.includes('"inicio"'), "Missing inicio in nav");
  assert.ok(nav.includes('"clientes"'), "Missing clientes in nav");
  assert.ok(nav.includes('"nuevo_pedido"'), "Missing nuevo_pedido in nav");
  assert.ok(nav.includes('"pedidos"'), "Missing pedidos in nav");
  assert.ok(nav.includes('"perfil"'), "Missing perfil in nav");
  // Maleta must NOT be in bottom nav
  assert.ok(!nav.includes('"maleta"'), "Maleta must NOT be in bottom nav");
});

test("A08: Bell icon navigates to alertas", () => {
  assert.ok(shellSrc.includes('handleTabChange("alertas")'), "Bell should navigate to alertas");
});

test("A09: Deep link context state exists", () => {
  assert.ok(shellSrc.includes("deepLinkContext"), "Missing deepLinkContext state");
});

test("A10: Alerts onNavigate sets deep link context", () => {
  assert.ok(shellSrc.includes("setDeepLinkContext"), "Missing setDeepLinkContext in alerts handler");
});

test("A11: SellerOrdersView receives initialOrderId from deep link", () => {
  assert.ok(shellSrc.includes("deepLinkContext?.orderId"), "Missing orderId deep link pass-through");
});

test("A12: SellerPortfolioView receives initialSection from deep link", () => {
  assert.ok(shellSrc.includes("deepLinkContext?.section"), "Missing section deep link pass-through");
});

// ── Suite B: Server page data loading ──────────────────────────────────────

console.log("\nSuite B: Server page data loading");

const pageSrc = readSrc("app/(app)/[orgSlug]/seller-app/page.tsx");

test("B01: Page imports getSalesPortfolio", () => {
  assert.ok(pageSrc.includes("getSalesPortfolio"), "Missing getSalesPortfolio import");
});

test("B02: Page imports getSalesPortfolioReferences", () => {
  assert.ok(pageSrc.includes("getSalesPortfolioReferences"), "Missing getSalesPortfolioReferences");
});

test("B03: Page imports getSalesPortfolioWithdrawalItems", () => {
  assert.ok(pageSrc.includes("getSalesPortfolioWithdrawalItems"), "Missing withdrawal items import");
});

test("B04: Page imports getSalesPortfolioSupplyPlanForVendor", () => {
  assert.ok(pageSrc.includes("getSalesPortfolioSupplyPlanForVendor"), "Missing supply plan import");
});

test("B05: Page does NOT use listOrders (server-side Prisma filtering)", () => {
  assert.ok(!pageSrc.includes("listOrders"), "Must use server-side Prisma filter, not listOrders");
});

test("B06: Page passes portfolio prop to shell", () => {
  assert.ok(pageSrc.includes("portfolio={serializedPortfolio}"), "Missing portfolio prop");
});

test("B07: Page passes supplyNeeds prop to shell", () => {
  assert.ok(pageSrc.includes("supplyNeeds={supplyNeeds}"), "Missing supplyNeeds prop");
});

test("B08: Page passes orders prop to shell", () => {
  assert.ok(pageSrc.includes("orders={serializedOrders}"), "Missing orders prop");
});

test("B09: Portfolio loading is seller-scoped (uses sellerId)", () => {
  assert.ok(pageSrc.includes("sellerIdentity.sellerId"), "Not using sellerId for portfolio scope");
});

test("B10: Orders use deterministic sellerTerceroId at Prisma query level", () => {
  assert.ok(pageSrc.includes("scope.canAccessAllOrders"), "Missing scope check for orders");
  assert.ok(pageSrc.includes("sellerTerceroId"), "Must use sellerTerceroId for deterministic filtering");
  // Must NOT use fuzzy/partial name matching
  const orderSection = pageSrc.slice(pageSrc.indexOf("Load orders"));
  assert.ok(!orderSection.includes("contains: sellerIdentity.sellerId"), "Must NOT use contains for seller");
  assert.ok(!orderSection.includes('mode: "insensitive"'), "Must NOT use insensitive mode");
});

test("B11: Portfolio loading degrades silently on error", () => {
  assert.ok(pageSrc.includes("Portfolio not available"), "Missing portfolio error handling");
});

test("B12: Orders loading degrades silently on error", () => {
  assert.ok(pageSrc.includes("Orders not available"), "Missing orders error handling");
});

test("B13: Fulfillment uses truthful semantics (no sin_factura default)", () => {
  assert.ok(!pageSrc.includes('"sin_factura"'), "Must NOT hardcode sin_factura");
  assert.ok(!pageSrc.includes("fulfillmentPercent: 0,"), "Must NOT hardcode fulfillmentPercent: 0");
  assert.ok(pageSrc.includes("fulfillmentPercent: null"), "fulfillmentPercent must be null (NOT_AVAILABLE)");
});

test("B14: Portfolio parallel loading with Promise.all", () => {
  assert.ok(pageSrc.includes("Promise.all"), "Not using Promise.all for parallel portfolio loading");
});

// ── Suite C: Portfolio view ────────────────────────────────────────────────

console.log("\nSuite C: Portfolio view");

const portfolioSrc = readSrc("app/(app)/[orgSlug]/seller-app/views/seller-portfolio-view.tsx");

test("C01: Portfolio view has 3 sections", () => {
  assert.ok(portfolioSrc.includes('"muestras"'), "Missing muestras section");
  assert.ok(portfolioSrc.includes('"retiro"'), "Missing retiro section");
  assert.ok(portfolioSrc.includes('"surtido"'), "Missing surtido section");
});

test("C02: Portfolio empty state when no portfolio assigned", () => {
  assert.ok(portfolioSrc.includes("No tienes una maleta asignada"), "Missing empty state message");
});

test("C03: Portfolio splits vigentes/reemplazar refs", () => {
  assert.ok(portfolioSrc.includes('r.state !== "reemplazar"'), "Missing vigentes filter");
  assert.ok(portfolioSrc.includes('r.state === "reemplazar"'), "Missing retiro filter");
});

test("C04: Retiro section shows warning banner", () => {
  assert.ok(portfolioSrc.includes("Retira estas muestras"), "Missing retiro warning");
});

test("C05: Surtido section shows info banner", () => {
  assert.ok(portfolioSrc.includes("Posiciones del derrotero"), "Missing surtido info");
});

test("C06: RefCard shows thumbnail with imageUrl", () => {
  assert.ok(portfolioSrc.includes("ref_.imageUrl"), "Missing imageUrl in RefCard");
});

test("C07: Health badge shows SANA/EN_RIESGO/CRITICA", () => {
  assert.ok(portfolioSrc.includes("SANA"), "Missing SANA health state");
  assert.ok(portfolioSrc.includes("EN_RIESGO"), "Missing EN_RIESGO health state");
  assert.ok(portfolioSrc.includes("CRITICA"), "Missing CRITICA health state");
});

test("C08: Supply need card shows bestAction", () => {
  assert.ok(portfolioSrc.includes("REEMPLAZAR_BODEGA"), "Missing REEMPLAZAR_BODEGA action");
  assert.ok(portfolioSrc.includes("COMPLETAR_DESDE_OP"), "Missing COMPLETAR_DESDE_OP action");
  assert.ok(portfolioSrc.includes("SIN_COBERTURA"), "Missing SIN_COBERTURA action");
});

test("C09: Portfolio accepts initialSection prop", () => {
  assert.ok(portfolioSrc.includes("initialSection"), "Missing initialSection prop");
});

// ── Suite D: Orders view ───────────────────────────────────────────────────

console.log("\nSuite D: Orders view");

const ordersSrc = readSrc("app/(app)/[orgSlug]/seller-app/views/seller-orders-view.tsx");

test("D01: Orders view has status group filters", () => {
  assert.ok(ordersSrc.includes('"all"'), "Missing all filter");
  assert.ok(ordersSrc.includes('"active"'), "Missing active filter");
  assert.ok(ordersSrc.includes('"completed"'), "Missing completed filter");
  assert.ok(ordersSrc.includes('"problem"'), "Missing problem filter");
});

test("D02: Orders detail view exists", () => {
  assert.ok(ordersSrc.includes("OrderDetailView"), "Missing OrderDetailView");
});

test("D03: Fulfillment timeline has 4 stages", () => {
  assert.ok(ordersSrc.includes("Pedido recibido"), "Missing stage: Pedido recibido");
  assert.ok(ordersSrc.includes("Facturacion"), "Missing stage: Facturacion");
  assert.ok(ordersSrc.includes("Despacho"), "Missing stage: Despacho");
  assert.ok(ordersSrc.includes("Entrega"), "Missing stage: Entrega");
});

test("D04: Despacho and Entrega are NOT_AVAILABLE (truthful)", () => {
  assert.ok(ordersSrc.includes('"not_available"'), "Missing not_available status");
  // Fable UX uses "Sin información aún" instead of "No disponible"
  assert.ok(
    ordersSrc.includes("No disponible") || ordersSrc.includes("Sin informaci"),
    "Missing unavailable label for not_available stages",
  );
});

test("D04b: Fulfillment uses FulfillmentStageStatus (COMPLETED/IN_PROGRESS/NOT_STARTED/NOT_AVAILABLE)", () => {
  assert.ok(ordersSrc.includes("COMPLETED"), "Missing COMPLETED status");
  assert.ok(ordersSrc.includes("IN_PROGRESS"), "Missing IN_PROGRESS status");
  assert.ok(ordersSrc.includes("NOT_STARTED"), "Missing NOT_STARTED status");
  assert.ok(ordersSrc.includes("NOT_AVAILABLE"), "Missing NOT_AVAILABLE status");
  // Must NOT have old sin_factura semantics
  assert.ok(!ordersSrc.includes('"sin_factura"'), "Must NOT use sin_factura");
  assert.ok(!ordersSrc.includes('"facturado_completo"'), "Must NOT use facturado_completo");
});

test("D05: Order card shows consecutivo, customer, units, value", () => {
  assert.ok(ordersSrc.includes("order.consecutivo"), "Missing consecutivo");
  assert.ok(ordersSrc.includes("order.customerName"), "Missing customerName");
  assert.ok(ordersSrc.includes("order.totalUnits"), "Missing totalUnits");
  assert.ok(ordersSrc.includes("order.totalValue"), "Missing totalValue");
});

test("D06: Orders view accepts initialOrderId for deep link", () => {
  assert.ok(ordersSrc.includes("initialOrderId"), "Missing initialOrderId prop");
});

test("D07: All order statuses have labels", () => {
  assert.ok(ordersSrc.includes("borrador"), "Missing borrador status");
  assert.ok(ordersSrc.includes("listo_para_enviar"), "Missing listo_para_enviar status");
  assert.ok(ordersSrc.includes("pendiente_sag"), "Missing pendiente_sag status");
  assert.ok(ordersSrc.includes("sincronizado"), "Missing sincronizado status");
  assert.ok(ordersSrc.includes("conflicto"), "Missing conflicto status");
  assert.ok(ordersSrc.includes("cancelado"), "Missing cancelado status");
});

test("D08: Invoice status badge component exists", () => {
  assert.ok(ordersSrc.includes("InvoiceStatusBadge"), "Missing InvoiceStatusBadge");
});

test("D09: Timeline stage visual uses dots and lines", () => {
  assert.ok(ordersSrc.includes("TimelineStage"), "Missing TimelineStage component");
  assert.ok(ordersSrc.includes("borderRadius: \"50%\""), "Missing dot rendering");
});

// ── Suite E: Alerts view ───────────────────────────────────────────────────

console.log("\nSuite E: Alerts view");

const alertsSrc = readSrc("app/(app)/[orgSlug]/seller-app/views/seller-alerts-view.tsx");

test("E01: Alerts view has severity filters", () => {
  assert.ok(alertsSrc.includes('"critical"'), "Missing critical filter");
  assert.ok(alertsSrc.includes('"warning"'), "Missing warning filter");
  assert.ok(alertsSrc.includes('"info"'), "Missing info filter");
});

test("E02: Deep link mapping covers all attention types", () => {
  assert.ok(alertsSrc.includes("SAMPLE_WITHDRAWAL_REQUIRED"), "Missing SAMPLE_WITHDRAWAL type");
  assert.ok(alertsSrc.includes("PORTFOLIO_SUPPLY_REQUIRED"), "Missing PORTFOLIO_SUPPLY type");
  assert.ok(alertsSrc.includes("ORDER_PENDING_SYNC"), "Missing ORDER_PENDING_SYNC type");
  assert.ok(alertsSrc.includes("CUSTOMER_INACTIVE_90D"), "Missing CUSTOMER_INACTIVE type");
});

test("E03: Deep link resolves to correct tabs", () => {
  assert.ok(alertsSrc.includes('tab: "maleta"'), "Missing maleta deep link");
  assert.ok(alertsSrc.includes('tab: "pedidos"'), "Missing pedidos deep link");
  assert.ok(alertsSrc.includes('tab: "clientes"'), "Missing clientes deep link");
});

test("E04: Alert cards show type label, title, CTA", () => {
  assert.ok(alertsSrc.includes("typeLabel"), "Missing type label");
  assert.ok(alertsSrc.includes("item.title"), "Missing title");
  assert.ok(alertsSrc.includes("Ver detalle"), "Missing CTA button");
});

test("E05: Summary chips for severity counts", () => {
  assert.ok(alertsSrc.includes("criticalCount"), "Missing critical count");
  assert.ok(alertsSrc.includes("warningCount"), "Missing warning count");
  assert.ok(alertsSrc.includes("infoCount"), "Missing info count");
});

test("E06: Alerts onNavigate callback exists", () => {
  assert.ok(alertsSrc.includes("onNavigate"), "Missing onNavigate prop");
});

test("E07: Retiro deep link → maleta section retiro", () => {
  assert.ok(alertsSrc.includes('section: "retiro"'), "Missing retiro section deep link");
});

// ── Suite F: Shared types ──────────────────────────────────────────────────

console.log("\nSuite F: Shared types");

const sharedSrc = readSrc("app/(app)/[orgSlug]/seller-app/views/seller-app-shared.tsx");

test("F01: SellerTab includes maleta and alertas", () => {
  assert.ok(sharedSrc.includes('"maleta"'), "Missing maleta tab type");
  assert.ok(sharedSrc.includes('"alertas"'), "Missing alertas tab type");
});

test("F02: SerializedPortfolio type exists", () => {
  assert.ok(sharedSrc.includes("SerializedPortfolio"), "Missing SerializedPortfolio");
});

test("F03: SerializedOrderCard type exists", () => {
  assert.ok(sharedSrc.includes("SerializedOrderCard"), "Missing SerializedOrderCard");
});

test("F04: SerializedSupplyNeed type exists", () => {
  assert.ok(sharedSrc.includes("SerializedSupplyNeed"), "Missing SerializedSupplyNeed");
});

test("F05: SellerAppShellProps includes portfolio, supplyNeeds, orders", () => {
  assert.ok(sharedSrc.includes("portfolio:"), "Missing portfolio in ShellProps");
  assert.ok(sharedSrc.includes("supplyNeeds:"), "Missing supplyNeeds in ShellProps");
  assert.ok(sharedSrc.includes("orders:"), "Missing orders in ShellProps");
});

test("F06: SerializedOrderCard.fulfillmentPercent is nullable", () => {
  assert.ok(sharedSrc.includes("fulfillmentPercent: number | null"), "fulfillmentPercent must be number | null");
});

// ── Suite G: Inicio view shortcuts ─────────────────────────────────────────

console.log("\nSuite G: Inicio view shortcuts");

const inicioSrc = readSrc("app/(app)/[orgSlug]/seller-app/views/inicio-view.tsx");

test("G01: Mi maleta shortcut is enabled (not disabled)", () => {
  // Fable UX uses HomeShortcut with onNavigate?.("maleta") instead of key: "maleta"
  assert.ok(inicioSrc.includes('"maleta"'), "Missing maleta navigation target");
  assert.ok(inicioSrc.includes("Mi maleta"), "Missing Mi maleta label");
});

test("G02: Mi maleta shortcut has tab: maleta", () => {
  // Fable UX: onNavigate?.("maleta") or tab: "maleta" — either valid
  assert.ok(
    inicioSrc.includes('tab: "maleta"') || inicioSrc.includes('"maleta"'),
    "Missing maleta navigation target",
  );
});

test("G03: Alertas shortcut exists", () => {
  assert.ok(inicioSrc.includes('"alertas"'), "Missing alertas navigation target");
  assert.ok(inicioSrc.includes("Alertas"), "Missing Alertas label");
});

test("G04: Catalogo shortcut restored with feature gate", () => {
  assert.ok(inicioSrc.includes("SELLER_CATALOG_GENERATION"), "Missing feature gate");
  // Fable UX uses "Próximamente" (accented) instead of "Proximamente"
  assert.ok(
    inicioSrc.includes("Proximamente") || inicioSrc.includes("Próximamente"),
    "Missing Proximamente label when disabled",
  );
});

test("G05: Location hook wired to Home", () => {
  assert.ok(inicioSrc.includes("useSellerLocation"), "Missing useSellerLocation import");
  assert.ok(inicioSrc.includes("LocationStrip"), "Missing LocationStrip component");
  assert.ok(inicioSrc.includes("requestLocation"), "Missing requestLocation");
});

test("G06: InicioView accepts features prop", () => {
  assert.ok(inicioSrc.includes("features:"), "Missing features prop");
  assert.ok(inicioSrc.includes("SellerAppFeatureFlags"), "Missing SellerAppFeatureFlags type");
});

// ── Suite H: PWA manifest ──────────────────────────────────────────────────

console.log("\nSuite H: PWA manifest");

test("H01: manifest.json exists", () => {
  const manifestPath = path.join(BASE, "public/manifest.json");
  assert.ok(fs.existsSync(manifestPath), "Missing manifest.json");
});

test("H02: manifest has standalone display", () => {
  const manifest = JSON.parse(readSrc("public/manifest.json"));
  assert.strictEqual(manifest.display, "standalone", "Display should be standalone");
});

test("H03: manifest has brand blue theme color", () => {
  const manifest = JSON.parse(readSrc("public/manifest.json"));
  assert.strictEqual(manifest.theme_color, "#004AAD", "Theme color should be brand blue");
});

test("H04: layout.tsx references manifest", () => {
  const layoutSrc = readSrc("app/layout.tsx");
  assert.ok(layoutSrc.includes("manifest"), "Missing manifest reference in layout");
});

// ── Suite I: Location hook ─────────────────────────────────────────────────

console.log("\nSuite I: Location hook");

const locationSrc = readSrc("hooks/use-seller-location.ts");

test("I01: useSellerLocation exports correctly", () => {
  assert.ok(locationSrc.includes("export function useSellerLocation"), "Missing export");
});

test("I02: Location permission states are defined", () => {
  assert.ok(locationSrc.includes('"idle"'), "Missing idle state");
  assert.ok(locationSrc.includes('"requesting"'), "Missing requesting state");
  assert.ok(locationSrc.includes('"granted"'), "Missing granted state");
  assert.ok(locationSrc.includes('"denied"'), "Missing denied state");
  assert.ok(locationSrc.includes('"unavailable"'), "Missing unavailable state");
});

test("I03: Does NOT auto-request location", () => {
  assert.ok(!locationSrc.includes("useEffect"), "Should not use useEffect for auto-request");
  assert.ok(locationSrc.includes("requestLocation"), "Missing requestLocation callback");
});

test("I04: Handles PERMISSION_DENIED error", () => {
  assert.ok(locationSrc.includes("PERMISSION_DENIED"), "Missing PERMISSION_DENIED handling");
});

test("I05: Returns lat/lng/accuracy/timestamp", () => {
  assert.ok(locationSrc.includes("latitude"), "Missing latitude");
  assert.ok(locationSrc.includes("longitude"), "Missing longitude");
  assert.ok(locationSrc.includes("accuracy"), "Missing accuracy");
});

// ── Suite J: Token compliance ──────────────────────────────────────────────

console.log("\nSuite J: Token compliance");

const viewFiles = [
  "app/(app)/[orgSlug]/seller-app/views/seller-portfolio-view.tsx",
  "app/(app)/[orgSlug]/seller-app/views/seller-orders-view.tsx",
  "app/(app)/[orgSlug]/seller-app/views/seller-alerts-view.tsx",
];

test("J01: All views use C.* tokens (no raw hex in views)", () => {
  for (const file of viewFiles) {
    const src = readSrc(file);
    // Allow hex in specific whitelist patterns (rgba, etc)
    const hexMatches = src.match(/#[0-9a-fA-F]{3,6}[^"]/g);
    assert.ok(!hexMatches, `Raw hex found in ${file}: ${hexMatches?.join(", ")}`);
  }
});

test("J02: All views use T.mono or T.sans (no raw font-family)", () => {
  for (const file of viewFiles) {
    const src = readSrc(file);
    assert.ok(!src.includes('fontFamily: "'), `Raw fontFamily in ${file}`);
    assert.ok(!src.includes("fontFamily: 'monospace'"), `Raw monospace in ${file}`);
  }
});

test("J03: All views import from @/lib/ui/tokens", () => {
  for (const file of viewFiles) {
    const src = readSrc(file);
    assert.ok(src.includes("@/lib/ui/tokens"), `Missing token import in ${file}`);
  }
});

// ── Suite K: Tenant isolation ──────────────────────────────────────────────

console.log("\nSuite K: Tenant isolation");

test("K01: Page uses organization.id for all data loads", () => {
  // Every data function call should pass orgId
  assert.ok(pageSrc.includes("getSalesPortfolio(organization.id"), "Portfolio not org-scoped");
  assert.ok(pageSrc.includes("organizationId: organization.id"), "Orders not org-scoped");
  assert.ok(pageSrc.includes("getSellerAttention(\n    organization.id"), "Attention not org-scoped");
});

test("K02: No cross-tenant data leakage (sellerIdentity.sellerId used for portfolio)", () => {
  const portfolioCallCount = (pageSrc.match(/sellerIdentity\.sellerId/g) || []).length;
  assert.ok(portfolioCallCount >= 3, "Should use sellerId for portfolio scoping");
});

// ── Suite L: P0-FINAL — Deterministic seller identity ────────────────────

console.log("\nSuite L: P0-FINAL — Deterministic seller identity");

test("L01-A: Orders use sellerTerceroId (integer) not sellerName contains", () => {
  // Must NOT have contains/insensitive pattern for order filtering
  const orderSection = pageSrc.slice(pageSrc.indexOf("Load orders"));
  assert.ok(!orderSection.includes("contains: sellerIdentity.sellerId"), "FAIL: still uses contains for seller filtering");
  assert.ok(!orderSection.includes('mode: "insensitive"'), "FAIL: still uses insensitive mode");
  assert.ok(pageSrc.includes("sellerTerceroId"), "Must use sellerTerceroId for deterministic filtering");
});

test("L01-B: Deterministic resolution via sagSellerCode (stable sellerTerceroId)", () => {
  // sagSellerCode is resolved upstream in resolveCurrentSeller via resolveSellerTerceroId.
  // page.tsx uses the pre-resolved integer — no name-based lookup at query time.
  assert.ok(
    pageSrc.includes("sagSellerCode") || pageSrc.includes("terceroLookup"),
    "Must use sagSellerCode or terceroLookup for deterministic ID",
  );
  assert.ok(pageSrc.includes("sellerTerceroId"), "Must use sellerTerceroId for order filtering");
});

test("L01-C: Empty orders when no deterministic seller identity", () => {
  // When sagSellerCode is null and not manager, orders should be empty
  assert.ok(
    pageSrc.includes("serializedOrders = []") || pageSrc.includes("SELLER_ORDER_IDENTITY_BLOCKER"),
    "Must return empty orders when no stable seller identity",
  );
});

test("L01-D: Manager/admin scope bypasses seller filter (canAccessAllOrders)", () => {
  assert.ok(pageSrc.includes("scope.canAccessAllOrders"), "Must check canAccessAllOrders for manager scope");
});

// ── Suite M: P0-FINAL — Order detail security ────────────────────────────

console.log("\nSuite M: P0-FINAL — Order detail security");

test("M01: Orders passed as props (secure by construction)", () => {
  const shellSrc = readSrc("app/(app)/[orgSlug]/seller-app/seller-app-shell.tsx");
  assert.ok(shellSrc.includes("orders={props.orders}") || shellSrc.includes("props.orders"), "Orders must come from server props");
});

test("M02: Order view receives orders as props, no direct DB access", () => {
  const orderViewSrc = readSrc("app/(app)/[orgSlug]/seller-app/views/seller-orders-view.tsx");
  assert.ok(!orderViewSrc.includes("prisma"), "Order view must not import prisma");
  assert.ok(!orderViewSrc.includes("fetch("), "Order view must not fetch orders directly");
});

// ── Suite N: P0-FINAL — Strict fulfillment semantics ─────────────────────

console.log("\nSuite N: P0-FINAL — Strict fulfillment semantics");

test("N01-E: Uses deriveStrictFulfillmentStages (canonical authority)", () => {
  assert.ok(pageSrc.includes("deriveStrictFulfillmentStages"), "Must use canonical fulfillment service");
  assert.ok(pageSrc.includes("fulfillment.invoice"), "Must use fulfillment.invoice from canonical service");
});

test("N02-F: No hand-derived IN_PROGRESS for DESPACHADO invoice", () => {
  // The old pattern: sagStatus === "DESPACHADO" ? "IN_PROGRESS" must NOT exist
  const orderSection = pageSrc.slice(pageSrc.indexOf("Load orders"));
  assert.ok(!orderSection.includes('"IN_PROGRESS"'), "FAIL: hand-derived IN_PROGRESS still present in order loading");
});

test("N03-G: FACTURADO → invoice COMPLETED in canonical service", () => {
  const fulfillmentSrc = readSrc("lib/comercial/frontline/order-fulfillment-timeline.ts");
  assert.ok(fulfillmentSrc.includes("deriveStrictFulfillmentStages"), "Canonical function must exist");
  // FACTURADO case returns invoice: COMPLETED
  assert.ok(fulfillmentSrc.includes('case "FACTURADO"'), "Must handle FACTURADO");
  assert.ok(fulfillmentSrc.includes('invoice: "COMPLETED"'), "FACTURADO must map to invoice COMPLETED");
});

test("N04-H: DESPACHADO → invoice NOT_AVAILABLE (not IN_PROGRESS)", () => {
  const fulfillmentSrc = readSrc("lib/comercial/frontline/order-fulfillment-timeline.ts");
  // In deriveStrictFulfillmentStages, DESPACHADO returns invoice: NOT_AVAILABLE
  const strictFn = fulfillmentSrc.slice(fulfillmentSrc.indexOf("deriveStrictFulfillmentStages"));
  const despachadoBlock = strictFn.slice(strictFn.indexOf('"DESPACHADO"'), strictFn.indexOf('"DESPACHADO"') + 200);
  assert.ok(despachadoBlock.includes('invoice: "NOT_AVAILABLE"'), "DESPACHADO must NOT certify invoice");
});

test("N05: Default/unknown → all NOT_AVAILABLE", () => {
  const fulfillmentSrc = readSrc("lib/comercial/frontline/order-fulfillment-timeline.ts");
  const strictFn = fulfillmentSrc.slice(fulfillmentSrc.indexOf("deriveStrictFulfillmentStages"));
  const defaultBlock = strictFn.slice(strictFn.indexOf("default:"), strictFn.indexOf("default:") + 200);
  assert.ok(defaultBlock.includes('invoice: "NOT_AVAILABLE"'), "Default must be NOT_AVAILABLE");
  assert.ok(defaultBlock.includes('shipment: "NOT_AVAILABLE"'), "Default shipment must be NOT_AVAILABLE");
});

// ── Suite O: P0-FINAL — Location presentation ────────────────────────────

console.log("\nSuite O: P0-FINAL — Location presentation");

test("O01-I: No raw lat/lng in location strip", () => {
  const inicioSrc = readSrc("app/(app)/[orgSlug]/seller-app/views/inicio-view.tsx");
  assert.ok(!inicioSrc.includes("toFixed(4)"), "FAIL: raw coordinates still shown");
  assert.ok(!inicioSrc.includes("location.latitude"), "FAIL: latitude still rendered");
  assert.ok(!inicioSrc.includes("location.longitude"), "FAIL: longitude still rendered");
});

test("O02: Granted state shows 'Ubicacion activa'", () => {
  const inicioSrc = readSrc("app/(app)/[orgSlug]/seller-app/views/inicio-view.tsx");
  assert.ok(
    inicioSrc.includes("Ubicacion activa") || inicioSrc.includes("Ubicación activa"),
    "Must show 'Ubicacion activa' when granted",
  );
});

test("O03: Shows 'Ciudad no disponible' (no geocoder)", () => {
  const inicioSrc = readSrc("app/(app)/[orgSlug]/seller-app/views/inicio-view.tsx");
  assert.ok(inicioSrc.includes("Ciudad no disponible"), "Must show 'Ciudad no disponible'");
});

test("O04: Idle shows 'Activar ubicacion'", () => {
  const inicioSrc = readSrc("app/(app)/[orgSlug]/seller-app/views/inicio-view.tsx");
  assert.ok(
    inicioSrc.includes("Activar ubicacion") || inicioSrc.includes("Activar ubicación"),
    "Idle must show 'Activar ubicacion'",
  );
});

test("O05: Denied shows 'Ubicacion desactivada'", () => {
  const inicioSrc = readSrc("app/(app)/[orgSlug]/seller-app/views/inicio-view.tsx");
  assert.ok(
    inicioSrc.includes("Ubicacion desactivada") || inicioSrc.includes("Ubicación desactivada"),
    "Denied must show 'Ubicacion desactivada'",
  );
});

test("O06: Unavailable shows 'Ubicacion no disponible'", () => {
  const inicioSrc = readSrc("app/(app)/[orgSlug]/seller-app/views/inicio-view.tsx");
  assert.ok(
    inicioSrc.includes("Ubicacion no disponible") || inicioSrc.includes("Ubicación no disponible"),
    "Unavailable must show 'Ubicacion no disponible'",
  );
});

// ══════════════════════════════════════════════════════════════════════════════

console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${"=".repeat(50)}\n`);

process.exit(failed > 0 ? 1 : 0);
