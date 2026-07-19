"use client";

/**
 * components/marketing-studio/publicaciones/publicaciones-client.tsx
 *
 * MARKETING-PUBLICACIONES-V2-ARCHITECTURE-01
 * Torre de control editorial — Supervisión, no creación.
 *
 * Identidad: "¿Qué está ocurriendo con el contenido de mi marca ahora mismo?"
 * No crea. No diseña. No ejecuta automáticamente.
 * Luca solo recomienda.
 */

import { useState, useTransition, useCallback } from "react";
import { C, T, S, R, E }                        from "@/lib/ui/tokens";
import { MSDrawer }        from "@/components/marketing-studio/shared/ms-drawer";
import { MSDrawerHeader }  from "@/components/marketing-studio/shared/ms-drawer-header";
import { MSDrawerSection } from "@/components/marketing-studio/shared/ms-drawer-section";
import { MSDrawerFooter }  from "@/components/marketing-studio/shared/ms-drawer-footer";
import { MS_PALETTE }      from "@/lib/marketing-studio/ms-design-system";
import type {
  PublicacionItem,
  PublicacionPaso,
  PublicacionEstado,
  PublicacionTipo,
  PublicacionesResumen,
  PublicacionesApiResponse,
} from "@/lib/marketing-studio/publicaciones/publicaciones-types";
import {
  PUBLICACION_ESTADO_LABEL,
  PUBLICACION_TIPO_LABEL,
  PUBLICACION_CANAL_LABEL,
  PUBLICACION_CANAL_COLOR,
  EDITORIAL_CANALES,
  editorialCanales,
} from "@/lib/marketing-studio/publicaciones/publicaciones-types";
import {
  getContenidoDestacado,
  getRequierenAtencion,
  buildLucaRecs,
} from "@/lib/marketing-studio/publicaciones/content-ranking-service";
import type { LucaRec } from "@/lib/marketing-studio/publicaciones/content-ranking-service";
import type { MSStatusVariant } from "@/components/marketing-studio/shared/ms-status-badge";

// ── Props ──────────────────────────────────────────────────────────────────────

export interface PublicacionesClientProps {
  orgSlug:     string;
  initialData: PublicacionesApiResponse;
}

// ── Channel logo SVGs ──────────────────────────────────────────────────────────

function ChannelLogo({ canal, size = 28 }: { canal: string; size?: number }) {
  const px = size;
  switch (canal) {
    case "instagram":
      return (
        <svg width={px} height={px} viewBox="0 0 32 32" fill="none">
          <defs>
            <radialGradient id="ig-g" cx="30%" cy="107%" r="150%">
              <stop offset="0%"  stopColor="#fdf497" />
              <stop offset="5%"  stopColor="#fdf497" />
              <stop offset="45%" stopColor="#fd5949" />
              <stop offset="60%" stopColor="#d6249f" />
              <stop offset="90%" stopColor="#285aeb" />
            </radialGradient>
          </defs>
          <rect width="32" height="32" rx="8" fill="url(#ig-g)" />
          <rect x="9" y="9" width="14" height="14" rx="4" stroke="white" strokeWidth="2" fill="none" />
          <circle cx="16" cy="16" r="4" stroke="white" strokeWidth="2" fill="none" />
          <circle cx="21.5" cy="10.5" r="1.2" fill="white" />
        </svg>
      );
    case "facebook":
      return (
        <svg width={px} height={px} viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="8" fill="#1877F2" />
          <path d="M21 6h-3a5 5 0 00-5 5v2h-3v4h3v8h4v-8h3l1-4h-4v-2a1 1 0 011-1h3V6z" fill="white" />
        </svg>
      );
    case "tiktok":
      return (
        <svg width={px} height={px} viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="8" fill="#010101" />
          <path d="M22 10.5a5.5 5.5 0 01-3.5-1.2V18a5.5 5.5 0 11-4-5.3v2.7a3 3 0 101.8 2.7V5h2.7A3.5 3.5 0 0022 8l.01 2.5z" fill="white" />
          <path d="M22 10.5a5.5 5.5 0 01-3.5-1.2V18a5.5 5.5 0 11-4-5.3v2.7a3 3 0 101.8 2.7V5h2.7A3.5 3.5 0 0022 8" fill="none" stroke="#FE2C55" strokeWidth="0.5" />
        </svg>
      );
    case "youtube":
      return (
        <svg width={px} height={px} viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="8" fill="#FF0000" />
          <path d="M26.5 11.8a3 3 0 00-2.1-2.1C22.5 9 16 9 16 9s-6.5 0-8.4.7a3 3 0 00-2.1 2.1C5 13.7 5 16 5 16s0 2.3.5 4.2a3 3 0 002.1 2.1C9.5 23 16 23 16 23s6.5 0 8.4-.7a3 3 0 002.1-2.1c.5-1.9.5-4.2.5-4.2s0-2.3-.5-4.2z" fill="white" fillOpacity="0.9" />
          <path d="M13.5 19.5l6.5-3.5-6.5-3.5v7z" fill="#FF0000" />
        </svg>
      );
    case "linkedin":
      return (
        <svg width={px} height={px} viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="8" fill="#0A66C2" />
          <path d="M9 12h4v12H9V12zm2-5a2 2 0 110 4 2 2 0 010-4zm5 5h4v1.5c.6-1 1.8-2 3.5-2 3.5 0 4.5 2.3 4.5 5.3V24h-4v-6.5c0-1.6-.6-2.5-1.8-2.5-1.5 0-2.2 1-2.2 2.5V24h-4V12z" fill="white" />
        </svg>
      );
    case "x":
    case "twitter":
      return (
        <svg width={px} height={px} viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="8" fill="#000000" />
          <path d="M18.244 13.625L24.28 6.5h-1.44l-5.25 6.11L13.17 6.5H8l6.34 9.23L8 25.5h1.44l5.55-6.46 4.43 6.46H25L18.244 13.625zm-1.964 2.285l-.643-.92-5.12-7.32h2.2l4.13 5.91.643.92 5.37 7.69h-2.2l-4.38-6.28z" fill="white" />
        </svg>
      );
    case "pinterest":
      return (
        <svg width={px} height={px} viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="8" fill="#E60023" />
          <path d="M16 5C10.477 5 6 9.477 6 15c0 4.236 2.636 7.855 6.356 9.312-.088-.791-.167-2.005.035-2.868.181-.78 1.207-5.119 1.207-5.119s-.308-.617-.308-1.53c0-1.433.831-2.506 1.865-2.506.88 0 1.306.66 1.306 1.452 0 .885-.564 2.209-.855 3.435-.243 1.026.514 1.861 1.525 1.861 1.83 0 3.24-1.929 3.24-4.713 0-2.463-1.77-4.185-4.296-4.185-2.926 0-4.643 2.194-4.643 4.461 0 .883.34 1.83.763 2.348a.307.307 0 01.071.294c-.078.323-.251 1.026-.285 1.169-.046.19-.153.23-.352.138-1.249-.581-2.03-2.407-2.03-3.874 0-3.154 2.292-6.052 6.608-6.052 3.469 0 6.165 2.473 6.165 5.776 0 3.447-2.173 6.22-5.19 6.22-1.013 0-1.966-.527-2.292-1.148l-.623 2.325c-.226.869-.835 1.958-1.244 2.621.937.29 1.931.447 2.96.447 5.523 0 10-4.477 10-10S21.523 5 16 5z" fill="white" />
        </svg>
      );
    default: {
      const color = PUBLICACION_CANAL_COLOR[canal] ?? C.inkMid;
      const label = (PUBLICACION_CANAL_LABEL[canal] ?? canal).slice(0, 2).toUpperCase();
      return (
        <div style={{
          width:          px,
          height:         px,
          borderRadius:   8,
          background:     color,
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          fontFamily:     T.mono,
          fontSize:       px * 0.3,
          fontWeight:     T.wt.bold,
          color:          "#fff",
          flexShrink:     0,
        }}>
          {label}
        </div>
      );
    }
  }
}

// ── Helper: estado ─────────────────────────────────────────────────────────────

function estadoToVariant(estado: PublicacionEstado): MSStatusVariant {
  switch (estado) {
    case "publicada":   return "ok";
    case "programada":  return "info";
    case "en_revision": return "warning";
    case "parcial":     return "warning";
    case "error":       return "error";
    case "cancelada":   return "archived";
    default:            return "neutral";
  }
}

