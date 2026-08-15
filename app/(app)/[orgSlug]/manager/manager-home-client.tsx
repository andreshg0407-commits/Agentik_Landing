/**
 * Manager Home Client — Fable-certified executive cockpit.
 *
 * Sprint: AGENTIK-MANAGER-FABLE-INTEGRATION-M1
 *
 * Visual source of truth: manager-app-ref-02(1).html (Fable REF 02)
 * Order: date + personalized greeting, executive pulse, attention, module folders.
 * React only renders — no business math, no authorization.
 * No fake content. No demo data presented as real.
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ManagerHomePA, ManagerAttentionItem } from "@/lib/comercial/manager/manager-commercial-types";

// ── Fable design tokens (extend shared palette) ─────────────────────────────
// These match manager-app-ref-02(1).html CSS exactly.

const F = {
  brand:       "#004AAD",
  brand700:    "#003A8A",
  brand500:    "#1E63D8",
  brand400:    "#4F8FE8",
  brand100:    "#E5EEFB",
  brand50:     "#F2F6FE",
  ink900:      "#0B1730",
  ink700:      "#1F2D4A",
  ink500:      "#516079",
  ink400:      "#7B879A",
  ink300:      "#A9B2C4",
  ink200:      "#D4DAE5",
  ink50:       "#F4F6FA",
  bg:          "#FFFFFF",
  bgSoft:      "#F5F8FC",
  line:        "rgba(11,23,48,.08)",
  ok:          "#0B8A5F",
  okBg:        "#E9F6F1",
  warn:        "#B45F06",
  warnBg:      "#FDF3E6",
  bad:         "#C0392B",
  badBg:       "#FCEDEB",
  gradBrand:   "linear-gradient(135deg,#004AAD 0%,#1E63D8 60%,#4F8FE8 100%)",
  gradSoft:    "linear-gradient(135deg,#E5EEFB 0%,#F2F6FE 100%)",
  shSm:        "0 1px 2px rgba(11,23,48,.05)",
  sh:          "0 2px 10px -4px rgba(11,23,48,.10),0 1px 3px rgba(11,23,48,.04)",
  r:           14,
  rLg:         20,
  rXl:         22,
  font:        "'Inter', system-ui, -apple-system, sans-serif",
} as const;

// ── Types ────────────────────────────────────────────────────────────────────

export interface ManagerModuleCard {
  id:             string;
  label:          string;
  description:    string;
  accent:         string;
  href:           string;
  icon:           string;
  attentionCount: number;
}

// ── Greeting (client-side, browser timezone with America/Bogota fallback) ────

function getLocalGreeting(userName: string | null): string {
  let hour: number;
  try {
    const timeStr = new Date().toLocaleString("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    hour = parseInt(timeStr, 10);
  } catch {
    // Fallback: America/Bogota
    const timeStr = new Date().toLocaleString("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: "America/Bogota",
    });
    hour = parseInt(timeStr, 10);
  }

  const saludo = (hour >= 5 && hour < 12) ? "Buenos días" : (hour >= 12 && hour < 19) ? "Buenas tardes" : "Buenas noches";
  return userName ? `${saludo},\n${userName}` : saludo;
}

// ── Client ───────────────────────────────────────────────────────────────────

export function ManagerHomeClient({
  orgSlug,
  homePA,
  modules,
}: {
  orgSlug:  string;
  homePA:   ManagerHomePA;
  modules:  ManagerModuleCard[];
}) {
  const router = useRouter();
  const [expandedMod, setExpandedMod] = useState<string | null>(null);

  // Use server-computed greeting to avoid hydration mismatch (#425/#422).
  // Falls back to client greeting only if server didn't provide one.
  const clientGreeting = homePA.greeting || getLocalGreeting(homePA.userName);

  const attentionCount = homePA.attention.length;

  return (
    <div style={{
      padding:    "6px 20px 120px",
      fontFamily: F.font,
      color:      F.ink900,
      WebkitFontSmoothing: "antialiased",
    }}>
      {/* ── Date ─────────────────────────────────────────────────────────── */}
      <div style={{
        fontSize:      12,
        fontWeight:    600,
        color:         F.ink400,
        letterSpacing: "0.01em",
      }}>
        {homePA.currentDate}
      </div>

      {/* ── Greeting ─────────────────────────────────────────────────────── */}
      <h1 style={{
        margin:        "6px 0 0",
        fontSize:      28,
        fontWeight:    800,
        letterSpacing: "-0.035em",
        lineHeight:    1.1,
        whiteSpace:    "pre-line",
      }}>
        {clientGreeting}
      </h1>

      {/* ── Attention Section (up to 3 cards, overflow link) ──────────── */}
      {attentionCount > 0 && (
        <>
          <SectionHeader label="Requiere atención" count={attentionCount} />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {homePA.attention.slice(0, 3).map(item => (
              <AttentionCard
                key={item.id}
                item={item}
                onTap={() => item.href && router.push(item.href)}
              />
            ))}
            {attentionCount > 3 && (
              <button
                onClick={() => router.push(`/${orgSlug}/manager/alertas`)}
                style={{
                  all:           "unset",
                  cursor:        "pointer",
                  textAlign:     "center" as const,
                  fontSize:      13,
                  fontWeight:    700,
                  color:         F.brand,
                  padding:       "10px 0 2px",
                  touchAction:   "manipulation",
                }}
              >
                Ver todas ({attentionCount})
              </button>
            )}
          </div>
        </>
      )}

      {/* ── Modules ──────────────────────────────────────────────────────── */}
      {modules.length > 0 && (
        <>
          <SectionHeader label="Módulos" />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {modules.map(mod => (
              <ModuleFolder
                key={mod.id}
                mod={mod}
                orgSlug={orgSlug}
                isOpen={expandedMod === mod.id}
                onToggle={() => setExpandedMod(expandedMod === mod.id ? null : mod.id)}
                onNavigate={(href) => router.push(href)}
              />
            ))}
          </div>
        </>
      )}

      {modules.length === 0 && (
        <div style={{
          textAlign: "center",
          padding:   "48px 16px",
          color:     F.ink400,
          fontSize:  14,
        }}>
          No hay módulos habilitados para esta organización.
        </div>
      )}
    </div>
  );
}

