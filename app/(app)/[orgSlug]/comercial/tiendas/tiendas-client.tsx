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
  return res.json();
}


// ── Main component (STABILIZATION-PERFORMANCE-01) ────────────────────────────

export function TiendasClient({ orgSlug }: Props) {
  // ── Distribution cards (PRIMERO — 4 operational stores) ───────────────────
  const [distribution, setDistribution] = useState<CanonicalStoreDistribution | null>(null);
  const [distLoading, setDistLoading]   = useState(true);
  const [distError, setDistError]       = useState(false);

  // ── Drawer state (QUINTO — progressive per-store loading) ─────────────────
  const [selectedStoreCard, setSelectedStoreCard] = useState<CanonicalStoreCard | null>(null);
  const [storeDetail, setStoreDetail]             = useState<CanonicalStoreDetail | null>(null);
  const [detailLoading, setDetailLoading]         = useState(false);

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

  // ── QUINTO: Open store drawer (progressive) ──────────────────────────────
  async function openStoreDrawer(card: CanonicalStoreCard) {
    setSelectedStoreCard(card);
    setStoreDetail(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/orgs/${orgSlug}/comercial/tiendas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "store_distribution_detail", storeId: card.store.id }),
      });
      const data = await res.json();
      if (data.detail) setStoreDetail(data.detail);
    } catch { /* silent */ }
    setDetailLoading(false);
  }

  function closeDrawer() {
    setSelectedStoreCard(null);
    setStoreDetail(null);
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
              detail={storeDetail}
              detailLoading={detailLoading}
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

// ── Distribution Store Drawer (NOVENO + SEGUNDO) ──────────────────────────────

type DistDrawerTab = "inventario" | "necesidades" | "derrotero" | "inteligencia";

function DistributionStoreDrawer({
  orgSlug,
  storeCard,
  detail,
  detailLoading,
  onClose,
}: {
  orgSlug: string;
  storeCard: CanonicalStoreCard;
  detail: CanonicalStoreDetail | null;
  detailLoading: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<DistDrawerTab>("inventario");
  const [actionFilter, setActionFilter] = useState<StoreDistributionAction | "ALL">("ALL");
  const [domainFilter, setDomainFilter] = useState<DistDomainFilter>("ALL");
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // Reset state on store change
  useEffect(() => {
    setTab("inventario");
    setActionFilter("ALL");
    setDomainFilter("ALL");
    setExpandedRows(new Set());
  }, [storeCard.store.id]);

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

      {/* TAB: Inventario — distribution items */}
      {tab === "inventario" && (
        <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
          {detailLoading && (
            <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
              {[1, 2, 3].map(n => (
                <div key={n} style={{ height: 48, background: C.surface, borderRadius: R.sm, animation: "pulse 1.5s infinite" }} />
              ))}
            </div>
          )}

          {detail && (
            <>
              {/* CUARTO — KPI breakdown */}
              <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
                <DistKpiCard label="Reposicion directa" value={String(actionCounts["SURTIR"] || 0)} color={C.blueDark} />
                <DistKpiCard label="Reemplazos" value={String(actionCounts["SUGERIR_REEMPLAZO"] || 0)} color={C.blue} />
                <DistKpiCard label="Excesos" value={String(actionCounts["RETIRAR"] || 0)} color={C.amber} />
                <DistKpiCard label="Bloqueados" value={String(actionCounts["SIN_STOCK_ORIGEN"] || 0)} color={C.red} />
                <DistKpiCard label="Config. pendiente" value={String((actionCounts["SIN_REGLA"] || 0) + (actionCounts["REQUIERE_CONFIGURACION"] || 0))} color={C.inkFaint} />
              </div>

              {/* SÉPTIMO — Domain filter (by line) */}
              <div style={{ display: "flex", gap: S[1], flexWrap: "wrap" }}>
                {(["ALL", "castillitos", "latin_kids", "acc_small", "acc_medium", "acc_large"] as DistDomainFilter[]).map(d => {
                  const count = d === "ALL" ? detail.items.length : (domainCounts[d] || 0);
                  if (d !== "ALL" && count === 0) return null;
                  return (
                    <button
                      key={d}
                      onClick={() => setDomainFilter(d)}
                      style={{
                        fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                        padding: "2px 8px", borderRadius: R.pill, cursor: "pointer",
                        background: domainFilter === d ? C.blueDark : C.surface,
                        color: domainFilter === d ? C.white : C.inkMid,
                        border: `1px solid ${domainFilter === d ? C.blueDark : C.line}`,
                      }}
                    >
                      {DIST_DOMAIN_LABEL[d]} ({count})
                    </button>
                  );
                })}
              </div>

              {/* CUARTO — Action filter */}
              <div style={{ display: "flex", gap: S[1], flexWrap: "wrap" }}>
                {DIST_ACTION_FILTERS.map(f => {
                  const count = f === "ALL" ? detail.items.length : (actionCounts[f] || 0);
                  if (f !== "ALL" && count === 0) return null;
                  return (
                    <button
                      key={f}
                      onClick={() => setActionFilter(f)}
                      style={{
                        fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                        padding: "2px 8px", borderRadius: R.pill, cursor: "pointer",
                        background: actionFilter === f ? C.blueDark : C.surface,
                        color: actionFilter === f ? C.white : C.inkMid,
                        border: `1px solid ${actionFilter === f ? C.blueDark : C.line}`,
                      }}
                    >
                      {f === "ALL" ? `Todos (${count})` : `${DIST_ACTION_LABEL[f]} (${count})`}
                    </button>
                  );
                })}
              </div>

              {/* Items list */}
              {filteredItems.length === 0 ? (
                <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint, padding: `${S[2]}px 0` }}>
                  Sin items en esta categoria
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {filteredItems.slice(0, 200).map((item, idx) => {
                    const ac = DIST_ACTION_COLOR[item.action];
                    const isExpanded = expandedRows.has(idx);
                    const hasReplacement = item.action === "SUGERIR_REEMPLAZO" && item.replacement;
                    // SEXTO — Rule 36 blocking info
                    const isRule36Blocked = item.action === "SIN_STOCK_ORIGEN" && item.actionReason.includes("escasez");

                    return (
                      <div key={idx} style={{
                        borderBottom: `1px solid ${C.line}`,
                        background: isExpanded ? C.surfaceAlt : "transparent",
                      }}>
                        {/* Main row */}
                        <div
                          style={{
                            display: "flex", alignItems: "center", gap: S[2],
                            padding: `${S[2]}px ${S[2]}px`,
                            cursor: (hasReplacement || isRule36Blocked) ? "pointer" : "default",
                          }}
                          onClick={() => { if (hasReplacement || isRule36Blocked) toggleRow(idx); }}
                        >
                          {/* OCTAVO — Thumbnail */}
                          <CommercialReferenceThumbnail
                            imageUrl={item.imageUrl}
                            reference={item.referenceCode}
                            description={item.productName}
                            size={32}
                          />

                          {/* Ref + description */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink }}>
                                {item.referenceCode}
                              </span>
                              {/* QUINTO — Line chip */}
                              <span style={{
                                fontFamily: T.mono, fontSize: T.sz["2xs"], padding: "1px 5px", borderRadius: R.pill,
                                background: item.world === "TEXTILE" ? C.blueLight : C.amberLight,
                                color: item.world === "TEXTILE" ? C.blueDark : C.amber,
                              }}>
                                {item.canonicalLine === "latin_kids" ? "LK" : item.canonicalLine === "castillitos" ? "Cast" : item.sizeClass === "small" ? "Peq" : item.sizeClass === "medium" ? "Med" : "Gde"}
                              </span>
                              {/* QUINTO — Group/Subgroup */}
                              {item.group !== "SIN_GRUPO_SAG" && (
                                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                                  {item.group}{item.subgroup !== "SIN_SUBGRUPO_SAG" ? ` / ${item.subgroup}` : ""}
                                </span>
                              )}
                            </div>
                            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {item.productName}
                            </div>
                          </div>

                          {/* Stock numbers */}
                          <div style={{ display: "flex", gap: S[2], alignItems: "center", flexShrink: 0 }}>
                            <div style={{ textAlign: "center", minWidth: 36 }}>
                              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Tienda</div>
                              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.ink }}>{item.currentUnits}</div>
                            </div>
                            <div style={{ textAlign: "center", minWidth: 36 }}>
                              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Bodega</div>
                              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: item.mainWarehouseAvailable > 0 ? C.green : C.inkFaint }}>
                                {item.mainWarehouseAvailable > 0 ? item.mainWarehouseAvailable : "\u2014"}
                              </div>
                            </div>
                          </div>

                          {/* Action chip */}
                          <span style={{
                            fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                            padding: "2px 6px", borderRadius: R.pill, flexShrink: 0,
                            background: ac.bg, color: ac.text,
                          }}>
                            {DIST_ACTION_LABEL[item.action]}
                          </span>

                          {/* Expand arrow for replacement/rule36 rows */}
                          {(hasReplacement || isRule36Blocked) && (
                            <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, flexShrink: 0 }}>
                              {isExpanded ? "▼" : "▶"}
                            </span>
                          )}
                        </div>

                        {/* Reason text */}
                        <div style={{
                          fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid,
                          padding: `0 ${S[2]}px ${S[2]}px ${S[2] + 32 + S[2]}px`,
                        }}>
                          {item.actionReason}
                        </div>

                        {/* TERCERO — Expanded replacement candidates */}
                        {isExpanded && hasReplacement && item.replacement && (
                          <div style={{ padding: `0 ${S[2]}px ${S[3]}px ${S[2] + 32 + S[2]}px` }}>
                            <ReplacementCandidatesPanel
                              replacement={item.replacement}
                              canonicalLine={item.canonicalLine}
                            />
                          </div>
                        )}

                        {/* SEXTO — Rule 36 blocking explanation */}
                        {isExpanded && isRule36Blocked && (
                          <div style={{
                            padding: `0 ${S[2]}px ${S[3]}px ${S[2] + 32 + S[2]}px`,
                          }}>
                            <div style={{
                              padding: S[3], background: C.redLight, borderRadius: R.sm,
                              border: `1px solid ${C.redBorder}`,
                            }}>
                              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.red, marginBottom: S[1] }}>
                                Bloqueado por regla de escasez
                              </div>
                              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, lineHeight: 1.5 }}>
                                {item.actionReason}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {filteredItems.length > 200 && (
                    <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, padding: S[2], textAlign: "center" }}>
                      Mostrando 200 de {filteredItems.length} items
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* TAB: Necesidades — items needing action (SURTIR, SUGERIR_REEMPLAZO, SIN_STOCK_ORIGEN) */}
      {tab === "necesidades" && (
        <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
          {detailLoading && (
            <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
              {[1, 2, 3].map(n => (
                <div key={n} style={{ height: 48, background: C.surface, borderRadius: R.sm, animation: "pulse 1.5s infinite" }} />
              ))}
            </div>
          )}
          {detail && (() => {
            const needItems = detail.items.filter(i =>
              i.action === "SURTIR" || i.action === "SUGERIR_REEMPLAZO" || i.action === "SIN_STOCK_ORIGEN"
            );
            if (needItems.length === 0) return (
              <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint, padding: `${S[4]}px 0`, textAlign: "center" }}>
                Sin necesidades pendientes para esta tienda
              </div>
            );
            return (
              <>
                <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
                  <DistKpiCard label="Reposicion directa" value={String(needItems.filter(i => i.action === "SURTIR").length)} color={C.blueDark} />
                  <DistKpiCard label="Reemplazos" value={String(needItems.filter(i => i.action === "SUGERIR_REEMPLAZO").length)} color={C.blue} />
                  <DistKpiCard label="Sin stock" value={String(needItems.filter(i => i.action === "SIN_STOCK_ORIGEN").length)} color={C.red} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {needItems.slice(0, 100).map((item, idx) => {
                    const ac = DIST_ACTION_COLOR[item.action];
                    return (
                      <div key={idx} style={{ borderBottom: `1px solid ${C.line}`, padding: `${S[2]}px` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                          <CommercialReferenceThumbnail imageUrl={item.imageUrl} reference={item.referenceCode} description={item.productName} size={28} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink }}>{item.referenceCode}</span>
                            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.productName}</div>
                          </div>
                          <div style={{ textAlign: "center", minWidth: 32 }}>
                            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Tienda</div>
                            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.ink }}>{item.currentUnits}</div>
                          </div>
                          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, padding: "2px 6px", borderRadius: R.pill, background: ac.bg, color: ac.text }}>
                            {DIST_ACTION_LABEL[item.action]}
                          </span>
                        </div>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, paddingLeft: 28 + S[2], marginTop: 2 }}>
                          {item.actionReason}
                        </div>
                      </div>
                    );
                  })}
                  {needItems.length > 100 && (
                    <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, padding: S[2], textAlign: "center" }}>
                      Mostrando 100 de {needItems.length} necesidades
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* TAB: Derrotero — reuses DerroteroTab */}
      {tab === "derrotero" && (
        <DerroteroTab orgSlug={orgSlug} storeId={storeCard.store.id} storeName={storeCard.store.name} />
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
