/**
 * app/(app)/[orgSlug]/aprobaciones/page.tsx
 *
 * Agentik — Aprobaciones — Server Component
 * Sprint: AGENTIK-APPROVAL-INBOX-01
 *
 * Validates org access, fetches approvals from approvalService,
 * builds ViewModel, and passes it to the Client Component.
 * No Prisma here — access only via approvalService.
 */

import { requireOrgAccess }           from "@/lib/auth/org-access";
import { approvalService }            from "@/lib/approvals/approval-service";
import { buildApprovalInboxViewModel } from "@/lib/approvals/viewmodel/approval-inbox-viewmodel";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { ApprovalInboxClient }        from "./approval-inbox-client";

export default async function AprobacionesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  await requireOrgAccess(orgSlug);

  const listResult = await approvalService.listApprovals(orgSlug).catch(() => ({
    success:    false,
    message:    "Error al cargar aprobaciones.",
    approvals:  [],
    totalCount: 0,
  }));

  const viewModel = buildApprovalInboxViewModel(listResult.approvals ?? []);

  const { summary } = viewModel;

  const statusSignal =
    summary.critical > 0 ? "critical" :
    summary.pending  > 0 ? "warning"  :
    "ok";

  const statusLabel =
    summary.critical > 0
      ? `${summary.critical} crítica${summary.critical !== 1 ? "s" : ""}`
      : summary.pending > 0
        ? `${summary.pending} pendiente${summary.pending !== 1 ? "s" : ""}`
        : summary.total === 0
          ? "Sin aprobaciones"
          : `${summary.total} total`;

  return (
    <div>
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Gestión",       href: `/${orgSlug}/dashboard` },
          { label: "Aprobaciones" },
        ]}
        title="Aprobaciones"
        subtitle="Solicitudes pendientes de decisión y aprobaciones recientes."
        status={statusSignal}
        statusLabel={statusLabel}
      />

      <ApprovalInboxClient orgSlug={orgSlug} viewModel={viewModel} />
    </div>
  );
}
