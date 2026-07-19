"use client";

/**
 * MaletasClient — Centro de Inteligencia Comercial de Muestras
 *
 * VENDOR-SAMPLE-REPLACEMENT-INTELLIGENCE-01
 * VENDOR-SAMPLE-REPLACEMENT-DRAWER-ACTIONS-01
 * VENDOR-SAMPLE-SUBGROUP-REPLACEMENT-ENGINE-01
 * MALETAS-COMMERCIAL-INTELLIGENCE-01
 * MALLETAS-EXECUTIVE-UX-01
 * MALETAS-BULK-REPLENISHMENT-01
 *
 * 2-state model: SALUDABLE | REEMPLAZAR
 * Multi-option replacement engine by subgrupo SAG.
 * Drawer: inline replacement detail panel with multiple options.
 * Executive UX: premium commercial intelligence center.
 * Bulk replenishment: plan de surtido de maleta as operational unit.
 */

import { useState, useMemo, useRef, useCallback, useEffect, type CSSProperties } from "react";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { OperationalSideDrawer } from "@/components/workspace/operational-side-drawer";
import { C, T, S, R, E } from "@/lib/ui/tokens";
import type {
  VendorSampleSnapshot,
  VendorSampleRef,
  VendorHealth,
  SampleState,
  SampleCommercialHealth,
  MaletasExecutiveSummary,
  CoverageGapRef,
  ProductionSuggestion,
  VendorOpReplacementOption,
  AccessorySummary,
} from "@/lib/comercial/maletas/vendor-sample-types";
import type {
  MaletasCommercialIntelligenceResult,
  VendorCommercialIntelligence,
} from "@/lib/comercial/maletas/maletas-commercial-intelligence-types";
import type {
  MaletaCandidate,
  MaletaSurtidoGuide,
} from "@/lib/comercial/maletas/maleta-surtido-types";
import {
  RESERVATION_STATUS_LABEL,
} from "@/lib/comercial/maletas/maleta-surtido-types";
import type {
  MaletaReplenishmentPlan,
  ReplenishmentPlanStatus,
} from "@/lib/comercial/maletas/replenishment-plan-types";
import {
  computeCoverageRecovery,
  PLAN_STATUS_LABEL,
} from "@/lib/comercial/maletas/replenishment-plan-types";
import type {
  VendorAssortmentResult,
  SubgroupProductionEval,
  ProductionDecision,
  ImportEvaluationResult,
  ImportRefDecision,
  CoverageOpportunity,
  UnresolvedRef as UnresolvedRefType,
  UnresolvedSummary,
  VendorMalletBaseMetrics,
} from "@/lib/comercial/maletas/maletas-functional-evaluation";
import { getVendorMalletBaseMetrics } from "@/lib/comercial/maletas/maletas-functional-evaluation";
import { MaletaPortfolioBuilder } from "@/components/comercial/maletas/maleta-portfolio-builder";
import type { MaletaSelectionItem } from "@/lib/comercial/maletas/vendor-bag-types";

// ── Props ────────────────────────────────────────────────────────────────────

interface MaletasClientProps {
  orgSlug: string;
  vendors: VendorSampleSnapshot[];
  summary: MaletasExecutiveSummary;
  coverageGaps: CoverageGapRef[];
  productionSuggestions: ProductionSuggestion[];
  intelligence: MaletasCommercialIntelligenceResult;
  accessorySummary: AccessorySummary;
  source: "sag" | "prisma" | "empty";
  loadedAt: string;
  // MALLETS-FUNCTIONAL-RECOVERY-01
  assortmentEvaluations: VendorAssortmentResult[];
  productionThresholds: SubgroupProductionEval[];
  importEvaluation: ImportEvaluationResult;
  coverageOpportunities: CoverageOpportunity[];
}

// ── Design tokens ────────────────────────────────────────────────────────────

const HEALTH_COLOR: Record<VendorHealth, string> = {
  saludable: C.green,
  riesgo: C.amber,
  critico: C.red,
  sin_datos: C.inkFaint,
};

const HEALTH_LABEL: Record<VendorHealth, string> = {
  saludable: "Saludable",
  riesgo: "Riesgo",
  critico: "Critico",
  sin_datos: "Sin datos",
};

const STATE_COLOR: Record<SampleState, string> = {
  saludable: C.green,
  reemplazar: C.blueDark,
  sin_datos: C.inkFaint,
};

const STATE_LABEL: Record<SampleState, string> = {
  saludable: "Saludable",
  reemplazar: "Reemplazar",
  sin_datos: "Sin datos",
};

const STATE_BG: Record<SampleState, string> = {
  saludable: C.green + "14",
  reemplazar: C.blueDark + "14",
  sin_datos: C.inkFaint + "14",
};

// MALLETS-OPERATIONAL-LOGIC-ALIGNMENT-01: Commercial health tokens
const COMMERCIAL_HEALTH_COLOR: Record<SampleCommercialHealth, string> = {
  HEALTHY: C.green,
  LOW_STOCK: C.amber,
  OUT_OF_STOCK: C.red,
  INSUFFICIENT_DATA: C.inkFaint,
};
const COMMERCIAL_HEALTH_LABEL: Record<SampleCommercialHealth, string> = {
  HEALTHY: "Saludable",
  LOW_STOCK: "Stock bajo",
  OUT_OF_STOCK: "Agotado",
  INSUFFICIENT_DATA: "Sin datos",
};

const URGENCY_COLOR: Record<string, string> = {
  alta: C.red,
  media: C.amber,
  baja: C.inkFaint,
};


const PAGE_SIZE = 50;

// ── Drawer filter type ───────────────────────────────────────────────────────

type DrawerFilter = SampleState | "all";

const FILTER_ORDER: DrawerFilter[] = [
  "all", "saludable",
];

const FILTER_LABEL: Record<DrawerFilter, string> = {
  all: "Todas",
  saludable: "Saludables",
  reemplazar: "Reemplazar",
  sin_datos: "Sin datos",
};

// ── Component ────────────────────────────────────────────────────────────────

