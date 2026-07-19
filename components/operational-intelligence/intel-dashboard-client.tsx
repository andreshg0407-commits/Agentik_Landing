"use client";

/**
 * IntelDashboardClient
 *
 * Operational Intelligence Dashboard — 6-block client workspace.
 *
 * Blocks:
 *   1. Health hero strip (KPI cards)
 *   2. Hot references table (cross-vendor contention)
 *   3. Conflicts from reconciliation
 *   4. Global suggestions
 *   5. Vendor impact table
 *   6. Warehouse pressure table
 *
 * Clicking a reference row opens the IntelReferenceDrawer.
 *
 * Sprint: AGENTIK-OPERATIONAL-INTELLIGENCE-DASHBOARD-01
 */

import { useState } from "react";
import { C, T, S, R } from "@/lib/ui/tokens";
import { IntelReferenceDrawer } from "./intel-reference-drawer";
import type {
  OperationalIntelligenceSnapshot,
  OperationalIntelligenceReference,
  OperationalHotReference,
  OperationalIntelligenceAlert,
  OperationalIntelligenceSuggestion,
  OperationalConflict,
  OperationalVendorImpact,
  OperationalWarehousePressure,
} from "@/lib/operational-intelligence/operational-intelligence-types";

// ─── Color maps ───────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  critical:   C.red,
  pressure:   C.amber,
  warning:    "#f59e0b",
  stable:     C.green,
  dead_stock: C.inkFaint,
};

const URGENCY_COLOR: Record<string, string> = {
  alta:    C.red,
  media:   C.amber,
  baja:    C.green,
  ninguna: C.inkFaint,
};

const SEV_COLOR: Record<string, string> = {
  critical: C.red,
  warning:  C.amber,
  info:     C.inkFaint,
};

const RISK_COLOR: Record<string, string> = {
  alto:  C.red,
  medio: C.amber,
  bajo:  C.green,
};

// ─── Main component ───────────────────────────────────────────────────────────

