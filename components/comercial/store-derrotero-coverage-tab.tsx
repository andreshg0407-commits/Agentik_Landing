"use client";

/**
 * components/comercial/store-derrotero-coverage-tab.tsx
 *
 * AGENTIK-STORES-DERROTERO-COVERAGE-FOUNDATION-01
 *
 * Coverage analysis tab for the store drawer.
 * Consumes getStoreDerroteroCoverage() via API.
 * Shows per-line coverage, filters, gap expansion, variant detail,
 * cross-store allocation, Rule 36, and config editing.
 *
 * No vitest. No mock data. No SOAP calls.
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { C, T, S, R, panel } from "@/lib/ui/tokens";

// ── Client-side type mirrors (no server imports) ──────────────────────────────

type StoreDerroteroLine = "CASTILLITOS" | "LATIN_KIDS" | "ACCESSORIES";
type DerroteroEntryCoverageStatus = "COVERED" | "UNCOVERED";
type ReferenceHealthStatus = "BAJO_MINIMO" | "SALUDABLE" | "SOBRE_MAXIMO";

interface DerroteroReferenceDetail {
  referenceCode: string;
  unitsInStore: number;
  unitsInMainWarehouse: number;
  healthStatus: ReferenceHealthStatus;
}

interface StoreDerroteroEntry {
  entryCode: string;
  entryName: string;
  line: StoreDerroteroLine;
  sagGrupo: string | null;
  sagSubgrupo: string | string[] | null;
  sizeClass: string | null;
  matchMode: string;
  minimumCoverageReferences: number;
  minUnitsPerRef: number;
  idealUnitsPerRef: number;
  maxUnitsPerRef: number;
  priority: number;
  active: boolean;
  sourceEvidence: string;
}

interface CoverageItem {
  entry: StoreDerroteroEntry;
  coverageStatus: DerroteroEntryCoverageStatus;
  referenceCount: number;
  matchedRefs: string[];
  totalUnits: number;
  belowMinimumReferenceCount: number;
  healthyReferenceCount: number;
  overMaximumReferenceCount: number;
  referenceDetails: DerroteroReferenceDetail[];
  varietyStatus: string;
  totalUnitsInMainWarehouse: number;
  mainWarehouseCandidateCount: number;
}

interface LineCoverageResult {
  line: StoreDerroteroLine;
  totalEntries: number;
  covered: number;
  uncovered: number;
  coveragePercent: number;
  totalReferences: number;
  belowMinimumTotal: number;
  healthyTotal: number;
  overMaximumTotal: number;
  items: CoverageItem[];
}

interface CoverageResult {
  storeId: string;
  storeName: string;
  castillitos: LineCoverageResult;
  latinKids: LineCoverageResult;
  accessories: LineCoverageResult;
  overallCoveragePercent: number;
  totalEntries: number;
  totalCovered: number;
  totalUncovered: number;
  computedAt: string;
}

// ── Filter types ──────────────────────────────────────────────────────────────

type CoverageFilter =
  | "ALL"
  | "COVERED"
  | "UNCOVERED"
  | "PARTIAL"
  | "WITH_CANDIDATE"
  | "RULE36_BLOCKED";

const FILTER_LABELS: Record<CoverageFilter, string> = {
  ALL:            "Todos",
  COVERED:        "Cubiertos",
  UNCOVERED:      "Descubiertos",
  PARTIAL:        "Parciales",
  WITH_CANDIDATE: "Con candidato",
  RULE36_BLOCKED: "Bloqueados R36",
};

// ── Warehouse candidate types (for OCTAVO + NOVENO) ────────────────────────

interface WarehouseCandidateVariant {
  variantKey: string;
  size: string | null;
  color: string | null;
  physicalQty: number;
  operationalAvailableQty: number | null;
  stockQuality: string;
}

interface MainWarehouseCoverageCandidate {
  referenceCode: string;
  productName: string;
  line: StoreDerroteroLine;
  group: string;
  subgroup: string;
  sizeClass: string | null;
  mainWarehouseStock: number;
  coverableStores: string[];
  rule36BlockedStores: string[];
  distributableUnits: number;
  variants: WarehouseCandidateVariant[];
  totalVariantCount: number;
  totalVariantUnits: number;
  variantDataQuality: string;
  snapshotAt: string;
}

interface MainWarehouseCoverageMatrix {
  tenantId: string;
  candidates: MainWarehouseCoverageCandidate[];
  totalCandidates: number;
  totalCoverableGaps: number;
  totalRule36Blocked: number;
  computedAt: string;
}

interface StoreCoveragePriority {
  storeId: string;
  storeName: string;
  coverageGapId: string;
  priorityScore: number;
  priorityReasons: string[];
  blocked: boolean;
  blockedReason: string | null;
}

interface DerroteroVariantAllocation {
  variantKey: string;
  size: string | null;
  color: string | null;
  storeQtyBefore: number;
  warehouseQty: number;
  suggestedQty: number;
  storeQtyAfter: number;
  reason: string;
}

interface StoreAllocationEntry {
  storeId: string;
  storeName: string;
  coverageGapId: string;
  referenceCode: string;
  allocatedQty: number;
  variantAllocations: DerroteroVariantAllocation[];
  priorityScore: number;
  priorityReasons: string[];
}

interface WarehouseAllocationSimulation {
  allocationByStore: Record<string, StoreAllocationEntry[]>;
  totalAllocated: number;
  remainingWarehouseQty: number;
  uncoveredGaps: string[];
  blockedAllocations: Array<{ storeId: string; coverageGapId: string; reason: string }>;
  evidence: string[];
}

interface DerroteroCoverageGap {
  coverageGapId: string;
  storeSlug: string;
  storeName: string;
  entry: StoreDerroteroEntry;
  currentRefCount: number;
  refShortage: number;
  totalUnits: number;
  mainWarehouseCandidateCount: number;
  totalMainWarehouseUnits: number;
  rule36Blocked: boolean;
  storeVariants: Array<{ variantKey: string; size: string | null; color: string | null; qty: number }>;
}

interface DerroteroCoverageGapSummary {
  storeSlug: string;
  storeName: string;
  gaps: DerroteroCoverageGap[];
  totalGaps: number;
  coverableGaps: number;
  rule36BlockedGaps: number;
}

interface SummaryData {
  warehouseMatrix: MainWarehouseCoverageMatrix;
  gapSummaries: DerroteroCoverageGapSummary[];
  priorities: StoreCoveragePriority[];
  simulation: WarehouseAllocationSimulation;
}

// ── KPI filter type ──────────────────────────────────────────────────────────

type KpiFilter = "ALL" | "COVERED" | "UNCOVERED" | "BELOW_MIN" | "HEALTHY";

// ── Line navigation ──────────────────────────────────────────────────────────

const LINE_NAV: { key: StoreDerroteroLine; label: string }[] = [
  { key: "CASTILLITOS", label: "Castillitos" },
  { key: "LATIN_KIDS",  label: "Latin Kids" },
  { key: "ACCESSORIES", label: "Accesorios" },
];

// ── Styles ────────────────────────────────────────────────────────────────────

const mono2xs = { fontFamily: T.mono, fontSize: T.sz["2xs"] } as const;
const monoXs = { fontFamily: T.mono, fontSize: T.sz.xs } as const;
const monoSm = { fontFamily: T.mono, fontSize: T.sz.sm } as const;

function coverageColor(status: DerroteroEntryCoverageStatus): string {
  return status === "COVERED" ? C.green : C.red;
}

function healthColor(status: ReferenceHealthStatus): string {
  switch (status) {
    case "BAJO_MINIMO": return C.red;
    case "SALUDABLE": return C.green;
    case "SOBRE_MAXIMO": return C.amber;
  }
}

// ── Main Component ────────────────────────────────────────────────────────────

export function StoreDerroteroCoverageTab({
  orgSlug,
  storeId,
  storeName,
}: {
  orgSlug: string;
  storeId: string;
  storeName: string;
  editable?: boolean;
}) {
  const [coverage, setCoverage] = useState<CoverageResult | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [line, setLine] = useState<StoreDerroteroLine>("CASTILLITOS");
  const [filter, setFilter] = useState<CoverageFilter>("ALL");
  const [kpiFilter, setKpiFilter] = useState<KpiFilter>("ALL");
  const [search, setSearch] = useState("");
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [prevStoreId, setPrevStoreId] = useState<string>(storeId);

  // ── Store change cleanup ──────────────────────────────────────────────
  if (storeId !== prevStoreId) {
    setPrevStoreId(storeId);
    setCoverage(null);
    setLine("CASTILLITOS");
    setFilter("ALL");
    setKpiFilter("ALL");
    setSearch("");
    setExpandedEntry(null);
    setSummary(null);
    setError(null);
  }

  // ── API helper ────────────────────────────────────────────────────────
  const fetchCoverage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orgs/${orgSlug}/comercial/tiendas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "derrotero_coverage", storeId }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      if (data.coverage) setCoverage(data.coverage);
      if (data.editable != null) setCanEdit(data.editable);
    } catch {
      setError("Error al cargar cobertura del derrotero");
    } finally {
      setLoading(false);
    }
  }, [orgSlug, storeId]);

  // Lazy-load summary (candidates + allocation) when first gap is expanded
  const fetchSummary = useCallback(async () => {
    if (summary || summaryLoading) return;
    setSummaryLoading(true);
    try {
      const res = await fetch(`/api/orgs/${orgSlug}/comercial/tiendas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "derrotero_summary", storeId }),
      });
      const data = await res.json();
      if (!data.error) setSummary(data);
    } catch { /* silent — summary is supplementary */ }
    finally { setSummaryLoading(false); }
  }, [orgSlug, storeId, summary, summaryLoading]);

  useEffect(() => {
    if (!coverage && !loading) fetchCoverage();
  }, [coverage, loading, fetchCoverage]);

  // ── Current line data ──────────────────────────────────────────────────
  const lineData: LineCoverageResult | null = useMemo(() => {
    if (!coverage) return null;
    switch (line) {
      case "CASTILLITOS": return coverage.castillitos;
      case "LATIN_KIDS": return coverage.latinKids;
      case "ACCESSORIES": return coverage.accessories;
    }
  }, [coverage, line]);

  // ── Filtered items ────────────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    if (!lineData) return [];
    let items = lineData.items;

    // KPI filter (takes precedence over coverage filter)
    if (kpiFilter !== "ALL") {
      switch (kpiFilter) {
        case "COVERED":
          items = items.filter(i => i.coverageStatus === "COVERED");
          break;
        case "UNCOVERED":
          items = items.filter(i => i.coverageStatus === "UNCOVERED");
          break;
        case "BELOW_MIN":
          items = items.filter(i => i.belowMinimumReferenceCount > 0);
          break;
        case "HEALTHY":
          items = items.filter(i => i.healthyReferenceCount > 0);
          break;
      }
    } else {
      // Coverage filter
      switch (filter) {
        case "COVERED":
          items = items.filter(i => i.coverageStatus === "COVERED");
          break;
        case "UNCOVERED":
          items = items.filter(i => i.coverageStatus === "UNCOVERED");
          break;
        case "PARTIAL":
          items = items.filter(i =>
            i.coverageStatus === "COVERED" && i.belowMinimumReferenceCount > 0,
          );
          break;
        case "WITH_CANDIDATE":
          items = items.filter(i => i.mainWarehouseCandidateCount > 0);
          break;
        case "RULE36_BLOCKED":
          items = items.filter(i => i.totalUnitsInMainWarehouse > 0 && i.mainWarehouseCandidateCount === 0);
          break;
      }
    }

    // Search
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(i =>
        i.entry.entryName.toLowerCase().includes(q) ||
        i.entry.entryCode.toLowerCase().includes(q) ||
        (i.entry.sagGrupo ?? "").toLowerCase().includes(q) ||
        (typeof i.entry.sagSubgrupo === "string" ? i.entry.sagSubgrupo.toLowerCase().includes(q) : false),
      );
    }

    return items;
  }, [lineData, filter, kpiFilter, search]);

  // ── KPI click handler ──────────────────────────────────────────────────
  function handleKpiClick(k: KpiFilter) {
    if (kpiFilter === k) {
      setKpiFilter("ALL");
      setFilter("ALL");
    } else {
      setKpiFilter(k);
      setFilter("ALL");
    }
  }

  // ── Line change ────────────────────────────────────────────────────────
  function handleLineChange(newLine: StoreDerroteroLine) {
    setLine(newLine);
    setFilter("ALL");
    setKpiFilter("ALL");
    setSearch("");
    setExpandedEntry(null);
  }

  // ── Loading state ──────────────────────────────────────────────────────
  if (loading && !coverage) {
    return (
      <div style={{ ...monoSm, color: C.inkLight, textAlign: "center", padding: S[8] }}>
        Cargando cobertura del derrotero...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...monoXs, color: C.red, padding: S[3], background: C.redLight, borderRadius: R.sm }}>
        {error}
      </div>
    );
  }

  if (!coverage || !lineData) {
    return (
      <div style={{ ...monoSm, color: C.inkFaint, textAlign: "center", padding: S[8] }}>
        Sin datos de cobertura
      </div>
    );
  }

  const isAccessories = line === "ACCESSORIES";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <span style={{ ...monoSm, fontWeight: T.wt.semibold, color: C.ink }}>
            Cobertura del Derrotero
          </span>
          <div style={{ ...mono2xs, color: C.inkFaint, marginTop: 2 }}>
            {coverage.overallCoveragePercent}% cobertura general · {coverage.totalCovered}/{coverage.totalEntries} puntos
          </div>
        </div>
        {!canEdit && (
          <span style={{ ...mono2xs, color: C.inkFaint, padding: "2px 6px", background: C.surface, borderRadius: R.pill, border: `1px solid ${C.line}` }}>
            Solo lectura
          </span>
        )}
      </div>

      {/* ── Line navigation ── */}
      <div style={{ display: "flex", gap: S[1] }}>
        {LINE_NAV.map(ln => {
          const ld = ln.key === "CASTILLITOS" ? coverage.castillitos
            : ln.key === "LATIN_KIDS" ? coverage.latinKids
            : coverage.accessories;
          const isActive = line === ln.key;
          return (
            <button
              key={ln.key}
              onClick={() => handleLineChange(ln.key)}
              style={{
                ...monoXs, fontWeight: T.wt.semibold,
                padding: "3px 10px", borderRadius: R.pill, cursor: "pointer",
                background: isActive ? C.blueDark : C.surface,
                color: isActive ? C.white : C.inkMid,
                border: `1px solid ${isActive ? C.blueDark : C.line}`,
              }}
            >
              {ln.label} ({ld.covered}/{ld.totalEntries})
            </button>
          );
        })}
      </div>

      {/* ── KPIs ── */}
      <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
        <KpiButton
          label={isAccessories ? "Puntos esperados" : "Puntos esperados"}
          value={lineData.totalEntries}
          color={C.ink}
          active={kpiFilter === "ALL"}
          onClick={() => handleKpiClick("ALL")}
        />
        <KpiButton
          label="Cubiertos"
          value={lineData.covered}
          color={C.green}
          active={kpiFilter === "COVERED"}
          onClick={() => handleKpiClick("COVERED")}
        />
        <KpiButton
          label="Descubiertos"
          value={lineData.uncovered}
          color={lineData.uncovered > 0 ? C.red : C.inkFaint}
          active={kpiFilter === "UNCOVERED"}
          onClick={() => handleKpiClick("UNCOVERED")}
        />
        <KpiButton
          label={isAccessories ? "Bajo objetivo" : "Bajo minimo"}
          value={lineData.belowMinimumTotal}
          color={lineData.belowMinimumTotal > 0 ? C.amber : C.inkFaint}
          active={kpiFilter === "BELOW_MIN"}
          onClick={() => handleKpiClick("BELOW_MIN")}
        />
        <KpiButton
          label="Saludables"
          value={lineData.healthyTotal}
          color={C.green}
          active={kpiFilter === "HEALTHY"}
          onClick={() => handleKpiClick("HEALTHY")}
        />
      </div>

      {/* ── Filters + Search ── */}
      <div style={{ display: "flex", gap: S[2], flexWrap: "wrap", alignItems: "center" }}>
        {(Object.keys(FILTER_LABELS) as CoverageFilter[]).map(f => (
          <button
            key={f}
            onClick={() => { setFilter(f); setKpiFilter("ALL"); }}
            style={{
              ...mono2xs,
              padding: "2px 8px", borderRadius: R.pill, cursor: "pointer",
              background: filter === f && kpiFilter === "ALL" ? C.blueDark : C.surface,
              color: filter === f && kpiFilter === "ALL" ? C.white : C.inkMid,
              border: `1px solid ${filter === f && kpiFilter === "ALL" ? C.blueDark : C.line}`,
            }}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
        <input
          type="text"
          placeholder="Buscar grupo, subgrupo..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            ...mono2xs, padding: "3px 8px", borderRadius: R.sm,
            border: `1px solid ${C.line}`, background: C.surface,
            color: C.ink, width: 180, outline: "none",
          }}
        />
      </div>

      {/* ── Results count ── */}
      <div style={{ ...mono2xs, color: C.inkFaint }}>
        {filteredItems.length} de {lineData.totalEntries} puntos
      </div>

      {/* ── Table ── */}
      {filteredItems.length === 0 ? (
        <div style={{ ...monoXs, color: C.inkFaint, padding: `${S[4]}px 0`, textAlign: "center" }}>
          Sin resultados para el filtro actual
        </div>
      ) : (
        <div className="ag-op-table" style={{ fontSize: T.sz["2xs"] }}>
          {/* Header */}
          {isAccessories ? (
            <AccessoriesTableHeader />
          ) : line === "LATIN_KIDS" ? (
            <LatinKidsTableHeader />
          ) : (
            <CastillitosTableHeader />
          )}

          {/* Rows */}
          {filteredItems.map(item => {
            const isExpanded = expandedEntry === item.entry.entryCode;
            return (
              <div key={item.entry.entryCode}>
                {isAccessories ? (
                  <AccessoriesRow item={item} expanded={isExpanded} onToggle={() => { setExpandedEntry(isExpanded ? null : item.entry.entryCode); if (!isExpanded) fetchSummary(); }} />
                ) : line === "LATIN_KIDS" ? (
                  <LatinKidsRow item={item} expanded={isExpanded} onToggle={() => { setExpandedEntry(isExpanded ? null : item.entry.entryCode); if (!isExpanded) fetchSummary(); }} />
                ) : (
                  <CastillitosRow item={item} expanded={isExpanded} onToggle={() => { setExpandedEntry(isExpanded ? null : item.entry.entryCode); if (!isExpanded) fetchSummary(); }} />
                )}

                {/* ── Gap expansion ── */}
                {isExpanded && (
                  <GapExpansion
                    item={item}
                    isAccessories={isAccessories}
                    storeId={storeId}
                    summary={summary}
                    summaryLoading={summaryLoading}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Computed timestamp ── */}
      <div style={{ ...mono2xs, color: C.inkFaint, textAlign: "right" }}>
        Calculado: {new Date(coverage.computedAt).toLocaleString("es-CO")}
      </div>
    </div>
  );
}

// ── KPI Button ────────────────────────────────────────────────────────────────

function KpiButton({
  label, value, color, active, onClick,
}: {
  label: string;
  value: number;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        padding: `${S[2]}px ${S[3]}px`, borderRadius: R.sm, cursor: "pointer",
        background: active ? C.blueLight : C.surface,
        border: `1px solid ${active ? C.blueBorder : C.line}`,
        minWidth: 60,
      }}
    >
      <span style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color }}>
        {value}
      </span>
      <span style={{ ...mono2xs, color: C.inkMid, marginTop: 1 }}>
        {label}
      </span>
    </button>
  );
}

// ── Table Headers ─────────────────────────────────────────────────────────────

const headerCell = {
  ...mono2xs, fontWeight: T.wt.semibold, color: C.inkLight,
  padding: `${S[1]}px ${S[2]}px`, whiteSpace: "nowrap" as const,
} as const;

function CastillitosTableHeader() {
  return (
    <div className="ag-op-row" style={{ display: "grid", gridTemplateColumns: "120px 140px 60px 40px 50px 40px 40px 40px 50px 50px", borderBottom: `1px solid ${C.line}` }}>
      <span style={headerCell}>Grupo</span>
      <span style={headerCell}>Subgrupo</span>
      <span style={headerCell}>Cobertura</span>
      <span style={{ ...headerCell, textAlign: "right" }}>Refs</span>
      <span style={{ ...headerCell, textAlign: "right" }}>Uds</span>
      <span style={{ ...headerCell, textAlign: "right" }}>Bajo</span>
      <span style={{ ...headerCell, textAlign: "right" }}>Sano</span>
      <span style={{ ...headerCell, textAlign: "right" }}>Sobre</span>
      <span style={{ ...headerCell, textAlign: "right" }}>Bodega</span>
      <span style={headerCell}>R36</span>
    </div>
  );
}

function LatinKidsTableHeader() {
  return (
    <div className="ag-op-row" style={{ display: "grid", gridTemplateColumns: "1fr 60px 40px 50px 40px 40px 40px 50px 50px", borderBottom: `1px solid ${C.line}` }}>
      <span style={headerCell}>Subgrupo</span>
      <span style={headerCell}>Cobertura</span>
      <span style={{ ...headerCell, textAlign: "right" }}>Refs</span>
      <span style={{ ...headerCell, textAlign: "right" }}>Uds</span>
      <span style={{ ...headerCell, textAlign: "right" }}>Bajo</span>
      <span style={{ ...headerCell, textAlign: "right" }}>Sano</span>
      <span style={{ ...headerCell, textAlign: "right" }}>Sobre</span>
      <span style={{ ...headerCell, textAlign: "right" }}>Bodega</span>
      <span style={headerCell}>R36</span>
    </div>
  );
}

function AccessoriesTableHeader() {
  return (
    <div className="ag-op-row" style={{ display: "grid", gridTemplateColumns: "1fr 70px 50px 50px 50px 60px 50px", borderBottom: `1px solid ${C.line}` }}>
      <span style={headerCell}>Subgrupo + Tamano</span>
      <span style={headerCell}>Tamano</span>
      <span style={{ ...headerCell, textAlign: "right" }}>Actual</span>
      <span style={{ ...headerCell, textAlign: "right" }}>Objetivo</span>
      <span style={{ ...headerCell, textAlign: "right" }}>Faltante</span>
      <span style={headerCell}>Estado</span>
      <span style={{ ...headerCell, textAlign: "right" }}>Bodega</span>
    </div>
  );
}

// ── Table Rows ────────────────────────────────────────────────────────────────

const cellStyle = {
  ...mono2xs, color: C.ink, padding: `${S[1]}px ${S[2]}px`,
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
} as const;

function CoverageChip({ status }: { status: DerroteroEntryCoverageStatus }) {
  const isCovered = status === "COVERED";
  return (
    <span style={{
      ...mono2xs, padding: "1px 5px", borderRadius: R.pill,
      background: isCovered ? C.greenLight : C.redLight,
      color: isCovered ? C.green : C.red,
    }}>
      {isCovered ? "Cubierto" : "Brecha"}
    </span>
  );
}

function Rule36Chip({ candidateCount, warehouseUnits }: { candidateCount: number; warehouseUnits: number }) {
  if (warehouseUnits <= 0) return <span style={{ ...mono2xs, color: C.inkFaint }}>{"\u2014"}</span>;
  if (candidateCount > 0) return <span style={{ ...mono2xs, color: C.inkFaint }}>{"\u2014"}</span>;
  return (
    <span style={{
      ...mono2xs, padding: "1px 4px", borderRadius: R.pill,
      background: C.amberLight, color: C.amber,
    }}>
      R36
    </span>
  );
}

function CastillitosRow({ item, expanded, onToggle }: { item: CoverageItem; expanded: boolean; onToggle: () => void }) {
  const e = item.entry;
  return (
    <button
      onClick={onToggle}
      className="ag-op-row"
      style={{
        display: "grid", gridTemplateColumns: "120px 140px 60px 40px 50px 40px 40px 40px 50px 50px",
        width: "100%", background: expanded ? C.blueLight : "transparent",
        border: "none", borderBottom: `1px solid ${C.lineSubtle}`,
        cursor: "pointer", textAlign: "left",
      }}
    >
      <span style={{ ...cellStyle, fontWeight: T.wt.semibold }} title={e.sagGrupo ?? ""}>{e.sagGrupo ?? "\u2014"}</span>
      <span style={cellStyle} title={typeof e.sagSubgrupo === "string" ? e.sagSubgrupo : ""}>{typeof e.sagSubgrupo === "string" ? e.sagSubgrupo : Array.isArray(e.sagSubgrupo) ? e.sagSubgrupo[0] : "\u2014"}</span>
      <span style={cellStyle}><CoverageChip status={item.coverageStatus} /></span>
      <span style={{ ...cellStyle, textAlign: "right" }}>{item.referenceCount}</span>
      <span style={{ ...cellStyle, textAlign: "right" }}>{item.totalUnits}</span>
      <span style={{ ...cellStyle, textAlign: "right", color: item.belowMinimumReferenceCount > 0 ? C.red : C.inkFaint }}>{item.belowMinimumReferenceCount || "\u2014"}</span>
      <span style={{ ...cellStyle, textAlign: "right", color: item.healthyReferenceCount > 0 ? C.green : C.inkFaint }}>{item.healthyReferenceCount || "\u2014"}</span>
      <span style={{ ...cellStyle, textAlign: "right", color: item.overMaximumReferenceCount > 0 ? C.amber : C.inkFaint }}>{item.overMaximumReferenceCount || "\u2014"}</span>
      <span style={{ ...cellStyle, textAlign: "right", color: item.mainWarehouseCandidateCount > 0 ? C.blueDark : C.inkFaint }}>{item.mainWarehouseCandidateCount > 0 ? `${item.mainWarehouseCandidateCount} (${item.totalUnitsInMainWarehouse})` : "\u2014"}</span>
      <span style={cellStyle}><Rule36Chip candidateCount={item.mainWarehouseCandidateCount} warehouseUnits={item.totalUnitsInMainWarehouse} /></span>
    </button>
  );
}

function LatinKidsRow({ item, expanded, onToggle }: { item: CoverageItem; expanded: boolean; onToggle: () => void }) {
  const e = item.entry;
  const subgrupo = typeof e.sagSubgrupo === "string" ? e.sagSubgrupo : Array.isArray(e.sagSubgrupo) ? e.sagSubgrupo[0] : "\u2014";
  return (
    <button
      onClick={onToggle}
      className="ag-op-row"
      style={{
        display: "grid", gridTemplateColumns: "1fr 60px 40px 50px 40px 40px 40px 50px 50px",
        width: "100%", background: expanded ? C.blueLight : "transparent",
        border: "none", borderBottom: `1px solid ${C.lineSubtle}`,
        cursor: "pointer", textAlign: "left",
      }}
    >
      <span style={{ ...cellStyle, fontWeight: T.wt.semibold }} title={subgrupo}>{subgrupo}</span>
      <span style={cellStyle}><CoverageChip status={item.coverageStatus} /></span>
      <span style={{ ...cellStyle, textAlign: "right" }}>{item.referenceCount}</span>
      <span style={{ ...cellStyle, textAlign: "right" }}>{item.totalUnits}</span>
      <span style={{ ...cellStyle, textAlign: "right", color: item.belowMinimumReferenceCount > 0 ? C.red : C.inkFaint }}>{item.belowMinimumReferenceCount || "\u2014"}</span>
      <span style={{ ...cellStyle, textAlign: "right", color: item.healthyReferenceCount > 0 ? C.green : C.inkFaint }}>{item.healthyReferenceCount || "\u2014"}</span>
      <span style={{ ...cellStyle, textAlign: "right", color: item.overMaximumReferenceCount > 0 ? C.amber : C.inkFaint }}>{item.overMaximumReferenceCount || "\u2014"}</span>
      <span style={{ ...cellStyle, textAlign: "right", color: item.mainWarehouseCandidateCount > 0 ? C.blueDark : C.inkFaint }}>{item.mainWarehouseCandidateCount > 0 ? `${item.mainWarehouseCandidateCount} (${item.totalUnitsInMainWarehouse})` : "\u2014"}</span>
      <span style={cellStyle}><Rule36Chip candidateCount={item.mainWarehouseCandidateCount} warehouseUnits={item.totalUnitsInMainWarehouse} /></span>
    </button>
  );
}

function AccessoriesRow({ item, expanded, onToggle }: { item: CoverageItem; expanded: boolean; onToggle: () => void }) {
  const e = item.entry;
  const sizeLabel = e.sizeClass === "small" ? "Pequeno" : e.sizeClass === "medium" ? "Mediano" : e.sizeClass === "large" ? "Grande" : e.sizeClass ?? "\u2014";
  const subgrupo = typeof e.sagSubgrupo === "string" ? e.sagSubgrupo : Array.isArray(e.sagSubgrupo) ? e.sagSubgrupo[0] : e.entryName;
  const faltante = Math.max(0, e.idealUnitsPerRef - item.totalUnits);
  return (
    <button
      onClick={onToggle}
      className="ag-op-row"
      style={{
        display: "grid", gridTemplateColumns: "1fr 70px 50px 50px 50px 60px 50px",
        width: "100%", background: expanded ? C.blueLight : "transparent",
        border: "none", borderBottom: `1px solid ${C.lineSubtle}`,
        cursor: "pointer", textAlign: "left",
      }}
    >
      <span style={{ ...cellStyle, fontWeight: T.wt.semibold }}>{subgrupo}</span>
      <span style={cellStyle}>{sizeLabel}</span>
      <span style={{ ...cellStyle, textAlign: "right" }}>{item.totalUnits}</span>
      <span style={{ ...cellStyle, textAlign: "right" }}>{e.idealUnitsPerRef}</span>
      <span style={{ ...cellStyle, textAlign: "right", color: faltante > 0 ? C.red : C.inkFaint }}>{faltante || "\u2014"}</span>
      <span style={cellStyle}><CoverageChip status={item.coverageStatus} /></span>
      <span style={{ ...cellStyle, textAlign: "right", color: item.mainWarehouseCandidateCount > 0 ? C.blueDark : C.inkFaint }}>
        {item.mainWarehouseCandidateCount > 0 ? item.mainWarehouseCandidateCount : "\u2014"}
      </span>
    </button>
  );
}

// ── Gap Expansion ─────────────────────────────────────────────────────────────

const VARIANT_INITIAL_LIMIT = 8;

function GapExpansion({
  item, isAccessories, storeId, summary, summaryLoading,
}: {
  item: CoverageItem;
  isAccessories: boolean;
  storeId: string;
  summary: SummaryData | null;
  summaryLoading: boolean;
}) {
  const [showAllVariants, setShowAllVariants] = useState<Record<string, boolean>>({});
  const e = item.entry;
  const subgrupo = typeof e.sagSubgrupo === "string" ? e.sagSubgrupo : Array.isArray(e.sagSubgrupo) ? e.sagSubgrupo[0] : "\u2014";

  // Find matching candidates from the warehouse matrix
  const matchingCandidates = useMemo(() => {
    if (!summary) return [];
    return summary.warehouseMatrix.candidates.filter(c => {
      if (c.line !== e.line) return false;
      if (e.matchMode === "GROUP_AND_SUBGROUP") {
        return c.group === e.sagGrupo && (
          typeof e.sagSubgrupo === "string"
            ? c.subgroup === e.sagSubgrupo
            : Array.isArray(e.sagSubgrupo)
              ? e.sagSubgrupo.includes(c.subgroup)
              : false
        );
      }
      if (e.matchMode === "SUBGROUP") {
        return typeof e.sagSubgrupo === "string"
          ? c.subgroup === e.sagSubgrupo
          : Array.isArray(e.sagSubgrupo)
            ? e.sagSubgrupo.includes(c.subgroup)
            : false;
      }
      if (e.matchMode === "SIZE_CLASS") {
        return c.sizeClass === e.sizeClass;
      }
      return false;
    }).slice(0, 5); // max 5 candidates
  }, [summary, e]);

  // Find allocation entries for this store from the simulation
  const storeAllocations = useMemo(() => {
    if (!summary) return [];
    const entries = summary.simulation.allocationByStore[storeId] ?? [];
    return entries.filter(a => matchingCandidates.some(c => c.referenceCode === a.referenceCode));
  }, [summary, storeId, matchingCandidates]);

  // Find cross-store priorities for matching candidates
  const crossStorePriorities = useMemo(() => {
    if (!summary) return [];
    const refCodes = new Set(matchingCandidates.map(c => c.referenceCode));
    // Get all gap IDs that relate to these candidates
    const relevantGapIds = new Set<string>();
    for (const gs of summary.gapSummaries) {
      for (const g of gs.gaps) {
        if (g.entry.entryCode === e.entryCode) {
          relevantGapIds.add(g.coverageGapId);
        }
      }
    }
    return summary.priorities
      .filter(p => relevantGapIds.has(p.coverageGapId))
      .sort((a, b) => b.priorityScore - a.priorityScore);
  }, [summary, matchingCandidates, e.entryCode]);

  // Blocked allocations for this entry
  const blockedAllocations = useMemo(() => {
    if (!summary) return [];
    const relevantGapIds = new Set<string>();
    for (const gs of summary.gapSummaries) {
      for (const g of gs.gaps) {
        if (g.entry.entryCode === e.entryCode) relevantGapIds.add(g.coverageGapId);
      }
    }
    return summary.simulation.blockedAllocations.filter(b => relevantGapIds.has(b.coverageGapId));
  }, [summary, e.entryCode]);

  const isTextile = e.line === "CASTILLITOS" || e.line === "LATIN_KIDS";

  return (
    <div style={{ ...panel, margin: `0 ${S[1]}px ${S[2]}px`, padding: S[3], background: C.surfaceAlt, borderTop: "none" }}>
      {/* ── Summary row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2], marginBottom: S[3] }}>
        <div>
          {e.sagGrupo && <div style={{ ...mono2xs, color: C.inkLight }}>Grupo: <strong>{e.sagGrupo}</strong></div>}
          <div style={{ ...mono2xs, color: C.inkLight }}>Subgrupo: <strong>{subgrupo}</strong></div>
          {e.sizeClass && <div style={{ ...mono2xs, color: C.inkLight }}>Tamano: <strong>{e.sizeClass === "small" ? "Pequeno" : e.sizeClass === "medium" ? "Mediano" : "Grande"}</strong></div>}
        </div>
        <div>
          <div style={{ ...mono2xs, color: C.inkLight }}>Cobertura esperada: <strong>{e.minimumCoverageReferences} ref(s)</strong></div>
          <div style={{ ...mono2xs, color: C.inkLight }}>Cobertura actual: <strong>{item.referenceCount} ref(s)</strong></div>
          <div style={{ ...mono2xs, color: C.inkLight }}>Unidades actuales: <strong>{item.totalUnits}</strong></div>
          {!isAccessories && (
            <div style={{ ...mono2xs, color: C.inkLight }}>Faltante: <strong style={{ color: item.coverageStatus === "UNCOVERED" ? C.red : C.ink }}>
              {Math.max(0, e.minimumCoverageReferences - item.referenceCount)} ref(s)
            </strong></div>
          )}
          {isAccessories && (
            <div style={{ ...mono2xs, color: C.inkLight }}>Faltante: <strong style={{ color: item.totalUnits < e.idealUnitsPerRef ? C.red : C.ink }}>
              {Math.max(0, e.idealUnitsPerRef - item.totalUnits)} uds
            </strong></div>
          )}
        </div>
      </div>

      {/* ── References in store ── */}
      {item.referenceDetails.length > 0 && (
        <div style={{ marginBottom: S[3] }}>
          <div style={{ ...mono2xs, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[1] }}>
            Referencias activas en tienda ({item.referenceCount})
          </div>
          <div className="ag-op-table" style={{ fontSize: T.sz["2xs"] }}>
            <div className="ag-op-row" style={{ display: "grid", gridTemplateColumns: "1fr 60px 60px 60px", borderBottom: `1px solid ${C.line}` }}>
              <span style={headerCell}>Referencia</span>
              <span style={{ ...headerCell, textAlign: "right" }}>En tienda</span>
              <span style={{ ...headerCell, textAlign: "right" }}>En bodega</span>
              <span style={headerCell}>Estado</span>
            </div>
            {item.referenceDetails.map(rd => (
              <div key={rd.referenceCode} className="ag-op-row" style={{ display: "grid", gridTemplateColumns: "1fr 60px 60px 60px", borderBottom: `1px solid ${C.lineSubtle}` }}>
                <span style={{ ...cellStyle, fontWeight: T.wt.semibold }}>{rd.referenceCode}</span>
                <span style={{ ...cellStyle, textAlign: "right" }}>{rd.unitsInStore}</span>
                <span style={{ ...cellStyle, textAlign: "right" }}>{rd.unitsInMainWarehouse || "\u2014"}</span>
                <span style={cellStyle}>
                  <span style={{
                    ...mono2xs, padding: "1px 4px", borderRadius: R.pill,
                    background: rd.healthStatus === "SALUDABLE" ? C.greenLight : rd.healthStatus === "BAJO_MINIMO" ? C.redLight : C.amberLight,
                    color: healthColor(rd.healthStatus),
                  }}>
                    {rd.healthStatus === "SALUDABLE" ? "Sano" : rd.healthStatus === "BAJO_MINIMO" ? "Bajo" : "Sobre"}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Warehouse candidates (OCTAVO) ── */}
      {summaryLoading && (
        <div style={{ ...mono2xs, color: C.inkFaint, padding: `${S[2]}px 0` }}>
          Cargando candidatos de bodega...
        </div>
      )}

      {matchingCandidates.length > 0 && (
        <div style={{ marginBottom: S[3] }}>
          <div style={{ ...mono2xs, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[1] }}>
            Candidatos de bodega principal ({matchingCandidates.length})
          </div>
          {matchingCandidates.map(candidate => {
            const isBlocked = !candidate.coverableStores.includes(storeId);
            const allocation = storeAllocations.find(a => a.referenceCode === candidate.referenceCode);
            const refKey = candidate.referenceCode;
            const showAll = showAllVariants[refKey] ?? false;
            const visibleVariants = isTextile && candidate.variants.length > 0
              ? (showAll ? candidate.variants : candidate.variants.slice(0, VARIANT_INITIAL_LIMIT))
              : [];
            const hasMore = candidate.variants.length > VARIANT_INITIAL_LIMIT;

            return (
              <div key={refKey} style={{
                marginBottom: S[2], padding: S[2], borderRadius: R.sm,
                background: isBlocked ? C.amberLight : C.surface,
                border: `1px solid ${isBlocked ? C.amberBorder : C.line}`,
              }}>
                {/* Candidate header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: S[1] }}>
                  <div>
                    <span style={{ ...monoXs, fontWeight: T.wt.semibold, color: C.ink }}>{candidate.referenceCode}</span>
                    <span style={{ ...mono2xs, color: C.inkMid, marginLeft: S[2] }}>{candidate.productName}</span>
                  </div>
                  <div style={{ display: "flex", gap: S[1], alignItems: "center" }}>
                    <span style={{ ...mono2xs, color: C.blueDark, fontWeight: T.wt.semibold }}>
                      {candidate.mainWarehouseStock} uds
                    </span>
                    {isBlocked && (
                      <span style={{
                        ...mono2xs, padding: "1px 5px", borderRadius: R.pill,
                        background: C.amberLight, color: C.amber, border: `1px solid ${C.amberBorder}`,
                      }}>
                        R36
                      </span>
                    )}
                  </div>
                </div>

                {/* Rule 36 detail (DÉCIMO) */}
                {isBlocked && (
                  <div style={{ ...mono2xs, color: C.amber, marginBottom: S[1] }}>
                    {candidate.rule36BlockedStores.includes(storeId)
                      ? "Candidato compatible, no asignable a esta tienda por Regla 36"
                      : "Limitado a Centro y Caldas por concentracion de inventario"
                    }
                  </div>
                )}

                {/* Allocation suggestion */}
                {allocation && (
                  <div style={{
                    ...mono2xs, color: C.green, fontWeight: T.wt.semibold,
                    padding: "2px 6px", background: C.greenLight, borderRadius: R.sm, marginBottom: S[1],
                    display: "inline-block",
                  }}>
                    Sugerencia: enviar {allocation.allocatedQty} uds a esta tienda
                  </div>
                )}

                {/* OCTAVO: Variant table for textile candidates */}
                {isTextile && visibleVariants.length > 0 && (
                  <div style={{ marginTop: S[1] }}>
                    <div className="ag-op-table" style={{ fontSize: T.sz["2xs"] }}>
                      <div className="ag-op-row" style={{
                        display: "grid",
                        gridTemplateColumns: "70px 90px 50px 50px 50px 50px",
                        borderBottom: `1px solid ${C.line}`,
                      }}>
                        <span style={headerCell}>Talla</span>
                        <span style={headerCell}>Color</span>
                        <span style={{ ...headerCell, textAlign: "right" }}>Bodega</span>
                        <span style={{ ...headerCell, textAlign: "right" }}>Tienda</span>
                        <span style={{ ...headerCell, textAlign: "right" }}>Sugerida</span>
                        <span style={{ ...headerCell, textAlign: "right" }}>Resultante</span>
                      </div>
                      {visibleVariants.map(v => {
                        const variantAlloc = allocation?.variantAllocations.find(va => va.variantKey === v.variantKey);
                        const storeVariantQty = item.referenceDetails
                          .filter(rd => rd.referenceCode === candidate.referenceCode)
                          .reduce((sum, rd) => sum + rd.unitsInStore, 0);
                        // Approximate per-variant store qty (we don't have variant-level store data in coverage items)
                        const suggestedQty = variantAlloc?.suggestedQty ?? 0;
                        const storeQtyBefore = variantAlloc?.storeQtyBefore ?? 0;
                        const resultante = storeQtyBefore + suggestedQty;

                        return (
                          <div key={v.variantKey} className="ag-op-row" style={{
                            display: "grid",
                            gridTemplateColumns: "70px 90px 50px 50px 50px 50px",
                            borderBottom: `1px solid ${C.lineSubtle}`,
                          }}>
                            <span style={cellStyle}>{v.size ?? "\u2014"}</span>
                            <span style={{ ...cellStyle, overflow: "hidden", textOverflow: "ellipsis" }} title={v.color ?? ""}>{v.color ?? "\u2014"}</span>
                            <span style={{ ...cellStyle, textAlign: "right" }}>{v.physicalQty}</span>
                            <span style={{ ...cellStyle, textAlign: "right", color: storeQtyBefore === 0 ? C.red : C.ink }}>
                              {storeQtyBefore || "\u2014"}
                            </span>
                            <span style={{ ...cellStyle, textAlign: "right", color: suggestedQty > 0 ? C.green : C.inkFaint }}>
                              {suggestedQty || "\u2014"}
                            </span>
                            <span style={{ ...cellStyle, textAlign: "right", fontWeight: suggestedQty > 0 ? T.wt.semibold : T.wt.normal }}>
                              {suggestedQty > 0 ? resultante : "\u2014"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {hasMore && !showAll && (
                      <button
                        onClick={() => setShowAllVariants(prev => ({ ...prev, [refKey]: true }))}
                        style={{
                          ...mono2xs, color: C.blueDark, background: "none", border: "none",
                          cursor: "pointer", padding: `${S[1]}px 0`, textDecoration: "underline",
                        }}
                      >
                        Ver todas las variantes ({candidate.variants.length})
                      </button>
                    )}
                    {showAll && hasMore && (
                      <button
                        onClick={() => setShowAllVariants(prev => ({ ...prev, [refKey]: false }))}
                        style={{
                          ...mono2xs, color: C.inkMid, background: "none", border: "none",
                          cursor: "pointer", padding: `${S[1]}px 0`, textDecoration: "underline",
                        }}
                      >
                        Mostrar menos
                      </button>
                    )}
                    {candidate.variantDataQuality === "INCONSISTENT" && (
                      <div style={{ ...mono2xs, color: C.amber, marginTop: 2 }}>
                        Datos de variante inconsistentes con stock total
                      </div>
                    )}
                  </div>
                )}

                {isTextile && candidate.variants.length === 0 && candidate.variantDataQuality === "NO_VARIANT_DATA" && (
                  <div style={{ ...mono2xs, color: C.inkFaint, marginTop: S[1] }}>
                    Sin desglose de talla/color disponible
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Fallback when summary not loaded but we know candidates exist */}
      {!summary && !summaryLoading && item.mainWarehouseCandidateCount > 0 && (
        <div style={{ marginBottom: S[2] }}>
          <div style={{ ...mono2xs, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[1] }}>
            Candidatos de bodega principal ({item.mainWarehouseCandidateCount})
          </div>
          <div style={{ ...mono2xs, color: C.inkMid }}>
            {item.totalUnitsInMainWarehouse} unidades disponibles en bodega
          </div>
        </div>
      )}

      {/* ── Cross-store allocation (NOVENO) ── */}
      {crossStorePriorities.length > 0 && (
        <div style={{ marginBottom: S[3] }}>
          <div style={{ ...mono2xs, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[1] }}>
            Prioridad entre tiendas ({crossStorePriorities.length})
          </div>
          <div className="ag-op-table" style={{ fontSize: T.sz["2xs"] }}>
            <div className="ag-op-row" style={{
              display: "grid", gridTemplateColumns: "30px 100px 50px 1fr 50px",
              borderBottom: `1px solid ${C.line}`,
            }}>
              <span style={headerCell}>#</span>
              <span style={headerCell}>Tienda</span>
              <span style={{ ...headerCell, textAlign: "right" }}>Score</span>
              <span style={headerCell}>Razones</span>
              <span style={headerCell}>Estado</span>
            </div>
            {crossStorePriorities.map((p, idx) => {
              const isCurrent = p.storeId === storeId;
              const blocked = blockedAllocations.find(b => b.coverageGapId === p.coverageGapId && b.storeId === p.storeId);

              return (
                <div key={`${p.storeId}-${p.coverageGapId}`} className="ag-op-row" style={{
                  display: "grid", gridTemplateColumns: "30px 100px 50px 1fr 50px",
                  borderBottom: `1px solid ${C.lineSubtle}`,
                  background: isCurrent ? C.blueLight : "transparent",
                }}>
                  <span style={{ ...cellStyle, color: C.inkFaint }}>{idx + 1}</span>
                  <span style={{ ...cellStyle, fontWeight: isCurrent ? T.wt.semibold : T.wt.normal }}>
                    {p.storeName}
                    {isCurrent && <span style={{ color: C.blueDark }}> *</span>}
                  </span>
                  <span style={{ ...cellStyle, textAlign: "right", fontWeight: T.wt.semibold }}>
                    {p.priorityScore.toFixed(1)}
                  </span>
                  <span style={{ ...cellStyle, color: C.inkMid }}>
                    {p.priorityReasons.join(", ")}
                  </span>
                  <span style={cellStyle}>
                    {p.blocked ? (
                      <span style={{
                        ...mono2xs, padding: "1px 4px", borderRadius: R.pill,
                        background: C.amberLight, color: C.amber,
                      }}>
                        R36
                      </span>
                    ) : blocked ? (
                      <span style={{
                        ...mono2xs, padding: "1px 4px", borderRadius: R.pill,
                        background: C.redLight, color: C.red,
                      }}>
                        Bloq
                      </span>
                    ) : (
                      <span style={{
                        ...mono2xs, padding: "1px 4px", borderRadius: R.pill,
                        background: C.greenLight, color: C.green,
                      }}>
                        OK
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Rule 36 (DÉCIMO) ── */}
      {item.totalUnitsInMainWarehouse > 0 && item.mainWarehouseCandidateCount === 0 && !summary && (
        <div style={{
          ...mono2xs, padding: `${S[2]}px`, borderRadius: R.sm,
          background: C.amberLight, border: `1px solid ${C.amberBorder}`, color: C.amber,
        }}>
          Candidato compatible, no asignable por concentracion de inventario. Limitado a Centro y Caldas por Regla 36.
        </div>
      )}

      {/* ── No candidates ── */}
      {item.totalUnitsInMainWarehouse === 0 && item.coverageStatus === "UNCOVERED" && (
        <div style={{ ...mono2xs, color: C.inkFaint, padding: `${S[2]}px 0` }}>
          Sin candidatos en bodega principal para esta brecha.
        </div>
      )}

      {/* ── Unit thresholds ── */}
      <div style={{ ...mono2xs, color: C.inkFaint, marginTop: S[2], paddingTop: S[2], borderTop: `1px solid ${C.line}` }}>
        {isAccessories
          ? `Objetivo: ${e.idealUnitsPerRef} uds`
          : `Regla: min ${e.minUnitsPerRef} / ideal ${e.idealUnitsPerRef} / max ${e.maxUnitsPerRef} uds por ref`
        }
      </div>
    </div>
  );
}
