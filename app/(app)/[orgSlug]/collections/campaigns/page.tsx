/**
 * app/(app)/[orgSlug]/collections/campaigns/page.tsx
 *
 * Collections Campaign Dashboard.
 *
 * Shows:
 *   - Campaign launcher form (MANAGER+ only)
 *   - Active + past campaigns list with progress bars
 *   - Per-campaign: cohort size, completion, paid/promise/no-contact, recovery
 *   - Template selector showing Mila tone per DPD bucket
 */

import Link                       from "next/link";
import { requireOrgAccess }       from "@/lib/auth/org-access";
import { getActiveCampaigns }     from "@/lib/collections/campaigns";
import { CAMPAIGN_TEMPLATES }     from "@/lib/collections/campaign-templates";
import { canManageCampaigns }     from "@/lib/auth/module-access";
import { C, T, S, R }             from "@/lib/ui/tokens";
import { Panel, PanelHeader, Badge, KpiCard } from "@/components/shell/primitives";
import CampaignLauncher           from "./_campaign-launcher";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCOP(n: number): string {
  if (n >= 1_000_000_000) return "$" + (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000)     return "$" + (n / 1_000_000).toFixed(0) + "M";
  return "$" + new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(n);
}

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}

const BUCKET_LABEL: Record<string, string> = {
  "0_30":    "0–30 días",
  "31_60":   "31–60 días",
  "61_90":   "61–90 días",
  "91_180":  "91–180 días",
  "181_plus": "181+ días",
};

const BUCKET_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  "0_30":    { bg: "#f0fdf4", text: "#14532d", border: "#bbf7d0" },
  "31_60":   { bg: "#fefce8", text: "#854d0e", border: "#fde047" },
  "61_90":   { bg: "#fffbeb", text: "#92400e", border: "#fde68a" },
  "91_180":  { bg: "#fef2f2", text: "#991b1b", border: "#fca5a5" },
  "181_plus": { bg: "#fdf2f8", text: "#86198f", border: "#f0abfc" },
};

