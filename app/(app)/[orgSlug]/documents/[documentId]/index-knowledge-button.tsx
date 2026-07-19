"use client";

import { useState } from "react";

interface Props {
  documentId: string;
  organizationId: string;
}

export default function IndexKnowledgeButton({ documentId, organizationId }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [knowledgeItemId, setKnowledgeItemId] = useState<string | null>(null);

  async function handleIndex() {
    setState("loading");
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/documents/${documentId}/index`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErrorMessage(data.error ?? "Error al indexar el documento.");
        setState("error");
        return;
      }

      setKnowledgeItemId(data.knowledgeItem?.id ?? null);
      setState("done");
    } catch {
      setErrorMessage("Error inesperado.");
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <p>
        Conocimiento: indexado
        {knowledgeItemId && <> — elemento <code>{knowledgeItemId.slice(0, 8)}</code></>}
      </p>
    );
  }

  return (
    <>
      <button onClick={handleIndex} disabled={state === "loading"}>
        {state === "loading" ? "Indexando…" : "Indexar como conocimiento"}
      </button>
      {state === "error" && errorMessage && <p>{errorMessage}</p>}
    </>
  );
}
