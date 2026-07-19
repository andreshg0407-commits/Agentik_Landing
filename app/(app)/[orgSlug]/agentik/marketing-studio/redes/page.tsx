/**
 * /[orgSlug]/agentik/marketing-studio/redes
 *
 * AGENTIK-MARKETING-PUBLISHING-UX-03 — Polish premium del centro operativo de distribución
 *
 * No backend changes. No logic changes. No rails touched.
 * Pure UX/visual polish sprint.
 *
 * Data: PLACEHOLDER — replace with real social runtime when channels connected.
 */

import Link                           from "next/link";
import { redirect }                   from "next/navigation";
import { requireOrgAccess }           from "@/lib/auth/org-access";
import { canAccessMarketingStudio }   from "@/lib/auth/module-access";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { C, T, S, R, E }             from "@/lib/ui/tokens";

// ── Types ─────────────────────────────────────────────────────────────────────

type PostStatus    = "programado" | "publicado" | "borrador" | "fallido" | "pendiente_revision";
type ChannelStatus = "connected"  | "disconnected" | "syncing" | "error";
type ContentType   = "foto" | "video" | "reel" | "story" | "carrusel";

interface ContentPost {
  id:         string;
  title:      string;
  type:       ContentType;
  channels:   string[];
  status:     PostStatus;
  scheduled?: string;
  reach?:     string;
  likes?:     number;
}

interface ChannelDef {
  id:      string;
  label:   string;
  status:  ChannelStatus;
  future?: boolean;
}

// ── PLACEHOLDER data ──────────────────────────────────────────────────────────

// PLACEHOLDER — replace with real connector status from tenant-connector-manager.ts
const CHANNELS: ChannelDef[] = [
  { id: "instagram", label: "Instagram", status: "disconnected"               },
  { id: "facebook",  label: "Facebook",  status: "disconnected"               },
  { id: "tiktok",    label: "TikTok",    status: "disconnected"               },
  { id: "youtube",   label: "YouTube",   status: "disconnected"               },
  { id: "whatsapp",  label: "WhatsApp",  status: "disconnected", future: true },
  { id: "shopify",   label: "Shopify",   status: "disconnected", future: true },
];

// PLACEHOLDER — replace with real PublishingSession data from publishing engine
const MOCK_POSTS: ContentPost[] = [
  { id: "1", title: "Conjunto dinosaurio azul — campaña primavera",  type: "foto",     channels: ["instagram", "facebook"], status: "programado",        scheduled: "Hoy · 6:00 PM"     },
  { id: "2", title: "Unboxing sandalias verano kids",                 type: "reel",     channels: ["instagram", "tiktok"],   status: "programado",        scheduled: "Mañana · 10:00 AM" },
  { id: "3", title: "Colección nueva — lookbook infantil",            type: "carrusel", channels: ["instagram"],             status: "borrador"                                           },
  { id: "4", title: "Pijama cargo beige — antes y después",          type: "video",    channels: ["tiktok"],                status: "borrador"                                           },
  { id: "5", title: "Body floral bebé — fondo blanco studio",        type: "foto",     channels: ["instagram"],             status: "publicado",         reach: "4,200", likes: 312      },
  { id: "6", title: "Reels calzado artesanal temporada",             type: "reel",     channels: ["instagram"],             status: "publicado",         reach: "8,900", likes: 1240     },
  { id: "7", title: "Pijama térmica montaña — pendiente aprobación", type: "foto",     channels: ["facebook", "instagram"], status: "pendiente_revision"                                 },
];

// ── Brand SVG logos ───────────────────────────────────────────────────────────

