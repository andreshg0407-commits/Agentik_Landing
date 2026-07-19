"use client";

/**
 * app/(app)/[orgSlug]/agentik/marketing-studio/shopify/banners/banners-client.tsx
 *
 * SHOPIFY-EXPERIENCES-ARCHITECTURE-01 — Experiencias Shopify Client
 *
 * 5-tab workspace:
 *   1. Resumen        — module health KPIs + Copilot signals
 *   2. Landings       — product × Biblioteca cross-match table
 *   3. Banners        — slot cards with replacement / scheduling actions
 *   4. Plantillas     — template gallery
 *   5. Borradores     — drafts pending review
 *
 * ARCHITECTURE:
 *   Canvas = data only. Copilot stays in right rail.
 *   All data via props — no client-side data fetching at mount.
 *   Actions routed through Copilot pipeline — never direct Shopify calls.
 *   Nothing publishes automatically.
 */

import { useState, useEffect } from "react";
import {
  LayoutGrid,
  Globe,
  Image,
  Layers,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  ChevronRight,
  X,
  Save,
  Eye,
  Archive,
  RotateCcw,
  Upload,
  History,
  Square,
  CheckSquare2,
  Calendar,
  Pause,
  Play,
  Search,
  Plus,
  ImageIcon,
} from "lucide-react";
import { C, T, S, R } from "@/lib/ui/tokens";
import type { ExperiencesWorkspaceData } from "@/lib/marketing-studio/commerce/shopify-experiences-types";
import {
  EXPERIENCE_TAB_LABEL,
  EXPERIENCE_STATUS_LABEL,
  TEMPLATE_DESTINO_LABEL,
  EXPERIENCE_READINESS_LABEL,
  EXPERIENCE_READINESS_COLOR,
} from "@/lib/marketing-studio/commerce/shopify-experiences-types";
import type {
  ExperienceTab,
  ExperienceStatus,
  ExperienceReadiness,
  ExperienceAvailability,
  LandingProductRow,
  ExperienceDraft,
} from "@/lib/marketing-studio/commerce/shopify-experiences-types";
import type { ExperienceTemplate, GenerationRules } from "@/lib/marketing-studio/commerce/shopify-experiences-types";
import type {
  LandingDraft,
  LandingDraftBlock,
  LandingDraftStatus,
} from "@/lib/marketing-studio/commerce/shopify-landing-draft-types";
import {
  LANDING_BLOCK_LABEL,
  LANDING_DRAFT_STATUS_LABEL,
} from "@/lib/marketing-studio/commerce/shopify-landing-draft-types";
import type {
  PublicationHistoryEntry,
  ShopifyPublishedExperience,
} from "@/lib/marketing-studio/commerce/shopify-publish-types";
import type { SyncSummary } from "@/lib/marketing-studio/commerce/shopify-biblioteca-sync-types";
import type {
  ShopifyBannerSlot,
  ShopifyBannerDraft,
  ShopifyBannerStatus,
  ShopifyBannerAsset,
  ShopifyBannerHistoryEntry,
  BannerSofiaHint,
  CreateBannerDraftInput,
  UpdateBannerDraftInput,
} from "@/lib/marketing-studio/commerce/shopify-banner-types";
import {
  BANNER_STATUS_LABEL,
  BANNER_STATUS_COLOR,
} from "@/lib/marketing-studio/commerce/shopify-banner-types";

// ── Props ─────────────────────────────────────────────────────────────────────

interface ExperienciasClientProps {
  orgSlug:   string;
  workspace: ExperiencesWorkspaceData;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusColor(s: ExperienceStatus | null): string {
  if (!s) return C.inkFaint;
  switch (s) {
    case "publicado":   return C.green;
    case "aprobado":    return C.blue;
    case "en_revision": return C.amber;
    case "borrador":    return C.inkLight;
    case "rechazado":   return C.red;
    case "archivado":   return C.inkFaint;
  }
}

function shopifyStatusLabel(s: LandingProductRow["shopifyStatus"]): string {
  switch (s) {
    case "active":   return "Activo";
    case "draft":    return "Borrador";
    case "archived": return "Archivado";
    default:         return "Desconocido";
  }
}

function shopifyStatusColor(s: LandingProductRow["shopifyStatus"]): string {
  switch (s) {
    case "active":   return C.green;
    case "draft":    return C.amber;
    case "archived": return C.inkFaint;
    default:         return C.inkFaint;
  }
}

function ReadinessDot({ ok }: { ok: boolean }) {
  return (
    <span style={{
      display: "inline-block",
      width: 7, height: 7, borderRadius: "50%",
      background: ok ? C.green : C.line,
      flexShrink: 0,
    }} />
  );
}

function ReadinessBadge({ readiness }: { readiness: ExperienceReadiness }) {
  const color = EXPERIENCE_READINESS_COLOR[readiness];
  const label = EXPERIENCE_READINESS_LABEL[readiness];
  return (
    <span style={{
      fontFamily:   T.mono,
      fontSize:     T.sz["2xs"],
      fontWeight:   T.wt.semibold,
      color,
      background:   `${color}14`,
      border:       `1px solid ${color}33`,
      borderRadius: R.pill,
      padding:      `1px ${S[2]}px`,
      whiteSpace:   "nowrap" as const,
    }}>
      {label}
    </span>
  );
}

function OpportunityLine({
  icon,
  text,
  variant,
}: {
  icon:    "check" | "warn";
  text:    string;
  variant: "ok" | "warning";
}) {
  const color = variant === "ok" ? C.green : C.amber;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: S[2],
      fontFamily: T.mono, fontSize: T.sz.xs, color,
    }}>
      <span>{icon === "check" ? "\u2713" : "\u26a0"}</span>
      <span>{text}</span>
    </div>
  );
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

const TABS: ExperienceTab[] = ["resumen", "landings", "banners", "plantillas", "borradores", "historial"];

const TAB_ICONS: Record<ExperienceTab, React.ReactNode> = {
  resumen:     <LayoutGrid size={13} strokeWidth={1.6} />,
  landings:    <Globe      size={13} strokeWidth={1.6} />,
  banners:     <Image      size={13} strokeWidth={1.6} />,
  plantillas:  <Layers     size={13} strokeWidth={1.6} />,
  borradores:  <FileText   size={13} strokeWidth={1.6} />,
  historial:   <History    size={13} strokeWidth={1.6} />,
};

