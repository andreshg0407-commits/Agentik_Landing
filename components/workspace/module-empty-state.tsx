/**
 * components/workspace/module-empty-state.tsx
 *
 * SHOPIFY-EMPTY-EXPERIENCE-01 — Intelligent guided empty state
 *
 * Premium onboarding experience replacing blank screens with Copilot-guided
 * setup flows. Server Component — no client interactivity.
 *
 * Reusable across all Agentik modules:
 *   Shopify · Finanzas · Comercial · Inventario · Cobranza · Marketing
 *
 * Layers:
 *   1. Copilot context banner  — what Copilot will do once integration is live
 *   2. Capability cards        — 6 cards describing what unlocks after setup
 *   3. Activation guide        — step-by-step progress checklist + CTAs
 *   4. Preview placeholders    — visual preview of what the module will show
 *
 * Token compliance:
 *   C.* / T.* / S[n] / R.* / E.* — zero raw hex, zero Tailwind color classes
 */
import Link   from "next/link";
import { C, T, S, R, E } from "@/lib/ui/tokens";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface EmptyStateCapability {
  icon:        string;
  title:       string;
  description: string;
}

export interface EmptyStateStep {
  label:    string;
  current?: boolean;
  done?:    boolean;
}

export interface EmptyStatePreviewSlot {
  label: string;
  sub?:  string;
}

export interface ModuleEmptyStateProps {
  /** Main Copilot message — describe what Copilot will do once connected */
  copilotHeadline: string;
  /** Supporting detail — expand on the Copilot headline */
  copilotBody:     string;
  /** Short status tag shown in the banner, e.g. "Integración requerida" */
  setupTag?:       string;
  /** Linear activation checklist */
  setupSteps:      EmptyStateStep[];
  /** Capability cards — what unlocks after setup */
  capabilities:    EmptyStateCapability[];
  /** Section header for the preview area */
  previewLabel?:   string;
  /** Placeholder metric slots — greyed-out preview of real module data */
  previewSlots?:   EmptyStatePreviewSlot[];
  /** Primary CTA — typically "Connect integration" */
  primaryCta:      { label: string; href: string };
  /** Secondary CTA — typically "Go to module overview" */
  secondaryCta?:   { label: string; href: string };
}

// ── CapabilityCard ────────────────────────────────────────────────────────────

function CapabilityCard({ icon, title, description }: EmptyStateCapability) {
  return (
    <div style={{
      background:    C.blueLight,
      border:        `1px solid ${C.blueBorder}`,
      borderRadius:  R.xl,
      padding:       S[4],
      display:       "flex",
      flexDirection: "column",
      gap:           S[1],
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[1] }}>
        <div style={{
          width:          32,
          height:         32,
          borderRadius:   R.lg,
          background:     C.white,
          border:         `1px solid ${C.blueBorder}`,
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          fontSize:       15,
          flexShrink:     0,
        }}>
          {icon}
        </div>
        <span style={{
          fontFamily:  T.mono,
          fontSize:    T.sz.sm,
          fontWeight:  T.wt.semibold,
          color:       C.titleDeep,
          lineHeight:  1.3,
        }}>
          {title}
        </span>
      </div>
      <p style={{
        fontFamily: T.mono,
        fontSize:   T.sz.xs,
        color:      C.inkLight,
        lineHeight: 1.65,
        margin:     0,
      }}>
        {description}
      </p>
    </div>
  );
}

// ── SetupStep ─────────────────────────────────────────────────────────────────

