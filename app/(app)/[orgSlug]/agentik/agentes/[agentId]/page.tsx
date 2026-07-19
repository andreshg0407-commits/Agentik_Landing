/**
 * /[orgSlug]/agentik/agentes/[agentId] — Agent Workspace
 *
 * Sprint: AGENTIK-WORKSPACE-SYSTEM-REFINEMENT-01
 *
 * Foundation rules (apply to ALL agents, current and future):
 *   A — Breadcrumb-only header: no title duplication — Executive Header is the anchor
 *   B — Dense elegance: tighter spacing, no dead air
 *   C — Overview recomposed: left fills with description + capabilities + modules
 *   D — Operational signals: single connected context feed, not isolated widgets
 *   E — Ultra-subtle chip tokens: near-invisible borders, tinted fills
 *   F — Surface depth: soft gradient layers, tonal right column, micro-shadow
 *   G — Fully generic: zero agent-specific hardcoding
 *
 * Layout:
 *   Breadcrumb → Executive Header → Status Strip → Tabs →
 *   Overview: two-column surface (description+caps+modules | state+scope+integrations)
 *            + operational context feed
 */

import Image                          from "next/image";
import Link                           from "next/link";
import { requireOrgAccess }           from "@/lib/auth/org-access";
import { C, T, S, R, E }             from "@/lib/ui/tokens";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { AgentMemoryTab }             from "@/components/agentik/agent-memory-tab";
import { AgentCapabilitiesTab }       from "@/components/agentik/agent-capabilities-tab";
import { AgentIntegrationsTab }       from "@/components/agentik/agent-integrations-tab";
import { AgentPersonalityTab }        from "@/components/agentik/agent-personality-tab";
import { AgentWorkflowsTab }         from "@/components/agentik/agent-workflows-tab";
import { AgentExecutionLayer }        from "@/components/agentik/agent-execution-layer";
import { AGENTS }                     from "@/lib/copilot/agents";
import type { AgentRuntimeState }     from "@/lib/copilot/agents";

// ── Tabs ───────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "overview",      label: "Overview"      },
  { id: "memoria",       label: "Memoria"       },
  { id: "capacidades",   label: "Capacidades"   },
  { id: "integraciones", label: "Integraciones" },
  { id: "personalidad",  label: "Personalidad"  },
  { id: "workflows",     label: "Workflows"     },
] as const;

// ── Runtime state visual config ────────────────────────────────────────────────

const STATE: Record<AgentRuntimeState, {
  label:      string;
  chipBg:     string;
  chipColor:  string;
  chipBorder: string;
  dotColor:   string;
  stateText:  string;
  focusText:  string;
}> = {
  active:     {
    label:      "ACTIVO",
    chipBg:     C.greenLight, chipColor: C.green,    chipBorder: C.greenBorder, dotColor: C.green,
    stateText:  "Operando normalmente",
    focusText:  "Monitoreando señales críticas y patrones operativos en tiempo real",
  },
  syncing:    {
    label:      "SINCRONIZANDO",
    chipBg:     C.blueLight,  chipColor: C.blueDark, chipBorder: C.blueBorder,  dotColor: C.blueDark,
    stateText:  "Actualizando contexto estratégico",
    focusText:  "Sincronizando patrones de memoria y contexto operativo",
  },
  degraded:   {
    label:      "DEGRADADO",
    chipBg:     C.amberLight, chipColor: C.amberDark, chipBorder: C.amberBorder, dotColor: C.amber,
    stateText:  "Capacidades reducidas",
    focusText:  "Operando con integaciones parciales — una o más fuentes no disponibles",
  },
  supervised: {
    label:      "SUPERVISADO",
    chipBg:     C.brandLight, chipColor: C.brand,    chipBorder: C.brandBorder, dotColor: C.brand,
    stateText:  "Esperando aprobación",
    focusText:  "En pausa — acción pendiente de validación por operador autorizado",
  },
  offline:    {
    label:      "OFFLINE",
    chipBg:     C.surface,    chipColor: C.inkLight, chipBorder: C.line,        dotColor: C.inkGhost,
    stateText:  "Desactivado",
    focusText:  "Agente fuera de línea — no procesa señales ni ejecuta acciones",
  },
  learning:   {
    label:      "APRENDIENDO",
    chipBg:     C.blueLight,  chipColor: C.blue,     chipBorder: C.blueBorder,  dotColor: C.blue,
    stateText:  "Procesando nuevos patrones",
    focusText:  "Adaptando modelos al contexto operativo con datos recientes",
  },
};