export function IntelDashboardClient({ snapshot }: { snapshot: OperationalIntelligenceSnapshot }) {
  const [drawerRef, setDrawerRef] = useState<OperationalIntelligenceReference | null>(null);

  const { health, pressureSummary, hotReferences, alerts, suggestions,
          conflicts, vendorImpact, warehousePressure, reconciliationSummary,
          totals, references } = snapshot;

  return (
    <>
      {/* ── Block 1: Health hero strip ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: S[4], marginBottom: S[8] }}>
        <HealthHeroCard
          label="Salud operacional"
          value={`${health.score}`}
          unit="/100"
          accent={health.isHealthy ? C.green : C.red}
          sub={health.label}
        />
        <HealthHeroCard
          label="Referencias monitoreadas"
          value={`${totals.refsMonitored}`}
          accent={C.blueDark}
          sub={`${totals.activeOrders} pedidos · ${totals.activeReservations} reservas`}
        />
        <HealthHeroCard
          label="Bajo presión"
          value={`${pressureSummary.refsUnderPressure + pressureSummary.refsDepleted}`}
          accent={pressureSummary.refsDepleted > 0 ? C.red : C.amber}
          sub={`${pressureSummary.refsDepleted} agotadas · ${pressureSummary.refsUnderPressure} en presión`}
        />
        <HealthHeroCard
          label="Inconsistencias"
          value={`${reconciliationSummary.totalIssues}`}
          accent={reconciliationSummary.critical > 0 ? C.red : reconciliationSummary.warnings > 0 ? C.amber : C.green}
          sub={reconciliationSummary.totalIssues === 0
            ? "Sin inconsistencias"
            : `${reconciliationSummary.critical} críticas · ${reconciliationSummary.warnings} avisos`}
        />
      </div>

      {/* ── Alerts strip ── */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: S[6] }}>
          <SectionLabel>Alertas activas</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
            {alerts.slice(0, 5).map(a => (
              <AlertRow key={a.id} alert={a} />
            ))}
          </div>
        </div>
      )}

      {/* ── Block 2: Hot references ── */}
      {hotReferences.length > 0 && (
        <div style={{ marginBottom: S[8] }}>
          <SectionLabel>Referencias calientes — contención multi-vendedor</SectionLabel>
          <div className="ag-op-table">
            <div className="ag-op-row" style={{ background: C.surface, borderBottom: `1px solid ${C.line}` }}>
              <ColHead w={120}>Referencia</ColHead>
              <ColHead w={200}>Descripción</ColHead>
              <ColHead w={80} align="right">Pedidos</ColHead>
              <ColHead w={80} align="right">Vendedores</ColHead>
              <ColHead w={100} align="right">Demanda total</ColHead>
              <ColHead w={100} align="right">Disponible</ColHead>
              <ColHead w={80}>Urgencia</ColHead>
            </div>
            {hotReferences.map(hr => (
              <HotRefRow key={hr.reference} row={hr}
                onClick={() => {
                  const full = references.find(r => r.reference === hr.reference);
                  if (full) setDrawerRef(full);
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Block 3: Conflicts ── */}
      {conflicts.length > 0 && (
        <div style={{ marginBottom: S[8] }}>
          <SectionLabel>Conflictos de conciliación</SectionLabel>
          <div className="ag-op-table">
            <div className="ag-op-row" style={{ background: C.surface, borderBottom: `1px solid ${C.line}` }}>
              <ColHead w={90}>Severidad</ColHead>
              <ColHead w={180}>Tipo</ColHead>
              <ColHead flex>Descripción</ColHead>
              <ColHead w={180}>Acción sugerida</ColHead>
            </div>
            {conflicts.map(c => (
              <ConflictRow key={c.id} conflict={c} />
            ))}
          </div>
        </div>
      )}

      {/* ── Block 4: Global suggestions ── */}
      {suggestions.length > 0 && (
        <div style={{ marginBottom: S[8] }}>
          <SectionLabel>Sugerencias operacionales</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
            {suggestions.map(s => (
              <SuggestionCard key={s.id} suggestion={s} />
            ))}
          </div>
        </div>
      )}

      {/* ── Block 5: Vendor impact ── */}
      {vendorImpact.length > 0 && (
        <div style={{ marginBottom: S[8] }}>
          <SectionLabel>Impacto por vendedor</SectionLabel>
          <div className="ag-op-table">
            <div className="ag-op-row" style={{ background: C.surface, borderBottom: `1px solid ${C.line}` }}>
              <ColHead flex>Vendedor</ColHead>
              <ColHead w={80} align="right">Agotadas</ColHead>
              <ColHead w={80} align="right">Presión</ColHead>
              <ColHead w={80} align="right">Pedidos</ColHead>
              <ColHead w={80} align="right">Reservas</ColHead>
              <ColHead w={90} align="right">Uds reservadas</ColHead>
              <ColHead w={80}>Riesgo</ColHead>
            </div>
            {vendorImpact.map(v => (
              <VendorRow key={v.salesRepId} vendor={v} />
            ))}
          </div>
        </div>
      )}

      {/* ── Block 6: Warehouse pressure ── */}
      {warehousePressure.length > 0 && (
        <div style={{ marginBottom: S[8] }}>
          <SectionLabel>Presión por bodega</SectionLabel>
          <div className="ag-op-table">
            <div className="ag-op-row" style={{ background: C.surface, borderBottom: `1px solid ${C.line}` }}>
              <ColHead flex>Bodega</ColHead>
              <ColHead w={80} align="right">Referencias</ColHead>
              <ColHead w={120} align="right">Demanda total</ColHead>
              <ColHead w={80}>Urgencia</ColHead>
            </div>
            {warehousePressure.map(w => (
              <WarehouseRow key={w.warehouseId} warehouse={w} />
            ))}
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {hotReferences.length === 0 && conflicts.length === 0 && suggestions.length === 0 && (
        <div className="ag-empty-operational" style={{ textAlign: "center", padding: `${S[10]}px 0` }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.green, fontWeight: 700, marginBottom: S[2] }}>
            Sistema operacional saludable
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
            Sin referencias en presión crítica · Sin conflictos de conciliación
          </div>
        </div>
      )}

      {/* ── Reference drawer ── */}
      <IntelReferenceDrawer
        reference={drawerRef}
        open={drawerRef !== null}
        onClose={() => setDrawerRef(null)}
      />
    </>
  );
}

// ─── Helper components ────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily:    T.mono,
      fontSize:      T.sz["2xs"],
      fontWeight:    700,
      textTransform: "uppercase" as const,
      letterSpacing: "0.08em",
      color:         C.inkFaint,
      marginBottom:  S[3],
    }}>
      {children}
    </div>
  );
}

function ColHead({
  children, w, flex, align,
}: {
  children?: React.ReactNode;
  w?: number;
  flex?: boolean;
  align?: "right" | "left";
}) {
  return (
    <div style={{
      width:      flex ? undefined : w,
      flex:       flex ? 1 : undefined,
      fontFamily: T.mono,
      fontSize:   T.sz["2xs"],
      fontWeight: 700,
      color:      C.inkFaint,
      textAlign:  align ?? "left",
      padding:    `${S[2]}px ${S[3]}px`,
      textTransform: "uppercase" as const,
      letterSpacing: "0.06em",
    }}>
      {children}
    </div>
  );
}

function HealthHeroCard({ label, value, unit, accent, sub }: {
  label:   string;
  value:   string;
  unit?:   string;
  accent:  string;
  sub:     string;
}) {
  return (
    <div className="ag-kpi-card" style={{ borderTop: `3px solid ${accent}` }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginBottom: S[2],
        textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: S[1] }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["3xl"], fontWeight: 700, color: accent }}>
          {value}
        </span>
        {unit && (
          <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid }}>{unit}</span>
        )}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>{sub}</div>
    </div>
  );
}

