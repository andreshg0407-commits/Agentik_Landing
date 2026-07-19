"use client";

/**
 * components/marketing-studio/campaigns/campaign-dashboard.tsx
 *
 * MARKETING-CAMPAIGNS-UX-02 — Experiencia V1 de producción centrada en crear campañas.
 *
 * Cambios respecto a REFOCUS-01:
 *   - Headline siempre "Nueva campaña" — sub describe el paso actual
 *   - Vista previa de recurso seleccionado (AssetPreviewCard)
 *   - Channel tiles con identidad visual de marca
 *   - Paso 3 expandido: copy + hashtags + CTA + botón único "Generar con Copilot"
 *   - Paso 4: Publicar ahora / Programar / Guardar para más tarde
 *   - Paso 5: SummaryCards visuales (no filas de texto)
 *   - Estado vacío de campañas: mensaje compacto sin placeholders pesados
 *   - Calendario condicional: solo renderiza grid cuando hay eventos
 *   - Modelo interno de assets como array (multi-asset ready)
 *
 * Todas las acciones → pipeline de Copilot. Sin ejecución directa desde UI.
 */

import { useState, Fragment }         from "react";
import { C, T, S, R }                 from "@/lib/ui/tokens";
import {
  AgModulePrimaryPanel,
  AgModuleSecondaryPanel,
  AgDrawerSection,
  AgDrawerAction,
}                                     from "@/components/agentik/operational-ux-kit";
import { OperationalSideDrawer }      from "@/components/workspace/operational-side-drawer";
import type { DrawerSeverity }        from "@/components/workspace/operational-side-drawer";
import type {
  CampaignRuntimeState,
  CampaignEntity,
  CampaignStatus,
  CampaignRecommendation,
}                                     from "@/lib/marketing-studio/campaigns/campaign-types";
import {
  CAMPAIGN_STATUS_LABEL,
  CAMPAIGN_TYPE_LABEL,
}                                     from "@/lib/marketing-studio/campaigns/campaign-types";

// ── Wizard types ───────────────────────────────────────────────────────────────

type WizardStep   = 1 | 2 | 3 | 4 | 5;
type AssetSource  = "biblioteca" | "foto_estudio" | "upload_image" | "upload_video" | "product";
type ChannelKey   = "instagram" | "facebook" | "tiktok" | "youtube";
type ScheduleMode = "now" | "scheduled" | "later";

/**
 * Un activo seleccionado por el usuario para la campaña.
 * Usa array aunque hoy solo se agregue uno — arquitectura multi-asset ready.
 */
interface DraftAsset {
  /** Identificador temporal para la sesión */
  id:     string;
  source: AssetSource;
  label:  string;
}

interface WizardDraft {
  /** Multi-asset ready. Hoy se selecciona uno; la arquitectura soporta más. */
  assets:      DraftAsset[];
  channels:    ChannelKey[];
  copy:        string;
  hashtags:    string;
  cta:         string;
  schedule:    ScheduleMode | null;
  scheduledAt: string;
}

const INITIAL_DRAFT: WizardDraft = {
  assets: [], channels: [], copy: "", hashtags: "", cta: "", schedule: null, scheduledAt: "",
};

// ── Wizard constants ───────────────────────────────────────────────────────────

const STEP_LABELS = ["Recurso", "Canales", "Contenido", "Programación", "Confirmar"];

/** Subtítulo dinámico del panel principal — uno por paso */
const STEP_DESCRIPTIONS = [
  "Selecciona el recurso inicial",
  "Selecciona los canales",
  "Prepara el contenido",
  "Programa la publicación",
  "Revisa y confirma",
];

const ASSET_OPTIONS: { key: AssetSource; label: string; sub: string; icon: string }[] = [
  { key: "biblioteca",   label: "Desde Biblioteca",      sub: "Reutiliza recursos existentes",  icon: "◫" },
  { key: "foto_estudio", label: "Crear en Foto Estudio", sub: "Genera nuevas piezas con IA",    icon: "✨" },
  { key: "upload_image", label: "Subir imagen",          sub: "JPG, PNG, WEBP",                 icon: "▣" },
  { key: "upload_video", label: "Subir video",           sub: "MP4, MOV",                       icon: "▶" },
  { key: "product",      label: "Recurso de producto",   sub: "Recurso vinculado a Shopify",    icon: "◈" },
];

/** Identidad visual de cada canal — brand colors para look profesional */
const CHANNEL_OPTIONS: {
  key:        ChannelKey;
  label:      string;
  badge:      string;
  brandColor: string;
  brandBg:    string;
}[] = [
  { key: "instagram", label: "Instagram", badge: "IG", brandColor: "#C13584", brandBg: "#fdf0f5" },
  { key: "facebook",  label: "Facebook",  badge: "f",  brandColor: "#1877F2", brandBg: "#eff6ff" },
  { key: "tiktok",    label: "TikTok",    badge: "TT", brandColor: "#161823", brandBg: "#f5f5f5" },
  { key: "youtube",   label: "YouTube",   badge: "▶",  brandColor: "#FF0000", brandBg: "#fff5f5" },
];

