"use client";

/**
 * app/(app)/[orgSlug]/agentik/marketing-studio/shopify/productos/productos-client.tsx
 *
 * SHOPIFY-PRODUCTS-01 — Productos Module Client
 *
 * Identity: "Centro inteligente de gestión del catálogo Shopify"
 *
 * Architecture:
 *   - Canvas = module data only. No Copilot banners in canvas.
 *   - Copilot = right rail + discrete "Análisis de Copilot" section in drawers.
 *   - All data received as props — no client-side fetching at mount.
 *   - Actions routed through Copilot architecture — never direct API calls.
 *   - Reuses full Operational UX Kit (Ag*) + shared Shopify primitives.
 *
 * Operational states handled:
 *   not connected → AgActivationTimeline expanded + placeholders
 *   connected, no data → placeholders
 *   connected, data → full layout
 */

import { useState }                      from "react";
import {
  AgMetricCard,
  AgKpiGrid,
  AgDrawerSection,
  AgDrawerAction,
  AgPlaceholderRow,
  AgDistributionBar,
  AgRiskMeter,
  AgModulePrimaryPanel,
  AgModuleSecondaryPanel,
}                                        from "@/components/agentik/operational-ux-kit";
import { ShopifyActivationTimeline }     from "@/components/marketing-studio/shopify/shopify-module-primitives";
import { OperationalSideDrawer }         from "@/components/workspace/operational-side-drawer";
import type { DrawerSeverity }           from "@/components/workspace/operational-side-drawer";
import { C, T, S, R }                   from "@/lib/ui/tokens";

import type { ProductsSummary, ProductRow } from "@/lib/marketing-studio/commerce/shopify-products-service";

// ── Constants ──────────────────────────────────────────────────────────────────

const ACTIVATION_STEPS = [
  "Conectar tienda Shopify",
  "Sincronizar productos",
  "Revisar catálogo",
  "Activar publicaciones",
];

const STATUS_LABEL: Record<string, string> = {
  published: "Publicado",
  draft:     "Borrador",
  queued:    "En cola",
  syncing:   "Sincronizando",
  partial:   "Parcial",
  failed:    "Fallido",
  archived:  "Archivado",
  paused:    "Pausado",
};

// ── Pure helpers ───────────────────────────────────────────────────────────────

function statusVariant(s: string): "ok" | "warning" | "critical" | "neutral" {
  if (s === "published")             return "ok";
  if (s === "failed")                return "critical";
  if (s === "queued" || s === "syncing") return "warning";
  return "neutral";
}

function readinessColor(score: number): string {
  if (score >= 80) return C.green;
  if (score >= 50) return C.amber;
  return C.red;
}

function readinessLevel(score: number): "ok" | "warning" | "critical" {
  if (score >= 80) return "ok";
  if (score >= 50) return "warning";
  return "critical";
}

function qualityLevel(goodCount: number, total: number): "ok" | "warning" | "critical" {
  if (total === 0) return "ok";
  const pct = goodCount / total;
  if (pct >= 0.8) return "ok";
  if (pct >= 0.5) return "warning";
  return "critical";
}

function qualityLabel(goodCount: number, total: number, unit: string): string {
  if (total === 0) return `Sin ${unit}`;
  return `${goodCount} / ${total} ${unit}`;
}

function fmt(n: number) { return new Intl.NumberFormat("es-CO").format(n); }

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60)  return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `hace ${hrs} h`;
  return `hace ${Math.floor(hrs / 24)} días`;
}

// ── Contextual actions ────────────────────────────────────────────────────────

type ActionSpec = { label: string; intent: string };

type ProductActionCtx = {
  hasSeo:         boolean;
  hasImage:       boolean;
  isPublished:    boolean;
  isPublishable:  boolean;
  blockingCount:  number;
  readinessScore: number;
};

