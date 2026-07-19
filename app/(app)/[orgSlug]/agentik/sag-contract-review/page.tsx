/**
 * app/(app)/[orgSlug]/agentik/sag-contract-review/page.tsx
 *
 * SAG × Agentik Data Contract Review — RSC page.
 * Builds contract data server-side and passes to client workspace.
 *
 * Sprint: AGENTIK-SAG-CONTRACT-REVIEW-WORKSPACE-01
 */

import { OperationalWorkspaceHeader }  from "@/components/workspace/operational-workspace-header";
import { buildSagExecutiveContract }   from "@/lib/integrations/sag/data-contract/export/sag-contract-export";
import { buildExecutiveSummary }       from "@/lib/integrations/sag/data-contract/sag-field-catalog";
import { ContractReviewWorkspace }     from "./contract-review-workspace";

interface PageProps {
  params: { orgSlug: string };
}

export default function SagContractReviewPage({ params }: PageProps) {
  const { orgSlug }  = params;
  const contract     = buildSagExecutiveContract();
  const summary      = buildExecutiveSummary();

  const agreedCount  = contract.statusDominios.filter(d => d.status === "agreed").length;
  const totalDomains = contract.statusDominios.length;

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px 64px" }}>

      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Agentik",          href: `/${orgSlug}/agentik`          },
          { label: "SAG Contract Review"                                      },
        ]}
        title="SAG × Agentik — Data Contract Review"
        subtitle={`v${contract.meta.version} · Última reunión ${contract.meta.fechaUltimaReunion} · ${totalDomains} dominios · ${contract.vistasRequeridas.length} vistas`}
        status={agreedCount < totalDomains ? "warning" : "ok"}
        statusLabel={agreedCount < totalDomains ? "Pendiente aprobación" : "Listo para envío"}
      />

      <ContractReviewWorkspace contract={contract} summary={summary} />

    </div>
  );
}
