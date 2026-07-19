"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type UploadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; title: string; documentId: string }
  | { status: "error"; message: string };

interface Props {
  organizationId: string;
  orgSlug: string;
  workspaceId?: string;
  projectId?: string;
}

export default function UploadForm({
  organizationId,
  orgSlug,
  workspaceId,
  projectId,
}: Props) {
  const router  = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [description, setDescription] = useState("");
  const [state, setState] = useState<UploadState>({ status: "idle" });

  const loading = state.status === "loading";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const file = fileRef.current?.files?.[0];
    if (!file) {
      setState({ status: "error", message: "Select a file first." });
      return;
    }

    setState({ status: "loading" });

    const body = new FormData();
    body.append("file",           file);
    body.append("organizationId", organizationId);
    if (description.trim()) body.append("description", description.trim());
    if (workspaceId)         body.append("workspaceId", workspaceId);
    if (projectId)           body.append("projectId",   projectId);

    try {
      // Do NOT set Content-Type — let the browser set multipart boundary automatically
      const res  = await fetch("/api/documents/upload", { method: "POST", body });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        setState({
          status:  "error",
          message: data.detail
            ? `${data.error}: ${data.detail}`
            : (data.error ?? `Upload failed (${res.status})`),
        });
        return;
      }

      setState({
        status:     "success",
        title:      data.document.title,
        documentId: data.document.id,
      });

      // Reset file input and description
      if (fileRef.current) fileRef.current.value = "";
      setDescription("");

      // Re-run the server component so the new document appears in the list
      router.refresh();
    } catch (err) {
      setState({
        status:  "error",
        message: err instanceof Error ? err.message : "Unexpected error",
      });
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display:       "flex",
        flexDirection: "column",
        gap:           "0.5rem",
        marginBottom:  "1.5rem",
        padding:       "12px 16px",
        border:        "1px solid #e0e0e0",
        borderRadius:  6,
        maxWidth:      600,
        background:    "#fafafa",
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
        Upload document
      </div>

      {/* File + submit on one row */}
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <label
            htmlFor="upload-file"
            style={{ display: "block", fontSize: 12, marginBottom: 3 }}
          >
            File
            <span style={{ opacity: 0.5, marginLeft: 4 }}>
              PDF · XML · PNG · JPG · CSV · XLSX — max 10 MB
            </span>
          </label>
          <input
            id="upload-file"
            ref={fileRef}
            type="file"
            accept=".pdf,.xml,.jpg,.jpeg,.png,.csv,.xlsx"
            disabled={loading}
            style={{ display: "block", width: "100%" }}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            padding:     "5px 14px",
            whiteSpace:  "nowrap",
            cursor:      loading ? "default" : "pointer",
            opacity:     loading ? 0.6 : 1,
          }}
        >
          {loading ? "Uploading…" : "Upload"}
        </button>
      </div>

      {/* Optional description */}
      <div>
        <label
          htmlFor="upload-description"
          style={{ display: "block", fontSize: 12, marginBottom: 3 }}
        >
          Description
          <span style={{ opacity: 0.5, marginLeft: 4 }}>optional — helps extraction</span>
        </label>
        <input
          id="upload-description"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={loading}
          placeholder="e.g. Factura ACME S.A.S. — NIT 900123456 — marzo 2024"
          style={{ width: "100%", fontSize: 13 }}
        />
      </div>

      {/* Feedback */}
      {state.status === "success" && (
        <p style={{ fontSize: 12, color: "#060", margin: 0 }}>
          ✓ Uploaded{" "}
          <a href={`/${orgSlug}/documents/${state.documentId}`}>
            {state.title}
          </a>
          . Document is ready to process.
        </p>
      )}
      {state.status === "error" && (
        <p style={{ fontSize: 12, color: "#c00", margin: 0 }}>
          {state.message}
        </p>
      )}
    </form>
  );
}
