/**
 * lib/comercial/tiendas/store-replenishment-demo-data.ts
 *
 * Controlled demo data for the Tiendas module.
 * Realistic Castillitos-style store names, products, and inventory.
 *
 * // PLACEHOLDER — replace with SAG integration before ship
 *
 * Sprint: COMERCIAL-TIENDAS-SURTIDO-01
 */

import type {
  StoreLocation,
  StoreInventoryVariant,
  MainWarehouseAvailability,
  StoreReplenishmentRule,
} from "./store-replenishment-types";

// ── Stores ───────────────────────────────────────────────────────────────────

export const DEMO_STORES: StoreLocation[] = [
  {
    id:               "tienda-centro",
    name:             "Tienda Centro",
    sagWarehouseCode: "BOD-CENTRO",
    responsibleName:  "Maria Lopez",
    status:           "activa",
    storeType:        "tienda",
    city:             "Bucaramanga",
    lastSyncAt:       "2026-06-20T08:30:00Z",
  },
  {
    id:               "tienda-norte",
    name:             "Tienda Norte",
    sagWarehouseCode: "BOD-NORTE",
    responsibleName:  "Carlos Mendez",
    status:           "activa",
    storeType:        "tienda",
    city:             "Bucaramanga",
    lastSyncAt:       "2026-06-20T09:15:00Z",
  },
  {
    id:               "tienda-sur",
    name:             "Tienda Sur",
    sagWarehouseCode: "BOD-SUR",
    responsibleName:  "Andrea Ruiz",
    status:           "activa",
    storeType:        "tienda",
    city:             "Floridablanca",
    lastSyncAt:       "2026-06-20T07:45:00Z",
  },
  {
    id:               "tienda-outlet",
    name:             "Tienda Outlet",
    sagWarehouseCode: "BOD-OUTLET",
    responsibleName:  "Jorge Pena",
    status:           "activa",
    storeType:        "outlet",
    city:             "Giron",
    lastSyncAt:       "2026-06-19T18:00:00Z",
  },
];

// ── Main warehouse ───────────────────────────────────────────────────────────

export const MAIN_WAREHOUSE = {
  code: "BOD-PRINCIPAL",
  name: "Bodega Principal SAG",
};

// ── Product catalog (shared) ─────────────────────────────────────────────────

const PRODUCTS = [
  { ref: "REF-101", name: "Camiseta nino Dino",       category: "Camisetas", line: "Infantil" },
  { ref: "REF-102", name: "Camiseta nino Aventura",   category: "Camisetas", line: "Infantil" },
  { ref: "REF-201", name: "Pantalon nina Estrella",   category: "Pantalones", line: "Infantil" },
  { ref: "REF-202", name: "Pantalon clasico nino",    category: "Pantalones", line: "Infantil" },
  { ref: "REF-301", name: "Vestido nina Primavera",   category: "Vestidos",   line: "Infantil" },
  { ref: "REF-401", name: "Conjunto bebe Osito",      category: "Conjuntos",  line: "Bebe" },
  { ref: "REF-402", name: "Conjunto bebe Luna",       category: "Conjuntos",  line: "Bebe" },
  { ref: "REF-501", name: "Pijama nino Cohete",       category: "Pijamas",    line: "Infantil" },
  { ref: "REF-601", name: "Chaqueta nina Arcoiris",   category: "Chaquetas",  line: "Infantil" },
  { ref: "REF-701", name: "Camiseta importada Premium", category: "Camisetas", line: "Importacion" },
] as const;

const SIZES  = ["2", "4", "6", "8", "10", "12"] as const;
const COLORS = ["Rojo", "Azul", "Verde", "Blanco", "Rosado", "Negro"] as const;

// ── Store inventory ──────────────────────────────────────────────────────────

