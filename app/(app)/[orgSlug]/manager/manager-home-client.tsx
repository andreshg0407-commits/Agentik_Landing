/**
 * Manager Home Client — executive cockpit.
 *
 * Sprint: AGENTIK-MANAGER-APP-CANONICAL-INTEGRATION-01
 *
 * Order: greeting + date, executive state, attention, modules.
 * React only renders — no business math, no authorization.
 * No fake content. No placeholder metrics.
 */
"use client";

import { useRouter } from "next/navigation";
import { C, T, S, R, E } from "@/lib/ui/tokens";
import type { ManagerHomePA, ManagerAttentionItem } from "@/lib/comercial/manager/manager-commercial-types";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ManagerModuleCard {
  id:          string;
  label:       string;
  description: string;
  accent:      string;
  href:        string;
  icon:        string;
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

  const stateColor = homePA.executiveState.state === "REQUIRES_ATTENTION"
    ? "#dc2626"
    : homePA.executiveState.state === "DATA_INCOMPLETE"
      ? "#d97706"
      : "#16a34a";

  return (
    <div style={{
      padding:    `${S[5]}px ${S[4]}px ${S[8]}px`,
      maxWidth:   640,
      margin:     "0 auto",
      fontFamily: T.sans,
    }}>
      {/* ── Greeting + Date ────────────────────────────────────────────── */}
      <div style={{ marginBottom: S[4] }}>
        <div style={{
          fontSize:      22,
          fontWeight:    T.wt.bold,
          color:         C.titleDeep,
          letterSpacing: "-0.3px",
          marginBottom:  2,
        }}>
          {homePA.greeting}
        </div>
        <div style={{
          fontFamily:    T.mono,
          fontSize:      T.sz.xs,
          color:         C.inkLight,
          letterSpacing: "0.02em",
        }}>
          {homePA.currentDate}
        </div>
      </div>

      {/* ── Executive State ───────────────────────────────────────────── */}
      <div style={{
        padding:      `${S[3]}px ${S[4]}px`,
        background:   "#fff",
        border:       `1px solid ${C.line}`,
        borderRadius: R.lg,
        marginBottom: S[4],
        display:      "flex",
        alignItems:   "center",
        gap:          S[3],
      }}>
        <div style={{
          width:        10,
          height:       10,
          borderRadius: "50%",
          background:   stateColor,
          flexShrink:   0,
        }} />
        <div>
          <div style={{
            fontFamily:  T.mono,
            fontSize:    T.sz.sm,
            fontWeight:  T.wt.semibold,
            color:       C.ink,
            marginBottom: 2,
          }}>
            Tu empresa hoy
          </div>
          <div style={{
            fontFamily: T.mono,
            fontSize:   T.sz.xs,
            color:      C.inkLight,
          }}>
            {homePA.executiveState.reason}
          </div>
        </div>
      </div>

      {/* ── Attention ─────────────────────────────────────────────────── */}
      {homePA.attention.length > 0 && (
        <div style={{ marginBottom: S[4] }}>
          <SectionLabel>Requiere atencion</SectionLabel>
          {homePA.attention.map(item => (
            <AttentionCard
              key={item.id}
              item={item}
              onTap={() => item.href && router.push(item.href)}
            />
          ))}
        </div>
      )}

      {/* ── Modules ───────────────────────────────────────────────────── */}
      {modules.length > 0 && (
        <div>
          <SectionLabel>Modulos</SectionLabel>
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: S[2],
          }}>
            {modules.map(mod => (
              <ModuleCard key={mod.id} mod={mod} onTap={() => router.push(mod.href)} />
            ))}
          </div>
        </div>
      )}

      {modules.length === 0 && (
        <div style={{
          textAlign: "center",
          padding:   `${S[8]}px ${S[4]}px`,
          color:     C.inkFaint,
          fontSize:  T.sz.sm,
        }}>
          No hay modulos habilitados para esta organizacion.
        </div>
      )}
    </div>
  );
}

// ── Section Label ─────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily:    T.mono,
      fontSize:      T.sz["2xs"],
      fontWeight:    T.wt.semibold,
      color:         C.inkFaint,
      textTransform: "uppercase" as const,
      letterSpacing: "0.08em",
      marginBottom:  S[2],
    }}>
      {children}
    </div>
  );
}

// ── Attention Card ────────────────────────────────────────────────────────

function AttentionCard({
  item,
  onTap,
}: {
  item: ManagerAttentionItem;
  onTap: () => void;
}) {
  const severityColor = item.severity === "critical" ? "#dc2626"
    : item.severity === "warning" ? "#d97706"
    : C.inkLight;

  return (
    <button
      onClick={onTap}
      style={{
        all:          "unset",
        cursor:       "pointer",
        display:      "flex",
        alignItems:   "flex-start",
        gap:          S[3],
        padding:      `${S[3]}px ${S[4]}px`,
        background:   "#fff",
        border:       `1px solid ${C.line}`,
        borderRadius: R.md,
        marginBottom: S[2],
        width:        "100%",
        boxSizing:    "border-box",
        touchAction:  "manipulation",
      }}
    >
      <div style={{
        width:        8,
        height:       8,
        borderRadius: "50%",
        background:   severityColor,
        flexShrink:   0,
        marginTop:    5,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily:  T.mono,
          fontSize:    T.sz.xs,
          fontWeight:  T.wt.semibold,
          color:       C.ink,
          marginBottom: 2,
        }}>
          {item.title}
        </div>
        {item.detail && (
          <div style={{
            fontFamily: T.mono,
            fontSize:   T.sz["2xs"],
            color:      C.inkLight,
            lineHeight: 1.4,
          }}>
            {item.detail}
          </div>
        )}
      </div>
      <svg
        width="16" height="16" viewBox="0 0 24 24"
        fill="none" stroke={C.inkFaint}
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        style={{ flexShrink: 0, marginTop: 2 }}
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </button>
  );
}

// ── Module Card ──────────────────────────────────────────────────────────

function ModuleCard({
  mod,
  onTap,
}: {
  mod: ManagerModuleCard;
  onTap: () => void;
}) {
  return (
    <button
      onClick={onTap}
      style={{
        all:           "unset",
        cursor:        "pointer",
        display:       "flex",
        alignItems:    "center",
        gap:           S[3],
        padding:       `${S[4]}px ${S[4]}px`,
        background:    "#fff",
        border:        `1px solid ${C.line}`,
        borderRadius:  R.lg,
        boxShadow:     E.sm,
        touchAction:   "manipulation",
        boxSizing:     "border-box",
        width:         "100%",
      }}
    >
      <div style={{
        width:          44,
        height:         44,
        borderRadius:   R.md,
        background:     mod.accent,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        flexShrink:     0,
      }}>
        <span style={{
          fontFamily:    T.mono,
          fontSize:      15,
          fontWeight:    T.wt.bold,
          color:         "#fff",
          letterSpacing: "-0.02em",
        }}>
          {mod.icon}
        </span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize:      T.sz.base,
          fontWeight:    T.wt.semibold,
          color:         C.ink,
          marginBottom:  2,
        }}>
          {mod.label}
        </div>
        <div style={{
          fontSize:   T.sz.xs,
          color:      C.inkLight,
          lineHeight: 1.4,
        }}>
          {mod.description}
        </div>
      </div>
      <svg
        width="18" height="18" viewBox="0 0 24 24"
        fill="none" stroke={C.inkFaint}
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        style={{ flexShrink: 0 }}
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </button>
  );
}