function TabBar({
  active,
  onChange,
  borradores,
}: {
  active:    ExperienceTab;
  onChange:  (t: ExperienceTab) => void;
  borradores: number;
}) {
  return (
    <div style={{
      display: "flex", gap: 0,
      borderBottom: `1px solid ${C.line}`,
      marginBottom: S[5],
      overflowX: "auto" as const,
    }}>
      {TABS.map(tab => {
        const isActive = tab === active;
        return (
          <button
            key={tab}
            onClick={() => onChange(tab)}
            style={{
              display: "flex", alignItems: "center", gap: S[1],
              padding: `${S[3]}px ${S[4]}px`,
              background: "transparent",
              border: "none",
              borderBottom: isActive ? `2px solid ${C.blueDark}` : "2px solid transparent",
              marginBottom: -1,
              fontFamily: T.mono, fontSize: T.sz.sm,
              color: isActive ? C.blueDark : C.inkLight,
              fontWeight: isActive ? T.wt.semibold : T.wt.normal,
              cursor: "pointer",
              whiteSpace: "nowrap" as const,
              transition: "color 0.15s, border-color 0.15s",
            }}
          >
            {TAB_ICONS[tab]}
            {EXPERIENCE_TAB_LABEL[tab]}
            {tab === "borradores" && borradores > 0 && (
              <span style={{
                background: C.amber,
                color: C.white,
                borderRadius: R.pill,
                fontSize: T.sz["2xs"],
                fontWeight: T.wt.bold,
                padding: `0 ${S[1]}px`,
                lineHeight: "16px",
                minWidth: 16,
                textAlign: "center" as const,
              }}>{borradores}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ title, count, sub }: { title: string; count?: number; sub?: string }) {
  return (
    <div style={{ marginBottom: S[3] }}>
      <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
        <span style={{
          fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
          color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.06em",
        }}>
          {title}
        </span>
        {count !== undefined && (
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
            · {count}
          </span>
        )}
      </div>
      {sub && (
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  value, label, sub, dotColor, highlight,
}: {
  value:     number | string;
  label:     string;
  sub?:      string;
  dotColor?: string;
  highlight?: "ok" | "warn" | "critical";
}) {
  const bg =
    highlight === "ok"       ? `${C.green}0a`    :
    highlight === "warn"     ? `${C.amber}0a`    :
    highlight === "critical" ? `${C.red}0a`      :
    C.surface;
  const border =
    highlight === "ok"       ? `1px solid ${C.green}22`  :
    highlight === "warn"     ? `1px solid ${C.amber}22`  :
    highlight === "critical" ? `1px solid ${C.red}22`    :
    `1px solid ${C.line}`;

  return (
    <div style={{
      flex: "1 1 140px", minWidth: 120, maxWidth: 200,
      padding: `${S[4]}px ${S[4]}px`,
      background: bg, border, borderRadius: R.lg,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: S[1], marginBottom: S[1] }}>
        {dotColor && <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />}
        <span style={{ fontFamily: T.mono, fontSize: "22px", fontWeight: T.wt.bold, color: C.ink, lineHeight: 1 }}>
          {value}
        </span>
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, fontWeight: T.wt.medium }}>
        {label}
      </div>
      {sub && (
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <div style={{
      padding: `${S[10]}px ${S[4]}px`,
      textAlign: "center" as const,
      border: `1px solid ${C.line}`,
      borderRadius: R.lg,
      background: C.surface,
    }}>
      <div style={{ color: C.inkFaint, marginBottom: S[3] }}>{icon}</div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight, fontWeight: T.wt.medium }}>
        {title}
      </div>
      {sub && (
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: S[1], maxWidth: 360, margin: `${S[1]}px auto 0` }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Not connected state ───────────────────────────────────────────────────────

function NotConnected({ orgSlug }: { orgSlug: string }) {
  return (
    <div style={{
      padding: `${S[10]}px ${S[4]}px`,
      textAlign: "center" as const,
      border: `1px solid ${C.line}`,
      borderRadius: R.lg,
      background: C.surface,
    }}>
      <AlertCircle size={32} color={C.inkFaint} strokeWidth={1.5} style={{ marginBottom: S[3] }} />
      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight, fontWeight: T.wt.medium, marginBottom: S[2] }}>
        Shopify no conectado
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginBottom: S[4], maxWidth: 380, margin: `0 auto ${S[4]}px` }}>
        Conecta tu tienda Shopify para detectar productos, cruzarlos con Biblioteca y generar landings y banners.
      </div>
      <a
        href={`/api/integrations/shopify/connect?orgSlug=${orgSlug}`}
        style={{
          display: "inline-flex", alignItems: "center", gap: S[1],
          padding: `${S[2]}px ${S[4]}px`,
          background: C.blueDark, color: C.white,
          borderRadius: R.md, fontFamily: T.mono,
          fontSize: T.sz.sm, textDecoration: "none",
          fontWeight: T.wt.semibold,
        }}
      >
        Conectar Shopify
        <ChevronRight size={13} strokeWidth={2} />
      </a>
    </div>
  );
}

// ── RESUMEN tab ───────────────────────────────────────────────────────────────

function ResumenTab({ workspace, orgSlug }: { workspace: ExperiencesWorkspaceData; orgSlug: string }) {
  const { summary, connected, availability, opportunities, copilotSignals } = workspace;

  if (!connected) return null; // handled at canvas level

  // Readiness distribution counts
  const readyCt   = availability.filter(a => a.readiness === "READY").length;
  const partialCt = availability.filter(a => a.readiness === "PARTIAL").length;
  const missingCt = availability.filter(a => a.readiness === "MISSING_ASSETS").length;
  const noCt      = availability.filter(a => a.readiness === "NO_MEDIA").length;

  return (
    <div>
      {/* KPIs — Products */}
      <SectionHeader title="Productos" sub="Detectados en el catalogo Shopify" />
      <div style={{ display: "flex", gap: S[3], flexWrap: "wrap" as const, marginBottom: S[6] }}>
        <KpiCard
          value={summary.productosDetectados}
          label="Sincronizados"
          sub="desde Shopify"
          dotColor={C.ink}
        />
        <KpiCard
          value={opportunities.readyForFullLanding + opportunities.readyForBasicLanding}
          label="Aptos para landing"
          sub={opportunities.readyForFullLanding > 0
            ? `${opportunities.readyForFullLanding} completa · ${opportunities.readyForBasicLanding} basica`
            : "recursos suficientes"}
          dotColor={C.green}
          highlight={(opportunities.readyForFullLanding + opportunities.readyForBasicLanding) > 0 ? "ok" : undefined}
        />
        <KpiCard
          value={summary.productosConLanding}
          label="Con landing publicada"
          sub="experiencia activa"
          dotColor={C.blue}
          highlight={summary.productosConLanding > 0 ? "ok" : undefined}
        />
        <KpiCard
          value={summary.productosSinImagen}
          label="Pendientes de recursos"
          sub="sin imagenes aprobadas"
          dotColor={C.amber}
          highlight={summary.productosSinImagen > 0 ? "warn" : undefined}
        />
      </div>

      {/* KPIs — Banners */}
      <SectionHeader title="Banners" sub="Slots disponibles en la tienda" />
      <div style={{ display: "flex", gap: S[3], flexWrap: "wrap" as const, marginBottom: S[6] }}>
        <KpiCard
          value={summary.bannersActivos}
          label="Banners activos"
          sub={`de ${summary.bannersPorSlot} slots`}
          dotColor={C.green}
          highlight={summary.bannersActivos > 0 ? "ok" : undefined}
        />
        <KpiCard
          value={summary.borrradoresPendientes}
          label="Borradores"
          sub="pendientes de revision"
          dotColor={C.amber}
          highlight={summary.borrradoresPendientes > 0 ? "warn" : undefined}
        />
      </div>

      {/* Readiness distribution */}
      {availability.length > 0 && (
        <>
          <SectionHeader title="Distribucion de preparacion" sub="Estado de los productos para generar experiencias" />
          <div style={{
            display: "flex", gap: S[3], flexWrap: "wrap" as const, marginBottom: S[2],
          }}>
            <ReadinessDistItem label="Listo" count={readyCt} color={EXPERIENCE_READINESS_COLOR.READY} />
            <ReadinessDistItem label="Parcial" count={partialCt} color={EXPERIENCE_READINESS_COLOR.PARTIAL} />
            <ReadinessDistItem label="Recursos insuficientes" count={missingCt} color={EXPERIENCE_READINESS_COLOR.MISSING_ASSETS} />
            <ReadinessDistItem label="Sin contenido" count={noCt} color={EXPERIENCE_READINESS_COLOR.NO_MEDIA} />
          </div>
          {/* Distribution bar */}
          <div style={{
            display: "flex", height: 6, borderRadius: R.pill, overflow: "hidden",
            marginBottom: S[6],
          }}>
            {readyCt > 0 && <div style={{ flex: readyCt, background: EXPERIENCE_READINESS_COLOR.READY, minWidth: 2 }} />}
            {partialCt > 0 && <div style={{ flex: partialCt, background: EXPERIENCE_READINESS_COLOR.PARTIAL, marginLeft: readyCt > 0 ? 1 : 0, minWidth: 2 }} />}
            {missingCt > 0 && <div style={{ flex: missingCt, background: EXPERIENCE_READINESS_COLOR.MISSING_ASSETS, marginLeft: (readyCt + partialCt) > 0 ? 1 : 0, minWidth: 2 }} />}
            {noCt > 0 && <div style={{ flex: noCt, background: EXPERIENCE_READINESS_COLOR.NO_MEDIA, marginLeft: (readyCt + partialCt + missingCt) > 0 ? 1 : 0, minWidth: 2 }} />}
          </div>
        </>
      )}

      {/* Opportunities card */}
      {opportunities.totalSynced > 0 && (
        <>
          <SectionHeader title="Oportunidades detectadas" />
          <div style={{
            border:       `1px solid ${C.line}`,
            borderTop:    `3px solid ${C.blueDark}`,
            borderRadius: R.lg,
            padding:      `${S[4]}px ${S[5]}px`,
            background:   C.surface,
            marginBottom: S[6],
          }}>
            <div style={{
              fontFamily: T.mono, fontSize: "22px", fontWeight: T.wt.bold,
              color: C.blueDark, marginBottom: S[3],
            }}>
              {opportunities.readyForFullLanding + opportunities.readyForBasicLanding}
              <span style={{ fontSize: T.sz.sm, fontWeight: T.wt.normal, color: C.inkMid, marginLeft: S[2] }}>
                productos listos para experiencias
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
              <OpportunityLine icon="check" text={`${opportunities.totalSynced} productos sincronizados`} variant="ok" />
              {opportunities.readyForFullLanding > 0 && (
                <OpportunityLine icon="check" text={`${opportunities.readyForFullLanding} listos para landing completa`} variant="ok" />
              )}
              {opportunities.readyForBasicLanding > 0 && (
                <OpportunityLine icon="check" text={`${opportunities.readyForBasicLanding} listos para landing basica`} variant="ok" />
              )}
              {opportunities.needVideos > 0 && (
                <OpportunityLine icon="warn" text={`${opportunities.needVideos} requieren videos`} variant="warning" />
              )}
              {opportunities.noImages > 0 && (
                <OpportunityLine icon="warn" text={`${opportunities.noImages} no tienen imagenes`} variant="warning" />
              )}
            </div>
          </div>
        </>
      )}

      {/* Copilot (Sofia) signals */}
      {copilotSignals.length > 0 && (
        <>
          <SectionHeader title="Analisis de Sofia" sub="Recomendaciones contextuales del agente" />
          <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
            {copilotSignals.map(signal => (
              <div
                key={signal.id}
                style={{
                  fontFamily:   T.mono,
                  fontSize:     T.sz.xs,
                  color:        signal.category === "warning" ? C.amberMid : C.inkMid,
                  background:   signal.category === "warning" ? C.amberLight : `${C.blueDark}08`,
                  border:       `1px solid ${signal.category === "warning" ? C.amberBorder : `${C.blueDark}18`}`,
                  borderRadius: R.lg,
                  padding:      `${S[3]}px ${S[4]}px`,
                  lineHeight:   1.55,
                }}
              >
                {signal.category === "opportunity" && "\ud83d\udca1 "}
                {signal.category === "suggestion" && "\ud83d\udccc "}
                {signal.category === "warning" && "\u26a0\ufe0f "}
                {signal.message}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ReadinessDistItem({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: S[1] }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
        {label} {"\u00b7"} {count}
      </span>
    </div>
  );
}

// ── Sync status strip ────────────────────────────────────────────────────────

function formatTimeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins   = Math.floor(diffMs / 60_000);
  if (mins < 1) return "hace un momento";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs / 24)}d`;
}

function SyncStatusStrip({
  orgSlug,
}: {
  orgSlug: string;
}) {
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/orgs/${orgSlug}/marketing-studio/shopify/experiences/sync`)
      .then(r => r.json())
      .then(d => { if (!cancelled && d.ok) setSummary(d.summary); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [orgSlug]);

  async function triggerSync() {
    if (syncing) return;
    setSyncing(true);
    try {
      await fetch(`/api/orgs/${orgSlug}/marketing-studio/shopify/experiences/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_catalog" }),
      });
      const r = await fetch(`/api/orgs/${orgSlug}/marketing-studio/shopify/experiences/sync`);
      const d = await r.json();
      if (d.ok) setSummary(d.summary);
    } catch {}
    setSyncing(false);
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: S[3],
      padding: `${S[2]}px ${S[3]}px`, marginBottom: S[3],
      background: `${C.blueDark}08`, border: `1px solid ${C.line}`,
      borderRadius: R.md,
    }}>
      <RotateCcw
        size={13} strokeWidth={1.6}
        style={{
          color: syncing ? C.blueDark : C.inkFaint,
          animation: syncing ? "spin 1s linear infinite" : "none",
          cursor: "pointer", flexShrink: 0,
        }}
        onClick={triggerSync}
      />
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>
        {summary
          ? `Ultima sincronizacion: ${formatTimeAgo(summary.lastSyncAt)}`
          : "Cargando estado de sincronizacion..."}
      </span>
      {summary && (
        <span style={{
          marginLeft: "auto", fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint,
        }}>
          {summary.readyCount} listos · {summary.partialCount} parciales · {summary.missingAssetsCount + summary.noMediaCount} pendientes
        </span>
      )}
    </div>
  );
}

// ── LANDINGS tab ──────────────────────────────────────────────────────────────

type LandingsFilter = "todos" | "listos" | "basicos" | "sin_landing" | "con_landing" | "con_video" | "sin_video" | "sin_recursos";

const LANDINGS_FILTER_LABEL: Record<LandingsFilter, string> = {
  todos:        "Todos",
  listos:       "Listos completos",
  basicos:      "Listos basicos",
  sin_landing:  "Sin landing",
  con_landing:  "Con landing",
  con_video:    "Con video",
  sin_video:    "Sin video",
  sin_recursos: "Sin recursos",
};

function LandingsTab({
  landings,
  connected,
  availability,
  orgSlug,
  plantillas,
}: {
  landings:     LandingProductRow[];
  connected:    boolean;
  availability: ExperienceAvailability[];
  orgSlug:      string;
  plantillas:   ExperienceTemplate[];
}) {
  const [filter, setFilter] = useState<LandingsFilter>("todos");
  const [generating, setGenerating] = useState<string | null>(null);
  const [generated, setGenerated] = useState<Set<string>>(new Set());
  const [genError, setGenError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);

  function toggleSelected(pid: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid); else next.add(pid);
      return next;
    });
  }

  function selectAllVisible() {
    const eligible = filtered
      .filter(p => {
        const avail = availability.find(a => a.productId === p.productId);
        const r = avail?.readiness ?? "NO_MEDIA";
        return r === "READY" || r === "PARTIAL";
      })
      .map(p => p.productId);
    setSelected(new Set(eligible));
  }

  function clearSelection() { setSelected(new Set()); }

  async function handleGenerate(productId: string, _readiness: ExperienceReadiness) {
    if (generating) return;
    setGenerating(productId);
    setGenError(null);

    const destino = "landing_producto";
    const tpl = plantillas.find(t => t.activa && t.destino === destino)
      ?? plantillas.find(t => t.activa);

    if (!tpl) {
      setGenError("No hay plantillas disponibles.");
      setGenerating(null);
      return;
    }

    try {
      const res = await fetch(`/api/orgs/${orgSlug}/marketing-studio/shopify/experiences/landings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, templateId: tpl.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setGenError(data.error ?? "Error al generar borrador.");
      } else {
        setGenerated(prev => new Set(prev).add(productId));
      }
    } catch {
      setGenError("Error de conexion al generar borrador.");
    } finally {
      setGenerating(null);
    }
  }

  if (!connected) return null;

  const filtered = landings.filter(p => {
    const avail = availability.find(a => a.productId === p.productId);
    const r = avail?.readiness ?? "NO_MEDIA";
    switch (filter) {
      case "listos":       return r === "READY";
      case "basicos":      return r === "PARTIAL";
      case "sin_landing":  return !p.tieneLanding;
      case "con_landing":  return p.tieneLanding;
      case "con_video":    return p.biblioteca.videosAprobados > 0;
      case "sin_video":    return p.biblioteca.videosAprobados === 0;
      case "sin_recursos": return r === "MISSING_ASSETS" || r === "NO_MEDIA";
      default:             return true;
    }
  });

  const selectedCount = selected.size;

  return (
    <div>
      {/* Sync status */}
      <SyncStatusStrip orgSlug={orgSlug} />

      {/* Filter bar */}
      <div style={{ display: "flex", gap: S[1], marginBottom: S[3], flexWrap: "wrap" as const }}>
        {(Object.keys(LANDINGS_FILTER_LABEL) as LandingsFilter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: `${S[1]}px ${S[2]}px`,
              background: filter === f ? C.blueDark : "transparent",
              color: filter === f ? C.white : C.inkLight,
              border: `1px solid ${filter === f ? C.blueDark : C.line}`,
              borderRadius: R.pill,
              fontFamily: T.mono, fontSize: T.sz["2xs"],
              cursor: "pointer", fontWeight: filter === f ? T.wt.semibold : T.wt.normal,
            }}
          >
            {LANDINGS_FILTER_LABEL[f]}
          </button>
        ))}
      </div>

      {/* Selection bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: S[2],
        marginBottom: S[3], flexWrap: "wrap" as const,
      }}>
        <button
          onClick={selectAllVisible}
          style={{
            padding: `${S[1]}px ${S[2]}px`,
            background: "transparent", color: C.blueDark,
            border: `1px solid ${C.blueDark}`,
            borderRadius: R.sm,
            fontFamily: T.mono, fontSize: T.sz["2xs"],
            cursor: "pointer", fontWeight: T.wt.semibold,
          }}
        >
          Seleccionar visibles
        </button>
        {selectedCount > 0 && (
          <>
            <button
              onClick={clearSelection}
              style={{
                padding: `${S[1]}px ${S[2]}px`,
                background: "transparent", color: C.inkLight,
                border: `1px solid ${C.line}`,
                borderRadius: R.sm,
                fontFamily: T.mono, fontSize: T.sz["2xs"],
                cursor: "pointer",
              }}
            >
              Limpiar seleccion
            </button>
            <button
              onClick={() => setShowBulkModal(true)}
              style={{
                padding: `${S[1]}px ${S[3]}px`,
                background: C.blueDark, color: C.white,
                border: "none",
                borderRadius: R.sm,
                fontFamily: T.mono, fontSize: T.sz.xs,
                cursor: "pointer", fontWeight: T.wt.semibold,
              }}
            >
              Generar borradores ({selectedCount})
            </button>
          </>
        )}
        <span style={{ marginLeft: "auto", fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
          {filtered.length} producto{filtered.length !== 1 ? "s" : ""}
          {selectedCount > 0 ? ` · ${selectedCount} seleccionado${selectedCount !== 1 ? "s" : ""}` : ""}
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Globe size={32} strokeWidth={1.5} />}
          title="Sin productos en esta vista"
          sub="Prueba con otro filtro o conecta Shopify para detectar el catalogo."
        />
      ) : (
        <>
          {/* Table header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "28px 1fr 100px 60px 60px 110px 130px",
            gap: `0 ${S[2]}px`,
            padding: `${S[2]}px ${S[3]}px`,
            borderBottom: `1px solid ${C.line}`,
            fontFamily: T.mono, fontSize: T.sz.xs,
            color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.04em",
          }}>
            <span />
            <span>Producto</span>
            <span>SKU</span>
            <span style={{ textAlign: "center" as const }}>Fotos</span>
            <span style={{ textAlign: "center" as const }}>Videos</span>
            <span style={{ textAlign: "center" as const }}>Estado</span>
            <span style={{ textAlign: "center" as const }}>Accion</span>
          </div>
          <div className="ag-op-table">
            {genError && (
              <div style={{
                padding: `${S[2]}px ${S[3]}px`,
                background: `${C.red}0a`,
                border: `1px solid ${C.red}22`,
                borderRadius: R.sm,
                fontFamily: T.mono, fontSize: T.sz.xs, color: C.red,
                marginBottom: S[2],
              }}>
                {genError}
              </div>
            )}
            {filtered.map(row => {
              const avail = availability.find(a => a.productId === row.productId);
              return (
                <LandingProductTableRow
                  key={row.productId}
                  row={row}
                  avail={avail ?? null}
                  generating={generating === row.productId}
                  generated={generated.has(row.productId)}
                  onGenerate={handleGenerate}
                  checked={selected.has(row.productId)}
                  onToggle={toggleSelected}
                />
              );
            })}
          </div>
        </>
      )}

      {/* Bulk generation modal */}
      {showBulkModal && (
        <BulkGenerationModal
          orgSlug={orgSlug}
          plantillas={plantillas}
          availability={availability}
          landings={landings}
          selectedIds={selected}
          onClose={() => setShowBulkModal(false)}
          onComplete={(createdIds) => {
            setGenerated(prev => {
              const next = new Set(prev);
              createdIds.forEach(id => next.add(id));
              return next;
            });
            setSelected(new Set());
          }}
        />
      )}
    </div>
  );
}

function LandingProductTableRow({
  row, avail, generating, generated, onGenerate, checked, onToggle,
}: {
  row:        LandingProductRow;
  avail:      ExperienceAvailability | null;
  generating: boolean;
  generated:  boolean;
  onGenerate: (productId: string, readiness: ExperienceReadiness) => void;
  checked:    boolean;
  onToggle:   (productId: string) => void;
}) {
  const readiness: ExperienceReadiness = avail?.readiness ?? "NO_MEDIA";

  const canGenerate = readiness === "READY" || readiness === "PARTIAL";
  const actionLabel =
    generated     ? "Borrador creado" :
    generating    ? "Generando..." :
    readiness === "READY"          ? "Generar borrador" :
    readiness === "PARTIAL"        ? "Generar basico" :
    readiness === "MISSING_ASSETS" ? "Completar recursos" :
    "Sin recursos";

  return (
    <div className="ag-op-row" style={{
      display: "grid",
      gridTemplateColumns: "28px 1fr 100px 60px 60px 110px 130px",
      gap: `0 ${S[2]}px`,
      padding: `${S[2]}px ${S[3]}px`,
      alignItems: "center",
    }}>
      {/* Checkbox */}
      <span
        onClick={() => onToggle(row.productId)}
        style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        {checked
          ? <CheckSquare2 size={15} strokeWidth={2} color={C.blueDark} />
          : <Square size={15} strokeWidth={1.5} color={C.inkFaint} />
        }
      </span>

      {/* Nombre */}
      <div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, fontWeight: T.wt.medium }}>
          {row.nombre}
        </div>
        {row.precio && (
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 1 }}>
            {row.precio}
          </div>
        )}
      </div>

      {/* SKU */}
      <span style={{
        fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
      }}>
        {row.sku ?? "\u2014"}
      </span>

      {/* Fotos */}
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, textAlign: "center" as const }}>
        {row.biblioteca.fotosAprobadas}
      </span>

      {/* Videos */}
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, textAlign: "center" as const }}>
        {row.biblioteca.videosAprobados}
      </span>

      {/* Readiness badge */}
      <span style={{ textAlign: "center" as const }}>
        <ReadinessBadge readiness={readiness} />
      </span>

      {/* Action */}
      <span style={{ textAlign: "center" as const }}>
        {canGenerate && !generated ? (
          <button
            disabled={generating}
            onClick={() => onGenerate(row.productId, readiness)}
            style={{
              padding: `${S[1]}px ${S[2]}px`,
              background: generating ? C.surfaceAlt : C.blueDark,
              color: generating ? C.inkFaint : C.white,
              border: "none", borderRadius: R.sm,
              fontFamily: T.mono, fontSize: T.sz["2xs"],
              fontWeight: T.wt.semibold,
              cursor: generating ? "wait" : "pointer",
              opacity: generating ? 0.7 : 1,
            }}
          >
            {actionLabel}
          </button>
        ) : (
          <span style={{
            fontFamily: T.mono, fontSize: T.sz["2xs"],
            color: generated ? C.green : C.inkFaint,
            fontWeight: generated ? T.wt.semibold : T.wt.normal,
          }}>
            {generated && <CheckCircle size={11} strokeWidth={2} style={{ verticalAlign: "middle", marginRight: 3 }} />}
            {actionLabel}
          </span>
        )}
      </span>
    </div>
  );
}

