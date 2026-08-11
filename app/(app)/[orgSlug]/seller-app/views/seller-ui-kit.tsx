/**
 * Seller App — Visual UI Kit (AGENTIK-SELLER-APP-UX-01).
 *
 * The single visual grammar for the Seller App (§42/§46):
 *   icons (SVG — no emojis), cards, buttons, chips, section labels,
 *   empty states, brand assets, and the Agentik Copilot sphere.
 *
 * PRESENTATION ONLY — no domain logic, no calculations, no data fetching.
 * Tokens come from @/lib/ui/tokens; brand assets from /public (supplied,
 * never redrawn): /agentik-logo.png (full lockup) · /agentik-mark.png (mark).
 */
"use client";

import type { CSSProperties, ReactNode } from "react";
import { C, T, S, R, E } from "@/lib/ui/tokens";

// ── Icon set (stroke SVG, 24×24, lucide-style — §no-emoji-icons) ─────────────

const ICON_PATHS: Record<string, ReactNode> = {
  home: (
    <>
      <path d="M3 11 12 3l9 8" />
      <path d="M5 10v11h5v-6h4v6h5V10" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5" />
      <path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M17.8 14.9c2.2.7 3.7 2.3 3.7 5.1" />
    </>
  ),
  cart: (
    <>
      <path d="M2.5 4h2.5l2.5 11.5a1.8 1.8 0 0 0 1.8 1.5h8.6a1.8 1.8 0 0 0 1.8-1.4L21.5 8H6" />
      <circle cx="10" cy="20.4" r="1.4" />
      <circle cx="17.5" cy="20.4" r="1.4" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5" y="4.5" width="14" height="17" rx="2" />
      <path d="M9 4.5V3h6v1.5M9 10h6M9 14h6M9 18h4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </>
  ),
  bell: (
    <>
      <path d="M18 9a6 6 0 0 0-12 0c0 6.2-2.5 8-2.5 8h17S18 15.2 18 9" />
      <path d="M13.6 20.5a1.9 1.9 0 0 1-3.2 0" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3" y="7.5" width="18" height="13" rx="2" />
      <path d="M8.5 7.5V5.4A1.9 1.9 0 0 1 10.4 3.5h3.2a1.9 1.9 0 0 1 1.9 1.9v2.1M3 12.5h18" />
    </>
  ),
  camera: (
    <>
      <path d="M22 18.5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3.2l1.8-2.5h6L16.8 7H20a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13.4" r="3.6" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 4.2 2.2 17.8A1.9 1.9 0 0 0 3.8 20.7h16.4a1.9 1.9 0 0 0 1.6-2.9L13.7 4.2a1.9 1.9 0 0 0-3.4 0z" />
      <path d="M12 9.5v4.2" />
      <circle cx="12" cy="17" r="0.4" />
    </>
  ),
  pin: (
    <>
      <path d="M20.5 10.2c0 6.4-8.5 11.8-8.5 11.8S3.5 16.6 3.5 10.2a8.5 8.5 0 0 1 17 0z" />
      <circle cx="12" cy="10.2" r="3" />
    </>
  ),
  chevronRight: <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />,
  phone: (
    <path d="M5 4h3.5l1.5 4-2 1.5a12.5 12.5 0 0 0 6.5 6.5L16 14l4 1.5V19a1.5 1.5 0 0 1-1.6 1.5C10.4 19.9 4.1 13.6 3.5 5.6A1.5 1.5 0 0 1 5 4Z" />
  ),
  whatsapp: (
    <>
      <path d="M12 3.5a8.5 8.5 0 0 0-7.3 12.8L3.5 20.5l4.3-1.1A8.5 8.5 0 1 0 12 3.5Z" />
      <path d="M9 8.8c.7 2.6 2.6 4.5 5.2 5.2l.9-1.4 2 .9" strokeWidth="1.6" />
    </>
  ),
  arrowRight: (
    <>
      <path d="M4.5 12h15" />
      <path d="m13 5.5 6.5 6.5L13 18.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7.2" />
      <path d="m20.8 20.8-4.6-4.6" />
    </>
  ),
  box: (
    <>
      <path d="M21 8.2 12 3.4 3 8.2v7.6l9 4.8 9-4.8z" />
      <path d="M3 8.2l9 4.8 9-4.8M12 13v7.6" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5" />
      <circle cx="12" cy="8" r="0.4" />
    </>
  ),
  check: <path d="M20 6.5 9.5 17 4.5 12" />,
  back: <path d="M14.5 5.5 8 12l6.5 6.5" />,
  plus: (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>
  ),
  minus: <line x1="5" y1="12" x2="19" y2="12" />,
  trash: (
    <>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </>
  ),
  pencil: (
    <>
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7.2 18.8l-4 1 1-4z" />
    </>
  ),
  shareExternal: (
    <>
      <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </>
  ),
  download: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </>
  ),
};

export function SellerIcon({
  name, size = 20, color = C.ink, strokeWidth = 1.9,
}: {
  name: keyof typeof ICON_PATHS | string;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, display: "block" }}
    >
      {ICON_PATHS[name] ?? null}
    </svg>
  );
}

// ── Brand ───────────────────────────────────────────────────────────────────