function AlertRow({ alert }: { alert: OperationalIntelligenceAlert }) {
  const color = SEV_COLOR[alert.severity] ?? C.inkFaint;
  return (
    <div style={{
      display:      "flex",
      alignItems:   "flex-start",
      gap:          S[3],
      padding:      `${S[3]}px ${S[4]}px`,
      background:   C.surface,
      border:       `1px solid ${C.lineSubtle}`,
      borderLeft:   `3px solid ${color}`,
      borderRadius: `0 ${R.md}px ${R.md}px 0`,
    }}>
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: 700,
        color, textTransform: "uppercase" as const, letterSpacing: "0.06em", minWidth: 60, paddingTop: 2 }}>
        {alert.severity}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600, color: C.ink }}>
          {alert.title}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, marginTop: 2 }}>
          {alert.body}
        </div>
      </div>
    </div>
  );
}

function HotRefRow({ row, onClick }: { row: OperationalHotReference; onClick: () => void }) {
  const urgencyColor = URGENCY_COLOR[row.urgency] ?? C.inkFaint;
  return (
    <button
      onClick={onClick}
      className="ag-op-row"
      style={{ width: "100%", textAlign: "left", background: "none", border: "none",
        cursor: "pointer", borderBottom: `1px solid ${C.lineSubtle}` }}
    >
      <Cell w={120}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.blueDark }}>
          {row.reference}
        </span>
      </Cell>
      <Cell w={200}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
          {row.description}
        </span>
      </Cell>
      <Cell w={80} align="right">
        <MonoNum>{row.orderCount}</MonoNum>
      </Cell>
      <Cell w={80} align="right">
        <MonoNum>{row.vendorCount}</MonoNum>
      </Cell>
      <Cell w={100} align="right">
        <MonoNum>{row.totalDemandQty}</MonoNum>
      </Cell>
      <Cell w={100} align="right">
        <MonoNum accent={row.availableQty <= 0 ? C.red : undefined}>{row.availableQty}</MonoNum>
      </Cell>
      <Cell w={80}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: urgencyColor, fontWeight: 600 }}>
          {row.urgency}
        </span>
      </Cell>
    </button>
  );
}

function ConflictRow({ conflict }: { conflict: OperationalConflict }) {
  const color = SEV_COLOR[conflict.severity] ?? C.inkFaint;
  return (
    <div className="ag-op-row" style={{ borderBottom: `1px solid ${C.lineSubtle}` }}>
      <Cell w={90}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: 700,
          color, textTransform: "uppercase" as const }}>
          {conflict.severity}
        </span>
      </Cell>
      <Cell w={180}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
          {conflict.type.replace(/_/g, " ")}
        </span>
      </Cell>
      <Cell flex>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>
          {conflict.message}
        </span>
      </Cell>
      <Cell w={180}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
          {conflict.fixLabel}
        </span>
      </Cell>
    </div>
  );
}

