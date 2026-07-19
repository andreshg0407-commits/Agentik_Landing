"use client";

/**
 * components/marketing-studio/publishing/publishing-plan-list.tsx
 *
 * MS-17 — Publishing Center: Plan list with status filter.
 */

import { C, T, S }                  from "@/lib/ui/tokens";
import { PublishingPlanCard }       from "./publishing-plan-card";
import type { PublishingPlan }      from "@/lib/marketing-studio/publishing/publishing-types";

interface Props {
  plans:    PublishingPlan[];
  onSelect: (plan: PublishingPlan) => void;
  filter?:  string;
}

const STATUS_FILTER_GROUPS: { label: string; statuses: string[]; badge?: "critical" | "warning" }[] = [
  { label: "Activos",   statuses: ["planned","queued","preparing","publishing","retrying","partial"] },
  { label: "Fallidos",  statuses: ["failed","blocked"],  badge: "critical" },
  { label: "Completos", statuses: ["published"] },
  { label: "Todos",     statuses: [] },
];

export function PublishingPlanList({ plans, onSelect, filter = "Activos" }: Props) {
  const group  = STATUS_FILTER_GROUPS.find(g => g.label === filter) ?? STATUS_FILTER_GROUPS[0];
  const visible = group.statuses.length === 0
    ? plans
    : plans.filter(p => (group.statuses as string[]).includes(p.status));

  if (visible.length === 0) {
    return (
      <div style={{ padding: `${S[5]}px 0` }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>
          Sin planes en estado "{filter}"
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
      {visible.map(plan => (
        <PublishingPlanCard key={plan.id} plan={plan} onSelect={onSelect} />
      ))}
      {visible.length >= 50 && (
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
          Mostrando 50 más recientes
        </span>
      )}
    </div>
  );
}
