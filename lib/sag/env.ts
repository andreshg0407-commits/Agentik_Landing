/**
 * lib/sag/env.ts
 *
 * Type-safe environment loader for SAG / PYA SOAP integration.
 *
 * Two loaders are exported:
 *
 *   loadSagHomologEnv() — homologation / sandbox only.
 *     Reads SAG_TEST_TOKEN + SAG_TEST_DB.
 *     Used exclusively by scripts/sag-test-*.ts.
 *     Never activated unless explicitly called.
 *
 *   loadSagTestEnv()    — production fallback loader.
 *     Reads PYA_SOAP_TOKEN (→ TOKEN) + PYA_SAG_BD.
 *     Used by the production sync route.
 *
 * Security rules enforced here:
 *   - Token values are never logged. maskToken() emits only "[SET]" or "(empty)".
 *   - No credential is ever hardcoded.
 *   - Callers must handle thrown errors — missing token/db exits the script.
 */

import type { SagLogLevel } from "./logger";

// ── Public types ──────────────────────────────────────────────────────────────

/** Shared shape for both homologation and production env configs. */
export interface SagEnvConfig {
  /** Resolved token for SAG SOAP a_s_token field. Never log this value. */
  token:       string;
  /** Company database name for SAG SOAP a_s_bd field. */
  database:    string;
  /** SOAP endpoint URL. Defaults to wssagpya.azurewebsites.net. */
  endpointUrl: string;
  /** Whether raw SOAP request/response pairs are logged to stderr. */
  debug:       boolean;
  /** Minimum log level for sagLog (debug | info | warn | error). */
  logLevel:    SagLogLevel;
}

/** @deprecated Use SagEnvConfig */
export type SagTestEnv = SagEnvConfig;

// ── Constants ─────────────────────────────────────────────────────────────────

// Confirmed working: SOAP 1.1 endpoint uses HTTP (not HTTPS).
// The HTTPS endpoint returns 404.
const DEFAULT_ENDPOINT =
  "http://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap";

const VALID_LOG_LEVELS: SagLogLevel[] = ["debug", "info", "warn", "error"];

// ── Shared builder ────────────────────────────────────────────────────────────

function buildConfig(token: string, database: string): SagEnvConfig {
  const endpointUrl =
    process.env.PYA_SOAP_ENDPOINT?.trim() || DEFAULT_ENDPOINT;

  const debug = process.env.PYA_DEBUG === "true";

  const rawLevel = process.env.SAG_LOG_LEVEL?.trim() as SagLogLevel | undefined;
  const logLevel: SagLogLevel =
    rawLevel && VALID_LOG_LEVELS.includes(rawLevel) ? rawLevel : "info";

  return { token, database, endpointUrl, debug, logLevel };
}

// ── Homologation loader (test scripts only) ───────────────────────────────────

/**
 * Loads credentials for the PYA sandbox / homologation environment.
 *
 * Reads SAG_TEST_TOKEN and SAG_TEST_DB exclusively.
 * Must only be called from scripts/sag-test-*.ts — never from production paths.
 *
 * Throws if either variable is missing.
 */
export function loadSagHomologEnv(): SagEnvConfig {
  const token = process.env.SAG_TEST_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "[SAG] SAG_TEST_TOKEN is not set. Add the homologation token to .env (or .env.local).",
    );
  }

  const database = process.env.SAG_TEST_DB?.trim();
  if (!database) {
    throw new Error(
      "[SAG] SAG_TEST_DB is not set. Add the homologation database name to .env (or .env.local).",
    );
  }

  return buildConfig(token, database);
}

// ── Production loader ─────────────────────────────────────────────────────────

/**
 * Loads production SAG credentials.
 *
 * Token resolution: PYA_SOAP_TOKEN → TOKEN (legacy fallback).
 * Database:         PYA_SAG_BD.
 *
 * Used by the production sync route and setup scripts.
 * Safe to call multiple times — reads process.env with no caching.
 */
export function loadSagTestEnv(): SagEnvConfig {
  const token =
    process.env.PYA_SOAP_TOKEN?.trim() ||
    process.env.TOKEN?.trim();

  if (!token) {
    throw new Error(
      "[SAG] No token found. Set PYA_SOAP_TOKEN (or TOKEN as fallback) in .env",
    );
  }

  const database = process.env.PYA_SAG_BD?.trim();
  if (!database) {
    throw new Error(
      "[SAG] PYA_SAG_BD is not set. Add the company database name to .env",
    );
  }

  return buildConfig(token, database);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns a safe presence indicator for a token — never reveals any chars.
 * Use this instead of logging the token directly.
 *
 * Returns "[SET]" when a non-empty token is present, "(empty)" otherwise.
 */
export function maskToken(token: string): string {
  return token ? "[SET]" : "(empty)";
}