function ChannelLogo({ id, size = 24 }: { id: string; size?: number }) {
  const s = size;
  if (id === "instagram") return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-label="Instagram">
      <rect width="24" height="24" rx="6" fill="#E1306C"/>
      <rect x="6" y="6" width="12" height="12" rx="3" stroke="white" strokeWidth="1.8" fill="none"/>
      <circle cx="12" cy="12" r="3.2" stroke="white" strokeWidth="1.8" fill="none"/>
      <circle cx="17" cy="7" r="1" fill="white"/>
    </svg>
  );
  if (id === "facebook") return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-label="Facebook">
      <rect width="24" height="24" rx="6" fill="#1877F2"/>
      <path d="M13.5 8.5H15V6H13.5C11.84 6 10.5 7.34 10.5 9V10.5H9V13H10.5V19H13V13H14.5L15 10.5H13V9C13 8.72 13.22 8.5 13.5 8.5Z" fill="white"/>
    </svg>
  );
  if (id === "tiktok") return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-label="TikTok">
      <rect width="24" height="24" rx="6" fill="#010101"/>
      <path d="M16.5 7.5C15.67 7.5 14.92 7.15 14.38 6.59V13.75C14.38 15.82 12.7 17.5 10.63 17.5C8.56 17.5 6.88 15.82 6.88 13.75C6.88 11.68 8.56 10 10.63 10C10.84 10 11.04 10.02 11.25 10.06V12.32C11.05 12.27 10.84 12.25 10.63 12.25C9.8 12.25 9.13 12.92 9.13 13.75C9.13 14.58 9.8 15.25 10.63 15.25C11.46 15.25 12.13 14.58 12.13 13.75V6H14.38C14.55 7.36 15.4 8.5 16.5 8.5V7.5Z" fill="white"/>
    </svg>
  );
  if (id === "youtube") return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-label="YouTube">
      <rect width="24" height="24" rx="6" fill="#FF0000"/>
      <path d="M19 8.5C18.8 7.7 18.2 7.1 17.4 6.9C15.9 6.5 12 6.5 12 6.5C12 6.5 8.1 6.5 6.6 6.9C5.8 7.1 5.2 7.7 5 8.5C4.6 10 4.6 12 4.6 12C4.6 12 4.6 14 5 15.5C5.2 16.3 5.8 16.9 6.6 17.1C8.1 17.5 12 17.5 12 17.5C12 17.5 15.9 17.5 17.4 17.1C18.2 16.9 18.8 16.3 19 15.5C19.4 14 19.4 12 19.4 12C19.4 12 19.4 10 19 8.5Z" fill="#FF0000"/>
      <polygon points="10,9.5 15,12 10,14.5" fill="white"/>
    </svg>
  );
  if (id === "whatsapp") return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-label="WhatsApp">
      <rect width="24" height="24" rx="6" fill="#25D366"/>
      <path d="M12 4.5C7.86 4.5 4.5 7.86 4.5 12C4.5 13.44 4.9 14.79 5.6 15.94L4.5 19.5L8.15 18.41C9.27 19.07 10.59 19.45 12 19.45C16.14 19.45 19.5 16.09 19.5 11.95C19.5 7.81 16.14 4.5 12 4.5ZM15.6 14.7C15.42 15.14 14.66 15.54 14.3 15.58C13.94 15.62 13.61 15.74 11.88 15.07C9.82 14.27 8.53 12.18 8.43 12.04C8.33 11.9 7.64 10.97 7.64 10.01C7.64 9.05 8.13 8.58 8.32 8.38C8.51 8.18 8.73 8.13 8.87 8.13C9.01 8.13 9.15 8.13 9.27 8.14C9.41 8.15 9.59 8.09 9.77 8.5C9.95 8.91 10.38 9.86 10.44 9.96C10.5 10.06 10.54 10.18 10.47 10.32C10.4 10.46 10.36 10.55 10.26 10.66C10.16 10.77 10.05 10.91 9.96 11C9.86 11.1 9.75 11.21 9.87 11.41C9.99 11.61 10.37 12.24 10.95 12.76C11.69 13.43 12.3 13.64 12.5 13.74C12.7 13.84 12.82 13.82 12.94 13.68C13.06 13.54 13.42 13.1 13.55 12.9C13.68 12.7 13.81 12.73 13.99 12.8C14.17 12.87 15.12 13.34 15.32 13.44C15.52 13.54 15.65 13.59 15.71 13.67C15.78 13.81 15.78 14.26 15.6 14.7Z" fill="white"/>
    </svg>
  );
  if (id === "shopify") return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-label="Shopify">
      <rect width="24" height="24" rx="6" fill="#96BF48"/>
      <path d="M15.5 7.2L14.5 7C14.4 6.4 14 5 12.8 5C12.5 5.1 12.2 5.3 12 5.5C11.7 5.3 11.3 5 10.8 5C9.5 5 8.8 6.5 8.6 7.4L7 7.9L6.5 17.8L16 19L18 7.7L15.5 7.2ZM12 6.1C12.2 6 12.4 6 12.6 6.2C12.3 6.5 12.1 7 11.9 7.5L11 7.7C11.2 7 11.6 6.3 12 6.1ZM10.8 6.1C11.1 5.9 11.3 6 11.5 6.2C11.1 6.5 10.8 7.2 10.6 7.9L9.5 8.2C9.7 7.3 10.2 6.3 10.8 6.1Z" fill="white"/>
      <path d="M12.5 15C12.5 15 12 15.2 11.5 15.2C10.7 15.2 10.3 14.7 10.3 14.3C10.3 13.5 11.1 13.2 11.1 13.2V12.4C10.1 12.6 9 13.3 9 14.4C9 15.7 10 16.3 11 16.3C12.2 16.3 13 15.5 13 15.5L12.5 15Z" fill="white"/>
    </svg>
  );
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="6" fill={C.inkGhost}/>
    </svg>
  );
}

