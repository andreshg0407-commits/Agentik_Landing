"use client";

/**
 * EnterpriseLauncherClient — authenticated module discovery surface.
 *
 * Sprint: AGENTIK-GLOBAL-AUTH-POST-LOGIN-LAUNCHER-01
 *
 * Renders available domains and their navigable modules.
 * Module visibility is resolved server-side (org flags + role permissions).
 * This component only renders — no authorization logic.
 *
 * Responsive: same route for desktop and mobile.
 */

import { useRouter } from "next/navigation";

const BLUE = "#004AAD";

interface LauncherDomain {
  id: string;
  label: string;
  accent: string;
  items: Array<{ label: string; href: string }>;
}

interface Props {
  orgSlug: string;
  orgName: string;
  role: string;
  domains: LauncherDomain[];
}

// Domain icons (SVG inline to avoid lucide-react dependency in this page)
const DOMAIN_ICONS: Record<string, string> = {
  gestion:    "G",
  finanzas:   "Fn",
  cobranza:   "C",
  comercial:  "Cm",
  produccion: "Pr",
  marketing:  "Mk",
  agentik:    "Ag",
};

export function EnterpriseLauncherClient({ orgSlug, role, domains }: Props) {
  const router = useRouter();

  return (
    <div style={{
      minHeight: "100%",
      padding: "clamp(16px, 4vw, 40px)",
      fontFamily: `"Inter", system-ui, -apple-system, sans-serif`,
    }}>
      {/* Header */}
      <div style={{ marginBottom: 32, maxWidth: 800 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: "0.15em",
          color: "#6b7280", textTransform: "uppercase", marginBottom: 6,
        }}>
          {orgSlug} · {role.replace(/_/g, " ")}
        </div>
        <h1 style={{
          margin: 0, fontSize: "clamp(22px, 3.5vw, 30px)", fontWeight: 700,
          color: "#0f172a", letterSpacing: "-0.4px",
        }}>
          Agentik Enterprise
        </h1>
        <p style={{
          margin: "6px 0 0", fontSize: 14, color: "#64748b", lineHeight: 1.5,
        }}>
          Selecciona un modulo para comenzar
        </p>
      </div>

      {/* Domain grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 20,
        maxWidth: 1000,
      }}>
        {domains.map((domain) => (
          <div
            key={domain.id}
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 16,
              overflow: "hidden",
            }}
          >
            {/* Domain header */}
            <div style={{
              padding: "16px 20px 12px",
              borderBottom: "1px solid #f3f4f6",
              display: "flex", alignItems: "center", gap: 12,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: domain.accent,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontSize: 13, fontWeight: 700, flexShrink: 0,
              }}>
                {DOMAIN_ICONS[domain.id] ?? domain.label.charAt(0)}
              </div>
              <div style={{
                fontSize: 15, fontWeight: 600, color: "#1e293b",
              }}>
                {domain.label}
              </div>
            </div>

            {/* Module list */}
            <div style={{ padding: "4px 0" }}>
              {domain.items.map((item) => (
                <button
                  key={item.href}
                  onClick={() => router.push(item.href)}
                  style={{
                    display: "flex", alignItems: "center",
                    width: "100%", padding: "10px 20px",
                    background: "transparent", border: "none",
                    cursor: "pointer", textAlign: "left",
                    fontSize: 14, color: "#374151",
                    fontFamily: "inherit",
                    gap: 8,
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#f9fafb"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ flex: 1 }}>{item.label}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {domains.length === 0 && (
        <div style={{
          textAlign: "center", padding: "48px 20px",
          color: "#6b7280", fontSize: 14,
        }}>
          No tienes modulos habilitados en esta organizacion.
          Contacta a tu administrador.
        </div>
      )}
    </div>
  );
}
