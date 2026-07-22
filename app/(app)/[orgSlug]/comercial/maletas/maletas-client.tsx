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
  StockDataState,
  MaletasExecutiveSummary,
  CoverageGapRef,
  ProductionSuggestion,
  VendorOpReplacementOption,
  AccessorySummary,
} from "@/lib/comercial/maletas/vendor-sample-types";
import { isCandidateForRemoval, type RemovalInput } from "@/lib/comercial/maletas/vendor-sample-types";
import type {
  MaletasCommercialIntelligenceResult,
  VendorCommercialIntelligence,
} from "@/lib/comercial/maletas/maletas-commercial-intelligence-types";
import type {
  VendorAssortmentResult,
  SubgroupProductionEval,
  ProductionDecision,
  UnresolvedRef as UnresolvedRefType,
  UnresolvedSummary,
  VendorMalletBaseMetrics,
  BusinessCoverageResult,
} from "@/lib/comercial/maletas/maletas-functional-evaluation";
import { getVendorMalletBaseMetrics } from "@/lib/comercial/maletas/maletas-functional-evaluation";
import { CommercialReferenceThumbnail } from "@/components/comercial/commercial-reference-thumbnail";

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
  coverageResult: BusinessCoverageResult;
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
  saludable: "Disponible",
  reemplazar: "Retiro",
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
  HEALTHY: "Disponible",
  LOW_STOCK: "Stock bajo",
  OUT_OF_STOCK: "Sin disponibilidad",
  INSUFFICIENT_DATA: "Sin datos",
};

const URGENCY_COLOR: Record<string, string> = {
  alta: C.red,
  media: C.amber,
  baja: C.inkFaint,
};


const PAGE_SIZE = 50;

/** Build RemovalInput from VendorSampleRef (COMERCIAL-MALETAS-DERROTERO-EXCLUDE-RETIRO-01) */
function refToRemovalInput(ref: VendorSampleRef): RemovalInput {
  return {
    line: ref.line,
    compatibleCommercialStock: ref.centralAvailable,
    stockDataState: ref.stockDataState,
  };
}

// ── Drawer filter type ───────────────────────────────────────────────────────

type DrawerFilter = SampleState | "all";

const FILTER_ORDER: DrawerFilter[] = [
  "saludable", "sin_datos",
];

