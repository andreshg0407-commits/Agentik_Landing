"use client";

/**
 * app/(app)/[orgSlug]/agentik/marketing-studio/shopify/promociones/promociones-client.tsx
 *
 * SHOPIFY-MODULE-MATURITY-01 — Promociones Intelligence Console — Client Component
 *
 * Architecture:
 *   - Unified structure regardless of connection/data state
 *   - Placeholders replace all metrics when promotions is null
 *   - All actions route through Copilot → Intent Resolver → Policy → Runtime
 *   - OperationalSideDrawer for all detail panels (4 sections each)
 *   - Sofía guides every interaction — Shopify is only the data source
 *   - Language: natural business Spanish for Latin America
 *
 * Blocks:
 *   1. SofíaBanner    — contextual intelligence message (always visible)
 *   2. Timeline       — compact strip when connected, steps when onboarding
 *   3. ProtagonistBlock — active promotions (blue accent card)
 *   4. KpiGrid        — 8 indicator tiles, each with drawer
 *   5. ScheduledBlock — programmed campaigns (secondary protagonist)
 *   6. SignalsSection — Sofía's business signals
 */

import { useState, useCallback }       from "react";
import { C, T, S, R, E }              from "@/lib/ui/tokens";
import { OperationalSideDrawer }       from "@/components/workspace/operational-side-drawer";
import type { DrawerSeverity }         from "@/components/workspace/operational-side-drawer";
import { MSAgentSignal }               from "@/components/marketing-studio/shared/ms-agent-signal";

import type {
  PromotionListResult,
  ShopifyPromotionSummary,
}                                      from "@/lib/marketing-studio/commerce/shopify-promotions-types";

// ── Public types ───────────────────────────────────────────────────────────────

export interface PromocionesClientProps {
  orgSlug:    string;
  connected:  boolean;
  shopDomain: string;
  promotions: PromotionListResult | null;
}

type DrawerId =
  | "activas" | "programadas" | "por_vencer" | "codigos"
  | "descuento_prom" | "uso_total" | "agentik" | "alertas";

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtPct(n: number): string {
  return `${n.toFixed(0)}%`;
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat("es-CO").format(n);
}

function promoValue(p: ShopifyPromotionSummary): string {
  return p.valueType === "percentage"
    ? `${p.value}% dto.`
    : `$${fmtNum(p.value)} dto.`;
}

function promoDates(p: ShopifyPromotionSummary): string {
  const start = new Date(p.startsAt).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
  if (!p.endsAt) return `Desde ${start}`;
  const end = new Date(p.endsAt).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
  return `${start} → ${end}`;
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

// ── Activation steps ───────────────────────────────────────────────────────────

const STEPS = [
  { label: "Conectar tienda Shopify" },
  { label: "Sincronizar promociones activas" },
  { label: "Sofía analiza tu estrategia de descuentos" },
  { label: "Activar recomendaciones y alertas" },
];

// ── Pill badge ─────────────────────────────────────────────────────────────────

function Pill({
  label, color = C.inkMid, bg = C.surfaceAlt, border = C.line,
}: { label: string; color?: string; bg?: string; border?: string }) {
  return (
    <span style={{
      fontFamily: T.mono, fontSize: T.sz.xs, color,
      background: bg, border: `1px solid ${border}`,
      borderRadius: R.pill, padding: `2px ${S[2]}px`,
      whiteSpace: "nowrap" as const, flexShrink: 0,
    }}>
      {label}
    </span>
  );
}

const STATUS_PILL: Record<string, { color: string; bg: string; border: string; label: string }> = {
  active:    { color: C.green,    bg: C.greenLight, border: C.greenBorder, label: "Activa"      },
  scheduled: { color: C.blueDark, bg: C.blueLight,  border: C.blueBorder,  label: "Programada"  },
  expired:   { color: C.inkMid,   bg: C.surfaceAlt, border: C.line,        label: "Finalizada"  },
  disabled:  { color: C.red,      bg: C.redLight,   border: C.redBorder,   label: "Desactivada" },
  draft:     { color: C.inkMid,   bg: C.surfaceAlt, border: C.line,        label: "Borrador"    },
};

// ── Promo row (in drawers and protagonist) ─────────────────────────────────────

function PromoRow({ promo }: { promo: ShopifyPromotionSummary }) {
  const pill = STATUS_PILL[promo.status] ?? STATUS_PILL.expired;
  return (
    <div className="ag-op-row" style={{ alignItems: "center", gap: S[3] }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, fontWeight: T.wt.medium }}>
          {promo.title}
          {promo.managedByAgentik && (
            <span style={{
              marginLeft: S[2], fontFamily: T.mono, fontSize: T.sz["2xs"],
              color: C.blueDark, background: C.blueLight,
              border: `1px solid ${C.blueBorder}`, borderRadius: R.pill,
              padding: `1px ${S[1]}px`,
            }}>
              Agentik
            </span>
          )}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, marginTop: 2 }}>
          {promoValue(promo)}
          {promo.code && <span style={{ marginLeft: S[2] }}>· {promo.code}</span>}
          <span style={{ marginLeft: S[2] }}>· {promoDates(promo)}</span>
        </div>
      </div>
      {promo.usageLimit != null && (
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, flexShrink: 0 }}>
          {promo.currentUsage}/{promo.usageLimit} usos
        </span>
      )}
      <Pill label={pill.label} color={pill.color} bg={pill.bg} border={pill.border} />
    </div>
  );
}

