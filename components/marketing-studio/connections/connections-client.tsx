"use client";

/**
 * components/marketing-studio/connections/connections-client.tsx
 *
 * MARKETING-CONNECTIONS-V2-CENTER-01 — Centro de Integraciones
 *
 * Componentes:
 *   GlobalIndicator     — "Marketing Studio listo" / "Faltan conexiones"
 *   ResumenStrip        — 4 KPI ejecutivos: activas / atención / disponibles / sync
 *   PlatformCard        — Card visual con logo oficial, estado, funciones, CTA
 *   ConnectionGrid      — Grid 4 columnas: primarias + próximamente
 *   PlatformDrawer      — Drawer con 5 secciones: descripción / habilita / estado / recursos / acciones
 *   ConnectionsClient   — Orquestador principal
 *
 * Principios:
 *   - Todas las plataformas siempre visibles — nunca ocultadas.
 *   - Ningún término técnico visible al usuario final.
 *   - Credenciales exclusivamente en el Vault multi-tenant.
 *   - Flujo OAuth en un solo clic — sin configuración manual.
 *   - Disconnect requiere confirmación explícita.
 */

import { useState, useTransition, useCallback, useRef } from "react";
import type { ReactNode }                               from "react";
import Link                                             from "next/link";
import { C, T, S, R, E }                               from "@/lib/ui/tokens";
import { MSDrawer }                                     from "@/components/marketing-studio/shared/ms-drawer";
import { MSDrawerSection }                              from "@/components/marketing-studio/shared/ms-drawer-section";
import type {
  IntegracionCard,
  IntegracionEstado,
  ConexionesResumen,
  ConexionesApiResponse,
} from "@/lib/marketing-studio/connections/connections-types";

// ── Props ──────────────────────────────────────────────────────────────────────

export interface ConnectionsClientProps {
  orgSlug:     string;
  initialData: ConexionesApiResponse;
}

// ── Visual platform definition ─────────────────────────────────────────────────

interface VisualPlatformDef {
  id:                string;      // unique UI key
  platformGroup:     string;      // maps to IntegracionCard.platformGroup
  displayName:       string;
  tagline:           string;
  description:       string;      // drawer resumen section
  capabilities:      string[];    // drawer capacidades + card preview (first 3)
  resourceTypes:     string[];    // filter for relevant recursos in drawer
  expectedResources: string[];    // placeholder resource type names when disconnected
  proximamente:      boolean;
}

const VISUAL_PLATFORMS: VisualPlatformDef[] = [
  // ── Primarias ────────────────────────────────────────────────────────────────
  {
    id:                "meta_business",
    platformGroup:     "meta",
    displayName:       "Meta Business",
    tagline:           "Facebook · Instagram · Meta Ads",
    description:       "Conecta tu cuenta de Meta Business para crear anuncios, publicar contenido en Facebook e Instagram, y consultar resultados directamente desde Agentik.",
    capabilities:      [
      "Crear anuncios",
      "Leer métricas",
      "Sincronizar campañas",
      "Usar páginas autorizadas",
      "Administrar cuentas publicitarias",
    ],
    resourceTypes:     ["Cuenta", "Business Manager", "Cuenta publicitaria", "Página", "Pixel"],
    expectedResources: ["Páginas", "Cuentas publicitarias", "Píxeles"],
    proximamente:      false,
  },
  {
    id:                "instagram",
    platformGroup:     "meta",
    displayName:       "Instagram",
    tagline:           "Fotos · Reels · Stories · Analítica",
    description:       "Conecta tu cuenta de Instagram Business para publicar fotos, reels y stories, programar contenido y consultar métricas de rendimiento desde Agentik.",
    capabilities:      [
      "Publicar contenido",
      "Programar reels y stories",
      "Leer métricas del perfil",
      "Sincronizar publicaciones",
    ],
    resourceTypes:     ["Instagram Business", "Perfil"],
    expectedResources: ["Perfil", "Publicaciones"],
    proximamente:      false,
  },
  {
    id:                "facebook",
    platformGroup:     "meta",
    displayName:       "Facebook",
    tagline:           "Página · Publicaciones · Alcance orgánico",
    description:       "Conecta tu Página de Facebook para publicar contenido, programar publicaciones y consultar estadísticas de alcance e interacción.",
    capabilities:      [
      "Publicar en la página",
      "Leer métricas de publicaciones",
      "Administrar álbumes y contenido",
      "Consultar estadísticas de alcance",
    ],
    resourceTypes:     ["Página"],
    expectedResources: ["Páginas", "Publicaciones"],
    proximamente:      false,
  },
  {
    id:                "tiktok",
    platformGroup:     "tiktok",
    displayName:       "TikTok",
    tagline:           "Videos · TikTok Ads · Tendencias",
    description:       "Conecta tu cuenta de TikTok Business para publicar videos, gestionar anuncios y acceder a métricas de rendimiento desde Agentik.",
    capabilities:      [
      "Publicar videos",
      "Crear y gestionar anuncios",
      "Leer métricas",
      "Sincronizar tendencias",
    ],
    resourceTypes:     ["Cuenta", "Advertiser"],
    expectedResources: ["Cuenta", "Cuenta publicitaria", "Perfil"],
    proximamente:      false,
  },
  {
    id:                "google_ads",
    platformGroup:     "google",
    displayName:       "Google Ads",
    tagline:           "Búsqueda · Display · Shopping",
    description:       "Conecta Google Ads para gestionar campañas de búsqueda, display y shopping, y consultar su rendimiento directamente desde Agentik.",
    capabilities:      [
      "Administrar campañas",
      "Leer conversiones",
      "Consultar gasto y rendimiento",
      "Sincronizar cuentas publicitarias",
    ],
    resourceTypes:     ["Cuenta", "Cliente"],
    expectedResources: ["Cliente", "Cuentas", "Conversiones"],
    proximamente:      false,
  },
  {
    id:                "youtube",
    platformGroup:     "youtube",
    displayName:       "YouTube",
    tagline:           "Canal · Shorts · Analítica de video",
    description:       "Conecta tu canal de YouTube para publicar videos, Shorts, consultar métricas y gestionar contenido desde Agentik.",
    capabilities:      [
      "Publicar videos y Shorts",
      "Leer métricas del canal",
      "Administrar listas de reproducción",
    ],
    resourceTypes:     ["Canal"],
    expectedResources: ["Canal", "Listas de reproducción"],
    proximamente:      false,
  },
  {
    id:                "shopify",
    platformGroup:     "shopify",
    displayName:       "Shopify",
    tagline:           "Tienda · Productos · Catálogo",
    description:       "Conecta tu tienda Shopify para sincronizar productos, colecciones y pedidos con Marketing Studio y habilitar publicaciones de catálogo.",
    capabilities:      [
      "Sincronizar catálogo de productos",
      "Consultar inventario en tiempo real",
      "Gestionar colecciones",
      "Publicar campañas para la tienda",
    ],
    resourceTypes:     ["Tienda", "Colección"],
    expectedResources: ["Tienda", "Colecciones", "Productos"],
    proximamente:      false,
  },
  {
    id:                "whatsapp",
    platformGroup:     "whatsapp",
    displayName:       "WhatsApp Business",
    tagline:           "Mensajería · Catálogo · Conversaciones",
    description:       "Conecta tu número de WhatsApp Business para enviar mensajes, compartir catálogos de productos y gestionar conversaciones con clientes.",
    capabilities:      [
      "Enviar mensajes a clientes",
      "Compartir catálogo de productos",
      "Gestionar plantillas de mensajes",
      "Consultar métricas de conversaciones",
    ],
    resourceTypes:     ["Número"],
    expectedResources: ["Número", "Plantillas"],
    proximamente:      false,
  },
  // ── Próximamente ─────────────────────────────────────────────────────────────
  {
    id:                "linkedin",
    platformGroup:     "linkedin",
    displayName:       "LinkedIn",
    tagline:           "Marketing B2B · Contenido profesional",
    description:       "Conecta LinkedIn Company Page para publicar contenido profesional y gestionar campañas B2B.",
    capabilities:      [
      "Publicar en Company Page",
      "Gestionar campañas B2B",
      "Leer métricas de alcance",
    ],
    resourceTypes:     ["Company Page"],
    expectedResources: ["Company Page"],
    proximamente:      true,
  },
  {
    id:                "pinterest",
    platformGroup:     "pinterest",
    displayName:       "Pinterest",
    tagline:           "Inspiración · Shopping · Ads",
    description:       "Conecta Pinterest para publicar pines, gestionar tableros y crear campañas de shopping.",
    capabilities:      [
      "Publicar pines y tableros",
      "Gestionar campañas de shopping",
      "Leer métricas de alcance",
    ],
    resourceTypes:     ["Tablero"],
    expectedResources: ["Tableros", "Pines"],
    proximamente:      true,
  },
  {
    id:                "x",
    platformGroup:     "x",
    displayName:       "X",
    tagline:           "Comunidad · Trending · Anuncios",
    description:       "Conecta X para publicar contenido, seguir tendencias y gestionar campañas de anuncios.",
    capabilities:      [
      "Publicar posts y threads",
      "Seguir tendencias",
      "Gestionar anuncios",
    ],
    resourceTypes:     ["Cuenta"],
    expectedResources: ["Cuenta"],
    proximamente:      true,
  },
];

