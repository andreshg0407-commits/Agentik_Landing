/**
 * /[orgSlug]/agentik — Agentik AI Operating System
 *
 * Sprint: AGENTIK-MODULE-SHELL-FOUNDATION-01
 *
 * AI OS Administration home: entry point to the Agentik platform layer.
 * Surfaces the two main subsystems: Agents + System Settings.
 *
 * ACCESS: AGENTIK_ADMIN / SUPER_ADMIN only.
 * ORG_ADMIN is redirected to dashboard — tenant preferences live in /ajustes.
 *
 * PRINCIPLE: This is the administrative OS layer, not a tenant module.
 * No business data, no tenant operations, no Copilot surface here.
 */

import Link                 from "next/link";
import Image                from "next/image";
import { redirect }         from "next/navigation";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { isInternalRole }   from "@/lib/auth/module-access";
import { C, T, S, R, E }   from "@/lib/ui/tokens";
import { AGENTS, getAgentStateCounts } from "@/lib/copilot/agents";

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AgentikOSHomePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }          = await params;
  const { membership }       = await requireOrgAccess(orgSlug);

  // ── Access guard — internal roles only ──────────────────────────────────────
  if (!isInternalRole(membership.role)) redirect(`/${orgSlug}/dashboard`);

  const counts        = getAgentStateCounts();
  const totalActive   = counts.active + counts.learning;
  const hasIssues     = counts.degraded > 0 || counts.supervised > 0;
  const systemStatus  = hasIssues ? "degraded" : counts.syncing > 0 ? "syncing" : "healthy";

  const systemLabel   = systemStatus === "healthy"  ? "Todos los sistemas operando con normalidad"
                      : systemStatus === "syncing"   ? "Sincronización en progreso"
                      : "Capacidades degradadas detectadas";

  return (
    <div style={{ fontFamily: T.mono, maxWidth: 1024, padding: `${S[6]}px` }}>

      {/* ── OS Identity header ────────────────────────────────────────────────── */}
      <div style={{
        background:   "linear-gradient(160deg, #001535 0%, #002460 60%, #002E7A 100%)",
        borderRadius: R.card,
        padding:      `${S[6]}px ${S[8]}px`,
        marginBottom: S[5],
        overflow:     "hidden",
        position:     "relative" as const,
      }}>
        {/* Subtle background texture */}
        <div style={{
          position:   "absolute" as const,
          inset:      0,
          background: "radial-gradient(ellipse at 80% 50%, rgba(0,74,173,.18) 0%, transparent 60%)",
          pointerEvents: "none" as const,
        }} />

        {/* Row 1: wordmark + status */}
        <div style={{
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          marginBottom:   S[4],
          position:       "relative" as const,
          zIndex:         1,
        }}>
          <div>
            <div style={{
              fontFamily:    T.mono,
              fontSize:      T.sz["2xs"],
              fontWeight:    T.wt.semibold,
              color:         "rgba(148,163,184,.60)",
              letterSpacing: "0.12em",
              textTransform: "uppercase" as const,
              marginBottom:  4,
            }}>
              Agentik
            </div>
            <div style={{
              fontFamily:  T.mono,
              fontSize:    T.sz["2xl"],
              fontWeight:  T.wt.bold,
              color:       "rgba(235,238,246,.96)",
              lineHeight:  1.1,
              marginBottom: 4,
            }}>
              AI Operating System
            </div>
            <div style={{
              fontFamily: T.mono,
              fontSize:   T.sz.sm,
              color:      "rgba(148,163,184,.70)",
            }}>
              Administration Layer
            </div>
          </div>

          {/* Runtime status pill */}
          <div style={{
            display:      "flex",
            alignItems:   "center",
            gap:          6,
            background:   "rgba(255,255,255,.06)",
            border:       "1px solid rgba(255,255,255,.10)",
            borderRadius: R.pill,
            padding:      `5px ${S[3]}px`,
            flexShrink:   0,
          }}>
            <span style={{
              width:        6,
              height:       6,
              borderRadius: "50%",
              background:   systemStatus === "healthy" ? "#22c55e" : systemStatus === "syncing" ? "#60a5fa" : "#f59e0b",
              display:      "inline-block",
              flexShrink:   0,
            }} />
            <span style={{
              fontFamily:    T.mono,
              fontSize:      T.sz["2xs"],
              color:         "rgba(148,163,184,.80)",
              letterSpacing: "0.04em",
            }}>
              {systemStatus === "healthy" ? "Operativo" : systemStatus === "syncing" ? "Sincronizando" : "Degradado"}
            </span>
          </div>
        </div>

        {/* Row 2: agent presence strip */}
        <div style={{
          display:        "flex",
          alignItems:     "center",
          gap:            S[3],
          position:       "relative" as const,
          zIndex:         1,
          paddingTop:     S[4],
          borderTop:      "1px solid rgba(255,255,255,.08)",
        }}>
          <span style={{
            fontFamily:    T.mono,
            fontSize:      T.sz["2xs"],
            color:         "rgba(148,163,184,.50)",
            letterSpacing: "0.06em",
            flexShrink:    0,
          }}>
            AI WORKFORCE
          </span>

          {/* Agent avatars */}
          <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
            {AGENTS.map(agent => (
              <div key={agent.id} style={{
                display:    "flex",
                alignItems: "center",
                gap:        6,
              }}>
                {/* Avatar */}
                <div style={{
                  width:        28,
                  height:       28,
                  borderRadius: "50%",
                  overflow:     "hidden",
                  border:       `1.5px solid ${agent.accentColor}55`,
                  flexShrink:   0,
                }}>
                  {agent.photo ? (
                    <Image
                      src={agent.photo}
                      alt={agent.name}
                      width={28}
                      height={28}
                      style={{ objectFit: "cover", objectPosition: "top center", display: "block" }}
                    />
                  ) : (
                    <div style={{
                      width:          28,
                      height:         28,
                      background:     `linear-gradient(135deg, ${agent.accentColor}CC 0%, ${agent.accentColor}66 100%)`,
                      display:        "flex",
                      alignItems:     "center",
                      justifyContent: "center",
                    }}>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: "#fff", lineHeight: 1 }}>
                        {agent.avatar}
                      </span>
                    </div>
                  )}
                </div>
                {/* Name + state dot */}
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{
                    fontFamily: T.mono,
                    fontSize:   T.sz["2xs"],
                    color:      "rgba(148,163,184,.75)",
                  }}>
                    {agent.name}
                  </span>
                  <span style={{
                    width:        4,
                    height:       4,
                    borderRadius: "50%",
                    background:   agent.runtimeState === "active"  ? "#22c55e"
                                : agent.runtimeState === "syncing" ? "#60a5fa"
                                : agent.runtimeState === "offline" ? "#6b7280"
                                : "#f59e0b",
                    display:      "inline-block",
                  }} />
                </div>
              </div>
            ))}
          </div>

          {/* Right: entity count */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <span style={{
              fontFamily:    T.mono,
              fontSize:      T.sz["2xs"],
              color:         "rgba(148,163,184,.50)",
              letterSpacing: "0.04em",
            }}>
              {AGENTS.length} entidades · {totalActive} activas
            </span>
          </div>
        </div>
      </div>

      {/* ── System health strip ──────────────────────────────────────────────── */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:          S[2],
        padding:      `${S[2]}px ${S[4]}px`,
        background:   C.surface,
        border:       `1px solid ${C.line}`,
        borderRadius: R.md,
        marginBottom: S[5],
      }}>
        <span style={{
          width:        7,
          height:       7,
          borderRadius: "50%",
          background:   systemStatus === "healthy" ? C.green : C.amber,
          display:      "inline-block",
          flexShrink:   0,
        }} />
        <span style={{
          fontFamily: T.mono,
          fontSize:   T.sz.xs,
          color:      C.inkLight,
          flex:       1,
        }}>
          {systemLabel} · Sync: hace 4m
        </span>
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz["2xs"],
          color:         C.inkGhost,
          letterSpacing: "0.04em",
        }}>
          {membership.role}
        </span>
      </div>

      {/* ── Subsystem entry cards ─────────────────────────────────────────────── */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
        gap:                 S[4],
        marginBottom:        S[5],
      }}>

        {/* ── AGENTS card ───────────────────────────────────────────────────── */}
        <Link href={`/${orgSlug}/agentik/agentes`} style={{ textDecoration: "none" }}>
          <div style={{
            background:    C.white,
            border:        `1px solid ${C.line}`,
            borderLeft:    `3px solid ${C.blueDark}`,
            borderRadius:  R.card,
            boxShadow:     E.sm,
            overflow:      "hidden",
            display:       "flex",
            flexDirection: "column" as const,
            cursor:        "pointer" as const,
          }}>
            {/* Card header */}
            <div style={{
              padding:     `${S[5]}px ${S[5]}px ${S[3]}px`,
              borderBottom: `1px solid ${C.lineSubtle}`,
            }}>
              <div style={{
                fontFamily:    T.mono,
                fontSize:      T.sz["2xs"],
                fontWeight:    T.wt.semibold,
                color:         C.blueDark,
                letterSpacing: "0.10em",
                textTransform: "uppercase" as const,
                marginBottom:  S[1],
              }}>
                AI WORKFORCE
              </div>
              <div style={{
                fontFamily:   T.mono,
                fontSize:     T.sz["2xl"],
                fontWeight:   T.wt.bold,
                color:        C.ink,
                marginBottom: S[1],
                lineHeight:   1.1,
              }}>
                Agentes
              </div>
              <div style={{
                fontFamily: T.mono,
                fontSize:   T.sz.xs,
                color:      C.inkLight,
                lineHeight: 1.5,
              }}>
                Gestión y supervisión de entidades IA operativas
              </div>
            </div>

            {/* Stats block */}
            <div style={{ padding: `${S[3]}px ${S[5]}px` }}>
              <div style={{ display: "flex", gap: S[5] }}>
                <div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["3xl"], fontWeight: T.wt.bold, color: C.blueDark, lineHeight: 1 }}>
                    {AGENTS.length}
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 2 }}>entidades</div>
                </div>
                <div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["3xl"], fontWeight: T.wt.bold, color: C.green, lineHeight: 1 }}>
                    {totalActive}
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 2 }}>activas</div>
                </div>
                {counts.syncing > 0 && (
                  <div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz["3xl"], fontWeight: T.wt.bold, color: C.blue, lineHeight: 1 }}>
                      {counts.syncing}
                    </div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 2 }}>sincronizando</div>
                  </div>
                )}
                {counts.degraded > 0 && (
                  <div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz["3xl"], fontWeight: T.wt.bold, color: C.amber, lineHeight: 1 }}>
                      {counts.degraded}
                    </div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 2 }}>degradados</div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer CTA */}
            <div style={{
              padding:        `${S[2] + 2}px ${S[5]}px`,
              background:     C.surface,
              borderTop:      `1px solid ${C.line}`,
              display:        "flex",
              alignItems:     "center",
              justifyContent: "space-between",
            }}>
              <span style={{
                fontFamily:  T.mono,
                fontSize:    T.sz.xs,
                fontWeight:  T.wt.semibold,
                color:       C.blueDark,
              }}>
                Ver roster de agentes →
              </span>
              <div style={{ display: "flex", gap: -4 }}>
                {AGENTS.slice(0, 3).map(agent => (
                  <div key={agent.id} style={{
                    width:        20,
                    height:       20,
                    borderRadius: "50%",
                    overflow:     "hidden",
                    border:       `1.5px solid ${C.white}`,
                    marginLeft:   -6,
                  }}>
                    {agent.photo ? (
                      <Image
                        src={agent.photo}
                        alt={agent.name}
                        width={20}
                        height={20}
                        style={{ objectFit: "cover", objectPosition: "top center", display: "block" }}
                      />
                    ) : (
                      <div style={{ width: 20, height: 20, background: agent.accentColor, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ fontFamily: T.mono, fontSize: 7, fontWeight: T.wt.bold, color: "#fff" }}>
                          {agent.avatar}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Link>

        {/* ── CONFIGURACIÓN card ────────────────────────────────────────────── */}
        <Link href={`/${orgSlug}/agentik/configuracion`} style={{ textDecoration: "none" }}>
          <div style={{
            background:    C.white,
            border:        `1px solid ${C.line}`,
            borderLeft:    `3px solid #0D2454`,
            borderRadius:  R.card,
            boxShadow:     E.sm,
            overflow:      "hidden",
            display:       "flex",
            flexDirection: "column" as const,
            cursor:        "pointer" as const,
          }}>
            {/* Card header */}
            <div style={{
              padding:      `${S[5]}px ${S[5]}px ${S[3]}px`,
              borderBottom: `1px solid ${C.lineSubtle}`,
            }}>
              <div style={{
                fontFamily:    T.mono,
                fontSize:      T.sz["2xs"],
                fontWeight:    T.wt.semibold,
                color:         C.titleDeep,
                letterSpacing: "0.10em",
                textTransform: "uppercase" as const,
                marginBottom:  S[1],
              }}>
                SYSTEM OPERATIONS
              </div>
              <div style={{
                fontFamily:   T.mono,
                fontSize:     T.sz["2xl"],
                fontWeight:   T.wt.bold,
                color:        C.ink,
                marginBottom: S[1],
                lineHeight:   1.1,
              }}>
                Configuración
              </div>
              <div style={{
                fontFamily: T.mono,
                fontSize:   T.sz.xs,
                color:      C.inkLight,
                lineHeight: 1.5,
              }}>
                Governance del sistema y configuración de plataforma
              </div>
            </div>

            {/* Subsystems list */}
            <div style={{ padding: `${S[3]}px ${S[5]}px`, flex: 1 }}>
              {[
                { label: "Tenant",     desc: "Configuración de la organización",  available: true  },
                { label: "Plataforma", desc: "Runtime, AI Providers, Feature Flags", available: membership.role === "SUPER_ADMIN" },
              ].map(item => (
                <div key={item.label} style={{
                  display:       "flex",
                  alignItems:    "center",
                  gap:           S[3],
                  padding:       `${S[2]}px 0`,
                  borderBottom:  `1px solid ${C.lineSubtle}`,
                }}>
                  <span style={{
                    width:        6,
                    height:       6,
                    borderRadius: "50%",
                    background:   item.available ? C.green : C.inkGhost,
                    display:      "inline-block",
                    flexShrink:   0,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily:  T.mono,
                      fontSize:    T.sz.xs,
                      fontWeight:  T.wt.semibold,
                      color:       item.available ? C.ink : C.inkFaint,
                    }}>
                      {item.label}
                    </div>
                    <div style={{
                      fontFamily: T.mono,
                      fontSize:   T.sz["2xs"],
                      color:      C.inkFaint,
                    }}>
                      {item.desc}
                    </div>
                  </div>
                  {!item.available && (
                    <span style={{
                      fontFamily:    T.mono,
                      fontSize:      T.sz["2xs"],
                      color:         C.inkGhost,
                      background:    C.surface,
                      border:        `1px solid ${C.line}`,
                      borderRadius:  R.pill,
                      padding:       "1px 6px",
                      flexShrink:    0,
                      letterSpacing: "0.04em",
                    }}>
                      SUPER_ADMIN
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Footer CTA */}
            <div style={{
              padding:        `${S[2] + 2}px ${S[5]}px`,
              background:     C.surface,
              borderTop:      `1px solid ${C.line}`,
              display:        "flex",
              alignItems:     "center",
              justifyContent: "space-between",
            }}>
              <span style={{
                fontFamily:  T.mono,
                fontSize:    T.sz.xs,
                fontWeight:  T.wt.semibold,
                color:       C.titleDeep,
              }}>
                Ver configuración →
              </span>
              <span style={{
                fontFamily:    T.mono,
                fontSize:      T.sz["2xs"],
                color:         C.inkGhost,
                letterSpacing: "0.04em",
              }}>
                2 secciones
              </span>
            </div>
          </div>
        </Link>

      </div>

      {/* ── Quick access strip ───────────────────────────────────────────────── */}
      <div style={{
        display:    "flex",
        alignItems: "center",
        gap:        S[3],
        flexWrap:   "wrap" as const,
      }}>
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz["2xs"],
          color:         C.inkGhost,
          letterSpacing: "0.06em",
          textTransform: "uppercase" as const,
        }}>
          Acceso rápido
        </span>
        {[
          { label: "Control Center", href: `/${orgSlug}/agentik/control-center` },
          { label: "Agentes",        href: `/${orgSlug}/agentik/agentes`        },
        ].map(link => (
          <Link key={link.href} href={link.href} style={{
            fontFamily:     T.mono,
            fontSize:       T.sz.xs,
            color:          C.inkMid,
            textDecoration: "none",
            padding:        `3px ${S[3]}px`,
            background:     C.surface,
            border:         `1px solid ${C.line}`,
            borderRadius:   R.pill,
          }}>
            {link.label} →
          </Link>
        ))}
      </div>

    </div>
  );
}
