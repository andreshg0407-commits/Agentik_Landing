import type { SagRow } from "./types";

const SOURCE_SYSTEM = "pya" as const;

// ── Column-name helpers ──────────────────────────────────────────────────────
// SAG columns are uppercase Spanish; names vary by client configuration.
// Each helper tries a list of known aliases and returns the first truthy hit.

function str(row: SagRow, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return null;
}

function num(row: SagRow, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "number" && isFinite(v)) return v;
    if (typeof v === "string") {
      const n = parseFloat(v);
      if (isFinite(n)) return n;
    }
  }
  return null;
}

function dateVal(row: SagRow, ...keys: string[]): Date | null {
  for (const k of keys) {
    const v = row[k];
    if (!v) continue;
    const d = new Date(String(v));
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

// ── Product mapper ───────────────────────────────────────────────────────────

export interface MappedProductSnapshot {
  sourceSystem: typeof SOURCE_SYSTEM;
  sourceId: string;
  name: string;
  sku: string | null;
  description: string | null;
  category: string | null;
  price: number | null;
  currency: string;
  status: string | null;
  imageUrl: string | null;
  payloadJson: SagRow;
}

/**
 * Maps a raw SAG row to a ProductSnapshot.
 * Tries multiple Spanish column name aliases for each field.
 * Throws if a required identifier (sourceId / name) cannot be found.
 */
export function mapSagRowToProduct(row: SagRow): MappedProductSnapshot {
  const sourceId = str(
    row,
    "IDARTICULO", "ID_ARTICULO", "CODARTICULO", "COD_ARTICULO",
    "ARTICULO_ID", "ARTICULO", "CODIGO", "ID", "id"
  );
  if (!sourceId) {
    throw new Error("PYA_MAPPER: product row has no identifiable sourceId");
  }

  const name = str(
    row,
    "NOMBRE", "NOMBRELARGO", "NOMBRE_LARGO", "DESCRIPCION", "DESCRIPCION_ARTICULO",
    "DESC_ARTICULO", "ARTICULO_NOMBRE", "name", "NAME"
  ) ?? sourceId;

  return {
    sourceSystem: SOURCE_SYSTEM,
    sourceId,
    name,
    sku:         str(row, "SKU", "REFERENCIA", "REF", "CODIGO_EXTERNO", "COD_EXT"),
    description: str(row, "DESCRIPCION_LARGA", "DETALLE", "DESCRIPCION_COMPLETA", "OBSERVACIONES"),
    category:    str(row, "CATEGORIA", "GRUPO", "FAMILIA", "LINEA", "SUBGRUPO"),
    price:       num(row, "PRECIO", "PRECIO_VENTA", "PRECIO1", "VALOR", "PRECIO_BASE"),
    currency:    str(row, "MONEDA", "CURRENCY", "DIVISA") ?? "COP",
    status:      str(row, "ESTADO", "STATUS", "ACTIVO", "HABILITADO"),
    imageUrl:    str(row, "IMAGEN", "URL_IMAGEN", "IMG", "FOTO"),
    payloadJson: row,
  };
}

// ── Order mapper ─────────────────────────────────────────────────────────────

export interface MappedOrderSnapshot {
  sourceSystem: typeof SOURCE_SYSTEM;
  sourceId: string;
  status: string | null;
  totalAmount: number | null;
  currency: string;
  customerId: string | null;
  customerName: string | null;
  orderedAt: Date | null;
  payloadJson: SagRow;
}

/**
 * Maps a raw SAG row to an OrderSnapshot.
 * Throws if no identifiable sourceId is found.
 */
export function mapSagRowToOrder(row: SagRow): MappedOrderSnapshot {
  const sourceId = str(
    row,
    "IDPEDIDO", "ID_PEDIDO", "NROPEDIDO", "NRO_PEDIDO", "PEDIDO",
    "IDORDEN", "ID_ORDEN", "ORDEN", "NUMERO", "ID", "id"
  );
  if (!sourceId) {
    throw new Error("PYA_MAPPER: order row has no identifiable sourceId");
  }

  return {
    sourceSystem: SOURCE_SYSTEM,
    sourceId,
    status:       str(row, "ESTADO", "ESTADO_PEDIDO", "STATUS"),
    totalAmount:  num(row, "TOTAL", "VALOR_TOTAL", "MONTO_TOTAL", "SUBTOTAL"),
    currency:     str(row, "MONEDA", "CURRENCY", "DIVISA") ?? "COP",
    customerId:   str(row, "IDCLIENTE", "ID_CLIENTE", "NIT_CLIENTE", "NIT", "CLIENTE_ID"),
    customerName: str(row, "NOMBRECLI", "NOMBRE_CLIENTE", "RAZON_SOCIAL", "CLIENTE"),
    orderedAt:    dateVal(row, "FECHA", "FECHA_PEDIDO", "FECHAPEDIDO", "FECHA_ORDEN", "CREATED_AT"),
    payloadJson:  row,
  };
}