/** Logo Agentik REAL (asset suministrado, sin redibujar). */
export function AgentikLogo({ height = 96 }: { height?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/agentik-logo.png" alt="Agentik Enterprise AI" style={{ height, width: "auto", display: "block" }} />;
}

/** Marca Agentik (recorte del asset real — solo la retícula con la A). */
export function AgentikMark({ size = 40, radius = 10 }: { size?: number; radius?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/agentik-mark.png" alt="" aria-hidden style={{ width: size, height: size, borderRadius: radius, display: "block" }} />;
}

// ── Layout primitives ───────────────────────────────────────────────────────

export const appCard: CSSProperties = {
  background: C.white,
  border: `1px solid ${C.line}`,
  borderRadius: 16,
  boxShadow: E.sm,
};

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: S[2], margin: `${S[4]}px 0 ${S[2]}px` }}>
      <span style={{ fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.inkLight, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
        {children}
      </span>
      {right}
    </div>
  );
}

export function StatusChip({ bg, color, children }: { bg: string; color: string; children: ReactNode }) {
  return (
    <span style={{
      fontSize: T.sz.xs, fontWeight: T.wt.semibold, color, background: bg,
      padding: `3px ${S[2]}px`, borderRadius: R.pill, whiteSpace: "nowrap", lineHeight: 1.4,
    }}>
      {children}
    </span>
  );
}

// ── Buttons (touch-first: ≥48px) ────────────────────────────────────────────

export const btnPrimary: CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center", gap: S[2],
  width: "100%", minHeight: 48, padding: `${S[3]}px ${S[4]}px`,
  background: C.blueDark, color: C.white, border: "none", borderRadius: 14,
  fontFamily: T.sans, fontSize: T.sz.lg, fontWeight: T.wt.semibold,
  cursor: "pointer", boxShadow: E.md, touchAction: "manipulation" as const,
};

export const btnSecondary: CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center", gap: S[2],
  width: "100%", minHeight: 48, padding: `${S[3]}px ${S[4]}px`,
  background: C.white, color: C.blueDark, border: `1.5px solid ${C.blueBorder}`,
  borderRadius: 14, fontFamily: T.sans, fontSize: T.sz.lg, fontWeight: T.wt.semibold,
  cursor: "pointer", touchAction: "manipulation" as const,
};

export const searchInput: CSSProperties = {
  width: "100%", minHeight: 48, padding: `${S[3]}px ${S[3]}px ${S[3]}px 42px`,
  border: `1.5px solid ${C.line}`, borderRadius: 14, fontFamily: T.sans,
  fontSize: 16, background: C.white, color: C.ink, outline: "none",
  boxSizing: "border-box" as const,
};

export function SearchField({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <div style={{ position: "relative" }}>
      <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }}>
        <SellerIcon name="search" size={18} color={C.inkFaint} />
      </span>
      <input
        type="search" value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} aria-label={placeholder} style={searchInput}
      />
    </div>
  );
}

// ── Empty / loading states ──────────────────────────────────────────────────

export function EmptyState({ icon, title, subtitle }: { icon: string; title: string; subtitle?: string }) {
  return (
    <div style={{ textAlign: "center", padding: `${S[10]}px ${S[4]}px` }}>
      <div style={{
        width: 56, height: 56, borderRadius: 18, background: C.surfaceAlt,
        display: "flex", alignItems: "center", justifyContent: "center", margin: `0 auto ${S[3]}px`,
      }}>
        <SellerIcon name={icon} size={26} color={C.inkFaint} />
      </div>
      <div style={{ fontSize: T.sz.lg, fontWeight: T.wt.semibold, color: C.inkMid }}>{title}</div>
      {subtitle && <div style={{ fontSize: T.sz.sm, color: C.inkLight, marginTop: S[1], lineHeight: 1.5 }}>{subtitle}</div>}
    </div>
  );
}

// ── Agentik Copilot sphere (§15–§17) ────────────────────────────────────────
//
// Esfera luminosa de vidrio con la marca Agentik REAL dentro (asset, no ícono
// genérico). Implementación CSS del lenguaje visual de la referencia.
// Estado disabled: runtime no activo — no aparenta ser un chat funcional.

export function CopilotSphere({ size = 58, disabled = true }: { size?: number; disabled?: boolean }) {
  return (
    <div
      role="img"
      aria-label={disabled ? "Agentik Copilot — próximamente" : "Agentik Copilot"}
      title={disabled ? "Agentik Copilot — próximamente" : "Agentik Copilot"}
      style={{
        width: size, height: size, borderRadius: R.pill, position: "relative",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.72 : 1,
        background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.95) 0%, rgba(219,234,254,0.55) 34%, rgba(147,197,253,0.35) 62%, rgba(0,74,173,0.28) 100%)`,
        boxShadow: `0 0 0 1px rgba(255,255,255,0.75) inset, 0 4px 18px rgba(0,74,173,0.35), 0 0 26px rgba(59,130,246,0.35)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        backdropFilter: "blur(2px)",
      }}
    >
      {/* Marca real dentro de la esfera */}
      <AgentikMark size={Math.round(size * 0.52)} radius={Math.round(size * 0.14)} />
      {/* Brillo superior */}
      <span aria-hidden style={{
        position: "absolute", top: "9%", left: "18%", width: "42%", height: "26%",
        borderRadius: "50%", background: "rgba(255,255,255,0.75)", filter: "blur(4px)",
      }} />
    </div>
  );
}