function estadoToDot(estado: PublicacionEstado): string {
  switch (estado) {
    case "publicada":   return C.green   ?? "#16a34a";
    case "programada":  return C.blueDark;
    case "en_revision": return C.amber   ?? "#d97706";
    case "parcial":     return C.amber   ?? "#d97706";
    case "error":       return C.red     ?? "#dc2626";
    case "cancelada":   return C.inkFaint;
    default:            return C.inkFaint;
  }
}

function estadoToBg(estado: PublicacionEstado): string {
  switch (estado) {
    case "publicada":   return `${C.green ?? "#16a34a"}12`;
    case "programada":  return `${C.blueDark}12`;
    case "en_revision": return `${C.amber ?? "#d97706"}12`;
    case "parcial":     return `${C.amber ?? "#d97706"}12`;
    case "error":       return `${C.red   ?? "#dc2626"}12`;
    case "cancelada":   return C.surfaceAlt;
    default:            return C.surfaceAlt;
  }
}

// ── Tipo label helper ──────────────────────────────────────────────────────────

function getTipoLabel(tipo: PublicacionTipo | null, origen: PublicacionItem["origen"]): string {
  if (tipo) return PUBLICACION_TIPO_LABEL[tipo];
  switch (origen) {
    case "catalogo":  return "Catálogo";
    case "producto":  return "Producto";
    case "automatico": return "Auto";
    default:          return "Publicación";
  }
}

// ── Thumbnail ──────────────────────────────────────────────────────────────────

function Thumbnail({
  src,
  canal,
  height = 96,
}: {
  src:    string | null;
  canal:  string;
  height?: number;
}) {
  const color = PUBLICACION_CANAL_COLOR[canal] ?? C.blueDark;
  if (src) {
    return (
      <div style={{
        width:        "100%",
        height,
        position:     "relative",
        overflow:     "hidden",
        background:   `${color}18`,
        flexShrink:   0,
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          style={{
            width:      "100%",
            height:     "100%",
            objectFit:  "cover",
            display:    "block",
          }}
        />
      </div>
    );
  }
  // Placeholder — always reserve space, never collapse
  return (
    <div style={{
      width:           "100%",
      height,
      background:      `linear-gradient(135deg, ${color}22 0%, ${color}10 100%)`,
      borderBottom:    `1px solid ${color}20`,
      display:         "flex",
      alignItems:      "center",
      justifyContent:  "center",
      flexShrink:      0,
    }}>
      <ChannelLogo canal={canal} size={Math.round(height * 0.38)} />
    </div>
  );
}

// ── Metric formatter ──────────────────────────────────────────────────────────

function fmtMetric(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("es-CO");
}

// ── Date helpers ───────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-CO", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function fmtDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-CO", {
      month: "short", day: "numeric",
    });
  } catch { return iso; }
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function fmtTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  if (mins < 1)   return "Ahora";
  if (mins < 60)  return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `Hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30)  return `Hace ${days}d`;
  return fmtDateShort(iso);
}

function fmtTimeUntil(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "Pasado";
  const mins  = Math.floor(diff / 60000);
  if (mins < 60)  return `En ${mins} min`;
  const hrs  = Math.floor(mins / 60);
  if (hrs < 24)   return `En ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `En ${days}d`;
}

function fmtRelativeSync(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  if (mins < 1)   return "Hace unos segundos";
  if (mins < 60)  return `Hace ${mins} min`;
  const hrs  = Math.floor(mins / 60);
  return `Hace ${hrs}h`;
}

// ── Estado badge ───────────────────────────────────────────────────────────────

function EstadoBadge({ estado }: { estado: PublicacionEstado }) {
  const dot   = estadoToDot(estado);
  const label = PUBLICACION_ESTADO_LABEL[estado];
  return (
    <span style={{
      display:      "inline-flex",
      alignItems:   "center",
      gap:          4,
      padding:      "2px 8px",
      borderRadius: R.pill,
      background:   estadoToBg(estado),
      border:       `1px solid ${dot}30`,
      fontFamily:   T.mono,
      fontSize:     T.sz.xs,
      color:        dot,
      fontWeight:   T.wt.semibold,
      whiteSpace:   "nowrap",
      flexShrink:   0,
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: R.pill, background: dot,
        display: "inline-block", flexShrink: 0,
      }} />
      {label}
    </span>
  );
}

// ── 1. Estado editorial — executive summary ────────────────────────────────────

