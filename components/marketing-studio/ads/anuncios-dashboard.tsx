"use client";
/**
 * components/marketing-studio/ads/anuncios-dashboard.tsx
 *
 * MARKETING-ADS-UX-02 — Asistente de Anuncios Pagos v2
 *
 * Orden de pasos:
 *   1. Plataforma  — Meta (FB+IG), TikTok, Google, YouTube
 *   2. Objetivo    — estrategia de inversión
 *   3. Recurso     — asset creativo con preview prominente + Shopify auto-populate
 *   4. Contenido   — copy, CTA, hashtags, URL/WhatsApp según objetivo
 *   5. Audiencia   — país, ciudad, edad, intereses
 *   6. Presupuesto — monto, moneda, tipo, fechas + tarjeta inteligente de inversión
 *   7. Revisar     — checklist de confirmación + acciones finales
 *
 * Arquitectura Copilot:
 *   - Toda la estructura de AdDraft puede ser completada desde un intent externo.
 *   - applyDraft(partial: Partial<AdDraft>) está disponible para integraciones futuras.
 *   - Ninguna acción ejecuta anuncios directamente — todo pasa por Copilot pipeline.
 *
 * Reglas:
 *   - No Tailwind color classes
 *   - T.mono para todos los datos operacionales
 *   - Operational UX Kit obligatorio
 *   - Baseline TSC: 160 errores preexistentes
 */
import React, { useState, useCallback } from "react";

import {
  AgModulePrimaryPanel,
  AgModuleSecondaryPanel,
  AgDrawerSection,
  AgDrawerAction,
} from "@/components/agentik/operational-ux-kit";
import { OperationalSideDrawer } from "@/components/workspace/operational-side-drawer";
import { AdsAccountsPanel }      from "@/components/marketing-studio/ads/ads-accounts-panel";
import { C, T, S, R }           from "@/lib/ui/tokens";

import type {
  AdsValidationResult,
  AdsValidationCheck,
}                                from "@/lib/marketing-studio/ads/ads-validation-types";
import type { AdsRuntimeState, AdEntity } from "@/lib/marketing-studio/ads/ads-types";
import {
  computeApprovalVersion,
}                                from "@/lib/marketing-studio/ads/ads-execution-types";
import type {
  ApprovedExecutionSnapshot,
  AdsExecutionResult,
  AdsExecuteApiResponse,
}                                from "@/lib/marketing-studio/ads/ads-execution-types";
import {
  ADS_EXTERNAL_STATUS_LABEL,
}                                from "@/lib/marketing-studio/ads/ads-sync-types";
import type {
  AdsSyncItemResult,
  AdsSyncApiResponse,
}                                from "@/lib/marketing-studio/ads/ads-sync-types";
import {
  AD_STATUS_LABEL,
  AD_OBJECTIVE_LABEL,
  AD_PLATFORM_LABEL,
} from "@/lib/marketing-studio/ads/ads-types";

// ── Wizard-local types ────────────────────────────────────────────────────────

/** Platform groups as presented in the wizard (Meta unifies FB+IG). */
type AdPlatformGroup = "meta" | "tiktok" | "google" | "youtube";
type MetaSubchannel  = "facebook" | "instagram";
type AdObjective     = "mensajes" | "visitas" | "ventas" | "seguidores" | "reconocimiento" | "alcance";
type AssetSource     = "biblioteca" | "foto_estudio" | "upload_image" | "upload_video" | "shopify";
type AdDestino       = "whatsapp" | "sitio" | "landing";

interface DraftAsset {
  id:     string;
  source: AssetSource;
  label:  string;
  // Shopify auto-populated fields
  shopifyName?:  string;
  shopifyDesc?:  string;
  shopifyLink?:  string;
}

/**
 * AdDraft — complete wizard state.
 * Designed to be hydrated externally (e.g. Copilot fills via applyDraft()).
 */
export interface AdDraft {
  // Step 1: Platform
  plataformas:     AdPlatformGroup[];
  metaSubchannels: MetaSubchannel[];
  // Step 2: Objective
  objetivo:        AdObjective | null;
  // Step 3: Resource
  assets:          DraftAsset[];
  // Step 4: Content
  textoPrincipal:  string;
  cta:             string;
  hashtags:        string;
  urlDestino:      string;
  destino:         AdDestino | null;
  whatsappNumber:  string;
  // Step 5: Audience
  pais:            string;
  ciudad:          string;
  edadMin:         string;
  edadMax:         string;
  intereses:       string;
  publico:         string;
  // Step 6: Budget
  monto:           string;
  moneda:          string;
  tipoPres:        "diario" | "total";
  inicio:          string;
  fin:             string;
}

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

// ── Constants ─────────────────────────────────────────────────────────────────

const STEP_LABELS: string[] = [
  "Plataforma", "Objetivo", "Recurso", "Contenido", "Audiencia", "Presupuesto", "Revisar",
];

const STEP_DESCRIPTIONS: Record<WizardStep, string> = {
  1: "Selecciona la plataforma donde vas a publicar",
  2: "¿Qué resultado quieres lograr con este anuncio?",
  3: "Elige el recurso visual de tu anuncio",
  4: "Redacta el mensaje y el llamado a la acción",
  5: "Define quién verá tu anuncio",
  6: "Configura cuánto vas a invertir y por cuánto tiempo",
  7: "Revisa todo antes de crear tu anuncio",
};

const PLATFORM_GROUP_OPTIONS: {
  key: AdPlatformGroup; label: string; badge: string;
  brandColor: string; brandBg: string; sub: string;
}[] = [
  { key: "meta",    label: "Meta",    badge: "M",  brandColor: "#1877F2", brandBg: "#eff6ff", sub: "Facebook · Instagram" },
  { key: "tiktok",  label: "TikTok",  badge: "TT", brandColor: "#161823", brandBg: "#f5f5f5", sub: "In-Feed Ads" },
  { key: "google",  label: "Google",  badge: "G",  brandColor: "#4285F4", brandBg: "#e8f0fe", sub: "Shopping · Búsqueda" },
  { key: "youtube", label: "YouTube", badge: "▶",  brandColor: "#FF0000", brandBg: "#fff5f5", sub: "Video Ads" },
];

const META_SUBCHANNELS: { key: MetaSubchannel; label: string; badge: string; color: string }[] = [
  { key: "facebook",  label: "Facebook",  badge: "f",  color: "#1877F2" },
  { key: "instagram", label: "Instagram", badge: "IG", color: "#C13584" },
];

const OBJECTIVE_OPTIONS: { key: AdObjective; label: string; desc: string; icon: string }[] = [
  { key: "mensajes",       label: "Mensajes",         icon: "💬", desc: "Genera conversaciones directas con potenciales compradores" },
  { key: "visitas",        label: "Visitas al sitio",  icon: "↗", desc: "Aumenta el tráfico a tu sitio web o tienda" },
  { key: "ventas",         label: "Ventas",            icon: "🛍", desc: "Convierte visitas en compras con tu catálogo de productos" },
  { key: "seguidores",     label: "Seguidores",        icon: "👥", desc: "Crece tu comunidad en redes sociales" },
  { key: "reconocimiento", label: "Reconocimiento",   icon: "👁", desc: "Posiciona tu marca y llega a nuevas audiencias" },
  { key: "alcance",        label: "Alcance",           icon: "📡", desc: "Maximiza la cantidad de personas que ven tu anuncio" },
];

const ASSET_SOURCE_OPTIONS: { key: AssetSource; label: string; sub: string; icon: string }[] = [
  { key: "biblioteca",   label: "Biblioteca",       sub: "Tus recursos guardados",       icon: "🗂" },
  { key: "foto_estudio", label: "Foto Estudio",     sub: "Crea un nuevo recurso visual", icon: "📷" },
  { key: "shopify",      label: "Producto Shopify", sub: "Importa desde tu tienda",      icon: "🛒" },
  { key: "upload_image", label: "Subir imagen",     sub: "JPG, PNG o WebP",              icon: "🖼" },
  { key: "upload_video", label: "Subir video",      sub: "MP4 o MOV",                    icon: "🎬" },
];

const DESTINO_OPTIONS: { key: AdDestino; label: string; sub: string }[] = [
  { key: "whatsapp", label: "WhatsApp Business", sub: "El usuario abre una conversación directa" },
  { key: "sitio",    label: "Sitio web",         sub: "El usuario llega a tu página web" },
  { key: "landing",  label: "Landing page",      sub: "El usuario llega a una página específica" },
];

const CURRENCIES = ["USD", "COP", "MXN", "ARS"];

// Mock Shopify product for auto-populate
const MOCK_SHOPIFY_PRODUCT = {
  name:  "Bolso de Cuero Premium",
  desc:  "Bolso artesanal en cuero genuino, disponible en negro, café y camel.",
  price: "$89.000 COP",
  link:  "https://tienda.ejemplo.com/productos/bolso-cuero-premium",
};

const DRAFT_INIT: AdDraft = {
  plataformas: [], metaSubchannels: [], objetivo: null, assets: [],
  textoPrincipal: "", cta: "", hashtags: "", urlDestino: "",
  destino: null, whatsappNumber: "",
  pais: "", ciudad: "", edadMin: "18", edadMax: "65", intereses: "", publico: "",
  monto: "", moneda: "USD", tipoPres: "diario", inicio: "", fin: "",
};

// ── Suggestions (static — future: sourced from analytics, Shopify, Biblioteca) ──