// ── Section Header ──────────────────────────────────────────────────────────

function SectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div style={{
      display:        "flex",
      alignItems:     "center",
      justifyContent: "space-between",
      margin:         "26px 2px 12px",
    }}>
      <span style={{
        fontSize:      11.5,
        fontWeight:    750,
        letterSpacing: "0.11em",
        textTransform: "uppercase" as const,
        color:         F.ink400,
      }}>
        {label}
      </span>
      {count != null && (
        <span style={{
          fontSize:      12,
          fontWeight:    750,
          color:         F.ink500,
          background:    F.ink50,
          border:        `1px solid ${F.line}`,
          minWidth:      24,
          textAlign:     "center" as const,
          padding:       "2px 7px",
          borderRadius:  7,
        }}>
          {count}
        </span>
      )}
    </div>
  );
}

// ── Attention Card ──────────────────────────────────────────────────────────

function AttentionCard({ item, onTap }: { item: ManagerAttentionItem; onTap: () => void }) {
  const variant = item.severity === "critical" ? "bad" : item.severity === "warning" ? "warn" : "brand";
  const icBg = variant === "bad" ? F.badBg : variant === "warn" ? F.warnBg : F.gradSoft;
  const icColor = variant === "bad" ? F.bad : variant === "warn" ? F.warn : F.brand;

  return (
    <button
      onClick={onTap}
      style={{
        all:          "unset",
        cursor:       "pointer",
        display:      "flex",
        gap:          13,
        alignItems:   "flex-start",
        background:   F.bg,
        border:       `1px solid ${F.line}`,
        borderRadius: F.rLg,
        padding:      15,
        boxShadow:    F.shSm,
        boxSizing:    "border-box",
        width:        "100%",
        touchAction:  "manipulation",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <div style={{
        width:        36,
        height:       36,
        borderRadius: 11,
        background:   icBg,
        color:        icColor,
        display:      "grid",
        placeItems:   "center",
        flexShrink:   0,
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>
        </svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize:      11.5,
          fontWeight:    700,
          color:         F.ink400,
          letterSpacing: "0.02em",
        }}>
          {item.moduleLabel}
        </div>
        <div style={{
          fontSize:      14.5,
          fontWeight:    650,
          letterSpacing: "-0.015em",
          lineHeight:    1.35,
          marginTop:     3,
        }}>
          {item.title}
        </div>
        {item.href && (
          <span style={{
            display:     "inline-flex",
            alignItems:  "center",
            gap:         5,
            marginTop:   10,
            fontSize:    12.5,
            fontWeight:  700,
            color:       F.brand,
          }}>
            Ver análisis
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </span>
        )}
      </div>
    </button>
  );
}

// ── Module Folder ───────────────────────────────────────────────────────────

const COMMERCIAL_SURFACES = [
  { id: "ventas",        label: "Ventas" },
  { id: "clientes",      label: "Clientes" },
  { id: "vendedores",    label: "Vendedores" },
  { id: "pedidos",       label: "Pedidos" },
  { id: "tiendas",       label: "Tiendas" },
  { id: "inventario",    label: "Inventario" },
  { id: "importaciones", label: "Importaciones" },
];

function ModuleFolder({
  mod,
  orgSlug,
  isOpen,
  onToggle,
  onNavigate,
}: {
  mod:        ManagerModuleCard;
  orgSlug:    string;
  isOpen:     boolean;
  onToggle:   () => void;
  onNavigate: (href: string) => void;
}) {
  return (
    <div style={{
      background:   F.bg,
      border:       `1px solid ${isOpen ? F.brand100 : F.line}`,
      borderRadius: F.rXl,
      boxShadow:    isOpen ? F.sh : F.shSm,
      overflow:     "hidden",
    }}>
      {/* Folder header — card body navigates, chevron toggles expand */}
      <div
        style={{
          display:      "flex",
          alignItems:   "flex-start",
          padding:      "17px 17px 15px",
          gap:          0,
        }}
      >
        <button
          onClick={() => onNavigate(mod.href)}
          style={{
            all:          "unset",
            cursor:       "pointer",
            display:      "flex",
            gap:          13,
            alignItems:   "flex-start",
            flex:         1,
            minWidth:     0,
            touchAction:  "manipulation",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <div style={{
            width:          44,
            height:         44,
            borderRadius:   13,
            background:     isOpen ? F.gradBrand : F.gradSoft,
            color:          isOpen ? "#fff" : F.brand,
            display:        "grid",
            placeItems:     "center",
            fontSize:       13.5,
            fontWeight:     800,
            letterSpacing:  "-0.02em",
            flexShrink:     0,
          }}>
            {mod.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize:      17,
              fontWeight:    750,
              letterSpacing: "-0.025em",
            }}>
              {mod.label}
            </div>
            <div style={{
              fontSize:   12.5,
              color:      F.ink500,
              marginTop:  4,
              lineHeight: 1.4,
            }}>
              {mod.description}
            </div>
          </div>
        </button>
        <button
          onClick={onToggle}
          aria-label={isOpen ? "Contraer" : "Expandir"}
          style={{
            all:        "unset",
            cursor:     "pointer",
            color:      isOpen ? F.brand : F.ink300,
            flexShrink: 0,
            marginTop:  4,
            transform:  isOpen ? "rotate(90deg)" : "none",
            transition: "transform 0.15s ease",
            padding:    4,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      </div>

      {/* Attention footer strip */}
      {mod.attentionCount > 0 && !isOpen && (
        <div style={{
          display:      "flex",
          alignItems:   "center",
          gap:          7,
          padding:      "12px 17px",
          borderTop:    `1px solid ${F.line}`,
          background:   F.bgSoft,
          fontSize:     12.5,
          fontWeight:   650,
          color:        F.warn,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
          {mod.attentionCount} requieren atención
          <span style={{ flex: 1 }} />
          <span style={{ color: F.ink300 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </span>
        </div>
      )}

      {/* Expanded panel with surface rows */}
      {isOpen && (
        <div style={{ borderTop: `1px solid ${F.line}` }}>
          <div style={{
            padding:       "14px 17px 8px",
            fontSize:      11,
            fontWeight:    750,
            letterSpacing: "0.11em",
            textTransform: "uppercase" as const,
            color:         F.ink400,
          }}>
            Resumen ejecutivo
          </div>
          {COMMERCIAL_SURFACES.map(s => (
            <button
              key={s.id}
              onClick={() => onNavigate(`/${orgSlug}/manager/comercial/${s.id}`)}
              style={{
                all:           "unset",
                cursor:        "pointer",
                display:       "flex",
                alignItems:    "center",
                gap:           11,
                padding:       "13px 17px",
                borderTop:     `1px solid ${F.ink50}`,
                fontSize:      14.5,
                fontWeight:    600,
                letterSpacing: "-0.01em",
                width:         "100%",
                boxSizing:     "border-box",
                touchAction:   "manipulation",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              {s.label}
              <span style={{ flex: 1 }} />
              <span style={{ color: F.ink300 }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
