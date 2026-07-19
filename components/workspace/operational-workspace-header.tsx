import Link from "next/link";
import { C, T, S, R } from "@/lib/ui/tokens";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export type StatusSignal = "ok" | "warning" | "critical" | "neutral";

const SIGNAL: Record<StatusSignal, { dot: string; text: string }> = {
  ok:       { dot: "#22c55e",  text: C.green     },
  warning:  { dot: "#f59e0b",  text: C.amber     },
  critical: { dot: "#ef4444",  text: C.red       },
  neutral:  { dot: C.inkGhost, text: C.inkLight  },
};

interface Props {
  breadcrumbs:          BreadcrumbItem[];
  /** When omitted, only breadcrumbs render (Agent Workspaces where the Executive Header is the title anchor). */
  title?:               string;
  subtitle?:            string;
  status?:              StatusSignal;
  statusLabel?:         string;
  /** URL to navigate back to (derived from ?returnTo= param) */
  contextualBackHref?:  string;
  /** Human label for the back link (e.g. "Cobros identificados") */
  contextualBackLabel?: string;
}

export function OperationalWorkspaceHeader({
  breadcrumbs,
  title,
  subtitle,
  status = "neutral",
  statusLabel,
  contextualBackHref,
  contextualBackLabel,
}: Props) {
  const sig = SIGNAL[status];

  return (
    <div style={{ marginBottom: title ? S[6] : S[3] }}>
      {/* Contextual back link — shown when navigating from another workspace */}
      {contextualBackHref && contextualBackLabel && (
        <div style={{ marginBottom: S[2] }}>
          <Link href={contextualBackHref} className="ag-context-back" style={{
            fontFamily:     T.mono,
            fontSize:       T.sz.xs,
            color:          C.blueDark,
            textDecoration: "none",
            display:        "inline-flex",
            alignItems:     "center",
            gap:            4,
          }}>
            <span style={{ fontSize: "0.7em" }}>←</span>
            {contextualBackLabel}
          </Link>
        </div>
      )}
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" style={{
        display:      "flex",
        alignItems:   "center",
        gap:          6,
        marginBottom: title ? S[3] : 0,
        flexWrap:     "wrap" as const,
      }}>
        {breadcrumbs.map((crumb, i) => (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {i > 0 && (
              <span style={{
                fontFamily: T.mono,
                fontSize:   T.sz.xs,
                color:      C.inkGhost,
              }}>›</span>
            )}
            {crumb.href ? (
              <Link href={crumb.href} className="ag-breadcrumb-link" style={{
                fontFamily:     T.mono,
                fontSize:       T.sz.xs,
                color:          i === breadcrumbs.length - 1 ? C.inkMid : C.blueDark,
                textDecoration: "none",
                fontWeight:     i === breadcrumbs.length - 1 ? T.wt.semibold : T.wt.normal,
              }}>
                {crumb.label}
              </Link>
            ) : (
              <span style={{
                fontFamily: T.mono,
                fontSize:   T.sz.xs,
                color:      i === breadcrumbs.length - 1 ? C.inkMid : C.inkFaint,
                fontWeight: i === breadcrumbs.length - 1 ? T.wt.semibold : T.wt.normal,
              }}>
                {crumb.label}
              </span>
            )}
          </span>
        ))}
      </nav>

      {/* Title row + optional status badge — omitted for breadcrumb-only mode */}
      {title && (
        <div style={{
          display:        "flex",
          alignItems:     "flex-start",
          justifyContent: "space-between",
          flexWrap:       "wrap" as const,
          gap:            S[2],
        }}>
          <div>
            <h1 style={{
              fontFamily:   T.mono,
              fontSize:     T.sz["2xl"],
              fontWeight:   T.wt.bold,
              color:        C.ink,
              margin:       0,
              marginBottom: subtitle ? S[1] : 0,
              lineHeight:   1.2,
            }}>
              {title}
            </h1>
            {subtitle && (
              <div style={{
                fontFamily: T.mono,
                fontSize:   T.sz.sm,
                color:      C.inkLight,
                lineHeight: 1.5,
              }}>
                {subtitle}
              </div>
            )}
          </div>

          {statusLabel && (
            <div style={{
              display:      "flex",
              alignItems:   "center",
              gap:          S[1],
              padding:      `4px ${S[2]}px`,
              background:   C.surface,
              border:       `1px solid ${C.line}`,
              borderRadius: R.pill,
              flexShrink:   0,
            }}>
              <span style={{
                width:        7,
                height:       7,
                borderRadius: "50%",
                background:   sig.dot,
                display:      "inline-block",
                flexShrink:   0,
              }} />
              <span style={{
                fontFamily: T.mono,
                fontSize:   T.sz["2xs"],
                fontWeight: T.wt.semibold,
                color:      sig.text,
              }}>
                {statusLabel}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
