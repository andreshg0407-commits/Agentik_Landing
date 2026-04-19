import Link from "next/link";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { listKnowledgeItems, extractTraceability } from "@/lib/knowledge/queries";
import ContextHeader from "@/components/app/context-header";

function preview(content: string | null | undefined, max = 120) {
  if (!content) return "—";
  return content.length > max ? content.slice(0, max) + "…" : content;
}

export default async function KnowledgePage({
  params,
  searchParams,
}: {
  params: { orgSlug: string };
  searchParams: { q?: string; tag?: string };
}) {
  const { organization } = await requireOrgAccess(params.orgSlug);

  const query = searchParams.q?.trim() || undefined;
  const tag   = searchParams.tag?.trim() || undefined;

  const items = await listKnowledgeItems(organization.id, { query, tag });

  const hasFilters = Boolean(query || tag);

  return (
    <main>
      <ContextHeader organization={organization} />
      <h1>Conocimiento</h1>

      <form method="GET" style={{ display: "flex", gap: "0.75rem", marginBottom: "1.25rem", alignItems: "flex-end" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <label htmlFor="q">Buscar</label>
          <input
            id="q"
            name="q"
            type="text"
            defaultValue={query ?? ""}
            placeholder="Título o contenido…"
            style={{ width: "260px" }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <label htmlFor="tag">Etiqueta</label>
          <input
            id="tag"
            name="tag"
            type="text"
            defaultValue={tag ?? ""}
            placeholder="ej. source:document"
            style={{ width: "200px" }}
          />
        </div>

        <button type="submit">Buscar</button>

        {hasFilters && (
          <Link href={`/${params.orgSlug}/knowledge`}>Limpiar</Link>
        )}
      </form>

      {items.length === 0 ? (
        <p>{hasFilters ? "Sin resultados." : "Aún no hay elementos de conocimiento."}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Título</th>
              <th>Vista previa</th>
              <th>Documento fuente</th>
              <th>Etiquetas</th>
              <th>Creado</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const trace = extractTraceability(item.contentJson);
              return (
                <tr key={item.id}>
                  <td>
                    <Link href={`/${params.orgSlug}/knowledge/${item.id}`}>
                      {item.title}
                    </Link>
                  </td>
                  <td>{preview(item.content)}</td>
                  <td>
                    {trace.sourceId ? (
                      <Link href={`/${params.orgSlug}/documents/${trace.sourceId}`}>
                        {trace.sourceId.slice(0, 8)}
                      </Link>
                    ) : "—"}
                  </td>
                  <td>{item.tags.join(", ") || "—"}</td>
                  <td>{item.createdAt.toISOString().slice(0, 10)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
