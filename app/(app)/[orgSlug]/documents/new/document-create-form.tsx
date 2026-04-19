"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DocumentType } from "@prisma/client";

const DOCUMENT_TYPES = Object.values(DocumentType);

const field: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
  marginBottom: "1rem",
};

const input: React.CSSProperties = {
  width: "100%",
  maxWidth: "480px",
};

interface Workspace {
  id: string;
  name: string;
}

interface Project {
  id: string;
  name: string;
  key: string;
  workspaceId: string | null;
}

interface Props {
  organizationId: string;
  orgSlug: string;
  workspaces: Workspace[];
  projects: Project[];
}

export default function DocumentCreateForm({
  organizationId,
  orgSlug,
  workspaces,
  projects,
}: Props) {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [type, setType] = useState<DocumentType>(DocumentType.OTHER);
  const [description, setDescription] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [projectId, setProjectId] = useState("");

  const [fileUrl, setFileUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileMimeType, setFileMimeType] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleWorkspaceChange(value: string) {
    setWorkspaceId(value);
    if (projectId) {
      const proj = projects.find((p) => p.id === projectId);
      if (proj && proj.workspaceId && proj.workspaceId !== value) {
        setProjectId("");
      }
    }
  }

  const visibleProjects = workspaceId
    ? projects.filter((p) => !p.workspaceId || p.workspaceId === workspaceId)
    : projects;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("El título es obligatorio.");
      return;
    }

    const file = fileUrl.trim()
      ? {
          url: fileUrl.trim(),
          name: fileName.trim() || fileUrl.trim().split("/").pop() || "file",
          mimeType: fileMimeType.trim() || null,
        }
      : null;

    setSubmitting(true);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          workspaceId: workspaceId || null,
          projectId: projectId || null,
          type,
          title: title.trim(),
          description: description.trim() || null,
          file,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data.detail ? `${data.error}: ${data.detail}` : (data.error ?? "Error al crear el documento.");
        setError(msg);
        setSubmitting(false);
        return;
      }

      router.push(`/${orgSlug}/documents/${data.document.id}`);
    } catch {
      setError("Error inesperado. Intente nuevamente.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: "560px" }}>
      {error && (
        <p style={{ color: "red", marginBottom: "1rem" }}>{error}</p>
      )}

      <div style={field}>
        <label htmlFor="title">Título *</label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={input}
          required
        />
      </div>

      <div style={field}>
        <label htmlFor="type">Tipo *</label>
        <select
          id="type"
          value={type}
          onChange={(e) => setType(e.target.value as DocumentType)}
          style={input}
        >
          {DOCUMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div style={field}>
        <label htmlFor="description">Descripción</label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          style={input}
        />
      </div>

      {workspaces.length > 0 && (
        <div style={field}>
          <label htmlFor="workspace">Espacio de trabajo</label>
          <select
            id="workspace"
            value={workspaceId}
            onChange={(e) => handleWorkspaceChange(e.target.value)}
            style={input}
          >
            <option value="">— Ninguno —</option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {projects.length > 0 && (
        <div style={field}>
          <label htmlFor="project">Proyecto</label>
          <select
            id="project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            style={input}
          >
            <option value="">— Ninguno —</option>
            {visibleProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.key})
              </option>
            ))}
          </select>
        </div>
      )}

      <fieldset style={{ marginBottom: "1rem", maxWidth: "560px" }}>
        <legend>Archivo (opcional)</legend>

        <div style={field}>
          <label htmlFor="fileUrl">URL</label>
          <input
            id="fileUrl"
            type="text"
            value={fileUrl}
            onChange={(e) => setFileUrl(e.target.value)}
            placeholder="https://..."
            style={input}
          />
        </div>

        <div style={field}>
          <label htmlFor="fileName">Nombre del archivo</label>
          <input
            id="fileName"
            type="text"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            placeholder="invoice.pdf"
            style={input}
          />
        </div>

        <div style={field}>
          <label htmlFor="fileMimeType">Tipo MIME</label>
          <input
            id="fileMimeType"
            type="text"
            value={fileMimeType}
            onChange={(e) => setFileMimeType(e.target.value)}
            placeholder="application/pdf"
            style={input}
          />
        </div>
      </fieldset>

      <div style={{ display: "flex", gap: "0.75rem" }}>
        <button type="submit" disabled={submitting}>
          {submitting ? "Creando…" : "Crear documento"}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/${orgSlug}/documents`)}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