/**
 * AdSuggestion — a Luca-detected opportunity surfaced in the canvas.
 * draftPartial: pre-filled values to apply to AdDraft when the user accepts.
 * stepAfter: the wizard step to advance to once the draft is applied.
 */
interface AdSuggestion {
  id:          string;
  titulo:      string;
  priority:    string;   // e.g. "Alta oportunidad"
  origen:      string;   // signal source, e.g. "Producto Shopify: Bolso Premium"
  plataforma:  string;   // display label
  objetivo:    string;   // display label
  presupuesto: string;
  duracion:    string;
  razon:       string;
  cta:         string;
  platColor:   string;   // minimal accent only — not primary identity
  draftPartial: Partial<AdDraft>;
  stepAfter:   WizardStep;
}

/**
 * Static suggestions — deterministic placeholders.
 * Future sources: Shopify product signals, Biblioteca asset readiness,
 * campaign analytics, Copilot recommendations.
 */
const AD_SUGGESTIONS: AdSuggestion[] = [
  {
    id:          "sug_meta_mensajes",
    titulo:      "Aumentar conversaciones por WhatsApp",
    priority:    "Alta oportunidad",
    origen:      "Producto Shopify: Bolso Premium",
    plataforma:  "Meta",
    objetivo:    "Mensajes",
    presupuesto: "USD 100",
    duracion:    "7 días",
    razon:       "Producto con buena intención comercial y recursos listos en Biblioteca.",
    cta:         "Preparar anuncio",
    platColor:   "#1877F2",
    draftPartial: {
      plataformas:     ["meta"],
      metaSubchannels: ["facebook", "instagram"],
      objetivo:        "mensajes",
      destino:         "whatsapp",
      monto:           "100",
      moneda:          "USD",
      tipoPres:        "diario",
    },
    stepAfter: 3,
  },
  {
    id:          "sug_tiktok_alcance",
    titulo:      "Impulsar contenido con alto potencial",
    priority:    "Recomendación prioritaria",
    origen:      "Recurso Biblioteca: Video promocional",
    plataforma:  "TikTok",
    objetivo:    "Alcance",
    presupuesto: "USD 60",
    duracion:    "5 días",
    razon:       "Contenido visual listo para distribuir y atraer nuevas audiencias.",
    cta:         "Crear desde esta idea",
    platColor:   "#161823",
    draftPartial: {
      plataformas:     ["tiktok"],
      metaSubchannels: [],
      objetivo:        "alcance",
      monto:           "60",
      moneda:          "USD",
      tipoPres:        "diario",
    },
    stepAfter: 3,
  },
  {
    id:          "sug_google_visitas",
    titulo:      "Incrementar visitas a la tienda",
    priority:    "Oportunidad detectada hoy",
    origen:      "Señal detectada: Producto publicado sin tráfico",
    plataforma:  "Google",
    objetivo:    "Visitas al sitio",
    presupuesto: "USD 120",
    duracion:    "10 días",
    razon:       "Productos en Shopify sin visitas recientes pueden activarse con inversión directa.",
    cta:         "Completar asistente",
    platColor:   "#4285F4",
    draftPartial: {
      plataformas:     ["google"],
      metaSubchannels: [],
      objetivo:        "visitas",
      monto:           "120",
      moneda:          "USD",
      tipoPres:        "diario",
    },
    stepAfter: 3,
  },
];

// ── Utility ───────────────────────────────────────────────────────────────────

function computeDurationDays(inicio: string, fin: string): number | null {
  if (!inicio || !fin) return null;
  const ms = new Date(fin).getTime() - new Date(inicio).getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

function getCopilotRec(objetivo: AdObjective | null, monto: number, days: number | null): string {
  if (!objetivo || monto === 0) return "Completa el presupuesto para ver la recomendación de Copilot.";
  const dur = days ? `${days} días` : "el período definido";
  if (objetivo === "mensajes")
    return `Con ${monto} ${dur}, Copilot estima que puedes generar entre 30 y 80 conversaciones directas.`;
  if (objetivo === "ventas")
    return `Copilot considera este presupuesto adecuado para campañas de ventas en ${dur}.`;
  if (objetivo === "reconocimiento")
    return `Con este presupuesto puedes alcanzar entre 5.000 y 15.000 personas durante ${dur}.`;
  return `Copilot revisará el presupuesto cuando crees el anuncio.`;
}

// ── Helper components ─────────────────────────────────────────────────────────

function StepNav({ step }: { step: WizardStep }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: S[5], overflowX: "auto" }}>
      {STEP_LABELS.map((label, idx) => {
        const n        = (idx + 1) as WizardStep;
        const isDone   = n < step;
        const isActive = n === step;
        return (
          <React.Fragment key={label}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0 }}>
              <div style={{
                width: 26, height: 26, borderRadius: "50%",
                background:     isActive ? C.blueDark : isDone ? C.green : C.surfaceAlt,
                border:         `2px solid ${isActive ? C.blueDark : isDone ? C.green : C.line}`,
                display:        "flex", alignItems: "center", justifyContent: "center",
                fontFamily:     T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
                color:          (isActive || isDone) ? "#fff" : C.inkFaint,
              }}>
                {isDone ? "✓" : n}
              </div>
              <span style={{
                fontFamily: T.mono, fontSize: T.sz.xs,
                fontWeight: isActive ? T.wt.bold : T.wt.normal,
                color:      isActive ? C.ink : isDone ? C.green : C.inkFaint,
                whiteSpace: "nowrap",
              }}>
                {label}
              </span>
            </div>
            {idx < STEP_LABELS.length - 1 && (
              <div style={{
                flex: "1 1 16px", minWidth: 12, height: 2,
                background: isDone ? C.green : C.lineSubtle,
                marginBottom: 20, flexShrink: 1,
              }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function ResourcePreviewCard({ asset }: { asset: DraftAsset | null }) {
  if (!asset) {
    return (
      <div style={{
        height: 96, border: `1px dashed ${C.line}`, borderRadius: R.md,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: C.surface,
      }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
          Sin recurso seleccionado
        </span>
      </div>
    );
  }
  const srcOption = ASSET_SOURCE_OPTIONS.find(o => o.key === asset.source);
  const isShopify = asset.source === "shopify";
  return (
    <div style={{
      padding: `${S[3]}px`, border: `2px solid ${C.blueDark}`, borderRadius: R.md,
      background: "#eff6ff", display: "flex", gap: S[3], alignItems: "flex-start",
    }}>
      {/* Thumbnail placeholder */}
      <div style={{
        width: 72, height: 72, borderRadius: R.sm, background: C.white,
        border: `1px solid ${C.line}`, display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: 28, flexShrink: 0,
      }}>
        {srcOption?.icon ?? "📁"}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.blueDark }}>
          {asset.shopifyName ?? asset.label}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
          Origen: {srcOption?.label}
        </div>
        {isShopify && asset.shopifyDesc && (
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, lineHeight: 1.4 }}>
            {asset.shopifyDesc}
          </div>
        )}
        <div style={{ display: "flex", gap: S[2], alignItems: "center", marginTop: 2 }}>
          <span style={{
            padding: `1px ${S[2]}px`, background: C.green + "22",
            borderRadius: R.sm, fontFamily: T.mono, fontSize: 10, color: C.green,
          }}>
            Listo
          </span>
          {isShopify && asset.shopifyLink && (
            <span style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint }}>
              {asset.shopifyLink}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function SmartInvestmentCard({ draft }: { draft: AdDraft }) {
  const montoNum = parseFloat(draft.monto) || 0;
  const days     = computeDurationDays(draft.inicio, draft.fin);
  const total    = draft.tipoPres === "diario" && days ? montoNum * days : montoNum;
  const potMin   = montoNum > 0 ? Math.round(montoNum * 10).toLocaleString() : "—";
  const potMax   = montoNum > 0 ? Math.round(montoNum * 18).toLocaleString() : "—";
  const rec      = getCopilotRec(draft.objetivo, montoNum, days);

  return (
    <div style={{
      padding: `${S[4]}px`, background: C.surface,
      border: `1px solid ${C.line}`, borderRadius: R.md,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: S[2], marginBottom: S[3],
        fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink,
      }}>
        <span style={{ fontSize: 16 }}>✨</span>
        Resumen de inversión
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2], marginBottom: S[3] }}>
        {[
          { label: "Inversión total",       value: montoNum > 0 ? `${draft.moneda} ${total.toLocaleString()}` : "—" },
          { label: "Duración",              value: days ? `${days} días` : "—" },
          { label: "Tipo de presupuesto",   value: draft.tipoPres === "diario" ? "Diario" : "Total" },
          { label: "Público potencial",     value: montoNum > 0 ? `${potMin}–${potMax} personas` : "—" },
        ].map(r => (
          <div key={r.label}>
            <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {r.label}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.medium, color: C.ink }}>
              {r.value}
            </div>
          </div>
        ))}
      </div>
      <div style={{
        padding: `${S[2]}px ${S[3]}px`,
        background: C.white, borderRadius: R.sm, border: `1px solid ${C.line}`,
        fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, lineHeight: 1.5,
      }}>
        {rec}
      </div>
    </div>
  );
}