const SCHEDULE_OPTIONS: { key: ScheduleMode; label: string; sub: string }[] = [
  { key: "now",       label: "Publicar ahora",         sub: "Se enviará a revisión y publicará cuando sea aprobada"  },
  { key: "scheduled", label: "Programar fecha y hora", sub: "Elige la fecha y hora exacta de publicación"            },
  { key: "later",     label: "Guardar para más tarde", sub: "Sin fecha por ahora — puedes programarla después"        },
];

// ── Drawer type ────────────────────────────────────────────────────────────────

type DrawerState = { campaign: CampaignEntity } | null;

interface Props {
  state:   CampaignRuntimeState;
  orgSlug: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function statusVariant(status: CampaignStatus): string {
  switch (status) {
    case "active":    return "ok";
    case "scheduled": return "watch";
    case "completed": return "ok";
    case "failed":    return "critical";
    case "paused":    return "warning";
    default:          return "default";
  }
}

function readyColor(score: number): string {
  return score >= 70 ? C.green : score >= 40 ? C.amber : C.red;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CO", { month: "short", day: "numeric" });
}

function fmtAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return "hoy";
  if (days === 1) return "ayer";
  return `hace ${days}d`;
}

function nextScheduledAt(campaign: CampaignEntity): string {
  const future = campaign.contentSlots
    .map(s => s.scheduledAt)
    .filter((d): d is string => d !== null && new Date(d).getTime() > Date.now())
    .sort();
  return fmtDate(future[0] ?? null);
}

function assetSourceLabel(source: AssetSource): string {
  switch (source) {
    case "biblioteca":   return "Desde Biblioteca";
    case "foto_estudio": return "Generado en Foto Estudio";
    case "upload_image": return "Imagen subida";
    case "upload_video": return "Video subido";
    case "product":      return "Recurso de producto Shopify";
  }
}

function buildWeekDays() {
  const days: { iso: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    days.push({
      iso:   d.toISOString().slice(0, 10),
      label: d.toLocaleDateString("es-CO", { weekday: "short", day: "numeric" }),
    });
  }
  return days;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusRow({ label, count, variant }: { label: string; count: number; variant: "ok" | "warning" | "neutral" }) {
  const color = variant === "ok" ? C.green : variant === "warning" ? C.amber : C.inkFaint;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: `${S[2]}px 0`, borderBottom: `1px solid ${C.lineSubtle}` }}>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>{label}</span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color }}>{count}</span>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: `${S[1]}px 0` }}>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>{label}</span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600, color: C.ink }}>{value}</span>
    </div>
  );
}

/** Tarjeta de vista previa del recurso seleccionado */
function AssetPreviewCard({ assets }: { assets: DraftAsset[] }) {
  if (assets.length === 0) {
    return (
      <div style={{
        border: `1px dashed ${C.line}`, borderRadius: R.xl,
        padding: `${S[3]}px`, display: "flex", alignItems: "center", gap: S[3],
        background: C.surfaceAlt, marginTop: S[3],
      }}>
        <div style={{ width: 44, height: 44, background: C.lineSubtle, borderRadius: R.lg, flexShrink: 0 }} />
        <div style={{ display: "flex", flexDirection: "column" as const, gap: S[1] }}>
          <div style={{ width: 100, height: 10, background: C.lineSubtle, borderRadius: R.sm }} />
          <div style={{ width: 70, height: 8, background: C.lineSubtle, borderRadius: R.sm }} />
        </div>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginLeft: "auto" }}>
          Sin recurso seleccionado
        </span>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2], marginTop: S[3] }}>
      {assets.map(asset => (
        <div key={asset.id} style={{
          border: `1.5px solid ${C.blueBorder}`, borderRadius: R.xl,
          padding: `${S[3]}px`, display: "flex", alignItems: "center", gap: S[3],
          background: C.blueLight,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: R.lg, flexShrink: 0,
            background: C.blueDark,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontSize: 18, color: C.white }}>
              {ASSET_OPTIONS.find(a => a.key === asset.source)?.icon ?? "◫"}
            </span>
          </div>
          <div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.blueDark }}>
              {asset.label}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: 2 }}>
              {assetSourceLabel(asset.source)}
            </div>
          </div>
          <span style={{ marginLeft: "auto", fontFamily: T.mono, fontSize: 10, fontWeight: 700, color: C.green }}>
            ✓ Seleccionado
          </span>
        </div>
      ))}
    </div>
  );
}

/** Tarjeta de resumen para el paso 5 */
function SummaryCard({
  icon, label, value, status,
}: {
  icon:   string;
  label:  string;
  value:  string;
  status: "ok" | "partial" | "neutral" | "missing";
}) {
  const dotColor =
    status === "ok"      ? C.green   :
    status === "partial" ? C.amber   :
    status === "missing" ? C.red     : C.inkFaint;
  return (
    <div style={{
      border: `1px solid ${C.line}`, borderRadius: R.xl,
      padding: `${S[3]}px`, background: C.white,
      display: "flex", flexDirection: "column" as const, gap: S[1],
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
      </div>
      <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.07em" }}>
        {label}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600, color: C.ink, lineHeight: 1.4 }}>
        {value}
      </div>
    </div>
  );
}

