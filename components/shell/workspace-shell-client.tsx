/**
 * components/shell/workspace-shell-client.tsx
 *
 * Agentik Workspace Shell — 4-panel enterprise layout (client component).
 *
 * Navigation hierarchy:
 *   Level 1 — System Rail     (56px, persistent, icon-first, OS-layer)
 *   Level 2 — Context Sidebar (220px, workspace nav, collapsible)
 *   Level 3 — Operational Canvas (1fr, page content + breadcrumbs)
 *   Utility  — Right Ops Rail  (264px, AI/ops rail, collapsible)
 *
 * Active states:
 *   System  — left-bar indicator on primary rail (3px, domain.accent)
 *   Workspace — highlighted item in context sidebar (tinted bg + left accent)
 *   Detail  — breadcrumbs + workspace header (handled by page components)
 *
 * All panels push the canvas — no overlays.
 * Collapses use CSS width transitions (0.18s ease).
 */

"use client";

import { useState, useEffect, Fragment } from "react";
import { usePathname }         from "next/navigation";
import Link                    from "next/link";
import type { ReactNode }      from "react";
import { C, T, S, R }         from "@/lib/ui/tokens";
import {
  Building2,
  TrendingUp,
  Wallet,
  Users,
  Factory,
  Megaphone,
  Network,
  Terminal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  inferActiveDomain,
  type DomainDef,
  type NavItem,
} from "@/components/shell/module-nav-config";

// ── Domain icon registry — resolves iconKey → lucide component ────────────────
// Client-side only: icons are React components and cannot cross the RSC boundary.

const DOMAIN_ICONS: Record<string, LucideIcon> = {
  gestion:    Building2,
  finanzas:   TrendingUp,
  cobranza:   Wallet,
  comercial:  Users,
  produccion: Factory,
  marketing:  Megaphone,
  agentik:    Network,
  internal:   Terminal,
};

// Rail accent palette — lighter versions of each domain color for display on the
// dark navy primary rail. Sidebar accents (e.g. Gestión #1e1e2e) are too dark for
// WCAG contrast on #001E4A–#003A8A. These are the same hue family, lifted for legibility.
const RAIL_ACCENTS: Record<string, string> = {
  gestion:    "#94a3b8",   // slate-400  — neutral prestige, executive authority
  finanzas:   "#60a5fa",   // blue-400   — financial clarity
  cobranza:   "#a78bfa",   // violet-400 — collections identity
  comercial:  "#93c5fd",   // blue-300   — commercial presence (not startup-cyan)
  produccion: "#fbbf24",   // amber-400  — manufacturing/production identity
  marketing:  "#c084fc",   // purple-400 — creative/AI studio identity
  agentik:    "#818cf8",   // indigo-400 — AI OS identity
  internal:   "#818cf8",   // indigo-400 — system console
};

// ── Constants ──────────────────────────────────────────────────────────────────

const PRIMARY_W  = 64;
const CTX_W      = 220;
const RAIL_W     = 264;
const RAIL_MIN   = 40;

const PRIMARY_BG  = "linear-gradient(180deg, #001E4A 0%, #003A8A 100%)";
const TRANSITION  = "width 0.18s ease, min-width 0.18s ease";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface WorkspaceShellClientProps {
  domains:      DomainDef[];
  tenantHeader: ReactNode;
  roleBadge:    { label: string; accent: string };
  railContent:  ReactNode;
  isBlocked:    boolean;
  children:     ReactNode;
}

// ── Shell ──────────────────────────────────────────────────────────────────────

