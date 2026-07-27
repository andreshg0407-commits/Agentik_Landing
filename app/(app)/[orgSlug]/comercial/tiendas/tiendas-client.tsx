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
import type {
  StoreDiscountResponse,
  DiscountTier,
} from "@/lib/comercial/tiendas/store-discount-types";
import {
  DISCOUNT_TIER_LABEL,
  DISCOUNT_TIER_COLOR,
} from "@/lib/comercial/tiendas/store-discount-types";

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
type InvKpiFilter = "ALL" | "BELOW_MINIMUM" | "HEALTHY";

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
    ? (distribution.stores.some(c => c.coveragePercent >= 0 && c.coveragePercent < 70) ? "critical" as const
      : distribution.stores.some(c => c.shortageUnits > 0 || c.excessItems > 0) ? "warning" as const
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
          {distribution && (() => {
            const requierenAtencion = distribution.stores.filter(c =>
              c.coveragePercent < 90 || c.criticalNeeds > 0 || c.excessItems > 0
            ).length;
            const totalShortageUnits = distribution.stores.reduce((sum, c) => sum + c.shortageUnits, 0);
            const coberturaPromedio = distribution.stores.length > 0
              ? Math.round(distribution.stores.reduce((sum, c) => sum + (c.coveragePercent >= 0 ? c.coveragePercent : 0), 0) / distribution.stores.length)
              : 0;

            return (
            <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>
              {/* KPI strip */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: S[3] }}>
                <DistKpiCard label="Tiendas activas" value={String(distribution.kpis.tiendasActivas)} color={C.blueDark} />
                <DistKpiCard label="Requieren atencion" value={String(requierenAtencion)} color={requierenAtencion > 0 ? C.red : C.green} />
                <DistKpiCard label="Unidades por surtir" value={totalShortageUnits > 0 ? `${totalShortageUnits.toLocaleString()} uds` : "\u2014"} color={totalShortageUnits > 0 ? C.blueDark : C.green} />
                <DistKpiCard label="Cobertura promedio" value={`${coberturaPromedio}%`} color={coberturaPromedio >= 90 ? C.green : coberturaPromedio >= 70 ? C.amber : C.red} />
              </div>

              {/* 4 operational store cards — fixed 2×2 grid */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
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

  // CUARTO — coverage-based visual state
  const covColor = card.coveragePercent >= 90 ? C.green
    : card.coveragePercent >= 70 ? C.amber : C.red;

  // QUINTO — automatic action recommendation
  const actionText = card.shortageUnits > 0 && card.excessItems > 0
    ? `Surtir ${card.shortageUnits.toLocaleString()} uds · Redistribuir ${card.excessItems} refs`
    : card.shortageUnits > 0
    ? `Surtir ${card.shortageUnits.toLocaleString()} unidades`
    : card.excessItems > 0
    ? `Redistribuir ${card.excessItems} referencias`
    : "Sin acciones pendientes";
  const actionColor = card.shortageUnits > 0 ? C.red : card.excessItems > 0 ? C.amber : C.green;

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
        {/* Coverage — visual principal */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>Cobertura</span>
          <span style={{
            fontFamily: T.mono, fontSize: T.sz.xl, fontWeight: T.wt.bold, color: covColor,
          }}>
            {card.coveragePercent >= 0 ? `${card.coveragePercent}%` : "\u2014"}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2] }}>
          <MetricBox label="Referencias" value={card.totalReferences} color={C.ink} suffix=" refs" />
          <MetricBox label="Unidades" value={card.totalUnits} color={C.ink} suffix=" uds" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2] }}>
          <MetricBox label="Faltantes" value={card.shortageUnits > 0 ? card.shortageUnits : null} color={C.red} suffix=" uds" />
          <MetricBox label="Excesos" value={card.excessItems > 0 ? card.excessItems : null} color={C.amber} suffix=" refs" />
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
  critica:          "Prioridad",
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

// ── Rule provenance labels (CERTIFICATION-01) ─────────────────────────────
const RULE_SOURCE_LABEL: Record<string, string> = {
  TENANT_DEFAULT:  "Heredada",
  STORE_OVERRIDE:  "Personalizada",
  SPECIAL_PRODUCT: "Regla especial",
  RULE_36:         "Regla 36",
  FALLBACK:        "Sin regla",
};

