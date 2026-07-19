/**
 * /[orgSlug]/agentik/marketing-studio/intake
 *
 * Canonical intake schema reference — super admin read-only viewer.
 *
 * Documents the shape of IntakeRequest fields, validation rules,
 * and the Luca bridge payload format. Serves as living documentation
 * for operators building intake pipelines.
 */

import Link                         from "next/link";
import { requireOrgAccess }         from "@/lib/auth/org-access";
import { isInternalRole }           from "@/lib/auth/module-access";
import { redirect }                 from "next/navigation";
import { C, T, S, R }              from "@/lib/ui/tokens";
import { Badge, Panel, PanelHeader } from "@/components/shell/primitives";

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function IntakeSchemaReferencePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }    = await params;
  const { membership } = await requireOrgAccess(orgSlug);

  if (!isInternalRole(membership.role)) redirect(`/${orgSlug}/agentik/marketing-studio`);

  return (
    <div style={{ fontFamily: "monospace", maxWidth: 900 }}>

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
        {" "} › Esquema de intake
      </div>

      {/* ── Header ── */}
      <div style={{ marginBottom: S[5], paddingBottom: S[3], borderBottom: `1.5px solid ${C.ink}` }}>
        <h1 style={{ margin: 0, fontSize: T.sz["2xl"], fontWeight: T.wt.black,
          color: C.ink, letterSpacing: "-0.02em" }}>
          📋 Esquema canónico de intake
        </h1>
        <div style={{ fontSize: T.sz.sm, color: C.inkLight, marginTop: 3 }}>
          Referencia del esquema{" "}
          <code style={{ color: C.brand }}>IntakeRequest</code>{" "}
          — unidad de trabajo central del Marketing Studio.
        </div>
      </div>

      {/* ── Schema sections ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>

        {SCHEMA_SECTIONS.map(section => (
          <Panel key={section.title}>
            <PanelHeader title={section.title} badge={<Badge variant="neutral">{section.type}</Badge>} />
            <div style={{ padding: `${S[2]}px ${S[4]}px ${S[3]}px` }}>
              {section.desc && (
                <p style={{ margin: 0, marginBottom: S[3], fontSize: T.sz.sm, color: C.inkMid }}>
                  {section.desc}
                </p>
              )}
              <table style={{ width: "100%", borderCollapse: "collapse",
                fontFamily: "monospace", fontSize: T.sz.xs }}>
                <thead>
                  <tr style={{ background: C.surfaceAlt }}>
                    {["Campo", "Tipo", "Req.", "Descripción"].map(h => (
                      <th key={h} style={{
                        padding: `${S[1]}px ${S[2]}px`,
                        textAlign: "left",
                        fontSize: 9,
                        fontWeight: T.wt.bold,
                        color: C.inkFaint,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        borderBottom: `1px solid ${C.lineSubtle}`,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section.fields.map((f, i) => (
                    <tr key={f.name} style={{ background: i % 2 === 0 ? C.white : C.surface }}>
                      <td style={{ padding: `${S[1]}px ${S[2]}px`, borderBottom: `1px solid ${C.lineSubtle}` }}>
                        <code style={{ color: C.brand, fontWeight: T.wt.semibold }}>{f.name}</code>
                      </td>
                      <td style={{ padding: `${S[1]}px ${S[2]}px`, borderBottom: `1px solid ${C.lineSubtle}` }}>
                        <code style={{ color: C.green, fontSize: 10 }}>{f.type}</code>
                      </td>
                      <td style={{ padding: `${S[1]}px ${S[2]}px`, borderBottom: `1px solid ${C.lineSubtle}`,
                        textAlign: "center" }}>
                        {f.required
                          ? <span style={{ color: C.red, fontWeight: T.wt.bold }}>✓</span>
                          : <span style={{ color: C.inkGhost }}>—</span>}
                      </td>
                      <td style={{ padding: `${S[1]}px ${S[2]}px`, borderBottom: `1px solid ${C.lineSubtle}`,
                        color: C.inkMid }}>
                        {f.desc}
                        {f.values && (
                          <div style={{ marginTop: 2, display: "flex", gap: 3, flexWrap: "wrap" }}>
                            {f.values.map(v => (
                              <span key={v} style={{ fontSize: 9, color: C.inkFaint,
                                background: C.surfaceAlt, borderRadius: 2,
                                padding: "1px 5px", border: `1px solid ${C.lineSubtle}` }}>
                                {v}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        ))}

        {/* Data flow diagram */}
        <Panel>
          <PanelHeader title="Flujo de datos" icon="🔄" />
          <div style={{ padding: `${S[3]}px ${S[4]}px` }}>
            <div style={{ background: C.surfaceAlt, borderRadius: R.sm,
              padding: `${S[3]}px ${S[4]}px`, fontFamily: "monospace", fontSize: T.sz.xs,
              lineHeight: 2, border: `1px solid ${C.lineSubtle}` }}>
              {DATA_FLOW.map((line, i) => (
                <div key={i} style={{ color: line.color ?? C.inkMid }}>{line.text}</div>
              ))}
            </div>
          </div>
        </Panel>

        {/* Source file reference */}
        <div style={{ fontSize: T.sz.xs, color: C.inkFaint,
          padding: `${S[2]}px ${S[3]}px`, background: C.surfaceAlt,
          borderRadius: R.sm, border: `1px solid ${C.lineSubtle}` }}>
          Fuentes:{" "}
          {[
            "lib/marketing-studio/types.ts",
            "lib/marketing-studio/intake-schema.ts",
            "lib/marketing-studio/luca-hooks.ts",
          ].map(f => (
            <code key={f} style={{ color: C.brand, marginRight: S[2] }}>{f}</code>
          ))}
        </div>

      </div>
    </div>
  );
}

