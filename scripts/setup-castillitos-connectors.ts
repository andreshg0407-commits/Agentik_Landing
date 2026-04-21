/**
 * Bootstrap / upsert the two Castillitos connectors:
 *
 *   1. sag_pya_soap   — SAG ERP: customers, receivables
 *   2. castillitos_crm — REST CRM: customers, opportunities, activities, quotes
 *
 *   CRM module order is intentional: customers first so that CustomerProfile.crmId
 *   is populated before opportunities/quotes run their crmId-based customer lookups.
 *
 * Credential resolution (in priority order):
 *   SAG token  → Integration.secretsJson.token  → PYA_SOAP_TOKEN env var
 *   SAG URL    → Integration.secretsJson.endpointUrl → PYA_SOAP_ENDPOINT env var → default URL
 *   CRM base   → CRM_BASE_URL env var
 *   CRM token  → CRM_TOKEN_ENDPOINT env var
 *   CRM id     → CRM_CLIENT_ID env var
 *   CRM secret → CRM_CLIENT_SECRET env var
 *
 * Connector status mirrors the legacy Integration.status:
 *   CONNECTED    → ACTIVE
 *   DISCONNECTED → INACTIVE
 *
 * Idempotent — safe to run repeatedly. Uses upsert on (organizationId, source, name).
 * Stores the legacy integrationId in connector config for traceability.
 *
 * Usage:
 *   npx tsx scripts/setup-castillitos-connectors.ts [--org=castillitos]
 */

import { prisma } from "@/lib/prisma";
import { IntegrationProvider } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { CASTILLITOS_DOCUMENT_FAMILY_MAP } from "@/lib/sag/master-data/castillitos-fuentes";

const ORG_SLUG =
  process.argv.find(a => a.startsWith("--org="))?.slice(6) ?? "castillitos";

// Endpoint published in the WSDL: http (not https) /ServiceSagWeb.svc/soap
const SAG_DEFAULT_ENDPOINT =
  "http://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Integration.status → Connector.status */
function deriveConnectorStatus(integrationStatus: string | null): "ACTIVE" | "INACTIVE" {
  return integrationStatus === "CONNECTED" ? "ACTIVE" : "INACTIVE";
}