function getProductDrawerActions(ctx: ProductActionCtx): ActionSpec[] {
  if (!ctx.hasImage) return [
    { label: "Seleccionar imagen desde Biblioteca",  intent: "product.select_image_from_library" },
    { label: "Generar fotografía en Foto Estudio",   intent: "product.open_foto_estudio" },
    { label: "Revisar requisitos de publicación",    intent: "product.review_requirements" },
  ];
  if (!ctx.hasSeo) return [
    { label: "Generar contenido SEO",                intent: "product.generate_seo" },
    { label: "Mejorar descripción comercial",        intent: "product.improve_description" },
    { label: "Revisar términos de búsqueda",          intent: "product.review_keywords" },
  ];
  if (ctx.blockingCount > 0) return [
    { label: "Revisar bloqueos del producto",        intent: "product.review_blockers" },
    { label: "Aplicar correcciones sugeridas",       intent: "product.apply_corrections" },
    { label: "Solicitar revisión manual",            intent: "product.request_review" },
  ];
  if (!ctx.isPublished && ctx.isPublishable) return [
    { label: "Preparar publicación en Shopify",      intent: "product.prepare_publish" },
    { label: "Revisar previsualización",             intent: "product.preview" },
    { label: "Publicar mediante flujo aprobado",     intent: "product.publish" },
  ];
  if (ctx.readinessScore < 60) return [
    { label: "Enriquecer contenido del producto",    intent: "product.enrich_content" },
    { label: "Generar descripciones automáticas",    intent: "product.auto_describe" },
    { label: "Revisar información del producto",      intent: "product.catalog_review" },
  ];
  return [
    { label: "Ver en Shopify Admin",                 intent: "product.view_shopify" },
    { label: "Analizar rendimiento",                 intent: "product.analyze_performance" },
    { label: "Incluir en campaña activa",            intent: "product.include_campaign" },
  ];
}

type CardKey = "publicados" | "pendientes" | "atencion" | "sinImagen" | "sinSeo" | "enriquecimiento";

function getCardDrawerActions(key: CardKey): ActionSpec[] {
  switch (key) {
    case "publicados": return [
      { label: "Ver productos publicados",             intent: "catalog.list_published" },
      { label: "Revisar sincronización con Shopify",   intent: "catalog.check_sync" },
      { label: "Generar resumen ejecutivo",            intent: "catalog.executive_summary" },
    ];
    case "pendientes": return [
      { label: "Listar productos pendientes",          intent: "catalog.list_pending" },
      { label: "Preparar publicación masiva",          intent: "catalog.bulk_prepare" },
      { label: "Revisar bloqueos pendientes",          intent: "catalog.review_blockers" },
    ];
    case "atencion": return [
      { label: "Revisar alertas críticas",             intent: "catalog.review_critical" },
      { label: "Aplicar correcciones automáticas",     intent: "catalog.auto_fix" },
      { label: "Escalar a revisión manual",            intent: "catalog.escalate" },
    ];
    case "sinImagen": return [
      { label: "Listar productos sin imagen",          intent: "catalog.list_no_image" },
      { label: "Asignar imágenes desde Biblioteca",    intent: "catalog.assign_library" },
      { label: "Generar fotografías en Foto Estudio",  intent: "catalog.generate_photos" },
    ];
    case "sinSeo": return [
      { label: "Listar productos sin SEO",             intent: "catalog.list_no_seo" },
      { label: "Generar contenido SEO masivo",         intent: "catalog.bulk_seo" },
      { label: "Revisar palabras clave del catálogo",  intent: "catalog.review_keywords" },
    ];
    case "enriquecimiento": return [
      { label: "Ver productos a enriquecer",           intent: "catalog.list_needs_enrichment" },
      { label: "Enriquecer catálogo con Copilot",      intent: "catalog.ai_enrich" },
      { label: "Priorizar productos clave",            intent: "catalog.prioritize" },
    ];
  }
}

function getCardAffectedItems(key: CardKey, items: ProductRow[]): ProductRow[] {
  switch (key) {
    case "publicados":      return items.filter(i => i.publicationStatus === "published").slice(0, 5);
    case "pendientes":      return items.filter(i => i.publicationStatus === "draft" || i.publicationStatus === "queued").slice(0, 5);
    case "atencion":        return items.filter(i => i.blockingCount > 0).slice(0, 5);
    case "sinImagen":       return items.filter(i => !i.hasImage).slice(0, 5);
    case "sinSeo":          return items.filter(i => !i.hasSeo).slice(0, 5);
    case "enriquecimiento": return items.filter(i => i.readinessScore < 80 && i.blockingCount === 0).slice(0, 5);
  }
}

