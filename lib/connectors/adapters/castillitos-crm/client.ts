/**
 * castillitos-crm/client.ts
 *
 * REST client for the JR Consultores CRM API (SuiteCRM V8 / JSON:API).
 *
 * ── Authentication ────────────────────────────────────────────────────────────
 * OAuth2 client_credentials flow:
 *   POST {tokenEndpoint}
 *     Authorization: Basic base64(clientId:clientSecret)
 *     Content-Type: application/x-www-form-urlencoded
 *     body: grant_type=client_credentials
 *   → { access_token, expires_in?, token_type }
 *
 *   Tokens are cached module-level, keyed by tokenEndpoint+clientId.
 *   Auto-refreshed 60 s before expiry or immediately on any HTTP 401.
 *
 * ── V8 module endpoint pattern ────────────────────────────────────────────────
 *   GET {baseUrl}/Api/V8/module/{ModuleName}
 *     ?page[size]=500
 *     &page[number]=1
 *     &sort=-date_entered
 *     &filter[operator]=and
 *     &filter[date_entered][gte]=2026-03-18 13:00:00   (UTC, space-separated)
 *
 * ── V8 response shape (JSON:API) ─────────────────────────────────────────────
 *   {
 *     "data": [
 *       { "type": "AOS_Quotes", "id": "uuid",
 *         "attributes": { "name": "…", "date_entered": "…", … } }
 *     ],
 *     "meta": { "total-pages": 3, "records-on-this-page": 500 }
 *   }
 *
 * ── Error classification ──────────────────────────────────────────────────────
 *   CRM_AUTH_FAILED          — 401/403 after token refresh attempt
 *   CRM_MODULE_NOT_FOUND     — 404 on module endpoint
 *   CRM_MALFORMED_RESPONSE   — data key missing or not an array
 *   CRM_RATE_LIMITED         — 429 from server
 *   [CrmClient] HTTP …       — any other non-2xx
 */

// ── Config ─────────────────────────────────────────────────────────────────────

export interface CrmClientConfig {
  baseUrl:       string;
  tokenEndpoint: string;
  clientId:      string;
  clientSecret:  string;
  /** Requests per minute. Default: 60. */
  rateLimit?:    number;
}

// ── V8 JSON:API record type ────────────────────────────────────────────────────

export interface V8Record {
  type:       string;
  id:         string;
  attributes: Record<string, unknown>;
}

export interface V8Page {
  data:            V8Record[];
  totalPages:      number;
  recordsOnPage:   number;
}

// ── OAuth2 token cache ─────────────────────────────────────────────────────────

interface CachedToken {
  accessToken: string;
  expiresAt:   number;
}

const TOKEN_CACHE            = new Map<string, CachedToken>();
const TOKEN_REFRESH_BUFFER   = 60_000; // ms

async function fetchNewToken(
  tokenEndpoint: string,
  clientId:      string,
  clientSecret:  string,
): Promise<CachedToken> {
  const credentials = btoa(`${clientId}:${clientSecret}`);

  const res = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type":  "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `CRM_AUTH_FAILED: token request HTTP ${res.status} ${res.statusText} — ${body.slice(0, 200)}`
    );
  }

  const data = await res.json() as {
    access_token?: string;
    expires_in?:   number;
  };

  if (!data.access_token) {
    throw new Error(
      `CRM_AUTH_FAILED: token response missing access_token — endpoint: ${tokenEndpoint}`
    );
  }

  const expiresInMs =
    typeof data.expires_in === "number"
      ? data.expires_in * 1_000
      : 55 * 60_000; // conservative default when expires_in absent

  return {
    accessToken: data.access_token,
    expiresAt:   Date.now() + expiresInMs,
  };
}

async function getAccessToken(
  tokenEndpoint: string,
  clientId:      string,
  clientSecret:  string,
): Promise<string> {
  const key    = `${tokenEndpoint}:${clientId}`;
  const cached = TOKEN_CACHE.get(key);
  if (cached && cached.expiresAt > Date.now() + TOKEN_REFRESH_BUFFER) {
    return cached.accessToken;
  }
  const token = await fetchNewToken(tokenEndpoint, clientId, clientSecret);
  TOKEN_CACHE.set(key, token);
  return token.accessToken;
}