const MODULE_LABELS: Record<string, string> = {
  "finanzas":                 "Finanzas",
  "reconciliation":           "Conciliación",
  "finance":                  "Finance",
  "executive":                "Torre de Control",
  "agentik/marketing-studio": "Marketing Studio",
  "sales":                    "Ventas",
  "pipeline":                 "Pipeline",
  "customer-360":             "Customer 360",
  "comercial":                "Comercial",
  "integrations":             "Integraciones",
  "alerts":                   "Alertas",
  "collections":              "Cobranza",
};

// ── Micro-styles (reused throughout) ──────────────────────────────────────────

const overline = {
  fontFamily:    T.mono,
  fontSize:      T.sz["2xs"],
  fontWeight:    T.wt.semibold,
  letterSpacing: "0.09em",
  textTransform: "uppercase" as const,
  color:         C.inkFaint,
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AgentWorkspacePage({
  params,
  searchParams,
}: {
  params:       Promise<{ orgSlug: string; agentId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { orgSlug, agentId } = await params;
  const { tab = "overview" }  = await searchParams;
  await requireOrgAccess(orgSlug);

  const agent = AGENTS.find(a => a.id === agentId);

  if (!agent) {
    return (
      <div style={{ padding: `${S[5]}px`, maxWidth: 1024, fontFamily: T.mono }}>
        <OperationalWorkspaceHeader
          breadcrumbs={[
            { label: "Agentik", href: `/${orgSlug}/agentik`        },
            { label: "Agentes", href: `/${orgSlug}/agentik/agentes` },
            { label: agentId },
          ]}
          title={agentId}
          subtitle="Agente no encontrado en el registro"
          status="warning"
          statusLabel="No encontrado"
        />
      </div>
    );
  }

  const st      = STATE[agent.runtimeState];
  const signals = agent.memoryHints["default"] ?? [];
  const baseUrl = `/${orgSlug}/agentik/agentes/${agentId}`;

  return (
    <div style={{ padding: `${S[5]}px`, maxWidth: 1024, fontFamily: T.mono }}>

      {/* ── Bloque A — Breadcrumb only, no title duplication ─────────────────── */}
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Agentik", href: `/${orgSlug}/agentik`        },
          { label: "Agentes", href: `/${orgSlug}/agentik/agentes` },
          { label: agent.name },
        ]}
      />

      {/* ══════════════════════════════════════════════════════════════════════════
          1. EXECUTIVE HEADER — identity anchor
          Bloque F: subtle gradient bg + left accent stripe
      ══════════════════════════════════════════════════════════════════════════ */}
      <div style={{
        background:   "linear-gradient(180deg, #FFFFFF 0%, #FAFBFD 100%)",
        border:       `1px solid ${C.line}`,
        borderLeft:   `4px solid ${agent.accentColor}`,
        borderRadius: R.card,
        boxShadow:    E.sm,
        overflow:     "hidden",
        marginBottom: S[2] + 2,
      }}>
        <div style={{
          padding:    `${S[4]}px ${S[5]}px`,
          display:    "flex",
          alignItems: "flex-start",
          gap:        S[4],
        }}>

          {/* Avatar — 80px circular, premium ring */}
          {agent.photo ? (
            <div style={{
              width:        80,
              height:       80,
              borderRadius: "50%",
              overflow:     "hidden",
              flexShrink:   0,
              border:       `2px solid ${agent.accentColor}40`,
              boxShadow:    `0 0 0 4px ${agent.accentColor}0C, 0 4px 16px rgba(0,0,0,0.12)`,
            }}>
              <Image
                src={agent.photo}
                alt={agent.name}
                width={80}
                height={80}
                style={{ objectFit: "cover", objectPosition: "top center", display: "block" }}
              />
            </div>
          ) : (
            <div style={{
              width:          80,
              height:         80,
              borderRadius:   "50%",
              flexShrink:     0,
              background:     `linear-gradient(145deg, ${agent.accentColor} 0%, ${agent.accentColor}AA 100%)`,
              border:         `2px solid ${agent.accentColor}40`,
              boxShadow:      `0 0 0 4px ${agent.accentColor}0C, 0 4px 16px rgba(0,0,0,0.12)`,
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
            }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xl"], fontWeight: T.wt.black, color: C.white, lineHeight: 1 }}>
                {agent.avatar}
              </span>
            </div>
          )}

          {/* Identity block */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Name + state chip */}
            <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: 3, flexWrap: "wrap" as const }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz["3xl"], fontWeight: T.wt.black, color: C.titleDeep, lineHeight: 1 }}>
                {agent.name}
              </span>
              <span style={{
                fontFamily:    T.mono,
                fontSize:      T.sz["2xs"],
                fontWeight:    T.wt.semibold,
                color:         st.chipColor,
                background:    st.chipBg,
                border:        `1px solid ${st.chipBorder}`,
                borderRadius:  R.pill,
                padding:       "2px 10px",
                letterSpacing: "0.05em",
                lineHeight:    1.6,
                flexShrink:    0,
              }}>
                {st.label}
              </span>
            </div>
            {/* Specialty — accent uppercase */}
            <div style={{
              fontFamily:    T.mono,
              fontSize:      T.sz.xs,
              fontWeight:    T.wt.semibold,
              color:         agent.accentColor,
              letterSpacing: "0.09em",
              textTransform: "uppercase" as const,
              marginBottom:  4,
            }}>
              {agent.specialty}
            </div>
            {/* Scope — muted inline */}
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, marginBottom: S[3] }}>
              {agent.operationalScope.join("  ·  ")}
            </div>
            {/* Stats — single compact metadata line */}
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, letterSpacing: "0.02em" }}>
              <span style={{ color: C.inkMid, fontWeight: T.wt.semibold }}>{agent.memoryCount}</span>{" patrones  ·  "}
              <span style={{ color: C.inkMid, fontWeight: T.wt.semibold }}>{agent.workflowCount}</span>{" workflows  ·  "}
              <span style={{ color: C.inkMid, fontWeight: T.wt.semibold }}>{agent.integrations.length}</span>{" integraciones  ·  "}
              <span style={{ color: C.inkMid, fontWeight: T.wt.semibold }}>{agent.capabilities.length}</span>{" capacidades"}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          2. OPERATIONAL STATUS STRIP
          Bloque F: subtle blue-tinted background for depth
      ══════════════════════════════════════════════════════════════════════════ */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:          S[2],
        padding:      `5px ${S[4]}px`,
        background:   "#F4F7FF",
        border:       `1px solid #DDE6F7`,
        borderRadius: R.md,
        marginBottom: S[3],
      }}>
        <span style={{
          width:        6,
          height:       6,
          borderRadius: "50%",
          background:   st.dotColor,
          display:      "inline-block",
          flexShrink:   0,
          boxShadow:    `0 0 0 2px ${st.dotColor}22`,
        }} />
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, flex: 1 }}>
          {st.stateText}
          {agent.integrations.length > 0 && `  ·  ${agent.integrations.join("  ·  ")}`}
        </span>
        <span style={{ fontFamily: T.mono, fontSize: 9, color: "#BBC8E6", letterSpacing: "0.06em" }}>
          AGENTIK OS
        </span>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          3. WORKSPACE TABS
          Bloque F: inset shadow for depth
      ══════════════════════════════════════════════════════════════════════════ */}
      <div style={{
        display:    "flex",
        gap:        2,
        background: C.surface,
        border:     `1px solid ${C.line}`,
        boxShadow:  "inset 0 1px 3px rgba(0,0,0,0.04)",
        borderRadius: R.card,
        padding:    3,
        marginBottom: S[4],
        overflowX:  "auto" as const,
      }}>
        {TABS.map(t => {
          const isActive = tab === t.id;
          return (
            <Link
              key={t.id}
              href={`${baseUrl}?tab=${t.id}`}
              style={{
                fontFamily:     T.mono,
                fontSize:       T.sz.xs,
                fontWeight:     isActive ? T.wt.semibold : T.wt.normal,
                color:          isActive ? (t.id === "overview" ? C.blueDark : C.ink) : C.inkMid,
                background:     isActive ? C.white : "transparent",
                border:         isActive ? `1px solid ${C.line}` : "1px solid transparent",
                borderRadius:   R.sm,
                padding:        `${S[1] + 2}px ${S[3] + 2}px`,
                textDecoration: "none",
                whiteSpace:     "nowrap" as const,
                boxShadow:      isActive ? E.sm : "none",
                letterSpacing:  "0.02em",
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          4. OVERVIEW
          Bloque C: left = description + capabilities + active modules
                    right = state + focus + scope + integrations (tonal bg)
          Bloque E: ultra-subtle chip tokens
          Bloque F: gradient + tonal column separation
      ══════════════════════════════════════════════════════════════════════════ */}
      {tab === "overview" && (
        <>
          {/* Two-column workspace surface */}
          <div style={{
            background:   "#ffffff",
            border:       `1px solid ${C.line}`,
            borderRadius: R.card,
            boxShadow:    E.xs,
            overflow:     "hidden",
            marginBottom: S[3],
          }}>
            <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr" }}>

              {/* ── Left: description + capabilities + modules ───────────────── */}
              <div style={{ padding: `${S[4]}px ${S[5]}px`, borderRight: `1px solid ${C.lineSubtle}` }}>

                {/* Overline */}
                <div style={{ ...overline, color: agent.accentColor, marginBottom: S[2] }}>
                  Resumen operacional
                </div>

                {/* Description — smaller for density */}
                <div style={{
                  fontFamily:   T.mono,
                  fontSize:     T.sz.sm,
                  color:        C.inkMid,
                  lineHeight:   1.65,
                  marginBottom: S[3],
                }}>
                  {agent.description}
                </div>

                {/* Thin divider */}
                <div style={{ height: 1, background: C.lineSubtle, marginBottom: S[3] }} />

                {/* Capabilities overline */}
                <div style={{ ...overline, marginBottom: S[2] }}>Responsabilidades</div>

                {/* Bloque E: capability chips — ultra-subtle tinted tokens */}
                <div style={{ display: "flex", flexWrap: "wrap" as const, gap: S[1] + 1, marginBottom: S[3] }}>
                  {agent.capabilities.map(cap => (
                    <span key={cap} style={{
                      fontFamily:   T.mono,
                      fontSize:     T.sz["2xs"],
                      color:        C.inkMid,
                      background:   `${agent.accentColor}0A`,
                      border:       `1px solid ${agent.accentColor}1E`,
                      borderRadius: R.md,
                      padding:      `2px ${S[2] + 2}px`,
                      lineHeight:   1.6,
                    }}>
                      {cap}
                    </span>
                  ))}
                </div>

                {/* Thin divider */}
                <div style={{ height: 1, background: C.lineSubtle, marginBottom: S[3] }} />

                {/* Active modules — compact horizontal row */}
                <div style={{ ...overline, marginBottom: S[2] }}>Módulos activos</div>
                <div style={{ display: "flex", flexWrap: "wrap" as const, gap: `${S[1]}px ${S[3]}px` }}>
                  {agent.modules.map(mod => {
                    const label = MODULE_LABELS[mod] ?? mod;
                    return (
                      <div key={mod} style={{ display: "flex", alignItems: "center", gap: S[1] + 1 }}>
                        <span style={{
                          width:        4,
                          height:       4,
                          borderRadius: "50%",
                          background:   agent.accentColor,
                          display:      "inline-block",
                          flexShrink:   0,
                        }} />
                        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>

              </div>

              {/* ── Right: state + focus + scope + integrations ──────────────── */}
              {/* Bloque F: tonal right column — subtle surface depth */}
              <div style={{
                padding:         `${S[4]}px`,
                background:      "#F8FAFC",
                display:         "flex",
                flexDirection:   "column" as const,
                gap:             S[3],
              }}>

                {/* Operational state — dot + label + focus text */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: 5 }}>
                    <span style={{
                      width:        8,
                      height:       8,
                      borderRadius: "50%",
                      background:   st.dotColor,
                      display:      "inline-block",
                      flexShrink:   0,
                      boxShadow:    `0 0 0 3px ${st.dotColor}1A`,
                    }} />
                    <span style={{
                      fontFamily: T.mono,
                      fontSize:   T.sz.sm,
                      fontWeight: T.wt.semibold,
                      color:      C.ink,
                    }}>
                      {st.stateText}
                    </span>
                  </div>
                  <div style={{
                    fontFamily:  T.mono,
                    fontSize:    T.sz.xs,
                    color:       C.inkLight,
                    lineHeight:  1.65,
                    paddingLeft: S[4] + 2,
                  }}>
                    {st.focusText}
                  </div>
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: C.lineSubtle }} />

                {/* Bloque E: scope chips — ultra-subtle institutional tokens */}
                <div>
                  <div style={{ ...overline, marginBottom: S[1] + 2 }}>Scope operativo</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
                    {agent.operationalScope.map(scope => (
                      <span key={scope} style={{
                        fontFamily:   T.mono,
                        fontSize:     T.sz["2xs"],
                        color:        "#2A5AC7",
                        background:   "#EEF3FF",
                        border:       `1px solid #C8D8F6`,
                        borderRadius: R.xs,
                        padding:      "2px 8px",
                        lineHeight:   1.6,
                      }}>
                        {scope}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Bloque E: integration tags — near-invisible border */}
                <div>
                  <div style={{ ...overline, marginBottom: S[1] + 2 }}>Integraciones</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
                    {agent.integrations.map(intg => (
                      <span key={intg} style={{
                        fontFamily:   T.mono,
                        fontSize:     T.sz["2xs"],
                        color:        C.inkMid,
                        background:   C.white,
                        border:       `1px solid #E2E8F0`,
                        borderRadius: R.xs,
                        padding:      "2px 8px",
                        lineHeight:   1.6,
                      }}>
                        {intg}
                      </span>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* ── Bloque D — Operational context feed ──────────────────────────── */}
          {signals.length > 0 && (
            <div style={{
              background:   C.white,
              border:       `1px solid ${C.line}`,
              borderRadius: R.card,
              overflow:     "hidden",
              boxShadow:    E.xs,
            }}>
              {/* Feed header */}
              <div style={{
                display:        "flex",
                alignItems:     "center",
                gap:            S[2],
                padding:        `${S[2] + 1}px ${S[4]}px`,
                background:     "#F8FAFC",
                borderBottom:   `1px solid ${C.lineSubtle}`,
              }}>
                <span style={{
                  width:        3,
                  height:       14,
                  background:   agent.accentColor,
                  borderRadius: 2,
                  display:      "inline-block",
                  flexShrink:   0,
                  opacity:      0.7,
                }} />
                <span style={{ ...overline }}>Contexto operacional</span>
                <span style={{
                  fontFamily:   T.mono,
                  fontSize:     T.sz["2xs"],
                  color:        C.inkGhost,
                  marginLeft:   "auto",
                  letterSpacing: "0.04em",
                }}>
                  {signals.length} entradas
                </span>
              </div>

              {/* Signal rows — connected feed, no individual borders */}
              {signals.map((signal, i) => (
                <div key={i} style={{
                  display:      "flex",
                  gap:          S[3],
                  padding:      `${S[2] + 2}px ${S[4]}px`,
                  borderBottom: i < signals.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
                  alignItems:   "flex-start",
                }}>
                  <span style={{
                    width:        5,
                    height:       5,
                    borderRadius: "50%",
                    background:   agent.accentColor,
                    display:      "inline-block",
                    flexShrink:   0,
                    marginTop:    5,
                    opacity:      0.55,
                  }} />
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, lineHeight: 1.6 }}>
                    {signal}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* ── Bloque E — Execution Layer ─────────────────────────────────────── */}
          <AgentExecutionLayer agent={agent} />
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          5. MEMORIA TAB
      ══════════════════════════════════════════════════════════════════════════ */}
      {tab === "memoria" && <AgentMemoryTab agent={agent} />}

      {/* ══════════════════════════════════════════════════════════════════════════
          6. CAPACIDADES TAB
      ══════════════════════════════════════════════════════════════════════════ */}
      {tab === "capacidades" && <AgentCapabilitiesTab agent={agent} />}

      {/* ══════════════════════════════════════════════════════════════════════════
          7. INTEGRACIONES TAB
      ══════════════════════════════════════════════════════════════════════════ */}
      {tab === "integraciones" && <AgentIntegrationsTab agent={agent} />}

      {/* ══════════════════════════════════════════════════════════════════════════
          9. PERSONALIDAD TAB
      ══════════════════════════════════════════════════════════════════════════ */}
      {tab === "personalidad" && <AgentPersonalityTab agent={agent} />}

      {/* ══════════════════════════════════════════════════════════════════════════
          10. WORKFLOWS TAB
      ══════════════════════════════════════════════════════════════════════════ */}
      {tab === "workflows" && <AgentWorkflowsTab agent={agent} />}

      {/* ══════════════════════════════════════════════════════════════════════════
          11. PLACEHOLDER — remaining tabs
      ══════════════════════════════════════════════════════════════════════════ */}
      {tab !== "overview" && tab !== "memoria" && tab !== "capacidades" && tab !== "integraciones" && tab !== "personalidad" && tab !== "workflows" && (
        <div style={{
          padding:      `${S[8]}px ${S[6]}px`,
          background:   C.surface,
          border:       `1px dashed ${C.line}`,
          borderRadius: R.xl,
          textAlign:    "center" as const,
        }}>
          <div style={{
            fontFamily:   T.mono,
            fontSize:     T.sz.md,
            fontWeight:   T.wt.semibold,
            color:        C.inkMid,
            marginBottom: S[2],
            letterSpacing: "0.01em",
          }}>
            {TABS.find(t => t.id === tab)?.label} — Foundation in progress
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
            Próxima iteración del Agent Workspace · Agentik OS
          </div>
        </div>
      )}

    </div>
  );
}
