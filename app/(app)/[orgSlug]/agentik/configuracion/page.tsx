/**
 * /[orgSlug]/agentik/configuracion — System Operations & Governance
 *
 * Sprint: AGENTIK-MODULE-SHELL-FOUNDATION-01 (structural placeholder)
 *
 * Entry point for system configuration. Separates:
 *   - Tenant Settings: org-level config (ORG_ADMIN visible in /ajustes — NOT here)
 *   - Platform Settings: infrastructure config (SUPER_ADMIN only)
 *
 * ACCESS: AGENTIK_ADMIN / SUPER_ADMIN only.
 * Full implementation: next sprint.
 */

import Link                 from "next/link";
import { redirect }         from "next/navigation";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { isInternalRole }   from "@/lib/auth/module-access";
import { C, T, S, R, E }   from "@/lib/ui/tokens";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";

// ── Tenant section items ───────────────────────────────────────────────────────

const TENANT_SECTIONS = [
  { label: "General",          desc: "Branding, idioma, zona horaria, moneda" },
  { label: "Usuarios y Roles", desc: "Miembros de la organización y permisos"  },
  { label: "Módulos Activos",  desc: "Módulos habilitados para este tenant"    },
  { label: "Integraciones",    desc: "Conexiones propias del cliente"          },
  { label: "Agentes IA",       desc: "Preferencias básicas de agentes"         },
];

// ── Platform section items ─────────────────────────────────────────────────────