function getCardCopilotAnalysis(key: CardKey, summary: ProductsSummary): string {
  switch (key) {
    case "publicados":
      return summary.publicados === 0
        ? "Ningún producto está publicado aún. La tienda no tiene visibilidad activa hasta que se complete el primer ciclo de publicación."
        : `${summary.publicados} producto${summary.publicados !== 1 ? "s" : ""} activo${summary.publicados !== 1 ? "s" : ""} en la tienda. Revisa el rendimiento individual para detectar oportunidades de mejora.`;
    case "pendientes":
      return summary.pendientes === 0
        ? "No hay productos pendientes. Todos los productos con información completa ya están activos en la tienda."
        : `${summary.pendientes} producto${summary.pendientes !== 1 ? "s" : ""} esperan publicación. Algunos pueden estar bloqueados o en proceso de revisión de información.`;
    case "atencion":
      return summary.requierenAtencion === 0
        ? "Sin bloqueos activos. Todos los productos están en condición de publicarse."
        : `${summary.requierenAtencion} producto${summary.requierenAtencion !== 1 ? "s" : ""} tienen bloqueos que impiden su publicación. Revísalos para habilitar su activación en la tienda.`;
    case "sinImagen":
      return summary.sinImagen === 0
        ? "Todos los productos tienen imagen principal. Están listos para mostrarse visualmente en la tienda."
        : `${summary.sinImagen} producto${summary.sinImagen !== 1 ? "s" : ""} sin imagen principal. Sin imagen, no pueden publicarse en Shopify. Asigna recursos desde Biblioteca o genera fotografías en Foto Estudio.`;
    case "sinSeo":
      return summary.sinSeo === 0
        ? "Todos los productos tienen información para buscadores. Buen nivel de preparación digital."
        : `${summary.sinSeo} producto${summary.sinSeo !== 1 ? "s" : ""} sin preparación para buscadores. El SEO mejora la visibilidad orgánica y el posicionamiento en Shopify y Google Shopping.`;
    case "enriquecimiento":
      return summary.necesitanEnriquecimiento === 0
        ? "La información de los productos está completa. Sin oportunidades inmediatas de enriquecimiento automático."
        : `${summary.necesitanEnriquecimiento} producto${summary.necesitanEnriquecimiento !== 1 ? "s" : ""} con información incompleta que Copilot puede completar automáticamente sin intervención manual.`;
  }
}

function getProductCopilotAnalysis(item: ProductRow): string {
  if (!item.hasImage)
    return "Este producto no puede publicarse sin imagen principal. Asigna un recurso desde Biblioteca o genera una fotografía en Foto Estudio.";
  if (!item.hasSeo)
    return "Carece de título y descripción optimizados para buscadores. El SEO afecta directamente la visibilidad en Shopify y en Google Shopping.";
  if (item.blockingCount > 0)
    return `${item.blockingCount} bloqueo${item.blockingCount !== 1 ? "s" : ""} impide${item.blockingCount !== 1 ? "n" : ""} la publicación. Revisa los requisitos antes de continuar.`;
  if (!item.isPublishable)
    return "El producto aún no cumple todos los requisitos para publicarse. Revisa los campos obligatorios.";
  if (item.publicationStatus !== "published" && item.isPublishable)
    return "El producto está listo para publicarse. Sigue el flujo de aprobación de Copilot para activarlo en la tienda.";
  if (item.readinessScore < 60)
    return `Puntaje de preparación: ${item.readinessScore}/100. El contenido puede mejorarse antes de activar campañas sobre este producto.`;
  return "El producto está en buen estado. Considera incluirlo en campañas activas o crear una promoción para maximizar su visibilidad.";
}

// ── Drawer state ─────────────────────────────────────────────────────────────

type DrawerState =
  | { kind: "card";    key:  CardKey }
  | { kind: "product"; item: ProductRow }
  | null;

// ── Component ─────────────────────────────────────────────────────────────────

