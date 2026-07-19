/**
 * components/marketing-studio/shared/ms-agent-signal.tsx
 *
 * MARKETING-STUDIO-UX-SYSTEM-01 — Shared Agent Signal Strip
 *
 * THE single implementation of the intelligence strip used across all
 * Marketing Studio modules. Replaces duplicated inline markup in:
 *   - Hub (TenantWorkspaceView)
 *   - Biblioteca
 *   - Catálogos
 *   - Shopify
 *
 * Variants:
 *   "dark"     → Luca / primary AI signal (deep blue)
 *   "positive" → Mila / commerce green signal
 *
 * No "use client" — renders as Server Component or Client Component.
 */

import { MS_SIGNAL } from "@/lib/marketing-studio/ms-design-system";
import { T, S, R }   from "@/lib/ui/tokens";

export interface MSAgentSignalProps {
  /** Primary message text */
  text:        string;
  /** Secondary / detail text */
  sub?:        string;
  /** Agent label shown on right: e.g. "Luca · IA" */
  agentLabel:  string;
  /** Visual variant */
  variant:     "dark" | "positive";
  /** Optional action link rendered on the right */
  action?:     { label: string; href: string };
  /** Additional container style overrides */
  style?:      React.CSSProperties;
}

export function MSAgentSignal({
  text, sub, agentLabel, variant, action, style,
}: MSAgentSignalProps) {
  const s = MS_SIGNAL[variant];

  return (
    <div style={{
      flex:         "1 1 auto",
      display:      "flex",
      alignItems:   "center",
      gap:          S[2],
      padding:      `${S[2]}px ${S[3]}px`,
      background:   s.background,
      borderRadius: R.md,
      border:       `1px solid ${s.borderColor}`,
      minWidth:     200,
      ...style,
    }}>
      <div style={{
        width: 7, height: 7, borderRadius: "50%",
        background: s.dot, flexShrink: 0,
      }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: T.mono, fontSize: T.sz.xs,
          fontWeight: T.wt.bold, color: s.textPrimary,
        }}>
          {text}
        </div>
        {sub && (
          <div style={{
            fontFamily: T.mono, fontSize: T.sz["2xs"],
            color: s.textSub, marginTop: 2,
          }}>
            {sub}
          </div>
        )}
      </div>

      {action ? (
        <a
          href={action.href}
          style={{
            fontFamily:   T.mono,
            fontSize:     T.sz["2xs"],
            fontWeight:   T.wt.bold,
            color:        s.actionColor,
            textDecoration: "none",
            padding:      `${S[1]}px ${S[3]}px`,
            background:   s.actionBg,
            border:       `1px solid ${s.actionBorder}`,
            borderRadius: R.md,
            flexShrink:   0,
            whiteSpace:   "nowrap" as const,
          }}
        >
          {action.label}
        </a>
      ) : (
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz["2xs"],
          fontWeight:    T.wt.bold,
          color:         s.agentLabel,
          textTransform: "uppercase" as const,
          letterSpacing: "0.06em",
          flexShrink:    0,
          whiteSpace:    "nowrap" as const,
        }}>
          {agentLabel}
        </span>
      )}
    </div>
  );
}