// ── Placeholder row ────────────────────────────────────────────────────────────

function PlaceholderRow() {
  return (
    <div className="ag-op-row" style={{ alignItems: "center", gap: S[3] }}>
      <div style={{ flex: 1 }}>
        <div style={{ width: "55%", height: 10, borderRadius: R.sm, background: C.surfaceAlt }} />
        <div style={{ width: "35%", height: 8, borderRadius: R.sm, background: C.surfaceAlt, marginTop: 5 }} />
      </div>
      <div style={{ width: 48, height: 8, borderRadius: R.pill, background: C.surfaceAlt }} />
    </div>
  );
}

// ── KPI card ───────────────────────────────────────────────────────────────────

function KpiCard({
  icon, label, value, sub, noDataHint, variant, onClick,
}: {
  icon:       string;
  label:      string;
  value:      string | null;
  sub:        string | null;
  noDataHint: string;
  variant:    "ok" | "warning" | "critical" | "neutral";
  onClick:    () => void;
}) {
  const variantColor =
    variant === "ok"       ? C.green   :
    variant === "warning"  ? C.amber   :
    variant === "critical" ? C.red     : C.inkFaint;

  return (
    <button
      onClick={onClick}
      style={{
        flex:          "1 1 200px",
        minWidth:      0,
        border:        `1px solid ${C.line}`,
        borderRadius:  R.xl,
        padding:       `${S[4]}px`,
        background:    C.white,
        boxShadow:     E.xs,
        textAlign:     "left" as const,
        cursor:        "pointer",
        display:       "flex",
        flexDirection: "column" as const,
        gap:           S[1],
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{
          width: 8, height: 8, borderRadius: "50%",
          background: variantColor, flexShrink: 0,
        }} />
      </div>
      {value !== null ? (
        <>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xl"], fontWeight: T.wt.bold, color: C.titleDeep, lineHeight: 1.15 }}>
            {value}
          </div>
          {sub && (
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
              {sub}
            </div>
          )}
        </>
      ) : (
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, lineHeight: 1.55, marginTop: S[1] }}>
          {noDataHint}
        </div>
      )}
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: "auto", paddingTop: S[2] }}>
        {label}
      </div>
    </button>
  );
}

