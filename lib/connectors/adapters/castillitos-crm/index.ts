/**
 * castillitos-crm/index.ts
 *
 * Castillitos CRM adapter — pulls opportunities, activities and quotes from the
 * JR Consultores SuiteCRM V8 JSON:API.
 *
 * Transport: CrmClient (./client.ts) handles OAuth2 client_credentials auth,
 * rate limiting, retries and JSON:API envelope parsing.
 *
 * ── V8 endpoint pattern ────────────────────────────────────────────────────────
 *   GET {baseUrl}/Api/V8/module/{moduleName}
 *     ?page[size]=500
 *     &page[number]=1
 *     &sort=-date_entered
 *     &filter[operator]=and
 *     &filter[date_entered][gte]=YYYY-mm-dd H:i:s   (UTC, when cursor present)
 *
 * ── Cursor strategy ───────────────────────────────────────────────────────────
 *   Cursor is an ISO 8601 date string.  It is converted to a V8 date filter
 *   (`filter[date_entered][gte]`) so the server can filter server-side, and
 *   a client-side guard is applied for boundary safety.
 *
 *   All pages for the current cursor are fetched in a single pull() call
 *   (internal page loop).  Returns `hasMore: false` — the sync engine advances
 *   by calling pull() again with the new cursor.
 *
 * ── Config shape (stored in Connector.config) ─────────────────────────────────
 * ```json
 * {
 *   "baseUrl":              "https://crm-castillitos.jrconsultores.com.co/pruebas",
 *   "tokenEndpoint":        "https://crm-castillitos.jrconsultores.com.co/pruebas/Api/access_token",
 *   "clientId":             "…",
 *   "clientSecret":         "…",
 *   "quotesModule":         "AOS_Quotes",
 *   "opportunitiesModule":  "AOS_Opportunities",
 *   "activitiesModule":     "Calls",
 *   "rateLimit":            60
 * }
 * ```
 */

import { CrmClient, toV8DateFilter, flattenV8Record } from "./client";
import {
  mapCrmCustomer,
  mapCrmOpportunity,
  mapCrmActivity,
  mapCrmQuote,
} from "./mappers";
import { BaseAdapter }     from "@/lib/connectors/core/base-adapter";
import type {
  AdapterConfig,
  PullResult,
  SyncModule,
  UnifiedActivity,
  UnifiedCustomer,
  UnifiedOpportunity,
  UnifiedQuote,
} from "@/lib/connectors/core/types";

// ── Config ────────────────────────────────────────────────────────────────────

