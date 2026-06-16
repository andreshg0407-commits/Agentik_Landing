"use client";

/**
 * app/(app)/[orgSlug]/agentik/marketing-studio/shopify/promociones/promociones-client.tsx
 *
 * SHOPIFY-MODULE-MATURITY-03 — Promociones: Centro de Campañas
 * AGENTIK-COPILOT-BOUNDARIES-01 — Copilot lives in the right rail only
 *
 * Identity: this module is a campaign management center, not a metrics grid.
 *   - Protagonist block shows campaign state + distribution bar
 *   - Context-aware drawer actions (getPromotionDrawerActions)
 *   - Canvas contains only module data
 *   - Right rail + drawer "Análisis de Sofía" section carry Copilot intelligence
 */

import { useState, useCallback }       from "react";
import { C, T, S, R, E }              from "@/lib/ui/tokens";
import { OperationalSideDrawer }       from "@/components/workspace/operational-side-drawer";
import type { DrawerSeverity }         from "@/components/workspace/operational-side-drawer";
import {
  ShopifyKpiCard,
  ShopifyDrawerSection,
  ShopifyDrawerAction,
  ShopifyPlaceholderRow,
  ShopifyActivationTimeline,
  ShopifyDistributionBar,
}                                      from "@/components/marketing-studio/shopify/shopify-module-primitives";

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

function fmtPct(n: number): string { return `${n.toFixed(0)}%`; }

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

const ACTIVATION_STEPS = [
  "Conectar tienda Shopify",
  "Sincronizar promociones activas",
  "Revisar estrategia de descuentos",
  "Activar alertas y automatizaciones",
];

// ── Context-aware drawer actions ───────────────────────────────────────────────

type ActionSpec = { label: string; intent: string };

interface PromotionActionCtx {
  drawerId:      DrawerId;
  activeCount:   number;
  porVencerCount: number;
  avgDescuento:  number | null;
  codesCount:    number;
  alertCount:    number;
  scheduledCount: number;
}

function getPromotionDrawerActions(ctx: PromotionActionCtx): ActionSpec[] {
  const { drawerId, activeCount, porVencerCount, avgDescuento, codesCount, alertCount } = ctx;

  if (drawerId === "activas") {
    if (activeCount === 0) return [
      { label: "Crear campaña de descuento",    intent: "promotion.create"           },
      { label: "Generar códigos promocionales", intent: "promotion.generate_codes"   },
      { label: "Programar campaña futura",      intent: "promotion.schedule"         },
    ];
    if (porVencerCount > 0) return [
      { label: "Extender vigencia de campaña",      intent: "promotion.extend_validity"   },
      { label: "Duplicar campaña activa",           intent: "promotion.duplicate"         },
      { label: "Programar campaña de continuidad",  intent: "promotion.schedule_followup" },
    ];
    return [
      { label: "Duplicar campaña activa",           intent: "promotion.duplicate"      },
      { label: "Crear nueva campaña",               intent: "promotion.create"         },
      { label: "Analizar impacto de descuentos",    intent: "promotion.analyze_impact" },
    ];
  }

  if (drawerId === "por_vencer") return [
    { label: "Extender vigencia",                 intent: "promotion.extend_validity"   },
    { label: "Duplicar y reprogramar",            intent: "promotion.duplicate"         },
    { label: "Programar campaña de continuidad",  intent: "promotion.schedule_followup" },
  ];

  if (drawerId === "programadas") return [
    { label: "Revisar campañas programadas",      intent: "promotion.review_scheduled" },
    { label: "Adelantar inicio de campaña",       intent: "promotion.advance_start"    },
    { label: "Crear nueva campaña programada",    intent: "promotion.schedule"         },
  ];

  if (drawerId === "descuento_prom" && avgDescuento !== null && avgDescuento > 40) return [
    { label: "Revisar margen de descuentos",      intent: "promotion.review_margin"    },
    { label: "Reducir descuento en campaña",      intent: "promotion.reduce_discount"  },
    { label: "Segmentar campaña por cliente",     intent: "promotion.segment_campaign" },
  ];

  if (drawerId === "codigos" && codesCount > 0) return [
    { label: "Revisar uso de códigos",            intent: "promotion.review_codes"   },
    { label: "Generar nuevos códigos",            intent: "promotion.generate_codes" },
    { label: "Pausar códigos de bajo uso",        intent: "promotion.pause_codes"    },
  ];

  if (drawerId === "alertas" && alertCount > 0) return [
    { label: "Revisar alertas de campaña",        intent: "promotion.review_alerts"   },
    { label: "Reactivar promociones pausadas",    intent: "promotion.reactivate"      },
    { label: "Extender campañas por vencer",      intent: "promotion.extend_validity" },
  ];

  if (drawerId === "agentik") return [
    { label: "Ver campañas de Agentik",           intent: "promotion.list_agentik"   },
    { label: "Crear campaña automatizada",        intent: "promotion.create_auto"    },
    { label: "Revisar reglas de automatización",  intent: "promotion.review_rules"   },
  ];

  // Default: contextual fallback
  return [
    { label: "Crear campaña de descuento",        intent: "promotion.create"         },
    { label: "Generar códigos promocionales",     intent: "promotion.generate_codes" },
    { label: "Analizar impacto de descuentos",    intent: "promotion.analyze_impact" },
  ];
}

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

