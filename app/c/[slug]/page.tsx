/**
 * app/c/[slug]/page.tsx
 *
 * MARKETING-STUDIO-CATALOG-PUBLIC-LINKS-01 — Public Catalog Page
 *
 * Public-facing page — NO authentication required.
 * URL: /c/{slug}  (e.g. /c/cpl_x8h29f1a)
 *
 * ── ARCHITECTURE ─────────────────────────────────────────────────────────────
 *   Server component → getPublicCatalogView() → CatalogPublicView (client)
 *   Access tracking happens inside getPublicCatalogView() on every render.
 *
 * ── SECURITY ──────────────────────────────────────────────────────────────────
 *   getPublicCatalogView returns PublicCatalogView which contains NO:
 *     - organizationId
 *     - internal catalog ID
 *     - createdBy / emails
 *     - admin-only metadata
 */

import { notFound }                   from "next/navigation";
import type { Metadata }              from "next";
import { getPublicCatalogView }       from "@/lib/marketing-studio/catalogs/catalog-public-link-repository";
import { CatalogPublicView }          from "@/components/marketing-studio/catalogs/catalog-public-view";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

// ── SEO metadata ──────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const view = await getPublicCatalogView(slug);

  if (!view || view.linkStatus === "not_published") {
    return {
      title:  "Catálogo no disponible",
      robots: "noindex",
    };
  }

  const title       = `${view.catalogName} — ${view.orgDisplayName}`;
  const productWord = view.layoutResult.totalCount === 1 ? "producto" : "productos";
  const description = view.catalogDescription
    ?? `${view.layoutResult.totalCount} ${productWord} · Catálogo de ${view.orgDisplayName}`;

  return {
    title,
    description,
    robots: "index, follow",
    openGraph: {
      title:       view.catalogName,
      description,
      type:        "website",
      siteName:    view.orgDisplayName,
      locale:      "es_CO",
    },
    twitter: {
      card:        "summary",
      title:       view.catalogName,
      description,
    },
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function PublicCatalogPage({ params }: PageProps) {
  const { slug } = await params;
  const view = await getPublicCatalogView(slug);

  if (!view) {
    notFound();
  }

  return <CatalogPublicView view={view} />;
}
