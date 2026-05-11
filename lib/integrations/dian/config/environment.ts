/**
 * environment.ts
 *
 * AGENTIK-DIAN-FOUNDATION-01
 * DIAN Integration Layer — Environment Configuration
 *
 * Strict separation between habilitación (testing) and producción.
 * Accidental environment mixing is a hard configuration error.
 *
 * Environment variables required (server-side only — never NEXT_PUBLIC_):
 *
 *   DIAN_ENVIRONMENT     "habilitacion" | "produccion"
 *   DIAN_WSDL_URL        WSDL URL (optional — defaults per environment)
 *   DIAN_SOAP_ENDPOINT   SOAP endpoint (optional — defaults per environment)
 *   DIAN_CERT_PATH       Absolute path to .p12 certificate file
 *   DIAN_CERT_PASSWORD   Certificate password (from secret manager)
 *   DIAN_CERT_ALIAS      (Optional) Alias within keystore
 *   DIAN_TIMEOUT_MS      (Optional) HTTP timeout, default 30000, max 60000
 *   DIAN_DEBUG_LOG_XML   (Optional) "true" only in development — NEVER in production
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import type { DianEnvironment, DianEnvironmentConfig } from "../types/dian-types";

// ── Known endpoint registry ───────────────────────────────────────────────────

/**
 * Reference endpoint configuration per environment.
 * Override any field via environment variables.
 *
 * Habilitación = testing / integration environment.
 * Producción   = live fiscal operations (requires real certificate + NIT).
 */
export const DIAN_ENDPOINT_REGISTRY: Record<
  DianEnvironment,
  Omit<DianEnvironmentConfig, "environment">
> = {
  habilitacion: {
    wsdlUrl:      "https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc?wsdl",
    soapEndpoint: "https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc",
    hasTestData:  true,
  },
  produccion: {
    wsdlUrl:      "https://vpfe.dian.gov.co/WcfDianCustomerServices.svc?wsdl",
    soapEndpoint: "https://vpfe.dian.gov.co/WcfDianCustomerServices.svc",
    hasTestData:  false,
  },
};

// ── Environment loader ────────────────────────────────────────────────────────

/**
 * Load and validate DIAN environment configuration from process.env.
 *
 * All-or-nothing: throws DianEnvironmentError if any required variable
 * is missing or invalid. Never returns a partial configuration.
 */
export function loadDianEnvironmentConfig(): DianEnvironmentConfig {
  const rawEnv = process.env["DIAN_ENVIRONMENT"];

  if (!rawEnv) {
    throw new DianEnvironmentError(
      "DIAN_ENVIRONMENT is not set. " +
      "Set to 'habilitacion' for testing or 'produccion' for live fiscal operations.",
    );
  }

  if (rawEnv !== "habilitacion" && rawEnv !== "produccion") {
    throw new DianEnvironmentError(
      `DIAN_ENVIRONMENT has invalid value: "${rawEnv}". ` +
      "Must be exactly 'habilitacion' or 'produccion'.",
    );
  }

  const environment = rawEnv as DianEnvironment;
  const defaults    = DIAN_ENDPOINT_REGISTRY[environment];

  // Allow full override via env vars (multi-tenant or custom deployment support)
  const wsdlUrl      = process.env["DIAN_WSDL_URL"]     ?? defaults.wsdlUrl;
  const soapEndpoint = process.env["DIAN_SOAP_ENDPOINT"] ?? defaults.soapEndpoint;

  return {
    environment,
    wsdlUrl,
    soapEndpoint,
    hasTestData: defaults.hasTestData,
  };
}

// ── Environment guards ────────────────────────────────────────────────────────

/**
 * Assert that the active environment matches the expected value.
 * Use before any environment-specific operation.
 *
 * @throws {DianEnvironmentError} on mismatch
 */
export function assertEnvironment(
  config:   DianEnvironmentConfig,
  expected: DianEnvironment,
): void {
  if (config.environment !== expected) {
    throw new DianEnvironmentError(
      `Environment mismatch: expected "${expected}", ` +
      `got "${config.environment}". ` +
      "Check DIAN_ENVIRONMENT configuration.",
    );
  }
}

/** Returns true only when running in habilitación. */
export function isHabilitacion(config: DianEnvironmentConfig): boolean {
  return config.environment === "habilitacion";
}

/** Returns true only when running in producción. */
export function isProduccion(config: DianEnvironmentConfig): boolean {
  return config.environment === "produccion";
}

// ── Certificate config loader ─────────────────────────────────────────────────

/**
 * Load certificate configuration from environment variables.
 * Never reads certificate content here — path + password only.
 */
export function loadDianCertificateConfig() {
  const certPath     = process.env["DIAN_CERT_PATH"];
  const certPassword = process.env["DIAN_CERT_PASSWORD"];

  if (!certPath) {
    throw new DianEnvironmentError(
      "DIAN_CERT_PATH is not set. " +
      "Set to the absolute path of the .p12 certificate file. " +
      "This file must NOT be committed to the repository.",
    );
  }

  if (!certPassword) {
    throw new DianEnvironmentError(
      "DIAN_CERT_PASSWORD is not set. " +
      "Inject this value from a secret manager — never hardcode.",
    );
  }

  return {
    certPath,
    certPassword,
    alias: process.env["DIAN_CERT_ALIAS"],
  };
}

// ── Timeout config ────────────────────────────────────────────────────────────

/**
 * HTTP timeout in milliseconds.
 * Default: 30,000ms (30s). Maximum enforced: 60,000ms (60s).
 */
export function getTimeoutMs(): number {
  const raw    = process.env["DIAN_TIMEOUT_MS"];
  if (!raw)    return 30_000;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || parsed < 1_000) return 30_000;
  return Math.min(parsed, 60_000);
}

// ── Debug flag ────────────────────────────────────────────────────────────────

/**
 * Whether to log raw XML for debugging.
 *
 * HARD RULE: Always returns false in production.
 * XML logs contain WS-Security tokens — logging them is a security violation.
 */
export function isDebugLogXmlEnabled(): boolean {
  if (process.env["NODE_ENV"] === "production") return false;
  return process.env["DIAN_DEBUG_LOG_XML"] === "true";
}

// ── Environment error ─────────────────────────────────────────────────────────

export class DianEnvironmentError extends Error {
  constructor(message: string) {
    super(`[DIAN Environment] ${message}`);
    this.name = "DianEnvironmentError";
  }
}
