"use client";

/**
 * components/marketing-studio/redes/new/composer.tsx
 *
 * AGENTIK-MARKETING-PUBLISHER-01 — Publication Composer
 *
 * Distribution Composer — 4-step workspace operativo de publicación IA multi-canal.
 * Designed as a reusable Distribution Composer engine (future: Shopify, WhatsApp, campañas).
 *
 * All data: PLACEHOLDER — wire to real backend in Sprint AGENTIK-PUBLISHER-BACKEND-01.
 */

import Link     from "next/link";
import { useState } from "react";
import { C, T, S, R, E } from "@/lib/ui/tokens";

// ── Types ─────────────────────────────────────────────────────────────────────

type Step         = 1 | 2 | 3 | 4;
type ScheduleMode = "ahora" | "fecha" | "inteligente" | "masivo";
type CaptionMode  = "manual" | "ia";
type ContentTab   = "biblioteca" | "crear";

// ── PLACEHOLDER data ──────────────────────────────────────────────────────────

// Real-data channel type — derived from server-fetched connections
export interface ComposerAccountEntry {
  id:           string;  // connectionId
  provider:     string;
  label:        string;  // display label (provider name + optional account handle)
  connected:    boolean;
  isPrimary:    boolean;
  accountName:  string | null;
  accountHandle:string | null;
}

// Fallback channels shown when no connections data is passed (demo/preview mode)
const FALLBACK_CHANNELS: ComposerAccountEntry[] = [
  { id: "meta_instagram", provider: "meta_instagram", label: "Instagram", connected: false, isPrimary: false, accountName: null, accountHandle: null },
  { id: "meta_facebook",  provider: "meta_facebook",  label: "Facebook",  connected: false, isPrimary: false, accountName: null, accountHandle: null },
  { id: "tiktok",         provider: "tiktok",         label: "TikTok",    connected: false, isPrimary: false, accountName: null, accountHandle: null },
  { id: "youtube",        provider: "youtube",         label: "YouTube",   connected: false, isPrimary: false, accountName: null, accountHandle: null },
];

// PLACEHOLDER — replace with real Biblioteca asset query
const MOCK_ASSETS = [
  { id: "a1", type: "foto",     title: "Body floral bebé — studio",      accentColor: C.blueDark },
  { id: "a2", type: "reel",     title: "Unboxing sandalias verano kids", accentColor: "#E1306C"  },
  { id: "a3", type: "carrusel", title: "Lookbook infantil colección",    accentColor: "#059669"  },
  { id: "a4", type: "foto",     title: "Pijama cargo beige — producto",  accentColor: C.blueDark },
  { id: "a5", type: "video",    title: "Calzado artesanal temporada",    accentColor: "#7c3aed"  },
  { id: "a6", type: "foto",     title: "Conjunto dinosaurio azul",       accentColor: C.blueDark },
];

const TYPE_META: Record<string, { abbr: string; label: string }> = {
  foto:     { abbr: "FT", label: "Foto"     },
  reel:     { abbr: "RL", label: "Reel"     },
  carrusel: { abbr: "CR", label: "Carrusel" },
  video:    { abbr: "VD", label: "Video"    },
  story:    { abbr: "ST", label: "Historia" },
};

const CHANNEL_ACCENT: Record<string, string> = {
  instagram: "#E1306C",
  facebook:  "#1877F2",
  tiktok:    "#555555",
  youtube:   "#FF0000",
  whatsapp:  "#25D366",
  shopify:   "#96BF48",
};

const STEP_LABELS: Record<Step, string> = {
  1: "Canales",
  2: "Contenido",
  3: "Composer",
  4: "Publicar",
};

// PLACEHOLDER caption for IA demo mode
const IA_CAPTION_DEMO = `¡Nueva temporada de moda infantil! ✨

Descubre nuestra colección más fresca: colores vivos, telas suaves y diseños únicos para los más pequeños. Perfecta para cada aventura del día a día.

Enlace en bio para ver toda la colección 👆`;

const FREQ_OPTIONS = [
  { id: "daily",    label: "Todos los días"        },
  { id: "every2",   label: "Cada 2 días"           },
  { id: "mwf",      label: "Lun / Mié / Vie"       },
  { id: "weekends", label: "Solo fines de semana"  },
  { id: "ia_best",  label: "✨ Mejor horario IA"   },
];