export function WorkspaceShellClient({
  domains,
  tenantHeader,
  roleBadge,
  railContent,
  isBlocked,
  children,
}: WorkspaceShellClientProps) {
  const pathname = usePathname();

  const [activeDomain,  setActiveDomain]  = useState(() => inferActiveDomain(pathname, domains));
  const [ctxCollapsed,  setCtxCollapsed]  = useState(false);
  const [railCompact,   setRailCompact]   = useState(false);

  // Sync active domain when pathname changes via link navigation
  useEffect(() => {
    const inferred = inferActiveDomain(pathname, domains);
    setActiveDomain(inferred);
  }, [pathname]);

  const activeDef = domains.find(d => d.id === activeDomain) ?? domains[0];

  function handleDomainClick(id: string) {
    if (id === activeDomain) {
      setCtxCollapsed(c => !c);
    } else {
      setActiveDomain(id);
      setCtxCollapsed(false);
    }
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--ag-surface, #F7F9FF)" }}>

      {/* ── 1. System Rail ────────────────────────────────────────────────── */}
      <PrimaryRail
        domains={domains}
        activeDomain={activeDomain}
        onDomainClick={handleDomainClick}
      />

      {/* ── 2. Context Sidebar ────────────────────────────────────────────── */}
      <div style={{
        width:         ctxCollapsed ? 0 : CTX_W,
        minWidth:      ctxCollapsed ? 0 : CTX_W,
        overflow:      "hidden",
        transition:    TRANSITION,
        background:    "#ffffff",
        // Right edge separates sidebar from canvas; left edge echoes the rail's navy cast
        boxShadow:     "inset -1px 0 0 var(--ag-line, rgba(0,74,173,.12)), inset 4px 0 14px rgba(0,28,70,.05)",
        display:       "flex",
        flexDirection: "column",
      }}>
        {activeDef && (
          <ContextPanel
            domain={activeDef}
            pathname={pathname}
            tenantHeader={tenantHeader}
            roleBadge={roleBadge}
            onCollapse={() => setCtxCollapsed(true)}
          />
        )}
      </div>

      {/* ── 3. Operational Canvas ─────────────────────────────────────────── */}
      <main style={{
        flex:       "1 1 0",
        minWidth:   0,
        padding:    S[6],
        background: "#ffffff",
        overflow:   "auto",
        boxShadow:  "inset 1px 0 0 var(--ag-line-sub, rgba(0,74,173,.04))",
      }}>
        {isBlocked ? <BlockedView /> : children}
      </main>

      {/* ── 4. Right Ops Rail ─────────────────────────────────────────────── */}
      <div
        className="org-rail"
        style={{
          width:         railCompact ? RAIL_MIN : RAIL_W,
          minWidth:      railCompact ? RAIL_MIN : RAIL_W,
          transition:    TRANSITION,
          borderLeft:    "1px solid var(--ag-line, rgba(0,74,173,.12))",
          background:    "var(--ag-surface, #F7F9FF)",
          display:       "flex",
          flexDirection: "column",
          overflow:      "hidden",
        }}
      >
        <div style={{
          padding:        `${S[2]}px ${S[2]}px`,
          borderBottom:   "1px solid var(--ag-line, rgba(0,74,173,.12))",
          display:        "flex",
          alignItems:     "center",
          justifyContent: railCompact ? "center" : "flex-end",
          flexShrink:     0,
        }}>
          <button
            onClick={() => setRailCompact(c => !c)}
            title={railCompact ? "Expandir panel" : "Contraer panel"}
            style={{
              all:            "unset",
              cursor:         "pointer",
              width:          24,
              height:         24,
              borderRadius:   6,
              border:         "1px solid var(--ag-line, rgba(0,74,173,.12))",
              background:     C.white,
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              fontSize:       10,
              color:          C.blueDark,
              flexShrink:     0,
              transition:     "background 0.12s, border-color 0.12s",
              boxShadow:      "var(--ag-shadow-sm)",
            }}
          >
            {railCompact ? "›" : "‹"}
          </button>
        </div>
        {!railCompact && (
          <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
            {railContent}
          </div>
        )}
      </div>

    </div>
  );
}

// ── PrimaryRail ────────────────────────────────────────────────────────────────