// ── BULK GENERATION MODAL ─────────────────────────────────────────────────────

interface BulkSummary {
  requested: number;
  created:   number;
  skipped:   number;
  failed:    number;
}

function BulkGenerationModal({
  orgSlug, plantillas, availability, landings, selectedIds, onClose, onComplete,
}: {
  orgSlug:     string;
  plantillas:  ExperienceTemplate[];
  availability: ExperienceAvailability[];
  landings:    LandingProductRow[];
  selectedIds: Set<string>;
  onClose:     () => void;
  onComplete:  (createdIds: string[]) => void;
}) {
  const activePlantillas = plantillas.filter(t => t.activa);
  const defaultTpl = activePlantillas.find(t => t.destino === "landing_producto") ?? activePlantillas[0];

  const [templateId, setTemplateId] = useState(defaultTpl?.id ?? "");
  const [rules, setRules] = useState<GenerationRules>({
    maxImages: 6,
    showPrice: true,
    showCollection: true,
    imageQuality: "optimized",
  });
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<BulkSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Compute breakdown
  const selectedProducts = landings.filter(p => selectedIds.has(p.productId));
  const completos = selectedProducts.filter(p => {
    const a = availability.find(av => av.productId === p.productId);
    return a?.readiness === "READY";
  }).length;
  const basicos = selectedProducts.filter(p => {
    const a = availability.find(av => av.productId === p.productId);
    return a?.readiness === "PARTIAL";
  }).length;
  const omitidos = selectedProducts.length - completos - basicos;

  async function handleGenerate() {
    setProcessing(true);
    setError(null);
    try {
      const res = await fetch(`/api/orgs/${orgSlug}/marketing-studio/shopify/experiences/landings/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productIds: [...selectedIds],
          templateId,
          generationRules: rules,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setResult(data.summary);
        const createdIds = (data.createdDrafts ?? []).map((d: { productId: string }) => d.productId);
        onComplete(createdIds);
      } else {
        setError(data.error ?? "Error al generar borradores.");
      }
    } catch {
      setError("Error de conexion.");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", zIndex: 999 }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        width: 480, maxWidth: "90vw", maxHeight: "80vh",
        background: C.surface,
        border: `1px solid ${C.line}`,
        borderRadius: R.lg,
        boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
        zIndex: 1000,
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: `${S[4]}px ${S[5]}px`,
          borderBottom: `1px solid ${C.line}`,
        }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.semibold, color: C.ink }}>
            Generar borradores en lote
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.inkLight }}>
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: `${S[4]}px ${S[5]}px` }}>
          {/* Sofia hint */}
          <div style={{
            padding: `${S[2]}px ${S[3]}px`,
            background: `${C.blueDark}06`,
            border: `1px solid ${C.blueDark}14`,
            borderRadius: R.md,
            marginBottom: S[4],
          }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.blueDark, fontWeight: T.wt.semibold, marginBottom: S[1] }}>
              Sofia
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, lineHeight: 1.5 }}>
              {completos > 0 && `${completos} producto${completos !== 1 ? "s" : ""} listo${completos !== 1 ? "s" : ""} para borrador completo. `}
              {basicos > 0 && `${basicos} se generara${basicos !== 1 ? "n" : ""} como version basica. `}
              {omitidos > 0 && `${omitidos} se omitira${omitidos !== 1 ? "n" : ""} por falta de recursos.`}
            </div>
          </div>

          {/* Summary */}
          <div style={{ marginBottom: S[4] }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[2] }}>
              Resumen
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: S[2] }}>
              <BulkStatChip label="Seleccionados" value={selectedProducts.length} color={C.ink} />
              <BulkStatChip label="Completos" value={completos} color={C.green} />
              <BulkStatChip label="Basicos" value={basicos} color={C.amber} />
              <BulkStatChip label="Omitidos" value={omitidos} color={C.inkFaint} />
            </div>
          </div>

          {/* Template selection */}
          <div style={{ marginBottom: S[4] }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[2] }}>
              Plantilla
            </div>
            <select
              value={templateId}
              onChange={e => setTemplateId(e.target.value)}
              style={{
                width: "100%",
                padding: `${S[2]}px ${S[2]}px`,
                background: C.surfaceAlt, border: `1px solid ${C.line}`, borderRadius: R.sm,
                fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink,
                outline: "none",
              }}
            >
              {activePlantillas.map(t => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </select>
          </div>

          {/* Generation rules */}
          <div style={{ marginBottom: S[4] }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[2] }}>
              Reglas de generacion
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
              <BulkRuleToggle
                label="Mostrar precio"
                checked={rules.showPrice !== false}
                onChange={v => setRules(r => ({ ...r, showPrice: v }))}
              />
              <BulkRuleToggle
                label="Mostrar coleccion"
                checked={rules.showCollection !== false}
                onChange={v => setRules(r => ({ ...r, showCollection: v }))}
              />
              <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, flex: 1 }}>
                  Maximo de imagenes
                </span>
                <select
                  value={rules.maxImages ?? 6}
                  onChange={e => setRules(r => ({ ...r, maxImages: Number(e.target.value) }))}
                  style={{
                    padding: `${S[1]}px ${S[2]}px`,
                    background: C.surfaceAlt, border: `1px solid ${C.line}`, borderRadius: R.sm,
                    fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, outline: "none",
                  }}
                >
                  {[2, 4, 6, 8, 10].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, flex: 1 }}>
                  Calidad de imagen
                </span>
                <select
                  value={rules.imageQuality ?? "optimized"}
                  onChange={e => setRules(r => ({ ...r, imageQuality: e.target.value as GenerationRules["imageQuality"] }))}
                  style={{
                    padding: `${S[1]}px ${S[2]}px`,
                    background: C.surfaceAlt, border: `1px solid ${C.line}`, borderRadius: R.sm,
                    fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, outline: "none",
                  }}
                >
                  <option value="original">Original</option>
                  <option value="optimized">Optimizada</option>
                  <option value="compressed">Comprimida</option>
                </select>
              </div>
            </div>
          </div>

          {/* Result */}
          {result && (
            <div style={{
              padding: S[3],
              background: `${C.green}0a`,
              border: `1px solid ${C.green}22`,
              borderRadius: R.md,
              marginBottom: S[3],
            }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.green, marginBottom: S[1] }}>
                Generacion completada
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, lineHeight: 1.5 }}>
                Borradores creados: {result.created} · Omitidos: {result.skipped} · Con error: {result.failed}
              </div>
            </div>
          )}

          {error && (
            <div style={{
              padding: S[3],
              background: `${C.red}0a`,
              border: `1px solid ${C.red}22`,
              borderRadius: R.md,
              marginBottom: S[3],
              fontFamily: T.mono, fontSize: T.sz.xs, color: C.red,
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", gap: S[2], justifyContent: "flex-end",
          padding: `${S[3]}px ${S[5]}px`,
          borderTop: `1px solid ${C.line}`,
        }}>
          {result ? (
            <button
              onClick={onClose}
              style={{
                padding: `${S[2]}px ${S[4]}px`,
                background: C.blueDark, color: C.white,
                border: "none", borderRadius: R.sm,
                fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                cursor: "pointer",
              }}
            >
              Ver borradores
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                disabled={processing}
                style={{
                  padding: `${S[2]}px ${S[4]}px`,
                  background: "transparent", color: C.inkLight,
                  border: `1px solid ${C.line}`, borderRadius: R.sm,
                  fontFamily: T.mono, fontSize: T.sz.xs,
                  cursor: processing ? "not-allowed" : "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleGenerate}
                disabled={processing || (completos + basicos) === 0}
                style={{
                  padding: `${S[2]}px ${S[4]}px`,
                  background: C.blueDark, color: C.white,
                  border: "none", borderRadius: R.sm,
                  fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                  cursor: processing || (completos + basicos) === 0 ? "not-allowed" : "pointer",
                  opacity: processing || (completos + basicos) === 0 ? 0.6 : 1,
                }}
              >
                {processing ? "Generando..." : `Crear borradores (${completos + basicos})`}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function BulkStatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      padding: `${S[2]}px ${S[2]}px`,
      background: C.surfaceAlt,
      borderRadius: R.sm,
      textAlign: "center" as const,
    }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.semibold, color }}>{value}</div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{label}</div>
    </div>
  );
}

function BulkRuleToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        display: "flex", alignItems: "center", gap: S[2],
        cursor: "pointer",
      }}
    >
      {checked
        ? <CheckSquare2 size={14} strokeWidth={2} color={C.blueDark} />
        : <Square size={14} strokeWidth={1.5} color={C.inkFaint} />
      }
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>{label}</span>
    </div>
  );
}

// ── BANNERS tab ───────────────────────────────────────────────────────────────

function BannerStatusBadge({ status }: { status: ShopifyBannerStatus }) {
  const color = BANNER_STATUS_COLOR[status];
  const label = BANNER_STATUS_LABEL[status];
  return (
    <span style={{
      fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
      color, background: `${color}14`, border: `1px solid ${color}33`,
      borderRadius: R.pill, padding: `1px ${S[2]}px`, whiteSpace: "nowrap" as const,
    }}>
      {label}
    </span>
  );
}

function BannersTab({
  connected,
  orgSlug,
}: {
  connected: boolean;
  orgSlug:   string;
}) {
  const [slots, setSlots] = useState<ShopifyBannerSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerSlot, setDrawerSlot] = useState<ShopifyBannerSlot | null>(null);
  const [historyView, setHistoryView] = useState(false);

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    fetch(`/api/orgs/${orgSlug}/marketing-studio/shopify/experiences/banners`)
      .then(r => r.json())
      .then(d => { if (!cancelled && d.ok) setSlots(d.slots); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [connected, orgSlug]);

  function refreshSlots() {
    fetch(`/api/orgs/${orgSlug}/marketing-studio/shopify/experiences/banners`)
      .then(r => r.json())
      .then(d => { if (d.ok) setSlots(d.slots); })
      .catch(() => {});
  }

  if (!connected) return null;

  if (loading) {
    return (
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, padding: S[4] }}>
        Cargando ubicaciones de banner...
      </div>
    );
  }

  return (
    <div>
      <SectionHeader
        title="Banners de tienda"
        count={slots.length}
        sub="Cada ubicacion corresponde a una seccion visible en la tienda Shopify"
      />

      {/* History toggle */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: S[3] }}>
        <button
          onClick={() => setHistoryView(!historyView)}
          style={{
            display: "flex", alignItems: "center", gap: S[1],
            padding: `${S[1]}px ${S[2]}px`,
            background: historyView ? C.blueDark : "transparent",
            color: historyView ? C.white : C.inkLight,
            border: `1px solid ${historyView ? C.blueDark : C.line}`,
            borderRadius: R.sm,
            fontFamily: T.mono, fontSize: T.sz["2xs"], cursor: "pointer",
          }}
        >
          <History size={12} strokeWidth={1.6} />
          Historial
        </button>
      </div>

      {historyView ? (
        <BannerHistoryView orgSlug={orgSlug} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: S[4] }}>
          {slots.map(slot => (
            <BannerSlotCard
              key={slot.placement}
              slot={slot}
              onOpen={() => setDrawerSlot(slot)}
            />
          ))}
        </div>
      )}

      {/* Banner Drawer */}
      {drawerSlot && (
        <BannerDrawer
          slot={drawerSlot}
          orgSlug={orgSlug}
          onClose={() => { setDrawerSlot(null); refreshSlots(); }}
        />
      )}
    </div>
  );
}

function BannerSlotCard({
  slot,
  onOpen,
}: {
  slot:   ShopifyBannerSlot;
  onOpen: () => void;
}) {
  const active = slot.activeBanner;
  const draft  = slot.draftBanner;
  const hasActive = !!active;
  const hasDraft  = !!draft;

  return (
    <div style={{
      border: `1px solid ${hasActive ? `${C.blueDark}22` : C.line}`,
      borderRadius: R.lg,
      background: hasActive ? `${C.blueDark}05` : C.surface,
      overflow: "hidden",
    }}>
      {/* Slot header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: `${S[3]}px ${S[4]}px`, borderBottom: `1px solid ${C.line}`,
      }}>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
            {slot.ubicacion}
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 1 }}>
            {slot.placement}
          </div>
        </div>
        {hasActive ? (
          <BannerStatusBadge status={active.status} />
        ) : (
          <div style={{
            display: "flex", alignItems: "center", gap: S[1],
            fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
          }}>
            <XCircle size={13} strokeWidth={2} color={C.inkFaint} />
            Vacio
          </div>
        )}
      </div>

      {/* Slot body */}
      <div style={{ padding: `${S[3]}px ${S[4]}px`, minHeight: 60 }}>
        {hasActive ? (
          <div>
            {active.asset?.thumbnailUrl && (
              <div style={{
                width: "100%", height: 80, borderRadius: R.sm, marginBottom: S[2],
                background: `url(${active.asset.thumbnailUrl}) center/cover no-repeat`,
                border: `1px solid ${C.line}`,
              }} />
            )}
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, marginBottom: S[1] }}>
              {active.asset?.nombre ?? active.titulo ?? "Sin nombre"}
            </div>
            {active.titulo && (
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>
                {active.titulo}
              </div>
            )}
            {slot.lastPublishedAt && (
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: S[1] }}>
                Publicado: {new Date(slot.lastPublishedAt).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
              </div>
            )}
            {active.inicioAt && active.status === "programado" && (
              <div style={{ display: "flex", alignItems: "center", gap: S[1], marginTop: S[1] }}>
                <Calendar size={11} color={C.brand} strokeWidth={2} />
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.brand }}>
                  Programado: {new Date(active.inicioAt).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
                </span>
              </div>
            )}
          </div>
        ) : hasDraft ? (
          <div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, marginBottom: S[1] }}>
              {draft.asset?.nombre ?? "Borrador sin asset"}
            </div>
            <BannerStatusBadge status={draft.status} />
          </div>
        ) : (
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, lineHeight: 1.5 }}>
            Sin banner asignado. Selecciona un recurso aprobado de Biblioteca.
          </div>
        )}
      </div>

      {/* Draft indicator */}
      {hasDraft && hasActive && (
        <div style={{
          padding: `${S[1]}px ${S[4]}px`,
          background: `${C.amber}10`, borderTop: `1px solid ${C.amber}22`,
          fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amber,
          display: "flex", alignItems: "center", gap: S[1],
        }}>
          <FileText size={11} strokeWidth={2} />
          Borrador pendiente: {BANNER_STATUS_LABEL[draft.status]}
        </div>
      )}

      {/* Slot actions */}
      <div style={{
        display: "flex", gap: S[2],
        padding: `${S[2]}px ${S[4]}px ${S[3]}px`,
        borderTop: `1px solid ${C.line}`,
      }}>
        <button
          onClick={onOpen}
          style={{
            flex: 1, padding: `${S[1]}px ${S[2]}px`,
            background: C.blueDark, color: C.white,
            border: "none", borderRadius: R.sm,
            fontFamily: T.mono, fontSize: T.sz.xs,
            fontWeight: T.wt.semibold, cursor: "pointer",
          }}
        >
          {hasActive ? "Gestionar" : hasDraft ? "Continuar borrador" : "Asignar banner"}
        </button>
      </div>
    </div>
  );
}

// ── Banner history view ──────────────────────────────────────────────────────

function BannerHistoryView({ orgSlug }: { orgSlug: string }) {
  const [history, setHistory] = useState<ShopifyBannerHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/orgs/${orgSlug}/marketing-studio/shopify/experiences/banners`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "history", limit: 50 }),
    })
      .then(r => r.json())
      .then(d => { if (!cancelled && d.ok) setHistory(d.history); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orgSlug]);

  if (loading) {
    return <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>Cargando historial...</div>;
  }

  if (history.length === 0) {
    return (
      <EmptyState
        icon={<History size={32} strokeWidth={1.5} />}
        title="Sin historial de banners"
        sub="Las acciones sobre banners aparecerán aquí."
      />
    );
  }

  return (
    <div className="ag-op-table">
      {/* Header */}
      <div className="ag-op-row" style={{
        display: "grid", gridTemplateColumns: "140px 120px 1fr 100px 80px",
        padding: `${S[2]}px ${S[3]}px`, borderBottom: `1px solid ${C.line}`,
        fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.inkFaint,
      }}>
        <span>Fecha</span>
        <span>Accion</span>
        <span>Ubicacion / Asset</span>
        <span>Usuario</span>
        <span>Estado</span>
      </div>
      {history.map(h => (
        <div key={h.id} className="ag-op-row" style={{
          display: "grid", gridTemplateColumns: "140px 120px 1fr 100px 80px",
          padding: `${S[2]}px ${S[3]}px`, borderBottom: `1px solid ${C.line}`,
          fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid,
          alignItems: "center",
        }}>
          <span>{new Date(h.fecha).toLocaleDateString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
          <span style={{ textTransform: "capitalize" }}>{h.action.replace(/_/g, " ")}</span>
          <div>
            <div>{h.ubicacion}</div>
            {h.assetNombre && <div style={{ color: C.inkFaint }}>{h.assetNombre}</div>}
          </div>
          <span>{h.usuario}</span>
          <span style={{ color: h.resultado === "ok" ? C.green : C.red }}>
            {h.resultado === "ok" ? "OK" : h.error ?? "Error"}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Asset selector from Biblioteca (API-driven) ─────────────────────────────

const ASSET_TYPE_LABELS: Record<string, string> = {
  banner: "Banner", hero: "Hero", lifestyle_photo: "Lifestyle",
  short_video: "Video corto", product_photo: "Foto producto",
};

function BibliotecaAssetSelector({
  orgSlug,
  onSelect,
  onCancel,
}: {
  orgSlug:  string;
  onSelect: (asset: ShopifyBannerAsset) => void;
  onCancel: () => void;
}) {
  const [assets, setAssets] = useState<ShopifyBannerAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("todos");

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    params.set("assetTypes", "banner,hero,lifestyle_photo,short_video,product_photo");
    params.set("limit", "50");
    if (searchTerm) params.set("search", searchTerm);
    if (filterType !== "todos") params.set("assetTypes", filterType);

    fetch(`/api/orgs/${orgSlug}/marketing-studio/biblioteca/assets?${params}`)
      .then(r => r.json())
      .then(d => { if (!cancelled && d.ok) setAssets(d.assets ?? []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orgSlug, searchTerm, filterType]);

  const types = ["todos", "banner", "hero", "lifestyle_photo", "short_video", "product_photo"];

  return (
    <div style={{
      border: `1px solid ${C.blueDark}33`, borderRadius: R.lg,
      background: C.surface, padding: S[4],
    }}>
      <div style={{
        fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
        color: C.ink, marginBottom: S[3],
      }}>
        Seleccionar asset aprobado de Biblioteca
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: S[2], marginBottom: S[3], flexWrap: "wrap" as const }}>
        <div style={{
          display: "flex", alignItems: "center", gap: S[1],
          border: `1px solid ${C.line}`, borderRadius: R.sm,
          padding: `${S[1]}px ${S[2]}px`, flex: 1, minWidth: 180,
        }}>
          <Search size={13} color={C.inkFaint} strokeWidth={1.6} />
          <input
            type="text"
            placeholder="Buscar por nombre, referencia, coleccion..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              border: "none", outline: "none", background: "transparent",
              fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.ink,
              width: "100%",
            }}
          />
        </div>
        {types.map(t => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            style={{
              padding: `${S[1]}px ${S[2]}px`,
              background: filterType === t ? C.blueDark : "transparent",
              color: filterType === t ? C.white : C.inkLight,
              border: `1px solid ${filterType === t ? C.blueDark : C.line}`,
              borderRadius: R.pill,
              fontFamily: T.mono, fontSize: T.sz["2xs"], cursor: "pointer",
            }}
          >
            {t === "todos" ? "Todos" : ASSET_TYPE_LABELS[t] ?? t}
          </button>
        ))}
      </div>

      {/* Asset list */}
      {loading ? (
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, textAlign: "center" as const, padding: S[4] }}>
          Cargando assets aprobados...
        </div>
      ) : assets.length === 0 ? (
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, textAlign: "center" as const, padding: S[4] }}>
          Sin assets aprobados que coincidan.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2], maxHeight: 240, overflowY: "auto" as const }}>
          {assets.map(asset => (
            <button
              key={asset.assetId}
              onClick={() => onSelect(asset)}
              style={{
                display: "flex", alignItems: "center", gap: S[3],
                padding: `${S[2]}px ${S[3]}px`,
                border: `1px solid ${C.line}`, borderRadius: R.sm,
                background: C.surface, cursor: "pointer",
                textAlign: "left" as const,
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: R.sm,
                background: asset.thumbnailUrl
                  ? `url(${asset.thumbnailUrl}) center/cover no-repeat`
                  : `${C.blueDark}10`,
                display: "flex", alignItems: "center", justifyContent: "center",
                border: `1px solid ${C.line}`, flexShrink: 0,
              }}>
                {!asset.thumbnailUrl && <ImageIcon size={16} color={C.inkFaint} strokeWidth={1.5} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, fontWeight: T.wt.medium }}>
                  {asset.nombre}
                </div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                  {ASSET_TYPE_LABELS[asset.assetType] ?? asset.assetType}
                  {asset.referencia ? ` · ${asset.referencia}` : ""}
                  {asset.coleccion ? ` · ${asset.coleccion}` : ""}
                  {asset.aprobadoAt ? ` · ${new Date(asset.aprobadoAt).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}` : ""}
                </div>
              </div>
              <CheckCircle size={13} color={C.green} strokeWidth={2} />
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: S[3] }}>
        <button
          onClick={onCancel}
          style={{
            padding: `${S[1]}px ${S[3]}px`,
            background: "transparent", color: C.inkLight,
            border: `1px solid ${C.line}`, borderRadius: R.sm,
            fontFamily: T.mono, fontSize: T.sz.xs, cursor: "pointer",
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ── CTA destination selector ─────────────────────────────────────────────────

type CtaDestType = "url_manual" | "coleccion" | "producto" | "pagina" | "landing";

const CTA_DEST_LABEL: Record<CtaDestType, string> = {
  url_manual: "URL manual",
  coleccion:  "Coleccion Shopify",
  producto:   "Producto Shopify",
  pagina:     "Pagina Shopify",
  landing:    "Landing publicada",
};

function CtaSelector({
  ctaUrl, onChange, disabled,
}: {
  ctaUrl: string; onChange: (url: string) => void; disabled?: boolean;
}) {
  const [destType, setDestType] = useState<CtaDestType>(() => {
    if (!ctaUrl) return "url_manual";
    if (ctaUrl.startsWith("/collections/")) return "coleccion";
    if (ctaUrl.startsWith("/products/")) return "producto";
    if (ctaUrl.startsWith("/pages/")) return "pagina";
    return "url_manual";
  });
  const [ctaError, setCtaError] = useState<string | null>(null);

  function handleUrlChange(url: string) {
    onChange(url);
    // Client-side validation
    if (!url) { setCtaError(null); return; }
    const lower = url.trim().toLowerCase();
    if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("vbscript:")) {
      setCtaError("Protocolo no permitido.");
    } else if (url.startsWith("http://")) {
      setCtaError("Solo se permiten URLs con HTTPS.");
    } else {
      setCtaError(null);
    }
  }

  function handleDestChange(dest: CtaDestType) {
    setDestType(dest);
    setCtaError(null);
    switch (dest) {
      case "coleccion":  onChange("/collections/"); break;
      case "producto":   onChange("/products/"); break;
      case "pagina":     onChange("/pages/"); break;
      case "landing":    onChange("/pages/landing-"); break;
      default:           onChange(""); break;
    }
  }

  return (
    <div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginBottom: S[1] }}>
        Destino del CTA
      </div>
      <div style={{ display: "flex", gap: S[1], marginBottom: S[2], flexWrap: "wrap" as const }}>
        {(Object.keys(CTA_DEST_LABEL) as CtaDestType[]).map(d => (
          <button
            key={d}
            onClick={() => !disabled && handleDestChange(d)}
            disabled={disabled}
            style={{
              padding: `1px ${S[2]}px`,
              background: destType === d ? C.blueDark : "transparent",
              color: destType === d ? C.white : C.inkLight,
              border: `1px solid ${destType === d ? C.blueDark : C.line}`,
              borderRadius: R.pill,
              fontFamily: T.mono, fontSize: T.sz["2xs"], cursor: disabled ? "default" : "pointer",
            }}
          >
            {CTA_DEST_LABEL[d]}
          </button>
        ))}
      </div>
      <input
        type="text"
        value={ctaUrl}
        onChange={e => handleUrlChange(e.target.value)}
        disabled={disabled}
        placeholder={destType === "url_manual" ? "https://tienda.com/..." : `/${destType === "coleccion" ? "collections" : destType === "producto" ? "products" : "pages"}/nombre`}
        style={{
          width: "100%", padding: `${S[1]}px ${S[2]}px`,
          border: `1px solid ${ctaError ? C.red : C.line}`, borderRadius: R.sm,
          fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink,
          background: disabled ? `${C.line}33` : C.surface,
          outline: "none",
        }}
      />
      {ctaError && (
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red, marginTop: S[1] }}>
          {ctaError}
        </div>
      )}
    </div>
  );
}