// ── Drawer section wrapper ─────────────────────────────────────────────────────

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: S[5] }}>
      <div style={{
        fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
        color: C.inkFaint, textTransform: "uppercase" as const,
        letterSpacing: "0.09em", marginBottom: S[3],
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

// ── Action button (drawer) ─────────────────────────────────────────────────────

function DrawerAction({
  label, intent, executing, result, onExecute,
}: {
  label:     string;
  intent:    string;
  executing: string | null;
  result?:   { status: string; message: string };
  onExecute: (intent: string) => void;
}) {
  const isRunning = executing === intent;
  return (
    <div style={{ marginBottom: S[2] }}>
      <button
        onClick={() => onExecute(intent)}
        disabled={!!executing}
        style={{
          display:      "block",
          width:        "100%",
          textAlign:    "left" as const,
          fontFamily:   T.mono,
          fontSize:     T.sz.sm,
          color:        isRunning ? C.inkFaint : C.blueDark,
          background:   C.blueLight,
          border:       `1px solid ${C.blueBorder}`,
          borderRadius: R.lg,
          padding:      `${S[2]}px ${S[3]}px`,
          cursor:       executing ? "default" : "pointer",
          opacity:      executing && !isRunning ? 0.5 : 1,
        }}
      >
        {isRunning ? "Enviando a Sofía…" : `→ ${label}`}
      </button>
      {result && (
        <div style={{
          fontFamily: T.mono, fontSize: T.sz.xs, marginTop: S[1],
          color: result.status === "ok" ? C.green : C.red,
        }}>
          {result.message}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function PromocionesClient({
  orgSlug, connected, shopDomain, promotions,
}: PromocionesClientProps) {

  const [openDrawer,  setOpenDrawer]  = useState<DrawerId | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [results,     setResults]     = useState<Record<string, { status: string; message: string }>>({});

  const hasData    = promotions !== null;
  const isCompact  = connected && hasData;

  // ── Computed indicators ──────────────────────────────────────────────────
  const activeList    = promotions?.active    ?? [];
  const scheduledList = promotions?.scheduled ?? [];
  const expiredList   = promotions?.expired   ?? [];
  const disabledList  = promotions?.disabled  ?? [];

  const activeCount    = activeList.length;
  const scheduledCount = scheduledList.length;

  const porVencer = activeList.filter(
    p => p.endsAt && daysUntil(p.endsAt) <= 7 && daysUntil(p.endsAt) >= 0,
  );

  const codesActivos = activeList.filter(p => p.code !== null);
  const codesCount   = codesActivos.length;

  const pctPromos   = activeList.filter(p => p.valueType === "percentage");
  const avgDescuento = pctPromos.length > 0
    ? pctPromos.reduce((acc, p) => acc + p.value, 0) / pctPromos.length
    : null;

  const totalUsos    = [...activeList, ...expiredList].reduce((acc, p) => acc + p.currentUsage, 0);
  const agentikCount = activeList.filter(p => p.managedByAgentik).length;
  const alertCount   = disabledList.length + porVencer.length;

  // ── Execute action ───────────────────────────────────────────────────────
  const executeAction = useCallback(async (intent: string) => {
    setExecutingId(intent);
    try {
      const resp = await fetch(`/api/orgs/${orgSlug}/marketing-studio/execution`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ intent, channel: "shopify", module: "promotions" }),
      });
      const data = await resp.json();
      setResults(prev => ({
        ...prev,
        [intent]: data.ok
          ? { status: "ok",    message: data.message ?? "Solicitud enviada a Sofía" }
          : { status: "error", message: data.error   ?? "Error al procesar" },
      }));
    } catch {
      setResults(prev => ({ ...prev, [intent]: { status: "error", message: "Error de conexión" } }));
    } finally {
      setExecutingId(null);
    }
  }, [orgSlug]);

  // ── Drawer config ────────────────────────────────────────────────────────
  type DrawerConfig = { title: string; subtitle?: string; severity: DrawerSeverity };

  const drawerConfig = (id: DrawerId | null): DrawerConfig => {
    switch (id) {
      case "activas":
        return {
          title:    "Promociones activas",
          subtitle: `${activeCount} promoción${activeCount !== 1 ? "es" : ""} vigente${activeCount !== 1 ? "s" : ""} · ${shopDomain || "Tienda"}`,
          severity: activeCount > 0 ? "info" : "watch",
        };
      case "programadas":
        return {
          title:    "Campañas programadas",
          subtitle: `${scheduledCount} pendiente${scheduledCount !== 1 ? "s" : ""} de activarse`,
          severity: "info",
        };
      case "por_vencer":
        return {
          title:    "Próximas a vencer",
          subtitle: porVencer.length > 0 ? `${porVencer.length} vencen en los próximos 7 días` : "Sin vencimientos inmediatos",
          severity: porVencer.length > 0 ? "warning" : "info",
        };
      case "codigos":
        return {
          title:    "Códigos de descuento",
          subtitle: `${codesCount} código${codesCount !== 1 ? "s" : ""} activo${codesCount !== 1 ? "s" : ""} en circulación`,
          severity: "info",
        };
      case "descuento_prom":
        return {
          title:    "Descuento promedio",
          subtitle: avgDescuento !== null ? `Promedio: ${fmtPct(avgDescuento)} en promociones porcentuales` : "Sin datos de descuentos activos",
          severity: avgDescuento && avgDescuento > 40 ? "warning" : "info",
        };
      case "uso_total":
        return {
          title:    "Usos registrados",
          subtitle: `${fmtNum(totalUsos)} usos acumulados en promociones`,
          severity: "info",
        };
      case "agentik":
        return {
          title:    "Promociones de Agentik",
          subtitle: `${agentikCount} gestionada${agentikCount !== 1 ? "s" : ""} por Sofía`,
          severity: "info",
        };
      case "alertas":
        return {
          title:    "Alertas de promociones",
          subtitle: alertCount > 0 ? `${alertCount} requieren revisión` : "Sin alertas activas",
          severity: alertCount > 0 ? "warning" : "info",
        };
      default:
        return { title: "Detalle", severity: "info" };
    }
  };

  const cfg = drawerConfig(openDrawer);

  // ── Sofía messages ───────────────────────────────────────────────────────
  const sofiaText = !connected
    ? "Analizaré el comportamiento de tus promociones cuando la tienda esté conectada. Detectaré oportunidades para aumentar las ventas y te avisaré cuando una campaña necesite atención."
    : !hasData
    ? "Estoy sincronizando los datos de tus promociones. En breve mostraré el estado de tus descuentos activos y campañas."
    : activeCount === 0
    ? "No hay promociones activas en este momento. Si deseas impulsar las ventas, puedo ayudarte a crear una campaña de descuentos."
    : `Tienes ${activeCount} promoción${activeCount !== 1 ? "es" : ""} activa${activeCount !== 1 ? "s" : ""}${porVencer.length > 0 ? ` y ${porVencer.length} próxima${porVencer.length !== 1 ? "s" : ""} a vencer.` : "."} ${avgDescuento !== null ? `El descuento promedio es del ${fmtPct(avgDescuento)}.` : ""}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[4], paddingTop: S[4] }}>

      {/* ── 1. Sofía banner ─────────────────────────────────────────────── */}
      <MSAgentSignal
        text={sofiaText}
        agentLabel="Sofía · Comercio"
        variant={connected && activeCount > 0 ? "positive" : "dark"}
      />

      {/* ── 2. Activation timeline ──────────────────────────────────────── */}
      {isCompact ? (
        <div style={{
          background: C.greenLight, border: `1px solid ${C.greenBorder}`,
          borderRadius: R.xl, padding: `${S[2]}px ${S[4]}px`,
          fontFamily: T.mono, fontSize: T.sz.xs, color: C.green,
          display: "flex", alignItems: "center", gap: S[2],
        }}>
          <span>✓</span>
          <span>Tienda activa · Promociones sincronizadas · Sofía monitoreando campañas</span>
        </div>
      ) : (
        <div style={{
          border: `1px solid ${C.line}`, borderRadius: R.xl,
          padding: `${S[4]}px ${S[5]}px`, background: C.white, boxShadow: E.xs,
        }}>
          <div style={{
            fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
            color: C.inkFaint, textTransform: "uppercase" as const,
            letterSpacing: "0.09em", marginBottom: S[3],
          }}>
            Pasos de activación
          </div>
          <div style={{ display: "flex", gap: S[2], alignItems: "center", flexWrap: "wrap" as const }}>
            {STEPS.map((step, i) => {
              const done = connected && i === 0;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%",
                    background: done ? C.blueDark : C.surfaceAlt,
                    border: `1px solid ${done ? C.blueDark : C.line}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    {done
                      ? <span style={{ color: C.white, fontSize: 9, fontWeight: T.wt.bold }}>✓</span>
                      : <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{i + 1}</span>
                    }
                  </div>
                  <span style={{
                    fontFamily: T.mono, fontSize: T.sz.xs,
                    color: done ? C.ink : i === 1 && !connected ? C.inkFaint : i === 0 && !connected ? C.blueDark : C.inkFaint,
                    fontWeight: i === 0 && !connected ? T.wt.semibold : T.wt.normal,
                  }}>
                    {step.label}
                  </span>
                  {i < STEPS.length - 1 && (
                    <span style={{ color: C.lineSubtle, fontFamily: T.mono, fontSize: T.sz.xs }}>→</span>
                  )}
                </div>
              );
            })}
          </div>
          {!connected && (
            <a
              href={`/${orgSlug}/agentik/marketing-studio/shopify`}
              style={{
                display: "inline-block", marginTop: S[3],
                fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
                color: C.white, background: C.blueDark,
                border: `1px solid ${C.blueDark}`, borderRadius: R.lg,
                padding: `${S[2]}px ${S[4]}px`, textDecoration: "none",
              }}
            >
              Conectar tienda Shopify
            </a>
          )}
        </div>
      )}

      {/* ── 3. Protagonist: active promotions ───────────────────────────── */}
      <div style={{
        border:       `1px solid ${C.line}`,
        borderTop:    `3px solid ${C.blueDark}`,
        borderRadius: R.xl,
        padding:      `${S[5]}px`,
        background:   C.white,
        boxShadow:    E.sm,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: S[4] }}>
          <div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.09em" }}>
              Estado de las promociones
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xl"], fontWeight: T.wt.bold, color: C.titleDeep, lineHeight: 1.2, marginTop: S[1] }}>
              {hasData ? `${activeCount}` : "–"}
              <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.normal, color: C.inkMid, marginLeft: S[2] }}>
                {hasData ? `activa${activeCount !== 1 ? "s" : ""} · ${scheduledCount} programada${scheduledCount !== 1 ? "s" : ""}` : "Disponible al conectar la tienda"}
              </span>
            </div>
          </div>
          <button
            onClick={() => setOpenDrawer("activas")}
            style={{
              fontFamily: T.mono, fontSize: T.sz.xs,
              color: C.blueDark, background: C.blueLight,
              border: `1px solid ${C.blueBorder}`, borderRadius: R.lg,
              padding: `${S[1]}px ${S[3]}px`, cursor: "pointer",
            }}
          >
            Ver detalle →
          </button>
        </div>

        <div className="ag-op-table">
          {hasData && activeList.length > 0
            ? activeList.slice(0, 5).map(p => <PromoRow key={p.id} promo={p} />)
            : hasData && activeList.length === 0
            ? (
              <div style={{
                padding: `${S[6]}px ${S[4]}px`, textAlign: "center",
                fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid,
              }}>
                Sin promociones activas. Sofía puede ayudarte a crear una campaña.
              </div>
            )
            : [1, 2, 3].map(i => <PlaceholderRow key={i} />)
          }
        </div>
      </div>

      {/* ── 4. KPI grid ─────────────────────────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: S[3],
      }}>
        <KpiCard
          icon="🏷️"
          label="Promociones activas"
          value={hasData ? String(activeCount) : null}
          sub={hasData ? `${scheduledCount} programada${scheduledCount !== 1 ? "s" : ""}` : null}
          noDataHint="Mostrará cuántas promociones están vigentes ahora mismo."
          variant={hasData ? (activeCount > 0 ? "ok" : "neutral") : "neutral"}
          onClick={() => setOpenDrawer("activas")}
        />
        <KpiCard
          icon="📅"
          label="Campañas programadas"
          value={hasData ? String(scheduledCount) : null}
          sub={hasData ? "próximas a activarse" : null}
          noDataHint="Campañas con fecha de inicio futura, esperando activarse."
          variant={hasData ? (scheduledCount > 0 ? "ok" : "neutral") : "neutral"}
          onClick={() => setOpenDrawer("programadas")}
        />
        <KpiCard
          icon="⏰"
          label="Próximas a vencer"
          value={hasData ? String(porVencer.length) : null}
          sub={hasData ? "vencen en 7 días" : null}
          noDataHint="Sofía te alertará cuando una promoción esté por terminar."
          variant={hasData ? (porVencer.length > 0 ? "warning" : "neutral") : "neutral"}
          onClick={() => setOpenDrawer("por_vencer")}
        />
        <KpiCard
          icon="🔑"
          label="Códigos activos"
          value={hasData ? String(codesCount) : null}
          sub={hasData ? "en circulación" : null}
          noDataHint="Cantidad de códigos de descuento que los clientes pueden usar."
          variant={hasData ? (codesCount > 0 ? "ok" : "neutral") : "neutral"}
          onClick={() => setOpenDrawer("codigos")}
        />
        <KpiCard
          icon="📉"
          label="Descuento promedio"
          value={hasData && avgDescuento !== null ? fmtPct(avgDescuento) : hasData ? "—" : null}
          sub={hasData ? "en promociones porcentuales" : null}
          noDataHint="Promedio de descuento aplicado en tus promociones activas."
          variant={hasData && avgDescuento !== null ? (avgDescuento > 40 ? "warning" : "ok") : "neutral"}
          onClick={() => setOpenDrawer("descuento_prom")}
        />
        <KpiCard
          icon="🎯"
          label="Usos totales"
          value={hasData ? fmtNum(totalUsos) : null}
          sub={hasData ? "usos acumulados" : null}
          noDataHint="Total de veces que se han utilizado tus descuentos."
          variant={hasData ? (totalUsos > 0 ? "ok" : "neutral") : "neutral"}
          onClick={() => setOpenDrawer("uso_total")}
        />
        <KpiCard
          icon="🤖"
          label="Gestionadas por Sofía"
          value={hasData ? String(agentikCount) : null}
          sub={hasData ? "creadas por Agentik" : null}
          noDataHint="Promociones que Sofía gestiona automáticamente por ti."
          variant={hasData ? (agentikCount > 0 ? "ok" : "neutral") : "neutral"}
          onClick={() => setOpenDrawer("agentik")}
        />
        <KpiCard
          icon="🔔"
          label="Alertas importantes"
          value={hasData ? String(alertCount) : null}
          sub={hasData ? "requieren revisión" : null}
          noDataHint="Sofía te alertará sobre promociones desactivadas o vencidas."
          variant={hasData ? (alertCount > 0 ? "warning" : "neutral") : "neutral"}
          onClick={() => setOpenDrawer("alertas")}
        />
      </div>

      {/* ── 5. Scheduled block ──────────────────────────────────────────── */}
      {(scheduledList.length > 0 || !hasData) && (
        <div style={{
          border: `1px solid ${C.line}`, borderRadius: R.xl,
          padding: `${S[5]}px`, background: C.white, boxShadow: E.xs,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: S[4] }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.09em" }}>
              Campañas programadas
            </div>
            <button
              onClick={() => setOpenDrawer("programadas")}
              style={{
                fontFamily: T.mono, fontSize: T.sz.xs,
                color: C.inkFaint, background: "transparent",
                border: "none", cursor: "pointer", padding: `${S[1]}px ${S[2]}px`,
              }}
            >
              Ver todas →
            </button>
          </div>
          <div className="ag-op-table">
            {hasData && scheduledList.length > 0
              ? scheduledList.slice(0, 4).map(p => <PromoRow key={p.id} promo={p} />)
              : hasData
              ? (
                <div style={{
                  padding: `${S[4]}px`, textAlign: "center",
                  fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid,
                }}>
                  Sin campañas programadas. Puedes planificar descuentos futuros con Sofía.
                </div>
              )
              : [1, 2].map(i => <PlaceholderRow key={i} />)
            }
          </div>
        </div>
      )}

      {/* ── 6. Sofía signals ────────────────────────────────────────────── */}
      <div style={{
        border: `1px solid ${C.line}`, borderRadius: R.xl,
        padding: `${S[5]}px`, background: C.white, boxShadow: E.xs,
      }}>
        <div style={{
          fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
          color: C.inkFaint, textTransform: "uppercase" as const,
          letterSpacing: "0.09em", marginBottom: S[4],
        }}>
          Recomendaciones de Sofía
        </div>
        <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>
          {!connected && (
            <MSAgentSignal
              text="Conecta tu tienda y analizaré tu historial de descuentos para recomendarte la estrategia óptima."
              agentLabel="Sofía · Comercio"
              variant="dark"
            />
          )}
          {connected && !hasData && (
            <MSAgentSignal
              text="Estoy cargando los datos de tus promociones. En breve tendré recomendaciones personalizadas."
              agentLabel="Sofía · Comercio"
              variant="dark"
            />
          )}
          {connected && hasData && porVencer.length > 0 && (
            <MSAgentSignal
              text={`Tienes ${porVencer.length} promoción${porVencer.length !== 1 ? "es" : ""} que vence${porVencer.length !== 1 ? "n" : ""} en los próximos 7 días. Considera renovarlas o programar una campaña de continuidad.`}
              agentLabel="Sofía · Comercio"
              variant="positive"
              action={{ label: "Revisar vencimientos", href: "#" }}
            />
          )}
          {connected && hasData && activeCount === 0 && (
            <MSAgentSignal
              text="No hay promociones activas. Impulsar ventas con un descuento del 10-15% puede aumentar la conversión en un período sin pico estacional."
              agentLabel="Sofía · Comercio"
              variant="dark"
            />
          )}
          {connected && hasData && activeCount > 0 && avgDescuento !== null && avgDescuento > 40 && (
            <MSAgentSignal
              text={`El descuento promedio de ${fmtPct(avgDescuento)} es elevado. Descuentos frecuentes por encima del 40% pueden erosionar el margen percibido.`}
              agentLabel="Sofía · Comercio"
              variant="positive"
            />
          )}
          {connected && hasData && agentikCount === 0 && (
            <MSAgentSignal
              text="Ninguna promoción está siendo gestionada por Sofía. Puedo ayudarte a automatizar campañas recurrentes."
              agentLabel="Sofía · Comercio"
              variant="dark"
            />
          )}
        </div>
      </div>

      {/* ── Drawer ──────────────────────────────────────────────────────── */}
      <OperationalSideDrawer
        open={openDrawer !== null}
        onClose={() => setOpenDrawer(null)}
        title={cfg.title}
        subtitle={cfg.subtitle}
        severity={cfg.severity}
      >
        {/* Section 1: Resumen */}
        <DrawerSection title="Resumen">
          {openDrawer === "activas" && (
            <p style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, lineHeight: 1.7, margin: 0 }}>
              {hasData
                ? `Hay ${activeCount} promoción${activeCount !== 1 ? "es" : ""} activa${activeCount !== 1 ? "s" : ""} en tu tienda ahora mismo. ${porVencer.length > 0 ? `${porVencer.length} de ellas vence${porVencer.length !== 1 ? "n" : ""} en los próximos 7 días.` : "Ninguna está próxima a vencer."}`
                : "Disponible al conectar la tienda Shopify."}
            </p>
          )}
          {openDrawer === "programadas" && (
            <p style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, lineHeight: 1.7, margin: 0 }}>
              {hasData
                ? `${scheduledCount} campaña${scheduledCount !== 1 ? "s" : ""} está${scheduledCount !== 1 ? "n" : ""} programada${scheduledCount !== 1 ? "s" : ""} para activarse próximamente.`
                : "Disponible al conectar la tienda Shopify."}
            </p>
          )}
          {openDrawer === "por_vencer" && (
            <div className="ag-op-table">
              {hasData && porVencer.length > 0
                ? porVencer.map(p => (
                    <div key={p.id} className="ag-op-row" style={{ alignItems: "center", gap: S[3] }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink }}>{p.title}</div>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>{promoValue(p)}</div>
                      </div>
                      <Pill
                        label={`${daysUntil(p.endsAt!)}d`}
                        color={daysUntil(p.endsAt!) <= 2 ? C.red : C.amber}
                        bg={daysUntil(p.endsAt!) <= 2 ? C.redLight : C.amberLight}
                        border={daysUntil(p.endsAt!) <= 2 ? C.redBorder : C.amberBorder}
                      />
                    </div>
                  ))
                : <p style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid, margin: 0 }}>
                    {hasData ? "Ninguna promoción vence en los próximos 7 días." : "Disponible al conectar la tienda."}
                  </p>
              }
            </div>
          )}
          {openDrawer === "codigos" && (
            <div className="ag-op-table">
              {hasData && codesActivos.length > 0
                ? codesActivos.map(p => (
                    <div key={p.id} className="ag-op-row" style={{ alignItems: "center", gap: S[3] }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink }}>{p.code}</div>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>{p.title} · {promoValue(p)}</div>
                      </div>
                      {p.usageLimit != null && (
                        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>{p.currentUsage}/{p.usageLimit}</span>
                      )}
                    </div>
                  ))
                : <p style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid, margin: 0 }}>
                    {hasData ? "Sin códigos activos en este momento." : "Disponible al conectar la tienda."}
                  </p>
              }
            </div>
          )}
          {(openDrawer === "descuento_prom" || openDrawer === "uso_total" || openDrawer === "agentik" || openDrawer === "alertas") && (
            <p style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, lineHeight: 1.7, margin: 0 }}>
              {!hasData
                ? "Disponible al conectar la tienda Shopify."
                : openDrawer === "descuento_prom"
                ? avgDescuento !== null
                  ? `Descuento promedio activo: ${fmtPct(avgDescuento)}. Basado en ${pctPromos.length} promoción${pctPromos.length !== 1 ? "es" : ""} porcentual${pctPromos.length !== 1 ? "es" : ""}.`
                  : "No hay promociones porcentuales activas en este momento."
                : openDrawer === "uso_total"
                ? `${fmtNum(totalUsos)} usos registrados entre promociones activas y finalizadas.`
                : openDrawer === "agentik"
                ? `${agentikCount} promoción${agentikCount !== 1 ? "es" : ""} gestionada${agentikCount !== 1 ? "s" : ""} por Sofía. El resto fueron creadas manualmente.`
                : `${alertCount} elemento${alertCount !== 1 ? "s" : ""} requieren revisión: ${disabledList.length} desactivada${disabledList.length !== 1 ? "s" : ""} y ${porVencer.length} próxima${porVencer.length !== 1 ? "s" : ""} a vencer.`
              }
            </p>
          )}
        </DrawerSection>

        {/* Section 2: Evolución */}
        <DrawerSection title="Evolución">
          <p style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid, lineHeight: 1.7, margin: 0 }}>
            {!hasData
              ? "El historial de evolución estará disponible al conectar la tienda."
              : "El análisis de evolución comparará el período actual con las últimas 4 semanas para detectar tendencias en el uso de descuentos."}
          </p>
        </DrawerSection>

        {/* Section 3: Análisis de Sofía */}
        <DrawerSection title="Análisis de Sofía">
          <p style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, lineHeight: 1.7, margin: 0 }}>
            {!connected
              ? "Conecta la tienda y analizaré el comportamiento de tus descuentos para identificar oportunidades de optimización."
              : !hasData
              ? "Cargando análisis…"
              : openDrawer === "activas" && activeCount === 0
              ? "No hay promociones activas. Una campaña de descuentos bien segmentada puede aumentar significativamente la conversión, especialmente fuera de temporadas altas."
              : openDrawer === "por_vencer" && porVencer.length > 0
              ? "Varias promociones están por vencer. Considera si quieres renovarlas, extenderlas o dejarlas expirar para medir el impacto en las ventas."
              : openDrawer === "descuento_prom" && avgDescuento !== null && avgDescuento > 40
              ? "Un descuento promedio superior al 40% puede afectar la percepción de valor de tu marca. Te recomiendo segmentar los descuentos elevados a clientes específicos."
              : openDrawer === "alertas" && alertCount > 0
              ? "Hay elementos que requieren atención. Revisa las promociones desactivadas y considera si alguna debería estar activa actualmente."
              : "Todo está en orden en este indicador. Seguiré monitoreando y te avisaré si hay cambios relevantes."
            }
          </p>
        </DrawerSection>

        {/* Section 4: Acciones sugeridas */}
        <DrawerSection title="Acciones sugeridas">
          <DrawerAction
            label="Crear nuevo descuento"
            intent="promotion.create"
            executing={executingId}
            result={results["promotion.create"]}
            onExecute={executeAction}
          />
          <DrawerAction
            label="Generar códigos de descuento"
            intent="promotion.generate_codes"
            executing={executingId}
            result={results["promotion.generate_codes"]}
            onExecute={executeAction}
          />
          <DrawerAction
            label="Duplicar campaña activa"
            intent="promotion.duplicate"
            executing={executingId}
            result={results["promotion.duplicate"]}
            onExecute={executeAction}
          />
          <DrawerAction
            label="Programar campaña futura"
            intent="promotion.schedule"
            executing={executingId}
            result={results["promotion.schedule"]}
            onExecute={executeAction}
          />
          <DrawerAction
            label="Analizar impacto de descuentos"
            intent="promotion.analyze_impact"
            executing={executingId}
            result={results["promotion.analyze_impact"]}
            onExecute={executeAction}
          />
        </DrawerSection>
      </OperationalSideDrawer>
    </div>
  );
}