// ── Platform SVG logos ─────────────────────────────────────────────────────────

function MetaBusinessLogo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" style={{ flexShrink: 0 }}>
      <rect width="48" height="48" rx="10" fill="#1877F2" />
      {/* Meta infinity / M */}
      <path
        d="M24 14c-3.8 0-6.6 2.6-8.2 5.5C14.5 22.3 14 25 14 28c0 3.5 1.4 6 4 6s4.4-2.5 6-6c1.6 3.5 3.4 6 6 6s4-2.5 4-6c0-3-0.5-5.7-1.8-8.5C30.6 16.6 27.8 14 24 14z"
        fill="none"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FacebookLogo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="24" cy="24" r="24" fill="#1877F2" />
      <path
        d="M27 14.5h3V10h-3c-3.6 0-6.5 2.9-6.5 6.5V19H18v4h2.5v11h4.5V23H28l1-4h-3.5v-2.5c0-1.1.9-2 2-2z"
        fill="#fff"
      />
    </svg>
  );
}

function InstagramLogo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id="ig-v2" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#FCAF45" />
          <stop offset="40%"  stopColor="#E1306C" />
          <stop offset="75%"  stopColor="#833AB4" />
          <stop offset="100%" stopColor="#405DE6" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="10" fill="url(#ig-v2)" />
      <rect x="13" y="13" width="22" height="22" rx="7" stroke="#fff" strokeWidth="2.5" fill="none" />
      <circle cx="24" cy="24" r="5.5" stroke="#fff" strokeWidth="2.5" fill="none" />
      <circle cx="33" cy="15" r="1.8" fill="#fff" />
    </svg>
  );
}

function TikTokLogo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" style={{ flexShrink: 0 }}>
      <rect width="48" height="48" rx="10" fill="#111" />
      <path
        d="M31 10h-4v18.5a4.5 4.5 0 01-4.5 4.5A4.5 4.5 0 0118 28.5a4.5 4.5 0 014.5-4.5c.4 0 .8.1 1.2.2v-4.2c-.4 0-.8-.1-1.2-.1A8.5 8.5 0 0014 28.5 8.5 8.5 0 0022.5 37a8.5 8.5 0 008.5-8.5V18a13 13 0 007.5 2.3v-4a9 9 0 01-7.5-6.3z"
        fill="#fff"
      />
    </svg>
  );
}

function GoogleAdsLogo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" style={{ flexShrink: 0 }}>
      <rect width="48" height="48" rx="10" fill="#fff" />
      <rect width="48" height="48" rx="10" stroke="#e5e7eb" strokeWidth="0.5" fill="none" />
      <path d="M38 24.4c0-1-.1-2-.3-3H24v5.6h7.8c-.3 1.8-1.4 3.4-3 4.4v3.6h4.9c2.9-2.6 4.3-6.5 4.3-10.6z" fill="#4285F4" />
      <path d="M24 39c3.9 0 7.2-1.3 9.6-3.5l-4.7-3.6c-1.3 0.9-3 1.4-4.9 1.4-3.8 0-7-2.6-8.1-6H11v3.8C13.4 36.7 18.4 39 24 39z" fill="#34A853" />
      <path d="M15.9 27.4A8.6 8.6 0 0115.4 24c0-1.2.2-2.4.5-3.4V16.8H11A15.4 15.4 0 009 24c0 2.7.7 5.3 2 7.4l4.9-3.8z" fill="#FBBC05" />
      <path d="M24 15.1c2.2 0 4.1.7 5.6 2.1l4.2-4.2C31.2 10.7 27.9 9 24 9c-5.6 0-10.6 3.2-13 8l4.9 3.8c1.1-3.4 4.3-5.7 8.1-5.7z" fill="#EA4335" />
    </svg>
  );
}

function YouTubeLogo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" style={{ flexShrink: 0 }}>
      <rect width="48" height="48" rx="10" fill="#FF0000" />
      <path
        d="M40.7 16.5a5 5 0 00-3.5-3.5C34 12 24 12 24 12s-10 0-13.2.9a5 5 0 00-3.5 3.6C6 19.8 6 24 6 24s0 4.2 1.3 7.5a5 5 0 003.5 3.5C14 36 24 36 24 36s10 0 13.2-.9a5 5 0 003.5-3.5C42 28.2 42 24 42 24s0-4.2-1.3-7.5z"
        fill="#FF0000"
      />
      <path d="M19.5 30.6l10.5-6.6-10.5-6.6v13.2z" fill="#fff" />
    </svg>
  );
}

function ShopifyLogo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" style={{ flexShrink: 0 }}>
      <rect width="48" height="48" rx="10" fill="#5A8C2A" />
      <path
        d="M34.5 14.5c-.1-.5-.5-.8-1-.8h-1.3c-.5-3-2.4-4.7-4.4-4.7-.1 0-.2 0-.4.1-.6-.7-1.3-1.1-2-1.1-4.9 0-7.2 6.2-8 9.3l-3.4 1.1c-1 .3-1 .3-1.1 1.3L10 34l19.3 3.5L36 35.4 34.5 14.5zm-7.1-5c.5 0 1 .4 1.4 1.1-.7.2-1.4.4-2.2.7-.4-1.7-1.1-2.5-1.8-2.8.6-.6 1.2-1 1.8-1h.8zm-3 0c.2 0 .4 0 .6.1.7.6 1.4 1.7 1.7 3.6l-5 1.5c.8-3 2.4-5.2 2.7-5.2zM20 36.7L11.5 35l2.4-15.5L20 36.7zm2.5.6l-2.7-17.8 11.3-3.5 1.3 18.3-9.9 3z"
        fill="#fff"
      />
    </svg>
  );
}