// ── Banner preview ───────────────────────────────────────────────────────────

const PREVIEW_DIMENSIONS: Record<string, { height: number; label: string }> = {
  home:            { height: 200, label: "Banner hero — ancho completo" },
  home_secundario: { height: 140, label: "Banner secundario — mediano" },
  coleccion:       { height: 120, label: "Cabecera de coleccion" },
  categoria:       { height: 120, label: "Cabecera de categoria" },
  promocion:       { height: 56,  label: "Franja promocional" },
  temporada:       { height: 160, label: "Banner de temporada" },
  footer:          { height: 80,  label: "Bloque footer" },
};

function BannerPreview({
  placement, asset, titulo, subtitulo, ctaTexto,
}: {
  placement: string; asset: ShopifyBannerAsset | null;
  titulo: string; subtitulo: string; ctaTexto: string;
}) {
  const dim = PREVIEW_DIMENSIONS[placement] ?? { height: 140, label: "Vista previa" };
  const isNarrow = placement === "promocion";

  return (
    <div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginBottom: S[2] }}>
        VISTA PREVIA — {dim.label}
      </div>
      <div style={{
        width: "100%", height: dim.height,
        borderRadius: R.sm, overflow: "hidden",
        border: `1px solid ${C.line}`,
        background: asset?.thumbnailUrl
          ? `url(${asset.thumbnailUrl}) center/cover no-repeat`
          : `linear-gradient(135deg, ${C.blueDark}15, ${C.blueDark}05)`,
        display: "flex", flexDirection: "column" as const,
        alignItems: isNarrow ? "center" : "flex-start",
        justifyContent: isNarrow ? "center" : "flex-end",
        padding: isNarrow ? `${S[1]}px ${S[3]}px` : `${S[3]}px ${S[4]}px`,
        position: "relative" as const,
      }}>
        {/* Overlay for readability */}
        {asset?.thumbnailUrl && (
          <div style={{
            position: "absolute" as const, inset: 0,
            background: "linear-gradient(transparent 40%, rgba(0,0,0,0.5))",
          }} />
        )}
        <div style={{ position: "relative" as const, zIndex: 1, maxWidth: "80%" }}>
          {titulo && (
            <div style={{
              fontFamily: T.mono, fontWeight: T.wt.semibold, color: C.white,
              fontSize: isNarrow ? T.sz.xs : T.sz.sm,
              textShadow: "0 1px 3px rgba(0,0,0,0.5)",
              lineHeight: 1.3,
            }}>
              {titulo}
            </div>
          )}
          {subtitulo && !isNarrow && (
            <div style={{
              fontFamily: T.mono, fontSize: T.sz["2xs"], color: "rgba(255,255,255,0.85)",
              textShadow: "0 1px 2px rgba(0,0,0,0.4)",
              marginTop: 2,
            }}>
              {subtitulo}
            </div>
          )}
          {ctaTexto && (
            <div style={{
              display: "inline-block",
              marginTop: isNarrow ? 0 : S[2],
              padding: `${S[1]}px ${S[3]}px`,
              background: C.white, color: C.ink,
              borderRadius: R.sm,
              fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
            }}>
              {ctaTexto}
            </div>
          )}
        </div>
        {!asset && !titulo && !subtitulo && !ctaTexto && (
          <div style={{
            position: "absolute" as const, inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
              Selecciona un asset para ver la vista previa
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Visual scheduling state ──────────────────────────────────────────────────

function deriveScheduleLabel(draft: ShopifyBannerDraft | null): { label: string; color: string } | null {
  if (!draft) return null;
  if (draft.status === "publicado") {
    if (draft.finAt && new Date(draft.finAt) < new Date()) {
      return { label: "Expirado", color: C.red };
    }
    return { label: "Publicado ahora", color: C.green };
  }
  if (draft.status === "programado") {
    if (draft.inicioAt && new Date(draft.inicioAt) > new Date()) {
      return { label: "Programado para publicar", color: C.brand };
    }
    if (draft.finAt && new Date(draft.finAt) < new Date()) {
      return { label: "Expirado — reprogramar", color: C.red };
    }
    return { label: "Programado para finalizar", color: C.amber };
  }
  if (draft.status === "pausado") return { label: "Pausado", color: C.amber };
  return null;
}

// ── Banner drawer ────────────────────────────────────────────────────────────

interface BannerUsageMetricsData {
  timesPublished: number;
  lastPublishedAt: string | null;
  lastEditedAt: string | null;
  lastEditedBy: string | null;
  version: number;
}

interface BannerSyncStatusData {
  synced: boolean;
  sectionId: string;
  note: string;
}

function BannerDrawer({
  slot,
  orgSlug,
  onClose,
}: {
  slot:    ShopifyBannerSlot;
  orgSlug: string;
  onClose: () => void;
}) {
  const banner = slot.draftBanner ?? slot.activeBanner;

  const [draft, setDraft] = useState<ShopifyBannerDraft | null>(banner);
  const [showSelector, setShowSelector] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"editar" | "preview">("editar");
  const [titulo, setTitulo] = useState(banner?.titulo ?? "");
  const [subtitulo, setSubtitulo] = useState(banner?.subtitulo ?? "");
  const [ctaTexto, setCtaTexto] = useState(banner?.ctaTexto ?? "");
  const [ctaUrl, setCtaUrl] = useState(banner?.ctaUrl ?? "");
  const [inicioAt, setInicioAt] = useState(banner?.inicioAt ?? "");
  const [finAt, setFinAt] = useState(banner?.finAt ?? "");
  const [selectedAsset, setSelectedAsset] = useState<ShopifyBannerAsset | null>(banner?.asset ?? null);
  const [saving, setSaving] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [hints, setHints] = useState<BannerSofiaHint[]>([]);
  const [drawerHistory, setDrawerHistory] = useState<ShopifyBannerHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [metrics, setMetrics] = useState<BannerUsageMetricsData | null>(null);
  const [syncStatus, setSyncStatus] = useState<BannerSyncStatusData | null>(null);

  useEffect(() => {
    if (!draft) return;
    let cancelled = false;
    fetch(`/api/orgs/${orgSlug}/marketing-studio/shopify/experiences/banners`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get_draft", draftId: draft.id }),
    })
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        if (d.ok) {
          setHints(d.hints ?? []);
          if (d.metrics) setMetrics(d.metrics);
          if (d.syncStatus) setSyncStatus(d.syncStatus);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [draft, orgSlug]);

  function loadHistory() {
    if (!draft) return;
    fetch(`/api/orgs/${orgSlug}/marketing-studio/shopify/experiences/banners`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "history", bannerId: draft.id, limit: 20 }),
    })
      .then(r => r.json())
      .then(d => { if (d.ok) { setDrawerHistory(d.history); setShowHistory(true); } })
      .catch(() => {});
  }

  async function apiAction(action: string, extra: Record<string, unknown> = {}) {
    setSaving(true);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/orgs/${orgSlug}/marketing-studio/shopify/experiences/banners`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, draftId: draft?.id, ...extra }),
      });
      const d = await res.json();
      if (d.ok && d.draft) {
        setDraft(d.draft);
        setActionMsg("Accion completada.");
      } else {
        setActionMsg(d.error ?? "Error.");
      }
    } catch {
      setActionMsg("Error de conexion.");
    }
    setSaving(false);
  }

  async function handleCreateDraft() {
    if (!selectedAsset) { setActionMsg("Selecciona un asset aprobado."); return; }
    setSaving(true);
    setActionMsg(null);
    const input: CreateBannerDraftInput = {
      placement: slot.placement,
      asset: selectedAsset,
      titulo: titulo || null,
      subtitulo: subtitulo || null,
      ctaTexto: ctaTexto || null,
      ctaUrl: ctaUrl || null,
      inicioAt: inicioAt || null,
      finAt: finAt || null,
    };
    try {
      const res = await fetch(`/api/orgs/${orgSlug}/marketing-studio/shopify/experiences/banners`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", input }),
      });
      const d = await res.json();
      if (d.ok && d.draft) {
        setDraft(d.draft);
        setActionMsg("Borrador creado.");
      } else {
        setActionMsg(d.error ?? "Error al crear borrador.");
      }
    } catch {
      setActionMsg("Error de conexion.");
    }
    setSaving(false);
  }

  async function handleSaveDraft() {
    if (!draft) return;
    const input: UpdateBannerDraftInput = {
      ...(selectedAsset && { asset: selectedAsset }),
      titulo: titulo || null,
      subtitulo: subtitulo || null,
      ctaTexto: ctaTexto || null,
      ctaUrl: ctaUrl || null,
      inicioAt: inicioAt || null,
      finAt: finAt || null,
    };
    await apiAction("update", { input });
  }

  async function handleSchedule() {
    if (!inicioAt) { setActionMsg("Define una fecha de inicio."); return; }
    await apiAction("schedule", { inicioAt, finAt: finAt || null });
  }

  const isEditable = !draft || draft.status === "borrador" || draft.status === "en_revision";
  const status = draft?.status ?? "sin_banner";
  const scheduleState = deriveScheduleLabel(draft);

  return (
    <div style={{
      position: "fixed" as const, top: 0, right: 0, bottom: 0,
      width: 480, background: C.surface,
      borderLeft: `1px solid ${C.line}`,
      boxShadow: "-4px 0 24px rgba(0,0,0,0.08)",
      zIndex: 100, display: "flex", flexDirection: "column" as const,
      overflowY: "auto" as const,
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: `${S[4]}px ${S[4]}px ${S[3]}px`,
        borderBottom: `1px solid ${C.line}`,
      }}>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
            {slot.ubicacion}
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 2 }}>
            {slot.placement} · {draft ? `v${draft.version}` : "Nuevo"}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
          <BannerStatusBadge status={status} />
          {scheduleState && (
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: scheduleState.color }}>
              {scheduleState.label}
            </span>
          )}
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
            <X size={18} color={C.inkLight} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Mode toggle */}
      <div style={{
        display: "flex", gap: S[1], padding: `${S[2]}px ${S[4]}px`,
        borderBottom: `1px solid ${C.line}`,
      }}>
        {(["editar", "preview"] as const).map(mode => (
          <button
            key={mode}
            onClick={() => setDrawerMode(mode)}
            style={{
              padding: `${S[1]}px ${S[3]}px`,
              background: drawerMode === mode ? C.blueDark : "transparent",
              color: drawerMode === mode ? C.white : C.inkLight,
              border: `1px solid ${drawerMode === mode ? C.blueDark : C.line}`,
              borderRadius: R.sm,
              fontFamily: T.mono, fontSize: T.sz["2xs"], cursor: "pointer",
              display: "flex", alignItems: "center", gap: S[1],
            }}
          >
            {mode === "editar" ? <FileText size={12} strokeWidth={1.6} /> : <Eye size={12} strokeWidth={1.6} />}
            {mode === "editar" ? "Editar" : "Vista previa"}
          </button>
        ))}
      </div>

      {/* Sofia hints */}
      {hints.length > 0 && (
        <div style={{ padding: `${S[2]}px ${S[4]}px`, borderBottom: `1px solid ${C.line}` }}>
          {hints.map((h, i) => {
            const hintColor = h.type === "success" ? C.green : h.type === "warning" ? C.amber : h.type === "error" ? C.red : C.blueDark;
            return (
              <div key={i} style={{
                display: "flex", alignItems: "flex-start", gap: S[2],
                padding: `${S[1]}px 0`,
                fontFamily: T.mono, fontSize: T.sz["2xs"], color: hintColor,
              }}>
                <AlertCircle size={12} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{h.message}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Sync status warning */}
      {syncStatus && !syncStatus.synced && draft && (draft.status === "publicado" || draft.status === "programado") && (
        <div style={{
          padding: `${S[2]}px ${S[4]}px`, borderBottom: `1px solid ${C.line}`,
          background: `${C.amber}08`,
          fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amber,
          display: "flex", alignItems: "center", gap: S[2],
        }}>
          <AlertCircle size={12} strokeWidth={2} style={{ flexShrink: 0 }} />
          Pendiente de integracion con el theme de Shopify
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, padding: S[4], display: "flex", flexDirection: "column" as const, gap: S[4] }}>
        {drawerMode === "preview" ? (
          <BannerPreview
            placement={slot.placement}
            asset={selectedAsset}
            titulo={titulo}
            subtitulo={subtitulo}
            ctaTexto={ctaTexto}
          />
        ) : (
          <>
            {/* Current asset */}
            <div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.inkFaint, marginBottom: S[2] }}>
                ASSET SELECCIONADO
              </div>
              {selectedAsset ? (
                <div style={{
                  display: "flex", alignItems: "center", gap: S[3],
                  padding: S[3], border: `1px solid ${C.blueDark}22`,
                  borderRadius: R.sm, background: `${C.blueDark}05`,
                }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: R.sm,
                    background: selectedAsset.thumbnailUrl
                      ? `url(${selectedAsset.thumbnailUrl}) center/cover no-repeat`
                      : `${C.blueDark}10`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    border: `1px solid ${C.line}`, flexShrink: 0,
                  }}>
                    {!selectedAsset.thumbnailUrl && <ImageIcon size={20} color={C.inkFaint} strokeWidth={1.5} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, fontWeight: T.wt.medium }}>
                      {selectedAsset.nombre}
                    </div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                      {ASSET_TYPE_LABELS[selectedAsset.assetType] ?? selectedAsset.assetType}
                      {selectedAsset.aprobadoAt ? ` · Aprobado ${new Date(selectedAsset.aprobadoAt).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}` : ""}
                    </div>
                  </div>
                  {isEditable && (
                    <button
                      onClick={() => setShowSelector(true)}
                      style={{
                        padding: `${S[1]}px ${S[2]}px`,
                        background: "transparent", color: C.blueDark,
                        border: `1px solid ${C.blueDark}44`, borderRadius: R.sm,
                        fontFamily: T.mono, fontSize: T.sz["2xs"], cursor: "pointer",
                      }}
                    >
                      Cambiar
                    </button>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setShowSelector(true)}
                  style={{
                    width: "100%", padding: S[3],
                    display: "flex", alignItems: "center", justifyContent: "center", gap: S[2],
                    border: `2px dashed ${C.line}`, borderRadius: R.sm,
                    background: "transparent", cursor: "pointer",
                    fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight,
                  }}
                >
                  <Plus size={14} strokeWidth={2} />
                  Seleccionar asset de Biblioteca
                </button>
              )}
            </div>

            {/* Asset selector */}
            {showSelector && (
              <BibliotecaAssetSelector
                orgSlug={orgSlug}
                onSelect={asset => { setSelectedAsset(asset); setShowSelector(false); }}
                onCancel={() => setShowSelector(false)}
              />
            )}

            {/* Editable fields */}
            <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>
              <DrawerField label="Titulo (opcional)" value={titulo} onChange={setTitulo} disabled={!isEditable} />
              <DrawerField label="Subtitulo (opcional)" value={subtitulo} onChange={setSubtitulo} disabled={!isEditable} />
              <DrawerField label="Texto del CTA" value={ctaTexto} onChange={setCtaTexto} disabled={!isEditable} placeholder="Ej: Comprar ahora" />
              <CtaSelector ctaUrl={ctaUrl} onChange={setCtaUrl} disabled={!isEditable} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
                <DrawerField label="Fecha inicio" value={inicioAt} onChange={setInicioAt} disabled={!isEditable} type="date" />
                <DrawerField label="Fecha fin" value={finAt} onChange={setFinAt} disabled={!isEditable} type="date" />
              </div>
            </div>

            {/* Usage metrics */}
            {metrics && (
              <div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.inkFaint, marginBottom: S[2] }}>
                  USO
                </div>
                <div style={{
                  display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2],
                  padding: S[3], border: `1px solid ${C.line}`, borderRadius: R.sm,
                }}>
                  <div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Publicaciones</div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>{metrics.timesPublished}</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Version</div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>v{metrics.version}</div>
                  </div>
                  {metrics.lastPublishedAt && (
                    <div>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Ultima publicacion</div>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
                        {new Date(metrics.lastPublishedAt).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
                      </div>
                    </div>
                  )}
                  {metrics.lastEditedBy && (
                    <div>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Ultimo editor</div>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>{metrics.lastEditedBy}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Action message */}
        {actionMsg && (
          <div style={{
            fontFamily: T.mono, fontSize: T.sz["2xs"],
            color: actionMsg.includes("Error") || actionMsg.includes("Selecciona") || actionMsg.includes("Define") ? C.red : C.green,
            padding: `${S[1]}px 0`,
          }}>
            {actionMsg}
          </div>
        )}
      </div>

      {/* Actions footer */}
      <div style={{
        padding: `${S[3]}px ${S[4]}px`,
        borderTop: `1px solid ${C.line}`,
        display: "flex", flexDirection: "column" as const, gap: S[2],
      }}>
        {/* Primary actions by status */}
        <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" as const }}>
          {!draft && (
            <BannerActionBtn label="Crear borrador" onClick={handleCreateDraft} disabled={saving || !selectedAsset} primary />
          )}
          {status === "borrador" && (
            <>
              <BannerActionBtn label="Guardar" onClick={handleSaveDraft} disabled={saving} icon={<Save size={13} strokeWidth={2} />} />
              <BannerActionBtn label="Enviar a revision" onClick={() => apiAction("submit_review")} disabled={saving} primary />
            </>
          )}
          {status === "en_revision" && (
            <>
              <BannerActionBtn label="Aprobar" onClick={() => apiAction("approve")} disabled={saving} primary />
              <BannerActionBtn label="Rechazar" onClick={() => apiAction("reject")} disabled={saving} variant="danger" />
            </>
          )}
          {status === "aprobado" && (
            <>
              <BannerActionBtn label="Publicar" onClick={() => apiAction("publish")} disabled={saving} primary icon={<Upload size={13} strokeWidth={2} />} />
              <BannerActionBtn label="Programar" onClick={handleSchedule} disabled={saving} icon={<Calendar size={13} strokeWidth={2} />} />
            </>
          )}
          {status === "programado" && (
            <>
              <BannerActionBtn label="Publicar ahora" onClick={() => apiAction("publish")} disabled={saving} primary />
              <BannerActionBtn label="Pausar" onClick={() => apiAction("pause")} disabled={saving} icon={<Pause size={13} strokeWidth={2} />} />
            </>
          )}
          {status === "publicado" && (
            <BannerActionBtn label="Pausar" onClick={() => apiAction("pause")} disabled={saving} icon={<Pause size={13} strokeWidth={2} />} />
          )}
          {status === "pausado" && (
            <>
              <BannerActionBtn label="Reactivar" onClick={() => apiAction("publish")} disabled={saving} primary icon={<Play size={13} strokeWidth={2} />} />
              <BannerActionBtn label="Archivar" onClick={() => apiAction("archive")} disabled={saving} icon={<Archive size={13} strokeWidth={2} />} />
            </>
          )}
        </div>

        {/* Secondary actions */}
        {draft && (
          <div style={{ display: "flex", gap: S[2] }}>
            {(status === "borrador" || status === "en_revision" || status === "aprobado" || status === "programado" || status === "pausado") && (
              <BannerActionBtn label="Archivar" onClick={() => apiAction("archive")} disabled={saving} icon={<Archive size={13} strokeWidth={2} />} />
            )}
            <BannerActionBtn label="Historial" onClick={loadHistory} disabled={saving} icon={<History size={13} strokeWidth={2} />} />
          </div>
        )}

        {/* Inline history */}
        {showHistory && drawerHistory.length > 0 && (
          <div style={{
            maxHeight: 160, overflowY: "auto" as const,
            border: `1px solid ${C.line}`, borderRadius: R.sm, marginTop: S[2],
          }}>
            {drawerHistory.map(h => (
              <div key={h.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: `${S[1]}px ${S[2]}px`, borderBottom: `1px solid ${C.line}`,
                fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid,
              }}>
                <span>{h.action.replace(/_/g, " ")}</span>
                <span style={{ color: C.inkFaint }}>
                  {new Date(h.fecha).toLocaleDateString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Drawer helpers ───────────────────────────────────────────────────────────

function DrawerField({
  label, value, onChange, disabled, placeholder, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void;
  disabled?: boolean; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginBottom: S[1] }}>
        {label}
      </div>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder ?? ""}
        style={{
          width: "100%", padding: `${S[1]}px ${S[2]}px`,
          border: `1px solid ${C.line}`, borderRadius: R.sm,
          fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink,
          background: disabled ? `${C.line}33` : C.surface,
          outline: "none",
        }}
      />
    </div>
  );
}

function BannerActionBtn({
  label, onClick, disabled, primary, variant, icon,
}: {
  label: string; onClick: () => void; disabled?: boolean;
  primary?: boolean; variant?: "danger"; icon?: React.ReactNode;
}) {
  const bg = variant === "danger" ? C.red : primary ? C.blueDark : "transparent";
  const fg = variant === "danger" || primary ? C.white : C.inkLight;
  const border = variant === "danger" || primary ? "none" : `1px solid ${C.line}`;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex", alignItems: "center", gap: S[1],
        padding: `${S[1]}px ${S[3]}px`,
        background: bg, color: fg, border,
        borderRadius: R.sm,
        fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

// ── PLANTILLAS tab ────────────────────────────────────────────────────────────

function PlantillasTab({ plantillas }: { plantillas: ExperienceTemplate[] }) {
  const [filterDestino, setFilterDestino] = useState<string>("todos");

  const destinos = [...new Set(plantillas.map(p => p.destino))];

  const filtered = filterDestino === "todos"
    ? plantillas
    : plantillas.filter(p => p.destino === filterDestino);

  return (
    <div>
      {/* Filter */}
      <div style={{ display: "flex", gap: S[2], marginBottom: S[4], flexWrap: "wrap" as const }}>
        <button
          onClick={() => setFilterDestino("todos")}
          style={{
            padding: `${S[1]}px ${S[3]}px`,
            background: filterDestino === "todos" ? C.blueDark : "transparent",
            color: filterDestino === "todos" ? C.white : C.inkLight,
            border: `1px solid ${filterDestino === "todos" ? C.blueDark : C.line}`,
            borderRadius: R.pill, fontFamily: T.mono, fontSize: T.sz.xs,
            cursor: "pointer", fontWeight: filterDestino === "todos" ? T.wt.semibold : T.wt.normal,
          }}
        >
          Todas
        </button>
        {destinos.map(d => (
          <button
            key={d}
            onClick={() => setFilterDestino(d)}
            style={{
              padding: `${S[1]}px ${S[3]}px`,
              background: filterDestino === d ? C.blueDark : "transparent",
              color: filterDestino === d ? C.white : C.inkLight,
              border: `1px solid ${filterDestino === d ? C.blueDark : C.line}`,
              borderRadius: R.pill, fontFamily: T.mono, fontSize: T.sz.xs,
              cursor: "pointer", fontWeight: filterDestino === d ? T.wt.semibold : T.wt.normal,
            }}
          >
            {TEMPLATE_DESTINO_LABEL[d as ExperienceTemplate["destino"]]}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: S[4] }}>
        {filtered.map(t => (
          <TemplateCard key={t.id} template={t} />
        ))}
      </div>
    </div>
  );
}

function TemplateCard({ template }: { template: ExperienceTemplate }) {
  const isCustom = template.etiquetas.includes("castillitos");
  return (
    <div style={{
      border: `1px solid ${isCustom ? `${C.blueDark}22` : C.line}`,
      borderRadius: R.lg,
      background: isCustom ? `${C.blueDark}05` : C.surface,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: `${S[3]}px ${S[4]}px`,
        borderBottom: `1px solid ${C.line}`,
        display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: S[2],
      }}>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
            {template.nombre}
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: 2 }}>
            {TEMPLATE_DESTINO_LABEL[template.destino]}
          </div>
        </div>
        {isCustom && (
          <span style={{
            fontFamily: T.mono, fontSize: T.sz["2xs"],
            padding: `1px ${S[2]}px`,
            background: `${C.blueDark}14`,
            border: `1px solid ${C.blueDark}22`,
            borderRadius: R.pill,
            color: C.blueDark, fontWeight: T.wt.semibold,
            whiteSpace: "nowrap" as const,
          }}>
            Castillitos
          </span>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: `${S[3]}px ${S[4]}px` }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, lineHeight: 1.5, marginBottom: S[3] }}>
          {template.descripcion}
        </div>

        {/* Required fields */}
        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: S[1], marginBottom: S[2] }}>
          {template.requiere.imagenPrincipal && <RequiredChip label="Imagen" met />}
          {template.requiere.video           && <RequiredChip label="Video" met={false} />}
          {template.requiere.precio          && <RequiredChip label="Precio" met />}
          {template.requiere.descripcion     && <RequiredChip label="Descripción" met />}
          {template.requiere.coleccion       && <RequiredChip label="Colección" met />}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: S[2] }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
            {template.tiempoEstimado}
          </span>
          {template.soportaMasiva && (
            <span style={{
              fontFamily: T.mono, fontSize: T.sz["2xs"],
              color: C.green, fontWeight: T.wt.semibold,
            }}>
              Masiva ✓
            </span>
          )}
        </div>
      </div>

      {/* Action */}
      <div style={{ padding: `${S[2]}px ${S[4]}px ${S[3]}px`, borderTop: `1px solid ${C.line}` }}>
        <button
          disabled
          style={{
            width: "100%",
            padding: `${S[2]}px`,
            background: C.blueDark, color: C.white,
            border: "none", borderRadius: R.sm,
            fontFamily: T.mono, fontSize: T.sz.xs,
            fontWeight: T.wt.semibold, cursor: "not-allowed",
            opacity: 0.6,
          }}
        >
          Usar plantilla
        </button>
      </div>
    </div>
  );
}

function RequiredChip({ label, met }: { label: string; met: boolean }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      padding: `1px ${S[2]}px`,
      background: met ? `${C.green}0a` : C.surface,
      border: `1px solid ${met ? `${C.green}22` : C.line}`,
      borderRadius: R.pill,
      fontFamily: T.mono, fontSize: T.sz["2xs"],
      color: met ? C.green : C.inkFaint,
    }}>
      {met ? "✓" : "○"} {label}
    </span>
  );
}

// ── BORRADORES tab ────────────────────────────────────────────────────────────

function BorradoresTab({
  borradores, onReview,
}: {
  borradores: ExperienceDraft[];
  onReview:   (draftId: string) => void;
}) {
  if (borradores.length === 0) {
    return (
      <EmptyState
        icon={<FileText size={32} strokeWidth={1.5} />}
        title="Sin borradores pendientes"
        sub="Los borradores de landings y banners aparecen aquí para revisión y aprobación antes de publicarse en Shopify."
      />
    );
  }

  return (
    <div>
      <SectionHeader
        title="Borradores"
        count={borradores.length}
        sub="Landings y banners preparados, pendientes de revisión o aprobación"
      />
      {/* Column headers */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 90px 110px 100px 90px 90px",
        gap: `0 ${S[2]}px`,
        padding: `${S[2]}px ${S[3]}px`,
        borderBottom: `1px solid ${C.line}`,
        fontFamily: T.mono, fontSize: T.sz.xs,
        color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.04em",
      }}>
        <span>Borrador</span>
        <span>Tipo</span>
        <span>Producto</span>
        <span>Estado</span>
        <span>Fecha</span>
        <span style={{ textAlign: "center" as const }}>Accion</span>
      </div>
      <div className="ag-op-table">
        {borradores.map(d => (
          <BorradorRow key={d.id} draft={d} onReview={onReview} />
        ))}
      </div>
    </div>
  );
}

function BorradorRow({ draft, onReview }: { draft: ExperienceDraft; onReview: (id: string) => void }) {
  const date = new Date(draft.creadoAt);
  const dateStr = date.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });

  return (
    <div className="ag-op-row" style={{
      display: "grid",
      gridTemplateColumns: "1fr 90px 110px 100px 90px 90px",
      gap: `0 ${S[2]}px`,
      padding: `${S[2]}px ${S[3]}px`,
      alignItems: "center",
    }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, fontWeight: T.wt.medium }}>
        {draft.nombre}
      </div>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
        {draft.tipo === "landing" ? "Landing" : "Banner"}
      </span>
      <span style={{
        fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
      }}>
        {draft.productNombre ?? "\u2014"}
      </span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: statusColor(draft.status) }}>
        {EXPERIENCE_STATUS_LABEL[draft.status]}
      </span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
        {dateStr}
      </span>
      <span style={{ textAlign: "center" as const }}>
        <button
          onClick={() => onReview(draft.id)}
          style={{
            padding: `${S[1]}px ${S[2]}px`,
            background: C.blueDark, color: C.white,
            border: "none", borderRadius: R.sm,
            fontFamily: T.mono, fontSize: T.sz["2xs"],
            fontWeight: T.wt.semibold, cursor: "pointer",
          }}
        >
          Revisar
        </button>
      </span>
    </div>
  );
}

// ── LANDING DRAFT REVIEW DRAWER ──────────────────────────────────────────────

const DRAFT_STATUS_COLOR: Record<LandingDraftStatus, string> = {
  borrador:    C.inkFaint,
  en_revision: C.amber,
  aprobado:    C.green,
  rechazado:   C.red,
  archivado:   C.inkFaint,
};

function getSofiaHints(status: LandingDraftStatus, hasConflict: boolean): string[] {
  if (status === "aprobado") {
    const hints = ["Este borrador esta aprobado y listo para publicar."];
    if (hasConflict) hints.push("Se detecto una landing existente para este producto.");
    return hints;
  }
  return [
    "Revisa el hero, la galeria y el CTA antes de aprobar.",
    "Cuando este aprobado, quedara listo para publicacion.",
  ];
}

function LandingDraftReviewDrawer({
  draft, orgSlug, onClose, onUpdated,
}: {
  draft:     LandingDraft;
  orgSlug:   string;
  onClose:   () => void;
  onUpdated: (d: LandingDraft) => void;
}) {
  const [blocks, setBlocks] = useState<LandingDraftBlock[]>(draft.blocks);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [statusChanging, setStatusChanging] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<string | null>(null);
  const [conflictPub, setConflictPub] = useState<ShopifyPublishedExperience | null>(null);

  async function handlePublish(mode?: "update" | "new") {
    setPublishing(true);
    setPublishResult(null);
    setConflictPub(null);
    try {
      const res = await fetch(`/api/orgs/${orgSlug}/marketing-studio/shopify/experiences/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: draft.id, mode }),
      });
      const data = await res.json();
      if (res.status === 409 && data.conflict) {
        setConflictPub(data.existing);
        return;
      }
      if (res.ok && data.ok) {
        setPublishResult("Publicado correctamente");
      } else {
        setPublishResult(data.error ?? "Error al publicar.");
      }
    } catch {
      setPublishResult("Error de conexion al publicar.");
    } finally {
      setPublishing(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`/api/orgs/${orgSlug}/marketing-studio/shopify/experiences/landings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: draft.id, blocks }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setSaveMsg("Cambios guardados");
        onUpdated(data.draft);
      } else {
        setSaveMsg(data.error ?? "Error al guardar.");
      }
    } catch {
      setSaveMsg("Error de conexion.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(newStatus: LandingDraftStatus) {
    setStatusChanging(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`/api/orgs/${orgSlug}/marketing-studio/shopify/experiences/landings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: draft.id, status: newStatus }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        onUpdated(data.draft);
        if (newStatus === "archivado") onClose();
      } else {
        setSaveMsg(data.error ?? "Error al cambiar estado.");
      }
    } catch {
      setSaveMsg("Error de conexion.");
    } finally {
      setStatusChanging(false);
    }
  }

  function updateBlockContent(idx: number, field: string, value: string) {
    setBlocks(prev => prev.map((b, i) =>
      i === idx ? { ...b, content: { ...b.content, [field]: value } } : b,
    ));
    setSaveMsg(null);
  }

  function updateBlockItem(blockIdx: number, itemIdx: number, value: string) {
    setBlocks(prev => prev.map((b, i) => {
      if (i !== blockIdx || !b.content.items) return b;
      const items = [...b.content.items];
      items[itemIdx] = value;
      return { ...b, content: { ...b.content, items } };
    }));
    setSaveMsg(null);
  }

  const st = draft.status;

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0,
      width: 520, maxWidth: "100vw",
      background: C.surface,
      borderLeft: `1px solid ${C.line}`,
      boxShadow: "-4px 0 24px rgba(0,0,0,0.08)",
      zIndex: 1000,
      display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: `${S[4]}px ${S[5]}px`,
        borderBottom: `1px solid ${C.line}`,
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.semibold, color: C.ink }}>
            Revisar borrador
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: 2 }}>
            {draft.productName} {draft.sku ? `· ${draft.sku}` : ""}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", color: C.inkLight, padding: S[1] }}
        >
          <X size={18} strokeWidth={2} />
        </button>
      </div>

      {/* Draft meta */}
      <div style={{
        display: "flex", gap: S[3], padding: `${S[3]}px ${S[5]}px`,
        borderBottom: `1px solid ${C.line}`,
        flexShrink: 0,
      }}>
        <MetaChip label="Plantilla" value={draft.templateName} />
        <MetaChip label="Estado" value={LANDING_DRAFT_STATUS_LABEL[draft.status]} color={DRAFT_STATUS_COLOR[draft.status]} />
        <MetaChip label="Recursos" value={`${draft.assetsUsed.length}`} />
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", padding: `${S[4]}px ${S[5]}px` }}>
        {/* Sofia hint */}
        <div style={{
          padding: `${S[2]}px ${S[3]}px`,
          background: `${C.blueDark}06`,
          border: `1px solid ${C.blueDark}14`,
          borderRadius: R.md,
          marginBottom: S[4],
        }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.blueDark, fontWeight: T.wt.semibold, marginBottom: S[1] }}>
            Sofia
          </div>
          {getSofiaHints(draft.status, !!conflictPub).map((h, i) => (
            <div key={i} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, lineHeight: 1.5 }}>
              {h}
            </div>
          ))}
        </div>

        {/* Blocks */}
        {blocks.map((block, idx) => (
          <BlockEditor
            key={`${block.type}-${idx}`}
            block={block}
            idx={idx}
            onUpdateContent={updateBlockContent}
            onUpdateItem={updateBlockItem}
          />
        ))}

        {/* Assets */}
        {draft.assetsUsed.length > 0 && (
          <div style={{ marginTop: S[4] }}>
            <div style={{
              fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
              color: C.ink, marginBottom: S[2],
            }}>
              Recursos usados
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: S[1] }}>
              {draft.assetsUsed.map((a, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: S[2],
                  padding: `${S[1]}px ${S[2]}px`,
                  background: C.surfaceAlt,
                  borderRadius: R.sm,
                  fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint,
                }}>
                  <span style={{ fontWeight: T.wt.semibold, color: C.inkLight }}>
                    {a.assetType === "foto" ? "Foto" : a.assetType === "video" ? "Video" : "Banner"}
                  </span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, flex: 1 }}>
                    {a.assetId}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div style={{
        padding: `${S[3]}px ${S[5]}px`,
        borderTop: `1px solid ${C.line}`,
        flexShrink: 0,
      }}>
        {saveMsg && (
          <div style={{
            fontFamily: T.mono, fontSize: T.sz["2xs"],
            color: saveMsg === "Cambios guardados" ? C.green : C.red,
            marginBottom: S[2],
          }}>
            {saveMsg}
          </div>
        )}

        <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" as const }}>
          {/* Save */}
          <DrawerAction
            label={saving ? "Guardando..." : "Guardar cambios"}
            icon={<Save size={13} strokeWidth={2} />}
            variant="primary"
            disabled={saving || statusChanging}
            onClick={handleSave}
          />

          {/* Status actions based on current state */}
          {st === "borrador" && (
            <>
              <DrawerAction
                label="Enviar a revision"
                icon={<Eye size={13} strokeWidth={2} />}
                variant="secondary"
                disabled={statusChanging}
                onClick={() => handleStatusChange("en_revision")}
              />
              <DrawerAction
                label="Archivar"
                icon={<Archive size={13} strokeWidth={2} />}
                variant="ghost"
                disabled={statusChanging}
                onClick={() => handleStatusChange("archivado")}
              />
            </>
          )}
          {st === "en_revision" && (
            <>
              <DrawerAction
                label="Aprobar"
                icon={<CheckCircle size={13} strokeWidth={2} />}
                variant="secondary"
                disabled={statusChanging}
                onClick={() => handleStatusChange("aprobado")}
              />
              <DrawerAction
                label="Rechazar"
                icon={<XCircle size={13} strokeWidth={2} />}
                variant="ghost"
                disabled={statusChanging}
                onClick={() => handleStatusChange("rechazado")}
              />
              <DrawerAction
                label="Volver a borrador"
                icon={<RotateCcw size={13} strokeWidth={2} />}
                variant="ghost"
                disabled={statusChanging}
                onClick={() => handleStatusChange("borrador")}
              />
            </>
          )}
          {st === "aprobado" && (
            <>
              <DrawerAction
                label={publishing ? "Publicando..." : "Publicar en Shopify"}
                icon={<Upload size={13} strokeWidth={2} />}
                variant="primary"
                disabled={publishing || statusChanging}
                onClick={() => handlePublish()}
              />
              <DrawerAction
                label="Volver a borrador"
                icon={<RotateCcw size={13} strokeWidth={2} />}
                variant="secondary"
                disabled={statusChanging || publishing}
                onClick={() => handleStatusChange("borrador")}
              />
            </>
          )}
          {st === "rechazado" && (
            <>
              <DrawerAction
                label="Volver a borrador"
                icon={<RotateCcw size={13} strokeWidth={2} />}
                variant="secondary"
                disabled={statusChanging}
                onClick={() => handleStatusChange("borrador")}
              />
              <DrawerAction
                label="Archivar"
                icon={<Archive size={13} strokeWidth={2} />}
                variant="ghost"
                disabled={statusChanging}
                onClick={() => handleStatusChange("archivado")}
              />
            </>
          )}
        </div>

        {/* Publish result */}
        {publishResult && (
          <div style={{
            fontFamily: T.mono, fontSize: T.sz["2xs"], marginTop: S[2],
            color: publishResult === "Publicado correctamente" ? C.green : C.red,
          }}>
            {publishResult}
          </div>
        )}

        {/* Conflict dialog */}
        {conflictPub && (
          <div style={{
            marginTop: S[3], padding: S[3],
            background: `${C.amber}0a`,
            border: `1px solid ${C.amber}22`,
            borderRadius: R.md,
          }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[2] }}>
              Ya existe una landing publicada
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, marginBottom: S[3], lineHeight: 1.5 }}>
              Producto: {conflictPub.productName}
              {conflictPub.shopifyHandle ? ` · ${conflictPub.shopifyHandle}` : ""}
              {" · "}Version {conflictPub.version}
            </div>
            <div style={{ display: "flex", gap: S[2] }}>
              <DrawerAction
                label="Actualizar existente"
                icon={<Save size={13} strokeWidth={2} />}
                variant="primary"
                disabled={publishing}
                onClick={() => handlePublish("update")}
              />
              <DrawerAction
                label="Crear nueva version"
                icon={<Upload size={13} strokeWidth={2} />}
                variant="secondary"
                disabled={publishing}
                onClick={() => handlePublish("new")}
              />
              <DrawerAction
                label="Cancelar"
                icon={<X size={13} strokeWidth={2} />}
                variant="ghost"
                disabled={false}
                onClick={() => setConflictPub(null)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Drawer sub-components ────────────────────────────────────────────────────

function MetaChip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginBottom: 1 }}>{label}</div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: color ?? C.ink, fontWeight: T.wt.medium }}>{value}</div>
    </div>
  );
}