// ── Schema data ───────────────────────────────────────────────────────────────

interface SchemaField {
  name:     string;
  type:     string;
  required: boolean;
  desc:     string;
  values?:  string[];
}
interface SchemaSection {
  title:  string;
  type:   string;
  desc?:  string;
  fields: SchemaField[];
}

const SCHEMA_SECTIONS: SchemaSection[] = [
  {
    title: "IntakeRequest — raíz",
    type:  "interface",
    desc:  "Unidad de trabajo central. Creada por createIntakeRequest() en intake-schema.ts.",
    fields: [
      { name: "requestId",   type: "string",              required: true,  desc: "ID único. Formato: ms_{ts}{rand}{seq}" },
      { name: "tenantId",    type: "string",              required: true,  desc: "ID del tenant. Debe coincidir con garment.tenantId" },
      { name: "garment",     type: "GarmentFingerprint",  required: true,  desc: "Huella semántica del producto" },
      { name: "presetId",    type: "string",              required: true,  desc: "ID del preset global. Debe estar en allowedPresets del tenant" },
      { name: "overrides",   type: "SessionOverrides",    required: false, desc: "Overrides según la política del preset" },
      { name: "content",     type: "ContentConfig",       required: true,  desc: "Config de generación de copy y hashtags" },
      { name: "publishing",  type: "PublishingConfig",    required: false, desc: "Config de publicación en canales sociales" },
      { name: "meta",        type: "IntakeMeta",          required: true,  desc: "Metadata: source, priority, operatorId, etc." },
    ],
  },
  {
    title: "GarmentFingerprint",
    type:  "interface",
    desc:  "ID semántico determinístico del producto. Generado por computeGarmentFingerprint().",
    fields: [
      { name: "id",          type: "string",             required: true,  desc: "Hash 16-char hex. Mismo para garments idénticos entre tenants." },
      { name: "tenantId",    type: "string",             required: true,  desc: "Tenant propietario del garment" },
      { name: "sku",         type: "string?",            required: false, desc: "SKU del ERP o catálogo" },
      { name: "attributes",  type: "GarmentAttributes",  required: true,  desc: "Atributos semánticos (categoría, colores, fit, etc.)" },
      { name: "computedAt",  type: "string (ISO)",       required: true,  desc: "Fecha de cómputo del fingerprint" },
      { name: "version",     type: "number",             required: true,  desc: "Versión del algoritmo. Actual: 1" },
    ],
  },
  {
    title: "GarmentAttributes",
    type:  "interface",
    fields: [
      { name: "category",    type: "GarmentCategory",   required: true,  desc: "Categoría canónica",
        values: ["jeans","pants","shorts","shirt","blouse","dress","skirt","jacket","outerwear","activewear","accessories","footwear","other"] },
      { name: "colors",      type: "string[]",          required: true,  desc: "Colores normalizados (lowercase). Mín. 1." },
      { name: "gender",      type: "GarmentGender",     required: true,  desc: "Género de la prenda",
        values: ["men","women","unisex","kids"] },
      { name: "fit",         type: "FitType?",          required: false, desc: "Tipo de fit",
        values: ["slim","relaxed","oversized","regular","skinny","wide_leg","bootcut","straight","flared"] },
      { name: "fabric",      type: "FabricType?",       required: false, desc: "Material de tejido" },
      { name: "pattern",     type: "string?",           required: false, desc: "Ej: solid, stripe, floral, denim_wash" },
      { name: "occasion",    type: "string[]?",         required: false, desc: "Ej: casual, streetwear, office, evening" },
      { name: "priceSegment",type: "PriceSegment?",     required: false, desc: "Segmento de precio",
        values: ["economy","mid","premium","luxury"] },
    ],
  },
  {
    title: "ContentConfig",
    type:  "interface",
    fields: [
      { name: "generateCopy",     type: "boolean",         required: true,  desc: "Generar copy para publicación" },
      { name: "generateHashtags", type: "boolean",         required: true,  desc: "Generar hashtags automáticos" },
      { name: "targetPlatforms",  type: "SocialPlatform[]",required: true,  desc: "Canales destino",
        values: ["tiktok","instagram","facebook","web"] },
      { name: "objective",        type: "ContentObjective?",required: false, desc: "Objetivo de contenido",
        values: ["ventas","seguidores","likes","brand_awareness","engagement"] },
      { name: "tone",             type: "ContentTone?",    required: false, desc: "Tono del copy",
        values: ["casual","formal","playful","aspirational","informative","urgency"] },
      { name: "locale",           type: "string",          required: true,  desc: "Ej: es-CO, en-US" },
    ],
  },
  {
    title: "LucaSubmitPayload",
    type:  "interface",
    desc:  "Payload generado por buildLucaPayload() → enviado a /api/luca/submit como FormData.",
    fields: [
      { name: "post_type",       type: '"video"|"image"',         required: true, desc: "Tipo de publicación" },
      { name: "objective",       type: "ContentObjective",        required: true, desc: "Objetivo de publicación" },
      { name: "description",     type: "string",                  required: true, desc: "Prompt de generación de contenido" },
      { name: "generation_type", type: '"text-to-video"|"image-to-video"', required: true, desc: "Tipo de pipeline de generación" },
      { name: "aspect_ratio",    type: '"9:16"|"16:9"',           required: true, desc: "9:16 para vertical (TikTok). 16:9 para flat-lay" },
      { name: "duration_seconds",type: "8 | 12",                  required: true, desc: "Duración del video" },
      { name: "prompt_mode",     type: '"coach"|"direct"',        required: true, desc: "Modo de prompt para Luca" },
      { name: "client_id",       type: "string?",                 required: false, desc: "Ej: do-jeans, castillitos. Tomado de TenantMarketingConfig.luca.clientId" },
    ],
  },
];

// ── Data flow ─────────────────────────────────────────────────────────────────

const DATA_FLOW: { text: string; color?: string }[] = [
  { text: "① Operador / AI  →  createIntakeRequest(opts)  →  IntakeRequest",        color: C.brand },
  { text: "② validateIntakeRequest(req)  →  { valid, errors }",                      color: C.inkMid },
  { text: "③ computeGarmentFingerprint(tenantId, attrs, sku)  →  GarmentFingerprint", color: C.inkMid },
  { text: "④ resolveEffectivePreset(presetId, config, overrides)  →  PhotoPreset",   color: C.inkMid },
  { text: "⑤ buildLucaPayload(request, config)  →  LucaSubmitPayload",               color: C.green },
  { text: "⑥ POST /api/luca/submit  →  n8n webhook  →  TikTok / Instagram",          color: C.green },
  { text: "⑦ (futuro) Session stored in DB  →  tenant dashboard",                    color: C.inkGhost },
];