const TONE_BADGE: Record<string, { label: string; color: string }> = {
  "cortés":    { label: "Cortés",    color: "#14532d" },
  "formal":    { label: "Formal",    color: "#1e40af" },
  "urgente":   { label: "Urgente",   color: "#92400e" },
  "pre-legal": { label: "Pre-Legal", color: "#991b1b" },
  "legal":     { label: "Legal",     color: "#86198f" },
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function CampaignsDashboardPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }          = await params;
  const { organization, membership } = await requireOrgAccess(orgSlug);
  const canLaunch            = canManageCampaigns(membership.role);

  const campaigns = await getActiveCampaigns(organization.id).catch(() => []);

  const totalCampaigns   = campaigns.length;
  const totalContacts    = campaigns.reduce((s, c) => s + c.total, 0);
  const totalCompleted   = campaigns.reduce((s, c) => s + c.completed, 0);
  const totalPaid        = campaigns.reduce((s, c) => s + c.paid, 0);
  const totalRecovery    = campaigns.reduce((s, c) => s + c.estimatedRecovery, 0);

  return (
    <div style={{ fontFamily: "monospace", maxWidth: 1100 }}>

      {/* ── Breadcrumb ── */}
      <div style={{ fontSize: T.sz.sm, color: C.inkFaint, marginBottom: S[1] + 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        <Link href={`/${orgSlug}/dashboard`} style={{ color: C.inkFaint, textDecoration: "none" }}>
          {organization.name}
        </Link>
        {" "} ›{" "}
        <Link href={`/${orgSlug}/collections`} style={{ color: C.inkFaint, textDecoration: "none" }}>
          Cola de Cobranza
        </Link>
        {" "} › Campañas
      </div>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24, paddingBottom: 16, borderBottom: `1.5px solid ${C.ink}` }}>
        <div>
          <h1 style={{ margin: 0, fontSize: T.sz["3xl"], fontWeight: T.wt.black, color: C.ink, letterSpacing: "-0.02em" }}>
            Campañas de Cobranza
          </h1>
          <div style={{ fontSize: T.sz.sm, color: C.inkLight, marginTop: 3 }}>
            {organization.name} · Gestión autónoma por cohorte de mora
          </div>
        </div>
        <div style={{ display: "flex", gap: S[2], marginLeft: "auto", alignItems: "center" }}>
          <Badge variant="neutral">{totalCampaigns} campañas</Badge>
          <Link
            href={`/${orgSlug}/collections/performance`}
            style={{
              fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.brand,
              background: "#f5f3ff", border: "1px solid #ddd6fe",
              borderRadius: 4, padding: "3px 10px", textDecoration: "none",
            }}
          >
            📊 Rendimiento →
          </Link>
        </div>
      </div>

      {/* ── KPI summary ── */}
      {totalCampaigns > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: S[3], marginBottom: S[5] }}>
          <KpiCard
            label="Campañas activas"
            sublabel="en todos los buckets"
            value={String(totalCampaigns)}
            dotColor="#7c3aed"
          />
          <KpiCard
            label="Contactos gestionados"
            sublabel={`${totalCompleted} completados`}
            value={String(totalContacts)}
            dotColor={C.brand}
          />
          <KpiCard
            label="Pagos confirmados"
            sublabel={`${totalContacts > 0 ? Math.round((totalPaid / totalContacts) * 100) : 0}% del total`}
            value={String(totalPaid)}
            dotColor={C.green}
          />
          <KpiCard
            label="Recuperación estimada"
            sublabel="promesas + pagos parciales"
            value={fmtCOP(totalRecovery)}
            dotColor={C.green}
            urgent={totalRecovery > 0}
          />
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: S[5], alignItems: "start" }}>

        {/* ── Left: campaigns list ── */}
        <div>
          <Panel>
            <PanelHeader
              title="📣 Campañas activas"
              badge={<Badge variant={totalCampaigns > 0 ? "brand" : "neutral"}>{totalCampaigns} total</Badge>}
              cta={{ label: "Cola →", href: `/${orgSlug}/collections` }}
            />

            {campaigns.length === 0 ? (
              <div style={{ padding: `${S[6]}px ${S[5]}px`, textAlign: "center", color: C.inkFaint }}>
                <div style={{ fontSize: 32, marginBottom: S[2] }}>📣</div>
                <div style={{ fontWeight: T.wt.bold, fontSize: T.sz.base, marginBottom: S[1] }}>
                  Sin campañas activas
                </div>
                <div style={{ fontSize: T.sz.sm }}>
                  Lanza tu primera campaña para contactar un cohorte de clientes en mora.
                </div>
              </div>
            ) : (
              <div>
                {campaigns.map((campaign) => {
                  const bucketColor = BUCKET_COLOR[campaign.bucket] ?? BUCKET_COLOR["0_30"]!;
                  const pct = campaign.completionRate;
                  const barColor = pct >= 80 ? C.green : pct >= 50 ? C.amber : C.brand;

                  return (
                    <div
                      key={campaign.campaignId}
                      style={{
                        borderBottom: `1px solid ${C.lineSubtle}`,
                        padding:      `${S[3]}px ${S[4]}px`,
                      }}
                    >
                      {/* Campaign header row */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: S[2] }}>
                        <div>
                          <div style={{ fontWeight: T.wt.bold, color: C.ink, fontSize: T.sz.base }}>
                            {campaign.campaignName}
                          </div>
                          <div style={{ fontSize: T.sz.xs, color: C.inkFaint, marginTop: 2 }}>
                            Lanzada {fmtDate(campaign.createdAt)} · por {campaign.createdBy}
                          </div>
                        </div>
                        <span style={{
                          background: bucketColor.bg, color: bucketColor.text,
                          border: `1px solid ${bucketColor.border}`,
                          borderRadius: R.sm, padding: "2px 8px",
                          fontSize: T.sz.xs, fontWeight: T.wt.bold,
                          whiteSpace: "nowrap",
                        }}>
                          {BUCKET_LABEL[campaign.bucket]}
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div style={{ marginBottom: S[2] }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: T.sz.xs, color: C.inkLight }}>
                          <span>{campaign.completed} / {campaign.total} completados</span>
                          <span style={{ fontWeight: T.wt.bold, color: barColor }}>{pct}%</span>
                        </div>
                        <div style={{ height: 6, background: C.lineSubtle, borderRadius: 3, overflow: "hidden" }}>
                          <div style={{
                            height: "100%",
                            width:  `${pct}%`,
                            background: barColor,
                            borderRadius: 3,
                            transition: "width 0.3s",
                          }} />
                        </div>
                      </div>

                      {/* Outcome chips */}
                      <div style={{ display: "flex", gap: S[2], flexWrap: "wrap", fontSize: T.sz.xs }}>
                        <span style={{ color: C.green, fontWeight: T.wt.semibold }}>
                          ✓ {campaign.paid} pagos
                        </span>
                        <span style={{ color: "#1e40af" }}>
                          🤝 {campaign.promise} promesas
                        </span>
                        <span style={{ color: C.inkLight }}>
                          📵 {campaign.noContact} sin contacto
                        </span>
                        {campaign.estimatedRecovery > 0 && (
                          <span style={{ color: C.green, fontWeight: T.wt.bold, marginLeft: "auto" }}>
                            {fmtCOP(campaign.estimatedRecovery)} recuperación estimada
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        {/* ── Right: launcher + templates ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>

          {/* Campaign launcher */}
          {canLaunch ? (
            <div style={{
              background: "#faf5ff",
              border: "1px solid #e9d5ff",
              borderRadius: R.xl,
              overflow: "hidden",
            }}>
              <div style={{
                background: "#7c3aed",
                padding: `${S[2] + 2}px ${S[3]}px`,
                fontFamily: T.mono,
                fontSize: T.sz.xs,
                fontWeight: T.wt.bold,
                color: "#fff",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}>
                🚀 Lanzar campaña
              </div>
              <div style={{ padding: S[3] }}>
                <CampaignLauncher orgSlug={orgSlug} />
              </div>
            </div>
          ) : (
            <div style={{
              background: C.surfaceAlt, border: `1px solid ${C.line}`,
              borderRadius: R.xl, padding: S[3], fontSize: T.sz.xs, color: C.inkFaint,
              textAlign: "center",
            }}>
              Se requiere rol de Gerente o superior para lanzar campañas.
            </div>
          )}

          {/* Mila templates reference */}
          <Panel>
            <PanelHeader title="🤖 Templates Mila por tramo" />
            <div style={{ padding: `0 ${S[1]}px ${S[2]}px` }}>
              {CAMPAIGN_TEMPLATES.map(tpl => {
                const bucketColor = BUCKET_COLOR[tpl.bucket] ?? BUCKET_COLOR["0_30"]!;
                const toneMeta    = TONE_BADGE[tpl.tone];
                return (
                  <div key={tpl.key} style={{
                    borderBottom: `1px solid ${C.lineSubtle}`,
                    padding: `${S[2]}px ${S[2]}px`,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontWeight: T.wt.semibold, fontSize: T.sz.xs, color: C.ink }}>
                        {tpl.name}
                      </span>
                      <span style={{
                        background: bucketColor.bg, color: bucketColor.text,
                        border: `1px solid ${bucketColor.border}`,
                        borderRadius: R.sm, padding: "1px 6px", fontSize: 10, fontWeight: T.wt.bold,
                      }}>
                        {BUCKET_LABEL[tpl.bucket]}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: S[2], fontSize: 10, color: C.inkLight }}>
                      <span style={{ color: toneMeta?.color ?? C.inkMid, fontWeight: T.wt.semibold }}>
                        {toneMeta?.label ?? tpl.tone}
                      </span>
                      <span>·</span>
                      <span style={{ textTransform: "capitalize" }}>{tpl.channel}</span>
                    </div>
                    <div style={{ fontSize: 10, color: C.inkFaint, marginTop: 3, lineHeight: 1.4 }}>
                      {tpl.scriptHint.slice(0, 90)}…
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{ fontSize: T.sz.xs, color: C.inkGhost, textAlign: "right", paddingTop: S[2], paddingBottom: S[4] }}>
        Campañas de Cobranza · {organization.name}
      </div>
    </div>
  );
}