// ── Config maps ───────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<ContentType, { abbr: string; label: string; color: string }> = {
  foto:     { abbr: "FT", label: "Foto",     color: C.blueDark },
  video:    { abbr: "VD", label: "Video",    color: "#7c3aed"  },
  reel:     { abbr: "RL", label: "Reel",     color: "#E1306C"  },
  story:    { abbr: "ST", label: "Historia", color: "#F59E0B"  },
  carrusel: { abbr: "CR", label: "Carrusel", color: "#059669"  },
};

const CHANNEL_ACCENT: Record<string, string> = {
  instagram: "#E1306C",
  facebook:  "#1877F2",
  tiktok:    "#555555",
  youtube:   "#FF0000",
  whatsapp:  "#25D366",
  shopify:   "#96BF48",
};

// icon: small unicode indicator per status
const POST_STATUS_CONFIG: Record<PostStatus, {
  label:  string;
  icon:   string;
  accent: string;
  bg:     string;
  text:   string;
}> = {
  programado:         { label: "Programado",         icon: "▸", accent: C.blueDark,  bg: C.blueLight,  text: C.blueDark  },
  publicado:          { label: "Publicado",           icon: "✓", accent: C.greenDark, bg: C.greenLight,  text: C.greenDark },
  borrador:           { label: "Borrador",            icon: "◌", accent: C.inkFaint,  bg: C.surfaceAlt, text: C.inkFaint  },
  fallido:            { label: "Error",               icon: "✕", accent: C.red,       bg: C.redLight,   text: C.red       },
  pendiente_revision: { label: "Pendiente revisión",  icon: "◐", accent: "#C2410C",   bg: "#FFF7ED",    text: "#92400E"   },
};

const CHANNEL_STATUS_CFG: Record<ChannelStatus, { label: string; dot: string; color: string }> = {
  connected:    { label: "Conectado",     dot: C.green,    color: C.greenDark },
  disconnected: { label: "Sin conectar",  dot: C.inkGhost, color: C.inkFaint  },
  syncing:      { label: "Sincronizando", dot: C.blueDark, color: C.blueDark  },
  error:        { label: "Error",         dot: C.red,      color: C.red       },
};

// ── Channel card — infrastructure node style ──────────────────────────────────

