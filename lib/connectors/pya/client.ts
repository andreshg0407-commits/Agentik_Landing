import type { PyaApiConfig, SagRows, SagSoapFault } from "./types";

// PYA SAG SOAP client
// All business data is fetched via consultaSagJson(token, consulta).
// The consulta is a SQL-like query string stored in Integration.configJson.
//
// Set PYA_DEBUG=true to log raw SOAP requests and responses to stderr.

const DEBUG = process.env.PYA_DEBUG === "true";

const SOAP_NS_ENV  = "http://schemas.xmlsoap.org/soap/envelope/";
const SOAP_NS_TNS  = "http://tempuri.org/";

// SOAPAction confirmed from the WSDL (wsdl:operation / soap:operation soapAction).
const SOAP_ACTION = "http://tempuri.org/IServiceSagWeb/consultaSagJson";

// ── SOAP envelope ────────────────────────────────────────────────────────────

function buildSoapEnvelope(token: string, consulta: string, database?: string): string {
  const escToken    = escapeXml(token);
  const escConsulta = escapeXml(consulta);
  // a_s_bd is required by most SAG PYA installations to select the company database.
  // It is placed between a_s_token and a_s_consulta per the WSDL operation signature.
  const bdParam = database
    ? `<tns:a_s_bd>${escapeXml(database)}</tns:a_s_bd>`
    : "";
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:soap="${SOAP_NS_ENV}" xmlns:tns="${SOAP_NS_TNS}">` +
      `<soap:Body>` +
        `<tns:consultaSagJson>` +
          `<tns:a_s_token>${escToken}</tns:a_s_token>` +
          bdParam +
          `<tns:a_s_consulta>${escConsulta}</tns:a_s_consulta>` +
        `</tns:consultaSagJson>` +
      `</soap:Body>` +
    `</soap:Envelope>`
  );
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ── Response parsing ─────────────────────────────────────────────────────────

/**
 * Extracts the text content of the first occurrence of <localTag>…</localTag>
 * in the raw XML, ignoring namespace prefixes on the closing/opening tag.
 */
function extractXmlValue(xml: string, localTag: string): string | null {
  // Match both <ns:tag> and <tag> openers, then the corresponding closer
  const open  = new RegExp(`<[^>:]*:?${localTag}[^>]*>`, "i");
  const close = new RegExp(`</[^>:]*:?${localTag}>`, "i");
  const start = xml.search(open);
  if (start === -1) return null;
  const afterOpen = xml.indexOf(">", start) + 1;
  const end = xml.search(close);
  if (end === -1 || end < afterOpen) return null;
  const raw = xml.slice(afterOpen, end);
  // Strip CDATA wrapper if present
  const cdataMatch = raw.match(/^<!\[CDATA\[([\s\S]*?)]]>$/);
  return cdataMatch ? cdataMatch[1] : raw;
}

function parseSoapFault(xml: string): SagSoapFault | null {
  const faultcode   = extractXmlValue(xml, "faultcode");
  const faultstring = extractXmlValue(xml, "faultstring");
  if (!faultcode && !faultstring) return null;
  return {
    faultcode:   faultcode   ?? "UNKNOWN",
    faultstring: faultstring ?? "UNKNOWN",
    rawResponse: xml,
  };
}

// ── Core SOAP call ───────────────────────────────────────────────────────────

/**
 * Calls consultaSagJson on the SAG SOAP endpoint.
 *
 * Transport per WSDL:
 *   URL:        http://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap
 *   SOAP:       1.1  (text/xml + SOAPAction header)
 *   SOAPAction: http://tempuri.org/IServiceSagWeb/consultaSagJson
 *
 * Returns the parsed array of rows from the JSON-string result.
 */
export async function consultaSagJson(
  config: PyaApiConfig,
  consulta: string
): Promise<SagRows> {
  const body = buildSoapEnvelope(config.token, consulta, config.database);

  if (DEBUG) {
    console.error("[PYA DEBUG] → POST", config.endpointUrl);
    console.error("[PYA DEBUG] → SOAPAction:", SOAP_ACTION);
    console.error("[PYA DEBUG] → Body:", body);
  }

  const res = await fetch(config.endpointUrl, {
    method:  "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction:     SOAP_ACTION,
    },
    body,
  });

  const xml = await res.text();

  if (DEBUG) {
    console.error("[PYA DEBUG] ← Status:", res.status);
    console.error("[PYA DEBUG] ← Body:", xml);
  }

  // SOAP faults arrive with HTTP 500
  const fault = parseSoapFault(xml);
  if (fault) {
    const err = new Error(
      `PYA_SOAP_FAULT [${fault.faultcode}]: ${fault.faultstring}`
    ) as Error & { fault: SagSoapFault };
    err.fault = fault;
    throw err;
  }

  if (!res.ok) {
    // Always-on non-200 log — visible without PYA_DEBUG
    console.error(
      `[PYA] HTTP ${res.status} ${res.statusText}` +
      `\n  → URL:        ${config.endpointUrl}` +
      `\n  → SOAPAction: ${SOAP_ACTION}` +
      `\n  ← body:       ${xml.slice(0, 500)}`
    );
    throw new Error(
      `PYA_HTTP_ERROR: ${res.status} ${res.statusText} — ${xml.slice(0, 300)}`
    );
  }

  const jsonStr = extractXmlValue(xml, "consultaSagJsonResult");
  if (jsonStr === null) {
    throw new Error(
      `PYA_PARSE_ERROR: consultaSagJsonResult not found in response — ${xml.slice(0, 300)}`
    );
  }

  let rows: unknown;
  try {
    rows = JSON.parse(jsonStr);
  } catch {
    throw new Error(
      `PYA_PARSE_ERROR: result is not valid JSON — ${jsonStr.slice(0, 300)}`
    );
  }

  if (!Array.isArray(rows)) {
    throw new Error(
      `PYA_PARSE_ERROR: expected JSON array, got ${typeof rows}`
    );
  }

  // SAG returns application-level errors as a single-row array with s_estado / s_mensaje.
  // Example: [{"s_estado":"1","s_mensaje":"Token incorrecto o expirado"}]
  // Detect and surface these so they appear as structured errors rather than empty results.
  if (rows.length === 1) {
    const only = rows[0] as Record<string, unknown>;
    const estado  = only["s_estado"]  ?? only["S_ESTADO"];
    const mensaje = only["s_mensaje"] ?? only["S_MENSAJE"];
    if (estado !== undefined || mensaje !== undefined) {
      const estadoStr  = String(estado  ?? "");
      const mensajeStr = String(mensaje ?? "");
      // s_estado "0" or empty string = success in some SAG variants; anything else = error
      const isError = estadoStr !== "" && estadoStr !== "0";
      if (isError) {
        console.error(
          `[PYA] SAG application error` +
          `\n  → URL:        ${config.endpointUrl}` +
          `\n  → consulta:   ${consulta.slice(0, 200)}` +
          `\n  ← s_estado:  ${estadoStr}` +
          `\n  ← s_mensaje: ${mensajeStr}`
        );
        throw new Error(`PYA_SAG_ERROR [${estadoStr}]: ${mensajeStr}`);
      }
    }
  }

  return rows as SagRows;
}

// ── Higher-level fetchers ────────────────────────────────────────────────────

/**
 * Fetches product/article rows using the SAG query from Integration.configJson.
 * The query is expected to return rows with columns like ARTICULO, PRECIO, etc.
 */
export async function fetchPyaProducts(
  config: PyaApiConfig,
  productQuery: string
): Promise<SagRows> {
  return consultaSagJson(config, productQuery);
}

/**
 * Fetches order rows using the SAG query from Integration.configJson.
 * `options.since` can be interpolated into the query by the caller if needed —
 * here we pass the query as-is and let the configJson author handle date filters.
 */
export async function fetchPyaOrders(
  config: PyaApiConfig,
  orderQuery: string,
  _options: { since?: string } = {}
): Promise<SagRows> {
  // Future: callers may template `since` into the query string before calling.
  return consultaSagJson(config, orderQuery);
}
