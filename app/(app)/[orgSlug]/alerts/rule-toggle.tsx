"use client";

/**
 * rule-toggle.tsx
 *
 * Toggle button for AlertRule ACTIVE ↔ PAUSED.
 * Calls PATCH /api/alerts/rules/[id] and reloads on success.
 */

import { useState } from "react";

interface Props {
  ruleId: string;
  orgId:  string;
  status: "ACTIVE" | "PAUSED";
}

export function RuleToggle({ ruleId, orgId, status }: Props) {
  const [current,  setCurrent]  = useState(status);
  const [loading,  setLoading]  = useState(false);

  async function toggle() {
    const next = current === "ACTIVE" ? "PAUSED" : "ACTIVE";
    setLoading(true);
    try {
      const res = await fetch(`/api/alerts/rules/${ruleId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ organizationId: orgId, status: next }),
      });
      if (res.ok) setCurrent(next);
    } finally {
      setLoading(false);
    }
  }

  const isActive = current === "ACTIVE";

  return (
    <button
      onClick={toggle}
      disabled={loading}
      title={isActive ? "Pausar regla" : "Activar regla"}
      style={{
        display:        "flex",
        alignItems:     "center",
        gap:            6,
        padding:        "4px 12px",
        fontSize:       11,
        fontWeight:     700,
        fontFamily:     "monospace",
        borderRadius:   4,
        border:         isActive ? "1px solid #bbf7d0" : "1px solid #ddd",
        background:     isActive ? "#f0fdf4" : "#f5f5f5",
        color:          isActive ? "#15803d"  : "#888",
        cursor:         loading ? "wait" : "pointer",
        letterSpacing:  "0.03em",
        transition:     "all 0.15s",
      }}
    >
      <span style={{
        width:        8,
        height:       8,
        borderRadius: "50%",
        background:   isActive ? "#22c55e" : "#d1d5db",
        flexShrink:   0,
      }} />
      {loading ? "..." : isActive ? "Activa" : "Pausada"}
    </button>
  );
}