function ChecklistCard({
  icon, label, value, ok,
}: {
  icon: string; label: string; value: string; ok: boolean;
}) {
  return (
    <div style={{
      padding: `${S[3]}px`, border: `1px solid ${ok ? C.green : C.line}`,
      borderRadius: R.md, background: ok ? C.green + "08" : C.surface,
      display: "flex", gap: S[2], alignItems: "flex-start",
    }}>
      <span style={{
        width: 20, height: 20, borderRadius: "50%",
        background: ok ? C.green : C.line,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: T.mono, fontSize: 10, color: "#fff", flexShrink: 0,
      }}>
        {ok ? "✓" : "—"}
      </span>
      <div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>{label}</div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.medium, color: ok ? C.ink : C.inkFaint }}>
          {value || "Sin definir"}
        </div>
      </div>
      <span style={{ marginLeft: "auto", fontSize: 16, flexShrink: 0 }}>{icon}</span>
    </div>
  );
}

/** Maps a priority string to semantic token colors. */
function priorityStyle(priority: string): { color: string; bg: string } {
  if (priority.startsWith("Alta"))     return { color: C.green,    bg: "#f0fdf4" };
  if (priority.startsWith("Rec"))      return { color: C.blueDark, bg: "#eff6ff" };
  return                                      { color: C.amber,    bg: "#fffbeb" };
}

function SuggestionCard({
  sug, onAccept,
}: {
  sug:      AdSuggestion;
  onAccept: (sug: AdSuggestion) => void;
}) {
  const pStyle = priorityStyle(sug.priority);
  return (
    <div style={{
      background:    C.white,
      border:        `1px solid ${C.line}`,
      borderRadius:  R.lg,
      padding:       `${S[4]}px`,
      display:       "flex",
      flexDirection: "column",
      gap:            S[3],
    }}>
      {/* Row 1: priority badge + platform accent */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: S[2] }}>
        <span style={{
          padding:      `2px ${S[2]}px`,
          background:   pStyle.bg,
          borderRadius: R.pill,
          fontFamily:   T.mono,
          fontSize:     10,
          fontWeight:   T.wt.bold,
          color:        pStyle.color,
          whiteSpace:   "nowrap",
        }}>
          {sug.priority}
        </span>
        <span style={{
          fontFamily:  T.mono,
          fontSize:    T.sz.xs,
          fontWeight:  T.wt.medium,
          color:       sug.platColor,
          whiteSpace:  "nowrap",
        }}>
          {sug.plataforma}
        </span>
      </div>

      {/* Row 2: title */}
      <div style={{
        fontFamily: T.mono,
        fontSize:   T.sz.base,
        fontWeight: T.wt.bold,
        color:      C.ink,
        lineHeight: 1.3,
      }}>
        {sug.titulo}
      </div>

      {/* Row 3: origin signal */}
      <div style={{
        display:    "flex",
        alignItems: "center",
        gap:         S[1],
        fontFamily: T.mono,
        fontSize:   T.sz.xs,
        color:      C.inkFaint,
      }}>
        <span>↳</span>
        <span>{sug.origen}</span>
      </div>

      {/* Row 4: metadata grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: `${S[1]}px ${S[2]}px` }}>
        {[
          { label: "Objetivo",  value: sug.objetivo    },
          { label: "Inversión", value: sug.presupuesto },
          { label: "Duración",  value: sug.duracion    },
        ].map(m => (
          <div key={m.label}>
            <div style={{
              fontFamily:    T.mono, fontSize: 10, color: C.inkFaint,
              textTransform: "uppercase", letterSpacing: "0.06em",
            }}>
              {m.label}
            </div>
            <div style={{
              fontFamily: T.mono, fontSize: T.sz.sm,
              fontWeight: T.wt.semibold, color: C.ink,
            }}>
              {m.value}
            </div>
          </div>
        ))}
      </div>

      {/* Row 5: Luca reason */}
      <div style={{
        padding:      `${S[2]}px ${S[3]}px`,
        background:   C.surface,
        borderRadius: R.sm,
        borderLeft:   `3px solid ${C.line}`,
        fontFamily:   T.mono,
        fontSize:     T.sz.xs,
        color:        C.inkMid,
        lineHeight:   1.5,
      }}>
        <span style={{ color: C.inkFaint }}>Luca: </span>
        {sug.razon}
      </div>

      {/* Row 6: CTA */}
      <button
        onClick={() => onAccept(sug)}
        className="ag-action-secondary"
        style={{ width: "100%", justifyContent: "center" }}
      >
        {sug.cta} →
      </button>
    </div>
  );
}

// ── Componente de validación previa ──────────────────────────────────────────

function CheckIcon({ check }: { check: AdsValidationCheck }) {
  if (check.passed)                         return <span style={{ color: C.green,    fontFamily: T.mono }}>✓</span>;
  if (check.severity === "warning")         return <span style={{ color: C.amber,    fontFamily: T.mono }}>⚠</span>;
  if (check.severity === "info")            return <span style={{ color: C.blueDark, fontFamily: T.mono }}>i</span>;
  return                                           <span style={{ color: C.red,      fontFamily: T.mono }}>✗</span>;
}

type ApprovalState = "idle" | "approving" | "approved" | "error";

interface ValidationSectionProps {
  validating:          boolean;
  result:              AdsValidationResult | null;
  error:               string | null;
  approvalState:       ApprovalState;
  approvalError:       string | null;
  isApprovalInvalidated: boolean;
  executionState:      "idle" | "executing" | "done" | "error";
  executionResult:     AdsExecutionResult | null;
  syncState:           "idle" | "syncing" | "done" | "error";
  syncResult:          AdsSyncItemResult | null;
  onValidate:          () => void;
  onApprove:           () => void;
  onExecute:           () => void;
  onSync:              () => void;
}

