"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ReviewButtonProps {
  documentId:      string;
  organizationId:  string;
  documentStatus:  string;
  validationStatus: string | null | undefined;
}

export default function ReviewButton({
  documentId,
  organizationId,
  documentStatus,
  validationStatus,
}: ReviewButtonProps) {
  const router  = useRouter();
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReviewed  = documentStatus === "REVIEWED";
  const canReview   = validationStatus === "VALID" && !isReviewed;

  if (isReviewed) {
    return (
      <span style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 12,
        fontWeight: 700,
        color: "#fff",
        background: "#2e7d32",
        border: "1px solid #1b5e20",
        borderRadius: 5,
        padding: "5px 12px",
        letterSpacing: "0.05em",
      }}>
        ✓ REVISADO
      </span>
    );
  }

  if (!canReview) {
    return (
      <span
        title={validationStatus !== "VALID" ? "Resuelva todos los errores de validación primero" : undefined}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          fontSize: 12,
          color: "#aaa",
          border: "1px solid #ddd",
          borderRadius: 5,
          padding: "5px 12px",
          cursor: "not-allowed",
        }}
      >
        Marcar como revisado
      </span>
    );
  }

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al aprobar");
      } else {
        router.refresh();
      }
    } catch {
      setError("Error de red");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
      <button
        onClick={handleClick}
        disabled={busy}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 14px",
          background: busy ? "#ccc" : "#2e7d32",
          color: "white",
          border: "none",
          borderRadius: 5,
          fontSize: 13,
          fontWeight: 600,
          cursor: busy ? "not-allowed" : "pointer",
        }}
      >
        {busy ? "Guardando…" : "✓ Aprobar documento"}
      </button>
      {error && (
        <span style={{ fontSize: 12, color: "#b71c1c" }}>{error}</span>
      )}
    </div>
  );
}
