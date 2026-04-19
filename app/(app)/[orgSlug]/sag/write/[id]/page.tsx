/**
 * /{orgSlug}/sag/write/{id}
 *
 * Detalle de operación SAG — full audit trail + approval/rejection action bar.
 *
 * Server component: loads operation at render time.
 * Client component: SagWriteApprovalPanel (action buttons with confirmation flow).
 */

import Link                        from "next/link";
import { notFound }                from "next/navigation";
import { requireOrgAccess }        from "@/lib/auth/org-access";
import { prisma }                  from "@/lib/prisma";
import ContextHeader               from "@/components/app/context-header";
import { statusLabel, badgeTone }  from "@/lib/ui/status-labels";
import SagWriteApprovalPanel       from "./sag-write-approval-panel";

// ── Label helpers ─────────────────────────────────────────────────────────────

const WRITE_TYPE_LABEL: Record<number, string> = {
  1:  "Cliente (upsert)",
  2:  "Documento (creación)",
  3:  "Tercero (upsert)",
  5:  "Artículo (upsert)",
  6:  "Recibo / Egreso",
  28: "Documento genérico",
};

const RISK_LABEL: Record<string, string>  = { LOW: "Bajo", MEDIUM: "Medio", HIGH: "Alto" };
const RISK_COLOR: Record<string, string>  = { LOW: "#15803d", MEDIUM: "#b45309", HIGH: "#b91c1c" };

function fmt(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 19).replace("T", " ") + " UTC";
}

function DtRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt style={{ color: "#6b7280", fontWeight: 600, paddingBottom: 8 }}>{label}</dt>
      <dd style={{ margin: 0, paddingBottom: 8 }}>{children}</dd>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function SagWriteDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; id: string }>;
}) {
  const { orgSlug, id } = await params;
  const { organization, membership } = await requireOrgAccess(orgSlug);
  const canApprove = ["MANAGER", "ORG_ADMIN", "SUPER_ADMIN"].includes(membership.role);

  const op = await prisma.sagWriteOperation.findFirst({
    where: { id, organizationId: organization.id },
  });

  if (!op) notFound();

  const isActionable = op.status === "PENDING" || op.status === "FAILED";

  return (
    <main>
      <ContextHeader organization={organization} />

      {/* Back link */}
      <div style={{ marginBottom: 16 }}>
        <Link
          href={`/${orgSlug}/sag/write`}
          style={{ fontSize: 13, color: "#6b7280", textDecoration: "none" }}
        >
          ← Cola de Aprobación SAG
        </Link>
      </div>

      <h1 style={{ marginBottom: 4 }}>Detalle de operación SAG</h1>
      <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 24, fontFamily: "monospace" }}>
        {op.id}
      </p>

      {/* ── Action bar (client) ──────────────────────────────────────────── */}
      {isActionable && (
        <section style={{ marginBottom: 32 }}>
          <SagWriteApprovalPanel
            orgSlug={orgSlug}
            operationId={op.id}
            status={op.status}
            canApprove={canApprove}
          />
        </section>
      )}

      {/* ── Metadata ──────────────────────────────────────────────────────── */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Resumen</h2>
        <dl style={{
          display: "grid", gridTemplateColumns: "180px 1fr",
          gap: "0", fontSize: 13,
          borderTop: "1px solid #f3f4f6",
          paddingTop: 8,
        }}>
          <DtRow label="Tipo de operación">
            <span style={{
              fontSize: 11, padding: "2px 10px", borderRadius: 4,
              background: "#f1f5f9", color: "#334155", fontWeight: 600,
            }}>
              {WRITE_TYPE_LABEL[op.writeType] ?? `Tipo ${op.writeType}`}
            </span>
          </DtRow>

          <DtRow label="Estado">
            <span style={{ fontWeight: 700, color: badgeTone(op.status) }}>
              {statusLabel(op.status)}
            </span>
            {op.retryCount > 0 && (
              <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 6 }}>
                {op.retryCount} reintento(s)
              </span>
            )}
          </DtRow>

          <DtRow label="Nivel de riesgo">
            <span style={{ fontWeight: 700, color: RISK_COLOR[op.risk] ?? "#888" }}>
              {RISK_LABEL[op.risk] ?? op.risk}
            </span>
          </DtRow>

          <DtRow label="Descripción">
            <span style={{ fontWeight: 500 }}>{op.description}</span>
          </DtRow>

          {op.sourceRef && (
            <DtRow label="Referencia origen">
              <code style={{ fontSize: 12, color: "#6b7280" }}>{op.sourceRef}</code>
            </DtRow>
          )}

          <DtRow label="Iniciado por">
            <code style={{ fontSize: 12 }}>{op.initiatedBy}</code>
          </DtRow>

          <DtRow label="Fecha de inicio">{fmt(op.initiatedAt)}</DtRow>

          {op.approvedBy && (
            <>
              <DtRow label="Aprobado por">
                <code style={{ fontSize: 12 }}>{op.approvedBy}</code>
              </DtRow>
              <DtRow label="Fecha de aprobación">{fmt(op.approvedAt)}</DtRow>
            </>
          )}

          {op.rejectedBy && (
            <>
              <DtRow label="Rechazado por">
                <code style={{ fontSize: 12 }}>{op.rejectedBy}</code>
              </DtRow>
              <DtRow label="Fecha de rechazo">{fmt(op.rejectedAt)}</DtRow>
              <DtRow label="Motivo">
                <span style={{ color: "#b91c1c" }}>{op.rejectionReason ?? "—"}</span>
              </DtRow>
            </>
          )}

          {op.sentAt && (
            <DtRow label="Enviado a SAG">{fmt(op.sentAt)}</DtRow>
          )}

          {op.lastError && (
            <DtRow label="Último error">
              <span style={{ color: "#b91c1c", fontFamily: "monospace", fontSize: 12 }}>
                {op.lastError}
              </span>
            </DtRow>
          )}
        </dl>
      </section>

      {/* ── SAG response ──────────────────────────────────────────────────── */}
      {op.sagResponseRaw && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Respuesta SAG</h2>
          <div style={{
            display: "flex", alignItems: "center", gap: 10, marginBottom: 8,
          }}>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 4,
              background: op.sagResponseOk ? "#f0fdf4" : "#fef2f2",
              border:     `1px solid ${op.sagResponseOk ? "#bbf7d0" : "#fecaca"}`,
              color:      op.sagResponseOk ? "#15803d" : "#b91c1c",
            }}>
              {op.sagResponseOk ? "OK" : "ERROR"}
            </span>
          </div>
          <pre style={{
            fontSize: 12, background: "#f8fafc", padding: "12px 16px",
            borderRadius: 6, border: "1px solid #e2e8f0",
            overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all",
            maxHeight: 200, overflowY: "auto",
          }}>
            {op.sagResponseRaw}
          </pre>
        </section>
      )}

      {/* ── Payload JSON ──────────────────────────────────────────────────── */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>
          Payload de entrada (JSON)
        </h2>
        <p style={{ fontSize: 12, color: "#9ca3af", marginBottom: 8 }}>
          Datos tal como fueron enviados al sistema al crear la operación.
        </p>
        <pre style={{
          fontSize: 12, background: "#f8fafc", padding: "12px 16px",
          borderRadius: 6, border: "1px solid #e2e8f0",
          overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all",
          maxHeight: 320, overflowY: "auto",
        }}>
          {JSON.stringify(op.inputJson, null, 2)}
        </pre>
      </section>

      {/* ── Generated XML ─────────────────────────────────────────────────── */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>
          XML generado
        </h2>
        <p style={{ fontSize: 12, color: "#9ca3af", marginBottom: 8 }}>
          XML construido al encolar la operación. Este es el contenido que será enviado a SAG.
        </p>
        <pre style={{
          fontSize: 12, background: "#f8fafc", padding: "12px 16px",
          borderRadius: 6, border: "1px solid #e2e8f0",
          overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all",
          maxHeight: 400, overflowY: "auto",
        }}>
          {op.generatedXml}
        </pre>
      </section>

      {/* ── Submitted XML (if different — i.e. after send) ────────────────── */}
      {op.submittedXml && op.submittedXml !== op.generatedXml && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>
            XML enviado (copia al momento del envío)
          </h2>
          <pre style={{
            fontSize: 12, background: "#f8fafc", padding: "12px 16px",
            borderRadius: 6, border: "1px solid #e2e8f0",
            overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all",
            maxHeight: 400, overflowY: "auto",
          }}>
            {op.submittedXml}
          </pre>
        </section>
      )}

      {/* ── Audit trail footer ─────────────────────────────────────────────── */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Historial</h2>
        <ol style={{
          fontSize: 12, color: "#6b7280",
          paddingLeft: 18, margin: 0,
          display: "flex", flexDirection: "column", gap: 4,
        }}>
          <li>
            Creada por <code>{op.initiatedBy}</code> el {fmt(op.initiatedAt)}
          </li>
          {op.approvedBy && (
            <li>
              Aprobada por <code>{op.approvedBy}</code> el {fmt(op.approvedAt)}
            </li>
          )}
          {op.sentAt && (
            <li>Enviada a SAG el {fmt(op.sentAt)}</li>
          )}
          {op.rejectedBy && (
            <li style={{ color: "#b91c1c" }}>
              Rechazada por <code>{op.rejectedBy}</code> el {fmt(op.rejectedAt)}
              {op.rejectionReason ? ` — "${op.rejectionReason}"` : ""}
            </li>
          )}
          {op.status === "SUCCEEDED" && (
            <li style={{ color: "#15803d", fontWeight: 600 }}>
              ✓ Operación completada exitosamente en SAG
            </li>
          )}
          {op.status === "FAILED" && (
            <li style={{ color: "#b91c1c" }}>
              ✗ Operación fallida — {op.lastError ?? "sin detalles"}
            </li>
          )}
        </ol>
      </section>

      {/* ── Bottom action bar for quick access ────────────────────────────── */}
      {isActionable && (
        <section style={{
          borderTop: "2px solid #e5e7eb", paddingTop: 24, marginBottom: 40,
        }}>
          <p style={{ fontSize: 12, color: "#9ca3af", marginBottom: 12 }}>
            Acciones rápidas
          </p>
          <SagWriteApprovalPanel
            orgSlug={orgSlug}
            operationId={op.id}
            status={op.status}
            canApprove={canApprove}
          />
        </section>
      )}
    </main>
  );
}
