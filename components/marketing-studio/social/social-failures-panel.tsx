"use client";

/**
 * components/marketing-studio/social/social-failures-panel.tsx
 *
 * MS-16 — Social Runtime: Failure grouping by type with recovery hints.
 */

import { C, T, S }               from "@/lib/ui/tokens";
import { getSocialFailureLabel }  from "@/lib/marketing-studio/social/social-display";
import type { SocialFailureType } from "@/lib/marketing-studio/social/social-types";

interface FailureGroup {
  failureType:  SocialFailureType;
  count:        number;
  recoveryHint: string;
}

interface Props { failedByType: FailureGroup[] }

const FAILURE_SEVERITY: Record<string, string> = {
  auth_failure:       "critical",
  network_failure:    "warning",
  rate_limit:         "warning",
  invalid_media:      "default",
  caption_error:      "default",
  platform_rejection: "critical",
  timeout:            "warning",
  unknown:            "muted",
};

const FAILURE_ICON: Record<string, string> = {
  auth_failure:       "🔐",
  network_failure:    "📡",
  rate_limit:         "⏱",
  invalid_media:      "🖼",
  caption_error:      "✏️",
  platform_rejection: "🚫",
  timeout:            "⌛",
  unknown:            "?",
};

export function SocialFailuresPanel({ failedByType }: Props) {
  if (failedByType.length === 0) {
    return (
      <div style={{ padding: `${S[4]}px 0` }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.green }}>
          Sin fallos activos
        </span>
      </div>
    );
  }

  return (
    <div className="ag-op-table">
      <div className="ag-op-row" style={{ background: C.surfaceAlt }}>
        {["Tipo de fallo", "Cant.", "Acción de recuperación"].map(h => (
          <span key={h} style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, fontWeight: 600 }}>
            {h}
          </span>
        ))}
      </div>

      {failedByType.map(group => {
        const variant = FAILURE_SEVERITY[group.failureType] ?? "default";
        const icon    = FAILURE_ICON[group.failureType] ?? "?";

        return (
          <div key={group.failureType} className="ag-op-row ag-social-failure-row">
            {/* Type */}
            <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
              <span style={{ fontSize: T.sz.xs }}>{icon}</span>
              <span className={`ag-op-status ag-op-status--${variant}`}>
                {getSocialFailureLabel(group.failureType)}
              </span>
            </div>

            {/* Count */}
            <span style={{
              fontFamily:  T.mono,
              fontSize:    T.sz.sm,
              fontWeight:  700,
              color:       group.count >= 3 ? C.red : group.count >= 1 ? C.amber : C.green,
            }}>
              {group.count}
            </span>

            {/* Recovery hint */}
            <span style={{
              fontFamily:   T.mono,
              fontSize:     T.sz.xs,
              color:        C.inkMid,
              overflow:     "hidden",
              textOverflow: "ellipsis",
              whiteSpace:   "nowrap",
            }}>
              {group.recoveryHint}
            </span>
          </div>
        );
      })}

      {/* Summary bar */}
      <div className="ag-op-row" style={{ background: C.surfaceAlt, borderTop: `1px solid ${C.line}` }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
          {failedByType.reduce((s, g) => s + g.count, 0)} fallos totales · {failedByType.length} tipos distintos
        </span>
        <span />
        <span />
      </div>
    </div>
  );
}