interface CrmAdapterConfig extends AdapterConfig {
  baseUrl:             string;
  tokenEndpoint:       string;
  clientId:            string;
  clientSecret:        string;
  rateLimit?:          number;
  /** SuiteCRM module name for quotes/pedidos.        Default: "AOS_Quotes"        */
  quotesModule?:       string;
  /** SuiteCRM module name for opportunities.         Default: "AOS_Opportunities" */
  opportunitiesModule?: string;
  /** SuiteCRM module name for activities.            Default: "Calls"             */
  activitiesModule?:   string;
  /** SuiteCRM module name for contacts/accounts.     Default: "Accounts"          */
  customersModule?:    string;
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class CastillitosCrmAdapter extends BaseAdapter {
  readonly source         = "castillitos_crm" as const;
  readonly displayName    = "Castillitos CRM";
  readonly supportedModules: SyncModule[] = [
    "customers",
    "opportunities",
    "activities",
    "quotes",
  ];

  private get cfg(): CrmAdapterConfig {
    return this.config as CrmAdapterConfig;
  }

  private get client(): CrmClient {
    // CrmClient is lightweight — create lazily per call to avoid holding state.
    // Token caching is module-level inside client.ts so recreating CrmClient
    // does NOT trigger a new OAuth round-trip on every request.
    return new CrmClient({
      baseUrl:       this.cfg.baseUrl,
      tokenEndpoint: this.cfg.tokenEndpoint,
      clientId:      this.cfg.clientId,
      clientSecret:  this.cfg.clientSecret,
      rateLimit:     this.cfg.rateLimit,
    });
  }

  // ── pullCustomers ───────────────────────────────────────────────────────────

  async pullCustomers(cursor?: string): Promise<PullResult<UnifiedCustomer>> {
    const moduleName = this.cfg.customersModule ?? "Accounts";
    const { records, latestDate } = await this._fetchAllV8Pages(moduleName, cursor);

    const cursorDate = cursor ? new Date(cursor) : null;
    const customers: UnifiedCustomer[] = [];

    for (const row of records) {
      const customer = mapCrmCustomer(row, this.orgId);
      if (cursorDate && customer.updatedAt <= cursorDate) continue;
      customers.push(customer);
    }

    return {
      records:    customers,
      nextCursor: latestDate ? latestDate.toISOString() : (cursor ?? null),
      hasMore:    false,
      totalCount: null,
    };
  }

  // ── pullOpportunities ───────────────────────────────────────────────────────

  async pullOpportunities(cursor?: string): Promise<PullResult<UnifiedOpportunity>> {
    const moduleName = this.cfg.opportunitiesModule ?? "AOS_Opportunities";
    const { records, latestDate } = await this._fetchAllV8Pages(moduleName, cursor);

    const cursorDate = cursor ? new Date(cursor) : null;
    const opps: UnifiedOpportunity[] = [];

    for (const row of records) {
      const opp     = mapCrmOpportunity(row, this.orgId);
      const rowDate = opp.lastActivityAt ?? opp.openedAt;
      if (cursorDate && rowDate <= cursorDate) continue;
      opps.push(opp);
    }

    return {
      records:    opps,
      nextCursor: latestDate ? latestDate.toISOString() : (cursor ?? null),
      hasMore:    false,
      totalCount: null,
    };
  }

  // ── pullActivities ──────────────────────────────────────────────────────────

  async pullActivities(cursor?: string): Promise<PullResult<UnifiedActivity>> {
    const moduleName = this.cfg.activitiesModule ?? "Calls";
    const { records, latestDate } = await this._fetchAllV8Pages(moduleName, cursor);

    const cursorDate = cursor ? new Date(cursor) : null;
    const activities: UnifiedActivity[] = [];

    for (const row of records) {
      const activity = mapCrmActivity(row, this.orgId);
      if (cursorDate && activity.occurredAt <= cursorDate) continue;
      activities.push(activity);
    }

    return {
      records:    activities,
      nextCursor: latestDate ? latestDate.toISOString() : (cursor ?? null),
      hasMore:    false,
      totalCount: null,
    };
  }

  // ── pullQuotes ──────────────────────────────────────────────────────────────

  async pullQuotes(cursor?: string): Promise<PullResult<UnifiedQuote>> {
    const moduleName = this.cfg.quotesModule ?? "AOS_Quotes";
    const { records, latestDate } = await this._fetchAllV8Pages(moduleName, cursor);

    const cursorDate = cursor ? new Date(cursor) : null;
    const quotes: UnifiedQuote[] = [];

    for (const row of records) {
      const quote = mapCrmQuote(row, this.orgId);
      if (cursorDate && quote.issuedAt <= cursorDate) continue;
      quotes.push(quote);
    }

    return {
      records:    quotes,
      nextCursor: latestDate ? latestDate.toISOString() : (cursor ?? null),
      hasMore:    false,
      totalCount: null,
    };
  }

  // ── testConnection ──────────────────────────────────────────────────────────

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const moduleName = this.cfg.quotesModule ?? "AOS_Quotes";
      await this.client.getV8Page(`/Api/V8/module/${moduleName}`, {
        "page[size]":   "1",
        "page[number]": "1",
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  describeCursor(cursor: string): string {
    try {
      return `desde ${new Date(cursor).toLocaleDateString("es-CO", { dateStyle: "medium" })}`;
    } catch {
      return cursor;
    }
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  /**
   * Fetch ALL pages for a V8 module, optionally filtered by `cursor` date.
   * Returns flattened records (id + _module + spread attributes) and the
   * latest `date_modified` / `date_entered` seen across all pages (for cursor
   * advancement).
   *
   * V8 dates returned in attributes are "YYYY-MM-DD HH:MM:SS" (UTC).
   */
  private async _fetchAllV8Pages(
    moduleName: string,
    cursor?:    string,
  ): Promise<{ records: Record<string, unknown>[]; latestDate: Date | null }> {
    const path = `/Api/V8/module/${moduleName}`;

    const baseParams: Record<string, string> = {
      "page[size]": "500",
      "sort":       "-date_entered",
    };

    if (cursor) {
      baseParams["filter[operator]"]           = "and";
      baseParams["filter[date_entered][gte]"]  = toV8DateFilter(cursor);
    }

    const records:    Record<string, unknown>[] = [];
    let latestDate:   Date | null = null;
    let page          = 1;
    let totalPages    = 1;

    do {
      const params  = { ...baseParams, "page[number]": String(page) };
      const v8Page  = await this.client.getV8Page(path, params);

      for (const record of v8Page.data) {
        const flat = flattenV8Record(record);
        records.push(flat);

        // Advance the cursor to the latest modification timestamp seen
        const dateStr = String(flat["date_modified"] ?? flat["date_entered"] ?? "");
        if (dateStr) {
          // V8 dates: "YYYY-MM-DD HH:MM:SS" → append Z for UTC parsing
          const normalized = dateStr.includes("T") ? dateStr : dateStr.replace(" ", "T") + "Z";
          const d = new Date(normalized);
          if (!isNaN(d.getTime()) && (!latestDate || d > latestDate)) {
            latestDate = d;
          }
        }
      }

      totalPages = v8Page.totalPages;
      page++;
    } while (page <= totalPages);

    return { records, latestDate };
  }
}
