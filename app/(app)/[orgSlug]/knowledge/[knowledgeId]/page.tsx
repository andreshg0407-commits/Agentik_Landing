import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { getKnowledgeItem, extractTraceability } from "@/lib/knowledge/queries";
import ContextHeader from "@/components/app/context-header";

export default async function KnowledgeDetailPage({
  params,
}: {
  params: { orgSlug: string; knowledgeId: string };
}) {
  const { organization } = await requireOrgAccess(params.orgSlug);
  const item = await getKnowledgeItem(params.knowledgeId, organization.id);

  if (!item) notFound();

  const trace = extractTraceability(item.contentJson);

  return (
    <main>
      <ContextHeader organization={organization} />
      <h1>{item.title}</h1>

      {item.content && (
        <>
          <h2>Content</h2>
          <p style={{ whiteSpace: "pre-wrap" }}>{item.content}</p>
        </>
      )}

      <h2>Details</h2>
      <dl>
        {item.project && (
          <>
            <dt>Project</dt>
            <dd>{item.project.name} ({item.project.key})</dd>
          </>
        )}

        {item.tags.length > 0 && (
          <>
            <dt>Tags</dt>
            <dd>{item.tags.join(", ")}</dd>
          </>
        )}

        <dt>Created</dt>
        <dd>{item.createdAt.toISOString().slice(0, 19).replace("T", " ")} UTC</dd>

        <dt>Updated</dt>
        <dd>{item.updatedAt.toISOString().slice(0, 19).replace("T", " ")} UTC</dd>
      </dl>

      <h2>Traceability</h2>
      <dl>
        {trace.sourceId ? (
          <>
            <dt>Source document</dt>
            <dd>
              <Link href={`/${params.orgSlug}/documents/${trace.sourceId}`}>
                {trace.sourceId}
              </Link>
            </dd>
          </>
        ) : (
          <>
            <dt>Source document</dt>
            <dd>—</dd>
          </>
        )}

        {trace.runId && (
          <>
            <dt>Indexing run</dt>
            <dd>
              <Link href={`/${params.orgSlug}/runs/${trace.runId}`}>
                {trace.runId}
              </Link>
            </dd>
          </>
        )}

        {trace.indexedAt && (
          <>
            <dt>Indexed at</dt>
            <dd>{trace.indexedAt}</dd>
          </>
        )}

        {trace.indexedBy && (
          <>
            <dt>Indexed by</dt>
            <dd>{trace.indexedBy}</dd>
          </>
        )}
      </dl>

      <p>
        <Link href={`/${params.orgSlug}/knowledge`}>← Back to knowledge</Link>
      </p>
    </main>
  );
}