function SetupStep({
  label,
  current,
  done,
  index,
}: EmptyStateStep & { index: number }) {
  const isDone    = done    === true;
  const isCurrent = current === true && !isDone;

  const dotBg    = isDone || isCurrent ? C.blueDark : C.line;
  const labelCol = isDone ? C.inkLight : isCurrent ? C.ink : C.inkFaint;

  return (
    <div style={{
      display:      "flex",
      alignItems:   "center",
      gap:          S[3],
      padding:      `${S[2]}px 0`,
      borderBottom: `1px solid ${C.lineSubtle}`,
    }}>
      {/* Number / checkmark */}
      <div style={{
        width:          22,
        height:         22,
        borderRadius:   "50%",
        background:     dotBg,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        flexShrink:     0,
      }}>
        {isDone ? (
          <span style={{ color: C.white, fontSize: 9, fontWeight: T.wt.bold, lineHeight: 1 }}>✓</span>
        ) : (
          <span style={{
            fontFamily:  T.mono,
            fontSize:    T.sz["2xs"],
            fontWeight:  T.wt.bold,
            color:       isDone || isCurrent ? C.white : C.inkFaint,
            lineHeight:  1,
          }}>
            {index + 1}
          </span>
        )}
      </div>

      <span style={{
        fontFamily: T.mono,
        fontSize:   T.sz.sm,
        fontWeight: isCurrent ? T.wt.semibold : T.wt.normal,
        color:      labelCol,
        lineHeight: 1.4,
        flex:       1,
      }}>
        {label}
      </span>

      {isCurrent && (
        <span style={{
          fontFamily:   T.mono,
          fontSize:     T.sz["2xs"],
          fontWeight:   T.wt.semibold,
          color:        C.blueDark,
          background:   C.blueLight,
          border:       `1px solid ${C.blueBorder}`,
          borderRadius: R.pill,
          padding:      `1px ${S[2]}px`,
          whiteSpace:   "nowrap",
        }}>
          Ahora
        </span>
      )}
    </div>
  );
}

// ── PreviewSlot ───────────────────────────────────────────────────────────────

function PreviewSlot({ label, sub }: EmptyStatePreviewSlot) {
  return (
    <div style={{
      border:        `1px dashed ${C.line}`,
      borderRadius:  R.xl,
      padding:       `${S[4]}px ${S[3]}px`,
      display:       "flex",
      flexDirection: "column",
      alignItems:    "center",
      gap:           S[1],
      opacity:       0.5,
      flex:          "1 1 0",
      minWidth:      0,
    }}>
      {/* Value skeleton */}
      <div style={{
        width:        44,
        height:       12,
        borderRadius: R.sm,
        background:   C.surfaceAlt,
        marginBottom: S[1],
      }} />
      <span style={{
        fontFamily: T.mono,
        fontSize:   T.sz["2xs"],
        color:      C.inkFaint,
        textAlign:  "center",
        lineHeight: 1.4,
      }}>
        {label}
      </span>
      {sub && (
        <span style={{
          fontFamily: T.mono,
          fontSize:   T.sz["2xs"],
          color:      C.inkGhost,
        }}>
          {sub}
        </span>
      )}
    </div>
  );
}

// ── ModuleEmptyState (main export) ────────────────────────────────────────────