function mask(s: string | undefined): string {
  if (!s) return "(ausente)";
  return s.slice(0, 8) + "…";
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  CASTILLITOS CONNECTOR SETUP");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Org: ${ORG_SLUG}\n`);

  // ── 1. Resolve organisation ─────────────────────────────────────────────────

  const org = await prisma.organization.findFirst({ where: { slug: ORG_SLUG } });
  if (!org) {
    const available = (await prisma.organization.findMany({ select: { slug: true } }))
      .map(o => o.slug).join(", ");
    console.error(`  ✗ Organización "${ORG_SLUG}" no encontrada.`);
    console.error(`    Disponibles: ${available || "(ninguna)"}`);
    process.exit(1);
  }
  console.log(`  Org ID: ${org.id}\n`);

  // ── 2. Load the legacy PYA Integration row ──────────────────────────────────
  //
  // secretsJson = { token: string; endpointUrl?: string }
  // This is the canonical credential source for the SAG SOAP connection.
  // The Connector record will mirror these credentials (not duplicate them —
  // both records point to the same physical API; we store a reference ID
  // in the Connector config to maintain the linkage).

  const pyaIntegration = await prisma.integration.findFirst({
    where: { organizationId: org.id, provider: IntegrationProvider.PYA },
    select: { id: true, name: true, status: true, secretsJson: true, configJson: true },
    orderBy: { createdAt: "asc" },
  });

  if (pyaIntegration) {
    console.log(`  Integración PYA (legacy) encontrada:`);
    console.log(`    ID:     ${pyaIntegration.id}`);
    console.log(`    Nombre: ${pyaIntegration.name ?? "—"}`);
    console.log(`    Estado: ${pyaIntegration.status}\n`);
  } else {
    console.log("  ⚠  Sin integración PYA legacy — leyendo credenciales desde env.\n");
  }

  // ── 3. Resolve SAG credentials ──────────────────────────────────────────────

  const secrets = (pyaIntegration?.secretsJson ?? {}) as Record<string, unknown>;

  const sagToken: string =
    (typeof secrets.token === "string" ? secrets.token.trim() : "") ||
    (process.env.PYA_SOAP_TOKEN ?? "");

  const sagDatabase: string =
    (typeof secrets.database === "string" ? secrets.database.trim() : "") ||
    (process.env.PYA_SAG_BD ?? "");

  const sagEndpoint: string =
    (typeof secrets.endpointUrl === "string" ? secrets.endpointUrl.trim() : "") ||
    (process.env.PYA_SOAP_ENDPOINT ?? SAG_DEFAULT_ENDPOINT);

  const sagStatus = deriveConnectorStatus(pyaIntegration?.status ?? null);

  if (!sagToken) {
    console.warn(
      "  ⚠  Token SAG ausente — el conector se creará en estado INACTIVE.\n" +
      "     Agregar PYA_SOAP_TOKEN al env o actualizar secretsJson de la integración.\n",
    );
  }

  // ── 4. Upsert sag_pya_soap connector ───────────────────────────────────────

  // Queries confirmed 2026-04-20:
  //   - v_cl = SAG-managed view over TERCEROS (manual PYA v32, confirmed 2026-04-08)
  //   - CARTERA does not exist in this installation; use MOVIMIENTOS + MOVIMIENTOS_ITEMS JOIN
  const CORRECT_CUSTOMER_QUERY   = "SELECT * FROM v_cl";
  const CORRECT_RECEIVABLE_QUERY = [
    "SELECT",
    "  m.ka_nl_movimiento, m.ka_ni_fuente, m.n_numero_documento,",
    "  m.ka_nl_tercero, m.sc_beneficiario, m.d_fecha_documento,",
    "  m.ss_moneda, m.ddt_fecha_new,",
    "  SUM(ISNULL(mi.n_valor, 0))      AS total_valor,",
    "  SUM(ISNULL(mi.n_iva, 0))        AS total_iva,",
    "  SUM(ISNULL(mi.n_descuento, 0))  AS total_descuento,",
    "  f.sc_cobrar_pagar, f.k_n_clase_fuente, f.ka_ni_forma_pago_fte",
    "FROM MOVIMIENTOS m",
    "LEFT JOIN MOVIMIENTOS_ITEMS mi",
    "  ON mi.ka_nl_movimiento = m.ka_nl_movimiento",
    "LEFT JOIN FUENTES f",
    "  ON f.ka_ni_fuente = m.ka_ni_fuente",
    "WHERE m.sc_anulado = 'N'",
    "GROUP BY",
    "  m.ka_nl_movimiento, m.ka_ni_fuente, m.n_numero_documento,",
    "  m.ka_nl_tercero, m.sc_beneficiario, m.d_fecha_documento,",
    "  m.ss_moneda, m.ddt_fecha_new,",
    "  f.sc_cobrar_pagar, f.k_n_clase_fuente, f.ka_ni_forma_pago_fte",
    "ORDER BY m.ka_nl_movimiento",
  ].join(" ");

  // database is REQUIRED — a_s_bd missing causes NullReferenceException on the .NET server.
  // Resolved from: legacy secrets.database → PYA_SAG_BD env var.
  // If both are absent the connector is created without a_s_bd and will always fail.
  if (!sagDatabase) {
    console.warn(
      "  ⚠  PYA_SAG_BD no está seteado — el conector fallará con NullReferenceException.\n" +
      "     Agregar PYA_SAG_BD al env (valor: nombre de la BD en SAG, e.g. INDDIANAA_CASTILLO-ALZATE).\n",
    );
  }

  const sagConfig: Record<string, unknown> = {
    token:                 sagToken,
    ...(sagDatabase ? { database: sagDatabase } : {}),  // only set when resolved — never store undefined
    endpointUrl:           sagEndpoint,
    customerQuery:         CORRECT_CUSTOMER_QUERY,
    receivableQuery:       CORRECT_RECEIVABLE_QUERY,
    // Confirmed 2026-04-20 from FUENTES.xlsx — maps k_sc_codigo_fuente → SagDocumentFamily.
    // Powers classifyDocumentFamily() in source-inference pipeline (eliminates OTHER fallback).
    documentFamilyMap:     CASTILLITOS_DOCUMENT_FAMILY_MAP,
    // Traceability: link back to the legacy Integration row
    ...(pyaIntegration ? { _legacyIntegrationId: pyaIntegration.id } : {}),
  };

  // Force INACTIVE when token is missing regardless of Integration.status
  const sagFinalStatus: "ACTIVE" | "INACTIVE" = sagToken ? sagStatus : "INACTIVE";

  const sagConnector = await prisma.connector.upsert({
    where: {
      organizationId_source_name: {
        organizationId: org.id,
        source: "sag_pya_soap",
        name:   "SAG PYA SOAP",
      },
    },
    update: {
      modules:   ["customers", "receivables"],
      config:    sagConfig as Prisma.InputJsonValue,
      status:    sagFinalStatus,
      updatedAt: new Date(),
    },
    create: {
      organizationId: org.id,
      source:         "sag_pya_soap",
      name:           "SAG PYA SOAP",
      status:         sagFinalStatus,
      modules:        ["customers", "receivables"],
      config:         sagConfig as Prisma.InputJsonValue,
    },
  });

  const sagIcon = sagFinalStatus === "ACTIVE" ? "✓" : "⚠";
  console.log(`  ${sagIcon} sag_pya_soap  — ID: ${sagConnector.id}`);
  console.log(`    módulos : customers, receivables`);
  console.log(`    estado  : ${sagFinalStatus}`);
  console.log(`    endpoint: ${sagEndpoint}`);
  console.log(`    database: ${sagDatabase || "(no establecido)"}`);
  console.log(`    token   : ${mask(sagToken)}`);
  if (pyaIntegration) {
    console.log(`    origen  : Integration/${pyaIntegration.id}`);
  }
  console.log();

  // ── 5. Resolve CRM credentials ──────────────────────────────────────────────
  // Auth: OAuth2 client_credentials
  //   POST {CRM_TOKEN_ENDPOINT}
  //     Authorization: Basic base64(CRM_CLIENT_ID:CRM_CLIENT_SECRET)
  //     Content-Type: application/x-www-form-urlencoded
  //     body: grant_type=client_credentials
  //
  // JR Consultores sandbox defaults (override via env vars):
  //   CRM_BASE_URL        = https://crm-castillitos.jrconsultores.com.co/pruebas
  //   CRM_TOKEN_ENDPOINT  = https://crm-castillitos.jrconsultores.com.co/pruebas/Api/access_token

  const CRM_DEFAULT_BASE_URL       = "https://crm-castillitos.jrconsultores.com.co/pruebas";
  const CRM_DEFAULT_TOKEN_ENDPOINT = "https://crm-castillitos.jrconsultores.com.co/pruebas/Api/access_token";

  const crmBaseUrl       = process.env.CRM_BASE_URL       ?? CRM_DEFAULT_BASE_URL;
  const crmTokenEndpoint = process.env.CRM_TOKEN_ENDPOINT ?? CRM_DEFAULT_TOKEN_ENDPOINT;
  const crmClientId      = process.env.CRM_CLIENT_ID      ?? "";
  const crmClientSecret  = process.env.CRM_CLIENT_SECRET  ?? "";

  // Base URL and token endpoint have defaults; connector is ACTIVE only when
  // OAuth2 credentials (clientId + clientSecret) are provided.
  const crmCredsPresent = !!(crmClientId && crmClientSecret);

  if (!crmCredsPresent) {
    const missing: string[] = [];
    if (!crmClientId)     missing.push("CRM_CLIENT_ID");
    if (!crmClientSecret) missing.push("CRM_CLIENT_SECRET");
    console.warn(
      `  ⚠  CRM OAuth2 credentials incompletas (faltan: ${missing.join(", ")}) — el conector CRM\n` +
      "     se creará en estado INACTIVE hasta configurar las credenciales.\n",
    );
  }

  // ── 6. Upsert castillitos_crm connector ────────────────────────────────────

  const crmStatus: "ACTIVE" | "INACTIVE" = crmCredsPresent ? "ACTIVE" : "INACTIVE";

  // Module names — configurable via env, falling back to confirmed SuiteCRM V8 defaults.
  // AOS_Quotes confirmed working against JR Consultores sandbox.
  const crmQuotesModule        = process.env.CRM_QUOTES_MODULE        ?? "AOS_Quotes";
  const crmOpportunitiesModule = process.env.CRM_OPPORTUNITIES_MODULE ?? "AOS_Opportunities";
  const crmActivitiesModule    = process.env.CRM_ACTIVITIES_MODULE    ?? "Calls";
  const crmCustomersModule     = process.env.CRM_CUSTOMERS_MODULE     ?? "Accounts";

  const crmConfig: Record<string, unknown> = {
    baseUrl:             crmBaseUrl,
    tokenEndpoint:       crmTokenEndpoint,
    clientId:            crmClientId,
    clientSecret:        crmClientSecret,
    rateLimit:           60,
    quotesModule:        crmQuotesModule,
    opportunitiesModule: crmOpportunitiesModule,
    activitiesModule:    crmActivitiesModule,
    customersModule:     crmCustomersModule,
  };

  const crmConnector = await prisma.connector.upsert({
    where: {
      organizationId_source_name: {
        organizationId: org.id,
        source: "castillitos_crm",
        name:   "Castillitos CRM",
      },
    },
    update: {
      // "customers" is first: populates CustomerProfile.crmId before
      // opportunities/quotes run their crmId-based customer lookups.
      modules:   ["customers", "opportunities", "activities", "quotes"],
      config:    crmConfig as Prisma.InputJsonValue,
      status:    crmStatus,
      updatedAt: new Date(),
    },
    create: {
      organizationId: org.id,
      source:         "castillitos_crm",
      name:           "Castillitos CRM",
      status:         crmStatus,
      modules:        ["customers", "opportunities", "activities", "quotes"],
      config:         crmConfig as Prisma.InputJsonValue,
    },
  });

  const crmIcon = crmStatus === "ACTIVE" ? "✓" : "⚠";
  console.log(`  ${crmIcon} castillitos_crm — ID: ${crmConnector.id}`);
  console.log(`    módulos         : customers, opportunities, activities, quotes`);
  console.log(`    estado          : ${crmStatus}`);
  console.log(`    base URL        : ${crmBaseUrl}`);
  console.log(`    token endpoint  : ${crmTokenEndpoint}`);
  console.log(`    client ID       : ${crmClientId      || "(ausente)"}`);
  console.log(`    client secret   : ${mask(crmClientSecret)}`);
  console.log(`    customersModule : ${crmCustomersModule}`);
  console.log(`    quotesModule    : ${crmQuotesModule}`);
  console.log(`    oppsModule      : ${crmOpportunitiesModule}`);
  console.log(`    actModule       : ${crmActivitiesModule}`);
  console.log();

  // ── 7. Summary ──────────────────────────────────────────────────────────────

  console.log("═══════════════════════════════════════════════════════");
  console.log("  COMPLETADO — conectores creados/actualizados.");
  console.log();
  console.log("  Página de integraciones:");
  console.log(`    /${ORG_SLUG}/integrations`);
  console.log();
  console.log("  Páginas de detalle:");
  console.log(`    /${ORG_SLUG}/integrations/connectors/${sagConnector.id}`);
  console.log(`    /${ORG_SLUG}/integrations/connectors/${crmConnector.id}`);
  console.log();

  if (sagFinalStatus === "ACTIVE") {
    console.log("  Próximo paso recomendado — Dry-run ERP (sin escrituras):");
    console.log(`    POST /api/orgs/${ORG_SLUG}/connectors/${sagConnector.id}/dry-run`);
    console.log('      body: { "module": "customers" }');
    console.log();
    console.log("  Cuando el dry-run sea exitoso, ejecutar sincronización real:");
    console.log(`    POST /api/orgs/${ORG_SLUG}/connectors/${sagConnector.id}/sync`);
    console.log('      body: { "module": "customers" }');
    console.log(`    POST /api/orgs/${ORG_SLUG}/connectors/${sagConnector.id}/sync`);
    console.log('      body: { "module": "receivables" }');
  } else {
    console.log("  ⚠  Configurar PYA_SOAP_TOKEN antes de ejecutar sincronizaciones.");
  }

  if (crmStatus === "ACTIVE") {
    console.log();
    console.log("  Próximo paso CRM — dry-run en orden de dependencia:");
    console.log();
    console.log("  1. Cuentas/Clientes (Accounts → CustomerProfile.crmId):");
    console.log(`     POST /api/orgs/${ORG_SLUG}/connectors/${crmConnector.id}/dry-run`);
    console.log('       body: { "module": "customers" }');
    console.log();
    console.log("  2. Cuando el dry-run de customers sea exitoso, sincronizar:");
    console.log(`     POST /api/orgs/${ORG_SLUG}/connectors/${crmConnector.id}/sync`);
    console.log('       body: { "module": "customers" }');
    console.log();
    console.log("  3. Luego el resto del pipeline CRM:");
    console.log(`     POST /api/orgs/${ORG_SLUG}/connectors/${crmConnector.id}/sync`);
    console.log('       body: { "module": "opportunities" }');
    console.log(`     POST /api/orgs/${ORG_SLUG}/connectors/${crmConnector.id}/sync`);
    console.log('       body: { "module": "activities" }');
    console.log(`     POST /api/orgs/${ORG_SLUG}/connectors/${crmConnector.id}/sync`);
    console.log('       body: { "module": "quotes" }');
    console.log();
    console.log("  O sincronizar todo de una vez (respeta orden de módulos):");
    console.log(`     POST /api/orgs/${ORG_SLUG}/connectors/${crmConnector.id}/sync`);
    console.log('       body: {}');
  }

  console.log("═══════════════════════════════════════════════════════\n");
}

main()
  .catch(e => { console.error("Fatal:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
