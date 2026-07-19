"use client";

/**
 * IntelReferenceDrawer
 *
 * Explainability drawer for a single product reference.
 * Shows: why[], impacts[], suggestions[], related orders/vendors/reservations.
 *
 * Sprint: AGENTIK-OPERATIONAL-INTELLIGENCE-DASHBOARD-01
 */

import { OperationalSideDrawer, type DrawerSeverity } from "@/components/workspace/operational-side-drawer";
import { C, T, S, R }                                 from "@/lib/ui/tokens";
import type {
  OperationalIntelligenceReference,
  OperationalReferenceSuggestion,
  OperationalImpact,
} from "@/lib/operational-intelligence/operational-intelligence-types";

// ─── Severity mapping ─────────────────────────────────────────────────────────

const STATUS_SEVERITY: Record<string, DrawerSeverity> = {
  critical:  "critical",
  pressure:  "warning",
  warning:   "watch",
  stable:    "info",
  dead_stock: "info",
};

const STATUS_LABEL: Record<string, string> = {
  critical:  "CRÍTICO",
  pressure:  "PRESIÓN",
  warning:   "ATENCIÓN",
  stable:    "ESTABLE",
  dead_stock: "STOCK MUERTO",
};

const URGENCY_COLOR: Record<string, string> = {
  alta:   C.red,
  media:  C.amber,
  baja:   C.green,
  ninguna: C.inkFaint,
};

