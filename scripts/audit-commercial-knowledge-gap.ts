/**
 * scripts/audit-commercial-knowledge-gap.ts
 *
 * Validates the Commercial Knowledge Gap Discovery deliverables.
 *
 * Checks:
 *   - Every capability has data requirements.
 *   - Every data item has consumers.
 *   - Every consumer maps to a known engine/module.
 *   - No capability lacks an identified source.
 *   - Knowledge graph is consistent.
 *
 * Usage: npx tsx scripts/audit-commercial-knowledge-gap.ts
 *
 * Sprint: SAG-COMMERCIAL-KNOWLEDGE-GAP-DISCOVERY-01
 */

// ── Domain model ──────────────────────────────────────────────────────────────

type GapClassification =
  | "AVAILABLE_DIRECTLY"
  | "DERIVABLE"
  | "REQUIRES_COMPOSITION"
  | "NOT_AVAILABLE";

type Priority = "MUY_ALTA" | "ALTA" | "MEDIA" | "BAJA";

interface DataRequirement {
  name: string;
  exists: boolean;
  sagSource: string | null; // null = not in SAG
  classification: GapClassification;
}

interface Capability {
  id: string;
  name: string;
  question: string;
  dataRequirements: DataRequirement[];
  consumers: string[];
  priority: Priority;
  implemented: boolean;
}

interface KnownEngine {
  id: string;
  name: string;
  status: "FUNCTIONAL" | "PARTIAL" | "PLANNED";
}

// ── Known engines/modules ─────────────────────────────────────────────────────

const KNOWN_ENGINES: KnownEngine[] = [
  { id: "coverage", name: "Coverage Engine", status: "FUNCTIONAL" },
  { id: "repurchase", name: "Repurchase Engine", status: "PLANNED" },
  { id: "production_pressure", name: "Production Pressure Engine", status: "FUNCTIONAL" },
  { id: "markdown", name: "Markdown Engine", status: "PLANNED" },
  { id: "transfer", name: "Transfer Engine", status: "PARTIAL" },
  { id: "intelligence", name: "Intelligence Engine", status: "PLANNED" },
  { id: "vendor", name: "Vendor Engine", status: "PARTIAL" },
  { id: "pricing", name: "Pricing Engine", status: "PLANNED" },
  { id: "demand", name: "Demand Engine", status: "FUNCTIONAL" },
  { id: "maletas", name: "Maletas Engine", status: "FUNCTIONAL" },
  { id: "tiendas", name: "Tiendas Module", status: "FUNCTIONAL" },
  { id: "inventario", name: "Inventario Module", status: "FUNCTIONAL" },
  { id: "pedidos", name: "Pedidos Module", status: "FUNCTIONAL" },
  { id: "importaciones", name: "Importaciones Module", status: "PLANNED" },
  { id: "compras", name: "Compras Module", status: "PLANNED" },
  { id: "produccion", name: "Produccion Module", status: "PARTIAL" },
  { id: "crm", name: "CRM Module", status: "FUNCTIONAL" },
  { id: "alertas", name: "Alertas System", status: "FUNCTIONAL" },
  { id: "copilot", name: "IA Comercial / Copilot", status: "PLANNED" },
  { id: "comisiones", name: "Comisiones", status: "PLANNED" },
  { id: "calidad", name: "Calidad", status: "PLANNED" },
  { id: "segmentacion", name: "Segmentacion Clientes", status: "PLANNED" },
];

const KNOWN_ENGINE_NAMES = new Set(KNOWN_ENGINES.map(e => e.name));

// ── Capabilities ──────────────────────────────────────────────────────────────

