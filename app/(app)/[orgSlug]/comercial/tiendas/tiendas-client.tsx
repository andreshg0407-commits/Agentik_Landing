"use client";

/**
 * Tiendas — Client Component.
 *
 * Panel principal: 4 tarjetas operacionales + drawer per-store
 * con 4 tabs lazy (Inventario, Necesidades, Derrotero, Inteligencia).
 *
 * Sprint: AGENTIK-STORES-MAIN-WORKSPACE-SIMPLIFICATION-01
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { OperationalSideDrawer } from "@/components/workspace/operational-side-drawer";
import { CommercialReferenceThumbnail } from "@/components/comercial/commercial-reference-thumbnail";
import { C, T, S, R, panel, panelHeader } from "@/lib/ui/tokens";
import type {
  StoreDistributionItem,
  StoreDistributionAction,
  CanonicalStoreDetail,
  EffectiveStoreConfig,
  EffectiveTextileConfig,
  EffectiveAccessoryConfig,
  EffectiveScarcityConfig,
  EffectiveSpecialProductConfig,
  EffectiveSpecialProductEntry,
  RuleImpactPreview,
  ReplacementResult,
} from "@/lib/comercial/tiendas/store-distribution-types";
// ── AGENTIK-STORES-TRUTH-AUDIT-01 · F3A: fuente única de verdad ──
// La pantalla lee EXCLUSIVAMENTE el StoreSnapshot (una llamada de estado) y
// proyecta con el PresentationAssembler. Cero recálculo de KPIs/cobertura/
// necesidades/plan en el cliente; cero umbrales locales.
import type { StoreSnapshot } from "@/lib/comercial/tiendas/store-snapshot-pipeline";
import {
  buildDashboardPresentation,
  buildCoverageTabPresentation,
  buildNeedsTabPresentation,
  buildOperativeNeedsPresentation,
  buildAccessoryCompositionPresentation,
  buildSpecialProductsPresentation,
  type DashboardPresentation,
  type PresentationStoreCard,
  type PresentationTone,
  type OperativeNeedsPresentation,
  type NeedsTabPresentation,
  type CoverageRuleRowPresentation,
  type AccessoryCompositionPresentation,
  type AccessorySizeBlock,
  type AccessoryFamilyRow,
  type AccessoryFamilyReferencePresentation,
} from "@/lib/comercial/tiendas/store-presentation-assembler";
import { createSnapshotRefresher } from "@/lib/comercial/tiendas/store-snapshot-refresher";
import { ACTIVE_STORE_SLUGS } from "@/lib/comercial/tiendas/store-distribution-types";
// ── Business line labels for Needs tab filter (AGENTIK-STORES-NEEDS-UX-02.3.1) ──
const NEEDS_LINE_LABEL: Record<string, string> = {
  castillitos: "Castillitos",
  latin_kids: "Latin Kids",
  accesorios_importacion: "Accesorios",
};
const NEEDS_COMMERCIAL_LINES = new Set(["castillitos", "latin_kids", "accesorios_importacion"]);
import type { StoreGovernanceRecord } from "@/lib/comercial/tiendas/store-governance-types";
import { StoreSupplyRulesTab } from "@/components/comercial/store-supply-rules-tab";
import type {
  StoreDiscountResponse,
  DiscountTier,
  DiscountRecommendation,
} from "@/lib/comercial/tiendas/store-discount-types";
import {
  DISCOUNT_TIER_LABEL,
  DISCOUNT_TIER_COLOR,
} from "@/lib/comercial/tiendas/store-discount-types";
import type { SagComparisonAction, StoreDiscountComparison } from "@/lib/comercial/tiendas/store-sag-discount-types";
import type {
  CertifiedStoreIntelligenceResponse,
} from "@/lib/comercial/tiendas/store-certified-intelligence-types";
// AGENTIK-STORES-INTELLIGENCE-UX-IMPLEMENTATION-01: TREND_LABEL/TREND_COLOR/
// INTELLIGENCE_YEAR (deuda deprecada) retirados — el tab nuevo es render-only
// sobre el PresentationAssembler.
import { StoreIntelligenceTab } from "@/components/comercial/store-intelligence-tab";
import type { StoreProductIntelligence, WindowId } from "@/lib/comercial/tiendas/store-product-intelligence-types";

// ── SAG action display map (AGENTIK-STORES-DISCOUNTS-SAG-AWARE-ENGINE-01) ───
const SAG_ACTION_DISPLAY: Record<SagComparisonAction, {
  icon: string; color: string; label: (target: number) => string;
}> = {
  APPLY:             { icon: "+",  color: DISCOUNT_TIER_COLOR.THIRTY_PERCENT, label: t => `Aplicar ${t}%` },
  INCREASE:          { icon: "↑",  color: DISCOUNT_TIER_COLOR.FIFTY_PERCENT,  label: t => `Subir a ${t}%` },
  ALIGNED:           { icon: "✓",  color: DISCOUNT_TIER_COLOR.NONE,           label: () => "Ya aplicado" },
  KEEP_HIGHER_SAG:   { icon: "▶",  color: C.inkMid,                           label: () => "SAG mayor — mantener" },
  NO_AGENTIK_ACTION: { icon: "—",  color: C.inkFaint,                         label: () => "Sin acción recomendada" },
  AMBIGUOUS_SAG:     { icon: "?",  color: DISCOUNT_TIER_COLOR.SEVENTY_PERCENT, label: () => "Revisar config. SAG" },
  EXCLUDED:          { icon: "×",  color: C.inkFaint,                         label: () => "Excluida" },
};

// ── Rule provenance (AGENTIK-STORES-SUPPLY-RULES-CONSUMPTION-CERTIFICATION-01) ─

interface EffectiveRuleClient {
  ruleId:      string | null;
  source:      "TENANT_DEFAULT" | "STORE_OVERRIDE" | "SPECIAL_PRODUCT" | "RULE_36" | "FALLBACK";
  minUnits:    number | null;
  idealUnits:  number | null;
  maxUnits:    number | null;
  targetUnits: number | null;
  inherited:   boolean;
  validFrom:   string | null;
  validTo:     string | null;
  season:      string | null;
}

// ── Inventory-by-line types (client-side, mirrors server types) ──────────────

interface InvReplacementVariant {
  variantKey: string;
  size: string | null;
  color: string | null;
  mainWarehouseQty: number;
  availableQty: number | null;
  stockQuality: string;
}

interface InvReplacementBrief {
  candidateRef: string;
  candidateDesc: string;
  candidateImageUrl: string | null;
  suggestedQty: number;
  ruleSource: string;
  shortageQty: number;
  candidateMainStock: number;
  candidateStoreStock: number;
  coveredQty: number;
  remainingShortageQty: number;
  stockQuality: string;
  evidenceDate: string;
  // Variant detail (REPLACEMENT-VARIANTS-01)
  replacementVariants: InvReplacementVariant[];
  totalVariantCount: number;
  displayedVariantCount: number;
  totalVariantUnits: number;
  variantEvidenceDate: string;
}

interface InvConsolidatedRef {
  referenceCode: string;
  productName: string;
  imageUrl: string | null;
  line: string;
  canonicalLine: string;
  world: string;
  group: string;
  subgroup: string;
  sizeClass: string | null;
  currentStoreQty: number;
  minUnits: number;
  idealUnits: number;
  maxUnits: number;
  inventoryState: string;
  configState: string;
  unclassifiedReason: string | null;
  variantCount: number;
  effectiveRule: EffectiveRuleClient;
}

type InvSortBy = "QUANTITY_ASC" | "QUANTITY_DESC" | "REFERENCE_ASC" | "REFERENCE_DESC";


interface InvVariant {
  referenceCode: string;
  size: string;
  color: string;
  storeQty: number;
  inventoryState: string;
}

interface InvByLineResponse {
  line: string;
  summary: { type: string; data: Record<string, unknown> };
  items: InvConsolidatedRef[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  availableFilters: {
    groups: string[];
    subgroups: string[];
    sizeClasses: string[];
    inventoryStates: string[];
    unclassifiedReasons: string[];
  };
  dataFreshness: string | null;
}

// ── Props (STABILIZATION-PERFORMANCE-01) ─────────────────────────────────────
// page.tsx only passes orgSlug + orgId. All data loads lazily via API.

interface Props {
  orgSlug: string;
  orgId:   string;
}

// ── Status maps ──────────────────────────────────────────────────────────────
// (Legacy maps removed — AGENTIK-STORES-MAIN-WORKSPACE-SIMPLIFICATION-01)

// ── Format helpers ──────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${Math.round(value)}`;
}

// ── API helpers ─────────────────────────────────────────────────────────────

async function tiendaApi(orgSlug: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/orgs/${orgSlug}/comercial/tiendas`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    // Propagate server error as part of the response so callers can check data.error
    return { ...data, _httpStatus: res.status };
  }
  return data;
}


// ── Main component (STABILIZATION-PERFORMANCE-01) ────────────────────────────

export function TiendasClient({ orgSlug }: Props) {
  // ── StoreSnapshot — ÚNICA fuente de verdad del módulo (F3A) ───────────────
  const [snapshot, setSnapshot] = useState<StoreSnapshot | null>(null);
  const [distLoading, setDistLoading]   = useState(true);
  const [distError, setDistError]       = useState(false);
  const dash: DashboardPresentation | null = useMemo(
    () => (snapshot ? buildDashboardPresentation(snapshot) : null),
    [snapshot],
  );

  // ── F3A.1: refetch tras escrituras — ÚNICA función de refresco ────────────
  // Single-flight + coalescido + guardia de secuencia; un fallo conserva el
  // snapshot visible. Las presentaciones se reconstruyen solas (useMemo).
  const [snapshotRefreshing, setSnapshotRefreshing] = useState(false);
  const snapshotRefresher = useMemo(() => createSnapshotRefresher<StoreSnapshot>({
    fetchSnapshot: async () => {
      const data = await tiendaApi(orgSlug, { action: "get_store_snapshot" });
      return data && data.snapshot ? (data.snapshot as StoreSnapshot) : null;
    },
    onSnapshot: setSnapshot,
    onRefreshingChange: setSnapshotRefreshing,
  }), [orgSlug]);
  const refreshSnapshot = snapshotRefresher.refresh;

  // ── Drawer state (QUINTO — lazy per-store loading) ──────────────────────
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [activeGov, setActiveGov] = useState<StoreGovernanceRecord[]>([]);

  // ── Governance: inactive stores (GOVERNANCE-01) ──────────────────────────
  const [inactiveStores, setInactiveStores] = useState<StoreGovernanceRecord[]>([]);
  const [inactiveOpen, setInactiveOpen]     = useState(false);
  const [inactiveLoaded, setInactiveLoaded] = useState(false);
  const [inactiveLoading, setInactiveLoading] = useState(false);
  const [canManageGov, setCanManageGov]     = useState(false);
  const [govConfirm, setGovConfirm]         = useState<{ action: "activate" | "deactivate"; storeId: string; storeName: string } | null>(null);
  const [govReason, setGovReason]           = useState("");
  const [govBusy, setGovBusy]               = useState(false);

  // ── Feedback ──────────────────────────────────────────────────────────────
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  function showFeedback(msg: string) {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 5000);
  }

  // ── TERCERO: Load distribution + governance permission on mount ───────────
  useEffect(() => {
    let cancelled = false;
    async function loadSnapshot() {
      setDistLoading(true);
      setDistError(false);
      try {
        const res = await fetch(`/api/orgs/${orgSlug}/comercial/tiendas`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "get_store_snapshot" }),
        });
        const data = await res.json();
        if (!cancelled && data.snapshot) setSnapshot(data.snapshot);
        else if (!cancelled) setDistError(true);
      } catch {
        if (!cancelled) setDistError(true);
      }
      if (!cancelled) setDistLoading(false);
    }
    async function loadGovernancePermission() {
      try {
        const res = await fetch(`/api/orgs/${orgSlug}/comercial/tiendas`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "store_governance_list" }),
        });
        const data = await res.json();
        if (!cancelled) {
          setCanManageGov(data.canManage ?? false);
          setInactiveStores(data.inactive ?? []);
          setActiveGov(data.active ?? []);
          setInactiveLoaded(true);
        }
      } catch { /* silent */ }
    }
    loadSnapshot();
    loadGovernancePermission();
    return () => { cancelled = true; };
  }, [orgSlug]);

  // ── QUINTO: Open store drawer (lazy — tabs proyectan el snapshot) ──
  function openStoreDrawer(storeId: string) {
    setSelectedStoreId(storeId);
  }

  function closeDrawer() {
    setSelectedStoreId(null);
  }

  // ── Retry snapshot load ──────────────────────────────────────────────────
  function retryDistribution() {
    setDistLoading(true);
    setDistError(false);
    fetch(`/api/orgs/${orgSlug}/comercial/tiendas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get_store_snapshot" }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.snapshot) setSnapshot(data.snapshot);
        else setDistError(true);
      })
      .catch(() => setDistError(true))
      .finally(() => setDistLoading(false));
  }

  // ── GOVERNANCE: Load inactive stores on demand (CUARTO) ─────────────────
  async function loadInactiveStores() {
    if (inactiveLoaded || inactiveLoading) { setInactiveOpen(true); return; }
    setInactiveLoading(true);
    setInactiveOpen(true);
    try {
      const res = await fetch(`/api/orgs/${orgSlug}/comercial/tiendas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "store_governance_list" }),
      });
      const data = await res.json();
      setInactiveStores(data.inactive ?? []);
      setCanManageGov(data.canManage ?? false);
      setInactiveLoaded(true);
    } catch {
      showFeedback("Error al cargar tiendas inactivas.");
    }
    setInactiveLoading(false);
  }

  // ── GOVERNANCE: Activate / Deactivate (QUINTO) ────────────────────────
  async function executeGovernanceAction() {
    if (!govConfirm) return;
    setGovBusy(true);
    try {
      const actionName = govConfirm.action === "activate" ? "store_activate" : "store_deactivate";
      const payload: Record<string, unknown> = { action: actionName, storeId: govConfirm.storeId };
      if (govConfirm.action === "deactivate") payload.reason = govReason;

      const res = await fetch(`/api/orgs/${orgSlug}/comercial/tiendas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) {
        showFeedback(
          govConfirm.action === "activate"
            ? `${govConfirm.storeName} fue activada. Su inteligencia se recalculara con la proxima actualizacion.`
            : `${govConfirm.storeName} fue desactivada.`
        );
        // F3A.1: escritura exitosa → refetch del snapshot (estado visible se
        // reemplaza al llegar la corrida nueva; nunca se borra antes)
        refreshSnapshot();
        setInactiveLoaded(false);
        if (inactiveOpen) {
          // Reload inactive list
          setTimeout(() => loadInactiveStores(), 500);
        }
      } else {
        showFeedback(data.error || "Error al cambiar estado.");
      }
    } catch {
      showFeedback("Error de conexion.");
    }
    setGovBusy(false);
    setGovConfirm(null);
    setGovReason("");
  }

  // ── Estado global del header — 1:1 desde los hints del snapshot (F3A) ──────
  const overallStatus = snapshot
    ? (snapshot.presentationHints.requierenAtencion === "ALERTA" ? "warning" as const : "ok" as const)
    : "ok" as const;

  return (
    <div>
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Comercial", href: `/${orgSlug}/pipeline` },
          { label: "Tiendas" },
        ]}
        title="Tiendas"
        subtitle="Controla surtido, faltantes y transferencias sugeridas por tienda."
        status={overallStatus}
        statusLabel={snapshot ? `${snapshot.moduleKpis.tiendasActivas} tiendas operativas` : "Cargando..."}
      />

      {/* Feedback messages */}
      {feedbackMsg && (
        <div style={{
          ...panel, padding: `${S[2]}px ${S[4]}px`, marginBottom: S[3],
          background: C.blueLight, borderColor: C.blueBorder,
          fontFamily: T.mono, fontSize: T.sz.sm, color: C.blueDark,
        }}>
          {feedbackMsg}
        </div>
      )}

      {/* Data source pill — frescura HONESTA del snapshot (C1/C2 del diccionario) */}
      {snapshot && (
        <div style={{ display: "flex", marginBottom: S[4], alignItems: "center" }}>
          <span style={{
            fontFamily: T.mono, fontSize: T.sz["2xs"], marginLeft: "auto",
            padding: "2px 8px", borderRadius: R.pill,
            background: C.greenLight, color: C.green,
            border: `1px solid ${C.greenBorder}`,
          }}>
            Dato real · {snapshot.dataAsOf ? formatTimeAgo(snapshot.dataAsOf) : "sin sync"}{snapshotRefreshing ? " · actualizando…" : ""}
          </span>
        </div>
      )}

      {/* PRIMERO — 4 operational store cards */}
      <>
          {/* TERCERO — Skeleton while distribution loads */}
          {distLoading && !snapshot && (
            <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>
              {/* KPI skeleton */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: S[3] }}>
                {[1, 2, 3, 4].map(n => (
                  <div key={n} style={{ ...panel, padding: S[3], height: 68, background: C.surface, borderRadius: R.md, animation: "pulse 1.5s infinite" }} />
                ))}
              </div>
              {/* Card skeletons (4 stores) */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: S[4] }}>
                {[1, 2, 3, 4].map(n => (
                  <div key={n} style={{ ...panel, height: 220, background: C.surface, borderRadius: R.md, animation: "pulse 1.5s infinite" }} />
                ))}
              </div>
              <style>{`@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
            </div>
          )}

          {/* Error state */}
          {distError && !snapshot && !distLoading && (
            <div style={{
              ...panel, padding: S[6], textAlign: "center",
              background: C.redLight, borderColor: C.redBorder,
            }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.semibold, color: C.red, marginBottom: S[2] }}>
                No fue posible cargar la distribucion
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight, marginBottom: S[3] }}>
                Verifica la conexion con la base de datos y vuelve a intentarlo.
              </div>
              <button
                onClick={retryDistribution}
                className="ag-action-primary"
                style={{
                  fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
                  color: C.white, background: C.blueDark, border: "none",
                  borderRadius: R.sm, padding: `${S[2]}px ${S[4]}px`, cursor: "pointer",
                }}
              >
                Reintentar
              </button>
            </div>
          )}

          {/* Loaded — KPIs + store cards, TODO proyectado por el PresentationAssembler */}
          {snapshot && dash && (() => {
            return (
            <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>
              {/* KPI strip — valores VERBATIM del snapshot, tonos del PA */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: S[3] }}>
                {dash.kpiCards.map(k => (
                  <DistKpiCard key={k.key} label={k.label} value={k.value} color={TONE_COLOR[k.tone]} />
                ))}
              </div>

              {/* Store cards — fixed 2×2 grid */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: S[4],
              }}>
                {dash.storeCards.map(card => (
                  <OperationalStoreCard
                    key={card.storeId}
                    card={card}
                    meta={activeGov.find(g => g.storeId === card.storeId)}
                    onOpen={() => openStoreDrawer(card.storeId)}
                    canDeactivate={canManageGov}
                    onDeactivate={() => setGovConfirm({ action: "deactivate", storeId: card.storeId, storeName: card.title })}
                  />
                ))}
              </div>

              {/* Intelligence disclaimer (OCTAVO) */}
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>La inteligencia del modulo utiliza unicamente las tiendas activas.</span>
                {snapshot.generatedAt && (
                  <span>Corrida: {formatTimeAgo(snapshot.generatedAt)}</span>
                )}
              </div>

              {/* CUARTO — Ver tiendas inactivas button */}
              <button
                onClick={() => inactiveOpen ? setInactiveOpen(false) : loadInactiveStores()}
                className="ag-action-secondary"
                style={{
                  fontFamily: T.mono, fontSize: T.sz.xs,
                  padding: `${S[1]}px ${S[3]}px`, borderRadius: R.sm, cursor: "pointer",
                  background: C.surface, color: C.inkMid,
                  border: `1px solid ${C.line}`,
                  alignSelf: "flex-start",
                }}
              >
                {inactiveOpen ? "Ocultar tiendas inactivas" : `Ver tiendas inactivas${inactiveLoaded ? ` (${inactiveStores.length})` : ""}`}
              </button>

              {/* CUARTO — Inactive stores collapsible section */}
              {inactiveOpen && (
                <div style={{ ...panel, padding: S[4], background: C.surface }}>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.inkMid, marginBottom: S[3] }}>
                    Tiendas inactivas
                  </div>

                  {inactiveLoading && !inactiveLoaded && (
                    <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
                      {[1, 2, 3].map(n => (
                        <div key={n} style={{ height: 60, background: C.surfaceAlt, borderRadius: R.sm, animation: "pulse 1.5s infinite" }} />
                      ))}
                    </div>
                  )}

                  {inactiveLoaded && inactiveStores.length === 0 && (
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint, padding: `${S[3]}px 0` }}>
                      No hay tiendas inactivas.
                    </div>
                  )}

                  {inactiveLoaded && inactiveStores.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
                      {inactiveStores.map(store => (
                        <div key={store.storeId} style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          padding: `${S[2]}px ${S[3]}px`, borderRadius: R.sm,
                          background: C.white, border: `1px solid ${C.lineSubtle}`,
                        }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                              <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
                                {store.displayName}
                              </span>
                              <span style={{
                                fontFamily: T.mono, fontSize: T.sz["2xs"], padding: "1px 6px",
                                borderRadius: R.pill, background: C.surface, color: C.inkFaint,
                                border: `1px solid ${C.line}`,
                              }}>
                                Inactiva
                              </span>
                            </div>
                            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, marginTop: 2 }}>
                              Bodega SAG: {store.sagWarehouseCode} · {store.city}
                              {store.deactivatedAt && ` · Desactivada: ${formatTimeAgo(store.deactivatedAt)}`}
                            </div>
                            {store.deactivationReason && (
                              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 1 }}>
                                Motivo: {store.deactivationReason}
                              </div>
                            )}
                          </div>
                          {canManageGov && (
                            <button
                              onClick={() => setGovConfirm({ action: "activate", storeId: store.storeId, storeName: store.displayName })}
                              className="ag-action-secondary"
                              style={{
                                fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                                padding: "3px 10px", borderRadius: R.sm, cursor: "pointer",
                                background: C.greenLight, color: C.green,
                                border: `1px solid ${C.greenBorder}`, flexShrink: 0,
                              }}
                            >
                              Activar tienda
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            );
          })()}

          {/* GOVERNANCE — Confirmation modal */}
          {govConfirm && (
            <div style={{
              position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
              background: "rgba(0,0,0,0.4)", zIndex: 9999,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
              onClick={() => { if (!govBusy) { setGovConfirm(null); setGovReason(""); } }}
            >
              <div style={{
                ...panel, padding: S[5], minWidth: 380, maxWidth: 480,
                background: C.white, borderRadius: R.md,
              }}
                onClick={e => e.stopPropagation()}
              >
                <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.ink, marginBottom: S[3] }}>
                  {govConfirm.action === "activate" ? "Activar tienda" : "Desactivar tienda"}
                </div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid, marginBottom: S[3] }}>
                  {govConfirm.action === "activate"
                    ? `¿Activar "${govConfirm.storeName}"? Se incluira en la inteligencia del modulo con la proxima actualizacion.`
                    : `¿Desactivar "${govConfirm.storeName}"? Dejara de participar en toda inteligencia, KPIs y sugerencias.`}
                </div>
                {govConfirm.action === "deactivate" && (
                  <div style={{ marginBottom: S[3] }}>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, marginBottom: S[1] }}>
                      Motivo (obligatorio):
                    </div>
                    <textarea
                      value={govReason}
                      onChange={e => setGovReason(e.target.value)}
                      placeholder="Indique el motivo de la desactivacion..."
                      rows={3}
                      style={{
                        width: "100%", fontFamily: T.mono, fontSize: T.sz.sm,
                        padding: S[2], borderRadius: R.sm, border: `1px solid ${C.line}`,
                        resize: "vertical",
                      }}
                    />
                  </div>
                )}
                <div style={{ display: "flex", gap: S[2], justifyContent: "flex-end" }}>
                  <button
                    onClick={() => { setGovConfirm(null); setGovReason(""); }}
                    disabled={govBusy}
                    className="ag-action-secondary"
                    style={{
                      fontFamily: T.mono, fontSize: T.sz.sm, padding: `${S[1]}px ${S[3]}px`,
                      borderRadius: R.sm, cursor: "pointer", background: C.surface,
                      color: C.inkMid, border: `1px solid ${C.line}`,
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={executeGovernanceAction}
                    disabled={govBusy || (govConfirm.action === "deactivate" && govReason.trim().length === 0)}
                    className="ag-action-primary"
                    style={{
                      fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
                      padding: `${S[1]}px ${S[3]}px`, borderRadius: R.sm, cursor: "pointer",
                      background: govConfirm.action === "activate" ? C.green : C.red,
                      color: C.white, border: "none",
                      opacity: govBusy || (govConfirm.action === "deactivate" && govReason.trim().length === 0) ? 0.5 : 1,
                    }}
                  >
                    {govBusy ? "Procesando..." : govConfirm.action === "activate" ? "Confirmar activacion" : "Confirmar desactivacion"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* QUINTO — Store drawer (proyecta el MISMO snapshot: cache compartida, T8) */}
          {selectedStoreId && snapshot && dash && (
            <DistributionStoreDrawer
              orgSlug={orgSlug}
              snapshot={snapshot}
              onSnapshotRefresh={refreshSnapshot}
              storeCard={{
                store: {
                  id: selectedStoreId,
                  name: dash.storeCards.find(c => c.storeId === selectedStoreId)?.title ?? selectedStoreId,
                  sagWarehouseCode: activeGov.find(g => g.storeId === selectedStoreId)?.sagWarehouseCode ?? "",
                  city: activeGov.find(g => g.storeId === selectedStoreId)?.city ?? "",
                },
                coverageText: dash.storeCards.find(c => c.storeId === selectedStoreId)?.coverageText ?? "\u2014",
                healthLabel: dash.storeCards.find(c => c.storeId === selectedStoreId)?.healthBadge.label ?? "",
                healthTone: dash.storeCards.find(c => c.storeId === selectedStoreId)?.healthBadge.tone ?? "neutral",
                subtitle: dash.storeCards.find(c => c.storeId === selectedStoreId)?.subtitle ?? "",
              }}
              onClose={closeDrawer}
            />
          )}
        </>
    </div>
  );
}