function invalidateCachedToken(tokenEndpoint: string, clientId: string): void {
  TOKEN_CACHE.delete(`${tokenEndpoint}:${clientId}`);
}

// ── Rate limiter ───────────────────────────────────────────────────────────────

class MinuteTokenBucket {
  private tokens:     number;
  private lastRefill: number;
  private readonly limit: number;

  constructor(limit: number) {
    this.limit      = limit;
    this.tokens     = limit;
    this.lastRefill = Date.now();
  }

  async consume(): Promise<void> {
    const deadline = Date.now() + 5 * 60_000;
    while (true) {
      this._refill();
      if (this.tokens >= 1) { this.tokens -= 1; return; }
      if (Date.now() > deadline) throw new Error("[CrmClient] Rate limit wait exceeded 5 minutes.");
      const elapsed = Date.now() - this.lastRefill;
      await sleep(Math.max(100, 60_000 - elapsed + 10));
    }
  }

  private _refill(): void {
    const now     = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed >= 60_000) {
      const periods   = Math.floor(elapsed / 60_000);
      this.tokens     = Math.min(this.limit, this.tokens + periods * this.limit);
      this.lastRefill += periods * 60_000;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ── Retry helper ───────────────────────────────────────────────────────────────

const MAX_ATTEMPTS  = 3;
const BASE_DELAY_MS = 500;

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: Error | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e as Error;
      // Don't retry auth or module-not-found errors
      if (
        lastErr.message.startsWith("CRM_AUTH_FAILED") ||
        lastErr.message.startsWith("CRM_MODULE_NOT_FOUND")
      ) break;

      const isRetryable =
        lastErr.message.includes("fetch") ||
        lastErr.message.includes("ECONNRESET") ||
        (lastErr as unknown as { status?: number }).status != null &&
          ((lastErr as unknown as { status: number }).status >= 500);

      if (!isRetryable || attempt === MAX_ATTEMPTS) break;

      const delay = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), 10_000);
      console.warn(
        `[CrmClient] attempt ${attempt}/${MAX_ATTEMPTS} failed (${lastErr.message}), retrying in ${delay}ms…`
      );
      await sleep(delay);
    }
  }
  throw lastErr;
}

// ── CrmClient ─────────────────────────────────────────────────────────────────

export class CrmClient {
  private readonly baseUrl:       string;
  private readonly tokenEndpoint: string;
  private readonly clientId:      string;
  private readonly clientSecret:  string;
  private readonly bucket:        MinuteTokenBucket;

  constructor(config: CrmClientConfig) {
    this.baseUrl       = config.baseUrl.replace(/\/+$/, "");
    this.tokenEndpoint = config.tokenEndpoint;
    this.clientId      = config.clientId;
    this.clientSecret  = config.clientSecret;
    this.bucket        = new MinuteTokenBucket(config.rateLimit ?? 60);
  }

