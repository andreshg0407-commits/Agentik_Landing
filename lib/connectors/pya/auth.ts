import type { PyaApiConfig } from "./types";

// PYA uses a SOAP/SAG endpoint.
// Authentication is done by passing `a_s_token` inside the SOAP body — no HTTP auth headers.
// secretsJson shape: { token: string; endpointUrl?: string }

// Endpoint published in the WSDL: http (not https) /ServiceSagWeb.svc/soap
const PYA_DEFAULT_ENDPOINT =
  process.env.PYA_SOAP_ENDPOINT ??
  "http://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap";

export interface PyaSecrets {
  token:        string;
  endpointUrl?: string;
  /** Company database name (a_s_bd). Required by most SAG PYA installations. */
  database?:    string;
}

/**
 * Extracts PYA SOAP config from the integration's secretsJson.
 * Throws PYA_INVALID_SECRETS if the token is missing.
 */
export function getPyaConfig(secretsJson: unknown): PyaApiConfig {
  if (
    !secretsJson ||
    typeof secretsJson !== "object" ||
    Array.isArray(secretsJson)
  ) {
    throw new Error("PYA_INVALID_SECRETS: secretsJson is missing or malformed");
  }

  const secrets = secretsJson as Record<string, unknown>;
  const token = typeof secrets.token === "string" ? secrets.token.trim() : null;

  if (!token) {
    throw new Error("PYA_INVALID_SECRETS: token is required in secretsJson");
  }

  return {
    endpointUrl:
      typeof secrets.endpointUrl === "string"
        ? secrets.endpointUrl.trim()
        : PYA_DEFAULT_ENDPOINT,
    token,
    database:
      typeof secrets.database === "string" && secrets.database.trim()
        ? secrets.database.trim()
        : undefined,
  };
}