// ── Operational Store Card (SÉPTIMO — STABILIZATION-PERFORMANCE-01) ──────────

function OperationalStoreCard({ card, meta, onOpen, canDeactivate, onDeactivate }: {
  card: PresentationStoreCard;
  meta?: StoreGovernanceRecord;
  onOpen: () => void;
  canDeactivate?: boolean;
  onDeactivate?: () => void;
}) {
  // F3A: colores, badges y textos vienen del PresentationAssembler — el
  // cliente no compara, no suma y no posee umbrales (guardián T3).
  const healthColor = TONE_BADGE[card.healthBadge.tone];
  const healthLabel = card.healthBadge.label;
  const covColor = TONE_COLOR[card.coverageTone];
  const actionText = card.actionText;
  const actionColor = TONE_COLOR[card.coverageTone];

  return (
    <div style={{
      ...panel, display: "flex", flexDirection: "column", minHeight: 220,
    }}>
      {/* Header */}
      <div style={{ ...panelHeader, flexDirection: "column", alignItems: "stretch", gap: S[1] }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.ink }}>
            {card.title}
          </div>
          {/* Health badge */}
          <div style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "3px 8px", borderRadius: R.pill,
            background: healthColor.bg, border: `1px solid ${healthColor.text}20`,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: healthColor.text }} />
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: healthColor.text }}>
              {healthLabel}
            </span>
          </div>
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
          {meta ? `Bodega SAG: ${meta.sagWarehouseCode}${meta.city ? ` · ${meta.city}` : ""}` : "\u00A0"}
        </div>
      </div>

      {/* Metrics */}
      <div style={{ padding: S[4], flex: 1, display: "flex", flexDirection: "column", gap: S[2] }}>
        {/* Coverage — visual principal */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>Cobertura</span>
          <span style={{
            fontFamily: T.mono, fontSize: T.sz.xl, fontWeight: T.wt.bold, color: covColor,
          }}>
            {card.coverageText}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2] }}>
          <TextMetricBox label="Por surtir" value={`${card.stats.shortageUnits} uds`} color={C.red} />
          <TextMetricBox label="Por retirar" value={`${card.stats.withdrawalUnits} uds`} color={C.amber} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2] }}>
          <TextMetricBox label="Estructuras criticas" value={card.stats.criticalStructures} color={C.red} />
          <TextMetricBox label="Estructuras con exceso" value={card.stats.excessStructures} color={C.amber} />
        </div>
      </div>

      {/* Footer — action recommendation */}
      <div style={{
        padding: `${S[2]}px ${S[4]}px`, borderTop: `1px solid ${C.line}`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: actionColor }}>
          {actionText}
        </span>
        <button onClick={onOpen} className="ag-action-primary" style={{
          fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
          color: C.white, background: C.blueDark, border: "none",
          borderRadius: R.sm, padding: `${S[1]}px ${S[3]}px`, cursor: "pointer",
          flexShrink: 0,
        }}>
          Abrir tienda
        </button>
      </div>
    </div>
  );
}

// ── Metric box ───────────────────────────────────────────────────────────────

function TextMetricBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.lineSubtle}`,
      borderRadius: R.sm, padding: `${S[1]}px ${S[2]}px`,
    }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{label}</div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color }}>{value}</div>
    </div>
  );
}

function MetricBox({ label, value, color, suffix }: { label: string; value: number | null; color: string; suffix: string }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.lineSubtle}`,
      borderRadius: R.sm, padding: `${S[1]}px ${S[2]}px`,
    }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{label}</div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: value !== null ? color : C.inkFaint }}>
        {value !== null
          ? <>{value}<span style={{ fontSize: T.sz["2xs"], fontWeight: T.wt.normal, color: C.inkFaint }}>{suffix}</span></>
          : "\u2014"}
      </div>
    </div>
  );
}

// ── Derrotero Tab ─────────────────────────────────────────────────────────────

type DerroteroBlock = "castillitos" | "latin_kids" | "acc_small" | "acc_medium" | "acc_large" | "scarcity" | "special";

const DERROTERO_BLOCKS: { key: DerroteroBlock; label: string; world: string }[] = [
  { key: "castillitos", label: "Castillitos",          world: "TEXTIL" },
  { key: "latin_kids",  label: "Latin Kids",           world: "TEXTIL" },
  { key: "acc_small",   label: "Accesorios Pequenos",  world: "IMPORTACION" },
  { key: "acc_medium",  label: "Accesorios Medianos",  world: "IMPORTACION" },
  { key: "acc_large",   label: "Accesorios Grandes",   world: "IMPORTACION" },
  { key: "scarcity",    label: "Escasez Textil",       world: "TEXTIL" },
  { key: "special",     label: "Productos Especiales", world: "ESPECIAL" },
];