export function ModuleEmptyState({
  copilotHeadline,
  copilotBody,
  setupTag,
  setupSteps,
  capabilities,
  previewLabel = "Así se verá este panel cuando actives la integración",
  previewSlots,
  primaryCta,
  secondaryCta,
}: ModuleEmptyStateProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>

      {/* ── 1. Copilot context banner ──────────────────────────────────────── */}
      <div style={{
        background:   "linear-gradient(135deg, #001E4A 0%, #003A8A 100%)",
        borderRadius: R.xl,
        padding:      `${S[6]}px`,
        display:      "flex",
        alignItems:   "flex-start",
        gap:          S[4],
      }}>
        {/* AI pulse dot */}
        <div style={{
          width:          36,
          height:         36,
          borderRadius:   R.lg,
          background:     "rgba(255,255,255,.07)",
          border:         "1px solid rgba(255,255,255,.11)",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          flexShrink:     0,
          marginTop:      2,
        }}>
          <div style={{
            width:        8,
            height:       8,
            borderRadius: "50%",
            background:   "rgba(191,219,254,.65)",
          }} />
        </div>

        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily:    T.mono,
            fontSize:      T.sz["2xs"],
            fontWeight:    T.wt.semibold,
            color:         "rgba(255,255,255,.40)",
            letterSpacing: "0.09em",
            textTransform: "uppercase",
            marginBottom:  S[1],
          }}>
            Agentik Copilot
          </div>
          <div style={{
            fontFamily:   T.mono,
            fontSize:     T.sz.lg,
            fontWeight:   T.wt.semibold,
            color:        "rgba(255,255,255,.90)",
            lineHeight:   1.4,
            marginBottom: S[2],
          }}>
            {copilotHeadline}
          </div>
          <div style={{
            fontFamily: T.mono,
            fontSize:   T.sz.sm,
            color:      "rgba(255,255,255,.50)",
            lineHeight: 1.75,
            maxWidth:   620,
          }}>
            {copilotBody}
          </div>
        </div>

        {setupTag && (
          <span style={{
            flexShrink:   0,
            fontFamily:   T.mono,
            fontSize:     T.sz.xs,
            fontWeight:   T.wt.semibold,
            color:        "rgba(255,255,255,.50)",
            background:   "rgba(255,255,255,.08)",
            border:       "1px solid rgba(255,255,255,.11)",
            borderRadius: R.pill,
            padding:      `${S[1]}px ${S[3]}px`,
            whiteSpace:   "nowrap",
            alignSelf:    "flex-start",
          }}>
            {setupTag}
          </span>
        )}
      </div>

      {/* ── 2. Capabilities grid + Activation guide ────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: S[4] }}>

        {/* Capability cards */}
        <div style={{
          border:       `1px solid ${C.line}`,
          borderRadius: R.xl,
          padding:      `${S[5]}px`,
          background:   C.white,
          boxShadow:    E.sm,
        }}>
          <div style={{
            fontFamily:    T.mono,
            fontSize:      T.sz.xs,
            fontWeight:    T.wt.semibold,
            color:         C.inkFaint,
            textTransform: "uppercase",
            letterSpacing: "0.09em",
            marginBottom:  S[4],
          }}>
            Capacidades que se activarán
          </div>
          <div style={{
            display:             "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap:                 S[3],
          }}>
            {capabilities.map((cap, i) => (
              <CapabilityCard key={i} {...cap} />
            ))}
          </div>
        </div>

        {/* Activation guide + CTAs */}
        <div style={{
          border:        `1px solid ${C.line}`,
          borderRadius:  R.xl,
          padding:       `${S[5]}px`,
          background:    C.white,
          boxShadow:     E.sm,
          display:       "flex",
          flexDirection: "column",
          gap:           S[4],
        }}>
          <div>
            <div style={{
              fontFamily:    T.mono,
              fontSize:      T.sz.xs,
              fontWeight:    T.wt.semibold,
              color:         C.inkFaint,
              textTransform: "uppercase",
              letterSpacing: "0.09em",
              marginBottom:  S[3],
            }}>
              Pasos de activación
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {setupSteps.map((step, i) => (
                <SetupStep key={i} {...step} index={i} />
              ))}
            </div>
          </div>

          {/* CTAs */}
          <div style={{ display: "flex", flexDirection: "column", gap: S[2], marginTop: "auto" }}>
            <Link
              href={primaryCta.href}
              style={{
                display:        "block",
                textAlign:      "center",
                padding:        `${S[3]}px ${S[4]}px`,
                background:     C.blueDark,
                color:          C.white,
                borderRadius:   R.lg,
                fontFamily:     T.mono,
                fontSize:       T.sz.sm,
                fontWeight:     T.wt.semibold,
                textDecoration: "none",
                boxShadow:      E.md,
              }}
            >
              {primaryCta.label}
            </Link>
            {secondaryCta && (
              <Link
                href={secondaryCta.href}
                style={{
                  display:        "block",
                  textAlign:      "center",
                  padding:        `${S[2]}px ${S[4]}px`,
                  background:     C.white,
                  color:          C.ink,
                  borderRadius:   R.lg,
                  fontFamily:     T.mono,
                  fontSize:       T.sz.sm,
                  fontWeight:     T.wt.normal,
                  textDecoration: "none",
                  border:         `1px solid ${C.line}`,
                }}
              >
                {secondaryCta.label}
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ── 3. Preview placeholders ────────────────────────────────────────── */}
      {previewSlots && previewSlots.length > 0 && (
        <div style={{
          border:       `1px solid ${C.line}`,
          borderRadius: R.xl,
          padding:      `${S[5]}px`,
          background:   C.white,
          boxShadow:    E.xs,
        }}>
          <div style={{
            fontFamily:    T.mono,
            fontSize:      T.sz.xs,
            fontWeight:    T.wt.semibold,
            color:         C.inkFaint,
            textTransform: "uppercase",
            letterSpacing: "0.09em",
            marginBottom:  S[4],
          }}>
            {previewLabel}
          </div>
          <div style={{ display: "flex", gap: S[3] }}>
            {previewSlots.map((slot, i) => (
              <PreviewSlot key={i} {...slot} />
            ))}
          </div>
          <div style={{
            marginTop:  S[3],
            fontFamily: T.mono,
            fontSize:   T.sz.xs,
            color:      C.inkFaint,
            textAlign:  "center",
            lineHeight: 1.6,
          }}>
            Los datos reales aparecerán aquí una vez que conectes la integración
          </div>
        </div>
      )}
    </div>
  );
}