function DrawerAction({
  label, icon, variant, disabled, onClick,
}: {
  label:    string;
  icon:     React.ReactNode;
  variant:  "primary" | "secondary" | "ghost";
  disabled: boolean;
  onClick:  () => void;
}) {
  const styles: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: `${S[1]}px ${S[3]}px`,
    borderRadius: R.sm,
    fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    border: "none",
    ...(variant === "primary"   ? { background: C.blueDark, color: C.white } : {}),
    ...(variant === "secondary" ? { background: "transparent", color: C.blueDark, border: `1px solid ${C.blueDark}` } : {}),
    ...(variant === "ghost"     ? { background: "transparent", color: C.inkLight, border: `1px solid ${C.line}` } : {}),
  };

  return (
    <button disabled={disabled} onClick={onClick} style={styles}>
      {icon} {label}
    </button>
  );
}

function BlockEditor({
  block, idx, onUpdateContent, onUpdateItem,
}: {
  block:           LandingDraftBlock;
  idx:             number;
  onUpdateContent: (idx: number, field: string, value: string) => void;
  onUpdateItem:    (blockIdx: number, itemIdx: number, value: string) => void;
}) {
  const c = block.content;

  return (
    <div style={{
      border: `1px solid ${block.visible ? `${C.blueDark}14` : C.line}`,
      borderRadius: R.md,
      marginBottom: S[3],
      overflow: "hidden",
      opacity: block.visible ? 1 : 0.5,
    }}>
      {/* Block header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: `${S[2]}px ${S[3]}px`,
        background: block.visible ? `${C.blueDark}06` : C.surfaceAlt,
        borderBottom: `1px solid ${C.line}`,
      }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink }}>
          {LANDING_BLOCK_LABEL[block.type]}
        </span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
          {block.visible ? "Visible" : "Oculto"}
        </span>
      </div>

      {/* Editable fields */}
      <div style={{ padding: `${S[2]}px ${S[3]}px`, display: "flex", flexDirection: "column", gap: S[2] }}>
        {c.title !== undefined && (
          <BlockField label="Titulo" value={c.title} onChange={v => onUpdateContent(idx, "title", v)} />
        )}
        {c.subtitle !== undefined && (
          <BlockField label="Subtitulo" value={c.subtitle} onChange={v => onUpdateContent(idx, "subtitle", v)} />
        )}
        {c.description !== undefined && (
          <BlockField label="Descripcion" value={c.description} onChange={v => onUpdateContent(idx, "description", v)} />
        )}
        {c.ctaLabel !== undefined && (
          <BlockField label="Texto del boton" value={c.ctaLabel} onChange={v => onUpdateContent(idx, "ctaLabel", v)} />
        )}
        {c.ctaUrl !== undefined && (
          <BlockField label="Enlace" value={c.ctaUrl} onChange={v => onUpdateContent(idx, "ctaUrl", v)} />
        )}
        {c.price !== undefined && (
          <BlockField label="Precio" value={c.price} onChange={v => onUpdateContent(idx, "price", v)} />
        )}
        {c.sku !== undefined && (
          <BlockField label="SKU" value={c.sku} onChange={v => onUpdateContent(idx, "sku", v)} />
        )}
        {c.collection !== undefined && (
          <BlockField label="Coleccion" value={c.collection} onChange={v => onUpdateContent(idx, "collection", v)} />
        )}

        {/* Items list (benefits, trust) */}
        {c.items && c.items.length > 0 && (
          <div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginBottom: S[1] }}>
              Elementos
            </div>
            {c.items.map((item, itemIdx) => (
              <input
                key={itemIdx}
                value={item}
                onChange={e => onUpdateItem(idx, itemIdx, e.target.value)}
                style={{
                  display: "block", width: "100%", marginBottom: 3,
                  padding: `${S[1]}px ${S[2]}px`,
                  background: C.surfaceAlt, border: `1px solid ${C.line}`, borderRadius: R.sm,
                  fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink,
                  outline: "none",
                }}
              />
            ))}
          </div>
        )}

        {/* Read-only asset refs */}
        {c.imageUrl && (
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
            Imagen: {c.imageUrl}
          </div>
        )}
        {c.imageUrls && c.imageUrls.length > 0 && (
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
            {c.imageUrls.length} imagen{c.imageUrls.length !== 1 ? "es" : ""}
          </div>
        )}
        {c.videoUrl && (
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
            Video: {c.videoUrl}
          </div>
        )}
      </div>
    </div>
  );
}

