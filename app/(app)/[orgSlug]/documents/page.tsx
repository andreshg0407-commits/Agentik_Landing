import Link from "next/link";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { listDocuments } from "@/lib/documents/queries";
import ContextHeader from "@/components/app/context-header";
import UploadForm from "@/components/documents/upload-form";
import { statusLabel } from "@/lib/ui/status-labels";

export default async function DocumentsPage({
  params,
}: {
  params: { orgSlug: string };
}) {
  const { organization } = await requireOrgAccess(params.orgSlug);
  const documents = await listDocuments(organization.id);

  return (
    <main>
      <ContextHeader organization={organization} />
      <h1>Documentos</h1>

      <UploadForm
        organizationId={organization.id}
        orgSlug={params.orgSlug}
      />

      <p>
        <Link href={`/${params.orgSlug}/documents/new`}>+ Nuevo documento</Link>
      </p>

      {documents.length === 0 ? (
        <p>Sin documentos.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Título</th>
              <th>Tipo</th>
              <th>Estado</th>
              <th>Espacio de trabajo</th>
              <th>Proyecto</th>
              <th>Creado</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={doc.id}>
                <td>
                  <Link href={`/${params.orgSlug}/documents/${doc.id}`}>
                    {doc.title}
                  </Link>
                </td>
                <td>{doc.type}</td>
                <td>{statusLabel(doc.status)}</td>
                <td>{doc.workspace?.name ?? "—"}</td>
                <td>{doc.project?.name ?? "—"}</td>
                <td>{doc.createdAt.toISOString().slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
