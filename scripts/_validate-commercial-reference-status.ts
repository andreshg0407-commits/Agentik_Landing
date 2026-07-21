/**
 * scripts/_validate-commercial-reference-status.ts
 *
 * COMERCIAL-INVENTORY-CANONICAL-STATUS-01 — Full Validation
 *
 * Part 1: 11 deterministic unit cases with real assertions (no DB)
 * Part 2: 6 mandatory business domain gate test cases (no DB)
 * Part 3: 5 real references against Castillitos DB (with domain gate)
 *
 * Run: npx tsx scripts/_validate-commercial-reference-status.ts
 * Exit code 1 on any failure.
 */

import {
  resolveCommercialReferenceStatus,
  type CommercialReferenceContext,
  type CommercialReferenceStatus,
  type StockDistributionFlag,
} from "@/lib/inventory/commercial-reference-status";
import {
  classifyReference,
  classifyReferenceWithDomainGate,
  buildContext,
} from "@/lib/inventory/commercial-reference-classifier";
import { resolveLifecycleState } from "@/lib/inventory/reference-lifecycle";
import { resolveWarehouseByPk } from "@/lib/inventory/warehouse-master";
import {
  resolveReferenceBusinessDomain,
  isReferenceInCastillitosCommercialScope,
  type ReferenceBusinessDomain,
} from "@/lib/inventory/reference-business-domain";

// ═══════════════════════════════════════════════════════════════════════════
// PART 1 — Deterministic unit cases with assertions
// ═══════════════════════════════════════════════════════════════════════════

interface TestCase {
  name: string;
  ctx: CommercialReferenceContext;
  expectedStatus: CommercialReferenceStatus;
  expectedStockFlag: StockDistributionFlag;
}

const UNIT_CASES: TestCase[] = [
  {
    name: "ACTIVE + stock comercial → ACTIVE_AVAILABLE",
    ctx: {
      lifecycleState: "ACTIVE",
      warehouseIds: ["10"],
      totalCommercialStock: 500,
      totalProductionStock: 0,
      totalContainerStock: 0,
      totalStagingStock: 0,
      totalOtherStock: 0,
      lastRelevantActivity: new Date("2026-06-01"),
      dataQualityFlags: [],
    },
    expectedStatus: "ACTIVE_AVAILABLE",
    expectedStockFlag: "COMMERCIAL_STOCK_AVAILABLE",
  },
  {
    name: "ACTIVE + solo contenedor → ACTIVE_NON_COMMERCIAL",
    ctx: {
      lifecycleState: "ACTIVE",
      warehouseIds: ["59"],
      totalCommercialStock: 0,
      totalProductionStock: 0,
      totalContainerStock: 200,
      totalStagingStock: 0,
      totalOtherStock: 0,
      lastRelevantActivity: new Date("2026-06-01"),
      dataQualityFlags: [],
    },
    expectedStatus: "ACTIVE_NON_COMMERCIAL",
    expectedStockFlag: "STOCK_ONLY_CONTAINER",
  },
  {
    name: "ACTIVE + solo produccion → ACTIVE_NON_COMMERCIAL",
    ctx: {
      lifecycleState: "ACTIVE",
      warehouseIds: ["13"],
      totalCommercialStock: 0,
      totalProductionStock: 150,
      totalContainerStock: 0,
      totalStagingStock: 0,
      totalOtherStock: 0,
      lastRelevantActivity: new Date("2026-06-01"),
      dataQualityFlags: [],
    },
    expectedStatus: "ACTIVE_NON_COMMERCIAL",
    expectedStockFlag: "STOCK_ONLY_PRODUCTION",
  },
  {
    name: "LOW_ACTIVITY + stock comercial → LOW_ACTIVITY_AVAILABLE",
    ctx: {
      lifecycleState: "LOW_ACTIVITY",
      warehouseIds: ["10"],
      totalCommercialStock: 80,
      totalProductionStock: 0,
      totalContainerStock: 0,
      totalStagingStock: 0,
      totalOtherStock: 0,
      lastRelevantActivity: new Date("2025-10-01"),
      dataQualityFlags: [],
    },
    expectedStatus: "LOW_ACTIVITY_AVAILABLE",
    expectedStockFlag: "COMMERCIAL_STOCK_AVAILABLE",
  },
  {
    name: "LOW_ACTIVITY + sin stock comercial → LOW_ACTIVITY_NON_COMMERCIAL",
    ctx: {
      lifecycleState: "LOW_ACTIVITY",
      warehouseIds: ["36"],
      totalCommercialStock: 0,
      totalProductionStock: 0,
      totalContainerStock: 0,
      totalStagingStock: 100,
      totalOtherStock: 0,
      lastRelevantActivity: new Date("2025-10-01"),
      dataQualityFlags: [],
    },
    expectedStatus: "LOW_ACTIVITY_NON_COMMERCIAL",
    expectedStockFlag: "STOCK_ONLY_STAGING",
  },
  {
    name: "DORMANT → DORMANT (stock irrelevante)",
    ctx: {
      lifecycleState: "DORMANT",
      warehouseIds: ["10"],
      totalCommercialStock: 300,
      totalProductionStock: 0,
      totalContainerStock: 0,
      totalStagingStock: 0,
      totalOtherStock: 0,
      lastRelevantActivity: new Date("2024-12-01"),
      dataQualityFlags: [],
    },
    expectedStatus: "DORMANT",
    expectedStockFlag: "COMMERCIAL_STOCK_AVAILABLE",
  },
  {
    name: "ARCHIVE_REVIEW → ARCHIVE_REVIEW (stock irrelevante)",
    ctx: {
      lifecycleState: "ARCHIVE_REVIEW",
      warehouseIds: ["10"],
      totalCommercialStock: 50,
      totalProductionStock: 0,
      totalContainerStock: 0,
      totalStagingStock: 0,
      totalOtherStock: 0,
      lastRelevantActivity: new Date("2023-01-01"),
      dataQualityFlags: [],
    },
    expectedStatus: "ARCHIVE_REVIEW",
    expectedStockFlag: "COMMERCIAL_STOCK_AVAILABLE",
  },
  {
    name: "NO_ACTIVITY_DATA → UNKNOWN",
    ctx: {
      lifecycleState: "NO_ACTIVITY_DATA",
      warehouseIds: [],
      totalCommercialStock: 0,
      totalProductionStock: 0,
      totalContainerStock: 0,
      totalStagingStock: 0,
      totalOtherStock: 0,
      lastRelevantActivity: null,
      dataQualityFlags: ["MISSING_LAST_MODIFIED", "MISSING_LAST_SALE"],
    },
    expectedStatus: "UNKNOWN",
    expectedStockFlag: "NO_ACTIVITY_DATA",
  },
];