function DerroteroTab({ orgSlug, storeId, storeName }: { orgSlug: string; storeId: string; storeName: string }) {
  const [config, setConfig] = useState<EffectiveStoreConfig | null>(null);
  const [editable, setEditable] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingBlock, setEditingBlock] = useState<DerroteroBlock | null>(null);
  const [draft, setDraft] = useState<Partial<EffectiveStoreConfig>>({});
  const [preview, setPreview] = useState<RuleImpactPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [expandedBlocks, setExpandedBlocks] = useState<Set<DerroteroBlock>>(new Set());
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const tiendasApi = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/orgs/${orgSlug}/comercial/tiendas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json();
  }, [orgSlug]);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const data = await tiendasApi({ action: "distribution_effective_config", storeId });
      if (data.config) {
        setConfig(data.config);
        setEditable(data.editable ?? false);
      }
      setLoaded(true);
    } catch {
      setError("No se pudo cargar la configuracion.");
    } finally {
      setLoading(false);
    }
  }, [storeId, tiendasApi]);

  if (!loaded && !loading) loadConfig();

  // ── Validation ──────────────────────────────────────────────────────────
  function validateTextile(tc: EffectiveTextileConfig): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!Number.isInteger(tc.minUnits) || tc.minUnits < 0) errs.minUnits = "Entero >= 0";
    if (!Number.isInteger(tc.targetUnits) || tc.targetUnits < tc.minUnits) errs.targetUnits = "Entero >= minimo";
    if (!Number.isInteger(tc.maxUnits) || tc.maxUnits < tc.targetUnits) errs.maxUnits = "Entero >= objetivo";
    return errs;
  }

  function validateAccessory(target: number): Record<string, string> {
    if (!Number.isInteger(target) || target < 0) return { targetUnits: "Entero >= 0" };
    return {};
  }

  function validateScarcity(sc: EffectiveScarcityConfig): Record<string, string> {
    const errs: Record<string, string> = {};
    if (sc.lowStockConcentrationThreshold < 0) errs.threshold = ">= 0";
    if (sc.enabled && sc.allowedStoresWhenScarce.length === 0) errs.allowedStores = "Al menos una tienda";
    if (sc.validFrom && sc.validTo && sc.validTo < sc.validFrom) errs.validTo = "No puede ser anterior a inicio";
    return errs;
  }

  function validateSpecialProducts(sp: EffectiveSpecialProductConfig): Record<string, string> {
    const errs: Record<string, string> = {};
    for (let i = 0; i < sp.entries.length; i++) {
      const e = sp.entries[i];
      if (!e.pattern || e.pattern.trim().length === 0) errs[`sp_${i}_pattern`] = "Patron requerido";
      if (!Number.isInteger(e.idealUnits) || e.idealUnits < 0) errs[`sp_${i}_ideal`] = "Entero >= 0";
    }
    return errs;
  }

  // ── Edit mode handlers ──────────────────────────────────────────────────
  function startEdit(block: DerroteroBlock) {
    if (!editable || !config) return;
    setEditingBlock(block);
    setPreview(null);
    setError(null);
    setSuccess(null);
    setValidationErrors({});

    // Initialize draft from current config
    if (block === "castillitos") setDraft({ castillitos: { ...config.castillitos, source: "store_override" } });
    else if (block === "latin_kids") setDraft({ latinKids: { ...config.latinKids, source: "store_override" } });
    else if (block === "acc_small") setDraft({ accessories: { ...config.accessories, small: { ...config.accessories.small, source: "store_override" } } });
    else if (block === "acc_medium") setDraft({ accessories: { ...config.accessories, medium: { ...config.accessories.medium, source: "store_override" } } });
    else if (block === "acc_large") setDraft({ accessories: { ...config.accessories, large: { ...config.accessories.large, source: "store_override" } } });
    else if (block === "scarcity") setDraft({ scarcity: { ...config.scarcity } });
    else if (block === "special") setDraft({ specialProducts: { entries: config.specialProducts.entries.map(e => ({ ...e })) } });
  }

  function cancelEdit() {
    setEditingBlock(null);
    setDraft({});
    setPreview(null);
    setValidationErrors({});
  }

  async function resetToInherited(block: DerroteroBlock) {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      // Save with tenant_default source to remove override
      let resetConfig: Partial<EffectiveStoreConfig> = {};
      if (block === "castillitos") resetConfig = { castillitos: { ...config.castillitos, source: "tenant_default" } };
      else if (block === "latin_kids") resetConfig = { latinKids: { ...config.latinKids, source: "tenant_default" } };
      else if (block === "acc_small") resetConfig = { accessories: { ...config.accessories, small: { ...config.accessories.small, source: "tenant_default" } } };
      else if (block === "acc_medium") resetConfig = { accessories: { ...config.accessories, medium: { ...config.accessories.medium, source: "tenant_default" } } };
      else if (block === "acc_large") resetConfig = { accessories: { ...config.accessories, large: { ...config.accessories.large, source: "tenant_default" } } };
      else if (block === "scarcity") resetConfig = { scarcity: { ...config.scarcity, source: "tenant_default" } };
      else if (block === "special") resetConfig = { specialProducts: { entries: config.specialProducts.entries.map(e => ({ ...e, source: "tenant_default" as const })) } };

      const data = await tiendasApi({
        action: "distribution_save_config",
        storeId, storeName,
        config: resetConfig,
        motivo: "Restaurar valor heredado del tenant",
      });
      if (data.error) { setError(data.error); return; }
      if (data.config) setConfig(data.config);
      setSuccess("Valor heredado restaurado");
      setTimeout(() => setSuccess(null), 3000);
    } catch {
      setError("Error al restaurar valor heredado");
    } finally {
      setSaving(false);
    }
  }

  // ── Preview ─────────────────────────────────────────────────────────────
  async function requestPreview() {
    if (!draft || Object.keys(draft).length === 0) return;

    // Validate first
    let errs: Record<string, string> = {};
    if (draft.castillitos) errs = validateTextile(draft.castillitos);
    if (draft.latinKids) errs = { ...errs, ...validateTextile(draft.latinKids) };
    if (draft.accessories?.small) errs = { ...errs, ...validateAccessory(draft.accessories.small.targetUnits) };
    if (draft.accessories?.medium) errs = { ...errs, ...validateAccessory(draft.accessories.medium.targetUnits) };
    if (draft.accessories?.large) errs = { ...errs, ...validateAccessory(draft.accessories.large.targetUnits) };
    if (draft.scarcity) errs = { ...errs, ...validateScarcity(draft.scarcity) };
    if (draft.specialProducts) errs = { ...errs, ...validateSpecialProducts(draft.specialProducts) };

    if (Object.keys(errs).length > 0) {
      setValidationErrors(errs);
      return;
    }
    setValidationErrors({});
    setPreviewLoading(true);
    try {
      const data = await tiendasApi({
        action: "distribution_preview_impact",
        storeId,
        proposedConfig: draft,
      });
      if (data.preview) setPreview(data.preview);
      else setError("No se pudo calcular el impacto");
    } catch {
      setError("Error al calcular impacto");
    } finally {
      setPreviewLoading(false);
    }
  }

  // ── Save ────────────────────────────────────────────────────────────────
  async function saveChanges() {
    if (!draft || Object.keys(draft).length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const data = await tiendasApi({
        action: "distribution_save_config",
        storeId, storeName,
        config: draft,
        motivo: "Cambio de derrotero desde UI",
      });
      if (data.error) {
        setError(data.error);
        return;
      }
      if (data.config) setConfig(data.config);
      setEditingBlock(null);
      setDraft({});
      setPreview(null);
      setSuccess("Derrotero guardado exitosamente");
      setTimeout(() => setSuccess(null), 3000);
    } catch {
      setError("Error al guardar configuracion");
    } finally {
      setSaving(false);
    }
  }

  function toggleBlock(block: DerroteroBlock) {
    setExpandedBlocks(prev => {
      const next = new Set(prev);
      if (next.has(block)) next.delete(block);
      else next.add(block);
      return next;
    });
  }

  if (loading && !loaded) {
    return <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight, textAlign: "center", padding: S[8] }}>Cargando derrotero...</div>;
  }

  if (!config) {
    return <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint, textAlign: "center", padding: S[8] }}>Configuracion no disponible</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
            Derrotero de {storeName}
          </span>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 2 }}>
            Configuracion efectiva de surtido por mundo, linea y tamano
          </div>
        </div>
        {!editable && (
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, padding: "2px 6px", background: C.surface, borderRadius: R.pill, border: `1px solid ${C.line}` }}>
            Solo lectura
          </span>
        )}
      </div>

      {/* committedUnits disclaimer */}
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, padding: `${S[2]}px`, background: C.surfaceAlt, borderRadius: R.sm, border: `1px solid ${C.line}` }}>
        Disponibilidad basada en inventario fisico. Compromisos de traslado no disponibles.
      </div>

      {error && <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.red, padding: S[2], background: C.redLight, borderRadius: R.sm }}>{error}</div>}
      {success && <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.green, padding: S[2], background: C.greenLight, borderRadius: R.sm }}>{success}</div>}

      {/* Seven blocks */}
      {DERROTERO_BLOCKS.map(block => {
        const isExpanded = expandedBlocks.has(block.key);
        const isEditing = editingBlock === block.key;

        return (
          <div key={block.key} style={{ ...panel, overflow: "hidden" }}>
            {/* Block header — collapsible */}
            <button
              onClick={() => toggleBlock(block.key)}
              style={{
                width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: `${S[3]}px`, background: "none", border: "none", cursor: "pointer",
                borderBottom: isExpanded ? `1px solid ${C.line}` : "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>{isExpanded ? "▼" : "▶"}</span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>{block.label}</span>
                <span style={{
                  fontFamily: T.mono, fontSize: T.sz["2xs"], padding: "1px 5px", borderRadius: R.pill,
                  background: block.world === "TEXTIL" ? C.blueLight : block.world === "IMPORTACION" ? C.amberLight : C.surface,
                  color: block.world === "TEXTIL" ? C.blueDark : block.world === "IMPORTACION" ? C.amber : C.inkMid,
                }}>
                  {block.world}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                {renderBlockSource(block.key, config)}
                {renderBlockStatus(block.key, config)}
              </div>
            </button>

            {/* Block content — collapsed by default */}
            {isExpanded && (
              <div style={{ padding: S[3] }}>
                {block.key === "castillitos" && renderTextileBlock("castillitos", "Castillitos", config.castillitos, isEditing, draft.castillitos, editable, (tc) => setDraft({ castillitos: tc }), validationErrors)}
                {block.key === "latin_kids" && renderTextileBlock("latin_kids", "Latin Kids", config.latinKids, isEditing, draft.latinKids, editable, (tc) => setDraft({ latinKids: tc }), validationErrors)}
                {block.key === "acc_small" && renderAccessoryBlock("small", "Pequenos", config.accessories.small, isEditing, draft.accessories?.small, editable, (ac) => setDraft(prev => ({ accessories: { ...(config?.accessories ?? { small: ac, medium: config.accessories.medium, large: config.accessories.large }), small: ac } })), validationErrors)}
                {block.key === "acc_medium" && renderAccessoryBlock("medium", "Medianos", config.accessories.medium, isEditing, draft.accessories?.medium, editable, (ac) => setDraft(prev => ({ accessories: { ...(config?.accessories ?? { small: config.accessories.small, medium: ac, large: config.accessories.large }), medium: ac } })), validationErrors)}
                {block.key === "acc_large" && renderAccessoryBlock("large", "Grandes", config.accessories.large, isEditing, draft.accessories?.large, editable, (ac) => setDraft(prev => ({ accessories: { ...(config?.accessories ?? { small: config.accessories.small, medium: config.accessories.medium, large: ac }), large: ac } })), validationErrors)}
                {block.key === "scarcity" && renderScarcityBlock(config.scarcity, isEditing, draft.scarcity, editable, (sc) => setDraft({ scarcity: sc }), validationErrors)}
                {block.key === "special" && renderSpecialBlock(config.specialProducts, isEditing, draft.specialProducts, editable, (sp) => setDraft({ specialProducts: sp }), validationErrors, storeId)}

                {/* Edit/Reset actions */}
                {editable && !isEditing && (
                  <div style={{ display: "flex", gap: S[2], marginTop: S[3], paddingTop: S[2], borderTop: `1px solid ${C.line}` }}>
                    <button onClick={() => startEdit(block.key)} className="ag-action-secondary" style={{
                      fontFamily: T.mono, fontSize: T.sz.xs, padding: `${S[1]}px ${S[2]}px`,
                      borderRadius: R.sm, cursor: "pointer", background: C.blueLight,
                      color: C.blueDark, border: `1px solid ${C.blueBorder}`,
                    }}>
                      {getSourceForBlock(block.key, config) === "store_override" ? "Editar" : "Personalizar para esta tienda"}
                    </button>
                    {getSourceForBlock(block.key, config) === "store_override" && (
                      <button onClick={() => resetToInherited(block.key)} style={{
                        fontFamily: T.mono, fontSize: T.sz.xs, padding: `${S[1]}px ${S[2]}px`,
                        borderRadius: R.sm, cursor: "pointer", background: C.surface,
                        color: C.inkMid, border: `1px solid ${C.line}`,
                      }}>
                        Volver al valor heredado
                      </button>
                    )}
                  </div>
                )}

                {/* Editing controls: Preview → Save/Cancel */}
                {isEditing && (
                  <div style={{ marginTop: S[3], paddingTop: S[2], borderTop: `1px solid ${C.line}`, display: "flex", flexDirection: "column", gap: S[2] }}>
                    {/* Preview result */}
                    {preview && (
                      <div style={{ ...panel, padding: S[3], background: C.surfaceAlt }}>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[2] }}>
                          Impacto del cambio
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2] }}>
                          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
                            +{preview.additionalSurtir} ref. adicionales por surtir
                          </div>
                          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
                            +{preview.additionalUnitsNeeded} unidades adicionales
                          </div>
                          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: preview.resolvedDeficits > 0 ? C.green : C.inkMid }}>
                            {preview.resolvedDeficits} deficit resueltos
                          </div>
                          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: preview.newRetirar > 0 ? C.amber : C.inkMid }}>
                            {preview.newRetirar} nuevos por retirar
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div style={{ display: "flex", gap: S[2] }}>
                      {!preview && (
                        <button onClick={requestPreview} disabled={previewLoading} className="ag-action-secondary" style={{
                          fontFamily: T.mono, fontSize: T.sz.xs, padding: `${S[1]}px ${S[3]}px`,
                          borderRadius: R.sm, cursor: previewLoading ? "wait" : "pointer",
                          background: C.blueLight, color: C.blueDark, border: `1px solid ${C.blueBorder}`,
                          opacity: previewLoading ? 0.6 : 1,
                        }}>
                          {previewLoading ? "Calculando..." : "Previsualizar impacto"}
                        </button>
                      )}
                      {preview && (
                        <button onClick={saveChanges} disabled={saving} className="ag-action-primary" style={{
                          fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                          padding: `${S[1]}px ${S[3]}px`, borderRadius: R.sm,
                          cursor: saving ? "wait" : "pointer",
                          background: C.blueDark, color: C.white, border: "none",
                          opacity: saving ? 0.6 : 1,
                        }}>
                          {saving ? "Guardando..." : "Guardar cambio"}
                        </button>
                      )}
                      <button onClick={cancelEdit} style={{
                        fontFamily: T.mono, fontSize: T.sz.xs, padding: `${S[1]}px ${S[3]}px`,
                        borderRadius: R.sm, cursor: "pointer", background: C.surface,
                        color: C.inkMid, border: `1px solid ${C.line}`,
                      }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Derrotero helper renders ──────────────────────────────────────────────────

function getSourceForBlock(block: DerroteroBlock, config: EffectiveStoreConfig): "tenant_default" | "store_override" {
  switch (block) {
    case "castillitos": return config.castillitos.source;
    case "latin_kids": return config.latinKids.source;
    case "acc_small": return config.accessories.small.source;
    case "acc_medium": return config.accessories.medium.source;
    case "acc_large": return config.accessories.large.source;
    case "scarcity": return config.scarcity.source;
    case "special": return config.specialProducts?.entries.some(e => e.source === "store_override") ? "store_override" : "tenant_default";
    default: return "tenant_default";
  }
}

function renderBlockSource(block: DerroteroBlock, config: EffectiveStoreConfig) {
  const source = getSourceForBlock(block, config);
  const isOverride = source === "store_override";
  return (
    <span style={{
      fontFamily: T.mono, fontSize: T.sz["2xs"], padding: "1px 5px", borderRadius: R.pill,
      background: isOverride ? C.amberLight : C.surface,
      color: isOverride ? C.amber : C.inkFaint,
      border: `1px solid ${isOverride ? C.amberBorder : C.line}`,
    }}>
      {isOverride ? "Override" : "Heredado"}
    </span>
  );
}

function renderBlockStatus(block: DerroteroBlock, config: EffectiveStoreConfig) {
  let enabled = true;
  if (block === "castillitos") enabled = config.castillitos.enabled;
  else if (block === "latin_kids") enabled = config.latinKids.enabled;
  else if (block === "scarcity") enabled = config.scarcity.enabled;

  return (
    <span style={{
      fontFamily: T.mono, fontSize: T.sz["2xs"], padding: "1px 5px", borderRadius: R.pill,
      background: enabled ? C.greenLight : C.surface,
      color: enabled ? C.green : C.inkFaint,
    }}>
      {enabled ? "Activo" : "Inactivo"}
    </span>
  );
}

function renderTextileBlock(
  _blockId: string,
  label: string,
  effective: EffectiveTextileConfig,
  isEditing: boolean,
  draftValue: EffectiveTextileConfig | undefined,
  _editable: boolean,
  onChange: (tc: EffectiveTextileConfig) => void,
  errors: Record<string, string>,
) {
  const val = isEditing && draftValue ? draftValue : effective;
  const fieldStyle = { fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, padding: `${S[1]}px`, borderRadius: R.sm, border: `1px solid ${C.line}`, width: 60, textAlign: "center" as const };
  const labelStyle = { fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight };
  const helpStyle = { fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 1 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
      {/* Effective values */}
      <div style={{ display: "flex", gap: S[4], alignItems: "flex-start" }}>
        <div>
          <div style={labelStyle}>Minimo</div>
          {isEditing ? (
            <input type="number" value={val.minUnits} min={0} onChange={e => onChange({ ...val, minUnits: parseInt(e.target.value) || 0 })} style={fieldStyle} />
          ) : (
            <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.ink }}>{val.minUnits}</div>
          )}
          <div style={helpStyle}>Total del subgrupo debajo: surtir</div>
          {errors.minUnits && <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red }}>{errors.minUnits}</div>}
        </div>
        <div>
          <div style={labelStyle}>Objetivo</div>
          {isEditing ? (
            <input type="number" value={val.targetUnits} min={0} onChange={e => onChange({ ...val, targetUnits: parseInt(e.target.value) || 0 })} style={fieldStyle} />
          ) : (
            <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.blueDark }}>{val.targetUnits}</div>
          )}
          <div style={helpStyle}>Meta agregada del subgrupo</div>
          {errors.targetUnits && <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red }}>{errors.targetUnits}</div>}
        </div>
        <div>
          <div style={labelStyle}>Maximo</div>
          {isEditing ? (
            <input type="number" value={val.maxUnits} min={0} onChange={e => onChange({ ...val, maxUnits: parseInt(e.target.value) || 0 })} style={fieldStyle} />
          ) : (
            <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.ink }}>{val.maxUnits}</div>
          )}
          <div style={helpStyle}>Total del subgrupo encima: retirar excedente</div>
          {errors.maxUnits && <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red }}>{errors.maxUnits}</div>}
        </div>
      </div>

      {/* Vigencia */}
      {isEditing ? (
        <div style={{ display: "flex", gap: S[3] }}>
          <div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>Desde</div>
            <input type="date" value={val.validFrom || ""} onChange={e => onChange({ ...val, validFrom: e.target.value || null })}
              style={{ fontFamily: T.mono, fontSize: T.sz.xs, padding: `${S[1]}px`, borderRadius: R.sm, border: `1px solid ${C.line}` }} />
          </div>
          <div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>Hasta</div>
            <input type="date" value={val.validTo || ""} onChange={e => onChange({ ...val, validTo: e.target.value || null })}
              style={{ fontFamily: T.mono, fontSize: T.sz.xs, padding: `${S[1]}px`, borderRadius: R.sm, border: `1px solid ${C.line}` }} />
          </div>
          <div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>Temporada</div>
            <input type="text" value={val.season || ""} placeholder="Ej: Navidad 2026" maxLength={100}
              onChange={e => onChange({ ...val, season: e.target.value || null })}
              style={{ fontFamily: T.mono, fontSize: T.sz.xs, padding: `${S[1]}px`, borderRadius: R.sm, border: `1px solid ${C.line}`, width: 120 }} />
          </div>
        </div>
      ) : (
        <>
          {(effective.validFrom || effective.validTo) && (
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
              Vigencia: {effective.validFrom || "\u2014"} a {effective.validTo || "\u2014"}
              {effective.season && ` · ${effective.season}`}
            </div>
          )}
        </>
      )}

      {/* Source info */}
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
        Fuente: {effective.source === "store_override" ? `Override de ${label}` : `Politica del tenant (${label})`}
      </div>
    </div>
  );
}

function renderAccessoryBlock(
  sizeClass: string,
  label: string,
  effective: EffectiveAccessoryConfig,
  isEditing: boolean,
  draftValue: EffectiveAccessoryConfig | undefined,
  _editable: boolean,
  onChange: (ac: EffectiveAccessoryConfig) => void,
  errors: Record<string, string>,
) {
  const val = isEditing && draftValue ? draftValue : effective;
  const fieldStyle = { fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, padding: `${S[1]}px`, borderRadius: R.sm, border: `1px solid ${C.line}`, width: 60, textAlign: "center" as const };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
      <div style={{ display: "flex", gap: S[4], alignItems: "flex-start" }}>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>Objetivo ({label})</div>
          {isEditing ? (
            <input type="number" value={val.targetUnits} min={0} onChange={e => onChange({ ...val, targetUnits: parseInt(e.target.value) || 0 })} style={fieldStyle} />
          ) : (
            <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.ink }}>{val.targetUnits}</div>
          )}
          {errors.targetUnits && <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red }}>{errors.targetUnits}</div>}
        </div>
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
        Fuente: {effective.source === "store_override" ? `Override accesorios ${label.toLowerCase()}` : "Politica del tenant"}
      </div>
    </div>
  );
}

const ACTIVE_STORE_NAMES: Record<string, string> = {
  san_diego: "San Diego",
  centro: "Centro",
  gran_plaza: "Gran Plaza",
  caldas: "Caldas",
};

function renderScarcityBlock(
  effective: EffectiveScarcityConfig,
  isEditing: boolean,
  draftValue: EffectiveScarcityConfig | undefined,
  _editable: boolean,
  onChange: (sc: EffectiveScarcityConfig) => void,
  errors: Record<string, string>,
) {
  const val = isEditing && draftValue ? draftValue : effective;
  const fieldStyle = { fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, padding: `${S[1]}px`, borderRadius: R.sm, border: `1px solid ${C.line}`, width: 60, textAlign: "center" as const };

  function toggleStore(slug: string) {
    const currentIds = [...val.allowedStoresWhenScarce];
    const currentNames = [...val.allowedStoreNames];
    const idx = currentIds.indexOf(slug);
    if (idx >= 0) {
      currentIds.splice(idx, 1);
      currentNames.splice(idx, 1);
    } else {
      currentIds.push(slug);
      currentNames.push(ACTIVE_STORE_NAMES[slug] || slug);
    }
    onChange({ ...val, allowedStoresWhenScarce: currentIds, allowedStoreNames: currentNames });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, lineHeight: "1.4" }}>
        Cuando el inventario textil disponible sea igual o inferior al umbral, la referencia se concentra unicamente en las tiendas seleccionadas.
      </div>

      <div style={{ display: "flex", gap: S[4], alignItems: "flex-start" }}>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>Umbral</div>
          {isEditing ? (
            <input type="number" value={val.lowStockConcentrationThreshold} min={0} onChange={e => onChange({ ...val, lowStockConcentrationThreshold: parseInt(e.target.value) || 0 })} style={fieldStyle} />
          ) : (
            <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.ink }}>{val.lowStockConcentrationThreshold}</div>
          )}
          {errors.threshold && <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red }}>{errors.threshold}</div>}
        </div>
      </div>

      <div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, marginBottom: S[1] }}>Tiendas permitidas cuando sea escaso:</div>
        {isEditing ? (
          <div style={{ display: "flex", gap: S[1], flexWrap: "wrap" }}>
            {ACTIVE_STORE_SLUGS.map(slug => {
              const selected = val.allowedStoresWhenScarce.includes(slug);
              return (
                <button key={slug} onClick={() => toggleStore(slug)} style={{
                  fontFamily: T.mono, fontSize: T.sz["2xs"], padding: "2px 8px", borderRadius: R.pill,
                  background: selected ? C.greenLight : C.surface,
                  color: selected ? C.green : C.inkFaint,
                  border: `1px solid ${selected ? C.greenBorder : C.line}`,
                  cursor: "pointer",
                }}>
                  {selected ? "✓ " : ""}{ACTIVE_STORE_NAMES[slug] || slug}
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ display: "flex", gap: S[1], flexWrap: "wrap" }}>
            {val.allowedStoreNames.map((name, idx) => (
              <span key={idx} style={{
                fontFamily: T.mono, fontSize: T.sz["2xs"], padding: "2px 6px", borderRadius: R.pill,
                background: C.greenLight, color: C.green, border: `1px solid ${C.greenBorder}`,
              }}>
                {name}
              </span>
            ))}
            {val.allowedStoreNames.length === 0 && (
              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red }}>Ninguna tienda seleccionada</span>
            )}
          </div>
        )}
        {errors.allowedStores && <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red, marginTop: S[1] }}>{errors.allowedStores}</div>}
      </div>

      {/* Vigencia fields */}
      {isEditing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
          <div style={{ display: "flex", gap: S[3] }}>
            <div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>Vigencia desde</div>
              <input type="date" value={val.validFrom || ""} onChange={e => onChange({ ...val, validFrom: e.target.value || null })}
                style={{ fontFamily: T.mono, fontSize: T.sz.xs, padding: `${S[1]}px`, borderRadius: R.sm, border: `1px solid ${C.line}` }} />
              {errors.validFrom && <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red }}>{errors.validFrom}</div>}
            </div>
            <div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>Vigencia hasta</div>
              <input type="date" value={val.validTo || ""} onChange={e => onChange({ ...val, validTo: e.target.value || null })}
                style={{ fontFamily: T.mono, fontSize: T.sz.xs, padding: `${S[1]}px`, borderRadius: R.sm, border: `1px solid ${C.line}` }} />
              {errors.validTo && <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red }}>{errors.validTo}</div>}
            </div>
          </div>
          <div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>Temporada</div>
            <input type="text" value={val.season || ""} placeholder="Ej: Navidad 2026" maxLength={100}
              onChange={e => onChange({ ...val, season: e.target.value || null })}
              style={{ fontFamily: T.mono, fontSize: T.sz.xs, padding: `${S[1]}px`, borderRadius: R.sm, border: `1px solid ${C.line}`, width: "100%" }} />
          </div>
          <div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>Notas</div>
            <input type="text" value={val.notes || ""} placeholder="Observaciones" maxLength={500}
              onChange={e => onChange({ ...val, notes: e.target.value || null })}
              style={{ fontFamily: T.mono, fontSize: T.sz.xs, padding: `${S[1]}px`, borderRadius: R.sm, border: `1px solid ${C.line}`, width: "100%" }} />
          </div>
        </div>
      ) : (
        <>
          {(val.validFrom || val.validTo) && (
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
              Vigencia: {val.validFrom || "\u2014"} a {val.validTo || "\u2014"}
              {val.season && ` · Temporada: ${val.season}`}
            </div>
          )}
          {val.notes && (
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, fontStyle: "italic" }}>
              {val.notes}
            </div>
          )}
        </>
      )}

      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
        Fuente: {effective.source === "store_override" ? "Override de tienda" : "Politica del tenant"}
      </div>
    </div>
  );
}

