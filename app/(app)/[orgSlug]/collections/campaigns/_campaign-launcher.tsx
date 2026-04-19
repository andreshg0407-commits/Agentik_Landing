"use client";

/**
 * app/(app)/[orgSlug]/collections/campaigns/_campaign-launcher.tsx
 *
 * Client component: form to launch a new cohort campaign.
 * POSTs to /api/orgs/[orgSlug]/collections/campaigns.
 * On success, refreshes the page.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  orgSlug: string;
}

type DpdBucket = "0_30" | "31_60" | "61_90" | "91_180" | "181_plus";

const BUCKET_OPTIONS: { value: DpdBucket; label: string }[] = [
  { value: "0_30",    label: "0–30 días · Cortesía" },
  { value: "31_60",   label: "31–60 días · Acuerdo" },
  { value: "61_90",   label: "61–90 días · Formal" },
  { value: "91_180",  label: "91–180 días · Pre-legal" },
  { value: "181_plus", label: "181+ días · Legal" },
];

const input: React.CSSProperties = {
  width: "100%",
  fontSize: 12,
  padding: "5px 8px",
  border: "1px solid #d8b4fe",
  borderRadius: 4,
  background: "#fff",
  fontFamily: "monospace",
  boxSizing: "border-box",
};

const label: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "#6b21a8",
  textTransform: "uppercase" as const,
  display: "block",
  marginBottom: 3,
  letterSpacing: "0.04em",
};

export default function CampaignLauncher({ orgSlug }: Props) {
  const router = useRouter();

  const [name,         setName]         = useState("");
  const [bucket,       setBucket]       = useState<DpdBucket>("31_60");
  const [minOverdue,   setMinOverdue]   = useState("");
  const [maxCustomers, setMaxCustomers] = useState("100");
  const [seller,       setSeller]       = useState("");
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [result,       setResult]       = useState<{ campaignId: string; tasksCreated: number } | null>(null);

  async function handleLaunch() {
    if (!name.trim()) { setError("El nombre de la campaña es requerido."); return; }
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`/api/orgs/${orgSlug}/collections/campaigns`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignName: name.trim(),
          filter: {
            dpd_bucket:    bucket,
            min_overdue:   minOverdue ? Number(minOverdue) : undefined,
            max_customers: maxCustomers ? Number(maxCustomers) : 100,
            seller_filter: seller.trim() || undefined,
          },
        }),
      });

      const data = await res.json() as { ok?: boolean; error?: string; campaignId?: string; tasksCreated?: number };
      if (!res.ok) throw new Error(data.error ?? "Error al lanzar campaña");

      setResult({ campaignId: data.campaignId!, tasksCreated: data.tasksCreated! });
      setName("");
      setSeller("");
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div style={{ textAlign: "center", padding: "12px 0" }}>
        <div style={{ fontSize: 24, marginBottom: 6 }}>🚀</div>
        <div style={{ fontWeight: 700, color: "#14532d", fontSize: 13, marginBottom: 4 }}>
          Campaña lanzada
        </div>
        <div style={{ fontSize: 11, color: "#374151" }}>
          {result.tasksCreated} tareas creadas
        </div>
        <button
          onClick={() => setResult(null)}
          style={{
            marginTop: 10, fontSize: 11, color: "#7c3aed",
            background: "none", border: "none", cursor: "pointer", textDecoration: "underline",
          }}
        >
          Lanzar otra campaña
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* Campaign name */}
      <div>
        <span style={label}>Nombre de la campaña *</span>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Ej: Campaña abril +60d"
          style={input}
        />
      </div>

      {/* DPD bucket */}
      <div>
        <span style={label}>Tramo de mora *</span>
        <select
          value={bucket}
          onChange={e => setBucket(e.target.value as DpdBucket)}
          style={input}
        >
          {BUCKET_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Min overdue */}
      <div>
        <span style={label}>Saldo mínimo vencido (COP)</span>
        <input
          type="number"
          value={minOverdue}
          onChange={e => setMinOverdue(e.target.value)}
          placeholder="Ej: 1000000 (sin límite si vacío)"
          style={input}
        />
      </div>

      {/* Max customers */}
      <div>
        <span style={label}>Máx. clientes en campaña</span>
        <input
          type="number"
          value={maxCustomers}
          onChange={e => setMaxCustomers(e.target.value)}
          min={1}
          max={500}
          style={input}
        />
      </div>

      {/* Seller filter */}
      <div>
        <span style={label}>Filtrar por vendedor (opcional)</span>
        <input
          type="text"
          value={seller}
          onChange={e => setSeller(e.target.value)}
          placeholder="Nombre parcial del vendedor"
          style={input}
        />
      </div>

      {/* Error */}
      {error && (
        <div style={{ fontSize: 11, color: "#dc2626" }}>{error}</div>
      )}

      {/* Launch button */}
      <button
        onClick={handleLaunch}
        disabled={loading || !name.trim()}
        style={{
          fontSize:   12,
          fontWeight: 700,
          color:      "#fff",
          background: loading || !name.trim() ? "#9ca3af" : "#7c3aed",
          border:     "none",
          borderRadius: 5,
          padding:    "7px 14px",
          cursor:     loading || !name.trim() ? "default" : "pointer",
          fontFamily: "monospace",
          marginTop:  4,
        }}
      >
        {loading ? "Lanzando…" : "🚀 Lanzar campaña"}
      </button>

      <div style={{ fontSize: 10, color: "#a78bfa", lineHeight: 1.4, textAlign: "center" }}>
        Se crea una tarea de cobranza por cada cliente en el cohorte.
        Mila usará el template del tramo seleccionado.
      </div>
    </div>
  );
}