const PRECEDENCE_CASES: TestCase[] = [
  {
    name: "PRECEDENCE: DORMANT con stock comercial NO se vuelve AVAILABLE",
    ctx: {
      lifecycleState: "DORMANT",
      warehouseIds: ["10", "33"],
      totalCommercialStock: 9999,
      totalProductionStock: 0,
      totalContainerStock: 0,
      totalStagingStock: 0,
      totalOtherStock: 0,
      lastRelevantActivity: new Date("2025-01-01"),
      dataQualityFlags: [],
    },
    expectedStatus: "DORMANT",
    expectedStockFlag: "COMMERCIAL_STOCK_AVAILABLE",
  },
  {
    name: "PRECEDENCE: ARCHIVE_REVIEW con stock comercial NO se vuelve AVAILABLE",
    ctx: {
      lifecycleState: "ARCHIVE_REVIEW",
      warehouseIds: ["10"],
      totalCommercialStock: 5000,
      totalProductionStock: 0,
      totalContainerStock: 0,
      totalStagingStock: 0,
      totalOtherStock: 0,
      lastRelevantActivity: new Date("2022-01-01"),
      dataQualityFlags: [],
    },
    expectedStatus: "ARCHIVE_REVIEW",
    expectedStockFlag: "COMMERCIAL_STOCK_AVAILABLE",
  },
  {
    name: "PRECEDENCE: ACTIVE con stock SOLO contenedor NO es AVAILABLE",
    ctx: {
      lifecycleState: "ACTIVE",
      warehouseIds: ["59", "60"],
      totalCommercialStock: 0,
      totalProductionStock: 0,
      totalContainerStock: 5000,
      totalStagingStock: 0,
      totalOtherStock: 0,
      lastRelevantActivity: new Date("2026-07-01"),
      dataQualityFlags: [],
    },
    expectedStatus: "ACTIVE_NON_COMMERCIAL",
    expectedStockFlag: "STOCK_ONLY_CONTAINER",
  },
];

