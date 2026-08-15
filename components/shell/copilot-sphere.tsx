/**
 * components/shell/copilot-sphere.tsx
 *
 * Shared Copilot glass sphere — single visual primitive for all shells.
 * Used by: Manager App, Seller App.
 *
 * PRESENTATION ONLY. No domain logic, no data fetching.
 */
"use client";

import { R } from "@/lib/ui/tokens";

function AgentikMark({ size = 40, radius = 10 }: { size?: number; radius?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: radius,
      background: "linear-gradient(135deg,#004AAD 0%,#1E63D8 60%,#4F8FE8 100%)",
      display: "grid", placeItems: "center", flexShrink: 0,
      overflow: "hidden", position: "relative" as const,
    }}>
      <span style={{
        position: "absolute" as const, fontSize: size * 0.45,
        fontWeight: 800, color: "#fff", lineHeight: 1,
      }}>
        A
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/agentik-mark.png" alt="" aria-hidden
        width={size} height={size}
        style={{ borderRadius: radius, position: "relative" as const, zIndex: 1, display: "block" }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
    </div>
  );
}

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
      <AgentikMark size={Math.round(size * 0.52)} radius={Math.round(size * 0.14)} />
      <span aria-hidden="true" style={{
        position: "absolute" as const, top: "9%", left: "18%", width: "42%", height: "26%",
        borderRadius: "50%", background: "rgba(255,255,255,0.75)", filter: "blur(4px)",
      }} />
    </div>
  );
}