function buildInventory(
  storeId: string,
  warehouseCode: string,
  shortageConfig: { ref: string; size: string; color: string; current: number }[],
): StoreInventoryVariant[] {
  const items: StoreInventoryVariant[] = [];
  const shortageMap = new Map(
    shortageConfig.map(s => [`${s.ref}|${s.size}|${s.color}`, s.current]),
  );

  for (const prod of PRODUCTS) {
    // Each product has 2–3 size/color combos per store
    const combos = getStoreCombos(storeId, prod.ref);
    for (const [size, color] of combos) {
      const key = `${prod.ref}|${size}|${color}`;
      const current = shortageMap.get(key) ?? randomStock(4, 12);
      items.push({
        storeId,
        warehouseCode,
        referenceCode: prod.ref,
        productName:   prod.name,
        category:      prod.category,
        line:          prod.line,
        size,
        color,
        currentUnits:  current,
        minUnits:      4,
        idealUnits:    8,
        maxUnits:      15,
        updatedAt:     "2026-06-20T08:00:00Z",
      });
    }
  }

  return items;
}

function getStoreCombos(storeId: string, ref: string): [string, string][] {
  // Deterministic combos per store/ref to keep data stable
  const seed = hashCode(`${storeId}:${ref}`);
  const sizeCount = 2 + (seed % 2);
  const combos: [string, string][] = [];
  for (let i = 0; i < sizeCount; i++) {
    const si = (seed + i) % SIZES.length;
    const ci = (seed + i * 3) % COLORS.length;
    combos.push([SIZES[si], COLORS[ci]]);
  }
  return combos;
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function randomStock(min: number, max: number): number {
  // Deterministic-enough for demo — not truly random
  return min + Math.floor(Math.random() * (max - min + 1));
}

// ── Shortage configs per store ───────────────────────────────────────────────

const CENTRO_SHORTAGES = [
  { ref: "REF-102", size: "6",  color: "Rojo",   current: 0 },
  { ref: "REF-102", size: "8",  color: "Azul",   current: 1 },
  { ref: "REF-201", size: "4",  color: "Rosado", current: 2 },
  { ref: "REF-201", size: "6",  color: "Blanco", current: 0 },
  { ref: "REF-301", size: "6",  color: "Rosado", current: 0 },
  { ref: "REF-301", size: "8",  color: "Blanco", current: 1 },
  { ref: "REF-401", size: "2",  color: "Azul",   current: 0 },
  { ref: "REF-501", size: "4",  color: "Azul",   current: 3 },
  { ref: "REF-501", size: "6",  color: "Rojo",   current: 0 },
  { ref: "REF-601", size: "8",  color: "Rosado", current: 1 },
  { ref: "REF-701", size: "10", color: "Negro",  current: 0 },
  { ref: "REF-701", size: "12", color: "Blanco", current: 2 },
];

const NORTE_SHORTAGES = [
  { ref: "REF-101", size: "4", color: "Verde", current: 3 },
  { ref: "REF-202", size: "6", color: "Azul",  current: 2 },
];

const SUR_SHORTAGES = [
  { ref: "REF-102", size: "4",  color: "Rojo",   current: 0 },
  { ref: "REF-102", size: "6",  color: "Azul",   current: 1 },
  { ref: "REF-301", size: "4",  color: "Rosado", current: 0 },
  { ref: "REF-401", size: "2",  color: "Rojo",   current: 0 },
  { ref: "REF-601", size: "6",  color: "Verde",  current: 2 },
  { ref: "REF-601", size: "8",  color: "Rosado", current: 0 },
  { ref: "REF-701", size: "10", color: "Negro",  current: 1 },
];

const OUTLET_SHORTAGES = [
  { ref: "REF-201", size: "8", color: "Blanco", current: 1 },
  { ref: "REF-501", size: "6", color: "Rojo",   current: 3 },
  { ref: "REF-701", size: "12", color: "Negro", current: 0 },
];

export const DEMO_INVENTORY: StoreInventoryVariant[] = [
  ...buildInventory("tienda-centro",  "BOD-CENTRO",  CENTRO_SHORTAGES),
  ...buildInventory("tienda-norte",   "BOD-NORTE",   NORTE_SHORTAGES),
  ...buildInventory("tienda-sur",     "BOD-SUR",     SUR_SHORTAGES),
  ...buildInventory("tienda-outlet",  "BOD-OUTLET",  OUTLET_SHORTAGES),
];

// ── Main warehouse stock ─────────────────────────────────────────────────────

export const DEMO_MAIN_WAREHOUSE_STOCK: MainWarehouseAvailability[] = [
  // REF-102 — partial availability
  { warehouseCode: "BOD-PRINCIPAL", referenceCode: "REF-102", size: "6",  color: "Rojo",   availableUnits: 3, reservedUnits: 0, updatedAt: "2026-06-20T08:00:00Z" },
  { warehouseCode: "BOD-PRINCIPAL", referenceCode: "REF-102", size: "8",  color: "Azul",   availableUnits: 5, reservedUnits: 0, updatedAt: "2026-06-20T08:00:00Z" },
  { warehouseCode: "BOD-PRINCIPAL", referenceCode: "REF-102", size: "4",  color: "Rojo",   availableUnits: 2, reservedUnits: 0, updatedAt: "2026-06-20T08:00:00Z" },
  { warehouseCode: "BOD-PRINCIPAL", referenceCode: "REF-102", size: "6",  color: "Azul",   availableUnits: 4, reservedUnits: 1, updatedAt: "2026-06-20T08:00:00Z" },
  { warehouseCode: "BOD-PRINCIPAL", referenceCode: "REF-102", size: "6",  color: "Verde",  availableUnits: 7, reservedUnits: 0, updatedAt: "2026-06-20T08:00:00Z" },

  // REF-201
  { warehouseCode: "BOD-PRINCIPAL", referenceCode: "REF-201", size: "4",  color: "Rosado", availableUnits: 6, reservedUnits: 0, updatedAt: "2026-06-20T08:00:00Z" },
  { warehouseCode: "BOD-PRINCIPAL", referenceCode: "REF-201", size: "6",  color: "Blanco", availableUnits: 0, reservedUnits: 0, updatedAt: "2026-06-20T08:00:00Z" },
  { warehouseCode: "BOD-PRINCIPAL", referenceCode: "REF-201", size: "8",  color: "Blanco", availableUnits: 8, reservedUnits: 2, updatedAt: "2026-06-20T08:00:00Z" },

  // REF-301
  { warehouseCode: "BOD-PRINCIPAL", referenceCode: "REF-301", size: "6",  color: "Rosado", availableUnits: 0, reservedUnits: 0, updatedAt: "2026-06-20T08:00:00Z" },
  { warehouseCode: "BOD-PRINCIPAL", referenceCode: "REF-301", size: "8",  color: "Blanco", availableUnits: 4, reservedUnits: 0, updatedAt: "2026-06-20T08:00:00Z" },
  { warehouseCode: "BOD-PRINCIPAL", referenceCode: "REF-301", size: "4",  color: "Rosado", availableUnits: 0, reservedUnits: 0, updatedAt: "2026-06-20T08:00:00Z" },
  { warehouseCode: "BOD-PRINCIPAL", referenceCode: "REF-301", size: "4",  color: "Blanco", availableUnits: 3, reservedUnits: 0, updatedAt: "2026-06-20T08:00:00Z" },

  // REF-401
  { warehouseCode: "BOD-PRINCIPAL", referenceCode: "REF-401", size: "2",  color: "Azul",   availableUnits: 10, reservedUnits: 0, updatedAt: "2026-06-20T08:00:00Z" },
  { warehouseCode: "BOD-PRINCIPAL", referenceCode: "REF-401", size: "2",  color: "Rojo",   availableUnits: 0,  reservedUnits: 0, updatedAt: "2026-06-20T08:00:00Z" },

  // REF-501
  { warehouseCode: "BOD-PRINCIPAL", referenceCode: "REF-501", size: "4",  color: "Azul",   availableUnits: 3, reservedUnits: 0, updatedAt: "2026-06-20T08:00:00Z" },
  { warehouseCode: "BOD-PRINCIPAL", referenceCode: "REF-501", size: "6",  color: "Rojo",   availableUnits: 0, reservedUnits: 0, updatedAt: "2026-06-20T08:00:00Z" },

  // REF-601
  { warehouseCode: "BOD-PRINCIPAL", referenceCode: "REF-601", size: "8",  color: "Rosado", availableUnits: 5, reservedUnits: 1, updatedAt: "2026-06-20T08:00:00Z" },
  { warehouseCode: "BOD-PRINCIPAL", referenceCode: "REF-601", size: "6",  color: "Verde",  availableUnits: 2, reservedUnits: 0, updatedAt: "2026-06-20T08:00:00Z" },

  // REF-701 — imported, limited
  { warehouseCode: "BOD-PRINCIPAL", referenceCode: "REF-701", size: "10", color: "Negro",  availableUnits: 0, reservedUnits: 0, updatedAt: "2026-06-20T08:00:00Z" },
  { warehouseCode: "BOD-PRINCIPAL", referenceCode: "REF-701", size: "12", color: "Blanco", availableUnits: 1, reservedUnits: 0, updatedAt: "2026-06-20T08:00:00Z" },
  { warehouseCode: "BOD-PRINCIPAL", referenceCode: "REF-701", size: "12", color: "Negro",  availableUnits: 0, reservedUnits: 0, updatedAt: "2026-06-20T08:00:00Z" },

  // REF-101 — healthy stock
  { warehouseCode: "BOD-PRINCIPAL", referenceCode: "REF-101", size: "4",  color: "Verde",  availableUnits: 12, reservedUnits: 0, updatedAt: "2026-06-20T08:00:00Z" },
  { warehouseCode: "BOD-PRINCIPAL", referenceCode: "REF-101", size: "6",  color: "Rojo",   availableUnits: 15, reservedUnits: 0, updatedAt: "2026-06-20T08:00:00Z" },

  // REF-202
  { warehouseCode: "BOD-PRINCIPAL", referenceCode: "REF-202", size: "6",  color: "Azul",   availableUnits: 9, reservedUnits: 0, updatedAt: "2026-06-20T08:00:00Z" },

  // REF-402
  { warehouseCode: "BOD-PRINCIPAL", referenceCode: "REF-402", size: "2",  color: "Rosado", availableUnits: 8, reservedUnits: 0, updatedAt: "2026-06-20T08:00:00Z" },
];

// ── Rules per store ──────────────────────────────────────────────────────────

export const DEMO_RULES: StoreReplenishmentRule[] = [
  // Tienda Centro — strict minimums
  { id: "rule-c1", storeId: "tienda-centro", ruleType: "category",    appliesTo: "Camisetas",   minUnits: 4, idealUnits: 8,  priority: 1, active: true },
  { id: "rule-c2", storeId: "tienda-centro", ruleType: "category",    appliesTo: "Pantalones",  minUnits: 3, idealUnits: 6,  priority: 2, active: true },
  { id: "rule-c3", storeId: "tienda-centro", ruleType: "import_size", appliesTo: "Importacion", minUnits: 8, idealUnits: 15, priority: 3, active: true },
  { id: "rule-c4", storeId: "tienda-centro", ruleType: "line",        appliesTo: "Bebe",        minUnits: 3, idealUnits: 6,  priority: 4, active: true },

  // Tienda Norte — relaxed
  { id: "rule-n1", storeId: "tienda-norte", ruleType: "category",    appliesTo: "Camisetas",   minUnits: 3, idealUnits: 6, priority: 1, active: true },
  { id: "rule-n2", storeId: "tienda-norte", ruleType: "category",    appliesTo: "Pantalones",  minUnits: 2, idealUnits: 5, priority: 2, active: true },

  // Tienda Sur — medium
  { id: "rule-s1", storeId: "tienda-sur", ruleType: "category",    appliesTo: "Camisetas",   minUnits: 4, idealUnits: 8, priority: 1, active: true },
  { id: "rule-s2", storeId: "tienda-sur", ruleType: "line",        appliesTo: "Infantil",    minUnits: 3, idealUnits: 6, priority: 2, active: true },
  { id: "rule-s3", storeId: "tienda-sur", ruleType: "import_size", appliesTo: "Importacion", minUnits: 6, idealUnits: 10, priority: 3, active: true },

  // Tienda Outlet — volume focused
  { id: "rule-o1", storeId: "tienda-outlet", ruleType: "category",  appliesTo: "Camisetas",   minUnits: 6, idealUnits: 12, priority: 1, active: true },
  { id: "rule-o2", storeId: "tienda-outlet", ruleType: "category",  appliesTo: "Pantalones",  minUnits: 4, idealUnits: 8,  priority: 2, active: true },
  { id: "rule-o3", storeId: "tienda-outlet", ruleType: "reference", appliesTo: "REF-701",     minUnits: 3, idealUnits: 6,  priority: 3, active: false },
];
