"use client";

/**
 * OrgSelectorClient — authenticated organization selector.
 *
 * Sprint: AGENTIK-GLOBAL-AUTH-POST-LOGIN-LAUNCHER-01
 *
 * Minimal, responsive. Shows authorized orgs only.
 * Seller confinement: provisioned sellers route to /seller-app;
 * enterprise users route to org launcher.
 */

import { useRouter } from "next/navigation";

const BLUE = "#004AAD";
const NAVY = "#0D2454";

interface OrgEntry {
  slug: string;
  name: string;
  role: string;
}

export function OrgSelectorClient({ orgs }: { orgs: OrgEntry[] }) {
  const router = useRouter();

  function handleSelect(org: OrgEntry) {
    router.push(`/${org.slug}`);
  }

  return (
    <main style={{
      minHeight: "100dvh",
      background: `linear-gradient(160deg, ${BLUE} 0%, ${NAVY} 100%)`,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      fontFamily: `"Inter", system-ui, -apple-system, sans-serif`,
      padding: "24px 20px",
    }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
          <div style={{
            background: "#fff", borderRadius: 20, padding: "12px 16px",
            boxShadow: "0 10px 34px rgba(0,0,0,0.22)",
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/agentik-logo.png" alt="Agentik" style={{ height: 64, width: "auto", display: "block" }} />
          </div>
        </div>

        <h1 style={{
          color: "#fff", fontSize: 24, fontWeight: 700, textAlign: "center",
          margin: "0 0 8px", letterSpacing: "-0.3px",
        }}>
          Selecciona tu organizacion
        </h1>
        <p style={{
          color: "rgba(255,255,255,0.7)", fontSize: 14, textAlign: "center",
          margin: "0 0 24px",
        }}>
          Tienes acceso a {orgs.length} organizaciones
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {orgs.map((org) => (
            <button
              key={org.slug}
              onClick={() => handleSelect(org)}
              style={{
                width: "100%", padding: "16px 20px",
                background: "#fff", border: "none", borderRadius: 16,
                cursor: "pointer", textAlign: "left",
                boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                display: "flex", alignItems: "center", gap: 14,
                transition: "transform 0.1s, box-shadow 0.1s",
                fontFamily: "inherit",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.18)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "none";
                e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.12)";
              }}
            >
              {/* Org initial */}
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: `linear-gradient(135deg, ${BLUE}, ${NAVY})`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontSize: 18, fontWeight: 700, flexShrink: 0,
              }}>
                {org.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 16, fontWeight: 600, color: NAVY,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {org.name}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                  {org.role.replace(/_/g, " ")}
                </div>
              </div>
              {/* Arrow */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
