/**
 * /[orgSlug]/agentik/agentes — AI Executive Roster
 *
 * Sprint: AGENTIK-AGENTS-ROSTER-FOUNDATION-01
 *
 * AI Workforce roster: operational profile view of all AI agents.
 * Enterprise OS layer — not a marketing page, not a bot list.
 *
 * PRINCIPLE (Operational Abstraction):
 *   Shows agent health, state, and scope in plain language.
 *   No traces, queues, telemetry, or raw metrics.
 *   Deep agent internals live in the individual agent workspace.
 *
 * Access: AGENTIK_ADMIN / SUPER_ADMIN only.
 * Data: static from agent registry — no DB queries.
 */

import { requireOrgAccess }           from "@/lib/auth/org-access";
import { C, T, S, R }                 from "@/lib/ui/tokens";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { AgentRosterCard }            from "@/components/agentik/agent-roster-card";
import { AGENTS, getAgentStateCounts } from "@/lib/copilot/agents";

// ── State chip visual config ───────────────────────────────────────────────────

const CHIP_STYLE = {
  active:     { bg: C.greenLight,  color: C.green,    border: C.greenBorder,  dot: C.green    },
  syncing:    { bg: C.blueLight,   color: C.blueDark, border: C.blueBorder,   dot: C.blueDark },
  degraded:   { bg: C.amberLight,  color: C.amberDark, border: C.amberBorder, dot: C.amber    },
  supervised: { bg: C.brandLight,  color: C.brand,    border: C.brandBorder,  dot: C.brand    },
  offline:    { bg: C.surface,     color: C.inkLight, border: C.line,         dot: C.inkGhost },
  learning:   { bg: C.blueLight,   color: C.blue,     border: C.blueBorder,   dot: C.blue     },
} as const;

const CHIP_LABELS = {
  active:     "Activos",
  syncing:    "Sincronizando",
  degraded:   "Degradados",
  supervised: "Supervisados",
  offline:    "Offline",
  learning:   "Aprendiendo",
} as const;

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AgentesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  await requireOrgAccess(orgSlug);

  // ── State summary ────────────────────────────────────────────────────────
  const counts = getAgentStateCounts();

  const systemHealthy =
    counts.degraded   === 0 &&
    counts.offline    === 0 &&
    counts.supervised === 0;

  const systemHealthLabel = systemHealthy
    ? "Sistema operando con normalidad"
    : counts.degraded   > 0 ? "Capacidades degradadas detectadas"
    : counts.supervised > 0 ? "Agentes en supervisión activa"
    : "Estado del sistema reducido";

  // Build chips — only show non-zero counts (active always shown)
  type StateKey = keyof typeof CHIP_STYLE;
  const orderedStates: StateKey[] = ["active", "syncing", "learning", "supervised", "degraded", "offline"];
  const visibleChips = orderedStates.filter(s => s === "active" || counts[s] > 0);

  return (
    <div style={{
      padding:   `${S[6]}px`,
      maxWidth:   1024,
      fontFamily: T.mono,
    }}>

      {/* ── ZONA A — Module Header ────────────────────────────────────────────── */}
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Agentik", href: `/${orgSlug}/agentik` },
          { label: "Agentes" },
        ]}
        title="Agentes"
        subtitle={`AI Workforce · ${AGENTS.length} entidades operativas`}
        status={systemHealthy ? "ok" : counts.degraded > 0 ? "warning" : "neutral"}
        statusLabel={
          systemHealthy
            ? "Todos operativos"
            : counts.degraded > 0
              ? `${counts.degraded} degradado${counts.degraded !== 1 ? "s" : ""}`
              : "En supervisión"
        }
      />

      {/* Agent state chips */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:          S[2],
        flexWrap:     "wrap" as const,
        marginBottom: S[5],
        marginTop:    -(S[3]),
      }}>
        {visibleChips.map(state => {
          const chip  = CHIP_STYLE[state];
          const count = counts[state];
          return (
            <div key={state} style={{
              display:      "flex",
              alignItems:   "center",
              gap:          5,
              background:   chip.bg,
              border:       `1px solid ${chip.border}`,
              borderRadius: R.pill,
              padding:      `3px ${S[3]}px`,
            }}>
              <span style={{
                width:        6,
                height:       6,
                borderRadius: "50%",
                background:   chip.dot,
                display:      "inline-block",
                flexShrink:   0,
              }} />
              <span style={{
                fontFamily:    T.mono,
                fontSize:      T.sz["2xs"],
                fontWeight:    T.wt.semibold,
                color:         chip.color,
                letterSpacing: "0.04em",
              }}>
                {count} {CHIP_LABELS[state]}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── ZONA B — System Health Strip ─────────────────────────────────────── */}
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
          background:   systemHealthy ? C.green : C.amber,
          display:      "inline-block",
          flexShrink:   0,
        }} />
        <span style={{
          fontFamily: T.mono,
          fontSize:   T.sz.xs,
          color:      C.inkLight,
          flex:       1,
        }}>
          {systemHealthLabel} · Sync: hace 4m
        </span>
      </div>

      {/* ── ZONA C — Roster List ─────────────────────────────────────────────── */}
      <div style={{
        display:       "flex",
        flexDirection: "column",
        gap:           S[3],
        marginBottom:  S[6],
      }}>
        {AGENTS.map(agent => (
          <AgentRosterCard key={agent.id} agent={agent} orgSlug={orgSlug} />
        ))}
      </div>

      {/* ── ZONA D — Footer placeholder ──────────────────────────────────────── */}
      <div style={{
        padding:        `${S[4]}px ${S[5]}px`,
        background:     C.surface,
        border:         `1px dashed ${C.line}`,
        borderRadius:   R.xl,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        gap:            S[2],
        flexWrap:       "wrap" as const,
      }}>
        <div>
          <div style={{
            fontFamily:    T.mono,
            fontSize:      T.sz.sm,
            fontWeight:    T.wt.semibold,
            color:         C.inkMid,
            marginBottom:  2,
            letterSpacing: "0.02em",
          }}>
            Próximas incorporaciones
          </div>
          <div style={{
            fontFamily: T.mono,
            fontSize:   T.sz.xs,
            color:      C.inkFaint,
          }}>
            Operaciones · RRHH · Gerencia · Logística
          </div>
        </div>
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz["2xs"],
          color:         C.inkGhost,
          letterSpacing: "0.04em",
        }}>
          En desarrollo
        </span>
      </div>

    </div>
  );
}
