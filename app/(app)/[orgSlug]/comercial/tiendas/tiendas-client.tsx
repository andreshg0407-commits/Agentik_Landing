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
  CanonicalStoreDistribution,
  CanonicalStoreCard,
  StoreDistributionItem,
  StoreDistributionAction,
  CanonicalStoreDetail,
  EffectiveStoreConfig,
  EffectiveTextileConfig,
  EffectiveAccessoryConfig,
  EffectiveScarcityConfig,
  RuleImpactPreview,
  ReplacementResult,
  StoreDistributionHealthStatus,
} from "@/lib/comercial/tiendas/store-distribution-types";
import { ACTIVE_STORE_SLUGS } from "@/lib/comercial/tiendas/store-distribution-types";
import type { StoreGovernanceRecord } from "@/lib/comercial/tiendas/store-governance-types";
import { StoreSupplyRulesTab } from "@/components/comercial/store-supply-rules-tab";

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
  mainWarehouseQty: number;
  minUnits: number;
  idealUnits: number;
  maxUnits: number;
  inventoryState: string;
  configState: string;
  unclassifiedReason: string | null;
  variantCount: number;
  hasReplacement: boolean;
  replacementBrief: InvReplacementBrief | null;
}

type InvSortBy = "QUANTITY_ASC" | "QUANTITY_DESC" | "REFERENCE_ASC" | "REFERENCE_DESC";
type InvKpiFilter = "ALL" | "BELOW_MINIMUM" | "HEALTHY" | "HAS_REPLACEMENT";

interface InvVariant {
  referenceCode: string;
  size: string;
  color: string;
  storeQty: number;
  mainQty: number;
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
  // ── Distribution cards (PRIMERO — 4 operational stores) ───────────────────
  const [distribution, setDistribution] = useState<CanonicalStoreDistribution | null>(null);
  const [distLoading, setDistLoading]   = useState(true);
  const [distError, setDistError]       = useState(false);

