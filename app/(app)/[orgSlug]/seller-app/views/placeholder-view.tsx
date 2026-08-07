/**
 * Seller App — Placeholder View for unimplemented tabs.
 *
 * Sprint: AGENTIK-SELLER-APP-UI-02
 */
"use client";

import { C, T, S } from "@/lib/ui/tokens";

export function PlaceholderView({ title }: { title: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: `${S[12]}px ${S[4]}px`, color: C.inkLight, textAlign: "center",
    }}>
      <div style={{ fontSize: T.sz["2xl"], fontWeight: T.wt.semibold, marginBottom: S[2] }}>
        {title}
      </div>
      <div style={{ fontSize: T.sz.md }}>
        Disponible en la siguiente version
      </div>
    </div>
  );
}