function ChannelCard({ channel }: { channel: ChannelDef }) {
  const sCfg    = CHANNEL_STATUS_CFG[channel.status];
  const accent  = CHANNEL_ACCENT[channel.id] ?? C.inkGhost;

  return (
    <div style={{
      display:    "flex",
      alignItems: "center",
      gap:        S[2] + 2,
      padding:    `${S[2] + 2}px ${S[3]}px`,
      background: C.white,
      border:     `1px solid ${C.line}`,
      borderLeft: `3px solid ${accent}35`,
      borderRadius: R.lg,
      boxShadow:  E.xs,
    }}>
      <ChannelLogo id={channel.id} size={24} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily:  T.mono,
          fontSize:    T.sz.xs,
          fontWeight:  T.wt.bold,
          color:       channel.future ? C.inkFaint : C.ink,
          lineHeight:  1.2,
        }}>
          {channel.label}
        </div>
        <div style={{
          display:    "flex",
          alignItems: "center",
          gap:        4,
          marginTop:  3,
        }}>
          <span style={{
            width:        5,
            height:       5,
            borderRadius: "50%",
            background:   channel.future ? C.inkGhost : sCfg.dot,
            display:      "inline-block",
            flexShrink:   0,
          }} />
          <span style={{ fontFamily: T.mono, fontSize: 9, color: sCfg.color, letterSpacing: "0.02em" }}>
            {channel.future ? "Próximamente" : sCfg.label}
          </span>
        </div>
      </div>
      {channel.future && (
        <span style={{
          padding:       `1px ${S[1] + 2}px`,
          background:    C.surfaceAlt,
          border:        `1px solid ${C.line}`,
          borderRadius:  R.pill,
          fontFamily:    T.mono,
          fontSize:      9,
          color:         C.inkGhost,
          letterSpacing: "0.05em",
          flexShrink:    0,
        }}>
          SOON
        </span>
      )}
    </div>
  );
}

// ── Content operations row ────────────────────────────────────────────────────