// ── Step indicator ─────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: Step }) {
  const steps: Step[] = [1, 2, 3, 4];
  return (
    <div style={{
      display:        "flex",
      alignItems:     "center",
      justifyContent: "center",
      marginBottom:   S[6],
    }}>
      {steps.map((s, i) => {
        const done   = s < current;
        const active = s === current;
        return (
          <div key={s} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", gap: S[1] }}>
              <div style={{
                width:          28,
                height:         28,
                borderRadius:   "50%",
                background:     done ? C.greenDark : active ? C.blueDark : "transparent",
                border:         `2px solid ${done ? C.greenDark : active ? C.blueDark : C.inkGhost}`,
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
              }}>
                {done ? (
                  <span style={{ color: "#fff", fontSize: 10, fontWeight: T.wt.bold }}>✓</span>
                ) : (
                  <span style={{
                    fontFamily: T.mono,
                    fontSize:   T.sz.xs,
                    fontWeight: T.wt.bold,
                    color:      active ? "#fff" : C.inkGhost,
                  }}>
                    {s}
                  </span>
                )}
              </div>
              <span style={{
                fontFamily: T.mono,
                fontSize:   T.sz["2xs"],
                color:      done ? C.greenDark : active ? C.blueDark : C.inkGhost,
                fontWeight: active ? T.wt.bold : T.wt.normal,
                whiteSpace: "nowrap" as const,
              }}>
                {STEP_LABELS[s]}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div style={{
                width:        60,
                height:       2,
                background:   s < current ? C.greenDark + "60" : C.inkGhost + "30",
                marginBottom: 18,
                flexShrink:   0,
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Channel mark (compact colored icon) ──────────────────────────────────────

function ChannelMark({ id, size = 22 }: { id: string; size?: number }) {
  const accent  = CHANNEL_ACCENT[id] ?? C.inkGhost;
  const initial = id.charAt(0).toUpperCase();
  return (
    <div style={{
      width:          size,
      height:         size,
      borderRadius:   R.md,
      background:     accent,
      display:        "flex",
      alignItems:     "center",
      justifyContent: "center",
      flexShrink:     0,
    }}>
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.black, color: "#fff" }}>
        {initial}
      </span>
    </div>
  );
}

// ── Step 1 — Channel selection ─────────────────────────────────────────────────

function ChannelStep({
  selected,
  onToggle,
  orgSlug,
  channels,
}: {
  selected:  string[];
  onToggle:  (id: string) => void;
  orgSlug:   string;
  channels:  ComposerAccountEntry[];
}) {
  return (
    <div>
      <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginBottom: S[4], marginTop: 0 }}>
        Selecciona las cuentas de distribución para esta publicación.
      </p>
      <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
        {channels.map(ch => {
          const isSelected = selected.includes(ch.id);
          const canSelect  = ch.connected;
          const accent     = CHANNEL_ACCENT[ch.id] ?? C.inkGhost;
          return (
            <div
              key={ch.id}
              onClick={() => canSelect && onToggle(ch.id)}
              style={{
                display:      "flex",
                alignItems:   "center",
                gap:          S[3],
                padding:      `${S[2] + 2}px ${S[3]}px`,
                background:   isSelected ? C.blueLight : C.white,
                border:       `1px solid ${isSelected ? C.blueBorder : C.line}`,
                borderLeft:   `3px solid ${canSelect ? accent : C.inkGhost}`,
                borderRadius: R.lg,
                cursor:       canSelect ? "pointer" : "default",
                opacity:      1,
              }}
            >
              <ChannelMark id={ch.id} size={22} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: T.mono,
                  fontSize:   T.sz.sm,
                  fontWeight: T.wt.bold,
                  color:      canSelect ? C.ink : C.inkFaint,
                }}>
                  {ch.accountName ?? ch.label}
                  {ch.accountHandle && (
                    <span style={{ fontWeight: 400, color: C.inkFaint, marginLeft: 6, fontSize: T.sz.xs }}>
                      {ch.accountHandle}
                    </span>
                  )}
                </div>
                <div style={{
                  fontFamily: T.mono,
                  fontSize:   T.sz["2xs"],
                  color:      ch.connected ? C.greenDark : C.inkFaint,
                  marginTop:  2,
                }}>
                  {ch.connected
                    ? (ch.isPrimary ? "● Principal" : "● Conectado")
                    : "○ Sin conectar · Ir a Conexiones"}
                </div>
              </div>
              {/* Selection circle */}
              {canSelect && (
                <div style={{
                  width:          18,
                  height:         18,
                  borderRadius:   "50%",
                  border:         `2px solid ${isSelected ? C.blueDark : C.line}`,
                  background:     isSelected ? C.blueDark : "transparent",
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  flexShrink:     0,
                }}>
                  {isSelected && (
                    <span style={{ color: "#fff", fontSize: 9, fontWeight: T.wt.bold }}>✓</span>
                  )}
                </div>
              )}
              {/* Connect CTA for disconnected non-future */}
              {!ch.connected && (
                <Link
                  href={`/${orgSlug}/agentik/marketing-studio/connections`}
                  onClick={e => e.stopPropagation()}
                  style={{
                    fontFamily:    T.mono,
                    fontSize:      T.sz.xs,
                    color:         C.blueDark,
                    textDecoration:"none",
                    padding:       `${S[1]}px ${S[2]}px`,
                    background:    C.blueLight,
                    border:        `1px solid ${C.blueBorder}`,
                    borderRadius:  R.sm,
                    flexShrink:    0,
                    fontWeight:    T.wt.medium,
                  }}
                >
                  Conectar →
                </Link>
              )}
            </div>
          );
        })}
      </div>
      {channels.filter(ch => !ch.connected).length === channels.length && (
        <div style={{
          marginTop: S[4], padding: `${S[2]}px ${S[3]}px`,
          background: C.blueLight, borderRadius: R.md, border: `1px solid ${C.blueBorder}`,
          fontFamily: T.mono, fontSize: T.sz.xs, color: C.blueDark,
        }}>
          Ninguna cuenta conectada.{" "}
          <a href={`/${orgSlug}/agentik/marketing-studio/connections`}
            style={{ color: C.blueDark, fontWeight: T.wt.semibold }}>
            Conectar canales →
          </a>
        </div>
      )}
    </div>
  );
}

// ── Step 2 — Content selection ─────────────────────────────────────────────────

function ContentStep({
  tab,
  setTab,
  selectedAsset,
  setSelectedAsset,
  orgSlug,
}: {
  tab:              ContentTab;
  setTab:           (t: ContentTab) => void;
  selectedAsset:    string | null;
  setSelectedAsset: (id: string | null) => void;
  orgSlug:          string;
}) {
  return (
    <div>
      {/* Tabs */}
      <div style={{
        display:       "flex",
        gap:           S[1],
        borderBottom:  `1px solid ${C.line}`,
        marginBottom:  S[4],
        paddingBottom: 0,
      }}>
        {(["biblioteca", "crear"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              fontFamily:   T.mono,
              fontSize:     T.sz.xs,
              fontWeight:   T.wt.bold,
              color:        tab === t ? C.blueDark : C.inkFaint,
              background:   "transparent",
              border:       "none",
              borderBottom: `2px solid ${tab === t ? C.blueDark : "transparent"}`,
              cursor:       "pointer",
              padding:      `${S[2]}px ${S[3]}px`,
              marginBottom: -1,
              letterSpacing:"0.02em",
            }}
          >
            {t === "biblioteca" ? "Desde biblioteca" : "Crear nuevo"}
          </button>
        ))}
      </div>

      {tab === "biblioteca" && (
        <div>
          <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: 0, marginBottom: S[3] }}>
            Selecciona un asset para publicar.
          </p>
          <div style={{
            display:             "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap:                 S[3],
          }}>
            {MOCK_ASSETS.map(asset => {
              const meta       = TYPE_META[asset.type] ?? { abbr: "??", label: asset.type };
              const isSelected = selectedAsset === asset.id;
              return (
                <div
                  key={asset.id}
                  onClick={() => setSelectedAsset(isSelected ? null : asset.id)}
                  style={{
                    cursor:       "pointer",
                    borderRadius: R.lg,
                    border:       `2px solid ${isSelected ? C.blueDark : C.line}`,
                    overflow:     "hidden",
                    background:   C.white,
                    boxShadow:    isSelected ? `0 0 0 3px ${C.blueDark}20` : E.xs,
                  }}
                >
                  {/* Thumbnail */}
                  <div style={{
                    height:         96,
                    background:     asset.accentColor + "18",
                    display:        "flex",
                    alignItems:     "center",
                    justifyContent: "center",
                    position:       "relative" as const,
                    borderBottom:   `1px solid ${asset.accentColor}20`,
                  }}>
                    <span style={{
                      fontFamily: T.mono,
                      fontSize:   T.sz["2xl"],
                      fontWeight: T.wt.black,
                      color:      asset.accentColor,
                      opacity:    0.35,
                    }}>
                      {meta.abbr}
                    </span>
                    {isSelected && (
                      <div style={{
                        position:       "absolute" as const,
                        top:            S[1],
                        right:          S[1],
                        width:          20,
                        height:         20,
                        borderRadius:   "50%",
                        background:     C.blueDark,
                        display:        "flex",
                        alignItems:     "center",
                        justifyContent: "center",
                      }}>
                        <span style={{ color: "#fff", fontSize: 10, fontWeight: T.wt.bold }}>✓</span>
                      </div>
                    )}
                  </div>
                  {/* Meta */}
                  <div style={{ padding: `${S[2]}px ${S[2] + 2}px` }}>
                    <div style={{
                      fontFamily:    T.mono,
                      fontSize:      T.sz["2xs"],
                      color:         asset.accentColor,
                      fontWeight:    T.wt.bold,
                      marginBottom:  2,
                      textTransform: "uppercase" as const,
                      letterSpacing: "0.04em",
                    }}>
                      {meta.label}
                    </div>
                    <div style={{
                      fontFamily:   T.mono,
                      fontSize:     T.sz.xs,
                      color:        C.ink,
                      fontWeight:   T.wt.medium,
                      overflow:     "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace:   "nowrap" as const,
                    }}>
                      {asset.title}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: S[3], fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost, letterSpacing: "0.04em" }}>
            PLACEHOLDER — 6 assets de ejemplo · conectar con query real de Biblioteca
          </div>
        </div>
      )}

      {tab === "crear" && (
        <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>
          <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: 0, marginBottom: S[2] }}>
            Crea contenido nuevo sin salir del flujo de publicación.
          </p>
          {[
            {
              label:    "Foto Estudio",
              sub:      "Genera fotos de producto con IA",
              href:     `/${orgSlug}/agentik/marketing-studio/foto-estudio/new`,
              badge:    "✨ Activo",
              disabled: false,
            },
            {
              label:    "Video IA",
              sub:      "Crea reels y videos automáticamente",
              href:     "#",
              badge:    "Próximamente",
              disabled: true,
            },
            {
              label:    "Plantillas",
              sub:      "Elige una plantilla de marca",
              href:     "#",
              badge:    "Próximamente",
              disabled: true,
            },
          ].map(opt => (
            <Link
              key={opt.label}
              href={opt.href}
              style={{
                display:        "flex",
                alignItems:     "center",
                gap:            S[3],
                padding:        `${S[3]}px ${S[4]}px`,
                background:     C.white,
                border:         `1px solid ${C.line}`,
                borderLeft:     `3px solid ${opt.disabled ? C.line : C.blueDark}`,
                borderRadius:   R.lg,
                textDecoration: "none",
                opacity:        opt.disabled ? 0.5 : 1,
                cursor:         opt.disabled ? "default" : "pointer",
                boxShadow:      E.xs,
                pointerEvents:  opt.disabled ? "none" : "auto" as const,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: T.mono,
                  fontSize:   T.sz.sm,
                  fontWeight: T.wt.bold,
                  color:      C.ink,
                  marginBottom: 3,
                }}>
                  {opt.label}
                </div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                  {opt.sub}
                </div>
              </div>
              <span style={{
                fontFamily:    T.mono,
                fontSize:      T.sz["2xs"],
                color:         opt.disabled ? C.inkGhost : C.blueDark,
                background:    opt.disabled ? C.surfaceAlt : C.blueLight,
                border:        `1px solid ${opt.disabled ? C.line : C.blueBorder}`,
                borderRadius:  R.pill,
                padding:       `2px ${S[2]}px`,
                fontWeight:    T.wt.bold,
                letterSpacing: "0.04em",
                flexShrink:    0,
              }}>
                {opt.badge}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Step 3 — Composer center ───────────────────────────────────────────────────

function ComposerStep({
  caption,
  setCaption,
  captionMode,
  setCaptionMode,
  hashtags,
  setHashtags,
  cta,
  setCta,
  adaptByPlatform,
  setAdaptByPlatform,
  selectedChannels,
}: {
  caption:            string;
  setCaption:         (v: string) => void;
  captionMode:        CaptionMode;
  setCaptionMode:     (v: CaptionMode) => void;
  hashtags:           string;
  setHashtags:        (v: string) => void;
  cta:                string;
  setCta:             (v: string) => void;
  adaptByPlatform:    boolean;
  setAdaptByPlatform: (v: boolean) => void;
  selectedChannels:   string[];
}) {
  const PLATFORM_HINTS: Record<string, string> = {
    instagram: "hashtags visuales · tono aspiracional",
    facebook:  "más descriptivo · orientado a conversión",
    tiktok:    "caption corto · call-to-action directo",
    youtube:   "descripción extendida · SEO friendly",
    whatsapp:  "mensaje personal · link de tienda",
    shopify:   "descripción de producto · SEO optimizado",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[5] }}>

      {/* Caption */}
      <div>
        <div style={{
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          marginBottom:   S[2],
        }}>
          <label style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.ink }}>
            Caption
          </label>
          {/* Mode toggle */}
          <div style={{
            display:      "flex",
            background:   C.surfaceAlt,
            borderRadius: R.pill,
            padding:      2,
            gap:          2,
          }}>
            {(["manual", "ia"] as const).map(m => (
              <button
                key={m}
                onClick={() => {
                  setCaptionMode(m);
                  if (m === "ia") setCaption(IA_CAPTION_DEMO);
                }}
                style={{
                  fontFamily:    T.mono,
                  fontSize:      T.sz["2xs"],
                  fontWeight:    T.wt.bold,
                  color:         captionMode === m ? "#fff" : C.inkFaint,
                  background:    captionMode === m ? C.blueDark : "transparent",
                  border:        "none",
                  borderRadius:  R.pill,
                  padding:       `${S[1]}px ${S[2] + 2}px`,
                  cursor:        "pointer",
                  letterSpacing: "0.03em",
                }}
              >
                {m === "manual" ? "Manual" : "✨ Generar IA"}
              </button>
            ))}
          </div>
        </div>
        <textarea
          value={caption}
          onChange={e => setCaption(e.target.value)}
          placeholder="Escribe el caption de tu publicación…"
          style={{
            width:      "100%",
            height:     156,
            fontFamily: T.mono,
            fontSize:   T.sz.sm,
            color:      C.ink,
            background: captionMode === "ia" ? C.blueLight : C.white,
            border:     `1px solid ${captionMode === "ia" ? C.blueBorder : C.line}`,
            borderRadius: R.md,
            padding:    `${S[3]}px`,
            resize:     "vertical" as const,
            outline:    "none",
            lineHeight: 1.6,
            boxSizing:  "border-box" as const,
          }}
        />
        {captionMode === "ia" && (
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.blueDark, marginTop: S[1], opacity: 0.7 }}>
            ✨ Caption generado por IA · PLACEHOLDER — conectar con engine
          </div>
        )}
      </div>

      {/* Hashtags */}
      <div>
        <div style={{
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          marginBottom:   S[2],
        }}>
          <label style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.ink }}>
            Hashtags
          </label>
          <button style={{
            fontFamily:   T.mono,
            fontSize:     T.sz.xs,
            color:        C.blueDark,
            background:   C.blueLight,
            border:       `1px solid ${C.blueBorder}`,
            borderRadius: R.sm,
            padding:      `${S[1]}px ${S[2]}px`,
            cursor:       "pointer",
            fontWeight:   T.wt.medium,
          }}>
            Optimizar con IA →
          </button>
        </div>
        <textarea
          value={hashtags}
          onChange={e => setHashtags(e.target.value)}
          placeholder="#hashtag1 #hashtag2 #hashtag3"
          style={{
            width:      "100%",
            height:     64,
            fontFamily: T.mono,
            fontSize:   T.sz.xs,
            color:      C.ink,
            background: C.white,
            border:     `1px solid ${C.line}`,
            borderRadius: R.md,
            padding:    `${S[2] + 2}px ${S[3]}px`,
            resize:     "vertical" as const,
            outline:    "none",
            lineHeight: 1.8,
            boxSizing:  "border-box" as const,
          }}
        />
      </div>

      {/* CTA */}
      <div>
        <label style={{
          display:      "block",
          fontFamily:   T.mono,
          fontSize:     T.sz.xs,
          fontWeight:   T.wt.bold,
          color:        C.ink,
          marginBottom: S[2],
        }}>
          CTA
        </label>
        <select
          value={cta}
          onChange={e => setCta(e.target.value)}
          style={{
            fontFamily:   T.mono,
            fontSize:     T.sz.sm,
            color:        C.ink,
            background:   C.white,
            border:       `1px solid ${C.line}`,
            borderRadius: R.md,
            padding:      `${S[2]}px ${S[3]}px`,
            width:        "100%",
            outline:      "none",
            cursor:       "pointer",
            boxSizing:    "border-box" as const,
          }}
        >
          <option value="comprar">Comprar ahora</option>
          <option value="coleccion">Ver colección</option>
          <option value="whatsapp">Escribir por WhatsApp</option>
          <option value="reservar">Reservar</option>
          <option value="info">Más información</option>
        </select>
      </div>

      {/* Platform variants toggle */}
      <div style={{
        padding:      `${S[3]}px ${S[4]}px`,
        background:   adaptByPlatform ? C.blueLight : C.surfaceAlt,
        border:       `1px solid ${adaptByPlatform ? C.blueBorder : C.line}`,
        borderRadius: R.lg,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: S[3] }}>
          <div
            onClick={() => setAdaptByPlatform(!adaptByPlatform)}
            style={{
              width:          20,
              height:         20,
              borderRadius:   R.sm,
              border:         `2px solid ${adaptByPlatform ? C.blueDark : C.line}`,
              background:     adaptByPlatform ? C.blueDark : "transparent",
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              cursor:         "pointer",
              flexShrink:     0,
              marginTop:      2,
            }}
          >
            {adaptByPlatform && (
              <span style={{ color: "#fff", fontSize: 10, fontWeight: T.wt.bold }}>✓</span>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: T.mono,
              fontSize:   T.sz.sm,
              fontWeight: T.wt.bold,
              color:      C.ink,
              marginBottom: 4,
            }}>
              Adaptar automáticamente por plataforma
            </div>
            <div style={{
              fontFamily:   T.mono,
              fontSize:     T.sz.xs,
              color:        C.inkFaint,
              marginBottom: adaptByPlatform && selectedChannels.length > 0 ? S[3] : 0,
            }}>
              Agentik ajusta caption, hashtags y formato según cada canal seleccionado.
            </div>
            {adaptByPlatform && selectedChannels.length > 0 && (
              <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" as const }}>
                {selectedChannels.map(ch => (
                  <span key={ch} style={{
                    fontFamily:   T.mono,
                    fontSize:     T.sz["2xs"],
                    padding:      `2px ${S[2]}px`,
                    background:   "#fff",
                    border:       `1px solid ${C.blueBorder}`,
                    borderRadius: R.pill,
                    color:        C.blueDark,
                    fontWeight:   T.wt.medium,
                  }}>
                    {ch.charAt(0).toUpperCase() + ch.slice(1)}: {PLATFORM_HINTS[ch] ?? "adaptado"}
                  </span>
                ))}
              </div>
            )}
            {adaptByPlatform && selectedChannels.length === 0 && (
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, fontStyle: "italic" }}>
                Selecciona canales en el paso 1 para ver adaptaciones.
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Step 4 — Schedule ──────────────────────────────────────────────────────────