// ── Campaign drawer ────────────────────────────────────────────────────────────

function CampaignDrawerContent({
  campaign,
  lucaRecos,
  milaRecos,
  executing,
  onExecute,
}: {
  campaign:  CampaignEntity;
  lucaRecos: CampaignRecommendation[];
  milaRecos: CampaignRecommendation[];
  executing: string | null;
  onExecute: (intent: string) => void;
}) {
  const camRecos     = [
    ...lucaRecos.filter(r => r.campaignId === campaign.id),
    ...milaRecos.filter(r => r.campaignId === campaign.id),
  ];
  const readySlots   = campaign.contentSlots.filter(s => s.isReady);
  const pendingSlots = campaign.contentSlots.filter(s => !s.isReady);
  const scheduled    = campaign.contentSlots.filter(s => s.scheduledAt !== null);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>

      {/* §1 Resumen */}
      <AgDrawerSection title="Resumen">
        <KV label="Tipo"   value={CAMPAIGN_TYPE_LABEL[campaign.type]} />
        <KV label="Estado" value={CAMPAIGN_STATUS_LABEL[campaign.status]} />
        <KV label="Inicio" value={fmtDate(campaign.startDate)} />
        <KV label="Fin"    value={fmtDate(campaign.endDate)} />
        <div style={{ marginTop: S[3] }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: S[1] }}>
            <span style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint }}>Preparación</span>
            <span style={{ fontFamily: T.mono, fontSize: 10, fontWeight: 700, color: readyColor(campaign.readinessScore) }}>
              {campaign.readinessScore}%
            </span>
          </div>
          <div style={{ height: 4, background: C.lineSubtle, borderRadius: 2, overflow: "hidden" }}>
            <div style={{ width: `${campaign.readinessScore}%`, height: "100%", background: readyColor(campaign.readinessScore), borderRadius: 2 }} />
          </div>
        </div>
      </AgDrawerSection>

      {/* §2 Recursos utilizados */}
      <AgDrawerSection title="Recursos utilizados">
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, marginBottom: S[2] }}>
          {readySlots.length} de {campaign.contentSlots.length} recursos listos
        </div>
        {campaign.contentSlots.length === 0 ? (
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
            Sin recursos. Usa "Agregar desde Biblioteca" o "Crear en Foto Estudio".
          </span>
        ) : pendingSlots.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: S[1] }}>
            {pendingSlots.slice(0, 5).map((slot, i) => (
              <div key={`p-${slot.id}-${i}`} style={{
                padding: `${S[1]}px ${S[2]}px`,
                background: "#fffbeb", borderRadius: R.sm, borderLeft: `2px solid ${C.amber}`,
                fontFamily: T.mono, fontSize: T.sz.xs, color: C.amberDark,
              }}>
                Pendiente — {slot.channel} · {slot.contentType}
              </div>
            ))}
            {pendingSlots.length > 5 && (
              <span style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint }}>+{pendingSlots.length - 5} más</span>
            )}
          </div>
        ) : (
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.green }}>Todos los recursos están listos.</span>
        )}
      </AgDrawerSection>

      {/* §3 Canales seleccionados */}
      <AgDrawerSection title="Canales seleccionados">
        {campaign.channels.length === 0 ? (
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>Sin canales configurados.</span>
        ) : (
          <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" as const }}>
            {campaign.channels.map(ch => {
              const meta = CHANNEL_OPTIONS.find(o => o.key === ch);
              return (
                <span key={ch} style={{
                  fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700,
                  color: meta?.brandColor ?? C.blueDark,
                  background: meta?.brandBg ?? C.blueLight,
                  border: `1px solid ${meta?.brandColor ?? C.blueDark}30`,
                  borderRadius: R.lg, padding: `${S[1]}px ${S[3]}px`,
                }}>
                  {meta?.label ?? ch}
                </span>
              );
            })}
          </div>
        )}
      </AgDrawerSection>

      {/* §4 Calendario */}
      <AgDrawerSection title="Calendario">
        {scheduled.length === 0 ? (
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
            Sin publicaciones programadas. Usa "Programar nuevamente" para asignar fechas.
          </span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: S[1] }}>
            {scheduled.slice(0, 6).map((slot, i) => (
              <div key={`s-${slot.id}-${i}`} style={{ display: "flex", gap: S[3], alignItems: "center", padding: `${S[1]}px 0`, borderBottom: `1px solid ${C.lineSubtle}` }}>
                <span style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint, minWidth: 52 }}>{fmtDate(slot.scheduledAt)}</span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, flex: 1 }}>{slot.channel} · {slot.contentType}</span>
                <span style={{ fontFamily: T.mono, fontSize: 10, color: slot.isReady ? C.green : C.amber }}>
                  {slot.isReady ? "Lista" : "Pendiente"}
                </span>
              </div>
            ))}
            {scheduled.length > 6 && (
              <span style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint }}>+{scheduled.length - 6} más</span>
            )}
          </div>
        )}
      </AgDrawerSection>

      {/* §5 Análisis de Copilot */}
      <AgDrawerSection title="Análisis de Copilot">
        {camRecos.length === 0 ? (
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
            Copilot analizará este contenido cuando haya actividad suficiente. Las señales aparecerán aquí.
          </span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
            {camRecos.map(r => (
              <div key={r.key} style={{ padding: `${S[2]}px`, background: C.surfaceAlt, borderRadius: R.lg }}>
                <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[1] }}>
                  <span style={{
                    fontFamily: T.mono, fontSize: 10, fontWeight: 700,
                    color: r.agentLabel === "Luca" ? C.blueDark : "#7c2d92",
                    background: r.agentLabel === "Luca" ? C.blueLight : "#faf5ff",
                    padding: "1px 5px", borderRadius: R.sm,
                  }}>
                    {r.agentLabel}
                  </span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600, color: C.ink }}>{r.label}</span>
                </div>
                <span style={{ fontFamily: T.mono, fontSize: 10, color: C.inkLight }}>→ {r.recommendedAction}</span>
              </div>
            ))}
          </div>
        )}
      </AgDrawerSection>

      {/* §6 Acciones sugeridas */}
      <AgDrawerSection title="Acciones sugeridas">
        <AgDrawerAction label="Cambiar recurso"               intent="campaigns.change_resource"          executing={executing} onExecute={onExecute} />
        <AgDrawerAction label="Abrir Biblioteca"              intent="campaigns.open_biblioteca"          executing={executing} onExecute={onExecute} />
        <AgDrawerAction label="Crear recurso en Foto Estudio" intent="campaigns.create_resource_foto_estudio" executing={executing} onExecute={onExecute} />
        <AgDrawerAction label="Regenerar copy"                intent="campaigns.regenerate_copy"          executing={executing} onExecute={onExecute} />
        <AgDrawerAction label="Regenerar hashtags"            intent="campaigns.regenerate_hashtags"      executing={executing} onExecute={onExecute} />
        <AgDrawerAction label="Cambiar canales"               intent="campaigns.change_channels"          executing={executing} onExecute={onExecute} />
        <AgDrawerAction label="Programar nuevamente"          intent="campaigns.reschedule"               executing={executing} onExecute={onExecute} />
        <AgDrawerAction label="Duplicar contenido"             intent="campaigns.duplicate"                executing={executing} onExecute={onExecute} />
        <AgDrawerAction label="Guardar borrador"              intent="campaigns.save_draft"               executing={executing} onExecute={onExecute} />
        <AgDrawerAction label="Publicar"                      intent="campaigns.publish"                  executing={executing} onExecute={onExecute} />
      </AgDrawerSection>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────

