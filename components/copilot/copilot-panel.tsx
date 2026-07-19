"use client";

/**
 * components/copilot/copilot-panel.tsx
 *
 * Agentik Copilot — Agent Office Panel
 * Sprint: AGENTIK-COPILOT-CARD-EXPERIENCE-01
 *
 * Single component. Two official variants:
 *   "app"       — compact, app-like experience (mobile-first, right-rail default)
 *   "workspace" — desktop-first, 2-col grid, wider cards, real breathing room
 *
 * Layout (both variants):
 *   1. CopilotOfficeHeader   — agent identity + context
 *   2. CopilotAgentChat      — conversation opening (always visible, protagonist)
 *   3. OfficeStatusBlock     — "Diego está trabajando en: ✓ item1 ✓ item2"
 *   4. SummaryCardsGrid      — 8 premium cards (doorways to work areas)
 *   5. PanelFooter           — snapshot timestamp
 *   6. CopilotDrawer         — absolute overlay (slide-in per card)
 *
 * Architecture: UI depends exclusively on CopilotViewModel. Nothing else.
 */

import { useState, useEffect }      from "react";
import { C, T, S, R, E }           from "@/lib/ui/tokens";
import type { CopilotViewModel }    from "@/lib/copilot/viewmodel";
import { resolveSectionLabels }     from "@/lib/copilot/language";
import type {
  LanguageModule,
  AgentSectionLabels,
}                                   from "@/lib/copilot/language";
import { CopilotOfficeHeader }      from "./copilot-office-header";
import { CopilotAgentChat }         from "./copilot-agent-chat";
import { CopilotDrawer }            from "./copilot-drawer";
import type { DrawerCategory }      from "./copilot-drawer";
import type { CopilotNavigationTarget } from "@/lib/copilot/navigation/copilot-navigation";

// ── Variant ───────────────────────────────────────────────────────────────────

/**
 * Visual variant of CopilotPanel.
 * "app"       — compact, app-like, mobile-first. Right-rail default.
 * "workspace" — desktop-first, 2-col grid, more breathing room.
 */
export type CopilotPanelVariant = "app" | "workspace";

// ── Props ─────────────────────────────────────────────────────────────────────

interface CopilotPanelProps {
  viewModel:    CopilotViewModel;
  /** Visual variant. Defaults to "app". */
  variant?:     CopilotPanelVariant;
  isPreview?:   boolean;
  /** Forces 1-column card layout. Only meaningful in "app" variant. */
  compact?:     boolean;
  className?:   string;
  /**
   * Navigation callback — receives destination ID when a CTA is pressed.
   * Default: console.log stub. Next sprint: connect router.push().
   */
  onNavigate?:  (target: CopilotNavigationTarget) => void;
}

// ── Card config ───────────────────────────────────────────────────────────────

interface CardConfig {
  category:    DrawerCategory;
  label:       string;
  count:       number;
  /** Primary accent — badge, CTA, icon stroke, hover border. */
  accentColor: string;
  /** Light tint for the icon box background. */
  iconBg:      string;
  /** Humanized empty state label. */
  emptyLabel:  string;
  /** CTA label (arrow appended by renderer). */
  ctaLabel:    string;
  /** Pre-computed count description. */
  countLabel:  string;
  /** Up to 3 preview titles from ViewModel data. */
  preview:     string[];
}