function ScheduleStep({
  mode,
  setMode,
  scheduleDate,
  setScheduleDate,
  scheduleTime,
  setScheduleTime,
  massiveCount,
  setMassiveCount,
  selectedChannels,
}: {
  mode:             ScheduleMode;
  setMode:          (v: ScheduleMode) => void;
  scheduleDate:     string;
  setScheduleDate:  (v: string) => void;
  scheduleTime:     string;
  setScheduleTime:  (v: string) => void;
  massiveCount:     number;
  setMassiveCount:  (v: number) => void;
  selectedChannels: string[];
}) {
  const MODE_CARDS: { id: ScheduleMode; title: string; sub: string; icon: string }[] = [
    { id: "ahora",       title: "Publicar ahora",           sub: "Distribución inmediata",               icon: "▶" },
    { id: "fecha",       title: "Fecha y hora",             sub: "Momento específico programado",        icon: "◷" },
    { id: "inteligente", title: "Programación inteligente", sub: "Frecuencia automática recurrente",     icon: "✨" },
    { id: "masivo",      title: "Distribución masiva",      sub: "Organiza un mes completo con IA",      icon: "⚡" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[4] }}>

      {/* Mode cards 2×2 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: S[3] }}>
        {MODE_CARDS.map(card => {
          const active = mode === card.id;
          return (
            <div
              key={card.id}
              onClick={() => setMode(card.id)}
              style={{
                padding:      `${S[3]}px ${S[3] + 2}px`,
                background:   active ? C.blueLight : C.white,
                border:       `1px solid ${active ? C.blueDark : C.line}`,
                borderLeft:   `3px solid ${active ? C.blueDark : C.lineSubtle ?? C.line}`,
                borderRadius: R.lg,
                cursor:       "pointer",
                boxShadow:    active ? `0 0 0 1px ${C.blueDark}15` : E.xs,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: 4 }}>
                <span style={{ fontSize: 13, lineHeight: 1, flexShrink: 0 }}>{card.icon}</span>
                <span style={{
                  fontFamily: T.mono,
                  fontSize:   T.sz.sm,
                  fontWeight: T.wt.bold,
                  color:      active ? C.blueDark : C.ink,
                }}>
                  {card.title}
                </span>
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                {card.sub}
              </div>
            </div>
          );
        })}
      </div>

      {/* Expanded: publicar ahora */}
      {mode === "ahora" && (
        <div style={{
          padding:      `${S[3]}px ${S[4]}px`,
          background:   C.greenLight,
          border:       `1px solid ${C.greenBorder}`,
          borderLeft:   `3px solid ${C.greenDark}`,
          borderRadius: R.lg,
          fontFamily:   T.mono,
          fontSize:     T.sz.xs,
          color:        C.greenDark,
          fontWeight:   T.wt.medium,
        }}>
          ● Publicará inmediatamente al confirmar en{" "}
          {selectedChannels.length > 0
            ? selectedChannels.map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(", ")
            : "los canales seleccionados"}.
        </div>
      )}

      {/* Expanded: fecha única */}
      {mode === "fecha" && (
        <div style={{
          padding:      S[4],
          background:   C.white,
          border:       `1px solid ${C.line}`,
          borderRadius: R.lg,
          display:      "flex",
          gap:          S[4],
          alignItems:   "flex-end",
        }}>
          <div style={{ flex: 1 }}>
            <label style={{
              display:      "block",
              fontFamily:   T.mono,
              fontSize:     T.sz.xs,
              fontWeight:   T.wt.bold,
              color:        C.ink,
              marginBottom: S[1] + 1,
            }}>
              Fecha
            </label>
            <input
              type="date"
              value={scheduleDate}
              onChange={e => setScheduleDate(e.target.value)}
              style={{
                fontFamily:   T.mono,
                fontSize:     T.sz.sm,
                color:        C.ink,
                background:   C.white,
                border:       `1px solid ${C.line}`,
                borderRadius: R.md,
                padding:      `${S[2]}px ${S[3]}px`,
                width:        "100%",
                outline:      "none",
                boxSizing:    "border-box" as const,
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{
              display:      "block",
              fontFamily:   T.mono,
              fontSize:     T.sz.xs,
              fontWeight:   T.wt.bold,
              color:        C.ink,
              marginBottom: S[1] + 1,
            }}>
              Hora
            </label>
            <input
              type="time"
              value={scheduleTime}
              onChange={e => setScheduleTime(e.target.value)}
              style={{
                fontFamily:   T.mono,
                fontSize:     T.sz.sm,
                color:        C.ink,
                background:   C.white,
                border:       `1px solid ${C.line}`,
                borderRadius: R.md,
                padding:      `${S[2]}px ${S[3]}px`,
                width:        "100%",
                outline:      "none",
                boxSizing:    "border-box" as const,
              }}
            />
          </div>
        </div>
      )}

      {/* Expanded: programación inteligente */}
      {mode === "inteligente" && (
        <div style={{
          padding:      S[4],
          background:   C.white,
          border:       `1px solid ${C.line}`,
          borderRadius: R.lg,
        }}>
          <div style={{
            fontFamily:   T.mono,
            fontSize:     T.sz.xs,
            fontWeight:   T.wt.bold,
            color:        C.ink,
            marginBottom: S[3],
          }}>
            Frecuencia de publicación
          </div>
          <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
            {FREQ_OPTIONS.map(opt => (
              <label key={opt.id} style={{
                display:     "flex",
                alignItems:  "center",
                gap:         S[2],
                cursor:      "pointer",
                fontFamily:  T.mono,
                fontSize:    T.sz.sm,
                color:       C.ink,
                padding:     `${S[1] + 1}px ${S[2]}px`,
                borderRadius:R.sm,
              }}>
                <input
                  type="radio"
                  name="freq"
                  value={opt.id}
                  style={{ accentColor: C.blueDark }}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Expanded: distribución masiva */}
      {mode === "masivo" && (
        <div style={{
          padding:      S[4],
          background:   C.white,
          border:       `1px solid ${C.line}`,
          borderRadius: R.lg,
        }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.ink, marginBottom: S[2] }}>
            Distribución masiva mensual
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginBottom: S[4] }}>
            Agentik organiza horarios, balancea plataformas y genera la cola operativa completa.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: S[3], marginBottom: S[4] }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, fontWeight: T.wt.medium }}>
              Piezas este mes:
            </span>
            <input
              type="number"
              min={1}
              max={60}
              value={massiveCount}
              onChange={e => setMassiveCount(Number(e.target.value))}
              style={{
                fontFamily:   T.mono,
                fontSize:     T.sz["2xl"],
                fontWeight:   T.wt.black,
                color:        C.blueDark,
                background:   C.blueLight,
                border:       `1px solid ${C.blueBorder}`,
                borderRadius: R.md,
                padding:      `${S[1]}px ${S[3]}px`,
                width:        80,
                textAlign:    "center" as const,
                outline:      "none",
              }}
            />
          </div>
          <div style={{
            padding:      `${S[3]}px`,
            background:   C.blueLight,
            border:       `1px solid ${C.blueBorder}`,
            borderRadius: R.md,
          }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.blueDark, marginBottom: S[1] }}>
              ⚡ Distribución estimada
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
              {massiveCount} pieza{massiveCount !== 1 ? "s" : ""} · {Math.ceil(massiveCount / 4)} semana{Math.ceil(massiveCount / 4) !== 1 ? "s" : ""} · canales:{" "}
              {selectedChannels.length > 0 ? selectedChannels.join(", ") : "pendientes"}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost, marginTop: S[2], letterSpacing: "0.04em" }}>
              PLACEHOLDER — motor de distribución masiva activo en Sprint AGENTIK-MASS-DIST-01
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main compositor ────────────────────────────────────────────────────────────