function EstadoEditorial({
  resumen,
  syncedAt,
}: {
  resumen:  PublicacionesResumen;
  syncedAt: string;
}) {
  const ok = resumen.conError === 0;
  return (
    <div style={{
      display:      "flex",
      flexWrap:     "wrap",
      alignItems:   "stretch",
      gap:          S[3],
      padding:      `${S[4]}px ${S[5]}px`,
      background:   C.white,
      border:       `1px solid ${C.line}`,
      borderRadius: R.xl,
      boxShadow:    E.xs,
      marginBottom: S[5],
    }}>
      {/* Title */}
      <div style={{ display: "flex", alignItems: "center", gap: S[2], flexShrink: 0, marginRight: S[2] }}>
        <span style={{
          fontFamily:  T.mono,
          fontSize:    T.sz.sm,
          fontWeight:  T.wt.bold,
          color:       C.ink,
          letterSpacing: "0.01em",
        }}>
          Estado editorial
        </span>
      </div>

      <div style={{ width: 1, background: C.line, alignSelf: "stretch", flexShrink: 0 }} />

      {/* Metrics */}
      {[
        { label: `${resumen.publicadas} publicaciones activas`,         ok: true  },
        { label: `${resumen.programadas} programadas`,                  ok: true  },
        { label: `${resumen.enRevision} requieren revisión`,            ok: resumen.enRevision === 0 },
        { label: `${resumen.conError} error${resumen.conError !== 1 ? "es" : ""} crítico${resumen.conError !== 1 ? "s" : ""}`, ok: resumen.conError === 0 },
      ].map((m, i) => (
        <div key={i} style={{
          display:    "flex",
          alignItems: "center",
          gap:        S[1],
          flexShrink: 0,
        }}>
          <span style={{
            width:     14,
            height:    14,
            borderRadius: R.pill,
            background: m.ok ? (C.green ?? "#16a34a") : (C.amber ?? "#d97706"),
            display:   "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            fontSize:   9,
            color:      "#fff",
            fontWeight: T.wt.bold,
          }}>
            {m.ok ? "✓" : "!"}
          </span>
          <span style={{
            fontFamily: T.mono,
            fontSize:   T.sz.xs,
            color:      m.ok ? C.inkMid : (C.amber ?? "#d97706"),
            fontWeight: m.ok ? T.wt.normal : T.wt.semibold,
          }}>
            {m.label}
          </span>
        </div>
      ))}

      <div style={{ flex: 1 }} />

      {/* Sync time */}
      <div style={{
        display:    "flex",
        alignItems: "center",
        gap:        S[1],
        flexShrink: 0,
      }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
          Última sincronización: {fmtRelativeSync(syncedAt)}
        </span>
      </div>
    </div>
  );
}

// ── 2. KPI strip (5 metrics) ───────────────────────────────────────────────────

function KPIStrip({ resumen }: { resumen: PublicacionesResumen }) {
  const kpis = [
    { label: "Publicadas",     value: resumen.publicadas,    color: C.green   ?? "#16a34a" },
    { label: "Programadas",    value: resumen.programadas,   color: C.blueDark               },
    { label: "En revisión",    value: resumen.enRevision,    color: C.amber   ?? "#d97706"  },
    { label: "Con error",      value: resumen.conError,      color: C.red     ?? "#dc2626"  },
    { label: "Publicadas hoy", value: resumen.publicadasHoy, color: C.green   ?? "#16a34a"  },
  ] as const;

  return (
    <div style={{
      display:             "grid",
      gridTemplateColumns: "repeat(5, 1fr)",
      gap:                 S[3],
      marginBottom:        S[5],
    }}>
      {kpis.map(({ label, value, color }) => (
        <div key={label} className="ag-kpi-card" style={{
          background:   C.white,
          border:       `1px solid ${C.line}`,
          borderLeft:   `3px solid ${color}`,
          borderRadius: R.xl,
          padding:      `${S[3]}px ${S[4]}px`,
          boxShadow:    E.xs,
        }}>
          <div style={{
            fontFamily:         T.mono,
            fontSize:           T.sz["2xl"],
            fontWeight:         T.wt.bold,
            color:              value > 0 ? color : C.inkFaint,
            lineHeight:         1,
            marginBottom:       S[1],
            fontVariantNumeric: "tabular-nums",
          }}>
            {value}
          </div>
          <div style={{
            fontFamily: T.mono,
            fontSize:   T.sz.xs,
            color:      C.inkMid,
            fontWeight: T.wt.medium,
          }}>
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── 3. Luca Marketing — consumes ContentRankingService ────────────────────────
// Business logic lives in content-ranking-service.ts — this component only renders.

function LucaMarketing({ publicaciones }: { publicaciones: PublicacionItem[] }) {
  const recs: LucaRec[] = buildLucaRecs(publicaciones);

  return (
    <div style={{ marginBottom: S[5] }}>
      {/* Header */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:          S[2],
        marginBottom: S[3],
      }}>
        <div style={{
          width:      20, height: 20, borderRadius: R.pill,
          background: "linear-gradient(135deg, #001E4A 0%, #003A8A 100%)",
          display:    "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,.85)", fontWeight: T.wt.bold, fontFamily: T.mono }}>
            ★
          </span>
        </div>
        <span style={{
          fontFamily:    T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
          color:         C.inkFaint, textTransform: "uppercase", letterSpacing: "0.06em",
        }}>
          Luca · Alertas editoriales
        </span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost ?? C.inkFaint }}>
          Solo cuando existe una oportunidad real
        </span>
      </div>

      {/* Recommendations or quiet fallback */}
      {recs.length > 0 ? (
        <div style={{
          display:             "grid",
          gridTemplateColumns: `repeat(${Math.min(recs.length, 3)}, 1fr)`,
          gap:                 S[3],
        }}>
          {recs.slice(0, 3).map((r, i) => (
            <div key={i} style={{
              padding:      `${S[3]}px ${S[4]}px`,
              background:   C.white,
              border:       `1px solid ${C.line}`,
              borderLeft:   `3px solid ${r.acento}`,
              borderRadius: R.xl,
              boxShadow:    E.xs,
              display:      "flex",
              gap:          S[2],
            }}>
              <span style={{ fontSize: 15, flexShrink: 0, lineHeight: 1.5 }}>{r.icon}</span>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, lineHeight: 1.6 }}>
                {r.msg}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{
          fontFamily:  T.mono,
          fontSize:    T.sz.xs,
          color:       C.inkFaint,
          fontStyle:   "italic",
          paddingLeft: S[1],
        }}>
          Sin recomendaciones editoriales en este momento.
        </div>
      )}
    </div>
  );
}

// ── Block header ───────────────────────────────────────────────────────────────

function BlockHeader({
  title,
  count,
  accentColor,
  action,
}: {
  title:        string;
  count:        number;
  accentColor?: string;
  action?:      { label: string; onClick: () => void };
}) {
  return (
    <div style={{
      display:        "flex",
      alignItems:     "center",
      gap:            S[3],
      marginBottom:   S[3],
    }}>
      <span style={{
        width:        8,
        height:       8,
        borderRadius: R.pill,
        background:   accentColor ?? C.ink,
        flexShrink:   0,
        display:      "block",
      }} />
      <span style={{
        fontFamily:  T.mono,
        fontSize:    T.sz.sm,
        fontWeight:  T.wt.bold,
        color:       C.ink,
      }}>
        {title}
      </span>
      <span style={{
        fontFamily:   T.mono,
        fontSize:     T.sz.xs,
        color:        C.inkFaint,
        background:   C.surfaceAlt,
        border:       `1px solid ${C.line}`,
        borderRadius: R.pill,
        padding:      "1px 8px",
      }}>
        {count}
      </span>
      <div style={{ flex: 1 }} />
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          style={{
            fontFamily:     T.mono,
            fontSize:       T.sz.xs,
            color:          C.blueDark,
            fontWeight:     T.wt.semibold,
            background:     "none",
            border:         "none",
            cursor:         "pointer",
            padding:        0,
          }}
        >
          {action.label} →
        </button>
      )}
    </div>
  );
}

// ── Channel mini badges row ────────────────────────────────────────────────────

function ChannelRow({ canales, max = 3 }: { canales: string[]; max?: number }) {
  const shown = canales.slice(0, max);
  const rest  = canales.length - shown.length;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {shown.map(c => (
        <ChannelLogo key={c} canal={c} size={18} />
      ))}
      {rest > 0 && (
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
          +{rest}
        </span>
      )}
    </div>
  );
}

// ── Block A card — Publicadas ──────────────────────────────────────────────────