const PLATFORM_SECTIONS = [
  { label: "Runtime Engine",   desc: "Configuración del motor de ejecución"   },
  { label: "AI Providers",     desc: "Modelos, tokens, fallbacks, costos"     },
  { label: "Feature Flags",    desc: "Flags globales del sistema"             },
  { label: "Governance",       desc: "Políticas de ejecución y límites"       },
  { label: "Vault & Secrets",  desc: "Gestión de credenciales internas"       },
  { label: "Observabilidad",   desc: "Backends, traces, retención"            },
  { label: "Tenants",          desc: "Provisioning y configuración global"    },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ConfiguracionPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }    = await params;
  const { membership } = await requireOrgAccess(orgSlug);

  if (!isInternalRole(membership.role)) redirect(`/${orgSlug}/dashboard`);

  const isSuperAdmin = membership.role === "SUPER_ADMIN";

  return (
    <div style={{ fontFamily: T.mono, maxWidth: 1024, padding: `${S[6]}px` }}>

      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Agentik",       href: `/${orgSlug}/agentik`          },
          { label: "Configuración" },
        ]}
        title="Configuración"
        subtitle="System Operations & Governance"
        status="neutral"
        statusLabel="En construcción"
      />

      {/* ── Two-column configuration grid ────────────────────────────────────── */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
        gap:                 S[4],
      }}>

        {/* ── TENANT card ───────────────────────────────────────────────────── */}
        <div style={{
          background:    C.white,
          border:        `1px solid ${C.line}`,
          borderLeft:    `3px solid ${C.blueDark}`,
          borderRadius:  R.card,
          boxShadow:     E.sm,
          overflow:      "hidden",
        }}>
          {/* Header */}
          <div style={{
            padding:      `${S[4]}px ${S[5]}px ${S[3]}px`,
            borderBottom: `1px solid ${C.lineSubtle}`,
          }}>
            <div style={{
              fontFamily:    T.mono,
              fontSize:      T.sz["2xs"],
              fontWeight:    T.wt.semibold,
              color:         C.blueDark,
              letterSpacing: "0.10em",
              textTransform: "uppercase" as const,
              marginBottom:  4,
            }}>
              TENANT
            </div>
            <div style={{
              fontFamily:   T.mono,
              fontSize:     T.sz.xl,
              fontWeight:   T.wt.bold,
              color:        C.ink,
              marginBottom: 2,
            }}>
              Configuración del Tenant
            </div>
            <div style={{
              fontFamily: T.mono,
              fontSize:   T.sz.xs,
              color:      C.inkLight,
            }}>
              Configuración de la organización activa
            </div>
          </div>

          {/* Sections list */}
          <div style={{ padding: `${S[2]}px 0` }}>
            {TENANT_SECTIONS.map(section => (
              <div key={section.label} style={{
                display:     "flex",
                alignItems:  "center",
                gap:         S[3],
                padding:     `${S[2]}px ${S[5]}px`,
              }}>
                <span style={{
                  width:        5,
                  height:       5,
                  borderRadius: "50%",
                  background:   C.lineSubtle,
                  border:       `1px solid ${C.line}`,
                  display:      "inline-block",
                  flexShrink:   0,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily:  T.mono,
                    fontSize:    T.sz.xs,
                    fontWeight:  T.wt.medium,
                    color:       C.inkMid,
                  }}>
                    {section.label}
                  </div>
                  <div style={{
                    fontFamily: T.mono,
                    fontSize:   T.sz["2xs"],
                    color:      C.inkFaint,
                  }}>
                    {section.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            padding:     `${S[2] + 2}px ${S[5]}px`,
            background:  C.surface,
            borderTop:   `1px solid ${C.line}`,
          }}>
            <span style={{
              fontFamily:    T.mono,
              fontSize:      T.sz["2xs"],
              color:         C.inkGhost,
              letterSpacing: "0.04em",
            }}>
              Próximamente
            </span>
          </div>
        </div>

        {/* ── PLATFORM card ─────────────────────────────────────────────────── */}
        <div style={{
          background:    C.white,
          border:        `1px solid ${C.line}`,
          borderLeft:    `3px solid ${isSuperAdmin ? C.titleDeep : C.line}`,
          borderRadius:  R.card,
          boxShadow:     E.sm,
          overflow:      "hidden",
          opacity:       isSuperAdmin ? 1 : 0.55,
        }}>
          {/* Header */}
          <div style={{
            padding:      `${S[4]}px ${S[5]}px ${S[3]}px`,
            borderBottom: `1px solid ${C.lineSubtle}`,
          }}>
            <div style={{
              display:        "flex",
              alignItems:     "center",
              justifyContent: "space-between",
              marginBottom:   4,
            }}>
              <div style={{
                fontFamily:    T.mono,
                fontSize:      T.sz["2xs"],
                fontWeight:    T.wt.semibold,
                color:         isSuperAdmin ? C.titleDeep : C.inkFaint,
                letterSpacing: "0.10em",
                textTransform: "uppercase" as const,
              }}>
                PLATAFORMA
              </div>
              {!isSuperAdmin && (
                <span style={{
                  fontFamily:    T.mono,
                  fontSize:      T.sz["2xs"],
                  color:         C.inkGhost,
                  background:    C.surface,
                  border:        `1px solid ${C.line}`,
                  borderRadius:  R.pill,
                  padding:       "1px 7px",
                  letterSpacing: "0.04em",
                }}>
                  SUPER_ADMIN
                </span>
              )}
            </div>
            <div style={{
              fontFamily:   T.mono,
              fontSize:     T.sz.xl,
              fontWeight:   T.wt.bold,
              color:        isSuperAdmin ? C.ink : C.inkFaint,
              marginBottom: 2,
            }}>
              Platform Settings
            </div>
            <div style={{
              fontFamily: T.mono,
              fontSize:   T.sz.xs,
              color:      C.inkFaint,
            }}>
              Infraestructura y configuración global de Agentik
            </div>
          </div>

          {/* Sections list */}
          <div style={{ padding: `${S[2]}px 0` }}>
            {PLATFORM_SECTIONS.map(section => (
              <div key={section.label} style={{
                display:     "flex",
                alignItems:  "center",
                gap:         S[3],
                padding:     `${S[2]}px ${S[5]}px`,
              }}>
                <span style={{
                  width:        5,
                  height:       5,
                  borderRadius: "50%",
                  background:   isSuperAdmin ? C.lineSubtle : C.surface,
                  border:       `1px solid ${C.line}`,
                  display:      "inline-block",
                  flexShrink:   0,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily:  T.mono,
                    fontSize:    T.sz.xs,
                    fontWeight:  T.wt.medium,
                    color:       isSuperAdmin ? C.inkMid : C.inkFaint,
                  }}>
                    {section.label}
                  </div>
                  <div style={{
                    fontFamily: T.mono,
                    fontSize:   T.sz["2xs"],
                    color:      C.inkGhost,
                  }}>
                    {section.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            padding:     `${S[2] + 2}px ${S[5]}px`,
            background:  C.surface,
            borderTop:   `1px solid ${C.line}`,
          }}>
            <span style={{
              fontFamily:    T.mono,
              fontSize:      T.sz["2xs"],
              color:         C.inkGhost,
              letterSpacing: "0.04em",
            }}>
              {isSuperAdmin ? "Próximamente" : "Acceso restringido"}
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}
