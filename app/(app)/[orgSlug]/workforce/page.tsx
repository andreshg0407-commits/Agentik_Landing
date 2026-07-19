/**
 * /[orgSlug]/workforce — Workforce & RRHH module.
 *
 * STATUS: Integración pendiente (GOCEN).
 *
 * This page renders a structured "coming soon" state that documents the planned
 * capabilities without showing fake data.  All service functions exist and are
 * typed — this page will populate automatically once the GOCEN adapter lands.
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { getWorkforceKpis } from "@/lib/workforce/service";

export default async function WorkforcePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }      = await params;
  const { organization } = await requireOrgAccess(orgSlug);
  const kpis             = await getWorkforceKpis(organization.id);

  // ── Planned capabilities (shown in preview cards) ──────────────────────────
  const PLANNED = [
    {
      icon: "👤",
      title: "Directorio de empleados",
      desc:  "Perfil completo por empleado: cargo, sucursal asignada, tipo de contrato, documentos, estado.",
      joinPoint: "EmployeeProfile.sellerSlug ↔ SaleRecord.sellerSlug",
    },
    {
      icon: "🕐",
      title: "Control de asistencia",
      desc:  "Registros de entrada/salida, ausencias, horas trabajadas por período. Correlacionado con ventas del día.",
      joinPoint: "AttendanceFact.storeSlug ↔ SaleRecord.storeSlug",
    },
    {
      icon: "💰",
      title: "Liquidación y nómina",
      desc:  "Componentes de pago: salario base, comisiones, horas extra, deducciones. Trazabilidad COP por período.",
      joinPoint: "PayrollFact.commissionBase ↔ getSellerDetail() totalAmount",
    },
    {
      icon: "⚠️",
      title: "Señales de cumplimiento",
      desc:  "Contratos vencidos, documentos faltantes, capacitaciones pendientes, exámenes médicos, horas legales.",
      joinPoint: "ComplianceSignal.employeeId ↔ EmployeeProfile.id",
    },
    {
      icon: "📊",
      title: "Vendedor 360 (ampliado)",
      desc:  "Vista unificada: rendimiento comercial + asistencia + comisiones + cumplimiento en una sola pantalla.",
      joinPoint: "/sales/vendors/[sellerSlug] + workforce context panel",
    },
    {
      icon: "🏪",
      title: "Cobertura por sucursal",
      desc:  "Personal activo en cada sucursal cruzado con ventas del período. Detecta correlación dotación–performance.",
      joinPoint: "/sales/branches/[branchSlug] + staffing context panel",
    },
  ];

  return (
    <div style={{ fontFamily: "monospace", maxWidth: 860, padding: "0 0 48px" }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>
          <a href={`/${orgSlug}/sales`} style={{ color: "#888", textDecoration: "none" }}>
            ← Control Comercial
          </a>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: "#111" }}>
            Workforce · RRHH
          </h1>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: "3px 10px",
            borderRadius: 4, background: "#fef9c3", color: "#92400e",
            border: "1px solid #fde68a",
          }}>
            Integración pendiente · GOCEN
          </span>
        </div>
        <p style={{ fontSize: 13, color: "#666", margin: "8px 0 0", lineHeight: 1.5 }}>
          Este módulo conectará con GOCEN para unificar datos de empleados,
          asistencia, nómina y cumplimiento con el Control Comercial de Castillitos.
        </p>
      </div>

      {/* ── Integration status banner ── */}
      <div style={{
        border:       "1px solid #e5e7eb",
        borderRadius: 10,
        padding:      "20px 24px",
        background:   "#fafafa",
        marginBottom: 28,
        display:      "flex",
        gap:          20,
        alignItems:   "flex-start",
        flexWrap:     "wrap",
      }}>
        <div style={{ fontSize: 28 }}>🔌</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, color: "#111" }}>
            Estado de integración GOCEN
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {[
              { step: "Tipos y dominio definidos",         done: true  },
              { step: "Funciones de servicio scaffolded",  done: true  },
              { step: "Modelos Prisma (schema + migración)", done: false },
              { step: "Adaptador GOCEN (API credentials)", done: false },
              { step: "Scheduler de sincronización",       done: false },
              { step: "UI con datos reales",               done: false },
            ].map(({ step, done }) => (
              <div key={step} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                <span style={{ color: done ? "#15803d" : "#9ca3af", fontWeight: 700 }}>
                  {done ? "✓" : "○"}
                </span>
                <span style={{ color: done ? "#111" : "#9ca3af" }}>{step}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 11, color: "#888", maxWidth: 240, lineHeight: 1.5 }}>
          La arquitectura de dominio está lista. El siguiente paso es conectar
          las credenciales de la API de GOCEN y ejecutar la migración de Prisma.
        </div>
      </div>

      {/* ── Planned capabilities ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
          Capacidades planificadas
        </div>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))",
          gap: 12,
        }}>
          {PLANNED.map(cap => (
            <div key={cap.title} style={{
              border:       "1px solid #e5e7eb",
              borderRadius: 10,
              padding:      "16px 18px",
              background:   "#fff",
            }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>{cap.icon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#111", marginBottom: 4 }}>
                    {cap.title}
                  </div>
                  <div style={{ fontSize: 12, color: "#666", lineHeight: 1.5, marginBottom: 8 }}>
                    {cap.desc}
                  </div>
                  <div style={{
                    fontSize: 10, fontFamily: "monospace",
                    background: "#f3f4f6", borderRadius: 4,
                    padding: "3px 7px", color: "#6b7280",
                    display: "inline-block",
                  }}>
                    {cap.joinPoint}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── KPI placeholder ── */}
      {!kpis && (
        <div style={{
          border:       "1px dashed #d1d5db",
          borderRadius: 10,
          padding:      "24px 20px",
          textAlign:    "center",
          color:        "#9ca3af",
          fontSize:     13,
          marginTop:    20,
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Sin datos aún</div>
          <div style={{ fontSize: 12 }}>
            Los KPIs de workforce aparecerán aquí una vez GOCEN esté conectado.
          </div>
        </div>
      )}

      {/* ── Next step callout ── */}
      <div style={{
        marginTop:    28,
        border:       "1px solid #c4b5fd",
        borderRadius: 10,
        padding:      "16px 20px",
        background:   "#faf5ff",
        fontSize:     12,
        color:        "#6d28d9",
        lineHeight:   1.6,
      }}>
        <strong>Próximo paso:</strong>{" "}
        Proporcionar credenciales de API GOCEN al equipo de Agentik.
        El adaptador <code>lib/connectors/adapters/gocen/</code> se implementará
        siguiendo el mismo patrón que el conector CRM de Castillitos.
        Los tipos, funciones de servicio y rutas de UI ya están listos.
      </div>

    </div>
  );
}
