/**
 * lib/comercial/tiendas/__tests__/main-workspace-simplification.test.ts
 *
 * Tests for AGENTIK-STORES-MAIN-WORKSPACE-SIMPLIFICATION-01.
 *
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/main-workspace-simplification.test.ts
 *
 * Sprint: AGENTIK-STORES-MAIN-WORKSPACE-SIMPLIFICATION-01
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── Source code (avoid server-only imports) ──────────────────────────────

const CLIENT_SOURCE = readFileSync(
  resolve(__dirname, "../../../../app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx"), "utf-8"
);
const ROUTE_SOURCE = readFileSync(
  resolve(__dirname, "../../../../app/api/orgs/[orgSlug]/comercial/tiendas/route.ts"), "utf-8"
);

// ── PRIMERO: Global tabs removed ──────────────────────────────────────────

describe("PRIMERO — Global Necesidades and Sugerencias tabs removed", () => {
  it("no WorkspaceView type exists", () => {
    assert.ok(!CLIENT_SOURCE.includes("type WorkspaceView"));
  });

  it("no view state variable", () => {
    assert.ok(!CLIENT_SOURCE.includes("useState<WorkspaceView>"));
  });

  it("no tab navigation bar with necesidades/sugerencias options", () => {
    // Old pattern: {(["tiendas", "necesidades", "sugerencias"] as WorkspaceView[]).map
    assert.ok(!CLIENT_SOURCE.includes("WorkspaceView[]"));
  });

  it("no view === 'necesidades' conditional", () => {
    assert.ok(!CLIENT_SOURCE.includes('view === "necesidades"'));
  });

  it("no view === 'sugerencias' conditional", () => {
    assert.ok(!CLIENT_SOURCE.includes('view === "sugerencias"'));
  });
});

// ── SEGUNDO: Panel principal shows only store cards ───────────────────────

describe("SEGUNDO — Panel principal: 4 store cards + inactive + freshness", () => {
  it("renders OperationalStoreCard", () => {
    assert.ok(CLIENT_SOURCE.includes("<OperationalStoreCard"));
  });

  it("renders DistKpiCard for KPI strip", () => {
    assert.ok(CLIENT_SOURCE.includes("<DistKpiCard"));
  });

  it("has 'Ver tiendas inactivas' button", () => {
    assert.ok(CLIENT_SOURCE.includes("Ver tiendas inactivas"));
  });

  it("has data freshness pill", () => {
    assert.ok(CLIENT_SOURCE.includes("Datos persistidos"));
  });

  it("has intelligence disclaimer", () => {
    assert.ok(CLIENT_SOURCE.includes("La inteligencia del modulo utiliza unicamente las tiendas activas"));
  });
});

// ── TERCERO: Dead components removed ──────────────────────────────────────

describe("TERCERO — Dead components eliminated", () => {
  const deadComponents = [
    "function StoreCardView(",
    "function ProposalsListView(",
    "function StoreDetailDrawer(",
    "function DomainFilterStrip(",
    "function ShortagesTab(",
    "function SuggestionsTab(",
    "function StockLookupPanel(",
    "function InventarioTab(",
    "function RulesTab(",
    "function CreateRuleStub(",
    "function TextileCoverageTab(",
    "function PolicyTab(",
    "function AddPolicyRuleForm(",
    "function EligibleNeedsView(",
    "function NeedMiniStat(",
    "function SuggestionsMotorView(",
    "function GuidesView(",
    "function GuideDetailDrawer(",
    "function MainWarehouseTab(",
    "function ProposalDetailDrawer(",
    "function ProposalLineRow(",
    "function ProposalActions(",
    "function DuplicateDialog(",
    "function WarehouseConfigDrawer(",
    "function WarehouseConfigForm(",
    "function StubButton(",
    "function DistributionView(",
  ];

  for (const comp of deadComponents) {
    it(`removed: ${comp.replace("function ", "").replace("(", "")}`, () => {
      assert.ok(!CLIENT_SOURCE.includes(comp), `Dead component still exists: ${comp}`);
    });
  }
});

// ── CUARTO: Live components preserved ─────────────────────────────────────

describe("CUARTO — Live components preserved", () => {
  const liveComponents = [
    "function OperationalStoreCard(",
    "function MetricBox(",
    "function DerroteroTab(",
    "function MiniStat(",
    "function formatTimeAgo(",
    "function classifyItemDomain(",
    "function ReplacementCandidatesPanel(",
    "function DistributionStoreDrawer(",
    "function DistKpiCard(",
  ];

  for (const comp of liveComponents) {
    it(`preserved: ${comp.replace("function ", "").replace("(", "")}`, () => {
      assert.ok(CLIENT_SOURCE.includes(comp), `Live component missing: ${comp}`);
    });
  }
});

// ── QUINTO: Drawer architecture — 4 lazy tabs ─────────────────────────────

describe("QUINTO — DistributionStoreDrawer has 4 tabs", () => {
  it("has inventario tab", () => {
    assert.ok(CLIENT_SOURCE.includes('"inventario"'));
  });

  it("has necesidades tab", () => {
    assert.ok(CLIENT_SOURCE.includes('"necesidades"'));
  });

  it("has derrotero tab", () => {
    assert.ok(CLIENT_SOURCE.includes('"derrotero"'));
  });

  it("has inteligencia tab", () => {
    assert.ok(CLIENT_SOURCE.includes('"inteligencia"'));
  });

  it("DistDrawerTab type includes all 4 tabs", () => {
    assert.ok(CLIENT_SOURCE.includes('type DistDrawerTab = "inventario" | "necesidades" | "derrotero" | "inteligencia"'));
  });
});

// ── SEXTO: Dead status maps removed ───────────────────────────────────────

describe("SEXTO — Dead status maps removed", () => {
  const deadMaps = [
    "const STATUS_LABEL:",
    "const STATUS_COLOR:",
    "const SEVERITY_LABEL:",
    "const SEVERITY_COLOR:",
    "const SUGGESTION_LABEL:",
    "const SUGGESTION_COLOR:",
    "const RULE_TYPE_LABEL:",
    "const PROPOSAL_STATUS_LABEL:",
    "const PROPOSAL_STATUS_COLOR:",
    "const LINE_TYPE_LABEL:",
    "const LINE_TYPE_COLOR:",
    "const STORE_TYPE_LABEL:",
    "const ADMIN_BADGE:",
    "const SYNC_BADGE:",
  ];

  for (const map of deadMaps) {
    it(`removed: ${map.replace("const ", "").replace(":", "")}`, () => {
      assert.ok(!CLIENT_SOURCE.includes(map), `Dead map still exists: ${map}`);
    });
  }
});

// ── SÉPTIMO: Dead imports removed ─────────────────────────────────────────

describe("SÉPTIMO — Dead imports removed", () => {
  it("no store-replenishment-types import", () => {
    assert.ok(!CLIENT_SOURCE.includes("store-replenishment-types"));
  });

  it("no store-transfer-types import", () => {
    assert.ok(!CLIENT_SOURCE.includes("store-transfer-types"));
  });

  it("no store-policy-types import", () => {
    assert.ok(!CLIENT_SOURCE.includes("store-policy-types"));
  });

  it("no store-needs-types import", () => {
    assert.ok(!CLIENT_SOURCE.includes("store-needs-types"));
  });

  it("no store-needs-eligible-universe import", () => {
    assert.ok(!CLIENT_SOURCE.includes("store-needs-eligible-universe"));
  });

  it("no store-suggestions-types import", () => {
    assert.ok(!CLIENT_SOURCE.includes("store-suggestions-types"));
  });

  it("no store-guide-types import", () => {
    assert.ok(!CLIENT_SOURCE.includes("store-guide-types"));
  });

  it("no assortment-types import", () => {
    assert.ok(!CLIENT_SOURCE.includes("assortment-types"));
  });

  it("no textile-coverage-engine import", () => {
    assert.ok(!CLIENT_SOURCE.includes("textile-coverage-engine"));
  });

  it("no store-business-lines import", () => {
    assert.ok(!CLIENT_SOURCE.includes("store-business-lines"));
  });

  it("no useRef import", () => {
    // useRef was only used in dead TabCacheRef code
    assert.ok(!CLIENT_SOURCE.includes("useRef"));
  });
});

// ── OCTAVO: Dead helper functions removed ─────────────────────────────────

describe("OCTAVO — Dead helpers removed", () => {
  it("no proposalApi function", () => {
    assert.ok(!CLIENT_SOURCE.includes("async function proposalApi("));
  });

  it("no configApi function", () => {
    assert.ok(!CLIENT_SOURCE.includes("async function configApi("));
  });

  it("no deriveAdminState function", () => {
    assert.ok(!CLIENT_SOURCE.includes("function deriveAdminState("));
  });

  it("no deriveStoreSyncState function", () => {
    assert.ok(!CLIENT_SOURCE.includes("function deriveStoreSyncState("));
  });

  it("no TabCacheData type", () => {
    assert.ok(!CLIENT_SOURCE.includes("type TabCacheData"));
  });

  it("no TabCacheRef type", () => {
    assert.ok(!CLIENT_SOURCE.includes("type TabCacheRef"));
  });

  it("no StoreSummaryData interface", () => {
    assert.ok(!CLIENT_SOURCE.includes("interface StoreSummaryData"));
  });

  it("no WarehouseConfig interface", () => {
    assert.ok(!CLIENT_SOURCE.includes("interface WarehouseConfig"));
  });
});

// ── NOVENO: File size reduction ───────────────────────────────────────────

describe("NOVENO — File size reduction", () => {
  it("file is under 2400 lines (was 6340, post-inventory-by-line ~2300)", () => {
    const lineCount = CLIENT_SOURCE.split("\n").length;
    assert.ok(lineCount < 2400, `Expected < 2400 lines, got ${lineCount}`);
  });

  it("file is over 1500 lines (preserves live components)", () => {
    const lineCount = CLIENT_SOURCE.split("\n").length;
    assert.ok(lineCount > 1500, `Expected > 1500 lines, got ${lineCount}`);
  });
});

// ── DÉCIMO: Governance preserved ──────────────────────────────────────────

describe("DÉCIMO — Governance system preserved", () => {
  it("has governance confirmation modal", () => {
    assert.ok(CLIENT_SOURCE.includes("Confirmar activacion"));
    assert.ok(CLIENT_SOURCE.includes("Confirmar desactivacion"));
  });

  it("has inactive stores section", () => {
    assert.ok(CLIENT_SOURCE.includes("Tiendas inactivas"));
    assert.ok(CLIENT_SOURCE.includes("No hay tiendas inactivas"));
  });

  it("has deactivation reason field", () => {
    assert.ok(CLIENT_SOURCE.includes("Motivo (obligatorio)"));
  });

  it("has Activar tienda button", () => {
    assert.ok(CLIENT_SOURCE.includes("Activar tienda"));
  });
});

// ── UNDÉCIMO: API route untouched ─────────────────────────────────────────

describe("UNDÉCIMO — API route not modified", () => {
  it("route still has store_distribution action", () => {
    assert.ok(ROUTE_SOURCE.includes("store_distribution"));
  });

  it("route still has store_distribution_detail action", () => {
    assert.ok(ROUTE_SOURCE.includes("store_distribution_detail"));
  });

  it("route still has store_governance_list action", () => {
    assert.ok(ROUTE_SOURCE.includes("store_governance_list"));
  });

  it("route still has store_activate action", () => {
    assert.ok(ROUTE_SOURCE.includes("store_activate"));
  });

  it("route still has store_deactivate action", () => {
    assert.ok(ROUTE_SOURCE.includes("store_deactivate"));
  });
});

// ── DUODÉCIMO: Essential imports preserved ─────────────────────────────────

describe("DUODÉCIMO — Essential imports preserved", () => {
  it("imports OperationalWorkspaceHeader", () => {
    assert.ok(CLIENT_SOURCE.includes("OperationalWorkspaceHeader"));
  });

  it("imports OperationalSideDrawer", () => {
    assert.ok(CLIENT_SOURCE.includes("OperationalSideDrawer"));
  });

  it("imports CommercialReferenceThumbnail", () => {
    assert.ok(CLIENT_SOURCE.includes("CommercialReferenceThumbnail"));
  });

  it("imports store-distribution-types", () => {
    assert.ok(CLIENT_SOURCE.includes("store-distribution-types"));
  });

  it("imports store-governance-types", () => {
    assert.ok(CLIENT_SOURCE.includes("store-governance-types"));
  });

  it("imports ACTIVE_STORE_SLUGS", () => {
    assert.ok(CLIENT_SOURCE.includes("ACTIVE_STORE_SLUGS"));
  });
});

// ── DECIMOTERCERO: No global heavy fetches on mount ────────────────────────

describe("DECIMOTERCERO — No global heavy fetches on mount", () => {
  it("no loadEligibleNeeds function", () => {
    assert.ok(!CLIENT_SOURCE.includes("loadEligibleNeeds"));
  });

  it("no switchToNeeds function", () => {
    assert.ok(!CLIENT_SOURCE.includes("switchToNeeds"));
  });

  it("no switchToSuggestions function", () => {
    assert.ok(!CLIENT_SOURCE.includes("switchToSuggestions"));
  });

  it("no eligibleNeeds state", () => {
    assert.ok(!CLIENT_SOURCE.includes("eligibleNeeds"));
  });

  it("no suggestions state for global view", () => {
    // suggestionsLoading/suggestionsLoaded were global tab state
    assert.ok(!CLIENT_SOURCE.includes("suggestionsLoading"));
    assert.ok(!CLIENT_SOURCE.includes("suggestionsLoaded"));
  });

  it("only loads store_distribution on mount", () => {
    // The useEffect should only call store_distribution, not needs/suggestions
    assert.ok(CLIENT_SOURCE.includes('action: "store_distribution"'));
  });
});

// ── DECIMOCUARTO: DerroteroTab still functional ────────────────────────────

describe("DECIMOCUARTO — DerroteroTab preserved with all helpers", () => {
  it("DerroteroTab function exists", () => {
    assert.ok(CLIENT_SOURCE.includes("function DerroteroTab("));
  });

  it("getSourceForBlock helper exists", () => {
    assert.ok(CLIENT_SOURCE.includes("function getSourceForBlock("));
  });

  it("renderBlockSource helper exists", () => {
    assert.ok(CLIENT_SOURCE.includes("function renderBlockSource("));
  });

  it("renderTextileBlock helper exists", () => {
    assert.ok(CLIENT_SOURCE.includes("function renderTextileBlock("));
  });

  it("renderAccessoryBlock helper exists", () => {
    assert.ok(CLIENT_SOURCE.includes("function renderAccessoryBlock("));
  });

  it("renderScarcityBlock helper exists", () => {
    assert.ok(CLIENT_SOURCE.includes("function renderScarcityBlock("));
  });

  it("renderSpecialBlock helper exists", () => {
    assert.ok(CLIENT_SOURCE.includes("function renderSpecialBlock("));
  });
});

// ── DECIMOQUINTO: Error + empty states preserved ───────────────────────────

describe("DECIMOQUINTO — Error and empty states preserved", () => {
  it("error state shows retry button", () => {
    assert.ok(CLIENT_SOURCE.includes("No fue posible cargar la distribucion"));
    assert.ok(CLIENT_SOURCE.includes("Reintentar"));
  });

  it("skeleton loading state exists", () => {
    assert.ok(CLIENT_SOURCE.includes("pulse 1.5s infinite"));
  });

  it("empty inactive stores message", () => {
    assert.ok(CLIENT_SOURCE.includes("No hay tiendas inactivas"));
  });
});