function CardActiva({
  item,
  onClick,
}: {
  item:    PublicacionItem;
  onClick: (item: PublicacionItem) => void;
}) {
  const canales   = editorialCanales(item.canales);
  const mainCanal = canales[0] ?? "";
  const tipoLabel = getTipoLabel(item.tipo, item.origen);

  return (
    <div
      style={{
        background:    C.white,
        border:        `1px solid ${C.line}`,
        borderRadius:  R.xl,
        overflow:      "hidden",
        boxShadow:     E.xs,
        display:       "flex",
        flexDirection: "column",
        cursor:        "pointer",
        transition:    "box-shadow 0.15s",
      }}
      onClick={() => onClick(item)}
    >
      {/* Thumbnail — always reserved, never collapses */}
      <div style={{ position: "relative" }}>
        <Thumbnail src={item.miniatura} canal={mainCanal} height={96} />
        {/* Overlay channel badges (additional platforms) */}
        {canales.length > 1 && (
          <div style={{
            position: "absolute",
            bottom:   6,
            right:    6,
            display:  "flex",
            gap:      3,
          }}>
            {canales.slice(1, 3).map(c => (
              <div key={c} style={{
                background: "rgba(255,255,255,0.9)",
                borderRadius: 6,
                padding: 2,
                boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
              }}>
                <ChannelLogo canal={c} size={14} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: `${S[3]}px ${S[3]}px ${S[2]}px`, flex: 1, display: "flex", flexDirection: "column", gap: S[1] }}>
        {/* Type + Status */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: S[1] }}>
          <span style={{
            fontFamily:    T.mono,
            fontSize:      T.sz["2xs"],
            color:         C.inkFaint,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}>
            {tipoLabel}
          </span>
          <EstadoBadge estado={item.estado} />
        </div>

        {/* Title */}
        <div style={{
          fontFamily:   T.mono,
          fontSize:     T.sz.sm,
          fontWeight:   T.wt.semibold,
          color:        C.ink,
          overflow:     "hidden",
          textOverflow: "ellipsis",
          whiteSpace:   "nowrap",
        }}>
          {item.titulo}
        </div>

        {/* Date + time ago */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
            {item.publicadaEn ? fmtDateShort(item.publicadaEn) : "—"}
          </span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
            {item.publicadaEn ? fmtTimeAgo(item.publicadaEn) : ""}
          </span>
        </div>

        {/* Métricas visibles: alcance, reproducciones, interacciones */}
        {(item.alcance != null || item.reproducciones != null || item.interacciones != null) && (
          <div style={{
            display:    "flex",
            gap:        S[3],
            paddingTop: S[1],
            borderTop:  `1px solid ${C.lineSubtle ?? C.line}`,
            marginTop:  S[1],
            flexWrap:   "wrap",
          }}>
            {item.alcance != null && (
              <div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Alcance</div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink }}>
                  {fmtMetric(item.alcance)}
                </div>
              </div>
            )}
            {item.reproducciones != null && (
              <div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Repr.</div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink }}>
                  {fmtMetric(item.reproducciones)}
                </div>
              </div>
            )}
            {item.interacciones != null && (
              <div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Interac.</div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink }}>
                  {fmtMetric(item.interacciones)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onClick(item); }}
        style={{
          margin:       `0 ${S[3]}px ${S[3]}px`,
          padding:      `${S[2]}px`,
          background:   `${C.blueDark}08`,
          border:       `1px solid ${C.blueDark}30`,
          borderRadius: R.lg,
          fontFamily:   T.mono,
          fontSize:     T.sz.xs,
          fontWeight:   T.wt.semibold,
          color:        C.blueDark,
          cursor:       "pointer",
          textAlign:    "center",
          transition:   "background 0.12s",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${C.blueDark}16`; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = `${C.blueDark}08`; }}
      >
        Ver detalles
      </button>
    </div>
  );
}

// ── Block B card — Programadas ─────────────────────────────────────────────────

function CardProgramada({
  item,
  onClick,
}: {
  item:    PublicacionItem;
  onClick: (item: PublicacionItem) => void;
}) {
  const canales   = editorialCanales(item.canales);
  const mainCanal = canales[0] ?? "";
  const timeUntil = item.programadaEn ? fmtTimeUntil(item.programadaEn) : "—";
  const isUrgent  = item.programadaEn
    ? new Date(item.programadaEn).getTime() - Date.now() < 2 * 60 * 60 * 1000
    : false;
  const tipoLabel = getTipoLabel(item.tipo, item.origen);

  return (
    <div
      style={{
        background:    C.white,
        border:        `1px solid ${isUrgent ? C.blueDark + "40" : C.line}`,
        borderRadius:  R.xl,
        overflow:      "hidden",
        boxShadow:     E.xs,
        display:       "flex",
        flexDirection: "column",
        cursor:        "pointer",
      }}
      onClick={() => onClick(item)}
    >
      {/* Thumbnail — always reserved */}
      <div style={{ position: "relative" }}>
        <Thumbnail src={item.miniatura} canal={mainCanal} height={80} />
        {/* Countdown badge overlaid */}
        <span style={{
          position:     "absolute",
          top:          6,
          right:        6,
          fontFamily:   T.mono,
          fontSize:     T.sz["2xs"],
          fontWeight:   T.wt.bold,
          color:        isUrgent ? "#fff" : C.blueDark,
          background:   isUrgent ? C.blueDark : "rgba(255,255,255,0.9)",
          border:       `1px solid ${C.blueDark}40`,
          borderRadius: R.pill,
          padding:      "1px 7px",
          whiteSpace:   "nowrap",
          backdropFilter: "blur(4px)",
        }}>
          {timeUntil}
        </span>
      </div>

      {/* Content */}
      <div style={{
        padding:       `${S[3]}px ${S[3]}px ${S[2]}px`,
        flex:          1,
        display:       "flex",
        flexDirection: "column",
        gap:           S[2],
        borderLeft:    `3px solid ${C.blueDark}`,
      }}>
        {/* Type + channels */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{
            fontFamily:    T.mono,
            fontSize:      T.sz["2xs"],
            color:         C.inkFaint,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}>
            {tipoLabel}
          </span>
          <ChannelRow canales={canales} max={3} />
        </div>

        {/* Title */}
        <div style={{
          fontFamily:   T.mono,
          fontSize:     T.sz.sm,
          fontWeight:   T.wt.semibold,
          color:        C.ink,
          overflow:     "hidden",
          textOverflow: "ellipsis",
          whiteSpace:   "nowrap",
        }}>
          {item.titulo}
        </div>

        {/* Date */}
        <div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
            {item.programadaEn ? fmtDate(item.programadaEn) : "Sin fecha programada"}
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 2 }}>
            Próxima publicación
          </div>
        </div>

        {/* Status + CTA */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <EstadoBadge estado={item.estado} />
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onClick(item); }}
            style={{
              padding:      0,
              background:   "none",
              border:       "none",
              fontFamily:   T.mono,
              fontSize:     T.sz.xs,
              fontWeight:   T.wt.semibold,
              color:        C.blueDark,
              cursor:       "pointer",
            }}
          >
            Ver detalles →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Block C card — Requieren atención ─────────────────────────────────────────

function CardAtencion({
  item,
  onClick,
}: {
  item:    PublicacionItem;
  onClick: (item: PublicacionItem) => void;
}) {
  const canales     = editorialCanales(item.canales);
  const mainCanal   = canales[0] ?? "";
  const accentColor = item.estado === "error" ? (C.red ?? "#dc2626") : (C.amber ?? "#d97706");

  const razon =
    item.estado === "error"         ? "Error en canal — requiere intervención"
    : item.estado === "en_revision" ? "En revisión — pendiente de aprobación"
    : item.estado === "parcial"     ? "Publicación parcial — algunos canales fallaron"
    : item.tieneErrores             ? "Errores detectados en pasos de publicación"
    : "Requiere revisión";

  return (
    <div
      style={{
        background:    C.white,
        border:        `1px solid ${accentColor}40`,
        borderRadius:  R.xl,
        overflow:      "hidden",
        boxShadow:     `0 2px 8px ${accentColor}14`,
        display:       "flex",
        flexDirection: "column",
        cursor:        "pointer",
      }}
      onClick={() => onClick(item)}
    >
      {/* Thumbnail — always reserved */}
      <div style={{ position: "relative" }}>
        <Thumbnail src={item.miniatura} canal={mainCanal} height={72} />
        {/* Priority indicator */}
        <span style={{
          position:     "absolute",
          top:          6,
          left:         6,
          fontFamily:   T.mono,
          fontSize:     T.sz["2xs"],
          fontWeight:   T.wt.bold,
          color:        "#fff",
          background:   accentColor,
          borderRadius: R.pill,
          padding:      "1px 7px",
        }}>
          {item.prioridad === "critica" ? "Crítico" : item.prioridad === "alta" ? "Alta" : "Atención"}
        </span>
      </div>

      {/* Content */}
      <div style={{
        padding:       `${S[3]}px ${S[3]}px ${S[2]}px`,
        flex:          1,
        display:       "flex",
        flexDirection: "column",
        gap:           S[2],
        borderLeft:    `3px solid ${accentColor}`,
      }}>
        {/* Channels + Status */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <ChannelRow canales={canales} />
          <EstadoBadge estado={item.estado} />
        </div>

        {/* Title */}
        <div style={{
          fontFamily:   T.mono,
          fontSize:     T.sz.sm,
          fontWeight:   T.wt.semibold,
          color:        C.ink,
          overflow:     "hidden",
          textOverflow: "ellipsis",
          whiteSpace:   "nowrap",
        }}>
          {item.titulo}
        </div>

        {/* Reason */}
        <div style={{
          fontFamily:   T.mono,
          fontSize:     T.sz.xs,
          color:        accentColor,
          padding:      `${S[1]}px ${S[2]}px`,
          background:   `${accentColor}10`,
          borderRadius: R.md,
          fontWeight:   T.wt.medium,
        }}>
          {razon}
        </div>

        {/* CTA */}
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onClick(item); }}
          style={{
            padding:    `${S[2]}px`,
            background: `${accentColor}10`,
            border:     `1px solid ${accentColor}30`,
            borderRadius: R.lg,
            fontFamily: T.mono,
            fontSize:   T.sz.xs,
            fontWeight: T.wt.semibold,
            color:      accentColor,
            cursor:     "pointer",
            textAlign:  "center",
            transition: "background 0.12s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${accentColor}20`; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = `${accentColor}10`; }}
        >
          Atender ahora
        </button>
      </div>
    </div>
  );
}

// ── Card Destacada — top performer ────────────────────────────────────────────

function CardDestacada({
  item,
  rank,
  onClick,
}: {
  item:    PublicacionItem;
  rank:    number;
  onClick: (item: PublicacionItem) => void;
}) {
  const canales   = editorialCanales(item.canales);
  const mainCanal = canales[0] ?? "";
  const mainColor = PUBLICACION_CANAL_COLOR[mainCanal] ?? C.blueDark;
  const hasMetrics = item.alcance != null || item.interacciones != null || item.reproducciones != null;

  return (
    <div
      style={{
        background:    C.white,
        border:        `1px solid ${C.line}`,
        borderRadius:  R.xl,
        overflow:      "hidden",
        boxShadow:     E.xs,
        display:       "flex",
        flexDirection: "column",
        cursor:        "pointer",
        transition:    "box-shadow 0.15s",
      }}
      onClick={() => onClick(item)}
    >
      {/* Thumbnail with rank badge */}
      <div style={{ position: "relative" }}>
        <Thumbnail src={item.miniatura} canal={mainCanal} height={88} />
        {/* Rank badge */}
        <span style={{
          position:     "absolute",
          top:          6,
          left:         6,
          fontFamily:   T.mono,
          fontSize:     T.sz["2xs"],
          fontWeight:   T.wt.bold,
          color:        rank === 1 ? "#92400e" : C.ink,
          background:   rank === 1 ? "#fef3c7" : "rgba(255,255,255,0.92)",
          border:       `1px solid ${rank === 1 ? "#fbbf24" : C.line}`,
          borderRadius: R.pill,
          padding:      "1px 7px",
          backdropFilter: "blur(4px)",
        }}>
          {rank === 1 ? "★ Top" : `#${rank}`}
        </span>
        {/* Channel logo bottom-right */}
        <div style={{
          position:   "absolute",
          bottom:     6,
          right:      6,
          background: "rgba(255,255,255,0.9)",
          borderRadius: 8,
          padding:    2,
          boxShadow:  "0 1px 3px rgba(0,0,0,0.15)",
        }}>
          <ChannelLogo canal={mainCanal} size={18} />
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: `${S[2]}px ${S[3]}px`, flex: 1, display: "flex", flexDirection: "column", gap: S[1] }}>
        {/* Title */}
        <div style={{
          fontFamily:   T.mono,
          fontSize:     T.sz.xs,
          fontWeight:   T.wt.semibold,
          color:        C.ink,
          overflow:     "hidden",
          textOverflow: "ellipsis",
          whiteSpace:   "nowrap",
        }}>
          {item.titulo}
        </div>

        {/* Date */}
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
          {item.publicadaEn ? fmtDateShort(item.publicadaEn) : "—"}
          {item.publicadaEn ? ` · ${fmtTimeAgo(item.publicadaEn)}` : ""}
        </div>

        {/* Metrics grid */}
        {hasMetrics ? (
          <div style={{
            display:             "grid",
            gridTemplateColumns: "1fr 1fr",
            gap:                 S[1],
            marginTop:           S[1],
            paddingTop:          S[1],
            borderTop:           `1px solid ${C.lineSubtle ?? C.line}`,
          }}>
            {item.alcance != null && (
              <div>
                <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>Alcance</div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: mainColor }}>
                  {fmtMetric(item.alcance)}
                </div>
              </div>
            )}
            {item.reproducciones != null && (
              <div>
                <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>Reprod.</div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: mainColor }}>
                  {fmtMetric(item.reproducciones)}
                </div>
              </div>
            )}
            {item.interacciones != null && (
              <div>
                <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>Interac.</div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: mainColor }}>
                  {fmtMetric(item.interacciones)}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkGhost ?? C.inkFaint, marginTop: S[1], fontStyle: "italic" }}>
            Métricas disponibles al conectar la plataforma
          </div>
        )}
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onClick(item); }}
        style={{
          margin:       `0 ${S[3]}px ${S[3]}px`,
          padding:      `${S[1]}px`,
          background:   "none",
          border:       "none",
          fontFamily:   T.mono,
          fontSize:     T.sz.xs,
          fontWeight:   T.wt.semibold,
          color:        C.blueDark,
          cursor:       "pointer",
          textAlign:    "left",
        }}
      >
        Ver detalles →
      </button>
    </div>
  );
}

