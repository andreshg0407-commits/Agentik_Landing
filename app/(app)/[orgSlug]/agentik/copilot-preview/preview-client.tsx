"use client";

/**
 * app/(app)/[orgSlug]/agentik/copilot-preview/preview-client.tsx
 *
 * Agentik Copilot — Visual Preview Client
 * Sprint: AGENTIK-COPILOT-RESPONSIVE-MODES-01
 *
 * @dev DEVELOPMENT ONLY — renders the Agent Office with fixture data.
 * No real data. No SAG. No runtime engine.
 *
 * Layout:
 *   - Page header with dev badge + App/Workspace variant toggle
 *   - CopilotPanel with active variant (width adapts per variant)
 *   - <details> Developer Tools section below (collapsed by default)
 */

import { useState }                   from "react";
import { C, T, S, R, E }              from "@/lib/ui/tokens";
import { CopilotPanel }               from "@/components/copilot";
import type { CopilotPanelVariant }   from "@/components/copilot";
import { createDevFixtureViewModel }  from "@/components/copilot/copilot-panel.fixture";
import {
  resolveSectionLabels,
  AGENT_LANGUAGE_PROFILES,
  MODULE_LANGUAGE_PROFILES,
}                                     from "@/lib/copilot/language";
import type { LanguageModule }        from "@/lib/copilot/language";

// ── Preview configuration ─────────────────────────────────────────────────────
// Change these constants to verify language system integration.
// Agent options:  "diego" | "luca" | "mila" | "pablo"
// Module options: "finanzas" | "conciliacion" | "cartera" | "marketing" | "comercial" | "produccion"

const PREVIEW_AGENT_ID:  string        = "diego";
const PREVIEW_MODULE_ID: LanguageModule = "conciliacion";

// ── Component ─────────────────────────────────────────────────────────────────