const FILTER_LABEL: Record<DrawerFilter, string> = {
  all: "Todas",
  saludable: "Disponibles",
  reemplazar: "Retiro",
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
  coverageResult,
}: MaletasClientProps) {
  const [selectedVendor, setSelectedVendor] = useState<VendorSampleSnapshot | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lineFilters, setLineFilters] = useState<Record<string, DrawerFilter>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [lineVisibleCounts, setLineVisibleCounts] = useState<Record<string, number>>({});
  const [showAllGaps, setShowAllGaps] = useState(false);
  const [expandedRef, setExpandedRef] = useState<string | null>(null);

  // Mutable copy of assortmentEvaluations for optimistic ideal updates
  const [liveAssortmentEvals, setLiveAssortmentEvals] = useState(assortmentEvaluations);
  useEffect(() => { setLiveAssortmentEvals(assortmentEvaluations); }, [assortmentEvaluations]);
  const [drawerTab, setDrawerTab] = useState<"referencias" | "retiro" | "inteligencia" | "derrotero">("referencias");
  const [lineExpanded, setLineExpanded] = useState<Record<string, boolean>>({});
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // ── Production detail drawer ────────────────────────────────────────────
  const [prodDetailOpen, setProdDetailOpen] = useState(false);
  const [prodDetailItem, setProdDetailItem] = useState<ProductionSuggestion | null>(null);

  // ── Derrotero rules lifted to drawer level (GO-LIVE-MALETAS-DERROTERO-POR-LINEA-01) ──
  const [derroteroRules, setDerroteroRules] = useState<IdealRouteRule[]>([]);
  const [derroteroLoading, setDerroteroLoading] = useState(false);

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
    setDrawerOpen(true);
    fetchDerroteroRules(v.vendorId);
  };

  // ── Production detail handlers ──────────────────────────────────────────
  const openProductionDetail = (item: ProductionSuggestion) => {
    setProdDetailItem(item);
    setProdDetailOpen(true);
  };

  const toggleRefDetail = useCallback((refCode: string) => {
    setExpandedRef((prev) => (prev === refCode ? null : refCode));
  }, []);

  // PRESENCE-VS-COMMERCIAL-SCOPE-FIX-01:
  // allPresenceRefs = ALL F34-present refs (drawer shows the full physical inventory).
  // activeRefs/depletedRefs = commercial split (used by decision engines, NOT for hiding rows).
  const allPresenceRefs = useMemo(() => {
    if (!selectedVendor) return [];
    return selectedVendor.refs;
  }, [selectedVendor]);

  const activeRefs = useMemo(() => {
    if (!selectedVendor) return [];
    return selectedVendor.refs.filter((r) => r.state !== "reemplazar");
  }, [selectedVendor]);

  const depletedRefs = useMemo(() => {
    if (!selectedVendor) return [];
    return selectedVendor.refs.filter((r) => r.state === "reemplazar");
  }, [selectedVendor]);

  // COMERCIAL-MALETAS-DERROTERO-EXCLUDE-RETIRO-01: RETIRO vs commercial split
  const retiroRefs = useMemo(() => {
    if (!selectedVendor) return [];
    return selectedVendor.refs.filter((r) => isCandidateForRemoval(refToRemovalInput(r)));
  }, [selectedVendor]);

  const commercialRefs = useMemo(() => {
    if (!selectedVendor) return [];
    return selectedVendor.refs.filter((r) => !isCandidateForRemoval(refToRemovalInput(r)));
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

  // PRESENCE-VS-COMMERCIAL-SCOPE-FIX-01: group ALL presence refs by line.
  // The references tab shows every F34-present ref, not just commercially active ones.
  const searchedPresenceRefs = useMemo(() => {
    if (!selectedVendor) return [];
    let refs = allPresenceRefs;
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
  }, [selectedVendor, allPresenceRefs, searchQuery]);

  // COMERCIAL-MALETAS-RETIRO-UI-CONSOLIDATION-01:
  // lineGroups = ONLY vigentes (non-retiro) refs for CS/LT/IMPORT.
  // retiroLineGroups = ONLY retiro refs, grouped by line (CS/LT/IMPORT/OTRO).
  // Zero duplication between the two universes.
  const lineGroups = useMemo(() => {
    const map = new Map<string, VendorSampleRef[]>();
    for (const ref of searchedPresenceRefs) {
      if (ref.line === "OTRO") continue;
      if (isCandidateForRemoval(refToRemovalInput(ref))) continue;
      const arr = map.get(ref.line) ?? [];
      arr.push(ref);
      map.set(ref.line, arr);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [searchedPresenceRefs]);

  const retiroLineGroups = useMemo(() => {
    const map = new Map<string, VendorSampleRef[]>();
    for (const ref of searchedPresenceRefs) {
      if (!isCandidateForRemoval(refToRemovalInput(ref))) continue;
      const line = ref.line || "OTRO";
      const arr = map.get(line) ?? [];
      arr.push(ref);
      map.set(line, arr);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [searchedPresenceRefs]);

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
  const coverageSectionRef = useRef<HTMLDivElement>(null);
  const [sectionOpen, setSectionOpen] = useState<Record<string, boolean>>({
    produccion: true,
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
    let produccion = 0, bodega = 0, op = 0;
    for (const v of vendors) {
      for (const ref of v.refs) {
        if (ref.supplyAction === "PRODUCCION_SUGERIDA") produccion++;
        else if (ref.supplyAction === "REEMPLAZAR_BODEGA") bodega++;
        else if (ref.supplyAction === "COMPLETAR_DESDE_OP") op++;
      }
    }
    return { produccion, bodega, op, total: produccion + bodega + op };
  }, [vendors]);

  // MALLETS-FUNCTIONAL-RECOVERY-01: threshold-based production evaluation
  // COMERCIAL-MALETAS-PRODUCTION-CLASSIFICATION-SEPARATION-02:
  // Split into classified (valid production decisions) vs unclassified (pending classification)
  const isPendingClassification = useCallback((pt: SubgroupProductionEval) => {
    if (pt.dataState === "SIN_CORRESPONDENCIA" || pt.dataState === "SIN_DATOS") return true;
    if (pt.decision === "DATOS_INSUFICIENTES") return true;
    if (!pt.subgrupoSag || pt.subgrupoSag === "OTRO") return true;
    if (pt.group === "OTRO") return true;
    return false;
  }, []);

  const productionValid = useMemo(
    () => productionThresholds.filter((p) => !isPendingClassification(p)),
    [productionThresholds, isPendingClassification],
  );

  // COMERCIAL-MALETAS-PRODUCTION-PRIORITY-ENGINE-01
  // COMERCIAL-MALETAS-PRODUCTION-RISK-LIST-01
  //
  // 4-bucket classification: IMMEDIATE / RISK / ACTIVE_OP / HEALTHY
  // Mutually exclusive, exhaustive partition of productionValid.
  //
  // Risk limits calibrated from real data distribution (Jul 2026):
  //   Castillitos: lowest no-OP stock = 359 → risk ≤ 500 catches 4 items
  //   Latin Kids:  all items have OP → risk ≤ 800 future-proofed
  //
  // Change these constants to adjust policy. Single source of truth.
  const PRODUCTION_RISK_LIMITS: Record<string, number> = {
    Castillitos: 500,
    "Latin Kids": 800,
  };

  // Bucket 1: IMMEDIATE — stock ≤ threshold, no OP activa
  const prodImmediate = useMemo(
    () => productionValid
      .filter((p) => p.decision === "PRODUCIR")
      .sort((a, b) => a.stockDisponible - b.stockDisponible),
    [productionValid],
  );

  // Bucket 3: ACTIVE_OP — has OP activa (regardless of stock level)
  const prodWithOp = useMemo(
    () => productionValid.filter((p) => p.tieneOpActiva),
    [productionValid],
  );

  // Bucket 2: RISK — stock > threshold, stock ≤ risk limit, no OP activa
  const prodRisk = useMemo(
    () => productionValid
      .filter((p) => {
        if (p.decision !== "SIN_ACCION") return false;
        if (p.tieneOpActiva) return false;
        const limit = PRODUCTION_RISK_LIMITS[p.brand];
        if (limit === undefined) return false;
        return p.stockDisponible <= limit;
      })
      .sort((a, b) => a.stockDisponible - b.stockDisponible),
    [productionValid],
  );

  // Bucket 4: HEALTHY — stock > risk limit, no OP activa (NOT rendered)
  const prodHealthy = useMemo(
    () => productionValid.filter((p) =>
      p.decision === "SIN_ACCION" && !p.tieneOpActiva && !prodRisk.includes(p),
    ),
    [productionValid, prodRisk],
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
          {[
            { label: "Produccion", ref: productionSectionRef, key: "produccion", count: prodImmediate.length },
            { label: "Oportunidades", ref: coverageSectionRef, key: "cobertura", count: coverageResult.textileCoverage.length + coverageResult.importCoverage.length },
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
          {activeVendors.map((vendor) => (
              <VendorCard
                key={vendor.vendorId}
                vendor={vendor}
                intel={intelMap.get(vendor.vendorId)}
                baseMetrics={baseMetricsMap.get(vendor.vendorId)}
                onClick={() => openVendor(vendor)}
                onToggleActivation={toggleVendorActivation}
                activationLoading={activationLoading}
              />
          ))}
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
                    onClick={() => openVendor(vendor)}
                    onToggleActivation={toggleVendorActivation}
                    activationLoading={activationLoading}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Produccion — centro de decisiones (COMERCIAL-MALETAS-PRODUCTION-PRIORITY-ENGINE-01) ── */}
        <SectionHeader
          title="Produccion"
          subtitle={
            prodImmediate.length > 0
              ? `${prodImmediate.length} inmediata${prodImmediate.length > 1 ? "s" : ""}, ${prodRisk.length} proximos al limite`
              : prodRisk.length > 0
                ? `0 inmediatas, ${prodRisk.length} proximos al limite`
                : "Sin acciones pendientes"
          }
          count={prodImmediate.length + prodRisk.length > 0 ? prodImmediate.length + prodRisk.length : undefined}
          open={sectionOpen.produccion}
          onToggle={() => toggleSection("produccion")}
          sectionRef={productionSectionRef}
          statusHint={prodImmediate.length > 0 ? `${prodImmediate.length} inmediata${prodImmediate.length > 1 ? "s" : ""}` : "controlado"}
        >
          {/* ── KPIs de decisión ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: S[3], marginBottom: S[4] }}>
            {[
              { label: "Produccion inmediata", value: prodImmediate.length, color: prodImmediate.length > 0 ? C.red : C.green },
              { label: "Proximos al limite", value: prodRisk.length, color: prodRisk.length > 0 ? C.amber : C.green },
              { label: "Con OP activa", value: prodWithOp.length, color: prodWithOp.length > 0 ? C.blueDark : C.inkFaint },
            ].map((kpi) => (
              <div key={kpi.label} style={{
                background: C.white, borderRadius: R.lg,
                border: `1px solid ${C.line}`, padding: S[4],
                textAlign: "center" as const,
              }}>
                <div style={{ fontFamily: T.mono, fontSize: 22, fontWeight: 700, color: kpi.color }}>
                  {kpi.value}
                </div>
                <div style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 600, color: C.inkFaint, marginTop: S[1] }}>
                  {kpi.label}
                </div>
              </div>
            ))}
          </div>

          {/* ── Produccion inmediata ── */}
          {prodImmediate.length > 0 && (
            <div style={{ marginBottom: S[4] }}>
              <div style={{
                fontFamily: T.mono, fontSize: 10, fontWeight: 700,
                color: C.red, textTransform: "uppercase" as const, letterSpacing: "0.08em",
                marginBottom: S[2],
              }}>
                Produccion inmediata
              </div>
              <div style={{
                background: C.white, borderRadius: R.lg,
                border: `1px solid ${C.line}`, boxShadow: `0 1px 3px ${C.ink}06`,
                overflow: "hidden", overflowX: "auto", minWidth: 0,
              }}>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(80px,0.8fr) minmax(90px,1fr) minmax(100px,1.2fr) 80px 80px 130px",
                  padding: "10px 16px", background: C.surfaceAlt,
                  borderBottom: `1px solid ${C.line}`, gap: S[2], alignItems: "center",
                }}>
                  {["Marca", "Grupo", "Subgrupo", "Stock", "Umbral", "Accion"].map((h) => (
                    <div key={h} style={{
                      ...listHeaderCell,
                      textAlign: h === "Stock" || h === "Umbral" ? "right" as const : h === "Accion" ? "center" as const : undefined,
                    }}>{h}</div>
                  ))}
                </div>
                {prodImmediate.map((pt, i) => (
                  <div key={`imm-${pt.brand}|${pt.group ?? ""}|${pt.subgrupoSag}`} style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(80px,0.8fr) minmax(90px,1fr) minmax(100px,1.2fr) 80px 80px 130px",
                    padding: ROW_PAD,
                    borderBottom: i === prodImmediate.length - 1 ? "none" : `1px solid ${C.lineSubtle}`,
                    gap: S[2], alignItems: "center",
                  }}>
                    <div style={{ ...listCell, fontWeight: 700, color: C.titleDeep }}>{pt.brand}</div>
                    <div style={{ ...listCell, color: C.ink }}>{pt.group ?? "\u2014"}</div>
                    <div style={{ ...listCell, color: C.ink }}>{pt.subgrupoSag}</div>
                    <div style={{ ...listCell, fontWeight: 700, color: C.red, textAlign: "right" as const }}>
                      {pt.stockDisponible}
                    </div>
                    <div style={{ ...listCell, color: C.inkFaint, textAlign: "right" as const }}>{pt.umbral || "\u2014"}</div>
                    <div style={{
                      fontFamily: T.mono, fontSize: 10, fontWeight: 700,
                      color: C.white, background: C.red,
                      padding: "2px 8px", borderRadius: R.pill,
                      textAlign: "center" as const, whiteSpace: "nowrap" as const,
                    }}>
                      Programar produccion
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Proximos al limite ── */}
          {prodRisk.length > 0 && (
            <div style={{ marginBottom: S[4] }}>
              <div style={{
                fontFamily: T.mono, fontSize: 10, fontWeight: 700,
                color: C.amber, textTransform: "uppercase" as const, letterSpacing: "0.08em",
                marginBottom: S[1],
              }}>
                Proximos al limite
              </div>
              <div style={{
                fontFamily: T.mono, fontSize: 9, color: C.inkFaint, marginBottom: S[2],
              }}>
                Grupos y subgrupos que requieren seguimiento antes de llegar al minimo de produccion.
              </div>
              <div style={{
                background: C.white, borderRadius: R.lg,
                border: `1px solid ${C.line}`, boxShadow: `0 1px 3px ${C.ink}06`,
                overflow: "hidden", overflowX: "auto", minWidth: 0,
              }}>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(80px,0.8fr) minmax(90px,1fr) minmax(100px,1.2fr) 80px 80px 80px 150px",
                  padding: "10px 16px", background: C.surfaceAlt,
                  borderBottom: `1px solid ${C.line}`, gap: S[2], alignItems: "center",
                }}>
                  {["Marca", "Grupo", "Subgrupo", "Disponible", "Minimo", "Margen", "Accion"].map((h) => (
                    <div key={h} style={{
                      ...listHeaderCell,
                      textAlign: h === "Disponible" || h === "Minimo" || h === "Margen" ? "right" as const : h === "Accion" ? "center" as const : undefined,
                    }}>{h}</div>
                  ))}
                </div>
                {prodRisk.map((pt, i) => {
                  const margin = pt.stockDisponible - pt.umbral;
                  return (
                    <div key={`risk-${pt.brand}|${pt.group ?? ""}|${pt.subgrupoSag}`} style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(80px,0.8fr) minmax(90px,1fr) minmax(100px,1.2fr) 80px 80px 80px 150px",
                      padding: ROW_PAD,
                      borderBottom: i === prodRisk.length - 1 ? "none" : `1px solid ${C.lineSubtle}`,
                      gap: S[2], alignItems: "center",
                    }}>
                      <div style={{ ...listCell, fontWeight: 700, color: C.titleDeep }}>{pt.brand}</div>
                      <div style={{ ...listCell, color: C.ink }}>{pt.group ?? "\u2014"}</div>
                      <div style={{ ...listCell, color: C.ink }}>{pt.subgrupoSag}</div>
                      <div style={{ ...listCell, fontWeight: 700, color: C.amber, textAlign: "right" as const }}>
                        {pt.stockDisponible}
                      </div>
                      <div style={{ ...listCell, color: C.inkFaint, textAlign: "right" as const }}>{pt.umbral || "\u2014"}</div>
                      <div style={{ ...listCell, fontWeight: 700, color: margin <= 200 ? C.amber : C.inkFaint, textAlign: "right" as const }}>
                        +{margin}
                      </div>
                      <div style={{
                        fontFamily: T.mono, fontSize: 10, fontWeight: 700,
                        color: C.white, background: C.amber,
                        padding: "2px 8px", borderRadius: R.pill,
                        textAlign: "center" as const, whiteSpace: "nowrap" as const,
                      }}>
                        Monitorear produccion
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Con OP activa: only counted in KPI — not rendered as table */}

          {/* ── Todo controlado ── */}
          {prodImmediate.length === 0 && prodRisk.length === 0 && (
            <div style={{
              padding: S[5], background: C.white, borderRadius: R.lg,
              border: `1px solid ${C.line}`,
            }}>
              <div style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 600, color: C.green }}>
                No hay grupos proximos al limite. Todos los subgrupos superan el umbral operativo.
              </div>
            </div>
          )}
        </SectionHeader>

        {/* ── Oportunidades de cobertura (COVERAGE-BUSINESS-VIEW-08) ── */}
        <SectionHeader
          title="Oportunidades de cobertura"
          subtitle="Referencias disponibles para completar faltantes del derrotero"
          count={(coverageResult.textileCoverage.length + coverageResult.importCoverage.length) || undefined}
          open={sectionOpen.cobertura}
          onToggle={() => toggleSection("cobertura")}
          sectionRef={coverageSectionRef}
          statusHint={
            (coverageResult.textileCoverage.length + coverageResult.importCoverage.length) > 0
              ? `${coverageResult.textileCoverage.length + coverageResult.importCoverage.length} oportunidades`
              : "sin faltantes"
          }
        >
          {/* ── Oportunidades Textiles ── */}
          {coverageResult.textileCoverage.length > 0 && (
            <div style={{ marginBottom: S[4] }}>
              <div style={{
                fontFamily: T.mono, fontSize: 10, fontWeight: 700, color: C.titleDeep,
                textTransform: "uppercase" as const, letterSpacing: "0.08em",
                marginBottom: S[2],
              }}>
                Textil ({coverageResult.textileCoverage.length})
              </div>
              <div style={{
                background: C.white, borderRadius: R.lg,
                border: `1px solid ${C.line}`, boxShadow: `0 1px 3px ${C.ink}06`,
                overflow: "hidden", overflowX: "auto", minWidth: 0,
              }}>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(80px,0.9fr) minmax(90px,1fr) minmax(60px,0.6fr) minmax(60px,0.6fr) 90px 60px 60px 50px minmax(70px,0.8fr)",
                  padding: `10px 16px`, background: C.surfaceAlt,
                  borderBottom: `1px solid ${C.line}`, gap: S[2], alignItems: "center",
                }}>
                  {["Referencia", "Descripcion", "Grupo", "Subgrupo", "Origen", "Disponible", "En prod.", "OP", "Sirve para"].map((h) => (
                    <div key={h} style={{
                      ...listHeaderCell,
                      textAlign: (h === "Disponible" || h === "En prod.") ? "right" as const : undefined,
                    }}>{h}</div>
                  ))}
                </div>
                {coverageResult.textileCoverage.slice(0, showAllGaps ? 100 : 10).map((opp, i) => {
                  const sourceLabel = opp.source === "BODEGA" ? "Bodega principal" : "OP activa";
                  const sourceColor = opp.source === "BODEGA" ? C.green : C.blueDark;
                  const opDate = opp.operationalDate ? new Date(opp.operationalDate).toISOString().slice(0, 10) : null;
                  const ageLabel = opp.ageDays != null ? `${opp.ageDays}d` : null;

                  return (
                  <div key={`${opp.replacementReference}-${opp.source}-${opp.opNumber ?? ""}-${i}`}>
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(80px,0.9fr) minmax(90px,1fr) minmax(60px,0.6fr) minmax(60px,0.6fr) 90px 60px 60px 50px minmax(70px,0.8fr)",
                      padding: ROW_PAD,
                      borderBottom: `1px solid ${C.lineSubtle}`,
                      gap: S[2], alignItems: "center",
                    }}>
                      <div style={{ ...listCell, fontWeight: 700, color: C.titleDeep }}>{opp.replacementReference}</div>
                      <div style={{ ...listCell, color: C.inkMid, fontSize: 10 }}>{opp.replacementDescription}</div>
                      <div style={{ ...listCell, color: C.ink }}>{opp.group}</div>
                      <div style={{ ...listCell, color: C.inkMid }}>{opp.subgroup}</div>
                      <div style={{ ...listCell }}>
                        <span style={{
                          fontFamily: T.mono, fontSize: 9, fontWeight: 700, color: sourceColor,
                          padding: "2px 6px", borderRadius: R.sm,
                          background: `${sourceColor}12`,
                        }}>{sourceLabel}</span>
                      </div>
                      <div style={{ ...listCell, fontWeight: 600, color: opp.availableNow != null ? C.green : C.inkFaint, textAlign: "right" as const }}>
                        {opp.availableNow != null ? opp.availableNow : "\u2014"}
                      </div>
                      <div style={{ ...listCell, fontWeight: 600, color: opp.incomingUnits != null ? C.blueDark : C.inkFaint, textAlign: "right" as const }}>
                        {opp.incomingUnits != null ? opp.incomingUnits : "\u2014"}
                      </div>
                      <div style={{ ...listCell, color: opp.opNumber ? C.ink : C.inkFaint }}>
                        {opp.opNumber ? (
                          <span>{opp.opNumber}{ageLabel && <span style={{ fontSize: 8, color: C.inkFaint, marginLeft: 2 }}>({ageLabel})</span>}</span>
                        ) : "\u2014"}
                      </div>
                      <div style={{ ...listCell }}>
                        <button
                          onClick={() => setExpandedRef(expandedRef === opp.replacementReference ? null : opp.replacementReference)}
                          style={{
                            fontFamily: T.mono, fontSize: 9, fontWeight: 600, color: C.blueDark,
                            background: "none", border: "none", cursor: "pointer", padding: 0,
                            textDecoration: "underline", textUnderlineOffset: 2,
                          }}
                        >
                          {opp.targets.length} referencia{opp.targets.length !== 1 ? "s" : ""}
                        </button>
                      </div>
                    </div>
                    {/* Expanded targets */}
                    {expandedRef === opp.replacementReference && (
                      <div style={{
                        padding: `${S[2]} ${S[4]}`, background: `${C.blueDark}06`,
                        borderBottom: `1px solid ${C.lineSubtle}`,
                      }}>
                        <div style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 600, color: C.inkMid, marginBottom: S[1] }}>
                          Sirve para reemplazar {opp.targets.length} necesidad{opp.targets.length !== 1 ? "es" : ""}:
                        </div>
                        {opp.targets.map((t, ti) => (
                          <div key={ti} style={{
                            fontFamily: T.mono, fontSize: 9, color: C.inkMid,
                            display: "flex", gap: S[3], padding: "2px 0",
                          }}>
                            <span style={{ color: C.ink, fontWeight: 600 }}>{t.vendorId}</span>
                            <span>{t.groupName} / {t.subgroupName}</span>
                            <span style={{ color: C.red }}>faltan {t.faltante}</span>
                          </div>
                        ))}
                        {opp.source === "OP_ACTIVA" && opDate && (
                          <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, marginTop: S[1] }}>
                            Ultima actividad: {opDate}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
              {coverageResult.textileCoverage.length > 10 && !showAllGaps && (
                <button onClick={() => setShowAllGaps(true)} style={showMoreBtnStyle}>
                  Ver todas ({coverageResult.textileCoverage.length})
                </button>
              )}
            </div>
          )}

          {/* ── Oportunidades de Importacion (grouped by size) ── */}
          {coverageResult.importCoverage.length > 0 && (() => {
            const SIZE_ORDER = ["PEQUENO", "MEDIANO", "GRANDE"] as const;
            const SIZE_LABELS: Record<string, string> = { PEQUENO: "Pequeno", MEDIANO: "Mediano", GRANDE: "Grande" };
            const bySize = new Map<string, typeof coverageResult.importCoverage>();
            for (const opp of coverageResult.importCoverage) {
              const key = opp.sizeClass || "SIN_TAMANO";
              const list = bySize.get(key) ?? [];
              list.push(opp);
              bySize.set(key, list);
            }
            const sizeGroups: { size: string; label: string; items: typeof coverageResult.importCoverage }[] = SIZE_ORDER
              .filter((s) => bySize.has(s))
              .map((s) => ({ size: s as string, label: SIZE_LABELS[s] ?? s, items: bySize.get(s)! }));
            // Append any uncategorized
            for (const [k, v] of bySize) {
              if (!SIZE_ORDER.includes(k as any)) {
                sizeGroups.push({ size: k, label: k, items: v });
              }
            }

            return (
              <div style={{ marginBottom: S[4] }}>
                <div style={{
                  fontFamily: T.mono, fontSize: 10, fontWeight: 700, color: C.titleDeep,
                  textTransform: "uppercase" as const, letterSpacing: "0.08em",
                  marginBottom: S[2],
                }}>
                  Importacion ({coverageResult.importCoverage.length})
                </div>
                {sizeGroups.map((sg) => (
                  <div key={sg.size} style={{ marginBottom: S[3] }}>
                    <div style={{
                      fontFamily: T.mono, fontSize: 9, fontWeight: 700, color: C.blueDark,
                      textTransform: "uppercase" as const, letterSpacing: "0.06em",
                      marginBottom: S[1], paddingLeft: S[1],
                    }}>
                      {sg.label} ({sg.items.length})
                    </div>
                    <div style={{
                      background: C.white, borderRadius: R.lg,
                      border: `1px solid ${C.line}`, boxShadow: `0 1px 3px ${C.ink}06`,
                      overflow: "hidden", overflowX: "auto", minWidth: 0,
                    }}>
                      <div style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(80px,0.9fr) minmax(120px,1.5fr) 70px 70px minmax(80px,0.8fr)",
                        padding: `10px 16px`, background: C.surfaceAlt,
                        borderBottom: `1px solid ${C.line}`, gap: S[2], alignItems: "center",
                      }}>
                        {["Referencia", "Descripcion", "Disponible", "Confianza", "Sirve para"].map((h) => (
                          <div key={h} style={{
                            ...listHeaderCell,
                            textAlign: h === "Disponible" ? "right" as const : undefined,
                          }}>{h}</div>
                        ))}
                      </div>
                      {sg.items.map((opp, i) => (
                        <div key={`${opp.replacementReference}-${i}`}>
                          <div style={{
                            display: "grid",
                            gridTemplateColumns: "minmax(80px,0.9fr) minmax(120px,1.5fr) 70px 70px minmax(80px,0.8fr)",
                            padding: ROW_PAD,
                            borderBottom: i === sg.items.length - 1 ? "none" : `1px solid ${C.lineSubtle}`,
                            gap: S[2], alignItems: "center",
                          }}>
                            <div style={{ ...listCell, fontWeight: 700, color: C.titleDeep }}>{opp.replacementReference}</div>
                            <div style={{ ...listCell, color: C.inkMid, fontSize: 10 }}>{opp.replacementDescription}</div>
                            <div style={{ ...listCell, fontWeight: 600, color: C.green, textAlign: "right" as const }}>{opp.availableNow}</div>
                            <div style={{
                              ...listCell, fontWeight: 600, fontSize: 9,
                              color: opp.confidence === "ALTA" ? C.green : opp.confidence === "MEDIA" ? C.amber : C.red,
                            }}>{opp.confidence}</div>
                            <div style={{ ...listCell }}>
                              <button
                                onClick={() => setExpandedRef(expandedRef === opp.replacementReference ? null : opp.replacementReference)}
                                style={{
                                  fontFamily: T.mono, fontSize: 9, fontWeight: 600, color: C.blueDark,
                                  background: "none", border: "none", cursor: "pointer", padding: 0,
                                  textDecoration: "underline", textUnderlineOffset: 2,
                                }}
                              >
                                {opp.targets.length} vendedor{opp.targets.length !== 1 ? "es" : ""}
                              </button>
                            </div>
                          </div>
                          {expandedRef === opp.replacementReference && (
                            <div style={{
                              padding: `${S[2]} ${S[4]}`, background: `${C.blueDark}06`,
                              borderBottom: `1px solid ${C.lineSubtle}`,
                            }}>
                              {opp.targets.map((t, ti) => (
                                <div key={ti} style={{
                                  fontFamily: T.mono, fontSize: 9, color: C.inkMid,
                                  display: "flex", gap: S[3], padding: "2px 0",
                                }}>
                                  <span style={{ color: C.ink, fontWeight: 600 }}>{t.vendorId}</span>
                                  <span>{t.subgroupName}</span>
                                  <span style={{ color: C.red }}>faltan {t.faltante}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Empty state — no opportunities at all */}
          {coverageResult.textileCoverage.length === 0 && coverageResult.importCoverage.length === 0 && (
            <div style={{
              padding: S[5], background: C.white, borderRadius: R.lg,
              border: `1px solid ${C.line}`,
            }}>
              <div style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 600, color: C.green }}>
                Sin faltantes de cobertura. Todos los subgrupos del derrotero estan completos.
              </div>
            </div>
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
        size="extra-wide"
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
              {/* Row 1: Operational KPIs (COMERCIAL-MALETAS-DRAWER-OPERATIONAL-UX-02) */}
              <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
                <DrawerKpiCard
                  label="Muestras en maleta"
                  value={allPresenceRefs.length}
                  sub={`${commercialRefs.length} vigentes · ${retiroRefs.length} para retirar`}
                  tooltip={`${allPresenceRefs.length} muestras presentes en maleta (F34). ${commercialRefs.length} vigentes. ${retiroRefs.length} para retirar.`}
                />
                <DrawerKpiCard
                  label="Vigentes"
                  value={commercialRefs.length}
                  sub="referencias activas"
                  color={C.green}
                />
                <DrawerKpiCard
                  label="Para retirar"
                  value={retiroRefs.length}
                  sub="cierre anual"
                  color={retiroRefs.length > 0 ? C.red : C.inkFaint}
                />
              </div>

              {/* Row 2: Tab switcher (COMERCIAL-MALETAS-DRAWER-OPERATIONAL-UX-02 — Phase 5) */}
              <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${C.line}` }}>
                {(["referencias", "retiro", "inteligencia", "derrotero"] as const).map((tab) => {
                  const isActive = drawerTab === tab;
                  const label = tab === "referencias" ? "Referencias"
                    : tab === "retiro" ? `Retiro${retiroRefs.length > 0 ? ` (${retiroRefs.length})` : ""}`
                    : tab === "inteligencia" ? "Inteligencia" : "Derrotero";
                  return (
                    <button
                      key={tab}
                      onClick={() => setDrawerTab(tab)}
                      style={{
                        fontFamily: T.mono, fontSize: 11, fontWeight: isActive ? 800 : 600,
                        color: isActive ? C.blueDark : C.inkFaint,
                        background: isActive ? C.blueLight : "transparent",
                        border: "none",
                        borderBottom: `3px solid ${isActive ? C.blueDark : "transparent"}`,
                        cursor: "pointer",
                        padding: "10px 16px 8px",
                        transition: "all 0.12s",
                        flex: 1,
                        textAlign: "center" as const,
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Tab: Referencias/Retiro — search bar (GO-LIVE-MALETAS-REFERENCIAS-POR-LINEA-01) ── */}
            {(drawerTab === "referencias" || drawerTab === "retiro") && (
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
                    const isExpanded_ = lineExpanded[lineName] === true; // default closed (COMERCIAL-MALETAS-DRAWER-OPERATIONAL-UX-02)
                    const localFilter = lineFilters[lineName] ?? "all";
                    const localVisibleCount = lineVisibleCounts[lineName] ?? PAGE_SIZE;

                    // COMERCIAL-MALETAS-RETIRO-UI-CONSOLIDATION-01:
                    // Active groups contain ONLY vigentes refs (retiro filtered out upstream).
                    const lineCommercial = lineRefs.length;

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
                          {/* Inline summary chips (COMERCIAL-MALETAS-DRAWER-OPERATIONAL-UX-02 — Phase 8) */}
                          <span style={{ display: "flex", gap: S[2], flexWrap: "wrap", justifyContent: "flex-end" }}>
                            {lineCommercial > 0 && <span style={{ fontFamily: T.mono, fontSize: 9, color: C.green }}>{lineCommercial} vigentes</span>}
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
                                      <CommercialReferenceThumbnail imageUrl={ref.imageUrl} reference={ref.reference} description={ref.description} />

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
                                        color: ref.stockDataState === "ABSENT" ? C.inkFaint
                                          : ref.centralAvailable <= 0 ? C.red
                                          : ref.centralAvailable <= ref.minimumRequired ? C.amber
                                          : C.ink,
                                      }}>
                                        {ref.stockDataState === "ABSENT" ? "\u2014" : ref.centralAvailable}
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
                                      <ReplacementDetailPanel ref_={ref} />
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

            </div>
            )}

            {/* ── Tab: Retiro — transversal, grouped by line (COMERCIAL-MALETAS-RETIRO-UI-CONSOLIDATION-01) ── */}
            {drawerTab === "retiro" && (
            <div ref={tableContainerRef} style={{
              flex: 1,
              overflowY: "auto" as const,
              minHeight: 0,
            }}>
              {retiroLineGroups.length === 0 ? (
                <div style={{
                  padding: S[5], textAlign: "center",
                  fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint,
                  background: C.surfaceAlt, borderRadius: R.md,
                  marginTop: S[2],
                }}>
                  Sin referencias para retirar
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
                  {retiroLineGroups.map(([lineName, lineRefs]) => {
                    const isExpanded_ = lineExpanded[`RETIRO_${lineName}`] === true;
                    const localVisibleCount = lineVisibleCounts[`RETIRO_${lineName}`] ?? PAGE_SIZE;
                    const sorted = [...lineRefs].sort((a, b) => a.centralAvailable - b.centralAvailable);
                    const visible = sorted.slice(0, localVisibleCount);
                    const hasMoreLine = localVisibleCount < sorted.length;

                    return (
                      <div key={lineName} style={{
                        border: `1px solid ${C.line}`, borderRadius: R.md,
                        overflow: "hidden",
                      }}>
                        {/* Accordion header */}
                        <button
                          onClick={() => setLineExpanded((prev) => ({ ...prev, [`RETIRO_${lineName}`]: !isExpanded_ }))}
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
                            {DERROTERO_LINE_LABEL[lineName] ?? lineName} ({lineRefs.length})
                          </span>
                          <span style={{ fontFamily: T.mono, fontSize: 9, color: C.red }}>
                            {lineRefs.length} para retirar
                          </span>
                        </button>

                        {/* Expanded content */}
                        {isExpanded_ && (
                          <div>
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

                              {/* Rows */}
                              {visible.map((ref) => {
                                const isImportRow = lineName === "IMPORT";
                                const rowCols = isImportRow ? REF_TABLE_COLS_IMPORT : REF_TABLE_COLS;
                                return (
                                  <div key={ref.reference}>
                                    <div
                                      className="ag-op-row"
                                      style={{
                                        display: "grid",
                                        gridTemplateColumns: rowCols,
                                        padding: `${S[2]}px ${S[3]}px`,
                                        borderBottom: `1px solid ${C.line}`,
                                        alignItems: "center",
                                        gap: S[2],
                                      }}
                                    >
                                      <CommercialReferenceThumbnail imageUrl={ref.imageUrl} reference={ref.reference} description={ref.description} />
                                      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600, color: C.titleDeep, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, minWidth: 0 }}>
                                        {ref.reference}
                                      </div>
                                      <div title={ref.description} style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, minWidth: 0 }}>
                                        {ref.description}
                                      </div>
                                      <div title={ref.grupoSag ?? ""} style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, minWidth: 0 }}>
                                        {ref.grupoSag ?? "\u2014"}
                                      </div>
                                      <div title={ref.subgrupoSag} style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, minWidth: 0 }}>
                                        {ref.subgrupoSag}
                                      </div>
                                      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                                        {ref.line}
                                      </div>
                                      {isImportRow && (
                                        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                                          {ref.sizeClass ?? "\u2014"}
                                        </div>
                                      )}
                                      <div style={{
                                        fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600,
                                        textAlign: "right" as const,
                                        color: ref.stockDataState === "ABSENT" ? C.inkFaint : ref.centralAvailable <= 0 ? C.red : C.amber,
                                      }}>
                                        {ref.stockDataState === "ABSENT" ? "\u2014" : ref.centralAvailable}
                                      </div>
                                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <CommercialHealthBadge health={ref.commercialHealth} />
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Load more */}
                            {hasMoreLine && (
                              <button
                                onClick={() => setLineVisibleCounts((prev) => ({ ...prev, [`RETIRO_${lineName}`]: (prev[`RETIRO_${lineName}`] ?? PAGE_SIZE) + PAGE_SIZE }))}
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
            </div>
            )}

            {/* ── Tab: Inteligencia — Centro de decisiones (COMERCIAL-MALETAS-INTELLIGENCE-REDESIGN-01) ── */}
            {drawerTab === "inteligencia" && selectedVendor && (
              <div style={{ flex: 1, overflowY: "auto" as const, minHeight: 0, paddingTop: S[2] }}>
                <IntelligencePanel
                  vendor={selectedVendor}
                  commercialRefs={commercialRefs}
                  retiroRefs={retiroRefs}
                  coverageByLine={coverageByLine}
                  derroteroRules={derroteroRules}
                  onNavigate={(target) => {
                    setDrawerTab(target.tab);
                    if (target.tab === "referencias" && target.line) {
                      setLineExpanded((prev) => ({ ...prev, [target.line!]: true }));
                    }
                  }}
                />
              </div>
            )}

            {/* ── Tab: Derrotero ideal (COMERCIAL-MALETAS-DRAWER-OPERATIONAL-UX-02 — Phase 6) ── */}
            {drawerTab === "derrotero" && selectedVendor && (
              <div style={{ flex: 1, overflowY: "auto" as const, minHeight: 0, paddingTop: S[2] }}>
                {/* COMERCIAL-MALETAS-DERROTERO-EXCLUDE-RETIRO-01 — Phase 8 */}
                <div style={{
                  padding: `${S[3]}px ${S[3]}px`,
                  background: C.surfaceAlt, borderRadius: R.sm, marginBottom: S[3],
                  border: `1px solid ${C.line}`,
                }}>
                  <div style={{ display: "flex", gap: S[3], marginBottom: S[1] }}>
                    <div style={{ fontFamily: T.mono, fontSize: 10, color: C.ink }}>
                      <span style={{ fontWeight: 800 }}>{allPresenceRefs.length}</span> muestras en maleta
                    </div>
                    <div style={{ fontFamily: T.mono, fontSize: 10, color: C.red }}>
                      <span style={{ fontWeight: 800 }}>−{retiroRefs.length}</span> para retirar
                    </div>
                    <div style={{ fontFamily: T.mono, fontSize: 10, color: C.green, fontWeight: 700 }}>
                      = {commercialRefs.length} evaluadas
                    </div>
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
                    El derrotero se calcula unicamente con referencias vigentes.
                  </div>
                </div>
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
          value={ref_.stockDataState === "ABSENT" ? "\u2014" : String(ref_.centralAvailable)}
          color={ref_.stockDataState === "ABSENT" ? C.inkFaint : ref_.centralAvailable <= 0 ? C.red : C.amber}
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

// ── Detail Field ─────────────────────────────────────────────────────────────

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
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: accentColor }}>{ref_.availableB24 ?? 0}</div>
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
            : "DISPONIBLE"}
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

function VendorCard({ vendor, intel, baseMetrics, onClick, onToggleActivation, activationLoading }: { vendor: VendorSampleSnapshot; intel?: VendorCommercialIntelligence; baseMetrics?: VendorMalletBaseMetrics; onClick: () => void; onToggleActivation?: (vendorId: string, currentActive: boolean) => void; activationLoading?: string | null }) {
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

            {/* CTA row */}
            <div style={{ display: "flex", gap: S[2], marginTop: 8 }}>
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
const REF_TABLE_COLS = "36px 80px minmax(120px,1.4fr) minmax(80px,0.6fr) minmax(90px,0.7fr) 56px 72px 100px";
// Import adds Tamano column
const REF_TABLE_COLS_IMPORT = "36px 80px minmax(120px,1.2fr) minmax(70px,0.5fr) minmax(80px,0.6fr) 56px 64px 72px 100px";

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

// ── Intelligence Panel (COMERCIAL-MALETAS-INTELLIGENCE-REDESIGN-01) ──────────
//
// Centro de decisiones del jefe comercial.
// No repite datos de Referencias, Derrotero ni Inventario.
// Responde: ¿Qué decisiones debo tomar hoy sobre esta maleta?
//
// Secciones:
// 1. Salud del derrotero — cobertura por marca (tarjetas grandes)
// 2. Referencias en riesgo — próximas a retiro pero aún vigentes
// 3. Riesgo de perder cobertura — proyección si no se actúa
// 4. Calidad del mostrario — auditoría de la composición
// 5. Acciones por línea — tarjetas visuales Agregar/Retirar
// 6. Impacto esperado — simulación post-acciones

type NavigateTarget =
  | { tab: "referencias"; line?: string; filter?: DrawerFilter }
  | { tab: "retiro"; line?: string }
  | { tab: "derrotero"; line?: string };

type CoverageByLineEntry = { complete: number; total: number; pct: number; missing: number; excess: number; catalogName: string };

// ── Risk zone: refs approaching retiro but still vigentes ─────────────────
const RISK_MARGIN: Record<string, { min: number; max: number }> = {
  CS: { min: 21, max: 30 },
  LT: { min: 31, max: 40 },
  IMPORT: { min: 11, max: 20 },
};

// ── IntelligencePanel ────────────────────────────────────────────────────────

function IntelligencePanel({ vendor, commercialRefs, retiroRefs, coverageByLine, derroteroRules, onNavigate }: {
  vendor: VendorSampleSnapshot;
  commercialRefs: VendorSampleRef[];
  retiroRefs: VendorSampleRef[];
  coverageByLine: Map<string, CoverageByLineEntry>;
  derroteroRules: IdealRouteRule[];
  onNavigate?: (target: NavigateTarget) => void;
}) {
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

  // ── 1. Salud del derrotero ──────────────────────────────────────────
  const coverageCards = useMemo(() => {
    const lineOrder = ["CS", "LT", "IMPORT"];
    return lineOrder
      .map((line) => ({ line, cov: coverageByLine.get(line) }))
      .filter((x): x is { line: string; cov: CoverageByLineEntry } => x.cov != null);
  }, [coverageByLine]);

  // ── 2. Referencias en riesgo ────────────────────────────────────────
  const riskByLine = useMemo(() => {
    const result: { line: string; label: string; count: number; rangeLabel: string }[] = [];
    for (const [lineKey, range] of Object.entries(RISK_MARGIN)) {
      const count = commercialRefs.filter((r) =>
        r.line === lineKey &&
        r.stockDataState === "CERTIFIED" &&
        r.centralAvailable >= range.min &&
        r.centralAvailable <= range.max,
      ).length;
      if (count > 0) {
        result.push({
          line: lineKey,
          label: DERROTERO_LINE_LABEL[lineKey] ?? lineKey,
          count,
          rangeLabel: `entre ${range.min} y ${range.max} unidades`,
        });
      }
    }
    return result;
  }, [commercialRefs]);

  // ── 3. Riesgo de perder cobertura ───────────────────────────────────
  const coverageRisk = useMemo(() => {
    const result: { line: string; label: string; groups: number; subgroups: number; horizon: string }[] = [];
    const activeRules = derroteroRules.filter((r) => r.isActive);

    for (const lineKey of ["CS", "LT", "IMPORT"]) {
      const range = RISK_MARGIN[lineKey];
      if (!range) continue;
      const atRiskRefs = commercialRefs.filter((r) =>
        r.line === lineKey &&
        r.stockDataState === "CERTIFIED" &&
        r.centralAvailable >= range.min &&
        r.centralAvailable <= range.max,
      );
      if (atRiskRefs.length === 0) continue;

      // Count groups/subgroups that would be impacted
      const atRiskSubgroups = new Set(atRiskRefs.map((r) => r.subgrupoSag));
      const atRiskGroups = new Set(atRiskRefs.map((r) => r.grupoSag).filter(Boolean));

      // Check how many subgroups would lose coverage
      const rulesByKey = new Map<string, IdealRouteRule>();
      for (const rule of activeRules) {
        if (rule.line === lineKey) rulesByKey.set(rule.subgrupoSag, rule);
      }

      let subgroupsAtRisk = 0;
      for (const sg of atRiskSubgroups) {
        const rule = rulesByKey.get(sg);
        if (rule) {
          const currentCount = commercialRefs.filter((r) => r.line === lineKey && r.subgrupoSag === sg).length;
          if (currentCount <= rule.minimumRefs) subgroupsAtRisk++;
        } else {
          subgroupsAtRisk++;
        }
      }

      if (subgroupsAtRisk > 0 || atRiskGroups.size > 0) {
        // Estimate horizon based on avg stock position
        const avgStock = atRiskRefs.reduce((s, r) => s + r.centralAvailable, 0) / atRiskRefs.length;
        const daysEstimate = avgStock <= range.min + 3 ? 7 : avgStock <= range.min + 5 ? 15 : 30;
        result.push({
          line: lineKey,
          label: DERROTERO_LINE_LABEL[lineKey] ?? lineKey,
          groups: atRiskGroups.size,
          subgroups: subgroupsAtRisk,
          horizon: daysEstimate <= 7 ? "esta semana" : `en ~${daysEstimate} dias`,
        });
      }
    }
    return result;
  }, [commercialRefs, derroteroRules]);

  // ── 4. Calidad del mostrario ────────────────────────────────────────
  const quality = useMemo(() => {
    const total = vendor.refs.length;
    const vigentes = commercialRefs.length;
    const retiro = retiroRefs.length;
    const retiroUrgente = retiroRefs.filter((r) =>
      r.stockDataState === "CERTIFIED" && r.centralAvailable <= 0,
    ).length;
    const rotacionBaja = commercialRefs.filter((r) => {
      if (r.stockDataState !== "CERTIFIED") return false;
      const range = RISK_MARGIN[r.line];
      return range != null && r.centralAvailable >= range.min && r.centralAvailable <= range.max;
    }).length;
    const sinClasificar = vendor.refs.filter((r) =>
      r.line === "OTRO" || r.subgrupoSag === "OTRO" || r.subgrupoSag === "SIN_SUBGRUPO" ||
      r.subgrupoSag === "SIN CLASIFICAR" || r.subgrupoSag === "",
    ).length;
    return { total, vigentes, retiro, retiroUrgente, rotacionBaja, sinClasificar };
  }, [vendor, commercialRefs, retiroRefs]);

  // ── 5. Acciones por linea ───────────────────────────────────────────
  const lineActions = useMemo(() => {
    const result: { line: string; label: string; agregar: number; retirar: number }[] = [];
    for (const lineKey of ["CS", "LT", "IMPORT"]) {
      const lineRetiro = retiroRefs.filter((r) => r.line === lineKey).length;
      // "Agregar" = missing from derrotero for this line
      const cov = coverageByLine.get(lineKey);
      const agregar = cov ? cov.missing : 0;
      if (agregar > 0 || lineRetiro > 0) {
        result.push({
          line: lineKey,
          label: DERROTERO_LINE_LABEL[lineKey] ?? lineKey,
          agregar,
          retirar: lineRetiro,
        });
      }
    }
    return result;
  }, [retiroRefs, coverageByLine]);

  // ── 6. Impacto esperado ─────────────────────────────────────────────
  const projectedImpact = useMemo(() => {
    const result: { line: string; label: string; current: number; projected: number }[] = [];
    for (const lineKey of ["CS", "LT", "IMPORT"]) {
      const cov = coverageByLine.get(lineKey);
      if (!cov || cov.total === 0) continue;
      // If all missing refs are added and excess retiro removed
      const projectedComplete = Math.min(cov.total, cov.complete + cov.missing);
      const projectedPct = Math.round((projectedComplete / cov.total) * 100);
      result.push({
        line: lineKey,
        label: DERROTERO_LINE_LABEL[lineKey] ?? lineKey,
        current: cov.pct,
        projected: projectedPct,
      });
    }
    return result;
  }, [coverageByLine]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[5], padding: `${S[2]}px 0` }}>

      {/* ── 1. Salud del derrotero (tarjetas grandes) ── */}
      <div>
        {sectionTitle("Salud del derrotero")}
        <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
          {coverageCards.length === 0 ? (
            <div style={{
              padding: S[4], fontFamily: T.mono, fontSize: 10, color: C.inkFaint,
              background: C.surfaceAlt, borderRadius: R.md, border: `1px solid ${C.line}`,
              textAlign: "center",
            }}>
              Sin derrotero configurado para esta maleta
            </div>
          ) : coverageCards.map(({ line, cov }) => {
            const label = DERROTERO_LINE_LABEL[line] ?? line;
            const pct = cov.total > 0 ? cov.pct : 0;
            const color = cov.total > 0 ? (pct >= 80 ? C.green : pct >= 50 ? C.amber : C.red) : C.inkFaint;
            return (
              <button
                key={line}
                onClick={() => onNavigate?.({ tab: "derrotero", line })}
                style={{
                  display: "flex", flexDirection: "column", gap: S[2],
                  padding: S[4],
                  background: C.white,
                  border: `1px solid ${color}30`,
                  borderRadius: R.lg,
                  cursor: "pointer",
                  transition: "all 0.15s",
                  textAlign: "left" as const,
                  boxShadow: `0 1px 4px ${color}10`,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = color; e.currentTarget.style.boxShadow = `0 2px 8px ${color}20`; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${color}30`; e.currentTarget.style.boxShadow = `0 1px 4px ${color}10`; }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 800, color: C.titleDeep }}>
                    {label}
                  </span>
                  <span style={{ fontFamily: T.mono, fontSize: 22, fontWeight: 800, color }}>
                    {cov.total > 0 ? `${pct}%` : "\u2014"}
                  </span>
                </div>
                {/* Progress bar */}
                <div style={{ width: "100%", height: 8, borderRadius: R.pill, background: C.line, overflow: "hidden" }}>
                  <div style={{
                    width: `${pct}%`, height: "100%", borderRadius: R.pill,
                    background: color,
                    transition: "width 0.4s ease",
                  }} />
                </div>
                <span style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint }}>
                  {cov.complete} / {cov.total} completos
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 2. Referencias en riesgo ── */}
      <div>
        {sectionTitle("Referencias en riesgo")}
        {riskByLine.length === 0 ? (
          <div style={{
            padding: S[3], fontFamily: T.mono, fontSize: 10, color: C.green,
            background: C.greenLight, borderRadius: R.md, border: `1px solid ${C.greenBorder}`,
          }}>
            Sin referencias proximas a retiro
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
            {riskByLine.map((r) => (
              <div key={r.line} style={{
                display: "flex", alignItems: "center", gap: S[3],
                padding: `${S[3]}px ${S[4]}px`,
                background: C.amberLight,
                border: `1px solid ${C.amberBorder}`,
                borderRadius: R.md,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 700, color: C.titleDeep }}>
                    {r.label}
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkMid, marginTop: 2 }}>
                    {r.rangeLabel}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: T.mono, fontSize: 18, fontWeight: 800, color: C.amber }}>
                    {r.count}
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint }}>
                    referencia{r.count !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>
            ))}
            <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, paddingTop: S[1] }}>
              Estas referencias aun son vigentes pero pueden convertirse en retiro si su inventario sigue bajando.
            </div>
          </div>
        )}
      </div>

      {/* ── 3. Riesgo de perder cobertura ── */}
      <div>
        {sectionTitle("Riesgo de perder cobertura")}
        {coverageRisk.length === 0 ? (
          <div style={{
            padding: S[3], fontFamily: T.mono, fontSize: 10, color: C.green,
            background: C.greenLight, borderRadius: R.md, border: `1px solid ${C.greenBorder}`,
          }}>
            Sin riesgo de perdida de cobertura
          </div>
        ) : (
          <div style={{
            padding: S[4],
            background: C.redLight,
            border: `1px solid ${C.redBorder}`,
            borderRadius: R.lg,
          }}>
            <div style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700, color: C.red, marginBottom: S[3] }}>
              Si hoy no ingresan referencias nuevas:
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
              {coverageRisk.map((r) => (
                <div key={r.line} style={{
                  padding: `${S[3]}px`,
                  background: C.white,
                  borderRadius: R.md,
                  border: `1px solid ${C.redBorder}`,
                }}>
                  <div style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 700, color: C.titleDeep, marginBottom: S[1] }}>
                    {r.label}
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: 10, color: C.ink }}>
                    {r.groups > 0 && <>perdera <span style={{ fontWeight: 800, color: C.red }}>{r.groups}</span> grupo{r.groups !== 1 ? "s" : ""}</>}
                    {r.groups > 0 && r.subgroups > 0 && " · "}
                    {r.subgroups > 0 && <><span style={{ fontWeight: 800, color: C.red }}>{r.subgroups}</span> subgrupo{r.subgroups !== 1 ? "s" : ""}</>}
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: 9, color: C.red, fontWeight: 600, marginTop: 2 }}>
                    {r.horizon}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── 4. Calidad del mostrario ── */}
      <div>
        {sectionTitle("Calidad del mostrario")}
        <div style={{
          display: "flex", flexDirection: "column", gap: 0,
          background: C.white, borderRadius: R.lg,
          border: `1px solid ${C.line}`,
          overflow: "hidden",
        }}>
          {[
            { label: "Vigentes", value: quality.vigentes, color: C.green },
            { label: "Para retirar", value: quality.retiro, color: C.red },
            { label: "Retiro urgente (sin inventario)", value: quality.retiroUrgente, color: C.red, indent: true },
            { label: "Rotacion baja (proximas a retiro)", value: quality.rotacionBaja, color: C.amber, indent: true },
            { label: "Sin clasificacion", value: quality.sinClasificar, color: C.inkFaint },
          ].map(({ label, value, color, indent }, i) => (
            <div key={label} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: `${S[2]}px ${S[4]}px`,
              paddingLeft: indent ? S[6] : S[4],
              borderBottom: i < 4 ? `1px solid ${C.lineSubtle}` : "none",
              background: indent ? `${C.surfaceAlt}80` : "transparent",
            }}>
              <span style={{ fontFamily: T.mono, fontSize: 10, color: C.ink }}>
                {label}
              </span>
              <span style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 800, color: value > 0 ? color : C.inkFaint }}>
                {value}
              </span>
            </div>
          ))}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: `${S[3]}px ${S[4]}px`,
            background: C.surfaceAlt,
            borderTop: `1px solid ${C.line}`,
          }}>
            <span style={{ fontFamily: T.mono, fontSize: 10, fontWeight: 700, color: C.titleDeep }}>
              Total muestras en maleta
            </span>
            <span style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 800, color: C.titleDeep }}>
              {quality.total}
            </span>
          </div>
        </div>
      </div>

      {/* ── 5. Acciones por linea ── */}
      <div>
        {sectionTitle("Acciones por linea")}
        {lineActions.length === 0 ? (
          <div style={{
            padding: S[3], fontFamily: T.mono, fontSize: 10, color: C.green,
            background: C.greenLight, borderRadius: R.md, border: `1px solid ${C.greenBorder}`,
          }}>
            Sin acciones pendientes
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(lineActions.length, 3)}, 1fr)`, gap: S[3] }}>
            {lineActions.map((la) => (
              <div key={la.line} style={{
                padding: S[4],
                background: C.white,
                border: `1px solid ${C.line}`,
                borderRadius: R.lg,
                textAlign: "center" as const,
                boxShadow: `0 1px 3px ${C.ink}06`,
              }}>
                <div style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 800, color: C.titleDeep, marginBottom: S[3] }}>
                  {la.label}
                </div>
                <div style={{ display: "flex", gap: S[3], justifyContent: "center" }}>
                  <div>
                    <div style={{ fontFamily: T.mono, fontSize: 20, fontWeight: 800, color: la.agregar > 0 ? C.green : C.inkFaint }}>
                      {la.agregar}
                    </div>
                    <div style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 600, color: C.inkFaint }}>
                      Agregar
                    </div>
                  </div>
                  <div style={{ width: 1, background: C.line, alignSelf: "stretch" }} />
                  <div>
                    <div style={{ fontFamily: T.mono, fontSize: 20, fontWeight: 800, color: la.retirar > 0 ? C.red : C.inkFaint }}>
                      {la.retirar}
                    </div>
                    <div style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 600, color: C.inkFaint }}>
                      Retirar
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 6. Impacto esperado ── */}
      <div>
        {sectionTitle("Impacto esperado")}
        <div style={{
          padding: S[3], fontFamily: T.mono, fontSize: 9, color: C.inkFaint, marginBottom: S[2],
        }}>
          Si se ejecutan todas las acciones pendientes:
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(projectedImpact.length, 3)}, 1fr)`, gap: S[3] }}>
          {projectedImpact.map((p) => {
            const improved = p.projected > p.current;
            const arrowColor = improved ? C.green : p.projected === p.current ? C.inkFaint : C.red;
            return (
              <div key={p.line} style={{
                padding: S[4],
                background: C.white,
                border: `1px solid ${improved ? C.greenBorder : C.line}`,
                borderRadius: R.lg,
                textAlign: "center" as const,
                boxShadow: improved ? `0 1px 4px ${C.green}12` : `0 1px 3px ${C.ink}06`,
              }}>
                <div style={{ fontFamily: T.mono, fontSize: 10, fontWeight: 700, color: C.titleDeep, marginBottom: S[2] }}>
                  {p.label}
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: S[2] }}>
                  <span style={{ fontFamily: T.mono, fontSize: 16, fontWeight: 800, color: C.inkFaint }}>
                    {p.current}%
                  </span>
                  <span style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 800, color: arrowColor }}>
                    →
                  </span>
                  <span style={{ fontFamily: T.mono, fontSize: 18, fontWeight: 800, color: improved ? C.green : arrowColor }}>
                    {p.projected}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
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
  RETIRO: "Retiro",
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

/* RefThumbnail replaced by shared CommercialReferenceThumbnail — see components/comercial/ */

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
