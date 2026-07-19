/**
 * /[orgSlug]/agentik/marketing-studio/biblioteca
 *
 * MS-04A / MS-04A.1 / MS-04B — Biblioteca / Asset Hub
 *
 * Server Component — owns auth, data fetching, intel strip, agent signals.
 * Interactive grid + drawer delegated to BibliotecaClient (client boundary).
 *
 * ── Blueprint layers ─────────────────────────────────────────────────────────
 *   1. OperationalWorkspaceHeader   (Module Pulse Header)
 *   2. Intelligence Summary Strip   (Operational Summary — IntelCard)
 *   3. Agent Signals               (Luca + Mila contextual bars)
 *   4. BibliotecaClient            (preset chips + search + grid + drawer)
 *
 * ── Data ──────────────────────────────────────────────────────────────────────
 *   Real:        listOrgApprovedAssets (asset list + count)
 *   Placeholder: intelligence summary, per-asset channels/usage/score  // PLACEHOLDER
 *
 * ── No Prisma changes · no engine changes · no SAG adapter changes ────────────
 */

import { redirect }                 from "next/navigation";
import { requireOrgAccess }         from "@/lib/auth/org-access";
import { canAccessMarketingStudio } from "@/lib/auth/module-access";
import { listOrgApprovedAssets }    from "@/lib/marketing-studio/asset-service";
import { C, T, S, R }              from "@/lib/ui/tokens";
import {
  OperationalWorkspaceHeader,
} from "@/components/workspace/operational-workspace-header";
import { getActivePresets }         from "@/lib/marketing-studio/library/intelligence";
import {
  BibliotecaClient,
} from "@/components/marketing-studio/library/biblioteca-client";
import type {
  BibliotecaAssetDisplay,
} from "@/components/marketing-studio/library/asset-detail-drawer";
import { listProductConsoleItems }  from "@/lib/marketing-studio/products/product-query-service";

// ── Mock intelligence data ────────────────────────────────────────────────────
// PLACEHOLDER — replace with real intelligence queries (MS-04C)

const MOCK_CHANNELS: Record<string, string[]> = {
  product_photo:   ["shopify", "catalog", "whatsapp"],
  lifestyle_photo: ["instagram", "facebook", "catalog"],
  short_video:     ["tiktok", "instagram"],
  ad_creative:     ["ads", "facebook"],
  banner:          ["shopify", "catalog"],
  template:        ["catalog"],
};