function PrimaryRail({
  domains,
  activeDomain,
  onDomainClick,
}: {
  domains:       DomainDef[];
  activeDomain:  string;
  onDomainClick: (id: string) => void;
}) {
  return (
    <div style={{
      width:         PRIMARY_W,
      minWidth:      PRIMARY_W,
      background:    PRIMARY_BG,
      display:       "flex",
      flexDirection: "column",
      alignItems:    "center",
      padding:       `${S[3]}px 0`,
      gap:           6,
      zIndex:        10,
      flexShrink:    0,
      // Right-edge material separator — gives the rail a persistent shell-layer depth
      boxShadow:     "inset -1px 0 0 rgba(255,255,255,.05), 3px 0 12px rgba(0,0,0,.18)",
    }}>
      {/* Agentik logo mark */}
      <div style={{
        width:          34,
        height:         34,
        background:     "linear-gradient(135deg, #004AAD, #1E63D8)",
        borderRadius:   10,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        flexShrink:     0,
        boxShadow:      "0 2px 8px rgba(0,74,173,.40)",
      }}>
        <span style={{
          fontSize:      13,
          fontWeight:    T.wt.bold,
          color:         "#fff",
          fontFamily:    T.sans,
          letterSpacing: "-0.02em",
        }}>
          A
        </span>
      </div>

      {/* Logo zone separator */}
      <div style={{
        width:        28,
        height:       1,
        background:   "rgba(255,255,255,.10)",
        margin:       `${S[3]}px 0 ${S[2]}px`,
        borderRadius: 1,
        flexShrink:   0,
      }} />

      {/* System icons */}
      {domains.map((domain, idx) => {
        const isActive = domain.id === activeDomain;
        const rAccent  = RAIL_ACCENTS[domain.id] ?? domain.accent;
        // Grouping dividers:
        //   — between Gestión (management) and the first operational domain
        //   — before the internal console (system layer, visually separate)
        const showDivider = idx > 0 && (
          domains[idx - 1]?.id === "gestion" || domain.id === "internal"
        );
        return (
          <Fragment key={domain.id}>
            {showDivider && (
              <div style={{
                width:      26,
                height:     1,
                background: "rgba(255,255,255,.08)",
                flexShrink: 0,
                alignSelf:  "center",
                margin:     "2px 0",
              }} />
            )}
          {/* Container holds both the left-bar indicator and the icon button */}
          <div
            style={{
              position:       "relative",
              width:          "100%",
              display:        "flex",
              justifyContent: "center",
              alignItems:     "center",
            }}
          >
            {/* Left-bar active indicator — domain identity signal */}
            <div style={{
              position:      "absolute",
              left:          0,
              top:           "50%",
              transform:     "translateY(-50%)",
              width:         3,
              height:        isActive ? 36 : 0,
              borderRadius:  "0 2px 2px 0",
              background:    rAccent,
              // Subtle ambient glow from indicator — tasteful enterprise depth
              boxShadow:     isActive ? `0 0 8px ${rAccent}40` : "none",
              transition:    "height 0.18s ease, box-shadow 0.18s ease",
              pointerEvents: "none",
            }} />

            <DomainButton
              domain={domain}
              isActive={isActive}
              onClick={() => onDomainClick(domain.id)}
              railAccent={rAccent}
            />
          </div>
          </Fragment>
        );
      })}

      {/* System status — bottom zone */}
      <div style={{
        marginTop:      "auto",
        paddingTop:     S[3],
        width:          "100%",
        display:        "flex",
        justifyContent: "center",
        borderTop:      "1px solid rgba(255,255,255,.06)",
        flexShrink:     0,
      }}>
        <div style={{
          width:        6,
          height:       6,
          borderRadius: "50%",
          background:   "rgba(34,197,94,.65)",
          boxShadow:    "0 0 5px rgba(34,197,94,.40)",
        }} />
      </div>
    </div>
  );
}

// ── DomainButton ───────────────────────────────────────────────────────────────

function DomainButton({
  domain,
  isActive,
  onClick,
  railAccent,
}: {
  domain:      DomainDef;
  isActive:    boolean;
  onClick:     () => void;
  railAccent:  string;
}) {
  const [hovered, setHovered] = useState(false);
  const Icon = DOMAIN_ICONS[domain.iconKey] ?? Building2;

  // Three-tier icon opacity hierarchy:
  // Active: pure white — maximum legibility, unambiguous "you are here"
  // Hover:  88% — bright but distinguishable from active (not white = not "current")
  // Rest:   52% — present but recessive — scannable without demanding attention
  const iconColor = isActive   ? "#ffffff"
                  : hovered    ? "rgba(255,255,255,.88)"
                  : "rgba(255,255,255,.52)";

  // Active surface: warm-to-cool temperature gradient — not a flat white rectangle.
  // Warm cream at top (255,252,244) transitions to cool periwinkle (205,225,255) at bottom.
  // Both at 13-15% opacity on dark navy = subtle materiality, not color noise.
  // Enterprise analogy: macOS pressed-button gradient, IBM Design System active states.
  const bg = isActive
    ? "linear-gradient(160deg, rgba(255,252,244,.15) 0%, rgba(205,225,255,.13) 100%)"
    : hovered ? "rgba(255,255,255,.08)"
    : "transparent";

  // Label color — independent from icon, more recessive to let icon lead.
  const labelColor = isActive   ? "rgba(255,255,255,.78)"
                   : hovered    ? "rgba(255,255,255,.62)"
                   : "rgba(255,255,255,.36)";

  const shadow = isActive
    ? "inset 0 1px 0 rgba(255,255,255,.13), inset 0 -1px 0 rgba(0,0,0,.22), 0 2px 8px rgba(0,0,0,.20)"
    : "none";

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={domain.label}
      aria-label={domain.label}
      aria-pressed={isActive}
      style={{
        all:            "unset",
        cursor:         "pointer",
        width:          52,
        height:         52,
        borderRadius:   R.lg,
        display:        "flex",
        flexDirection:  "column" as const,
        alignItems:     "center",
        justifyContent: "center",
        gap:            4,
        background:     bg,
        boxShadow:      shadow,
        color:          iconColor,
        flexShrink:     0,
        transition:     "background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease",
      }}
    >
      <Icon size={16} strokeWidth={isActive ? 2 : 1.5} />
      <span style={{
        fontFamily:    T.mono,
        fontSize:      8,
        fontWeight:    T.wt.semibold,   // 600 — lighter than bold, more refined
        letterSpacing: "0.07em",         // more tracking = premium enterprise rhythm
        textTransform: "uppercase" as const,
        lineHeight:    1,
        maxWidth:      48,
        overflow:      "hidden",
        textOverflow:  "ellipsis",
        whiteSpace:    "nowrap" as const,
        color:         labelColor,       // independent from icon — label is secondary signal
      }}>
        {domain.label}
      </span>
    </button>
  );
}