export function CopilotPreviewClient() {
  const [variant, setVariant] = useState<CopilotPanelVariant>("app");

  const viewModel      = createDevFixtureViewModel();
  const agentProfile   = AGENT_LANGUAGE_PROFILES[PREVIEW_AGENT_ID];
  const moduleProfile  = MODULE_LANGUAGE_PROFILES[PREVIEW_MODULE_ID];
  const resolvedLabels = resolveSectionLabels({ agentId: PREVIEW_AGENT_ID, moduleId: PREVIEW_MODULE_ID });

  // Panel container adapts to variant
  const panelMaxWidth = variant === "workspace" ? 960 : 640;

  return (
    <div style={{
      minHeight:  "100vh",
      background: "linear-gradient(180deg, #f0f2f7 0%, #f8f9fb 100%)",
      padding:    `${S[6]}px ${S[5]}px`,
      fontFamily: T.mono,
    }}>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div style={{
        maxWidth:     panelMaxWidth,
        margin:       "0 auto",
        marginBottom: S[5],
      }}>
        {/* Breadcrumb row */}
        <div style={{
          display:      "flex",
          alignItems:   "center",
          gap:           S[2],
          marginBottom:  S[2],
        }}>
          <span style={{
            fontFamily:    T.mono,
            fontSize:      T.sz["2xs"],
            fontWeight:    T.wt.semibold,
            color:         C.blueDark,
            letterSpacing: "0.10em",
            textTransform: "uppercase" as const,
          }}>
            Agentik
          </span>
          <span style={{ color: C.inkGhost, fontSize: T.sz["2xs"] }}>›</span>
          <span style={{
            fontFamily:    T.mono,
            fontSize:      T.sz["2xs"],
            color:         C.inkFaint,
            letterSpacing: "0.06em",
          }}>
            Internal Preview
          </span>
          <span style={{
            fontFamily:    T.mono,
            fontSize:      T.sz["2xs"],
            fontWeight:    T.wt.semibold,
            color:         C.amberDark,
            background:    C.amberLight,
            border:        `1px solid ${C.amberBorder}`,
            borderRadius:  R.pill,
            padding:       "2px 8px",
            letterSpacing: "0.04em",
            marginLeft:    S[2],
          }}>
            Preview interno · No conectado a datos reales
          </span>
        </div>

        <div style={{
          fontFamily:   T.mono,
          fontSize:     T.sz["2xl"],
          fontWeight:   T.wt.bold,
          color:        C.ink,
          lineHeight:   1.1,
          marginBottom: S[2],
        }}>
          Agentik Copilot Preview
        </div>
        <div style={{
          fontFamily:   T.mono,
          fontSize:     T.sz.xs,
          color:        C.inkLight,
          marginBottom: S[3],
        }}>
          Vista interna para revisión visual de la experiencia de Oficina del Agente.
        </div>

        {/* ── Variant toggle ─────────────────────────────────────────────── */}
        <div style={{
          display:     "inline-flex",
          alignItems:  "center",
          gap:          2,
          background:   C.white,
          border:      `1px solid ${C.line}`,
          borderRadius: R.md,
          padding:      2,
          boxShadow:    E.xs,
        }}>
          {(["app", "workspace"] as CopilotPanelVariant[]).map(v => (
            <button
              key={v}
              onClick={() => setVariant(v)}
              style={{
                fontFamily:    T.mono,
                fontSize:      T.sz.xs,
                fontWeight:    variant === v ? T.wt.semibold : T.wt.normal,
                color:         variant === v ? C.white : C.inkLight,
                background:    variant === v ? C.blueDark : "transparent",
                border:        "none",
                borderRadius:  R.sm,
                padding:      `${S[1]}px ${S[3]}px`,
                cursor:        "pointer",
                letterSpacing: "0.04em",
                transition:   "background 120ms ease, color 120ms ease",
              }}
            >
              {v === "app" ? "App View" : "Workspace View"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Agent Office — main focus ─────────────────────────────────────── */}
      <div style={{ maxWidth: panelMaxWidth, margin: "0 auto", marginBottom: S[6] }}>
        <CopilotPanel viewModel={viewModel} variant={variant} isPreview />
      </div>

      {/* ── Developer Tools — collapsible ─────────────────────────────────── */}
      <div style={{ maxWidth: panelMaxWidth, margin: "0 auto" }}>
        <details style={{ listStyle: "none" }}>
          <summary style={{
            display:       "flex",
            alignItems:    "center",
            gap:            S[2],
            padding:       `${S[2]}px ${S[4]}px`,
            background:    C.white,
            border:        `1px solid ${C.line}`,
            borderRadius:  R.md,
            cursor:        "pointer",
            userSelect:    "none" as const,
            listStyle:     "none",
            boxShadow:     E.xs,
          }}>
            <span style={{
              width:        5,
              height:       5,
              borderRadius: "50%",
              background:   C.inkGhost,
              flexShrink:   0,
              display:      "inline-block",
            }} />
            <span style={{
              fontFamily:    T.mono,
              fontSize:      T.sz.xs,
              fontWeight:    T.wt.semibold,
              color:         C.inkLight,
              letterSpacing: "0.06em",
              textTransform: "uppercase" as const,
              flex:          1,
            }}>
              Developer Tools
            </span>
            <span style={{
              fontFamily:   T.mono,
              fontSize:     T.sz["2xs"],
              color:        C.inkFaint,
              background:   C.surface,
              border:       `1px solid ${C.line}`,
              borderRadius: R.sm,
              padding:      "1px 6px",
              letterSpacing:"0.04em",
            }}>
              Development only
            </span>
          </summary>

          {/* Developer Tools content */}
          <div style={{
            background:   C.white,
            border:       `1px solid ${C.line}`,
            borderTop:    "none",
            borderRadius: `0 0 ${R.md}px ${R.md}px`,
            overflow:     "hidden",
          }}>
            {/* Snapshot meta */}
            <div style={{
              padding:      `${S[3]}px ${S[4]}px`,
              borderBottom: `1px solid ${C.lineSubtle}`,
            }}>
              <div style={{
                fontFamily:    T.mono,
                fontSize:      T.sz["2xs"],
                fontWeight:    T.wt.semibold,
                color:         C.inkFaint,
                letterSpacing: "0.10em",
                textTransform: "uppercase" as const,
                marginBottom:  S[2],
              }}>
                Fixture Snapshot
              </div>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
                {([
                  ["Snapshot ID",   viewModel.snapshotId],
                  ["Módulo",        viewModel.module],
                  ["Agente lead",   viewModel.leadAgent?.agentName ?? "—"],
                  ["Readiness",     viewModel.summary.readinessLabel],
                  ["Sugerencias",   String(viewModel.summary.totalSuggestions)],
                  ["Insights",      String(viewModel.summary.totalInsights)],
                  ["Atención",      String(viewModel.summary.attentionCount)],
                  ["Oportunidades", String(viewModel.summary.opportunityCount)],
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label} style={{
                    display:      "flex",
                    gap:           S[3],
                    padding:      `${S[1]}px 0`,
                    borderBottom: `1px solid ${C.lineSubtle}`,
                  }}>
                    <span style={{
                      fontFamily: T.mono,
                      fontSize:   T.sz.xs,
                      color:      C.inkFaint,
                      width:      120,
                      flexShrink: 0,
                    }}>
                      {label}
                    </span>
                    <span style={{
                      fontFamily: T.mono,
                      fontSize:   T.sz.xs,
                      color:      C.ink,
                      fontWeight: T.wt.medium,
                    }}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Active domains */}
            <DevSection label="Dominios activos en fixture">
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: S[2] }}>
                {viewModel.summary.activeDomains.map(d => (
                  <span key={d} style={{
                    fontFamily:   T.mono,
                    fontSize:     T.sz.xs,
                    color:        C.blueDark,
                    background:   "rgba(0,74,173,0.07)",
                    border:       "1px solid rgba(0,74,173,0.18)",
                    borderRadius: R.pill,
                    padding:      "2px 8px",
                  }}>
                    {d}
                  </span>
                ))}
              </div>
            </DevSection>

            {/* Active agent */}
            <DevSection label="Agente activo">
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
                {([
                  ["Nombre",       viewModel.leadAgent?.agentName ?? "—"],
                  ["Rol",          viewModel.leadAgent?.role ?? "—"],
                  ["Tono",         viewModel.leadAgent?.tone ?? "—"],
                  ["Dominios",     (viewModel.leadAgent?.primaryDomains ?? []).join(", ") || "—"],
                ] as [string, string][]).map(([label, value]) => (
                  <DevRow key={label} label={label} value={value} />
                ))}
              </div>
            </DevSection>

            {/* Capacidades detectadas */}
            <DevSection label="Capacidades detectadas">
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: S[1] + 2 }}>
                {(viewModel.leadAgent?.availableCapabilities ?? []).slice(0, 6).map(cap => (
                  <span key={cap} style={{
                    fontFamily:   T.mono,
                    fontSize:     T.sz["2xs"],
                    color:        C.inkFaint,
                    background:   C.surface,
                    border:       `1px solid ${C.line}`,
                    borderRadius: R.sm,
                    padding:      "1px 5px",
                  }}>
                    {cap}
                  </span>
                ))}
                {(viewModel.leadAgent?.availableCapabilities.length ?? 0) > 6 && (
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost }}>
                    +{(viewModel.leadAgent?.availableCapabilities.length ?? 0) - 6} más
                  </span>
                )}
              </div>
            </DevSection>

            {/* Acciones recomendadas */}
            <DevSection label="Acciones recomendadas (top 3)">
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
                {viewModel.suggestions.slice(0, 3).map((s, i) => (
                  <div key={s.id} style={{ display: "flex", gap: S[2], alignItems: "baseline" }}>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost, flexShrink: 0 }}>
                      {i + 1}.
                    </span>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                      {s.title}
                    </span>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost, marginLeft: "auto", flexShrink: 0 }}>
                      {s.priority}
                    </span>
                  </div>
                ))}
              </div>
            </DevSection>

            {/* Workspace State */}
            <DevSection label="Workspace State">
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
                {([
                  ["Trabajos activos",      String(viewModel.activeWork?.length      ?? 0)],
                  ["Pendientes aprobación", String(viewModel.pendingApprovals?.length ?? 0)],
                  ["Completados",           String(viewModel.completedWork?.length    ?? 0)],
                  ["Seguimientos",          String(viewModel.followups?.length        ?? 0)],
                  ["Solicitudes (inbox)",   String(viewModel.requestInbox?.length     ?? 0)],
                ] as [string, string][]).map(([label, value]) => (
                  <DevRow key={label} label={label} value={value} />
                ))}
              </div>
            </DevSection>

            {/* Trabajos activos */}
            {(viewModel.activeWork?.length ?? 0) > 0 && (
              <DevSection label="Trabajos activos">
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
                  {viewModel.activeWork!.map(w => (
                    <div key={w.id} style={{ display: "flex", gap: S[2], alignItems: "center" }}>
                      <div style={{
                        height:       4,
                        width:        36,
                        background:   C.lineSubtle,
                        borderRadius: R.pill,
                        overflow:     "hidden",
                        flexShrink:   0,
                      }}>
                        <div style={{
                          height:     "100%",
                          width:      `${w.progress}%`,
                          background: C.blueDark,
                          borderRadius: R.pill,
                        }} />
                      </div>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, flex: 1 }}>
                        {w.title}
                      </span>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, flexShrink: 0 }}>
                        {w.progress}%
                      </span>
                    </div>
                  ))}
                </div>
              </DevSection>
            )}

            {/* Pendientes aprobación */}
            {(viewModel.pendingApprovals?.length ?? 0) > 0 && (
              <DevSection label="Pendientes aprobación">
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
                  {viewModel.pendingApprovals!.map(p => (
                    <div key={p.id} style={{ display: "flex", gap: S[2], alignItems: "baseline" }}>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, flex: 1 }}>
                        {p.action}
                      </span>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amberDark, flexShrink: 0 }}>
                        {p.riskLabel}
                      </span>
                    </div>
                  ))}
                </div>
              </DevSection>
            )}

            {/* Completados */}
            {(viewModel.completedWork?.length ?? 0) > 0 && (
              <DevSection label="Completados recientemente">
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
                  {viewModel.completedWork!.map(c => (
                    <div key={c.id} style={{ display: "flex", gap: S[2], alignItems: "baseline" }}>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.green, flexShrink: 0 }}>✓</span>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, flex: 1 }}>
                        {c.title}
                      </span>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, flexShrink: 0 }}>
                        {c.completedLabel}
                      </span>
                    </div>
                  ))}
                </div>
              </DevSection>
            )}

            {/* Seguimientos */}
            {(viewModel.followups?.length ?? 0) > 0 && (
              <DevSection label="Seguimientos programados">
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
                  {viewModel.followups!.map(f => (
                    <div key={f.id} style={{ display: "flex", gap: S[2], alignItems: "baseline" }}>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, flex: 1 }}>
                        {f.title}
                      </span>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, flexShrink: 0 }}>
                        {f.due}
                      </span>
                    </div>
                  ))}
                </div>
              </DevSection>
            )}

            {/* Solicitudes inbox */}
            {(viewModel.requestInbox?.length ?? 0) > 0 && (
              <DevSection label="Solicitudes (inbox)">
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
                  {viewModel.requestInbox!.map(r => (
                    <div key={r.id} style={{ display: "flex", gap: S[2], alignItems: "baseline" }}>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, flex: 1 }}>
                        {r.request}
                      </span>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, flexShrink: 0 }}>
                        {r.statusLabel}
                      </span>
                    </div>
                  ))}
                </div>
              </DevSection>
            )}

            {/* ── Language System (LANGUAGE-ADOPTION-01) ─────────────────────── */}
            <DevSection label="Language System — configuración activa">
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
                {([
                  ["Agente activo",    PREVIEW_AGENT_ID],
                  ["Módulo activo",    PREVIEW_MODULE_ID],
                  ["Perfil agente",    agentProfile ? `${agentProfile.agentName} (${agentProfile.agentId})` : "Base language"],
                  ["Perfil módulo",    moduleProfile ? moduleProfile.moduleName : "Ninguno"],
                ] as [string, string][]).map(([label, value]) => (
                  <DevRow key={label} label={label} value={value} />
                ))}
              </div>
            </DevSection>

            {/* Language System — resolved section labels */}
            <DevSection label="Language System — labels resueltos">
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
                {(Object.entries(resolvedLabels) as [string, string][]).map(([key, value]) => (
                  <div key={key} style={{ display: "flex", gap: S[3], padding: `${S[1]}px 0`, borderBottom: `1px solid ${C.lineSubtle}` }}>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, width: 140, flexShrink: 0 }}>
                      {key}
                    </span>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, fontWeight: T.wt.medium }}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </DevSection>

            {/* Language System — agent section labels */}
            {agentProfile && (
              <DevSection label={`Perfil de agente: ${agentProfile.agentName}`}>
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
                  {(Object.entries(agentProfile.sectionLabels) as [string, string][]).map(([key, value]) => (
                    <div key={key} style={{ display: "flex", gap: S[3], padding: `${S[1]}px 0`, borderBottom: `1px solid ${C.lineSubtle}` }}>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, width: 140, flexShrink: 0 }}>
                        {key}
                      </span>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.blueDark, fontWeight: T.wt.medium }}>
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              </DevSection>
            )}

            {/* Language System — module overrides */}
            {moduleProfile && Object.keys(moduleProfile.overrides).length > 0 && (
              <DevSection label={`Overrides de módulo: ${moduleProfile.moduleName}`}>
                <div style={{ display: "flex", flexWrap: "wrap" as const, gap: S[2] }}>
                  {(Object.entries(moduleProfile.overrides) as [string, string][]).slice(0, 12).map(([key, value]) => (
                    <span key={key} style={{
                      fontFamily:   T.mono,
                      fontSize:     T.sz["2xs"],
                      color:        C.greenDark,
                      background:   C.greenLight,
                      border:       `1px solid ${C.greenBorder}`,
                      borderRadius: R.sm,
                      padding:      "1px 6px",
                    }}>
                      {key} → {value}
                    </span>
                  ))}
                </div>
              </DevSection>
            )}
          </div>
        </details>
      </div>

    </div>
  );
}

// ── Developer Tools helpers ───────────────────────────────────────────────────

function DevSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      padding:      `${S[3]}px ${S[4]}px`,
      borderBottom: `1px solid ${C.lineSubtle}`,
    }}>
      <div style={{
        fontFamily:    T.mono,
        fontSize:      T.sz["2xs"],
        fontWeight:    T.wt.semibold,
        color:         C.inkFaint,
        letterSpacing: "0.10em",
        textTransform: "uppercase" as const,
        marginBottom:  S[2],
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function DevRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display:      "flex",
      gap:           S[3],
      padding:      `${S[1]}px 0`,
      borderBottom: `1px solid ${C.lineSubtle}`,
    }}>
      <span style={{
        fontFamily: T.mono,
        fontSize:   T.sz.xs,
        color:      C.inkFaint,
        width:      100,
        flexShrink: 0,
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: T.mono,
        fontSize:   T.sz.xs,
        color:      C.ink,
        fontWeight: T.wt.medium,
      }}>
        {value}
      </span>
    </div>
  );
}
