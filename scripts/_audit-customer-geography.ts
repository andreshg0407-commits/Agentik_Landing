/**
 * scripts/_audit-customer-geography.ts
 *
 * CUSTOMER-GEOGRAPHY-AUDIT-01 — read-only audit of customer geographic data quality.
 * NO modifications. ONLY reads.
 *
 * Run: npx tsx scripts/_audit-customer-geography.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Inline DANE lookup for audit (matches dane-municipios.ts top codes)
const DANE_SAMPLE: Record<string, string> = {
  "05001": "Medellin", "05059": "Bello", "05088": "Briceno", "05107": "Caldas",
  "05172": "Copacabana", "05237": "Envigado", "05266": "Girardota", "05306": "Guarne",
  "05315": "Itagui", "05353": "La Ceja", "05360": "La Estrella", "05380": "La Union",
  "05440": "Marinilla", "05615": "Rionegro", "05631": "Sabaneta",
  "08001": "Barranquilla", "11001": "Bogota DC", "13001": "Cartagena",
  "15001": "Tunja", "17001": "Manizales", "19001": "Popayan",
  "20001": "Valledupar", "23001": "Monteria", "25001": "Agua de Dios",
  "25754": "Soacha", "27001": "Quibdo", "41001": "Neiva",
  "44001": "Riohacha", "47001": "Santa Marta", "50001": "Villavicencio",
  "52001": "Pasto", "54001": "Cucuta", "63001": "Armenia",
  "66001": "Pereira", "68001": "Bucaramanga", "68081": "Barrancabermeja",
  "70001": "Sincelejo", "73001": "Ibague", "76001": "Cali",
  "76111": "Guadalajara de Buga", "76520": "Palmira", "85001": "Yopal",
};

const DANE_5DIGIT = /^\d{5}$/;
const NUMERIC_ONLY = /^\d+$/;

function isDaneCode(v: string): boolean {
  // 5-digit or could be 4-digit (missing leading zero)
  return DANE_5DIGIT.test(v) || (v.length === 4 && NUMERIC_ONLY.test(v));
}

function normalizeDaneCode(v: string): string {
  return v.padStart(5, "0");
}

async function main() {
  const org = await prisma.organization.findFirst({
    where: { slug: "castillitos" },
    select: { id: true, slug: true, name: true },
  });
  if (!org) { console.log("Castillitos org not found"); return; }
  const orgId = org.id;
  console.log(`\nOrg: ${org.name} (${org.slug}) — ID: ${orgId}\n`);

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 1 — INVENTARIO DE CLIENTES
  // ══════════════════════════════════════════════════════════════════════════

  console.log("═══ FASE 1 — INVENTARIO DE CLIENTES ═══\n");

  const allCustomers = await prisma.customerProfile.findMany({
    where: { organizationId: orgId },
    select: {
      id: true,
      name: true,
      nit: true,
      nitNormalized: true,
      status: true,
      city: true,
      department: true,
      address: true,
      email: true,
      phone: true,
      erpId: true,
      crmId: true,
      sellerName: true,
      segment: true,
      rawCrmJson: true,
    },
  });

  const total = allCustomers.length;
  const active = allCustomers.filter(c => c.status === "ACTIVE").length;
  const withCity = allCustomers.filter(c => c.city && c.city.trim() !== "").length;
  const withoutCity = total - withCity;
  const withDept = allCustomers.filter(c => c.department && c.department.trim() !== "").length;
  const withAddress = allCustomers.filter(c => c.address && c.address.trim() !== "").length;

  // Classify city values
  const cityValues = allCustomers.map(c => c.city?.trim() ?? "").filter(Boolean);
  const numericCities = cityValues.filter(v => NUMERIC_ONLY.test(v));
  const daneCities = numericCities.filter(v => isDaneCode(v));
  const nonDaneNumeric = numericCities.filter(v => !isDaneCode(v));
  const textCities = cityValues.filter(v => !NUMERIC_ONLY.test(v));

  console.log(`Total clientes:                    ${total}`);
  console.log(`Clientes activos:                  ${active}`);
  console.log(`Clientes con campo ciudad:         ${withCity}`);
  console.log(`Clientes sin ciudad:               ${withoutCity}`);
  console.log(`  - Ciudad es codigo DANE (5 dig): ${daneCities.length}`);
  console.log(`  - Ciudad es numerico no-DANE:    ${nonDaneNumeric.length}`);
  console.log(`  - Ciudad es texto:               ${textCities.length}`);
  console.log(`Clientes con departamento:         ${withDept}`);
  console.log(`Clientes con direccion:            ${withAddress}`);

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 2 — CAMPOS SAG / CRM
  // ══════════════════════════════════════════════════════════════════════════

  console.log("\n═══ FASE 2 — CAMPOS DE ORIGEN ═══\n");

  // Check rawCrmJson for geographic fields
  const geoFields = new Map<string, number>();
  let samplesWithRaw = 0;

  for (const c of allCustomers) {
    const raw = c.rawCrmJson as any;
    if (!raw) continue;
    samplesWithRaw++;

    // Check nested raw object
    const rawObj = raw.raw ?? raw;
    for (const key of Object.keys(rawObj)) {
      const lower = key.toLowerCase();
      if (lower.includes("city") || lower.includes("ciudad") ||
          lower.includes("state") || lower.includes("department") ||
          lower.includes("country") || lower.includes("pais") ||
          lower.includes("address") || lower.includes("direccion") ||
          lower.includes("municipio") || lower.includes("region")) {
        geoFields.set(key, (geoFields.get(key) ?? 0) + 1);
      }
    }
  }

  console.log(`Clientes con rawCrmJson: ${samplesWithRaw}`);
  console.log("\n─── Campos geográficos encontrados en rawCrmJson ───");
  for (const [field, count] of [...geoFields.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${field.padEnd(40)} ${count} clientes`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 3 — TOP CÓDIGOS DE CIUDAD
  // ══════════════════════════════════════════════════════════════════════════

  console.log("\n═══ FASE 3 — TOP CÓDIGOS DE CIUDAD ═══\n");

  const codeCounts = new Map<string, number>();
  for (const c of allCustomers) {
    const v = c.city?.trim() ?? "(sin ciudad)";
    codeCounts.set(v, (codeCounts.get(v) ?? 0) + 1);
  }

  const sorted = [...codeCounts.entries()].sort((a, b) => b[1] - a[1]);
  const showTop = Math.min(100, sorted.length);

  console.log(`Valores distintos de ciudad: ${sorted.length}\n`);
  console.log("CODIGO/VALOR".padEnd(30) + "CLIENTES".padEnd(10) + "TIPO".padEnd(15) + "RESUELVE A");
  console.log("-".repeat(85));

  for (let i = 0; i < showTop; i++) {
    const [code, count] = sorted[i];
    let tipo = "—";
    let resuelve = "";

    if (code === "(sin ciudad)") {
      tipo = "vacio";
    } else if (isDaneCode(code)) {
      tipo = "DANE";
      const norm = normalizeDaneCode(code);
      resuelve = DANE_SAMPLE[norm] ?? `(sin entrada DANE para ${norm})`;
    } else if (NUMERIC_ONLY.test(code)) {
      tipo = "numerico SAG";
    } else {
      tipo = "texto";
      resuelve = code;
    }

    console.log(
      code.padEnd(30) +
      String(count).padEnd(10) +
      tipo.padEnd(15) +
      resuelve
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 4 — MUESTRA REAL
  // ══════════════════════════════════════════════════════════════════════════

  console.log("\n═══ FASE 4 — MUESTRA REAL (50 clientes) ═══\n");

  // Get a diverse sample: some with DANE, some with numeric, some without city
  const sampleDane = allCustomers.filter(c => c.city && isDaneCode(c.city.trim())).slice(0, 20);
  const sampleNumeric = allCustomers.filter(c => c.city && NUMERIC_ONLY.test(c.city.trim()) && !isDaneCode(c.city.trim())).slice(0, 15);
  const sampleText = allCustomers.filter(c => c.city && !NUMERIC_ONLY.test(c.city.trim())).slice(0, 10);
  const sampleEmpty = allCustomers.filter(c => !c.city || c.city.trim() === "").slice(0, 5);
  const sample = [...sampleDane, ...sampleNumeric, ...sampleText, ...sampleEmpty].slice(0, 50);

  console.log(
    "CLIENTE".padEnd(35) +
    "NIT".padEnd(15) +
    "CITY RAW".padEnd(12) +
    "CIUDAD RESUELTA".padEnd(25) +
    "DEPARTAMENTO".padEnd(20) +
    "FUENTE"
  );
  console.log("-".repeat(115));

  for (const c of sample) {
    const cityRaw = c.city?.trim() ?? "";
    let resolved = "";
    let source = "";

    if (!cityRaw) {
      resolved = "(vacio)";
      source = "—";
    } else if (isDaneCode(cityRaw)) {
      const norm = normalizeDaneCode(cityRaw);
      resolved = DANE_SAMPLE[norm] ?? `(DANE ${norm} no mapeado)`;
      source = "CRM/DANE";
    } else if (NUMERIC_ONLY.test(cityRaw)) {
      resolved = "(codigo SAG)";
      source = "SAG";
    } else {
      resolved = cityRaw;
      source = "texto";
    }

    console.log(
      (c.name || "—").substring(0, 33).padEnd(35) +
      (c.nit || c.nitNormalized || "—").padEnd(15) +
      cityRaw.padEnd(12) +
      resolved.substring(0, 23).padEnd(25) +
      (c.department || "—").substring(0, 18).padEnd(20) +
      source
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 5 — TRAZABILIDAD SAG / CRM
  // ══════════════════════════════════════════════════════════════════════════

  console.log("\n═══ FASE 5 — TRAZABILIDAD DEL CÓDIGO DE CIUDAD ═══\n");

  // Analyze rawCrmJson to find the actual billing_address_city values
  let crmWithBillingCity = 0;
  let crmBillingCityIsDane = 0;
  let crmBillingCityIsNumeric = 0;
  let crmBillingCityIsText = 0;
  const rawBillingCitySamples: { name: string; billingCity: string; storedCity: string }[] = [];

  for (const c of allCustomers) {
    const raw = c.rawCrmJson as any;
    if (!raw) continue;
    const rawObj = raw.raw ?? raw;
    const bc = rawObj.billing_address_city ?? rawObj.city ?? rawObj.ciudad;
    if (!bc || String(bc).trim() === "") continue;

    const val = String(bc).trim();
    crmWithBillingCity++;

    if (isDaneCode(val)) crmBillingCityIsDane++;
    else if (NUMERIC_ONLY.test(val)) crmBillingCityIsNumeric++;
    else crmBillingCityIsText++;

    if (rawBillingCitySamples.length < 20) {
      rawBillingCitySamples.push({
        name: c.name,
        billingCity: val,
        storedCity: c.city ?? "(null)",
      });
    }
  }

  console.log(`Clientes con billing_address_city en CRM raw: ${crmWithBillingCity}`);
  console.log(`  - Es codigo DANE:     ${crmBillingCityIsDane}`);
  console.log(`  - Es numerico no-DANE: ${crmBillingCityIsNumeric}`);
  console.log(`  - Es texto:            ${crmBillingCityIsText}`);

  console.log("\n─── Muestra: billing_address_city vs city almacenada ───");
  for (const s of rawBillingCitySamples) {
    console.log(`  ${s.name.substring(0, 30).padEnd(32)} raw: ${s.billingCity.padEnd(10)} → stored: ${s.storedCity}`);
  }

  // Check for SAG-specific codes (non-DANE numerics)
  const sagOnlyCodes = allCustomers
    .filter(c => c.city && NUMERIC_ONLY.test(c.city.trim()) && !isDaneCode(c.city.trim()))
    .map(c => c.city!.trim());

  const sagCodeFreq = new Map<string, number>();
  for (const code of sagOnlyCodes) {
    sagCodeFreq.set(code, (sagCodeFreq.get(code) ?? 0) + 1);
  }

  console.log("\n─── Códigos numéricos NO-DANE (posibles códigos SAG internos) ───");
  for (const [code, count] of [...sagCodeFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
    console.log(`  ${code.padEnd(10)} ${count} clientes`);
  }

  // Check department values
  const deptValues = new Map<string, number>();
  for (const c of allCustomers) {
    const d = c.department?.trim() ?? "(sin departamento)";
    deptValues.set(d, (deptValues.get(d) ?? 0) + 1);
  }

  console.log("\n─── Valores de departamento ───");
  for (const [dept, count] of [...deptValues.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log(`  ${dept.padEnd(30)} ${count} clientes`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 6 — POSIBLE NORMALIZACIÓN
  // ══════════════════════════════════════════════════════════════════════════

  console.log("\n═══ FASE 6 — ESTIMACIÓN DE NORMALIZACIÓN ═══\n");

  // Categories:
  // A) DANE code → auto-resolvable via dane-municipios.ts
  // B) Already text → pass through (already resolved or city name)
  // C) Non-DANE numeric (SAG code) → needs lookup table or manual mapping
  // D) Empty → needs data capture

  const catA = allCustomers.filter(c => c.city && isDaneCode(c.city.trim())).length;
  const catB = allCustomers.filter(c => c.city && !NUMERIC_ONLY.test(c.city.trim())).length;
  const catC = allCustomers.filter(c => c.city && NUMERIC_ONLY.test(c.city.trim()) && !isDaneCode(c.city.trim())).length;
  const catD = allCustomers.filter(c => !c.city || c.city.trim() === "").length;

  console.log(`A) Código DANE (auto-resoluble):       ${catA} (${(catA/total*100).toFixed(1)}%)`);
  console.log(`B) Ya es texto (pass through):         ${catB} (${(catB/total*100).toFixed(1)}%)`);
  console.log(`C) Numérico SAG (necesita mapping):    ${catC} (${(catC/total*100).toFixed(1)}%)`);
  console.log(`D) Vacío (necesita captura):           ${catD} (${(catD/total*100).toFixed(1)}%)`);
  console.log(`\nTotal:                                 ${total}`);
  console.log(`\nAutomáticos (A + B):                   ${catA + catB} (${((catA+catB)/total*100).toFixed(1)}%)`);
  console.log(`Requiere mapping SAG (C):              ${catC} (${(catC/total*100).toFixed(1)}%)`);
  console.log(`Sin dato (D):                          ${catD} (${(catD/total*100).toFixed(1)}%)`);

  // ══════════════════════════════════════════════════════════════════════════
  // RESUMEN
  // ══════════════════════════════════════════════════════════════════════════

  console.log("\n═══ RESUMEN ═══\n");
  console.log(`Total clientes: ${total}`);
  console.log(`Con geografía útil (A+B): ${catA + catB} (${((catA+catB)/total*100).toFixed(1)}%)`);
  console.log(`Códigos DANE resolubles: ${catA} (${(catA/total*100).toFixed(1)}%)`);
  console.log(`Ya texto: ${catB} (${(catB/total*100).toFixed(1)}%)`);
  console.log(`Códigos SAG (mapping pendiente): ${catC} (${(catC/total*100).toFixed(1)}%)`);
  console.log(`Sin ciudad: ${catD} (${(catD/total*100).toFixed(1)}%)`);
  console.log(`Valores distintos departamento: ${deptValues.size}`);

  await prisma.$disconnect();
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