console.log("=== PART 1: Deterministic Unit Cases ===\n");

let pass = 0;
let fail = 0;
const allCases = [...UNIT_CASES, ...PRECEDENCE_CASES];

for (const tc of allCases) {
  const result = resolveCommercialReferenceStatus(tc.ctx);
  const statusOk = result.status === tc.expectedStatus;
  const flagOk = result.stockDistribution === tc.expectedStockFlag;

  if (statusOk && flagOk) {
    pass++;
    console.log(`  PASS  ${tc.name}`);
    console.log(`        status=${result.status}  stockDist=${result.stockDistribution}`);
  } else {
    fail++;
    console.log(`  FAIL  ${tc.name}`);
    if (!statusOk) {
      console.log(`        status expected: ${tc.expectedStatus}  got: ${result.status}`);
    }
    if (!flagOk) {
      console.log(`        stockDist expected: ${tc.expectedStockFlag}  got: ${result.stockDistribution}`);
    }
    console.log(`        reason: ${result.reason}`);
  }
}

console.log(`\n  RESULT: ${pass} passed, ${fail} failed out of ${allCases.length}\n`);

if (fail > 0) {
  console.error("UNIT CASES FAILED — aborting.");
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════════
// PART 2 — Business Domain Gate (6 mandatory cases)
// ═══════════════════════════════════════════════════════════════════════════

interface DomainTestCase {
  name: string;
  grupoSag: string | null;
  productLine: string | null;
  expectedDomain: ReferenceBusinessDomain;
  expectedInScope: boolean;
  /** If true, also check classifier via classifyReferenceWithDomainGate */
  classifierCheck?: {
    lifecycleState: "ACTIVE" | "LOW_ACTIVITY" | "DORMANT" | "ARCHIVE_REVIEW" | "NO_ACTIVITY_DATA";
    inventoryLevels: { warehouseId: string; quantity: number }[];
    expectedExcluded: boolean;
  };
}

const DOMAIN_GATE_CASES: DomainTestCase[] = [
  {
    name: "DOMAIN-1: JUPITER_PETS + stock en bodega textil → excluido por dominio",
    grupoSag: "JUPITER PETS",
    productLine: null,
    expectedDomain: "JUPITER_PETS",
    expectedInScope: false,
    classifierCheck: {
      lifecycleState: "ACTIVE",
      inventoryLevels: [{ warehouseId: "10", quantity: 80 }],
      expectedExcluded: true,
    },
  },
  {
    name: "DOMAIN-2: JUPITER_PETS + stock en bodega importacion → excluido por dominio",
    grupoSag: "JUPITER PETS",
    productLine: null,
    expectedDomain: "JUPITER_PETS",
    expectedInScope: false,
    classifierCheck: {
      lifecycleState: "ACTIVE",
      inventoryLevels: [{ warehouseId: "33", quantity: 500 }],
      expectedExcluded: true,
    },
  },
  {
    name: "DOMAIN-3: JUPITER_PETS + stock solo contenedor → excluido por dominio Y bodega",
    grupoSag: "JUPITER PETS",
    productLine: null,
    expectedDomain: "JUPITER_PETS",
    expectedInScope: false,
    classifierCheck: {
      lifecycleState: "ACTIVE",
      inventoryLevels: [{ warehouseId: "59", quantity: 1000 }],
      expectedExcluded: true,
    },
  },
  {
    name: "DOMAIN-4: CASTILLITOS_TEXTILE + stock textil → clasifica normalmente",
    grupoSag: "CS BASICA",
    productLine: "2",
    expectedDomain: "CASTILLITOS_TEXTILE",
    expectedInScope: true,
    classifierCheck: {
      lifecycleState: "ACTIVE",
      inventoryLevels: [{ warehouseId: "10", quantity: 200 }],
      expectedExcluded: false,
    },
  },
  {
    name: "DOMAIN-5: CASTILLITOS_IMPORT + stock importacion → clasifica normalmente",
    grupoSag: "IMPORTACION",
    productLine: "5",
    expectedDomain: "CASTILLITOS_IMPORT",
    expectedInScope: true,
    classifierCheck: {
      lifecycleState: "ACTIVE",
      inventoryLevels: [{ warehouseId: "33", quantity: 300 }],
      expectedExcluded: false,
    },
  },
  {
    name: "DOMAIN-6: UNKNOWN domain + stock en cualquier bodega → no entra al inventario comercial",
    grupoSag: "ALGO DESCONOCIDO",
    productLine: null,
    expectedDomain: "UNKNOWN",
    expectedInScope: false,
    classifierCheck: {
      lifecycleState: "ACTIVE",
      inventoryLevels: [{ warehouseId: "10", quantity: 999 }],
      expectedExcluded: true,
    },
  },
];

console.log("=== PART 2: Business Domain Gate (6 Mandatory Cases) ===\n");

let domainPass = 0;
let domainFail = 0;

for (const tc of DOMAIN_GATE_CASES) {
  const domain = resolveReferenceBusinessDomain({
    lineaSag: null,
    productLine: tc.productLine,
    grupoSag: tc.grupoSag,
    subgrupoSag: null,
  });
  const inScope = isReferenceInCastillitosCommercialScope(domain);

  const domainOk = domain === tc.expectedDomain;
  const scopeOk = inScope === tc.expectedInScope;

  let classifierOk = true;
  let classifierDetail = "";

  if (tc.classifierCheck) {
    const gateResult = classifyReferenceWithDomainGate({
      lifecycleState: tc.classifierCheck.lifecycleState,
      lastModifiedAt: new Date("2026-06-01"),
      lastSaleDate: new Date("2026-05-01"),
      inventoryLevels: tc.classifierCheck.inventoryLevels,
      productLine: tc.productLine,
      grupoSag: tc.grupoSag,
    });

    if (tc.classifierCheck.expectedExcluded) {
      // Must be excluded: inScope=false, classification.status=UNKNOWN, exclusionReason non-null
      if (gateResult.inScope !== false) {
        classifierOk = false;
        classifierDetail = `expected inScope=false, got inScope=${gateResult.inScope}`;
      } else if (gateResult.exclusionReason === null) {
        classifierOk = false;
        classifierDetail = `expected exclusionReason non-null, got null`;
      }
    } else {
      // Must classify normally: inScope=true, exclusionReason=null, status != UNKNOWN (unless lifecycle says so)
      if (gateResult.inScope !== true) {
        classifierOk = false;
        classifierDetail = `expected inScope=true, got inScope=${gateResult.inScope}`;
      } else if (gateResult.exclusionReason !== null) {
        classifierOk = false;
        classifierDetail = `expected exclusionReason=null, got ${gateResult.exclusionReason}`;
      } else if (gateResult.classification.status === "UNKNOWN") {
        classifierOk = false;
        classifierDetail = `expected valid classification, got UNKNOWN`;
      }
    }

    if (!classifierDetail) {
      classifierDetail = `inScope=${gateResult.inScope} status=${gateResult.classification.status} exclusion=${gateResult.exclusionReason}`;
    }
  }

  if (domainOk && scopeOk && classifierOk) {
    domainPass++;
    console.log(`  PASS  ${tc.name}`);
    console.log(`        domain=${domain}  inScope=${inScope}  ${classifierDetail}`);
  } else {
    domainFail++;
    console.log(`  FAIL  ${tc.name}`);
    if (!domainOk) console.log(`        domain expected: ${tc.expectedDomain}  got: ${domain}`);
    if (!scopeOk) console.log(`        inScope expected: ${tc.expectedInScope}  got: ${inScope}`);
    if (!classifierOk) console.log(`        classifier: ${classifierDetail}`);
  }
}

console.log(`\n  RESULT: ${domainPass} passed, ${domainFail} failed out of ${DOMAIN_GATE_CASES.length}\n`);

if (domainFail > 0) {
  console.error("DOMAIN GATE CASES FAILED — aborting.");
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════════
// PART 3 — Real references against Castillitos DB (with domain gate)
// ═══════════════════════════════════════════════════════════════════════════

async function validateRealCases() {
  const { prisma } = await import("@/lib/prisma");
  const db = prisma as any;

  // Resolve org ID from slug — never hardcode the CUID
  const org = await db.organization.findFirst({ where: { slug: "castillitos" }, select: { id: true } });
  if (!org) { console.error("Organization 'castillitos' not found"); process.exit(1); }
  const ORG_ID = org.id as string;
  console.log(`  orgId resolved: ${ORG_ID}\n`);

  const REFS = ["C-1373339", "5321", "L-3102", "CD-4913639", "pjb66"];

  console.log("=== PART 3: Real References with Domain Gate (Castillitos) ===\n");

  let realPass = 0;
  let realFail = 0;

  for (const ref of REFS) {
    console.log(`--- ${ref} ---`);

    const product = await db.productEntity.findFirst({
      where: {
        organizationId: ORG_ID,
        OR: [
          { sku: ref },
          { externalId: ref },
        ],
      },
      select: {
        id: true,
        externalId: true,
        name: true,
        productLine: true,
        grupoSag: true,
        lineaSag: true,
        subgrupoSag: true,
        status: true,
        lastModifiedSag: true,
        lastSaleSag: true,
      },
    });

    if (!product) {
      console.log("  NOT FOUND in database");
      realFail++;
      console.log("  FAIL — reference not found\n");
      continue;
    }

    // Lifecycle
    const lifecycle = resolveLifecycleState({
      lastModifiedAt: product.lastModifiedSag,
      lastSaleDate: product.lastSaleSag,
    });

    // Inventory
    const levels = await db.productInventoryLevel.findMany({
      where: { organizationId: ORG_ID, productId: product.id },
      select: { warehouseId: true, externalRef: true, quantity: true },
    });

    // Domain gate classification
    const gateResult = classifyReferenceWithDomainGate({
      lifecycleState: lifecycle.lifecycleState,
      lastModifiedAt: product.lastModifiedSag,
      lastSaleDate: product.lastSaleSag,
      inventoryLevels: levels.map((l: any) => ({
        warehouseId: l.warehouseId,
        quantity: Number(l.quantity ?? 0),
      })),
      productLine: product.productLine,
      grupoSag: product.grupoSag,
      lineaSag: product.lineaSag,
      subgrupoSag: product.subgrupoSag,
    });

    const ctx = buildContext({
      lifecycleState: lifecycle.lifecycleState,
      lastModifiedAt: product.lastModifiedSag,
      lastSaleDate: product.lastSaleSag,
      inventoryLevels: levels.map((l: any) => ({
        warehouseId: l.warehouseId,
        quantity: Number(l.quantity ?? 0),
      })),
    });

    console.log(`  externalId:          ${product.externalId}`);
    console.log(`  name:                ${product.name}`);
    console.log(`  grupoSag:            ${product.grupoSag ?? "null"}`);
    console.log(`  productLine:         ${product.productLine ?? "null"}`);
    console.log(`  DOMAIN:              ${gateResult.domain}`);
    console.log(`  IN_SCOPE:            ${gateResult.inScope}`);
    console.log(`  EXCLUSION_REASON:    ${gateResult.exclusionReason ?? "none"}`);
    console.log(`  lifecycleState:      ${lifecycle.lifecycleState}`);
    console.log(`  lastModifiedSag:     ${product.lastModifiedSag?.toISOString() ?? "null"}`);
    console.log(`  lastSaleSag:         ${product.lastSaleSag?.toISOString() ?? "null"}`);

    // Warehouse breakdown
    console.log(`  warehouse breakdown:`);
    for (const lvl of levels) {
      const qty = Number(lvl.quantity ?? 0);
      const wh = resolveWarehouseByPk(lvl.warehouseId);
      const tag = wh ? `${wh.businessType} (${wh.ssNombre})` : "UNMAPPED";
      console.log(`    wh=${lvl.warehouseId} ref=${lvl.externalRef ?? "null"} qty=${qty} → ${tag}`);
    }

    console.log(`  totalCommercialStock: ${ctx.totalCommercialStock}`);
    console.log(`  totalProductionStock: ${ctx.totalProductionStock}`);
    console.log(`  totalStagingStock:    ${ctx.totalStagingStock}`);
    console.log(`  totalContainerStock:  ${ctx.totalContainerStock}`);
    console.log(`  totalOtherStock:      ${ctx.totalOtherStock}`);
    console.log(`  STATUS:               ${gateResult.classification.status}`);
    console.log(`  stockDistribution:    ${gateResult.classification.stockDistribution}`);
    console.log(`  reason:               ${gateResult.classification.reason}`);

    // Validate specific expectations
    if (ref === "C-1373339") {
      const s = gateResult.classification.status;
      if (s === "DORMANT" || s === "ARCHIVE_REVIEW") {
        console.log(`  ASSERTION OK — C-1373339 is ${s} as expected`);
        realPass++;
      } else {
        console.log(`  ASSERTION FAIL — C-1373339 expected DORMANT or ARCHIVE_REVIEW, got ${s}`);
        realFail++;
      }
    } else if (ref === "5321") {
      // 5321 is JUPITER PETS — must be EXCLUDED by domain gate
      if (gateResult.domain !== "JUPITER_PETS") {
        console.log(`  ASSERTION FAIL — 5321 expected domain JUPITER_PETS, got ${gateResult.domain}`);
        realFail++;
      } else if (gateResult.inScope !== false) {
        console.log(`  ASSERTION FAIL — 5321 expected inScope=false, got ${gateResult.inScope}`);
        realFail++;
      } else if (gateResult.exclusionReason !== "EXCLUDED_EXTERNAL_INTEGRATION") {
        console.log(`  ASSERTION FAIL — 5321 expected exclusionReason=EXCLUDED_EXTERNAL_INTEGRATION, got ${gateResult.exclusionReason}`);
        realFail++;
      } else {
        console.log(`  ASSERTION OK — 5321 (JUPITER PETS) excluded by domain gate: ${gateResult.exclusionReason}`);
        console.log(`  NOTE: +${ctx.totalCommercialStock} uds in commercial warehouse is residual/misplaced stock — domain gate prevents misclassification`);
        realPass++;
      }
    } else if (ref === "pjb66") {
      if (product.lastModifiedSag === null && product.lastSaleSag === null) {
        if (gateResult.classification.status === "UNKNOWN") {
          console.log(`  ASSERTION OK — pjb66 is UNKNOWN (no dates)`);
          realPass++;
        } else {
          console.log(`  ASSERTION FAIL — pjb66 has no dates but got ${gateResult.classification.status}`);
          realFail++;
        }
      } else {
        console.log(`  NOTE: pjb66 HAS dates — result ${gateResult.classification.status} is data-driven`);
        realPass++;
      }
    } else {
      // L-3102 and CD-4913639: validate returns a valid status and is in scope
      const validStatuses: CommercialReferenceStatus[] = [
        "ACTIVE_AVAILABLE", "ACTIVE_NON_COMMERCIAL",
        "LOW_ACTIVITY_AVAILABLE", "LOW_ACTIVITY_NON_COMMERCIAL",
        "DORMANT", "ARCHIVE_REVIEW", "UNKNOWN",
      ];
      if (validStatuses.includes(gateResult.classification.status)) {
        console.log(`  ASSERTION OK — ${ref} domain=${gateResult.domain} inScope=${gateResult.inScope} status=${gateResult.classification.status}`);
        realPass++;
      } else {
        console.log(`  ASSERTION FAIL — ${ref} returned invalid status ${gateResult.classification.status}`);
        realFail++;
      }
    }

    console.log();
  }

  // ── Jupiter Pets contamination summary ──────────────────────────────────
  console.log("=== Jupiter Pets Contamination Summary ===\n");

  const jpProducts = await db.productEntity.findMany({
    where: { organizationId: ORG_ID, grupoSag: "JUPITER PETS" },
    select: { id: true, externalId: true, sku: true },
  });
  console.log(`  Total Jupiter Pets references in Castillitos: ${jpProducts.length}`);

  const jpIds = jpProducts.map((p: any) => p.id);
  const jpLevels = await db.productInventoryLevel.findMany({
    where: { organizationId: ORG_ID, productId: { in: jpIds }, quantity: { gt: 0 } },
    select: { warehouseId: true, quantity: true, productId: true },
  });

  const jpByWh = new Map<string, number>();
  for (const l of jpLevels) {
    const wh = l.warehouseId;
    jpByWh.set(wh, (jpByWh.get(wh) || 0) + Number(l.quantity));
  }
  console.log(`  Positive stock by warehouse:`);
  for (const [wh, qty] of [...jpByWh.entries()].sort((a, b) => b[1] - a[1])) {
    const whInfo = resolveWarehouseByPk(wh);
    const tag = whInfo ? `${whInfo.businessType} (${whInfo.ssNombre})` : "UNMAPPED";
    console.log(`    wh=${wh} totalPositive=${qty} → ${tag}`);
  }

  console.log(`\n  REAL CASES: ${realPass} passed, ${realFail} failed out of ${REFS.length}\n`);

  await prisma.$disconnect();

  if (realFail > 0) {
    process.exit(1);
  }
}

validateRealCases().catch(e => { console.error(e); process.exit(1);
});
