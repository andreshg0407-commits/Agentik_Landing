import { requireOrgAccess } from "@/lib/auth/org-access";
import { prisma } from "@/lib/prisma";
import ContextHeader from "@/components/app/context-header";
import DocumentCreateForm from "./document-create-form";

async function getOrgContext(organizationId: string) {
  const [workspaces, projects] = await Promise.all([
    prisma.workspace.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.project.findMany({
      where: { organizationId },
      select: { id: true, name: true, key: true, workspaceId: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { workspaces, projects };
}

export default async function NewDocumentPage({
  params,
}: {
  params: { orgSlug: string };
}) {
  const { organization } = await requireOrgAccess(params.orgSlug);
  const { workspaces, projects } = await getOrgContext(organization.id);

  return (
    <main>
      <ContextHeader organization={organization} />
      <h1>New Document</h1>
      <DocumentCreateForm
        organizationId={organization.id}
        orgSlug={params.orgSlug}
        workspaces={workspaces}
        projects={projects}
      />
    </main>
  );
}
