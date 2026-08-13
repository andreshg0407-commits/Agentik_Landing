/**
 * Manager App Shell — Fable-certified mobile-first executive surface.
 *
 * Sprint: AGENTIK-MANAGER-FABLE-INTEGRATION-M1
 *
 * Visual source of truth: manager-app-ref-02(1).html (Fable REF 02, Frame 3)
 *
 * Structure:
 *   - Fable header (hamburger, Agentik logo, notification bell, avatar)
 *   - Drawer (org identity, user card, modules, executive tools, config)
 *   - Full-width canvas (children)
 *   - Agentik sphere orb (glass gradient, /agentik-mark.png)
 *
 * No authorization logic — server layout handles auth.
 */
"use client";

import { useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { ManagerCopilotContext } from "@/lib/comercial/manager/manager-commercial-types";

/**
 * AgentikMark — brand mark with CSS fallback so a missing image never
 * shows a broken-image placeholder.
 */
function AgentikMark({ size, radius = 7 }: { size: number; radius?: number }) {
  return (
    <div style={{
      width:        size,
      height:       size,
      borderRadius: radius,
      background:   F.gradBrand,
      display:      "grid",
      placeItems:   "center",
      flexShrink:   0,
      overflow:     "hidden",
      position:     "relative" as const,
    }}>
      {/* CSS initial as fallback behind the image */}
      <span style={{
        position:   "absolute" as const,
        fontSize:   size * 0.45,
        fontWeight: 800,
        color:      "#fff",
        lineHeight: 1,
      }}>
        A
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/agentik-mark.png"
        alt="Agentik"
        width={size}
        height={size}
        style={{
          borderRadius: radius,
          position:     "relative" as const,
          zIndex:       1,
          display:      "block",
        }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
    </div>
  );
}

// ── Fable tokens (same as manager-home-client) ──────────────────────────────

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
  gradBrand:   "linear-gradient(135deg,#004AAD 0%,#1E63D8 60%,#4F8FE8 100%)",
  gradSoft:    "linear-gradient(135deg,#E5EEFB 0%,#F2F6FE 100%)",
  shSm:        "0 1px 2px rgba(11,23,48,.05)",
  sh:          "0 2px 10px -4px rgba(11,23,48,.10),0 1px 3px rgba(11,23,48,.04)",
  r:           14,
  rLg:         20,
  rXl:         22,
  font:        "'Inter', system-ui, -apple-system, sans-serif",
} as const;

// ── Module display registry ──────────────────────────────────────────────────

const SUBMODULE_LABELS: Record<string, string> = {
  ventas:        "Ventas",
  clientes:      "Clientes",
  vendedores:    "Vendedores",
  pedidos:       "Pedidos",
  tiendas:       "Tiendas",
  inventario:    "Inventario",
  importaciones: "Importaciones",
};

const MODULE_LABELS: Record<string, string> = {
  comercial:  "Comercial",
  finanzas:   "Finanzas",
  produccion: "Producción",
  cobranza:   "Cobranza",
  marketing:  "Marketing",
};

// ── Drawer module icons (SVG path data) ─────────────────────────────────────

const DRAWER_MODULE_ICONS: Record<string, ReactNode> = {
  comercial: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>
    </svg>
  ),
};

// ── Shell ────────────────────────────────────────────────────────────────────

export interface ManagerModule {
  id: string;
  label: string;
  href: string;
}

function getInitials(name: string | null): string {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0][0]?.toUpperCase() ?? "U";
}