  /**
   * Fetch a single page from a V8 module endpoint.
   *
   * `params` should include page[size], page[number], sort, and any filters.
   * Handles V8 JSON:API envelope: { data: V8Record[], meta: { "total-pages": n } }
   *
   * Throws:
   *   CRM_AUTH_FAILED          — 401/403 after token refresh
   *   CRM_MODULE_NOT_FOUND     — 404
   *   CRM_MALFORMED_RESPONSE   — unexpected body shape
   */
  async getV8Page(
    path:    string,
    params:  Record<string, string>,
    isRetry = false,
  ): Promise<V8Page> {
    await this.bucket.consume();

    return withRetry(async () => {
      const token = await getAccessToken(
        this.tokenEndpoint,
        this.clientId,
        this.clientSecret,
      );

      const url = this._buildUrl(path, params);
      const res = await fetch(url, {
        method:  "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept":        "application/vnd.api+json, application/json",
        },
      });

      // 401 → invalidate token cache → retry once with fresh token
      if (res.status === 401 && !isRetry) {
        invalidateCachedToken(this.tokenEndpoint, this.clientId);
        return this.getV8Page(path, params, true);
      }

      if (res.status === 401 || res.status === 403) {
        const body = await res.text().catch(() => "");
        throw new Error(
          `CRM_AUTH_FAILED: HTTP ${res.status} on ${path} — check client_id / client_secret. ${body.slice(0, 200)}`
        );
      }

      if (res.status === 404) {
        const moduleName = path.split("/").pop() ?? path;
        throw new Error(
          `CRM_MODULE_NOT_FOUND: module "${moduleName}" returned 404. ` +
          `Verify the module name in connector config (quotesModule / opportunitiesModule / activitiesModule).`
        );
      }

      if (res.status === 429) {
        throw new Error(`CRM_RATE_LIMITED: HTTP 429 on ${path}. Reduce rateLimit in connector config.`);
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        const err  = new Error(
          `[CrmClient] HTTP ${res.status} ${res.statusText} — ${path} — ${body.slice(0, 300)}`
        ) as Error & { status: number };
        err.status = res.status;
        throw err;
      }

      const raw = await res.json() as unknown;

      // Validate JSON:API envelope
      if (
        raw == null ||
        typeof raw !== "object" ||
        Array.isArray(raw) ||
        !("data" in (raw as object))
      ) {
        throw new Error(
          `CRM_MALFORMED_RESPONSE: expected { data: [...] } from ${path}. ` +
          `Got: ${String(raw).slice(0, 200)}`
        );
      }

      const envelope = raw as {
        data?: unknown;
        meta?: Record<string, unknown>;
      };

      if (!Array.isArray(envelope.data)) {
        // Empty result is valid — return zero page
        if (envelope.data == null) {
          return { data: [], totalPages: 1, recordsOnPage: 0 };
        }
        throw new Error(
          `CRM_MALFORMED_RESPONSE: "data" field is not an array in ${path}. ` +
          `Got type: ${typeof envelope.data}`
        );
      }

      const meta         = envelope.meta ?? {};
      const totalPages   = Number(meta["total-pages"]          ?? 1);
      const recordsOnPage = Number(meta["records-on-this-page"] ?? envelope.data.length);

      const data: V8Record[] = envelope.data.map((item: unknown) => {
        const r = item as Record<string, unknown>;
        return {
          type:       String(r["type"]  ?? ""),
          id:         String(r["id"]    ?? ""),
          attributes: (r["attributes"] as Record<string, unknown>) ?? {},
        };
      });

      return { data, totalPages, recordsOnPage };
    });
  }

  /**
   * Simple GET helper for non-V8 endpoints (e.g. a health probe).
   * Returns parsed JSON or throws on non-2xx.
   */
  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    await this.bucket.consume();
    const token = await getAccessToken(this.tokenEndpoint, this.clientId, this.clientSecret);
    const url   = this._buildUrl(path, params);

    const res = await fetch(url, {
      method:  "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept":        "application/json",
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const err  = new Error(
        `[CrmClient] HTTP ${res.status} ${res.statusText} — ${path} — ${body.slice(0, 200)}`
      ) as Error & { status: number };
      err.status = res.status;
      throw err;
    }

    return res.json() as Promise<T>;
  }

  // ── Internals ────────────────────────────────────────────────────────────────

  private _buildUrl(path: string, params?: Record<string, string>): string {
    const normalised = path.startsWith("/") ? path : `/${path}`;
    const full       = `${this.baseUrl}${normalised}`;
    if (!params || Object.keys(params).length === 0) return full;
    const qs = new URLSearchParams(params).toString();
    return full.includes("?") ? `${full}&${qs}` : `${full}?${qs}`;
  }
}

// ── V8 date filter format helper ───────────────────────────────────────────────

/**
 * Convert an ISO 8601 date string to the UTC format required by the V8 date
 * filter parameter: "YYYY-mm-dd H:i:s" (space-separated, no timezone suffix).
 *
 *   "2026-03-18T13:00:00.000Z" → "2026-03-18 13:00:00"
 */
export function toV8DateFilter(iso: string): string {
  const d   = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
}

/**
 * Flatten a V8 JSON:API record into a single-level object for mappers.
 * Top-level `id` is preserved; `type` is stored as `_module`; all `attributes`
 * are spread to the top level (attributes take precedence over id/type).
 */
export function flattenV8Record(record: V8Record): Record<string, unknown> {
  return {
    id:      record.id,
    _module: record.type,
    ...record.attributes,
  };
}