// ── Promo row ─────────────────────────────────────────────────────────────────

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

// ── Main component ─────────────────────────────────────────────────────────────

export function PromocionesClient({
  orgSlug, connected, shopDomain, promotions,
}: PromocionesClientProps) {

  const [openDrawer,  setOpenDrawer]  = useState<DrawerId | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [results,     setResults]     = useState<Record<string, { status: string; message: string }>>({});

  const hasData = promotions !== null;

  // ── Computed indicators ──────────────────────────────────────────────────
  const activeList    = promotions?.active    ?? [];
  const scheduledList = promotions?.scheduled ?? [];
  const expiredList   = promotions?.expired   ?? [];
  const disabledList  = promotions?.disabled  ?? [];

  const activeCount    = activeList.length;
  const scheduledCount = scheduledList.length;
  const inactiveCount  = expiredList.length + disabledList.length;

  const porVencer = activeList.filter(
    p => p.endsAt && daysUntil(p.endsAt) <= 7 && daysUntil(p.endsAt) >= 0,
  );

  const codesActivos = activeList.filter(p => p.code !== null);
  const codesCount   = codesActivos.length;

  const pctPromos    = activeList.filter(p => p.valueType === "percentage");
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
          ? { status: "ok",    message: data.message ?? "Solicitud enviada" }
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
          subtitle: `${activeCount} vigente${activeCount !== 1 ? "s" : ""} · ${shopDomain || "Tienda"}`,
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
          subtitle: porVencer.length > 0
            ? `${porVencer.length} vencen en los próximos 7 días`
            : "Sin vencimientos inmediatos",
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
          subtitle: avgDescuento !== null
            ? `Promedio: ${fmtPct(avgDescuento)} en campañas porcentuales`
            : "Sin descuentos porcentuales activos",
          severity: avgDescuento && avgDescuento > 40 ? "warning" : "info",
        };
      case "uso_total":
        return {
          title:    "Usos registrados",
          subtitle: `${fmtNum(totalUsos)} usos acumulados`,
          severity: "info",
        };
      case "agentik":
        return {
          title:    "Campañas de Agentik",
          subtitle: `${agentikCount} gestionada${agentikCount !== 1 ? "s" : ""} automáticamente`,
          severity: "info",
        };
      case "alertas":
        return {
          title:    "Alertas de campañas",
          subtitle: alertCount > 0 ? `${alertCount} requieren revisión` : "Sin alertas activas",
          severity: alertCount > 0 ? "warning" : "info",
        };
      default:
        return { title: "Detalle", severity: "info" };
    }
  };

  const cfg     = drawerConfig(openDrawer);
  const actions = openDrawer
    ? getPromotionDrawerActions({
        drawerId:       openDrawer,
        activeCount,
        porVencerCount: porVencer.length,
        avgDescuento,
        codesCount,
        alertCount,
        scheduledCount,
      })
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[4], paddingTop: S[4] }}>

      {/* ── 1. Activation timeline ───────────────────────────────────────── */}
      <ShopifyActivationTimeline
        steps={ACTIVATION_STEPS}
        connected={connected}
        orgSlug={orgSlug}
        compactText={`Tienda activa · ${shopDomain || "Shopify"} · Promociones sincronizadas`}
        criticalCount={alertCount}
      />

      {/* ── 2. Protagonist: campaign center ─────────────────────────────── */}
      <div style={{
        border:       `1px solid ${C.line}`,
        borderTop:    `3px solid ${C.blueDark}`,
        borderRadius: R.xl,
        padding:      `${S[5]}px`,
        background:   C.white,
        boxShadow:    E.sm,
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: S[4] }}>
          <div>
            <div style={{
              fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
              color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.09em",
            }}>
              Estado de campañas
            </div>
            <div style={{
              fontFamily: T.mono, fontSize: T.sz["2xl"], fontWeight: T.wt.bold,
              color: C.titleDeep, lineHeight: 1.2, marginTop: S[1],
            }}>
              {hasData ? `${activeCount}` : "–"}
              <span style={{
                fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.normal,
                color: C.inkMid, marginLeft: S[2],
              }}>
                {hasData
                  ? `activa${activeCount !== 1 ? "s" : ""} · ${scheduledCount} programada${scheduledCount !== 1 ? "s" : ""} · ${inactiveCount} finalizada${inactiveCount !== 1 ? "s" : ""}`
                  : "Disponible al conectar la tienda"}
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

        {/* Distribution bar */}
        <div style={{ marginBottom: S[4] }}>
          <ShopifyDistributionBar
            segments={[
              { label: "Activas",     count: hasData ? activeCount    : 0, color: C.green      },
              { label: "Programadas", count: hasData ? scheduledCount : 0, color: C.blueDark   },
              { label: "Finalizadas", count: hasData ? inactiveCount  : 0, color: C.lineSubtle },
            ]}
          />
        </div>

        {/* Alerts strip */}
        {hasData && porVencer.length > 0 && (
          <div style={{
            fontFamily: T.mono, fontSize: T.sz.xs, color: C.amber,
            background: C.amberLight, border: `1px solid ${C.amberBorder}`,
            borderRadius: R.md, padding: `${S[2]}px ${S[3]}px`, marginBottom: S[3],
          }}>
            ⚠ {porVencer.length} campaña{porVencer.length !== 1 ? "s" : ""} vence{porVencer.length !== 1 ? "n" : ""} en los próximos 7 días
          </div>
        )}

        {/* Active promotions table */}
        <div className="ag-op-table">
          {hasData && activeList.length > 0
            ? activeList.slice(0, 5).map(p => <PromoRow key={p.id} promo={p} />)
            : hasData
            ? (
              <div style={{
                padding: `${S[5]}px ${S[4]}px`, textAlign: "center",
                fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid,
              }}>
                Sin campañas activas en este momento.
              </div>
            )
            : [1, 2, 3].map(i => <ShopifyPlaceholderRow key={i} />)
          }
        </div>
      </div>

      {/* ── 3. KPI grid ─────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: S[3] }}>
        <ShopifyKpiCard
          icon="🏷️"
          label="Promociones activas"
          value={hasData ? String(activeCount) : null}
          sub={hasData ? `${scheduledCount} programada${scheduledCount !== 1 ? "s" : ""}` : null}
          noDataHint="Promociones con descuentos vigentes en la tienda ahora mismo."
          variant={hasData ? (activeCount > 0 ? "ok" : "neutral") : "neutral"}
          onClick={() => setOpenDrawer("activas")}
        />
        <ShopifyKpiCard
          icon="📅"
          label="Campañas programadas"
          value={hasData ? String(scheduledCount) : null}
          sub={hasData ? "próximas a activarse" : null}
          noDataHint="Campañas con fecha de inicio futura."
          variant={hasData ? (scheduledCount > 0 ? "ok" : "neutral") : "neutral"}
          onClick={() => setOpenDrawer("programadas")}
        />
        <ShopifyKpiCard
          icon="⏰"
          label="Próximas a vencer"
          value={hasData ? String(porVencer.length) : null}
          sub={hasData ? "vencen en 7 días" : null}
          noDataHint="Campañas activas que expirarán en los próximos 7 días."
          variant={hasData ? (porVencer.length > 0 ? "warning" : "neutral") : "neutral"}
          onClick={() => setOpenDrawer("por_vencer")}
        />
        <ShopifyKpiCard
          icon="🔑"
          label="Códigos activos"
          value={hasData ? String(codesCount) : null}
          sub={hasData ? "en circulación" : null}
          noDataHint="Códigos de descuento que los clientes pueden usar."
          variant={hasData ? (codesCount > 0 ? "ok" : "neutral") : "neutral"}
          onClick={() => setOpenDrawer("codigos")}
        />
        <ShopifyKpiCard
          icon="📉"
          label="Descuento promedio"
          value={hasData && avgDescuento !== null ? fmtPct(avgDescuento) : hasData ? "—" : null}
          sub={hasData ? "en campañas porcentuales" : null}
          noDataHint="Promedio de descuento en las campañas porcentuales activas."
          variant={hasData && avgDescuento !== null ? (avgDescuento > 40 ? "warning" : "ok") : "neutral"}
          onClick={() => setOpenDrawer("descuento_prom")}
        />
        <ShopifyKpiCard
          icon="🎯"
          label="Usos totales"
          value={hasData ? fmtNum(totalUsos) : null}
          sub={hasData ? "usos acumulados" : null}
          noDataHint="Total de veces que se han aplicado descuentos."
          variant={hasData ? (totalUsos > 0 ? "ok" : "neutral") : "neutral"}
          onClick={() => setOpenDrawer("uso_total")}
        />
        <ShopifyKpiCard
          icon="🤖"
          label="Gestionadas por Agentik"
          value={hasData ? String(agentikCount) : null}
          sub={hasData ? "creadas automáticamente" : null}
          noDataHint="Campañas creadas y gestionadas por Agentik."
          variant={hasData ? (agentikCount > 0 ? "ok" : "neutral") : "neutral"}
          onClick={() => setOpenDrawer("agentik")}
        />
        <ShopifyKpiCard
          icon="🔔"
          label="Alertas importantes"
          value={hasData ? String(alertCount) : null}
          sub={hasData ? "requieren revisión" : null}
          noDataHint="Campañas desactivadas o próximas a vencer."
          variant={hasData ? (alertCount > 0 ? "warning" : "neutral") : "neutral"}
          onClick={() => setOpenDrawer("alertas")}
        />
      </div>

      {/* ── 4. Scheduled campaigns ──────────────────────────────────────── */}
      {(scheduledList.length > 0 || !hasData) && (
        <div style={{
          border: `1px solid ${C.line}`, borderRadius: R.xl,
          padding: `${S[5]}px`, background: C.white, boxShadow: E.xs,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: S[4] }}>
            <div style={{
              fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
              color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.09em",
            }}>
              Campañas programadas
            </div>
            <button
              onClick={() => setOpenDrawer("programadas")}
              style={{
                fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
                background: "transparent", border: "none", cursor: "pointer",
                padding: `${S[1]}px ${S[2]}px`,
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
                  Sin campañas programadas.
                </div>
              )
              : [1, 2].map(i => <ShopifyPlaceholderRow key={i} />)
            }
          </div>
        </div>
      )}

      {/* ── Drawer ──────────────────────────────────────────────────────── */}
      <OperationalSideDrawer
        open={openDrawer !== null}
        onClose={() => setOpenDrawer(null)}
        title={cfg.title}
        subtitle={cfg.subtitle}
        severity={cfg.severity}
      >
        {/* Section 1: Resumen */}
        <ShopifyDrawerSection title="Resumen">
          {openDrawer === "activas" && (
            <p style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, lineHeight: 1.7, margin: 0 }}>
              {hasData
                ? `${activeCount} campaña${activeCount !== 1 ? "s" : ""} activa${activeCount !== 1 ? "s" : ""} en la tienda.${porVencer.length > 0 ? ` ${porVencer.length} vencen en los próximos 7 días.` : " Ninguna está próxima a vencer."}`
                : "Disponible al conectar la tienda Shopify."}
            </p>
          )}
          {openDrawer === "programadas" && (
            <p style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, lineHeight: 1.7, margin: 0 }}>
              {hasData
                ? `${scheduledCount} campaña${scheduledCount !== 1 ? "s" : ""} programada${scheduledCount !== 1 ? "s" : ""} para activarse próximamente.`
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
                    {hasData ? "Ninguna campaña vence en los próximos 7 días." : "Disponible al conectar la tienda."}
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
                        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                          {p.currentUsage}/{p.usageLimit}
                        </span>
                      )}
                    </div>
                  ))
                : <p style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid, margin: 0 }}>
                    {hasData ? "Sin códigos activos." : "Disponible al conectar la tienda."}
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
                  ? `Descuento promedio: ${fmtPct(avgDescuento)} en ${pctPromos.length} campaña${pctPromos.length !== 1 ? "s" : ""} porcentual${pctPromos.length !== 1 ? "es" : ""}.`
                  : "Sin campañas porcentuales activas."
                : openDrawer === "uso_total"
                ? `${fmtNum(totalUsos)} usos acumulados entre campañas activas y finalizadas.`
                : openDrawer === "agentik"
                ? `${agentikCount} campaña${agentikCount !== 1 ? "s" : ""} gestionada${agentikCount !== 1 ? "s" : ""} automáticamente por Agentik.`
                : `${alertCount} elemento${alertCount !== 1 ? "s" : ""} requieren revisión: ${disabledList.length} desactivada${disabledList.length !== 1 ? "s" : ""} y ${porVencer.length} próxima${porVencer.length !== 1 ? "s" : ""} a vencer.`
              }
            </p>
          )}
        </ShopifyDrawerSection>

        {/* Section 2: Evolución */}
        <ShopifyDrawerSection title="Evolución">
          <p style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid, lineHeight: 1.7, margin: 0 }}>
            {!hasData
              ? "El historial de evolución estará disponible al conectar la tienda."
              : "La comparación período a período mostrará tendencias en el uso de descuentos, crecimiento en usos acumulados y variación del descuento promedio."}
          </p>
        </ShopifyDrawerSection>

        {/* Section 3: Datos relevantes */}
        <ShopifyDrawerSection title="Datos relevantes">
          <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
            {[
              { label: "Activas",         value: hasData ? String(activeCount)    : "–" },
              { label: "Programadas",     value: hasData ? String(scheduledCount) : "–" },
              { label: "Por vencer",      value: hasData ? String(porVencer.length) : "–" },
              { label: "Usos acumulados", value: hasData ? fmtNum(totalUsos)      : "–" },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>{label}</span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, fontWeight: T.wt.medium }}>{value}</span>
              </div>
            ))}
          </div>
        </ShopifyDrawerSection>

        {/* Section 4: Análisis de Sofía */}
        <ShopifyDrawerSection title="Análisis de Sofía">
          <p style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, lineHeight: 1.7, margin: 0 }}>
            {!connected
              ? "Conecta la tienda y Sofía analizará el comportamiento de tus descuentos para identificar oportunidades."
              : !hasData
              ? "Cargando análisis…"
              : openDrawer === "activas" && activeCount === 0
              ? "Sin campañas activas. Una campaña bien segmentada puede aumentar la conversión, especialmente fuera de temporadas altas."
              : openDrawer === "por_vencer" && porVencer.length > 0
              ? "Varias campañas están por vencer. Considera renovarlas, extenderlas o dejarlas expirar para medir el impacto en las ventas."
              : openDrawer === "descuento_prom" && avgDescuento !== null && avgDescuento > 40
              ? "Un descuento promedio superior al 40% puede afectar la percepción de valor. Te recomiendo segmentar los descuentos elevados a clientes específicos."
              : openDrawer === "alertas" && alertCount > 0
              ? "Hay campañas que requieren atención. Revisa las desactivadas y considera si alguna debería estar activa."
              : "Todo está en orden. Sofía seguirá monitoreando y te avisará si hay cambios relevantes."
            }
          </p>
        </ShopifyDrawerSection>

        {/* Section 5: Acciones sugeridas — context-aware */}
        <ShopifyDrawerSection title="Acciones sugeridas">
          {actions.map(action => (
            <ShopifyDrawerAction
              key={action.intent}
              label={action.label}
              intent={action.intent}
              executing={executingId}
              result={results[action.intent]}
              onExecute={executeAction}
            />
          ))}
        </ShopifyDrawerSection>
      </OperationalSideDrawer>
    </div>
  );
}