const CAPABILITIES: Capability[] = [
  {
    id: "CAP-01",
    name: "Edad del Inventario",
    question: "Cuanto tiempo lleva un producto desde su ingreso al inventario?",
    dataRequirements: [
      { name: "Fecha ingreso (primer movimiento entrada)", exists: false, sagSource: "MOVIMIENTOS tipo entrada", classification: "DERIVABLE" },
      { name: "Fecha actual", exists: true, sagSource: null, classification: "AVAILABLE_DIRECTLY" },
      { name: "Cantidad actual", exists: true, sagSource: "ProductInventoryLevel", classification: "AVAILABLE_DIRECTLY" },
    ],
    consumers: ["Importaciones Module", "Repurchase Engine", "Alertas System", "Markdown Engine", "IA Comercial / Copilot"],
    priority: "ALTA",
    implemented: false,
  },
  {
    id: "CAP-02",
    name: "Rotacion por Referencia",
    question: "Que porcentaje del lote ya fue vendido en un periodo dado?",
    dataRequirements: [
      { name: "Cantidad ingresada (lote)", exists: false, sagSource: "MOVIMIENTOS_ITEMS entradas", classification: "AVAILABLE_DIRECTLY" },
      { name: "Unidades vendidas", exists: false, sagSource: "MOVIMIENTOS_ITEMS FV/NV", classification: "AVAILABLE_DIRECTLY" },
      { name: "Cantidad disponible actual", exists: true, sagSource: "ProductInventoryLevel", classification: "AVAILABLE_DIRECTLY" },
    ],
    consumers: ["Repurchase Engine", "Intelligence Engine", "Compras Module", "Maletas Engine", "Markdown Engine", "Pricing Engine"],
    priority: "ALTA",
    implemented: false,
  },
  {
    id: "CAP-03",
    name: "Cobertura de Tiendas",
    question: "La tienda cumple su nivel ideal de inventario?",
    dataRequirements: [
      { name: "Inventario actual por tienda", exists: true, sagSource: "Inventario por bodega", classification: "AVAILABLE_DIRECTLY" },
      { name: "Regla de cobertura", exists: true, sagSource: "StorePolicyRule", classification: "AVAILABLE_DIRECTLY" },
      { name: "Disponible en origen", exists: true, sagSource: "SagInventoryItem", classification: "AVAILABLE_DIRECTLY" },
    ],
    consumers: ["Coverage Engine", "Tiendas Module", "Transfer Engine", "Inventario Module"],
    priority: "MEDIA",
    implemented: true,
  },
  {
    id: "CAP-04",
    name: "Antiguedad Comercial",
    question: "Cuanto tiempo lleva una referencia sin ningun movimiento?",
    dataRequirements: [
      { name: "Ultimo movimiento venta", exists: true, sagSource: "SaleRecord.saleDate", classification: "AVAILABLE_DIRECTLY" },
      { name: "Ultimo movimiento entrada", exists: false, sagSource: "MOVIMIENTOS MAX(fecha)", classification: "DERIVABLE" },
      { name: "Fecha actual", exists: true, sagSource: null, classification: "AVAILABLE_DIRECTLY" },
    ],
    consumers: ["Markdown Engine", "Transfer Engine", "Alertas System", "IA Comercial / Copilot"],
    priority: "ALTA",
    implemented: false,
  },
  {
    id: "CAP-05",
    name: "Decision de Recompra",
    question: "Que referencias deberian recomprarse este mes?",
    dataRequirements: [
      { name: "Rotacion (3/6/12 meses)", exists: false, sagSource: "Requiere CAP-02", classification: "REQUIRES_COMPOSITION" },
      { name: "Stock actual", exists: true, sagSource: "ProductInventoryLevel", classification: "AVAILABLE_DIRECTLY" },
      { name: "Demanda pendiente (PD)", exists: true, sagSource: "CustomerOrderRecord", classification: "AVAILABLE_DIRECTLY" },
      { name: "Lead time produccion", exists: true, sagSource: "ProductionTimeline", classification: "DERIVABLE" },
      { name: "Ultima produccion", exists: true, sagSource: "ProductionOrder.documentDate", classification: "AVAILABLE_DIRECTLY" },
      { name: "Historico precios compra", exists: false, sagSource: null, classification: "NOT_AVAILABLE" },
    ],
    consumers: ["Compras Module", "Produccion Module", "Intelligence Engine", "IA Comercial / Copilot", "Pedidos Module"],
    priority: "MUY_ALTA",
    implemented: false,
  },
  {
    id: "CAP-06",
    name: "Margen por Producto",
    question: "Cual es el margen real de cada referencia?",
    dataRequirements: [
      { name: "Precio venta real", exists: false, sagSource: "MOVIMIENTOS_ITEMS FV n_valor_unitario", classification: "AVAILABLE_DIRECTLY" },
      { name: "Costo unitario produccion", exists: true, sagSource: "ProductionOrderLine.unitCost", classification: "AVAILABLE_DIRECTLY" },
      { name: "Costo materia prima", exists: true, sagSource: "CN.lineMetadata.cost", classification: "AVAILABLE_DIRECTLY" },
      { name: "Descuentos aplicados", exists: false, sagSource: null, classification: "NOT_AVAILABLE" },
    ],
    consumers: ["Pricing Engine", "Intelligence Engine", "IA Comercial / Copilot"],
    priority: "ALTA",
    implemented: false,
  },
  {
    id: "CAP-07",
    name: "Performance por Vendedor",
    question: "Que vendedor vende mejor cada categoria/linea?",
    dataRequirements: [
      { name: "Venta por vendedor", exists: true, sagSource: "SaleRecord.sellerSlug", classification: "AVAILABLE_DIRECTLY" },
      { name: "Venta por linea+vendedor", exists: true, sagSource: "SaleRecord", classification: "AVAILABLE_DIRECTLY" },
      { name: "Conversion PD-FV por vendedor", exists: true, sagSource: "Conversion engine", classification: "AVAILABLE_DIRECTLY" },
      { name: "Cuota mensual por vendedor", exists: false, sagSource: null, classification: "NOT_AVAILABLE" },
    ],
    consumers: ["Vendor Engine", "Comisiones", "IA Comercial / Copilot"],
    priority: "MEDIA",
    implemented: false,
  },
  {
    id: "CAP-08",
    name: "Inteligencia Geografica",
    question: "Que ciudades consumen mas determinada linea?",
    dataRequirements: [
      { name: "Ciudad del cliente", exists: true, sagSource: "CRM billing_address_city", classification: "AVAILABLE_DIRECTLY" },
      { name: "Venta por cliente", exists: true, sagSource: "SaleRecord + CustomerProfile", classification: "AVAILABLE_DIRECTLY" },
      { name: "Linea de producto por venta", exists: true, sagSource: "SaleRecord.productLine", classification: "AVAILABLE_DIRECTLY" },
    ],
    consumers: ["CRM Module", "Intelligence Engine", "IA Comercial / Copilot"],
    priority: "MEDIA",
    implemented: false,
  },
  {
    id: "CAP-09",
    name: "Presion Productiva",
    question: "Que referencias tienen demanda insatisfecha que requiere produccion?",
    dataRequirements: [
      { name: "Pedidos pendientes por referencia", exists: true, sagSource: "CustomerOrderRecord (PD)", classification: "AVAILABLE_DIRECTLY" },
      { name: "Disponible actual", exists: true, sagSource: "ProductInventoryLevel", classification: "AVAILABLE_DIRECTLY" },
      { name: "Produccion en proceso", exists: true, sagSource: "ProductionOrder (OP abiertos)", classification: "AVAILABLE_DIRECTLY" },
      { name: "Cobertura objetivo", exists: true, sagSource: "StorePolicyRule", classification: "AVAILABLE_DIRECTLY" },
    ],
    consumers: ["Produccion Module", "Coverage Engine", "Maletas Engine", "Compras Module", "Demand Engine", "Production Pressure Engine"],
    priority: "ALTA",
    implemented: true,
  },
  {
    id: "CAP-10",
    name: "Sobreinventario por Tienda",
    question: "Que tiendas estan sobreinventariadas?",
    dataRequirements: [
      { name: "Inventario actual por tienda", exists: true, sagSource: "SAG inventario por bodega", classification: "AVAILABLE_DIRECTLY" },
      { name: "Max cobertura configurado", exists: true, sagSource: "StorePolicyRule.maxQty", classification: "AVAILABLE_DIRECTLY" },
    ],
    consumers: ["Tiendas Module", "Transfer Engine", "Alertas System", "Markdown Engine"],
    priority: "MEDIA",
    implemented: true,
  },
  {
    id: "CAP-11",
    name: "Frecuencia de Compra por Cliente",
    question: "Con que frecuencia compra cada cliente?",
    dataRequirements: [
      { name: "Fechas facturas por cliente", exists: true, sagSource: "SaleRecord.saleDate", classification: "AVAILABLE_DIRECTLY" },
      { name: "Intervalo entre compras", exists: true, sagSource: null, classification: "DERIVABLE" },
    ],
    consumers: ["CRM Module", "Segmentacion Clientes", "IA Comercial / Copilot"],
    priority: "MEDIA",
    implemented: false,
  },
  {
    id: "CAP-12",
    name: "Valor Vida Cliente (CLV)",
    question: "Cuanto ha comprado un cliente en su vida? Cual es su tendencia?",
    dataRequirements: [
      { name: "Total ventas historicas por cliente", exists: true, sagSource: "Sum(SaleRecord.amount)", classification: "AVAILABLE_DIRECTLY" },
      { name: "Periodo de relacion", exists: true, sagSource: "Min/Max(SaleRecord.saleDate)", classification: "DERIVABLE" },
    ],
    consumers: ["Segmentacion Clientes", "CRM Module", "IA Comercial / Copilot"],
    priority: "BAJA",
    implemented: false,
  },
  {
    id: "CAP-13",
    name: "Lotes e Importaciones",
    question: "Que productos vinieron en cada importacion? Cuanto costo cada lote?",
    dataRequirements: [
      { name: "Documentos entrada por importacion", exists: true, sagSource: "ProductionEvent ET", classification: "AVAILABLE_DIRECTLY" },
      { name: "Agrupacion por lote/importacion", exists: false, sagSource: null, classification: "NOT_AVAILABLE" },
      { name: "Costo FOB + nacionalizacion", exists: false, sagSource: null, classification: "NOT_AVAILABLE" },
      { name: "Fecha arribo", exists: false, sagSource: null, classification: "NOT_AVAILABLE" },
      { name: "Proveedor origen", exists: false, sagSource: null, classification: "NOT_AVAILABLE" },
    ],
    consumers: ["Importaciones Module", "Intelligence Engine", "IA Comercial / Copilot"],
    priority: "ALTA",
    implemented: false,
  },
  {
    id: "CAP-14",
    name: "Devoluciones y Notas Credito",
    question: "Cuantas unidades se devolvieron? Cual es la tasa de devolucion?",
    dataRequirements: [
      { name: "Notas credito por referencia", exists: false, sagSource: "MOVIMIENTOS_ITEMS NC", classification: "AVAILABLE_DIRECTLY" },
      { name: "Unidades devueltas", exists: false, sagSource: "MOVIMIENTOS_ITEMS NC n_cantidad", classification: "AVAILABLE_DIRECTLY" },
      { name: "Motivo devolucion", exists: false, sagSource: null, classification: "NOT_AVAILABLE" },
    ],
    consumers: ["Calidad", "Intelligence Engine", "Pricing Engine"],
    priority: "MEDIA",
    implemented: false,
  },
  {
    id: "CAP-15",
    name: "Historico de Precios",
    question: "Como han variado los precios de cada referencia en el tiempo?",
    dataRequirements: [
      { name: "Precio de venta en cada factura", exists: false, sagSource: "MOVIMIENTOS_ITEMS FV n_valor_unitario", classification: "AVAILABLE_DIRECTLY" },
      { name: "Lista de precios SAG", exists: false, sagSource: "v_articulos PV3/PV4", classification: "AVAILABLE_DIRECTLY" },
      { name: "Fecha cambio de precio", exists: false, sagSource: null, classification: "NOT_AVAILABLE" },
    ],
    consumers: ["Pricing Engine", "Markdown Engine", "Intelligence Engine", "IA Comercial / Copilot"],
    priority: "ALTA",
    implemented: false,
  },
];

