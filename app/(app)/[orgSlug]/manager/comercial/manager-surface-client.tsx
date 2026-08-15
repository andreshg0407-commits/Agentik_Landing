/**
 * Shared Manager Surface Client — reusable executive surface presentation.
 *
 * Sprint: AGENTIK-MANAGER-APP-CANONICAL-INTEGRATION-01
 *
 * Every commercial surface follows the same grammar:
 *   1. Estado (facts)
 *   2. Requiere atencion (only when real)
 *   3. Inteligencia (deterministic conclusions)
 *   4. Executive lists
 *   5. Freshness
 *
 * React only renders. No business math. Max 4 primary facts.
 */
"use client";

import { C, T, S, R } from "@/lib/ui/tokens";
import type { ManagerTruthState, ManagerAttentionStatus } from "@/lib/comercial/manager/manager-commercial-types";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SurfaceFact {
  label: string;
  value: string;
  truthState: ManagerTruthState;
}

export interface SurfaceListItem {
  id: string;
  primary: string;
  secondary?: string;
  meta?: string;
  href?: string;
  statusColor?: string;
}

export interface ManagerSurfaceProps {
  title: string;
  /** Visible period label. When fallback is active, shows "Ultimo periodo disponible: ..." */
  subtitle?: string;
  facts: SurfaceFact[];
  attentionStatus: ManagerAttentionStatus;
  listTitle?: string;
  listItems?: SurfaceListItem[];
  onItemTap?: (item: SurfaceListItem) => void;
  freshness: string;
  children?: React.ReactNode;
}

// ── Component ────────────────────────────────────────────────────────────────

export function ManagerSurfaceClient({
  title,
  subtitle,
  facts,
  attentionStatus,
  listTitle,
  listItems,
  onItemTap,
  freshness,
  children,
}: ManagerSurfaceProps) {
  return (
    <div style={{
      padding:    `${S[4]}px ${S[4]}px ${S[8]}px`,
      maxWidth:   640,
      margin:     "0 auto",
      fontFamily: T.sans,
    }}>
      {/* ── Title ────────────────────────────────────────────────────── */}
      {title && (
        <div style={{
          fontFamily:    T.mono,
          fontSize:      T.sz.lg,
          fontWeight:    T.wt.bold,
          color:         C.ink,
          marginBottom:  S[3],
          letterSpacing: "-0.3px",
        }}>
          {title}
        </div>
      )}

      {/* ── Period subtitle ─────────────────────────────────────────── */}
      {subtitle && (
        <div style={{
          fontFamily:    T.mono,
          fontSize:      T.sz["2xs"],
          color:         C.inkLight,
          marginBottom:  S[3],
          fontStyle:     "italic",
        }}>
          {subtitle}
        </div>
      )}

      {/* ── Estado ──────────────────────────────────────────────────── */}
      {facts.length > 0 && (
        <div style={{ marginBottom: S[4] }}>
          <SectionLabel>Estado</SectionLabel>
          <div style={{
            display:  "grid",
            gridTemplateColumns: facts.length <= 2 ? "1fr 1fr" : "1fr 1fr",
            gap:      S[2],
          }}>
            {facts.slice(0, 4).map((f, i) => (
              <FactCard key={i} fact={f} />
            ))}
          </div>
        </div>
      )}

      {/* ── Additional content (per-surface) ──────────────────────── */}
      {children}

      {/* ── Executive List ─────────────────────────────────────────── */}
      {listItems && listItems.length > 0 && (
        <div style={{ marginBottom: S[4] }}>
          {listTitle && <SectionLabel>{listTitle}</SectionLabel>}
          <div style={{
            background:   "#fff",
            border:       `1px solid ${C.line}`,
            borderRadius: R.md,
            overflow:     "hidden",
          }}>
            {listItems.map((item, i) => (
              <button
                key={item.id}
                onClick={() => onItemTap?.(item)}
                style={{
                  all:           "unset",
                  cursor:        item.href ? "pointer" : "default",
                  display:       "flex",
                  alignItems:    "center",
                  gap:           S[3],
                  padding:       `${S[3]}px ${S[3]}px`,
                  borderBottom:  i < listItems.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
                  width:         "100%",
                  boxSizing:     "border-box",
                  touchAction:   "manipulation",
                }}
              >
                {item.statusColor && (
                  <div style={{
                    width:        8,
                    height:       8,
                    borderRadius: "50%",
                    background:   item.statusColor,
                    flexShrink:   0,
                  }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily:  T.mono,
                    fontSize:    T.sz.xs,
                    fontWeight:  T.wt.semibold,
                    color:       C.ink,
                    overflow:    "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace:  "nowrap" as const,
                  }}>
                    {item.primary}
                  </div>
                  {item.secondary && (
                    <div style={{
                      fontFamily: T.mono,
                      fontSize:   T.sz["2xs"],
                      color:      C.inkLight,
                      marginTop:  1,
                    }}>
                      {item.secondary}
                    </div>
                  )}
                </div>
                {item.meta && (
                  <div style={{
                    fontFamily: T.mono,
                    fontSize:   T.sz.xs,
                    fontWeight: T.wt.semibold,
                    color:      C.ink,
                    flexShrink: 0,
                  }}>
                    {item.meta}
                  </div>
                )}
                {item.href && (
                  <svg
                    width="14" height="14" viewBox="0 0 24 24"
                    fill="none" stroke={C.inkFaint}
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    style={{ flexShrink: 0 }}
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Freshness ──────────────────────────────────────────────── */}
      <div
        suppressHydrationWarning
        style={{
          fontFamily:    T.mono,
          fontSize:      T.sz["2xs"],
          color:         C.inkGhost,
          letterSpacing: "0.04em",
          textAlign:     "center" as const,
          marginTop:     S[3],
        }}
      >
        {`Datos al ${new Date(freshness).toLocaleString("es-CO", { timeZone: "America/Bogota" })}`}
      </div>
    </div>
  );
}

// ── Shared subcomponents ──────────────────────────────────────────────────

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

function FactCard({ fact }: { fact: SurfaceFact }) {
  return (
    <div style={{
      padding:      `${S[3]}px ${S[3]}px`,
      background:   "#fff",
      border:       `1px solid ${C.line}`,
      borderRadius: R.md,
    }}>
      <div style={{
        fontFamily: T.mono,
        fontSize:   T.sz["2xs"],
        color:      C.inkFaint,
        marginBottom: 4,
      }}>
        {fact.label}
      </div>
      <div style={{
        fontFamily: T.mono,
        fontSize:   T.sz.lg,
        fontWeight: T.wt.bold,
        color:      C.ink,
        letterSpacing: "-0.3px",
      }}>
        {fact.value}
      </div>
    </div>
  );
}
