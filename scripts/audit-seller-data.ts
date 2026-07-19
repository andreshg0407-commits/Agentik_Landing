/**
 * VENDEDORES-DATA-AUDIT-01 — Seller data audit script
 *
 * Discovers all seller data across CRM, SAG, and internal tables.
 * Measures volumes, quality, and linkability.
 *
 * Usage: npx tsx scripts/audit-seller-data.ts
 */
import { prisma } from "@/lib/prisma";

const db = prisma as any;

async function main() {
  const org = await db.organization.findFirst({ where: { slug: "castillitos" } });
  if (!org) { console.log("ERROR: castillitos not found"); return; }
  const orgId = org.id;

  console.log("=".repeat(70));
  console.log("VENDEDORES-DATA-AUDIT-01");
  console.log("=".repeat(70));

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 1: FUENTES DE VENDEDOR
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n" + "━".repeat(60));
  console.log("[FASE 1] FUENTES DE VENDEDOR");
  console.log("━".repeat(60));

  // 1a. CRMQuote.sellerName
  const t1a = performance.now();
  const crmQuoteCount = await db.cRMQuote.count({ where: { organizationId: orgId } });
  const crmWithSeller = await db.cRMQuote.count({ where: { organizationId: orgId, sellerName: { not: null } } });
  const crmSellerNames: any[] = await db.$queryRawUnsafe(`
    SELECT "sellerName", COUNT(*)::int AS cnt
    FROM "CRMQuote"
    WHERE "organizationId" = $1 AND "sellerName" IS NOT NULL
    GROUP BY "sellerName"
    ORDER BY cnt DESC
  `, orgId);
  console.log(`  CRMQuote.sellerName: ${crmWithSeller}/${crmQuoteCount} quotes have seller (${(performance.now() - t1a).toFixed(0)}ms)`);
  console.log(`    Distinct sellers: ${crmSellerNames.length}`);
  for (const s of crmSellerNames.slice(0, 15)) {
    console.log(`      "${s.sellerName}" — ${s.cnt} quotes`);
  }
  if (crmSellerNames.length > 15) console.log(`      ... and ${crmSellerNames.length - 15} more`);

  // 1b. CRMQuote.sellerSlug
  const crmWithSlug = await db.cRMQuote.count({ where: { organizationId: orgId, sellerSlug: { not: null } } });
  console.log(`  CRMQuote.sellerSlug: ${crmWithSlug}/${crmQuoteCount} populated`);

  // 1c. CRMQuote.rawCrmJson seller fields
  const crmSample: any[] = await db.cRMQuote.findMany({
    where: { organizationId: orgId, sellerName: { not: null } },
    select: { rawCrmJson: true, sellerName: true },
    take: 5,
  });
  if (crmSample.length > 0) {
    const raw = (crmSample[0].rawCrmJson as any)?.raw ?? {};
    const sellerFields = Object.keys(raw).filter(k =>
      k.toLowerCase().includes("seller") || k.toLowerCase().includes("assigned") ||
      k.toLowerCase().includes("user") || k.toLowerCase().includes("vendedor")
    );
    console.log(`  CRMQuote.rawCrmJson seller-related fields: ${sellerFields.join(", ") || "none found"}`);
    for (const f of sellerFields.slice(0, 5)) {
      console.log(`    ${f}: "${raw[f]}"`);
    }
  }

  // 1d. CustomerProfile.sellerName
  const t1d = performance.now();
  const cpTotal = await db.customerProfile.count({ where: { organizationId: orgId } });
  const cpWithSeller = await db.customerProfile.count({ where: { organizationId: orgId, sellerName: { not: null } } });
  console.log(`  CustomerProfile.sellerName: ${cpWithSeller}/${cpTotal} populated (${(performance.now() - t1d).toFixed(0)}ms)`);

  // 1e. SaleRecord.sellerSlug
  const t1e = performance.now();
  let srTotal = 0, srWithSeller = 0;
  let srSellerNames: any[] = [];
  try {
    srTotal = await db.saleRecord.count({ where: { organizationId: orgId } });
    srWithSeller = await db.saleRecord.count({ where: { organizationId: orgId, sellerSlug: { not: null } } });
    srSellerNames = await db.$queryRawUnsafe(`
      SELECT "sellerSlug", COUNT(*)::int AS cnt
      FROM "SaleRecord"
      WHERE "organizationId" = $1 AND "sellerSlug" IS NOT NULL
      GROUP BY "sellerSlug"
      ORDER BY cnt DESC
    `, orgId);
    console.log(`  SaleRecord.sellerSlug: ${srWithSeller}/${srTotal} have seller (${(performance.now() - t1e).toFixed(0)}ms)`);
    console.log(`    Distinct seller slugs: ${srSellerNames.length}`);
    for (const s of srSellerNames.slice(0, 10)) {
      console.log(`      "${s.sellerSlug}" — ${s.cnt} sales`);
    }
  } catch { console.log("  SaleRecord: table not available"); }

  // 1f. CustomerOrderRecord seller fields
  const t1f = performance.now();
  let corTotal = 0;
  try {
    corTotal = await db.customerOrderRecord.count({ where: { organizationId: orgId } });
    // Check for seller-related columns
    const corSample = await db.customerOrderRecord.findFirst({
      where: { organizationId: orgId },
    });
    const corKeys = corSample ? Object.keys(corSample).filter(k =>
      k.toLowerCase().includes("seller") || k.toLowerCase().includes("vendedor") ||
      k.toLowerCase().includes("sales") || k.toLowerCase().includes("rep")
    ) : [];
    console.log(`  CustomerOrderRecord: ${corTotal} rows. Seller fields: ${corKeys.join(", ") || "NONE"} (${(performance.now() - t1f).toFixed(0)}ms)`);
  } catch { console.log("  CustomerOrderRecord: table not available"); }

  // 1g. CustomerReceivable seller fields
  const t1g = performance.now();
  let crTotal = 0;
  try {
    crTotal = await db.customerReceivable.count({ where: { organizationId: orgId } });
    const crSample = await db.customerReceivable.findFirst({ where: { organizationId: orgId } });
    const crKeys = crSample ? Object.keys(crSample).filter(k =>
      k.toLowerCase().includes("seller") || k.toLowerCase().includes("vendedor")
    ) : [];
    console.log(`  CustomerReceivable: ${crTotal} rows. Seller fields: ${crKeys.join(", ") || "NONE"} (${(performance.now() - t1g).toFixed(0)}ms)`);
  } catch { console.log("  CustomerReceivable: table not available"); }

  // 1h. CollectionRecord seller fields
  const t1h = performance.now();
  let collTotal = 0;
  try {
    collTotal = await db.collectionRecord.count({ where: { organizationId: orgId } });
    const collSample = await db.collectionRecord.findFirst({ where: { organizationId: orgId } });
    const collKeys = collSample ? Object.keys(collSample).filter(k =>
      k.toLowerCase().includes("seller") || k.toLowerCase().includes("vendedor")
    ) : [];
    console.log(`  CollectionRecord: ${collTotal} rows. Seller fields: ${collKeys.join(", ") || "NONE"} (${(performance.now() - t1h).toFixed(0)}ms)`);
  } catch { console.log("  CollectionRecord: table not available"); }

  // 1i. CommercialSalesRepProfileSnapshot
  const t1i = performance.now();
  let snapTotal = 0;
  try {
    snapTotal = await db.commercialSalesRepProfileSnapshot.count({ where: { organizationId: orgId } });
    console.log(`  CommercialSalesRepProfileSnapshot: ${snapTotal} rows (${(performance.now() - t1i).toFixed(0)}ms)`);
    if (snapTotal > 0) {
      const snapSample = await db.commercialSalesRepProfileSnapshot.findFirst({ where: { organizationId: orgId } });
      console.log(`    Fields: ${Object.keys(snapSample ?? {}).join(", ")}`);
    }
  } catch { console.log("  CommercialSalesRepProfileSnapshot: table not available"); }

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 2: MAESTRO DE VENDEDORES
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n" + "━".repeat(60));
  console.log("[FASE 2] MAESTRO DE VENDEDORES");
  console.log("━".repeat(60));

  // Build seller master from CRMQuote (primary source)
  const sellerMaster: Map<string, {
    name: string;
    slug: string | null;
    quoteCount: number;
    lastQuoteDate: string | null;
    billingIds: Set<string>;
  }> = new Map();

  const allQuotes: any[] = await db.cRMQuote.findMany({
    where: { organizationId: orgId, sellerName: { not: null } },
    select: {
      sellerName: true, sellerSlug: true, issuedAt: true, rawCrmJson: true,
    },
    orderBy: { issuedAt: "desc" },
  });

  for (const q of allQuotes) {
    const name = q.sellerName as string;
    const key = name.toLowerCase().trim();
    const existing = sellerMaster.get(key);
    const billingId = (q.rawCrmJson as any)?.raw?.billing_account_id;

    if (existing) {
      existing.quoteCount++;
      if (!existing.lastQuoteDate && q.issuedAt) {
        existing.lastQuoteDate = q.issuedAt.toISOString();
      }
      if (billingId) existing.billingIds.add(billingId);
      if (!existing.slug && q.sellerSlug) existing.slug = q.sellerSlug;
    } else {
      sellerMaster.set(key, {
        name,
        slug: q.sellerSlug ?? null,
        quoteCount: 1,
        lastQuoteDate: q.issuedAt?.toISOString() ?? null,
        billingIds: billingId ? new Set([billingId]) : new Set(),
      });
    }
  }

  console.log(`  Unique sellers (case-insensitive): ${sellerMaster.size}`);
  const sellerList = [...sellerMaster.values()].sort((a, b) => b.quoteCount - a.quoteCount);
  for (const s of sellerList) {
    console.log(`    "${s.name}" (slug=${s.slug ?? "null"}) — ${s.quoteCount} quotes, ${s.billingIds.size} clients, last=${s.lastQuoteDate?.slice(0, 10) ?? "null"}`);
  }

  // Check for duplicates by similarity
  console.log("\n  Potential duplicates:");
  const names = sellerList.map(s => s.name);
  const checked = new Set<string>();
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i].toLowerCase().replace(/\s+/g, " ").trim();
      const b = names[j].toLowerCase().replace(/\s+/g, " ").trim();
      if (a === b || a.includes(b) || b.includes(a)) {
        const key = `${a}|${b}`;
        if (!checked.has(key)) {
          checked.add(key);
          console.log(`    DUPLICATE? "${names[i]}" <-> "${names[j]}"`);
        }
      }
    }
  }
  if (checked.size === 0) console.log("    None detected");

  // Cross-check with SaleRecord sellers
  if (srSellerNames.length > 0) {
    console.log("\n  SaleRecord seller slugs vs CRM seller names:");
    for (const sr of srSellerNames.slice(0, 10)) {
      const slug = sr.sellerSlug;
      const match = sellerList.find(s => s.slug === slug);
      console.log(`    slug="${slug}" (${sr.cnt} sales) → CRM match: ${match ? `"${match.name}"` : "NONE"}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 3: CLIENTES POR VENDEDOR
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n" + "━".repeat(60));
  console.log("[FASE 3] CLIENTES POR VENDEDOR");
  console.log("━".repeat(60));

  // Use client-seller-linker logic inline
  const clientSellerMap: Map<string, { seller: string; quotes: number }[]> = new Map();

  for (const q of allQuotes) {
    const billingId = (q.rawCrmJson as any)?.raw?.billing_account_id;
    if (!billingId || !q.sellerName) continue;

    const existing = clientSellerMap.get(billingId) ?? [];
    const sellerEntry = existing.find(e => e.seller === q.sellerName);
    if (sellerEntry) {
      sellerEntry.quotes++;
    } else {
      existing.push({ seller: q.sellerName, quotes: 1 });
    }
    clientSellerMap.set(billingId, existing);
  }

  let assignable = 0;
  let confident = 0;
  let noSeller = 0;
  let multiSeller = 0;
  const sellerClientCount: Map<string, number> = new Map();

  for (const [crmId, sellers] of clientSellerMap) {
    assignable++;
    if (sellers.length > 1) multiSeller++;

    sellers.sort((a, b) => b.quotes - a.quotes);
    const primary = sellers[0];
    const total = sellers.reduce((s, e) => s + e.quotes, 0);
    const confidence = Math.round((primary.quotes / total) * 100);

    if (confidence >= 60) {
      confident++;
      sellerClientCount.set(primary.seller, (sellerClientCount.get(primary.seller) ?? 0) + 1);
    }
  }

  // Profiles without CRM activity
  const profilesWithCrm = await db.customerProfile.count({
    where: { organizationId: orgId, crmId: { not: null } },
  });

  noSeller = cpTotal - assignable;

  console.log(`  Total CustomerProfiles: ${cpTotal}`);
  console.log(`  With crmId: ${profilesWithCrm}`);
  console.log(`  Assignable to seller (have CRM quotes): ${assignable}`);
  console.log(`  With confident seller (>=60%): ${confident}`);
  console.log(`  With multiple sellers: ${multiSeller}`);
  console.log(`  Without any seller data: ${noSeller}`);

  console.log("\n  Clients per seller (confident only):");
  const sortedSellerClients = [...sellerClientCount.entries()].sort((a, b) => b[1] - a[1]);
  for (const [seller, count] of sortedSellerClients) {
    console.log(`    "${seller}" — ${count} clients`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 4: PEDIDOS POR VENDEDOR
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n" + "━".repeat(60));
  console.log("[FASE 4] PEDIDOS POR VENDEDOR");
  console.log("━".repeat(60));

  // CRM quotes by seller
  console.log("  CRM Quotes by seller:");
  for (const s of crmSellerNames.slice(0, 15)) {
    console.log(`    "${s.sellerName}" — ${s.cnt} quotes`);
  }

  // CRM quotes with SAG link (id_sag_c)
  const withSagLink: any[] = await db.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS cnt
    FROM "CRMQuote"
    WHERE "organizationId" = $1
      AND "rawCrmJson"->'raw'->>'id_sag_c' IS NOT NULL
      AND "rawCrmJson"->'raw'->>'id_sag_c' != ''
  `, orgId);
  console.log(`  CRM quotes with SAG link (id_sag_c): ${withSagLink[0]?.cnt ?? 0}/${crmQuoteCount}`);

  // CRM quote stages
  const stages: any[] = await db.$queryRawUnsafe(`
    SELECT "rawCrmJson"->'raw'->>'stage' AS stage, COUNT(*)::int AS cnt
    FROM "CRMQuote"
    WHERE "organizationId" = $1
    GROUP BY stage
    ORDER BY cnt DESC
  `, orgId);
  console.log("  CRM quote stages:");
  for (const s of stages) {
    console.log(`    ${s.stage ?? "null"}: ${s.cnt}`);
  }

  // SAG orders — check for seller field
  console.log(`  CustomerOrderRecord: ${corTotal} rows`);
  if (corTotal > 0) {
    const corAllKeys = await db.customerOrderRecord.findFirst({ where: { organizationId: orgId } });
    console.log(`    Available columns: ${Object.keys(corAllKeys ?? {}).join(", ")}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 5: VENTAS POR VENDEDOR
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n" + "━".repeat(60));
  console.log("[FASE 5] VENTAS POR VENDEDOR");
  console.log("━".repeat(60));

  if (srTotal > 0) {
    // Sales by seller slug
    console.log(`  SaleRecord: ${srTotal} total, ${srWithSeller} with seller`);
    console.log(`  Coverage: ${((srWithSeller / srTotal) * 100).toFixed(1)}%`);

    // Sales amount by seller
    try {
      const salesBySeller: any[] = await db.$queryRawUnsafe(`
        SELECT "sellerSlug",
               COUNT(*)::int AS cnt,
               SUM(amount)::numeric AS total,
               COUNT(DISTINCT "customerNit")::int AS clients
        FROM "SaleRecord"
        WHERE "organizationId" = $1 AND "sellerSlug" IS NOT NULL
        GROUP BY "sellerSlug"
        ORDER BY total DESC
      `, orgId);
      console.log("  Sales by seller:");
      for (const s of salesBySeller.slice(0, 10)) {
        console.log(`    "${s.sellerSlug}" — ${s.cnt} sales, $${Number(s.total).toLocaleString("es-CO")}, ${s.clients} clients`);
      }
    } catch (e: any) {
      console.log(`  Sales aggregation error: ${e.message}`);
    }

    // Check what columns exist on SaleRecord
    const srSample = await db.saleRecord.findFirst({ where: { organizationId: orgId } });
    const srCols = Object.keys(srSample ?? {});
    const hasCost = srCols.includes("cost") || srCols.includes("unitCost");
    const hasMargin = srCols.includes("margin") || srCols.includes("grossMargin");
    console.log(`  SaleRecord columns: ${srCols.join(", ")}`);
    console.log(`  Has cost: ${hasCost ? "YES" : "NO"}`);
    console.log(`  Has margin: ${hasMargin ? "YES" : "NO"}`);

    // Product lines
    try {
      const linesBySeller: any[] = await db.$queryRawUnsafe(`
        SELECT "sellerSlug", "productLine", COUNT(*)::int AS cnt
        FROM "SaleRecord"
        WHERE "organizationId" = $1 AND "sellerSlug" IS NOT NULL AND "productLine" IS NOT NULL
        GROUP BY "sellerSlug", "productLine"
        ORDER BY "sellerSlug", cnt DESC
      `, orgId);
      const grouped = new Map<string, string[]>();
      for (const r of linesBySeller) {
        const list = grouped.get(r.sellerSlug) ?? [];
        list.push(`${r.productLine}(${r.cnt})`);
        grouped.set(r.sellerSlug, list);
      }
      console.log("  Product lines by seller:");
      for (const [seller, lines] of grouped) {
        console.log(`    "${seller}" — ${lines.slice(0, 5).join(", ")}`);
      }
    } catch { console.log("  Product line aggregation not available"); }
  } else {
    console.log("  SaleRecord: no data available");
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 6: CARTERA POR VENDEDOR
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n" + "━".repeat(60));
  console.log("[FASE 6] CARTERA POR VENDEDOR (PROVISIONAL SAG)");
  console.log("━".repeat(60));

  if (crTotal > 0) {
    // Receivables don't have seller field — must join through customer→seller
    console.log(`  CustomerReceivable: ${crTotal} rows — NO direct seller field`);
    console.log("  Linkable via: CustomerReceivable.customerId → CustomerProfile → CRM seller");

    // Count receivables for customers who have a seller
    try {
      const recvWithSeller: any[] = await db.$queryRawUnsafe(`
        SELECT COUNT(*)::int AS cnt,
               SUM(cr."balanceDue")::numeric AS total_balance,
               COUNT(DISTINCT cr."customerId")::int AS clients
        FROM "CustomerReceivable" cr
        JOIN "CustomerProfile" cp ON cr."customerId" = cp.id
        WHERE cr."organizationId" = $1
          AND cp."crmId" IS NOT NULL
      `, orgId);
      console.log(`  Receivables linkable to CRM (have crmId): ${recvWithSeller[0]?.cnt ?? 0} rows, ${recvWithSeller[0]?.clients ?? 0} clients`);
      console.log(`  Total balance linkable: $${Number(recvWithSeller[0]?.total_balance ?? 0).toLocaleString("es-CO")}`);
    } catch (e: any) {
      console.log(`  Receivable linkage error: ${e.message}`);
    }

    // Aging buckets
    try {
      const aging: any[] = await db.$queryRawUnsafe(`
        SELECT "agingBucket", COUNT(*)::int AS cnt, SUM("balanceDue")::numeric AS total
        FROM "CustomerReceivable"
        WHERE "organizationId" = $1 AND status = 'OPEN'
        GROUP BY "agingBucket"
        ORDER BY cnt DESC
      `, orgId);
      console.log("  Aging buckets (OPEN):");
      for (const a of aging) {
        console.log(`    ${a.agingBucket ?? "null"}: ${a.cnt} docs, $${Number(a.total).toLocaleString("es-CO")}`);
      }
    } catch { console.log("  Aging bucket query not available"); }
  } else {
    console.log("  CustomerReceivable: no data available");
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 7: RECAUDOS POR VENDEDOR
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n" + "━".repeat(60));
  console.log("[FASE 7] RECAUDOS POR VENDEDOR");
  console.log("━".repeat(60));

  if (collTotal > 0) {
    console.log(`  CollectionRecord: ${collTotal} rows — NO direct seller field`);
    console.log("  Linkable via: CollectionRecord.customerId → CustomerProfile → CRM seller");

    // Collection sample
    const collSample = await db.collectionRecord.findFirst({ where: { organizationId: orgId } });
    console.log(`  Available columns: ${Object.keys(collSample ?? {}).join(", ")}`);

    try {
      const collAgg: any[] = await db.$queryRawUnsafe(`
        SELECT COUNT(*)::int AS cnt, SUM(amount)::numeric AS total
        FROM "CollectionRecord"
        WHERE "organizationId" = $1
      `, orgId);
      console.log(`  Total collections: ${collAgg[0]?.cnt ?? 0}, amount: $${Number(collAgg[0]?.total ?? 0).toLocaleString("es-CO")}`);
    } catch { /* skip */ }
  } else {
    console.log("  CollectionRecord: no data available");
  }

  console.log("\n  PYA dependencies:");
  console.log("    vw_agentik_pagos — NOT YET AVAILABLE");
  console.log("    vw_agentik_recaudos — NOT YET AVAILABLE");
  console.log("    vw_agentik_bancos — NOT YET AVAILABLE");

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 8: METAS
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n" + "━".repeat(60));
  console.log("[FASE 8] METAS COMERCIALES");
  console.log("━".repeat(60));

  // Check for any target/meta/quota tables
  try {
    const metaTables: any[] = await db.$queryRawUnsafe(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
        AND (tablename ILIKE '%target%' OR tablename ILIKE '%meta%'
             OR tablename ILIKE '%quota%' OR tablename ILIKE '%goal%')
    `);
    if (metaTables.length > 0) {
      console.log("  Target-related tables found:");
      for (const t of metaTables) console.log(`    ${t.tablename}`);
    } else {
      console.log("  NO target/meta/quota tables found in schema");
    }
  } catch { console.log("  Schema query not available"); }

  console.log("  PYA dependency: vw_agentik_vendedores.META_MENSUAL — NOT YET AVAILABLE");
  console.log("  STATUS: PENDIENTE PYA / input manual");

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 9: COMISIONES
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n" + "━".repeat(60));
  console.log("[FASE 9] COMISIONES");
  console.log("━".repeat(60));

  try {
    const commTables: any[] = await db.$queryRawUnsafe(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
        AND (tablename ILIKE '%commission%' OR tablename ILIKE '%comision%')
    `);
    if (commTables.length > 0) {
      console.log("  Commission-related tables found:");
      for (const t of commTables) console.log(`    ${t.tablename}`);
    } else {
      console.log("  NO commission/comision tables found in schema");
    }
  } catch { console.log("  Schema query not available"); }

  console.log("  STATUS: NO DISPONIBLE — requires business rules definition");

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 10: INTELIGENCIA DISPONIBLE
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n" + "━".repeat(60));
  console.log("[FASE 10] INTELIGENCIA DISPONIBLE");
  console.log("━".repeat(60));

  console.log("  DISPONIBLE AHORA:");
  console.log("    - Clientes activos por vendedor (CRMQuote seller → billing_account_id)");
  console.log("    - Pedidos CRM por vendedor (CRMQuote.sellerName)");
  console.log("    - Ventas por vendedor (SaleRecord.sellerSlug)");
  console.log("    - Ventas por linea por vendedor (SaleRecord.productLine)");
  console.log("    - Cartera por vendedor (via customer join, PROVISIONAL SAG)");
  console.log("    - Clientes sin compra reciente (lastPurchaseAt > 90d)");
  console.log("    - Pedidos pendientes (CRM stage != Facturado/Anulado)");

  console.log("\n  DISPONIBLE CON PYA:");
  console.log("    - Recaudos por vendedor (vw_agentik_recaudos)");
  console.log("    - Pagos por vendedor (vw_agentik_pagos)");
  console.log("    - Meta mensual (vw_agentik_vendedores.META_MENSUAL)");
  console.log("    - Supervisor / zona (vw_agentik_vendedores)");

  console.log("\n  DISPONIBLE CON REGLAS FUTURAS:");
  console.log("    - Comisiones liquidadas");
  console.log("    - Porcentaje de cumplimiento");
  console.log("    - Riesgo de perdida de clientes (model)");
  console.log("    - Score vendedor");

  // ══════════════════════════════════════════════════════════════════════════
  // RESUMEN — MATRIZ DE CONFIANZA
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n" + "=".repeat(70));
  console.log("MATRIZ DE CONFIANZA");
  console.log("=".repeat(70));
  console.log("  Bloque                  | Confianza       | Fuente");
  console.log("  ------------------------|-----------------|----------------------------------");
  console.log("  Perfil vendedor         | MEDIA           | CRMQuote.sellerName + slug");
  console.log("  Clientes registrados    | ALTA            | CRMQuote billing_account_id");
  console.log("  Pedidos CRM             | ALTA            | CRMQuote.sellerName");
  console.log("  Pedidos SAG             | MEDIA           | via NIT join (no seller directo)");
  console.log("  Ventas                  | MEDIA           | SaleRecord.sellerSlug");
  console.log("  Cartera                 | PROVISIONAL SAG | via customer join");
  console.log("  Recaudos                | PENDIENTE PYA   | vw_agentik_recaudos");
  console.log("  Metas                   | PENDIENTE PYA   | vw_agentik_vendedores");
  console.log("  Comisiones              | NO DISPONIBLE   | sin reglas definidas");
  console.log("  Inteligencia            | MEDIA           | derivable de datos existentes");

  console.log("\n=== AUDIT COMPLETE ===");
  await db.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
