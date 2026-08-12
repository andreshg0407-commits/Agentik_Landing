/**
 * Commercial Hub Client — seven executive surfaces.
 *
 * Sprint: AGENTIK-MANAGER-APP-CANONICAL-INTEGRATION-01
 *
 * React only renders. No business math. No authorization.
 */
"use client";

import { useRouter } from "next/navigation";
import { C, T, S, R, E } from "@/lib/ui/tokens";
import type { ManagerCommercialHubPA, ManagerCommercialSurfaceDef } from "@/lib/comercial/manager/manager-commercial-types";

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
      padding:    `${S[4]}px ${S[4]}px ${S[8]}px`,
      maxWidth:   640,
      margin:     "0 auto",
      fontFamily: T.sans,
    }}>
      {/* Surfaces grid */}
      <div style={{
        display:        "flex",
        flexDirection:  "column",
        gap:            S[2],
      }}>
        {hubPA.surfaces.map(surface => (
          <SurfaceCard
            key={surface.id}
            surface={surface}
            onTap={() => router.push(surface.href)}
          />
        ))}
      </div>

      {/* Freshness */}
      <div style={{
        marginTop:     S[4],
        fontFamily:    T.mono,
        fontSize:      T.sz["2xs"],
        color:         C.inkGhost,
        letterSpacing: "0.04em",
        textAlign:     "center" as const,
      }}>
        Datos al {new Date(hubPA.asOf).toLocaleString("es-CO")}
      </div>
    </div>
  );
}

function SurfaceCard({
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
        all:          "unset",
        cursor:       "pointer",
        display:      "flex",
        alignItems:   "center",
        gap:          S[3],
        padding:      `${S[3]}px ${S[4]}px`,
        background:   "#fff",
        border:       `1px solid ${C.line}`,
        borderRadius: R.lg,
        boxShadow:    E.sm,
        touchAction:  "manipulation",
        boxSizing:    "border-box",
        width:        "100%",
      }}
    >
      {/* Icon */}
      <div style={{
        width:          40,
        height:         40,
        borderRadius:   R.md,
        background:     C.blueDark,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        flexShrink:     0,
      }}>
        <span style={{
          fontFamily:    T.mono,
          fontSize:      13,
          fontWeight:    T.wt.bold,
          color:         "#fff",
          letterSpacing: "-0.02em",
        }}>
          {surface.icon}
        </span>
      </div>

      {/* Label + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily:  T.mono,
          fontSize:    T.sz.sm,
          fontWeight:  T.wt.semibold,
          color:       C.ink,
        }}>
          {surface.label}
        </div>
      </div>

      {/* Attention badge */}
      {surface.attentionCount > 0 && (
        <div style={{
          minWidth:      20,
          height:        20,
          borderRadius:  10,
          background:    "#dc2626",
          display:       "flex",
          alignItems:    "center",
          justifyContent: "center",
          padding:       "0 6px",
          flexShrink:    0,
        }}>
          <span style={{
            fontFamily: T.mono,
            fontSize:   10,
            fontWeight: T.wt.bold,
            color:      "#fff",
          }}>
            {surface.attentionCount}
          </span>
        </div>
      )}

      {/* Chevron */}
      <svg
        width="16" height="16" viewBox="0 0 24 24"
        fill="none" stroke={C.inkFaint}
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        style={{ flexShrink: 0 }}
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </button>
  );
}