export function MaletasClient({
  orgSlug,
  vendors,
  summary,
  intelligence,
  accessorySummary,
  source,
  loadedAt,
  assortmentEvaluations,
  productionThresholds,
  importEvaluation,
  coverageOpportunities,
}: MaletasClientProps) {
  const [selectedVendor, setSelectedVendor] = useState<VendorSampleSnapshot | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lineFilters, setLineFilters] = useState<Record<string, DrawerFilter>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [lineVisibleCounts, setLineVisibleCounts] = useState<Record<string, number>>({});
  const [showAllGaps, setShowAllGaps] = useState(false);
  const [showAllImport, setShowAllImport] = useState(false);
  const [expandedRef, setExpandedRef] = useState<string | null>(null);

  // Mutable copy of assortmentEvaluations for optimistic ideal updates
  const [liveAssortmentEvals, setLiveAssortmentEvals] = useState(assortmentEvaluations);
  useEffect(() => { setLiveAssortmentEvals(assortmentEvaluations); }, [assortmentEvaluations]);
  const [drawerTab, setDrawerTab] = useState<"referencias" | "inteligencia" | "derrotero">("referencias");
  const [lineExpanded, setLineExpanded] = useState<Record<string, boolean>>({});
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // ── Production detail drawer ────────────────────────────────────────────
  const [prodDetailOpen, setProdDetailOpen] = useState(false);
  const [prodDetailItem, setProdDetailItem] = useState<ProductionSuggestion | null>(null);

  // ── Coverage gap action drawer (now feeds into replenishment plans) ─────
  const [gapActionOpen, setGapActionOpen] = useState(false);
  const [gapActionItem, setGapActionItem] = useState<CoverageGapRef | null>(null);
  const [gapStep, setGapStep] = useState<"select_maleta" | "select_ref_out" | "confirm" | "done">("select_maleta");
  const [gapSelectedVendor, setGapSelectedVendor] = useState<string | null>(null);
  const [gapSelectedRefOut, setGapSelectedRefOut] = useState<string | null>(null);
  const [gapQty, setGapQty] = useState(1);

  // ── Surtido guides (legacy, kept for backward compat) ───────────────────
  const [guides, setGuides] = useState<MaletaSurtidoGuide[]>([]);
  const [printGuide, setPrintGuide] = useState<MaletaSurtidoGuide | null>(null);

  // ── Drawer inline replacement flow (MALETAS-DRAWER-UX-AND-PLAN-FLOW-01) ──
  const [drawerReplacingRef, setDrawerReplacingRef] = useState<string | null>(null);
  const [drawerFeedback, setDrawerFeedback] = useState<string | null>(null);

  // ── Replenishment plans (MALETAS-BULK-REPLENISHMENT-PERSISTENCE-01) ─────
  const [plans, setPlans] = useState<MaletaReplenishmentPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [planSaving, setPlanSaving] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planDrawerOpen, setPlanDrawerOpen] = useState(false);
  const [planDrawerVendor, setPlanDrawerVendor] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<ReplenishmentPlanStatus | "all">("all");
  const [historyVendorFilter, setHistoryVendorFilter] = useState<string | null>(null);
  const [printPlan, setPrintPlan] = useState<MaletaReplenishmentPlan | null>(null);

  // ── Derrotero rules lifted to drawer level (GO-LIVE-MALETAS-DERROTERO-POR-LINEA-01) ──
  const [derroteroRules, setDerroteroRules] = useState<IdealRouteRule[]>([]);
  const [derroteroLoading, setDerroteroLoading] = useState(false);

  // ── Portfolio builder (COMERCIAL-MALETAS-CANONICAL-INVENTORY-INTEGRATION-01) ──
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderSelection, setBuilderSelection] = useState<MaletaSelectionItem[]>([]);

  // ── API helpers ───────────────────────────────────────────────────────────
  const planApiUrl = `/api/orgs/${orgSlug}/comercial/maletas/replenishment-plans`;

  const fetchPlans = useCallback(async () => {
    try {
      setPlansLoading(true);
      setPlanError(null);
      const res = await fetch(planApiUrl);
      const data = await res.json();
      if (data.ok) setPlans(data.plans ?? []);
      else setPlanError(data.error ?? "Error al cargar planes");
    } catch {
      setPlanError("Error de conexion al cargar planes");
    } finally {
      setPlansLoading(false);
    }
  }, [planApiUrl]);

  const planApiPost = useCallback(async (body: Record<string, unknown>) => {
    setPlanSaving(true);
    setPlanError(null);
    try {
      const res = await fetch(planApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.ok) {
        setPlanError(data.error ?? "Error al guardar");
        return null;
      }
      // Refresh plans after mutation
      await fetchPlans();
      return data;
    } catch {
      setPlanError("Error de conexion al guardar");
      return null;
    } finally {
      setPlanSaving(false);
    }
  }, [planApiUrl, fetchPlans]);

  // Load plans on mount
  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  // Intelligence lookup
  const intelMap = useMemo(() => {
    const m = new Map<string, VendorCommercialIntelligence>();
    for (const vi of intelligence.vendors) m.set(vi.vendorId, vi);
    return m;
  }, [intelligence]);

  // Base metrics from assortmentEvaluations (MALETAS-PANEL-BASE-METRICAS-OPERATIVAS-01)
  const baseMetricsMap = useMemo(() => {
    const m = new Map<string, VendorMalletBaseMetrics>();
    for (const v of vendors) {
      const eval_ = liveAssortmentEvals.find((e) => e.vendorId === v.vendorId);
      m.set(v.vendorId, getVendorMalletBaseMetrics(v, eval_));
    }
    return m;
  }, [vendors, liveAssortmentEvals]);

  // Fetch derrotero rules for a vendor (GO-LIVE-MALETAS-DERROTERO-POR-LINEA-01)
  const fetchDerroteroRules = useCallback(async (vendorId: string) => {
    setDerroteroLoading(true);
    try {
      const res = await fetch(`/api/orgs/${orgSlug}/comercial/maletas/bags/${vendorId}/ideal-route`);
      const data = await res.json();
      if (data.ok) setDerroteroRules(data.rules ?? []);
    } catch { /* silent */ }
    finally { setDerroteroLoading(false); }
  }, [orgSlug]);

  const openVendor = (v: VendorSampleSnapshot) => {
    setSelectedVendor(v);
    setLineFilters({});
    setSearchQuery("");
    setLineVisibleCounts({});
    setLineExpanded({});
    setExpandedRef(null);
    setDrawerTab("referencias");
    setDrawerReplacingRef(null);
    setDrawerFeedback(null);
    setDrawerOpen(true);
    fetchDerroteroRules(v.vendorId);
  };

  // ── Production detail handlers ──────────────────────────────────────────
  const openProductionDetail = (item: ProductionSuggestion) => {
    setProdDetailItem(item);
    setProdDetailOpen(true);
  };

  // ── Coverage gap action handlers ──────────────────────────────────────
  const openGapAction = (gap: CoverageGapRef) => {
    setGapActionItem(gap);
    setGapStep("select_maleta");
    setGapSelectedVendor(null);
    setGapSelectedRefOut(null);
    setGapQty(1);
    setGapActionOpen(true);
  };

  const buildMaletaCandidates = useCallback((): MaletaCandidate[] => {
    return vendors.map(v => {
      const replaceableRefs = v.refs
        .filter(r => r.state === "reemplazar" || r.centralAvailable <= 0)
        .map(r => ({
          reference: r.reference,
          description: r.description,
          reason: r.centralAvailable <= 0 ? "Agotada en bodega central" : "Marcada para reemplazo",
        }));
      return {
        vendorId: v.vendorId,
        vendorName: v.vendorName,
        warehouseCode: v.warehouseCode,
        city: "",
        currentCoverage: v.totalRefs > 0 ? Math.round((v.healthyRefs / v.totalRefs) * 100) : 0,
        refsAtRisk: v.replaceRefs,
        replaceableRefs,
      };
    });
  }, [vendors]);

  // ── Plan helpers (API-backed, PERSISTENCE-01) ────────────────────────────

  const getDraftPlan = useCallback((vendorId: string): MaletaReplenishmentPlan | undefined => {
    return plans.find(p => p.vendorId === vendorId && p.status === "draft");
  }, [plans]);

  const planCounts = useMemo(() => {
    const draft = plans.filter(p => p.status === "draft").length;
    const pending = plans.filter(p => p.status === "pending_warehouse").length;
    const shipped = plans.filter(p => p.status === "shipped").length;
    const received = plans.filter(p => p.status === "received").length;
    return { draft, pending, shipped, received };
  }, [plans]);

  const addItemToPlanApi = useCallback(async (
    vendorId: string,
    addedRef: string,
    addedDesc: string,
    removedRef: string | null,
    removedDesc: string | null,
    qty: number,
    subgroupSag: string,
    reason: string,
  ) => {
    const vendor = vendors.find(v => v.vendorId === vendorId);
    if (!vendor) return;

    // Ensure draft plan exists via API
    const draftRes = await planApiPost({
      action: "create_or_get_draft",
      vendorId: vendor.vendorId,
      vendorName: vendor.vendorName,
      warehouseCode: vendor.warehouseCode,
    });
    if (!draftRes?.plan) return;

    // Add item via API
    await planApiPost({
      action: "add_item",
      planId: draftRes.plan.id,
      item: {
        subgroupSag,
        removedReference: removedRef || null,
        removedDescription: removedDesc || null,
        addedReference: addedRef,
        addedDescription: addedDesc,
        quantity: qty,
        reason,
      },
    });
  }, [vendors, planApiPost]);

  const removeItemFromPlan = useCallback(async (planId: string, itemId: string) => {
    await planApiPost({ action: "remove_item", planId, itemId });
  }, [planApiPost]);

  const generatePlanDocument = useCallback(async (planId: string) => {
    await planApiPost({ action: "generate_document", planId });
  }, [planApiPost]);

  const updatePlanStatus = useCallback(async (planId: string, newStatus: ReplenishmentPlanStatus) => {
    await planApiPost({ action: "update_status", planId, status: newStatus });
  }, [planApiPost]);

  const openPlanDrawer = useCallback((vendorId: string) => {
    setPlanDrawerVendor(vendorId);
    setPlanDrawerOpen(true);
  }, []);

  const confirmGapReservation = useCallback(async () => {
    if (!gapActionItem || !gapSelectedVendor) return;
    const vendor = vendors.find(v => v.vendorId === gapSelectedVendor);
    if (!vendor) return;

    const refOutData = gapSelectedRefOut
      ? vendor.refs.find(r => r.reference === gapSelectedRefOut)
      : null;

    // Add to replenishment plan via API
    await addItemToPlanApi(
      gapSelectedVendor,
      gapActionItem.reference,
      gapActionItem.description,
      gapSelectedRefOut || null,
      refOutData?.description ?? null,
      gapQty,
      gapActionItem.subgrupoSag ?? gapActionItem.line ?? "SIN_SUBGRUPO",
      `Oportunidad de cobertura: ${gapActionItem.subgrupoSag ?? gapActionItem.line}`,
    );

    setGapStep("done");
  }, [gapActionItem, gapSelectedVendor, gapSelectedRefOut, gapQty, vendors, addItemToPlanApi]);

  // ── Add replacement from vendor drawer (MALETAS-DRAWER-UX-AND-PLAN-FLOW-01) ──
  const addReplacementFromDrawer = useCallback(async (
    vendor: VendorSampleSnapshot,
    removedRef: VendorSampleRef,
    candidate: { reference: string; description: string; subgrupoSag: string; available: number },
  ) => {
    // Duplicate check: same removedReference already in draft
    const draft = plans.find(p => p.vendorId === vendor.vendorId && p.status === "draft");
    if (draft?.items.some(i => i.removedReference === removedRef.reference)) {
      setDrawerFeedback(`Esta referencia ya esta incluida en el plan de surtido.`);
      setTimeout(() => setDrawerFeedback(null), 4000);
      return;
    }

    await addItemToPlanApi(
      vendor.vendorId,
      candidate.reference,
      candidate.description,
      removedRef.reference,
      removedRef.description,
      1,
      removedRef.subgrupoSag,
      "Reemplazo desde drawer de maleta",
    );

    setDrawerReplacingRef(null);
    setDrawerFeedback(`Agregado al plan de surtido de ${vendor.vendorName}`);
    setTimeout(() => setDrawerFeedback(null), 4000);
  }, [plans, addItemToPlanApi]);

  const toggleRefDetail = useCallback((refCode: string) => {
    setExpandedRef((prev) => (prev === refCode ? null : refCode));
  }, []);

  // Separate active refs from depleted/agotados (GO-LIVE-MALETAS-AGOTADOS-VAULT-01)
  const activeRefs = useMemo(() => {
    if (!selectedVendor) return [];
    return selectedVendor.refs.filter((r) => r.state !== "reemplazar");
  }, [selectedVendor]);

  const depletedRefs = useMemo(() => {
    if (!selectedVendor) return [];
    return selectedVendor.refs.filter((r) => r.state === "reemplazar");
  }, [selectedVendor]);

  // Coverage per catalog from assortmentEvaluations (MALETAS-DERROTERO-METRICS-CONSISTENCY-01)
  // Single source: assortmentEvaluations — same data that renders the derrotero tables.
  const coverageByLine = useMemo(() => {
    if (!selectedVendor) return new Map<string, { complete: number; total: number; pct: number; missing: number; excess: number; catalogName: string }>();
    const vendorEval = liveAssortmentEvals.find((e) => e.vendorId === selectedVendor.vendorId);
    const lineMap = new Map<string, { complete: number; total: number; pct: number; missing: number; excess: number; catalogName: string }>();
    if (!vendorEval) return lineMap;
    for (const cat of vendorEval.catalogs) {
      // Determine line key from catalog brand/world
      const lineKey = cat.brand === "Castillitos" ? "CS"
        : cat.brand === "Latin Kids" ? "LT"
        : cat.commercialWorld === "IMPORTACION" ? "IMPORT"
        : cat.brand ?? cat.commercialWorld;
      lineMap.set(lineKey, {
        complete: cat.totalComplete,
        total: cat.totalEntries,
        pct: cat.overallCompletion,
        missing: cat.totalMissing,
        excess: cat.totalExcess,
        catalogName: cat.catalogName,
      });
    }
    return lineMap;
  }, [selectedVendor, liveAssortmentEvals]);

  // Drawer: group activeRefs by line (GO-LIVE-MALETAS-REFERENCIAS-POR-LINEA-01)
  const searchedActiveRefs = useMemo(() => {
    if (!selectedVendor) return [];
    let refs = activeRefs;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      refs = refs.filter(
        (r) =>
          r.reference.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.subgrupoSag.toLowerCase().includes(q) ||
          r.line.toLowerCase().includes(q) ||
          STATE_LABEL[r.state].toLowerCase().includes(q),
      );
    }
    return refs;
  }, [selectedVendor, activeRefs, searchQuery]);

  const lineGroups = useMemo(() => {
    const map = new Map<string, VendorSampleRef[]>();
    for (const ref of searchedActiveRefs) {
      const arr = map.get(ref.line) ?? [];
      arr.push(ref);
      map.set(ref.line, arr);
    }
    // Stable order: sorted by first appearance then alphabetical
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [searchedActiveRefs]);

  const sortedVendors = useMemo(
    () => [...vendors].sort((a, b) => b.totalRefs - a.totalRefs),
    [vendors],
  );

  // ── Home layout computed values (MALLETS-GO-LIVE-COMPLETION-01) ──────────
  const activeVendors = useMemo(() => sortedVendors.filter((v) => v.isActive && v.totalRefs > 0), [sortedVendors]);
  const inactiveVendors = useMemo(() => sortedVendors.filter((v) => !v.isActive || (v.isActive && v.totalRefs === 0)), [sortedVendors]);
  const [showInactive, setShowInactive] = useState(false);

  // ── Vendor activation toggle (MALLETS-GO-LIVE-COMPLETION-01) ──────────
  const [activationLoading, setActivationLoading] = useState<string | null>(null);
  const toggleVendorActivation = useCallback(async (vendorId: string, currentActive: boolean) => {
    setActivationLoading(vendorId);
    try {
      const res = await fetch(`/api/orgs/${orgSlug}/comercial/maletas/bags/${vendorId}/activation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !currentActive }),
      });
      if (res.ok) {
        window.location.reload();
      }
    } catch { /* non-fatal */ }
    setActivationLoading(null);
  }, [orgSlug]);

  // ── Auto-refresh (MALLETS-GO-LIVE-COMPLETION-01 Phase 8) ──────────────
  const [lastRefresh, setLastRefresh] = useState(loadedAt);
  const [refreshing, setRefreshing] = useState(false);
  const REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshing(true);
      window.location.reload();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // ── Section refs + collapse state (GO-LIVE-MALETAS-HOME-NAV-COLLAPSIBLE-01) ──
  const productionSectionRef = useRef<HTMLDivElement>(null);
  const recompraSectionRef = useRef<HTMLDivElement>(null);
  const coverageSectionRef = useRef<HTMLDivElement>(null);
  const [sectionOpen, setSectionOpen] = useState<Record<string, boolean>>({
    produccion: true,
    recompra: false,
    cobertura: false,
  });
  const toggleSection = useCallback((key: string) => {
    setSectionOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);
  const scrollToSection = useCallback((ref: React.RefObject<HTMLDivElement | null>, key: string) => {
    setSectionOpen((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, []);

  // Consolidated supply action counts across ALL vendors
  const homeActionCounts = useMemo(() => {
    let produccion = 0, recompra = 0, bodega = 0, op = 0;
    for (const v of vendors) {
      for (const ref of v.refs) {
        if (ref.supplyAction === "PRODUCCION_SUGERIDA") produccion++;
        else if (ref.supplyAction === "RECOMPRA_SUGERIDA") recompra++;
        else if (ref.supplyAction === "REEMPLAZAR_BODEGA") bodega++;
        else if (ref.supplyAction === "COMPLETAR_DESDE_OP") op++;
      }
    }
    return { produccion, recompra, bodega, op, total: produccion + recompra + bodega + op };
  }, [vendors]);

  // MALLETS-FUNCTIONAL-RECOVERY-01: threshold-based production evaluation
  const prodThresholdProducir = useMemo(
    () => productionThresholds.filter((p) => p.decision === "PRODUCIR"),
    [productionThresholds],
  );
  const prodThresholdEsperar = useMemo(
    () => productionThresholds.filter((p) => p.decision === "ESPERAR_OP"),
    [productionThresholds],
  );

  // Import evaluation summaries
  const importRebuy = useMemo(
    () => importEvaluation.evaluations.filter((e) => e.decision === "REBUY"),
    [importEvaluation],
  );
  const importLowRotation = useMemo(
    () => importEvaluation.evaluations.filter((e) => e.decision === "LOW_ROTATION"),
    [importEvaluation],
  );

  // Drawer: state counts for action cards (uses activeRefs for main panel)
  const stateCounts = useMemo(() => {
    if (!selectedVendor) return { reemplazar: 0, saludable: 0 };
    return {
      reemplazar: depletedRefs.length,
      saludable: activeRefs.filter((r) => r.state === "saludable").length,
    };
  }, [selectedVendor, activeRefs, depletedRefs]);

  const jumpToFilter = (_filter: DrawerFilter) => {
    setSearchQuery("");
    setLineVisibleCounts({});
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <OperationalWorkspaceHeader
        title="Maletas"
        subtitle="Inteligencia comercial de muestras en campo"
        breadcrumbs={[
          { label: "Comercial", href: `/${orgSlug}/comercial/maletas` },
          { label: "Maletas" },
        ]}
      />

      <div style={{
        flex: 1, overflow: "auto", padding: S[5],
        background: C.blueLight,
      }}>
        {/* ── Quick access bar (GO-LIVE-MALETAS-HOME-NAV-COLLAPSIBLE-01) ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: S[2],
          marginBottom: S[3], flexWrap: "wrap",
        }}>
          <span style={{
            fontFamily: T.mono, fontSize: 9, fontWeight: 600,
            color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.08em",
          }}>
            Ir a:
          </span>
          {/* COMERCIAL-MALETAS-CANONICAL-INVENTORY-INTEGRATION-01: Builder entry */}
          <button
            onClick={() => setBuilderOpen(true)}
            className="ag-action-primary"
            style={{
              fontFamily: T.mono, fontSize: 9, fontWeight: 600,
              color: C.white, background: C.blueDark,
              border: "none", borderRadius: R.pill,
              padding: "4px 12px", cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: S[1],
            }}
          >
            + Nueva maleta
          </button>
          {[
            { label: "Produccion", ref: productionSectionRef, key: "produccion", count: prodThresholdProducir.length },
            { label: "Recompra / Baja rotacion", ref: recompraSectionRef, key: "recompra", count: importRebuy.length + importLowRotation.length },
            { label: "Oportunidades", ref: coverageSectionRef, key: "cobertura", count: coverageOpportunities.length },
          ].map(({ label, ref, key, count }) => (
            <button
              key={key}
              onClick={() => scrollToSection(ref, key)}
              style={{
                fontFamily: T.mono, fontSize: 9, fontWeight: 600,
                color: C.blueDark, background: C.blueLight,
                border: `1px solid ${C.blueBorder}`, borderRadius: R.pill,
                padding: "3px 10px", cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: S[1],
                transition: "all 0.12s",
              }}
            >
              {label}
              {count > 0 && (
                <span style={{
                  fontFamily: T.mono, fontSize: 8, fontWeight: 700,
                  color: C.white, background: C.blueDark,
                  padding: "0 5px", borderRadius: R.pill,
                }}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Executive Summary Strip (GO-LIVE-MALETAS-HOME-PRODUCTION-01) ── */}
        <div style={{
          padding: S[5],
          marginBottom: S[5],
          background: C.white,
          borderRadius: R.lg,
          boxShadow: E.sm,
          border: `1px solid ${C.blueBorder}`,
        }}>
          <div style={{
            fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600,
            color: C.blueDark, textTransform: "uppercase" as const, letterSpacing: "0.08em",
            marginBottom: S[4],
          }}>
            Resumen ejecutivo
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: S[4] }}>
            <ExecKpi label="Maletas activas" value={activeVendors.length} tooltip="Maletas administrativamente activas con al menos una referencia presente." />
            {(() => {
              let globalComplete = 0, globalEntries = 0;
              for (const v of activeVendors) {
                const bm = baseMetricsMap.get(v.vendorId);
                if (bm) { globalComplete += bm.completedRouteEntries; globalEntries += bm.totalRouteEntries; }
              }
              const globalPct = globalEntries > 0 ? Math.round((globalComplete / globalEntries) * 100) : 0;
              return (
                <ExecKpi
                  label="Cobertura comercial"
                  value={activeVendors.length > 0 ? `${globalPct}%` : "\u2014"}
                  color={activeVendors.length > 0 ? (globalPct < 60 ? C.amber : C.green) : undefined}
                  tooltip="Cobertura consolidada de los derroteros de las maletas activas."
                />
              );
            })()}
            <ExecKpi
              label="Acciones pendientes"
              value={homeActionCounts.total > 0 ? homeActionCounts.total : "\u2014"}
              color={homeActionCounts.total > 0 ? C.blueDark : undefined}
            />
          </div>

          {/* Action breakdown — only if actions exist */}
          {homeActionCounts.total > 0 && (
            <div style={{
              display: "flex", gap: S[3], flexWrap: "wrap",
              marginTop: S[3], paddingTop: S[3], borderTop: `1px solid ${C.blueBorder}`,
            }}>
              {homeActionCounts.produccion > 0 && (
                <span style={{ fontFamily: T.mono, fontSize: 9, color: C.blueDark }}>
                  Produccion: {homeActionCounts.produccion}
                </span>
              )}
              {homeActionCounts.recompra > 0 && (
                <span style={{ fontFamily: T.mono, fontSize: 9, color: C.blueDark }}>
                  Recompra: {homeActionCounts.recompra}
                </span>
              )}
              {homeActionCounts.bodega > 0 && (
                <span style={{ fontFamily: T.mono, fontSize: 9, color: C.green }}>
                  Bodega: {homeActionCounts.bodega}
                </span>
              )}
              {homeActionCounts.op > 0 && (
                <span style={{ fontFamily: T.mono, fontSize: 9, color: C.amber }}>
                  Esperando OP: {homeActionCounts.op}
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Plan save status (PERSISTENCE-01) ──────────────────── */}
        {(planSaving || planError) && (
          <div style={{
            padding: `${S[2]} ${S[4]}`,
            marginBottom: S[3],
            background: planError ? C.redLight : C.blueLight,
            borderRadius: R.md,
            border: `1px solid ${planError ? C.redBorder : C.blueBorder}`,
            fontFamily: T.mono, fontSize: T.sz.xs,
            color: planError ? C.red : C.blueDark,
            display: "flex", alignItems: "center", gap: S[2],
          }}>
            {planSaving && <span>Guardando...</span>}
            {planError && <span>Error: {planError}</span>}
            {planError && (
              <button onClick={() => setPlanError(null)} style={{
                fontFamily: T.mono, fontSize: 9, color: C.red,
                background: "transparent", border: "none", cursor: "pointer",
                marginLeft: "auto",
              }}>
                Cerrar
              </button>
            )}
          </div>
        )}

        {/* ── Maletas activas (GO-LIVE-MALETAS-HOME-PRODUCTION-01) ── */}
        <div style={{
          fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700,
          color: C.titleDeep, marginBottom: S[3],
          display: "flex", alignItems: "center", gap: S[2],
        }}>
          <span>Maletas activas</span>
          <span style={{
            fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 500,
            color: C.inkFaint,
          }}>
            {activeVendors.length} de {vendors.length}
          </span>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: S[4],
          marginBottom: S[6],
        }}>
          {activeVendors.map((vendor) => {
            const vendorDraft = getDraftPlan(vendor.vendorId);
            return (
              <VendorCard
                key={vendor.vendorId}
                vendor={vendor}
                intel={intelMap.get(vendor.vendorId)}
                baseMetrics={baseMetricsMap.get(vendor.vendorId)}
                draftPlan={vendorDraft}
                onClick={() => openVendor(vendor)}
                onOpenPlan={() => openPlanDrawer(vendor.vendorId)}
                onToggleActivation={toggleVendorActivation}
                activationLoading={activationLoading}
              />
            );
          })}
        </div>

        {/* ── Maletas inactivas (collapsible) ── */}
        {inactiveVendors.length > 0 && (
          <div style={{ marginBottom: S[6] }}>
            <button
              onClick={() => setShowInactive((prev) => !prev)}
              style={{
                fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700,
                color: C.inkFaint, background: C.surfaceAlt,
                border: `1px solid ${C.line}`, borderRadius: R.md,
                cursor: "pointer", padding: `${S[2]}px ${S[3]}px`,
                display: "flex", alignItems: "center", gap: S[2],
                marginBottom: showInactive ? S[3] : 0,
              }}
            >
              <span style={{ fontSize: 9 }}>{showInactive ? "▼" : "▶"}</span>
              Maletas inactivas
              <span style={{
                fontFamily: T.mono, fontSize: 9, fontWeight: 700,
                color: C.white, background: C.inkFaint,
                padding: "1px 8px", borderRadius: R.pill,
              }}>
                {inactiveVendors.length}
              </span>
            </button>
            {showInactive && (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                gap: S[4],
              }}>
                {inactiveVendors.map((vendor) => (
                  <VendorCard
                    key={vendor.vendorId}
                    vendor={vendor}
                    intel={intelMap.get(vendor.vendorId)}
                    baseMetrics={baseMetricsMap.get(vendor.vendorId)}
                    draftPlan={getDraftPlan(vendor.vendorId)}
                    onClick={() => openVendor(vendor)}
                    onOpenPlan={() => openPlanDrawer(vendor.vendorId)}
                    onToggleActivation={toggleVendorActivation}
                    activationLoading={activationLoading}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Historial de surtidos ────────────────────────────── */}
        {plans.length > 0 && (
          <div style={{ marginBottom: S[6] }}>
            <button onClick={() => setHistoryOpen(true)} style={{
              fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700,
              color: C.blueDark, background: C.blueLight,
              border: `1px solid ${C.blueBorder}`, borderRadius: R.lg,
              cursor: "pointer", padding: `${S[3]} ${S[4]}`,
              display: "flex", alignItems: "center", gap: S[2],
            }}>
              Historial de surtidos
              <span style={{
                fontFamily: T.mono, fontSize: 9, fontWeight: 700,
                color: C.white, background: C.blueDark,
                padding: "1px 8px", borderRadius: R.pill,
              }}>
                {plans.length}
              </span>
            </button>
          </div>
        )}

        {/* ── Produccion por umbral (MALLETS-FUNCTIONAL-RECOVERY-01 Phase 5) ── */}
        <SectionHeader
          title="Produccion"
          subtitle="Evaluacion por marca + grupo + subgrupo. Umbral: CS \u2264 100, LT \u2264 200"
          count={productionThresholds.length > 0 ? productionThresholds.length : undefined}
          open={sectionOpen.produccion}
          onToggle={() => toggleSection("produccion")}
          sectionRef={productionSectionRef}
          statusHint={prodThresholdProducir.length > 0 ? `${prodThresholdProducir.length} PRODUCIR` : "sin alertas"}
        >
          {productionThresholds.length > 0 ? (
            <div style={{
              background: C.white, borderRadius: R.lg,
              border: `1px solid ${C.line}`, boxShadow: `0 1px 3px ${C.ink}06`,
              overflow: "hidden", overflowX: "auto", minWidth: 0,
            }}>
              <div style={{
                display: "grid",
                gridTemplateColumns: "minmax(80px,0.8fr) minmax(90px,1fr) minmax(100px,1.2fr) 80px 80px 80px 120px 110px",
                padding: `10px 16px`, background: C.surfaceAlt,
                borderBottom: `1px solid ${C.line}`, gap: S[2], alignItems: "center",
              }}>
                {["Marca", "Grupo", "Subgrupo", "Stock", "Umbral", "OP Activa", "Estado datos", "Decision"].map((h) => (
                  <div key={h} style={{
                    ...listHeaderCell,
                    textAlign: h === "Stock" || h === "Umbral" ? "right" as const : h === "Decision" || h === "OP Activa" || h === "Estado datos" ? "center" as const : undefined,
                  }}>{h}</div>
                ))}
              </div>
              {productionThresholds.map((pt, i) => {
                const decColor: Record<ProductionDecision, string> = {
                  PRODUCIR: C.red, ESPERAR_OP: C.amber, SIN_ACCION: C.green,
                  DATOS_INSUFICIENTES: C.inkFaint, EN_VALIDACION: C.amber,
                };
                const decLabel: Record<ProductionDecision, string> = {
                  PRODUCIR: "PRODUCIR", ESPERAR_OP: "ESPERAR OP", SIN_ACCION: "SIN ACCION",
                  DATOS_INSUFICIENTES: "SIN DATOS", EN_VALIDACION: "EN VALIDACION",
                };
                const dataStateLabel: Record<string, string> = {
                  STOCK_REAL_CERO: "Cero real",
                  STOCK_REAL_POSITIVO: "Dato real",
                  SIN_CORRESPONDENCIA: "Sin cruce",
                  DATO_DESACTUALIZADO: "Desactualizado",
                  SIN_DATOS: "Sin datos",
                };
                const dataStateColor: Record<string, string> = {
                  STOCK_REAL_CERO: C.red,
                  STOCK_REAL_POSITIVO: C.green,
                  SIN_CORRESPONDENCIA: C.amber,
                  DATO_DESACTUALIZADO: C.amber,
                  SIN_DATOS: C.inkFaint,
                };
                return (
                  <div key={`${pt.brand}|${pt.group ?? ""}|${pt.subgrupoSag}`} style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(80px,0.8fr) minmax(90px,1fr) minmax(100px,1.2fr) 80px 80px 80px 120px 110px",
                    padding: ROW_PAD,
                    borderBottom: i === productionThresholds.length - 1 ? "none" : `1px solid ${C.lineSubtle}`,
                    gap: S[2], alignItems: "center",
                  }}>
                    <div style={{ ...listCell, fontWeight: 700, color: C.titleDeep }}>{pt.brand}</div>
                    <div style={{ ...listCell, color: C.ink }}>{pt.group ?? "\u2014"}</div>
                    <div style={{ ...listCell, color: C.ink }}>{pt.subgrupoSag}</div>
                    <div style={{ ...listCell, fontWeight: 700, color: pt.decision === "EN_VALIDACION" || pt.decision === "DATOS_INSUFICIENTES" ? C.inkFaint : pt.stockDisponible <= pt.umbral ? C.red : C.green, textAlign: "right" as const }}>
                      {pt.dataState === "SIN_CORRESPONDENCIA" || pt.dataState === "SIN_DATOS" ? "\u2014" : pt.stockDisponible}
                    </div>
                    <div style={{ ...listCell, color: C.inkFaint, textAlign: "right" as const }}>{pt.umbral || "\u2014"}</div>
                    <div style={{ ...listCell, textAlign: "center" as const, color: pt.tieneOpActiva ? C.amber : C.inkFaint }}>{pt.tieneOpActiva ? "Si" : "No"}</div>
                    <div style={{
                      fontFamily: T.mono, fontSize: 9, fontWeight: 600,
                      color: dataStateColor[pt.dataState] ?? C.inkFaint,
                      textAlign: "center" as const, whiteSpace: "nowrap" as const,
                    }}>
                      {dataStateLabel[pt.dataState] ?? pt.dataState}
                    </div>
                    <div style={{
                      fontFamily: T.mono, fontSize: 10, fontWeight: 700,
                      color: C.white, background: decColor[pt.decision],
                      padding: "2px 8px", borderRadius: R.pill,
                      textAlign: "center" as const, whiteSpace: "nowrap" as const,
                    }}>
                      {decLabel[pt.decision]}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{
              padding: S[5], background: C.white, borderRadius: R.lg,
              border: `1px solid ${C.line}`,
            }}>
              <div style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 600, color: C.green }}>
                Sin alertas de produccion. Todos los subgrupos superan el umbral.
              </div>
            </div>
          )}
        </SectionHeader>

        {/* ── Recompra / Baja Rotacion (MALLETS-FUNCTIONAL-RECOVERY-01 Phase 6) ── */}
        <SectionHeader
          title="Recompra / Baja rotacion"
          subtitle="Evaluacion de referencias import por rotacion y nivel de inventario"
          count={(importRebuy.length + importLowRotation.length) > 0 ? importRebuy.length + importLowRotation.length : undefined}
          open={sectionOpen.recompra}
          onToggle={() => toggleSection("recompra")}
          sectionRef={recompraSectionRef}
          statusHint={importRebuy.length > 0 ? `${importRebuy.length} REBUY` : importLowRotation.length > 0 ? `${importLowRotation.length} baja rotacion` : "sin alertas"}
        >
          {importEvaluation.evaluations.length > 0 ? (
            <div style={{
              background: C.white, borderRadius: R.lg,
              border: `1px solid ${C.line}`, boxShadow: `0 1px 3px ${C.ink}06`,
              overflow: "hidden", overflowX: "auto", minWidth: 0,
            }}>
              <div style={{
                display: "grid",
                gridTemplateColumns: "80px minmax(100px,1.2fr) 70px 60px 80px minmax(120px,1fr) 100px",
                padding: `10px 16px`, background: C.surfaceAlt,
                borderBottom: `1px solid ${C.line}`, gap: S[2], alignItems: "center",
              }}>
                {["Referencia", "Descripcion", "Tamano", "Inventario", "Meses s/ing.", "Motivo", "Decision"].map((h) => (
                  <div key={h} style={{
                    ...listHeaderCell,
                    textAlign: h === "Inventario" || h === "Meses s/ing." ? "right" as const : h === "Decision" ? "center" as const : undefined,
                  }}>{h}</div>
                ))}
              </div>
              {importEvaluation.evaluations.slice(0, showAllImport ? 100 : 15).map((ev, i) => {
                const decColor: Record<ImportRefDecision, string> = {
                  REBUY: C.red, LOW_ROTATION: C.amber, WATCH: C.blueDark, INSUFFICIENT_DATA: C.inkFaint, DO_NOT_REBUY: C.green,
                };
                const decLabel: Record<ImportRefDecision, string> = {
                  REBUY: "RECOMPRAR", LOW_ROTATION: "BAJA ROTACION", WATCH: "VIGILAR", INSUFFICIENT_DATA: "SIN DATOS", DO_NOT_REBUY: "OK",
                };
                return (
                  <div key={ev.reference} style={{
                    display: "grid",
                    gridTemplateColumns: "80px minmax(100px,1.2fr) 70px 60px 80px minmax(120px,1fr) 100px",
                    padding: ROW_PAD,
                    borderBottom: i === Math.min(importEvaluation.evaluations.length, showAllImport ? 100 : 15) - 1 ? "none" : `1px solid ${C.lineSubtle}`,
                    gap: S[2], alignItems: "center",
                  }}>
                    <div style={{ ...listCell, fontWeight: 700, color: C.titleDeep }}>{ev.reference}</div>
                    <div style={{ ...listCell, color: C.ink }}>{ev.description}</div>
                    <div style={{ ...listCell, color: C.inkMid }}>{ev.sizeClass ?? "\u2014"}</div>
                    <div style={{ ...listCell, fontWeight: 700, color: ev.inventario <= 5 ? C.red : C.ink, textAlign: "right" as const }}>{ev.inventario}</div>
                    <div style={{ ...listCell, color: ev.mesesSinIngreso !== null && ev.mesesSinIngreso >= 8 ? C.amber : C.inkFaint, textAlign: "right" as const }}>{ev.mesesSinIngreso ?? "\u2014"}</div>
                    <div style={{ ...listCell, fontSize: 10, color: C.inkMid }}>{ev.motivo}</div>
                    <div style={{
                      fontFamily: T.mono, fontSize: 10, fontWeight: 700,
                      color: C.white, background: decColor[ev.decision],
                      padding: "2px 8px", borderRadius: R.pill,
                      textAlign: "center" as const, whiteSpace: "nowrap" as const,
                    }}>
                      {decLabel[ev.decision]}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{
              padding: S[5], background: C.white, borderRadius: R.lg,
              border: `1px solid ${C.line}`,
            }}>
              <div style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 600, color: C.green, marginBottom: S[2] }}>
                Sin evaluaciones de recompra
              </div>
              <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint }}>
                Diagnostico: {importEvaluation.diagnostic.evaluadas} refs evaluadas,
                {importEvaluation.diagnostic.sinFechaIngreso} sin fecha de ingreso,
                {importEvaluation.diagnostic.sinTamano} sin tamano,
                {importEvaluation.diagnostic.sinInventario} sin inventario
              </div>
            </div>
          )}
          {importEvaluation.evaluations.length > 15 && !showAllImport && (
            <button onClick={() => setShowAllImport(true)} style={showMoreBtnStyle}>
              Ver todas ({importEvaluation.evaluations.length})
            </button>
          )}
        </SectionHeader>

        {/* ── Oportunidades de cobertura (MALLETS-FUNCTIONAL-RECOVERY-01 Phase 7) ── */}
        <SectionHeader
          title="Oportunidades de cobertura"
          subtitle="Faltantes del derrotero con inventario disponible para completar"
          count={coverageOpportunities.length > 0 ? coverageOpportunities.length : undefined}
          open={sectionOpen.cobertura}
          onToggle={() => toggleSection("cobertura")}
          sectionRef={coverageSectionRef}
          statusHint={coverageOpportunities.length > 0 ? `${coverageOpportunities.length} oportunidades` : "sin faltantes"}
        >
          {coverageOpportunities.length > 0 ? (
            <div style={{
              background: C.white, borderRadius: R.lg,
              border: `1px solid ${C.line}`, boxShadow: `0 1px 3px ${C.ink}06`,
              overflow: "hidden", overflowX: "auto", minWidth: 0,
            }}>
              <div style={{
                display: "grid",
                gridTemplateColumns: "minmax(100px,1fr) minmax(80px,0.8fr) 80px minmax(80px,1fr) 60px minmax(120px,1.2fr)",
                padding: `10px 16px`, background: C.surfaceAlt,
                borderBottom: `1px solid ${C.line}`, gap: S[2], alignItems: "center",
              }}>
                {["Catalogo / Grupo", "Subgrupo faltante", "Faltan", "Ref. sugerida", "Disp.", "Explicacion"].map((h) => (
                  <div key={h} style={{
                    ...listHeaderCell,
                    textAlign: h === "Faltan" || h === "Disp." ? "right" as const : undefined,
                  }}>{h}</div>
                ))}
              </div>
              {coverageOpportunities.slice(0, showAllGaps ? 100 : 10).map((opp, i) => (
                <div key={`${opp.reference}-${opp.subgroupName}-${i}`} style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(100px,1fr) minmax(80px,0.8fr) 80px minmax(80px,1fr) 60px minmax(120px,1.2fr)",
                  padding: ROW_PAD,
                  borderBottom: i === Math.min(coverageOpportunities.length, showAllGaps ? 100 : 10) - 1 ? "none" : `1px solid ${C.lineSubtle}`,
                  gap: S[2], alignItems: "center",
                }}>
                  <div style={{ ...listCell, color: C.ink }}>
                    <span style={{ fontWeight: 700 }}>{opp.groupName}</span>
                    <span style={{ fontSize: 9, color: C.inkFaint, marginLeft: 4 }}>{opp.catalogName}</span>
                  </div>
                  <div style={{ ...listCell, color: C.inkMid }}>{opp.subgroupName}</div>
                  <div style={{ ...listCell, fontWeight: 700, color: C.red, textAlign: "right" as const }}>{opp.faltante}</div>
                  <div style={{ ...listCell, fontWeight: 700, color: C.titleDeep }}>{opp.reference}</div>
                  <div style={{ ...listCell, fontWeight: 700, color: C.green, textAlign: "right" as const }}>{opp.disponible}</div>
                  <div style={{ ...listCell, fontSize: 10, color: C.inkMid }}>{opp.explicacion}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{
              padding: S[5], background: C.white, borderRadius: R.lg,
              border: `1px solid ${C.line}`,
            }}>
              <div style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 600, color: C.green }}>
                Sin faltantes de cobertura. Todos los subgrupos del derrotero estan completos.
              </div>
            </div>
          )}
          {coverageOpportunities.length > 10 && !showAllGaps && (
            <button onClick={() => setShowAllGaps(true)} style={showMoreBtnStyle}>
              Ver todas ({coverageOpportunities.length})
            </button>
          )}
        </SectionHeader>

        {/* Source indicator */}
        <div style={{
          fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
          paddingTop: S[4], borderTop: `1px solid ${C.blueBorder}`,
          display: "flex", gap: S[3], marginTop: S[3],
        }}>
          <span>Fuente: {source}</span>
          <span>Actualizado: {formatTime(loadedAt)}</span>
          <span>Auto-refresh: 15 min</span>
        </div>
      </div>

      {/* ── Vendor Detail Drawer ──────────────────────────────────── */}
      <OperationalSideDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selectedVendor?.vendorName ?? ""}
        subtitle={selectedVendor ? `B${selectedVendor.warehouseCode} \u2014 ${selectedVendor.totalRefs} refs \u2014 ${selectedVendor.isActive ? "Activa" : "Inactiva"}` : ""}
        severity={
          selectedVendor?.health === "critico" ? "critical"
          : selectedVendor?.health === "riesgo" ? "warning"
          : "info"
        }
        statusLabel={selectedVendor ? HEALTH_LABEL[selectedVendor.health] : undefined}
        size="wide"
      >
        {selectedVendor && (() => {
          return (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

            {/* ── Compact sticky toolbar (MALETAS-DRAWER-ACTION-FIRST-UX-01) ── */}
            <div style={{
              flexShrink: 0,
              display: "flex", flexDirection: "column", gap: S[2],
              paddingBottom: S[2],
              borderBottom: `1px solid ${C.line}`,
              marginBottom: 0,
              background: C.white,
              position: "sticky" as const, top: 0, zIndex: 3,
            }}>
              {/* Row 1: Per-line derrotero KPIs (GO-LIVE-MALETAS-DERROTERO-POR-LINEA-01) */}
              <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
                <DrawerKpiCard
                  label="Referencias activas"
                  value={activeRefs.length}
                  sub="en mostrario"
                  tooltip={`${selectedVendor.totalRefs} en maleta total. ${activeRefs.length} con stock saludable en bodega central. ${depletedRefs.length} marcadas para reemplazo.`}
                />
                {[...coverageByLine.entries()].map(([line, cov]) => {
                  const lineLabel = DERROTERO_LINE_LABEL[line] ?? line;
                  return (
                    <DrawerKpiCard
                      key={line}
                      label={`Derrotero ${lineLabel}`}
                      value={`${cov.pct}%`}
                      sub={`${cov.complete} de ${cov.total} completos`}
                      color={cov.pct < 80 ? C.amber : C.green}
                    />
                  );
                })}
              </div>

              {/* Row 2: Plan bar + Tab switcher */}
              <div style={{ display: "flex", gap: S[2], alignItems: "center" }}>
                {/* Plan bar — compact */}
                {(() => {
                  const activeDraft = getDraftPlan(selectedVendor.vendorId);
                  if (!activeDraft) return (
                    <span style={{
                      fontFamily: T.mono, fontSize: 9, color: C.inkFaint,
                      padding: "2px 8px", background: C.surfaceAlt,
                      borderRadius: R.sm, border: `1px solid ${C.line}`,
                    }}>
                      Sin plan activo
                    </span>
                  );
                  return (
                    <div style={{
                      display: "flex", alignItems: "center", gap: S[2],
                      padding: "2px 8px",
                      background: C.blueLight, borderRadius: R.sm,
                      border: `1px solid ${C.blueBorder}`,
                    }}>
                      <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700, color: C.blueDark }}>
                        Plan: {activeDraft.items.length} cambio{activeDraft.items.length !== 1 ? "s" : ""}
                      </span>
                      <button
                        onClick={() => openPlanDrawer(selectedVendor.vendorId)}
                        style={{
                          fontFamily: T.mono, fontSize: 8, fontWeight: 600,
                          color: C.blueDark, background: C.white,
                          border: `1px solid ${C.blueBorder}`, borderRadius: R.sm,
                          padding: "1px 6px", cursor: "pointer", lineHeight: 1,
                        }}
                      >
                        Ver
                      </button>
                      {activeDraft.items.length > 0 && (
                        <button
                          onClick={() => generatePlanDocument(activeDraft.id)}
                          disabled={planSaving}
                          style={{
                            fontFamily: T.mono, fontSize: 8, fontWeight: 700,
                            color: C.white, background: C.blueDark,
                            border: "none", borderRadius: R.sm,
                            padding: "1px 6px", cursor: planSaving ? "wait" : "pointer",
                            opacity: planSaving ? 0.6 : 1, lineHeight: 1,
                          }}
                        >
                          Guia
                        </button>
                      )}
                    </div>
                  );
                })()}

                {/* Tab switcher — real tabs with bottom border */}
                <div style={{ marginLeft: "auto", display: "flex", gap: 0 }}>
                  {(["referencias", "inteligencia", "derrotero"] as const).map((tab) => {
                    const isActive = drawerTab === tab;
                    const label = tab === "referencias" ? "Referencias" : tab === "inteligencia" ? "Inteligencia" : "Derrotero";
                    return (
                      <button
                        key={tab}
                        onClick={() => setDrawerTab(tab)}
                        style={{
                          fontFamily: T.mono, fontSize: 9, fontWeight: isActive ? 700 : 500,
                          color: isActive ? C.blueDark : C.inkFaint,
                          background: isActive ? C.blueLight : "transparent",
                          border: "none",
                          borderBottom: `2px solid ${isActive ? C.blueDark : "transparent"}`,
                          cursor: "pointer",
                          padding: "4px 10px 3px",
                          transition: "all 0.12s",
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── Feedback toast ── */}
            {drawerFeedback && (
              <div style={{
                padding: `3px ${S[3]}px`,
                marginTop: S[1],
                background: drawerFeedback.includes("ya esta incluida") ? C.amberLight : C.greenLight,
                borderRadius: R.sm,
                border: `1px solid ${drawerFeedback.includes("ya esta incluida") ? C.amberBorder : C.greenBorder}`,
                fontFamily: T.mono, fontSize: 10, fontWeight: 600,
                color: drawerFeedback.includes("ya esta incluida") ? C.amber : C.green,
                display: "flex", alignItems: "center", gap: S[2],
                flexShrink: 0,
              }}>
                <span>{drawerFeedback}</span>
                <button onClick={() => setDrawerFeedback(null)} style={{
                  fontFamily: T.mono, fontSize: 9, color: "inherit",
                  background: "transparent", border: "none", cursor: "pointer", marginLeft: "auto",
                }}>
                  x
                </button>
              </div>
            )}

            {/* ── Tab: Referencias — search bar (GO-LIVE-MALETAS-REFERENCIAS-POR-LINEA-01) ── */}
            {drawerTab === "referencias" && (
            <div style={{
              flexShrink: 0, display: "flex", flexDirection: "column", gap: S[2],
              padding: `${S[2]}px 0`,
              background: C.white,
              position: "sticky" as const, top: 0, zIndex: 2,
            }}>
              <input
                type="text"
                placeholder="Buscar referencia, descripcion, subgrupo..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setLineVisibleCounts({}); setExpandedRef(null); }}
                style={{
                  fontFamily: T.mono, fontSize: T.sz.xs,
                  padding: `6px ${S[3]}px`,
                  border: `1px solid ${C.blueBorder}`,
                  borderRadius: R.md,
                  background: C.white,
                  color: C.ink,
                  width: "100%",
                  outline: "none",
                  boxSizing: "border-box" as const,
                  boxShadow: `0 1px 3px ${C.blueDark}08`,
                }}
              />
            </div>
            )}

            {/* ── Tab: Referencias — per-line accordions (GO-LIVE-MALETAS-REFERENCIAS-POR-LINEA-01) ── */}
            {drawerTab === "referencias" && (
            <div ref={tableContainerRef} style={{
              flex: 1,
              overflowY: "auto" as const,
              minHeight: 0,
            }}>
              {selectedVendor && selectedVendor.totalRefs === 0 ? (
                <div style={{
                  padding: S[5], textAlign: "center",
                  fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint,
                  background: C.surfaceAlt, borderRadius: R.md,
                }}>
                  Sin referencias en esta maleta
                </div>
              ) : lineGroups.length === 0 && searchQuery.trim() ? (
                <div style={{
                  padding: S[5], textAlign: "center",
                  fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint,
                  background: C.surfaceAlt, borderRadius: R.md,
                }}>
                  Sin resultados para &quot;{searchQuery.trim()}&quot;
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
                  {lineGroups.map(([lineName, lineRefs]) => {
                    const isExpanded_ = lineExpanded[lineName] !== false; // default open
                    const localFilter = lineFilters[lineName] ?? "all";
                    const localVisibleCount = lineVisibleCounts[lineName] ?? PAGE_SIZE;

                    // Line-level stats (computed from full lineRefs, not filtered)
                    const saludables = lineRefs.filter((r) => r.state === "saludable").length;
                    const agotado = lineRefs.filter((r) => r.commercialHealth === "OUT_OF_STOCK").length;
                    const stockBajo = lineRefs.filter((r) => r.commercialHealth === "LOW_STOCK").length;
                    const recompra = lineRefs.filter((r) => r.supplyAction === "RECOMPRA_SUGERIDA").length;

                    // Filter lineRefs by local filter
                    let filtered = lineRefs;
                    if (localFilter !== "all") {
                      filtered = lineRefs.filter((r) => r.state === localFilter);
                    }

                    // Sort
                    const sorted = [...filtered].sort(
                      (a, b) => a.centralAvailable - b.centralAvailable,
                    );
                    const visible = sorted.slice(0, localVisibleCount);
                    const hasMoreLine = localVisibleCount < sorted.length;

                    return (
                      <div key={lineName} style={{
                        border: `1px solid ${C.line}`, borderRadius: R.md,
                        overflow: "hidden",
                      }}>
                        {/* Accordion header */}
                        <button
                          onClick={() => setLineExpanded((prev) => ({ ...prev, [lineName]: !isExpanded_ }))}
                          style={{
                            display: "flex", alignItems: "center", gap: S[3],
                            width: "100%",
                            padding: `${S[3]}px ${S[3]}px`,
                            background: C.surfaceAlt, border: "none",
                            cursor: "pointer",
                            borderBottom: isExpanded_ ? `1px solid ${C.line}` : "none",
                          }}
                        >
                          <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
                            {isExpanded_ ? "▼" : "▶"}
                          </span>
                          <span style={{
                            fontFamily: T.mono, fontSize: 11, fontWeight: 700,
                            color: C.titleDeep, flex: 1, textAlign: "left",
                          }}>
                            {lineName} ({lineRefs.length})
                          </span>
                          {/* Inline summary chips */}
                          <span style={{ display: "flex", gap: S[2], flexWrap: "wrap", justifyContent: "flex-end" }}>
                            <span style={{ fontFamily: T.mono, fontSize: 9, color: C.green }}>{saludables} saludables</span>
                            {agotado > 0 && <span style={{ fontFamily: T.mono, fontSize: 9, color: C.red }}>{agotado} agotado</span>}
                            {stockBajo > 0 && <span style={{ fontFamily: T.mono, fontSize: 9, color: C.amber }}>{stockBajo} stock bajo</span>}
                            {recompra > 0 && <span style={{ fontFamily: T.mono, fontSize: 9, color: C.blueDark }}>{recompra} recompra</span>}
                          </span>
                        </button>

                        {/* Expanded content */}
                        {isExpanded_ && (
                          <div>
                            {/* Local filter pills */}
                            <div style={{
                              display: "flex", gap: S[1], flexWrap: "wrap", alignItems: "center",
                              padding: `${S[2]}px ${S[3]}px`,
                              borderBottom: `1px solid ${C.line}`,
                            }}>
                              {FILTER_ORDER.map((f) => {
                                const count = f === "all"
                                  ? lineRefs.length
                                  : lineRefs.filter((r) => r.state === f).length;
                                if (f !== "all" && count === 0) return null;
                                const active = localFilter === f;
                                return (
                                  <button
                                    key={f}
                                    onClick={() => {
                                      setLineFilters((prev) => ({ ...prev, [lineName]: f }));
                                      setLineVisibleCounts((prev) => ({ ...prev, [lineName]: PAGE_SIZE }));
                                      setExpandedRef(null);
                                    }}
                                    style={{
                                      fontFamily: T.mono, fontSize: 9, fontWeight: active ? 700 : 500,
                                      padding: "0 6px",
                                      height: 22,
                                      lineHeight: 1,
                                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                                      background: active ? C.blueDark : C.white,
                                      color: active ? C.white : C.ink,
                                      border: `1px solid ${active ? C.blueDark : C.line}`,
                                      borderRadius: R.pill, cursor: "pointer",
                                      whiteSpace: "nowrap" as const,
                                      boxShadow: active ? `0 1px 4px ${C.blueDark}30` : "none",
                                      transition: "all 0.12s",
                                      boxSizing: "border-box" as const,
                                    }}
                                  >
                                    {FILTER_LABEL[f]} ({count})
                                  </button>
                                );
                              })}
                            </div>

                            {/* Table */}
                            <div className="ag-op-table">
                              {/* Table header */}
                              {(() => {
                                const isImportLine = lineName === "IMPORT";
                                const cols = isImportLine ? REF_TABLE_COLS_IMPORT : REF_TABLE_COLS;
                                const headers = isImportLine
                                  ? ["", "Ref", "Descripcion", "Grupo", "Subgrupo", "Linea", "Tamano", "Disponible", "Estado"]
                                  : ["", "Ref", "Descripcion", "Grupo", "Subgrupo", "Linea", "Disponible", "Estado"];
                                return (
                                  <div className="ag-op-row" style={{
                                    display: "grid",
                                    gridTemplateColumns: cols,
                                    padding: `${S[2]}px ${S[3]}px`,
                                    background: C.surfaceAlt,
                                    borderBottom: `1px solid ${C.line}`,
                                    gap: S[2],
                                    position: "sticky" as const, top: 0, zIndex: 2,
                                  }}>
                                    {headers.map((h, hi) => (
                                      <div key={h || `img-${hi}`} style={{
                                        fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600,
                                        color: C.inkFaint, whiteSpace: "nowrap" as const,
                                        textAlign: h === "Disponible" ? "right" as const : h === "Estado" ? "center" as const : undefined,
                                      }}>
                                        {h}
                                      </div>
                                    ))}
                                  </div>
                                );
                              })()}

                              {/* Empty filter state */}
                              {visible.length === 0 && (
                                <div style={{
                                  padding: S[4], textAlign: "center",
                                  fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint,
                                }}>
                                  Sin resultados
                                </div>
                              )}

                              {/* Rows */}
                              {visible.map((ref) => {
                                const isReplace = ref.state === "reemplazar";
                                const isRefExpanded = expandedRef === ref.reference;
                                const isImportRow = lineName === "IMPORT";
                                const rowCols = isImportRow ? REF_TABLE_COLS_IMPORT : REF_TABLE_COLS;

                                return (
                                  <div key={ref.reference}>
                                    <div
                                      className="ag-op-row"
                                      onClick={isReplace ? () => toggleRefDetail(ref.reference) : undefined}
                                      style={{
                                        display: "grid",
                                        gridTemplateColumns: rowCols,
                                        padding: `${S[2]}px ${S[3]}px`,
                                        borderBottom: isRefExpanded ? "none" : `1px solid ${C.line}`,
                                        alignItems: "center",
                                        gap: S[2],
                                        cursor: isReplace ? "pointer" : "default",
                                        background: isRefExpanded ? C.blueDark + "08" : "transparent",
                                        transition: "background 0.12s",
                                      }}
                                    >
                                      {/* Thumbnail — MALETAS-REFERENCIAS-GRUPO-IMAGEN-01 */}
                                      <RefThumbnail imageUrl={ref.imageUrl} alt={ref.description} />

                                      {/* Ref code */}
                                      <div style={{
                                        fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600,
                                        color: C.titleDeep, overflow: "hidden",
                                        textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
                                        minWidth: 0,
                                      }}>
                                        {ref.reference}
                                      </div>

                                      {/* Description */}
                                      <div title={ref.description} style={{
                                        fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink,
                                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
                                        minWidth: 0,
                                      }}>
                                        {ref.description}
                                      </div>

                                      {/* Grupo — MALETAS-REFERENCIAS-GRUPO-IMAGEN-01: show SAG grupo name, not numeric ID */}
                                      <div title={ref.grupoSag ?? ""} style={{
                                        fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid,
                                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
                                        minWidth: 0,
                                      }}>
                                        {ref.grupoSag ?? "\u2014"}
                                      </div>

                                      {/* Subgrupo SAG */}
                                      <div title={ref.subgrupoSag} style={{
                                        fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
                                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
                                        minWidth: 0,
                                      }}>
                                        {ref.subgrupoSag}
                                      </div>

                                      {/* Line */}
                                      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                                        {ref.line}
                                      </div>

                                      {/* Tamano — IMPORT only */}
                                      {isImportRow && (
                                        <div style={{
                                          fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid,
                                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
                                        }}>
                                          {ref.sizeClass ?? "\u2014"}
                                        </div>
                                      )}

                                      {/* Disponible */}
                                      <div style={{
                                        fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600,
                                        textAlign: "right" as const,
                                        color: ref.centralAvailable <= 0 ? C.red
                                          : ref.centralAvailable <= ref.minimumRequired ? C.amber
                                          : C.ink,
                                      }}>
                                        {ref.centralAvailable <= 0 ? "\u2014" : ref.centralAvailable}
                                      </div>

                                      {/* Commercial health badge + affordance */}
                                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, flexWrap: "wrap" }}>
                                        <CommercialHealthBadge health={ref.commercialHealth} />
                                        {isReplace && (
                                          <span style={{
                                            fontFamily: T.mono, fontSize: 10, color: C.blueDark,
                                            transform: isRefExpanded ? "rotate(90deg)" : "rotate(0deg)",
                                            transition: "transform 0.15s",
                                            flexShrink: 0,
                                          }}>
                                            {"\u25B6"}
                                          </span>
                                        )}
                                      </div>

                                    </div>

                                    {/* Expanded replacement detail panel */}
                                    {isRefExpanded && (
                                      <>
                                        <ReplacementDetailPanel ref_={ref} />
                                        {drawerReplacingRef === ref.reference && selectedVendor && !ref.isAccessory && (
                                          <DrawerCandidateSelector
                                            ref_={ref}
                                            vendor={selectedVendor}
                                            draftPlan={getDraftPlan(selectedVendor.vendorId)}
                                            onSelect={(candidate) => addReplacementFromDrawer(selectedVendor, ref, candidate)}
                                            saving={planSaving}
                                          />
                                        )}
                                      </>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {/* Load more */}
                            {hasMoreLine && (
                              <button
                                onClick={() => setLineVisibleCounts((prev) => ({ ...prev, [lineName]: (prev[lineName] ?? PAGE_SIZE) + PAGE_SIZE }))}
                                style={{ ...showMoreBtnStyle, margin: `${S[2]}px ${S[3]}px ${S[3]}px` }}
                              >
                                Ver mas ({sorted.length - localVisibleCount} restantes)
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Vault: Historico de referencias retiradas (GO-LIVE-MALETAS-DRAWER-PRODUCTION-01) ── */}
              {depletedRefs.length > 0 && (
                <DepletedVault refs={depletedRefs} />
              )}
            </div>
            )}

            {/* ── Tab: Inteligencia — Centro de Decisiones Comerciales (GO-LIVE-MALETAS-INTELIGENCIA-V2-01) ── */}
            {drawerTab === "inteligencia" && selectedVendor && (
              <div style={{ flex: 1, overflowY: "auto" as const, minHeight: 0, paddingTop: S[2] }}>
                <CommercialDecisionCenter
                  activeRefs={activeRefs}
                  depletedRefs={depletedRefs}
                  coverageByLine={coverageByLine}
                  derroteroRules={derroteroRules}
                  onNavigate={(target) => {
                    setDrawerTab(target.tab);
                    if (target.tab === "referencias" && target.line) {
                      setLineExpanded((prev) => ({ ...prev, [target.line!]: true }));
                      if (target.filter) {
                        setLineFilters((prev) => ({ ...prev, [target.line!]: target.filter! }));
                      }
                    }
                  }}
                />
              </div>
            )}

            {/* ── Tab: Derrotero ideal (GO-LIVE-MALETAS-DERROTERO-CONFIG-01) ── */}
            {drawerTab === "derrotero" && selectedVendor && (
              <div style={{ flex: 1, overflowY: "auto" as const, minHeight: 0, paddingTop: S[2] }}>
                <DerroteroIdealPanel orgSlug={orgSlug} vendor={selectedVendor} externalRules={derroteroRules} onRulesChange={setDerroteroRules} assortmentEval={liveAssortmentEvals.find((e) => e.vendorId === selectedVendor.vendorId)} onEvalChange={(updated) => { setLiveAssortmentEvals((prev) => prev.map((e) => e.vendorId === updated.vendorId ? updated : e)); }} />
              </div>
            )}
          </div>
          );
        })()}
      </OperationalSideDrawer>

      {/* ── Production Detail Drawer ─────────────────────────────── */}
      <OperationalSideDrawer
        open={prodDetailOpen}
        onClose={() => setProdDetailOpen(false)}
        title={prodDetailItem ? `Detalle · ${prodDetailItem.reference}` : ""}
        size="wide"
      >
        {prodDetailItem && <ProductionDetailDrawer item={prodDetailItem} vendors={vendors} />}
      </OperationalSideDrawer>

      {/* ── Coverage Gap Action Drawer ───────────────────────────── */}
      <OperationalSideDrawer
        open={gapActionOpen}
        onClose={() => setGapActionOpen(false)}
        title={gapActionItem ? `Agregar al plan de surtido · ${gapActionItem.reference}` : ""}
        size="wide"
      >
        {gapActionItem && (
          <GapActionDrawer
            gap={gapActionItem}
            candidates={buildMaletaCandidates()}
            step={gapStep}
            selectedVendor={gapSelectedVendor}
            selectedRefOut={gapSelectedRefOut}
            qty={gapQty}
            onSelectVendor={(id) => { setGapSelectedVendor(id); setGapStep("select_ref_out"); }}
            onSelectRefOut={(ref) => { setGapSelectedRefOut(ref); setGapStep("confirm"); }}
            onChangeQty={setGapQty}
            onConfirm={confirmGapReservation}
            onPrint={(guide) => { setPrintGuide(guide); }}
            onClose={() => setGapActionOpen(false)}
            guides={guides}
          />
        )}
      </OperationalSideDrawer>

      {/* ── Plan Drawer (MALETAS-BULK-REPLENISHMENT-01) ──────────── */}
      <OperationalSideDrawer
        open={planDrawerOpen}
        onClose={() => setPlanDrawerOpen(false)}
        title={(() => {
          const v = vendors.find(v => v.vendorId === planDrawerVendor);
          return v ? `Plan de surtido · ${v.vendorName}` : "Plan de surtido";
        })()}
        size="wide"
      >
        {planDrawerVendor && (
          <PlanDrawerContent
            vendorId={planDrawerVendor}
            plans={plans}
            vendors={vendors}
            onRemoveItem={removeItemFromPlan}
            onGenerateDocument={generatePlanDocument}
            onUpdateStatus={updatePlanStatus}
            onPrint={(plan) => setPrintPlan(plan)}
          />
        )}
      </OperationalSideDrawer>

      {/* ── History Drawer ────────────────────────────────────────── */}
      <OperationalSideDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="Historial de surtidos"
        size="wide"
      >
        <HistoryDrawerContent
          plans={plans}
          statusFilter={historyFilter}
          vendorFilter={historyVendorFilter}
          vendors={vendors}
          onStatusFilter={setHistoryFilter}
          onVendorFilter={setHistoryVendorFilter}
          onOpenPlan={(planId) => {
            const plan = plans.find(p => p.id === planId);
            if (plan) {
              setPlanDrawerVendor(plan.vendorId);
              setPlanDrawerOpen(true);
            }
          }}
          onPrint={(plan) => setPrintPlan(plan)}
        />
      </OperationalSideDrawer>

      {/* ── Print View (full-screen overlay) ─────────────────────── */}
      {printGuide && (
        <PrintGuideOverlay guide={printGuide} onClose={() => setPrintGuide(null)} />
      )}
      {printPlan && (
        <PrintPlanOverlay plan={printPlan} onClose={() => setPrintPlan(null)} />
      )}

      {/* ── Portfolio Builder Drawer (COMERCIAL-MALETAS-CANONICAL-INVENTORY-INTEGRATION-01) ── */}
      <OperationalSideDrawer
        open={builderOpen}
        onClose={() => setBuilderOpen(false)}
        title="Constructor de maleta"
        subtitle={`${builderSelection.length} refs · ${builderSelection.reduce<number>((s, i) => s + i.assignedQty, 0)} uds`}
        severity="info"
        size="wide"
      >
        <MaletaPortfolioBuilder
          orgSlug={orgSlug}
          onSelectionChange={setBuilderSelection}
          onClose={() => setBuilderOpen(false)}
        />
      </OperationalSideDrawer>
    </div>
  );
}

// ── Replacement Detail Panel ────────────────────────────────────────────────

function ReplacementDetailPanel({ ref_ }: { ref_: VendorSampleRef }) {
  // ── IMPORT/Accessory scarcity panel ─────────────────────────────────
  if (ref_.isAccessory) {
    return <AccessoryScarcityPanel ref_={ref_} />;
  }

  const bodegaOptions = ref_.replacementOptions ?? [];
  const opOptions = ref_.opReplacementOptions ?? [];
  const hasBodega = bodegaOptions.length > 0;
  const hasOp = opOptions.length > 0;
  const showProduction = ref_.requiresProductionSuggestion && !hasBodega && !hasOp;

  return (
    <div style={{
      background: C.blueDark + "06",
      borderBottom: `1px solid ${C.line}`,
      padding: `${S[3]} ${S[4]}`,
    }}>
      {/* Current reference summary */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr",
        gap: S[3], marginBottom: S[4],
        padding: S[3],
        background: C.surface,
        borderRadius: R.md,
        border: `1px solid ${C.line}`,
      }}>
        <DetailField label="Referencia actual" value={ref_.reference} bold />
        <DetailField label="Descripcion" value={ref_.description} />
        <DetailField label="Subgrupo SAG" value={ref_.subgrupoSag} />
        <DetailField label="Linea" value={ref_.line} />
        <DetailField
          label="Disponible en bodega principal"
          value={ref_.centralAvailable <= 0 ? "\u2014" : String(ref_.centralAvailable)}
          color={ref_.centralAvailable <= 0 ? C.red : C.amber}
        />
        <DetailField label="Minimo requerido" value={String(ref_.minimumRequired)} />
      </div>

      {/* ── REEMPLAZOS EN BODEGA PRINCIPAL ──────────────── */}
      <div style={{
        fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600,
        color: C.inkFaint, textTransform: "uppercase" as const,
        letterSpacing: "0.05em", marginBottom: S[2],
      }}>
        Reemplazos en bodega principal
        {ref_.replacementSource && (
          <span style={{ fontWeight: 500, marginLeft: S[2], textTransform: "none" as const }}>
            {"\u2014"} {ref_.replacementSource}
          </span>
        )}
      </div>

      {hasBodega ? (
        <div className="ag-op-table" style={{
          border: `1px solid ${C.blueDark}20`, borderRadius: R.md, overflow: "hidden",
          marginBottom: S[3],
        }}>
          {/* Table header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "100px 1fr 100px 50px 70px",
            padding: `${S[1]} ${S[3]}`,
            background: C.blueDark + "08",
            borderBottom: `1px solid ${C.blueDark}15`,
            gap: S[2],
          }}>
            {["Referencia", "Descripcion", "Subgrupo SAG", "Linea", "Disponible"].map((h) => (
              <div key={h} style={{
                fontFamily: T.mono, fontSize: 10, fontWeight: 600,
                color: C.blueDark, whiteSpace: "nowrap" as const,
              }}>
                {h}
              </div>
            ))}
          </div>
          {/* Rows */}
          {bodegaOptions.map((opt, i) => (
            <div key={opt.reference} style={{
              display: "grid",
              gridTemplateColumns: "100px 1fr 100px 50px 70px",
              padding: `${S[2]} ${S[3]}`,
              borderBottom: i < bodegaOptions.length - 1 ? `1px solid ${C.line}` : "none",
              alignItems: "center",
              gap: S[2],
              background: i === 0 ? C.blueDark + "04" : "transparent",
            }}>
              <div style={{
                fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600,
                color: C.titleDeep, overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
              }}>
                {opt.reference}
              </div>
              <div style={{
                fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
                minWidth: 0,
              }}>
                {opt.description}
              </div>
              <div style={{
                fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
              }}>
                {opt.subgrupoSag}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                {opt.line}
              </div>
              <div style={{
                fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600, color: C.green,
              }}>
                {opt.available}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{
          padding: S[3], marginBottom: S[3],
          background: C.surfaceAlt,
          borderRadius: R.md,
          border: `1px solid ${C.line}`,
          fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
        }}>
          Sin opciones disponibles en bodega principal
        </div>
      )}

      {/* ── REEMPLAZOS EN OP ───────────────────────────── */}
      <div style={{
        fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600,
        color: C.inkFaint, textTransform: "uppercase" as const,
        letterSpacing: "0.05em", marginBottom: S[2],
      }}>
        OP activas del mismo subgrupo
      </div>

      {hasOp ? (
        <div className="ag-op-table" style={{
          border: `1px solid ${C.amber}20`, borderRadius: R.md, overflow: "hidden",
          marginBottom: S[3],
        }}>
          {/* OP table header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "60px 90px 1fr 100px 70px 80px",
            padding: `${S[1]} ${S[3]}`,
            background: C.amber + "08",
            borderBottom: `1px solid ${C.amber}15`,
            gap: S[2],
          }}>
            {["OP", "Referencia", "Descripcion", "Subgrupo SAG", "Pendiente", "Fecha"].map((h) => (
              <div key={h} style={{
                fontFamily: T.mono, fontSize: 10, fontWeight: 600,
                color: C.amber, whiteSpace: "nowrap" as const,
              }}>
                {h}
              </div>
            ))}
          </div>
          {/* OP rows */}
          {opOptions.map((opt: VendorOpReplacementOption, i: number) => (
            <div key={`${opt.opNumber}-${opt.reference}`} style={{
              display: "grid",
              gridTemplateColumns: "60px 90px 1fr 100px 70px 80px",
              padding: `${S[2]} ${S[3]}`,
              borderBottom: i < opOptions.length - 1 ? `1px solid ${C.line}` : "none",
              alignItems: "center",
              gap: S[2],
            }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600, color: C.amber }}>
                {opt.opNumber}
              </div>
              <div style={{
                fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600,
                color: C.titleDeep, overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
              }}>
                {opt.reference}
              </div>
              <div style={{
                fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
                minWidth: 0,
              }}>
                {opt.description}
              </div>
              <div style={{
                fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
              }}>
                {opt.subgrupoSag}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600, color: C.amber }}>
                {opt.pendingQty}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint }}>
                {formatDate(opt.createdAt)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{
          padding: S[3], marginBottom: S[3],
          background: C.surfaceAlt,
          borderRadius: R.md,
          border: `1px solid ${C.line}`,
          fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
        }}>
          Sin OP activa del mismo subgrupo
        </div>
      )}

      {/* ── SUGERIR PRODUCCION ─────────────────────────── */}
      {showProduction && (
        <div style={{
          padding: S[3],
          background: C.amber + "0A",
          borderRadius: R.md,
          border: `1px solid ${C.amber}30`,
          display: "flex", alignItems: "center", gap: S[3],
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: R.pill,
            background: C.amber + "18",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: T.mono, fontSize: T.sz.xs, color: C.amber,
            flexShrink: 0,
          }}>
            !
          </div>
          <div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600, color: C.titleDeep }}>
              Sin reemplazo disponible
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: 2 }}>
              Accion sugerida: Sugerir produccion
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Drawer Candidate Selector (MALETAS-DRAWER-UX-AND-PLAN-FLOW-01) ──────────

function DrawerCandidateSelector({
  ref_,
  vendor,
  draftPlan,
  onSelect,
  saving,
}: {
  ref_: VendorSampleRef;
  vendor: VendorSampleSnapshot;
  draftPlan?: MaletaReplenishmentPlan;
  onSelect: (candidate: { reference: string; description: string; subgrupoSag: string; available: number }) => void;
  saving: boolean;
}) {
  // Build candidates: same subgrupo, available in bodega, not already in maleta
  const bodegaOptions = ref_.replacementOptions ?? [];
  const vendorRefs = new Set(vendor.refs.map(r => r.reference));
  const alreadyInPlan = new Set(draftPlan?.items.map(i => i.addedReference) ?? []);
  const alreadyRemovedInPlan = draftPlan?.items.some(i => i.removedReference === ref_.reference);

  // Filter: same subgrupo, available > 0, not already in maleta, not already in plan
  const candidates = bodegaOptions
    .filter(opt => opt.available > 0 && !vendorRefs.has(opt.reference) && !alreadyInPlan.has(opt.reference))
    .sort((a, b) => b.available - a.available);

  if (alreadyRemovedInPlan) {
    return (
      <div style={{
        padding: S[3],
        background: C.amberLight,
        borderBottom: `1px solid ${C.line}`,
        fontFamily: T.mono, fontSize: T.sz.xs, color: C.amber, fontWeight: 600,
      }}>
        Esta referencia ya esta incluida en el plan de surtido.
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div style={{
        padding: S[3],
        background: C.surfaceAlt,
        borderBottom: `1px solid ${C.line}`,
        fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
      }}>
        Sin candidatos disponibles para reemplazo
      </div>
    );
  }

  return (
    <div style={{
      background: C.blueDark + "08",
      borderBottom: `1px solid ${C.line}`,
      padding: `${S[3]}px ${S[4]}px`,
    }}>
      <div style={{
        fontFamily: T.mono, fontSize: 10, fontWeight: 700,
        color: C.blueDark, textTransform: "uppercase" as const,
        letterSpacing: "0.05em", marginBottom: S[2],
      }}>
        Elegir reemplazo para {ref_.reference}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: S[1] }}>
        {candidates.slice(0, 8).map((opt) => (
          <div key={opt.reference} style={{
            display: "flex", alignItems: "center", gap: S[2],
            padding: `${S[2]}px ${S[3]}px`,
            background: C.white,
            borderRadius: R.md,
            border: `1px solid ${C.line}`,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.titleDeep }}>
                {opt.reference}
              </div>
              <div style={{
                fontFamily: T.mono, fontSize: 10, color: C.ink,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
              }}>
                {opt.description}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
                {opt.subgrupoSag} · Disponible: {opt.available}
              </div>
            </div>
            <button
              onClick={() => onSelect({
                reference: opt.reference,
                description: opt.description,
                subgrupoSag: opt.subgrupoSag,
                available: opt.available,
              })}
              disabled={saving}
              style={{
                fontFamily: T.mono, fontSize: 9, fontWeight: 700,
                color: C.white, background: C.blueDark,
                border: "none", borderRadius: R.sm,
                padding: "4px 10px", cursor: saving ? "wait" : "pointer",
                flexShrink: 0, opacity: saving ? 0.6 : 1,
              }}
            >
              Elegir
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailField({
  label,
  value,
  bold,
  color,
}: {
  label: string;
  value: string;
  bold?: boolean;
  color?: string;
}) {
  return (
    <div>
      <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint, marginBottom: 2, textTransform: "uppercase" as const, letterSpacing: "0.03em" }}>
        {label}
      </div>
      <div style={{
        fontFamily: T.mono, fontSize: T.sz.xs,
        fontWeight: bold ? 700 : 500,
        color: color ?? C.titleDeep,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
      }}>
        {value}
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ActionCard({
  label,
  count,
  color,
  active,
  onClick,
}: {
  label: string;
  count: number;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  const hasItems = count > 0;
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: `${S[4]} ${S[3]} ${S[3]}`,
        background: active ? color + "14" : C.white,
        border: `1.5px solid ${active ? color : hasItems ? color + "40" : C.line}`,
        borderRadius: R.lg,
        cursor: hasItems ? "pointer" : "default",
        opacity: hasItems ? 1 : 0.5,
        transition: "all 0.15s",
        boxShadow: active ? `0 2px 8px ${color}20` : "none",
      }}
    >
      <div style={{
        fontFamily: T.mono, fontSize: T.sz.xl, fontWeight: 800,
        color: hasItems ? color : C.inkFaint,
        lineHeight: 1.1,
      }}>
        {count}
      </div>
      <div style={{
        fontFamily: T.mono, fontSize: 10, fontWeight: 600,
        color: hasItems ? color : C.inkFaint,
        marginTop: S[1],
        textAlign: "center",
      }}>
        {label}
      </div>
    </button>
  );
}

function StateBadge({ state }: { state: SampleState }) {
  const pillBase: React.CSSProperties = {
    fontFamily: T.mono, fontSize: 9, fontWeight: 700,
    padding: "0 10px", height: 22, lineHeight: 1,
    borderRadius: R.pill, whiteSpace: "nowrap",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    boxSizing: "border-box",
  };

  return (
    <span style={{
      ...pillBase,
      color: STATE_COLOR[state],
      background: state === "saludable" ? C.greenLight : C.blueLight,
      border: `1px solid ${state === "saludable" ? C.greenBorder : C.blueBorder}`,
    }}>
      {STATE_LABEL[state]}
    </span>
  );
}

// ── Commercial health badge (MALLETS-OPERATIONAL-LOGIC-ALIGNMENT-01) ─────────

function CommercialHealthBadge({ health }: { health: SampleCommercialHealth }) {
  const color = COMMERCIAL_HEALTH_COLOR[health];
  const bg = health === "HEALTHY" ? C.greenLight
    : health === "LOW_STOCK" ? C.amberLight
    : health === "OUT_OF_STOCK" ? C.redLight
    : C.surfaceAlt;
  const border = health === "HEALTHY" ? C.greenBorder
    : health === "LOW_STOCK" ? C.amberBorder
    : health === "OUT_OF_STOCK" ? C.redBorder
    : C.line;

  return (
    <span style={{
      fontFamily: T.mono, fontSize: 9, fontWeight: 700,
      padding: "0 8px", height: 20, lineHeight: 1,
      borderRadius: R.pill, whiteSpace: "nowrap" as const,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      color, background: bg, border: `1px solid ${border}`,
    }}>
      {COMMERCIAL_HEALTH_LABEL[health]}
    </span>
  );
}

// ── Import ref detail panel ──────────────────────────────────────────────────

function AccessoryScarcityPanel({ ref_ }: { ref_: VendorSampleRef }) {
  const isLow = ref_.commercialHealth === "OUT_OF_STOCK" || ref_.commercialHealth === "LOW_STOCK";
  const accentColor = isLow ? C.red : C.green;
  const bgColor = isLow ? C.redLight : C.greenLight;
  const borderColor = isLow ? C.redBorder : C.greenBorder;

  return (
    <div style={{
      background: bgColor,
      borderLeft: `1px solid ${accentColor}40`,
      borderRight: `1px solid ${accentColor}40`,
      borderBottom: `1px solid ${accentColor}40`,
      borderRadius: `0 0 ${R.lg} ${R.lg}`,
      padding: S[4],
    }}>
      {/* Reference summary */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr",
        gap: S[3], marginBottom: S[4],
        padding: S[4],
        background: C.white,
        borderRadius: R.lg,
        border: `1px solid ${borderColor}`,
        boxShadow: `0 1px 3px ${C.ink}06`,
      }}>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Referencia</div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600, color: C.ink }}>{ref_.reference}</div>
        </div>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Subgrupo SAG</div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>{ref_.subgrupoSag}</div>
        </div>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Disponible B36+B37</div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: accentColor }}>{ref_.centralImportAvailable ?? 0}</div>
        </div>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Minimo operativo</div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: C.ink }}>10</div>
        </div>
      </div>

      {/* Status */}
      <div style={{
        fontFamily: T.mono, fontSize: 10, fontWeight: 700, color: accentColor,
        textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: S[2],
        display: "flex", alignItems: "center", gap: S[2],
      }}>
        <span style={{ width: 6, height: 6, borderRadius: R.pill, background: accentColor, display: "inline-block" }} />
        Estado importacion
      </div>

      <div style={{
        padding: S[4],
        background: C.white,
        borderRadius: R.lg,
        border: `1px solid ${borderColor}`,
      }}>
        <div style={{
          fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700,
          color: accentColor, marginBottom: S[1],
        }}>
          {ref_.commercialHealth === "OUT_OF_STOCK" ? "AGOTADO"
            : ref_.commercialHealth === "LOW_STOCK" ? "STOCK BAJO"
            : "SALUDABLE"}
        </div>
        {isLow ? (
          <>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600, color: C.red, marginBottom: S[1] }}>
              {ref_.commercialHealth === "OUT_OF_STOCK" ? "Sin inventario" : "Inventario bajo"}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 11, color: C.inkFaint, lineHeight: 1.5 }}>
              Referencia de importacion con inventario {ref_.commercialHealth === "OUT_OF_STOCK" ? "agotado" : "igual o inferior al minimo operativo"} en bodega principal.
            </div>
          </>
        ) : (
          <div style={{ fontFamily: T.mono, fontSize: 11, color: C.inkFaint }}>
            Inventario por encima del minimo operativo.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Vendor Card ──────────────────────────────────────────────────────────────

function VendorCard({ vendor, intel, baseMetrics, draftPlan, onClick, onOpenPlan, onToggleActivation, activationLoading }: { vendor: VendorSampleSnapshot; intel?: VendorCommercialIntelligence; baseMetrics?: VendorMalletBaseMetrics; draftPlan?: MaletaReplenishmentPlan; onClick: () => void; onOpenPlan: () => void; onToggleActivation?: (vendorId: string, currentActive: boolean) => void; activationLoading?: string | null }) {
  const hasIssues = vendor.outOfStockCommercialRefs > 0 || vendor.lowStockCommercialRefs > 0;
  const isEmpty = vendor.totalRefs === 0;

  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", flexDirection: "column",
        background: C.white,
        border: `1px solid ${C.line}`,
        borderRadius: R.lg,
        cursor: "pointer",
        boxShadow: E.sm,
        transition: "box-shadow 0.2s, transform 0.2s",
        overflow: "hidden",
        opacity: isEmpty ? 0.6 : 1,
      }}
    >
      <div style={{ padding: S[4], flex: 1, minHeight: isEmpty ? undefined : 150 }}>
        {/* Header: Name + Bodega */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: S[4] }}>
          <div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.base, fontWeight: 800, color: C.titleDeep }}>
              {vendor.vendorName}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: 2 }}>
              Bodega B{vendor.warehouseCode}
            </div>
          </div>
        </div>

        {isEmpty ? (
          <div style={{
            fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
            padding: S[3], textAlign: "center",
            background: C.surfaceAlt, borderRadius: R.md,
          }}>
            Sin referencias en maleta
          </div>
        ) : (
          <>
            {/* Metrics row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: S[3], marginBottom: S[3] }}>
              <VendorMetric label="En maleta" value={baseMetrics?.activeReferenceCount ?? vendor.totalRefs} tooltip="Referencias actualmente presentes en la bodega del vendedor. No incluye referencias retiradas ni registros del Vault." />
              <VendorMetric label="Salud comercial" value={baseMetrics?.effectiveIdealTotal ?? "\u2014"} color={C.blueDark} tooltip="Cantidad óptima de muestras definida por los derroteros activos de esta maleta." />
              <VendorMetric label="Presencia catálogo" value={baseMetrics ? `${baseMetrics.routeCoveragePct}%` : "\u2014"} color={baseMetrics && baseMetrics.routeCoveragePct >= 60 ? C.green : C.amber} tooltip="Porcentaje de necesidades del derrotero actualmente cubiertas." />
            </div>

            {/* Commercial health distribution bar (MALLETS-OPERATIONAL-LOGIC-ALIGNMENT-01) */}
            <div style={{ marginBottom: S[3] }}>
              <div style={{ display: "flex", height: 6, borderRadius: R.pill, overflow: "hidden", background: C.line }}>
                {vendor.healthyCommercialRefs > 0 && (
                  <div style={{ width: `${(vendor.healthyCommercialRefs / vendor.totalRefs) * 100}%`, background: C.green, borderRadius: R.pill }} />
                )}
                {vendor.lowStockCommercialRefs > 0 && (
                  <div style={{ width: `${(vendor.lowStockCommercialRefs / vendor.totalRefs) * 100}%`, background: C.amber }} />
                )}
                {vendor.outOfStockCommercialRefs > 0 && (
                  <div style={{ width: `${(vendor.outOfStockCommercialRefs / vendor.totalRefs) * 100}%`, background: C.red }} />
                )}
              </div>
            </div>

            {/* Issue badges — dedicated row */}
            {hasIssues && (
              <div style={{
                display: "flex", gap: 8, flexWrap: "wrap",
                marginTop: 10, minHeight: 28,
                alignItems: "center",
              }}>
                {vendor.outOfStockCommercialRefs > 0 && <IssuePill count={vendor.outOfStockCommercialRefs} label="agotado" color={C.red} bg={C.redLight} border={C.redBorder} />}
                {vendor.lowStockCommercialRefs > 0 && <IssuePill count={vendor.lowStockCommercialRefs} label="stock bajo" color={C.amber} bg={C.amberLight} border={C.amberBorder} />}
              </div>
            )}

            {/* Draft plan badge */}
            {draftPlan && (
              <button
                onClick={(e) => { e.stopPropagation(); onOpenPlan(); }}
                style={{
                  fontFamily: T.mono, fontSize: 10, fontWeight: 700,
                  color: C.blueDark, background: C.blueLight,
                  border: `1px solid ${C.blueBorder}`, borderRadius: R.md,
                  padding: `${S[2]} ${S[3]}`,
                  cursor: "pointer", width: "100%", textAlign: "center",
                  marginTop: 8,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: S[2],
                }}
              >
                Plan draft: {draftPlan.items.length} cambio{draftPlan.items.length !== 1 ? "s" : ""}
                <span style={{
                  fontFamily: T.mono, fontSize: 8, fontWeight: 700,
                  color: C.white, background: C.blueDark,
                  padding: "1px 6px", borderRadius: R.pill,
                }}>
                  ver
                </span>
              </button>
            )}

            {/* CTA row */}
            <div style={{ display: "flex", gap: S[2], marginTop: draftPlan ? 4 : 8 }}>
              <div style={{
                fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700,
                color: C.blueDark, textAlign: "center",
                height: 26, flex: 1,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: C.blueLight,
                borderRadius: R.md,
                border: `1px solid ${C.blueBorder}`,
              }}>
                Abrir maleta
              </div>
              {onToggleActivation && (
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleActivation(vendor.vendorId, vendor.isActive); }}
                  disabled={activationLoading === vendor.vendorId}
                  style={{
                    fontFamily: T.mono, fontSize: 9, fontWeight: 600,
                    color: vendor.isActive ? C.red : C.green,
                    background: vendor.isActive ? C.redLight : C.greenLight,
                    border: `1px solid ${vendor.isActive ? C.redBorder : C.greenBorder}`,
                    borderRadius: R.md, cursor: "pointer",
                    padding: `0 ${S[3]}px`, height: 26,
                    opacity: activationLoading === vendor.vendorId ? 0.5 : 1,
                    whiteSpace: "nowrap" as const,
                  }}
                >
                  {vendor.isActive ? "Desactivar" : "Activar"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── List grid constants ──────────────────────────────────────────────────────
//
// REGLA 1: Accion = fixed (140px prod, 160px gap)
// REGLA 2: Urgencia = fixed 90px
// REGLA 3: Miniatura = fixed 64px (40px thumb + 12px padding each side)
// REGLA 4: minHeight 72px, padding 12px 16px
// REGLA 5: Urgencia = own column
// REGLA 6: Accion = own column

// Shared grid for production + coverage gap tables (GO-LIVE-MALETAS-PRODUCCION-TABLE-CLONE-01)
const GAP_GRID  = "40px 80px minmax(120px,1.2fr) minmax(80px,1fr) 50px 56px 100px";
// Shared grid for all active-ref tables: Img | Ref | Descripcion | Grupo | Subgrupo | Linea | Disponible | Estado/Accion
// MALETAS-REFERENCIAS-GRUPO-IMAGEN-01: added 36px thumbnail column
const REF_TABLE_COLS = "36px 80px minmax(100px,1.4fr) minmax(70px,0.6fr) minmax(80px,0.7fr) 52px 60px 88px";
// Import adds Tamano column
const REF_TABLE_COLS_IMPORT = "36px 80px minmax(100px,1.2fr) minmax(60px,0.5fr) minmax(70px,0.6fr) 52px 60px 60px 88px";

const listHeaderCell: React.CSSProperties = {
  fontFamily: T.mono, fontSize: 10, fontWeight: 600,
  color: C.inkFaint, whiteSpace: "nowrap",
  textTransform: "uppercase", letterSpacing: "0.03em",
};

const listCell: React.CSSProperties = {
  fontFamily: T.mono, fontSize: T.sz.xs,
  overflow: "hidden", textOverflow: "ellipsis",
  whiteSpace: "nowrap", minWidth: 0,
};

const ROW_PAD = "12px 16px";

// ── Production Row ───────────────────────────────────────────────────────────

// ProductionRow — exact visual clone of CoverageGapRow (GO-LIVE-MALETAS-PRODUCCION-TABLE-CLONE-01)
function ProductionRow({ item, isLast, onDetail }: { item: ProductionSuggestion; isLast: boolean; onDetail: () => void }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: GAP_GRID,
      padding: ROW_PAD,
      minHeight: 72,
      borderBottom: isLast ? "none" : `1px solid ${C.lineSubtle}`,
      gap: S[2],
      alignItems: "center",
    }}>
      {/* Thumbnail — identical to CoverageGapRow */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{
          width: 36, height: 36, borderRadius: R.md,
          background: `linear-gradient(135deg, ${C.blueLight}, ${C.surfaceAlt})`,
          border: `1px solid ${C.blueBorder}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.blueDark }}>
            {item.line.slice(0, 2)}
          </span>
        </div>
      </div>

      {/* Referencia */}
      <div style={{ ...listCell, fontWeight: 700, color: C.titleDeep }}>
        {item.reference}
      </div>

      {/* Descripcion */}
      <div style={{ ...listCell, color: C.ink }}>
        {item.description}
      </div>

      {/* Subgrupo SAG */}
      <div style={{ ...listCell, color: C.inkMid }}>
        {item.subgrupoSag ?? "\u2014"}
      </div>

      {/* Linea */}
      <div style={{ ...listCell, color: C.inkFaint }}>
        {item.line}
      </div>

      {/* Disponible — centered */}
      <div style={{
        ...listCell, fontWeight: 700,
        color: item.centralAvailable <= 0 ? C.red : C.green,
        textAlign: "center" as const, display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {item.centralAvailable <= 0 ? "\u2014" : item.centralAvailable}
      </div>

      {/* Accion — identical to CoverageGapRow button */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <button onClick={onDetail}
          title="Ver detalle de produccion sugerida"
          style={{
            fontFamily: T.mono, fontSize: 9, fontWeight: 600,
            color: C.blueDark, background: C.blueLight,
            borderRadius: R.pill, border: `1px solid ${C.blueBorder}`,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            height: 24, padding: "0 8px",
            whiteSpace: "nowrap" as const, cursor: "pointer",
            boxSizing: "border-box" as const,
          }}>
          Detalle
        </button>
      </div>
    </div>
  );
}

// ── Coverage Gap Row ─────────────────────────────────────────────────────────

function CoverageGapRow({ gap, isLast, onAction }: { gap: CoverageGapRef; isLast: boolean; onAction: () => void }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: GAP_GRID,
      padding: ROW_PAD,
      minHeight: 72,
      borderBottom: isLast ? "none" : `1px solid ${C.lineSubtle}`,
      gap: S[2],
      alignItems: "center",
    }}>
      {/* Thumbnail — 56px col, centered 36px square */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{
          width: 36, height: 36, borderRadius: R.md,
          background: `linear-gradient(135deg, ${C.blueLight}, ${C.surfaceAlt})`,
          border: `1px solid ${C.blueBorder}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.blueDark }}>
            {gap.line.slice(0, 2)}
          </span>
        </div>
      </div>

      {/* Referencia */}
      <div style={{ ...listCell, fontWeight: 700, color: C.titleDeep }}>
        {gap.reference}
      </div>

      {/* Descripcion */}
      <div style={{ ...listCell, color: C.ink }}>
        {gap.description}
      </div>

      {/* Subgrupo SAG */}
      <div style={{ ...listCell, color: C.inkMid }}>
        {gap.subgrupoSag ?? "\u2014"}
      </div>

      {/* Linea */}
      <div style={{ ...listCell, color: C.inkFaint }}>
        {gap.line}
      </div>

      {/* Disponible — centered */}
      <div style={{
        ...listCell, fontWeight: 700, color: C.green,
        textAlign: "center" as const, display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {gap.centralAvailable}
      </div>

      {/* Accion — compact button */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <button
          onClick={onAction}
          title="Agregar esta referencia a un plan de surtido de maleta"
          style={{
            fontFamily: T.mono, fontSize: 9, fontWeight: 600,
            color: C.blueDark, background: C.blueLight,
            borderRadius: R.pill, border: `1px solid ${C.blueBorder}`,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            height: 24, padding: "0 8px",
            whiteSpace: "nowrap" as const, cursor: "pointer",
            boxSizing: "border-box" as const,
          }}>
          Agregar
        </button>
      </div>
    </div>
  );
}

// ── Section Header ───────────────────────────────────────────────────────────

// ── CollapsibleSectionHeader (GO-LIVE-MALETAS-COLLAPSED-SECTIONS-VISIBILITY-01) ──

function SectionHeader({
  title,
  subtitle,
  count,
  children,
  open,
  onToggle,
  sectionRef,
  statusHint,
}: {
  title: string;
  subtitle?: string;
  count?: number;
  children: React.ReactNode;
  open?: boolean;
  onToggle?: () => void;
  sectionRef?: React.RefObject<HTMLDivElement>;
  statusHint?: string;
}) {
  const isCollapsible = open !== undefined && onToggle !== undefined;
  const isOpen = open ?? true;

  // ── Non-collapsible (legacy) ──
  if (!isCollapsible) {
    return (
      <div ref={sectionRef} style={{ marginBottom: S[6] }}>
        <div style={{
          display: "flex", alignItems: "center", gap: S[2],
          marginBottom: subtitle ? S[1] : S[3],
        }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.titleDeep }}>
            {title}
          </span>
          {count !== undefined && (
            <span style={{
              fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600,
              color: C.blueDark, background: C.blueLight,
              padding: `1px ${S[2]}`, borderRadius: R.pill,
              border: `1px solid ${C.blueBorder}`,
            }}>
              {count}
            </span>
          )}
        </div>
        {subtitle && (
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginBottom: S[3] }}>
            {subtitle}
          </div>
        )}
        {children}
      </div>
    );
  }

  // ── Collapsible — closed: operational card ──
  if (!isOpen) {
    return (
      <div ref={sectionRef} style={{ marginBottom: S[4] }}>
        <button
          onClick={onToggle}
          style={{
            display: "flex", alignItems: "center", gap: S[3],
            width: "100%", textAlign: "left" as const,
            padding: `${S[3]}px ${S[4]}px`,
            minHeight: 56,
            background: C.white,
            border: `1px solid ${C.line}`,
            borderRadius: R.lg,
            cursor: "pointer",
            boxShadow: `0 1px 3px ${C.ink}06`,
            transition: "all 0.12s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.blueBorder; e.currentTarget.style.boxShadow = `0 2px 8px ${C.blueDark}10`; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.line; e.currentTarget.style.boxShadow = `0 1px 3px ${C.ink}06`; }}
        >
          <span style={{ fontFamily: T.mono, fontSize: 11, color: C.inkFaint, flexShrink: 0 }}>▶</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: 2 }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.titleDeep }}>
                {title}
              </span>
              {count !== undefined && (
                <span style={{
                  fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600,
                  color: C.blueDark, background: C.blueLight,
                  padding: `1px ${S[2]}`, borderRadius: R.pill,
                  border: `1px solid ${C.blueBorder}`,
                }}>
                  {count}
                </span>
              )}
            </div>
            {statusHint && (
              <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
                {statusHint}
              </div>
            )}
          </div>
          <span style={{
            fontFamily: T.mono, fontSize: 9, fontWeight: 600,
            color: C.blueDark, flexShrink: 0,
            display: "inline-flex", alignItems: "center", gap: 2,
          }}>
            Ver detalle →
          </span>
        </button>
      </div>
    );
  }

  // ── Collapsible — open: header + content ──
  return (
    <div ref={sectionRef} style={{ marginBottom: S[6] }}>
      <button
        onClick={onToggle}
        style={{
          display: "flex", alignItems: "center", gap: S[2],
          marginBottom: subtitle ? S[1] : S[3],
          background: "none", border: "none", padding: 0,
          cursor: "pointer", width: "100%", textAlign: "left" as const,
        }}
      >
        <span style={{ fontFamily: T.mono, fontSize: 11, color: C.inkFaint }}>▼</span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.titleDeep }}>
          {title}
        </span>
        {count !== undefined && (
          <span style={{
            fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600,
            color: C.blueDark, background: C.blueLight,
            padding: `1px ${S[2]}`, borderRadius: R.pill,
            border: `1px solid ${C.blueBorder}`,
          }}>
            {count}
          </span>
        )}
        <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, marginLeft: "auto" }}>
          Ocultar
        </span>
      </button>
      {subtitle && (
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginBottom: S[3] }}>
          {subtitle}
        </div>
      )}
      {children}
    </div>
  );
}

// ── Executive KPI ────────────────────────────────────────────────────────────

function ExecKpi({ label, value, color, tooltip }: { label: string; value: number | string; color?: string; tooltip?: string }) {
  return (
    <div title={tooltip} style={{
      padding: S[3],
      background: color ? color + "08" : C.surfaceAlt,
      borderRadius: R.md,
      border: `1px solid ${color ? color + "20" : C.line}`,
      textAlign: "center",
      cursor: tooltip ? "help" : undefined,
    }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xl, fontWeight: 800, color: color ?? C.titleDeep, lineHeight: 1.2 }}>
        {value}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint, marginTop: S[1] }}>{label}</div>
    </div>
  );
}

function DrawerKpi({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div style={{
      padding: S[3], background: C.white,
      borderRadius: R.md, textAlign: "center",
      border: `1px solid ${color ? color + "20" : C.line}`,
    }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: 700, color: color ?? C.titleDeep }}>
        {value}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint }}>{label}</div>
    </div>
  );
}

function VendorMetric({ label, value, color, tooltip }: { label: string; value: number | string; color?: string; tooltip?: string }) {
  return (
    <div style={{ textAlign: "center" }} title={tooltip}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: color ?? C.titleDeep }}>
        {typeof value === "number" && value === 0 ? "\u2014" : value}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>{label}</div>
    </div>
  );
}


function IssuePill({ count, label, color, bg, border }: { count: number; label: string; color: string; bg: string; border: string }) {
  return (
    <span style={{
      fontFamily: T.mono, fontSize: 10, fontWeight: 600,
      color,
      padding: "0 10px",
      height: 24,
      lineHeight: 1,
      background: bg,
      border: `1px solid ${border}`,
      borderRadius: R.pill,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      whiteSpace: "nowrap" as const,
      boxSizing: "border-box" as const,
    }}>
      {count} {label}
    </span>
  );
}

function DrawerKpiCard({ label, value, sub, color, tooltip }: { label: string; value: number | string; sub: string; color?: string; tooltip?: string }) {
  return (
    <div style={{
      flex: 1, minWidth: 70,
      padding: `${S[2]}px ${S[2]}px`,
      background: color ? color + "08" : C.surfaceAlt,
      border: `1px solid ${color ? color + "25" : C.line}`,
      borderRadius: R.sm,
    }} title={tooltip}>
      <div style={{ fontFamily: T.mono, fontSize: 16, fontWeight: 800, color: color ?? C.ink, lineHeight: 1 }}>
        {typeof value === "number" && value === 0 ? "\u2014" : value}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700, color: color ?? C.ink, marginTop: 2 }}>
        {label}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, marginTop: 1 }}>
        {sub}
      </div>
    </div>
  );
}

function CompactChip({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <span style={{
      fontFamily: T.mono, fontSize: 9, fontWeight: 600,
      color: color ?? C.ink,
      background: color ? color + "10" : C.surfaceAlt,
      padding: "2px 8px", borderRadius: R.pill,
      border: `1px solid ${color ? color + "25" : C.line}`,
      display: "inline-flex", alignItems: "center", gap: 3,
      whiteSpace: "nowrap" as const,
    }}>
      <span style={{ fontWeight: 800 }}>{typeof value === "number" && value === 0 ? "\u2014" : value}</span>
      {label}
    </span>
  );
}

function ScoreMetric({ label, value, detail, color }: { label: string; value: string; detail?: string; color?: string }) {
  return (
    <div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: color ?? C.titleDeep }}>
        {value}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>{label}</div>
      {detail && <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>{detail}</div>}
    </div>
  );
}

// ── Commercial Decision Center (GO-LIVE-MALETAS-INTELIGENCIA-V2-01) ──────────
//
// Interprets Motor 2 + Derrotero data. No recalculations. No new queries.
// Sub-components: LineCoverageCard, PriorityActionsCard, PendingSubgroupsCard, OperationalImpactCard, LineActionSummary

type NavigateTarget =
  | { tab: "referencias"; line?: string; filter?: DrawerFilter }
  | { tab: "derrotero"; line?: string };

type CoverageByLineEntry = { complete: number; total: number; pct: number; missing: number; excess: number; catalogName: string };

interface DecisionCenterProps {
  activeRefs: VendorSampleRef[];
  depletedRefs: VendorSampleRef[];
  coverageByLine: Map<string, CoverageByLineEntry>;
  derroteroRules: IdealRouteRule[];
  onNavigate?: (target: NavigateTarget) => void;
}

// ── CoverageCircle (replaces LineCoverageCard — GO-LIVE-MALETAS-INTELIGENCIA-NAVEGABLE-01) ──

function CoverageCircle({ line, cov, onClick }: {
  line: string;
  cov: { complete: number; total: number; pct: number; missing: number; excess: number; catalogName: string };
  onClick?: () => void;
}) {
  const label = DERROTERO_LINE_LABEL[line] ?? line;
  const hasDerrotero = cov.total > 0;
  const pct = hasDerrotero ? cov.pct : 0;
  const color = hasDerrotero ? (pct >= 80 ? C.green : pct >= 50 ? C.amber : C.red) : C.inkFaint;
  // SVG circular indicator
  const size = 56;
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <button
      onClick={onClick}
      title={hasDerrotero ? `Ver derrotero de ${label}` : `Configurar derrotero de ${label}`}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: S[1],
        padding: `${S[2]}px`,
        background: C.white,
        border: `1px solid ${C.line}`,
        borderRadius: R.md,
        cursor: "pointer",
        transition: "all 0.12s",
        minWidth: 80,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = color; e.currentTarget.style.boxShadow = `0 1px 4px ${color}20`; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.line; e.currentTarget.style.boxShadow = "none"; }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={C.line} strokeWidth={stroke} />
        {hasDerrotero && (
          <circle cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={color} strokeWidth={stroke}
            strokeDasharray={circumference} strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dashoffset 0.4s ease" }}
          />
        )}
        <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
          style={{ fontFamily: T.mono, fontSize: hasDerrotero ? 14 : 10, fontWeight: 800, fill: color }}>
          {hasDerrotero ? `${pct}%` : "\u2014"}
        </text>
      </svg>
      <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700, color: C.titleDeep, textAlign: "center" }}>
        {label}
      </span>
      <span style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, textAlign: "center" }}>
        {cov.complete}/{cov.total} completos
      </span>
    </button>
  );
}

// ── PriorityActionsCard ──────────────────────────────────────────────────────

const SUPPLY_ACTION_LABEL: Record<string, string> = {
  REEMPLAZAR_BODEGA: "Completar desde bodega",
  COMPLETAR_DESDE_OP: "Esperando OP",
  PRODUCCION_SUGERIDA: "Produccion sugerida",
  RECOMPRA_SUGERIDA: "Recompra sugerida",
  RETIRAR_MOSTRARIO: "Retirar del mostrario",
};

const SUPPLY_ACTION_COLOR: Record<string, string> = {
  REEMPLAZAR_BODEGA: C.green,
  COMPLETAR_DESDE_OP: C.amber,
  PRODUCCION_SUGERIDA: C.blueDark,
  RECOMPRA_SUGERIDA: C.blueDark,
  RETIRAR_MOSTRARIO: C.red,
};

function PriorityActionsCard({ activeRefs, depletedRefs, onActionClick }: {
  activeRefs: VendorSampleRef[]; depletedRefs: VendorSampleRef[];
  onActionClick?: (action: string) => void;
}) {
  const allRefs = useMemo(() => [...activeRefs, ...depletedRefs], [activeRefs, depletedRefs]);
  const groups = useMemo(() => {
    const map = new Map<string, number>();
    for (const ref of allRefs) {
      if (ref.supplyAction) {
        map.set(ref.supplyAction, (map.get(ref.supplyAction) ?? 0) + 1);
      }
    }
    return [...map.entries()].sort(([, a], [, b]) => b - a);
  }, [allRefs]);

  if (groups.length === 0) {
    return (
      <div style={{
        padding: `${S[3]}px`, fontFamily: T.mono, fontSize: 10, color: C.inkFaint,
        background: C.surfaceAlt, borderRadius: R.md, border: `1px solid ${C.line}`,
      }}>
        Sin acciones pendientes
      </div>
    );
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: S[2],
      padding: `${S[3]}px`, background: C.white,
      border: `1px solid ${C.line}`, borderRadius: R.md,
    }}>
      {groups.map(([action, count]) => (
        <button key={action}
          onClick={() => onActionClick?.(action)}
          title={`Ver ${count} referencia${count !== 1 ? "s" : ""} con accion: ${SUPPLY_ACTION_LABEL[action] ?? action}`}
          style={{
            display: "flex", alignItems: "center", gap: S[2],
            padding: `${S[2]}px ${S[2]}px`,
            background: (SUPPLY_ACTION_COLOR[action] ?? C.inkFaint) + "08",
            borderRadius: R.sm,
            border: `1px solid ${(SUPPLY_ACTION_COLOR[action] ?? C.inkFaint)}20`,
            cursor: "pointer",
            transition: "all 0.12s",
            width: "100%",
            textAlign: "left" as const,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = (SUPPLY_ACTION_COLOR[action] ?? C.inkFaint) + "14"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = (SUPPLY_ACTION_COLOR[action] ?? C.inkFaint) + "08"; }}
        >
          <span style={{
            width: 6, height: 6, borderRadius: R.pill, flexShrink: 0,
            background: SUPPLY_ACTION_COLOR[action] ?? C.inkFaint,
          }} />
          <span style={{ fontFamily: T.mono, fontSize: 10, fontWeight: 600, color: C.ink, flex: 1 }}>
            {SUPPLY_ACTION_LABEL[action] ?? action}
          </span>
          <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 800, color: SUPPLY_ACTION_COLOR[action] ?? C.ink }}>
            {count}
          </span>
          <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
            referencia{count !== 1 ? "s" : ""} →
          </span>
        </button>
      ))}
    </div>
  );
}

// ── PendingSubgroupsCard ─────────────────────────────────────────────────────

function PendingSubgroupsCard({ derroteroRules, activeRefs, onSubgroupClick }: {
  derroteroRules: IdealRouteRule[]; activeRefs: VendorSampleRef[];
  onSubgroupClick?: (line: string) => void;
}) {
  const pendingByLine = useMemo(() => {
    const activeRulesAll = derroteroRules.filter((r) => r.isActive);
    const refCountByKey = new Map<string, number>();
    for (const ref of activeRefs) {
      const key = `${ref.line}|${ref.subgrupoSag}`;
      refCountByKey.set(key, (refCountByKey.get(key) ?? 0) + 1);
    }
    const map = new Map<string, { subgrupo: string; actual: number; ideal: number; falta: number }[]>();
    for (const rule of activeRulesAll) {
      const actual = refCountByKey.get(`${rule.line}|${rule.subgrupoSag}`) ?? 0;
      if (actual < rule.minimumRefs) {
        const arr = map.get(rule.line) ?? [];
        arr.push({ subgrupo: rule.subgrupoSag, actual, ideal: rule.minimumRefs, falta: rule.minimumRefs - actual });
        map.set(rule.line, arr);
      }
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [derroteroRules, activeRefs]);

  if (pendingByLine.length === 0) {
    return (
      <div style={{
        padding: `${S[3]}px`, fontFamily: T.mono, fontSize: 10, color: C.green,
        background: C.greenLight, borderRadius: R.md, border: `1px solid ${C.greenBorder}`,
      }}>
        Todos los subgrupos del derrotero estan completos
      </div>
    );
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: S[3],
      padding: `${S[3]}px`, background: C.white,
      border: `1px solid ${C.line}`, borderRadius: R.md,
    }}>
      {pendingByLine.map(([line, items]) => (
        <div key={line}>
          <button
            onClick={() => onSubgroupClick?.(line)}
            title={`Ver derrotero de ${DERROTERO_LINE_LABEL[line] ?? line}`}
            style={{
              fontFamily: T.mono, fontSize: 10, fontWeight: 700, color: C.titleDeep, marginBottom: S[1],
              background: "none", border: "none", padding: 0, cursor: "pointer",
              display: "flex", alignItems: "center", gap: S[1],
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = C.blueDark; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = C.titleDeep; }}
          >
            {DERROTERO_LINE_LABEL[line] ?? line} <span style={{ fontSize: 9, color: C.inkFaint }}>→ Derrotero</span>
          </button>
          {items.map((item) => (
            <button key={item.subgrupo}
              onClick={() => onSubgroupClick?.(line)}
              title={`Abrir derrotero para resolver ${item.subgrupo}`}
              style={{
                display: "flex", alignItems: "center", gap: S[2],
                padding: `2px 0`, width: "100%", background: "none", border: "none",
                cursor: "pointer", textAlign: "left" as const,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = C.surfaceAlt; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
            >
              <span style={{ fontFamily: T.mono, fontSize: 9, color: C.amber }}>□</span>
              <span style={{ fontFamily: T.mono, fontSize: 10, color: C.ink, flex: 1 }}>
                {item.subgrupo}
              </span>
              <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 600, color: C.amber }}>
                {item.falta === 1 ? "falta 1" : `faltan ${item.falta}`}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── OperationalImpactCard ────────────────────────────────────────────────────

function OperationalImpactCard({ activeRefs, depletedRefs, coverageByLine }: {
  activeRefs: VendorSampleRef[];
  depletedRefs: VendorSampleRef[];
  coverageByLine: Map<string, CoverageByLineEntry>;
}) {
  const impacts = useMemo(() => {
    // Refs at risk: low stock in main warehouse
    const atRisk = activeRefs.filter((r) => r.commercialHealth === "LOW_STOCK" || r.commercialHealth === "OUT_OF_STOCK");
    const retirar = [...activeRefs, ...depletedRefs].filter((r) => r.supplyAction === "RETIRAR_MOSTRARIO");
    // Lines that would lose coverage
    const linesAtRisk: { line: string; currentPct: number; projectedPct: number }[] = [];
    for (const [line, cov] of coverageByLine.entries()) {
      if (cov.total === 0) continue;
      const atRiskInLine = atRisk.filter((r) => r.line === line).length;
      if (atRiskInLine > 0 && cov.missing > 0) {
        const worstCase = Math.max(0, cov.pct - Math.round((atRiskInLine / Math.max(cov.total, 1)) * 100));
        linesAtRisk.push({ line, currentPct: cov.pct, projectedPct: worstCase });
      }
    }
    return { atRisk: atRisk.length, retirar: retirar.length, linesAtRisk };
  }, [activeRefs, depletedRefs, coverageByLine]);

  if (impacts.atRisk === 0 && impacts.retirar === 0) {
    return (
      <div style={{
        padding: `${S[3]}px`, fontFamily: T.mono, fontSize: 10, color: C.green,
        background: C.greenLight, borderRadius: R.md, border: `1px solid ${C.greenBorder}`,
      }}>
        Sin riesgo operativo inmediato
      </div>
    );
  }

  return (
    <div style={{
      padding: `${S[3]}px`, background: C.redLight,
      border: `1px solid ${C.redBorder}`, borderRadius: R.md,
      display: "flex", flexDirection: "column", gap: S[1],
    }}>
      <div style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700, color: C.red, marginBottom: 2 }}>
        Si no se realizan las acciones pendientes:
      </div>
      {impacts.atRisk > 0 && (
        <div style={{ fontFamily: T.mono, fontSize: 10, color: C.ink }}>
          • {impacts.atRisk} referencia{impacts.atRisk !== 1 ? "s" : ""} en riesgo de agotamiento
        </div>
      )}
      {impacts.retirar > 0 && (
        <div style={{ fontFamily: T.mono, fontSize: 10, color: C.ink }}>
          • {impacts.retirar} referencia{impacts.retirar !== 1 ? "s" : ""} deber{impacts.retirar !== 1 ? "an" : "a"} salir del mostrario
        </div>
      )}
      {impacts.linesAtRisk.map(({ line, currentPct, projectedPct }) => (
        <div key={line} style={{ fontFamily: T.mono, fontSize: 10, color: C.ink }}>
          • {DERROTERO_LINE_LABEL[line] ?? line} reducira su cobertura de {currentPct}% a ~{projectedPct}%
        </div>
      ))}
    </div>
  );
}

// ── LineActionSummary ────────────────────────────────────────────────────────

function LineActionSummary({ activeRefs, depletedRefs }: { activeRefs: VendorSampleRef[]; depletedRefs: VendorSampleRef[] }) {
  const allRefs = useMemo(() => [...activeRefs, ...depletedRefs], [activeRefs, depletedRefs]);
  const byLine = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const ref of allRefs) {
      if (!ref.supplyAction) continue;
      if (!map.has(ref.line)) map.set(ref.line, new Map());
      const lineMap = map.get(ref.line)!;
      lineMap.set(ref.supplyAction, (lineMap.get(ref.supplyAction) ?? 0) + 1);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [allRefs]);

  if (byLine.length === 0) return null;

  const shortLabel: Record<string, string> = {
    REEMPLAZAR_BODEGA: "Bodega",
    COMPLETAR_DESDE_OP: "OP",
    PRODUCCION_SUGERIDA: "Produccion",
    RECOMPRA_SUGERIDA: "Recompra",
    RETIRAR_MOSTRARIO: "Retirar",
  };

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: S[2],
      padding: `${S[3]}px`, background: C.white,
      border: `1px solid ${C.line}`, borderRadius: R.md,
    }}>
      {byLine.map(([line, actions]) => (
        <div key={line}>
          <div style={{ fontFamily: T.mono, fontSize: 10, fontWeight: 700, color: C.titleDeep, marginBottom: S[1] }}>
            {DERROTERO_LINE_LABEL[line] ?? line}
          </div>
          <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
            {[...actions.entries()].map(([action, count]) => (
              <span key={action} style={{
                fontFamily: T.mono, fontSize: 9, color: SUPPLY_ACTION_COLOR[action] ?? C.ink,
                padding: "1px 6px",
                background: (SUPPLY_ACTION_COLOR[action] ?? C.inkFaint) + "10",
                borderRadius: R.sm,
              }}>
                {shortLabel[action] ?? action}: {count}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── CommercialDecisionCenter (main) ──────────────────────────────────────────

function CommercialDecisionCenter({ activeRefs, depletedRefs, coverageByLine, derroteroRules, onNavigate }: DecisionCenterProps) {
  const sectionTitle = (title: string) => (
    <div style={{
      fontFamily: T.mono, fontSize: 10, fontWeight: 700,
      color: C.inkFaint, textTransform: "uppercase" as const,
      letterSpacing: "0.08em", marginBottom: S[2],
      paddingBottom: S[2],
      borderBottom: `1px solid ${C.line}`,
    }}>
      {title}
    </div>
  );

  const handleCoverageClick = useCallback((line: string) => {
    onNavigate?.({ tab: "derrotero", line });
  }, [onNavigate]);

  const handleActionClick = useCallback((action: string) => {
    // Navigate to referencias tab — the action type maps to a state filter
    // RETIRAR_MOSTRARIO refs are in depletedRefs, others in activeRefs
    onNavigate?.({ tab: "referencias" });
  }, [onNavigate]);

  const handleSubgroupClick = useCallback((line: string) => {
    onNavigate?.({ tab: "derrotero", line });
  }, [onNavigate]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[4], padding: `${S[2]}px 0` }}>

      {/* ── Cobertura por linea (circular indicators) ── */}
      <div>
        {sectionTitle("Cobertura por linea")}
        <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
          {[...coverageByLine.entries()].map(([line, cov]) => (
            <CoverageCircle key={line} line={line} cov={cov} onClick={() => handleCoverageClick(line)} />
          ))}
        </div>
      </div>

      {/* ── Acciones prioritarias ── */}
      <div>
        {sectionTitle("Acciones prioritarias")}
        <PriorityActionsCard activeRefs={activeRefs} depletedRefs={depletedRefs} onActionClick={handleActionClick} />
      </div>

      {/* ── Subgrupos pendientes ── */}
      <div>
        {sectionTitle("Subgrupos pendientes")}
        <PendingSubgroupsCard derroteroRules={derroteroRules} activeRefs={activeRefs} onSubgroupClick={handleSubgroupClick} />
      </div>

      {/* ── Impacto operativo ── */}
      <div>
        {sectionTitle("Impacto operativo")}
        <OperationalImpactCard activeRefs={activeRefs} depletedRefs={depletedRefs} coverageByLine={coverageByLine} />
      </div>

      {/* ── Acciones por linea ── */}
      <div>
        {sectionTitle("Acciones por linea")}
        <LineActionSummary activeRefs={activeRefs} depletedRefs={depletedRefs} />
      </div>

    </div>
  );
}

// ── Production Detail Drawer Content ─────────────────────────────────────────

function ProductionDetailDrawer({
  item,
  vendors,
}: {
  item: ProductionSuggestion;
  vendors: VendorSampleSnapshot[];
}) {
  const affectedNames = item.affectedVendors.slice(0, 10);
  const affectedCount = item.affectedVendors.length;
  const evidenceRefs = item.evidenceRefs ?? [];

  const kpiRow: React.CSSProperties = {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: `${S[2]}px 0`, borderBottom: `1px solid ${C.lineSubtle}`,
  };
  const kpiLabel: React.CSSProperties = {
    fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight,
  };
  const kpiValue: React.CSSProperties = {
    fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.ink,
  };

  return (
    <div style={{ padding: S[4], display: "flex", flexDirection: "column", gap: S[4] }}>
      {/* Identity — subgroup is primary */}
      <div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: 700, color: C.titleDeep }}>
          {item.subgrupoSag}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight, marginTop: 2 }}>
          Linea: {item.line}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ background: C.surface, borderRadius: R.md, padding: S[3], border: `1px solid ${C.line}` }}>
        <div style={kpiRow}><span style={kpiLabel}>Subgrupo SAG</span><span style={kpiValue}>{item.subgrupoSag}</span></div>
        <div style={kpiRow}><span style={kpiLabel}>Linea</span><span style={kpiValue}>{item.line}</span></div>
        <div style={kpiRow}><span style={kpiLabel}>Disponible total subgrupo</span><span style={{ ...kpiValue, color: item.centralAvailable <= 0 ? C.red : C.amber }}>{item.centralAvailable <= 0 ? "\u2014" : item.centralAvailable}</span></div>
        <div style={kpiRow}><span style={kpiLabel}>Requerido para cobertura</span><span style={kpiValue}>{item.minimumRequired}</span></div>
        <div style={kpiRow}><span style={kpiLabel}>Faltante</span><span style={{ ...kpiValue, color: C.red }}>{item.shortfall}</span></div>
        <div style={kpiRow}><span style={kpiLabel}>Cantidad sugerida a producir</span><span style={{ ...kpiValue, color: C.blueDark }}>{item.suggestedQty}</span></div>
        <div style={{ ...kpiRow, borderBottom: "none" }}>
          <span style={kpiLabel}>Urgencia</span>
          <span style={{
            fontFamily: T.mono, fontSize: 9, fontWeight: 700,
            color: URGENCY_COLOR[item.urgency] ?? C.inkFaint,
            background: item.urgency === "alta" ? C.redLight : item.urgency === "media" ? C.amberLight : C.surfaceAlt,
            padding: "2px 10px", borderRadius: R.pill,
            textTransform: "uppercase" as const,
          }}>
            {item.urgency}
          </span>
        </div>
      </div>

      {/* Explanation */}
      <div style={{ background: C.blueLight, borderRadius: R.md, padding: S[3], border: `1px solid ${C.blueBorder}` }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.blueDark, marginBottom: S[2] }}>
          Por que se sugiere producir este subgrupo
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, lineHeight: 1.6 }}>
          El subgrupo <strong>{item.subgrupoSag}</strong> no tiene suficiente inventario disponible en bodega central para cubrir la demanda de <strong>{affectedCount}</strong> maleta{affectedCount !== 1 ? "s" : ""}.
          {item.centralAvailable <= 0
            ? " El inventario central del subgrupo esta agotado."
            : ` Solo quedan ${item.centralAvailable} unidades disponibles del subgrupo, pero se requieren al menos ${item.minimumRequired} para cubrir la operacion.`
          }
        </div>
        <div style={{
          fontFamily: T.mono, fontSize: T.sz.xs, color: C.blueDark, lineHeight: 1.6,
          marginTop: S[2], padding: S[2], background: C.white, borderRadius: R.sm, border: `1px solid ${C.blueBorder}`,
        }}>
          No se recomienda producir necesariamente la misma referencia. Se recomienda producir unidades nuevas del mismo subgrupo para recuperar cobertura comercial en maletas.
        </div>
      </div>

      {/* Evidence refs */}
      {evidenceRefs.length > 0 && (
        <div style={{ background: C.surface, borderRadius: R.md, padding: S[3], border: `1px solid ${C.line}` }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.ink, marginBottom: S[2] }}>
            Referencias evidencia ({evidenceRefs.length})
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginBottom: S[2] }}>
            Estas referencias son evidencia del deficit, no necesariamente lo que debe producirse.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {evidenceRefs.map(ev => (
              <div key={ev.reference} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: `4px ${S[2]}px`, background: C.white, borderRadius: R.sm,
                border: `1px solid ${C.lineSubtle}`,
              }}>
                <div>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.ink }}>{ev.reference}</span>
                  <span style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint, marginLeft: S[2] }}>{ev.description}</span>
                </div>
                <span style={{
                  fontFamily: T.mono, fontSize: 10, fontWeight: 600,
                  color: ev.available <= 0 ? C.red : C.amber,
                }}>
                  {ev.available <= 0 ? "\u2014" : ev.available}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Affected maletas */}
      <div style={{ background: C.surface, borderRadius: R.md, padding: S[3], border: `1px solid ${C.line}` }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.ink, marginBottom: S[2] }}>
          Maletas afectadas ({affectedCount})
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {affectedNames.map(name => (
            <span key={name} style={{
              fontFamily: T.mono, fontSize: 10, fontWeight: 600,
              color: C.amber, background: C.amberLight,
              padding: "2px 8px", borderRadius: R.pill,
              border: `1px solid ${C.amberBorder}`,
            }}>
              {name}
            </span>
          ))}
          {affectedCount > 10 && (
            <span style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint }}>
              +{affectedCount - 10} mas
            </span>
          )}
        </div>
      </div>

      {/* Replacement context */}
      <div style={{ background: C.amberLight, borderRadius: R.md, padding: S[3], border: `1px solid ${C.amberBorder}` }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.amber, marginBottom: S[1] }}>
          Se produce para reemplazar faltantes del subgrupo: {item.subgrupoSag}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, lineHeight: 1.6 }}>
          No hay suficiente inventario central del subgrupo para reemplazar referencias agotadas o en riesgo dentro de maletas.
          La produccion cubre el deficit de <strong>{item.shortfall}</strong> unidades que no pueden ser surtidas desde bodega central.
        </div>
      </div>
    </div>
  );
}

// ── Gap Action Drawer Content ────────────────────────────────────────────────

function GapActionDrawer({
  gap,
  candidates,
  step,
  selectedVendor,
  selectedRefOut,
  qty,
  onSelectVendor,
  onSelectRefOut,
  onChangeQty,
  onConfirm,
  onPrint,
  onClose,
  guides,
}: {
  gap: CoverageGapRef;
  candidates: MaletaCandidate[];
  step: "select_maleta" | "select_ref_out" | "confirm" | "done";
  selectedVendor: string | null;
  selectedRefOut: string | null;
  qty: number;
  onSelectVendor: (id: string) => void;
  onSelectRefOut: (ref: string) => void;
  onChangeQty: (q: number) => void;
  onConfirm: () => void;
  onPrint: (guide: MaletaSurtidoGuide) => void;
  onClose: () => void;
  guides: MaletaSurtidoGuide[];
}) {
  const selected = candidates.find(c => c.vendorId === selectedVendor);
  const latestGuide = guides.length > 0 ? guides[guides.length - 1] : null;

  const inputStyle: React.CSSProperties = {
    fontFamily: T.mono, fontSize: T.sz.xs, padding: `${S[1]}px ${S[2]}px`,
    border: `1px solid ${C.line}`, borderRadius: R.sm, background: C.white,
    color: C.ink, width: 60, textAlign: "center",
  };

  return (
    <div style={{ padding: S[4], display: "flex", flexDirection: "column", gap: S[4] }}>
      {/* Reference info */}
      <div style={{ background: C.blueLight, borderRadius: R.md, padding: S[3], border: `1px solid ${C.blueBorder}` }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.blueDark }}>{gap.reference}</div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, marginTop: 2 }}>{gap.description}</div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, marginTop: 2 }}>
          {gap.subgrupoSag ?? gap.line} · Disponible: {gap.centralAvailable}
        </div>
      </div>

      {/* Step 1: Select maleta */}
      {(step === "select_maleta" || step === "select_ref_out" || step === "confirm") && (
        <div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.ink, marginBottom: S[2] }}>
            1. Elegir maleta / vendedor
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: S[1] }}>
            {candidates.map(c => (
              <button key={c.vendorId} onClick={() => onSelectVendor(c.vendorId)} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: S[2], borderRadius: R.sm, cursor: "pointer",
                background: c.vendorId === selectedVendor ? C.blueLight : C.white,
                border: `1px solid ${c.vendorId === selectedVendor ? C.blueBorder : C.line}`,
                textAlign: "left" as const,
              }}>
                <div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600, color: C.ink }}>{c.vendorName}</div>
                  <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint }}>
                    Bodega: {c.warehouseCode} · Cobertura: {c.currentCoverage}% · Riesgo: {c.refsAtRisk}
                  </div>
                </div>
                {c.replaceableRefs.length > 0 && (
                  <span style={{
                    fontFamily: T.mono, fontSize: 9, fontWeight: 600,
                    color: C.amber, background: C.amberLight,
                    padding: "1px 6px", borderRadius: R.pill,
                    border: `1px solid ${C.amberBorder}`,
                  }}>
                    {c.replaceableRefs.length} reemplazables
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Select ref out */}
      {selected && (step === "select_ref_out" || step === "confirm") && (
        <div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.ink, marginBottom: S[2] }}>
            2. Referencia que sale (opcional)
          </div>
          {selected.replaceableRefs.length === 0 ? (
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, padding: S[2] }}>
              Sin referencias reemplazables. Se agregara sin retirar otra.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: S[1] }}>
              <button onClick={() => onSelectRefOut("")} style={{
                padding: S[2], borderRadius: R.sm, cursor: "pointer",
                background: selectedRefOut === "" ? C.blueLight : C.white,
                border: `1px solid ${selectedRefOut === "" ? C.blueBorder : C.line}`,
                fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, textAlign: "left" as const,
              }}>
                Ninguna (agregar sin retirar)
              </button>
              {selected.replaceableRefs.map(r => (
                <button key={r.reference} onClick={() => onSelectRefOut(r.reference)} style={{
                  padding: S[2], borderRadius: R.sm, cursor: "pointer",
                  background: selectedRefOut === r.reference ? C.blueLight : C.white,
                  border: `1px solid ${selectedRefOut === r.reference ? C.blueBorder : C.line}`,
                  textAlign: "left" as const,
                }}>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600, color: C.ink }}>{r.reference}</div>
                  <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint }}>{r.description} · {r.reason}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 3: Confirm */}
      {step === "confirm" && (
        <div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.ink, marginBottom: S[2] }}>
            3. Confirmar
          </div>
          <div style={{ background: C.surface, borderRadius: R.md, padding: S[3], border: `1px solid ${C.line}`, marginBottom: S[2] }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>
              <strong>Entra:</strong> {gap.reference} ({gap.description})
            </div>
            {selectedRefOut && (
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, marginTop: 4 }}>
                <strong>Sale:</strong> {selectedRefOut}
              </div>
            )}
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, marginTop: 4 }}>
              <strong>Maleta:</strong> {selected?.vendorName}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: S[2], marginTop: S[2] }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>Cantidad:</span>
              <input type="number" value={qty} onChange={e => onChangeQty(Math.max(1, Number(e.target.value)))} min={1} style={inputStyle} />
            </div>
          </div>
          <button onClick={onConfirm} style={{
            fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700,
            color: C.white, background: C.blueDark,
            border: "none", borderRadius: R.sm,
            padding: `${S[2]}px ${S[4]}px`, cursor: "pointer", width: "100%",
          }}>
            Agregar al plan de surtido
          </button>
        </div>
      )}

      {/* Step 4: Done — added to plan */}
      {step === "done" && (
        <div>
          <div style={{ background: C.greenLight, borderRadius: R.md, padding: S[3], border: `1px solid ${C.greenBorder}`, marginBottom: S[3] }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.green }}>
              Agregado al plan de surtido
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, marginTop: 4 }}>
              {selectedVendor ? `Maleta: ${candidates.find(c => c.vendorId === selectedVendor)?.vendorName ?? selectedVendor}` : ""}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: 2 }}>
              Puedes seguir agregando oportunidades al mismo plan antes de generar el documento.
            </div>
          </div>
          <div style={{ display: "flex", gap: S[2] }}>
            <button onClick={onClose} style={{
              fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700,
              color: C.blueDark, background: C.blueLight,
              border: `1px solid ${C.blueBorder}`, borderRadius: R.sm,
              padding: `${S[2]}px ${S[3]}px`, cursor: "pointer", flex: 1,
            }}>
              Seguir agregando
            </button>
            <button onClick={onClose} style={{
              fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600,
              color: C.inkLight, background: "transparent",
              border: `1px solid ${C.line}`, borderRadius: R.sm,
              padding: `${S[2]}px ${S[3]}px`, cursor: "pointer", flex: 1,
            }}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Print Guide Overlay ──────────────────────────────────────────────────────

function PrintGuideOverlay({
  guide,
  onClose,
}: {
  guide: MaletaSurtidoGuide;
  onClose: () => void;
}) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (printRef.current) {
      const w = window.open("", "_blank");
      if (!w) return;
      w.document.write(`
        <html><head><title>Guia de Surtido ${guide.documentNumber}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: monospace; font-size: 12px; padding: 24px; color: #111; }
          h1 { font-size: 16px; margin-bottom: 4px; }
          h2 { font-size: 13px; margin: 16px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
          table { width: 100%; border-collapse: collapse; margin: 8px 0; }
          th, td { border: 1px solid #ccc; padding: 4px 8px; text-align: left; font-size: 11px; }
          th { background: #f5f5f5; font-weight: 700; }
          .sig { margin-top: 40px; display: flex; gap: 40px; }
          .sig-box { flex: 1; border-top: 1px solid #111; padding-top: 4px; text-align: center; font-size: 11px; }
          @media print { body { padding: 12px; } }
        </style></head><body>
        ${printRef.current.innerHTML}
        </body></html>
      `);
      w.document.close();
      w.print();
    }
  };

  const refsIn = guide.reservations.filter(r => r.refIn);
  const refsOut = guide.reservations.filter(r => r.refOut);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: C.white, borderRadius: R.lg,
        width: "90%", maxWidth: 700, maxHeight: "90vh",
        overflow: "auto", padding: S[6],
        boxShadow: `0 16px 48px rgba(0,0,0,0.2)`,
      }}>
        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: S[4] }}>
          <button onClick={handlePrint} style={{
            fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700,
            color: C.white, background: C.blueDark,
            border: "none", borderRadius: R.sm,
            padding: `${S[2]}px ${S[4]}px`, cursor: "pointer",
          }}>
            Imprimir
          </button>
          <button onClick={onClose} style={{
            fontFamily: T.mono, fontSize: T.sz.xs,
            color: C.inkLight, background: "transparent",
            border: `1px solid ${C.line}`, borderRadius: R.sm,
            padding: `${S[2]}px ${S[3]}px`, cursor: "pointer",
          }}>
            Cerrar
          </button>
        </div>

        {/* Printable content */}
        <div ref={printRef}>
          <h1 style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: 700, color: C.titleDeep }}>
            Guia de Surtido de Maleta
          </h1>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginBottom: S[3] }}>
            {guide.documentNumber} · {guide.date}
          </div>

          {/* Vendor data */}
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, marginBottom: S[3], lineHeight: 1.8 }}>
            <div><strong>Vendedor:</strong> {guide.vendorName}</div>
            <div><strong>Bodega:</strong> {guide.warehouseCode}</div>
            <div><strong>Estado:</strong> {RESERVATION_STATUS_LABEL[guide.status]}</div>
          </div>

          {/* References to send */}
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.ink, marginBottom: S[1], borderBottom: `1px solid ${C.line}`, paddingBottom: 4 }}>
            Referencias a enviar
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: S[4], fontFamily: T.mono, fontSize: T.sz.xs }}>
            <thead>
              <tr style={{ background: C.surfaceAlt }}>
                <th style={{ border: `1px solid ${C.line}`, padding: "4px 8px", textAlign: "left" }}>Referencia</th>
                <th style={{ border: `1px solid ${C.line}`, padding: "4px 8px", textAlign: "left" }}>Descripcion</th>
                <th style={{ border: `1px solid ${C.line}`, padding: "4px 8px", textAlign: "center" }}>Cantidad</th>
              </tr>
            </thead>
            <tbody>
              {refsIn.map(r => (
                <tr key={r.id}>
                  <td style={{ border: `1px solid ${C.line}`, padding: "4px 8px", fontWeight: 700 }}>{r.refIn}</td>
                  <td style={{ border: `1px solid ${C.line}`, padding: "4px 8px" }}>{r.refInDescription}</td>
                  <td style={{ border: `1px solid ${C.line}`, padding: "4px 8px", textAlign: "center" }}>{r.refInQty}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* References to withdraw */}
          {refsOut.length > 0 && (
            <>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.ink, marginBottom: S[1], borderBottom: `1px solid ${C.line}`, paddingBottom: 4 }}>
                Referencias a retirar
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: S[4], fontFamily: T.mono, fontSize: T.sz.xs }}>
                <thead>
                  <tr style={{ background: C.surfaceAlt }}>
                    <th style={{ border: `1px solid ${C.line}`, padding: "4px 8px", textAlign: "left" }}>Referencia</th>
                    <th style={{ border: `1px solid ${C.line}`, padding: "4px 8px", textAlign: "left" }}>Descripcion</th>
                    <th style={{ border: `1px solid ${C.line}`, padding: "4px 8px", textAlign: "center" }}>Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {refsOut.map(r => (
                    <tr key={r.id}>
                      <td style={{ border: `1px solid ${C.line}`, padding: "4px 8px", fontWeight: 700 }}>{r.refOut}</td>
                      <td style={{ border: `1px solid ${C.line}`, padding: "4px 8px" }}>{r.refOutDescription}</td>
                      <td style={{ border: `1px solid ${C.line}`, padding: "4px 8px", textAlign: "center" }}>{r.refOutQty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* Motivo */}
          {guide.reservations.length > 0 && (
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, marginBottom: S[4] }}>
              <strong>Motivo:</strong> {guide.reservations[0].reason}
            </div>
          )}

          {/* Signatures */}
          <div style={{ display: "flex", gap: 40, marginTop: 48 }}>
            <div style={{ flex: 1, borderTop: `1px solid ${C.ink}`, paddingTop: 4, textAlign: "center" }}>
              <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint }}>Firma entrega</div>
            </div>
            <div style={{ flex: 1, borderTop: `1px solid ${C.ink}`, paddingTop: 4, textAlign: "center" }}>
              <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint }}>Firma recibe</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Plan Drawer Content (MALETAS-BULK-REPLENISHMENT-01) ──────────────────────

function PlanDrawerContent({
  vendorId,
  plans,
  vendors,
  onRemoveItem,
  onGenerateDocument,
  onUpdateStatus,
  onPrint,
}: {
  vendorId: string;
  plans: MaletaReplenishmentPlan[];
  vendors: VendorSampleSnapshot[];
  onRemoveItem: (planId: string, itemId: string) => void;
  onGenerateDocument: (planId: string) => void;
  onUpdateStatus: (planId: string, status: ReplenishmentPlanStatus) => void;
  onPrint: (plan: MaletaReplenishmentPlan) => void;
}) {
  const vendor = vendors.find(v => v.vendorId === vendorId);
  const vendorPlans = plans.filter(p => p.vendorId === vendorId).sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  const draftPlan = vendorPlans.find(p => p.status === "draft");
  const otherPlans = vendorPlans.filter(p => p.status !== "draft");

  const planStatusBadge = (status: ReplenishmentPlanStatus) => {
    const c = status === "draft" ? C.blueDark
      : status === "pending_warehouse" ? C.amber
      : status === "shipped" ? C.blueDark
      : status === "received" ? C.green
      : status === "cancelled" ? C.inkFaint
      : C.inkFaint;
    const bg = status === "draft" ? C.blueLight
      : status === "pending_warehouse" ? C.amberLight
      : status === "shipped" ? C.blueLight
      : status === "received" ? C.greenLight
      : C.surfaceAlt;
    return (
      <span style={{
        fontFamily: T.mono, fontSize: 9, fontWeight: 700,
        color: c, background: bg,
        padding: "2px 10px", borderRadius: R.pill,
        textTransform: "uppercase" as const,
        display: "inline-flex", alignItems: "center",
      }}>
        {PLAN_STATUS_LABEL[status]}
      </span>
    );
  };

  const renderPlanSection = (plan: MaletaReplenishmentPlan) => {
    const recovery = computeCoverageRecovery(plan.items);
    const subgroups = [...new Set(plan.items.map(i => i.subgroupSag))];
    const isDraft = plan.status === "draft";
    const canGenerate = isDraft && plan.items.length > 0;
    const canShip = plan.status === "pending_warehouse";
    const canReceive = plan.status === "shipped";

    return (
      <div key={plan.id} style={{
        background: C.white,
        borderRadius: R.lg,
        border: `1px solid ${isDraft ? C.blueBorder : C.line}`,
        overflow: "hidden",
        marginBottom: S[4],
      }}>
        {/* Plan header */}
        <div style={{
          padding: S[4],
          background: isDraft ? C.blueLight : C.surfaceAlt,
          borderBottom: `1px solid ${C.line}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.titleDeep }}>
              {isDraft ? "Plan activo" : plan.documentNumber ?? plan.id.slice(0, 12)}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: 2 }}>
              {plan.items.length} cambio{plan.items.length !== 1 ? "s" : ""} · {formatDate(plan.updatedAt)}
            </div>
          </div>
          {planStatusBadge(plan.status)}
        </div>

        {/* Summary strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: S[2], padding: S[3] }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.green }}>{recovery.addedRefs}</div>
            <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>Entran</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.red }}>{recovery.removedRefs}</div>
            <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>Salen</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.blueDark }}>{subgroups.length}</div>
            <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>Subgrupos</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.green }}>+{recovery.estimatedCoverageGain}</div>
            <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>Cobertura</div>
          </div>
        </div>

        {/* Items table */}
        {plan.items.length > 0 && (
          <div style={{ padding: `0 ${S[3]} ${S[3]}` }}>
            <div style={{ fontFamily: T.mono, fontSize: 10, fontWeight: 700, color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: S[2] }}>
              Detalle de cambios
            </div>

            {/* Entran */}
            <div style={{
              fontFamily: T.mono, fontSize: 10, fontWeight: 600,
              color: C.green, marginBottom: S[1],
              display: "flex", alignItems: "center", gap: S[1],
            }}>
              <span style={{ width: 6, height: 6, borderRadius: R.pill, background: C.green, display: "inline-block" }} />
              Referencias que entran
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: S[3], fontFamily: T.mono, fontSize: T.sz.xs }}>
              <thead>
                <tr style={{ background: C.surfaceAlt }}>
                  <th style={{ border: `1px solid ${C.line}`, padding: "4px 8px", textAlign: "left" }}>Referencia</th>
                  <th style={{ border: `1px solid ${C.line}`, padding: "4px 8px", textAlign: "left" }}>Descripcion</th>
                  <th style={{ border: `1px solid ${C.line}`, padding: "4px 8px", textAlign: "left" }}>Subgrupo</th>
                  <th style={{ border: `1px solid ${C.line}`, padding: "4px 8px", textAlign: "center" }}>Cant</th>
                  {isDraft && <th style={{ border: `1px solid ${C.line}`, padding: "4px 8px", textAlign: "center" }}></th>}
                </tr>
              </thead>
              <tbody>
                {plan.items.map(item => (
                  <tr key={item.id}>
                    <td style={{ border: `1px solid ${C.line}`, padding: "4px 8px", fontWeight: 700 }}>{item.addedReference}</td>
                    <td style={{ border: `1px solid ${C.line}`, padding: "4px 8px" }}>{item.addedDescription}</td>
                    <td style={{ border: `1px solid ${C.line}`, padding: "4px 8px", color: C.inkFaint }}>{item.subgroupSag}</td>
                    <td style={{ border: `1px solid ${C.line}`, padding: "4px 8px", textAlign: "center" }}>{item.quantity}</td>
                    {isDraft && (
                      <td style={{ border: `1px solid ${C.line}`, padding: "4px 4px", textAlign: "center" }}>
                        <button onClick={() => onRemoveItem(plan.id, item.id)} style={{
                          fontFamily: T.mono, fontSize: 9, color: C.red, background: "transparent",
                          border: "none", cursor: "pointer", padding: 2,
                        }}>
                          Quitar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Salen */}
            {plan.items.some(i => i.removedReference) && (
              <>
                <div style={{
                  fontFamily: T.mono, fontSize: 10, fontWeight: 600,
                  color: C.red, marginBottom: S[1],
                  display: "flex", alignItems: "center", gap: S[1],
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: R.pill, background: C.red, display: "inline-block" }} />
                  Referencias que salen
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: S[3], fontFamily: T.mono, fontSize: T.sz.xs }}>
                  <thead>
                    <tr style={{ background: C.surfaceAlt }}>
                      <th style={{ border: `1px solid ${C.line}`, padding: "4px 8px", textAlign: "left" }}>Referencia</th>
                      <th style={{ border: `1px solid ${C.line}`, padding: "4px 8px", textAlign: "left" }}>Descripcion</th>
                      <th style={{ border: `1px solid ${C.line}`, padding: "4px 8px", textAlign: "center" }}>Cant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.items.filter(i => i.removedReference).map(item => (
                      <tr key={item.id}>
                        <td style={{ border: `1px solid ${C.line}`, padding: "4px 8px", fontWeight: 700 }}>{item.removedReference}</td>
                        <td style={{ border: `1px solid ${C.line}`, padding: "4px 8px" }}>{item.removedDescription ?? "\u2014"}</td>
                        <td style={{ border: `1px solid ${C.line}`, padding: "4px 8px", textAlign: "center" }}>{item.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ padding: `0 ${S[3]} ${S[3]}`, display: "flex", gap: S[2], flexWrap: "wrap" }}>
          {canGenerate && (
            <button onClick={() => onGenerateDocument(plan.id)} style={{
              fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700,
              color: C.white, background: C.blueDark,
              border: "none", borderRadius: R.sm,
              padding: `${S[2]}px ${S[4]}px`, cursor: "pointer",
            }}>
              Generar documento de surtido
            </button>
          )}
          {canShip && (
            <button onClick={() => onUpdateStatus(plan.id, "shipped")} style={{
              fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700,
              color: C.white, background: C.blueDark,
              border: "none", borderRadius: R.sm,
              padding: `${S[2]}px ${S[4]}px`, cursor: "pointer",
            }}>
              Marcar como enviado
            </button>
          )}
          {canReceive && (
            <button onClick={() => onUpdateStatus(plan.id, "received")} style={{
              fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700,
              color: C.white, background: C.green,
              border: "none", borderRadius: R.sm,
              padding: `${S[2]}px ${S[4]}px`, cursor: "pointer",
            }}>
              Marcar como recibido
            </button>
          )}
          {plan.documentNumber && (
            <button onClick={() => onPrint(plan)} style={{
              fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600,
              color: C.blueDark, background: C.blueLight,
              border: `1px solid ${C.blueBorder}`, borderRadius: R.sm,
              padding: `${S[2]}px ${S[3]}px`, cursor: "pointer",
            }}>
              Imprimir
            </button>
          )}
          {isDraft && plan.items.length > 0 && (
            <button onClick={() => onUpdateStatus(plan.id, "cancelled")} style={{
              fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600,
              color: C.red, background: "transparent",
              border: `1px solid ${C.redBorder}`, borderRadius: R.sm,
              padding: `${S[2]}px ${S[3]}px`, cursor: "pointer",
            }}>
              Cancelar plan
            </button>
          )}
        </div>

        {/* Events / traceability */}
        {plan.events.length > 0 && (
          <div style={{ padding: `${S[2]} ${S[3]} ${S[3]}`, borderTop: `1px solid ${C.line}` }}>
            <div style={{ fontFamily: T.mono, fontSize: 10, fontWeight: 700, color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: S[2] }}>
              Trazabilidad
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {plan.events.map(evt => (
                <div key={evt.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: `2px ${S[2]}`, background: C.surfaceAlt, borderRadius: R.sm,
                }}>
                  <span style={{ fontFamily: T.mono, fontSize: 10, color: C.ink }}>{evt.description}</span>
                  <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>{formatTime(evt.timestamp)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: S[4], display: "flex", flexDirection: "column", gap: S[4] }}>
      {/* Vendor header */}
      <div style={{
        padding: S[3], background: C.blueLight, borderRadius: R.md,
        border: `1px solid ${C.blueBorder}`,
      }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.blueDark }}>
          {vendor?.vendorName ?? vendorId}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: 2 }}>
          Bodega B{vendor?.warehouseCode ?? "?"} · {vendor?.totalRefs ?? 0} referencias
        </div>
      </div>

      {/* Draft plan */}
      {draftPlan && renderPlanSection(draftPlan)}

      {/* Empty state */}
      {!draftPlan && otherPlans.length === 0 && (
        <div style={{
          padding: S[5], textAlign: "center",
          fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
          background: C.surfaceAlt, borderRadius: R.md,
        }}>
          Sin planes de surtido. Agrega oportunidades desde la tabla de cobertura.
        </div>
      )}

      {/* Other plans */}
      {otherPlans.length > 0 && (
        <div>
          <div style={{
            fontFamily: T.mono, fontSize: 10, fontWeight: 700, color: C.inkFaint,
            textTransform: "uppercase" as const, letterSpacing: "0.08em",
            marginBottom: S[3], paddingBottom: S[2], borderBottom: `1px solid ${C.line}`,
          }}>
            Planes anteriores ({otherPlans.length})
          </div>
          {otherPlans.map(p => renderPlanSection(p))}
        </div>
      )}
    </div>
  );
}

// ── History Drawer Content ───────────────────────────────────────────────────

function HistoryDrawerContent({
  plans,
  statusFilter,
  vendorFilter,
  vendors,
  onStatusFilter,
  onVendorFilter,
  onOpenPlan,
  onPrint,
}: {
  plans: MaletaReplenishmentPlan[];
  statusFilter: ReplenishmentPlanStatus | "all";
  vendorFilter: string | null;
  vendors: VendorSampleSnapshot[];
  onStatusFilter: (f: ReplenishmentPlanStatus | "all") => void;
  onVendorFilter: (v: string | null) => void;
  onOpenPlan: (planId: string) => void;
  onPrint: (plan: MaletaReplenishmentPlan) => void;
}) {
  const filtered = plans
    .filter(p => statusFilter === "all" || p.status === statusFilter)
    .filter(p => !vendorFilter || p.vendorId === vendorFilter)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const allStatuses: (ReplenishmentPlanStatus | "all")[] = ["all", "draft", "pending_warehouse", "prepared", "shipped", "received", "cancelled"];
  const statusLabels: Record<string, string> = { all: "Todos", ...PLAN_STATUS_LABEL };

  return (
    <div style={{ padding: S[4], display: "flex", flexDirection: "column", gap: S[4] }}>
      {/* Filters */}
      <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
        {allStatuses.map(s => {
          const count = s === "all" ? plans.length : plans.filter(p => p.status === s).length;
          if (s !== "all" && count === 0) return null;
          const active = statusFilter === s;
          return (
            <button key={s} onClick={() => onStatusFilter(s)} style={{
              fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: active ? 700 : 500,
              padding: "0 12px", height: 28, lineHeight: 1,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              background: active ? C.blueDark : C.white,
              color: active ? C.white : C.ink,
              border: `1px solid ${active ? C.blueDark : C.line}`,
              borderRadius: R.pill, cursor: "pointer",
              whiteSpace: "nowrap" as const,
            }}>
              {statusLabels[s]} ({count})
            </button>
          );
        })}
      </div>

      {/* Vendor filter */}
      <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
        <button onClick={() => onVendorFilter(null)} style={{
          fontFamily: T.mono, fontSize: 10, fontWeight: !vendorFilter ? 700 : 500,
          padding: "0 8px", height: 24,
          background: !vendorFilter ? C.blueDark : C.white,
          color: !vendorFilter ? C.white : C.inkFaint,
          border: `1px solid ${!vendorFilter ? C.blueDark : C.line}`,
          borderRadius: R.pill, cursor: "pointer",
        }}>
          Todos
        </button>
        {vendors.filter(v => v.totalRefs > 0).map(v => {
          const active = vendorFilter === v.vendorId;
          return (
            <button key={v.vendorId} onClick={() => onVendorFilter(v.vendorId)} style={{
              fontFamily: T.mono, fontSize: 10, fontWeight: active ? 700 : 500,
              padding: "0 8px", height: 24,
              background: active ? C.blueDark : C.white,
              color: active ? C.white : C.inkFaint,
              border: `1px solid ${active ? C.blueDark : C.line}`,
              borderRadius: R.pill, cursor: "pointer",
            }}>
              {v.vendorName}
            </button>
          );
        })}
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div style={{
          padding: S[5], textAlign: "center",
          fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
          background: C.surfaceAlt, borderRadius: R.md,
        }}>
          Sin planes para estos filtros
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
          {filtered.map(plan => {
            const statusC = plan.status === "received" ? C.green
              : plan.status === "shipped" ? C.blueDark
              : plan.status === "pending_warehouse" ? C.amber
              : plan.status === "cancelled" ? C.inkFaint
              : C.blueDark;
            const statusBg = plan.status === "received" ? C.greenLight
              : plan.status === "shipped" ? C.blueLight
              : plan.status === "pending_warehouse" ? C.amberLight
              : C.surfaceAlt;

            return (
              <div key={plan.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: S[3], background: C.white, borderRadius: R.md,
                border: `1px solid ${C.line}`, cursor: "pointer",
              }} onClick={() => onOpenPlan(plan.id)}>
                <div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.titleDeep }}>
                    {plan.documentNumber ?? "Draft"} · {plan.vendorName}
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint, marginTop: 2 }}>
                    {plan.items.length} cambio{plan.items.length !== 1 ? "s" : ""} · {formatDate(plan.updatedAt)}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                  <span style={{
                    fontFamily: T.mono, fontSize: 9, fontWeight: 700,
                    color: statusC, background: statusBg,
                    padding: "2px 10px", borderRadius: R.pill,
                    textTransform: "uppercase" as const,
                  }}>
                    {PLAN_STATUS_LABEL[plan.status]}
                  </span>
                  {plan.documentNumber && (
                    <button onClick={(e) => { e.stopPropagation(); onPrint(plan); }} style={{
                      fontFamily: T.mono, fontSize: 9, color: C.blueDark, background: "transparent",
                      border: "none", cursor: "pointer", padding: 2,
                    }}>
                      PDF
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Print Plan Overlay (MALETAS-BULK-REPLENISHMENT-01) ───────────────────────

function PrintPlanOverlay({
  plan,
  onClose,
}: {
  plan: MaletaReplenishmentPlan;
  onClose: () => void;
}) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (printRef.current) {
      const w = window.open("", "_blank");
      if (!w) return;
      w.document.write(`
        <html><head><title>Plan de Surtido ${plan.documentNumber ?? plan.id.slice(0, 12)}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: monospace; font-size: 12px; padding: 24px; color: #111; }
          h1 { font-size: 16px; margin-bottom: 4px; }
          h2 { font-size: 13px; margin: 16px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
          table { width: 100%; border-collapse: collapse; margin: 8px 0; }
          th, td { border: 1px solid #ccc; padding: 4px 8px; text-align: left; font-size: 11px; }
          th { background: #f5f5f5; font-weight: 700; }
          .summary { display: flex; gap: 32px; margin: 12px 0; }
          .summary-item { text-align: center; }
          .summary-value { font-size: 18px; font-weight: 700; }
          .summary-label { font-size: 10px; color: #666; }
          .sig { margin-top: 40px; display: flex; gap: 40px; }
          .sig-box { flex: 1; border-top: 1px solid #111; padding-top: 4px; text-align: center; font-size: 11px; }
          @media print { body { padding: 12px; } }
        </style></head><body>
        ${printRef.current.innerHTML}
        </body></html>
      `);
      w.document.close();
      w.print();
    }
  };

  const itemsIn = plan.items;
  const itemsOut = plan.items.filter(i => i.removedReference);
  const recovery = computeCoverageRecovery(plan.items);
  const subgroups = [...new Set(plan.items.map(i => i.subgroupSag))];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: C.white, borderRadius: R.lg,
        width: "90%", maxWidth: 700, maxHeight: "90vh",
        overflow: "auto", padding: S[6],
        boxShadow: `0 16px 48px rgba(0,0,0,0.2)`,
      }}>
        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: S[4] }}>
          <button onClick={handlePrint} style={{
            fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700,
            color: C.white, background: C.blueDark,
            border: "none", borderRadius: R.sm,
            padding: `${S[2]}px ${S[4]}px`, cursor: "pointer",
          }}>
            Imprimir
          </button>
          <button onClick={onClose} style={{
            fontFamily: T.mono, fontSize: T.sz.xs,
            color: C.inkLight, background: "transparent",
            border: `1px solid ${C.line}`, borderRadius: R.sm,
            padding: `${S[2]}px ${S[3]}px`, cursor: "pointer",
          }}>
            Cerrar
          </button>
        </div>

        {/* Printable content */}
        <div ref={printRef}>
          <h1 style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: 700, color: C.titleDeep }}>
            Guia de Surtido de Maleta
          </h1>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginBottom: S[3] }}>
            {plan.documentNumber ?? "Sin documento"} · {formatDate(plan.updatedAt)}
          </div>

          {/* Header data */}
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, marginBottom: S[3], lineHeight: 1.8 }}>
            <div><strong>Vendedor:</strong> {plan.vendorName}</div>
            <div><strong>Bodega:</strong> B{plan.warehouseCode}</div>
            <div><strong>Estado:</strong> {PLAN_STATUS_LABEL[plan.status]}</div>
            <div><strong>Creado:</strong> {formatDate(plan.createdAt)}</div>
          </div>

          {/* Summary */}
          <div style={{
            display: "flex", gap: 32, marginBottom: S[4],
            padding: S[3], background: C.surfaceAlt, borderRadius: R.md,
          }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: 700, color: C.green }}>{recovery.addedRefs}</div>
              <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint }}>Refs agregadas</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: 700, color: C.red }}>{recovery.removedRefs}</div>
              <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint }}>Refs retiradas</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: 700, color: C.blueDark }}>{subgroups.length}</div>
              <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint }}>Subgrupos</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: 700, color: C.green }}>+{recovery.estimatedCoverageGain}</div>
              <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint }}>Cobertura recuperada</div>
            </div>
          </div>

          {/* Agregar section */}
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.ink, marginBottom: S[1], borderBottom: `1px solid ${C.line}`, paddingBottom: 4 }}>
            Referencias a agregar
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: S[4], fontFamily: T.mono, fontSize: T.sz.xs }}>
            <thead>
              <tr style={{ background: C.surfaceAlt }}>
                <th style={{ border: `1px solid ${C.line}`, padding: "4px 8px", textAlign: "left" }}>Referencia</th>
                <th style={{ border: `1px solid ${C.line}`, padding: "4px 8px", textAlign: "left" }}>Descripcion</th>
                <th style={{ border: `1px solid ${C.line}`, padding: "4px 8px", textAlign: "left" }}>Subgrupo</th>
                <th style={{ border: `1px solid ${C.line}`, padding: "4px 8px", textAlign: "center" }}>Cantidad</th>
              </tr>
            </thead>
            <tbody>
              {itemsIn.map(item => (
                <tr key={item.id}>
                  <td style={{ border: `1px solid ${C.line}`, padding: "4px 8px", fontWeight: 700 }}>{item.addedReference}</td>
                  <td style={{ border: `1px solid ${C.line}`, padding: "4px 8px" }}>{item.addedDescription}</td>
                  <td style={{ border: `1px solid ${C.line}`, padding: "4px 8px", color: C.inkFaint }}>{item.subgroupSag}</td>
                  <td style={{ border: `1px solid ${C.line}`, padding: "4px 8px", textAlign: "center" }}>{item.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Retirar section */}
          {itemsOut.length > 0 && (
            <>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.ink, marginBottom: S[1], borderBottom: `1px solid ${C.line}`, paddingBottom: 4 }}>
                Referencias a retirar
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: S[4], fontFamily: T.mono, fontSize: T.sz.xs }}>
                <thead>
                  <tr style={{ background: C.surfaceAlt }}>
                    <th style={{ border: `1px solid ${C.line}`, padding: "4px 8px", textAlign: "left" }}>Referencia</th>
                    <th style={{ border: `1px solid ${C.line}`, padding: "4px 8px", textAlign: "left" }}>Descripcion</th>
                    <th style={{ border: `1px solid ${C.line}`, padding: "4px 8px", textAlign: "center" }}>Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {itemsOut.map(item => (
                    <tr key={item.id}>
                      <td style={{ border: `1px solid ${C.line}`, padding: "4px 8px", fontWeight: 700 }}>{item.removedReference}</td>
                      <td style={{ border: `1px solid ${C.line}`, padding: "4px 8px" }}>{item.removedDescription ?? "\u2014"}</td>
                      <td style={{ border: `1px solid ${C.line}`, padding: "4px 8px", textAlign: "center" }}>{item.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* Signatures */}
          <div style={{ display: "flex", gap: 40, marginTop: 48 }}>
            <div style={{ flex: 1, borderTop: `1px solid ${C.ink}`, paddingTop: 4, textAlign: "center" }}>
              <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint }}>Preparo</div>
            </div>
            <div style={{ flex: 1, borderTop: `1px solid ${C.ink}`, paddingTop: 4, textAlign: "center" }}>
              <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint }}>Despacho</div>
            </div>
            <div style={{ flex: 1, borderTop: `1px solid ${C.ink}`, paddingTop: 4, textAlign: "center" }}>
              <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint }}>Recibio</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 40, marginTop: 32 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint }}>Fecha entrega: _______________</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint }}>Fecha recepcion: _______________</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString("es-CO")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-CO");
  } catch {
    return iso;
  }
}

