import Link from "next/link";
import { C, T, S, R, E } from "@/lib/ui/tokens";

export interface RelatedWorkspace {
  label:        string;
  description?: string;
  href:         string;
  accent?:      string;
}

interface Props {
  items:  RelatedWorkspace[];
  title?: string;
}

export function RelatedWorkspaces({ items, title = "Ir a" }: Props) {
  return (
    <div style={{ marginTop: S[6] }}>
      <div style={{
        fontFamily:    T.mono,
        fontSize:      T.sz["2xs"],
        fontWeight:    T.wt.bold,
        color:         C.inkFaint,
        textTransform: "uppercase" as const,
        letterSpacing: "0.06em",
        marginBottom:  S[2],
      }}>
        {title}
      </div>
      <div style={{
        display:             "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        gap:                 S[2],
      }}>
        {items.map((item, i) => (
          <Link
            key={i}
            href={item.href}
            className="ag-flow-card"
            style={{
              display:        "flex",
              flexDirection:  "column" as const,
              gap:            2,
              padding:        `${S[2]}px ${S[3]}px`,
              background:     C.white,
              border:         `1px solid ${C.line}`,
              borderLeft:     `3px solid ${item.accent ?? C.blue}`,
              borderRadius:   R.md,
              textDecoration: "none",
              boxShadow:      E.xs,
            }}
          >
            <span style={{
              fontFamily: T.mono,
              fontSize:   T.sz.xs,
              fontWeight: T.wt.semibold,
              color:      C.ink,
            }}>
              {item.label} →
            </span>
            {item.description && (
              <span style={{
                fontFamily: T.mono,
                fontSize:   T.sz["2xs"],
                color:      C.inkFaint,
              }}>
                {item.description}
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