function renderSpecialBlock(
  effective: EffectiveSpecialProductConfig,
  isEditing: boolean,
  draftValue: EffectiveSpecialProductConfig | undefined,
  _editable: boolean,
  onChange: (sp: EffectiveSpecialProductConfig) => void,
  errors: Record<string, string>,
  storeId: string,
) {
  const entries = isEditing && draftValue ? draftValue.entries : effective.entries;
  const fieldStyle = { fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, padding: `${S[1]}px`, borderRadius: R.sm, border: `1px solid ${C.line}`, width: 60, textAlign: "center" as const };

  function updateEntry(idx: number, patch: Partial<EffectiveSpecialProductEntry>) {
    const updated = entries.map((e, i) => i === idx ? { ...e, ...patch, source: "store_override" as const } : e);
    onChange({ entries: updated });
  }

  function removeEntry(idx: number) {
    onChange({ entries: entries.filter((_, i) => i !== idx) });
  }

  function addEntry() {
    onChange({ entries: [...entries, { pattern: "", idealUnits: 1, source: "store_override", validFrom: null, validTo: null, season: null, notes: null }] });
  }

  function revertEntry(idx: number) {
    const original = effective.entries.find(o => o.pattern === entries[idx].pattern);
    const idealUnits = original?.idealUnits ?? entries[idx].idealUnits;
    const updated = entries.map((e, i) => i === idx ? { ...e, idealUnits, source: "tenant_default" as const, notes: null, validFrom: null, validTo: null, season: null } : e);
    onChange({ entries: updated });
  }

  const PATTERN_LABEL: Record<string, string> = {
    "BAÑERA": "Banera",
    "CUNA_COLECHO": "Cuna Colecho",
    "CORRAL": "Corral",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, lineHeight: "1.4" }}>
        Cada regla especial define un patron de coincidencia textual y la cantidad objetivo de unidades para esta tienda. Ideal=0 indica que el producto no esta autorizado.
      </div>

      {entries.map((entry, idx) => {
        const label = PATTERN_LABEL[entry.pattern] || entry.pattern.replace(/_/g, " ");
        const isOverride = entry.source === "store_override";
        const isDefault = !isOverride;
        const isDisabled = isEditing && entry.idealUnits === 0 && isOverride;

        return (
          <div key={idx} style={{
            ...panel, padding: S[2],
            background: isDisabled ? C.surface : C.surfaceAlt,
            opacity: isDisabled ? 0.6 : 1,
            border: `1px solid ${isOverride ? C.amberBorder : C.line}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: S[1] }}>
              <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
                  {isEditing && !PATTERN_LABEL[entry.pattern] ? (
                    <input
                      type="text"
                      value={entry.pattern}
                      placeholder="PATRON_PRODUCTO"
                      onChange={e => updateEntry(idx, { pattern: e.target.value.toUpperCase() })}
                      style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, padding: `${S[1]}px`, borderRadius: R.sm, border: `1px solid ${C.line}`, width: 160 }}
                    />
                  ) : (
                    label
                  )}
                </span>
                <span style={{
                  fontFamily: T.mono, fontSize: T.sz["2xs"], padding: "1px 5px", borderRadius: R.pill,
                  background: isOverride ? C.amberLight : C.surface,
                  color: isOverride ? C.amber : C.inkFaint,
                  border: `1px solid ${isOverride ? C.amberBorder : C.line}`,
                }}>
                  {isOverride ? "Personalizado" : "Predeterminado"}
                </span>
              </div>

              {isEditing && (
                <div style={{ display: "flex", gap: S[1] }}>
                  {isOverride && isDefault === false && PATTERN_LABEL[entry.pattern] && (
                    <button onClick={() => revertEntry(idx)} style={{
                      fontFamily: T.mono, fontSize: T.sz["2xs"], padding: "2px 6px", borderRadius: R.sm,
                      background: C.surface, color: C.inkMid, border: `1px solid ${C.line}`, cursor: "pointer",
                    }}>
                      Restablecer
                    </button>
                  )}
                  {!PATTERN_LABEL[entry.pattern] && (
                    <button onClick={() => removeEntry(idx)} style={{
                      fontFamily: T.mono, fontSize: T.sz["2xs"], padding: "2px 6px", borderRadius: R.sm,
                      background: C.surface, color: C.red, border: `1px solid ${C.redBorder}`, cursor: "pointer",
                    }}>
                      Eliminar
                    </button>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: S[4], alignItems: "flex-start" }}>
              <div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>Patron</div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>{entry.pattern || "\u2014"}</div>
              </div>
              <div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>Cantidad objetivo</div>
                {isEditing ? (
                  <input
                    type="number"
                    value={entry.idealUnits}
                    min={0}
                    onChange={e => updateEntry(idx, { idealUnits: parseInt(e.target.value) || 0 })}
                    style={fieldStyle}
                  />
                ) : (
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: entry.idealUnits === 0 ? C.red : C.blueDark }}>
                    {entry.idealUnits}
                  </div>
                )}
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 1 }}>
                  {entry.idealUnits === 0 ? "No autorizado en esta tienda" : `${entry.idealUnits} uds objetivo`}
                </div>
                {errors[`sp_${idx}_ideal`] && <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red }}>{errors[`sp_${idx}_ideal`]}</div>}
                {errors[`sp_${idx}_pattern`] && <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red }}>{errors[`sp_${idx}_pattern`]}</div>}
              </div>
            </div>

            {/* Vigencia & notes for overrides */}
            {isEditing && isOverride && (
              <div style={{ marginTop: S[2], display: "flex", flexDirection: "column", gap: S[1] }}>
                <div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>Notas</div>
                  <input type="text" value={entry.notes || ""} placeholder="Observaciones" maxLength={500}
                    onChange={e => updateEntry(idx, { notes: e.target.value || null })}
                    style={{ fontFamily: T.mono, fontSize: T.sz.xs, padding: `${S[1]}px`, borderRadius: R.sm, border: `1px solid ${C.line}`, width: "100%" }}
                  />
                </div>
              </div>
            )}

            {/* Display notes/vigencia for non-editing */}
            {!isEditing && entry.notes && (
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, fontStyle: "italic", marginTop: S[1] }}>
                {entry.notes}
              </div>
            )}
          </div>
        );
      })}

      {/* Add new rule button */}
      {isEditing && (
        <button onClick={addEntry} className="ag-action-secondary" style={{
          fontFamily: T.mono, fontSize: T.sz.xs, padding: `${S[1]}px ${S[2]}px`,
          borderRadius: R.sm, cursor: "pointer", background: C.blueLight,
          color: C.blueDark, border: `1px solid ${C.blueBorder}`,
          alignSelf: "flex-start",
        }}>
          + Agregar regla especial
        </button>
      )}

      {!isEditing && (
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
          Fuente: {effective.entries.some(e => e.source === "store_override") ? "Con personalizaciones" : "Politica del tenant"}
          {" · "}Tienda: {ACTIVE_STORE_NAMES[storeId] || storeId}
        </div>
      )}
    </div>
  );
}

// ── Shared helpers ───────────────────────────────────────────────────────────

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{label}</div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color }}>{value}</div>
    </div>
  );
}

/** VISUAL-HARMONIZATION-01 — KPI card compacta (misma gramática que Cobertura/Inventario). */
function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ ...panel, padding: `${S[2]}px ${S[3]}px`, display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 80 }}>
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const }}>
        {label}
      </span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color }}>{value}</span>
    </div>
  );
}

/** VISUAL-HARMONIZATION-01 — hint de viewport SOLO presentación (patrón Inteligencia). */
function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 559px)");
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return narrow;
}

/** COVERAGE-UX-01 — fila de regla del tab Cobertura: render puro del DTO
 *  (label, "Actual N · Regla m/i/M", estado humano, detalle). Cero derivación. */
function CoverageRuleRowLine({ row }: { row: CoverageRuleRowPresentation }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: S[3],
      padding: `${S[1]}px ${S[2]}px`, borderBottom: `1px solid ${C.lineSubtle}`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
          {row.label}
        </span>
        {row.detailText && (
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
            {row.detailText}
          </div>
        )}
      </div>
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, width: 100, textAlign: "right" }}>
        Regla {row.ruleText}
      </span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink, width: 72, textAlign: "right" }}>
        {row.actualUnitsText} uds
      </span>
      <span style={{
        fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
        padding: "2px 8px", borderRadius: R.pill, width: 170, textAlign: "center",
        background: TONE_BADGE[row.tone].bg, color: TONE_BADGE[row.tone].text,
      }}>
        {row.statusLabel}
      </span>
    </div>
  );
}

/** Collapsible structure accordion for Needs tab (AGENTIK-STORES-NEEDS-UX-02) */
function NeedsStructureAccordion({ group: g }: { group: { structureKey: string; label: string; suggestedText: string; requiredText: string; pendingText: string; fullyCovered: boolean; items: readonly { referenceCode: string; productName: string; unitsText: string; typeLabel: string }[] } }) {
  const [open, setOpen] = useState(false);
  const totalUnits = g.items.length;
  return (
    <div style={{ borderBottom: `1px solid ${C.line}` }}>
      {/* Accordion header */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: S[2], width: "100%",
          padding: `${S[2]}px ${S[3]}px`, background: C.surfaceAlt,
          border: "none", cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid, width: 16, flexShrink: 0 }}>
          {open ? "▼" : "▶"}
        </span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink, flex: 1, minWidth: 0 }}>
          {g.label} ({g.suggestedText} uds)
        </span>
        <span style={{
          fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
          padding: "2px 8px", borderRadius: R.pill, flexShrink: 0,
          background: C.blueDark, color: C.white,
        }}>
          Enviar {g.suggestedText}
        </span>
        {!g.fullyCovered && (
          <span style={{
            fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
            padding: "2px 8px", borderRadius: R.pill, flexShrink: 0,
            background: C.amberLight, color: C.amber, border: `1px solid ${C.amberBorder}`,
          }}>
            Pend. {g.pendingText}
          </span>
        )}
      </button>
      {/* Accordion body — aligned grid: Grupo | Referencia | Tipo | Cantidad */}
      {open && (
        <div style={{ padding: `0 ${S[3]}px` }}>
          {/* Column headers */}
          <div style={{
            display: "grid", gridTemplateColumns: "36px 1fr auto 80px",
            gap: S[2], padding: `${S[1]}px 0`,
            borderBottom: `1px solid ${C.lineSubtle}`,
          }}>
            <span />
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" }}>Referencia</span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" }}>Tipo</span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase", textAlign: "right" }}>Cantidad</span>
          </div>
          {g.items.map((item, ii) => (
            <div key={`${item.referenceCode}-${ii}`} style={{
              display: "grid", gridTemplateColumns: "36px 1fr auto 80px",
              gap: S[2], alignItems: "center",
              padding: `${S[2]}px 0`, borderBottom: ii < totalUnits - 1 ? `1px solid ${C.lineSubtle}` : "none",
            }}>
              <CommercialReferenceThumbnail referenceCode={item.referenceCode} imageUrl={null} description={item.productName} size={30} />
              <div style={{ minWidth: 0 }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
                  {item.referenceCode}
                </span>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.productName}
                </div>
              </div>
              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, flexShrink: 0 }}>
                {item.typeLabel}
              </span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.blueDark, textAlign: "right" }}>
                {item.unitsText} uds
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Needs tab with line filter + two outer accordions closed by default (AGENTIK-STORES-NEEDS-UX-02.3) */
function NeedsTabContent({ opNeeds, needsPres, orgSlug }: { opNeeds: OperativeNeedsPresentation; needsPres: NeedsTabPresentation; orgSlug: string }) {
  const [needsLine, setNeedsLine] = useState<string>("ALL");
  const [surtidoOpen, setSurtidoOpen] = useState(false);
  const [pendientesOpen, setPendientesOpen] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [planResult, setPlanResult] = useState<{ batchId: string; documents: any[]; reusedExistingBatch: boolean } | null>(null);
  const [reserveLoading, setReserveLoading] = useState(false);
  const [reserveResult, setReserveResult] = useState<any | null>(null);
  const [exportLoading, setExportLoading] = useState<string | null>(null);

  const surtidoId = "needs-surtido-body";
  const pendientesId = "needs-pendientes-body";

  // Derive unique commercial lines from structure groups + unassigned (exclude non-commercial)
  const availableLines = useMemo(() => {
    const lineSet = new Set<string>();
    for (const g of opNeeds.structureGroups) if (g.line && NEEDS_COMMERCIAL_LINES.has(g.line)) lineSet.add(g.line);
    for (const u of opNeeds.unassigned) if (u.line && NEEDS_COMMERCIAL_LINES.has(u.line)) lineSet.add(u.line);
    return [...lineSet].sort();
  }, [opNeeds.structureGroups, opNeeds.unassigned]);

  // Filter data by selected line
  const filteredGroups = useMemo(
    () => needsLine === "ALL" ? opNeeds.structureGroups : opNeeds.structureGroups.filter(g => g.line === needsLine),
    [opNeeds.structureGroups, needsLine],
  );
  const filteredUnassigned = useMemo(
    () => needsLine === "ALL" ? opNeeds.unassigned : opNeeds.unassigned.filter(u => u.line === needsLine),
    [opNeeds.unassigned, needsLine],
  );

  // Per-line KPI totals (client-side sum of filtered groups — presentation only)
  const kpiSuggested = useMemo(() => {
    let total = 0;
    for (const g of filteredGroups) total += g.suggestedUnits;
    return total;
  }, [filteredGroups]);
  const kpiPending = useMemo(() => {
    let total = 0;
    for (const g of filteredGroups) total += g.pendingUnits;
    for (const u of filteredUnassigned) total += u.pendingUnits;
    return total;
  }, [filteredGroups, filteredUnassigned]);
  const kpiCovered = useMemo(() => filteredGroups.filter(g => g.fullyCovered).length, [filteredGroups]);
  const kpiTotal = filteredGroups.length + filteredUnassigned.length;

  const fmtN = (n: number) => n.toLocaleString("es-CO");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
      {/* Contextual header (AGENTIK-STORES-NEEDS-UX-02.2) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.semibold, color: C.ink }}>
          Necesidades de surtido
        </span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
          Revisa la mercancía que puede enviarse desde la bodega principal para mejorar la cobertura de esta tienda.
        </span>
      </div>

      {/* KPI cards — react to line filter */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: S[2] }}>
        <div className="ag-kpi-card" style={{ padding: S[3], display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, textTransform: "uppercase", letterSpacing: "0.04em" }}>Podemos surtir</span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.blueDark }}>{fmtN(kpiSuggested)} uds</span>
        </div>
        <div className="ag-kpi-card" style={{ padding: S[3], display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, textTransform: "uppercase", letterSpacing: "0.04em" }}>Quedará pendiente</span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: kpiPending > 0 ? C.red : C.green }}>{fmtN(kpiPending)} uds</span>
        </div>
        <div className="ag-kpi-card" style={{ padding: S[3], display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, textTransform: "uppercase", letterSpacing: "0.04em" }}>Cobertura lograda</span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.green }}>{fmtN(kpiCovered)} de {fmtN(kpiTotal)} grupos</span>
        </div>
      </div>

      {/* Line filter — same visual as Inventory tab (AGENTIK-STORES-NEEDS-UX-02.3) */}
      {availableLines.length > 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: S[1] }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
            Línea comercial
          </div>
          <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
            {[{ key: "ALL", label: "Todas" }, ...availableLines.map(l => ({ key: l, label: NEEDS_LINE_LABEL[l] ?? l }))].map(ln => {
              const isActive = needsLine === ln.key;
              return (
                <button
                  key={ln.key}
                  onClick={() => { setNeedsLine(ln.key); setSurtidoOpen(false); setPendientesOpen(false); }}
                  style={{
                    fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                    padding: "6px 14px", borderRadius: R.sm, cursor: "pointer",
                    background: isActive ? C.blueDark : C.white,
                    color: isActive ? C.white : C.ink,
                    border: `1.5px solid ${isActive ? C.blueDark : C.line}`,
                  }}
                >
                  {ln.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ Outer accordion 1: Propuesta de surtido ═══ */}
      <div style={{ ...panel }}>
        <button
          type="button"
          aria-expanded={surtidoOpen}
          aria-controls={surtidoId}
          onClick={() => setSurtidoOpen(v => !v)}
          style={{
            ...panelHeader, display: "flex", alignItems: "center", gap: S[2],
            width: "100%", border: "none", cursor: "pointer", textAlign: "left",
          }}
        >
          <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid, width: 16, flexShrink: 0 }}>
            {surtidoOpen ? "▼" : "▶"}
          </span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink, flex: 1 }}>
            Propuesta de surtido para esta tienda
          </span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, flexShrink: 0 }}>
            {filteredGroups.length} grupos · {fmtN(kpiSuggested)} uds
          </span>
        </button>
        {surtidoOpen && (
          <div id={surtidoId}>
            {filteredGroups.length === 0 ? (
              <div style={{ padding: S[4], fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>
                No hay mercancía sugerida para esta línea en este momento.
              </div>
            ) : (
              <div>
                {filteredGroups.map(g => (
                  <NeedsStructureAccordion key={g.structureKey} group={g} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Retiros sugeridos */}
      {opNeeds.withdrawals.length > 0 && (
        <div style={{ ...panel }}>
          <div style={{ ...panelHeader }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.amber }}>
              Mercancía a retirar
            </span>
          </div>
          <div style={{ padding: S[2] }}>
            {opNeeds.withdrawals.map((w, i) => (
              <div key={`${w.structureKey}-${i}`} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: `${S[1]}px ${S[2]}px`, borderBottom: `1px solid ${C.lineSubtle}`,
                fontFamily: T.mono, fontSize: T.sz.sm,
              }}>
                <span style={{ color: C.ink }}>{w.label}</span>
                <span style={{ color: C.amber, fontWeight: T.wt.semibold }}>{w.unitsText} uds</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ Outer accordion 2: Pendientes sin inventario ═══ */}
      <div style={{ ...panel }}>
        <button
          type="button"
          aria-expanded={pendientesOpen}
          aria-controls={pendientesId}
          onClick={() => setPendientesOpen(v => !v)}
          style={{
            ...panelHeader, display: "flex", alignItems: "center", gap: S[2],
            width: "100%", border: "none", cursor: "pointer", textAlign: "left",
          }}
        >
          <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid, width: 16, flexShrink: 0 }}>
            {pendientesOpen ? "▼" : "▶"}
          </span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.red, flex: 1 }}>
            Pendientes sin inventario disponible
          </span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, flexShrink: 0 }}>
            {filteredUnassigned.length} grupos · {fmtN(kpiPending)} uds
          </span>
        </button>
        {pendientesOpen && (
          <div id={pendientesId}>
            {filteredUnassigned.length === 0 ? (
              <div style={{ padding: S[4], fontFamily: T.mono, fontSize: T.sz.sm, color: C.green }}>
                Todas las necesidades de esta línea pueden cubrirse con el inventario disponible.
              </div>
            ) : (
              <div style={{ padding: S[2] }}>
                {filteredUnassigned.map((u, i) => (
                  <div key={`unassigned-${i}`} style={{ padding: `${S[2]}px ${S[2]}px`, borderBottom: `1px solid ${C.lineSubtle}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: S[2] }}>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
                        {u.structureLabel}
                      </span>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.red, flexShrink: 0 }}>
                        {u.pendingText} uds
                      </span>
                    </div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, marginTop: 2 }}>
                      {u.cause}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* CTA — Plan de surtido + Reserva (AGENTIK-STORES-SUPPLY-PLAN-RESERVATION-01) */}
      {opNeeds.hasSuggestions && !planResult && (
        <button
          type="button"
          className="ag-action-primary"
          style={{ alignSelf: "flex-start", fontFamily: T.mono, fontSize: T.sz.sm }}
          disabled={planLoading}
          onClick={async () => {
            setPlanLoading(true);
            try {
              const res = await tiendaApi(orgSlug, { action: "replenishment_document_create", generatedBy: "usuario" });
              if (res.batchId) setPlanResult(res);
            } catch (err) {
              console.error("[PLAN-SURTIDO] error", err);
            } finally {
              setPlanLoading(false);
            }
          }}
        >
          {planLoading ? "Generando plan de surtido..." : "Generar plan de surtido"}
        </button>
      )}

      {/* Plan result: review + reserve + export */}
      {planResult && (
        <div style={{ display: "flex", flexDirection: "column", gap: S[2], padding: S[3], background: C.surfaceAlt, borderRadius: R.md, border: `1px solid ${C.line}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600 }}>
              Plan de surtido generado
            </span>
            {planResult.reusedExistingBatch && (
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.amber }}>
                (reutilizado — mismo contenido)
              </span>
            )}
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
            {planResult.documents.length} documentos · Corrida: {planResult.batchId.slice(0, 8)}
          </div>

          {/* Document list */}
          {planResult.documents.map((doc: any) => (
            <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: S[2], fontFamily: T.mono, fontSize: T.sz.xs }}>
              <span style={{ fontWeight: 600 }}>{doc.documentNumber}</span>
              <span>{doc.storeName}</span>
              <span style={{ color: C.inkLight }}>{doc.suggestionCount} sugerencias · {doc.allocatedUnits} unds</span>
              <span className="ag-op-status ag-op-status--info" style={{ fontSize: T.sz.xs }}>{doc.status}</span>
            </div>
          ))}

          {/* Actions */}
          <div style={{ display: "flex", gap: S[2], marginTop: S[1] }}>
            {!reserveResult && (
              <button
                type="button"
                className="ag-action-primary"
                style={{ fontFamily: T.mono, fontSize: T.sz.sm }}
                disabled={reserveLoading}
                onClick={async () => {
                  setReserveLoading(true);
                  try {
                    const results = [];
                    for (const doc of planResult.documents) {
                      const res = await tiendaApi(orgSlug, {
                        action: "replenishment_document_reserve",
                        documentId: doc.id,
                        actorId: "usuario",
                      });
                      results.push(res.result);
                    }
                    setReserveResult(results);
                  } catch (err) {
                    console.error("[RESERVAR] error", err);
                  } finally {
                    setReserveLoading(false);
                  }
                }}
              >
                {reserveLoading ? "Reservando inventario..." : "Reservar inventario"}
              </button>
            )}

            {reserveResult && (
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.green, fontWeight: 600 }}>
                Inventario reservado en Agentik
              </span>
            )}

            {/* Export buttons — prominent after reservation */}
            {planResult.documents.map((doc: any) => (
              <div key={`export-${doc.id}`} style={{ display: "flex", gap: S[1] }}>
                {(["pdf", "xml", "xlsx"] as const).map(fmt => (
                  <button
                    key={fmt}
                    type="button"
                    className="ag-action-ghost"
                    style={{ fontFamily: T.mono, fontSize: T.sz.xs, textTransform: "uppercase" }}
                    disabled={exportLoading === `${doc.id}-${fmt}`}
                    onClick={async () => {
                      setExportLoading(`${doc.id}-${fmt}`);
                      try {
                        const res = await tiendaApi(orgSlug, {
                          action: "replenishment_document_export",
                          documentId: doc.id,
                          format: fmt,
                        });
                        if (res.contentBase64 && res.fileName) {
                          const byteChars = atob(res.contentBase64);
                          const byteNums = new Array(byteChars.length);
                          for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
                          const blob = new Blob([new Uint8Array(byteNums)], { type: res.mimeType });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url; a.download = res.fileName; a.click();
                          URL.revokeObjectURL(url);
                        }
                      } catch (err) {
                        console.error(`[EXPORT-${fmt}] error`, err);
                      } finally {
                        setExportLoading(null);
                      }
                    }}
                  >
                    {exportLoading === `${doc.id}-${fmt}` ? "..." : fmt}
                  </button>
                ))}
              </div>
            ))}

            {/* Release reservation button */}
            {reserveResult && (
              <button
                type="button"
                className="ag-action-ghost"
                style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.amber }}
                onClick={async () => {
                  for (const doc of planResult.documents) {
                    await tiendaApi(orgSlug, {
                      action: "replenishment_document_release",
                      documentId: doc.id,
                      actorId: "usuario",
                    });
                  }
                  setReserveResult(null);
                }}
              >
                Liberar reserva
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs / 24)}d`;
}

// ── Distribution View ─────────────────────────────────────────────────────────

const DIST_ACTION_LABEL: Record<StoreDistributionAction, string> = {
  SURTIR:                  "Reponer",
  RETIRAR:                 "Retirar",
  MANTENER:                "Mantener",
  MONITOREAR:              "Monitorear",
  SIN_STOCK_ORIGEN:        "Sin stock origen",
  SIN_REGLA:               "Sin regla",
  SIN_DATOS:               "Sin datos",
  REQUIERE_CONFIGURACION:  "Config. requerida",
  SUGERIR_REEMPLAZO:       "Reemplazo sugerido",
};

const DIST_ACTION_COLOR: Record<StoreDistributionAction, { bg: string; text: string }> = {
  SURTIR:                  { bg: C.blueLight,   text: C.blueDark },
  RETIRAR:                 { bg: C.amberLight,  text: C.amber },
  MANTENER:                { bg: C.greenLight,  text: C.green },
  MONITOREAR:              { bg: C.amberLight,  text: C.amber },
  SIN_STOCK_ORIGEN:        { bg: C.redLight,    text: C.red },
  SUGERIR_REEMPLAZO:       { bg: C.blueLight,   text: C.blueDark },
  SIN_REGLA:               { bg: C.surface,     text: C.inkFaint },
  SIN_DATOS:               { bg: C.surface,     text: C.inkFaint },
  REQUIERE_CONFIGURACION:  { bg: C.amberLight,  text: C.amber },
};

// CUARTO — All action filter options
const DIST_ACTION_FILTERS: (StoreDistributionAction | "ALL")[] = [
  "ALL", "SURTIR", "SUGERIR_REEMPLAZO", "MANTENER", "RETIRAR",
  "SIN_STOCK_ORIGEN", "SIN_REGLA", "SIN_DATOS", "REQUIERE_CONFIGURACION",
];

// SÉPTIMO — Line-level domain filters
type DistDomainFilter = "ALL" | "castillitos" | "latin_kids" | "acc_small" | "acc_medium" | "acc_large";

const DIST_DOMAIN_LABEL: Record<DistDomainFilter, string> = {
  ALL:          "Todos",
  castillitos:  "Castillitos",
  latin_kids:   "Latin Kids",
  acc_small:    "Accesorios pequenos",
  acc_medium:   "Accesorios medianos",
  acc_large:    "Accesorios grandes",
};

function classifyItemDomain(item: StoreDistributionItem): DistDomainFilter {
  if (item.world === "TEXTILE") {
    return item.canonicalLine === "latin_kids" ? "latin_kids" : "castillitos";
  }
  if (item.sizeClass === "small") return "acc_small";
  if (item.sizeClass === "medium") return "acc_medium";
  return "acc_large";
}

// F3A — mapeo 1:1 tono del PA → color del design system (la UI no decide)
const TONE_COLOR: Record<PresentationTone, string> = {
  positive: C.green,
  warning:  C.amber,
  critical: C.red,
  neutral:  C.blueDark,
};
const TONE_BADGE: Record<PresentationTone, { bg: string; text: string }> = {
  positive: { bg: C.greenLight, text: C.green },
  warning:  { bg: C.amberLight, text: C.amber },
  critical: { bg: C.redLight,   text: C.red },
  neutral:  { bg: C.surface,    text: C.inkLight },
};

// ── Inventory-by-line constants (AGENTIK-STORES-INVENTORY-BY-LINE-01) ────────


const INV_SIZE_LABEL: Record<string, string> = {
  small:  "Pequeno",
  medium: "Mediano",
  large:  "Grande",
};

const INV_UNCLASSIFIED_LABEL: Record<string, string> = {
  linea_ausente:           "Linea comercial ausente",
  grupo_ausente:           "Grupo SAG ausente",
  subgrupo_ausente:        "Subgrupo SAG ausente",
  tamano_ausente:          "Tamano no asignado",
  clasificacion_ambigua:   "Clasificacion ambigua",
  producto_no_elegible:    "Producto no elegible",
  dato_canonico_incompleto: "Dato canonico incompleto",
};

function InvLineSummaryStrip({ summary, sortBy, onSortChange }: {
  summary: { type: string; data: Record<string, unknown> };
  sortBy: InvSortBy;
  onSortChange: (s: InvSortBy) => void;
}) {
  const d = summary.data;

  // §4: Factual inventory KPIs only — no policy evaluation
  type KpiItem = { label: string; value: number; color: string };
  let kpis: KpiItem[] = [];

  if (summary.type === "textile" || summary.type === "accessory") {
    kpis = [
      { label: "Referencias", value: Number(d.referenciasActivas ?? 0), color: C.ink },
      { label: "Unidades",    value: Number(d.unidades ?? 0),           color: C.ink },
      { label: "Variantes",   value: Number(d.variantes ?? d.totalVariantes ?? 0), color: C.ink },
    ];
  } else if (summary.type === "unclassified") {
    kpis = [
      { label: "Referencias", value: Number(d.total ?? 0),    color: C.ink },
      { label: "Unidades",    value: Number(d.unidades ?? 0), color: C.ink },
    ];
  } else if (summary.type === "out_of_stock") {
    kpis = [
      { label: "Agotados",    value: Number(d.total ?? 0),       color: C.ink },
      { label: "Castillitos", value: Number(d.castillitos ?? 0), color: C.ink },
      { label: "Latin Kids",  value: Number(d.latinKids ?? 0),   color: C.ink },
      { label: "Accesorios",  value: Number(d.accesorios ?? 0),  color: C.ink },
    ];
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
      <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
        {kpis.map((kpi, idx) => (
          <div
            key={idx}
            style={{
              ...panel, padding: `${S[2]}px ${S[3]}px`, display: "flex", flexDirection: "column", gap: 2,
              flex: 1, minWidth: 80, textAlign: "left" as const,
            }}
          >
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const }}>
              {kpi.label}
            </span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: kpi.color }}>
              {kpi.value}
            </span>
          </div>
        ))}
      </div>

      {/* Sort selector */}
      <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Ordenar por</span>
        <select
          value={sortBy}
          onChange={e => onSortChange(e.target.value as InvSortBy)}
          style={{
            fontFamily: T.mono, fontSize: T.sz["2xs"], padding: "2px 6px",
            borderRadius: R.sm, border: `1px solid ${C.line}`,
            background: C.white, color: C.ink,
          }}
        >
          <option value="QUANTITY_ASC">Menor inventario</option>
          <option value="QUANTITY_DESC">Mayor inventario</option>
          <option value="REFERENCE_ASC">Referencia A–Z</option>
          <option value="REFERENCE_DESC">Referencia Z–A</option>
        </select>
      </div>
    </div>
  );
}

