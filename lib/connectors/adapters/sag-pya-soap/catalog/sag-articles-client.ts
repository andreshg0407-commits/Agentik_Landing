/**
 * lib/connectors/adapters/sag-pya-soap/catalog/sag-articles-client.ts
 *
 * Fetches ARTICULOS rows from SAG SOAP and returns them as SagArticleRawRow[].
 *
 * Reuses the existing transport layer (consultaSagJson) and config resolution
 * pattern from sag-pya-soap/index.ts.
 *
 * Sprint: SAG-CATALOG-SYNC-01
 */

import { consultaSagJson } from "@/lib/connectors/pya/client";
import { QUERY_CATALOG }   from "../query-catalog";
import type { PyaApiConfig } from "@/lib/connectors/pya/types";
import type { SagArticleRawRow } from "./sag-articles-types";

/**
 * Fetches all articles from SAG ARTICULOS table.
 * Uses QUERY_CATALOG.articles.all or .active depending on activeOnly flag.
 */
export async function fetchSagArticles(
  config: PyaApiConfig,
  options?: { activeOnly?: boolean },
): Promise<SagArticleRawRow[]> {
  const query = options?.activeOnly
    ? QUERY_CATALOG.articles.active.query
    : QUERY_CATALOG.articles.all.query;

  // eslint-disable-next-line no-console
  console.log("[SAG-CATALOG] fetchSagArticles query:", query);

  const rows = await consultaSagJson(config, query);

  // eslint-disable-next-line no-console
  console.log("[SAG-CATALOG] fetchSagArticles returned", rows.length, "rows");

  return rows as SagArticleRawRow[];
}
