import { C, T, S, R, E } from "@/lib/ui/tokens";

export interface SummaryMetric {
  label:   string;
  value:   string | number;
  accent?: string;
  note?:   string;
}

interface Props {
  metrics:  SummaryMetric[];
  variant?: "normal" | "warning";
}

export function SummaryMetricRow({ metrics, variant = "normal" }: Props) {
  const bg     = variant === "warning" ? C.amberLight  : C.surface;
  const border = variant === "warning" ? C.amberBorder : C.line;

  return (
    <div style={{
      display:      "flex",
      gap:          S[4],
      marginBottom: S[4],
      padding:      `${S[3]}px ${S[4]}px`,
      background:   bg,
      border:       `1px solid ${border}`,
      borderRadius: R.xl,
      boxShadow:    E.xs,
      flexWrap:     "wrap" as const,
    }}>
      {metrics.map((m, i) => (
        <div
          key={i}
          style={i > 0 ? { borderLeft: `1px solid ${C.line}`, paddingLeft: S[4] } : {}}
        >
          <div style={{
            fontFamily:    T.sans,
            fontSize:      T.sz["2xs"],
            fontWeight:    T.wt.bold,
            color:         C.inkFaint,
            textTransform: "uppercase" as const,
            letterSpacing: "0.06em",
            marginBottom:  2,
          }}>
            {m.label}
          </div>
          <div style={{
            fontFamily: T.mono,
            fontSize:   T.sz.xl,
            fontWeight: T.wt.bold,
            color:      m.accent ?? C.ink,
            lineHeight: 1.2,
          }}>
            {m.value}
          </div>
          {m.note && (
            <div style={{
              fontFamily: T.mono,
              fontSize:   T.sz["2xs"],
              color:      C.inkFaint,
              marginTop:  2,
            }}>
              {m.note}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