function buildCards(
  viewModel: CopilotViewModel,
  sections:  AgentSectionLabels,
): CardConfig[] {
  const attn    = viewModel.attentionItems;
  const hasCrit = attn.some(a => a.severity === "critical");
  const aw      = viewModel.activeWork       ?? [];
  const pa      = viewModel.pendingApprovals ?? [];
  const cw      = viewModel.completedWork    ?? [];
  const fw      = viewModel.followups        ?? [];
  const su      = viewModel.suggestions;
  const op      = viewModel.opportunities;
  const ins     = viewModel.insights;

  return [
    {
      category:    "attention",
      label:       sections.attentionItems,
      count:       attn.length,
      accentColor: hasCrit ? C.red : C.amber,
      iconBg:      hasCrit ? C.redLight : C.amberLight,
      emptyLabel:  "Todo en orden",
      ctaLabel:    "Revisar ahora",
      countLabel:  attn.length === 1
        ? "1 elemento por revisar"
        : `${attn.length} elementos por revisar`,
      preview: attn.slice(0, 3).map(a => a.title),
    },
    {
      category:    "activeWork",
      label:       sections.activeWork,
      count:       aw.length,
      accentColor: C.blueDark,
      iconBg:      C.blueLight,
      emptyLabel:  "Sin actividad activa",
      ctaLabel:    "Ver progreso",
      countLabel:  aw.length === 1
        ? "1 proceso activo"
        : `${aw.length} procesos activos`,
      preview: aw.slice(0, 3).map(w => w.title),
    },
    {
      category:    "pendingApprovals",
      label:       sections.pendingApprovals,
      count:       pa.length,
      accentColor: C.amber,
      iconBg:      C.amberLight,
      emptyLabel:  "Sin pendientes de aprobación",
      ctaLabel:    "Revisar aprobaciones",
      countLabel:  pa.length === 1
        ? "1 acción en espera"
        : `${pa.length} acciones en espera`,
      preview: pa.slice(0, 3).map(p => p.action),
    },
    {
      category:    "suggestions",
      label:       sections.suggestions,
      count:       su.length,
      accentColor: C.brand,
      iconBg:      C.brandLight,
      emptyLabel:  "Sin recomendaciones activas",
      ctaLabel:    "Explorar recomendaciones",
      countLabel:  su.length === 1
        ? "1 recomendación"
        : `${su.length} recomendaciones`,
      preview: su.slice(0, 3).map(s => s.title),
    },
    {
      category:    "opportunities",
      label:       sections.opportunities,
      count:       op.length,
      accentColor: C.green,
      iconBg:      C.greenLight,
      emptyLabel:  "Sin oportunidades detectadas",
      ctaLabel:    "Ver oportunidades",
      countLabel:  op.length === 1
        ? "1 oportunidad"
        : `${op.length} oportunidades`,
      preview: op.slice(0, 3).map(o => o.title),
    },
    {
      category:    "followups",
      label:       sections.followups,
      count:       fw.length,
      accentColor: C.blue,
      iconBg:      C.blueLight,
      emptyLabel:  "Sin seguimientos programados",
      ctaLabel:    "Ver agenda",
      countLabel:  fw.length === 1
        ? "1 seguimiento"
        : `${fw.length} seguimientos`,
      preview: fw.slice(0, 3).map(f => f.title),
    },
    {
      category:    "recentActivity",
      label:       sections.completedWork,
      count:       cw.length,
      accentColor: C.green,
      iconBg:      C.greenLight,
      emptyLabel:  "Sin actividad reciente",
      ctaLabel:    "Ver actividad",
      countLabel:  cw.length === 1
        ? "1 tarea completada"
        : `${cw.length} tareas completadas`,
      preview: cw.slice(0, 3).map(c => c.title),
    },
    {
      category:    "insights",
      label:       sections.insights,
      count:       ins.length,
      accentColor: C.blue,
      iconBg:      C.blueLight,
      emptyLabel:  "Sin hallazgos para este contexto",
      ctaLabel:    "Ver hallazgos",
      countLabel:  ins.length === 1
        ? "1 hallazgo"
        : `${ins.length} hallazgos`,
      preview: ins.slice(0, 3).map(i => i.title),
    },
  ];
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CopilotPanel({
  viewModel,
  variant    = "app",
  isPreview  = false,
  compact    = false,
  className,
  onNavigate,
}: CopilotPanelProps) {
  const [activeDrawer, setActiveDrawer] = useState<DrawerCategory | null>(null);

  if (!viewModel.isReady || !viewModel.leadAgent) {
    return <CopilotEmptyState module={viewModel.module} className={className} />;
  }

  const agentId  = viewModel.leadAgent.agentId;
  const pathSegs = (viewModel.module ?? "").split("/").filter(Boolean);
  const moduleId = (pathSegs[pathSegs.length - 1] ?? pathSegs[0]) as LanguageModule | undefined;
  const sections = resolveSectionLabels({ agentId, moduleId });

  const cards = buildCards(viewModel, sections);

  const drawerWidth = variant === "workspace" ? 420 : "100%";

  return (
    <div
      className={className}
      style={{
        display:       "flex",
        flexDirection: "column" as const,
        background:    C.white,
        border:       `1px solid ${C.line}`,
        borderRadius:  variant === "workspace" ? R.xl : R.lg,
        overflow:     "hidden",
        boxShadow:     variant === "workspace" ? E.lg : E.md,
        position:     "relative",
      }}
    >
      {/* ── 1. Agent Office Header ──────────────────────────────────────── */}
      <CopilotOfficeHeader
        leadAgent={viewModel.leadAgent}
        supportAgents={viewModel.supportAgents}
        summary={viewModel.summary}
        module={viewModel.module}
        isPreview={isPreview}
      />

      {/* ── 2. Agent Chat ───────────────────────────────────────────────── */}
      <CopilotAgentChat
        leadAgent={viewModel.leadAgent}
        summary={viewModel.summary}
      />

      {/* ── 3. Office Status Block ──────────────────────────────────────── */}
      <OfficeStatusBlock viewModel={viewModel} variant={variant} />

      {/* ── 4. Summary Cards Grid ───────────────────────────────────────── */}
      <SummaryCardsGrid
        cards={cards}
        variant={variant}
        compact={compact}
        onOpen={setActiveDrawer}
      />

      {/* ── 5. Footer ───────────────────────────────────────────────────── */}
      <PanelFooter generatedAt={viewModel.generatedAt} variant={variant} />

      {/* ── 6. Drawer overlay ───────────────────────────────────────────── */}
      <CopilotDrawer
        isOpen={activeDrawer !== null}
        category={activeDrawer}
        viewModel={viewModel}
        sections={sections}
        drawerWidth={drawerWidth}
        onClose={() => setActiveDrawer(null)}
        onNavigate={onNavigate}
      />
    </div>
  );
}

// ── Office Status Block ────────────────────────────────────────────────────────

function OfficeStatusBlock({
  viewModel,
  variant,
}: {
  viewModel: CopilotViewModel;
  variant:   CopilotPanelVariant;
}) {
  const agentName  = viewModel.leadAgent?.agentName ?? "El agente";
  const activeWork = viewModel.activeWork ?? [];
  const topItems   = activeWork.slice(0, 3);
  const isWs       = variant === "workspace";

  return (
    <div style={{
      padding:       `${isWs ? S[3] : S[2] + 2}px ${isWs ? S[5] : S[4]}px`,
      borderBottom:  `1px solid ${C.line}`,
      background:     C.surface,
      display:       "flex",
      flexDirection: "column" as const,
      gap:            isWs ? S[2] : S[1],
    }}>
      <span style={{
        fontFamily:    T.mono,
        fontSize:      T.sz.xs,
        fontWeight:    T.wt.semibold,
        color:         C.inkFaint,
        textTransform: "uppercase" as const,
        letterSpacing: "0.06em",
      }}>
        {agentName} · estado actual
      </span>

      {topItems.length === 0 ? (
        <span style={{
          fontFamily: T.mono,
          fontSize:   T.sz.base,
          color:      C.inkFaint,
        }}>
          Sin actividad activa en este momento.
        </span>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" as const, gap: isWs ? S[1] + 2 : 2 }}>
          {topItems.map(item => (
            <div key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: S[1] }}>
              <span style={{
                fontFamily: T.mono,
                fontSize:   T.sz.sm,
                color:      C.green,
                flexShrink: 0,
                lineHeight: "18px",
              }}>
                ✓
              </span>
              <span style={{
                fontFamily: T.mono,
                fontSize:   isWs ? T.sz.md : T.sz.base,
                color:      C.inkMid,
                lineHeight: 1.5,
              }}>
                {item.title}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Summary Cards Grid ────────────────────────────────────────────────────────

function SummaryCardsGrid({
  cards,
  variant,
  compact,
  onOpen,
}: {
  cards:   CardConfig[];
  variant: CopilotPanelVariant;
  compact: boolean;
  onOpen:  (cat: DrawerCategory) => void;
}) {
  const [hovered, setHovered] = useState<DrawerCategory | null>(null);
  const isWs = variant === "workspace";

  // Workspace: 2 columns — matches the reference image and feels premium.
  // App: 2 columns default, 1 when compact flag is set.
  const cols =
    compact   ? "1fr"
    : isWs    ? "1fr 1fr"
    :           "1fr 1fr";

  const gap = isWs ? S[3] : S[2];
  const pad = isWs ? S[4] : S[3];

  return (
    <div style={{
      display:             "grid",
      gridTemplateColumns:  cols,
      gap:                  gap,
      padding:              pad,
      background:           C.surface,
    }}>
      {cards.map(card => (
        <SummaryCard
          key={card.category}
          config={card}
          variant={variant}
          isHovered={hovered === card.category}
          onMouseEnter={() => setHovered(card.category)}
          onMouseLeave={() => setHovered(null)}
          onClick={() => onOpen(card.category)}
        />
      ))}
    </div>
  );
}

// ── Card Icon SVGs ─────────────────────────────────────────────────────────────

function CardIcon({
  category,
  color,
}: {
  category: DrawerCategory;
  color:    string;
}) {
  const sz  = 18;
  const str = { stroke: color, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const base = { width: sz, height: sz, viewBox: "0 0 24 24", fill: "none", display: "block" as const };

  switch (category) {
    case "attention":
      return (
        <svg {...base}>
          <path {...str} d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line {...str} x1="12" y1="9" x2="12" y2="13" />
          <line {...str} x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    case "activeWork":
      return (
        <svg {...base}>
          <polyline {...str} points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      );
    case "pendingApprovals":
      return (
        <svg {...base}>
          <circle {...str} cx="12" cy="12" r="10" />
          <polyline {...str} points="12 6 12 12 16 14" />
        </svg>
      );
    case "suggestions":
      return (
        <svg {...base}>
          <line {...str} x1="9" y1="18" x2="15" y2="18" />
          <line {...str} x1="10" y1="22" x2="14" y2="22" />
          <path {...str} d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1.3.59 2.46 1.5 3.5.76.76 1.23 1.52 1.41 2.5" />
        </svg>
      );
    case "opportunities":
      return (
        <svg {...base}>
          <polyline {...str} points="23 6 13.5 15.5 8.5 10.5 1 18" />
          <polyline {...str} points="17 6 23 6 23 12" />
        </svg>
      );
    case "followups":
      return (
        <svg {...base}>
          <rect {...str} x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line {...str} x1="16" y1="2" x2="16" y2="6" />
          <line {...str} x1="8" y1="2" x2="8" y2="6" />
          <line {...str} x1="3" y1="10" x2="21" y2="10" />
        </svg>
      );
    case "recentActivity":
      return (
        <svg {...base}>
          <path {...str} d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline {...str} points="22 4 12 14.01 9 11.01" />
        </svg>
      );
    case "insights":
      return (
        <svg {...base}>
          <circle {...str} cx="11" cy="11" r="8" />
          <line {...str} x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      );
    default:
      return null;
  }
}

// ── Summary Card ──────────────────────────────────────────────────────────────

function SummaryCard({
  config,
  variant,
  isHovered,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: {
  config:       CardConfig;
  variant:      CopilotPanelVariant;
  isHovered:    boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick:      () => void;
}) {
  const isEmpty    = config.count === 0;
  const isWs       = variant === "workspace";
  const iconBoxSz  = isWs ? 40 : 34;
  const previewCap = isWs ? 3 : 2;

  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        display:       "flex",
        flexDirection: "column" as const,
        gap:           isWs ? S[2] + 2 : S[2],
        padding:       isWs ? S[4] : S[3],
        background:    C.white,
        border:       `1px solid ${isHovered && !isEmpty ? config.accentColor : C.line}`,
        borderRadius:  isWs ? R.lg : R.md,
        boxShadow:     isHovered ? E.md : E.xs,
        cursor:        "pointer",
        transform:     isHovered ? "translateY(-2px)" : "translateY(0)",
        transition:   "border-color 160ms ease, transform 160ms ease, box-shadow 160ms ease",
        minWidth:      0,
        overflow:      "hidden",
      }}
    >
      {/* ── Icon + Title row ──────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: S[2], minWidth: 0 }}>
        {/* Icon box */}
        <div style={{
          width:           iconBoxSz,
          height:          iconBoxSz,
          borderRadius:    isWs ? R.md : R.sm,
          background:      isEmpty ? C.surfaceAlt : config.iconBg,
          display:         "flex",
          alignItems:      "center",
          justifyContent:  "center",
          flexShrink:      0,
          transition:     "background 160ms ease",
        }}>
          <CardIcon
            category={config.category}
            color={isEmpty ? C.inkGhost : config.accentColor}
          />
        </div>

        {/* Title + count badge */}
        <div style={{ display: "flex", flexDirection: "column" as const, minWidth: 0, flex: 1, gap: 3 }}>
          <div style={{ display: "flex", alignItems: "center", gap: S[1], justifyContent: "space-between" }}>
            <span style={{
              fontFamily:   T.mono,
              fontSize:     isWs ? T.sz.md : T.sz.base,
              fontWeight:   T.wt.bold,
              color:        isEmpty ? C.inkFaint : C.ink,
              overflow:     "hidden",
              whiteSpace:   "nowrap" as const,
              textOverflow: "ellipsis",
              lineHeight:   1.3,
            }}>
              {config.label}
            </span>
            {config.count > 0 && (
              <span style={{
                fontFamily:   T.mono,
                fontSize:     T.sz.xs,
                fontWeight:   T.wt.semibold,
                color:        C.white,
                background:   config.accentColor,
                borderRadius: R.pill,
                padding:     "2px 7px",
                flexShrink:   0,
                lineHeight:   1.5,
              }}>
                {config.count}
              </span>
            )}
          </div>

          {/* Status / count description */}
          <span style={{
            fontFamily:   T.mono,
            fontSize:     T.sz.xs,
            fontWeight:   isEmpty ? T.wt.normal : T.wt.medium,
            color:        isEmpty ? C.inkGhost : C.inkLight,
            lineHeight:   1.4,
            overflow:     "hidden",
            whiteSpace:   "nowrap" as const,
            textOverflow: "ellipsis",
          }}>
            {isEmpty ? config.emptyLabel : config.countLabel}
          </span>
        </div>
      </div>

      {/* ── Divider + Preview ─────────────────────────────────────────────── */}
      {!isEmpty && config.preview.length > 0 && (
        <>
          <div style={{ height: 1, background: C.lineSubtle }} />
          <div style={{ display: "flex", flexDirection: "column" as const, gap: isWs ? 4 : 3 }}>
            {config.preview.slice(0, previewCap).map((line, i) => (
              <span
                key={i}
                style={{
                  fontFamily:   T.mono,
                  fontSize:     isWs ? T.sz.sm : T.sz.xs,
                  color:        C.inkLight,
                  overflow:     "hidden",
                  whiteSpace:   "nowrap" as const,
                  textOverflow: "ellipsis",
                  lineHeight:   1.4,
                }}
              >
                {line}
              </span>
            ))}
          </div>
        </>
      )}

      {/* ── CTA — always visible in accent color when non-empty ──────────── */}
      <span style={{
        fontFamily: T.mono,
        fontSize:   T.sz.xs,
        fontWeight: T.wt.semibold,
        color:      isEmpty ? C.inkGhost : config.accentColor,
        marginTop:  (!isEmpty && config.preview.length > 0) ? 0 : "auto",
        lineHeight: 1,
      }}>
        {isEmpty ? "Sin elementos" : `${config.ctaLabel} →`}
      </span>
    </div>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────

function PanelFooter({
  generatedAt,
  variant,
}: {
  generatedAt: Date;
  variant:     CopilotPanelVariant;
}) {
  // Defer locale-dependent formatting to post-mount only.
  // toLocaleTimeString("es-CO") produces different output on the Node.js server
  // (locale may not be available) vs the browser — causing a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const time = mounted
    ? generatedAt.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })
    : "";

  const px = variant === "workspace" ? S[5] : S[4];

  return (
    <div style={{
      display:        "flex",
      alignItems:     "center",
      justifyContent: "flex-end",
      padding:        `${S[1] + 2}px ${px}px`,
      borderTop:      `1px solid ${C.line}`,
      background:      C.surface,
    }}>
      <span
        style={{
          fontFamily: T.mono,
          fontSize:   T.sz.xs,
          color:      C.inkFaint,
        }}
        suppressHydrationWarning
      >
        Contexto generado{mounted ? ` · ${time}` : ""}
      </span>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function CopilotEmptyState({
  module,
  className,
}: {
  module:     string;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        display:        "flex",
        flexDirection:  "column" as const,
        alignItems:     "center",
        justifyContent: "center",
        gap:             S[2],
        padding:         S[6],
        background:      C.surface,
        border:         `1px solid ${C.line}`,
        borderRadius:    R.lg,
        textAlign:      "center",
      }}
    >
      <span style={{
        width:        8,
        height:       8,
        borderRadius: R.pill,
        background:   C.inkFaint,
        display:      "block",
        margin:       "0 auto",
      }} />
      <span style={{
        fontFamily: T.mono,
        fontSize:   T.sz.base,
        color:      C.inkFaint,
      }}>
        Agentik no ha resuelto contexto para {module || "este módulo"}
      </span>
    </div>
  );
}