function WhatsAppLogo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" style={{ flexShrink: 0 }}>
      <rect width="48" height="48" rx="10" fill="#25D366" />
      <path
        d="M24 10C16.3 10 10 16.3 10 24c0 2.5.7 4.9 1.9 7L10 38l7.3-1.9c2 1.1 4.3 1.7 6.7 1.7 7.7 0 14-6.3 14-14S31.7 10 24 10z"
        fill="#fff"
      />
      <path
        d="M30.5 27.3c-.4-.2-2.2-1.1-2.5-1.2-.4-.1-.6-.2-.9.2l-1.1 1.4c-.2.3-.4.3-.7.1-.4-.2-1.6-.6-3-1.8-1.1-1-1.9-2.2-2.1-2.5-.2-.4 0-.6.2-.8l.5-.6c.2-.2.2-.4.3-.6.1-.2 0-.4 0-.6 0-.2-.9-2.1-1.2-2.9-.3-.7-.7-.6-.9-.6h-.8c-.3 0-.7.1-1 .4-.4.4-1.4 1.3-1.4 3.2s1.4 3.7 1.6 3.9c.2.3 2.7 4.1 6.5 5.8 3.8 1.6 3.8 1.1 4.5 1 .7-.1 2.2-.9 2.5-1.8.3-.9.3-1.6.2-1.8 0-.1-.3-.2-.6-.4z"
        fill="#25D366"
      />
    </svg>
  );
}

function LinkedInLogo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" style={{ flexShrink: 0 }}>
      <rect width="48" height="48" rx="10" fill="#0A66C2" />
      <path
        d="M16 20h-5v16h5V20zm-2.5-8a2.9 2.9 0 000 5.8 2.9 2.9 0 000-5.8zM37 28.7c0-4.8-1-8.7-6.8-8.7-2.7 0-4.6 1.5-5.3 2.9h-.1V20h-5v16h5v-8c0-2.3.4-4.5 3.3-4.5 2.9 0 2.9 2.6 2.9 4.7V36h5v-7.3z"
        fill="#fff"
      />
    </svg>
  );
}

function PinterestLogo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" style={{ flexShrink: 0 }}>
      <rect width="48" height="48" rx="10" fill="#E60023" />
      <path
        d="M24 9C15.7 9 9 15.7 9 24c0 6.3 3.8 11.7 9.2 14.1-.1-1.1-.2-2.9.1-4.2l1.8-7.7s-.5-1-.5-2.4c0-2.3 1.3-4 3.2-4 1.5 0 2.3 1.1 2.3 2.5 0 1.5-.9 3.8-1.4 5.9-.4 1.7.9 3.1 2.7 3.1 3.2 0 5.6-3.4 5.6-8.2 0-4.3-3.1-7.3-7.5-7.3-5.1 0-8 3.8-8 7.7 0 1.5.6 3.1 1.3 4a.5.5 0 01.1.5l-.5 2c-.1.3-.3.4-.5.3-1.9-.9-3.2-3.7-3.2-6 0-4.9 3.5-9.3 10.2-9.3 5.3 0 9.5 3.8 9.5 8.8 0 5.3-3.3 9.5-7.9 9.5-1.5 0-3-.8-3.5-1.7l-.9 3.5c-.3 1.3-1.2 2.8-1.7 3.8.9.3 1.9.4 2.9.4 8.3 0 15-6.7 15-15S32.3 9 24 9z"
        fill="#fff"
      />
    </svg>
  );
}

function XLogo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" style={{ flexShrink: 0 }}>
      <rect width="48" height="48" rx="10" fill="#000" />
      <path
        d="M26.4 21.9L35.5 11h-2.2l-7.9 9.1L19.4 11H11l9.6 13.9L11 37h2.2l8.4-9.8L28.6 37H37L26.4 21.9zm-3 3.5l-1-1.4L14 12.7h3.4l6.4 9.1 1 1.4 8.3 11.9h-3.4l-6.3-8.7z"
        fill="#fff"
      />
    </svg>
  );
}