const SUGGESTION_TYPE_LABEL: Record<string, string> = {
  production: "Producción",
  transfer:   "Transferencia",
  reserve:    "Reservar",
  release:    "Liberar",
  review:     "Revisar",
  sync:       "Sincronizar",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function IntelReferenceDrawer({
  reference,
  open,
  onClose,
}: {
  reference: OperationalIntelligenceReference | null;
  open:      boolean;
  onClose:   () => void;
}) {
  if (!reference) return null;

  const severity = STATUS_SEVERITY[reference.status] ?? "info";
  const statusLbl = STATUS_LABEL[reference.status] ?? reference.status.toUpperCase();

  return (
    <OperationalSideDrawer
      open={open}
      onClose={onClose}
      title={reference.reference}
      subtitle={reference.description}
      severity={severity}
      statusLabel={statusLbl}
    >
      {/* ── Quantities ── */}
      <DrawerSection title="Estado operacional">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
          <KpiMini label="Físico" value={reference.physicalQty} />
          <KpiMini label="Reservado" value={reference.reservedQty} accent={reference.reservedQty > 0 ? C.amber : undefined} />
          <KpiMini label="Asignado portfolio" value={reference.salesAssignedQty} />
          <KpiMini label="Disponible operacional" value={reference.operationalAvailableQty}
            accent={reference.operationalAvailableQty <= 0 ? C.red : C.green} />
        </div>
      </DrawerSection>

      {/* ── Why ── */}
      {reference.why.length > 0 && (
        <DrawerSection title="Por qué está en este estado">
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: S[2] }}>
            {reference.why.map((reason, i) => (
              <li key={i} style={{
                fontFamily:   T.mono,
                fontSize:     T.sz.xs,
                color:        C.inkMid,
                padding:      `${S[2]}px ${S[3]}px`,
                background:   C.surface,
                borderLeft:   `3px solid ${C.line}`,
                borderRadius: `0 ${R.sm}px ${R.sm}px 0`,
              }}>
                {reason}
              </li>
            ))}
          </ul>
        </DrawerSection>
      )}

      {/* ── Suggestions ── */}
      {reference.suggestions.length > 0 && (
        <DrawerSection title="Acciones sugeridas">
          <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
            {reference.suggestions.map((s, i) => (
              <SuggestionRow key={i} suggestion={s} />
            ))}
          </div>
        </DrawerSection>
      )}

      {/* ── Impacts ── */}
      {reference.impacts.length > 0 && (
        <DrawerSection title="Entidades afectadas">
          <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
            {reference.impacts.map((impact, i) => (
              <ImpactRow key={i} impact={impact} />
            ))}
          </div>
        </DrawerSection>
      )}

      {/* ── Related ── */}
      <DrawerSection title="Contexto relacionado">
        <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
          <RelatedRow label="Pedidos activos" count={reference.activeOrderCount} ids={reference.relatedOrders} />
          <RelatedRow label="Reservas activas" count={reference.activeReservationCount} ids={reference.relatedReservations} />
          <RelatedRow label="Vendedores" count={reference.relatedVendors.length} ids={reference.relatedVendors} />
        </div>
        {reference.signalTypes.length > 0 && (
          <div style={{ marginTop: S[3], display: "flex", gap: S[2], flexWrap: "wrap" }}>
            {reference.signalTypes.map(sig => (
              <span key={sig} style={{
                fontFamily:    T.mono,
                fontSize:      T.sz["2xs"],
                color:         C.blueDark,
                padding:       `2px ${S[2]}px`,
                border:        `1px solid ${C.blueDark}30`,
                background:    `${C.blueDark}08`,
                borderRadius:  R.sm,
                textTransform: "uppercase" as const,
                letterSpacing: "0.06em",
              }}>
                {sig.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        )}
      </DrawerSection>
    </OperationalSideDrawer>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: S[5] }}>
      <div style={{
        fontFamily:    T.mono,
        fontSize:      T.sz["2xs"],
        fontWeight:    700,
        textTransform: "uppercase" as const,
        letterSpacing: "0.08em",
        color:         C.inkFaint,
        marginBottom:  S[3],
        paddingBottom: S[2],
        borderBottom:  `1px solid ${C.lineSubtle}`,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function KpiMini({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div style={{
      padding:      `${S[3]}px`,
      background:   C.surface,
      borderRadius: R.md,
      border:       `1px solid ${C.lineSubtle}`,
    }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginBottom: S[1] }}>
        {label}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: 700, color: accent ?? C.ink }}>
        {value}
      </div>
    </div>
  );
}

function SuggestionRow({ suggestion }: { suggestion: OperationalReferenceSuggestion }) {
  const urgencyColor = URGENCY_COLOR[suggestion.urgency] ?? C.inkFaint;
  return (
    <div style={{
      padding:      `${S[3]}px`,
      background:   C.surface,
      border:       `1px solid ${C.lineSubtle}`,
      borderLeft:   `3px solid ${urgencyColor}`,
      borderRadius: `0 ${R.md}px ${R.md}px 0`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[1] }}>
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz["2xs"],
          fontWeight:    700,
          textTransform: "uppercase" as const,
          color:         urgencyColor,
        }}>
          {SUGGESTION_TYPE_LABEL[suggestion.type] ?? suggestion.type}
        </span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
          · urgencia {suggestion.urgency}
        </span>
        {suggestion.qtyImpact !== undefined && (
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
            · {suggestion.qtyImpact} uds
          </span>
        )}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: C.ink, marginBottom: S[1] }}>
        {suggestion.label}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
        {suggestion.reason}
      </div>
    </div>
  );
}

function ImpactRow({ impact }: { impact: OperationalImpact }) {
  return (
    <div style={{
      display:      "flex",
      gap:          S[3],
      padding:      `${S[2]}px ${S[3]}px`,
      background:   C.surface,
      borderRadius: R.sm,
      border:       `1px solid ${C.lineSubtle}`,
    }}>
      <span style={{
        fontFamily:    T.mono,
        fontSize:      T.sz["2xs"],
        color:         C.inkFaint,
        textTransform: "uppercase" as const,
        minWidth:      64,
        paddingTop:    2,
      }}>
        {impact.type}
      </span>
      <div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600, color: C.ink }}>
          {impact.name}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
          {impact.description}
        </div>
      </div>
    </div>
  );
}

function RelatedRow({ label, count, ids }: { label: string; count: number; ids: string[] }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>{label}</span>
      <span style={{
        fontFamily: T.mono,
        fontSize:   T.sz.xs,
        fontWeight: 700,
        color:      count > 0 ? C.ink : C.inkFaint,
      }}>
        {count > 0 ? count : "—"}
      </span>
    </div>
  );
}