// ── Depleted Vault — Historico de referencias retiradas (GO-LIVE-MALETAS-DRAWER-PRODUCTION-01) ──

function DepletedVault({ refs }: { refs: VendorSampleRef[] }) {
  const [expanded, setExpanded] = useState(false);

  // Simple historical insights from available data
  const insights = useMemo(() => {
    const byLine = new Map<string, number>();
    for (const ref of refs) {
      byLine.set(ref.line, (byLine.get(ref.line) ?? 0) + 1);
    }
    const zeroStock = refs.filter((r) => r.centralAvailable <= 0).length;
    const lowStock = refs.filter((r) => r.centralAvailable > 0).length;
    return { byLine, zeroStock, lowStock, total: refs.length };
  }, [refs]);

  // Simple rotation rating based on available data
  const rotationRating = (ref: VendorSampleRef): { stars: number; label: string } => {
    if (ref.centralAvailable <= 0) return { stars: 1, label: "Sin inventario" };
    if (ref.centralAvailable <= ref.minimumRequired * 0.5) return { stars: 2, label: "Baja rotacion" };
    if (ref.centralAvailable <= ref.minimumRequired) return { stars: 3, label: "Rotacion media" };
    return { stars: 4, label: "Alta rotacion" };
  };

  const starDisplay = (count: number) => {
    return "★".repeat(count) + "☆".repeat(5 - count);
  };

  return (
    <div style={{ marginTop: S[4], borderTop: `1px solid ${C.line}`, paddingTop: S[3] }}>
      {/* Insights card */}
      <div style={{
        padding: `${S[2]}px ${S[3]}px`, marginBottom: S[2],
        background: C.surfaceAlt, borderRadius: R.sm,
        border: `1px solid ${C.line}`,
      }}>
        <div style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700, color: C.ink, marginBottom: 4 }}>
          Resumen historico
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, display: "flex", flexDirection: "column", gap: 2 }}>
          <span>{insights.total} referencias ya no forman parte del mostrario</span>
          {insights.zeroStock > 0 && <span>{insights.zeroStock} ya no tienen inventario disponible</span>}
          {insights.lowStock > 0 && <span>{insights.lowStock} aun tienen unidades residuales</span>}
          {[...insights.byLine.entries()].map(([line, count]) => (
            <span key={line}>{count} de linea {line}</span>
          ))}
        </div>
      </div>

      {/* Vault header */}
      <button
        onClick={() => setExpanded((p) => !p)}
        style={{
          display: "flex", alignItems: "center", gap: S[2], width: "100%",
          fontFamily: T.mono, fontSize: 10, fontWeight: 700,
          color: C.red, background: C.redLight, border: `1px solid ${C.redBorder}`,
          borderRadius: R.sm, padding: `${S[2]}px ${S[3]}px`, cursor: "pointer",
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: R.pill, background: C.red, flexShrink: 0 }} />
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1 }}>
          <span>Historico de referencias retiradas ({refs.length})</span>
          <span style={{ fontSize: 8, fontWeight: 500, color: C.inkFaint }}>
            Referencias que dejaron de hacer parte del mostrario comercial
          </span>
        </span>
        <span style={{ marginLeft: "auto", fontSize: 9 }}>{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="ag-op-table" style={{ marginTop: S[2] }}>
          {/* Header */}
          <div className="ag-op-row" style={{
            display: "grid", gridTemplateColumns: "28px 1fr 52px 42px 42px 72px",
            fontFamily: T.mono, fontSize: 8, fontWeight: 700,
            color: C.inkFaint, textTransform: "uppercase",
            padding: `2px ${S[2]}px`, borderBottom: `1px solid ${C.line}`,
          }}>
            <span />
            <span>Referencia</span>
            <span>Linea</span>
            <span style={{ textAlign: "center" }}>Inv.</span>
            <span style={{ textAlign: "center" }}>Limite</span>
            <span style={{ textAlign: "center" }}>Impacto</span>
          </div>

          {refs.map((ref) => {
            const rating = rotationRating(ref);
            return (
              <div key={ref.reference} className="ag-op-row" style={{
                display: "grid", gridTemplateColumns: "28px 1fr 52px 42px 42px 72px",
                fontFamily: T.mono, fontSize: 10,
                padding: `4px ${S[2]}px`,
                borderBottom: `1px solid ${C.line}22`,
                alignItems: "center",
              }}>
                {/* Thumbnail */}
                <div style={{
                  width: 24, height: 24, borderRadius: R.sm,
                  background: C.surfaceAlt, border: `1px solid ${C.line}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <span style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint }}>
                    {ref.line.slice(0, 2)}
                  </span>
                </div>
                {/* Ref + desc */}
                <div style={{ overflow: "hidden" }}>
                  <div style={{ fontWeight: 600, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {ref.reference}
                  </div>
                  <div style={{ fontSize: 8, color: C.inkFaint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {ref.description} · {ref.subgrupoSag}
                  </div>
                </div>
                <span style={{ fontSize: 9, color: C.inkFaint }}>{ref.line}</span>
                <span style={{ textAlign: "center", fontWeight: 700, color: C.red }}>
                  {ref.centralAvailable <= 0 ? "\u2014" : ref.centralAvailable}
                </span>
                <span style={{ textAlign: "center", color: C.inkFaint }}>
                  {ref.minimumRequired}
                </span>
                {/* Impacto historico */}
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: rating.stars >= 3 ? C.amber : C.inkFaint, letterSpacing: 1 }}>
                    {starDisplay(rating.stars)}
                  </div>
                  <div style={{ fontSize: 7, color: C.inkFaint }}>{rating.label}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const showMoreBtnStyle: React.CSSProperties = {
  fontFamily: T.mono,
  fontSize: T.sz.xs,
  fontWeight: 700,
  color: C.blueDark,
  background: C.blueLight,
  border: `1px solid ${C.blueBorder}`,
  borderRadius: R.lg,
  cursor: "pointer",
  padding: `${S[3]} ${S[4]}`,
  marginTop: S[3],
  width: "100%",
  textAlign: "center",
};

// ── Derrotero Ideal Panel (GO-LIVE-MALETAS-DERROTERO-HARDENING-01) ───────────

interface IdealRouteRule {
  id: string;
  vendorId: string;
  line: string;
  subgrupoSag: string;
  minimumRefs: number;
  isActive: boolean;
  updatedAt: string;
}

interface CatalogSubgroup {
  line: string;
  subgrupoSag: string;
}

const DERROTERO_LINE_LABEL: Record<string, string> = {
  LT: "Latin Kids",
  CS: "Castillitos",
  IMPORT: "Importacion",
};

type CoverageState = "cubierto" | "en_limite" | "falta_cobertura";

function deriveCoverageState(actual: number, ideal: number): CoverageState {
  if (actual > ideal) return "cubierto";
  if (actual === ideal) return "en_limite";
  return "falta_cobertura";
}

const COVERAGE_LABEL: Record<CoverageState, string> = {
  cubierto: "Cubierto",
  en_limite: "En limite",
  falta_cobertura: "Falta",
};

const COVERAGE_COLOR: Record<CoverageState, string> = {
  cubierto: C.green,
  en_limite: C.amber,
  falta_cobertura: C.red,
};

const COVERAGE_BG: Record<CoverageState, string> = {
  cubierto: C.greenLight,
  en_limite: C.amberLight,
  falta_cobertura: C.redLight,
};

/** MALETAS-DERROTERO-IDEALES-EDITABLES-01: Optimistic local recalculation after saving an ideal override */
function applyIdealOverride(
  eval_: VendorAssortmentResult,
  catalogId: string,
  groupCode: string,
  subgroupCode: string,
  newIdeal: number,
  isRestore = false,
): VendorAssortmentResult {
  return {
    ...eval_,
    catalogs: eval_.catalogs.map((cat) => {
      if (cat.catalogId !== catalogId) return cat;
      let totalComplete = 0, totalMissing = 0, totalExcess = 0, totalEntries = 0;
      const groups = cat.groups.map((grp) => {
        if (grp.groupCode !== groupCode) {
          totalComplete += grp.completeEntries;
          totalMissing += grp.missingEntries;
          totalExcess += grp.excessEntries;
          totalEntries += grp.entries.length;
          return grp;
        }
        let gc = 0, gm = 0, ge = 0;
        const entries = grp.entries.map((e) => {
          const key = e.subgroupCode ?? e.subgroupName;
          if (key !== subgroupCode) {
            if (e.complete) gc++; else gm++;
            if (e.excess) ge++;
            return e;
          }
          const idealEffective = newIdeal;
          const delta = e.currentUnits - idealEffective;
          const complete = e.currentUnits >= idealEffective;
          const excess = e.currentUnits > idealEffective;
          if (complete) gc++; else gm++;
          if (excess) ge++;
          return {
            ...e,
            targetUnits: idealEffective,
            officialIdeal: isRestore ? idealEffective : e.officialIdeal,
            isCustomIdeal: !isRestore,
            delta,
            complete,
            excess,
          };
        });
        totalComplete += gc;
        totalMissing += gm;
        totalExcess += ge;
        totalEntries += entries.length;
        const groupCompletion = entries.length > 0 ? Math.round((gc / entries.length) * 100) : 0;
        return { ...grp, entries, completeEntries: gc, missingEntries: gm, excessEntries: ge, groupCompletion };
      });
      const overallCompletion = totalEntries > 0 ? Math.round((totalComplete / totalEntries) * 100) : 0;
      return { ...cat, groups, totalComplete, totalMissing, totalExcess, totalEntries, overallCompletion };
    }),
  };
}

function DerroteroIdealPanel({
  orgSlug,
  vendor,
  externalRules,
  onRulesChange,
  assortmentEval,
  onEvalChange,
}: {
  orgSlug: string;
  vendor: VendorSampleSnapshot;
  externalRules?: IdealRouteRule[];
  onRulesChange?: (rules: IdealRouteRule[]) => void;
  assortmentEval?: VendorAssortmentResult;
  onEvalChange?: (updated: VendorAssortmentResult) => void;
}) {
  // Legacy rules still fetched for backward compat + editing
  const [rules, setRulesInternal] = useState<IdealRouteRule[]>(externalRules ?? []);
  const [catalog, setCatalog] = useState<CatalogSubgroup[]>([]);
  const [loading, setLoading] = useState(true);

  const setRules = useCallback((updater: IdealRouteRule[] | ((prev: IdealRouteRule[]) => IdealRouteRule[])) => {
    setRulesInternal((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      onRulesChange?.(next);
      return next;
    });
  }, [onRulesChange]);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // MALETAS-DERROTERO-IDEALES-EDITABLES-01: Inline editing state
  const [editingKey, setEditingKey] = useState<string | null>(null); // "catalogId|groupCode|subgroupCode"
  const [editValue, setEditValue] = useState<string>("");
  const [confirmAction, setConfirmAction] = useState<{
    type: "save" | "restore";
    catalogId: string;
    groupCode: string;
    subgroupCode: string;
    subgroupName: string;
    newValue?: number;
    officialIdeal?: number;
  } | null>(null);
  // Local override of assortmentEval for optimistic updates after save
  const [localEval, setLocalEval] = useState<VendorAssortmentResult | undefined>(assortmentEval);
  useEffect(() => { setLocalEval(assortmentEval); }, [assortmentEval]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/orgs/${orgSlug}/comercial/maletas/bags/${vendor.vendorId}/ideal-route`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          if (!externalRules) setRules(data.rules ?? []);
          setCatalog(data.catalog ?? []);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgSlug, vendor.vendorId]);

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 3000);
  };

  if (loading) {
    return (
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, padding: S[4] }}>
        Cargando derrotero...
      </div>
    );
  }

  // MALETAS-DERROTERO-IDEALES-EDITABLES-01: helpers for ideal override persistence
  const saveIdealOverride = async (catalogId: string, groupCode: string, subgroupCode: string, idealUnits: number) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/orgs/${orgSlug}/comercial/maletas/ideal-overrides`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalogId, groupCode, subgroupCode, idealUnits }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Error al guardar");
      // Optimistic update
      setLocalEval((prev) => {
        if (!prev) return prev;
        const updated = applyIdealOverride(prev, catalogId, groupCode, subgroupCode, idealUnits);
        if (onEvalChange) onEvalChange(updated);
        return updated;
      });
      showFeedback(`Ideal actualizado: ${subgroupCode} → ${idealUnits}`);
    } catch (err) {
      showFeedback(`Error: ${err instanceof Error ? err.message : "Error desconocido"}`);
    } finally {
      setSaving(false);
      setEditingKey(null);
      setConfirmAction(null);
    }
  };

  const restoreOfficialIdeal = async (catalogId: string, groupCode: string, subgroupCode: string, officialIdeal: number) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/orgs/${orgSlug}/comercial/maletas/ideal-overrides`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalogId, groupCode, subgroupCode }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Error al restaurar");
      // Optimistic update — restore official value
      setLocalEval((prev) => {
        if (!prev) return prev;
        const updated = applyIdealOverride(prev, catalogId, groupCode, subgroupCode, officialIdeal, true);
        if (onEvalChange) onEvalChange(updated);
        return updated;
      });
      showFeedback(`Ideal restaurado a oficial: ${subgroupCode} → ${officialIdeal}`);
    } catch (err) {
      showFeedback(`Error: ${err instanceof Error ? err.message : "Error desconocido"}`);
    } finally {
      setSaving(false);
      setConfirmAction(null);
    }
  };

  // If no assortment evaluation, show a message
  if (!localEval || localEval.catalogs.length === 0) {
    return (
      <div style={{ padding: `0 ${S[3]}px`, display: "flex", flexDirection: "column", gap: S[3] }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
          Sin evaluacion de catalogo para este vendedor. Verifique que las referencias tengan grupo y marca asignados.
        </div>
        {localEval && localEval.unresolvedRefs.length > 0 && (
          <UnresolvedRefsPanel
            unresolvedRefs={localEval.unresolvedRefs}
            summary={localEval.unresolvedSummary}
          />
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: `0 ${S[3]}px`, display: "flex", flexDirection: "column", gap: S[4] }}>
      {/* Feedback toast */}
      {feedback && (
        <div style={{
          padding: `3px ${S[3]}px`,
          background: feedback.includes("Error") ? C.redLight : C.greenLight,
          borderRadius: R.sm,
          border: `1px solid ${feedback.includes("Error") ? C.redBorder : C.greenBorder}`,
          fontFamily: T.mono, fontSize: 10, fontWeight: 600,
          color: feedback.includes("Error") ? C.red : C.green,
        }}>
          {feedback}
        </div>
      )}

      {/* MALETAS-DERROTERO-IDEALES-EDITABLES-01: Confirmation modal */}
      {confirmAction && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.35)",
        }} onClick={() => setConfirmAction(null)}>
          <div style={{
            background: C.surface, borderRadius: R.md, padding: S[4],
            boxShadow: E.lg, maxWidth: 360, width: "90%",
            border: `1px solid ${C.line}`,
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 700, color: C.ink, marginBottom: S[2] }}>
              {confirmAction.type === "save" ? "Confirmar ideal personalizado" : "Restaurar ideal oficial"}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkMid, marginBottom: S[3], lineHeight: 1.5 }}>
              {confirmAction.type === "save"
                ? `Subgrupo "${confirmAction.subgroupName}" pasara de ideal ${confirmAction.officialIdeal} a ${confirmAction.newValue}. Este cambio afecta solo a este tenant y puede restaurarse en cualquier momento.`
                : `Subgrupo "${confirmAction.subgroupName}" volvera al ideal oficial: ${confirmAction.officialIdeal}. Se eliminara la personalizacion.`
              }
            </div>
            <div style={{ display: "flex", gap: S[2], justifyContent: "flex-end" }}>
              <button
                className="ag-action-ghost"
                style={{ fontFamily: T.mono, fontSize: 10, padding: `4px ${S[3]}px`, cursor: "pointer" }}
                onClick={() => setConfirmAction(null)}
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                className={confirmAction.type === "save" ? "ag-action-primary" : "ag-action-secondary"}
                style={{ fontFamily: T.mono, fontSize: 10, padding: `4px ${S[3]}px`, cursor: "pointer" }}
                disabled={saving}
                onClick={() => {
                  if (confirmAction.type === "save" && confirmAction.newValue != null) {
                    saveIdealOverride(confirmAction.catalogId, confirmAction.groupCode, confirmAction.subgroupCode, confirmAction.newValue);
                  } else if (confirmAction.type === "restore" && confirmAction.officialIdeal != null) {
                    restoreOfficialIdeal(confirmAction.catalogId, confirmAction.groupCode, confirmAction.subgroupCode, confirmAction.officialIdeal);
                  }
                }}
              >
                {saving ? "Guardando..." : confirmAction.type === "save" ? "Confirmar" : "Restaurar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Catalog-based hierarchical derrotero (MALLETS-FUNCTIONAL-RECOVERY-01 Phase 2) */}
      {localEval.catalogs.map((cat) => (
        <div key={cat.catalogId}>
          {/* Catalog header */}
          <div style={{
            display: "flex", alignItems: "center", gap: S[2],
            padding: `${S[2]}px 0`, borderBottom: `1px solid ${C.line}`,
            marginBottom: S[2],
          }}>
            <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 700, color: C.blueDark }}>
              {cat.catalogName}
            </span>
            <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
              {cat.brand ?? cat.commercialWorld} \u00b7 v{cat.catalogVersion}
            </span>
            <span style={{
              marginLeft: "auto", fontFamily: T.mono, fontSize: 10, fontWeight: 700,
              color: cat.overallCompletion >= 80 ? C.green : cat.overallCompletion >= 50 ? C.amber : C.red,
            }}>
              {cat.overallCompletion}%
            </span>
          </div>

          {/* Summary strip */}
          <div style={{
            display: "flex", gap: S[3], padding: `${S[2]}px ${S[2]}px`,
            background: C.surfaceAlt, borderRadius: R.sm, marginBottom: S[2],
          }}>
            <DerroteroSummaryKpi label="Completos" value={cat.totalComplete} color={C.green} />
            <DerroteroSummaryKpi label="Faltan" value={cat.totalMissing} color={C.red} />
            <DerroteroSummaryKpi label="Exceso" value={cat.totalExcess} color={C.amber} />
            <DerroteroSummaryKpi label="Cobertura" value={`${cat.overallCompletion}%`} color={cat.overallCompletion >= 80 ? C.green : cat.overallCompletion >= 50 ? C.amber : C.red} />
          </div>

          {/* Per-group tables */}
          {cat.groups.map((group) => (
            <div key={group.groupCode} style={{ marginBottom: S[3] }}>
              <div style={{
                fontFamily: T.mono, fontSize: 10, fontWeight: 700,
                color: C.ink, marginBottom: S[1],
                display: "flex", alignItems: "center", gap: S[2],
              }}>
                {group.groupName}
                <span style={{
                  fontFamily: T.mono, fontSize: 8, fontWeight: 600,
                  color: group.groupCompletion >= 80 ? C.green : group.groupCompletion >= 50 ? C.amber : C.red,
                }}>
                  {group.groupCompletion}%
                </span>
              </div>

              <div className="ag-op-table">
                <div className="ag-op-row" style={{
                  display: "grid", gridTemplateColumns: "1fr 52px 38px 38px 38px 72px",
                  fontFamily: T.mono, fontSize: 8, fontWeight: 700,
                  color: C.inkFaint, textTransform: "uppercase" as const,
                  padding: `2px ${S[2]}px`, borderBottom: `1px solid ${C.line}`,
                }}>
                  <span>Subgrupo</span>
                  <span style={{ textAlign: "center" as const }}>Ideal</span>
                  <span style={{ textAlign: "center" as const }}>Actual</span>
                  <span style={{ textAlign: "center" as const }}>Faltan</span>
                  <span style={{ textAlign: "center" as const }}>Exceso</span>
                  <span style={{ textAlign: "center" as const }}>Estado</span>
                </div>

                {group.entries.map((entry) => {
                  const faltan = Math.max(0, -entry.delta);
                  const exceso = Math.max(0, entry.delta);
                  const coverState: CoverageState = entry.complete ? "cubierto" : entry.currentUnits > 0 ? "en_limite" : "falta_cobertura";
                  const entryKey = `${cat.catalogId}|${group.groupCode}|${entry.subgroupCode ?? entry.subgroupName}`;
                  const isEditing = editingKey === entryKey;
                  return (
                    <div key={entry.subgroupCode ?? entry.subgroupName} className="ag-op-row" style={{
                      display: "grid", gridTemplateColumns: "1fr 52px 38px 38px 38px 72px",
                      fontFamily: T.mono, fontSize: 10,
                      padding: `4px ${S[2]}px`,
                      borderBottom: `1px solid ${C.line}22`,
                      alignItems: "center",
                    }}>
                      <span style={{ fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                        {entry.subgroupName}
                      </span>
                      {/* IDEAL column — editable */}
                      <span style={{ textAlign: "center" as const, display: "flex", alignItems: "center", justifyContent: "center", gap: 2 }}>
                        {isEditing ? (
                          <input
                            type="number"
                            min={0}
                            step={1}
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                const v = parseInt(editValue, 10);
                                if (!isNaN(v) && v >= 0 && Number.isInteger(v)) {
                                  setConfirmAction({
                                    type: "save",
                                    catalogId: cat.catalogId,
                                    groupCode: group.groupCode,
                                    subgroupCode: entry.subgroupCode ?? entry.subgroupName,
                                    subgroupName: entry.subgroupName,
                                    newValue: v,
                                    officialIdeal: entry.officialIdeal,
                                  });
                                }
                                setEditingKey(null);
                              } else if (e.key === "Escape") {
                                setEditingKey(null);
                              }
                            }}
                            onBlur={() => setEditingKey(null)}
                            style={{
                              width: 32, textAlign: "center" as const,
                              fontFamily: T.mono, fontSize: 10, fontWeight: 700,
                              border: `1px solid ${C.blueDark}`, borderRadius: R.xs,
                              padding: "1px 2px", color: C.blueDark,
                              outline: "none", background: C.surface,
                            }}
                          />
                        ) : (
                          <span
                            role="button"
                            tabIndex={0}
                            title={entry.isCustomIdeal ? `Personalizado (oficial: ${entry.officialIdeal}). Click para editar.` : "Click para editar ideal"}
                            onClick={() => {
                              setEditingKey(entryKey);
                              setEditValue(String(entry.targetUnits));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                setEditingKey(entryKey);
                                setEditValue(String(entry.targetUnits));
                              }
                            }}
                            style={{
                              fontWeight: 700,
                              color: entry.isCustomIdeal ? C.amber : C.blueDark,
                              cursor: "pointer",
                              borderBottom: `1px dashed ${entry.isCustomIdeal ? C.amber : C.blueDark}44`,
                              padding: "0 2px",
                              position: "relative" as const,
                            }}
                          >
                            {entry.targetUnits}
                            {entry.isCustomIdeal && (
                              <span
                                title={`Restaurar ideal oficial (${entry.officialIdeal})`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmAction({
                                    type: "restore",
                                    catalogId: cat.catalogId,
                                    groupCode: group.groupCode,
                                    subgroupCode: entry.subgroupCode ?? entry.subgroupName,
                                    subgroupName: entry.subgroupName,
                                    officialIdeal: entry.officialIdeal,
                                  });
                                }}
                                style={{
                                  marginLeft: 2, fontSize: 7, color: C.amber, cursor: "pointer",
                                  verticalAlign: "super",
                                }}
                              >
                                &#x21A9;
                              </span>
                            )}
                          </span>
                        )}
                      </span>
                      <span style={{ textAlign: "center" as const, fontWeight: 700, color: COVERAGE_COLOR[coverState] }}>
                        {entry.currentUnits}
                      </span>
                      <span style={{ textAlign: "center" as const, fontWeight: 700, color: faltan > 0 ? C.red : C.inkFaint }}>
                        {faltan}
                      </span>
                      <span style={{ textAlign: "center" as const, fontWeight: 700, color: exceso > 0 ? C.amber : C.inkFaint }}>
                        {exceso}
                      </span>
                      <span style={{ textAlign: "center" as const }}>
                        <span style={{
                          fontFamily: T.mono, fontSize: 8, fontWeight: 600,
                          color: COVERAGE_COLOR[coverState],
                          background: COVERAGE_BG[coverState],
                          borderRadius: R.pill, padding: "1px 6px",
                          whiteSpace: "nowrap" as const,
                        }}>
                          {COVERAGE_LABEL[coverState]}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* Unresolved refs — MALLETS-DERROTERO-DATA-SOURCE-HOTFIX-01 */}
      {localEval.unresolvedRefs.length > 0 && (
        <UnresolvedRefsPanel
          unresolvedRefs={localEval.unresolvedRefs}
          summary={localEval.unresolvedSummary}
        />
      )}
    </div>
  );
}

/** MALETAS-REFERENCIAS-GRUPO-IMAGEN-01: Product thumbnail with error fallback */
function RefThumbnail({ imageUrl, alt }: { imageUrl: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  const showPlaceholder = !imageUrl || failed;
  return (
    <div style={{ width: 32, height: 32, flexShrink: 0 }}>
      {!showPlaceholder ? (
        <img
          src={imageUrl}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
          style={{
            width: 32, height: 32,
            objectFit: "cover" as const,
            borderRadius: R.xs,
            border: `1px solid ${C.line}`,
          }}
        />
      ) : (
        <div
          title="Sin imagen disponible"
          style={{
            width: 32, height: 32,
            display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: R.xs,
            border: `1px solid ${C.line}`,
            background: C.surfaceAlt,
            color: C.inkFaint,
            fontFamily: T.mono, fontSize: 12,
          }}
        >
          &#x25A1;
        </div>
      )}
    </div>
  );
}

function DerroteroSummaryKpi({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, textTransform: "uppercase" as const }}>{label}</div>
    </div>
  );
}

/** MALLETS-DERROTERO-DATA-SOURCE-HOTFIX-01: typed unresolved refs panel */
function UnresolvedRefsPanel({
  unresolvedRefs,
  summary,
}: {
  unresolvedRefs: UnresolvedRefType[];
  summary: UnresolvedSummary;
}) {
  const [expanded, setExpanded] = useState(false);
  const REASON_LABEL: Record<string, string> = {
    SIZECLASS_MISSING_IN_SAG: "Sin sizeClass en SAG",
    PRODUCT_NOT_RESOLVED: "Producto no resuelto",
    SIZECLASS_UNMAPPED: "Valor no homologado",
    NOT_IMPORT_PRODUCT: "No corresponde a Importacion",
    HISTORICAL_REFERENCE: "Referencia historica",
  };

  return (
    <div style={{
      background: C.surfaceAlt, borderRadius: R.sm, padding: S[3],
      border: `1px solid ${C.line}`,
    }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          all: "unset", cursor: "pointer", width: "100%",
          display: "flex", alignItems: "center", gap: S[2],
        }}
      >
        <span style={{
          fontFamily: T.mono, fontSize: 10, fontWeight: 700, color: C.amber,
        }}>
          Referencias sin clasificacion de tamano: {summary.total}
        </span>
        <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, marginLeft: "auto" }}>
          {expanded ? "Ocultar" : "Ver detalle"}
        </span>
      </button>

      {/* Summary strip — always visible */}
      <div style={{
        display: "flex", gap: S[3], marginTop: S[2],
        fontFamily: T.mono, fontSize: 9, color: C.inkMid,
      }}>
        {summary.sinSizeClassEnSag > 0 && (
          <span>Sin sizeClass en SAG: <strong>{summary.sinSizeClassEnSag}</strong></span>
        )}
        {summary.productoNoResuelto > 0 && (
          <span>Producto no resuelto: <strong>{summary.productoNoResuelto}</strong></span>
        )}
        {summary.valorNoHomologado > 0 && (
          <span>Valor no homologado: <strong>{summary.valorNoHomologado}</strong></span>
        )}
        {summary.noEsImportacion > 0 && (
          <span>No es Importacion: <strong>{summary.noEsImportacion}</strong></span>
        )}
      </div>

      {/* Detail — collapsible */}
      {expanded && (
        <div style={{ marginTop: S[2] }}>
          {unresolvedRefs.slice(0, 20).map((ur) => (
            <div key={ur.reference} style={{
              display: "flex", gap: S[2], padding: "2px 0",
              borderBottom: `1px solid ${C.line}22`,
              fontFamily: T.mono, fontSize: 9,
            }}>
              <span style={{ fontWeight: 700, color: C.ink, minWidth: 70 }}>{ur.reference}</span>
              <span style={{ color: C.inkMid, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                {ur.description}
              </span>
              <span style={{
                fontWeight: 600, fontSize: 8,
                color: C.amber, background: C.amber + "14",
                borderRadius: R.pill, padding: "1px 6px",
                whiteSpace: "nowrap" as const,
              }}>
                {REASON_LABEL[ur.reason] ?? ur.reason}
              </span>
            </div>
          ))}
          {unresolvedRefs.length > 20 && (
            <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, marginTop: S[1] }}>
              + {unresolvedRefs.length - 20} mas
            </div>
          )}
        </div>
      )}

    </div>
  );
}