function getPlatformLogo(id: string, size: number): ReactNode {
  switch (id) {
    case "meta_business": return <MetaBusinessLogo size={size} />;
    case "instagram":     return <InstagramLogo size={size} />;
    case "facebook":      return <FacebookLogo size={size} />;
    case "tiktok":        return <TikTokLogo size={size} />;
    case "google_ads":    return <GoogleAdsLogo size={size} />;
    case "youtube":       return <YouTubeLogo size={size} />;
    case "shopify":       return <ShopifyLogo size={size} />;
    case "whatsapp":      return <WhatsAppLogo size={size} />;
    case "linkedin":      return <LinkedInLogo size={size} />;
    case "pinterest":     return <PinterestLogo size={size} />;
    case "x":             return <XLogo size={size} />;
    default:
      return (
        <div style={{
          width: size, height: size, borderRadius: R.md,
          background: C.surfaceAlt, border: `1px solid ${C.line}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: size * 0.35, fontFamily: T.mono, color: C.inkFaint,
        }}>
          ?
        </div>
      );
  }
}

// ── Platform accent color per ID ───────────────────────────────────────────────

function platformAccent(id: string): string {
  const map: Record<string, string> = {
    meta_business: "#1877F2",
    instagram:     "#E1306C",
    facebook:      "#1877F2",
    tiktok:        "#111111",
    google_ads:    "#4285F4",
    youtube:       "#FF0000",
    shopify:       "#5A8C2A",
    whatsapp:      "#25D366",
    linkedin:      "#0A66C2",
    pinterest:     "#E60023",
    x:             "#000000",
  };
  return map[id] ?? C.blueDark;
}

// ── Estado display helpers ─────────────────────────────────────────────────────

function estadoDisplay(estado: IntegracionEstado): {
  label: string; color: string; bg: string; dotColor: string;
} {
  switch (estado) {
    case "conectado":
      return { label: "Conectado",            color: C.green,    bg: C.greenLight,  dotColor: C.green   };
    case "requiere_atencion":
    case "configuracion_incompleta":
      return { label: "Requiere autorización", color: C.amber,   bg: C.amberLight,  dotColor: C.amber   };
    case "error_autenticacion":
      return { label: "Error de sincronización", color: C.red,   bg: C.redLight,    dotColor: C.red     };
    case "desconectado":
      return { label: "No conectado",          color: C.inkFaint, bg: C.surfaceAlt, dotColor: C.inkGhost };
  }
}

// ── Date helpers ───────────────────────────────────────────────────────────────

function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const m    = Math.floor(diff / 60_000);
    if (m < 1)  return "Hace un momento";
    if (m < 60) return `Hace ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `Hace ${h} h`;
    return `Hace ${Math.floor(h / 24)} d`;
  } catch { return "—"; }
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-CO", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

// ── Resource summary helpers ───────────────────────────────────────────────────

function summarizeResources(
  recursos: IntegracionCard["recursos"],
  resourceTypes: string[],
): string {
  const filtered = resourceTypes.length === 0
    ? recursos
    : recursos.filter(r => resourceTypes.some(t =>
        r.tipo.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(r.tipo.toLowerCase()),
      ));
  if (filtered.length === 0) return "—";

  // Group by tipo
  const counts = new Map<string, number>();
  for (const r of filtered) {
    counts.set(r.tipo, (counts.get(r.tipo) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([tipo, n]) => `${n} ${tipo.toLowerCase()}${n > 1 && !tipo.endsWith("s") ? "s" : ""}`)
    .join(" · ");
}

function findAdAccount(recursos: IntegracionCard["recursos"]): string | null {
  const r = recursos.find(r =>
    r.tipo.toLowerCase().includes("publicitaria") ||
    r.tipo.toLowerCase().includes("advertiser") ||
    r.tipo.toLowerCase().includes("ads"),
  );
  return r?.nombre ?? null;
}

// ── Permission state display ────────────────────────────────────────────────────

function permissionStateDisplay(estado: IntegracionEstado): {
  label:   string;
  color:   string;
  bg:      string;
  border:  string;
} {
  switch (estado) {
    case "conectado":
      return { label: "Permisos concedidos",   color: C.green,    bg: C.greenLight,  border: C.greenBorder  };
    case "requiere_atencion":
      return { label: "Requiere autorización",  color: C.amber,    bg: C.amberLight,  border: C.amberBorder  };
    case "configuracion_incompleta":
      return { label: "Permisos incompletos",   color: C.amber,    bg: C.amberLight,  border: C.amberBorder  };
    case "error_autenticacion":
      return { label: "Error de sincronización", color: C.red,     bg: C.redLight,    border: C.redBorder    };
    default:
      return { label: "Sin autorización",        color: C.inkFaint, bg: C.surfaceAlt, border: C.line         };
  }
}

// ── Estado badge ───────────────────────────────────────────────────────────────

function EstadoBadge({ estado, proximamente }: { estado: IntegracionEstado; proximamente?: boolean }) {
  if (proximamente) {
    return (
      <span style={{
        display:      "inline-flex",
        alignItems:   "center",
        gap:          4,
        padding:      `2px ${S[2]}px`,
        borderRadius: R.pill,
        background:   C.surfaceAlt,
        border:       `1px solid ${C.line}`,
        fontFamily:   T.mono,
        fontSize:     T.sz.xs,
        color:        C.inkFaint,
        whiteSpace:   "nowrap",
      }}>
        Próximamente
      </span>
    );
  }
  const d = estadoDisplay(estado);
  return (
    <span style={{
      display:      "inline-flex",
      alignItems:   "center",
      gap:          5,
      padding:      `3px ${S[2]}px`,
      borderRadius: R.pill,
      background:   d.bg,
      border:       `1px solid ${d.color}40`,
      fontFamily:   T.mono,
      fontSize:     T.sz.xs,
      color:        d.color,
      fontWeight:   T.wt.medium,
      whiteSpace:   "nowrap",
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: R.pill,
        background: d.dotColor, display: "inline-block", flexShrink: 0,
      }} />
      {d.label}
    </span>
  );
}

// ── KV row helper ──────────────────────────────────────────────────────────────

function KVRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{
      display:       "flex",
      justifyContent: "space-between",
      alignItems:    "center",
      padding:       `${S[1]}px 0`,
      borderBottom:  `1px solid ${C.lineSubtle}`,
    }}>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, flexShrink: 0 }}>
        {label}
      </span>
      <span style={{
        fontFamily:  T.mono,
        fontSize:    T.sz.xs,
        color:       C.inkMid,
        fontWeight:  T.wt.medium,
        textAlign:   "right" as const,
        marginLeft:  S[3],
        maxWidth:    200,
        overflow:    "hidden",
        textOverflow: "ellipsis",
        whiteSpace:  "nowrap",
      }}>
        {value}
      </span>
    </div>
  );
}

// ── GlobalIndicator ───────────────────────────────────────────────────────────

function GlobalIndicator({ resumen }: { resumen: ConexionesResumen }) {
  const isReady = resumen.activas > 0 && resumen.requierenAtencion === 0;
  const color   = isReady ? C.green : resumen.requierenAtencion > 0 ? C.amber : C.inkFaint;
  const bg      = isReady ? C.greenLight : resumen.requierenAtencion > 0 ? C.amberLight : C.surfaceAlt;
  const border  = isReady ? C.greenBorder : resumen.requierenAtencion > 0 ? C.amberBorder : C.line;

  const title = isReady
    ? "Marketing Studio listo"
    : resumen.requierenAtencion > 0
    ? "Faltan conexiones para habilitar todas las funciones"
    : "Sin conexiones activas";

  const sub = isReady
    ? `${resumen.activas} plataforma${resumen.activas !== 1 ? "s" : ""} operativa${resumen.activas !== 1 ? "s" : ""} · Agentik está listo para publicar y analizar.`
    : resumen.requierenAtencion > 0
    ? `${resumen.requierenAtencion} plataforma${resumen.requierenAtencion !== 1 ? "s requieren" : " requiere"} autorización. Reconecta para restaurar el acceso.`
    : "Conecta al menos una plataforma para comenzar a publicar y analizar desde Agentik.";

  return (
    <div style={{
      display:      "flex",
      alignItems:   "flex-start",
      gap:          S[3],
      padding:      `${S[3]}px ${S[4]}px`,
      background:   bg,
      border:       `1px solid ${border}`,
      borderRadius: R.xl,
      marginBottom: S[5],
    }}>
      <span style={{ fontSize: 16, flexShrink: 0, lineHeight: 1, marginTop: 1 }}>
        {isReady ? "✓" : resumen.requierenAtencion > 0 ? "⚠" : "○"}
      </span>
      <div>
        <div style={{
          fontFamily: T.mono,
          fontSize:   T.sz.sm,
          fontWeight: T.wt.semibold,
          color,
        }}>
          {title}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: 2, lineHeight: 1.5 }}>
          {sub}
        </div>
      </div>
    </div>
  );
}

// ── ResumenStrip ──────────────────────────────────────────────────────────────

