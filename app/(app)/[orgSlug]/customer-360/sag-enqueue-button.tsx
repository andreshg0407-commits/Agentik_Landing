"use client";

/**
 * SagEnqueueButton — inline button on the Customer 360 ficha that creates
 * a PENDING SagWriteOperation (type 1 — customer upsert) from the customer's
 * current profile data.
 *
 * Never sends to SAG automatically.
 * After enqueue the user is redirected to the operation detail page where a
 * manager can approve, inspect the XML, and then execute.
 *
 * "Crear en SAG"     — shown when profile.erpId is null (no ERP record yet).
 * "Actualizar en SAG" — shown when profile.erpId is set (update existing).
 */

import { useState }  from "react";
import { useRouter } from "next/navigation";

interface CustomerSnap {
  id:          string;
  nit:         string | null;
  name:        string;
  email:       string | null;
  phone:       string | null;
  city:        string | null;
  department:  string | null;
  address:     string | null;
  erpId:       string | null;
}

interface Props {
  orgSlug:  string;
  customer: CustomerSnap;
}

type Phase = "idle" | "confirming" | "loading" | "done" | "error";

export default function SagEnqueueButton({ orgSlug, customer }: Props) {
  const router = useRouter();

  const [phase,    setPhase]    = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [opId,     setOpId]     = useState<string | null>(null);

  const isUpdate = Boolean(customer.erpId);
  const label    = isUpdate ? "Actualizar en SAG" : "Crear en SAG";

  // Only allow enqueue when NIT is available (required by SAG)
  const hasNit = Boolean(customer.nit && /^\d{9}$/.test(customer.nit));

  async function handleEnqueue() {
    setPhase("loading");
    setErrorMsg(null);

    const nombre = customer.name.trim().toUpperCase();
    const nit    = customer.nit!;

    const payload = {
      input: {
        type: 1,
        payload: {
          NIT:               nit,
          NOMBRE:            nombre,
          ...(customer.email      && { EMAIL:       customer.email.trim().toLowerCase() }),
          ...(customer.phone      && { TELEFONO:    customer.phone.trim() }),
          ...(customer.city       && { CIUDAD:      customer.city.trim().toUpperCase() }),
          ...(customer.department && { DEPARTAMENTO: customer.department.trim().toUpperCase() }),
          ...(customer.address    && { DIRECCION:   customer.address.trim() }),
          ACTIVO:           "S",
          ACTIVO_COMERCIAL: "S",
          ACTIVO_FIJO:      "N",
          COMISION_VENTAS:  0,
          COMISION_COBROS:  0,
          DESCUENTO:        0,
          DESCUENTO_PP:     0,
        },
      },
      description: isUpdate
        ? `Actualizar cliente "${nombre}" (NIT ${nit}) en SAG`
        : `Crear cliente "${nombre}" (NIT ${nit}) en SAG`,
      sourceRef: customer.id,
    };

    try {
      const res  = await fetch(`/api/orgs/${orgSlug}/sag/write`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setPhase("error");
        setErrorMsg(data?.error ?? "Error al crear la operación.");
        return;
      }

      setOpId(data.operationId);
      setPhase("done");
    } catch (e) {
      setPhase("error");
      setErrorMsg((e as Error).message);
    }
  }

  // ── No NIT — can't enqueue ────────────────────────────────────────────────

  if (!hasNit) {
    return (
      <span style={{ fontSize: 11, color: "#9ca3af", fontStyle: "italic" }}>
        Sin NIT — no se puede enviar a SAG
      </span>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────

  if (phase === "error") {
    return (
      <div style={{ fontSize: 11 }}>
        <span style={{ color: "#b91c1c" }}>{errorMsg}</span>
        <button
          onClick={() => { setPhase("idle"); setErrorMsg(null); }}
          style={{
            marginLeft: 8, fontSize: 11, cursor: "pointer", padding: "2px 8px",
            border: "1px solid #d1d5db", borderRadius: 3, background: "#fff", color: "#374151",
          }}
        >
          Cerrar
        </button>
      </div>
    );
  }

  // ── Done — show success + link ────────────────────────────────────────────

  if (phase === "done" && opId) {
    return (
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "6px 12px", borderRadius: 6,
        background: "#f0fdf4", border: "1px solid #bbf7d0", fontSize: 12,
      }}>
        <span style={{ color: "#15803d", fontWeight: 700 }}>✓ Operación creada</span>
        <span style={{ color: "#6b7280" }}>—</span>
        <span style={{ fontSize: 11, color: "#6b7280" }}>
          Pendiente de aprobación.
        </span>
        <button
          onClick={() => router.push(`/${orgSlug}/sag/write/${opId}`)}
          style={{
            fontSize: 11, cursor: "pointer", padding: "2px 10px",
            border: "1px solid #16a34a", borderRadius: 4,
            background: "#16a34a", color: "#fff", fontWeight: 600,
          }}
        >
          Ver operación →
        </button>
      </div>
    );
  }

  // ── Confirming — show warning before sending ──────────────────────────────

  if (phase === "confirming") {
    return (
      <div style={{
        padding: "12px 16px", borderRadius: 6, maxWidth: 440,
        background: "#fffbeb", border: "1px solid #fde68a",
      }}>
        <div style={{ fontWeight: 700, color: "#92400e", fontSize: 12, marginBottom: 6 }}>
          ⚠ {label}
        </div>
        <div style={{ fontSize: 12, color: "#78350f", marginBottom: 12 }}>
          Esta solicitud quedará <b>pendiente de aprobación</b> antes de enviarse al ERP.
          Un administrador o gerente deberá aprobarla en la Cola de Aprobación SAG.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleEnqueue}
            style={{
              fontSize: 12, fontWeight: 700, padding: "5px 14px", borderRadius: 5,
              border: "2px solid #15803d", background: "#15803d", color: "#fff",
              cursor: "pointer",
            }}
          >
            Confirmar y poner en cola
          </button>
          <button
            onClick={() => setPhase("idle")}
            style={{
              fontSize: 12, padding: "5px 12px", borderRadius: 5,
              border: "1px solid #d1d5db", background: "#f9fafb", color: "#374151",
              cursor: "pointer",
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  // ── Idle / loading ────────────────────────────────────────────────────────

  return (
    <button
      onClick={() => setPhase("confirming")}
      disabled={phase === "loading"}
      style={{
        fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 5,
        border: `1px solid ${isUpdate ? "#1d4ed8" : "#15803d"}`,
        background: isUpdate ? "#eff6ff" : "#f0fdf4",
        color:      isUpdate ? "#1d4ed8" : "#15803d",
        cursor:     phase === "loading" ? "not-allowed" : "pointer",
        opacity:    phase === "loading" ? 0.5 : 1,
        fontFamily: "monospace",
      }}
    >
      {phase === "loading" ? "Procesando…" : label}
    </button>
  );
}