// ── Replacement Candidates Panel (TERCERO) ────────────────────────────────────

function ReplacementCandidatesPanel({ replacement, canonicalLine }: {
  replacement: ReplacementResult;
  canonicalLine: string;
}) {
  const matchLabel = replacement.replacementRuleSource === "SAME_GROUP_AND_SUBGROUP"
    ? "Mismo grupo y subgrupo" : "Mismo subgrupo";

  return (
    <div style={{
      padding: `${S[2]}px ${S[3]}px`, background: C.surfaceAlt,
      borderRadius: R.sm, border: `1px solid ${C.line}`, marginTop: S[1],
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: S[2] }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.inkMid }}>
          Alternativas disponibles · Deficit: {replacement.replacementShortageQty} uds
        </div>
        <span style={{
          fontFamily: T.mono, fontSize: T.sz["2xs"], padding: "1px 5px", borderRadius: R.pill,
          background: C.blueLight, color: C.blueDark,
        }}>
          {matchLabel}
        </span>
      </div>

      {replacement.replacementCandidates.length === 0 ? (
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
          Sin candidatos disponibles
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
          {replacement.replacementCandidates.map((c, ci) => (
            <div key={ci} style={{
              display: "flex", gap: S[3], alignItems: "flex-start",
              padding: S[2], background: C.white, borderRadius: R.sm,
              border: `1px solid ${ci === 0 ? C.blueBorder : C.line}`,
            }}>
              <CommercialReferenceThumbnail
                imageUrl={c.imageUrl}
                referenceCode={c.referenceCode}
                description={c.description}
                size={36}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink }}>
                      {c.referenceCode}
                    </div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                      {c.description}
                    </div>
                  </div>
                  {ci === 0 && (
                    <span style={{
                      fontFamily: T.mono, fontSize: T.sz["2xs"], padding: "1px 5px", borderRadius: R.pill,
                      background: C.greenLight, color: C.green, flexShrink: 0,
                    }}>
                      Recomendado
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: S[3], marginTop: S[1], flexWrap: "wrap" }}>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
                    Linea: {c.canonicalLine === "latin_kids" ? "Latin Kids" : "Castillitos"}
                  </span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
                    Grupo: {c.group}
                  </span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
                    Subgrupo: {c.subgroup}
                  </span>
                </div>
                <div style={{ display: "flex", gap: S[3], marginTop: S[1], flexWrap: "wrap" }}>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
                    En tienda: {c.storeStock} uds
                  </span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: c.mainWarehouseAvailableQty > 0 ? C.green : C.red }}>
                    Bodega principal: {c.mainWarehouseAvailableQty} uds
                  </span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.blueDark }}>
                    Sugerido: {c.suggestedQty} uds
                  </span>
                </div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: S[1] }}>
                  {c.evidence}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {replacement.replacementCoveredQty > 0 && (
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.green, marginTop: S[2] }}>
          Cobertura: {replacement.replacementCoveredQty} de {replacement.replacementShortageQty} uds cubiertas
          · Confianza: {Math.round(replacement.replacementConfidence * 100)}%
        </div>
      )}
    </div>
  );
}

// ── Variant allocation table (VARIANT-BALANCING-01) ───────────────────────────

const BALANCE_QUALITY_LABEL: Record<string, { label: string; color: string }> = {
  BALANCED:                 { label: "Balanceado",          color: C.green },
  PARTIAL:                  { label: "Parcial",             color: C.amber },
  INSUFFICIENT_STOCK:       { label: "Stock insuficiente",  color: C.red },
  INCOMPLETE_VARIANT_DATA:  { label: "Datos incompletos",   color: C.inkFaint },
  NOT_APPLICABLE:           { label: "No aplica",           color: C.inkFaint },
};

interface VariantAllocationForUI {
  totalRequestedQty: number;
  totalAllocatedQty: number;
  unallocatedQty: number;
  allocations: Array<{
    variantKey: string;
    size: string;
    color: string;
    storeQtyBefore: number;
    warehouseAvailableQty: number;
    suggestedQty: number;
    storeQtyAfter: number;
    reason: string;
  }>;
  balanceQuality: string;
  evidenceDate: string;
}

function VariantAllocationTable({ allocation, paddingLeft }: { allocation: VariantAllocationForUI; paddingLeft: number }) {
  const quality = BALANCE_QUALITY_LABEL[allocation.balanceQuality] ?? BALANCE_QUALITY_LABEL.NOT_APPLICABLE;
  return (
    <div style={{ paddingLeft, marginTop: S[2] }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: S[1] }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.inkMid }}>
          Distribucion sugerida por variantes
        </span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: quality.color }}>
          {quality.label}
        </span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: T.mono, fontSize: T.sz["2xs"] }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.line}` }}>
            <th style={{ textAlign: "left", padding: "2px 4px", color: C.inkMid, fontWeight: T.wt.semibold }}>Talla</th>
            <th style={{ textAlign: "left", padding: "2px 4px", color: C.inkMid, fontWeight: T.wt.semibold }}>Color</th>
            <th style={{ textAlign: "right", padding: "2px 4px", color: C.inkMid, fontWeight: T.wt.semibold }}>Tienda</th>
            <th style={{ textAlign: "right", padding: "2px 4px", color: C.inkMid, fontWeight: T.wt.semibold }}>Bodega</th>
            <th style={{ textAlign: "right", padding: "2px 4px", color: C.inkMid, fontWeight: T.wt.semibold }}>Sugerido</th>
            <th style={{ textAlign: "right", padding: "2px 4px", color: C.inkMid, fontWeight: T.wt.semibold }}>Quedaria</th>
          </tr>
        </thead>
        <tbody>
          {allocation.allocations.map((a, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${C.line}` }} title={a.reason}>
              <td style={{ padding: "3px 4px", color: C.ink }}>{a.size === "SIN_TALLA" ? "\u2014" : a.size}</td>
              <td style={{ padding: "3px 4px", color: C.ink }}>{a.color === "SIN_COLOR" ? "\u2014" : a.color}</td>
              <td style={{ padding: "3px 4px", textAlign: "right", color: C.inkMid }}>{a.storeQtyBefore}</td>
              <td style={{ padding: "3px 4px", textAlign: "right", color: a.warehouseAvailableQty > 0 ? C.green : C.inkFaint }}>{a.warehouseAvailableQty}</td>
              <td style={{ padding: "3px 4px", textAlign: "right", fontWeight: T.wt.bold, color: C.blueDark }}>{a.suggestedQty}</td>
              <td style={{ padding: "3px 4px", textAlign: "right", color: C.inkMid }}>{a.storeQtyAfter}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: "flex", gap: S[3], fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: S[1] }}>
        <span>Sugerido: <strong style={{ color: C.blueDark }}>{allocation.totalAllocatedQty}</strong> uds</span>
        {allocation.unallocatedQty > 0 && (
          <span style={{ color: C.amber }}>Pendiente: {allocation.unallocatedQty} uds</span>
        )}
      </div>
    </div>
  );
}

// ── Distribution Store Drawer (NOVENO + SEGUNDO) ──────────────────────────────

type DistDrawerTab = "inventario" | "necesidades" | "cobertura" | "descuentos" | "derrotero" | "inteligencia";