function ResumenStrip({ resumen }: { resumen: ConexionesResumen }) {
  const items = [
    { label: "Conexiones activas",  value: resumen.activas,           color: C.green    },
    { label: "Requieren atención",  value: resumen.requierenAtencion,  color: C.amber    },
    { label: "Disponibles",          value: resumen.pendientes,         color: C.inkFaint },
    { label: "Total plataformas",   value: resumen.total,              color: C.blueDark  },
  ] as const;

  return (
    <div style={{
      display:             "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap:                 S[3],
      marginBottom:        S[5],
    }}>
      {items.map(({ label, value, color }) => (
        <div key={label} style={{
          background:   C.white,
          border:       `1px solid ${C.line}`,
          borderLeft:   `3px solid ${color}`,
          borderRadius: R.xl,
          padding:      `${S[3]}px ${S[4]}px`,
          boxShadow:    E.xs,
        }}>
          <div style={{
            fontFamily:   T.mono,
            fontSize:     T.sz["2xl"],
            fontWeight:   T.wt.bold,
            color:        value > 0 ? color : C.inkGhost,
            lineHeight:   1,
            marginBottom: S[1],
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

// ── PlatformCard ──────────────────────────────────────────────────────────────

function PlatformCard({
  vp, card, orgSlug, onOpen,
}: {
  vp:      VisualPlatformDef;
  card:    IntegracionCard | null;
  orgSlug: string;
  onOpen:  () => void;
}) {
  const [hovered, setHovered] = useState(false);

  const estado      = card?.estado ?? "desconectado";
  const isConnected = estado === "conectado";
  const hasIssue    = estado === "requiere_atencion" || estado === "error_autenticacion" || estado === "configuracion_incompleta";
  const accent      = platformAccent(vp.id);
  const borderColor = hasIssue ? `${C.amber}55` : hovered ? `${accent}44` : C.line;

  const ctaLabel  = vp.proximamente
    ? "Próximamente"
    : isConnected ? "Gestionar"
    : hasIssue    ? "Reconectar"
    : "Conectar";

  const ctaColor  = vp.proximamente
    ? C.inkGhost
    : hasIssue ? C.amber
    : isConnected ? C.inkMid
    : C.white;

  const ctaBg     = vp.proximamente
    ? C.surfaceAlt
    : hasIssue ? C.amberLight
    : isConnected ? C.surfaceAlt
    : C.blueDark;

  const ctaBorder = vp.proximamente
    ? C.line
    : hasIssue ? C.amberBorder
    : isConnected ? C.line
    : C.blueDark;

  return (
    <div
      role={vp.proximamente ? undefined : "button"}
      tabIndex={vp.proximamente ? undefined : 0}
      onClick={vp.proximamente ? undefined : onOpen}
      onKeyDown={vp.proximamente ? undefined : (e => e.key === "Enter" && onOpen())}
      onMouseEnter={() => !vp.proximamente && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background:    C.white,
        border:        `1px solid ${borderColor}`,
        borderRadius:  R.card,
        overflow:      "hidden",
        boxShadow:     hovered ? E.md : E.xs,
        cursor:        vp.proximamente ? "default" : "pointer",
        transition:    "border-color 140ms, box-shadow 140ms",
        display:       "flex",
        flexDirection: "column" as const,
        opacity:       vp.proximamente ? 0.55 : 1,
      }}
    >
      {/* Accent band at top */}
      <div style={{
        height:     3,
        background: vp.proximamente ? C.lineSubtle : accent,
        flexShrink: 0,
      }} />

      {/* Header: logo + name + status */}
      <div style={{
        display:    "flex",
        alignItems: "flex-start",
        gap:        S[3],
        padding:    `${S[4]}px ${S[4]}px ${S[3]}px`,
      }}>
        {getPlatformLogo(vp.id, 40)}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display:      "flex",
            alignItems:   "center",
            gap:          S[2],
            marginBottom: 3,
            flexWrap:     "wrap" as const,
          }}>
            <span style={{
              fontFamily: T.mono,
              fontSize:   T.sz.base,
              fontWeight: T.wt.semibold,
              color:      C.ink,
              flexShrink: 0,
            }}>
              {vp.displayName}
            </span>
            <EstadoBadge estado={estado} proximamente={vp.proximamente} />
          </div>
          <div style={{
            fontFamily:  T.mono,
            fontSize:    T.sz.xs,
            color:       C.inkFaint,
            whiteSpace:  "nowrap",
            overflow:    "hidden",
            textOverflow: "ellipsis",
          }}>
            {vp.tagline}
          </div>
        </div>
      </div>

      {/* ── Connected context zone / Capabilities ── */}
      {isConnected ? (
        /* Connected: show account context */
        <div style={{
          flex:       1,
          padding:    `${S[3]}px ${S[4]}px`,
          borderTop:  `1px solid ${C.lineSubtle}`,
          display:    "flex",
          flexDirection: "column" as const,
          gap:        3,
        }}>
          {/* Conectado como */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: S[2] }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, flexShrink: 0 }}>
              Conectado como
            </span>
            <span style={{
              fontFamily:   T.mono,
              fontSize:     T.sz["2xs"],
              color:        C.ink,
              fontWeight:   T.wt.medium,
              textAlign:    "right" as const,
              overflow:     "hidden",
              textOverflow: "ellipsis",
              whiteSpace:   "nowrap",
              maxWidth:     140,
            }}>
              {card?.cuentaConectada ?? "—"}
            </span>
          </div>
          {/* Cuenta publicitaria — only if found in resources */}
          {findAdAccount(card?.recursos ?? []) && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: S[2] }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, flexShrink: 0 }}>
                Cuenta publicitaria
              </span>
              <span style={{
                fontFamily:   T.mono,
                fontSize:     T.sz["2xs"],
                color:        C.ink,
                fontWeight:   T.wt.medium,
                textAlign:    "right" as const,
                overflow:     "hidden",
                textOverflow: "ellipsis",
                whiteSpace:   "nowrap",
                maxWidth:     140,
              }}>
                {findAdAccount(card?.recursos ?? [])}
              </span>
            </div>
          )}
          {/* Última sincronización */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: S[2] }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, flexShrink: 0 }}>
              Última sincronización
            </span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, fontWeight: T.wt.medium }}>
              {fmtRelative(card?.ultimaSincronizacion ?? null)}
            </span>
          </div>
          {/* Recursos detectados */}
          {(card?.recursos ?? []).length > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: S[2] }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, flexShrink: 0 }}>
                Recursos detectados
              </span>
              <span style={{
                fontFamily:   T.mono,
                fontSize:     T.sz["2xs"],
                color:        C.inkMid,
                textAlign:    "right" as const,
                overflow:     "hidden",
                textOverflow: "ellipsis",
                whiteSpace:   "nowrap",
                maxWidth:     160,
              }}>
                {summarizeResources(card?.recursos ?? [], vp.resourceTypes)}
              </span>
            </div>
          )}
        </div>
      ) : (
        /* Not connected: show capability preview */
        <div style={{
          flex:        1,
          padding:     `0 ${S[4]}px ${S[3]}px`,
          borderTop:   `1px solid ${C.lineSubtle}`,
          paddingTop:  S[3],
        }}>
          {vp.capabilities.slice(0, 3).map(cap => (
            <div key={cap} style={{
              display:     "flex",
              alignItems:  "flex-start",
              gap:         S[2],
              marginBottom: S[1],
            }}>
              <span style={{
                fontFamily: T.mono,
                fontSize:   T.sz["2xs"],
                color:      C.inkGhost,
                flexShrink: 0,
                marginTop:  1,
              }}>·</span>
              <span style={{
                fontFamily: T.mono,
                fontSize:   T.sz.xs,
                color:      C.inkMid,
                lineHeight: 1.4,
              }}>
                {cap}
              </span>
            </div>
          ))}
          <div style={{
            fontFamily: T.mono,
            fontSize:   T.sz["2xs"],
            color:      C.inkGhost,
            marginTop:  S[2],
            fontStyle:  "italic" as const,
          }}>
            Estado: No conectado
          </div>
        </div>
      )}

      {/* Last sync */}
      <div style={{
        padding:     `${S[2]}px ${S[4]}px`,
        borderTop:   `1px solid ${C.lineSubtle}`,
        display:     "flex",
        alignItems:  "center",
        gap:         S[1],
      }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost }}>
          Últ. sincronización:
        </span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, fontWeight: T.wt.medium }}>
          {card ? fmtRelative(card.ultimaSincronizacion) : "—"}
        </span>
      </div>

      {/* CTA */}
      <div style={{ padding: `${S[2]}px ${S[4]}px ${S[3]}px` }}>
        {vp.proximamente ? (
          <div style={{
            fontFamily:   T.mono,
            fontSize:     T.sz.xs,
            color:        C.inkGhost,
            textAlign:    "center" as const,
            padding:      `${S[1]}px 0`,
          }}>
            Disponible próximamente
          </div>
        ) : (
          <div style={{
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            padding:        `${S[2]}px ${S[3]}px`,
            borderRadius:   R.md,
            background:     hovered && !isConnected && !hasIssue ? `${C.blueDark}dd` : ctaBg,
            border:         `1px solid ${ctaBorder}`,
            fontFamily:     T.mono,
            fontSize:       T.sz.xs,
            fontWeight:     T.wt.semibold,
            color:          ctaColor,
            transition:     "background 120ms",
          }}>
            {ctaLabel} {!isConnected && !vp.proximamente ? "→" : ""}
          </div>
        )}
      </div>
    </div>
  );
}

// ── ConnectionGrid ────────────────────────────────────────────────────────────

