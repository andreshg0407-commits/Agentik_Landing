import Link from "next/link";
import { AlertSeverity } from "@prisma/client";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { listAlerts, listBusinessAlerts } from "@/lib/alerts/queries";
import ContextHeader from "@/components/app/context-header";
import { severityLabel, statusLabel } from "@/lib/ui/status-labels";

const SEVERITY_ORDER: AlertSeverity[] = ["CRITICAL", "WARNING", "INFO"];

// Human-readable CRM/sales alert type labels
const BUSINESS_ALERT_TYPE_LABELS: Record<string, string> = {
  cartera_vencida:              "Cartera vencida",
  quote_sin_seguimiento:        "Cotización sin seguimiento",
  cliente_premium_inactivo:     "Cliente premium inactivo",
  oportunidad_estancada:        "Oportunidad estancada",
  vendedor_pipeline_envejecido: "Pipeline envejecido",
  sales_drop:                   "Caída de ventas",
  seller_dependency:            "Dependencia de vendedor",
  line_sales_drop:              "Caída de línea",
  line_growth:                  "Crecimiento de línea",
  customer_inactive:            "Cliente inactivo",
  customer_concentration:       "Concentración de cliente",
  seller_ticket_drop:           "Caída de ticket promedio",
};

function bizTypeLabel(type: string): string {
  return BUSINESS_ALERT_TYPE_LABELS[type] ?? type;
}

export default async function AlertsPage({
  params,
}: {
  params: { orgSlug: string };
}) {
  const { organization } = await requireOrgAccess(params.orgSlug);

  const [alerts, businessAlerts] = await Promise.all([
    listAlerts(organization.id),
    listBusinessAlerts(organization.id),
  ]);

  const groupedSystem = SEVERITY_ORDER.map((severity) => ({
    severity,
    items: alerts.filter((a) => a.severity === severity),
  })).filter((g) => g.items.length > 0);

  const groupedBiz = SEVERITY_ORDER.map((severity) => ({
    severity,
    items: businessAlerts.filter((a) => a.severity === severity),
  })).filter((g) => g.items.length > 0);

  const hasAny = alerts.length > 0 || businessAlerts.length > 0;

  return (
    <main>
      <ContextHeader organization={organization} />
      <h1>Alertas</h1>

      {!hasAny && <p>Sin alertas activas.</p>}

      {/* ── Commercial / CRM alerts (BusinessAlert) ── */}
      {groupedBiz.length > 0 && (
        <section>
          <h2 style={{ marginBottom: 12 }}>Alertas comerciales</h2>
          {groupedBiz.map(({ severity, items }) => (
            <div key={severity} style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#555", marginBottom: 8 }}>
                {severityLabel(severity)}
              </h3>
              <table>
                <thead>
                  <tr>
                    <th>Título</th>
                    <th>Tipo</th>
                    <th>Gravedad</th>
                    <th>Estado</th>
                    <th>Período</th>
                    <th>Actualizada</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((alert) => (
                    <tr key={alert.id}>
                      <td style={{ fontWeight: 500 }}>{alert.title}</td>
                      <td>{bizTypeLabel(alert.type)}</td>
                      <td>{severityLabel(alert.severity)}</td>
                      <td>{statusLabel(alert.status)}</td>
                      <td>{alert.period}</td>
                      <td>{alert.updatedAt.toISOString().slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      )}

      {/* ── System alerts (Alert) ── */}
      {groupedSystem.length > 0 && (
        <section>
          <h2 style={{ marginBottom: 12 }}>Alertas del sistema</h2>
          {groupedSystem.map(({ severity, items }) => (
            <div key={severity} style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#555", marginBottom: 8 }}>
                {severityLabel(severity)}
              </h3>
              <table>
                <thead>
                  <tr>
                    <th>Título</th>
                    <th>Gravedad</th>
                    <th>Tipo</th>
                    <th>Estado</th>
                    <th>Creada</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((alert) => (
                    <tr key={alert.id}>
                      <td>
                        <Link href={`/${params.orgSlug}/alerts/${alert.id}`}>{alert.title}</Link>
                      </td>
                      <td>{severityLabel(alert.severity)}</td>
                      <td>{alert.type}</td>
                      <td>{statusLabel(alert.status)}</td>
                      <td>{alert.createdAt.toISOString().slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
