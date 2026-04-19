// Raw types for the PYA SAG SOAP service.
// ServiceSagWeb — https://wssagpya.azurewebsites.net/ServiceSagWeb.svc?wsdl
//
// PYA does not expose a product/order REST API.
// It exposes a generic SAG (Sistema de Apoyo a la Gestión) query interface:
//   consultaSagJson(token, consulta) → JSON string
//
// Business data is fetched by passing SQL-like queries to consultaSagJson.
// The query strings are stored in Integration.configJson and are client-specific.

// ── Config ──────────────────────────────────────────────────────────────────

export interface PyaApiConfig {
  endpointUrl: string; // SOAP endpoint per WSDL: http://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap
  token:       string; // Passed as a_s_token in every SOAP body
  database?:   string; // Passed as a_s_bd in every SOAP body (required by most SAG PYA installations)
}

// Stored in Integration.configJson (non-sensitive)
export interface PyaConnectorConfig {
  productQuery?: string; // SAG query to fetch products/articles
  orderQuery?:   string; // SAG query to fetch orders
  nit?:          string; // Company NIT used by traerLinea and other operations
}

// ── SOAP response types ──────────────────────────────────────────────────────

// consultaSagJson returns a JSON string; after parsing it is an array of rows.
// Column names depend on the SAG database schema — typically uppercase Spanish.
export type SagRow = Record<string, unknown>;
export type SagRows = SagRow[];

// consultaSagJson2 returns ArrayOfArrayOfKeyValueOfstringanyType — not used in v1.

// ── Debug / fault types ──────────────────────────────────────────────────────

export interface SagSoapFault {
  faultcode:   string;
  faultstring: string;
  rawResponse: string;
}