export function PublicationComposer({
  orgSlug,
  connectedAccounts,
}: {
  orgSlug:           string;
  connectedAccounts?: ComposerAccountEntry[];
}) {
  const [step,             setStep            ] = useState<Step>(1);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [selectedAsset,    setSelectedAsset   ] = useState<string | null>(null);
  const [contentTab,       setContentTab      ] = useState<ContentTab>("biblioteca");
  const [caption,          setCaption         ] = useState("");
  const [captionMode,      setCaptionMode     ] = useState<CaptionMode>("manual");
  const [hashtags,         setHashtags        ] = useState("#modainfantil #kidsfashion #castillitos");
  const [cta,              setCta             ] = useState("comprar");
  const [adaptByPlatform,  setAdaptByPlatform ] = useState(true);
  const [scheduleMode,     setScheduleMode    ] = useState<ScheduleMode>("ahora");
  const [scheduleDate,     setScheduleDate    ] = useState("");
  const [scheduleTime,     setScheduleTime    ] = useState("18:00");
  const [massiveCount,     setMassiveCount    ] = useState(8);

  // Derive channel list — use real accounts or fallback for preview
  const channels: ComposerAccountEntry[] = connectedAccounts && connectedAccounts.length > 0
    ? connectedAccounts
    : FALLBACK_CHANNELS;

  function toggleChannel(id: string) {
    setSelectedChannels(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  }

  const canProceed =
    (step === 1 && selectedChannels.length > 0) ||
    (step === 2 && selectedAsset !== null)       ||
    step === 3 ||
    step === 4;

  const STEP_TITLES: Record<Step, string> = {
    1: "Canales de distribución",
    2: "Selecciona el contenido",
    3: "Composer de publicación",
    4: "Programar distribución",
  };
  const STEP_SUBS: Record<Step, string> = {
    1: "Elige los canales donde se distribuirá esta publicación.",
    2: "Selecciona un asset de tu biblioteca o crea contenido nuevo.",
    3: "Redacta el caption, hashtags, CTA y adapta por plataforma.",
    4: "Define cuándo y con qué frecuencia se publicará.",
  };

  return (
    <div>
      <StepIndicator current={step} />

      {/* Canvas — single column */}
        <div style={{
          background:   C.white,
          border:       `1px solid ${C.line}`,
          borderRadius: R.lg,
          padding:      `${S[5]}px`,
          boxShadow:    E.sm,
          marginBottom: S[5],
        }}>
          {/* Step heading */}
          <div style={{
            marginBottom:  S[5],
            paddingBottom: S[3],
            borderBottom:  `1px solid ${C.lineSubtle ?? C.line}`,
          }}>
            <div style={{
              fontFamily:    T.mono,
              fontSize:      T.sz["2xs"],
              color:         C.inkGhost,
              letterSpacing: "0.06em",
              textTransform: "uppercase" as const,
              marginBottom:  S[1],
            }}>
              Paso {step} de 4
            </div>
            <div style={{
              fontFamily:    T.mono,
              fontSize:      T.sz.xl,
              fontWeight:    T.wt.black,
              color:         C.ink,
              letterSpacing: "-0.01em",
              marginBottom:  4,
            }}>
              {STEP_TITLES[step]}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
              {STEP_SUBS[step]}
            </div>
          </div>

          {step === 1 && (
            <ChannelStep
              selected={selectedChannels}
              onToggle={toggleChannel}
              orgSlug={orgSlug}
              channels={channels}
            />
          )}
          {step === 2 && (
            <ContentStep
              tab={contentTab}
              setTab={setContentTab}
              selectedAsset={selectedAsset}
              setSelectedAsset={setSelectedAsset}
              orgSlug={orgSlug}
            />
          )}
          {step === 3 && (
            <ComposerStep
              caption={caption}
              setCaption={setCaption}
              captionMode={captionMode}
              setCaptionMode={setCaptionMode}
              hashtags={hashtags}
              setHashtags={setHashtags}
              cta={cta}
              setCta={setCta}
              adaptByPlatform={adaptByPlatform}
              setAdaptByPlatform={setAdaptByPlatform}
              selectedChannels={selectedChannels}
            />
          )}
          {step === 4 && (
            <ScheduleStep
              mode={scheduleMode}
              setMode={setScheduleMode}
              scheduleDate={scheduleDate}
              setScheduleDate={setScheduleDate}
              scheduleTime={scheduleTime}
              setScheduleTime={setScheduleTime}
              massiveCount={massiveCount}
              setMassiveCount={setMassiveCount}
              selectedChannels={selectedChannels}
            />
          )}
        </div>

      {/* Action footer */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        marginTop:      S[5],
        padding:        `${S[3] + 2}px ${S[5]}px`,
        background:     C.white,
        border:         `1px solid ${C.line}`,
        borderRadius:   R.lg,
        boxShadow:      E.sm,
      }}>
        {/* Left actions */}
        <div style={{ display: "flex", alignItems: "center", gap: S[3] }}>
          {step > 1 && (
            <button
              onClick={() => setStep((step - 1) as Step)}
              style={{
                fontFamily:   T.mono,
                fontSize:     T.sz.sm,
                fontWeight:   T.wt.medium,
                color:        C.inkMid,
                background:   C.surface,
                border:       `1px solid ${C.line}`,
                borderRadius: R.md,
                padding:      `${S[2]}px ${S[4]}px`,
                cursor:       "pointer",
              }}
            >
              ← Anterior
            </button>
          )}
          <button
            style={{
              fontFamily: T.mono,
              fontSize:   T.sz.sm,
              color:      C.inkFaint,
              background: "transparent",
              border:     "none",
              cursor:     "pointer",
              padding:    `${S[2]}px ${S[2]}px`,
              fontWeight: T.wt.normal,
            }}
          >
            Guardar borrador
          </button>
        </div>

        {/* Right actions */}
        <div style={{ display: "flex", alignItems: "center", gap: S[3] }}>
          <span style={{
            fontFamily:  T.mono,
            fontSize:    T.sz["2xs"],
            color:       C.inkGhost,
            letterSpacing:"0.04em",
          }}>
            {step < 4
              ? `${4 - step} paso${4 - step !== 1 ? "s" : ""} restante${4 - step !== 1 ? "s" : ""}`
              : "listo para distribuir"
            }
          </span>
          {step < 4 ? (
            <button
              onClick={() => canProceed && setStep((step + 1) as Step)}
              disabled={!canProceed}
              style={{
                fontFamily:   T.mono,
                fontSize:     T.sz.sm,
                fontWeight:   T.wt.bold,
                color:        canProceed ? "#fff" : C.inkGhost,
                background:   canProceed ? C.blueDark : C.surfaceAlt,
                border:       "none",
                borderRadius: R.md,
                padding:      `${S[2]}px ${S[5]}px`,
                cursor:       canProceed ? "pointer" : "default",
              }}
            >
              Siguiente →
            </button>
          ) : (
            <button
              style={{
                fontFamily:   T.mono,
                fontSize:     T.sz.sm,
                fontWeight:   T.wt.bold,
                color:        "#fff",
                background:   C.blueDark,
                border:       "none",
                borderRadius: R.md,
                padding:      `${S[2]}px ${S[5]}px`,
                cursor:       "pointer",
                boxShadow:    `0 2px 8px ${C.blueDark}40`,
              }}
            >
              ⚡ Distribuir ahora
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
