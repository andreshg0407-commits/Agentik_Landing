/**
 * lib/activation/connector-validator.ts
 *
 * Sprint TA-04 — Phase C: ERP Connector Validation Layer.
 *
 * Provider-agnostic validation pipeline for connector credentials.
 *
 * Contract:
 *   validateConnector(input) → ConnectorValidationResult
 *
 * The pipeline runs up to 4 stages (stops on first failure):
 *   1. connectivity  — can we reach the endpoint at all?
 *   2. authentication — does the token/credential work?
 *   3. metadata       — can we detect the company/database?
 *   4. sample_data    — can we pull ≥1 real row?
 *
 * Rules:
 *   - NEVER writes to DB.
 *   - NEVER triggers a full sync.
 *   - Tolerates partial failures with warnings (not hard errors) where possible.
 *   - Server-safe: runs in Node.js edge/serverless environments.
 *
 * Adding a new provider:
 *   1. Implement a `validate<Provider>` function below.
 *   2. Add its case to the switch in `validateConnector()`.
 *   That's it — no changes to types.ts or the provisioner.
 */

import type {
  ActivationProvider,
  ConnectorValidationInput,
  ConnectorValidationResult,
} from "./types";

// SAG PYA SOAP transport — only imported when provider = sag_pya_soap
import { consultaSagJson } from "@/lib/connectors/pya/client";

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Validates connector credentials for any supported provider.
 *
 * Does NOT create any DB rows.
 * Does NOT trigger sync engine.
 * Returns a normalised ConnectorValidationResult regardless of success/failure.
 */
export async function validateConnector(
  input: ConnectorValidationInput,
): Promise<ConnectorValidationResult> {
  switch (input.provider) {
    case "sag_pya_soap":
      return validateSagPyaSoap(input.credentials);

    // ── Future providers ───────────────────────────────────────────────────
    case "siigo":
    case "shopify":
    case "whatsapp":
    case "tiktok":
    case "meta_ads":
      return unsupportedProvider(input.provider);

    default: {
      const _exhaustive: never = input.provider;
      return unsupportedProvider(_exhaustive as ActivationProvider);
    }
  }
}

// ── sag_pya_soap validator ────────────────────────────────────────────────────

/**
 * SAG PYA SOAP — 4-stage validation pipeline.
 *
 * Required credentials:
 *   token       — SAG API token
 *   endpointUrl — SOAP endpoint (defaults to shared PYA endpoint)
 *   database    — SAG company database name (a_s_bd)
 *
 * Probes (in order):
 *   1. Connectivity  — minimal fetch with 10 s timeout, no token needed
 *   2. Authentication — SELECT TOP 1 * FROM v_cl (cheapest auth-validating query)
 *   3. Metadata      — detect company name from TERCEROS or v_cl
 *   4. Sample data   — confirm >0 TERCEROS rows accessible
 */