function formatRuleChip(rule: EffectiveRuleClient | undefined): string {
  if (!rule) return "";
  if (rule.source === "RULE_36") return `R36 (${rule.minUnits ?? 0})`;
  if (rule.source === "SPECIAL_PRODUCT") return `Especial (${rule.targetUnits ?? 0})`;
  if (rule.source === "FALLBACK") return "Sin regla";
  if (rule.minUnits != null && rule.maxUnits != null) {
    return `${rule.minUnits} / ${rule.idealUnits ?? rule.targetUnits ?? "—"} / ${rule.maxUnits}`;
  }
  if (rule.targetUnits != null) return `Obj: ${rule.targetUnits}`;
  return "";
}

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
      { key: "HEALTHY",         label: "Saludables",     value: Number(d.saludables ?? 0),         color: C.green },
    ];
  } else if (summary.type === "accessory") {
    kpis = [
      { key: "ALL",             label: "Referencias",   value: Number(d.referenciasActivas ?? 0), color: C.ink },
      { key: "ALL",             label: "Unidades",      value: Number(d.unidades ?? 0),           color: C.ink },
      { key: "BELOW_MINIMUM",   label: "Bajo objetivo", value: Number(d.bajoObjetivo ?? 0),       color: C.red },
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

type DistDrawerTab = "inventario" | "necesidades" | "cobertura" | "descuentos" | "derrotero" | "inteligencia";

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
  // expandedNeedRef / expandedVariantKey removed — replaced by ndExpandedRef (WAREHOUSE-FIRST-01)

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

  // ── Warehouse-first needs state (AGENTIK-STORES-NEEDS-WAREHOUSE-FIRST-RESOLUTION-01) ──
  type WHFLineUI = "CASTILLITOS" | "LATIN_KIDS" | "ACCESSORIES" | "UNCLASSIFIED";
  type WHFSortByUI = "AVAILABLE_DESC" | "NEEDS_COUNT_DESC" | "URGENCY_DESC" | "REFERENCE_ASC";
  type WHFRule36StatusUI = "ELEGIBLE_4_TIENDAS" | "SOLO_CENTRO_CALDAS" | "BLOQUEADA";
  type WHFResolutionTypeUI = "REPOSICION" | "REEMPLAZO";
  type WHFMatchTypeUI = "MISMA_REFERENCIA" | "MISMO_GRUPO_Y_SUBGRUPO" | "MISMO_SUBGRUPO" | "MISMO_SIZE_CLASS" | "MISMO_SUBGRUPO_Y_SIZE_CLASS";

  interface WHFStoreNeedUI {
    storeReference: string;
    description: string;
    imageUrl: string | null;
    canonicalLine: string;
    group: string;
    subgroup: string;
    sizeClass: string | null;
    storeQty: number;
    minUnits: number;
    idealUnits: number;
    maxUnits: number;
    shortageQty: number;
    matchType: WHFMatchTypeUI;
    resolutionType: WHFResolutionTypeUI;
    suggestedQty: number;
    coveragePossible: number;
    effectiveRule: EffectiveRuleClient;
    ruleSource: string;
  }

  interface WHFWarehouseVariantUI {
    size: string | null;
    color: string | null;
    availableQty: number;
  }

  interface WHFWarehouseRefUI {
    warehouseReference: string;
    description: string;
    imageUrl: string | null;
    canonicalLine: string;
    group: string;
    subgroup: string;
    sizeClass: string | null;
    warehouseId: string;
    commercialAvailableQty: number;
    totalSuggestedQty: number;
    needsResolvable: number;
    rule36Status: WHFRule36StatusUI;
    resolutionType: WHFResolutionTypeUI;
    positiveVariants: WHFWarehouseVariantUI[];
    snapshotAt: string;
    storeNeeds: WHFStoreNeedUI[];
  }

  interface WHFNoSolutionItemUI {
    storeReference: string;
    description: string;
    imageUrl: string | null;
    canonicalLine: string;
    group: string;
    subgroup: string;
    sizeClass: string | null;
    storeQty: number;
    minUnits: number;
    idealUnits: number;
    shortageQty: number;
    reason: string;
    effectiveRule: EffectiveRuleClient;
  }

  interface WHFSummaryUI {
    availableForSupply: number;
    totalSuggestedUnits: number;
    sameRefReplenishments: number;
    replacements: number;
    noSolution: number;
  }

  interface WHFResponseUI {
    line: string;
    summary: WHFSummaryUI;
    items: WHFWarehouseRefUI[];
    noSolutionItems: WHFNoSolutionItemUI[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
    lineCounts: { line: WHFLineUI; count: number }[];
    dataFreshness: string | null;
  }

  const [ndLine, setNdLine] = useState<WHFLineUI>("CASTILLITOS");
  const [ndData, setNdData] = useState<WHFResponseUI | null>(null);
  const [ndLoading, setNdLoading] = useState(false);
  const [ndError, setNdError] = useState<string | null>(null);
  const [ndSortBy, setNdSortBy] = useState<WHFSortByUI>("URGENCY_DESC");
  const [ndSearch, setNdSearch] = useState("");
  const [ndSearchDebounced, setNdSearchDebounced] = useState("");
  const [ndPage, setNdPage] = useState(1);
  const [ndExpandedRef, setNdExpandedRef] = useState<string | null>(null);
  const [ndShowNoSolution, setNdShowNoSolution] = useState(false);
  const [ndInitialLineSet, setNdInitialLineSet] = useState(false);

  // ── Coverage state (AGENTIK-STORES-COVERAGE-TAB-01 — Two-Dimension) ────
  type CoverageLineName = "CASTILLITOS" | "LATIN_KIDS" | "ACCESORIOS";
  type StructuralCoverageStatus = "CUBIERTA" | "SIN_COBERTURA";
  type QuantitativeHealthStatus = "SALUDABLE" | "CON_REFERENCIAS_BAJO_MINIMO" | "SIN_REFERENCIAS";
  type ReferenceHealthState = "BAJO_MINIMO" | "SALUDABLE" | "SOBRE_MAXIMO";
  type CoverageCandidateType = "REPOSICION_MISMA_REFERENCIA" | "COMPLEMENTO_REFERENCIA_COMPATIBLE" | "REFERENCIA_NUEVA_COMPATIBLE";
  type CoverageStatusFilter = "ALL" | "SIN_COBERTURA" | "CON_REFERENCIAS_BAJO_MINIMO" | "SALUDABLE";

  interface SolutionSummary {
    sameReferenceCandidates: number;
    compatibleReferenceCandidates: number;
    eligibleCandidates: number;
    blockedCandidates: number;
    totalWarehouseUnits: number;
  }

  interface CoverageStructure {
    structureKey: string;
    label: string;
    groupLabel: string | null;
    subgroupLabel: string;
    line: CoverageLineName;
    structuralCoverageStatus: StructuralCoverageStatus;
    activeReferenceCount: number;
    totalStoreUnits: number;
    healthyReferenceCount: number;
    belowMinimumReferenceCount: number;
    overMaximumReferenceCount: number;
    minimumUnits: number;
    targetUnits: number;
    maximumUnits: number | null;
    totalShortageToTarget: number;
    totalShortageToMinimum: number;
    quantitativeHealthStatus: QuantitativeHealthStatus;
    priority: number;
    solutionSummary: SolutionSummary | null;
  }

  interface CoverageLineSummary {
    line: CoverageLineName;
    expected: number;
    covered: number;
    withBelowMinimum: number;
    gaps: number;
    coveragePercent: number;
    healthPercent: number;
  }

  interface CoverageResponse {
    storeId: string;
    storeName: string;
    totalExpected: number;
    totalCovered: number;
    totalWithBelowMinimum: number;
    totalGaps: number;
    overallCoveragePercent: number;
    overallHealthPercent: number;
    lineSummaries: CoverageLineSummary[];
    structures: CoverageStructure[];
    computedAt: string;
  }

  /** Derive display state from two-dimension model */
  const covDisplayState = (s: CoverageStructure): "SIN_COBERTURA" | "CON_REFERENCIAS_BAJO_MINIMO" | "SALUDABLE" => {
    if (s.structuralCoverageStatus === "SIN_COBERTURA") return "SIN_COBERTURA";
    if (s.quantitativeHealthStatus === "CON_REFERENCIAS_BAJO_MINIMO") return "CON_REFERENCIAS_BAJO_MINIMO";
    return "SALUDABLE";
  };

  const [covData, setCovData] = useState<CoverageResponse | null>(null);
  const [covLoading, setCovLoading] = useState(false);
  const [covLoaded, setCovLoaded] = useState(false);
  const [covLine, setCovLine] = useState<CoverageLineName | "ALL">("ALL");
  const [covStatusFilter, setCovStatusFilter] = useState<CoverageStatusFilter>("ALL");

  // Candidate expansion state
  type CoverageCandidateRule36 = "ELEGIBLE_CUATRO_TIENDAS" | "BLOQUEADA";
  interface CoverageCandidateVariant {
    size: string;
    color: string;
    qty: number;
  }
  interface CoverageCandidate {
    referenceCode: string;
    productName: string;
    imageUrl: string | null;
    mainWarehouseStock: number;
    variantCount: number;
    variants: CoverageCandidateVariant[];
    alreadyPresentInStore: boolean;
    storeQty: number;
    rule36Status: CoverageCandidateRule36;
    candidateType: CoverageCandidateType;
  }
  interface CoverageActiveRef {
    referenceCode: string;
    productName: string;
    imageUrl: string | null;
    storeQty: number;
    activeVariants: number;
    minimumUnits: number;
    targetUnits: number;
    maximumUnits: number;
    referenceShortageToTarget: number;
    referenceState: ReferenceHealthState;
  }
  interface CoverageCandidatesResult {
    structureKey: string;
    line: CoverageLineName;
    label: string;
    structuralCoverageStatus: StructuralCoverageStatus;
    quantitativeHealthStatus: QuantitativeHealthStatus;
    totalCompatible: number;
    activeStoreRefs: CoverageActiveRef[];
    eligible: CoverageCandidate[];
    blocked: CoverageCandidate[];
    solutionSummary: SolutionSummary;
    computedAt: string;
  }
  const [covExpandedKey, setCovExpandedKey] = useState<string | null>(null);
  const [covCandidates, setCovCandidates] = useState<Record<string, CoverageCandidatesResult>>({});
  const [covCandidateLoading, setCovCandidateLoading] = useState<string | null>(null);

  // ── Discount state (AGENTIK-STORES-DISCOUNTS-TAB-01) ───────────────────
  const [discData, setDiscData] = useState<StoreDiscountResponse | null>(null);
  const [discLoading, setDiscLoading] = useState(false);
  const [discLoaded, setDiscLoaded] = useState(false);
  const [discTierFilter, setDiscTierFilter] = useState<DiscountTier | "ALL">("ALL");
  const [discSearch, setDiscSearch] = useState("");
  const [discSearchDebounced, setDiscSearchDebounced] = useState("");

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

  // Lazy load coverage when tab is active
  useEffect(() => {
    if (tab !== "cobertura" || covLoaded) return;
    let cancelled = false;
    setCovLoading(true);
    tiendaApi(orgSlug, { action: "store_coverage", storeId: storeCard.store.id })
      .then((data: { coverage?: CoverageResponse }) => {
        if (cancelled) return;
        if (data.coverage) setCovData(data.coverage);
        setCovLoaded(true);
      })
      .catch(() => { if (!cancelled) setCovLoaded(true); })
      .finally(() => { if (!cancelled) setCovLoading(false); });
    return () => { cancelled = true; };
  }, [tab, storeCard.store.id, orgSlug, covLoaded]);

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
    setNdSortBy("URGENCY_DESC");
    setNdSearch("");
    setNdSearchDebounced("");
    setNdPage(1);
    setNdExpandedRef(null);
    setNdShowNoSolution(false);
    setNdInitialLineSet(false);
    // Reset coverage state
    setCovData(null);
    setCovLoaded(false);
    setCovLine("ALL");
    setCovStatusFilter("ALL");
    setCovExpandedKey(null);
    setCovCandidates({});
    setCovCandidateLoading(null);
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

  // ── Load warehouse-first needs (AGENTIK-STORES-NEEDS-WAREHOUSE-FIRST-RESOLUTION-01) ─
  useEffect(() => {
    if (tab !== "necesidades") return;
    let cancelled = false;
    setNdLoading(true);
    setNdError(null);
    setNdExpandedRef(null);
    tiendaApi(orgSlug, {
      action: "store_warehouse_first_needs",
      storeId: storeCard.store.id,
      line: ndLine,
      sortBy: ndSortBy,
      search: ndSearchDebounced || undefined,
      page: ndPage,
      pageSize: 25,
    })
      .then((data: WHFResponseUI & { error?: string; code?: string }) => {
        if (cancelled) return;
        if (data.error) {
          setNdError(data.code === "STORE_INACTIVE" ? "Tienda desactivada" : `Error: ${data.error}`);
          return;
        }
        setNdData(data);
        // Auto-select first line with needs on initial load
        if (!ndInitialLineSet && data.lineCounts) {
          setNdInitialLineSet(true);
          const preferredOrder: WHFLineUI[] = ["CASTILLITOS", "LATIN_KIDS", "ACCESSORIES", "UNCLASSIFIED"];
          const firstWithNeeds = preferredOrder.find(l => {
            const lc = data.lineCounts.find(c => c.line === l);
            return lc && lc.count > 0;
          });
          if (firstWithNeeds && firstWithNeeds !== ndLine) {
            setNdLine(firstWithNeeds);
            return;
          }
        }
      })
      .catch(() => { if (!cancelled) setNdError("Error de conexion al cargar necesidades"); })
      .finally(() => { if (!cancelled) setNdLoading(false); });
    return () => { cancelled = true; };
  }, [tab, storeCard.store.id, orgSlug, ndLine, ndSortBy, ndSearchDebounced, ndPage]);

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
                          <div style={{ textAlign: "center", minWidth: 36, flexShrink: 0 }}>
                            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Tienda</div>
                            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.ink }}>{item.currentStoreQty}</div>
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

                        {/* Rule provenance (CERTIFICATION-01) */}
                        {item.effectiveRule && item.effectiveRule.source !== "FALLBACK" && (
                          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, padding: `0 ${S[2]}px 0 ${S[2] + 32 + S[2]}px`, display: "flex", gap: S[2], alignItems: "center" }}>
                            <span style={{ color: item.effectiveRule.inherited ? C.inkFaint : C.blueDark }}>
                              {RULE_SOURCE_LABEL[item.effectiveRule.source] || item.effectiveRule.source}
                            </span>
                            <span>{formatRuleChip(item.effectiveRule)}</span>
                          </div>
                        )}

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
                                  <span style={{ flex: 1 }}>Estado</span>
                                </div>
                                {(invVariants[item.referenceCode] || []).map((v, vi) => (
                                  <div key={vi} style={{ display: "flex", gap: S[2], padding: `2px 0`, fontFamily: T.mono, fontSize: T.sz["2xs"], borderTop: `1px solid ${C.lineSubtle}` }}>
                                    <span style={{ width: 80, color: C.ink }}>{v.size || "\u2014"}</span>
                                    <span style={{ width: 80, color: C.ink }}>{v.color || "\u2014"}</span>
                                    <span style={{ width: 50, textAlign: "right", fontWeight: T.wt.semibold, color: C.ink }}>{v.storeQty}</span>
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

      {/* TAB: Necesidades — warehouse-first (AGENTIK-STORES-NEEDS-WAREHOUSE-FIRST-RESOLUTION-01) */}
      {tab === "necesidades" && (
        <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
          {/* Line navigation */}
          {ndData?.lineCounts && (
            <div style={{ display: "flex", gap: S[1], flexWrap: "wrap" }}>
              {(["CASTILLITOS", "LATIN_KIDS", "ACCESSORIES", "UNCLASSIFIED"] as WHFLineUI[]).map(line => {
                const lc = ndData.lineCounts.find(c => c.line === line);
                const count = lc?.count ?? 0;
                const active = ndLine === line;
                const label = line === "CASTILLITOS" ? "Castillitos"
                  : line === "LATIN_KIDS" ? "Latin Kids"
                  : line === "ACCESSORIES" ? "Accesorios"
                  : "Sin clasificar";
                return (
                  <button key={line} onClick={() => {
                    setNdLine(line); setNdPage(1);
                    setNdSearch(""); setNdSearchDebounced(""); setNdExpandedRef(null); setNdShowNoSolution(false);
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
            const { summary, items: whfItems, noSolutionItems, pagination } = ndData;

            if (summary.availableForSupply === 0 && summary.noSolution === 0) return (
              <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint, padding: `${S[4]}px 0`, textAlign: "center" }}>
                Sin necesidades pendientes en esta linea
              </div>
            );

            const MATCH_LABEL: Record<WHFMatchTypeUI, string> = {
              MISMA_REFERENCIA: "Misma ref",
              MISMO_GRUPO_Y_SUBGRUPO: "Grupo+Subgrupo",
              MISMO_SUBGRUPO: "Subgrupo",
              MISMO_SIZE_CLASS: "Tamano",
              MISMO_SUBGRUPO_Y_SIZE_CLASS: "Subgrupo+Tamano",
            };

            return (
              <>
                {/* KPIs — warehouse-first */}
                <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
                  {([
                    { label: "Refs con stock", value: summary.availableForSupply, color: C.blueDark },
                    { label: "Unidades sugeridas", value: summary.totalSuggestedUnits, color: C.green },
                    { label: "Reposiciones", value: summary.sameRefReplenishments, color: C.blueDark },
                    { label: "Reemplazos", value: summary.replacements, color: "#6366f1" },
                    { label: "Sin solucion", value: summary.noSolution, color: C.red },
                  ]).map(kpi => (
                    <div key={kpi.label} style={{
                      ...panel, padding: S[3], display: "flex", flexDirection: "column", gap: S[1],
                    }}>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const }}>
                        {kpi.label}
                      </div>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.xl, fontWeight: T.wt.bold, color: kpi.color }}>
                        {kpi.value}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Search + Sort */}
                <div style={{ display: "flex", gap: S[2], alignItems: "center" }}>
                  <input
                    type="text"
                    placeholder="Buscar referencia bodega, necesidad tienda, grupo..."
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
                    onChange={e => { setNdSortBy(e.target.value as WHFSortByUI); setNdPage(1); }}
                    style={{
                      fontFamily: T.mono, fontSize: T.sz["2xs"], padding: "4px 6px",
                      border: `1px solid ${C.line}`, borderRadius: R.sm, background: C.white, color: C.ink,
                    }}
                  >
                    <option value="URGENCY_DESC">Mayor urgencia</option>
                    <option value="AVAILABLE_DESC">Mayor stock bodega</option>
                    <option value="NEEDS_COUNT_DESC">Mas necesidades</option>
                    <option value="REFERENCE_ASC">Referencia A-Z</option>
                  </select>
                </div>

                {/* Loading overlay */}
                {ndLoading && (
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textAlign: "center", padding: S[1] }}>
                    Cargando...
                  </div>
                )}

                {/* Warehouse-first items */}
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {whfItems.map((whRef, idx) => {
                    const isExpanded = ndExpandedRef === whRef.warehouseReference;
                    const resColor = whRef.resolutionType === "REPOSICION"
                      ? { bg: `${C.blueDark}18`, text: C.blueDark, label: "Reposicion" }
                      : { bg: "#6366f118", text: "#6366f1", label: "Reemplazo" };
                    const rule36Label = whRef.rule36Status === "SOLO_CENTRO_CALDAS" ? "R36: Centro+Caldas" : null;

                    return (
                      <div key={idx} style={{ borderBottom: `1px solid ${C.line}` }}>
                        {/* Primary row: warehouse reference */}
                        <div
                          onClick={() => setNdExpandedRef(isExpanded ? null : whRef.warehouseReference)}
                          style={{ display: "flex", alignItems: "center", gap: S[2], padding: `${S[2]}px`, cursor: "pointer", background: isExpanded ? C.blueLight : "transparent" }}
                        >
                          <CommercialReferenceThumbnail imageUrl={whRef.imageUrl} reference={whRef.warehouseReference} description={whRef.description} size={32} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink }}>{whRef.warehouseReference}</span>
                              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, padding: "1px 6px", borderRadius: R.pill, background: resColor.bg, color: resColor.text }}>
                                {resColor.label}
                              </span>
                              {rule36Label && (
                                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], padding: "1px 5px", borderRadius: R.pill, background: `${C.amber}20`, color: C.amber }}>
                                  {rule36Label}
                                </span>
                              )}
                            </div>
                            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {whRef.description}
                            </div>
                            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 1 }}>
                              {whRef.group !== "SIN_GRUPO_SAG" ? whRef.group : "\u2014"} / {whRef.subgroup !== "SIN_SUBGRUPO_SAG" ? whRef.subgroup : "\u2014"}
                              {whRef.sizeClass && <span> / {whRef.sizeClass}</span>}
                            </div>
                          </div>
                          <div style={{ textAlign: "center", minWidth: 56 }}>
                            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Disponible</div>
                            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.green }}>{whRef.commercialAvailableQty}</div>
                          </div>
                          <div style={{ textAlign: "center", minWidth: 48 }}>
                            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Sugerido</div>
                            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.blueDark }}>{whRef.totalSuggestedQty}</div>
                          </div>
                          <div style={{ textAlign: "center", minWidth: 40 }}>
                            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Resuelve</div>
                            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.ink }}>{whRef.needsResolvable}</div>
                          </div>
                          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
                            &#9660;
                          </span>
                        </div>

                        {/* Expanded: store needs resolved by this warehouse ref */}
                        {isExpanded && (
                          <div style={{ padding: `0 ${S[2]}px ${S[2]}px ${S[2] + 32 + S[2]}px`, display: "flex", flexDirection: "column", gap: S[1] }}>
                            {/* Variant detail for warehouse ref */}
                            {whRef.positiveVariants.length > 0 && (
                              <div style={{ marginBottom: S[1] }}>
                                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.inkMid, marginBottom: 4 }}>
                                  Variantes disponibles en bodega
                                </div>
                                <div style={{ display: "flex", gap: S[1], flexWrap: "wrap" }}>
                                  {whRef.positiveVariants.slice(0, 12).map((v, vi) => (
                                    <span key={vi} style={{
                                      fontFamily: T.mono, fontSize: T.sz["2xs"], padding: "2px 6px",
                                      borderRadius: R.sm, background: C.surface, border: `1px solid ${C.line}`,
                                      color: C.ink,
                                    }}>
                                      {v.size ?? "\u2014"}/{v.color ?? "\u2014"}: <strong style={{ color: C.green }}>{v.availableQty}</strong>
                                    </span>
                                  ))}
                                  {whRef.positiveVariants.length > 12 && (
                                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, padding: "2px 4px" }}>
                                      +{whRef.positiveVariants.length - 12} mas
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Store needs children */}
                            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.inkMid }}>
                              Necesidades de tienda que resuelve ({whRef.storeNeeds.length})
                            </div>
                            {whRef.storeNeeds.map((sn, si) => {
                              const snResColor = sn.resolutionType === "REPOSICION"
                                ? { bg: `${C.blueDark}14`, text: C.blueDark }
                                : { bg: "#6366f114", text: "#6366f1" };
                              return (
                                <div key={si} style={{
                                  display: "flex", alignItems: "center", gap: S[2], padding: `${S[1]}px ${S[2]}px`,
                                  background: snResColor.bg, borderRadius: R.sm, border: `1px solid ${C.line}`,
                                }}>
                                  <CommercialReferenceThumbnail imageUrl={sn.imageUrl} reference={sn.storeReference} description={sn.description} size={24} />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: S[1] }}>
                                      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.ink }}>{sn.storeReference}</span>
                                      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], padding: "0px 4px", borderRadius: R.pill, background: snResColor.bg, color: snResColor.text, border: `1px solid ${snResColor.text}30` }}>
                                        {sn.resolutionType === "REPOSICION" ? "Misma ref" : MATCH_LABEL[sn.matchType]}
                                      </span>
                                    </div>
                                    <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {sn.description}
                                    </div>
                                  </div>
                                  <div style={{ textAlign: "center", minWidth: 36 }}>
                                    <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Tienda</div>
                                    <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold, color: C.ink }}>{sn.storeQty}</div>
                                  </div>
                                  <div style={{ textAlign: "center", minWidth: 36 }}>
                                    <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Faltante</div>
                                    <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold, color: C.red }}>{sn.shortageQty}</div>
                                  </div>
                                  <div style={{ textAlign: "center", minWidth: 44 }}>
                                    <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Sugerido</div>
                                    <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold, color: C.blueDark }}>{sn.suggestedQty}</div>
                                  </div>
                                  <div style={{ textAlign: "center", minWidth: 40 }}>
                                    <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Cobertura</div>
                                    <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: sn.coveragePossible >= 100 ? C.green : C.amber }}>
                                      {sn.coveragePossible}%
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* No-solution items */}
                {noSolutionItems.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: S[1] }}>
                    <button
                      onClick={() => setNdShowNoSolution(s => !s)}
                      style={{
                        fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                        padding: "4px 10px", borderRadius: R.sm, cursor: "pointer",
                        border: `1px solid ${C.red}40`, background: ndShowNoSolution ? `${C.red}10` : "transparent",
                        color: C.red, textAlign: "left",
                      }}
                    >
                      {ndShowNoSolution ? "Ocultar" : "Ver"} necesidades sin solucion ({noSolutionItems.length})
                    </button>
                    {ndShowNoSolution && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                        {noSolutionItems.map((ns, ni) => (
                          <div key={ni} style={{ display: "flex", alignItems: "center", gap: S[2], padding: `${S[1]}px ${S[2]}px`, borderBottom: `1px solid ${C.line}` }}>
                            <CommercialReferenceThumbnail imageUrl={ns.imageUrl} reference={ns.storeReference} description={ns.description} size={24} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.ink }}>{ns.storeReference}</span>
                              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {ns.description}
                              </div>
                            </div>
                            <div style={{ textAlign: "center", minWidth: 36 }}>
                              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Faltante</div>
                              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold, color: C.red }}>{ns.shortageQty}</div>
                            </div>
                            <div style={{ flex: 1, fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red, textAlign: "right" }}>
                              {ns.reason}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

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
                      {pagination.page} / {pagination.totalPages} ({pagination.total} refs bodega)
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

      {/* TAB: Cobertura — quantitative structural coverage (AGENTIK-STORES-COVERAGE-TAB-01) */}
      {tab === "cobertura" && (
        <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
          {covLoading && !covData && (
            <div style={{ height: 120, background: C.surface, borderRadius: R.sm, animation: "pulse 1.5s infinite" }} />
          )}
          {covData && (() => {
            // Filter by line, then by display state
            let filteredStructures = covLine === "ALL"
              ? covData.structures
              : covData.structures.filter(s => s.line === covLine);
            if (covStatusFilter !== "ALL") {
              filteredStructures = filteredStructures.filter(s => covDisplayState(s) === covStatusFilter);
            }

            const sinCobertura = filteredStructures.filter(s => covDisplayState(s) === "SIN_COBERTURA");
            const conBajoMinimo = filteredStructures.filter(s => covDisplayState(s) === "CON_REFERENCIAS_BAJO_MINIMO");
            const saludables = filteredStructures.filter(s => covDisplayState(s) === "SALUDABLE");

            // Candidate type labels
            const candidateTypeLabel = (t: CoverageCandidateType) =>
              t === "REPOSICION_MISMA_REFERENCIA" ? "Reposición"
              : t === "COMPLEMENTO_REFERENCIA_COMPATIBLE" ? "Complemento"
              : "Referencia nueva";

            const candidateTypeVariant = (t: CoverageCandidateType) =>
              t === "REPOSICION_MISMA_REFERENCIA" ? "info"
              : t === "COMPLEMENTO_REFERENCIA_COMPATIBLE" ? "success"
              : "neutral";

            const refStateLabel = (s: ReferenceHealthState) =>
              s === "BAJO_MINIMO" ? "Bajo mínimo" : s === "SOBRE_MAXIMO" ? "Sobre máximo" : "Saludable";
            const refStateColor = (s: ReferenceHealthState) =>
              s === "BAJO_MINIMO" ? C.red : s === "SOBRE_MAXIMO" ? C.amber : C.green;

            return (
              <>
                {/* KPIs — 6 metrics: structural coverage + quantitative health */}
                <div style={{ display: "flex", gap: S[4], flexWrap: "wrap" }}>
                  <MiniStat label="Esperadas" value={String(covData.totalExpected)} color={C.ink} />
                  <MiniStat label="Cubiertas" value={String(covData.totalCovered)} color={C.green} />
                  <MiniStat label="Sin cobertura" value={String(covData.totalGaps)} color={covData.totalGaps > 0 ? C.red : C.ink} />
                  <MiniStat label="Refs bajo mínimo" value={String(covData.totalWithBelowMinimum)} color={covData.totalWithBelowMinimum > 0 ? C.amber : C.ink} />
                  <MiniStat label="Cobertura" value={`${covData.overallCoveragePercent}%`} color={covData.overallCoveragePercent >= 80 ? C.green : covData.overallCoveragePercent >= 50 ? C.amber : C.red} />
                  <MiniStat label="Salud" value={`${covData.overallHealthPercent}%`} color={covData.overallHealthPercent >= 80 ? C.green : covData.overallHealthPercent >= 50 ? C.amber : C.red} />
                </div>

                {/* Per-line filter strip */}
                <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
                  <button
                    onClick={() => setCovLine("ALL")}
                    style={{
                      padding: `${S[1]}px ${S[3]}px`, borderRadius: R.sm, border: `1px solid ${C.line}`,
                      fontFamily: T.mono, fontSize: T.sz.xs, cursor: "pointer",
                      background: covLine === "ALL" ? C.blueDark : C.surface,
                      color: covLine === "ALL" ? "#fff" : C.ink,
                    }}
                  >
                    Todas ({covData.totalExpected})
                  </button>
                  {covData.lineSummaries.map(ls => {
                    const lineLabel = ls.line === "CASTILLITOS" ? "Castillitos"
                      : ls.line === "LATIN_KIDS" ? "Latin Kids" : "Accesorios";
                    const active = covLine === ls.line;
                    const issues = ls.gaps + ls.withBelowMinimum;
                    return (
                      <button
                        key={ls.line}
                        onClick={() => setCovLine(ls.line)}
                        style={{
                          padding: `${S[1]}px ${S[3]}px`, borderRadius: R.sm, border: `1px solid ${C.line}`,
                          fontFamily: T.mono, fontSize: T.sz.xs, cursor: "pointer",
                          background: active ? C.blueDark : C.surface,
                          color: active ? "#fff" : C.ink,
                        }}
                      >
                        {lineLabel} ({ls.covered}/{ls.expected})
                        {issues > 0 && (
                          <span style={{ marginLeft: S[1], color: active ? "#fca5a5" : ls.gaps > 0 ? C.red : C.amber, fontWeight: T.wt.semibold }}>
                            {issues} {issues === 1 ? "brecha" : "brechas"}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Status filter strip — two-dimension */}
                <div style={{ display: "flex", gap: S[1], flexWrap: "wrap" }}>
                  {([
                    { key: "ALL" as CoverageStatusFilter, label: "Todas", count: covData.structures.filter(s => covLine === "ALL" || s.line === covLine).length },
                    { key: "SALUDABLE" as CoverageStatusFilter, label: "Saludables", count: covData.structures.filter(s => covDisplayState(s) === "SALUDABLE" && (covLine === "ALL" || s.line === covLine)).length },
                    { key: "CON_REFERENCIAS_BAJO_MINIMO" as CoverageStatusFilter, label: "Con refs bajo mín.", count: covData.structures.filter(s => covDisplayState(s) === "CON_REFERENCIAS_BAJO_MINIMO" && (covLine === "ALL" || s.line === covLine)).length },
                    { key: "SIN_COBERTURA" as CoverageStatusFilter, label: "Sin cobertura", count: covData.structures.filter(s => covDisplayState(s) === "SIN_COBERTURA" && (covLine === "ALL" || s.line === covLine)).length },
                  ]).map(f => (
                    <button
                      key={f.key}
                      onClick={() => setCovStatusFilter(f.key)}
                      style={{
                        padding: `2px ${S[2]}px`, borderRadius: R.sm, border: `1px solid ${C.line}`,
                        fontFamily: T.mono, fontSize: "10px", cursor: "pointer",
                        background: covStatusFilter === f.key ? C.surfaceAlt : "transparent",
                        color: C.ink, fontWeight: covStatusFilter === f.key ? T.wt.semibold : T.wt.normal,
                      }}
                    >
                      {f.label} ({f.count})
                    </button>
                  ))}
                </div>

                {/* Structures table */}
                <div className="ag-op-table" style={{ fontSize: T.sz.sm }}>
                  {/* Header */}
                  <div className="ag-op-row" style={{
                    fontFamily: T.mono, fontWeight: T.wt.semibold, fontSize: T.sz.xs,
                    color: C.inkLight, borderBottom: `1px solid ${C.line}`,
                    display: "grid", gridTemplateColumns: "140px 1fr 50px 50px 60px 60px 90px", gap: S[2],
                    padding: `${S[1]}px ${S[2]}px`,
                  }}>
                    <span>Grupo / Línea</span>
                    <span>Estructura</span>
                    <span style={{ textAlign: "right" }}>Refs</span>
                    <span style={{ textAlign: "right" }}>Uds</span>
                    <span style={{ textAlign: "right" }}>Objetivo</span>
                    <span style={{ textAlign: "right" }}>Faltante</span>
                    <span style={{ textAlign: "center" }}>Estado</span>
                  </div>

                  {/* SIN_COBERTURA first, then CON_REFERENCIAS_BAJO_MINIMO, then SALUDABLE */}
                  {[
                    ...sinCobertura.sort((a, b) => a.priority - b.priority),
                    ...conBajoMinimo.sort((a, b) => a.priority - b.priority),
                    ...saludables.sort((a, b) => a.priority - b.priority),
                  ].map(s => {
                    const ds = covDisplayState(s);
                    const isExpandable = ds !== "SALUDABLE";
                    const isExpanded = covExpandedKey === s.structureKey;
                    const candidateData = covCandidates[s.structureKey];
                    const isLoadingCandidates = covCandidateLoading === s.structureKey;

                    const statusVariant = ds === "SALUDABLE" ? "success"
                      : ds === "CON_REFERENCIAS_BAJO_MINIMO" ? "warning" : "critical";
                    const statusLabel = ds === "SALUDABLE" ? "Saludable"
                      : ds === "CON_REFERENCIAS_BAJO_MINIMO"
                        ? `${s.belowMinimumReferenceCount} bajo mín.`
                        : "Sin cobertura";
                    const rowBg = ds === "SIN_COBERTURA" ? "rgba(239,68,68,0.04)"
                      : ds === "CON_REFERENCIAS_BAJO_MINIMO" ? "rgba(245,158,11,0.04)" : "transparent";

                    const handleToggle = () => {
                      if (!isExpandable) return;
                      if (isExpanded) {
                        setCovExpandedKey(null);
                        return;
                      }
                      setCovExpandedKey(s.structureKey);
                      if (!covCandidates[s.structureKey]) {
                        setCovCandidateLoading(s.structureKey);
                        tiendaApi(orgSlug, {
                          action: "store_coverage_candidates",
                          storeId: storeCard.store.id,
                          structureKeys: [s.structureKey],
                          coverageStatuses: { [s.structureKey]: s.structuralCoverageStatus },
                        })
                          .then((data: { candidates?: CoverageCandidatesResult[] }) => {
                            if (data.candidates?.[0]) {
                              setCovCandidates(prev => ({ ...prev, [s.structureKey]: data.candidates![0] }));
                            }
                          })
                          .catch(() => {})
                          .finally(() => setCovCandidateLoading(null));
                      }
                    };

                    return (
                      <div key={s.structureKey}>
                        <div
                          className="ag-op-row"
                          onClick={handleToggle}
                          style={{
                            display: "grid", gridTemplateColumns: "140px 1fr 50px 50px 60px 60px 90px", gap: S[2],
                            padding: `${S[2]}px ${S[2]}px`,
                            fontFamily: T.mono, fontSize: T.sz.sm,
                            background: rowBg,
                            borderBottom: isExpanded ? "none" : `1px solid ${C.line}`,
                            cursor: isExpandable ? "pointer" : "default",
                          }}
                        >
                          <span style={{ color: C.inkLight, fontSize: T.sz.xs }}>
                            {isExpandable && <span style={{ marginRight: S[1] }}>{isExpanded ? "▾" : "▸"}</span>}
                            {s.line === "CASTILLITOS" ? s.groupLabel ?? "CS" : s.line === "LATIN_KIDS" ? "Latin Kids" : "Accesorios"}
                          </span>
                          <span style={{ color: C.ink }}>{s.label}</span>
                          <span style={{ textAlign: "right", color: s.activeReferenceCount > 0 ? C.ink : C.red, fontWeight: T.wt.semibold }}>
                            {s.activeReferenceCount > 0 ? s.activeReferenceCount : "\u2014"}
                          </span>
                          <span style={{ textAlign: "right", color: C.inkLight }}>
                            {s.totalStoreUnits > 0 ? s.totalStoreUnits : "\u2014"}
                          </span>
                          <span style={{ textAlign: "right", color: C.inkLight }}>
                            {s.targetUnits}
                          </span>
                          <span style={{ textAlign: "right", color: s.totalShortageToTarget > 0 ? C.red : C.inkLight, fontWeight: s.totalShortageToTarget > 0 ? T.wt.semibold : T.wt.normal }}>
                            {s.totalShortageToTarget > 0 ? s.totalShortageToTarget : "\u2014"}
                          </span>
                          <span style={{ textAlign: "center" }}>
                            <span className={`ag-op-status ag-op-status--${statusVariant}`}>
                              {statusLabel}
                            </span>
                          </span>
                        </div>

                        {/* Candidate expansion panel */}
                        {isExpanded && isExpandable && (
                          <div style={{
                            padding: `${S[2]}px ${S[3]}px ${S[3]}px ${S[3]}px`,
                            background: ds === "SIN_COBERTURA" ? "rgba(239,68,68,0.02)" : "rgba(245,158,11,0.02)",
                            borderBottom: `1px solid ${C.line}`,
                          }}>
                            {isLoadingCandidates && !candidateData && (
                              <div style={{ height: 48, background: C.surface, borderRadius: R.sm, animation: "pulse 1.5s infinite" }} />
                            )}
                            {candidateData && (() => {
                              const ss = candidateData.solutionSummary;
                              const totalBodegaRefs = ss.eligibleCandidates + ss.blockedCandidates;
                              const allCandidates = [...candidateData.eligible, ...candidateData.blocked];
                              // Store refs that can be served by a candidate (same ref = reposición)
                              const recoverableStoreRefs = candidateData.activeStoreRefs.filter(ar =>
                                candidateData.eligible.some(c => c.referenceCode === ar.referenceCode)
                              );
                              const recoverableCount = recoverableStoreRefs.length + (ds === "SIN_COBERTURA" ? ss.eligibleCandidates : 0);
                              const coverageBase = Math.max(1, s.activeReferenceCount > 0 ? s.activeReferenceCount : (s.targetUnits > 0 ? 1 : 1));
                              const coveragePct = ds === "SIN_COBERTURA"
                                ? (ss.eligibleCandidates > 0 ? 100 : 0)
                                : Math.min(100, Math.round(((candidateData.activeStoreRefs.filter(ar => ar.referenceState !== "BAJO_MINIMO").length + recoverableStoreRefs.length) / Math.max(1, candidateData.activeStoreRefs.length)) * 100));

                              // Candidate card renderer (shared between eligible and blocked)
                              const renderCandidateCard = (c: CoverageCandidate, isBlocked: boolean) => {
                                // Find which store refs this candidate matches
                                const matchedStoreRef = candidateData.activeStoreRefs.find(ar => ar.referenceCode === c.referenceCode);
                                return (
                                  <div key={`${c.referenceCode}-${isBlocked ? "b" : "e"}`} style={{
                                    padding: `${S[2]}px ${S[3]}px`, borderRadius: R.sm,
                                    background: isBlocked ? "rgba(245,158,11,0.03)" : C.white,
                                    border: `1px solid ${isBlocked ? "rgba(245,158,11,0.2)" : C.line}`,
                                    opacity: isBlocked ? 0.75 : 1,
                                  }}>
                                    {/* Candidate header row */}
                                    <div style={{
                                      display: "grid", gridTemplateColumns: "28px 1fr auto auto auto", gap: S[2],
                                      alignItems: "center", fontFamily: T.mono, fontSize: T.sz.xs,
                                    }}>
                                      <CommercialReferenceThumbnail imageUrl={c.imageUrl} reference={c.referenceCode} description={c.productName} size={24} />
                                      <div>
                                        <div style={{ color: C.ink, fontWeight: T.wt.semibold }}>{c.referenceCode}</div>
                                        <div style={{ color: C.inkLight, fontSize: "10px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>
                                          {c.productName}
                                        </div>
                                      </div>
                                      <span style={{ color: C.ink, fontWeight: T.wt.semibold }}>{c.mainWarehouseStock} uds</span>
                                      <span className={`ag-op-status ag-op-status--${candidateTypeVariant(c.candidateType)}`} style={{ fontSize: "10px" }}>
                                        {candidateTypeLabel(c.candidateType)}
                                      </span>
                                      <span className={`ag-op-status ag-op-status--${isBlocked ? "warning" : "success"}`} style={{ fontSize: "10px" }}>
                                        {isBlocked ? "Regla 36" : "Disponible"}
                                      </span>
                                    </div>

                                    {/* Variant breakdown */}
                                    {c.variants.length > 0 && (
                                      <div style={{ marginTop: S[1], paddingLeft: 36 }}>
                                        <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight, marginBottom: 2 }}>
                                          Variantes disponibles ({c.variants.length})
                                        </div>
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: S[1] }}>
                                          {c.variants.slice(0, 12).map((v, vi) => (
                                            <span key={vi} style={{
                                              fontFamily: T.mono, fontSize: "10px",
                                              padding: "1px 6px", borderRadius: R.sm,
                                              background: C.surface, border: `1px solid ${C.line}`,
                                              color: C.ink,
                                            }}>
                                              {v.size}/{v.color} <strong>{v.qty}</strong>
                                            </span>
                                          ))}
                                          {c.variants.length > 12 && (
                                            <span style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight }}>
                                              +{c.variants.length - 12} más
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    )}

                                    {/* Matched store ref (what this candidate can supply) */}
                                    {matchedStoreRef && (
                                      <div style={{
                                        marginTop: S[1], paddingLeft: 36,
                                        padding: `${S[1]}px ${S[2]}px ${S[1]}px 36px`,
                                        background: "rgba(59,130,246,0.04)", borderRadius: R.sm,
                                      }}>
                                        <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.blueDark, marginBottom: 2 }}>
                                          Abastece en tienda
                                        </div>
                                        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, display: "flex", gap: S[3], alignItems: "center" }}>
                                          <span style={{ color: C.ink }}>{matchedStoreRef.referenceCode}</span>
                                          <span style={{ color: C.inkLight }}>{matchedStoreRef.storeQty} uds actuales</span>
                                          {matchedStoreRef.referenceShortageToTarget > 0 && (
                                            <span style={{ color: C.red, fontWeight: T.wt.semibold }}>falta {matchedStoreRef.referenceShortageToTarget}</span>
                                          )}
                                          <span style={{ fontSize: "10px", color: refStateColor(matchedStoreRef.referenceState), fontWeight: T.wt.semibold }}>
                                            {refStateLabel(matchedStoreRef.referenceState)}
                                          </span>
                                        </div>
                                      </div>
                                    )}
                                    {!matchedStoreRef && c.candidateType !== "REPOSICION_MISMA_REFERENCIA" && candidateData.activeStoreRefs.length > 0 && (
                                      <div style={{
                                        marginTop: S[1], paddingLeft: 36,
                                        fontFamily: T.mono, fontSize: "10px", color: C.inkLight,
                                      }}>
                                        Complementa el subgrupo — {candidateData.activeStoreRefs.length} ref{candidateData.activeStoreRefs.length !== 1 ? "s" : ""} en tienda
                                      </div>
                                    )}
                                    {c.candidateType === "REFERENCIA_NUEVA_COMPATIBLE" && candidateData.activeStoreRefs.length === 0 && (
                                      <div style={{
                                        marginTop: S[1], paddingLeft: 36,
                                        fontFamily: T.mono, fontSize: "10px", color: C.inkLight,
                                      }}>
                                        Referencia nueva — cubre estructura sin cobertura
                                      </div>
                                    )}
                                  </div>
                                );
                              };

                              return (
                              <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>

                                {/* ── 1. EXECUTIVE SUMMARY ── */}
                                <div style={{
                                  display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: S[2],
                                  padding: `${S[2]}px ${S[3]}px`, borderRadius: R.sm,
                                  background: ss.eligibleCandidates > 0 ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.04)",
                                  border: `1px solid ${ss.eligibleCandidates > 0 ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.15)"}`,
                                }}>
                                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs }}>
                                    <div style={{ color: C.inkLight, fontSize: "10px", marginBottom: 2 }}>Refs compatibles</div>
                                    <div style={{ color: C.ink, fontWeight: T.wt.semibold }}>{totalBodegaRefs}</div>
                                  </div>
                                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs }}>
                                    <div style={{ color: C.inkLight, fontSize: "10px", marginBottom: 2 }}>Uds disponibles</div>
                                    <div style={{ color: C.ink, fontWeight: T.wt.semibold }}>{ss.totalWarehouseUnits}</div>
                                  </div>
                                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs }}>
                                    <div style={{ color: C.inkLight, fontSize: "10px", marginBottom: 2 }}>Refs recuperables</div>
                                    <div style={{ color: recoverableCount > 0 ? C.green : C.inkLight, fontWeight: T.wt.semibold }}>
                                      {recoverableCount > 0 ? recoverableCount : "\u2014"}
                                    </div>
                                  </div>
                                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs }}>
                                    <div style={{ color: C.inkLight, fontSize: "10px", marginBottom: 2 }}>Cobertura estimada</div>
                                    <div style={{ color: ss.eligibleCandidates > 0 ? C.green : C.red, fontWeight: T.wt.semibold }}>
                                      {ss.eligibleCandidates > 0 ? `${coveragePct}%` : "0%"}
                                    </div>
                                  </div>
                                </div>

                                {/* ── 2. SUBGROUP STATE IN STORE ── */}
                                <div>
                                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.blueDark, fontWeight: T.wt.semibold, marginBottom: S[1] }}>
                                    Estado en tienda
                                  </div>
                                  <div style={{
                                    display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: S[2],
                                    padding: `${S[2]}px ${S[3]}px`, borderRadius: R.sm,
                                    background: C.surface, border: `1px solid ${C.line}`,
                                  }}>
                                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs }}>
                                      <div style={{ color: C.inkLight, fontSize: "10px", marginBottom: 2 }}>Refs existentes</div>
                                      <div style={{ color: C.ink, fontWeight: T.wt.semibold }}>{s.activeReferenceCount > 0 ? s.activeReferenceCount : "\u2014"}</div>
                                    </div>
                                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs }}>
                                      <div style={{ color: C.inkLight, fontSize: "10px", marginBottom: 2 }}>Unidades actuales</div>
                                      <div style={{ color: C.ink, fontWeight: T.wt.semibold }}>{s.totalStoreUnits > 0 ? s.totalStoreUnits : "\u2014"}</div>
                                    </div>
                                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs }}>
                                      <div style={{ color: C.inkLight, fontSize: "10px", marginBottom: 2 }}>Faltante total</div>
                                      <div style={{ color: s.totalShortageToTarget > 0 ? C.red : C.inkLight, fontWeight: T.wt.semibold }}>
                                        {s.totalShortageToTarget > 0 ? s.totalShortageToTarget : "\u2014"}
                                      </div>
                                    </div>
                                  </div>
                                  {candidateData.activeStoreRefs.length > 0 && (
                                    <div style={{ marginTop: S[1] }}>
                                      {candidateData.activeStoreRefs.map(ar => (
                                        <div key={ar.referenceCode} style={{
                                          display: "grid", gridTemplateColumns: "28px 1fr auto auto auto auto", gap: S[2],
                                          padding: `${S[1]}px 0`, alignItems: "center",
                                          fontFamily: T.mono, fontSize: T.sz.xs,
                                          borderBottom: `1px solid ${C.line}`,
                                        }}>
                                          <CommercialReferenceThumbnail imageUrl={ar.imageUrl} reference={ar.referenceCode} description={ar.productName} size={24} />
                                          <div>
                                            <div style={{ color: C.ink, fontWeight: T.wt.medium }}>{ar.referenceCode}</div>
                                            <div style={{ color: C.inkLight, fontSize: "10px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>
                                              {ar.productName}
                                            </div>
                                          </div>
                                          <span style={{ color: C.ink, textAlign: "right" }}>{ar.storeQty} uds</span>
                                          <span style={{ color: C.inkLight, textAlign: "right", fontSize: "10px" }}>
                                            {ar.minimumUnits}/{ar.targetUnits}/{ar.maximumUnits}
                                          </span>
                                          <span style={{ textAlign: "right", color: ar.referenceShortageToTarget > 0 ? C.red : C.inkLight, fontWeight: ar.referenceShortageToTarget > 0 ? T.wt.semibold : T.wt.normal, fontSize: "10px" }}>
                                            {ar.referenceShortageToTarget > 0 ? `-${ar.referenceShortageToTarget}` : "\u2014"}
                                          </span>
                                          <span>
                                            <span style={{ fontSize: "10px", color: refStateColor(ar.referenceState), fontWeight: T.wt.semibold }}>
                                              {refStateLabel(ar.referenceState)}
                                            </span>
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {/* ── 3. BODEGA PRINCIPAL TEXTIL — detailed candidate cards ── */}
                                {candidateData.eligible.length > 0 && (
                                  <div>
                                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.green, fontWeight: T.wt.semibold, marginBottom: S[1] }}>
                                      Disponibles para enviar ({candidateData.eligible.length})
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
                                      {candidateData.eligible.map(c => renderCandidateCard(c, false))}
                                    </div>
                                  </div>
                                )}

                                {/* ── 4. BLOCKED — Limited by Rule 36 ── */}
                                {candidateData.blocked.length > 0 && (
                                  <div>
                                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.amber, fontWeight: T.wt.semibold, marginBottom: S[1] }}>
                                      Limitadas por Regla 36 ({candidateData.blocked.length})
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
                                      {candidateData.blocked.map(c => renderCandidateCard(c, true))}
                                    </div>
                                  </div>
                                )}

                                {/* No candidates */}
                                {candidateData.totalCompatible === 0 && candidateData.activeStoreRefs.length === 0 && (
                                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, padding: S[2] }}>
                                    No hay referencias compatibles en bodega principal
                                  </div>
                                )}

                                {/* "Ver en Necesidades" navigation */}
                                <div style={{ marginTop: S[1] }}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setTab("necesidades");
                                    }}
                                    style={{
                                      fontFamily: T.mono, fontSize: T.sz.xs, color: C.blueDark,
                                      background: "none", border: "none", cursor: "pointer",
                                      textDecoration: "underline", padding: 0,
                                    }}
                                  >
                                    Ver en Necesidades →
                                  </button>
                                </div>
                              </div>
                              );
                            })()}
                            {!isLoadingCandidates && !candidateData && (
                              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, padding: S[2] }}>
                                Error al cargar candidatos
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {filteredStructures.length === 0 && (
                    <div style={{ padding: S[4], textAlign: "center", fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>
                      No hay estructuras para este filtro
                    </div>
                  )}
                </div>
              </>
            );
          })()}
          {!covLoading && !covData && covLoaded && (
            <div style={{ padding: S[4], textAlign: "center", fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>
              No se pudo cargar la cobertura estructural
            </div>
          )}
        </div>
      )}

      {/* TAB: Descuentos — aging-based discount recommendations (AGENTIK-STORES-DISCOUNTS-TAB-01) */}
      {tab === "descuentos" && (
        <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
          {discLoading && !discData && (
            <div style={{ height: 120, background: C.surface, borderRadius: R.sm, animation: "pulse 1.5s infinite" }} />
          )}
          {discData && (() => {
            const kpis = discData.kpis;
            // Filter by tier + search
            let filtered = discData.recommendations;
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

            const TIER_FILTERS: { key: DiscountTier | "ALL"; label: string; count: number }[] = [
              { key: "ALL",              label: `Todas (${kpis.totalEvaluated})`, count: kpis.totalEvaluated },
              { key: "SEVENTY_PERCENT",  label: `70% (${kpis.seventyPercent})`,  count: kpis.seventyPercent },
              { key: "FIFTY_PERCENT",    label: `50% (${kpis.fiftyPercent})`,    count: kpis.fiftyPercent },
              { key: "THIRTY_PERCENT",   label: `30% (${kpis.thirtyPercent})`,   count: kpis.thirtyPercent },
              { key: "TEN_PERCENT",      label: `10% (${kpis.tenPercent})`,      count: kpis.tenPercent },
              { key: "NONE",             label: `0% (${kpis.none})`,             count: kpis.none },
              { key: "SIN_FECHA",        label: `Sin fecha (${kpis.sinFecha})`,  count: kpis.sinFecha },
            ];

            return (
              <>
                {/* Rule summary strip */}
                <div style={{
                  ...panel, padding: `${S[2]}px ${S[3]}px`,
                  background: C.surface, display: "flex", gap: S[4], flexWrap: "wrap", alignItems: "center",
                }}>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
                    Reglas de descuento por antiguedad:
                  </span>
                  {[
                    { label: "0-89d", pct: "0%" },
                    { label: "90-179d", pct: "10%" },
                    { label: "180-269d", pct: "30%" },
                    { label: "270-364d", pct: "50%" },
                    { label: "365d+", pct: "70%" },
                  ].map(r => (
                    <span key={r.label} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.ink }}>
                      {r.label} = <strong>{r.pct}</strong>
                    </span>
                  ))}
                </div>

                {/* KPIs */}
                <div style={{ display: "flex", gap: S[4], flexWrap: "wrap" }}>
                  <MiniStat label="Evaluadas" value={String(kpis.totalEvaluated)} color={C.ink} />
                  <MiniStat label="70%" value={String(kpis.seventyPercent)} color={kpis.seventyPercent > 0 ? DISCOUNT_TIER_COLOR.SEVENTY_PERCENT : C.ink} />
                  <MiniStat label="50%" value={String(kpis.fiftyPercent)} color={kpis.fiftyPercent > 0 ? DISCOUNT_TIER_COLOR.FIFTY_PERCENT : C.ink} />
                  <MiniStat label="30%" value={String(kpis.thirtyPercent)} color={kpis.thirtyPercent > 0 ? DISCOUNT_TIER_COLOR.THIRTY_PERCENT : C.ink} />
                  <MiniStat label="10%" value={String(kpis.tenPercent)} color={kpis.tenPercent > 0 ? DISCOUNT_TIER_COLOR.TEN_PERCENT : C.ink} />
                  <MiniStat label="Sin descuento" value={String(kpis.none)} color={C.ink} />
                  <MiniStat label="Sin fecha" value={String(kpis.sinFecha)} color={kpis.sinFecha > 0 ? C.inkFaint : C.ink} />
                </div>

                {/* Tier filter strip */}
                <div style={{ display: "flex", gap: S[1], flexWrap: "wrap" }}>
                  {TIER_FILTERS.map(tf => {
                    const isActive = discTierFilter === tf.key;
                    return (
                      <button
                        key={tf.key}
                        onClick={() => setDiscTierFilter(tf.key)}
                        style={{
                          fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                          padding: "3px 10px", borderRadius: R.pill, cursor: "pointer",
                          background: isActive ? C.blueDark : C.surface,
                          color: isActive ? C.white : C.inkMid,
                          border: `1px solid ${isActive ? C.blueDark : C.line}`,
                        }}
                      >
                        {tf.label}
                      </button>
                    );
                  })}
                </div>

                {/* Search */}
                <input
                  value={discSearch}
                  onChange={e => setDiscSearch(e.target.value)}
                  placeholder="Buscar referencia o descripcion..."
                  style={{
                    fontFamily: T.mono, fontSize: T.sz.xs, padding: `${S[2]}px ${S[3]}px`,
                    border: `1px solid ${C.line}`, borderRadius: R.sm, background: C.white,
                    color: C.ink, width: "100%",
                  }}
                />

                {/* Table */}
                <div className="ag-op-table" style={{ fontSize: T.sz.xs }}>
                  {/* Header */}
                  <div className="ag-op-row" style={{
                    display: "grid",
                    gridTemplateColumns: "32px 1fr 80px 80px 80px 70px",
                    gap: S[2], padding: `${S[2]}px ${S[3]}px`,
                    fontWeight: T.wt.semibold, color: C.inkMid,
                    borderBottom: `1px solid ${C.line}`, background: C.surface,
                  }}>
                    <span />
                    <span style={{ fontFamily: T.mono }}>Referencia</span>
                    <span style={{ fontFamily: T.mono, textAlign: "right" }}>Dias</span>
                    <span style={{ fontFamily: T.mono, textAlign: "right" }}>Uds</span>
                    <span style={{ fontFamily: T.mono, textAlign: "center" }}>Descuento</span>
                    <span style={{ fontFamily: T.mono, textAlign: "right" }}>Variantes</span>
                  </div>

                  {filtered.map((rec) => {
                    const tierColor = DISCOUNT_TIER_COLOR[rec.discountTier];
                    return (
                      <div key={rec.referenceCode} className="ag-op-row" style={{
                        display: "grid",
                        gridTemplateColumns: "32px 1fr 80px 80px 80px 70px",
                        gap: S[2], padding: `${S[2]}px ${S[3]}px`,
                        borderBottom: `1px solid ${C.lineSubtle}`,
                        alignItems: "center",
                      }}>
                        {/* Thumbnail */}
                        <CommercialReferenceThumbnail imageUrl={rec.imageUrl} reference={rec.referenceCode} description={rec.description} size={28} />

                        {/* Reference + description + reason */}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {rec.referenceCode}
                          </div>
                          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {rec.description}
                          </div>
                          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, marginTop: 1 }}>
                            {rec.reason}
                          </div>
                        </div>

                        {/* Days in store */}
                        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, textAlign: "right", color: C.ink }}>
                          {rec.daysInStore !== null ? `${rec.daysInStore}d` : "\u2014"}
                        </div>

                        {/* Store qty */}
                        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, textAlign: "right", color: C.ink }}>
                          {rec.storeQty}
                        </div>

                        {/* Discount badge */}
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

                        {/* Variant count */}
                        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, textAlign: "right", color: C.inkMid }}>
                          {rec.variantCount}
                        </div>
                      </div>
                    );
                  })}

                  {filtered.length === 0 && (
                    <div style={{ padding: S[4], textAlign: "center", fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>
                      {discSearchDebounced ? "Sin resultados para esta busqueda" : "No hay referencias en este filtro"}
                    </div>
                  )}
                </div>

                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                  Recomendaciones basadas en antiguedad (fecha de ingreso a tienda). No modifica precios.
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