function ContentRow({ post }: { post: ContentPost }) {
  const tCfg = TYPE_CONFIG[post.type];
  const sCfg = POST_STATUS_CONFIG[post.status];

  return (
    <div style={{
      display:      "flex",
      alignItems:   "center",
      gap:          S[3],
      padding:      `${S[3] + 2}px ${S[4]}px ${S[3] + 2}px ${S[3]}px`,
      borderBottom: `1px solid ${C.lineSubtle}`,
      background:   C.white,
      borderLeft:   `3px solid ${sCfg.accent}55`,
    }}>

      {/* Portrait content thumbnail */}
      <div style={{
        width:          40,
        height:         52,
        borderRadius:   R.md,
        background:     tCfg.color + "0D",
        border:         `1px solid ${tCfg.color}1E`,
        display:        "flex",
        flexDirection:  "column" as const,
        alignItems:     "center",
        justifyContent: "center",
        flexShrink:     0,
        overflow:       "hidden",
        position:       "relative" as const,
      }}>
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz.xs,
          fontWeight:    T.wt.black,
          color:         tCfg.color,
          letterSpacing: "0.04em",
        }}>
          {tCfg.abbr}
        </span>
        {/* Type accent bar */}
        <div style={{
          position:     "absolute" as const,
          bottom:       0,
          left:         0,
          right:        0,
          height:       3,
          background:   tCfg.color + "55",
        }} />
      </div>

      {/* Title + metadata */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily:   T.mono,
          fontSize:     T.sz.sm,
          fontWeight:   T.wt.bold,
          color:        C.ink,
          overflow:     "hidden",
          textOverflow: "ellipsis",
          whiteSpace:   "nowrap" as const,
          marginBottom: 5,
          letterSpacing: "-0.01em",
        }}>
          {post.title}
        </div>
        <div style={{ display: "flex", gap: S[1], alignItems: "center", flexWrap: "wrap" as const }}>
          {/* Content type */}
          <span style={{
            fontFamily:    T.mono,
            fontSize:      9,
            color:         tCfg.color,
            fontWeight:    T.wt.bold,
            opacity:       0.8,
            letterSpacing: "0.04em",
            textTransform: "uppercase" as const,
          }}>
            {tCfg.label}
          </span>
          <span style={{ color: C.lineSubtle, fontSize: 9 }}>·</span>
          {/* Channels as soft chips */}
          {post.channels.map(ch => (
            <span key={ch} style={{
              fontFamily:    T.mono,
              fontSize:      9,
              padding:       `1px ${S[1] + 1}px`,
              background:    C.surfaceAlt,
              borderRadius:  R.pill,
              color:         C.inkFaint,
              fontWeight:    T.wt.medium,
              letterSpacing: "0.02em",
            }}>
              {ch.charAt(0).toUpperCase() + ch.slice(1)}
            </span>
          ))}
        </div>
      </div>

      {/* Status pill — icon + label, no border */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        gap:            5,
        padding:        `3px ${S[2] + 2}px`,
        background:     sCfg.bg,
        borderRadius:   R.pill,
        flexShrink:     0,
        minWidth:       130,
        justifyContent: "center",
      }}>
        <span style={{
          fontFamily: T.mono,
          fontSize:   10,
          color:      sCfg.accent,
          lineHeight: 1,
          flexShrink: 0,
        }}>
          {sCfg.icon}
        </span>
        <span style={{
          fontFamily:  T.mono,
          fontSize:    T.sz.xs,
          color:       sCfg.text,
          fontWeight:  T.wt.medium,
          whiteSpace:  "nowrap" as const,
        }}>
          {sCfg.label}
        </span>
      </div>

      {/* Schedule / reach */}
      <div style={{ minWidth: 136, textAlign: "right" as const, flexShrink: 0 }}>
        {post.scheduled && (
          <div style={{
            fontFamily:  T.mono,
            fontSize:    T.sz.xs,
            color:       C.inkMid,
            fontWeight:  T.wt.medium,
          }}>
            {post.scheduled}
          </div>
        )}
        {post.reach && (
          <div style={{
            fontFamily: T.mono,
            fontSize:   T.sz.xs,
            color:      C.inkFaint,
            marginTop:  2,
          }}>
            {post.reach} alcance
          </div>
        )}
        {!post.scheduled && !post.reach && (
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkGhost }}>—</span>
        )}
      </div>

      {/* Engagement */}
      <div style={{ minWidth: 68, textAlign: "right" as const, flexShrink: 0 }}>
        {post.likes != null ? (
          <span style={{
            fontFamily: T.mono,
            fontSize:   T.sz.base,
            fontWeight: T.wt.bold,
            color:      C.greenDark,
          }}>
            {post.likes.toLocaleString()}
            <span style={{ fontSize: 9, color: C.inkFaint, marginLeft: 2, fontWeight: T.wt.normal }}>♥</span>
          </span>
        ) : (
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkGhost }}>—</span>
        )}
      </div>

      {/* CTA — operational action */}
      <button style={{
        padding:      `${S[1] + 1}px ${S[2] + 2}px`,
        background:   C.blueLight,
        border:       `1px solid ${C.blueBorder}`,
        borderRadius: R.sm,
        fontFamily:   T.mono,
        fontSize:     T.sz.xs,
        color:        C.blueDark,
        cursor:       "pointer",
        flexShrink:   0,
        fontWeight:   T.wt.medium,
        whiteSpace:   "nowrap" as const,
      }}>
        Gestionar →
      </button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function RedesSocialesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }    = await params;
  const { membership } = await requireOrgAccess(orgSlug);
  if (!canAccessMarketingStudio(membership.role)) redirect(`/${orgSlug}/agentik`);

  // PLACEHOLDER counts — replace with real DB queries
  const scheduled       = MOCK_POSTS.filter(p => p.status === "programado").length;
  const published       = MOCK_POSTS.filter(p => p.status === "publicado").length;
  const drafts          = MOCK_POSTS.filter(p => p.status === "borrador").length;
  const pendingReview   = MOCK_POSTS.filter(p => p.status === "pendiente_revision").length;

  return (
    <div style={{ maxWidth: 960, fontFamily: T.mono }}>
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Marketing Studio", href: `/${orgSlug}/agentik/marketing-studio` },
          { label: "Publicaciones" },
        ]}
        title="Distribución de Contenido"
        subtitle="Centro operativo de publicación y distribución IA"
        status="ok"
        statusLabel="Motor de distribución · Activo"
      />

      {/* ── Runtime signal strip ──────────────────────────────────────── */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:          S[4],
        padding:      `${S[2] + 1}px ${S[4]}px`,
        background:   C.blueLight,
        border:       `1px solid ${C.blueBorder}`,
        borderRadius: R.md,
        marginBottom: S[6],
        flexWrap:     "wrap" as const,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: S[1] + 1 }}>
          <span style={{
            width:        6,
            height:       6,
            borderRadius: "50%",
            background:   C.green,
            display:      "inline-block",
            boxShadow:    `0 0 0 2px ${C.green}30`,
            flexShrink:   0,
          }} />
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.blueDark, fontWeight: T.wt.medium }}>
            Motor de publicación activo
          </span>
        </div>
        <span style={{ color: C.blueBorder, fontSize: 12 }}>·</span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
          6 canales disponibles · 0 activos
        </span>
        <span style={{ color: C.blueBorder, fontSize: 12 }}>·</span>
        <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkGhost, letterSpacing: "0.04em" }}>
          PLACEHOLDER — datos reales al conectar canales
        </span>
      </div>

      {/* ── 1. KPI Distribution Strip ─────────────────────────────────── */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap:                 S[3],
        marginBottom:        S[8],
      }}>
        {([
          { label: "Programadas",       value: scheduled,     accent: C.blueDark,  bg: C.blueLight,  },
          { label: "Publicadas",        value: published,     accent: C.greenDark, bg: C.greenLight,  },
          { label: "Borradores",        value: drafts,        accent: C.inkMid,    bg: C.surfaceAlt, },
          { label: "Pendiente revisión",value: pendingReview, accent: "#C2410C",   bg: "#FFF7ED",    },
        ] as const).map(kpi => (
          <div key={kpi.label} style={{
            padding:      `${S[3]}px ${S[3] + 2}px`,
            background:   kpi.bg,
            border:       `1px solid ${kpi.accent}22`,
            borderLeft:   `3px solid ${kpi.accent}`,
            borderRadius: R.lg,
            boxShadow:    E.xs,
          }}>
            <div style={{
              fontFamily:   T.mono,
              fontSize:     "1.75rem",
              fontWeight:   T.wt.black,
              color:        kpi.accent,
              lineHeight:   1,
              marginBottom: S[1],
            }}>
              {kpi.value}
            </div>
            <div style={{
              fontFamily:    T.mono,
              fontSize:      T.sz["2xs"],
              color:         kpi.accent,
              opacity:       0.7,
              letterSpacing: "0.04em",
              textTransform: "uppercase" as const,
            }}>
              {kpi.label}
            </div>
          </div>
        ))}
      </div>

      {/* ── 2. Infrastructure de distribución ─────────────────────────── */}
      <div style={{ marginBottom: S[8] }}>
        <div style={{
          display:        "flex",
          alignItems:     "flex-start",
          justifyContent: "space-between",
          marginBottom:   S[4],
        }}>
          <div>
            <div style={{
              fontFamily:   T.mono,
              fontSize:     T.sz.sm,
              fontWeight:   T.wt.bold,
              color:        C.ink,
              marginBottom: 4,
            }}>
              Infraestructura de distribución
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
              Conecta tus canales para activar la publicación automática IA.
            </div>
          </div>
          <Link href={`/${orgSlug}/agentik/marketing-studio/connections`} style={{
            padding:        `${S[2]}px ${S[3]}px`,
            background:     C.blueDark,
            color:          "#fff",
            borderRadius:   R.md,
            fontFamily:     T.mono,
            fontSize:       T.sz.sm,
            textDecoration: "none",
            fontWeight:     T.wt.medium,
            flexShrink:     0,
          }}>
            Gestionar canales →
          </Link>
        </div>
        <div style={{
          display:             "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap:                 S[2] + 2,
        }}>
          {CHANNELS.map(ch => (
            <ChannelCard key={ch.id} channel={ch} />
          ))}
        </div>
      </div>

      {/* ── 3. Pipeline de contenido ───────────────────────────────────── */}
      <div>
        <div style={{
          display:        "flex",
          alignItems:     "flex-start",
          justifyContent: "space-between",
          marginBottom:   S[4],
        }}>
          <div>
            <div style={{
              fontFamily:   T.mono,
              fontSize:     T.sz.sm,
              fontWeight:   T.wt.bold,
              color:        C.ink,
              marginBottom: 4,
            }}>
              Pipeline de contenido
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
              {MOCK_POSTS.length} piezas en operación · {scheduled} programadas · {published} publicadas
            </div>
          </div>
          <div style={{ display: "flex", gap: S[2], flexShrink: 0 }}>
            <Link href={`/${orgSlug}/agentik/marketing-studio/biblioteca`} style={{
              padding:        `${S[2]}px ${S[3]}px`,
              background:     C.surface,
              border:         `1px solid ${C.line}`,
              borderRadius:   R.md,
              fontFamily:     T.mono,
              fontSize:       T.sz.sm,
              color:          C.inkMid,
              textDecoration: "none",
              fontWeight:     T.wt.medium,
            }}>
              Desde biblioteca
            </Link>
            <Link href={`/${orgSlug}/agentik/marketing-studio/redes/new`} style={{
              padding:        `${S[2]}px ${S[3]}px`,
              background:     C.blueDark,
              color:          "#fff",
              borderRadius:   R.md,
              fontFamily:     T.mono,
              fontSize:       T.sz.sm,
              fontWeight:     T.wt.medium,
              textDecoration: "none",
              display:        "inline-block",
            }}>
              + Nueva publicación
            </Link>
          </div>
        </div>

        <div style={{
          background:   C.white,
          border:       `1px solid ${C.line}`,
          borderRadius: R.lg,
          overflow:     "hidden",
          boxShadow:    E.sm,
        }}>
          {/* Pipeline header — no spreadsheet columns */}
          <div style={{
            display:      "flex",
            alignItems:   "center",
            justifyContent: "space-between",
            padding:      `${S[2] + 1}px ${S[4]}px`,
            borderBottom: `1px solid ${C.line}`,
            background:   C.surfaceAlt,
          }}>
            <span style={{
              fontFamily:    T.mono,
              fontSize:      T.sz.xs,
              color:         C.inkFaint,
              letterSpacing: "0.04em",
              textTransform: "uppercase" as const,
            }}>
              Operaciones de contenido
            </span>
            <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkGhost, letterSpacing: "0.04em" }}>
              {MOCK_POSTS.length} publicaciones
            </span>
          </div>

          {MOCK_POSTS.map(post => (
            <ContentRow key={post.id} post={post} />
          ))}

          {/* Footer */}
          <div style={{
            padding:    `${S[3]}px ${S[4]}px`,
            borderTop:  `1px solid ${C.line}`,
            background: C.surfaceAlt,
            display:    "flex",
            alignItems: "center",
            gap:        S[3],
          }}>
            <span style={{
              width:        6,
              height:       6,
              borderRadius: "50%",
              background:   C.inkGhost,
              display:      "inline-block",
              flexShrink:   0,
            }} />
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
              Datos de ejemplo · conecta canales para activar el pipeline en tiempo real
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