function ValidationSection({
  validating, result, error,
  approvalState, approvalError,
  isApprovalInvalidated,
  executionState, executionResult,
  syncState, syncResult,
  onValidate, onApprove, onExecute, onSync,
}: ValidationSectionProps) {
  const statusColor = result
    ? result.status === "ready"           ? C.green
    : result.status === "needs_attention" ? C.amber
    : C.red
    : C.inkFaint;

  const statusLabel = result
    ? result.status === "ready"           ? "Listo para aprobación"
    : result.status === "needs_attention" ? "Requiere atención"
    : "Bloqueado"
    : "";

  return (
    <div style={{
      border: `1px solid ${C.line}`, borderRadius: R.md,
      background: C.surface, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: `${S[3]}px ${S[4]}px`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: result ? `1px solid ${C.line}` : "none",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: S[1] }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink }}>
            Validación previa
          </span>
          {result ? (
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: statusColor, fontWeight: T.wt.medium }}>
              {statusLabel}
              {result.errorCount > 0   && ` · ${result.errorCount} error${result.errorCount   !== 1 ? "es" : ""}`}
              {result.warningCount > 0 && ` · ${result.warningCount} advertencia${result.warningCount !== 1 ? "s" : ""}`}
            </span>
          ) : (
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
              Verifica que el anuncio cumpla los requisitos antes de enviarlo a revisión.
            </span>
          )}
        </div>
        <button
          className="ag-action-secondary"
          onClick={onValidate}
          disabled={validating}
          style={{ opacity: validating ? 0.6 : 1, flexShrink: 0 }}
        >
          {validating ? "Validando…" : result ? "Volver a validar" : "Validar anuncio"}
        </button>
      </div>

      {/* Error de red */}
      {error && (
        <div style={{ padding: `${S[2]}px ${S[4]}px` }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.red }}>{error}</span>
        </div>
      )}

      {/* Checklist */}
      {result && result.checks.length > 0 && (
        <div style={{ padding: `${S[3]}px ${S[4]}px`, display: "flex", flexDirection: "column", gap: S[1] }}>
          {result.checks.map(check => (
            <div key={check.code} style={{
              display: "flex", alignItems: "flex-start", gap: S[2],
              padding: `${S[1]}px 0`,
            }}>
              <CheckIcon check={check} />
              <div style={{ flex: 1 }}>
                <span style={{
                  fontFamily: T.mono, fontSize: T.sz.xs,
                  color: check.passed ? C.ink : check.severity === "warning" ? C.amber : check.severity === "info" ? C.blueDark : C.red,
                }}>
                  {check.label}
                </span>
                {!check.passed && check.message && (
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: 2 }}>
                    {check.message}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary */}
      {result && (
        <div style={{
          padding: `${S[2]}px ${S[4]}px ${S[3]}px`,
          borderTop: `1px solid ${C.line}`,
        }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
            {result.summary}
          </span>
        </div>
      )}

      {/* ── Flujo de aprobación — visible solo cuando validación = ready ── */}
      {result?.status === "ready" && approvalState !== "approved" && (
        <div style={{
          padding: `${S[3]}px ${S[4]}px`,
          borderTop: `1px solid ${C.line}`,
          background: "#f0fdf4",
          display: "flex", flexDirection: "column", gap: S[2],
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
            <span style={{ color: C.green, fontFamily: T.mono, fontSize: T.sz.sm }}>✓</span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink }}>
              Listo para aprobación
            </span>
          </div>
          <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, margin: 0 }}>
            El anuncio cumple las condiciones necesarias y puede enviarse a publicación cuando sea aprobado.
          </p>
          {approvalError && (
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.red }}>
              {approvalError}
            </span>
          )}
          <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
            <button
              className="ag-action-ghost"
              onClick={onValidate}
              disabled={validating || approvalState === "approving"}
            >
              Volver a editar
            </button>
            <button
              className="ag-action-primary"
              onClick={onApprove}
              disabled={approvalState === "approving"}
              style={{ opacity: approvalState === "approving" ? 0.6 : 1 }}
            >
              {approvalState === "approving" ? "Aprobando…" : "Aprobar y continuar"}
            </button>
          </div>
        </div>
      )}

      {/* ── Invalidación: borrador cambió después de aprobar ───────────── */}
      {approvalState === "approved" && isApprovalInvalidated && (
        <div style={{
          padding: `${S[3]}px ${S[4]}px`,
          borderTop: `1px solid ${C.line}`,
          background: "#fffbeb",
          display: "flex", flexDirection: "column", gap: S[2],
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
            <span style={{ color: C.amber, fontFamily: T.mono, fontSize: T.sz.sm }}>⚠</span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.amber }}>
              Borrador modificado — aprobación inválida
            </span>
          </div>
          <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, margin: 0 }}>
            El borrador cambió después de la aprobación. Vuelve a validar y aprobar para continuar.
          </p>
          <button className="ag-action-secondary" onClick={onValidate} style={{ alignSelf: "flex-start" }}>
            Volver a validar
          </button>
        </div>
      )}

      {/* ── Estado aprobado y válido ─────────────────────────────────── */}
      {approvalState === "approved" && !isApprovalInvalidated && executionState !== "done" && (
        <div style={{
          padding: `${S[3]}px ${S[4]}px`,
          borderTop: `1px solid ${C.line}`,
          background: "#f0fdf4",
          display: "flex", flexDirection: "column", gap: S[3],
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: S[3] }}>
            <span style={{ color: C.green, fontFamily: T.mono, fontSize: 20 }}>✓</span>
            <div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink }}>
                Aprobado
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                El anuncio fue aprobado. Haz clic en "Publicar" para crear la campaña en pausa.
              </div>
            </div>
          </div>
          {executionState === "error" && (
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.red }}>
              Error al publicar. Intenta nuevamente.
            </span>
          )}
          <button
            className="ag-action-primary"
            onClick={onExecute}
            disabled={executionState === "executing"}
            style={{ opacity: executionState === "executing" ? 0.6 : 1, alignSelf: "flex-start" }}
          >
            {executionState === "executing" ? "Publicando…" : "Publicar en plataforma"}
          </button>
        </div>
      )}

      {/* ── Resultado de ejecución ────────────────────────────────────── */}
      {executionState === "done" && executionResult && (
        <div style={{
          padding: `${S[3]}px ${S[4]}px`,
          borderTop: `1px solid ${C.line}`,
          background: executionResult.status === "completed" ? "#f0fdf4"
                    : executionResult.status === "partial"   ? "#fffbeb"
                    : "#fef2f2",
          display: "flex", flexDirection: "column", gap: S[2],
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
            <span style={{
              color:      executionResult.status === "completed" ? C.green
                        : executionResult.status === "partial"   ? C.amber : C.red,
              fontFamily: T.mono, fontSize: T.sz.sm,
            }}>
              {executionResult.status === "completed" ? "✓" : executionResult.status === "partial" ? "⚠" : "✗"}
            </span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink }}>
              {executionResult.status === "completed" ? "Campaña creada en pausa"
               : executionResult.status === "partial"  ? "Publicación parcial"
               : "Error al publicar"}
            </span>
          </div>
          <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, margin: 0 }}>
            {executionResult.summary}
          </p>
          {Object.keys(executionResult.externalReferenceIds).length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {Object.entries(executionResult.externalReferenceIds).map(([k, v]) => (
                <span key={k} style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkFaint }}>
                  {k}: {v}
                </span>
              ))}
            </div>
          )}
          {executionResult.status !== "failed" && (
            <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, margin: 0 }}>
              La campaña está en estado PAUSA. Actívala manualmente desde el panel de la plataforma.
            </p>
          )}

          {/* Sync state */}
          {syncState === "done" && syncResult && (
            <div style={{
              padding: `${S[2]}px ${S[3]}px`,
              background: C.surface, border: `1px solid ${C.line}`,
              borderRadius: R.sm, display: "flex", flexDirection: "column", gap: 4,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                  Estado externo:
                </span>
                <span style={{
                  fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
                  color: syncResult.externalStatus === "active"    ? C.green
                       : syncResult.externalStatus === "rejected"  ? C.red
                       : syncResult.externalStatus === "paused"    ? C.amber
                       : C.ink,
                }}>
                  {ADS_EXTERNAL_STATUS_LABEL[syncResult.externalStatus] ?? syncResult.externalStatus}
                </span>
              </div>
              <span style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkFaint }}>
                Última sync: {new Date(syncResult.lastSyncedAt).toLocaleString("es-CO")}
              </span>
              {syncResult.issues.length > 0 && (
                <span style={{ fontFamily: T.mono, fontSize: "10px", color: C.amber }}>
                  {syncResult.issues[0]?.message}
                </span>
              )}
            </div>
          )}
          {syncState === "error" && (
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.red }}>
              Error al sincronizar. Intenta nuevamente.
            </span>
          )}

          <button
            className="ag-action-secondary"
            onClick={onSync}
            disabled={syncState === "syncing"}
            style={{ opacity: syncState === "syncing" ? 0.6 : 1, alignSelf: "flex-start" }}
          >
            {syncState === "syncing" ? "Actualizando…" : "Actualizar estado"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface AnunciosDashboardProps {
  state:   AdsRuntimeState;
  orgSlug: string;
}

// ── Main component ────────────────────────────────────────────────────────────

export function AnunciosDashboard({ state, orgSlug }: AnunciosDashboardProps) {
  const { ads, connectivity } = state;

  const [step,             setStep]            = useState<WizardStep>(1);
  const [draft,            setDraft]           = useState<AdDraft>(DRAFT_INIT);
  const [executing,        setExecuting]       = useState<string | null>(null);
  const [isSubmitted,      setIsSubmitted]     = useState(false);
  const [drawerAd,         setDrawerAd]        = useState<AdEntity | null>(null);
  const [validating,       setValidating]      = useState(false);
  const [validationResult, setValidationResult] = useState<AdsValidationResult | null>(null);
  const [validationError,  setValidationError] = useState<string | null>(null);
  const [approvalState,    setApprovalState]   = useState<ApprovalState>("idle");
  const [approvalError,    setApprovalError]   = useState<string | null>(null);
  const [executionState,   setExecutionState]  = useState<"idle" | "executing" | "done" | "error">("idle");
  const [executionResult,  setExecutionResult] = useState<AdsExecutionResult | null>(null);
  const [approvedVersion,  setApprovedVersion] = useState<string | null>(null);
  const [syncState,        setSyncState]       = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [syncResult,       setSyncResult]      = useState<AdsSyncItemResult | null>(null);

  // ── Copilot-ready: applyDraft fills wizard from an external intent ───────────
  const applyDraft = useCallback((partial: Partial<AdDraft>) => {
    setDraft(d => ({ ...d, ...partial }));
  }, []);

  // ── Action stub ─────────────────────────────────────────────────────────────
  const handleAction = useCallback((intent: string) => {
    setExecuting(intent);
    setTimeout(() => setExecuting(null), 800);
  }, []);

  const handleFinal = useCallback((intent: string) => {
    handleAction(intent);
    setIsSubmitted(true);
    setTimeout(() => { setIsSubmitted(false); setStep(1); setDraft(DRAFT_INIT); }, 2500);
  }, [handleAction]);

  // ── Suggestion handler — fills draft + advances wizard ──────────────────────
  const handleSuggestion = useCallback((sug: AdSuggestion) => {
    applyDraft({ ...DRAFT_INIT, ...sug.draftPartial });
    setStep(sug.stepAfter);
  }, [applyDraft]);

  // ── Validación previa ────────────────────────────────────────────────────────
  const handleValidate = useCallback(async () => {
    setValidating(true);
    setValidationResult(null);
    setValidationError(null);
    setApprovalState("idle");
    setApprovalError(null);
    try {
      const body = {
        plataformas:     draft.plataformas,
        metaSubchannels: draft.metaSubchannels,
        objetivo:        draft.objetivo,
        hasAsset:        draft.assets.length > 0,
        textoPrincipal:  draft.textoPrincipal,
        destino:         draft.destino,
        urlDestino:      draft.urlDestino,
        whatsappNumber:  draft.whatsappNumber,
        monto:           draft.monto,
        inicio:          draft.inicio,
        fin:             draft.fin,
      };
      const res  = await fetch(`/api/orgs/${orgSlug}/marketing-studio/ads/validate`, {
        method:  "POST",
        body:    JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json() as { validationResult?: AdsValidationResult; error?: string };
      if (!res.ok || data.error) {
        setValidationError(data.error ?? "Error al validar el anuncio. Intenta nuevamente.");
      } else if (data.validationResult) {
        setValidationResult(data.validationResult);
      }
    } catch {
      setValidationError("Error de red al validar. Intenta nuevamente.");
    } finally {
      setValidating(false);
    }
  }, [orgSlug, draft]);

  // ── Aprobación formal ─────────────────────────────────────────────────────────
  const handleApprove = useCallback(async () => {
    if (!validationResult?.executionId) return;
    setApprovalState("approving");
    setApprovalError(null);
    setExecutionState("idle");
    setExecutionResult(null);

    // Construir ApprovedExecutionSnapshot desde el borrador actual.
    // Este snapshot es inmutable: si el borrador cambia después, la aprobación queda inválida.
    const versionHash = computeApprovalVersion({
      plataformas:    draft.plataformas,
      objetivo:       draft.objetivo ?? "",
      monto:          draft.monto,
      moneda:         draft.moneda,
      tipoPres:       draft.tipoPres,
      inicio:         draft.inicio,
      fin:            draft.fin,
      textoPrincipal: draft.textoPrincipal,
      urlDestino:     draft.urlDestino,
      destino:        draft.destino,
    });

    const snapshot: ApprovedExecutionSnapshot = {
      approvalVersion:        versionHash,
      snapshotAt:             new Date().toISOString(),
      plataformas:            draft.plataformas,
      metaSubchannels:        draft.metaSubchannels,
      objetivo:               draft.objetivo ?? "",
      assets:                 draft.assets.map(a => ({
        id:           a.id,
        source:       a.source,
        label:        a.label,
        shopifyName:  a.shopifyName,
        shopifyLink:  a.shopifyLink,
      })),
      textoPrincipal:         draft.textoPrincipal,
      cta:                    draft.cta,
      hashtags:               draft.hashtags,
      destino:                draft.destino,
      urlDestino:             draft.urlDestino,
      whatsappNumber:         draft.whatsappNumber,
      pais:                   draft.pais,
      ciudad:                 draft.ciudad,
      edadMin:                draft.edadMin,
      edadMax:                draft.edadMax,
      intereses:              draft.intereses,
      publico:                draft.publico,
      monto:                  draft.monto,
      moneda:                 draft.moneda,
      tipoPres:               draft.tipoPres,
      inicio:                 draft.inicio,
      fin:                    draft.fin,
      // Cuentas de plataforma — resueltas aquí desde la conectividad.
      // PLACEHOLDER: se integrarán con TenantAdsConfig en MARKETING-ADS-ACCOUNTS-01.
      metaAdAccountId:        null,
      metaAdAccountName:      null,
      metaPageId:             null,
      metaPageName:           null,
      metaInstagramAccountId: null,
      tiktokAdvertiserId:     null,
      tiktokAdvertiserName:   null,
    };

    try {
      const res  = await fetch(`/api/orgs/${orgSlug}/marketing-studio/ads/approve`, {
        method:  "POST",
        body:    JSON.stringify({ executionId: validationResult.executionId, snapshot }),
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json() as { result?: { success: boolean }; error?: string };
      if (!res.ok || data.error) {
        setApprovalState("error");
        setApprovalError(data.error ?? "Error al aprobar. Intenta nuevamente.");
      } else {
        setApprovalState("approved");
        setApprovedVersion(versionHash);
      }
    } catch {
      setApprovalState("error");
      setApprovalError("Error de red al aprobar. Intenta nuevamente.");
    }
  }, [orgSlug, validationResult, draft]);

  // ── Detección de invalidación de aprobación ───────────────────────────────────
  const currentDraftVersion = approvedVersion
    ? computeApprovalVersion({
        plataformas:    draft.plataformas,
        objetivo:       draft.objetivo ?? "",
        monto:          draft.monto,
        moneda:         draft.moneda,
        tipoPres:       draft.tipoPres,
        inicio:         draft.inicio,
        fin:            draft.fin,
        textoPrincipal: draft.textoPrincipal,
        urlDestino:     draft.urlDestino,
        destino:        draft.destino,
      })
    : null;

  const isApprovalInvalidated =
    approvalState === "approved" &&
    approvedVersion !== null &&
    currentDraftVersion !== null &&
    currentDraftVersion !== approvedVersion;

  // ── Ejecución real ────────────────────────────────────────────────────────────
  const handleExecute = useCallback(async () => {
    if (!validationResult?.executionId) return;
    if (isApprovalInvalidated) return;
    setExecutionState("executing");
    setExecutionResult(null);
    try {
      const res  = await fetch(`/api/orgs/${orgSlug}/marketing-studio/ads/execute`, {
        method:  "POST",
        body:    JSON.stringify({ executionId: validationResult.executionId }),
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json() as AdsExecuteApiResponse & { error?: string };
      if (!res.ok || data.error) {
        setExecutionState("error");
        setExecutionResult(null);
      } else {
        setExecutionState("done");
        setExecutionResult(data.executionResult ?? null);
      }
    } catch {
      setExecutionState("error");
    }
  }, [orgSlug, validationResult, isApprovalInvalidated]);

  // ── Sincronización de estado ──────────────────────────────────────────────────
  const handleSync = useCallback(async () => {
    if (!validationResult?.executionId) return;
    setSyncState("syncing");
    setSyncResult(null);
    try {
      const res  = await fetch(`/api/orgs/${orgSlug}/marketing-studio/ads/sync`, {
        method:  "POST",
        body:    JSON.stringify({ executionId: validationResult.executionId }),
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json() as AdsSyncApiResponse & { error?: string };
      if (!res.ok || data.error) {
        setSyncState("error");
      } else {
        setSyncState("done");
        setSyncResult(data.syncResult?.items?.[0] ?? null);
      }
    } catch {
      setSyncState("error");
    }
  }, [orgSlug, validationResult]);

  // ── Field helpers ────────────────────────────────────────────────────────────
  function setField<K extends keyof AdDraft>(key: K, value: AdDraft[K]) {
    setDraft(d => ({ ...d, [key]: value }));
  }

  function togglePlatformGroup(p: AdPlatformGroup) {
    setDraft(d => ({
      ...d,
      plataformas: d.plataformas.includes(p)
        ? d.plataformas.filter(x => x !== p)
        : [...d.plataformas, p],
      // Clear Meta sub-channels if Meta is deselected
      metaSubchannels: p === "meta" && d.plataformas.includes(p) ? [] : d.metaSubchannels,
    }));
  }

  function toggleMetaSubchannel(ch: MetaSubchannel) {
    setDraft(d => ({
      ...d,
      metaSubchannels: d.metaSubchannels.includes(ch)
        ? d.metaSubchannels.filter(x => x !== ch)
        : [...d.metaSubchannels, ch],
    }));
  }

  function selectAsset(source: AssetSource) {
    const option = ASSET_SOURCE_OPTIONS.find(o => o.key === source)!;
    const isShopify = source === "shopify";
    setDraft(d => ({
      ...d,
      assets: [{
        id:           `${source}-${Date.now()}`,
        source,
        label:        isShopify ? MOCK_SHOPIFY_PRODUCT.name : option.label,
        shopifyName:  isShopify ? MOCK_SHOPIFY_PRODUCT.name  : undefined,
        shopifyDesc:  isShopify ? MOCK_SHOPIFY_PRODUCT.desc  : undefined,
        shopifyLink:  isShopify ? MOCK_SHOPIFY_PRODUCT.link  : undefined,
      }],
    }));
  }

  function applyShopifyToContent() {
    setDraft(d => ({
      ...d,
      textoPrincipal: d.textoPrincipal || MOCK_SHOPIFY_PRODUCT.desc,
      urlDestino:     d.urlDestino     || MOCK_SHOPIFY_PRODUCT.link,
    }));
  }

  // ── Navigation guards ────────────────────────────────────────────────────────
  function canAdvance(): boolean {
    if (step === 1) {
      if (draft.plataformas.length === 0) return false;
      if (draft.plataformas.includes("meta") && draft.metaSubchannels.length === 0) return false;
      return true;
    }
    if (step === 2) return draft.objetivo !== null;
    if (step === 3) return draft.assets.length > 0;
    if (step === 4) return true;
    if (step === 5) return true;
    if (step === 6) return draft.monto.trim().length > 0;
    return false;
  }

  function goNext() { if (canAdvance() && step < 7) setStep((step + 1) as WizardStep); }
  function goPrev() { if (step > 1) setStep((step - 1) as WizardStep); }

  // ── Derived display values ────────────────────────────────────────────────────
  const platformSummary = draft.plataformas.map(p => {
    if (p === "meta") {
      const subs = draft.metaSubchannels.map(s => s === "facebook" ? "Facebook" : "Instagram").join(" + ");
      return subs ? `Meta (${subs})` : "Meta";
    }
    return PLATFORM_GROUP_OPTIONS.find(o => o.key === p)?.label ?? p;
  }).join(" · ");

  const budgetSummary = draft.monto
    ? `${draft.moneda} ${draft.monto} ${draft.tipoPres === "diario" ? "/ día" : "total"}`
    : "";

  const needsDestino = draft.objetivo === "mensajes";
  const needsUrl     = draft.objetivo === "visitas" || draft.objetivo === "ventas";

  // ── Success screen ─────────────────────────────────────────────────────────
  if (isSubmitted) {
    return (
      <div style={{ padding: `${S[8]}px ${S[5]}px`, display: "flex", flexDirection: "column", alignItems: "center", gap: S[3] }}>
        <div style={{ fontSize: 36 }}>✓</div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.ink }}>
          Anuncio enviado a revisión
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid, textAlign: "center", maxWidth: 360 }}>
          Copilot procesará la solicitud, validará la política de inversión y te notificará cuando esté listo.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: `0 ${S[5]}px ${S[8]}px` }}>

      {/* ── Suggestions — Luca-detected opportunities ───────────────────── */}
      <div style={{ marginBottom: S[5] }}>
        <div style={{ marginBottom: S[3] }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.bold, color: C.ink, marginBottom: 4 }}>
            Sugerencias de anuncios
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid }}>
            Luca detectó oportunidades que puedes convertir en anuncios pagos.
          </div>
        </div>
        <div style={{
          display:             "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap:                 S[4],
        }}>
          {AD_SUGGESTIONS.map(sug => (
            <SuggestionCard
              key={sug.id}
              sug={sug}
              onAccept={handleSuggestion}
            />
          ))}
        </div>
      </div>

      {/* ── Primary Panel: Wizard ────────────────────────────────────────── */}
      <AgModulePrimaryPanel
        moduleLabel="Publicidad paga"
        headline="Nuevo anuncio"
        headlineSub={STEP_DESCRIPTIONS[step]}
      >
        <StepNav step={step} />

        {/* ── Step 1: Plataforma ─────────────────────────────────────────── */}
        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
              {PLATFORM_GROUP_OPTIONS.map(p => {
                const selected = draft.plataformas.includes(p.key);
                return (
                  <div key={p.key} style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
                    <button
                      onClick={() => togglePlatformGroup(p.key)}
                      style={{
                        padding: `${S[4]}px`,
                        border:      `2px solid ${selected ? p.brandColor : C.line}`,
                        borderRadius: R.md,
                        background:   selected ? p.brandBg : C.white,
                        cursor:       "pointer",
                        textAlign:    "left",
                        position:     "relative",
                        width:        "100%",
                      }}
                    >
                      {selected && (
                        <span style={{
                          position: "absolute", top: 8, right: 8,
                          width: 18, height: 18, borderRadius: "50%",
                          background: p.brandColor,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontFamily: T.mono, fontSize: 10, color: "#fff", fontWeight: T.wt.bold,
                        }}>✓</span>
                      )}
                      <div style={{
                        width: 36, height: 36, borderRadius: R.sm,
                        background: p.brandColor, display: "flex",
                        alignItems: "center", justifyContent: "center",
                        fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.bold,
                        color: "#fff", marginBottom: S[2],
                      }}>
                        {p.badge}
                      </div>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.bold, color: C.ink }}>
                        {p.label}
                      </div>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                        {p.sub}
                      </div>
                    </button>

                    {/* Meta sub-channel selection */}
                    {p.key === "meta" && selected && (
                      <div style={{
                        padding:      `${S[2]}px ${S[3]}px`,
                        background:   C.surface,
                        border:       `1px solid ${C.line}`,
                        borderRadius: R.md,
                        display:      "flex",
                        gap:          S[2],
                      }}>
                        {META_SUBCHANNELS.map(sub => {
                          const checked = draft.metaSubchannels.includes(sub.key);
                          return (
                            <label
                              key={sub.key}
                              style={{
                                display: "flex", alignItems: "center", gap: S[1],
                                cursor: "pointer", flex: 1,
                                padding: `${S[2]}px`,
                                border:  `1px solid ${checked ? sub.color : C.line}`,
                                borderRadius: R.sm,
                                background: checked ? sub.color + "12" : C.white,
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleMetaSubchannel(sub.key)}
                                style={{ accentColor: sub.color }}
                              />
                              <span style={{
                                fontFamily: T.mono, fontSize: T.sz.xs,
                                fontWeight: checked ? T.wt.bold : T.wt.normal,
                                color: checked ? sub.color : C.inkMid,
                              }}>
                                {sub.label}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {draft.plataformas.length === 0 && (
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                Selecciona al menos una plataforma para continuar.
              </div>
            )}
            {draft.plataformas.includes("meta") && draft.metaSubchannels.length === 0 && (
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.amber }}>
                Selecciona Facebook, Instagram o ambos dentro de Meta.
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Objetivo ───────────────────────────────────────────── */}
        {step === 2 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: S[3] }}>
            {OBJECTIVE_OPTIONS.map(obj => {
              const selected = draft.objetivo === obj.key;
              return (
                <button
                  key={obj.key}
                  onClick={() => setField("objetivo", obj.key)}
                  style={{
                    padding: `${S[4]}px`,
                    border:  `2px solid ${selected ? C.blueDark : C.line}`,
                    borderRadius: R.md,
                    background: selected ? "#eff6ff" : C.white,
                    cursor: "pointer", textAlign: "left",
                  }}
                >
                  <div style={{ fontSize: 24, marginBottom: S[2] }}>{obj.icon}</div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: selected ? C.blueDark : C.ink, marginBottom: 4 }}>
                    {obj.label}
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, lineHeight: 1.4 }}>
                    {obj.desc}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Step 3: Recurso ────────────────────────────────────────────── */}
        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
            <ResourcePreviewCard asset={draft.assets[0] ?? null} />

            {/* Shopify auto-populate button */}
            {draft.assets[0]?.source === "shopify" && (
              <button
                onClick={applyShopifyToContent}
                style={{
                  display: "flex", alignItems: "center", gap: S[2],
                  padding: `${S[2]}px ${S[3]}px`,
                  background: "#f0fdf4", border: `1px solid ${C.green}`,
                  borderRadius: R.md, cursor: "pointer",
                  fontFamily: T.mono, fontSize: T.sz.xs, color: C.green,
                }}
              >
                <span>🛒</span>
                Usar información del producto en el contenido del anuncio
              </button>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: S[2] }}>
              {ASSET_SOURCE_OPTIONS.map(opt => {
                const selected = draft.assets[0]?.source === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => selectAsset(opt.key)}
                    style={{
                      padding: `${S[3]}px`,
                      border:  `2px solid ${selected ? C.blueDark : C.line}`,
                      borderRadius: R.md,
                      background: selected ? "#eff6ff" : C.white,
                      cursor: "pointer", textAlign: "left",
                      display: "flex", alignItems: "center", gap: S[2],
                    }}
                  >
                    <span style={{ fontSize: 20 }}>{opt.icon}</span>
                    <div>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: selected ? C.blueDark : C.ink }}>
                        {opt.label}
                      </div>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                        {opt.sub}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Step 4: Contenido ──────────────────────────────────────────── */}
        {step === 4 && (
          <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>Texto principal</span>
              <textarea
                value={draft.textoPrincipal}
                onChange={e => setField("textoPrincipal", e.target.value)}
                placeholder="Escribe el mensaje principal de tu anuncio..."
                rows={4}
                style={{
                  fontFamily: T.mono, fontSize: T.sz.sm,
                  padding: `${S[2]}px ${S[3]}px`,
                  border: `1px solid ${C.line}`, borderRadius: R.md,
                  background: C.white, color: C.ink, outline: "none", resize: "vertical",
                }}
              />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>Llamado a la acción</span>
                <input
                  type="text"
                  value={draft.cta}
                  onChange={e => setField("cta", e.target.value)}
                  placeholder="Comprar ahora, Ver más..."
                  style={{
                    fontFamily: T.mono, fontSize: T.sz.sm,
                    padding: `${S[2]}px ${S[3]}px`,
                    border: `1px solid ${C.line}`, borderRadius: R.md,
                    background: C.white, color: C.ink, outline: "none",
                  }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>Hashtags (opcional)</span>
                <input
                  type="text"
                  value={draft.hashtags}
                  onChange={e => setField("hashtags", e.target.value)}
                  placeholder="#marca #producto"
                  style={{
                    fontFamily: T.mono, fontSize: T.sz.sm,
                    padding: `${S[2]}px ${S[3]}px`,
                    border: `1px solid ${C.line}`, borderRadius: R.md,
                    background: C.white, color: C.ink, outline: "none",
                  }}
                />
              </label>
            </div>

            {/* URL destino — when objetivo = visitas / ventas */}
            {needsUrl && (
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>URL de destino</span>
                <input
                  type="url"
                  value={draft.urlDestino}
                  onChange={e => setField("urlDestino", e.target.value)}
                  placeholder="https://tutienda.com"
                  style={{
                    fontFamily: T.mono, fontSize: T.sz.sm,
                    padding: `${S[2]}px ${S[3]}px`,
                    border: `1px solid ${C.line}`, borderRadius: R.md,
                    background: C.white, color: C.ink, outline: "none",
                  }}
                />
              </label>
            )}

            {/* Destino — when objetivo = mensajes */}
            {needsDestino && (
              <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                  Enviar conversaciones a
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
                  {DESTINO_OPTIONS.map(d => {
                    const selected = draft.destino === d.key;
                    return (
                      <label
                        key={d.key}
                        style={{
                          display: "flex", alignItems: "flex-start", gap: S[2],
                          padding: `${S[2]}px ${S[3]}px`,
                          border: `1px solid ${selected ? C.blueDark : C.line}`,
                          borderRadius: R.md,
                          background: selected ? "#eff6ff" : C.white,
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="radio"
                          name="destino"
                          checked={selected}
                          onChange={() => setField("destino", d.key)}
                          style={{ marginTop: 3, accentColor: C.blueDark }}
                        />
                        <div>
                          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: selected ? T.wt.bold : T.wt.normal, color: selected ? C.blueDark : C.ink }}>
                            {d.label}
                          </div>
                          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                            {d.sub}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
                {draft.destino === "whatsapp" && (
                  <input
                    type="tel"
                    value={draft.whatsappNumber}
                    onChange={e => setField("whatsappNumber", e.target.value)}
                    placeholder="+57 300 000 0000"
                    style={{
                      fontFamily: T.mono, fontSize: T.sz.sm,
                      padding: `${S[2]}px ${S[3]}px`,
                      border: `1px solid ${C.line}`, borderRadius: R.md,
                      background: C.white, color: C.ink, outline: "none",
                    }}
                  />
                )}
              </div>
            )}

            {/* Generar todo con Copilot */}
            <button
              onClick={() => handleAction("anuncios:generate_all_content")}
              disabled={executing === "anuncios:generate_all_content"}
              style={{
                display: "flex", alignItems: "center", gap: S[2],
                padding: `${S[3]}px ${S[4]}px`,
                border: `2px solid ${C.blueDark}`,
                borderRadius: R.md,
                background: C.blueDark + "0a",
                cursor: "pointer",
                fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold,
                color: C.blueDark,
              }}
            >
              <span style={{ fontSize: 18 }}>✨</span>
              {executing === "anuncios:generate_all_content" ? "Generando..." : "Generar todo con Copilot"}
              <span style={{ marginLeft: "auto", fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, fontWeight: T.wt.normal }}>
                copy · CTA · hashtags
              </span>
            </button>
          </div>
        )}

        {/* ── Step 5: Audiencia ──────────────────────────────────────────── */}
        {step === 5 && (
          <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
              {([
                { key: "pais",   label: "País",             placeholder: "Colombia" },
                { key: "ciudad", label: "Ciudad o región",  placeholder: "Bogotá, Medellín..." },
              ] as { key: keyof AdDraft; label: string; placeholder: string }[]).map(f => (
                <label key={f.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>{f.label}</span>
                  <input
                    type="text"
                    value={draft[f.key] as string}
                    onChange={e => setField(f.key, e.target.value as AdDraft[typeof f.key])}
                    placeholder={f.placeholder}
                    style={{
                      fontFamily: T.mono, fontSize: T.sz.sm,
                      padding: `${S[2]}px ${S[3]}px`,
                      border: `1px solid ${C.line}`, borderRadius: R.md,
                      background: C.white, color: C.ink, outline: "none",
                    }}
                  />
                </label>
              ))}
              {([
                { key: "edadMin", label: "Edad mínima", type: "number" },
                { key: "edadMax", label: "Edad máxima", type: "number" },
              ] as { key: keyof AdDraft; label: string; type: string }[]).map(f => (
                <label key={f.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>{f.label}</span>
                  <input
                    type={f.type} min={13} max={65}
                    value={draft[f.key] as string}
                    onChange={e => setField(f.key, e.target.value as AdDraft[typeof f.key])}
                    style={{
                      fontFamily: T.mono, fontSize: T.sz.sm,
                      padding: `${S[2]}px ${S[3]}px`,
                      border: `1px solid ${C.line}`, borderRadius: R.md,
                      background: C.white, color: C.ink, outline: "none",
                    }}
                  />
                </label>
              ))}
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>Intereses</span>
              <input
                type="text"
                value={draft.intereses}
                onChange={e => setField("intereses", e.target.value)}
                placeholder="Moda, accesorios, compras en línea..."
                style={{
                  fontFamily: T.mono, fontSize: T.sz.sm,
                  padding: `${S[2]}px ${S[3]}px`,
                  border: `1px solid ${C.line}`, borderRadius: R.md,
                  background: C.white, color: C.ink, outline: "none",
                }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>Público objetivo</span>
              <textarea
                value={draft.publico}
                onChange={e => setField("publico", e.target.value)}
                placeholder="Describe tu cliente ideal..."
                rows={3}
                style={{
                  fontFamily: T.mono, fontSize: T.sz.sm,
                  padding: `${S[2]}px ${S[3]}px`,
                  border: `1px solid ${C.line}`, borderRadius: R.md,
                  background: C.white, color: C.ink, outline: "none", resize: "vertical",
                }}
              />
            </label>
          </div>
        )}

        {/* ── Step 6: Presupuesto ────────────────────────────────────────── */}
        {step === 6 && (
          <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>Monto de inversión</span>
                <input
                  type="number" min={0}
                  value={draft.monto}
                  onChange={e => setField("monto", e.target.value)}
                  placeholder="100"
                  style={{
                    fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.bold,
                    padding: `${S[2]}px ${S[3]}px`,
                    border: `1px solid ${C.line}`, borderRadius: R.md,
                    background: C.white, color: C.ink, outline: "none",
                  }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>Moneda</span>
                <select
                  value={draft.moneda}
                  onChange={e => setField("moneda", e.target.value)}
                  style={{
                    fontFamily: T.mono, fontSize: T.sz.sm,
                    padding: `${S[2]}px ${S[3]}px`,
                    border: `1px solid ${C.line}`, borderRadius: R.md,
                    background: C.white, color: C.ink, outline: "none",
                  }}
                >
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </div>

            <div style={{ display: "flex", gap: S[3] }}>
              {(["diario", "total"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setField("tipoPres", t)}
                  style={{
                    flex: 1, padding: `${S[2]}px`,
                    border: `2px solid ${draft.tipoPres === t ? C.blueDark : C.line}`,
                    borderRadius: R.md,
                    background: draft.tipoPres === t ? "#eff6ff" : C.white,
                    cursor: "pointer",
                    fontFamily: T.mono, fontSize: T.sz.sm,
                    fontWeight: draft.tipoPres === t ? T.wt.bold : T.wt.normal,
                    color: draft.tipoPres === t ? C.blueDark : C.ink,
                  }}
                >
                  {t === "diario" ? "Presupuesto diario" : "Presupuesto total"}
                </button>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>Fecha de inicio</span>
                <input
                  type="date"
                  value={draft.inicio}
                  onChange={e => setField("inicio", e.target.value)}
                  style={{
                    fontFamily: T.mono, fontSize: T.sz.sm,
                    padding: `${S[2]}px ${S[3]}px`,
                    border: `1px solid ${C.line}`, borderRadius: R.md,
                    background: C.white, color: C.ink, outline: "none",
                  }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>Fecha de finalización</span>
                <input
                  type="date"
                  value={draft.fin}
                  onChange={e => setField("fin", e.target.value)}
                  style={{
                    fontFamily: T.mono, fontSize: T.sz.sm,
                    padding: `${S[2]}px ${S[3]}px`,
                    border: `1px solid ${C.line}`, borderRadius: R.md,
                    background: C.white, color: C.ink, outline: "none",
                  }}
                />
              </label>
            </div>

            {/* Smart Investment Card */}
            <SmartInvestmentCard draft={draft} />
          </div>
        )}

        {/* ── Step 7: Revisar ────────────────────────────────────────────── */}
        {step === 7 && (() => {
          const days       = computeDurationDays(draft.inicio, draft.fin);
          const assetLabel = draft.assets[0]?.shopifyName ?? draft.assets[0]?.label ?? "";
          const audSummary = [draft.pais, draft.ciudad].filter(Boolean).join(", ") || "General";
          const destinoLabel = draft.destino
            ? DESTINO_OPTIONS.find(d => d.key === draft.destino)?.label ?? draft.destino
            : needsUrl ? (draft.urlDestino || "—") : "—";
          const hasContent = !!draft.textoPrincipal || !!draft.cta;

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2] }}>
                <ChecklistCard icon="📡" label="Plataforma"       value={platformSummary}                                ok={!!platformSummary} />
                <ChecklistCard icon="🎯" label="Objetivo"         value={draft.objetivo ? AD_OBJECTIVE_LABEL[draft.objetivo] : ""} ok={!!draft.objetivo} />
                <ChecklistCard icon="🖼" label="Recurso creativo" value={assetLabel}                                     ok={draft.assets.length > 0} />
                <ChecklistCard icon="✍" label="Contenido"        value={draft.textoPrincipal.slice(0, 50) || ""}         ok={hasContent} />
                <ChecklistCard icon="👥" label="Audiencia"        value={audSummary}                                      ok={!!draft.pais} />
                <ChecklistCard icon="💰" label="Presupuesto"      value={budgetSummary}                                   ok={!!draft.monto} />
                <ChecklistCard icon="🔗" label="Destino"          value={destinoLabel}                                    ok={!!(draft.destino || draft.urlDestino)} />
                <ChecklistCard icon="📋" label="Estado"           value={`Borrador · ${days ? `${days} días` : "Sin fechas"}`} ok={!!draft.inicio} />
              </div>

              {/* ── Validación y aprobación previa ────────────────────────── */}
              <ValidationSection
                validating={validating}
                result={validationResult}
                error={validationError}
                approvalState={approvalState}
                approvalError={approvalError}
                isApprovalInvalidated={isApprovalInvalidated}
                executionState={executionState}
                executionResult={executionResult}
                syncState={syncState}
                syncResult={syncResult}
                onValidate={handleValidate}
                onApprove={handleApprove}
                onExecute={handleExecute}
                onSync={handleSync}
              />

              {/* Final actions */}
              <div style={{ display: "flex", gap: S[3], flexWrap: "wrap" }}>
                <button
                  onClick={() => handleFinal("anuncios:save_draft")}
                  disabled={executing !== null}
                  className="ag-action-secondary"
                >
                  {executing === "anuncios:save_draft" ? "Guardando..." : "Guardar borrador"}
                </button>
              </div>
            </div>
          );
        })()}

        {/* ── Step navigation ─────────────────────────────────────────────── */}
        {step < 7 && (
          <div style={{ display: "flex", gap: S[3], marginTop: S[5], alignItems: "center" }}>
            {step > 1 && (
              <button onClick={goPrev} className="ag-action-ghost">
                ← Atrás
              </button>
            )}
            <button
              onClick={goNext}
              disabled={!canAdvance()}
              className="ag-action-primary"
              style={{ opacity: canAdvance() ? 1 : 0.4 }}
            >
              {step === 6 ? "Revisar →" : "Continuar →"}
            </button>
          </div>
        )}
      </AgModulePrimaryPanel>

      {/* ── Connectivity diagnostic (non-blocking) ───────────────────────── */}
      {connectivity && connectivity.health !== "all_connected" && (
        <AgModuleSecondaryPanel label="Conexión de plataformas">
          <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
            {connectivity.platforms.map(p => {
              const isOk      = p.status === "connected";
              const isNoCreds = p.status === "not_configured";
              const color     = isOk ? C.green : isNoCreds ? C.inkFaint : C.amber;
              const bg        = isOk ? "#f0fdf4" : isNoCreds ? C.surface : "#fffbeb";
              const icon      = isOk ? "✓" : isNoCreds ? "—" : "⚠";
              const label     = p.platform === "meta" ? "Meta (Facebook + Instagram)"
                              : p.platform === "tiktok" ? "TikTok Ads"
                              : p.platform === "google" ? "Google Ads"
                              : p.platform;
              return (
                <div key={p.platform} style={{
                  display: "flex", alignItems: "flex-start", gap: S[3],
                  padding: `${S[2]}px ${S[3]}px`,
                  background: bg, border: `1px solid ${C.line}`,
                  borderRadius: R.md,
                }}>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color, minWidth: 14 }}>{icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: S[2], flexWrap: "wrap" }}>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.medium, color: C.ink }}>
                        {label}
                      </span>
                      {p.credentialSource && (
                        <span style={{
                          fontFamily: T.mono, fontSize: "10px",
                          padding: "1px 6px", borderRadius: R.pill,
                          background: p.credentialSource === "VAULT"            ? "#eff6ff"
                                    : p.credentialSource === "ENV_DEV_FALLBACK" ? "#fffbeb"
                                    : C.surface,
                          color:      p.credentialSource === "VAULT"            ? C.blueDark
                                    : p.credentialSource === "ENV_DEV_FALLBACK" ? C.amber
                                    : C.inkFaint,
                          border: `1px solid ${C.line}`,
                        }}>
                          {p.credentialSource === "VAULT"            ? "Vault"
                         : p.credentialSource === "ENV_DEV_FALLBACK" ? "Env dev"
                         : "No configurado"}
                        </span>
                      )}
                    </div>
                    {(p.errors.length > 0 || p.warnings.length > 0) && (
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: 2 }}>
                        {(p.errors[0] ?? p.warnings[0])}
                      </div>
                    )}
                    {isNoCreds && (
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: 2 }}>
                        Credenciales no configuradas — aprovisiona en el Vault.
                      </div>
                    )}
                  </div>
                  {p.accounts.length > 0 && (
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, whiteSpace: "nowrap" }}>
                      {p.accounts.length} cuenta{p.accounts.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </AgModuleSecondaryPanel>
      )}

      {/* ── Secondary: Estado de anuncios ────────────────────────────────── */}
      {ads.length > 0 && (
        <AgModuleSecondaryPanel label="Estado de anuncios">
          <div style={{ display: "flex", gap: S[3], flexWrap: "wrap" }}>
            {(["activo", "programado", "borrador", "revision", "finalizado"] as const).map(status => {
              const count = ads.filter(a => a.estado === status).length;
              return (
                <div key={status} style={{
                  padding: `${S[2]}px ${S[3]}px`,
                  border: `1px solid ${C.line}`, borderRadius: R.md,
                  background: C.white, minWidth: 100,
                }}>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xl, fontWeight: T.wt.bold, color: C.ink }}>{count}</div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>{AD_STATUS_LABEL[status]}</div>
                </div>
              );
            })}
          </div>
        </AgModuleSecondaryPanel>
      )}

      {/* ── Secondary: Lista de anuncios ─────────────────────────────────── */}
      {ads.length > 0 && (
        <AgModuleSecondaryPanel label="Anuncios">
          <div className="ag-op-table">
            <div className="ag-op-row" style={{ fontWeight: T.wt.bold, opacity: 0.6 }}>
              <span>Nombre</span><span>Plataforma</span><span>Objetivo</span>
              <span>Presupuesto</span><span>Estado</span><span>Inicio</span>
              <span>Fin</span><span>Actualización</span>
            </div>
            {ads.map(ad => (
              <div key={ad.id} className="ag-op-row" onClick={() => setDrawerAd(ad)} style={{ cursor: "pointer" }}>
                <span style={{ fontWeight: T.wt.medium }}>{ad.nombre}</span>
                <span>{ad.plataformas.map(p => AD_PLATFORM_LABEL[p]).join(", ")}</span>
                <span>{AD_OBJECTIVE_LABEL[ad.objetivo]}</span>
                <span>{ad.presupuesto}</span>
                <span><span className={`ag-op-status ag-op-status--${ad.estado}`}>{AD_STATUS_LABEL[ad.estado]}</span></span>
                <span>{ad.inicio ?? "—"}</span>
                <span>{ad.fin ?? "—"}</span>
                <span>{ad.updatedAt}</span>
              </div>
            ))}
          </div>
        </AgModuleSecondaryPanel>
      )}

      {ads.length === 0 && (
        <div style={{ padding: `${S[3]}px ${S[4]}px`, fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint }}>
          Sin anuncios todavía — crea tu primer anuncio con el asistente de arriba.
        </div>
      )}

      {/* ── Platform accounts configuration ──────────────────────────────── */}
      <AdsAccountsPanel
        orgSlug={orgSlug}
        accountsConfig={state.accountsConfig}
      />

      {/* ── Drawer: Ad detail ────────────────────────────────────────────── */}
      <OperationalSideDrawer
        open={drawerAd !== null}
        onClose={() => setDrawerAd(null)}
        title={drawerAd?.nombre ?? "Anuncio"}
        severity="info"
        statusLabel={drawerAd ? AD_STATUS_LABEL[drawerAd.estado] : ""}
      >
        {drawerAd && <AdDrawerContent ad={drawerAd} executing={executing} onAction={handleAction} />}
      </OperationalSideDrawer>
    </div>
  );
}

// ── Ad Drawer Content ─────────────────────────────────────────────────────────

function AdDrawerContent({
  ad, executing, onAction,
}: {
  ad:        AdEntity;
  executing: string | null;
  onAction:  (intent: string) => void;
}) {
  return (
    <>
      <AgDrawerSection title="Resumen">
        <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid }}>
            <strong style={{ color: C.ink }}>Estado:</strong> {AD_STATUS_LABEL[ad.estado]}
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid }}>
            <strong style={{ color: C.ink }}>Presupuesto:</strong> {ad.presupuesto}
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid }}>
            <strong style={{ color: C.ink }}>Actualización:</strong> {ad.updatedAt}
          </div>
        </div>
      </AgDrawerSection>

      <AgDrawerSection title="Plataforma y objetivo">
        <div style={{ display: "flex", flexDirection: "column", gap: S[1] }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink }}>
            {ad.plataformas.map(p => AD_PLATFORM_LABEL[p]).join(" · ")}
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid }}>
            {AD_OBJECTIVE_LABEL[ad.objetivo]}
          </div>
        </div>
      </AgDrawerSection>

      <AgDrawerSection title="Recurso creativo">
        <div style={{
          padding: `${S[2]}px ${S[3]}px`, background: C.surface,
          borderRadius: R.sm, fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid,
        }}>
          Sin recurso registrado — configurar en el asistente.
        </div>
      </AgDrawerSection>

      <AgDrawerSection title="Audiencia">
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid }}>
          Audiencia no configurada.
        </div>
      </AgDrawerSection>

      <AgDrawerSection title="Presupuesto y duración">
        <div style={{ display: "flex", flexDirection: "column", gap: S[1] }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink }}>{ad.presupuesto}</div>
          {(ad.inicio || ad.fin) && (
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
              {ad.inicio ?? "—"} → {ad.fin ?? "—"}
            </div>
          )}
        </div>
      </AgDrawerSection>

      <AgDrawerSection title="Análisis de Copilot">
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid }}>
          Copilot analizará el rendimiento cuando el anuncio esté activo.
        </div>
      </AgDrawerSection>

      <AgDrawerSection title="Acciones sugeridas">
        <AgDrawerAction label="Cambiar presupuesto"         intent="anuncios:change_budget"      executing={executing} onExecute={onAction} />
        <AgDrawerAction label="Cambiar audiencia"           intent="anuncios:change_audience"    executing={executing} onExecute={onAction} />
        <AgDrawerAction label="Cambiar recurso creativo"    intent="anuncios:change_asset"       executing={executing} onExecute={onAction} />
        <AgDrawerAction label="Duplicar anuncio"            intent="anuncios:duplicate"          executing={executing} onExecute={onAction} />
        <AgDrawerAction label="Pausar anuncio"              intent="anuncios:pause"              executing={executing} onExecute={onAction} />
        <AgDrawerAction label="Enviar a revisión"           intent="anuncios:send_review"        executing={executing} onExecute={onAction} />
        <AgDrawerAction label="Generar contenido con Copilot" intent="anuncios:generate_content" executing={executing} onExecute={onAction} />
        <AgDrawerAction label="Revisar conexiones"          intent="anuncios:review_connections" executing={executing} onExecute={onAction} />
      </AgDrawerSection>
    </>
  );
}