async function validateSagPyaSoap(
  credentials: Record<string, unknown>,
): Promise<ConnectorValidationResult> {
  const warnings: string[] = [];
  const errors:   string[] = [];
  const metadata: Record<string, unknown> = {};

  const DEFAULT_ENDPOINT =
    process.env.PYA_SOAP_ENDPOINT?.trim() ??
    "https://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap";

  const token       = String(credentials.token       ?? "").trim();
  const endpointUrl = String(credentials.endpointUrl ?? DEFAULT_ENDPOINT).trim();
  const database    = credentials.database ? String(credentials.database).trim() : undefined;

  const pyaConfig = { token, endpointUrl, database };

  if (!token) {
    errors.push("token is required");
    return makeResult(false, "sag_pya_soap", "connectivity", warnings, errors, metadata);
  }
  if (!database) {
    warnings.push("database (a_s_bd) not provided — SAG may reject queries if required by this installation");
  }

  // ── Stage 1: Connectivity ─────────────────────────────────────────────────
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(endpointUrl, {
      method:  "HEAD",
      signal:  controller.signal,
    }).finally(() => clearTimeout(tid)).catch(() =>
      // HEAD may not be supported; try OPTIONS fallback
      fetch(endpointUrl, { method: "OPTIONS", signal: controller.signal })
    );
    metadata.httpStatus = res.status;
  } catch (e) {
    const msg = (e as Error).message;
    errors.push(`Cannot reach endpoint ${endpointUrl}: ${msg}`);
    return makeResult(false, "sag_pya_soap", "connectivity", warnings, errors, metadata);
  }

  // ── Stage 2: Authentication ───────────────────────────────────────────────
  // Cheapest auth-validating query: SELECT TOP 1 from v_cl
  // v_cl is the Clientes view — always present in SAG PYA installations.
  let authOk = false;
  try {
    const rows = await consultaSagJson(pyaConfig, "SELECT TOP 1 n_nit FROM v_cl");
    authOk = Array.isArray(rows);
    metadata.authProbeRows = rows.length;
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("Token incorrecto") || msg.includes("PYA_SAG_ERROR")) {
      errors.push(`Authentication failed: ${msg}`);
      return makeResult(false, "sag_pya_soap", "authentication", warnings, errors, metadata);
    }
    // Other errors (SOAP fault, HTTP error) indicate a deeper connectivity issue
    errors.push(`Authentication probe failed: ${msg}`);
    return makeResult(false, "sag_pya_soap", "authentication", warnings, errors, metadata);
  }

  if (!authOk) {
    errors.push("Authentication probe returned unexpected response (non-array)");
    return makeResult(false, "sag_pya_soap", "authentication", warnings, errors, metadata);
  }

  // ── Stage 3: Metadata — detect company info ────────────────────────────────
  // Try to detect the company/database name from TERCEROS.
  // sc_tipo_tercero = 'G' (gremia) typically identifies the company itself.
  // Fall back to the database param when no gremia row is found.
  let companyName:      string | undefined;
  let detectedDatabase: string | undefined = database;

  try {
    const rows = await consultaSagJson(
      pyaConfig,
      "SELECT TOP 5 n_nit, sc_nombre, sc_tipo_tercero FROM TERCEROS WHERE sc_tipo_tercero = 'G'",
    ) as Array<Record<string, unknown>>;

    if (rows.length > 0) {
      const first = rows[0];
      companyName = first["sc_nombre"] ? String(first["sc_nombre"]).trim() : undefined;
      metadata.detectedCompanyNit  = first["n_nit"];
      metadata.detectedCompanyName = companyName;
      metadata.gremiaCandidates    = rows.length;
    } else {
      warnings.push("No gremia (sc_tipo_tercero=G) rows found — company auto-detection unavailable");
      metadata.gremiaCandidates = 0;
    }
  } catch (e) {
    // Metadata detection is non-fatal — warn and continue
    warnings.push(`Company metadata probe failed: ${(e as Error).message}`);
  }

  // ── Stage 4: Sample data ──────────────────────────────────────────────────
  let sampleRowCount = 0;
  try {
    const rows = await consultaSagJson(pyaConfig, "SELECT TOP 10 * FROM v_cl");
    sampleRowCount = rows.length;
    metadata.sampleRowCount = sampleRowCount;
    if (sampleRowCount === 0) {
      warnings.push("v_cl returned 0 rows — database may be empty or account has no data access");
    }
  } catch (e) {
    warnings.push(`Sample data probe failed: ${(e as Error).message}`);
  }

  return {
    ok:               true,
    provider:         "sag_pya_soap",
    step:             "sample_data",
    companyName,
    detectedDatabase,
    sampleRowCount,
    warnings,
    errors,
    metadata,
  };
}

// ── Stub for unsupported providers ────────────────────────────────────────────

function unsupportedProvider(provider: ActivationProvider): ConnectorValidationResult {
  return makeResult(
    false,
    provider,
    "connectivity",
    [],
    [`Provider "${provider}" validation is not yet implemented. Add a validate${toPascal(provider)}() function in connector-validator.ts.`],
    {},
  );
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function makeResult(
  ok:       boolean,
  provider: ActivationProvider,
  step:     ConnectorValidationResult["step"],
  warnings: string[],
  errors:   string[],
  metadata: Record<string, unknown>,
  extras:   Partial<Pick<ConnectorValidationResult, "companyName" | "detectedDatabase" | "sampleRowCount">> = {},
): ConnectorValidationResult {
  return { ok, provider, step, warnings, errors, metadata, ...extras };
}

function toPascal(s: string): string {
  return s.split(/[_\-]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("");
}
