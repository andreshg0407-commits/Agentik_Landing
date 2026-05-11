/**
 * /[orgSlug]/agentik/marketing-studio/tenants
 *
 * Tenant marketing config viewer — super admin.
 *
 * Shows all TenantMarketingConfig objects with full detail:
 * brand voice, allowed presets, approval rules, Luca integration config.
 */

import Link                         from "next/link";
import { requireOrgAccess }         from "@/lib/auth/org-access";
import { isInternalRole }           from "@/lib/auth/module-access";
import { redirect }                 from "next/navigation";
import { C, T, S, R }              from "@/lib/ui/tokens";
import { Badge, Panel, PanelHeader } from "@/components/shell/primitives";
import {
  ALL_TENANT_CONFIGS,
  getPreset,
} from "@/lib/marketing-studio";
import type { TenantMarketingConfig } from "@/lib/marketing-studio";

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function TenantConfigsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }    = await params;
  const { membership } = await requireOrgAccess(orgSlug);

  if (!isInternalRole(membership.role)) redirect(`/${orgSlug}/agentik/marketing-studio`);

  return (
    <div style={{ fontFamily: "monospace", maxWidth: 1000 }}>

      {/* ── Breadcrumb ── */}
      <div style={{ fontSize: T.sz.xs, color: C.inkFaint, marginBottom: S[2],
        textTransform: "uppercase", letterSpacing: "0.04em" }}>
        <Link href={`/${orgSlug}/agentik`} style={{ color: C.inkFaint, textDecoration: "none" }}>
          Consola Interna
        </Link>
        {" "} ›{" "}
        <Link href={`/${orgSlug}/agentik/marketing-studio`} style={{ color: C.inkFaint, textDecoration: "none" }}>
          Marketing Studio
        </Link>
        {" "} › Tenants
      </div>

      {/* ── Header ── */}
      <div style={{ marginBottom: S[5], paddingBottom: S[3], borderBottom: `1.5px solid ${C.ink}` }}>
        <h1 style={{ margin: 0, fontSize: T.sz["2xl"], fontWeight: T.wt.black,
          color: C.ink, letterSpacing: "-0.02em" }}>
          🏢 Configuración de tenants
        </h1>
        <div style={{ fontSize: T.sz.sm, color: C.inkLight, marginTop: 3 }}>
          Perfiles de voz de marca, presets, reglas de aprobación y config de Luca por cliente.
        </div>
      </div>

      {/* ── Separator ── */}
      <div style={{ fontSize: T.sz.xs, color: C.inkFaint, marginBottom: S[3],
        padding: `${S[2]}px ${S[3]}px`, background: C.surfaceAlt,
        borderRadius: R.sm, border: `1px solid ${C.lineSubtle}` }}>
        ⚠️ Esta configuración es gestionada por Agentik internamente.
        Los cambios requieren un deploy — no hay edición en UI por ahora.
        Archivo fuente:{" "}
        <code style={{ color: C.brand, fontSize: T.sz.xs }}>
          lib/marketing-studio/tenant-config.ts
        </code>
      </div>

      {/* ── Tenant cards ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>
        {ALL_TENANT_CONFIGS.map(config => (
          <TenantConfigCard key={config.tenantId} config={config} />
        ))}
      </div>

    </div>
  );
}

// ── Tenant config card ────────────────────────────────────────────────────────

function TenantConfigCard({ config }: { config: TenantMarketingConfig }) {
  const defaultPreset = getPreset(config.defaultPresetId);

  return (
    <Panel>
      <PanelHeader
        title={config.tenantName}
        badge={
          <div style={{ display: "flex", gap: S[1] }}>
            <Badge variant={config.active ? "success" : "neutral"}>
              {config.active ? "ACTIVO" : "INACTIVO"}
            </Badge>
            <Badge variant="neutral">{config.tenantSlug}</Badge>
          </div>
        }
      />

      <div style={{ padding: `${S[3]}px ${S[4]}px`, display: "flex", flexDirection: "column", gap: S[4] }}>

        {/* Row 1: Brand voice + Presets */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[4] }}>

          {/* Brand voice */}
          <div>
            <SectionLabel>Voz de marca</SectionLabel>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: S[2] }}>
              {config.brandVoice.tones.map(t => (
                <Badge key={t} variant="brand">{t}</Badge>
              ))}
            </div>

            <MiniLabel>Adjetivos clave</MiniLabel>
            <div style={{ fontSize: T.sz.xs, color: C.inkMid, marginBottom: S[2] }}>
              {config.brandVoice.adjectives.join(" · ")}
            </div>

            <MiniLabel>Palabras a evitar</MiniLabel>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: S[2] }}>
              {config.brandVoice.avoidWords.map(w => (
                <span key={w} style={{ fontSize: T.sz.xs, color: C.red,
                  background: "#fff5f5", borderRadius: R.sm,
                  padding: "1px 7px", border: `1px solid #fecaca` }}>
                  {w}
                </span>
              ))}
            </div>

            <MiniLabel>Hashtags firma</MiniLabel>
            <div style={{ fontSize: T.sz.xs, color: C.inkMid }}>
              {config.brandVoice.signatureHashtags.slice(0, 5).join(" ")}
              {config.brandVoice.signatureHashtags.length > 5 && (
                <span style={{ color: C.inkGhost }}>
                  {" "}+{config.brandVoice.signatureHashtags.length - 5} más
                </span>
              )}
            </div>
          </div>

          {/* Presets */}
          <div>
            <SectionLabel>Presets habilitados</SectionLabel>
            <div style={{ marginBottom: S[2] }}>
              <MiniLabel>Por defecto</MiniLabel>
              <div style={{ fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.brand }}>
                {defaultPreset?.name ?? config.defaultPresetId}
              </div>
            </div>

            <MiniLabel>Todos los presets ({config.allowedPresets.length})</MiniLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {config.allowedPresets.map(pid => {
                const p = getPreset(pid);
                const isDefault = pid === config.defaultPresetId;
                const isAutoApprove = config.approvalRules.autoApprovePresets.includes(pid);
                return (
                  <div key={pid} style={{ display: "flex", alignItems: "center", gap: S[1] }}>
                    <span style={{ fontSize: T.sz.xs, color: C.inkMid, minWidth: 160 }}>
                      {p?.name ?? pid}
                    </span>
                    {isDefault     && <Badge variant="brand">default</Badge>}
                    {isAutoApprove && <Badge variant="success">auto-approve</Badge>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Row 2: Approval rules + Luca config */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[4],
          paddingTop: S[3], borderTop: `1px solid ${C.lineSubtle}` }}>

          {/* Approval rules */}
          <div>
            <SectionLabel>Reglas de aprobación</SectionLabel>
            <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[2] }}>
              <Badge variant={config.approvalRules.requireApproval ? "warning" : "success"}>
                {config.approvalRules.requireApproval ? "Requiere aprobación" : "Sin aprobación"}
              </Badge>
            </div>
            {config.approvalRules.autoApprovePresets.length > 0 && (
              <>
                <MiniLabel>Presets con auto-aprobación</MiniLabel>
                <div style={{ fontSize: T.sz.xs, color: C.green }}>
                  {config.approvalRules.autoApprovePresets.join(", ")}
                </div>
              </>
            )}
          </div>

          {/* Luca integration */}
          <div>
            <SectionLabel>Integración Luca</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <ConfigRow label="client_id"      value={config.luca.clientId} />
              <ConfigRow label="platforms"      value={config.luca.defaultPlatforms.join(", ")} />
              <ConfigRow label="objetivo"       value={config.luca.defaultObjective} />
              <ConfigRow label="auto-publish"   value={config.luca.autoPublish ? "sí" : "no"} />
              <ConfigRow label="prompt_mode"    value={config.luca.promptMode} />
            </div>
          </div>
        </div>

        {/* Category aliases */}
        {config.categoryAliases && Object.keys(config.categoryAliases).length > 0 && (
          <div style={{ paddingTop: S[3], borderTop: `1px solid ${C.lineSubtle}` }}>
            <SectionLabel>Aliases de categoría ERP → canónico</SectionLabel>
            <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
              {Object.entries(config.categoryAliases).map(([erp, canonical]) => (
                <div key={erp} style={{ fontSize: T.sz.xs, background: C.surfaceAlt,
                  borderRadius: R.sm, padding: "2px 8px",
                  border: `1px solid ${C.lineSubtle}` }}>
                  <span style={{ color: C.inkFaint }}>{erp}</span>
                  <span style={{ color: C.inkGhost, margin: "0 4px" }}>→</span>
                  <span style={{ color: C.brand, fontWeight: T.wt.semibold }}>{canonical}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Copy sample hints */}
        <div style={{ paddingTop: S[3], borderTop: `1px solid ${C.lineSubtle}` }}>
          <SectionLabel>Ejemplos de copy por voz de marca</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {config.brandVoice.copySampleHints.map((hint, i) => (
              <div key={i} style={{ fontSize: T.sz.xs, color: C.inkMid,
                borderLeft: `2px solid ${C.brand}`, paddingLeft: S[2], fontStyle: "italic" }}>
                "{hint}"
              </div>
            ))}
          </div>
        </div>

      </div>
    </Panel>
  );
}

// ── Tiny helpers ──────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.inkFaint,
      textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: S[2] }}>
      {children}
    </div>
  );
}

function MiniLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 9, fontWeight: T.wt.bold, color: C.inkGhost,
      textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>
      {children}
    </div>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: T.sz.xs, color: C.inkFaint }}>{label}</span>
      <span style={{ fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.inkMid }}>{value}</span>
    </div>
  );
}
