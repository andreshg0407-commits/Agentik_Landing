"use client";

/**
 * alert-action-buttons.tsx
 *
 * Client component — renders Acknowledge / Resolve action buttons
 * and links to related modules. Calls existing REST API routes.
 * No new backend logic introduced.
 */

import type { CSSProperties } from "react";

interface Props {
  alertId:        string;
  orgId:          string;   // organization UUID (not slug)
  orgSlug:        string;
  status:         string;   // "OPEN" | "ACKNOWLEDGED" | "RESOLVED"
  customerSlug?:  string;   // link to Customer 360 if available
  alertHref?:     string;   // link to alert detail page
}

const BTN_BASE: CSSProperties = {
  padding: "5px 14px",
  fontSize: 11,
  fontWeight: 700,
  borderRadius: 4,
  cursor: "pointer",
  fontFamily: "monospace",
  letterSpacing: "0.02em",
  textDecoration: "none",
  display: "inline-block",
};

export function AlertActionButtons({
  alertId,
  orgId,
  orgSlug,
  status,
  customerSlug,
  alertHref,
}: Props) {
  async function postAction(endpoint: "acknowledge" | "resolve") {
    await fetch(`/api/alerts/${alertId}/${endpoint}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ organizationId: orgId }),
    });
    window.location.reload();
  }

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>

      {status === "OPEN" && (
        <button
          onClick={() => postAction("acknowledge")}
          style={{
            ...BTN_BASE,
            background: "#fff",
            color: "#111",
            border: "1.5px solid #111",
          }}
        >
          Reconocer
        </button>
      )}

      {status !== "RESOLVED" && (
        <button
          onClick={() => postAction("resolve")}
          style={{
            ...BTN_BASE,
            background: "#111",
            color: "#fff",
            border: "1.5px solid #111",
          }}
        >
          Resolver
        </button>
      )}

      {customerSlug && (
        <a
          href={`/${orgSlug}/customer-360?customer=${customerSlug}`}
          style={{
            ...BTN_BASE,
            background: "#eff6ff",
            color: "#1d4ed8",
            border: "1px solid #bfdbfe",
          }}
        >
          Ver Cliente 360
        </a>
      )}

      {alertHref && (
        <a
          href={alertHref}
          style={{
            ...BTN_BASE,
            background: "transparent",
            color: "#888",
            border: "1px solid #ddd",
          }}
        >
          Ver detalle
        </a>
      )}
    </div>
  );
}