// ── ContextPanel ───────────────────────────────────────────────────────────────

function ContextPanel({
  domain,
  pathname,
  tenantHeader,
  roleBadge,
  onCollapse,
}: {
  domain:       DomainDef;
  pathname:     string;
  tenantHeader: ReactNode;
  roleBadge:    { label: string; accent: string };
  onCollapse:   () => void;
}) {
  return (
    <div style={{
      display:       "flex",
      flexDirection: "column",
      height:        "100%",
      minWidth:      CTX_W,
      padding:       `${S[3]}px ${S[3]}px`,
      boxSizing:     "border-box",
    }}>
      {/* Tenant header slot */}
      <div style={{ marginBottom: S[2] }}>
        {tenantHeader}
      </div>

      {/* System identity header */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        marginBottom:   S[2],
        paddingBottom:  S[2],
        borderBottom:   "1px solid var(--ag-line, rgba(0,74,173,.12))",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: S[1] }}>
          {/* System accent dot */}
          <div style={{
            width:        5,
            height:       5,
            borderRadius: "50%",
            background:   domain.accent,
            flexShrink:   0,
          }} />
          <div style={{
            fontFamily:    T.sans,
            fontSize:      T.sz["2xs"],
            fontWeight:    T.wt.bold,
            color:         domain.accent,
            textTransform: "uppercase" as const,
            letterSpacing: "0.08em",
          }}>
            {domain.label}
          </div>
        </div>
        <button
          onClick={onCollapse}
          title="Contraer menú"
          style={{
            all:            "unset",
            cursor:         "pointer",
            width:          22,
            height:         22,
            borderRadius:   5,
            border:         "1px solid var(--ag-line, rgba(0,74,173,.12))",
            background:     C.white,
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            fontSize:       10,
            color:          C.blueDark,
            flexShrink:     0,
            boxShadow:      "var(--ag-shadow-sm)",
          }}
        >
          ‹
        </button>
      </div>

      {/* Workspace nav items */}
      <nav
        aria-label={`${domain.label} navigation`}
        style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto" }}
      >
        {domain.items.map((item, i) => (
          <NavItemLink
            key={`${item.href ?? ""}-${i}`}
            item={item}
            pathname={pathname}
            domainAccent={domain.accent}
          />
        ))}
      </nav>

      {/* Role badge footer */}
      <div style={{
        marginTop:    S[2],
        background:   "var(--ag-brand-50, #EEF5FF)",
        border:       `1px solid var(--ag-line, rgba(0,74,173,.12))`,
        borderRadius: R.card,
        padding:      `${S[2]}px ${S[3]}px`,
        display:      "flex",
        alignItems:   "center",
        gap:          S[2],
        flexShrink:   0,
      }}>
        <span style={{
          fontFamily:   T.sans,
          fontSize:     T.sz["2xs"],
          fontWeight:   T.wt.bold,
          color:        "#fff",
          background:   roleBadge.accent,
          borderRadius: R.pill,
          padding:      "2px 8px",
          whiteSpace:   "nowrap",
        }}>
          {roleBadge.label}
        </span>
        <span style={{
          fontFamily: T.mono,
          fontSize:   T.sz["2xs"],
          color:      C.inkFaint,
          flex:       1,
          overflow:   "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap" as const,
        }}>
          Agentik OS
        </span>
      </div>
    </div>
  );
}