function DistributionStoreDrawer({
  orgSlug,
  snapshot,
  onSnapshotRefresh,
  storeCard,
  onClose,
}: {
  orgSlug: string;
  snapshot: StoreSnapshot;
  onSnapshotRefresh: () => void;
  storeCard: {
    store: { id: string; name: string; sagWarehouseCode: string; city: string };
    coverageText: string;
    healthLabel: string;
    healthTone: PresentationTone;
    subtitle: string;
  };
  onClose: () => void;
}) {
  const [tab, setTab] = useState<DistDrawerTab>("inventario");
  const [actionFilter, setActionFilter] = useState<StoreDistributionAction | "ALL">("ALL");
  const [domainFilter, setDomainFilter] = useState<DistDomainFilter>("ALL");
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  // (estado WHF eliminado — F3A)

  // ── Lazy intelligence loading: only fetch when inteligencia tab is active ──
  // AGENTIK-STORES-CERTIFIED-SALES-MIGRATION-01: the uncertified
  // store_intelligence fetch was removed — this tab renders exclusively
  // from the certified intelligence service (SaleRecord, fuente→tienda).
  const [certifiedIntel, setCertifiedIntel] = useState<CertifiedStoreIntelligenceResponse | null>(null);
  const [certifiedIntelLoading, setCertifiedIntelLoading] = useState(false);
  const [certifiedIntelLoaded, setCertifiedIntelLoaded] = useState(false);
  const [certifiedIntelError, setCertifiedIntelError] = useState(false);
  // VISUAL-HARMONIZATION-01: hint de viewport para el tab Descuentos (solo presentación)
  const isNarrow = useIsNarrow();

  // AGENTIK-STORES-INTELLIGENCE-UX-IMPLEMENTATION-01: product intelligence
  // (segunda carga certificada — 2 llamadas totales, cero N+1 por sección).
  const [productIntel, setProductIntel] = useState<StoreProductIntelligence | null>(null);
  const [productIntelLoading, setProductIntelLoading] = useState(false);
  const [productIntelError, setProductIntelError] = useState(false);
  const [intelPeriod, setIntelPeriod] = useState<WindowId>("LAST_90_DAYS");
  const [productIntelKey, setProductIntelKey] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== "inteligencia" || certifiedIntelLoaded) return;
    let cancelled = false;
    setCertifiedIntelLoading(true);
    setCertifiedIntelError(false);
    tiendaApi(orgSlug, { action: "certified_store_intelligence", storeId: storeCard.store.id })
      .then((data: { certifiedIntelligence?: CertifiedStoreIntelligenceResponse }) => {
        if (cancelled) return;
        if (data.certifiedIntelligence) setCertifiedIntel(data.certifiedIntelligence);
        else setCertifiedIntelError(true);
        setCertifiedIntelLoaded(true);
      })
      .catch(() => { if (!cancelled) { setCertifiedIntelError(true); setCertifiedIntelLoaded(true); } })
      .finally(() => { if (!cancelled) setCertifiedIntelLoading(false); });
    return () => { cancelled = true; };
  }, [tab, storeCard.store.id, orgSlug, certifiedIntelLoaded]);

  useEffect(() => {
    const key = `${storeCard.store.id}:${intelPeriod}`;
    if (tab !== "inteligencia" || productIntelKey === key) return;
    let cancelled = false;
    setProductIntelLoading(true);
    setProductIntelError(false);
    tiendaApi(orgSlug, { action: "store_product_intelligence", storeId: storeCard.store.id, windowId: intelPeriod })
      .then((data: { productIntelligence?: StoreProductIntelligence }) => {
        if (cancelled) return;
        if (data.productIntelligence) setProductIntel(data.productIntelligence);
        else setProductIntelError(true);
        setProductIntelKey(key);
      })
      .catch(() => { if (!cancelled) { setProductIntelError(true); setProductIntelKey(key); } })
      .finally(() => { if (!cancelled) setProductIntelLoading(false); });
    return () => { cancelled = true; };
  }, [tab, storeCard.store.id, orgSlug, intelPeriod, productIntelKey]);

  // ── Inventory-by-line state (AGENTIK-STORES-INVENTORY-BY-LINE-01) ──────
  type InvLine = "CASTILLITOS" | "LATIN_KIDS" | "ACCESSORIES" | "UNCLASSIFIED" | "OUT_OF_STOCK" | "ESPECIALES";


  const [invLine, setInvLine] = useState<InvLine>("CASTILLITOS");
  const [invLineCounts, setInvLineCounts] = useState<{ line: InvLine; count: number }[]>([]);
  const [invLineCountsLoading, setInvLineCountsLoading] = useState(false);
  const [invData, setInvData] = useState<InvByLineResponse | null>(null);
  const [invLoading, setInvLoading] = useState(false);
  const [invPage, setInvPage] = useState(1);
  const [invSearch, setInvSearch] = useState("");
  const [invSearchDebounced, setInvSearchDebounced] = useState("");
  const [invGroup, setInvGroup] = useState<string | undefined>();
  const [invSubgroup, setInvSubgroup] = useState<string | undefined>();
  const [invSizeClass, setInvSizeClass] = useState<string | undefined>();

  const [invExpandedRefs, setInvExpandedRefs] = useState<Set<string>>(new Set());
  const [invVariants, setInvVariants] = useState<Record<string, InvVariant[]>>({});
  const [invVariantsLoading, setInvVariantsLoading] = useState<Set<string>>(new Set());
  const [invError, setInvError] = useState<string | null>(null);
  const [invRetry, setInvRetry] = useState(0);
  const [invSortBy, setInvSortBy] = useState<InvSortBy>("QUANTITY_ASC");


  // ── F3A: Necesidades y Cobertura proyectan el MISMO snapshot (T8: cache
  // compartida — cero fetch de estado adicional; T2: cero acciones legacy).
  const needsPres = useMemo(
    () => buildNeedsTabPresentation(snapshot, storeCard.store.id),
    [snapshot, storeCard.store.id],
  );
  const opNeeds = useMemo(
    () => buildOperativeNeedsPresentation(snapshot, storeCard.store.id),
    [snapshot, storeCard.store.id],
  );
  const covPres = useMemo(
    () => buildCoverageTabPresentation(snapshot, storeCard.store.id),
    [snapshot, storeCard.store.id],
  );
  // ── Accessory composition (AGENTIK-STORES-ACCESSORIES-COMPOSITION-UX-01) ──
  const accComposition = useMemo(
    () => buildAccessoryCompositionPresentation(snapshot, storeCard.store.id),
    [snapshot, storeCard.store.id],
  );
  // ── Special products (AGENTIK-STORES-SPECIAL-PRODUCTS-INVENTORY-01) ──────
  const specialProductsPres = useMemo(
    () => buildSpecialProductsPresentation(snapshot, storeCard.store.id),
    [snapshot, storeCard.store.id],
  );
  // Filtro VISUAL de línea (jamás invalida ni refetch — T9).
  // COVERAGE-UX-01: chips dinámicos desde las secciones proyectadas ("ALL" |
  // line id | "ESPECIALES"); grupos textiles colapsados por defecto (corrección 13).
  const [covLine, setCovLine] = useState<string>("ALL");
  const [covOpenGroups, setCovOpenGroups] = useState<Set<string>>(new Set());

  // ── Discount state (AGENTIK-STORES-DISCOUNTS-TAB-01) ───────────────────
  const [discData, setDiscData] = useState<StoreDiscountResponse | null>(null);
  const [discLoading, setDiscLoading] = useState(false);
  const [discLoaded, setDiscLoaded] = useState(false);
  const [discTierFilter, setDiscTierFilter] = useState<DiscountTier | "ALL">("ALL");
  const [discSearch, setDiscSearch] = useState("");
  const [discSearchDebounced, setDiscSearchDebounced] = useState("");
  const [discSagExpanded, setDiscSagExpanded] = useState<Set<string>>(new Set());
  // AGENTIK-STORES-DISCOUNTS-ACTIONABILITY-UX-02: collapsible section state
  // Default: PENDING expanded, ALIGNED + REVIEW collapsed
  const [discSectionOpen, setDiscSectionOpen] = useState<Record<string, boolean>>({
    PENDING_ACTION: true,
    ALIGNED: false,
    REVIEW_OR_INFORMATIONAL: false,
  });

  // Debounce discount search
  useEffect(() => {
    const t = setTimeout(() => setDiscSearchDebounced(discSearch), 300);
    return () => clearTimeout(t);
  }, [discSearch]);

  // Lazy load discounts when tab is active
  useEffect(() => {
    if (tab !== "descuentos" || discLoaded) return;
    let cancelled = false;
    setDiscLoading(true);
    tiendaApi(orgSlug, { action: "store_discounts", storeId: storeCard.store.id })
      .then((data: { discounts?: StoreDiscountResponse }) => {
        if (cancelled) return;
        if (data.discounts) setDiscData(data.discounts);
        setDiscLoaded(true);
      })
      .catch(() => { if (!cancelled) setDiscLoaded(true); })
      .finally(() => { if (!cancelled) setDiscLoading(false); });
    return () => { cancelled = true; };
  }, [tab, storeCard.store.id, orgSlug, discLoaded]);

  // (Efecto de coverage eliminado — F3A: el tab Cobertura proyecta el snapshot)

  // Reset state on store change
  useEffect(() => {
    setTab("inventario");
    setActionFilter("ALL");
    setDomainFilter("ALL");
    setExpandedRows(new Set());
    setCertifiedIntel(null);
    setCertifiedIntelLoaded(false);
    setCertifiedIntelError(false);
    setProductIntel(null);
    setProductIntelKey(null);
    setProductIntelError(false);
    setIntelPeriod("LAST_90_DAYS");
    setCertifiedIntelLoading(false);
    setInvLine("CASTILLITOS");
    setInvLineCounts([]);
    setInvData(null);
    setInvError(null);
    setInvPage(1);
    setInvSearch("");
    setInvSearchDebounced("");
    setInvGroup(undefined);
    setInvSubgroup(undefined);
    setInvSizeClass(undefined);
    setInvExpandedRefs(new Set());
    setInvVariants({});
    setInvSortBy("QUANTITY_ASC");
    // Reset visual filters (F3A — Necesidades/Cobertura proyectan el snapshot)
    setCovLine("ALL");
    setCovOpenGroups(new Set());
    // Reset discount state
    setDiscData(null);
    setDiscLoaded(false);
    setDiscTierFilter("ALL");
    setDiscSearch("");
    setDiscSearchDebounced("");
  }, [storeCard.store.id]);

  // ── Load line counts when inventario tab is active ─────────────────────
  useEffect(() => {
    if (tab !== "inventario") return;
    let cancelled = false;
    setInvLineCountsLoading(true);
    setInvError(null);
    tiendaApi(orgSlug, { action: "store_inventory_by_line", sub: "counts", storeId: storeCard.store.id })
      .then((data: { counts?: { line: InvLine; count: number }[]; error?: string; code?: string }) => {
        if (cancelled) return;
        if (data.error) {
          console.error("[INV-BY-LINE] counts API error:", data.error, data.code);
          setInvError(data.code === "STORE_INACTIVE" ? "Tienda desactivada" : `Error: ${data.error}`);
          return;
        }
        if (data.counts) {
          setInvLineCounts(data.counts);
          // Consistency check: if summary has references but all counts are 0, flag it
          // (chequeo de consistencia contra el resumen viejo eliminado — F3A)
        }
      })
      .catch((err: unknown) => {
        console.error("[INV-BY-LINE] counts fetch error:", err);
        if (!cancelled) setInvError("Error de conexion al cargar conteos");
      })
      .finally(() => { if (!cancelled) setInvLineCountsLoading(false); });
    return () => { cancelled = true; };
  }, [tab, storeCard.store.id, orgSlug, invRetry]);

  // ── Load inventory data when line/filters/page change ──────────────────
  useEffect(() => {
    if (tab !== "inventario") return;
    let cancelled = false;
    setInvLoading(true);
    setInvExpandedRefs(new Set());
    tiendaApi(orgSlug, {
      action: "store_inventory_by_line", sub: "load",
      storeId: storeCard.store.id, line: invLine,
      group: invGroup, subgroup: invSubgroup, sizeClass: invSizeClass,


      sortBy: invSortBy,
      search: invSearchDebounced || undefined,
      page: invPage, pageSize: 25,
    })
      .then((data: InvByLineResponse & { error?: string }) => {
        if (cancelled) return;
        if (data.error) {
          console.error("[INV-BY-LINE] load API error:", data.error);
          setInvError(`Error: ${data.error}`);
          return;
        }
        setInvData(data);
      })
      .catch((err: unknown) => {
        console.error("[INV-BY-LINE] load fetch error:", err);
        if (!cancelled) setInvError("Error de conexion al cargar inventario");
      })
      .finally(() => { if (!cancelled) setInvLoading(false); });
    return () => { cancelled = true; };
  }, [tab, storeCard.store.id, orgSlug, invLine, invGroup, invSubgroup, invSizeClass, invSortBy, invSearchDebounced, invPage, invRetry]);

  // ── Debounce search ─────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => { setInvSearchDebounced(invSearch); setInvPage(1); }, 300);
    return () => clearTimeout(t);
  }, [invSearch]);

  // ── Load variants on expand ─────────────────────────────────────────────
  function toggleInvRef(ref: string) {
    setInvExpandedRefs(prev => {
      const next = new Set(prev);
      if (next.has(ref)) { next.delete(ref); }
      else {
        next.add(ref);
        if (!invVariants[ref]) loadVariants(ref);
      }
      return next;
    });
  }

  function loadVariants(ref: string) {
    setInvVariantsLoading(prev => new Set(prev).add(ref));
    tiendaApi(orgSlug, {
      action: "store_inventory_by_line", sub: "variants",
      storeId: storeCard.store.id, referenceCode: ref,
    })
      .then((data: { variants?: InvVariant[] }) => {
        setInvVariants(prev => ({ ...prev, [ref]: data.variants || [] }));
      })
      .catch(() => {})
      .finally(() => {
        setInvVariantsLoading(prev => { const n = new Set(prev); n.delete(ref); return n; });
      });
  }

  // ── Load warehouse-first needs (AGENTIK-STORES-NEEDS-WAREHOUSE-FIRST-RESOLUTION-01) ─
  // (Efecto WHF eliminado — F3A: el tab Necesidades proyecta el snapshot)