const MOCK_USAGE    = [14, 3, 0, 7, 22, 1, 11, 5, 0, 4, 18, 2];
const MOCK_VARIANTS = [2,  0, 1, 0,  3, 0,  1, 1, 0, 0,  2, 0];

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function BibliotecaPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }                  = await params;
  const { membership, organization } = await requireOrgAccess(orgSlug);
  if (!canAccessMarketingStudio(membership.role)) redirect(`/${orgSlug}/agentik`);

  // ── Real data: ProductEntity layer (MS-06) ──
  const [products, assets] = await Promise.all([
    listProductConsoleItems(organization.id),
    listOrgApprovedAssets(organization.id, 60),
  ]);

  const productMode = products.length > 0;
  const approved    = productMode ? products.length : assets.length;

  // ── Intelligence summary (real where available, PLACEHOLDER elsewhere) ──
  const pendingReview = products.filter(p => p.status === "pending").length;            // REAL

  // Pre-compute display model for each asset (server side)
  const displayAssets: BibliotecaAssetDisplay[] = assets.map((asset, idx) => {
    const usage         = MOCK_USAGE[idx % MOCK_USAGE.length];           // PLACEHOLDER
    const variants      = MOCK_VARIANTS[idx % MOCK_VARIANTS.length];     // PLACEHOLDER
    const channels      = MOCK_CHANNELS[asset.assetType] ?? ["catalog"]; // PLACEHOLDER
    const score         = usage > 10 ? 0.92 : usage > 3 ? 0.74 : 0.51;  // PLACEHOLDER
    const highPerformer = usage >= 10;                                     // PLACEHOLDER
    const stale         = usage === 0 && idx % 5 === 0;                   // PLACEHOLDER

    return {
      id:           asset.id,
      assetUrl:     asset.assetUrl,
      assetType:    asset.assetType,
      name:         asset.session.productSku
                      ? `SKU ${asset.session.productSku}`
                      : asset.assetType.replace(/_/g, " "),
      sku:          asset.session.productSku ?? null,
      status:       "approved",
      channels,
      usageCount:   usage,
      variantCount: variants,
      score,
      highPerformer,
      stale,
      // PLACEHOLDER — MS-04C: pull from asset.createdAt and session/workflow metadata
      createdAt: "May 2026",
      origin:    "ai" as const,
    };
  });

  // ── Presets — product mode uses operational presets; legacy uses asset presets ──
  const tenantCapabilities = ["whatsapp", "catalogs", "shopify"] as const;

  const productPresets = [
    { id: "shopify_ready",    label: "Listos para Shopify",   accent: "green",  description: "Readiness OK para Shopify" },
    { id: "whatsapp_ready",   label: "Listos para WhatsApp",  accent: "green",  description: "Nombre y disponibilidad presentes" },
    { id: "catalog_ready",    label: "Listo para Catálogo",   accent: "blue",   description: "Categoría y nombre presentes" },
    { id: "partial_readiness",label: "Readiness parcial",     accent: "amber",  description: "Información incompleta para al menos un canal" },
    { id: "blocked",          label: "Bloqueados",            accent: "red",    description: "Score < 30 — metadata insuficiente" },
    { id: "high_potential",   label: "Alto potencial · Luca", accent: "purple", description: "Oportunidades detectadas por Luca" },
    { id: "unpublished",      label: "Sin publicar",          accent: "gray",   description: "Ningún canal publicado aún" },
    { id: "sync_failed",      label: "Sincronización fallida", accent: "red",    description: "Al menos un canal con error de sincronización" },
  ];

  const legacyPresets = (() => {
    const activePresets = getActivePresets([...tenantCapabilities]);
    return [
      "recently_approved", "whatsapp_ready", "shopify_ready",
      "catalog_ready", "pending_review", "high_performers",
      "missing_variants", "for_luca",
    ]
      .map(id => activePresets.find(p => p.id === id))
      .filter(Boolean)
      .map(p => ({ id: p!.id, label: p!.label, accent: p!.accent, description: p!.description }));
  })();

  const featuredPresets = productMode ? productPresets : legacyPresets;

  return (
    <div style={{ fontFamily: T.mono, maxWidth: 1080 }}>

      {/* ── 1. Header ── */}
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Marketing Studio", href: `/${orgSlug}/agentik/marketing-studio` },
          { label: "Biblioteca / Asset Hub" },
        ]}
        title="Biblioteca / Asset Hub"
        subtitle="Sistema nervioso visual de marketing — assets, catálogos, destinos, inteligencia."
        status={pendingReview > 0 ? "warning" : "ok"}
        statusLabel={
          pendingReview > 0
            ? `${pendingReview} pendientes de revisión`
            : `${approved} assets aprobados`
        }
      />

      {/* ── 2–3. KPI strip + agent signals → moved into BibliotecaClient (interactive) ── */}

      {/* ── 4. Client workspace (presets + search + grid + drawer) ── */}
      <BibliotecaClient
        assets={displayAssets}
        products={products}
        orgSlug={orgSlug}
        organizationId={organization.id}
        presets={featuredPresets}
      />

      {/* ── Status legend ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: S[3],
        marginTop: S[8], paddingTop: S[4],
        borderTop: `1px solid ${C.lineSubtle}`, flexWrap: "wrap" as const,
      }}>
        {LEGEND.map(s => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: S[1], fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, display: "inline-block", flexShrink: 0 }} />
            {s.label}
          </div>
        ))}
        <div style={{ marginLeft: "auto", fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost }}>
          MS-03 intelligence · MS-04A.1 visual system · MS-04B drawer
        </div>
      </div>

    </div>
  );
}

// IntelCard removed — replaced by shared MSMetricCard via MSMetricStrip

// ── Static data ───────────────────────────────────────────────────────────────

const LEGEND = [
  { dot: C.green,    label: "Aprobado y publicable"        },
  { dot: C.amber,    label: "Pendiente de revisión"        },
  { dot: C.blue,     label: "Generado — en procesamiento"  },
  { dot: C.inkFaint, label: "Sin canal asignado"           },
  { dot: C.green,    label: "Alto rendimiento (10+ usos)"  },
  { dot: C.red,      label: "Riesgo de duplicado"          },
];