export function CampaignDashboard({ state, orgSlug: _orgSlug }: Props) {
  // ── Wizard ────────────────────────────────────────────────────────────────────
  const [wizardStep,  setWizardStep]  = useState<WizardStep>(1);
  const [draft,       setDraft]       = useState<WizardDraft>(INITIAL_DRAFT);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // ── Drawer / actions ──────────────────────────────────────────────────────────
  const [drawer,    setDrawer]    = useState<DrawerState>(null);
  const [executing, setExecuting] = useState<string | null>(null);

  const { campaigns, calendarEvents, lucaRecos, milaRecos } = state;

  // ── Status counts ─────────────────────────────────────────────────────────────
  const counts = {
    activas:     campaigns.filter(c => c.status === "active").length,
    programadas: campaigns.filter(c => c.status === "scheduled").length,
    borradores:  campaigns.filter(c => c.status === "draft" || c.status === "planning").length,
    revision:    campaigns.filter(c => c.readinessLevel === "blocked" || c.readinessLevel === "partial").length,
    finalizadas: campaigns.filter(c => c.status === "completed").length,
  };

  // ── Action handler → Copilot pipeline ────────────────────────────────────────
  function handleAction(intent: string) {
    setExecuting(intent);
    setTimeout(() => setExecuting(null), 800);
  }

  function handleFinal(intent: string) {
    handleAction(intent);
    setIsSubmitted(true);
    setTimeout(() => { setIsSubmitted(false); setWizardStep(1); setDraft(INITIAL_DRAFT); }, 2500);
  }

  // ── Step validation ───────────────────────────────────────────────────────────
  function canAdvance(): boolean {
    switch (wizardStep) {
      case 1: return draft.assets.length > 0;
      case 2: return draft.channels.length > 0;
      case 3: return true;
      case 4: return draft.schedule !== null;
      case 5: return false;
    }
  }

  // ── Drawer metadata ───────────────────────────────────────────────────────────
  const dc = drawer?.campaign ?? null;
  const drawerSeverity: DrawerSeverity =
    dc?.status === "failed" ? "critical" : dc?.readinessLevel === "blocked" ? "warning" : "info";
  const drawerStatusLabel = dc ? CAMPAIGN_STATUS_LABEL[dc.status] : undefined;

  // ── Calendar ──────────────────────────────────────────────────────────────────
  const weekDays       = buildWeekDays();
  const hasCalEvents   = calendarEvents.length > 0;

  // ── Rendered step label helpers ───────────────────────────────────────────────
  const firstAsset   = draft.assets[0];
  const channelNames = draft.channels
    .map(k => CHANNEL_OPTIONS.find(o => o.key === k)?.label ?? k)
    .join(", ");
  const scheduleLabel = SCHEDULE_OPTIONS.find(s => s.key === draft.schedule)?.label ?? "—";

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: S[5],
      padding: `${S[4]}px ${S[6]}px ${S[8]}px`,
      maxWidth: 1100,
    }}>

      {/* ══ BLOQUE 1 — NUEVA CAMPAÑA (PROTAGONISTA) ══════════════════════════════ */}
      <AgModulePrimaryPanel
        moduleLabel="Nuevo contenido"
        headline="Nuevo contenido"
        headlineSub={STEP_DESCRIPTIONS[wizardStep - 1]}
      >
        {/* ── Indicador de pasos ──────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[5], flexWrap: "wrap" as const }}>
          {STEP_LABELS.map((label, i) => {
            const n        = (i + 1) as WizardStep;
            const isActive = n === wizardStep;
            const isDone   = n < wizardStep;
            return (
              <Fragment key={i}>
                <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%",
                    background: isDone ? C.green : isActive ? C.blueDark : C.surfaceAlt,
                    border: `1.5px solid ${isDone ? C.green : isActive ? C.blueDark : C.line}`,
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    {isDone
                      ? <span style={{ color: C.white, fontSize: 9, fontWeight: 700 }}>✓</span>
                      : <span style={{ fontFamily: T.mono, fontSize: 9, color: isActive ? C.white : C.inkFaint, fontWeight: 700 }}>{n}</span>
                    }
                  </div>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: isActive ? C.ink : isDone ? C.green : C.inkFaint, fontWeight: isActive ? 600 : 400 }}>
                    {label}
                  </span>
                </div>
                {i < STEP_LABELS.length - 1 && (
                  <div style={{ flex: 1, height: 1.5, background: isDone ? C.green : C.lineSubtle, minWidth: S[3] }} />
                )}
              </Fragment>
            );
          })}
        </div>

        {/* ── Contenido del paso ──────────────────────────────────────────────── */}
        <div style={{ minHeight: 168, marginBottom: S[5] }}>

          {/* PASO 1 — Elegir recurso */}
          {wizardStep === 1 && (
            <div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: C.ink, marginBottom: S[3] }}>
                ¿Desde dónde proviene el recurso para este contenido?
              </div>
              <div style={{ display: "flex", gap: S[3], flexWrap: "wrap" as const }}>
                {ASSET_OPTIONS.map(opt => {
                  const sel = draft.assets.some(a => a.source === opt.key);
                  return (
                    <button key={opt.key}
                      onClick={() => setDraft(d => ({
                        ...d,
                        assets: [{ id: `draft-${Date.now()}`, source: opt.key, label: opt.label }],
                      }))}
                      style={{
                        flex: "1 1 120px",
                        border: `1.5px solid ${sel ? C.blueDark : C.line}`,
                        borderRadius: R.xl, padding: `${S[3]}px`,
                        background: sel ? C.blueLight : C.white,
                        cursor: "pointer", textAlign: "left" as const,
                        display: "flex", flexDirection: "column" as const, gap: S[1],
                      }}
                    >
                      <span style={{ fontSize: 18 }}>{opt.icon}</span>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: sel ? C.blueDark : C.ink }}>{opt.label}</span>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>{opt.sub}</span>
                    </button>
                  );
                })}
              </div>
              <AssetPreviewCard assets={draft.assets} />
            </div>
          )}

          {/* PASO 2 — Elegir canales */}
          {wizardStep === 2 && (
            <div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: C.ink, marginBottom: S[1] }}>
                ¿En qué redes sociales vas a publicar?
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginBottom: S[3] }}>
                Selecciona uno o varios canales. La arquitectura soporta nuevas redes.
              </div>
              <div style={{ display: "flex", gap: S[3], flexWrap: "wrap" as const }}>
                {CHANNEL_OPTIONS.map(ch => {
                  const sel = draft.channels.includes(ch.key);
                  return (
                    <button key={ch.key}
                      onClick={() => setDraft(d => ({
                        ...d,
                        channels: sel ? d.channels.filter(c => c !== ch.key) : [...d.channels, ch.key],
                      }))}
                      style={{
                        flex: "1 1 100px", position: "relative" as const,
                        border: `2px solid ${sel ? C.blueDark : C.line}`,
                        borderRadius: R.xl, padding: `${S[4]}px ${S[3]}px`,
                        background: sel ? C.blueLight : C.white,
                        cursor: "pointer", textAlign: "center" as const,
                        display: "flex", flexDirection: "column" as const, alignItems: "center", gap: S[2],
                      }}
                    >
                      {/* Platform badge */}
                      <div style={{
                        width: 44, height: 44, borderRadius: R.xl, flexShrink: 0,
                        background: sel ? C.blueDark : ch.brandBg,
                        border: `1px solid ${sel ? C.blueDark : ch.brandColor}30`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <span style={{
                          fontFamily:    T.mono,
                          fontSize:      ch.badge.length > 1 ? 13 : 20,
                          fontWeight:    900,
                          color:         sel ? C.white : ch.brandColor,
                          letterSpacing: ch.badge.length > 1 ? "-0.04em" : "0",
                        }}>
                          {ch.badge}
                        </span>
                      </div>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: sel ? C.blueDark : C.ink }}>
                        {ch.label}
                      </span>
                      {/* Check indicator */}
                      <div style={{
                        position: "absolute" as const, top: S[2], right: S[2],
                        width: 18, height: 18, borderRadius: "50%",
                        background: sel ? C.green : "transparent",
                        border: sel ? "none" : `1.5px solid ${C.lineSubtle}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {sel && <span style={{ color: C.white, fontSize: 9, fontWeight: 700 }}>✓</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* PASO 3 — Preparar contenido */}
          {wizardStep === 3 && (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: S[4] }}>
              <div>
                <label style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, display: "block", marginBottom: S[1] }}>
                  Texto de la publicación
                </label>
                <textarea
                  value={draft.copy}
                  onChange={e => setDraft(d => ({ ...d, copy: e.target.value }))}
                  placeholder="Escribe el contenido de tu publicación..."
                  rows={3}
                  style={{
                    width: "100%", boxSizing: "border-box" as const,
                    fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink,
                    border: `1px solid ${C.line}`, borderRadius: R.lg,
                    padding: `${S[3]}px`, resize: "vertical" as const,
                    background: C.white, outline: "none", lineHeight: 1.6,
                  }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
                <div>
                  <label style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, display: "block", marginBottom: S[1] }}>
                    Hashtags
                  </label>
                  <input
                    type="text"
                    value={draft.hashtags}
                    onChange={e => setDraft(d => ({ ...d, hashtags: e.target.value }))}
                    placeholder="#contenido #producto #marca"
                    style={{
                      width: "100%", boxSizing: "border-box" as const,
                      fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink,
                      border: `1px solid ${C.line}`, borderRadius: R.lg,
                      padding: `${S[2]}px ${S[3]}px`,
                      background: C.white, outline: "none",
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, display: "block", marginBottom: S[1] }}>
                    Llamada a la acción (CTA)
                  </label>
                  <input
                    type="text"
                    value={draft.cta}
                    onChange={e => setDraft(d => ({ ...d, cta: e.target.value }))}
                    placeholder="Ver más · Comprar ahora · Reservar"
                    style={{
                      width: "100%", boxSizing: "border-box" as const,
                      fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink,
                      border: `1px solid ${C.line}`, borderRadius: R.lg,
                      padding: `${S[2]}px ${S[3]}px`,
                      background: C.white, outline: "none",
                    }}
                  />
                </div>
              </div>
              {/* Copilot generation */}
              <div style={{
                border: `1px solid ${C.blueBorder}`, borderRadius: R.xl,
                padding: `${S[3]}px ${S[4]}px`,
                background: C.blueLight,
                display: "flex", alignItems: "center", gap: S[4],
              }}>
                <div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.blueDark, marginBottom: 2 }}>
                    ✦ Generar con Copilot
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint }}>
                    Luca puede generar copy, hashtags y CTA automáticamente según el recurso y los canales elegidos.
                  </div>
                </div>
                <button
                  onClick={() => handleAction("campaigns.generate_all")}
                  disabled={!!executing}
                  style={{
                    flexShrink: 0,
                    fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700,
                    color: C.white, background: C.blueDark,
                    border: "none", borderRadius: R.lg,
                    padding: `${S[2]}px ${S[4]}px`,
                    cursor: executing ? "default" : "pointer",
                    opacity: executing ? 0.7 : 1,
                    whiteSpace: "nowrap" as const,
                  }}
                >
                  {executing === "campaigns.generate_all" ? "Generando…" : "Generar"}
                </button>
              </div>
            </div>
          )}

          {/* PASO 4 — Programación */}
          {wizardStep === 4 && (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: C.ink }}>
                ¿Cuándo quieres publicar?
              </div>
              {SCHEDULE_OPTIONS.map(opt => {
                const sel = draft.schedule === opt.key;
                return (
                  <button key={opt.key}
                    onClick={() => setDraft(d => ({ ...d, schedule: opt.key }))}
                    style={{
                      border: `1.5px solid ${sel ? C.blueDark : C.line}`,
                      borderRadius: R.xl, padding: `${S[3]}px ${S[4]}px`,
                      background: sel ? C.blueLight : C.white,
                      cursor: "pointer", textAlign: "left" as const,
                      display: "flex", alignItems: "center", gap: S[3],
                    }}
                  >
                    <div style={{
                      width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                      border: `2px solid ${sel ? C.blueDark : C.line}`,
                      background: sel ? C.blueDark : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {sel && <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.white }} />}
                    </div>
                    <div>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: sel ? C.blueDark : C.ink }}>{opt.label}</div>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>{opt.sub}</div>
                    </div>
                  </button>
                );
              })}
              {draft.schedule === "scheduled" && (
                <input
                  type="datetime-local"
                  value={draft.scheduledAt}
                  onChange={e => setDraft(d => ({ ...d, scheduledAt: e.target.value }))}
                  style={{
                    fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink,
                    border: `1px solid ${C.line}`, borderRadius: R.lg,
                    padding: `${S[2]}px ${S[3]}px`,
                    background: C.white, outline: "none", maxWidth: 260,
                  }}
                />
              )}
            </div>
          )}

          {/* PASO 5 — Confirmar */}
          {wizardStep === 5 && (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: S[4] }}>
              {/* Summary cards */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
                <SummaryCard
                  icon={ASSET_OPTIONS.find(a => a.key === firstAsset?.source)?.icon ?? "◫"}
                  label="Recurso"
                  value={firstAsset?.label ?? "Sin recurso"}
                  status={firstAsset ? "ok" : "missing"}
                />
                <SummaryCard
                  icon="⊕"
                  label="Redes seleccionadas"
                  value={channelNames || "Sin canales"}
                  status={draft.channels.length > 0 ? "ok" : "missing"}
                />
                <SummaryCard
                  icon="◷"
                  label="Programación"
                  value={draft.schedule === "scheduled" && draft.scheduledAt ? fmtDate(draft.scheduledAt) : scheduleLabel}
                  status={draft.schedule ? "ok" : "missing"}
                />
                <SummaryCard
                  icon="◈"
                  label="Contenido"
                  value={draft.copy ? draft.copy.slice(0, 48) + (draft.copy.length > 48 ? "…" : "") : "Sin contenido"}
                  status={draft.copy ? "ok" : "partial"}
                />
              </div>
              <SummaryCard
                icon="✦"
                label="Copilot"
                value={draft.copy ? "Contenido preparado · Listo para revisión" : "Contenido pendiente · Puedes generarlo con Copilot"}
                status={draft.copy ? "ok" : "neutral"}
              />

              {/* Final actions */}
              {isSubmitted ? (
                <div style={{
                  background: C.greenLight, border: `1px solid ${C.greenBorder}`,
                  borderRadius: R.xl, padding: `${S[4]}px`,
                  fontFamily: T.mono, fontSize: T.sz.sm, color: C.green, textAlign: "center" as const,
                }}>
                  ✓ Solicitud enviada. Copilot procesará el contenido y gestionará la aprobación.
                </div>
              ) : (
                <div style={{ display: "flex", gap: S[3] }}>
                  <button
                    onClick={() => handleFinal("campaigns.publish")}
                    style={{
                      flex: 1, fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700,
                      color: C.white, background: C.blueDark,
                      border: "none", borderRadius: R.lg, padding: `${S[3]}px`, cursor: "pointer",
                    }}
                  >
                    Publicar
                  </button>
                  <button
                    onClick={() => handleFinal("campaigns.save_draft")}
                    style={{
                      flex: 1, fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600,
                      color: C.blueDark, background: C.blueLight,
                      border: `1px solid ${C.blueBorder}`, borderRadius: R.lg,
                      padding: `${S[3]}px`, cursor: "pointer",
                    }}
                  >
                    Guardar borrador
                  </button>
                  <button
                    onClick={() => handleFinal("campaigns.pending_review")}
                    style={{
                      flex: 1, fontFamily: T.mono, fontSize: T.sz.sm,
                      color: C.inkMid, background: C.surfaceAlt,
                      border: `1px solid ${C.line}`, borderRadius: R.lg,
                      padding: `${S[3]}px`, cursor: "pointer",
                    }}
                  >
                    Enviar a revisión
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Navegación del wizard ────────────────────────────────────────────── */}
        {!isSubmitted && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              onClick={() => setWizardStep(s => Math.max(1, s - 1) as WizardStep)}
              disabled={wizardStep === 1}
              style={{
                fontFamily: T.mono, fontSize: T.sz.xs,
                color: wizardStep === 1 ? C.inkFaint : C.inkMid,
                background: "none", border: "none",
                cursor: wizardStep === 1 ? "default" : "pointer",
                padding: `${S[1]}px ${S[2]}px`,
              }}
            >
              ← Anterior
            </button>
            {wizardStep < 5 && (
              <button
                onClick={() => { if (canAdvance()) setWizardStep(s => (s + 1) as WizardStep); }}
                disabled={!canAdvance()}
                style={{
                  fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600,
                  color: canAdvance() ? C.white : C.inkFaint,
                  background: canAdvance() ? C.blueDark : C.surfaceAlt,
                  border: canAdvance() ? "none" : `1px solid ${C.line}`,
                  borderRadius: R.lg, padding: `${S[2]}px ${S[5]}px`,
                  cursor: canAdvance() ? "pointer" : "default",
                }}
              >
                Siguiente →
              </button>
            )}
          </div>
        )}
      </AgModulePrimaryPanel>

      {/* ══ BLOQUE 2 — ESTADO DE CAMPAÑAS (solo cuando existen) ═══════════════════ */}
      {campaigns.length > 0 && (
        <AgModuleSecondaryPanel label="Estado de contenido">
          <StatusRow label="Activas"            count={counts.activas}     variant="ok" />
          <StatusRow label="Programadas"        count={counts.programadas} variant="ok" />
          <StatusRow label="Borradores"         count={counts.borradores}  variant="neutral" />
          <StatusRow label="Requieren revisión" count={counts.revision}    variant={counts.revision > 0 ? "warning" : "neutral"} />
          <StatusRow label="Finalizadas"        count={counts.finalizadas} variant="ok" />
        </AgModuleSecondaryPanel>
      )}

      {/* ══ BLOQUE 3 — LISTADO DE CAMPAÑAS ════════════════════════════════════════ */}
      <AgModuleSecondaryPanel
        label="Contenido"
        action={{
          label: "Nuevo contenido",
          onClick: () => { setWizardStep(1); setDraft(INITIAL_DRAFT); window.scrollTo({ top: 0, behavior: "smooth" }); },
        }}
      >
        {campaigns.length === 0 ? (
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, padding: `${S[2]}px 0` }}>
            Todavía no hay contenido publicable. Usa el asistente superior para crear el primero.
          </div>
        ) : (
          <div className="ag-op-table">
            <div className="ag-op-row" style={{ background: C.surfaceAlt }}>
              {["Nombre", "Estado", "Redes", "Próxima publicación", "Recursos", "Actualización"].map(h => (
                <span key={h} style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, fontWeight: 600 }}>{h}</span>
              ))}
            </div>
            {campaigns.map(c => (
              <div key={c.id} className="ag-op-row" style={{ cursor: "pointer" }} onClick={() => setDrawer({ campaign: c })}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.ink }}>{c.name}</span>
                <span className={`ag-op-status ag-op-status--${statusVariant(c.status)}`}>
                  {CAMPAIGN_STATUS_LABEL[c.status]}
                </span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                  {c.channels.slice(0, 2).join(", ")}{c.channels.length > 2 ? ` +${c.channels.length - 2}` : ""}
                </span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>{nextScheduledAt(c)}</span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                  {c.contentSlots.filter(s => s.isReady).length}/{c.contentSlots.length}
                </span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>{fmtAgo(c.updatedAt)}</span>
              </div>
            ))}
          </div>
        )}
      </AgModuleSecondaryPanel>

      {/* ══ BLOQUE 4 — CALENDARIO EDITORIAL (solo cuando hay eventos) ═════════════ */}
      <AgModuleSecondaryPanel label="Calendario editorial — Esta semana">
        {!hasCalEvents ? (
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, padding: `${S[1]}px 0` }}>
            Sin publicaciones programadas esta semana. Las fechas asignadas en el asistente aparecerán aquí.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: S[2] }}>
            {weekDays.map(day => {
              const dayEvents = calendarEvents.filter(e => e.scheduledAt.startsWith(day.iso));
              return (
                <div key={day.iso} style={{
                  border: `1px solid ${C.lineSubtle}`, borderRadius: R.lg,
                  padding: `${S[2]}px`, minHeight: 72,
                  background: dayEvents.length > 0 ? C.white : C.surfaceAlt,
                }}>
                  <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint, marginBottom: S[1] }}>
                    {day.label}
                  </div>
                  {dayEvents.length === 0 ? (
                    <div style={{ fontFamily: T.mono, fontSize: 10, color: C.lineSubtle }}>—</div>
                  ) : (
                    <>
                      {dayEvents.slice(0, 2).map((ev, i) => {
                        const chMeta = CHANNEL_OPTIONS.find(o => o.key === ev.channel);
                        return (
                          <div key={`${ev.id}-${i}`} style={{
                            fontFamily: T.mono, fontSize: 10,
                            color: chMeta?.brandColor ?? C.blueDark,
                            background: chMeta?.brandBg ?? C.blueLight,
                            borderRadius: R.sm, padding: "2px 4px", marginBottom: 2,
                            overflow: "hidden", whiteSpace: "nowrap" as const, textOverflow: "ellipsis",
                          }}>
                            {ev.channel}
                          </div>
                        );
                      })}
                      {dayEvents.length > 2 && (
                        <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint }}>+{dayEvents.length - 2}</div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </AgModuleSecondaryPanel>

      {/* ── OperationalSideDrawer ──────────────────────────────────────────────── */}
      <OperationalSideDrawer
        open={drawer !== null}
        onClose={() => setDrawer(null)}
        title={drawer?.campaign.name ?? ""}
        severity={drawerSeverity}
        statusLabel={drawerStatusLabel}
      >
        {drawer && (
          <CampaignDrawerContent
            key={drawer.campaign.id}
            campaign={drawer.campaign}
            lucaRecos={lucaRecos}
            milaRecos={milaRecos}
            executing={executing}
            onExecute={handleAction}
          />
        )}
      </OperationalSideDrawer>
    </div>
  );
}