export function ProductosClient({
  orgSlug,
  connected,
  shopDomain,
  summary,
}: {
  orgSlug:    string;
  connected:  boolean;
  shopDomain: string;
  summary:    ProductsSummary | null;
}) {
  const [drawer,    setDrawer]    = useState<DrawerState>(null);
  const [executing, setExecuting] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ status: string; message: string } | null>(null);

  function closeDrawer() {
    setDrawer(null);
    setActionResult(null);
  }

  async function handleAction(intent: string) {
    setExecuting(intent);
    await new Promise(r => setTimeout(r, 1200));
    setExecuting(null);
    setActionResult({ status: "ok", message: "Acción enviada a Copilot para revisión." });
  }

  // ── Derived data ────────────────────────────────────────────────────────────
  const total      = summary?.total ?? 0;
  const publicados = summary?.publicados ?? 0;
  const pendientes = summary?.pendientes ?? 0;
  const atencion   = summary?.requierenAtencion ?? 0;
  const sinImagen  = summary?.sinImagen ?? 0;
  const sinSeo     = summary?.sinSeo ?? 0;
  const sinCat     = summary?.sinCategoria ?? 0;
  const enriq      = summary?.necesitanEnriquecimiento ?? 0;
  const items      = summary?.items ?? [];
  const lastSync   = summary?.lastSyncAt;

  // ── Drawer resolution ───────────────────────────────────────────────────────
  const drawerOpen     = drawer !== null;
  const drawerIsCard   = drawer?.kind === "card";
  const drawerIsProduct = drawer?.kind === "product";

  const drawerTitle =
    drawerIsCard    ? (() => {
      const k = (drawer as { kind: "card"; key: CardKey }).key;
      const labels: Record<CardKey, string> = {
        publicados:     "Publicados",
        pendientes:     "Pendientes de publicación",
        atencion:       "Requieren atención",
        sinImagen:      "Sin imagen principal",
        sinSeo:         "Sin optimización SEO",
        enriquecimiento:"Necesitan enriquecimiento",
      };
      return labels[k];
    })() :
    drawerIsProduct ? (drawer as { kind: "product"; item: ProductRow }).item.name :
    "";

  const drawerSeverity: DrawerSeverity =
    drawerIsCard ? (() => {
      const k = (drawer as { kind: "card"; key: CardKey }).key;
      if (k === "atencion")   return "critical";
      if (k === "sinImagen")  return "warning";
      if (k === "sinSeo")     return "warning";
      return "info";
    })() :
    drawerIsProduct ? (() => {
      const item = (drawer as { kind: "product"; item: ProductRow }).item;
      if (item.blockingCount > 0)               return "critical";
      if (!item.hasImage || !item.hasSeo)       return "warning";
      if (item.publicationStatus !== "published") return "watch";
      return "info";
    })() :
    "info";

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ paddingTop: S[4] }}>

      {/* ── 1. Connection timeline strip — compact, not competing with content ── */}
      <div style={{ marginBottom: S[3] }}>
        <ShopifyActivationTimeline
          steps={ACTIVATION_STEPS}
          connected={connected}
          orgSlug={orgSlug}
          compactText={
            shopDomain
              ? `Catálogo sincronizado con ${shopDomain}${lastSync ? ` · ${relativeTime(lastSync)}` : ""}`
              : "Tienda conectada · Catálogo disponible"
          }
          criticalCount={atencion}
        />
      </div>

      {/* ── 2. Protagonist block ── */}
      <div style={{ marginBottom: S[5] }}>
        <AgModulePrimaryPanel
          moduleLabel="Estado de los productos"
          headline={summary ? fmt(total) : null}
          headlineSub={summary ? `producto${total !== 1 ? "s" : ""} en tu tienda` : null}
          action={connected ? {
            label:   "Sincronizar Shopify",
            onClick: () => handleAction("catalog.sync_shopify"),
          } : undefined}
        >
          {summary ? (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: S[4] }}>
              {/* Distribution bar: publicados / pendientes / bloqueados */}
              <AgDistributionBar
                segments={[
                  { label: "Publicados",   count: publicados, color: C.green },
                  { label: "Pendientes",   count: pendientes, color: C.amber },
                  { label: "Con bloqueos", count: atencion,   color: C.red   },
                ]}
              />
              {/* Last sync + modified note */}
              {lastSync && (
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                  Última sincronización: {relativeTime(lastSync)}
                  {summary.modificados > 0 && (
                    <span style={{ color: C.amber, marginLeft: S[2] }}>
                      · {summary.modificados} modificado{summary.modificados !== 1 ? "s" : ""} pendiente{summary.modificados !== 1 ? "s" : ""} de sincronizar
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>
              <div style={{ height: 6, background: C.surfaceAlt, borderRadius: R.pill }} />
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, lineHeight: 1.65 }}>
                {connected
                  ? "Cargando estado de los productos…"
                  : "Aquí visualizarás la distribución de tus productos una vez sincronices Shopify. Copilot utilizará esta información para detectar oportunidades de publicación y mejora."}
              </div>
            </div>
          )}
        </AgModulePrimaryPanel>
      </div>

      {/* ── 3. Indicadores del negocio ── */}
      <div style={{ marginBottom: S[5] }}>
        <div style={{
          fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
          color: C.inkFaint, textTransform: "uppercase" as const,
          letterSpacing: "0.09em", marginBottom: S[3],
        }}>
          Indicadores del negocio
        </div>
        <AgKpiGrid>
          <AgMetricCard
            icon="📦"
            label="Publicados en Shopify"
            value={summary ? fmt(publicados) : null}
            sub={summary && publicados > 0 ? "activos en la tienda" : null}
            noDataHint="Productos activos visibles para compradores."
            variant={publicados > 0 ? "ok" : "neutral"}
            onClick={() => setDrawer({ kind: "card", key: "publicados" })}
          />
          <AgMetricCard
            icon="⏳"
            label="Pendientes de publicar"
            value={summary ? fmt(pendientes) : null}
            sub={summary && pendientes > 0 ? "en borrador o cola" : null}
            noDataHint="Productos aún no visibles en la tienda."
            variant={pendientes > 0 ? "warning" : "neutral"}
            onClick={() => setDrawer({ kind: "card", key: "pendientes" })}
          />
          <AgMetricCard
            icon="⚠"
            label="Requieren atención"
            value={summary ? fmt(atencion) : null}
            sub={summary && atencion > 0 ? "bloqueos detectados" : null}
            noDataHint="Productos con bloqueos que impiden publicación."
            variant={atencion > 0 ? "critical" : "ok"}
            onClick={() => setDrawer({ kind: "card", key: "atencion" })}
          />
          <AgMetricCard
            icon="🖼"
            label="Sin imagen principal"
            value={summary ? fmt(sinImagen) : null}
            sub={summary && sinImagen > 0 ? "no se pueden publicar" : null}
            noDataHint="Productos sin imagen asignada desde Biblioteca."
            variant={sinImagen > 0 ? "warning" : "ok"}
            onClick={() => setDrawer({ kind: "card", key: "sinImagen" })}
          />
          <AgMetricCard
            icon="🔍"
            label="Sin optimización SEO"
            value={summary ? fmt(sinSeo) : null}
            sub={summary && sinSeo > 0 ? "sin título ni descripción SEO" : null}
            noDataHint="Productos sin título ni descripción para buscadores."
            variant={sinSeo > 0 ? "warning" : "ok"}
            onClick={() => setDrawer({ kind: "card", key: "sinSeo" })}
          />
          <AgMetricCard
            icon="✨"
            label="Necesitan enriquecimiento"
            value={summary ? fmt(enriq) : null}
            sub={summary && enriq > 0 ? "contenido incompleto" : null}
            noDataHint="Productos que Copilot puede completar automáticamente."
            variant={enriq > 0 ? "neutral" : "neutral"}
            onClick={() => setDrawer({ kind: "card", key: "enriquecimiento" })}
          />
        </AgKpiGrid>
      </div>

      {/* ── 4. Secondary: preparación para la venta ── */}
      <div style={{ marginBottom: S[5] }}>
        <AgModuleSecondaryPanel label="Preparación para la venta">
          {summary && total > 0 ? (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>
              <div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginBottom: S[1] }}>
                  Imágenes disponibles
                </div>
                <AgRiskMeter
                  level={qualityLevel(total - sinImagen, total)}
                  label={qualityLabel(total - sinImagen, total, "con imagen")}
                />
              </div>
              <div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginBottom: S[1] }}>
                  Información comercial completa
                </div>
                <AgRiskMeter
                  level={qualityLevel(total - atencion, total)}
                  label={qualityLabel(total - atencion, total, "sin bloqueos")}
                />
              </div>
              <div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginBottom: S[1] }}>
                  Preparación para buscadores
                </div>
                <AgRiskMeter
                  level={qualityLevel(total - sinSeo, total)}
                  label={qualityLabel(total - sinSeo, total, "con SEO")}
                />
              </div>
              <div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginBottom: S[1] }}>
                  Clasificación asignada
                </div>
                <AgRiskMeter
                  level={qualityLevel(total - sinCat, total)}
                  label={qualityLabel(total - sinCat, total, "con clasificación")}
                />
              </div>
              <div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginBottom: S[1] }}>
                  Publicados en la tienda
                </div>
                <AgRiskMeter
                  level={qualityLevel(publicados, total)}
                  label={qualityLabel(publicados, total, "publicados")}
                />
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i}>
                  <div style={{ height: 8, width: "55%", background: C.surfaceAlt, borderRadius: R.sm, marginBottom: S[1] }} />
                  <div style={{ height: 4, background: C.surfaceAlt, borderRadius: R.pill }} />
                </div>
              ))}
              {!connected && (
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, lineHeight: 1.65, marginTop: S[1] }}>
                  Conecta tu tienda para ver qué tan listos están tus productos para venderse.
                </div>
              )}
            </div>
          )}
        </AgModuleSecondaryPanel>
      </div>

      {/* ── 5. Product table ── */}
      <div style={{ marginBottom: S[6] }}>
        <div style={{
          display:        "flex",
          justifyContent: "space-between",
          alignItems:     "center",
          marginBottom:   S[3],
        }}>
          <div style={{
            fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
            color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.09em",
          }}>
            Productos{summary ? ` · ${fmt(total)} en total` : ""}
          </div>
        </div>

        <div className="ag-op-table">
          {/* ── Table header ── */}
          <div style={{
            display:       "grid",
            gridTemplateColumns: "28px 1fr 120px 96px 56px 56px 32px",
            gap:           S[2],
            padding:       `${S[2]}px ${S[3]}px`,
            borderBottom:  `1px solid ${C.line}`,
          }}>
            {["", "Producto", "Categoría", "Estado", "SEO", "Punt.", ""].map((h, i) => (
              <div key={i} style={{
                fontFamily:    T.mono,
                fontSize:      T.sz["2xs"],
                fontWeight:    T.wt.semibold,
                color:         C.inkFaint,
                textTransform: "uppercase" as const,
                letterSpacing: "0.08em",
              }}>
                {h}
              </div>
            ))}
          </div>

          {/* ── Table body ── */}
          {!summary ? (
            <>
              <AgPlaceholderRow />
              <AgPlaceholderRow />
              <AgPlaceholderRow />
              <AgPlaceholderRow />
            </>
          ) : items.length === 0 ? (
            <div style={{
              padding:    `${S[8]}px ${S[4]}px`,
              textAlign:  "center" as const,
              fontFamily: T.mono,
              fontSize:   T.sz.sm,
              color:      C.inkFaint,
            }}>
              {connected
                ? "No hay productos en el catálogo. Importa productos desde Shopify o crea el primero."
                : "Conecta tu tienda Shopify para ver el catálogo aquí."}
            </div>
          ) : (
            items.slice(0, 20).map(item => (
              <div
                key={item.productId}
                className="ag-op-row"
                style={{
                  display:             "grid",
                  gridTemplateColumns: "28px 1fr 120px 96px 56px 56px 32px",
                  gap:                 S[2],
                  alignItems:          "center",
                  padding:             `${S[3]}px ${S[3]}px`,
                  cursor:              "pointer",
                }}
                onClick={() => setDrawer({ kind: "product", item })}
              >
                {/* Image indicator dot */}
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <div style={{
                    width:        10,
                    height:       10,
                    borderRadius: "50%",
                    background:   item.hasImage ? C.green : C.surfaceAlt,
                    border:       `1px solid ${item.hasImage ? C.greenBorder : C.line}`,
                    flexShrink:   0,
                  }} />
                </div>

                {/* Name + SKU */}
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontFamily:   T.mono,
                    fontSize:     T.sz.sm,
                    color:        C.ink,
                    fontWeight:   T.wt.medium,
                    overflow:     "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace:   "nowrap" as const,
                  }}>
                    {item.name}
                  </div>
                  {item.sku && (
                    <div style={{
                      fontFamily:   T.mono,
                      fontSize:     T.sz["2xs"],
                      color:        C.inkFaint,
                      marginTop:    1,
                      overflow:     "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace:   "nowrap" as const,
                    }}>
                      {item.sku}
                    </div>
                  )}
                </div>

                {/* Category */}
                <div style={{
                  fontFamily:   T.mono,
                  fontSize:     T.sz.xs,
                  color:        item.category ? C.inkMid : C.inkFaint,
                  overflow:     "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace:   "nowrap" as const,
                }}>
                  {item.category ?? "–"}
                </div>

                {/* Status chip */}
                <div>
                  <span className={`ag-op-status ag-op-status--${statusVariant(item.publicationStatus)}`}>
                    {STATUS_LABEL[item.publicationStatus] ?? item.publicationStatus}
                  </span>
                </div>

                {/* SEO indicator */}
                <div style={{
                  fontFamily: T.mono,
                  fontSize:   T.sz.xs,
                  color:      item.hasSeo ? C.green : C.inkFaint,
                  fontWeight: item.hasSeo ? T.wt.semibold : T.wt.normal,
                }}>
                  {item.hasSeo ? "✓" : "–"}
                </div>

                {/* Readiness score */}
                <div style={{
                  fontFamily:  T.mono,
                  fontSize:    T.sz.xs,
                  color:       readinessColor(item.readinessScore),
                  fontWeight:  T.wt.semibold,
                }}>
                  {item.readinessScore}
                </div>

                {/* Row CTA */}
                <div style={{
                  fontFamily: T.mono,
                  fontSize:   T.sz.xs,
                  color:      C.inkFaint,
                }}>
                  →
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Drawer ─────────────────────────────────────────────────────────── */}
      <OperationalSideDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={drawerTitle}
        subtitle={
          drawerIsCard
            ? "Indicador del negocio · Shopify"
            : drawerIsProduct
              ? (() => {
                  const item = (drawer as { kind: "product"; item: ProductRow }).item;
                  return [item.sku, item.category].filter(Boolean).join(" · ") || "Catálogo Shopify";
                })()
              : undefined
        }
        severity={drawerSeverity}
      >
        {drawerIsCard && (() => {
          const { key } = drawer as { kind: "card"; key: CardKey };
          const affected = summary ? getCardAffectedItems(key, items) : [];
          const actions  = getCardDrawerActions(key);

          return (
            <>
              {/* Resumen */}
              <AgDrawerSection title="Resumen">
                <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid, lineHeight: 1.65 }}>
                  {getCardCopilotAnalysis(key, summary ?? {
                    total: 0, publicados: 0, pendientes: 0, requierenAtencion: 0,
                    sinImagen: 0, sinSeo: 0, sinCategoria: 0, necesitanEnriquecimiento: 0,
                    modificados: 0, lastSyncAt: null, items: [],
                  })}
                </div>
              </AgDrawerSection>

              {/* Evolución */}
              <AgDrawerSection title="Evolución">
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                  Seguimiento histórico de este indicador en desarrollo.
                </div>
              </AgDrawerSection>

              {/* Datos relevantes */}
              <AgDrawerSection title="Datos relevantes">
                {affected.length === 0 ? (
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                    Sin productos en esta categoría.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
                    {affected.map(p => (
                      <div
                        key={p.productId}
                        className="ag-op-row"
                        style={{ display: "flex", alignItems: "center", gap: S[2], padding: `${S[2]}px` }}
                        onClick={() => setDrawer({ kind: "product", item: p })}
                      >
                        <div style={{
                          width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                          background: statusVariant(p.publicationStatus) === "ok" ? C.green
                            : statusVariant(p.publicationStatus) === "critical" ? C.red : C.amber,
                        }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
                          }}>
                            {p.name}
                          </div>
                          {p.sku && (
                            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                              {p.sku}
                            </div>
                          )}
                        </div>
                        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, flexShrink: 0 }}>→</span>
                      </div>
                    ))}
                  </div>
                )}
              </AgDrawerSection>

              {/* Análisis de Copilot */}
              <AgDrawerSection title="Análisis de Copilot">
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, lineHeight: 1.65 }}>
                  {getCardCopilotAnalysis(key, summary ?? {
                    total: 0, publicados: 0, pendientes: 0, requierenAtencion: 0,
                    sinImagen: 0, sinSeo: 0, sinCategoria: 0, necesitanEnriquecimiento: 0,
                    modificados: 0, lastSyncAt: null, items: [],
                  })}
                </div>
              </AgDrawerSection>

              {/* Acciones sugeridas */}
              <AgDrawerSection title="Acciones sugeridas">
                {actions.map(a => (
                  <AgDrawerAction
                    key={a.intent}
                    label={a.label}
                    intent={a.intent}
                    executing={executing}
                    result={actionResult && executing === null ? actionResult : undefined}
                    onExecute={handleAction}
                  />
                ))}
              </AgDrawerSection>
            </>
          );
        })()}

        {drawerIsProduct && (() => {
          const item = (drawer as { kind: "product"; item: ProductRow }).item;
          const ctx: ProductActionCtx = {
            hasSeo:         item.hasSeo,
            hasImage:       item.hasImage,
            isPublished:    item.publicationStatus === "published",
            isPublishable:  item.isPublishable,
            blockingCount:  item.blockingCount,
            readinessScore: item.readinessScore,
          };
          const actions = getProductDrawerActions(ctx);

          return (
            <>
              {/* Resumen */}
              <AgDrawerSection title="Resumen">
                <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>Estado</span>
                    <span className={`ag-op-status ag-op-status--${statusVariant(item.publicationStatus)}`}>
                      {STATUS_LABEL[item.publicationStatus] ?? item.publicationStatus}
                    </span>
                  </div>
                  {item.sku && (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>SKU</span>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>{item.sku}</span>
                    </div>
                  )}
                  {item.category && (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>Categoría</span>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>{item.category}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>Actualizado</span>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                      {relativeTime(item.updatedAt)}
                    </span>
                  </div>
                </div>
              </AgDrawerSection>

              {/* Evolución */}
              <AgDrawerSection title="Evolución">
                <div style={{ marginBottom: S[2] }}>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginBottom: S[2] }}>
                    Puntaje de preparación
                  </div>
                  <AgRiskMeter
                    level={readinessLevel(item.readinessScore)}
                    label={`${item.readinessScore} / 100`}
                  />
                </div>
                {(item.blockingCount > 0 || item.warningCount > 0) && (
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: S[2] }}>
                    {item.blockingCount > 0 && (
                      <span style={{ color: C.red, marginRight: S[3] }}>
                        {item.blockingCount} bloqueo{item.blockingCount !== 1 ? "s" : ""}
                      </span>
                    )}
                    {item.warningCount > 0 && (
                      <span style={{ color: C.amber }}>
                        {item.warningCount} advertencia{item.warningCount !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                )}
              </AgDrawerSection>

              {/* Datos relevantes */}
              <AgDrawerSection title="Datos relevantes">
                <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>Imagen principal</span>
                    <span style={{
                      fontFamily: T.mono, fontSize: T.sz.xs,
                      color:      item.hasImage ? C.green : C.red,
                      fontWeight: T.wt.semibold,
                    }}>
                      {item.hasImage ? "✓ Asignada" : "✗ Faltante"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>SEO</span>
                    <span style={{
                      fontFamily: T.mono, fontSize: T.sz.xs,
                      color:      item.hasSeo ? C.green : C.amber,
                      fontWeight: T.wt.semibold,
                    }}>
                      {item.hasSeo ? "✓ Optimizado" : "✗ Sin configurar"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>Publicado en Shopify</span>
                    <span style={{
                      fontFamily: T.mono, fontSize: T.sz.xs,
                      color:      item.externalId ? C.green : C.inkFaint,
                      fontWeight: item.externalId ? T.wt.semibold : T.wt.normal,
                    }}>
                      {item.externalId ? "✓ Sincronizado" : "–"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>Listo para publicar</span>
                    <span style={{
                      fontFamily: T.mono, fontSize: T.sz.xs,
                      color:      item.isPublishable ? C.green : C.amber,
                      fontWeight: T.wt.semibold,
                    }}>
                      {item.isPublishable ? "✓ Sí" : "✗ No"}
                    </span>
                  </div>
                </div>
              </AgDrawerSection>

              {/* Análisis de Copilot */}
              <AgDrawerSection title="Análisis de Copilot">
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, lineHeight: 1.65 }}>
                  {getProductCopilotAnalysis(item)}
                </div>
              </AgDrawerSection>

              {/* Acciones sugeridas */}
              <AgDrawerSection title="Acciones sugeridas">
                {actions.map(a => (
                  <AgDrawerAction
                    key={a.intent}
                    label={a.label}
                    intent={a.intent}
                    executing={executing}
                    result={actionResult && executing === null ? actionResult : undefined}
                    onExecute={handleAction}
                  />
                ))}
              </AgDrawerSection>
            </>
          );
        })()}
      </OperationalSideDrawer>
    </div>
  );
}
