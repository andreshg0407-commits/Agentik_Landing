/**
 * /[orgSlug]/agentik/marketing-studio/presets
 *
 * Global photo preset registry — read-only browser for super admin.
 *
 * Shows all built-in presets with full visual configuration detail:
 * background, lighting, angles, style, override policy, and tenant usage.
 */

import Link                       from "next/link";
import { requireOrgAccess }       from "@/lib/auth/org-access";
import { isInternalRole }         from "@/lib/auth/module-access";
import { redirect }               from "next/navigation";
import { C, T, S, R }            from "@/lib/ui/tokens";
import { Badge, Panel, PanelHeader } from "@/components/shell/primitives";
import {
  ALL_PRESETS,
  ALL_TENANT_CONFIGS,
} from "@/lib/marketing-studio";
import type { PhotoPreset }       from "@/lib/marketing-studio";

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function PresetRegistryPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }    = await params;
  const { membership } = await requireOrgAccess(orgSlug);

  if (!isInternalRole(membership.role)) redirect(`/${orgSlug}/agentik/marketing-studio`);

  // Compute which tenants use each preset
  const presetTenantMap = buildPresetTenantMap();

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
        {" "} › Presets
      </div>

      {/* ── Header ── */}
      <div style={{ marginBottom: S[5], paddingBottom: S[3], borderBottom: `1.5px solid ${C.ink}` }}>
        <h1 style={{ margin: 0, fontSize: T.sz["2xl"], fontWeight: T.wt.black,
          color: C.ink, letterSpacing: "-0.02em" }}>
          🎨 Registro global de presets
        </h1>
        <div style={{ fontSize: T.sz.sm, color: C.inkLight, marginTop: 3 }}>
          {ALL_PRESETS.length} presets · Fuente de verdad para todas las sesiones fotográficas.
          Los tenants referencian estos presets por id.
        </div>
      </div>

      {/* ── Preset cards ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>
        {ALL_PRESETS.map(preset => (
          <PresetCard
            key={preset.id}
            preset={preset}
            tenants={presetTenantMap.get(preset.id) ?? []}
          />
        ))}
      </div>

    </div>
  );
}

// ── Preset card ───────────────────────────────────────────────────────────────

function PresetCard({
  preset,
  tenants,
}: {
  preset:  PhotoPreset;
  tenants: string[];
}) {
  const requiredAngles  = preset.angles.filter(a => a.required);
  const optionalAngles  = preset.angles.filter(a => !a.required);

  return (
    <Panel>
      {/* Header */}
      <PanelHeader
        title={preset.name}
        badge={<Badge variant="neutral">{preset.id}</Badge>}
        cta={
          tenants.length > 0
            ? { label: `${tenants.length} tenant${tenants.length > 1 ? "s" : ""}`, href: "#" }
            : undefined
        }
      />

      <div style={{ padding: `${S[3]}px ${S[4]}px`, display: "flex", flexDirection: "column", gap: S[3] }}>

        {/* Description + tags */}
        <div>
          <div style={{ color: C.inkMid, fontSize: T.sz.sm, marginBottom: S[2] }}>
            {preset.description}
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            <Badge variant="brand">{preset.style.replace(/_/g, " ")}</Badge>
            {preset.applicableTo.length > 0
              ? preset.applicableTo.map(c => <Badge key={c} variant="neutral">{c}</Badge>)
              : <Badge variant="neutral">universal</Badge>
            }
            {preset.tags.map(t => (
              <span key={t} style={{ fontSize: T.sz.xs, color: C.inkGhost,
                background: C.surfaceAlt, borderRadius: R.sm,
                padding: "1px 7px", border: `1px solid ${C.lineSubtle}` }}>
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* Config columns */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: S[3] }}>

          {/* Background + lighting */}
          <div>
            <FieldLabel>Fondo</FieldLabel>
            <FieldValue>{preset.background.type.replace(/_/g, " ")}</FieldValue>
            {preset.background.value && (
              <FieldNote>{preset.background.value}</FieldNote>
            )}
            <FieldLabel style={{ marginTop: S[2] }}>Iluminación</FieldLabel>
            <FieldValue>{preset.lighting.setup.replace(/_/g, " ")}</FieldValue>
            {preset.lighting.temperature && (
              <FieldNote>{preset.lighting.temperature} · {preset.lighting.shadowPolicy ?? "n/a"} shadow</FieldNote>
            )}
          </div>

          {/* Angles */}
          <div>
            <FieldLabel>Ángulos requeridos ({requiredAngles.length})</FieldLabel>
            {requiredAngles.map(a => (
              <div key={a.angle} style={{ marginBottom: 3 }}>
                <span style={{ fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink }}>
                  {a.angle.replace(/_/g, " ")}
                </span>
                {a.frameHint && (
                  <span style={{ fontSize: T.sz.xs, color: C.inkFaint, display: "block", marginLeft: 8 }}>
                    {a.frameHint}
                  </span>
                )}
              </div>
            ))}
            {optionalAngles.length > 0 && (
              <>
                <FieldLabel style={{ marginTop: S[2] }}>Opcionales ({optionalAngles.length})</FieldLabel>
                {optionalAngles.map(a => (
                  <div key={a.angle} style={{ fontSize: T.sz.xs, color: C.inkFaint, marginBottom: 2 }}>
                    {a.angle.replace(/_/g, " ")}
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Override policy */}
          <div>
            <FieldLabel>Política de overrides</FieldLabel>
            {(Object.entries(preset.overridePolicy) as [string, boolean][]).map(([key, allowed]) => (
              <div key={key} style={{ display: "flex", justifyContent: "space-between",
                alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: T.sz.xs, color: C.inkMid }}>
                  {key.replace(/([A-Z])/g, " $1").toLowerCase()}
                </span>
                <Badge variant={allowed ? "success" : "neutral"}>
                  {allowed ? "✓" : "✗"}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        {/* AI Prompt Hint */}
        {preset.aiPromptHint && (
          <div style={{ background: C.surfaceAlt, borderRadius: R.sm,
            padding: `${S[2]}px ${S[3]}px`, borderLeft: `3px solid ${C.brand}` }}>
            <FieldLabel>AI prompt seed</FieldLabel>
            <span style={{ fontSize: T.sz.xs, color: C.inkMid, fontStyle: "italic" }}>
              "{preset.aiPromptHint}"
            </span>
          </div>
        )}

        {/* Tenant usage */}
        {tenants.length > 0 && (
          <div style={{ display: "flex", gap: S[2], alignItems: "center" }}>
            <span style={{ fontSize: T.sz.xs, color: C.inkFaint }}>Usado por:</span>
            {tenants.map(t => <Badge key={t} variant="info">{t}</Badge>)}
          </div>
        )}

      </div>
    </Panel>
  );
}

// ── Tiny field helpers ────────────────────────────────────────────────────────

function FieldLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.inkFaint,
      textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, ...style }}>
      {children}
    </div>
  );
}

function FieldValue({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink, marginBottom: 2 }}>
      {children}
    </div>
  );
}

function FieldNote({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: T.sz.xs, color: C.inkFaint }}>
      {children}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildPresetTenantMap(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const t of ALL_TENANT_CONFIGS) {
    for (const pid of t.allowedPresets) {
      const existing = map.get(pid) ?? [];
      existing.push(t.tenantName);
      map.set(pid, existing);
    }
  }
  return map;
}
