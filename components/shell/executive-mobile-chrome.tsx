/**
 * Executive Mobile Chrome — header + copilot sphere for mobile/tablet.
 *
 * Sprint: AGENTIK-EXECUTIVE-MOBILE-SHELL-01
 *
 * Visible only on viewports <= 1024px for ORG_ADMIN / MANAGER roles.
 * Hidden by default via inline style; shown via CSS media query (.ag-mobile-only).
 *
 * No authorization logic. No business data. Presentation only.
 */
"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { C, T, S } from "@/lib/ui/tokens";

// ── Module labels for header display ─────────────────────────────────────────

const MODULE_LABELS: Record<string, string> = {
  comercial:    "Comercial",
  finanzas:     "Finanzas",
  produccion:   "Producción",
  cobranza:     "Cobranza",
  marketing:    "Marketing",
  agentik:      "Agentik",
  executive:    "Ejecutivo",
  dashboard:    "Dashboard",
  ajustes:      "Ajustes",
};

// ── Mobile Header ────────────────────────────────────────────────────────────

export function ExecutiveMobileHeader({
  orgSlug,
  orgName,
}: {
  orgSlug: string;
  orgName: string;
}) {
  const pathname = usePathname();
  const rootPath = `/${orgSlug}`;
  const isRoot = pathname === rootPath || pathname === `${rootPath}/`;

  // Extract first path segment after orgSlug as module identifier
  const segments = pathname.replace(rootPath, "").split("/").filter(Boolean);
  const moduleSlug = segments[0] ?? null;
  const moduleLabel = moduleSlug
    ? (MODULE_LABELS[moduleSlug] ?? moduleSlug.charAt(0).toUpperCase() + moduleSlug.slice(1))
    : null;

  return (
    <header
      className="ag-mobile-only"
      style={{
        display:      "none",       // overridden to flex by CSS media query
        alignItems:   "center",
        padding:      `0 ${S[4]}px`,
        background:   "#fff",
        borderBottom: `1px solid ${C.line}`,
        flexShrink:   0,
        gap:          S[2],
        height:       52,
        minHeight:    52,
      }}
    >
      {!isRoot && (
        <Link
          href={rootPath}
          aria-label="Volver al inicio"
          style={{
            color:          C.blueDark,
            fontSize:       20,
            textDecoration: "none",
            lineHeight:     1,
            padding:        "4px 8px 4px 0",
            flexShrink:     0,
          }}
        >
          ‹
        </Link>
      )}

      {isRoot ? (
        <>
          <img
            src="/agentik-navy.svg"
            width={22}
            height={22}
            alt="Agentik"
            style={{ flexShrink: 0 }}
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
          <span style={{
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
          </span>
        </>
      ) : (
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz.sm,
          fontWeight:    T.wt.semibold,
          color:         C.ink,
          overflow:      "hidden",
          textOverflow:  "ellipsis",
          whiteSpace:    "nowrap" as const,
        }}>
          {moduleLabel}
        </span>
      )}
    </header>
  );
}

// ── Copilot Sphere ───────────────────────────────────────────────────────────

export function CopilotSphere() {
  return (
    <div
      className="ag-mobile-only ag-copilot-sphere"
      aria-label="Agentik Copilot"
      role="button"
      tabIndex={0}
      style={{
        display:        "none",    // overridden to flex by CSS media query
        position:       "fixed",
        bottom:         24,
        right:          20,
        width:          48,
        height:         48,
        borderRadius:   "50%",
        background:     "linear-gradient(135deg, #004AAD 0%, #1E63D8 100%)",
        boxShadow:      "0 4px 16px rgba(0,74,173,0.35), 0 1px 3px rgba(0,0,0,0.12)",
        alignItems:     "center",
        justifyContent: "center",
        cursor:         "pointer",
        zIndex:         50,
        touchAction:    "manipulation",
      }}
    >
      <span style={{
        fontFamily:    T.mono,
        fontSize:      16,
        fontWeight:    T.wt.bold,
        color:         "#fff",
        letterSpacing: "-0.02em",
        lineHeight:    1,
      }}>
        A
      </span>
    </div>
  );
}
