/**
 * Manager App Shell — mobile-first executive surface.
 *
 * Sprint: AGENTIK-MANAGER-APP-CANONICAL-INTEGRATION-01
 *
 * Standalone shell for ORG_ADMIN / MANAGER on mobile/tablet.
 *
 * Structure:
 *   - Compact header (org identity, hamburger, back navigation)
 *   - Hamburger drawer (modules, executive tools, account)
 *   - Full-width canvas (children)
 *   - Persistent Copilot orb (fixed position)
 *
 * No authorization logic — server layout handles auth.
 */
"use client";

import { useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { C, T, S, R } from "@/lib/ui/tokens";
import type { ManagerCopilotContext } from "@/lib/comercial/manager/manager-commercial-types";

// ── Module display registry ──────────────────────────────────────────────────

const MODULE_LABELS: Record<string, string> = {
  comercial:  "Comercial",
  finanzas:   "Finanzas",
  produccion: "Produccion",
  cobranza:   "Cobranza",
  marketing:  "Marketing",
};

// ── Submodule labels for nested views ────────────────────────────────────────

const SUBMODULE_LABELS: Record<string, string> = {
  ventas:        "Ventas",
  clientes:      "Clientes",
  vendedores:    "Vendedores",
  pedidos:       "Pedidos",
  tiendas:       "Tiendas",
  inventario:    "Inventario",
  importaciones: "Importaciones",
};

// ── Shell ────────────────────────────────────────────────────────────────────

export interface ManagerModule {
  id: string;
  label: string;
  href: string;
}

export function ManagerAppShell({
  orgSlug,
  orgName,
  modules,
  children,
}: {
  orgSlug:   string;
  orgName:   string;
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

  return (
    <div style={{
      display:       "flex",
      flexDirection: "column",
      minHeight:     "100dvh",
      background:    C.surface,
    }}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header style={{
        display:      "flex",
        alignItems:   "center",
        padding:      `0 ${S[4]}px`,
        background:   "#fff",
        borderBottom: `1px solid ${C.line}`,
        height:       56,
        minHeight:    56,
        flexShrink:   0,
        gap:          S[2],
      }}>
        {isRoot ? (
          <>
            {/* Hamburger button */}
            <button
              onClick={toggleMenu}
              aria-label="Menu"
              style={{
                all: "unset",
                cursor: "pointer",
                padding: "4px",
                display: "flex",
                flexDirection: "column",
                gap: 4,
                flexShrink: 0,
              }}
            >
              <span style={{ width: 18, height: 2, background: C.ink, borderRadius: 1, display: "block" }} />
              <span style={{ width: 18, height: 2, background: C.ink, borderRadius: 1, display: "block" }} />
              <span style={{ width: 18, height: 2, background: C.ink, borderRadius: 1, display: "block" }} />
            </button>

            {/* Logo + org name */}
            <div style={{
              width:          28,
              height:         28,
              borderRadius:   8,
              background:     "linear-gradient(135deg, #004AAD 0%, #1E63D8 100%)",
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              flexShrink:     0,
            }}>
              <span style={{
                fontFamily: T.mono,
                fontSize:   13,
                fontWeight:  T.wt.bold,
                color:      "#fff",
              }}>
                A
              </span>
            </div>
            <div style={{ overflow: "hidden" }}>
              <div style={{
                fontFamily:    T.mono,
                fontSize:      T.sz.sm,
                fontWeight:    T.wt.bold,
                color:         C.ink,
                letterSpacing: "-0.2px",
                overflow:      "hidden",
                textOverflow:  "ellipsis",
                whiteSpace:    "nowrap" as const,
              }}>
                {orgName}
              </div>
              <div style={{
                fontFamily:    T.mono,
                fontSize:      T.sz["2xs"],
                color:         C.inkFaint,
                letterSpacing: "0.04em",
              }}>
                Manager
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Back button */}
            <Link
              href={backHref}
              aria-label="Volver"
              style={{
                color:          C.blueDark,
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
              fontFamily:    T.mono,
              fontSize:      T.sz.sm,
              fontWeight:    T.wt.semibold,
              color:         C.ink,
              overflow:      "hidden",
              textOverflow:  "ellipsis",
              whiteSpace:    "nowrap" as const,
            }}>
              {headerLabel}
            </span>
          </>
        )}
      </header>

      {/* ── Hamburger Drawer ───────────────────────────────────────────── */}
      {menuOpen && (
        <HamburgerDrawer
          orgSlug={orgSlug}
          orgName={orgName}
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

      {/* ── Copilot Orb (persistent across all Manager routes) ─────────── */}
      <ManagerCopilotOrb context={copilotContext} />
    </div>
  );
}

// ── Hamburger Drawer ──────────────────────────────────────────────────────

function HamburgerDrawer({
  orgSlug,
  orgName,
  modules,
  onClose,
  onNavigate,
}: {
  orgSlug:    string;
  orgName:    string;
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
          background: "rgba(0,0,0,0.4)",
          zIndex:     100,
        }}
      />

      {/* Drawer */}
      <div style={{
        position:    "fixed",
        top:         0,
        left:        0,
        bottom:      0,
        width:       280,
        maxWidth:    "85vw",
        background:  "#fff",
        zIndex:      101,
        display:     "flex",
        flexDirection: "column",
        boxShadow:   "4px 0 24px rgba(0,0,0,0.15)",
      }}>
        {/* Drawer header */}
        <div style={{
          padding:      `${S[4]}px ${S[4]}px`,
          borderBottom: `1px solid ${C.line}`,
        }}>
          <div style={{
            fontFamily:    T.mono,
            fontSize:      T.sz.sm,
            fontWeight:    T.wt.bold,
            color:         C.ink,
          }}>
            {orgName}
          </div>
          <div style={{
            fontFamily:    T.mono,
            fontSize:      T.sz["2xs"],
            color:         C.inkFaint,
            letterSpacing: "0.04em",
          }}>
            Manager
          </div>
        </div>

        {/* Module section */}
        <div style={{ padding: `${S[3]}px 0`, flex: "1 1 0", overflow: "auto" }}>
          <DrawerSectionLabel>Modulos</DrawerSectionLabel>
          {modules.map(m => (
            <DrawerItem key={m.id} onClick={() => onNavigate(m.href)}>
              {m.label}
            </DrawerItem>
          ))}
          {modules.length === 0 && (
            <div style={{
              padding:    `${S[2]}px ${S[4]}px`,
              fontFamily: T.mono,
              fontSize:   T.sz.xs,
              color:      C.inkFaint,
            }}>
              Sin modulos habilitados
            </div>
          )}

          <DrawerDivider />
          <DrawerSectionLabel>Herramientas ejecutivas</DrawerSectionLabel>
          <DrawerItem onClick={() => onNavigate(`/${orgSlug}/manager/alertas`)}>
            Alertas
          </DrawerItem>
          <DrawerItem onClick={() => onNavigate(`/${orgSlug}/manager/tareas`)}>
            Tareas
          </DrawerItem>
          <DrawerItem onClick={() => onNavigate(`/${orgSlug}/manager/informes`)}>
            Informes
          </DrawerItem>

          <DrawerDivider />
          <DrawerSectionLabel>Cuenta</DrawerSectionLabel>
          <DrawerItem onClick={() => onNavigate(`/${orgSlug}/manager/configuracion`)}>
            Configuracion
          </DrawerItem>
          <DrawerItem onClick={() => signOut({ callbackUrl: "/login" })}>
            Cerrar sesion
          </DrawerItem>
        </div>
      </div>
    </>
  );
}

function DrawerSectionLabel({ children }: { children: ReactNode }) {
  return (
    <div style={{
      padding:        `${S[2]}px ${S[4]}px`,
      fontFamily:     T.mono,
      fontSize:       T.sz["2xs"],
      fontWeight:     T.wt.semibold,
      color:          C.inkFaint,
      textTransform:  "uppercase" as const,
      letterSpacing:  "0.08em",
    }}>
      {children}
    </div>
  );
}

function DrawerItem({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        all:         "unset",
        display:     "block",
        width:       "100%",
        padding:     `${S[3]}px ${S[4]}px`,
        fontFamily:  T.mono,
        fontSize:    T.sz.sm,
        color:       C.ink,
        cursor:      "pointer",
        boxSizing:   "border-box",
      }}
    >
      {children}
    </button>
  );
}

function DrawerDivider() {
  return <div style={{ height: 1, background: C.line, margin: `${S[2]}px ${S[4]}px` }} />;
}

// ── Copilot Orb ──────────────────────────────────────────────────────────────
// COPILOT_STATUS = DELIBERATELY_DEFERRED
// Non-operational. Context envelope preserved for future integration.
// No mock experience. No chat. No suggestions. Orb only signals presence.

function ManagerCopilotOrb({ context }: { context: ManagerCopilotContext }) {
  // Context preserved for future Copilot integration — not wired yet
  void context;

  return (
    <div
      aria-label="Agentik Copilot — proximamente"
      title="Copilot — proximamente"
      style={{
        position:       "fixed",
        bottom:         24,
        right:          20,
        width:          44,
        height:         44,
        borderRadius:   "50%",
        background:     `${C.surface}`,
        border:         `1px solid ${C.line}`,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        opacity:        0.5,
        zIndex:         50,
        pointerEvents:  "none",
      }}
    >
      <span style={{
        fontFamily:    T.mono,
        fontSize:      16,
        fontWeight:    T.wt.bold,
        color:         C.inkFaint,
        lineHeight:    1,
      }}>
        A
      </span>
    </div>
  );
}