// ── Placeholder card (empty state — maintains grid structure) ──────────────────

function PlaceholderCard({ msg, accentColor }: { msg: string; accentColor?: string }) {
  const color = accentColor ?? C.inkFaint;
  return (
    <div style={{
      background:    C.surfaceAlt,
      border:        `1.5px dashed ${color}40`,
      borderRadius:  R.xl,
      overflow:      "hidden",
      display:       "flex",
      flexDirection: "column",
      opacity:       0.65,
    }}>
      {/* Placeholder thumbnail band */}
      <div style={{
        height:          96,
        background:      `${color}08`,
        borderBottom:    `1px dashed ${color}30`,
        display:         "flex",
        alignItems:      "center",
        justifyContent:  "center",
      }}>
        <span style={{ fontSize: 22, opacity: 0.3 }}>📄</span>
      </div>
      {/* Placeholder content */}
      <div style={{ padding: `${S[3]}px ${S[3]}px`, flex: 1, display: "flex", flexDirection: "column", gap: S[2] }}>
        <div style={{ height: 8, borderRadius: 4, background: `${color}20`, width: "60%" }} />
        <div style={{ height: 12, borderRadius: 4, background: `${color}15`, width: "85%" }} />
        <div style={{ height: 8, borderRadius: 4, background: `${color}12`, width: "45%" }} />
      </div>
    </div>
  );
}

function EmptyBlock({ msg, accentColor }: { msg: string; accentColor?: string }) {
  const color = accentColor ?? C.inkFaint;
  // Show 3 placeholder card shapes + centered message
  return (
    <div>
      <div style={{
        display:             "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap:                 S[3],
        position:            "relative",
      }}>
        <PlaceholderCard accentColor={color} msg="" />
        <PlaceholderCard accentColor={color} msg="" />
        <PlaceholderCard accentColor={color} msg="" />
        <PlaceholderCard accentColor={color} msg="" />
        {/* Centered message overlay */}
        <div style={{
          position:        "absolute",
          inset:           0,
          display:         "flex",
          alignItems:      "center",
          justifyContent:  "center",
          pointerEvents:   "none",
        }}>
          <span style={{
            fontFamily:   T.mono,
            fontSize:     T.sz.sm,
            color:        C.inkMid,
            background:   `${C.white}E0`,
            padding:      `${S[2]}px ${S[4]}px`,
            borderRadius: R.lg,
            border:       `1px solid ${C.line}`,
            boxShadow:    E.xs,
            backdropFilter: "blur(4px)",
          }}>
            {msg}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── 4-card grid ───────────────────────────────────────────────────────────────

function CardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display:             "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap:                 S[3],
    }}>
      {children}
    </div>
  );
}

// ── Block section wrapper ──────────────────────────────────────────────────────

function BlockSection({ children, mb = true }: { children: React.ReactNode; mb?: boolean }) {
  return (
    <div style={{ marginBottom: mb ? S[6] : 0 }}>
      {children}
    </div>
  );
}

// ── Calendar view ──────────────────────────────────────────────────────────────