function SuggestionCard({ suggestion }: { suggestion: OperationalIntelligenceSuggestion }) {
  const urgencyColor = URGENCY_COLOR[suggestion.urgency] ?? C.inkFaint;
  return (
    <div style={{
      padding:      `${S[4]}px`,
      background:   C.surface,
      border:       `1px solid ${C.lineSubtle}`,
      borderLeft:   `3px solid ${urgencyColor}`,
      borderRadius: `0 ${R.md}px ${R.md}px 0`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: S[3], marginBottom: S[2] }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: 700,
          color: urgencyColor, textTransform: "uppercase" as const }}>
          {suggestion.type}
        </span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
          urgencia {suggestion.urgency}
        </span>
        {suggestion.qtyImpact !== undefined && (
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
            · {suggestion.qtyImpact} uds
          </span>
        )}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.ink, marginBottom: S[1] }}>
        {suggestion.title}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, marginBottom: S[2] }}>
        {suggestion.reason}
      </div>
      {suggestion.refs.length > 0 && (
        <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
          {suggestion.refs.slice(0, 6).map(ref => (
            <span key={ref} style={{
              fontFamily:   T.mono,
              fontSize:     T.sz["2xs"],
              color:        C.blueDark,
              background:   `${C.blueDark}0a`,
              border:       `1px solid ${C.blueDark}25`,
              borderRadius: R.sm,
              padding:      `2px ${S[2]}px`,
            }}>
              {ref}
            </span>
          ))}
          {suggestion.refs.length > 6 && (
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
              +{suggestion.refs.length - 6} más
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function VendorRow({ vendor }: { vendor: OperationalVendorImpact }) {
  const riskColor = RISK_COLOR[vendor.commercialRisk] ?? C.inkFaint;
  return (
    <div className="ag-op-row" style={{ borderBottom: `1px solid ${C.lineSubtle}` }}>
      <Cell flex>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600, color: C.ink }}>
          {vendor.salesRepName}
        </span>
      </Cell>
      <Cell w={80} align="right">
        <MonoNum accent={vendor.depletedRefs > 0 ? C.red : undefined}>{vendor.depletedRefs}</MonoNum>
      </Cell>
      <Cell w={80} align="right">
        <MonoNum accent={vendor.pressureRefs > 0 ? C.amber : undefined}>{vendor.pressureRefs}</MonoNum>
      </Cell>
      <Cell w={80} align="right">
        <MonoNum>{vendor.activeOrders}</MonoNum>
      </Cell>
      <Cell w={80} align="right">
        <MonoNum>{vendor.activeReservations}</MonoNum>
      </Cell>
      <Cell w={90} align="right">
        <MonoNum>{vendor.totalQtyReserved}</MonoNum>
      </Cell>
      <Cell w={80}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600, color: riskColor }}>
          {vendor.commercialRisk}
        </span>
      </Cell>
    </div>
  );
}

function WarehouseRow({ warehouse }: { warehouse: OperationalWarehousePressure }) {
  const urgencyColor = URGENCY_COLOR[warehouse.urgency] ?? C.inkFaint;
  return (
    <div className="ag-op-row" style={{ borderBottom: `1px solid ${C.lineSubtle}` }}>
      <Cell flex>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600, color: C.ink }}>
          {warehouse.warehouseName}
        </span>
      </Cell>
      <Cell w={80} align="right">
        <MonoNum>{warehouse.refs}</MonoNum>
      </Cell>
      <Cell w={120} align="right">
        <MonoNum>{warehouse.totalQtyDemanded}</MonoNum>
      </Cell>
      <Cell w={80}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600, color: urgencyColor }}>
          {warehouse.urgency}
        </span>
      </Cell>
    </div>
  );
}

function Cell({
  children, w, flex, align,
}: {
  children: React.ReactNode;
  w?: number;
  flex?: boolean;
  align?: "right" | "left";
}) {
  return (
    <div style={{
      width:     flex ? undefined : w,
      flex:      flex ? 1 : undefined,
      padding:   `${S[3]}px ${S[3]}px`,
      textAlign: align ?? "left",
      minWidth:  0,
    }}>
      {children}
    </div>
  );
}

function MonoNum({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: accent ?? C.ink }}>
      {children}
    </span>
  );
}
