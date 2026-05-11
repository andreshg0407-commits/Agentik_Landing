import Link from "next/link";
import { C, T, S, R } from "@/lib/ui/tokens";

export interface WorkspaceAction {
  label:   string;
  href:    string;
  variant: "primary" | "secondary" | "ghost";
  accent?: string;
}

interface Props {
  actions: WorkspaceAction[];
}

export function WorkspaceActions({ actions }: Props) {
  return (
    <div style={{
      display:      "flex",
      gap:          S[2],
      marginBottom: S[4],
      flexWrap:     "wrap" as const,
    }}>
      {actions.map((action, i) => {
        const isPrimary   = action.variant === "primary";
        const isSecondary = action.variant === "secondary";

        return (
          <Link
            key={i}
            href={action.href}
            className={isPrimary ? "ag-ws-primary" : isSecondary ? "ag-ws-secondary" : undefined}
            style={{
              fontFamily:     T.mono,
              fontSize:       T.sz.sm,
              fontWeight:     isPrimary ? T.wt.bold : T.wt.semibold,
              color:          isPrimary ? "#fff" : C.blueDark,
              borderRadius:   R.lg,
              padding:        `${S[2]}px ${S[3]}px`,
              textDecoration: "none",
              display:        "inline-block",
            }}
          >
            {action.label}
          </Link>
        );
      })}
    </div>
  );
}