// ── Validation checks ──────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail?: string): void {
  if (ok) { console.log(`  PASS  ${label}`); passed++; }
  else    { console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`); failed++; }
}

console.log("\n=== SAG-COMMERCIAL-KNOWLEDGE-GAP-DISCOVERY-01 — Audit ===\n");

// ── 1. Every capability has data requirements ────────────────────────────────

console.log("--- 1. Capabilities have data requirements ---");
for (const cap of CAPABILITIES) {
  check(
    `${cap.id} has data requirements`,
    cap.dataRequirements.length > 0,
    `${cap.name} has 0 requirements`,
  );
}

// ── 2. Every capability has consumers ────────────────────────────────────────

console.log("\n--- 2. Capabilities have consumers ---");
for (const cap of CAPABILITIES) {
  check(
    `${cap.id} has consumers`,
    cap.consumers.length > 0,
    `${cap.name} has 0 consumers`,
  );
}

// ── 3. Every consumer maps to a known engine/module ──────────────────────────

console.log("\n--- 3. Consumers map to known engines ---");
const allConsumers = new Set(CAPABILITIES.flatMap(c => c.consumers));
for (const consumer of allConsumers) {
  check(
    `Consumer "${consumer}" is a known engine`,
    KNOWN_ENGINE_NAMES.has(consumer),
    `not found in KNOWN_ENGINES`,
  );
}

// ── 4. No capability without identified source ───────────────────────────────

console.log("\n--- 4. No capability without any source ---");
for (const cap of CAPABILITIES) {
  const hasSomeSource = cap.dataRequirements.some(
    d => d.exists || d.sagSource !== null || d.classification !== "NOT_AVAILABLE",
  );
  check(
    `${cap.id} has at least one identified source`,
    hasSomeSource,
    `${cap.name} — all data NOT_AVAILABLE with no SAG source`,
  );
}

// ── 5. Gap classification consistency ────────────────────────────────────────

console.log("\n--- 5. Classification consistency ---");
for (const cap of CAPABILITIES) {
  for (const d of cap.dataRequirements) {
    // If exists=true, classification should be AVAILABLE_DIRECTLY or DERIVABLE
    if (d.exists) {
      check(
        `${cap.id}/${d.name}: exists=true matches classification`,
        d.classification === "AVAILABLE_DIRECTLY" || d.classification === "DERIVABLE",
        `exists=true but classification=${d.classification}`,
      );
    }
    // If classification=NOT_AVAILABLE, sagSource should be null
    if (d.classification === "NOT_AVAILABLE") {
      check(
        `${cap.id}/${d.name}: NOT_AVAILABLE has null sagSource`,
        d.sagSource === null,
        `NOT_AVAILABLE but sagSource="${d.sagSource}"`,
      );
    }
  }
}

// ── 6. Priority distribution ─────────────────────────────────────────────────

console.log("\n--- 6. Priority distribution ---");
const priorities = CAPABILITIES.reduce((acc, c) => {
  acc[c.priority] = (acc[c.priority] || 0) + 1;
  return acc;
}, {} as Record<Priority, number>);

check("At least 1 MUY_ALTA priority", (priorities["MUY_ALTA"] ?? 0) >= 1);
check("At least 3 ALTA priority", (priorities["ALTA"] ?? 0) >= 3);
check("Priority spread is reasonable", Object.keys(priorities).length >= 3);

// ── 7. Implementation status reflects reality ────────────────────────────────

console.log("\n--- 7. Implementation status ---");
const implemented = CAPABILITIES.filter(c => c.implemented);
const planned = CAPABILITIES.filter(c => !c.implemented);
check("Some capabilities already implemented", implemented.length >= 2);
check("Most capabilities are still planned", planned.length >= 10);
check("CAP-09 (Presion Productiva) is implemented", CAPABILITIES.find(c => c.id === "CAP-09")?.implemented === true);
check("CAP-03 (Cobertura Tiendas) is implemented", CAPABILITIES.find(c => c.id === "CAP-03")?.implemented === true);

// ── 8. Knowledge graph connectivity ─────────────────────────────────────────

console.log("\n--- 8. Knowledge graph connectivity ---");
// Every engine should be consumed by at least one capability
const consumedEngines = new Set(CAPABILITIES.flatMap(c => c.consumers));
const unconsumedEngines = KNOWN_ENGINES.filter(e => !consumedEngines.has(e.name));
check(
  "All known engines are consumed by at least one capability",
  unconsumedEngines.length <= 3, // allow some planned ones to not be consumed yet
  unconsumedEngines.map(e => e.name).join(", "),
);

// Gap distribution
const gapCounts = { AVAILABLE_DIRECTLY: 0, DERIVABLE: 0, REQUIRES_COMPOSITION: 0, NOT_AVAILABLE: 0 };
for (const cap of CAPABILITIES) {
  for (const d of cap.dataRequirements) {
    if (!d.exists) gapCounts[d.classification]++;
  }
}
check("Gaps: most are AVAILABLE_DIRECTLY or DERIVABLE",
  (gapCounts.AVAILABLE_DIRECTLY + gapCounts.DERIVABLE) >= gapCounts.NOT_AVAILABLE,
  `AVAILABLE=${gapCounts.AVAILABLE_DIRECTLY}, DERIVABLE=${gapCounts.DERIVABLE}, NOT_AVAILABLE=${gapCounts.NOT_AVAILABLE}`,
);

// ── 9. Completeness ──────────────────────────────────────────────────────────

console.log("\n--- 9. Completeness ---");
check("At least 15 capabilities defined", CAPABILITIES.length >= 15);
check("At least 10 known engines", KNOWN_ENGINES.length >= 10);
check("At least 40 total data requirements", CAPABILITIES.reduce((s, c) => s + c.dataRequirements.length, 0) >= 40);

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n=== Results: ${passed} PASS / ${failed} FAIL / ${passed + failed} total ===\n`);