function ConnectionGrid({
  orgSlug,
  cardsByGroup,
  onOpen,
}: {
  orgSlug:      string;
  cardsByGroup: Record<string, IntegracionCard>;
  onOpen:       (vp: VisualPlatformDef) => void;
}) {
  const primary  = VISUAL_PLATFORMS.filter(v => !v.proximamente);
  const upcoming = VISUAL_PLATFORMS.filter(v => v.proximamente);

  return (
    <>
      {/* Primary platforms */}
      <div style={{ marginBottom: S[3] }}>
        <div style={{
          fontFamily:   T.mono,
          fontSize:     T.sz.sm,
          fontWeight:   T.wt.semibold,
          color:        C.ink,
          marginBottom: S[3],
        }}>
          Plataformas disponibles
        </div>
        <div style={{
          display:             "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap:                 S[3],
        }}>
          {primary.map(vp => (
            <PlatformCard
              key={vp.id}
              vp={vp}
              card={cardsByGroup[vp.platformGroup] ?? null}
              orgSlug={orgSlug}
              onOpen={() => onOpen(vp)}
            />
          ))}
        </div>
      </div>

      {/* Upcoming platforms */}
      {upcoming.length > 0 && (
        <div style={{ marginTop: S[5] }}>
          <div style={{
            fontFamily:   T.mono,
            fontSize:     T.sz.sm,
            fontWeight:   T.wt.semibold,
            color:        C.inkFaint,
            marginBottom: S[3],
          }}>
            Próximamente
          </div>
          <div style={{
            display:             "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap:                 S[3],
          }}>
            {upcoming.map(vp => (
              <PlatformCard
                key={vp.id}
                vp={vp}
                card={cardsByGroup[vp.platformGroup] ?? null}
                orgSlug={orgSlug}
                onOpen={() => onOpen(vp)}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ── PlatformDrawer ─────────────────────────────────────────────────────────────

function PlatformDrawer({
  vp, card, orgSlug, onClose,
  onDiscover, onDisconnect,
  disconnecting, isPending,
}: {
  vp:           VisualPlatformDef;
  card:         IntegracionCard | null;
  orgSlug:      string;
  onClose:      () => void;
  onDiscover?:  () => void;
  onDisconnect: () => void;
  disconnecting: boolean;
  isPending:    boolean;
}) {
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  const estado      = card?.estado ?? "desconectado";
  const isConnected = estado === "conectado";
  const hasIssue    = estado === "requiere_atencion" || estado === "error_autenticacion" || estado === "configuracion_incompleta";
  const d           = estadoDisplay(estado);
  const accent      = platformAccent(vp.id);

  // Filter resources relevant to this visual platform
  const relevantRecursos = (card?.recursos ?? []).filter(r => {
    if (vp.resourceTypes.length === 0) return true;
    return vp.resourceTypes.some(t =>
      r.tipo.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(r.tipo.toLowerCase()),
    );
  });

  const connectHref  = card?.connectPath
    ? `/api/orgs/${orgSlug}/integrations/${card.connectPath}`
    : null;

  return (
    <MSDrawer onClose={onClose} width="clamp(460px, 42vw, 620px)">

      {/* Custom drawer header */}
      <div style={{
        display:       "flex",
        alignItems:    "flex-start",
        gap:           S[4],
        padding:       `${S[5]}px ${S[5]}px ${S[4]}px`,
        borderBottom:  `1px solid ${C.line}`,
        background:    `linear-gradient(135deg, ${accent}08 0%, transparent 100%)`,
        flexShrink:    0,
      }}>
        <div style={{
          width:        52,
          height:       52,
          borderRadius: R.xl,
          background:   `${accent}10`,
          border:       `1.5px solid ${accent}25`,
          display:      "flex",
          alignItems:   "center",
          justifyContent: "center",
          flexShrink:   0,
        }}>
          {getPlatformLogo(vp.id, 32)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: T.mono, fontSize: T.sz.xl, fontWeight: T.wt.bold, color: C.ink,
          }}>
            {vp.displayName}
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: 2 }}>
            {vp.tagline}
          </div>
          <div style={{ marginTop: S[2] }}>
            <EstadoBadge estado={estado} proximamente={vp.proximamente} />
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: C.inkFaint, fontSize: 18, padding: 4, lineHeight: 1, flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>

      {/* Drawer body */}
      <div style={{ flex: 1, overflowY: "auto" as const, padding: `${S[5]}px` }}>

        {/* ── 1. Resumen ── */}
        <MSDrawerSection title="Resumen">
          {isConnected ? (
            <>
              <KVRow label="Plataforma"            value={vp.displayName} />
              <KVRow label="Estado"                value={<EstadoBadge estado={estado} />} />
              <KVRow label="Conectado como"         value={card?.cuentaConectada ?? "—"} />
              <KVRow label="Última sincronización"  value={fmtRelative(card?.ultimaSincronizacion ?? null)} />
              {findAdAccount(relevantRecursos) && (
                <KVRow label="Cuenta principal" value={findAdAccount(relevantRecursos)!} />
              )}
            </>
          ) : hasIssue ? (
            <>
              <KVRow label="Plataforma" value={vp.displayName} />
              <KVRow label="Estado"     value={<EstadoBadge estado={estado} />} />
              <div style={{
                marginTop:    S[3],
                padding:      `${S[3]}px`,
                background:   C.amberLight,
                border:       `1px solid ${C.amberBorder}`,
                borderRadius: R.lg,
                fontFamily:   T.mono,
                fontSize:     T.sz.xs,
                color:        C.amberDark,
                lineHeight:   1.5,
              }}>
                {estado === "error_autenticacion"
                  ? "La autorización ha expirado o fue revocada. Reconecta para restaurar el acceso."
                  : estado === "configuracion_incompleta"
                  ? "La conexión existe pero falta completar la configuración. Reconecta para finalizar."
                  : "Esta conexión tiene advertencias activas. Vuelve a autorizar para resolverlas."}
              </div>
            </>
          ) : (
            <>
              <KVRow label="Plataforma" value={vp.displayName} />
              <KVRow label="Estado"     value={<EstadoBadge estado={estado} />} />
              <div style={{
                marginTop:    S[3],
                padding:      `${S[3]}px`,
                background:   C.surface,
                border:       `1px solid ${C.line}`,
                borderRadius: R.lg,
                fontFamily:   T.mono,
                fontSize:     T.sz.xs,
                color:        C.inkFaint,
                lineHeight:   1.5,
              }}>
                {vp.proximamente
                  ? "Esta plataforma estará disponible próximamente. Podrás conectarla desde aquí cuando esté lista."
                  : "Conecta esta plataforma para habilitar sus funciones en Marketing Studio."}
              </div>
            </>
          )}
        </MSDrawerSection>

        {/* ── 2. Capacidades habilitadas ── */}
        <MSDrawerSection title="Capacidades habilitadas">
          <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
            {vp.capabilities.map(cap => (
              <div key={cap} style={{ display: "flex", alignItems: "center", gap: S[3] }}>
                <span style={{
                  width:          20,
                  height:         20,
                  borderRadius:   R.sm,
                  flexShrink:     0,
                  background:     isConnected ? C.greenLight : C.surfaceAlt,
                  border:         `1px solid ${isConnected ? C.greenBorder : C.line}`,
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  fontSize:       10,
                  fontWeight:     T.wt.bold,
                  color:          isConnected ? C.green : C.inkGhost,
                }}>
                  {isConnected ? "✓" : "·"}
                </span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink }}>
                  {cap}
                </span>
              </div>
            ))}
          </div>
        </MSDrawerSection>

        {/* ── 3. Recursos detectados ── */}
        <MSDrawerSection title="Recursos detectados">
          {relevantRecursos.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 1 }}>
              {relevantRecursos.map((r, i) => (
                <div key={i} style={{
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "space-between",
                  gap:            S[2],
                  padding:        `${S[2]}px 0`,
                  borderBottom:   `1px solid ${C.lineSubtle}`,
                }}>
                  <div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, fontWeight: T.wt.medium }}>
                      {r.nombre ?? "Sin nombre"}
                    </div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                      {r.tipo}
                    </div>
                  </div>
                  <span style={{
                    fontFamily:   T.mono,
                    fontSize:     T.sz.xs,
                    color:        C.green,
                    background:   C.greenLight,
                    border:       `1px solid ${C.greenBorder}`,
                    borderRadius: R.pill,
                    padding:      `1px ${S[1]}px`,
                    whiteSpace:   "nowrap",
                  }}>
                    Activo
                  </span>
                </div>
              ))}
            </div>
          ) : isConnected ? (
            <div style={{
              fontFamily:   T.mono,
              fontSize:     T.sz.xs,
              color:        C.inkFaint,
              padding:      `${S[3]}px`,
              background:   C.surface,
              borderRadius: R.lg,
              lineHeight:   1.5,
            }}>
              Sin recursos detectados aún. Usa &quot;Sincronizar ahora&quot; para descubrir cuentas y configuraciones disponibles.
            </div>
          ) : vp.expectedResources.length > 0 ? (
            <div>
              <div style={{
                fontFamily:   T.mono,
                fontSize:     T.sz.xs,
                color:        C.inkFaint,
                marginBottom: S[2],
                lineHeight:   1.5,
              }}>
                Los recursos aparecerán después de autorizar la conexión.
              </div>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 1 }}>
                {vp.expectedResources.map(rt => (
                  <div key={rt} style={{
                    display:    "flex",
                    alignItems: "center",
                    gap:        S[2],
                    padding:    `${S[1]}px 0`,
                    borderBottom: `1px solid ${C.lineSubtle}`,
                  }}>
                    <span style={{
                      width:        6,
                      height:       6,
                      borderRadius: R.pill,
                      background:   C.lineSubtle,
                      flexShrink:   0,
                      display:      "inline-block",
                    }} />
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkGhost }}>
                      {rt}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{
              fontFamily:   T.mono,
              fontSize:     T.sz.xs,
              color:        C.inkFaint,
              padding:      `${S[3]}px`,
              background:   C.surface,
              borderRadius: R.lg,
            }}>
              Los recursos aparecerán después de autorizar la conexión.
            </div>
          )}
        </MSDrawerSection>

        {/* ── 4. Estado de permisos ── */}
        <MSDrawerSection title="Estado de permisos">
          {(() => {
            const pstate = permissionStateDisplay(estado);
            return (
              <>
                {/* Permission state badge */}
                <div style={{
                  display:      "inline-flex",
                  alignItems:   "center",
                  gap:          S[2],
                  padding:      `${S[2]}px ${S[3]}px`,
                  borderRadius: R.pill,
                  background:   pstate.bg,
                  border:       `1px solid ${pstate.border}`,
                  marginBottom: S[3],
                }}>
                  <span style={{
                    width:        7,
                    height:       7,
                    borderRadius: R.pill,
                    background:   pstate.color,
                    flexShrink:   0,
                    display:      "inline-block",
                  }} />
                  <span style={{
                    fontFamily: T.mono,
                    fontSize:   T.sz.xs,
                    fontWeight: T.wt.semibold,
                    color:      pstate.color,
                  }}>
                    {pstate.label}
                  </span>
                </div>

                {/* Permission labels — never show scopes */}
                {isConnected && card && card.permisos.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column" as const, gap: S[1] }}>
                    {card.permisos.map((p, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                        <span style={{
                          fontFamily: T.mono,
                          fontSize:   T.sz["2xs"],
                          color:      C.green,
                          fontWeight: T.wt.bold,
                          flexShrink: 0,
                        }}>✓</span>
                        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                          {p.label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {!isConnected && !vp.proximamente && (
                  <div style={{
                    fontFamily: T.mono,
                    fontSize:   T.sz.xs,
                    color:      C.inkFaint,
                    lineHeight: 1.5,
                  }}>
                    Los permisos se conceden durante el proceso de conexión. Solo se solicitan los necesarios para las funciones habilitadas.
                  </div>
                )}
              </>
            );
          })()}
        </MSDrawerSection>

        {/* ── 5. Acciones ── */}
        {!vp.proximamente && (
          <MSDrawerSection title="Acciones">
            <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>

              {/* Conectar — solo si no está conectada ni con error */}
              {!isConnected && !hasIssue && connectHref && (
                <Link
                  href={connectHref}
                  style={{
                    display:        "flex",
                    alignItems:     "center",
                    justifyContent: "space-between",
                    padding:        `${S[3]}px ${S[4]}px`,
                    borderRadius:   R.lg,
                    background:     C.blueDark,
                    border:         `1px solid ${C.blueDark}`,
                    color:          "#fff",
                    fontFamily:     T.mono,
                    fontSize:       T.sz.sm,
                    fontWeight:     T.wt.semibold,
                    textDecoration: "none",
                    cursor:         "pointer",
                  }}
                >
                  <span>Conectar</span>
                  <span style={{ fontSize: T.sz.xs, opacity: 0.7 }}>→</span>
                </Link>
              )}

              {/* Reconectar — si requiere autorización */}
              {hasIssue && connectHref && (
                <Link
                  href={connectHref}
                  style={{
                    display:        "flex",
                    alignItems:     "center",
                    justifyContent: "space-between",
                    padding:        `${S[3]}px ${S[4]}px`,
                    borderRadius:   R.lg,
                    background:     C.amberLight,
                    border:         `1px solid ${C.amberBorder}`,
                    color:          C.amber,
                    fontFamily:     T.mono,
                    fontSize:       T.sz.sm,
                    fontWeight:     T.wt.semibold,
                    textDecoration: "none",
                    cursor:         "pointer",
                  }}
                >
                  <div>
                    <div>Reconectar</div>
                    <div style={{ fontSize: T.sz.xs, marginTop: 2, opacity: 0.8 }}>
                      Volver a autorizar para restaurar el acceso
                    </div>
                  </div>
                  <span style={{ fontSize: T.sz.xs, opacity: 0.7 }}>→</span>
                </Link>
              )}

              {/* Sincronizar ahora — si está conectada */}
              {isConnected && onDiscover && (
                <button
                  type="button"
                  onClick={onDiscover}
                  disabled={isPending}
                  style={{
                    display:        "flex",
                    alignItems:     "center",
                    justifyContent: "space-between",
                    padding:        `${S[3]}px ${S[4]}px`,
                    borderRadius:   R.lg,
                    background:     C.blueLight,
                    border:         `1px solid ${C.blueBorder}`,
                    color:          C.blueDark,
                    fontFamily:     T.mono,
                    fontSize:       T.sz.sm,
                    fontWeight:     T.wt.medium,
                    cursor:         isPending ? "wait" : "pointer",
                    opacity:        isPending ? 0.6 : 1,
                    textAlign:      "left" as const,
                    width:          "100%",
                  }}
                >
                  <div>
                    <div>{isPending ? "Sincronizando…" : "Sincronizar ahora"}</div>
                    <div style={{ fontSize: T.sz.xs, color: C.blue, marginTop: 2 }}>
                      Actualiza recursos y verifica el estado de la conexión
                    </div>
                  </div>
                  <span style={{ fontSize: T.sz.xs, opacity: 0.7 }}>↻</span>
                </button>
              )}

              {/* Desconectar — con confirmación inline */}
              {isConnected && (
                <>
                  {confirmingDisconnect ? (
                    <div style={{
                      padding:      `${S[3]}px ${S[4]}px`,
                      borderRadius: R.lg,
                      background:   C.redLight,
                      border:       `1px solid ${C.redBorder}`,
                    }}>
                      <div style={{
                        fontFamily:   T.mono,
                        fontSize:     T.sz.sm,
                        fontWeight:   T.wt.semibold,
                        color:        C.red,
                        marginBottom: S[1],
                      }}>
                        ¿Estás seguro?
                      </div>
                      <div style={{
                        fontFamily:   T.mono,
                        fontSize:     T.sz.xs,
                        color:        C.redDark,
                        marginBottom: S[3],
                        lineHeight:   1.5,
                      }}>
                        Esto desconectará {vp.displayName} de Agentik. Deberás volver a autorizar para restaurar el acceso.
                      </div>
                      <div style={{ display: "flex", gap: S[2] }}>
                        <button
                          type="button"
                          onClick={() => { onDisconnect(); setConfirmingDisconnect(false); }}
                          disabled={disconnecting}
                          style={{
                            flex:         1,
                            padding:      `${S[2]}px`,
                            borderRadius: R.md,
                            background:   C.red,
                            border:       "none",
                            color:        "#fff",
                            fontFamily:   T.mono,
                            fontSize:     T.sz.xs,
                            fontWeight:   T.wt.semibold,
                            cursor:       disconnecting ? "wait" : "pointer",
                          }}
                        >
                          {disconnecting ? "Desconectando…" : "Sí, desconectar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingDisconnect(false)}
                          style={{
                            flex:         1,
                            padding:      `${S[2]}px`,
                            borderRadius: R.md,
                            background:   C.white,
                            border:       `1px solid ${C.line}`,
                            color:        C.inkMid,
                            fontFamily:   T.mono,
                            fontSize:     T.sz.xs,
                            cursor:       "pointer",
                          }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingDisconnect(true)}
                      style={{
                        padding:      `${S[3]}px ${S[4]}px`,
                        borderRadius: R.lg,
                        background:   C.white,
                        border:       `1px solid ${C.line}`,
                        color:        C.inkLight,
                        fontFamily:   T.mono,
                        fontSize:     T.sz.xs,
                        cursor:       "pointer",
                        textAlign:    "left" as const,
                        width:        "100%",
                      }}
                    >
                      Desconectar {vp.displayName}
                    </button>
                  )}
                </>
              )}

            </div>
          </MSDrawerSection>
        )}

        {/* ── 6. Nota de seguridad ── */}
        <div style={{
          marginTop:    S[4],
          padding:      `${S[3]}px`,
          background:   C.surface,
          border:       `1px solid ${C.lineSubtle}`,
          borderRadius: R.lg,
        }}>
          <div style={{
            fontFamily: T.mono,
            fontSize:   T.sz["2xs"],
            color:      C.inkGhost,
            lineHeight: 1.6,
          }}>
            Agentik nunca muestra credenciales ni contraseñas. La autorización se guarda de forma segura y separada por empresa.
          </div>
        </div>

      </div>

      {/* Footer */}
      <div style={{
        padding:     `${S[3]}px ${S[5]}px`,
        borderTop:   `1px solid ${C.line}`,
        display:     "flex",
        gap:         S[2],
        flexShrink:  0,
      }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            flex:         1,
            padding:      `${S[2]}px`,
            borderRadius: R.md,
            background:   C.white,
            border:       `1px solid ${C.line}`,
            color:        C.inkMid,
            fontFamily:   T.mono,
            fontSize:     T.sz.xs,
            cursor:       "pointer",
          }}
        >
          Cerrar
        </button>
      </div>
    </MSDrawer>
  );
}

// ── ConnectionsClient — Orquestador ──────────────────────────────────────────

export function ConnectionsClient({ orgSlug, initialData }: ConnectionsClientProps) {
  const [data,         setData]         = useState<ConexionesApiResponse>(initialData);
  const [selectedVP,   setSelectedVP]   = useState<VisualPlatformDef | null>(null);
  const [isPending,    startTransition] = useTransition();
  const [disconnecting, setDisconnecting] = useState(false);
  const [actionMsg,    setActionMsg]    = useState<string | null>(null);
  const msgTimer                         = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build O(1) lookup by platformGroup
  const cardsByGroup = Object.fromEntries(
    data.integraciones.map(c => [c.platformGroup, c]),
  ) as Record<string, IntegracionCard>;

  const selectedCard = selectedVP ? (cardsByGroup[selectedVP.platformGroup] ?? null) : null;

  function showMsg(msg: string) {
    if (msgTimer.current) clearTimeout(msgTimer.current);
    setActionMsg(msg);
    msgTimer.current = setTimeout(() => setActionMsg(null), 4500);
  }

  const refresh = useCallback(() => {
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/orgs/${orgSlug}/marketing-studio/conexiones`,
          { cache: "no-store" },
        );
        if (res.ok) setData(await res.json() as ConexionesApiResponse);
      } catch { /* show stale data */ }
    });
  }, [orgSlug]);

  const handleDiscover = useCallback(() => {
    if (!selectedVP) return;
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/orgs/${orgSlug}/marketing-studio/recursos`,
          {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ action: "discover", provider: selectedVP.platformGroup }),
          },
        );
        const json = await res.json() as { result?: { upserted?: number } };
        if (res.ok) {
          showMsg(`Sincronización completada · ${json.result?.upserted ?? 0} recursos actualizados`);
          refresh();
        } else {
          showMsg("No se pudo sincronizar. Intenta nuevamente.");
        }
      } catch {
        showMsg("Error al sincronizar.");
      }
    });
  }, [orgSlug, selectedVP, refresh]);

  const handleDisconnect = useCallback(async () => {
    if (!selectedVP) return;
    setDisconnecting(true);
    try {
      const res = await fetch(
        `/api/orgs/${orgSlug}/marketing-studio/conexiones`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ action: "disconnect", provider: selectedVP.platformGroup }),
        },
      );
      if (res.ok) {
        showMsg(`${selectedVP.displayName} desconectado correctamente.`);
        setSelectedVP(null);
        refresh();
      } else {
        showMsg("No se pudo desconectar. Intenta nuevamente.");
      }
    } catch {
      showMsg("Error al desconectar.");
    } finally {
      setDisconnecting(false);
    }
  }, [orgSlug, selectedVP, refresh]);

  const supportsDiscover = selectedCard
    ? (selectedCard.platformGroup === "meta" || selectedCard.platformGroup === "tiktok")
    : false;

  return (
    <div style={{ fontFamily: T.mono }}>

      {/* ── Indicador global ─────────────────────────────────── */}
      <GlobalIndicator resumen={data.resumen} />

      {/* ── KPI strip ────────────────────────────────────────── */}
      <ResumenStrip resumen={data.resumen} />

      {/* ── Feedback de acción ───────────────────────────────── */}
      {actionMsg && (
        <div style={{
          marginBottom: S[4],
          padding:      `${S[2]}px ${S[4]}px`,
          borderRadius: R.md,
          background:   `${C.blueDark}10`,
          border:       `1px solid ${C.blueBorder}`,
          fontFamily:   T.mono,
          fontSize:     T.sz.sm,
          color:        C.ink,
        }}>
          {isPending ? "⟳ " : "✓ "}{actionMsg}
        </div>
      )}

      {/* ── Header + refresh ─────────────────────────────────── */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        marginBottom:   S[4],
      }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
          Integraciones disponibles
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
          {isPending ? "Actualizando…" : "↻ Actualizar estado"}
        </button>
      </div>

      {/* ── Platform grid — todas siempre visibles ────────────── */}
      <ConnectionGrid
        orgSlug={orgSlug}
        cardsByGroup={cardsByGroup}
        onOpen={(vp) => setSelectedVP(vp)}
      />

      {/* ── Footer meta ──────────────────────────────────────── */}
      <div style={{
        marginTop:  S[5],
        fontFamily: T.mono,
        fontSize:   T.sz.xs,
        color:      C.inkFaint,
      }}>
        Última comprobación: {fmtDate(data.resumen.ultimaComprobacion)}
        <span style={{ marginLeft: S[2] }}>·</span>
        <span style={{ marginLeft: S[2] }}>
          Las credenciales se almacenan de forma segura y nunca se exponen en la interfaz.
        </span>
      </div>

      {/* ── Drawer ───────────────────────────────────────────── */}
      {selectedVP && (
        <PlatformDrawer
          vp={selectedVP}
          card={selectedCard}
          orgSlug={orgSlug}
          onClose={() => setSelectedVP(null)}
          onDiscover={supportsDiscover ? handleDiscover : undefined}
          onDisconnect={handleDisconnect}
          disconnecting={disconnecting}
          isPending={isPending}
        />
      )}
    </div>
  );
}