// (Debounce de búsqueda WHF eliminado — F3A)

  // (Legacy detail/domainCounts/filteredItems/actionCounts removed — replaced by intelligence service)

  function toggleRow(idx: number) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  // F3A: severidad = mapeo 1:1 del tono del PA (la UI no deriva estados)
  const severity = storeCard.healthTone === "critical" ? "critical" as const
    : storeCard.healthTone === "warning" ? "warning" as const
    : "info" as const;

  const tabItems: { key: DistDrawerTab; label: string }[] = [
    { key: "inventario",   label: "Inventario" },
    { key: "necesidades",  label: "Necesidades" },
    { key: "cobertura",    label: "Cobertura" },
    { key: "descuentos",   label: "Descuentos" },
    { key: "derrotero",    label: "Derrotero" },
    { key: "inteligencia", label: "Inteligencia" },
  ];

  return (
    <OperationalSideDrawer
      open
      onClose={onClose}
      title={storeCard.store.name}
      subtitle={storeCard.subtitle}
      severity={severity}
      statusLabel={storeCard.healthLabel}
      size="wide"
    >
      {/* Tab strip */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C.line}`, marginBottom: S[3], marginTop: -S[3] }}>
        {tabItems.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: `${S[2]}px ${S[3]}px`,
            fontFamily: T.mono, fontSize: T.sz.sm,
            fontWeight: tab === t.key ? T.wt.semibold : T.wt.normal,
            color: tab === t.key ? C.blueDark : C.inkLight,
            background: tab === t.key ? C.blueLight : "transparent",
            border: "none", borderBottom: tab === t.key ? `2px solid ${C.blueDark}` : "2px solid transparent",
            cursor: "pointer",
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB: Inventario — organized by commercial line (AGENTIK-STORES-INVENTORY-BY-LINE-01) */}
      {tab === "inventario" && (
        <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
          {/* Subtitle */}
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>
            Disponibilidad actual de la tienda
          </div>

          {/* LINE NAVIGATION — commercial line filter */}
          <div style={{ display: "flex", flexDirection: "column", gap: S[1] }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
              Línea comercial
            </div>
            <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
              {([
                { key: "CASTILLITOS" as InvLine, label: "Castillitos" },
                { key: "LATIN_KIDS" as InvLine, label: "Latin Kids" },
                { key: "ACCESSORIES" as InvLine, label: "Accesorios" },
                { key: "UNCLASSIFIED" as InvLine, label: "Sin clasificar" },
                { key: "OUT_OF_STOCK" as InvLine, label: "Agotados" },
                { key: "ESPECIALES" as InvLine, label: "Especiales" },
              ]).map(ln => {
                const isActive = invLine === ln.key;
                return (
                  <button
                    key={ln.key}
                    onClick={() => { setInvLine(ln.key); setInvPage(1); setInvGroup(undefined); setInvSubgroup(undefined); setInvSizeClass(undefined); setInvSortBy("QUANTITY_ASC"); setInvExpandedRefs(new Set()); }}
                    style={{
                      fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                      padding: "6px 14px", borderRadius: R.sm, cursor: "pointer",
                      background: isActive ? C.blueDark : C.white,
                      color: isActive ? C.white : C.ink,
                      border: `1.5px solid ${isActive ? C.blueDark : C.line}`,
                    }}
                  >
                    {ln.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ERROR STATE — differentiate empty vs error (OCTAVO). Hidden for ESPECIALES (snapshot-based) */}
          {invLine !== "ESPECIALES" && invError && (
            <div style={{
              fontFamily: T.mono, fontSize: T.sz.sm, color: C.red,
              padding: `${S[2]}px ${S[3]}px`, background: C.redLight,
              borderRadius: R.sm, border: `1px solid ${C.red}`,
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: S[2],
            }}>
              <span>{invError}</span>
              <button
                onClick={() => { setInvError(null); setInvLineCounts([]); setInvData(null); setInvRetry(n => n + 1); }}
                style={{
                  fontFamily: T.mono, fontSize: T.sz["2xs"], padding: "2px 8px",
                  borderRadius: R.sm, border: `1px solid ${C.red}`, background: "transparent",
                  color: C.red, cursor: "pointer", whiteSpace: "nowrap",
                }}
              >
                Reintentar
              </button>
            </div>
          )}

          {/* LINE SUMMARY — factual KPIs + sort (INVENTORY-FACTUAL-VIEW-01). Hidden for ESPECIALES */}
          {invLine !== "ESPECIALES" && invData?.summary && (
            <InvLineSummaryStrip
              summary={invData.summary}
              sortBy={invSortBy}
              onSortChange={(s) => { setInvSortBy(s); setInvPage(1); }}
            />
          )}

          {/* ACCESSORY COMPOSITION — only visible when line = ACCESSORIES */}
          {invLine === "ACCESSORIES" && accComposition && accComposition.sizes.length > 0 && (
            <AccessoryCompositionSection composition={accComposition} />
          )}

          {/* ESPECIALES — transversal view from snapshot special rules (SPECIAL-PRODUCTS-INVENTORY-01) */}
          {invLine === "ESPECIALES" && (
            <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
              {/* KPI strip */}
              <div style={{ display: "flex", gap: S[3], flexWrap: "wrap" }}>
                <div style={{
                  flex: 1, minWidth: 120, padding: S[2], borderRadius: R.sm,
                  border: `1px solid ${C.line}`, background: C.white,
                }}>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const }}>Referencias</div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.ink }}>{specialProductsPres.totalSpecialReferences}</div>
                </div>
                <div style={{
                  flex: 1, minWidth: 120, padding: S[2], borderRadius: R.sm,
                  border: `1px solid ${C.line}`, background: C.white,
                }}>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const }}>Unidades</div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.ink }}>{specialProductsPres.totalSpecialUnits}</div>
                </div>
                <div style={{
                  flex: 1, minWidth: 120, padding: S[2], borderRadius: R.sm,
                  border: `1px solid ${C.line}`, background: C.white,
                }}>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const }}>Variantes</div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.ink }}>{specialProductsPres.rules.length}</div>
                </div>
              </div>

              {/* Rules — always show all 3 */}
              {specialProductsPres.rules.map(rule => (
                <div key={rule.pattern} style={{
                  border: `1px solid ${C.line}`, borderRadius: R.sm, background: C.white, overflow: "hidden",
                }}>
                  {/* Rule header */}
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: `${S[2]}px ${S[3]}px`,
                    borderBottom: rule.matchedReferences.length > 0 ? `1px solid ${C.lineSubtle}` : "none",
                    background: C.surface,
                  }}>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
                      {rule.label}
                    </span>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                      {rule.totalUnits} uds · {rule.matchedReferences.length} refs
                    </span>
                  </div>

                  {/* Matched references table */}
                  {rule.matchedReferences.length > 0 ? (
                    <div className="ag-op-table" style={{ margin: 0 }}>
                      {rule.matchedReferences.map(ref => (
                        <div key={ref.referenceCode} className="ag-op-row" style={{
                          display: "flex", alignItems: "center", gap: S[2],
                          padding: `${S[1]}px ${S[3]}px`,
                        }}>
                          <CommercialReferenceThumbnail imageUrl={ref.thumbnailUrl} referenceCode={ref.referenceCode} description={ref.productName} size={36} />
                          <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink }}>
                              {ref.referenceCode}
                            </span>
                            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {ref.productName}
                            </span>
                          </div>
                          <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink, flexShrink: 0 }}>
                            {ref.units} uds
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{
                      padding: `${S[2]}px ${S[3]}px`,
                      fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint,
                    }}>
                      Sin referencias con stock — revisar abastecimiento
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Normal inventory flow — hidden when ESPECIALES (transversal view uses snapshot, not API) */}
          {invLine !== "ESPECIALES" && (<>
          {/* SEARCH */}
          <div style={{ display: "flex", gap: S[2], alignItems: "center" }}>
            <input
              type="text"
              placeholder="Buscar referencia o descripcion..."
              value={invSearch}
              onChange={e => setInvSearch(e.target.value)}
              style={{
                flex: 1, fontFamily: T.mono, fontSize: T.sz.xs,
                padding: `${S[1]}px ${S[2]}px`, borderRadius: R.sm,
                border: `1px solid ${C.line}`, background: C.white, color: C.ink,
                outline: "none",
              }}
            />
            {invSearch && (
              <button onClick={() => { setInvSearch(""); setInvSearchDebounced(""); }} style={{
                fontFamily: T.mono, fontSize: T.sz["2xs"], padding: "2px 6px",
                borderRadius: R.sm, border: `1px solid ${C.line}`,
                background: C.surface, color: C.inkMid, cursor: "pointer",
              }}>Limpiar</button>
            )}
          </div>

          {/* SECONDARY FILTERS */}
          {invData?.availableFilters && (
            <div style={{ display: "flex", gap: S[1], flexWrap: "wrap" }}>
              {invData.availableFilters.groups.length > 1 && (
                <select
                  value={invGroup || ""}
                  onChange={e => { setInvGroup(e.target.value || undefined); setInvPage(1); }}
                  style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], padding: "2px 6px", borderRadius: R.sm, border: `1px solid ${C.line}`, background: C.white, color: C.ink }}
                >
                  <option value="">Todos los grupos</option>
                  {invData.availableFilters.groups.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              )}
              {invData.availableFilters.subgroups.length > 1 && (
                <select
                  value={invSubgroup || ""}
                  onChange={e => { setInvSubgroup(e.target.value || undefined); setInvPage(1); }}
                  style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], padding: "2px 6px", borderRadius: R.sm, border: `1px solid ${C.line}`, background: C.white, color: C.ink }}
                >
                  <option value="">Todos los subgrupos</option>
                  {invData.availableFilters.subgroups.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
              {invData.availableFilters.sizeClasses.length > 1 && (
                <select
                  value={invSizeClass || ""}
                  onChange={e => { setInvSizeClass(e.target.value || undefined); setInvPage(1); }}
                  style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], padding: "2px 6px", borderRadius: R.sm, border: `1px solid ${C.line}`, background: C.white, color: C.ink }}
                >
                  <option value="">Todos los tamanos</option>
                  {invData.availableFilters.sizeClasses.map(s => <option key={s} value={s}>{INV_SIZE_LABEL[s] || s}</option>)}
                </select>
              )}
              {(invGroup || invSubgroup || invSizeClass) && (
                <button onClick={() => { setInvGroup(undefined); setInvSubgroup(undefined); setInvSizeClass(undefined); setInvPage(1); }} style={{
                  fontFamily: T.mono, fontSize: T.sz["2xs"], padding: "2px 6px",
                  borderRadius: R.sm, border: `1px solid ${C.line}`,
                  background: C.surface, color: C.inkMid, cursor: "pointer",
                }}>Limpiar filtros</button>
              )}
            </div>
          )}

          {/* LOADING */}
          {invLoading && (
            <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
              {[1, 2, 3, 4].map(n => (
                <div key={n} style={{ height: 52, background: C.surface, borderRadius: R.sm, animation: "pulse 1.5s infinite" }} />
              ))}
            </div>
          )}

          {/* ITEMS TABLE */}
          {!invLoading && invData && (
            <>
              {invData.items.length === 0 ? (
                <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint, padding: `${S[4]}px 0`, textAlign: "center" }}>
                  {invSearchDebounced ? "Sin resultados para esta busqueda" : "Sin referencias en esta linea"}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {invData.items.map(item => {
                    const isExpanded = invExpandedRefs.has(item.referenceCode);
                    return (
                      <div key={item.referenceCode} style={{ borderBottom: `1px solid ${C.line}`, background: isExpanded ? C.surfaceAlt : "transparent" }}>
                        <div
                          style={{ display: "flex", alignItems: "center", gap: S[2], padding: `${S[2]}px`, cursor: item.variantCount > 1 ? "pointer" : "default" }}
                          onClick={() => { if (item.variantCount > 1) toggleInvRef(item.referenceCode); }}
                        >
                          <CommercialReferenceThumbnail imageUrl={item.imageUrl} referenceCode={item.referenceCode} description={item.productName} size={32} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink }}>{item.referenceCode}</span>
                              {item.group !== "SIN_GRUPO_SAG" && (
                                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                                  {item.group}{item.subgroup !== "SIN_SUBGRUPO_SAG" ? ` / ${item.subgroup}` : ""}
                                </span>
                              )}
                              {item.sizeClass && (
                                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], padding: "1px 5px", borderRadius: R.pill, background: C.amberLight, color: C.amber }}>
                                  {INV_SIZE_LABEL[item.sizeClass] || item.sizeClass}
                                </span>
                              )}
                            </div>
                            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {item.productName}
                            </div>
                          </div>
                          <div style={{ textAlign: "center", minWidth: 36, flexShrink: 0 }}>
                            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Tienda</div>
                            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.ink }}>{item.currentStoreQty}</div>
                          </div>
                          {item.variantCount > 1 && (
                            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, flexShrink: 0 }}>
                              {item.variantCount} var {isExpanded ? "▼" : "▶"}
                            </span>
                          )}
                        </div>

                        {/* Unclassified reason */}
                        {item.unclassifiedReason && (
                          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amber, padding: `0 ${S[2]}px ${S[1]}px ${S[2] + 32 + S[2]}px` }}>
                            {INV_UNCLASSIFIED_LABEL[item.unclassifiedReason] || item.unclassifiedReason}
                          </div>
                        )}

                        {/* Expanded variants */}
                        {isExpanded && (
                          <div style={{ padding: `0 ${S[2]}px ${S[2]}px ${S[2] + 32 + S[2]}px` }}>
                            {invVariantsLoading.has(item.referenceCode) ? (
                              <div style={{ height: 32, background: C.surface, borderRadius: R.sm, animation: "pulse 1.5s infinite" }} />
                            ) : (invVariants[item.referenceCode] || []).length === 0 ? (
                              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Sin variantes</div>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                                <div style={{ display: "flex", gap: S[2], padding: `2px 0`, fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, fontWeight: T.wt.semibold }}>
                                  <span style={{ width: 80 }}>Talla</span>
                                  <span style={{ width: 80 }}>Color</span>
                                  <span style={{ width: 50, textAlign: "right" }}>Tienda</span>
                                </div>
                                {(invVariants[item.referenceCode] || []).map((v, vi) => (
                                  <div key={vi} style={{ display: "flex", gap: S[2], padding: `2px 0`, fontFamily: T.mono, fontSize: T.sz["2xs"], borderTop: `1px solid ${C.lineSubtle}` }}>
                                    <span style={{ width: 80, color: C.ink }}>{v.size || "\u2014"}</span>
                                    <span style={{ width: 80, color: C.ink }}>{v.color || "\u2014"}</span>
                                    <span style={{ width: 50, textAlign: "right", fontWeight: T.wt.semibold, color: C.ink }}>{v.storeQty}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* PAGINATION */}
              {invData.pagination.totalPages > 1 && (
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: S[2], padding: `${S[2]}px 0` }}>
                  <button
                    disabled={invData.pagination.page <= 1}
                    onClick={() => setInvPage(p => Math.max(1, p - 1))}
                    style={{
                      fontFamily: T.mono, fontSize: T.sz["2xs"], padding: "3px 8px",
                      borderRadius: R.sm, border: `1px solid ${C.line}`,
                      background: C.surface, color: invData.pagination.page <= 1 ? C.inkFaint : C.ink,
                      cursor: invData.pagination.page <= 1 ? "default" : "pointer",
                    }}
                  >Anterior</button>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
                    {invData.pagination.page} / {invData.pagination.totalPages} ({invData.pagination.total} refs)
                  </span>
                  <button
                    disabled={invData.pagination.page >= invData.pagination.totalPages}
                    onClick={() => setInvPage(p => Math.min(invData!.pagination.totalPages, p + 1))}
                    style={{
                      fontFamily: T.mono, fontSize: T.sz["2xs"], padding: "3px 8px",
                      borderRadius: R.sm, border: `1px solid ${C.line}`,
                      background: C.surface, color: invData.pagination.page >= invData.pagination.totalPages ? C.inkFaint : C.ink,
                      cursor: invData.pagination.page >= invData.pagination.totalPages ? "default" : "pointer",
                    }}
                  >Siguiente</button>
                </div>
              )}

              {/* DATA FRESHNESS */}
              {invData.dataFreshness && (
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textAlign: "right" }}>
                  Datos: {formatTimeAgo(invData.dataFreshness)}
                </div>
              )}
            </>
          )}
          </>)}
        </div>
      )}

      {/* TAB: Necesidades — UX operativa (AGENTIK-STORES-NEEDS-UX-02.1) */}
      {tab === "necesidades" && (
        <NeedsTabContent opNeeds={opNeeds} needsPres={needsPres} orgSlug={orgSlug} />
      )}

      {tab === "cobertura" && (
        <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
          {/* COVERAGE-UX-01 — el tab proyecta coverage.ruleEvaluations (fuente
              canónica). Cards compactas con el lenguaje visual del drawer
              (mismo patrón de KPI cards de Inventario): campos verbatim del
              snapshot + cardinalidades de listas proyectadas (corrección 12).
              B1 ÚNICO: mismo campo que card y subtítulo (T4). */}
          <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
            {[
              { label: "Cobertura (B1)", value: covPres.structural.coverageText, color: C.blueDark },
              { label: "Cumplen", value: covPres.structural.healthyCountText, color: C.green },
              { label: "Requieren atención", value: covPres.structural.attentionCountText, color: C.red },
              { label: "Reglas especiales", value: covPres.specials.summaryText, color: C.amber },
            ].map(k => (
              <div key={k.label} style={{
                ...panel, padding: `${S[2]}px ${S[3]}px`, display: "flex", flexDirection: "column", gap: 2,
                flex: 1, minWidth: 80,
              }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const }}>
                  {k.label}
                </span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: k.color }}>
                  {k.value}
                </span>
              </div>
            ))}
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
            {covPres.structural.coverageDetailText}
          </div>

          {/* ZONA DE FILTROS — misma identidad visual que Inventario (label
              superior + estado activo azul). Opciones dinámicas: líneas
              presentes en la proyección + Especiales si existen (corrección 6
              — jamás un chip vacío ni una línea fija). Filtro visual — jamás
              refetch ni invalidación (T9). */}
          <div style={{ display: "flex", flexDirection: "column", gap: S[1] }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
              Línea comercial
            </div>
            <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
              {[
                { key: "ALL", label: "Todas" },
                ...covPres.structural.sections.map(sec => ({ key: sec.line, label: sec.lineLabel })),
                ...(covPres.specials.rows.length > 0 ? [{ key: "ESPECIALES", label: "Especiales" }] : []),
              ].map(chip => {
                const isActive = covLine === chip.key;
                return (
                  <button key={chip.key} onClick={() => setCovLine(chip.key)} style={{
                    fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                    padding: "6px 14px", borderRadius: R.sm, cursor: "pointer",
                    background: isActive ? C.blueDark : C.white,
                    color: isActive ? C.white : C.ink,
                    border: `1.5px solid ${isActive ? C.blueDark : C.line}`,
                  }}>
                    {chip.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* CONCEPTO 1 — cobertura estructural: jerarquía dinámica
              línea → grupo (si existe) → regla (corrección 5). Grupos
              colapsados por defecto (corrección 13). */}
          {covPres.structural.sections
            .filter(sec => covLine === "ALL" || covLine === sec.line)
            .map(sec => (
              <div key={sec.line} style={{ ...panel }}>
                <div style={{ ...panelHeader, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
                    {sec.lineLabel}
                  </span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                    {sec.ruleCountText}
                  </span>
                </div>
                <div style={{ padding: S[2] }}>
                  {sec.groups.map(g =>
                    g.groupLabel === null ? (
                      // Lista plana (LK, ACC, líneas dinámicas sin grupo)
                      <div key={g.key}>
                        {g.rows.map(r => <CoverageRuleRowLine key={r.ruleId} row={r} />)}
                      </div>
                    ) : (
                      // Grupo colapsable (CS): "▸ Grupo — N de M en cobertura"
                      <div key={g.key} style={{ borderBottom: `1px solid ${C.lineSubtle}` }}>
                        <button
                          onClick={() => setCovOpenGroups(prev => {
                            const next = new Set(prev);
                            if (next.has(g.key)) next.delete(g.key); else next.add(g.key);
                            return next;
                          })}
                          style={{
                            width: "100%", display: "flex", alignItems: "center",
                            justifyContent: "space-between", gap: S[2],
                            padding: `${S[2]}px ${S[2]}px`, background: "none",
                            border: "none", cursor: "pointer", textAlign: "left",
                          }}
                        >
                          <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
                            {covOpenGroups.has(g.key) ? "▾" : "▸"} {g.groupDisplay}
                          </span>
                          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                            {g.headerText}
                          </span>
                        </button>
                        {covOpenGroups.has(g.key) && g.rows.map(r => (
                          <CoverageRuleRowLine key={r.ruleId} row={r} />
                        ))}
                      </div>
                    )
                  )}
                </div>
              </div>
            ))}

          {/* CONCEPTO 2 — reglas especiales: sección hermana con cumplimiento
              propio "N de M cumplidas"; jamás contaminan el porcentaje
              estructural (corrección 11). Lista compacta (corrección 13). */}
          {covPres.specials.rows.length > 0 && (covLine === "ALL" || covLine === "ESPECIALES") && (
            <div style={{ ...panel }}>
              <div style={{ ...panelHeader, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
                  Reglas especiales
                </span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                  {covPres.specials.summaryText}
                </span>
              </div>
              <div style={{ padding: S[2] }}>
                {covPres.specials.rows.map(sr => (
                  <div key={sr.ruleId} style={{
                    display: "flex", alignItems: "center", gap: S[3],
                    padding: `${S[1]}px ${S[2]}px`, borderBottom: `1px solid ${C.lineSubtle}`,
                    fontFamily: T.mono, fontSize: T.sz.sm,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ color: C.ink }}>{sr.label}</span>
                      {sr.detailText && (
                        <div style={{ fontSize: T.sz["2xs"], color: C.inkFaint }}>{sr.detailText}</div>
                      )}
                    </div>
                    <span style={{ color: C.inkFaint, fontSize: T.sz["2xs"] }}>
                      Actual {sr.actualUnitsText} · Objetivo {sr.idealUnitsText}
                    </span>
                    <span style={{
                      fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                      padding: "2px 8px", borderRadius: R.pill,
                      background: TONE_BADGE[sr.tone].bg, color: TONE_BADGE[sr.tone].text,
                    }}>
                      {sr.statusLabel}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "descuentos" && (
        <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
          {discLoading && !discData && (
            <div style={{ height: 120, background: C.surface, borderRadius: R.sm, animation: "pulse 1.5s infinite" }} />
          )}
          {discData && (() => {
            const dd = discData; // narrowed non-null for inner functions
            const kpis = dd.kpis;
            const currentStoreId = storeCard.store.id;
            const sagAvailable = dd.sagComparisonStatus === "AVAILABLE";

            // Filter by tier + search
            let filtered = dd.recommendations;
            if (discTierFilter !== "ALL") {
              filtered = filtered.filter(r => r.discountTier === discTierFilter);
            }
            if (discSearchDebounced) {
              const q = discSearchDebounced.toLowerCase();
              filtered = filtered.filter(r =>
                r.referenceCode.toLowerCase().includes(q) ||
                r.description.toLowerCase().includes(q)
              );
            }

            // ── AGENTIK-STORES-DISCOUNTS-ACTIONABILITY-UX-02 ──
            // Classify each reference by CURRENT STORE action (§7 law)
            type DiscSegment = "PENDING_ACTION" | "ALIGNED" | "REVIEW_OR_INFORMATIONAL";
            function classifyByCurrentStore(rec: DiscountRecommendation): DiscSegment {
              if (!sagAvailable || !rec.sagComparison || rec.sagComparison.length === 0) {
                // SAG unavailable → review/informational
                return "REVIEW_OR_INFORMATIONAL";
              }
              const currentStoreComparison = rec.sagComparison.find(sc => sc.storeId === currentStoreId);
              if (!currentStoreComparison) {
                // Current store not in comparison list → review
                return "REVIEW_OR_INFORMATIONAL";
              }
              const action = currentStoreComparison.action;
              if (action === "APPLY" || action === "INCREASE") return "PENDING_ACTION";
              if (action === "ALIGNED") return "ALIGNED";
              return "REVIEW_OR_INFORMATIONAL"; // KEEP_HIGHER_SAG, AMBIGUOUS_SAG, NO_AGENTIK_ACTION, EXCLUDED
            }

            const pendingRecs = filtered.filter(r => classifyByCurrentStore(r) === "PENDING_ACTION");
            const alignedRecs = filtered.filter(r => classifyByCurrentStore(r) === "ALIGNED");
            const reviewRecs = filtered.filter(r => classifyByCurrentStore(r) === "REVIEW_OR_INFORMATIONAL");

            const TIER_FILTERS: { key: DiscountTier | "ALL"; label: string; count: number }[] = [
              { key: "ALL",              label: `Todas (${kpis.totalEvaluated})`, count: kpis.totalEvaluated },
              { key: "SEVENTY_PERCENT",  label: `70% (${kpis.seventyPercent})`,  count: kpis.seventyPercent },
              { key: "FIFTY_PERCENT",    label: `50% (${kpis.fiftyPercent})`,    count: kpis.fiftyPercent },
              { key: "THIRTY_PERCENT",   label: `30% (${kpis.thirtyPercent})`,   count: kpis.thirtyPercent },
              { key: "TEN_PERCENT",      label: `10% (${kpis.tenPercent})`,      count: kpis.tenPercent },
              { key: "NONE",             label: `0% (${kpis.none})`,             count: kpis.none },
              { key: "SIN_FECHA",        label: `Sin fecha (${kpis.sinFecha})`,  count: kpis.sinFecha },
            ];

            // Helper: get current store comparison for a recommendation
            function getCurrentStoreComparison(rec: DiscountRecommendation) {
              if (!sagAvailable || !rec.sagComparison) return null;
              return rec.sagComparison.find(sc => sc.storeId === currentStoreId) ?? null;
            }

            // Helper: count OTHER stores requiring action for this reference
            function getNetworkActionCount(rec: DiscountRecommendation) {
              if (!sagAvailable || !rec.sagComparison) return 0;
              return rec.sagComparison.filter(
                sc => sc.storeId !== currentStoreId && (sc.action === "APPLY" || sc.action === "INCREASE"),
              ).length;
            }

            // ── Render a single recommendation row ──
            function renderDiscountRow(rec: DiscountRecommendation) {
              const tierColor = DISCOUNT_TIER_COLOR[rec.discountTier];
              const hasSag = sagAvailable && rec.sagComparison && rec.sagComparison.length > 0;
              const sagOpen = discSagExpanded.has(rec.referenceCode);
              const currentSc = getCurrentStoreComparison(rec);
              const networkPending = getNetworkActionCount(rec);

              // §2: derive explicit SAG actual / Objetivo / Acción
              const sagActualText = currentSc
                ? (currentSc.currentDiscountPercent != null ? `${currentSc.currentDiscountPercent}%` : "—")
                : (sagAvailable ? "—" : "—");
              const sagObjetivoText = currentSc ? `${currentSc.targetDiscountPercent}%` : DISCOUNT_TIER_LABEL[rec.discountTier];
              const sagActionText = currentSc
                ? SAG_ACTION_DISPLAY[currentSc.action].label(currentSc.targetDiscountPercent)
                : (!sagAvailable ? "SAG no disponible" : "—");
              const sagActionColor = currentSc
                ? SAG_ACTION_DISPLAY[currentSc.action].color
                : C.inkFaint;

              return (
                <div key={rec.referenceCode}>
                  <div className="ag-op-row" style={{
                    display: "grid",
                    gridTemplateColumns: isNarrow ? "32px minmax(0, 1fr) 84px" : "32px 1fr 60px 60px 60px 60px 60px 130px",
                    gap: S[2], padding: `${S[2]}px ${S[3]}px`,
                    borderBottom: `1px solid ${C.lineSubtle}`,
                    alignItems: "center",
                    cursor: hasSag ? "pointer" : undefined,
                  }}
                  onClick={hasSag ? () => setDiscSagExpanded(prev => {
                    const next = new Set(prev);
                    if (next.has(rec.referenceCode)) next.delete(rec.referenceCode);
                    else next.add(rec.referenceCode);
                    return next;
                  }) : undefined}
                  >
                    <CommercialReferenceThumbnail imageUrl={rec.imageUrl} referenceCode={rec.referenceCode} description={rec.description} size={28} />

                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {rec.referenceCode}
                      </div>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {rec.description}
                      </div>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, marginTop: 1 }}>
                        {rec.reason}
                        {networkPending > 0 && (
                          <span style={{ marginLeft: S[2], color: DISCOUNT_TIER_COLOR.FIFTY_PERCENT }}>
                            · {networkPending} otra{networkPending > 1 ? "s" : ""} tienda{networkPending > 1 ? "s" : ""} requiere{networkPending > 1 ? "n" : ""} ajuste
                          </span>
                        )}
                      </div>
                      {isNarrow && (
                        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, marginTop: 1 }}>
                          {rec.daysInStore !== null ? `${rec.daysInStore}d` : "—"} · {rec.storeQty} uds · SAG {sagActualText} → {sagObjetivoText}
                        </div>
                      )}
                    </div>

                    {!isNarrow && (
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, textAlign: "right", color: C.ink }}>
                      {rec.daysInStore !== null ? `${rec.daysInStore}d` : "—"}
                    </div>
                    )}
                    {!isNarrow && (
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, textAlign: "right", color: C.ink }}>
                      {rec.storeQty}
                    </div>
                    )}
                    {!isNarrow && (
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, textAlign: "right", color: C.ink }}>
                      {sagActualText}
                    </div>
                    )}
                    <div style={{ textAlign: "center" }}>
                      <span style={{
                        fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                        padding: "2px 8px", borderRadius: R.pill,
                        background: `${tierColor}18`, color: tierColor,
                        border: `1px solid ${tierColor}40`,
                      }}>
                        {DISCOUNT_TIER_LABEL[rec.discountTier]}
                      </span>
                    </div>
                    {!isNarrow && (
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, textAlign: "right", color: C.inkMid }}>
                      {rec.variantCount}
                    </div>
                    )}
                    {!isNarrow && (
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: sagActionColor, fontWeight: T.wt.semibold }}>
                      {sagActionText}
                    </div>
                    )}
                  </div>

                  {/* SAG per-store sub-row */}
                  {sagOpen && hasSag && (
                    <div style={{
                      padding: isNarrow ? `${S[2]}px ${S[3]}px` : `${S[2]}px ${S[3]}px ${S[2]}px 44px`,
                      background: C.surface,
                      borderBottom: `1px solid ${C.lineSubtle}`,
                      display: "flex", gap: isNarrow ? S[2] : S[4], flexWrap: "wrap",
                      flexDirection: isNarrow ? "column" : "row",
                    }}>
                      {rec.sagComparison!.map(sc => {
                        const actionDisplay = SAG_ACTION_DISPLAY[sc.action];
                        const isCurrent = sc.storeId === currentStoreId;
                        return (
                          <div key={sc.storeId} style={{
                            display: "flex", alignItems: "center", gap: S[2],
                            fontFamily: T.mono, fontSize: T.sz["2xs"],
                          }}>
                            <span style={{ color: isCurrent ? C.ink : C.inkMid, fontWeight: isCurrent ? T.wt.semibold : T.wt.normal, minWidth: 72 }}>
                              {sc.storeName}{isCurrent ? " ◀" : ""}
                            </span>
                            <span style={{ color: C.ink, minWidth: 28, textAlign: "right" }}>
                              {sc.currentDiscountPercent != null ? `${sc.currentDiscountPercent}%` : "—"}
                            </span>
                            <span style={{ color: actionDisplay.color, fontWeight: T.wt.semibold }}>
                              {actionDisplay.icon} {actionDisplay.label(sc.targetDiscountPercent)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            // ── Render a collapsible section ──
            function renderDiscountSection(
              segmentKey: DiscSegment,
              label: string,
              recs: DiscountRecommendation[],
              accentColor: string,
            ) {
              const open = discSectionOpen[segmentKey] ?? false;
              return (
                <div style={{ ...panel }}>
                  <button
                    onClick={() => setDiscSectionOpen(prev => ({ ...prev, [segmentKey]: !open }))}
                    style={{
                      ...panelHeader, justifyContent: "space-between", width: "100%",
                      cursor: "pointer", background: "transparent", border: "none", textAlign: "left",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, width: 14 }}>
                        {open ? "▼" : "▶"}
                      </span>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
                        {label}
                      </span>
                      <span style={{
                        fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold,
                        padding: "1px 8px", borderRadius: R.pill, minWidth: 24, textAlign: "center",
                        background: `${accentColor}18`, color: accentColor,
                      }}>
                        {recs.length}
                      </span>
                    </span>
                  </button>
                  {open && (
                    <div className="ag-op-table" style={{ fontSize: T.sz.xs }}>
                      {!isNarrow && (
                      <div className="ag-op-row" style={{
                        display: "grid",
                        gridTemplateColumns: "32px 1fr 60px 60px 60px 60px 60px 130px",
                        gap: S[2], padding: `${S[2]}px ${S[3]}px`,
                        fontWeight: T.wt.semibold, color: C.inkMid,
                        borderBottom: `1px solid ${C.line}`, background: C.surface,
                      }}>
                        <span />
                        <span style={{ fontFamily: T.mono }}>Referencia</span>
                        <span style={{ fontFamily: T.mono, textAlign: "right" }}>Días</span>
                        <span style={{ fontFamily: T.mono, textAlign: "right" }}>Uds</span>
                        <span style={{ fontFamily: T.mono, textAlign: "right" }}>SAG actual</span>
                        <span style={{ fontFamily: T.mono, textAlign: "center" }}>Objetivo</span>
                        <span style={{ fontFamily: T.mono, textAlign: "right" }}>Var.</span>
                        <span style={{ fontFamily: T.mono }}>Acción</span>
                      </div>
                      )}
                      {recs.map(renderDiscountRow)}
                      {recs.length === 0 && (
                        <div style={{ padding: S[4], textAlign: "center", fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>
                          {discSearchDebounced ? "Sin resultados en esta seccion" : "Sin referencias en esta seccion"}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <>
                {/* Policy summary card */}
                <div style={{ ...panel }}>
                  <div style={{ ...panelHeader, justifyContent: "space-between" }}>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
                      Política de descuento por antigüedad
                    </span>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                      Fecha de ingreso a tienda
                    </span>
                  </div>
                  <div style={{ padding: `${S[2]}px ${S[4]}px`, display: "flex", gap: S[2], flexWrap: "wrap", alignItems: "center" }}>
                    {[
                      { label: "0-89d", pct: "0%" },
                      { label: "90-179d", pct: "10%" },
                      { label: "180-269d", pct: "30%" },
                      { label: "270-364d", pct: "50%" },
                      { label: "365d+", pct: "70%" },
                    ].map(r => (
                      <span key={r.label} style={{
                        fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                        padding: "2px 8px", borderRadius: R.pill,
                        background: C.surfaceAlt, color: C.inkMid, border: `1px solid ${C.line}`,
                      }}>
                        {r.label} · <strong style={{ color: C.ink }}>{r.pct}</strong>
                      </span>
                    ))}
                  </div>
                </div>

                {/* KPIs — §12: match section counts; show segmented + tier counts */}
                <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
                  <KpiCard label="Pendientes" value={String(pendingRecs.length)} color={pendingRecs.length > 0 ? DISCOUNT_TIER_COLOR.FIFTY_PERCENT : C.ink} />
                  <KpiCard label="Alineados" value={String(alignedRecs.length)} color={alignedRecs.length > 0 ? DISCOUNT_TIER_COLOR.NONE : C.ink} />
                  <KpiCard label="Revisar" value={String(reviewRecs.length)} color={reviewRecs.length > 0 ? C.inkMid : C.ink} />
                  <KpiCard label="Evaluadas" value={String(kpis.totalEvaluated)} color={C.ink} />
                </div>
                <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
                  <KpiCard label="70%" value={String(kpis.seventyPercent)} color={kpis.seventyPercent > 0 ? DISCOUNT_TIER_COLOR.SEVENTY_PERCENT : C.ink} />
                  <KpiCard label="50%" value={String(kpis.fiftyPercent)} color={kpis.fiftyPercent > 0 ? DISCOUNT_TIER_COLOR.FIFTY_PERCENT : C.ink} />
                  <KpiCard label="30%" value={String(kpis.thirtyPercent)} color={kpis.thirtyPercent > 0 ? DISCOUNT_TIER_COLOR.THIRTY_PERCENT : C.ink} />
                  <KpiCard label="10%" value={String(kpis.tenPercent)} color={kpis.tenPercent > 0 ? DISCOUNT_TIER_COLOR.TEN_PERCENT : C.ink} />
                  <KpiCard label="Sin descuento" value={String(kpis.none)} color={C.ink} />
                  <KpiCard label="Sin fecha" value={String(kpis.sinFecha)} color={kpis.sinFecha > 0 ? C.inkFaint : C.ink} />
                </div>

                {/* SAG status strip */}
                {dd.sagComparisonStatus === "AVAILABLE" && dd.sagFetchResult && (
                  <div style={{
                    ...panel, padding: `${S[2]}px ${S[3]}px`,
                    display: "flex", gap: S[2], flexWrap: "wrap", alignItems: "center",
                  }}>
                    <span style={{
                      fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                      padding: "2px 8px", borderRadius: R.pill,
                      background: `${DISCOUNT_TIER_COLOR.NONE}18`, color: DISCOUNT_TIER_COLOR.NONE,
                    }}>
                      SAG conectado
                    </span>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                      {dd.sagFetchResult.rowCount.toLocaleString()} descuentos activos en SAG
                    </span>
                  </div>
                )}
                {dd.sagComparisonStatus === "UNAVAILABLE" && (
                  <div style={{
                    ...panel, padding: `${S[2]}px ${S[3]}px`,
                    display: "flex", gap: S[2], flexWrap: "wrap", alignItems: "center",
                  }}>
                    <span style={{
                      fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                      padding: "2px 8px", borderRadius: R.pill,
                      background: C.surfaceAlt, color: C.inkFaint, border: `1px solid ${C.line}`,
                    }}>
                      SAG no disponible
                    </span>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
                      No se pudo verificar el descuento actual en SAG
                    </span>
                  </div>
                )}

                {/* Tier filters + search */}
                <div style={{ display: "flex", flexDirection: "column", gap: S[1] }}>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
                    Filtrar por descuento
                  </div>
                  <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
                    {TIER_FILTERS.map(tf => {
                      const isActive = discTierFilter === tf.key;
                      return (
                        <button
                          key={tf.key}
                          onClick={() => setDiscTierFilter(tf.key)}
                          style={{
                            fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                            padding: "6px 14px", minHeight: 32, borderRadius: R.sm, cursor: "pointer",
                            background: isActive ? C.blueDark : C.white,
                            color: isActive ? C.white : C.ink,
                            border: `1.5px solid ${isActive ? C.blueDark : C.line}`,
                          }}
                        >
                          {tf.label}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    value={discSearch}
                    onChange={e => setDiscSearch(e.target.value)}
                    aria-label="Buscar referencia o descripcion"
                    placeholder="Buscar referencia o descripcion..."
                    style={{
                      fontFamily: T.mono, fontSize: T.sz.xs, padding: `${S[2]}px ${S[3]}px`,
                      border: `1px solid ${C.line}`, borderRadius: R.sm, background: C.white,
                      color: C.ink, width: "100%", marginTop: S[1],
                    }}
                  />
                </div>

                {/* §1-4: Three segmented collapsible sections */}
                {renderDiscountSection("PENDING_ACTION", "Pendientes de ajuste", pendingRecs, DISCOUNT_TIER_COLOR.FIFTY_PERCENT)}
                {renderDiscountSection("ALIGNED", "Alineados en SAG", alignedRecs, DISCOUNT_TIER_COLOR.NONE)}
                {renderDiscountSection("REVIEW_OR_INFORMATIONAL", "Revisar / informativos", reviewRecs, C.inkMid)}

                {filtered.length === 0 && (
                  <div style={{ padding: S[4], textAlign: "center", fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>
                    {discSearchDebounced ? "Sin resultados para esta busqueda" : "No hay referencias en este filtro"}
                  </div>
                )}

                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                  Clasificación basada en el estado de {storeCard.store.name} en SAG. Otras tiendas se muestran como contexto secundario.
                </div>
              </>
            );
          })()}
          {!discLoading && !discData && discLoaded && (
            <div style={{ padding: S[4], textAlign: "center", fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>
              No se pudo cargar la informacion de descuentos
            </div>
          )}
        </div>
      )}

      {/* TAB: Derrotero — supply rules editor (AGENTIK-STORES-SUPPLY-RULES-RESET-01) */}
      {tab === "derrotero" && (
        <StoreSupplyRulesTab orgSlug={orgSlug} storeId={storeCard.store.id} storeName={storeCard.store.name} onSaved={onSnapshotRefresh} />
      )}

      {/* TAB: Inteligencia — lectura ejecutiva diaria (INTELLIGENCE-UX-IMPLEMENTATION-01) */}
      {tab === "inteligencia" && (
        <StoreIntelligenceTab
          certifiedIntel={certifiedIntel}
          certifiedLoading={certifiedIntelLoading}
          certifiedError={certifiedIntelError}
          productIntel={productIntel}
          productLoading={productIntelLoading}
          productError={productIntelError}
          periodKey={intelPeriod}
          onPeriodChange={setIntelPeriod}
          onRetryCertified={() => { setCertifiedIntelError(false); setCertifiedIntelLoaded(false); }}
          onRetryProduct={() => { setProductIntelError(false); setProductIntelKey(null); }}
        />
      )}
    </OperationalSideDrawer>
  );
}


// ── Accessory Composition Accordion (AGENTIK-STORES-ACCESSORIES-COMPOSITION-UX-01/02) ──

function AccessoryFamilyDrillDown({ family, isLast }: { family: AccessoryFamilyRow; isLast: boolean }) {
  const [open, setOpen] = useState(false);
  const hasRefs = family.references.length > 0;
  return (
    <div style={{ borderBottom: isLast ? "none" : `1px solid ${C.lineSubtle}` }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => hasRefs && setOpen(v => !v)}
        style={{
          display: "grid", gridTemplateColumns: "1fr 80px 60px 60px",
          gap: S[2], alignItems: "center", width: "100%",
          padding: `${S[2]}px 0`, background: "transparent",
          border: "none", cursor: hasRefs ? "pointer" : "default", textAlign: "left",
        }}
      >
        <span style={{
          fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          display: "flex", alignItems: "center", gap: S[1],
        }}>
          {hasRefs && (
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, width: 12, flexShrink: 0 }}>
              {open ? "▼" : "▶"}
            </span>
          )}
          {family.label}
        </span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink, textAlign: "right" }}>
          {family.units}
        </span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textAlign: "right" }}>
          {family.refCount}
        </span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, textAlign: "right" }}>
          {family.percentage}%
        </span>
      </button>
      {open && hasRefs && (
        <div style={{ paddingLeft: S[4], paddingBottom: S[2] }}>
          {/* Reference sub-header */}
          <div style={{
            display: "grid", gridTemplateColumns: "100px 1fr 60px",
            gap: S[2], padding: `${S[1]}px 0`,
            borderBottom: `1px solid ${C.lineSubtle}`,
          }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" }}>Referencia</span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" }}>Descripción</span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase", textAlign: "right" }}>Uds</span>
          </div>
          {family.references.map((r) => (
            <div key={r.referenceId} style={{
              display: "grid", gridTemplateColumns: "36px 100px 1fr 60px",
              gap: S[2], alignItems: "center",
              padding: `${S[1]}px 0`,
              borderBottom: `1px solid ${C.lineSubtle}`,
            }}>
              <CommercialReferenceThumbnail imageUrl={r.thumbnailUrl} referenceCode={r.referenceCode} description={r.description} size={36} />
              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
                {r.referenceCode}
              </span>
              <span style={{
                fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.ink,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {r.description}
              </span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.ink, textAlign: "right" }}>
                {r.units}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AccessorySizeAccordion({ block }: { block: AccessorySizeBlock }) {
  const [open, setOpen] = useState(false);
  const deltaColor = block.deltaState === "over" ? C.blueDark
    : block.deltaState === "exact" ? C.green : C.amber;
  return (
    <div style={{ borderBottom: `1px solid ${C.line}` }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: S[2], width: "100%",
          padding: `${S[2]}px ${S[3]}px`, background: C.surfaceAlt,
          border: "none", cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid, width: 16, flexShrink: 0 }}>
          {open ? "▼" : "▶"}
        </span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink, flex: 1, minWidth: 0 }}>
          {block.sizeLabel}
        </span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, flexShrink: 0 }}>
          {block.units} uds · obj {block.target} · {block.familyCount} {block.familyCount === 1 ? "categoría" : "categorías"}
        </span>
        <span style={{
          fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
          padding: "2px 8px", borderRadius: R.pill, flexShrink: 0,
          background: deltaColor === C.green ? C.greenLight
            : deltaColor === C.amber ? C.amberLight : C.blueLight,
          color: deltaColor,
          border: `1px solid ${deltaColor === C.green ? C.greenBorder
            : deltaColor === C.amber ? C.amberBorder : C.blueBorder}`,
        }}>
          {block.deltaText}
        </span>
      </button>
      {open && (
        <div style={{ padding: `0 ${S[3]}px` }}>
          {block.families.length === 0 ? (
            <div style={{
              fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint,
              padding: `${S[3]}px 0`, textAlign: "center",
            }}>
              No hay accesorios de este tamaño en la tienda.
            </div>
          ) : (
            <>
              {/* Column headers */}
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 80px 60px 60px",
                gap: S[2], padding: `${S[1]}px 0`,
                borderBottom: `1px solid ${C.lineSubtle}`,
              }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" }}>Familia</span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase", textAlign: "right" }}>Unidades</span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase", textAlign: "right" }}>Refs</span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase", textAlign: "right" }}>%</span>
              </div>
              {block.families.map((f, fi) => (
                <AccessoryFamilyDrillDown
                  key={f.key}
                  family={f}
                  isLast={fi === block.families.length - 1}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function AccessoryCompositionSection({ composition }: { composition: AccessoryCompositionPresentation }) {
  const uniqueFamilies = new Set(composition.sizes.flatMap(b => b.families.map(f => f.key))).size;
  return (
    <div style={{ ...panel, padding: 0, overflow: "hidden" }}>
      <div style={{ ...panelHeader, padding: `${S[2]}px ${S[3]}px` }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
          Composición de accesorios
        </span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
          {uniqueFamilies} {uniqueFamilies === 1 ? "categoría de producto" : "categorías de producto"}
        </span>
      </div>
      {composition.sizes.map(block => (
        <AccessorySizeAccordion key={block.structureKey} block={block} />
      ))}
    </div>
  );
}

function DistKpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      ...panel, padding: S[3], display: "flex", flexDirection: "column", gap: S[1],
    }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const }}>
        {label}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xl, fontWeight: T.wt.bold, color }}>
        {value}
      </div>
    </div>
  );
}
