/**
 * Commercial Hub Client — app-style icon grid for seven executive surfaces.
 *
 * Sprint: AGENTIK-MANAGER-M2A
 *
 * React only renders. No business math. No authorization.
 */
"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { C, T, S, R, E } from "@/lib/ui/tokens";
import type { ManagerCommercialHubPA, ManagerCommercialSurfaceDef } from "@/lib/comercial/manager/manager-commercial-types";

// ── Surface icons (SVG, lucide-style, 20×20) ────────────────────────────────

const SURFACE_ICONS: Record<string, ReactNode> = {
  ventas: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
    </svg>
  ),
  clientes: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  vendedores: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a4 4 0 0 0-8 0v2"/><path d="M12 12v3"/>
    </svg>
  ),
  pedidos: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>
    </svg>
  ),
  tiendas: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z"/><path d="m3 9 2.45-4.9A2 2 0 0 1 7.24 3h9.52a2 2 0 0 1 1.8 1.1L21 9"/><path d="M12 3v6"/>
    </svg>
  ),
  inventario: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>
    </svg>
  ),
  importaciones: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12"/><path d="m8 11 4 4 4-4"/><path d="M8 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4"/>
    </svg>
  ),
};

export function CommercialHubClient({
  orgSlug,
  hubPA,
}: {
  orgSlug: string;
  hubPA:   ManagerCommercialHubPA;
}) {
  const router = useRouter();

  return (
    <div style={{
      padding:    "16px 20px 120px",
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    }}>
      {/* App-style icon grid */}
      <div style={{
        display:              "grid",
        gridTemplateColumns:  "repeat(3, 1fr)",
        gap:                  16,
      }}>
        {hubPA.surfaces.map(surface => (
          <SurfaceTile
            key={surface.id}
            surface={surface}
            onTap={() => router.push(surface.href)}
          />
        ))}
      </div>

      {/* Freshness */}
      <div
        suppressHydrationWarning
        style={{
          marginTop:     20,
          fontFamily:    T.mono,
          fontSize:      10.5,
          color:         "#7B879A",
          letterSpacing: "0.04em",
          textAlign:     "center" as const,
        }}
      >
        {`Datos al ${new Date(hubPA.asOf).toLocaleString("es-CO", { timeZone: "America/Bogota" })}`}
      </div>
    </div>
  );
}

function SurfaceTile({
  surface,
  onTap,
}: {
  surface: ManagerCommercialSurfaceDef;
  onTap:   () => void;
}) {
  return (
    <button
      onClick={onTap}
      style={{
        all:            "unset",
        cursor:         "pointer",
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        gap:            8,
        padding:        "18px 8px 14px",
        background:     "#fff",
        border:         "1px solid rgba(11,23,48,.08)",
        borderRadius:   18,
        boxShadow:      "0 1px 2px rgba(11,23,48,.05)",
        touchAction:    "manipulation",
        boxSizing:      "border-box",
        width:          "100%",
        position:       "relative" as const,
      }}
    >
      {/* Icon circle */}
      <div style={{
        width:          48,
        height:         48,
        borderRadius:   14,
        background:     "linear-gradient(135deg,#E5EEFB 0%,#F2F6FE 100%)",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        color:          "#004AAD",
        flexShrink:     0,
      }}>
        {SURFACE_ICONS[surface.id] ?? (
          <span style={{ fontSize: 13, fontWeight: 800, color: "#004AAD" }}>
            {surface.icon}
          </span>
        )}
      </div>

      {/* Label */}
      <span style={{
        fontSize:      12.5,
        fontWeight:    650,
        color:         "#0B1730",
        letterSpacing: "-0.01em",
        textAlign:     "center" as const,
        lineHeight:    1.2,
      }}>
        {surface.label}
      </span>
    </button>
  );
}