  // ── Drawer state (QUINTO — lazy per-store loading) ──────────────────────
  const [selectedStoreCard, setSelectedStoreCard] = useState<CanonicalStoreCard | null>(null);

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
    async function loadDistribution() {
      setDistLoading(true);
      setDistError(false);
      try {
        const res = await fetch(`/api/orgs/${orgSlug}/comercial/tiendas`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "store_distribution" }),
        });
        const data = await res.json();
        if (!cancelled && data.distribution) setDistribution(data.distribution);
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
          setInactiveLoaded(true);
        }
      } catch { /* silent */ }
    }
    loadDistribution();
    loadGovernancePermission();
    return () => { cancelled = true; };
  }, [orgSlug]);

  // ── QUINTO: Open store drawer (lazy — detail loaded by drawer on demand) ──
  function openStoreDrawer(card: CanonicalStoreCard) {
    setSelectedStoreCard(card);
  }

  function closeDrawer() {
    setSelectedStoreCard(null);
  }

  // ── Retry distribution load ──────────────────────────────────────────────
  function retryDistribution() {
    setDistLoading(true);
    setDistError(false);
    fetch(`/api/orgs/${orgSlug}/comercial/tiendas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "store_distribution" }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.distribution) setDistribution(data.distribution);
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
        // Refresh both lists
        setInactiveLoaded(false);
        retryDistribution();
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

  // ── Derived: overall status from distribution ──────────────────────────────
  const overallStatus = distribution
    ? (distribution.kpis.tiendasCriticas > 0 ? "critical" as const
      : distribution.kpis.referenciasPorSurtir > 0 ? "warning" as const
      : "ok" as const)
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
        statusLabel={distribution ? `${distribution.kpis.tiendasActivas} tiendas operativas` : "Cargando..."}
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

      {/* Data source pill */}
      {distribution && (
        <div style={{ display: "flex", marginBottom: S[4], alignItems: "center" }}>
          <span style={{
            fontFamily: T.mono, fontSize: T.sz["2xs"], marginLeft: "auto",
            padding: "2px 8px", borderRadius: R.pill,
            background: C.greenLight, color: C.green,
            border: `1px solid ${C.greenBorder}`,
          }}>
            Datos persistidos · {distribution.lastSyncAt ? formatTimeAgo(distribution.lastSyncAt) : "sin sync"}
          </span>
        </div>
      )}

      {/* PRIMERO — 4 operational store cards */}
      <>
          {/* TERCERO — Skeleton while distribution loads */}
          {distLoading && !distribution && (
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
          {distError && !distribution && !distLoading && (
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

          {/* Loaded — KPIs + 4 store cards */}
          {distribution && (
            <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>
              {/* KPI strip */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: S[3] }}>
                <DistKpiCard label="Tiendas activas" value={String(distribution.kpis.tiendasActivas)} color={C.blueDark} />
                <DistKpiCard label="Criticas" value={String(distribution.kpis.tiendasCriticas)} color={distribution.kpis.tiendasCriticas > 0 ? C.red : C.green} />
                <DistKpiCard label="Por surtir" value={String(distribution.kpis.referenciasPorSurtir)} color={distribution.kpis.referenciasPorSurtir > 0 ? C.blueDark : C.green} />
                <DistKpiCard label="Bodega principal" value={`${distribution.mainWarehouseStock.toLocaleString()} uds`} color={C.ink} />
              </div>

              {/* SÉPTIMO — 4 operational store cards */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: S[4],
              }}>
                {distribution.stores.map(card => (
                  <OperationalStoreCard
                    key={card.store.id}
                    card={card}
                    onOpen={() => openStoreDrawer(card)}
                    canDeactivate={canManageGov}
                    onDeactivate={() => setGovConfirm({ action: "deactivate", storeId: card.store.id, storeName: card.store.name })}
                  />
                ))}
              </div>

              {/* Intelligence disclaimer (OCTAVO) */}
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>La inteligencia del modulo utiliza unicamente las tiendas activas.</span>
                {distribution.computedAt && (
                  <span>Computado: {formatTimeAgo(distribution.computedAt)}</span>
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
          )}

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

          {/* QUINTO — Store drawer */}
          {selectedStoreCard && (
            <DistributionStoreDrawer
              orgSlug={orgSlug}
              storeCard={selectedStoreCard}
              onClose={closeDrawer}
            />
          )}
        </>
    </div>
  );
}

// ── Operational Store Card (SÉPTIMO — STABILIZATION-PERFORMANCE-01) ──────────

function OperationalStoreCard({ card, onOpen, canDeactivate, onDeactivate }: {
  card: CanonicalStoreCard;
  onOpen: () => void;
  canDeactivate?: boolean;
  onDeactivate?: () => void;
}) {
  const { store } = card;
  const healthColor = DIST_HEALTH_COLOR[card.healthStatus];
  const healthLabel = DIST_HEALTH_LABEL[card.healthStatus];

  // CUARTO — replacement count from criticalNeeds (items needing action)
  const hasAction = card.criticalNeeds > 0 || card.excessItems > 0;

  return (
    <div style={{
      ...panel, display: "flex", flexDirection: "column", minHeight: 220,
    }}>
      {/* Header */}
      <div style={{ ...panelHeader, flexDirection: "column", alignItems: "stretch", gap: S[1] }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.ink }}>
            {store.name}
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
          Bodega SAG: {store.sagWarehouseCode}{store.city ? ` · ${store.city}` : ""}
        </div>
      </div>

      {/* Metrics */}
      <div style={{ padding: S[4], flex: 1, display: "flex", flexDirection: "column", gap: S[2] }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2] }}>
          <MetricBox label="Referencias" value={card.totalReferences} color={C.blueDark} suffix=" refs" />
          <MetricBox label="Unidades" value={card.totalUnits} color={C.ink} suffix=" uds" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2] }}>
          <MetricBox label="Necesidades" value={card.criticalNeeds} color={card.criticalNeeds > 0 ? C.red : C.green} suffix="" />
          <MetricBox label="Excesos" value={card.excessItems} color={card.excessItems > 0 ? C.amber : C.green} suffix="" />
        </div>
        {/* Coverage */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>Cobertura</span>
          <span style={{
            fontFamily: T.mono, fontSize: T.sz.xl, fontWeight: T.wt.bold,
            color: card.coveragePercent >= 85 ? C.green : card.coveragePercent >= 60 ? C.amber : C.red,
          }}>
            {card.coveragePercent >= 0 ? `${card.coveragePercent}%` : "\u2014"}
          </span>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: `${S[2]}px ${S[4]}px`, borderTop: `1px solid ${C.line}`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        {hasAction && (
          <span style={{
            fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amber,
          }}>
            Accion requerida
          </span>
        )}
        <button onClick={onOpen} className="ag-action-primary" style={{
          fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
          color: C.white, background: C.blueDark, border: "none",
          borderRadius: R.sm, padding: `${S[1]}px ${S[3]}px`, cursor: "pointer",
          marginLeft: "auto",
        }}>
          Abrir tienda
        </button>
      </div>
    </div>
  );
}

// ── Metric box ───────────────────────────────────────────────────────────────

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
                {block.key === "special" && renderSpecialBlock()}

                {/* Edit/Reset actions */}
                {editable && !isEditing && block.key !== "special" && (
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
          <div style={helpStyle}>Debajo: surtir</div>
          {errors.minUnits && <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red }}>{errors.minUnits}</div>}
        </div>
        <div>
          <div style={labelStyle}>Objetivo</div>
          {isEditing ? (
            <input type="number" value={val.targetUnits} min={0} onChange={e => onChange({ ...val, targetUnits: parseInt(e.target.value) || 0 })} style={fieldStyle} />
          ) : (
            <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.blueDark }}>{val.targetUnits}</div>
          )}
          <div style={helpStyle}>Meta de surtido</div>
          {errors.targetUnits && <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red }}>{errors.targetUnits}</div>}
        </div>
        <div>
          <div style={labelStyle}>Maximo</div>
          {isEditing ? (
            <input type="number" value={val.maxUnits} min={0} onChange={e => onChange({ ...val, maxUnits: parseInt(e.target.value) || 0 })} style={fieldStyle} />
          ) : (
            <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.ink }}>{val.maxUnits}</div>
          )}
          <div style={helpStyle}>Encima: retirar</div>
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

function renderSpecialBlock() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, lineHeight: "1.4" }}>
        Los productos especiales (Banera, Cuna Colecho, Corral) se identifican por coincidencia textual. Solo se aplican automaticamente cuando la identidad este certificada mediante referencia, subgrupo o clasificacion canonica.
      </div>

      <div style={{ ...panel, padding: S[2], background: C.surfaceAlt }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[1] }}>Politica prevista</div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
          Productos: Banera, Cuna Colecho, Corral
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
          Objetivo: 3 unidades · Tiendas: San Diego, Caldas
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amber, marginTop: S[1] }}>
          Estado: Requiere configuracion — coincidencias textuales no generan surtido automatico
        </div>
      </div>

      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
        Fuente: Politica del tenant · Confianza: Baja (texto)
      </div>
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

// SÉPTIMO — Health color for distribution cards
const DIST_HEALTH_COLOR: Record<StoreDistributionHealthStatus, { bg: string; text: string }> = {
  ok:               { bg: C.greenLight, text: C.green },
  requiere_surtido: { bg: C.amberLight, text: C.amber },
  critica:          { bg: C.redLight,   text: C.red },
  sin_reglas:       { bg: C.surface,    text: C.inkLight },
};
const DIST_HEALTH_LABEL: Record<StoreDistributionHealthStatus, string> = {
  ok:               "Saludable",
  requiere_surtido: "Atencion",
  critica:          "Critica",
  sin_reglas:       "Sin reglas",
};

// ── Inventory-by-line constants (AGENTIK-STORES-INVENTORY-BY-LINE-01) ────────

const INV_STATE_LABEL: Record<string, string> = {
  BAJO_MINIMO:             "Bajo minimo",
  EN_RANGO:                "En rango",
  EXCESO:                  "Exceso",
  SIN_REGLA:               "Sin regla",
  AGOTADO:                 "Agotado",
  CLASIFICACION_PENDIENTE: "Clasificacion pendiente",
};

const INV_STATE_COLOR: Record<string, { bg: string; text: string }> = {
  BAJO_MINIMO:             { bg: C.redLight,    text: C.red },
  EN_RANGO:                { bg: C.greenLight,  text: C.green },
  EXCESO:                  { bg: C.amberLight,  text: C.amber },
  SIN_REGLA:               { bg: C.surface,     text: C.inkFaint },
  AGOTADO:                 { bg: C.redLight,    text: C.red },
  CLASIFICACION_PENDIENTE: { bg: C.amberLight,  text: C.amber },
};

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

function InvLineSummaryStrip({ summary, activeKpi, onKpiClick, sortBy, onSortChange }: {
  summary: { type: string; data: Record<string, unknown> };
  activeKpi: InvKpiFilter;
  onKpiClick: (kpi: InvKpiFilter) => void;
  sortBy: InvSortBy;
  onSortChange: (s: InvSortBy) => void;
}) {
  const d = summary.data;

  // Build KPI items based on summary type
  type KpiItem = { key: InvKpiFilter; label: string; value: number; color: string };
  let kpis: KpiItem[] = [];

  if (summary.type === "textile") {
    kpis = [
      { key: "ALL",             label: "Referencias",   value: Number(d.referenciasActivas ?? 0), color: C.ink },
      { key: "ALL",             label: "Unidades",      value: Number(d.unidades ?? 0),           color: C.ink },
      { key: "BELOW_MINIMUM",   label: "Bajo minimo",   value: Number(d.bajoMinimo ?? 0),         color: C.red },
      { key: "HAS_REPLACEMENT", label: "Reemplazos",    value: Number(d.reemplazos ?? 0),         color: C.blue },
      { key: "HEALTHY",         label: "Saludables",     value: Number(d.saludables ?? 0),         color: C.green },
    ];
  } else if (summary.type === "accessory") {
    kpis = [
      { key: "ALL",             label: "Referencias",   value: Number(d.referenciasActivas ?? 0), color: C.ink },
      { key: "ALL",             label: "Unidades",      value: Number(d.unidades ?? 0),           color: C.ink },
      { key: "BELOW_MINIMUM",   label: "Bajo objetivo", value: Number(d.bajoObjetivo ?? 0),       color: C.red },
      { key: "HAS_REPLACEMENT", label: "Reemplazos",    value: Number(d.reemplazos ?? 0),         color: C.blue },
      { key: "HEALTHY",         label: "Saludables",     value: Number(d.saludables ?? 0),         color: C.green },
    ];
  } else if (summary.type === "unclassified") {
    kpis = [
      { key: "ALL", label: "Total",        value: Number(d.total ?? 0),       color: C.amber },
      { key: "ALL", label: "Unidades",     value: Number(d.unidades ?? 0),    color: C.ink },
      { key: "ALL", label: "Sin linea",    value: Number(d.sinLinea ?? 0),    color: C.red },
      { key: "ALL", label: "Sin grupo",    value: Number(d.sinGrupo ?? 0),    color: C.amber },
      { key: "ALL", label: "Ambiguas",     value: Number(d.ambiguas ?? 0),    color: C.inkFaint },
    ];
  } else if (summary.type === "out_of_stock") {
    kpis = [
      { key: "ALL", label: "Total agotados", value: Number(d.total ?? 0),       color: C.red },
      { key: "ALL", label: "Castillitos",    value: Number(d.castillitos ?? 0), color: C.ink },
      { key: "ALL", label: "Latin Kids",     value: Number(d.latinKids ?? 0),   color: C.ink },
      { key: "ALL", label: "Accesorios",     value: Number(d.accesorios ?? 0),  color: C.ink },
    ];
  }

  const isActionable = summary.type === "textile" || summary.type === "accessory";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
      <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
        {kpis.map((kpi, idx) => {
          // "Referencias" clears filter; "Unidades" toggles sort; others are state filters
          const isRefsKpi = idx === 0;
          const isUnitsKpi = idx === 1;
          const isFilterKpi = !isRefsKpi && !isUnitsKpi;
          const isActive = isFilterKpi && activeKpi === kpi.key && activeKpi !== "ALL";
          // For Unidades, show sort indicator
          const unitsSortActive = isUnitsKpi && (sortBy === "QUANTITY_ASC" || sortBy === "QUANTITY_DESC");
          const showActive = isActive || (isRefsKpi && activeKpi === "ALL" && isActionable);

          return (
            <button
              key={idx}
              onClick={() => {
                if (!isActionable) return;
                if (isRefsKpi) {
                  // Clear all filters
                  onKpiClick("ALL");
                } else if (isUnitsKpi) {
                  // Toggle sort direction
                  onSortChange(sortBy === "QUANTITY_ASC" ? "QUANTITY_DESC" : "QUANTITY_ASC");
                } else {
                  // Toggle filter: second click deactivates
                  onKpiClick(activeKpi === kpi.key ? "ALL" : kpi.key);
                }
              }}
              style={{
                ...panel, padding: `${S[2]}px ${S[3]}px`, display: "flex", flexDirection: "column", gap: 2,
                flex: 1, minWidth: 80, textAlign: "left" as const,
                cursor: isActionable ? "pointer" : "default",
                border: isActive ? `2px solid ${C.blueDark}` : `1px solid ${C.line}`,
                background: isActive ? C.blueLight : C.white,
              }}
            >
              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const }}>
                {kpi.label}
                {isUnitsKpi && unitsSortActive && (
                  <span style={{ marginLeft: 4 }}>{sortBy === "QUANTITY_ASC" ? "↑" : "↓"}</span>
                )}
              </span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: kpi.color }}>
                {kpi.value}
              </span>
            </button>
          );
        })}
      </div>

      {/* Sort selector — only for textile/accessory */}
      {isActionable && (
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
      )}
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
                reference={c.referenceCode}
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

type DistDrawerTab = "inventario" | "necesidades" | "derrotero" | "inteligencia";

function DistributionStoreDrawer({
  orgSlug,
  storeCard,
  onClose,
}: {
  orgSlug: string;
  storeCard: CanonicalStoreCard;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<DistDrawerTab>("inventario");
  const [actionFilter, setActionFilter] = useState<StoreDistributionAction | "ALL">("ALL");
  const [domainFilter, setDomainFilter] = useState<DistDomainFilter>("ALL");
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  // expandedNeedRef / expandedVariantKey removed — replaced by ndExpandedRef / ndExpandedVariantKey (NEEDS-BY-LINE-01)

  // ── Lazy detail loading: only fetch when necesidades/inteligencia tab is active ──
  const [detail, setDetail] = useState<CanonicalStoreDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailLoaded, setDetailLoaded] = useState(false);

  useEffect(() => {
    const needsDetail = tab === "inteligencia";
    if (!needsDetail || detailLoaded) return;
    let cancelled = false;
    setDetailLoading(true);
    tiendaApi(orgSlug, { action: "store_distribution_detail", storeId: storeCard.store.id })
      .then((data: { detail?: CanonicalStoreDetail }) => {
        if (cancelled) return;
        if (data.detail) setDetail(data.detail);
        setDetailLoaded(true);
      })
      .catch(() => { if (!cancelled) setDetailLoaded(true); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [tab, storeCard.store.id, orgSlug, detailLoaded]);

  // ── Inventory-by-line state (AGENTIK-STORES-INVENTORY-BY-LINE-01) ──────
  type InvLine = "CASTILLITOS" | "LATIN_KIDS" | "ACCESSORIES" | "UNCLASSIFIED" | "OUT_OF_STOCK";
  type InvState = "BAJO_MINIMO" | "EN_RANGO" | "EXCESO" | "SIN_REGLA" | "AGOTADO" | "CLASIFICACION_PENDIENTE";

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
  const [invInvState, setInvInvState] = useState<InvState | undefined>();
  const [invExpandedRefs, setInvExpandedRefs] = useState<Set<string>>(new Set());
  const [invVariants, setInvVariants] = useState<Record<string, InvVariant[]>>({});
  const [invVariantsLoading, setInvVariantsLoading] = useState<Set<string>>(new Set());
  const [invError, setInvError] = useState<string | null>(null);
  const [invRetry, setInvRetry] = useState(0);
  const [invSortBy, setInvSortBy] = useState<InvSortBy>("QUANTITY_ASC");
  const [invKpiFilter, setInvKpiFilter] = useState<InvKpiFilter>("ALL");

  // ── Needs-by-line state (AGENTIK-STORES-NEEDS-BY-LINE-01) ──────────────
  type NdLine = "CASTILLITOS" | "LATIN_KIDS" | "ACCESSORIES" | "UNCLASSIFIED";
  type NdNeedType = "ALL" | "DIRECT_REPLENISHMENT" | "PARTIAL_DIRECT_PLUS_REPLACEMENT" | "REPLACEMENT" | "NO_ALTERNATIVE" | "CLASSIFICATION_INCOMPLETE";
  type NdSortBy = "SHORTAGE_DESC" | "SHORTAGE_ASC" | "MAIN_STOCK_DESC" | "REFERENCE_ASC" | "REFERENCE_DESC";
  type NdSizeClass = "ALL" | "SMALL" | "MEDIUM" | "LARGE" | "UNCLASSIFIED";

  interface NdNeedItem {
    referenceCode: string;
    productName: string;
    imageUrl: string | null;
    canonicalLine: string;
    group: string;
    subgroup: string;
    sizeClass: string | null;
    world: string;
    currentUnits: number;
    minUnits: number;
    idealUnits: number;
    maxUnits: number;
    shortageQty: number;
    mainWarehouseAvailable: number;
    needType: "DIRECT_REPLENISHMENT" | "PARTIAL_DIRECT_PLUS_REPLACEMENT" | "REPLACEMENT" | "NO_ALTERNATIVE" | "CLASSIFICATION_INCOMPLETE";
    needTypeLabel: string;
    suggestedReplenishment: number;
    candidates: InvReplacementCandidate[];
    totalCandidatesFound: number;
    hasMoreCandidates: boolean;
    rule36BlockedCount: number;
    replacementShortageQty: number;
    resolution: {
      resolutionType: string;
      coverageStatus: string;
      totalShortageQty: number;
      sameRefCoverageQty: number;
      replacementCoverageQty: number;
      totalCoveredQty: number;
      remainingShortageQty: number;
      coveragePercent: number;
    } | null;
    variantAllocation: VariantAllocationForUI | null;
    actionReason: string;
  }

  interface InvReplacementCandidate {
    referenceCode: string;
    description: string;
    imageUrl: string | null;
    canonicalLine: string;
    group: string;
    subgroup: string;
    storeStock: number;
    mainWarehouseAvailableQty: number;
    suggestedQty: number;
    reason: string;
    evidence: string;
    quality: string;
    classificationSource: string;
    groupSource: string;
    subgroupSource: string;
    dataQuality: string;
    replacementVariants: InvReplacementVariant[];
    totalVariantCount: number;
    displayedVariantCount: number;
    totalVariantUnits: number;
    variantEvidenceDate: string;
  }

  interface NdSummary {
    directReplenishment: number;
    partialDirectPlusReplacement: number;
    replacement: number;
    noAlternative: number;
    classificationIncomplete: number;
    total: number;
  }

  interface NdResponse {
    line: string;
    summary: NdSummary;
    items: NdNeedItem[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
    lineCounts: { line: NdLine; count: number }[];
    availableSizeClasses: string[];
    dataFreshness: string | null;
  }

  const [ndLine, setNdLine] = useState<NdLine>("CASTILLITOS");
  const [ndData, setNdData] = useState<NdResponse | null>(null);
  const [ndLoading, setNdLoading] = useState(false);
  const [ndError, setNdError] = useState<string | null>(null);
  const [ndNeedType, setNdNeedType] = useState<NdNeedType>("ALL");
  const [ndSortBy, setNdSortBy] = useState<NdSortBy>("SHORTAGE_DESC");
  const [ndSizeClass, setNdSizeClass] = useState<NdSizeClass>("ALL");
  const [ndSearch, setNdSearch] = useState("");
  const [ndSearchDebounced, setNdSearchDebounced] = useState("");
  const [ndPage, setNdPage] = useState(1);
  const [ndExpandedRef, setNdExpandedRef] = useState<string | null>(null);
  const [ndExpandedVariantKey, setNdExpandedVariantKey] = useState<string | null>(null);
  const [ndInitialLineSet, setNdInitialLineSet] = useState(false);

  // Reset state on store change
  useEffect(() => {
    setTab("inventario");
    setActionFilter("ALL");
    setDomainFilter("ALL");
    setExpandedRows(new Set());
    setDetail(null);
    setDetailLoaded(false);
    setDetailLoading(false);
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
    setInvInvState(undefined);
    setInvExpandedRefs(new Set());
    setInvVariants({});
    setInvSortBy("QUANTITY_ASC");
    setInvKpiFilter("ALL");
    // Reset needs state
    setNdLine("CASTILLITOS");
    setNdData(null);
    setNdError(null);
    setNdNeedType("ALL");
    setNdSortBy("SHORTAGE_DESC");
    setNdSizeClass("ALL");
    setNdSearch("");
    setNdSearchDebounced("");
    setNdPage(1);
    setNdExpandedRef(null);
    setNdExpandedVariantKey(null);
    setNdInitialLineSet(false);
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
          const totalCounted = data.counts.reduce((s: number, c: { count: number }) => s + c.count, 0);
          if (totalCounted === 0 && storeCard.totalReferences > 0) {
            console.warn("[INV-BY-LINE] inconsistency: summary has", storeCard.totalReferences, "refs but counts total 0");
            setInvError("Inconsistencia: el resumen muestra referencias pero la clasificacion retorno 0. Intente recargar.");
          }
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
      inventoryState: invInvState,
      kpiFilter: invKpiFilter !== "ALL" ? invKpiFilter : undefined,
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
  }, [tab, storeCard.store.id, orgSlug, invLine, invGroup, invSubgroup, invSizeClass, invInvState, invKpiFilter, invSortBy, invSearchDebounced, invPage, invRetry]);

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

  // ── Load needs-by-line data (AGENTIK-STORES-NEEDS-BY-LINE-01) ────────────
  useEffect(() => {
    if (tab !== "necesidades") return;
    let cancelled = false;
    setNdLoading(true);
    setNdError(null);
    setNdExpandedRef(null);
    setNdExpandedVariantKey(null);
    tiendaApi(orgSlug, {
      action: "store_needs_by_line",
      storeId: storeCard.store.id,
      line: ndLine,
      needType: ndNeedType !== "ALL" ? ndNeedType : undefined,
      sortBy: ndSortBy,
      sizeClass: ndLine === "ACCESSORIES" && ndSizeClass !== "ALL" ? ndSizeClass : undefined,
      search: ndSearchDebounced || undefined,
      page: ndPage,
      pageSize: 25,
    })
      .then((data: NdResponse & { error?: string; code?: string }) => {
        if (cancelled) return;
        if (data.error) {
          setNdError(data.code === "STORE_INACTIVE" ? "Tienda desactivada" : `Error: ${data.error}`);
          return;
        }
        setNdData(data);
        // Auto-select first line with needs on initial load
        if (!ndInitialLineSet && data.lineCounts) {
          setNdInitialLineSet(true);
          const preferredOrder: NdLine[] = ["CASTILLITOS", "LATIN_KIDS", "ACCESSORIES", "UNCLASSIFIED"];
          const firstWithNeeds = preferredOrder.find(l => {
            const lc = data.lineCounts.find(c => c.line === l);
            return lc && lc.count > 0;
          });
          if (firstWithNeeds && firstWithNeeds !== ndLine) {
            setNdLine(firstWithNeeds);
            // Don't set data — the line change will trigger a re-fetch
            return;
          }
        }
      })
      .catch(() => { if (!cancelled) setNdError("Error de conexion al cargar necesidades"); })
      .finally(() => { if (!cancelled) setNdLoading(false); });
    return () => { cancelled = true; };
  }, [tab, storeCard.store.id, orgSlug, ndLine, ndNeedType, ndSortBy, ndSizeClass, ndSearchDebounced, ndPage]);

  // Debounce needs search
  useEffect(() => {
    const t = setTimeout(() => { setNdSearchDebounced(ndSearch); setNdPage(1); }, 300);
    return () => clearTimeout(t);
  }, [ndSearch]);

  // SÉPTIMO — Domain counts
  const domainCounts = useMemo(() => {
    if (!detail) return {} as Record<DistDomainFilter, number>;
    const counts: Record<string, number> = {};
    for (const item of detail.items) {
      const d = classifyItemDomain(item);
      counts[d] = (counts[d] || 0) + 1;
    }
    return counts;
  }, [detail]);

  // CUARTO — Filtered items
  const filteredItems = useMemo(() => {
    if (!detail) return [];
    let items = detail.items;
    if (domainFilter !== "ALL") items = items.filter(i => classifyItemDomain(i) === domainFilter);
    if (actionFilter !== "ALL") items = items.filter(i => i.action === actionFilter);
    return items;
  }, [detail, actionFilter, domainFilter]);

  // CUARTO — Action counts for KPI breakdown
  const actionCounts = useMemo(() => {
    if (!detail) return {} as Record<string, number>;
    const counts: Record<string, number> = {};
    for (const item of detail.items) {
      counts[item.action] = (counts[item.action] || 0) + 1;
    }
    return counts;
  }, [detail]);

  function toggleRow(idx: number) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  const severity = storeCard.healthStatus === "critica" ? "critical" as const
    : storeCard.healthStatus === "requiere_surtido" ? "warning" as const
    : "info" as const;

  const tabItems: { key: DistDrawerTab; label: string }[] = [
    { key: "inventario",   label: "Inventario" },
    { key: "necesidades",  label: "Necesidades" },
    { key: "derrotero",    label: "Derrotero" },
    { key: "inteligencia", label: "Inteligencia" },
  ];

  return (
    <OperationalSideDrawer
      open
      onClose={onClose}
      title={storeCard.store.name}
      subtitle={`${storeCard.totalReferences} refs · ${storeCard.totalUnits} uds · Cobertura ${storeCard.coveragePercent >= 0 ? `${storeCard.coveragePercent}%` : "\u2014"}`}
      severity={severity}
      statusLabel={DIST_HEALTH_LABEL[storeCard.healthStatus]}
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
          {/* LINE NAVIGATION — 5 commercial lines */}
          <div style={{ display: "flex", gap: S[1], flexWrap: "wrap" }}>
            {([
              { key: "CASTILLITOS" as InvLine, label: "Castillitos" },
              { key: "LATIN_KIDS" as InvLine, label: "Latin Kids" },
              { key: "ACCESSORIES" as InvLine, label: "Accesorios" },
              { key: "UNCLASSIFIED" as InvLine, label: "Sin clasificar" },
              { key: "OUT_OF_STOCK" as InvLine, label: "Agotados" },
            ]).map(ln => {
              const cnt = invLineCounts.find(c => c.line === ln.key)?.count ?? 0;
              const isActive = invLine === ln.key;
              return (
                <button
                  key={ln.key}
                  onClick={() => { setInvLine(ln.key); setInvPage(1); setInvGroup(undefined); setInvSubgroup(undefined); setInvSizeClass(undefined); setInvInvState(undefined); setInvKpiFilter("ALL"); setInvSortBy("QUANTITY_ASC"); setInvExpandedRefs(new Set()); }}
                  style={{
                    fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                    padding: "3px 10px", borderRadius: R.pill, cursor: "pointer",
                    background: isActive ? C.blueDark : C.surface,
                    color: isActive ? C.white : C.inkMid,
                    border: `1px solid ${isActive ? C.blueDark : C.line}`,
                  }}
                >
                  {ln.label} ({invLineCountsLoading ? "\u2014" : cnt})
                </button>
              );
            })}
          </div>

          {/* ERROR STATE — differentiate empty vs error (OCTAVO) */}
          {invError && (
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

          {/* LINE SUMMARY — 5 clickable KPIs (KPI-ACTIONS-AND-SORTING-01) */}
          {invData?.summary && (
            <InvLineSummaryStrip
              summary={invData.summary}
              activeKpi={invKpiFilter}
              onKpiClick={(kpi) => { setInvKpiFilter(kpi); setInvPage(1); }}
              sortBy={invSortBy}
              onSortChange={(s) => { setInvSortBy(s); setInvPage(1); }}
            />
          )}

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
              {invData.availableFilters.inventoryStates.length > 1 && (
                <select
                  value={invInvState || ""}
                  onChange={e => { setInvInvState((e.target.value || undefined) as InvState | undefined); setInvPage(1); }}
                  style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], padding: "2px 6px", borderRadius: R.sm, border: `1px solid ${C.line}`, background: C.white, color: C.ink }}
                >
                  <option value="">Todos los estados</option>
                  {invData.availableFilters.inventoryStates.map(s => <option key={s} value={s}>{INV_STATE_LABEL[s] || s}</option>)}
                </select>
              )}
              {(invGroup || invSubgroup || invSizeClass || invInvState) && (
                <button onClick={() => { setInvGroup(undefined); setInvSubgroup(undefined); setInvSizeClass(undefined); setInvInvState(undefined); setInvPage(1); }} style={{
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
                    const stateColor = INV_STATE_COLOR[item.inventoryState] || { bg: C.surface, text: C.inkMid };
                    return (
                      <div key={item.referenceCode} style={{ borderBottom: `1px solid ${C.line}`, background: isExpanded ? C.surfaceAlt : "transparent" }}>
                        <div
                          style={{ display: "flex", alignItems: "center", gap: S[2], padding: `${S[2]}px`, cursor: item.variantCount > 1 ? "pointer" : "default" }}
                          onClick={() => { if (item.variantCount > 1) toggleInvRef(item.referenceCode); }}
                        >
                          <CommercialReferenceThumbnail imageUrl={item.imageUrl} reference={item.referenceCode} description={item.productName} size={32} />
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
                          <div style={{ display: "flex", gap: S[2], alignItems: "center", flexShrink: 0 }}>
                            <div style={{ textAlign: "center", minWidth: 36 }}>
                              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Tienda</div>
                              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.ink }}>{item.currentStoreQty}</div>
                            </div>
                            <div style={{ textAlign: "center", minWidth: 36 }} title={item.hasReplacement && item.replacementBrief ? "Stock de la referencia sugerida en bodega principal" : "Stock de esta referencia en bodega principal"}>
                              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Bodega ppal.</div>
                              {(() => {
                                const wqty = item.hasReplacement && item.replacementBrief && item.replacementBrief.candidateMainStock > 0
                                  ? item.replacementBrief.candidateMainStock
                                  : item.mainWarehouseQty;
                                const qualityLabel = item.hasReplacement && item.replacementBrief
                                  ? item.replacementBrief.stockQuality === "UNKNOWN" ? "Por confirmar"
                                    : item.replacementBrief.stockQuality === "PHYSICAL_ONLY" ? `${wqty}`
                                    : `${wqty} disp.`
                                  : null;
                                const qualityTitle = item.hasReplacement && item.replacementBrief
                                  ? item.replacementBrief.stockQuality === "PHYSICAL_ONLY" ? "Stock físico. No descuenta compromisos."
                                    : item.replacementBrief.stockQuality === "UNKNOWN" ? "Stock pendiente de confirmación"
                                    : "Stock operativo confirmado"
                                  : undefined;
                                if (item.hasReplacement && item.replacementBrief && qualityLabel) {
                                  return (
                                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: wqty > 0 ? C.green : C.inkFaint }} title={qualityTitle}>
                                      {wqty > 0 ? qualityLabel : "\u2014"}
                                    </div>
                                  );
                                }
                                return (
                                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: wqty > 0 ? C.green : C.inkFaint }}>
                                    {wqty > 0 ? wqty : "\u2014"}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                          <span style={{
                            fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                            padding: "2px 6px", borderRadius: R.pill, flexShrink: 0,
                            background: stateColor.bg, color: stateColor.text,
                          }}>
                            {INV_STATE_LABEL[item.inventoryState] || item.inventoryState}
                          </span>
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

                        {/* Replacement brief with stock evidence */}
                        {item.hasReplacement && item.replacementBrief && (
                          <div style={{
                            display: "flex", flexDirection: "column", gap: 2,
                            padding: `${S[1]}px ${S[2]}px ${S[1]}px ${S[2] + 32 + S[2]}px`,
                            fontFamily: T.mono, fontSize: T.sz["2xs"],
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                              <span style={{
                                padding: "1px 6px", borderRadius: R.pill,
                                background: C.blueLight, color: C.blueDark, fontWeight: T.wt.semibold,
                              }}>
                                Reemplazo disponible
                              </span>
                              <span style={{ color: C.inkMid }}>
                                {item.replacementBrief.candidateRef}
                              </span>
                              <span style={{ color: C.inkFaint }}>
                                {item.replacementBrief.ruleSource === "SAME_GROUP_AND_SUBGROUP" ? "Mismo grupo y subgrupo" : "Mismo subgrupo"}
                              </span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: S[3], color: C.inkFaint }}>
                              <span>Bodega: <strong style={{ color: C.inkMid }}>{item.replacementBrief.candidateMainStock}</strong> uds</span>
                              <span style={{ color: C.line }}>|</span>
                              <span>Sugerido: <strong style={{ color: C.blueDark }}>{item.replacementBrief.suggestedQty}</strong> uds</span>
                              <span style={{ color: C.line }}>|</span>
                              <span>Faltante: {item.replacementBrief.shortageQty} uds</span>
                              {item.replacementBrief.remainingShortageQty > 0 && (
                                <>
                                  <span style={{ color: C.line }}>|</span>
                                  <span style={{ color: C.amber }}>Pendiente: {item.replacementBrief.remainingShortageQty} uds</span>
                                </>
                              )}
                            </div>
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
                                  <span style={{ width: 50, textAlign: "right" }}>Bodega</span>
                                  <span style={{ flex: 1 }}>Estado</span>
                                </div>
                                {(invVariants[item.referenceCode] || []).map((v, vi) => (
                                  <div key={vi} style={{ display: "flex", gap: S[2], padding: `2px 0`, fontFamily: T.mono, fontSize: T.sz["2xs"], borderTop: `1px solid ${C.lineSubtle}` }}>
                                    <span style={{ width: 80, color: C.ink }}>{v.size || "\u2014"}</span>
                                    <span style={{ width: 80, color: C.ink }}>{v.color || "\u2014"}</span>
                                    <span style={{ width: 50, textAlign: "right", fontWeight: T.wt.semibold, color: C.ink }}>{v.storeQty}</span>
                                    <span style={{ width: 50, textAlign: "right", color: v.mainQty > 0 ? C.green : C.inkFaint }}>{v.mainQty > 0 ? v.mainQty : "\u2014"}</span>
                                    <span style={{ flex: 1, color: C.inkMid }}>{INV_STATE_LABEL[v.inventoryState] || v.inventoryState}</span>
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
        </div>
      )}

      {/* TAB: Necesidades — needs by line (AGENTIK-STORES-NEEDS-BY-LINE-01) */}
      {tab === "necesidades" && (
        <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
          {/* Line navigation */}
          {ndData?.lineCounts && (
            <div style={{ display: "flex", gap: S[1], flexWrap: "wrap" }}>
              {(["CASTILLITOS", "LATIN_KIDS", "ACCESSORIES", "UNCLASSIFIED"] as NdLine[]).map(line => {
                const lc = ndData.lineCounts.find(c => c.line === line);
                const count = lc?.count ?? 0;
                const active = ndLine === line;
                const label = line === "CASTILLITOS" ? "Castillitos"
                  : line === "LATIN_KIDS" ? "Latin Kids"
                  : line === "ACCESSORIES" ? "Accesorios"
                  : "Sin clasificar";
                return (
                  <button key={line} onClick={() => {
                    setNdLine(line); setNdPage(1); setNdNeedType("ALL"); setNdSizeClass("ALL");
                    setNdSearch(""); setNdSearchDebounced(""); setNdExpandedRef(null); setNdExpandedVariantKey(null);
                  }} style={{
                    fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                    padding: "4px 10px", borderRadius: R.sm, cursor: "pointer",
                    border: `1px solid ${active ? C.blueDark : C.line}`,
                    background: active ? C.blueDark : "transparent",
                    color: active ? C.white : C.inkMid,
                  }}>
                    {label} ({count})
                  </button>
                );
              })}
            </div>
          )}

          {/* Loading */}
          {ndLoading && !ndData && (
            <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
              {[1, 2, 3].map(n => (
                <div key={n} style={{ height: 48, background: C.surface, borderRadius: R.sm, animation: "pulse 1.5s infinite" }} />
              ))}
            </div>
          )}

          {/* Error */}
          {ndError && (
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.red, padding: `${S[4]}px 0`, textAlign: "center" }}>
              {ndError}
            </div>
          )}

          {ndData && (() => {
            const { summary, items: needItems, pagination, availableSizeClasses } = ndData;

            // Unclassified: special message
            if (ndLine === "UNCLASSIFIED" && summary.total === 0) return (
              <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint, padding: `${S[4]}px 0`, textAlign: "center" }}>
                Sin referencias sin clasificar con necesidades pendientes
              </div>
            );

            if (summary.total === 0) return (
              <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint, padding: `${S[4]}px 0`, textAlign: "center" }}>
                Sin necesidades pendientes en esta linea
              </div>
            );

            return (
              <>
                {/* KPIs */}
                <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
                  {([
                    { key: "DIRECT_REPLENISHMENT" as NdNeedType, label: "Reposicion directa", value: summary.directReplenishment, color: C.blueDark },
                    { key: "PARTIAL_DIRECT_PLUS_REPLACEMENT" as NdNeedType, label: "Parcial + reemplazo", value: summary.partialDirectPlusReplacement ?? 0, color: "#6366f1" },
                    { key: "REPLACEMENT" as NdNeedType, label: "Reemplazos", value: summary.replacement, color: C.blue },
                    { key: "NO_ALTERNATIVE" as NdNeedType, label: "Sin alternativa", value: summary.noAlternative, color: C.red },
                    { key: "CLASSIFICATION_INCOMPLETE" as NdNeedType, label: "Clasificacion incompleta", value: summary.classificationIncomplete ?? 0, color: C.inkFaint },
                  ]).map(kpi => {
                    const active = ndNeedType === kpi.key;
                    return (
                      <button key={kpi.key} onClick={() => {
                        setNdNeedType(active ? "ALL" : kpi.key); setNdPage(1);
                      }} style={{
                        ...panel, padding: S[3], display: "flex", flexDirection: "column", gap: S[1],
                        cursor: "pointer", border: active ? `2px solid ${kpi.color}` : `1px solid ${C.line}`,
                        background: active ? C.blueLight : C.white,
                      }}>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const }}>
                          {kpi.label}
                        </div>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz.xl, fontWeight: T.wt.bold, color: kpi.color }}>
                          {kpi.value}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Accessories: size class filter */}
                {ndLine === "ACCESSORIES" && availableSizeClasses.length > 0 && (
                  <div style={{ display: "flex", gap: S[1], flexWrap: "wrap" }}>
                    {(["ALL", "SMALL", "MEDIUM", "LARGE", "UNCLASSIFIED"] as NdSizeClass[]).map(sc => {
                      const label = sc === "ALL" ? "Todos" : sc === "SMALL" ? "Pequenos" : sc === "MEDIUM" ? "Medianos" : sc === "LARGE" ? "Grandes" : "Sin tamano";
                      const active = ndSizeClass === sc;
                      return (
                        <button key={sc} onClick={() => { setNdSizeClass(sc); setNdPage(1); }} style={{
                          fontFamily: T.mono, fontSize: T.sz["2xs"], padding: "3px 8px", borderRadius: R.sm,
                          border: `1px solid ${active ? C.blueDark : C.line}`,
                          background: active ? C.blueDark : "transparent",
                          color: active ? C.white : C.inkMid, cursor: "pointer",
                        }}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Search + Sort */}
                <div style={{ display: "flex", gap: S[2], alignItems: "center" }}>
                  <input
                    type="text"
                    placeholder="Buscar referencia, descripcion, grupo..."
                    value={ndSearch}
                    onChange={e => setNdSearch(e.target.value)}
                    style={{
                      flex: 1, fontFamily: T.mono, fontSize: T.sz["2xs"], padding: "4px 8px",
                      border: `1px solid ${C.line}`, borderRadius: R.sm, background: C.white, color: C.ink,
                      outline: "none",
                    }}
                  />
                  <select
                    value={ndSortBy}
                    onChange={e => { setNdSortBy(e.target.value as NdSortBy); setNdPage(1); }}
                    style={{
                      fontFamily: T.mono, fontSize: T.sz["2xs"], padding: "4px 6px",
                      border: `1px solid ${C.line}`, borderRadius: R.sm, background: C.white, color: C.ink,
                    }}
                  >
                    <option value="SHORTAGE_DESC">Mayor faltante</option>
                    <option value="SHORTAGE_ASC">Menor faltante</option>
                    <option value="MAIN_STOCK_DESC">Mayor stock bodega</option>
                    <option value="REFERENCE_ASC">Referencia A-Z</option>
                    <option value="REFERENCE_DESC">Referencia Z-A</option>
                  </select>
                </div>

                {/* Loading overlay */}
                {ndLoading && (
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textAlign: "center", padding: S[1] }}>
                    Cargando...
                  </div>
                )}

                {/* Need items list */}
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {needItems.map((item, idx) => {
                    const needColor = item.needType === "DIRECT_REPLENISHMENT"
                      ? { bg: `${C.blueDark}18`, text: C.blueDark }
                      : item.needType === "PARTIAL_DIRECT_PLUS_REPLACEMENT"
                        ? { bg: "#6366f118", text: "#6366f1" }
                        : item.needType === "REPLACEMENT"
                          ? { bg: `${C.blue}18`, text: C.blue }
                          : item.needType === "CLASSIFICATION_INCOMPLETE"
                            ? { bg: `${C.inkFaint}18`, text: C.inkFaint }
                            : { bg: `${C.red}18`, text: C.red };
                    const hasCandidates = (item.needType === "REPLACEMENT" || item.needType === "PARTIAL_DIRECT_PLUS_REPLACEMENT") && item.candidates.length > 0;
                    const isExpanded = ndExpandedRef === `${item.referenceCode}|${idx}`;
                    const candidates = hasCandidates ? item.candidates.slice(0, 5) : [];

                    // Sin alternativa explanation
                    const noAltReason = item.needType === "NO_ALTERNATIVE" ? ((): string => {
                      if (item.rule36BlockedCount > 0) return `${item.rule36BlockedCount} candidato${item.rule36BlockedCount > 1 ? "s" : ""} excluido${item.rule36BlockedCount > 1 ? "s" : ""} por regla de concentracion`;
                      if (!item.group || item.group === "SIN_GRUPO_SAG") return "Falta clasificacion de grupo";
                      if (!item.subgroup || item.subgroup === "SIN_SUBGRUPO_SAG") return "Falta clasificacion de subgrupo";
                      return "No se encontraron referencias compatibles con stock disponible";
                    })() : null;

                    // Unclassified: special message
                    const isUnclassified = ndLine === "UNCLASSIFIED";

                    return (
                      <div key={idx} style={{ borderBottom: `1px solid ${C.line}`, padding: `${S[2]}px` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                          <CommercialReferenceThumbnail imageUrl={item.imageUrl} reference={item.referenceCode} description={item.productName} size={28} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink }}>{item.referenceCode}</span>
                            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {item.productName}
                            </div>
                            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 1 }}>
                              {item.group !== "SIN_GRUPO_SAG" ? item.group : "\u2014"} / {item.subgroup !== "SIN_SUBGRUPO_SAG" ? item.subgroup : "\u2014"}
                              {ndLine === "ACCESSORIES" && item.sizeClass && <span> / {item.sizeClass}</span>}
                            </div>
                          </div>
                          <div style={{ textAlign: "center", minWidth: 32 }}>
                            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Tienda</div>
                            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.ink }}>{item.currentUnits}</div>
                          </div>
                          <div style={{ textAlign: "center", minWidth: 32 }}>
                            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Min</div>
                            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>{item.minUnits}</div>
                          </div>
                          <div style={{ textAlign: "center", minWidth: 32 }}>
                            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Faltante</div>
                            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.red }}>{item.shortageQty}</div>
                          </div>
                          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, padding: "2px 6px", borderRadius: R.pill, background: needColor.bg, color: needColor.text }}>
                            {item.needTypeLabel}
                          </span>
                        </div>

                        {/* Action reason */}
                        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, paddingLeft: 28 + S[2], marginTop: 2 }}>
                          {item.actionReason}
                        </div>

                        {/* Unclassified warning */}
                        {isUnclassified && (
                          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amber, paddingLeft: 28 + S[2], marginTop: 2 }}>
                            Requiere clasificacion antes de sugerir movimiento.
                          </div>
                        )}

                        {/* Sin alternativa explanation */}
                        {item.needType === "NO_ALTERNATIVE" && noAltReason && !isUnclassified && (
                          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red, paddingLeft: 28 + S[2], marginTop: 2 }}>
                            {noAltReason}
                          </div>
                        )}

                        {/* Clasificacion incompleta explanation */}
                        {item.needType === "CLASSIFICATION_INCOMPLETE" && (
                          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, paddingLeft: 28 + S[2], marginTop: 2 }}>
                            Campos de clasificacion faltantes — no se puede buscar reemplazo compatible.
                          </div>
                        )}

                        {/* Reposicion directa detail */}
                        {item.needType === "DIRECT_REPLENISHMENT" && (
                          <div style={{ paddingLeft: 28 + S[2], marginTop: S[1], fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                            <div style={{ display: "flex", gap: S[3] }}>
                              <span>Bodega ppal: <strong style={{ color: C.green }}>{item.mainWarehouseAvailable}</strong> uds</span>
                              <span>Sugerido: <strong style={{ color: C.blueDark }}>{item.suggestedReplenishment}</strong> uds</span>
                            </div>
                          </div>
                        )}

                        {/* Variant allocation for SURTIR */}
                        {item.needType === "DIRECT_REPLENISHMENT" && item.variantAllocation && item.variantAllocation.allocations.length > 0 && (
                          <VariantAllocationTable allocation={item.variantAllocation} paddingLeft={28 + S[2]} />
                        )}

                        {/* PARTIAL_DIRECT_PLUS_REPLACEMENT detail (CASCADE-FIX-01) */}
                        {item.needType === "PARTIAL_DIRECT_PLUS_REPLACEMENT" && item.resolution && (
                          <div style={{ paddingLeft: 28 + S[2], marginTop: S[1], fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                            <div style={{ display: "flex", gap: S[3], flexWrap: "wrap" }}>
                              <span>Misma ref: <strong style={{ color: C.blueDark }}>{item.resolution.sameRefCoverageQty}</strong> uds</span>
                              <span>Reemplazos: <strong style={{ color: "#6366f1" }}>{item.resolution.replacementCoverageQty}</strong> uds</span>
                              <span>Cobertura: <strong style={{ color: item.resolution.coverageStatus === "FULLY_COVERED" ? C.green : C.amber }}>{item.resolution.coveragePercent}%</strong></span>
                              {item.resolution.remainingShortageQty > 0 && (
                                <span>Faltante: <strong style={{ color: C.red }}>{item.resolution.remainingShortageQty}</strong> uds</span>
                              )}
                            </div>
                          </div>
                        )}
                        {item.needType === "PARTIAL_DIRECT_PLUS_REPLACEMENT" && item.variantAllocation && item.variantAllocation.allocations.length > 0 && (
                          <VariantAllocationTable allocation={item.variantAllocation} paddingLeft={28 + S[2]} />
                        )}

                        {/* Ver reemplazos button */}
                        {hasCandidates && (
                          <div style={{ paddingLeft: 28 + S[2], marginTop: S[1] }}>
                            <button
                              onClick={() => { setNdExpandedRef(isExpanded ? null : `${item.referenceCode}|${idx}`); setNdExpandedVariantKey(null); }}
                              style={{
                                fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                                padding: "2px 8px", borderRadius: R.sm,
                                border: `1px solid ${C.blueDark}`, background: isExpanded ? C.blueDark : "transparent",
                                color: isExpanded ? C.white : C.blueDark, cursor: "pointer",
                              }}
                            >
                              {isExpanded ? "Ocultar reemplazos" : `Ver reemplazos (${candidates.length})`}
                            </button>
                          </div>
                        )}

                        {/* Expanded candidate cards */}
                        {isExpanded && candidates.length > 0 && (
                          <div style={{ paddingLeft: 28 + S[2], marginTop: S[2], display: "flex", flexDirection: "column", gap: S[2] }}>
                            {candidates.map((c, ci) => {
                              const isRecommended = ci === 0 && c.mainWarehouseAvailableQty > 0 && c.suggestedQty > 0 && c.dataQuality === "CONFIRMED";
                              const coveredSoFar = candidates.slice(0, ci + 1).reduce((s, x) => s + x.suggestedQty, 0);
                              const shortage = item.replacementShortageQty;
                              const remainingAfter = Math.max(0, shortage - coveredSoFar);

                              // Variant data
                              const allVariants: InvReplacementVariant[] = c.replacementVariants ?? [];
                              const variantExpandKey = `${item.referenceCode}|${ci}`;
                              const isVariantExpanded = ndExpandedVariantKey === variantExpandKey;
                              const INITIAL_VARIANT_LIMIT = 8;
                              const visibleVariants = isVariantExpanded ? allVariants : allVariants.slice(0, INITIAL_VARIANT_LIMIT);
                              const hasMoreVariants = allVariants.length > INITIAL_VARIANT_LIMIT;
                              const totalVarUnits = c.totalVariantUnits ?? allVariants.reduce((s, v) => s + v.mainWarehouseQty, 0);
                              const variantCoverage = totalVarUnits >= c.suggestedQty ? "full" : "partial";

                              return (
                                <div key={ci} style={{
                                  display: "flex", flexDirection: "column", padding: S[2],
                                  background: isRecommended ? C.blueLight : C.surface,
                                  borderRadius: R.sm,
                                  border: `1px solid ${isRecommended ? C.blueDark : C.line}`,
                                }}>
                                  <div style={{ display: "flex", gap: S[2] }}>
                                    <CommercialReferenceThumbnail imageUrl={c.imageUrl} reference={c.referenceCode} description={c.description} size={36} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                                        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink }}>{c.referenceCode}</span>
                                        {isRecommended && (
                                          <span style={{
                                            fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                                            padding: "1px 6px", borderRadius: R.pill, background: C.blueDark, color: C.white,
                                          }}>
                                            Recomendado
                                          </span>
                                        )}
                                      </div>
                                      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {c.description}
                                      </div>
                                      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, marginTop: 2 }}>
                                        {c.group} / {c.subgroup}
                                      </div>
                                      <div style={{ display: "flex", gap: S[3], fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 2 }}>
                                        <span>Bodega ppal: <strong style={{ color: C.green }}>{c.mainWarehouseAvailableQty}</strong> uds</span>
                                        <span>Sugerido: <strong style={{ color: C.blueDark }}>{c.suggestedQty}</strong> uds</span>
                                      </div>
                                      <div style={{ display: "flex", gap: S[3], fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 1 }}>
                                        <span>Cubre: {c.suggestedQty} de {shortage}</span>
                                        {remainingAfter > 0 && (
                                          <span style={{ color: C.amber }}>Pendiente: {remainingAfter} uds</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Variant table */}
                                  {allVariants.length > 0 && (
                                    <div style={{ marginTop: S[2] }}>
                                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: S[1] }}>
                                        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.inkMid }}>
                                          Variantes disponibles
                                        </span>
                                        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: variantCoverage === "full" ? C.green : C.amber }}>
                                          {variantCoverage === "full" ? `${totalVarUnits} uds disponibles` : `${totalVarUnits} de ${c.suggestedQty} uds \u2014 cobertura parcial`}
                                        </span>
                                      </div>
                                      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: T.mono, fontSize: T.sz["2xs"] }}>
                                        <thead>
                                          <tr style={{ borderBottom: `1px solid ${C.line}` }}>
                                            <th style={{ textAlign: "left", padding: "2px 4px", color: C.inkMid, fontWeight: T.wt.semibold }}>Talla</th>
                                            <th style={{ textAlign: "left", padding: "2px 4px", color: C.inkMid, fontWeight: T.wt.semibold }}>Color</th>
                                            <th style={{ textAlign: "right", padding: "2px 4px", color: C.inkMid, fontWeight: T.wt.semibold }}>Bodega principal</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {visibleVariants.map((v, vi) => {
                                            const qtyLabel = v.stockQuality === "PHYSICAL_ONLY"
                                              ? `${v.mainWarehouseQty} uds f\u00edsicas`
                                              : v.stockQuality === "UNKNOWN"
                                                ? "Por confirmar"
                                                : `${v.mainWarehouseQty} ud${v.mainWarehouseQty !== 1 ? "s" : ""} disponible${v.mainWarehouseQty !== 1 ? "s" : ""}`;
                                            return (
                                              <tr key={vi} style={{ borderBottom: `1px solid ${C.line}` }}
                                                title={v.stockQuality === "PHYSICAL_ONLY" ? "No descuenta compromisos." : undefined}>
                                                <td style={{ padding: "3px 4px", color: C.ink }}>{v.size ?? "\u2014"}</td>
                                                <td style={{ padding: "3px 4px", color: C.ink }}>{v.color ?? "\u2014"}</td>
                                                <td style={{ padding: "3px 4px", textAlign: "right", color: v.stockQuality === "UNKNOWN" ? C.inkFaint : C.green, fontWeight: T.wt.semibold }}>
                                                  {qtyLabel}
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                      {hasMoreVariants && !isVariantExpanded && (
                                        <button onClick={() => setNdExpandedVariantKey(variantExpandKey)} style={{
                                          fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.blueDark,
                                          background: "transparent", border: "none", cursor: "pointer", padding: "4px 0", marginTop: 2,
                                        }}>
                                          Ver todas las variantes ({allVariants.length})
                                        </button>
                                      )}
                                      {hasMoreVariants && isVariantExpanded && (
                                        <button onClick={() => setNdExpandedVariantKey(null)} style={{
                                          fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.blueDark,
                                          background: "transparent", border: "none", cursor: "pointer", padding: "4px 0", marginTop: 2,
                                        }}>
                                          Ocultar variantes
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            {item.hasMoreCandidates && (
                              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textAlign: "center", padding: S[1] }}>
                                Mostrando los {candidates.length} mejores de {item.totalCandidatesFound} candidatos
                              </div>
                            )}
                            {item.rule36BlockedCount > 0 && (
                              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, fontStyle: "italic", padding: S[1] }}>
                                {item.rule36BlockedCount} candidato{item.rule36BlockedCount > 1 ? "s" : ""} excluido{item.rule36BlockedCount > 1 ? "s" : ""} por regla de concentracion
                              </div>
                            )}
                            {/* Variant allocation for replacement */}
                            {item.variantAllocation && item.variantAllocation.allocations.length > 0 && (
                              <VariantAllocationTable allocation={item.variantAllocation} paddingLeft={0} />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Pagination */}
                {pagination.totalPages > 1 && (
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: S[2], fontFamily: T.mono, fontSize: T.sz["2xs"] }}>
                    <button
                      disabled={pagination.page <= 1}
                      onClick={() => setNdPage(p => Math.max(1, p - 1))}
                      style={{
                        padding: "3px 8px", borderRadius: R.sm, border: `1px solid ${C.line}`,
                        background: C.white, color: pagination.page <= 1 ? C.inkFaint : C.ink, cursor: pagination.page <= 1 ? "default" : "pointer",
                      }}
                    >
                      Anterior
                    </button>
                    <span style={{ color: C.inkMid }}>
                      {pagination.page} / {pagination.totalPages} ({pagination.total} total)
                    </span>
                    <button
                      disabled={pagination.page >= pagination.totalPages}
                      onClick={() => setNdPage(p => Math.min(pagination.totalPages, p + 1))}
                      style={{
                        padding: "3px 8px", borderRadius: R.sm, border: `1px solid ${C.line}`,
                        background: C.white, color: pagination.page >= pagination.totalPages ? C.inkFaint : C.ink,
                        cursor: pagination.page >= pagination.totalPages ? "default" : "pointer",
                      }}
                    >
                      Siguiente
                    </button>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* TAB: Derrotero — supply rules editor (AGENTIK-STORES-SUPPLY-RULES-RESET-01) */}
      {tab === "derrotero" && (
        <StoreSupplyRulesTab orgSlug={orgSlug} storeId={storeCard.store.id} storeName={storeCard.store.name} />
      )}

      {/* TAB: Inteligencia — store health summary */}
      {tab === "inteligencia" && (
        <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
          {detailLoading && !detail && (
            <div style={{ height: 120, background: C.surface, borderRadius: R.sm, animation: "pulse 1.5s infinite" }} />
          )}
          {detail && (
            <>
              <div style={{ display: "flex", gap: S[4], flexWrap: "wrap" }}>
                <MiniStat label="Referencias" value={String(detail.kpis.totalReferences)} color={C.ink} />
                <MiniStat label="Unidades" value={String(detail.kpis.totalUnits)} color={C.ink} />
                <MiniStat label="Con regla" value={String(detail.kpis.withRules)} color={C.ink} />
                <MiniStat label="Sin regla" value={String(detail.kpis.withoutRules)} color={detail.kpis.withoutRules > 0 ? C.amber : C.ink} />
                <MiniStat label="Cobertura" value={detail.kpis.coveragePercent >= 0 ? `${detail.kpis.coveragePercent}%` : "\u2014"} color={C.ink} />
              </div>
              {/* Action distribution */}
              <div style={{ ...panel, padding: S[3] }}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[2] }}>
                  Distribucion de acciones
                </div>
                {Object.entries(actionCounts).map(([action, count]) => (
                  <div key={action} style={{ display: "flex", justifyContent: "space-between", padding: `${S[1]}px 0`, borderBottom: `1px solid ${C.lineSubtle}` }}>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
                      {DIST_ACTION_LABEL[action as StoreDistributionAction] ?? action}
                    </span>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.ink }}>{count}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                Resumen de inteligencia basado en la distribucion canonica. Configure reglas en la pestana Derrotero.
              </div>
            </>
          )}
          {!detailLoading && !detail && (
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint, padding: `${S[4]}px 0`, textAlign: "center" }}>
              Cargando datos de inteligencia...
            </div>
          )}
        </div>
      )}
    </OperationalSideDrawer>
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