function CalendarioView({
  publicaciones,
  onSelect,
}: {
  publicaciones: PublicacionItem[];
  onSelect:      (item: PublicacionItem) => void;
}) {
  const today   = new Date();
  const dow     = today.getDay();
  const monday  = new Date(today);
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });

  const weekStart = weekDays[0].toISOString().slice(0, 10);
  const weekEnd   = weekDays[6].toISOString().slice(0, 10);

  // Group publications by day ISO string
  const byDay = new Map<string, PublicacionItem[]>();
  for (const d of weekDays) {
    byDay.set(d.toISOString().slice(0, 10), []);
  }
  for (const p of publicaciones) {
    const date = (p.programadaEn ?? p.publicadaEn ?? "").slice(0, 10);
    if (date >= weekStart && date <= weekEnd && byDay.has(date)) {
      byDay.get(date)!.push(p);
    }
  }
  // Sort each day's publications by time
  for (const arr of byDay.values()) {
    arr.sort((a, b) => {
      const aDate = a.programadaEn ?? a.publicadaEn ?? a.actualizadaEn;
      const bDate = b.programadaEn ?? b.publicadaEn ?? b.actualizadaEn;
      return aDate.localeCompare(bDate);
    });
  }

  const todayIso = today.toISOString().slice(0, 10);

  return (
    <div>
      {/* Week label */}
      <div style={{
        fontFamily:   T.mono,
        fontSize:     T.sz.xs,
        color:        C.inkFaint,
        marginBottom: S[3],
      }}>
        Semana del{" "}
        {weekDays[0].toLocaleDateString("es-CO", { day: "numeric", month: "long" })}{" "}
        al{" "}
        {weekDays[6].toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}
      </div>

      {/* 7-column calendar grid */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "repeat(7, 1fr)",
        gap:                 S[2],
        alignItems:          "start",
      }}>
        {weekDays.map(d => {
          const iso   = d.toISOString().slice(0, 10);
          const items = byDay.get(iso) ?? [];
          const isToday = iso === todayIso;

          return (
            <div key={iso} style={{
              background:   isToday ? `${C.blueDark}06` : C.white,
              border:       `1px solid ${isToday ? C.blueDark + "40" : C.line}`,
              borderRadius: R.xl,
              overflow:     "hidden",
              minHeight:    120,
            }}>
              {/* Day header */}
              <div style={{
                padding:     `${S[2]}px ${S[2]}px`,
                borderBottom: `1px solid ${isToday ? C.blueDark + "30" : C.line}`,
                background:   isToday ? `${C.blueDark}10` : C.surfaceAlt,
                textAlign:   "center",
              }}>
                <div style={{
                  fontFamily:  T.mono,
                  fontSize:    T.sz.xs,
                  color:       isToday ? C.blueDark : C.inkMid,
                  fontWeight:  T.wt.semibold,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}>
                  {d.toLocaleDateString("es-CO", { weekday: "short" })}
                </div>
                <div style={{
                  fontFamily: T.mono,
                  fontSize:   T.sz.lg ?? T.sz.sm,
                  fontWeight: T.wt.bold,
                  color:      isToday ? C.blueDark : C.ink,
                  lineHeight: 1.2,
                }}>
                  {d.getDate()}
                </div>
              </div>

              {/* Publications for this day */}
              <div style={{ padding: S[2], display: "flex", flexDirection: "column", gap: S[1] }}>
                {items.length === 0 ? (
                  <div style={{
                    fontFamily: T.mono,
                    fontSize:   T.sz["2xs"],
                    color:      C.inkGhost ?? C.inkFaint,
                    textAlign:  "center",
                    padding:    `${S[3]}px 0`,
                  }}>
                    Sin contenido
                  </div>
                ) : (
                  items.map(item => {
                    const canales   = editorialCanales(item.canales);
                    const mainCanal = canales[0] ?? "";
                    const dot       = estadoToDot(item.estado);
                    const dateStr   = item.programadaEn ?? item.publicadaEn ?? "";

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelect(item)}
                        style={{
                          display:      "flex",
                          alignItems:   "flex-start",
                          gap:          4,
                          padding:      "4px 5px",
                          borderRadius: R.md,
                          background:   estadoToBg(item.estado),
                          border:       `1px solid ${dot}20`,
                          cursor:       "pointer",
                          textAlign:    "left",
                          width:        "100%",
                          transition:   "background 0.1s",
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${dot}20`; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = estadoToBg(item.estado); }}
                      >
                        <ChannelLogo canal={mainCanal} size={14} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontFamily:   T.mono,
                            fontSize:     8,
                            fontWeight:   T.wt.semibold,
                            color:        C.inkFaint,
                            marginBottom: 1,
                            fontVariantNumeric: "tabular-nums",
                          }}>
                            {dateStr ? fmtTime(dateStr) : "—"}
                          </div>
                          <div style={{
                            fontFamily:   T.mono,
                            fontSize:     9,
                            color:        C.ink,
                            overflow:     "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace:   "nowrap",
                            lineHeight:   1.3,
                          }}>
                            {item.titulo}
                          </div>
                        </div>
                        <span style={{
                          width:        6,
                          height:       6,
                          borderRadius: R.pill,
                          background:   dot,
                          flexShrink:   0,
                          marginTop:    3,
                        }} />
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Drawer — paso row (Canal → Estado pattern) ────────────────────────────────

function PasoRow({ paso }: { paso: PublicacionPaso }) {
  const canalLabel = PUBLICACION_CANAL_LABEL[paso.canal] ?? paso.canal;
  const dot        = estadoToDot(paso.estado);
  const estadoLabel = PUBLICACION_ESTADO_LABEL[paso.estado];

  // Skip non-editorial channels
  if (!EDITORIAL_CANALES.has(paso.canal)) return null;

  return (
    <div style={{
      padding:      `${S[3]}px`,
      marginBottom: S[2],
      background:   estadoToBg(paso.estado),
      border:       `1px solid ${dot}20`,
      borderLeft:   `3px solid ${dot}`,
      borderRadius: R.lg,
    }}>
      {/* Canal → Estado (primary row) */}
      <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
        <ChannelLogo canal={paso.canal} size={18} />
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
          {canalLabel}
        </span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>→</span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: dot }}>
          {estadoLabel}
        </span>
        <div style={{ flex: 1 }} />
        {paso.urlPublica && (
          <span style={{
            fontFamily:   T.mono,
            fontSize:     T.sz["2xs"],
            color:        C.blueDark,
            background:   `${C.blueDark}10`,
            border:       `1px solid ${C.blueDark}30`,
            borderRadius: R.pill,
            padding:      "1px 7px",
          }}>
            Ver publicación →
          </span>
        )}
      </div>

      {/* Error message */}
      {paso.error && (
        <div style={{
          fontFamily:   T.mono,
          fontSize:     T.sz.xs,
          color:        C.red ?? "#dc2626",
          marginTop:    S[1],
          padding:      `${S[1]}px ${S[2]}px`,
          background:   `${C.red ?? "#dc2626"}10`,
          borderRadius: R.md,
        }}>
          {paso.error}
        </div>
      )}

      {/* Dates */}
      <div style={{ display: "flex", gap: S[4], marginTop: paso.error ? S[1] : 4 }}>
        {paso.completadoEn && (
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
            Publicado {fmtDate(paso.completadoEn)}
          </span>
        )}
        {paso.programadoEn && !paso.completadoEn && (
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
            Programado {fmtDate(paso.programadoEn)}
          </span>
        )}
        {paso.intentos > 1 && (
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
            {paso.intentos} intentos
          </span>
        )}
      </div>

      {/* Per-channel metrics (when available) */}
      {paso.metricas && (paso.metricas.alcance != null || paso.metricas.interacciones != null) && (
        <div style={{
          display:    "flex",
          gap:        S[4],
          marginTop:  S[1],
          paddingTop: S[1],
          borderTop:  `1px solid ${dot}20`,
        }}>
          {paso.metricas.alcance != null && (
            <div>
              <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>Alcance </span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink }}>
                {fmtMetric(paso.metricas.alcance)}
              </span>
            </div>
          )}
          {paso.metricas.reproducciones != null && (
            <div>
              <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>Reprod. </span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink }}>
                {fmtMetric(paso.metricas.reproducciones)}
              </span>
            </div>
          )}
          {paso.metricas.interacciones != null && (
            <div>
              <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>Interac. </span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink }}>
                {fmtMetric(paso.metricas.interacciones)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Drawer helper row ──────────────────────────────────────────────────────────

function DrawerRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{
      display:      "flex",
      alignItems:   "flex-start",
      gap:          S[3],
      padding:      `${S[1]}px 0`,
      borderBottom: `1px solid ${C.line}`,
    }}>
      <span style={{
        fontFamily: T.mono,
        fontSize:   T.sz.xs,
        color:      C.inkFaint,
        minWidth:   110,
        flexShrink: 0,
        fontWeight: T.wt.medium,
        paddingTop: 2,
      }}>
        {label}
      </span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink }}>
        {value}
      </span>
    </div>
  );
}

// ── Drawer ─────────────────────────────────────────────────────────────────────

function ItemDrawer({
  item,
  orgSlug,
  onClose,
}: {
  item:    PublicacionItem;
  orgSlug: string;
  onClose: () => void;
}) {
  const variant  = estadoToVariant(item.estado);
  const canales  = editorialCanales(item.canales);
  const origenLabel =
    item.origen === "campaña"    ? "Contenido orgánico"
    : item.origen === "producto" ? "Producto"
    : item.origen === "catalogo" ? "Catálogo"
    : item.origen === "automatico" ? "Automatización"
    : "Manual";

  const drawerActions = [
    {
      label:   "Ir a Conexiones",
      href:    `/${orgSlug}/agentik/marketing-studio/connections`,
      primary: false,
    },
    ...(item.estado === "programada" ? [{
      label:   "Ver contenido de origen",
      href:    `/${orgSlug}/agentik/marketing-studio/campaigns`,
      primary: false,
    }] : []),
  ];

  const tipoLabel = getTipoLabel(item.tipo, item.origen);

  return (
    <MSDrawer onClose={onClose}>
      <MSDrawerHeader
        name={item.titulo}
        sku={`${tipoLabel} · ${canales.length} canal${canales.length !== 1 ? "es" : ""}`}
        category={origenLabel}
        domainColor={MS_PALETTE.product.primary}
        statusVariant={variant}
        statusLabel={PUBLICACION_ESTADO_LABEL[item.estado]}
        readinessScore={item.progreso}
        onClose={onClose}
      />

      {/* ── Vista previa ── */}
      {item.miniatura ? (
        <div style={{ padding: `${S[4]}px ${S[5]}px 0` }}>
          <div style={{
            borderRadius:   R.xl,
            overflow:       "hidden",
            border:         `1px solid ${C.line}`,
            background:     C.surfaceAlt,
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.miniatura}
              alt={item.titulo}
              style={{ width: "100%", maxHeight: 220, objectFit: "cover", display: "block" }}
            />
          </div>
        </div>
      ) : (
        <div style={{ padding: `${S[4]}px ${S[5]}px 0` }}>
          <div style={{
            height:          160,
            borderRadius:    R.xl,
            overflow:        "hidden",
            border:          `1px dashed ${C.line}`,
            background:      C.surfaceAlt,
            display:         "flex",
            alignItems:      "center",
            justifyContent:  "center",
            gap:             S[3],
          }}>
            <ChannelLogo canal={canales[0] ?? ""} size={36} />
            <div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
                {tipoLabel}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: 2 }}>
                Vista previa no disponible
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Resumen ── */}
      <MSDrawerSection title="Resumen">
        <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
          <DrawerRow label="Estado"          value={<EstadoBadge estado={item.estado} />} />
          <DrawerRow label="Origen"          value={origenLabel} />
          {item.programadaEn && (
            <DrawerRow label="Programada para" value={fmtDate(item.programadaEn)} />
          )}
          {item.publicadaEn && (
            <DrawerRow label="Fecha publicación" value={fmtDate(item.publicadaEn)} />
          )}
          <DrawerRow label="Última actualiz." value={fmtDate(item.actualizadaEn)} />
          <DrawerRow label="Progreso"         value={`${item.progreso}%`} />
        </div>
      </MSDrawerSection>

      {/* ── Canales editoriales ── */}
      {canales.length > 0 && (
        <MSDrawerSection title="Plataformas">
          <div style={{ display: "flex", flexWrap: "wrap", gap: S[2] }}>
            {canales.map(c => (
              <div key={c} style={{
                display:      "flex",
                alignItems:   "center",
                gap:          S[2],
                padding:      `${S[2]}px ${S[3]}px`,
                background:   C.white,
                border:       `1px solid ${C.line}`,
                borderRadius: R.lg,
              }}>
                <ChannelLogo canal={c} size={18} />
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, fontWeight: T.wt.medium }}>
                  {PUBLICACION_CANAL_LABEL[c] ?? c}
                </span>
              </div>
            ))}
          </div>
        </MSDrawerSection>
      )}

      {/* ── Distribución por plataforma (Canal → Estado) ── */}
      <MSDrawerSection title="Distribución por plataforma">
        {item.pasos.filter(p => EDITORIAL_CANALES.has(p.canal)).length > 0 ? (
          item.pasos.map(paso => (
            <PasoRow key={paso.id} paso={paso} />
          ))
        ) : (
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, fontStyle: "italic" }}>
            Sin canales editoriales configurados.
          </div>
        )}
      </MSDrawerSection>

      {/* ── Historial ── */}
      <MSDrawerSection title="Historial">
        <div style={{ display: "flex", flexDirection: "column", gap: S[1] }}>
          {[
            { label: "Creada",       ts: item.actualizadaEn     },
            ...(item.programadaEn ? [{ label: "Programada",  ts: item.programadaEn }] : []),
            ...(item.publicadaEn  ? [{ label: "Publicada",   ts: item.publicadaEn  }] : []),
          ].map(({ label, ts }) => (
            <div key={label} style={{
              display:      "flex",
              alignItems:   "center",
              gap:          S[3],
              padding:      `${S[1]}px 0`,
              borderBottom: `1px solid ${C.line}`,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: R.pill,
                background: C.blueDark, flexShrink: 0,
              }} />
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, flex: 1 }}>
                {label}
              </span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                {fmtDate(ts)}
              </span>
            </div>
          ))}
        </div>
      </MSDrawerSection>

      {/* ── Métricas ── */}
      {(item.alcance != null || item.reproducciones != null || item.interacciones != null) ? (
        <MSDrawerSection title="Métricas">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: S[3] }}>
            {item.alcance != null && (
              <div style={{
                padding: `${S[3]}px`, background: C.surfaceAlt,
                border: `1px solid ${C.line}`, borderRadius: R.lg,
              }}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginBottom: S[1] }}>Alcance</div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink }}>
                  {fmtMetric(item.alcance)}
                </div>
              </div>
            )}
            {item.reproducciones != null && (
              <div style={{
                padding: `${S[3]}px`, background: C.surfaceAlt,
                border: `1px solid ${C.line}`, borderRadius: R.lg,
              }}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginBottom: S[1] }}>Reproducciones</div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink }}>
                  {fmtMetric(item.reproducciones)}
                </div>
              </div>
            )}
            {item.interacciones != null && (
              <div style={{
                padding: `${S[3]}px`, background: C.surfaceAlt,
                border: `1px solid ${C.line}`, borderRadius: R.lg,
              }}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginBottom: S[1] }}>Interacciones</div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink }}>
                  {fmtMetric(item.interacciones)}
                </div>
              </div>
            )}
          </div>
        </MSDrawerSection>
      ) : (
        <MSDrawerSection title="Métricas">
          <div style={{
            fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
            fontStyle: "italic", padding: `${S[2]}px 0`,
          }}>
            Las métricas estarán disponibles al conectar la plataforma de origen.
          </div>
        </MSDrawerSection>
      )}

      {/* ── Acciones operativas ── */}
      <MSDrawerSection title="Acciones disponibles">
        <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
          {[
            { label: "Editar",               available: item.estado !== "publicada" && item.estado !== "cancelada" },
            { label: "Reprogramar",          available: item.estado === "programada" || item.estado === "error" },
            { label: "Duplicar",             available: true },
            { label: "Pausar publicación",   available: item.estado === "programada" },
            { label: "Cancelar",             available: item.estado !== "publicada" && item.estado !== "cancelada" },
            { label: "Abrir en plataforma",  available: item.estado === "publicada" },
            { label: "Ver historial completo", available: true },
          ]
            .filter(a => a.available)
            .map(a => (
              <div key={a.label} style={{
                display:        "flex",
                alignItems:     "center",
                justifyContent: "space-between",
                padding:        `${S[2]}px ${S[3]}px`,
                background:     C.surfaceAlt,
                border:         `1px solid ${C.line}`,
                borderRadius:   R.lg,
                fontFamily:     T.mono,
                fontSize:       T.sz.sm,
                color:          C.ink,
                cursor:         "pointer",
              }}>
                <span>{a.label}</span>
                <span style={{ color: C.inkFaint, fontSize: T.sz.xs }}>→</span>
              </div>
            ))
          }
        </div>
        <div style={{
          fontFamily: T.mono,
          fontSize:   T.sz["2xs"],
          color:      C.inkGhost ?? C.inkFaint,
          marginTop:  S[3],
          fontStyle:  "italic",
        }}>
          Las acciones requieren confirmación. Todas las operaciones son auditadas.
        </div>
      </MSDrawerSection>

      {/* ── Luca — always visible ── */}
      <MSDrawerSection title="Recomendaciones de Luca">
        {item.tieneErrores ? (
          <div style={{
            padding:      `${S[3]}px`,
            background:   `${C.amber ?? "#d97706"}10`,
            border:       `1px solid ${C.amber ?? "#d97706"}40`,
            borderRadius: R.lg,
            fontFamily:   T.mono,
            fontSize:     T.sz.sm,
            color:        C.ink,
            lineHeight:   1.6,
          }}>
            ⚠️ Algunos canales presentan errores. Revisa las credenciales en{" "}
            <strong>Conexiones</strong> y verifica que las cuentas estén activas.
            Puedes reprogramar una vez resueltos los errores.
          </div>
        ) : item.estado === "publicada" ? (
          <div style={{
            padding:      `${S[3]}px`,
            background:   `${C.green ?? "#16a34a"}10`,
            border:       `1px solid ${C.green ?? "#16a34a"}40`,
            borderRadius: R.lg,
            fontFamily:   T.mono,
            fontSize:     T.sz.sm,
            color:        C.ink,
            lineHeight:   1.6,
          }}>
            ✓ Esta publicación está activa. Si tuvo buen desempeño, considera reutilizar
            el contenido en otros canales o impulsarlo mediante <strong>Anuncios</strong>.
          </div>
        ) : item.estado === "programada" ? (
          <div style={{
            padding:      `${S[3]}px`,
            background:   `${C.blueDark}08`,
            border:       `1px solid ${C.blueDark}30`,
            borderRadius: R.lg,
            fontFamily:   T.mono,
            fontSize:     T.sz.sm,
            color:        C.ink,
            lineHeight:   1.6,
          }}>
            📅 Publicación programada. Verifica que los canales estén conectados y las
            credenciales estén vigentes para evitar interrupciones en la ejecución.
          </div>
        ) : (
          <div style={{
            padding:      `${S[3]}px`,
            background:   C.surfaceAlt,
            border:       `1px solid ${C.line}`,
            borderRadius: R.lg,
            fontFamily:   T.mono,
            fontSize:     T.sz.sm,
            color:        C.inkMid,
            lineHeight:   1.6,
          }}>
            Sin recomendaciones específicas para este elemento en este momento.
          </div>
        )}
      </MSDrawerSection>

      <MSDrawerFooter actions={drawerActions} />
    </MSDrawer>
  );
}

// ── Tab button ─────────────────────────────────────────────────────────────────

function TabButton({
  active,
  label,
  onClick,
}: {
  active:  boolean;
  label:   string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding:      `${S[2]}px ${S[4]}px`,
        borderRadius: R.lg,
        border:       active ? `1.5px solid ${C.blueDark}` : `1px solid ${C.line}`,
        background:   active ? C.blueDark : C.white,
        color:        active ? "#fff" : C.inkMid,
        fontFamily:   T.mono,
        fontSize:     T.sz.xs,
        fontWeight:   active ? T.wt.semibold : T.wt.medium,
        cursor:       "pointer",
        transition:   "all 0.12s",
      }}
    >
      {label}
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function PublicacionesClient({
  orgSlug,
  initialData,
}: PublicacionesClientProps) {
  const [data, setData]              = useState<PublicacionesApiResponse>(initialData);
  const [activeTab, setActiveTab]    = useState<"lista" | "calendario">("lista");
  const [showAllActivas, setShowAllActivas]       = useState(false);
  const [showAllProgramadas, setShowAllProgramadas] = useState(false);
  const [showAllAtencion, setShowAllAtencion]       = useState(false);
  const [selected, setSelected]      = useState<PublicacionItem | null>(null);
  const [isPending, startTransition] = useTransition();

  const refresh = useCallback(() => {
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/orgs/${orgSlug}/marketing-studio/publicaciones`,
          { cache: "no-store" },
        );
        if (res.ok) setData(await res.json());
      } catch {
        // Non-fatal — show stale data
      }
    });
  }, [orgSlug]);

  // ── Categorize via ContentRankingService — no inline business logic ──
  const activas     = data.publicaciones.filter(p => p.estado === "publicada");
  const programadas = data.publicaciones.filter(p => p.estado === "programada");
  const atencion    = getRequierenAtencion(data.publicaciones);
  const destacadas  = getContenidoDestacado(data.publicaciones, 4);

  const MAX = 4;
  const activasShown     = showAllActivas     ? activas     : activas.slice(0, MAX);
  const programadasShown = showAllProgramadas ? programadas : programadas.slice(0, MAX);
  const atencionShown    = showAllAtencion    ? atencion    : atencion.slice(0, MAX);

  return (
    <div style={{ fontFamily: T.mono }}>

      {/* ── 1. Estado editorial ── */}
      <EstadoEditorial resumen={data.resumen} syncedAt={data.ultimaSincronizacion} />

      {/* ── 2. KPI strip ── */}
      <KPIStrip resumen={data.resumen} />

      {/* ── 3. Luca Marketing ── */}
      <LucaMarketing publicaciones={data.publicaciones} />

      {/* ── 4. Tab bar + refresh ── */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        marginBottom:   S[5],
      }}>
        <div style={{ display: "flex", gap: S[2] }}>
          <TabButton active={activeTab === "lista"}      label="Lista"               onClick={() => setActiveTab("lista")} />
          <TabButton active={activeTab === "calendario"} label="Calendario semanal"  onClick={() => setActiveTab("calendario")} />
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={isPending}
          style={{
            padding:      `${S[1]}px ${S[3]}px`,
            borderRadius: R.pill,
            border:       `1px solid ${C.line}`,
            background:   C.white,
            color:        isPending ? C.inkFaint : C.inkMid,
            fontFamily:   T.mono,
            fontSize:     T.sz.xs,
            cursor:       isPending ? "wait" : "pointer",
          }}
        >
          {isPending ? "Actualizando…" : "↻ Actualizar"}
        </button>
      </div>

      {/* ── 5. Content ── */}
      {activeTab === "lista" ? (
        <>
          {/* Block A — Publicadas */}
          <BlockSection>
            <BlockHeader
              title="Publicaciones activas"
              count={activas.length}
              accentColor={C.green ?? "#16a34a"}
              action={
                activas.length > MAX
                  ? { label: `Ver todas (${activas.length})`, onClick: () => setShowAllActivas(s => !s) }
                  : undefined
              }
            />
            {activas.length === 0 ? (
              <EmptyBlock
                msg="Aún no hay publicaciones activas."
                accentColor={C.green ?? "#16a34a"}
              />
            ) : (
              <CardGrid>
                {activasShown.map(item => (
                  <CardActiva key={item.id} item={item} onClick={setSelected} />
                ))}
              </CardGrid>
            )}
          </BlockSection>

          {/* Block Destacadas — ordered by performance */}
          <BlockSection>
            <BlockHeader
              title="Contenido destacado"
              count={destacadas.length}
              accentColor="#f59e0b"
            />
            {destacadas.length === 0 ? (
              <EmptyBlock
                msg="Aún no hay contenido activo para destacar."
                accentColor="#f59e0b"
              />
            ) : (
              <CardGrid>
                {destacadas.map((item, idx) => (
                  <CardDestacada
                    key={item.id}
                    item={item}
                    rank={idx + 1}
                    onClick={setSelected}
                  />
                ))}
              </CardGrid>
            )}
          </BlockSection>

          {/* Block B — Programadas */}
          <BlockSection>
            <BlockHeader
              title="Programadas"
              count={programadas.length}
              accentColor={C.blueDark}
              action={
                programadas.length > MAX
                  ? { label: `Ver todas (${programadas.length})`, onClick: () => setShowAllProgramadas(s => !s) }
                  : {
                      label: "Ver calendario",
                      onClick: () => setActiveTab("calendario"),
                    }
              }
            />
            {programadas.length === 0 ? (
              <EmptyBlock
                msg="No hay publicaciones programadas."
                accentColor={C.blueDark}
              />
            ) : (
              <CardGrid>
                {programadasShown.map(item => (
                  <CardProgramada key={item.id} item={item} onClick={setSelected} />
                ))}
              </CardGrid>
            )}
          </BlockSection>

          {/* Block C — Requieren atención (always visible) */}
          <BlockSection>
            <BlockHeader
              title="Requieren atención"
              count={atencion.length}
              accentColor={C.amber ?? "#d97706"}
              action={
                atencion.length > MAX
                  ? { label: `Ver todas (${atencion.length})`, onClick: () => setShowAllAtencion(s => !s) }
                  : undefined
              }
            />
            {atencion.length === 0 ? (
              <EmptyBlock
                msg="No existen elementos que requieran atención."
                accentColor={C.green ?? "#16a34a"}
              />
            ) : (
              <CardGrid>
                {atencionShown.map(item => (
                  <CardAtencion key={item.id} item={item} onClick={setSelected} />
                ))}
              </CardGrid>
            )}
          </BlockSection>
        </>
      ) : (
        <div style={{ marginBottom: S[6] }}>
          <CalendarioView
            publicaciones={data.publicaciones}
            onSelect={setSelected}
          />
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{
        display:    "flex",
        alignItems: "center",
        gap:        S[3],
        paddingTop: S[4],
        borderTop:  `1px solid ${C.lineSubtle ?? C.line}`,
        fontFamily: T.mono,
        fontSize:   T.sz.xs,
        color:      C.inkFaint,
      }}>
        <span>{data.resumen.total} publicación{data.resumen.total !== 1 ? "es" : ""} en total</span>
        <span>·</span>
        <span>Canales editoriales: Instagram, Facebook, TikTok, YouTube</span>
        <div style={{ flex: 1 }} />
        <span>Última actualización: {fmtRelativeSync(data.ultimaSincronizacion)}</span>
      </div>

      {/* ── Drawer ── */}
      {selected && (
        <ItemDrawer
          item={selected}
          orgSlug={orgSlug}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