// ── NavItemLink ────────────────────────────────────────────────────────────────

function NavItemLink({
  item,
  pathname,
  domainAccent,
}: {
  item:         NavItem;
  pathname:     string;
  domainAccent: string;
}) {
  const [hovered, setHovered] = useState(false);

  // Section header — visual workspace group label, non-interactive
  if (item.isSectionHeader) {
    return (
      <div style={{
        fontFamily:    T.mono,
        fontSize:      T.sz["2xs"],
        fontWeight:    T.wt.bold,
        color:         C.inkFaint,
        textTransform: "uppercase" as const,
        letterSpacing: "0.09em",
        paddingLeft:   S[3],
        paddingRight:  S[2],
        paddingTop:    S[4],
        paddingBottom: S[1],
        lineHeight:    1,
        userSelect:    "none" as const,
        borderTop:     `1px solid ${C.lineSubtle}`,
        marginTop:     S[1],
      }}>
        {item.label}
      </div>
    );
  }

  // Active detection — matches exact href, sub-paths, or explicit pathMatches[]
  const hrefPath = item.href.split('?')[0];
  const isActive = !item.disabled && item.href !== '#' && (
    pathname === hrefPath ||
    pathname.startsWith(hrefPath + '/') ||
    (item.pathMatches?.some(m => pathname.includes(m)) ?? false)
  );

  // Padding: subtract 2px to account for the persistent borderLeft (2px, transparent or accent)
  const pl = item.indent === 2 ? S[8] - 2 : item.indent === 1 ? S[5] - 2 : S[2] - 2;

  const baseColor = item.disabled ? C.inkGhost : (item.accent ?? C.inkMid);
  const color = isActive     ? domainAccent
              : hovered && !item.disabled ? C.blueDark
              : baseColor;

  const style: React.CSSProperties = {
    display:        "block",
    fontFamily:     T.mono,
    fontSize:       item.indent ? T.sz.xs : T.sz.sm,
    fontWeight:     isActive         ? T.wt.semibold
                  : item.indent      ? T.wt.medium
                  : T.wt.semibold,
    color,
    textDecoration: "none",
    paddingLeft:    pl,
    paddingRight:   S[2],
    paddingTop:     5,
    paddingBottom:  5,
    borderRadius:   R.md,
    // Persistent left accent bar — transparent when not active, avoids layout shift
    borderLeft:     `2px solid ${isActive ? domainAccent : "transparent"}`,
    lineHeight:     1.4,
    whiteSpace:     "nowrap" as const,
    overflow:       "hidden",
    textOverflow:   "ellipsis",
    background:     isActive                    ? `${domainAccent}12`
                  : hovered && !item.disabled  ? "var(--ag-brand-50, #EEF5FF)"
                  : "transparent",
    cursor:         item.disabled ? "default" : "pointer",
    opacity:        item.disabled ? 0.4 : 1,
    transition:     "color 0.1s ease, background 0.1s ease",
  };

  const labelNode = (
    <>
      {item.label}
      {item.badge && (
        <span style={{ marginLeft: 4, opacity: 0.8 }}>{item.badge}</span>
      )}
    </>
  );

  if (item.disabled || item.href === '#') {
    return (
      <span
        style={style}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {labelNode}
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      style={style}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {labelNode}
    </Link>
  );
}

// ── BlockedView ────────────────────────────────────────────────────────────────

function BlockedView() {
  return (
    <div style={{ padding: S[10], textAlign: "center", color: C.inkLight }}>
      <div style={{
        fontSize:     T.sz["2xl"],
        fontWeight:   T.wt.bold,
        marginBottom: S[2],
      }}>
        Módulo no habilitado
      </div>
      <div style={{
        fontSize: T.sz.lg,
        color:    C.inkFaint,
        maxWidth: 360,
        margin:   "0 auto",
      }}>
        Este módulo no está disponible para tu organización o tu rol.
        Contacta a tu administrador si crees que es un error.
      </div>
    </div>
  );
}