export function ManagerAppShell({
  orgSlug,
  orgName,
  userName,
  userRole,
  modules,
  children,
}: {
  orgSlug:   string;
  orgName:   string;
  userName:  string | null;
  userRole:  string;
  modules?:  ManagerModule[];
  children:  ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const rootPath = `/${orgSlug}/manager`;
  const isRoot = pathname === rootPath || pathname === `${rootPath}/`;

  // Extract module and submodule from pathname
  const segments = pathname.replace(rootPath, "").split("/").filter(Boolean);
  const moduleSlug = segments[0] ?? null;
  const submoduleSlug = segments[1] ?? null;
  const entityId = segments[2] ?? null;

  // Resolve display label for header
  let headerLabel: string | null = null;
  if (submoduleSlug && SUBMODULE_LABELS[submoduleSlug]) {
    headerLabel = SUBMODULE_LABELS[submoduleSlug];
  } else if (moduleSlug) {
    headerLabel = MODULE_LABELS[moduleSlug] ?? moduleSlug.charAt(0).toUpperCase() + moduleSlug.slice(1);
  }

  // Back navigation target
  const backHref = submoduleSlug
    ? `${rootPath}/${moduleSlug}`
    : rootPath;

  // Build copilot context
  const copilotContext: ManagerCopilotContext = {
    orgSlug,
    role: "MANAGER",
    moduleKey: moduleSlug ? "sales" : null,
    submoduleKey: submoduleSlug ?? null,
    route: pathname,
    entityType: entityId ? (submoduleSlug === "tiendas" ? "store" : submoduleSlug === "vendedores" ? "seller" : null) : null,
    entityId: entityId ?? null,
    truthState: null,
    freshness: null,
  };

  const toggleMenu = useCallback(() => setMenuOpen(o => !o), []);
  const initials = getInitials(userName);

  return (
    <div style={{
      display:       "flex",
      flexDirection: "column",
      minHeight:     "100dvh",
      background:    F.bgSoft,
      fontFamily:    F.font,
      WebkitFontSmoothing: "antialiased",
    }}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header style={{
        display:      "flex",
        alignItems:   "center",
        padding:      "0 16px",
        background:   F.bg,
        borderBottom: `1px solid ${F.line}`,
        height:       56,
        minHeight:    56,
        flexShrink:   0,
        gap:          12,
      }}>
        {isRoot ? (
          <>
            {/* Hamburger */}
            <button
              onClick={toggleMenu}
              aria-label="Menu"
              style={{
                all: "unset",
                cursor: "pointer",
                padding: 4,
                display: "flex",
                flexDirection: "column",
                gap: 4.5,
                flexShrink: 0,
              }}
            >
              <span style={{ width: 18, height: 2, background: F.ink700, borderRadius: 1, display: "block" }} />
              <span style={{ width: 18, height: 2, background: F.ink700, borderRadius: 1, display: "block" }} />
              <span style={{ width: 18, height: 2, background: F.ink700, borderRadius: 1, display: "block" }} />
            </button>

            {/* Agentik logo + wordmark */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
              <AgentikMark size={28} radius={7} />
              <span style={{
                fontSize:      15,
                fontWeight:    750,
                letterSpacing: "-0.03em",
                color:         F.ink900,
              }}>
                Agentik
              </span>
            </div>

            {/* Notification bell */}
            <button
              aria-label="Notificaciones"
              style={{
                all: "unset",
                cursor: "pointer",
                padding: 6,
                color: F.ink400,
                flexShrink: 0,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
              </svg>
            </button>

            {/* Avatar initials */}
            <div style={{
              width:          32,
              height:         32,
              borderRadius:   "50%",
              background:     F.gradBrand,
              display:        "grid",
              placeItems:     "center",
              flexShrink:     0,
            }}>
              <span style={{
                fontSize:   12,
                fontWeight: 750,
                color:      "#fff",
                lineHeight: 1,
              }}>
                {initials}
              </span>
            </div>
          </>
        ) : (
          <>
            {/* Back button */}
            <Link
              href={backHref}
              aria-label="Volver"
              style={{
                color:          F.brand,
                fontSize:       22,
                textDecoration: "none",
                lineHeight:     1,
                padding:        "4px 6px 4px 0",
                flexShrink:     0,
              }}
            >
              &#8249;
            </Link>
            <span style={{
              fontSize:      15,
              fontWeight:    650,
              color:         F.ink900,
              overflow:      "hidden",
              textOverflow:  "ellipsis",
              whiteSpace:    "nowrap" as const,
              letterSpacing: "-0.015em",
            }}>
              {headerLabel}
            </span>
          </>
        )}
      </header>

      {/* ── Hamburger Drawer ───────────────────────────────────────────── */}
      {menuOpen && (
        <FableDrawer
          orgSlug={orgSlug}
          orgName={orgName}
          userName={userName}
          userRole={userRole}
          initials={initials}
          modules={modules ?? []}
          onClose={toggleMenu}
          onNavigate={(href) => { setMenuOpen(false); router.push(href); }}
        />
      )}

      {/* ── Canvas ──────────────────────────────────────────────────────── */}
      <main style={{
        flex:     "1 1 0",
        overflow: "auto",
      }}>
        {children}
      </main>

      {/* ── Agentik Sphere (persistent copilot orb) ───────────────────── */}
      <AgentikSphere context={copilotContext} />
    </div>
  );
}

// ── Fable Drawer ──────────────────────────────────────────────────────────

function FableDrawer({
  orgSlug,
  orgName,
  userName,
  userRole,
  initials,
  modules,
  onClose,
  onNavigate,
}: {
  orgSlug:    string;
  orgName:    string;
  userName:   string | null;
  userRole:   string;
  initials:   string;
  modules:    ManagerModule[];
  onClose:    () => void;
  onNavigate: (href: string) => void;
}) {
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position:   "fixed",
          inset:      0,
          background: "rgba(11,23,48,0.35)",
          zIndex:     100,
        }}
      />

      {/* Drawer panel */}
      <div style={{
        position:      "fixed",
        top:           0,
        left:          0,
        bottom:        0,
        width:         290,
        maxWidth:      "85vw",
        background:    F.bg,
        zIndex:        101,
        display:       "flex",
        flexDirection: "column",
        boxShadow:     "4px 0 32px rgba(11,23,48,0.14)",
        fontFamily:    F.font,
      }}>
        {/* Drawer header — logo + org name */}
        <div style={{
          padding:      "20px 20px 16px",
          borderBottom: `1px solid ${F.line}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <AgentikMark size={30} radius={8} />
            <div>
              <div style={{
                fontSize:      15,
                fontWeight:    750,
                color:         F.ink900,
                letterSpacing: "-0.02em",
              }}>
                {orgName}
              </div>
            </div>
          </div>
        </div>

        {/* User identity card */}
        <div style={{
          margin:       "14px 14px 4px",
          padding:      "14px 14px",
          background:   F.bgSoft,
          border:       `1px solid ${F.line}`,
          borderRadius: F.r,
          display:      "flex",
          alignItems:   "center",
          gap:          12,
        }}>
          <div style={{
            width:          38,
            height:         38,
            borderRadius:   "50%",
            background:     F.gradBrand,
            display:        "grid",
            placeItems:     "center",
            flexShrink:     0,
          }}>
            <span style={{
              fontSize:   13,
              fontWeight: 750,
              color:      "#fff",
              lineHeight: 1,
            }}>
              {initials}
            </span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize:      14,
              fontWeight:    650,
              color:         F.ink900,
              letterSpacing: "-0.01em",
              overflow:      "hidden",
              textOverflow:  "ellipsis",
              whiteSpace:    "nowrap" as const,
            }}>
              {userName ?? "Usuario"}
            </div>
            <div style={{
              fontSize:      12,
              fontWeight:    500,
              color:         F.ink400,
              marginTop:     2,
            }}>
              {userRole}
            </div>
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: "1 1 0", overflow: "auto", padding: "6px 0" }}>
          {/* Módulos */}
          <DrawerSectionLabel>Módulos</DrawerSectionLabel>
          {modules.map(m => (
            <DrawerItem
              key={m.id}
              icon={DRAWER_MODULE_ICONS[m.id]}
              onClick={() => onNavigate(m.href)}
            >
              {m.label}
            </DrawerItem>
          ))}
          {modules.length === 0 && (
            <div style={{
              padding:    "8px 20px",
              fontSize:   13,
              color:      F.ink400,
            }}>
              Sin módulos habilitados
            </div>
          )}

          <DrawerDivider />

          {/* Tu día */}
          <DrawerSectionLabel>Tu día</DrawerSectionLabel>
          <DrawerItem
            icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>}
            onClick={() => onNavigate(`/${orgSlug}/manager/alertas`)}
          >
            Alertas
          </DrawerItem>
          <DrawerItem
            icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>}
            onClick={() => onNavigate(`/${orgSlug}/manager/tareas`)}
          >
            Tareas
          </DrawerItem>
          <DrawerItem
            icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6"/></svg>}
            onClick={() => onNavigate(`/${orgSlug}/manager/informes`)}
          >
            Informes
          </DrawerItem>

          <DrawerDivider />

          {/* Configuración */}
          <DrawerSectionLabel>Configuración</DrawerSectionLabel>
          <DrawerItem
            icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>}
            onClick={() => onNavigate(`/${orgSlug}/manager/configuracion`)}
          >
            Configuración
          </DrawerItem>
          <DrawerItem
            icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>}
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            Cerrar sesión
          </DrawerItem>
        </div>
      </div>
    </>
  );
}

function DrawerSectionLabel({ children }: { children: ReactNode }) {
  return (
    <div style={{
      padding:        "10px 20px 6px",
      fontSize:       11,
      fontWeight:     750,
      color:          F.ink400,
      textTransform:  "uppercase" as const,
      letterSpacing:  "0.1em",
    }}>
      {children}
    </div>
  );
}

function DrawerItem({ children, icon, onClick }: { children: ReactNode; icon?: ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        all:         "unset",
        display:     "flex",
        alignItems:  "center",
        gap:         11,
        width:       "100%",
        padding:     "11px 20px",
        fontSize:    14,
        fontWeight:  550,
        color:       F.ink700,
        cursor:      "pointer",
        boxSizing:   "border-box",
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {icon && <span style={{ color: F.ink400, flexShrink: 0, display: "flex" }}>{icon}</span>}
      {children}
    </button>
  );
}

function DrawerDivider() {
  return <div style={{ height: 1, background: F.line, margin: "6px 20px" }} />;
}

// ── Agentik Sphere ──────────────────────────────────────────────────────────
// COPILOT_STATUS = DELIBERATELY_DEFERRED
// Orb signals Agentik presence with real brand mark. Not wired to Copilot yet.

function AgentikSphere({ context }: { context: ManagerCopilotContext }) {
  void context;

  return (
    <div
      aria-label="Agentik Copilot"
      style={{
        position:       "fixed",
        bottom:         24,
        right:          20,
        width:          56,
        height:         56,
        borderRadius:   "50%",
        background:     "linear-gradient(145deg, rgba(0,74,173,0.92) 0%, rgba(30,99,216,0.88) 50%, rgba(79,143,232,0.82) 100%)",
        boxShadow:      "0 4px 20px rgba(0,74,173,0.25), 0 2px 8px rgba(0,0,0,0.08), inset 0 1px 1px rgba(255,255,255,0.2)",
        display:        "grid",
        placeItems:     "center",
        zIndex:         50,
        cursor:         "pointer",
        touchAction:    "manipulation",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/agentik-mark.png"
        alt="Agentik"
        width={30}
        height={30}
        style={{
          borderRadius: 6,
          filter: "brightness(1.15) drop-shadow(0 1px 2px rgba(0,0,0,0.1))",
          position: "relative" as const,
          zIndex: 1,
        }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
      <span style={{
        position: "absolute" as const,
        fontSize: 18,
        fontWeight: 800,
        color: "#fff",
        lineHeight: 1,
      }}>
        A
      </span>
    </div>
  );
}