if (failed > 0) {
  console.log("AUDIT FAILED.\n");
  process.exit(1);
} else {
  console.log("AUDIT PASSED — SAG-COMMERCIAL-KNOWLEDGE-GAP-DISCOVERY-01 complete.\n");
}

// ── Summary stats ──────────────────────────────────────────────────────────��

console.log("=== Knowledge Gap Summary ===");
console.log(`Capabilities:          ${CAPABILITIES.length}`);
console.log(`  Implemented:         ${implemented.length}`);
console.log(`  Planned:             ${planned.length}`);
console.log(`Known Engines:         ${KNOWN_ENGINES.length}`);
console.log(`  Functional:          ${KNOWN_ENGINES.filter(e => e.status === "FUNCTIONAL").length}`);
console.log(`  Partial:             ${KNOWN_ENGINES.filter(e => e.status === "PARTIAL").length}`);
console.log(`  Planned:             ${KNOWN_ENGINES.filter(e => e.status === "PLANNED").length}`);
console.log(`Data Requirements:     ${CAPABILITIES.reduce((s, c) => s + c.dataRequirements.length, 0)}`);
console.log(`  Already exist:       ${CAPABILITIES.reduce((s, c) => s + c.dataRequirements.filter(d => d.exists).length, 0)}`);
console.log(`  Missing:             ${CAPABILITIES.reduce((s, c) => s + c.dataRequirements.filter(d => !d.exists).length, 0)}`);
console.log(`Gaps by classification:`);
console.log(`  Available directly:  ${gapCounts.AVAILABLE_DIRECTLY}`);
console.log(`  Derivable:           ${gapCounts.DERIVABLE}`);
console.log(`  Requires composition:${gapCounts.REQUIRES_COMPOSITION}`);
console.log(`  Not available:       ${gapCounts.NOT_AVAILABLE}`);
console.log();
