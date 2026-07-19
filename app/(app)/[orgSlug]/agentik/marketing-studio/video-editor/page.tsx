/**
 * /[orgSlug]/agentik/marketing-studio/video-editor
 *
 * MARKETING-VIDEO-EDITOR-01 — Editor de Video
 *
 * Server Component — owns auth, org resolution, and renders the client workspace.
 *
 * ── Blueprint layers ──────────────────────────────────────────────────────────
 *   1. OperationalWorkspaceHeader   (Module Pulse Header)
 *   2. VideoEditorClient            (interactive editor workspace)
 *
 * ── Data ──────────────────────────────────────────────────────────────────────
 *   No Prisma queries at page level — all data operations happen in the client
 *   via the /api/orgs/[orgSlug]/marketing-studio/video-editor/export endpoint.
 *
 * ── No Prisma changes · no engine changes · no SAG adapter changes ─────────────
 */

import { redirect }                  from "next/navigation";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import { canAccessMarketingStudio }  from "@/lib/auth/module-access";
import { C, T, S }                   from "@/lib/ui/tokens";
import {
  OperationalWorkspaceHeader,
} from "@/components/workspace/operational-workspace-header";
import {
  VideoEditorClient,
} from "@/components/marketing-studio/video-editor/video-editor-client";

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function VideoEditorPage({
  params,
  searchParams,
}: {
  params:       Promise<{ orgSlug: string }>;
  searchParams: Promise<{ assetId?: string }>;
}) {
  const { orgSlug }                  = await params;
  const { assetId }                  = await searchParams;
  const { membership, organization } = await requireOrgAccess(orgSlug);

  if (!canAccessMarketingStudio(membership.role)) {
    redirect(`/${orgSlug}/agentik`);
  }

  return (
    <div style={{ fontFamily: T.mono, maxWidth: 1080 }}>

      {/* ── 1. Header ── */}
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Marketing Studio", href: `/${orgSlug}/agentik/marketing-studio` },
          { label: "Editor de Video" },
        ]}
        title="Editor de Video"
        subtitle="Edita videos existentes, agrega subtítulos, música, textos y formatos para redes sociales."
        status="ok"
        statusLabel="Listo para editar"
      />

      {/* ── 2. Editor workspace ── */}
      <VideoEditorClient
        orgSlug={orgSlug}
        organizationId={organization.id}
        initialAssetId={assetId ?? null}
        membershipRole={membership.role}
      />

      {/* ── Footer legend ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: S[4],
        marginTop: S[8], paddingTop: S[4],
        borderTop: `1px solid ${C.lineSubtle}`,
        flexWrap: "wrap" as const,
      }}>
        {LEGEND.map(item => (
          <div
            key={item.label}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint,
            }}
          >
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: item.dot, flexShrink: 0,
            }} />
            {item.label}
          </div>
        ))}
        <div style={{ marginLeft: "auto", fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost }}>
          VIDEO-EDITOR-V1 · render real en VIDEO-EDITOR-02
        </div>
      </div>

    </div>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────

const LEGEND = [
  { dot: "#c2410c", label: "Vertical 9:16 — Reels, TikTok, Historias" },
  { dot: "#7c3aed", label: "Cuadrado 1:1 — Feed Instagram y Facebook"  },
  { dot: "#004AAD", label: "Horizontal 16:9 — YouTube, presentaciones" },
  { dot: "#16a34a", label: "Exportado y guardado en Biblioteca"         },
];