function BlockField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginBottom: 1 }}>
        {label}
      </div>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: "100%",
          padding: `${S[1]}px ${S[2]}px`,
          background: C.surfaceAlt, border: `1px solid ${C.line}`, borderRadius: R.sm,
          fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink,
          outline: "none",
        }}
      />
    </div>
  );
}

// ── HISTORIAL tab ────────────────────────────────────────────────────────────

const HISTORY_ACTION_LABEL: Record<string, string> = {
  publish:   "Publicacion",
  update:    "Actualizacion",
  unpublish: "Despublicacion",
};

function HistorialTab({ orgSlug }: { orgSlug: string }) {
  const [history, setHistory] = useState<PublicationHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/orgs/${orgSlug}/marketing-studio/shopify/experiences/publish`);
        const data = await res.json();
        if (!cancelled && res.ok && data.ok) setHistory(data.history ?? []);
      } catch { /* empty */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orgSlug]);

  if (loading) {
    return (
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, padding: S[4] }}>
        Cargando historial...
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <EmptyState
        icon={<History size={32} strokeWidth={1.5} />}
        title="Sin publicaciones"
        sub="El historial de publicaciones a Shopify aparecera aqui."
      />
    );
  }

  return (
    <div>
      <SectionHeader
        title="Historial de publicaciones"
        count={history.length}
        sub="Registro de todas las publicaciones a Shopify"
      />
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 110px 90px 90px 80px 80px",
        gap: `0 ${S[2]}px`,
        padding: `${S[2]}px ${S[3]}px`,
        borderBottom: `1px solid ${C.line}`,
        fontFamily: T.mono, fontSize: T.sz.xs,
        color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.04em",
      }}>
        <span>Producto</span>
        <span>Accion</span>
        <span>Resultado</span>
        <span>Version</span>
        <span>Usuario</span>
        <span>Fecha</span>
      </div>
      <div className="ag-op-table">
        {history.map(entry => (
          <HistorialRow key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function HistorialRow({ entry }: { entry: PublicationHistoryEntry }) {
  const date = new Date(entry.publishedAt);
  const dateStr = date.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });

  return (
    <div className="ag-op-row" style={{
      display: "grid",
      gridTemplateColumns: "1fr 110px 90px 90px 80px 80px",
      gap: `0 ${S[2]}px`,
      padding: `${S[2]}px ${S[3]}px`,
      alignItems: "center",
    }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, fontWeight: T.wt.medium }}>
        {entry.productName}
      </div>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
        {HISTORY_ACTION_LABEL[entry.action] ?? entry.action}
      </span>
      <span style={{
        fontFamily: T.mono, fontSize: T.sz.xs,
        color: entry.result === "ok" ? C.green : C.red,
        fontWeight: T.wt.semibold,
      }}>
        {entry.result === "ok" ? "Correcto" : "Error"}
      </span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
        v{entry.version}
      </span>
      <span style={{
        fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
      }}>
        {entry.publishedBy}
      </span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
        {dateStr}
      </span>
    </div>
  );
}

// ── Main client ───────────────────────────────────────────────────────────────

export function ExperienciasClient({
  orgSlug,
  workspace,
}: ExperienciasClientProps) {
  const [activeTab, setActiveTab] = useState<ExperienceTab>("resumen");
  const [selectedDraft, setSelectedDraft] = useState<LandingDraft | null>(null);

  async function handleOpenDraft(draftId: string) {
    try {
      const res = await fetch(`/api/orgs/${orgSlug}/marketing-studio/shopify/experiences/landings`);
      const data = await res.json();
      if (res.ok && data.ok && Array.isArray(data.drafts)) {
        const found = (data.drafts as LandingDraft[]).find(d => d.id === draftId);
        if (found) {
          setSelectedDraft(found);
        }
      }
    } catch {
      // silent — drawer won't open
    }
  }

  function handleDraftUpdated(updated: LandingDraft) {
    setSelectedDraft(updated);
  }

  return (
    <div style={{ fontFamily: T.mono }}>
      {/* Tab bar */}
      <TabBar
        active={activeTab}
        onChange={setActiveTab}
        borradores={workspace.summary.borrradoresPendientes}
      />

      {/* Not connected state */}
      {!workspace.connected ? (
        <NotConnected orgSlug={orgSlug} />
      ) : (
        <>
          {activeTab === "resumen"    && <ResumenTab    workspace={workspace} orgSlug={orgSlug} />}
          {activeTab === "landings"   && <LandingsTab   landings={workspace.landings}   connected={workspace.connected} availability={workspace.availability} orgSlug={orgSlug} plantillas={workspace.plantillas} />}
          {activeTab === "banners"    && <BannersTab    connected={workspace.connected}  orgSlug={orgSlug} />}
          {activeTab === "plantillas" && <PlantillasTab plantillas={workspace.plantillas} />}
          {activeTab === "borradores" && <BorradoresTab borradores={workspace.borradores} onReview={handleOpenDraft} />}
          {activeTab === "historial"  && <HistorialTab orgSlug={orgSlug} />}
        </>
      )}

      {/* Review drawer */}
      {selectedDraft && (
        <>
          <div
            onClick={() => setSelectedDraft(null)}
            style={{
              position: "fixed", inset: 0,
              background: "rgba(0,0,0,0.25)",
              zIndex: 999,
            }}
          />
          <LandingDraftReviewDrawer
            draft={selectedDraft}
            orgSlug={orgSlug}
            onClose={() => setSelectedDraft(null)}
            onUpdated={handleDraftUpdated}
          />
        </>
      )}
    </div>
  );
}
