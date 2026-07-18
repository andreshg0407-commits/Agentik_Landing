"use client";

/**
 * CommercialProductDrawer
 *
 * Universal product detail drawer for all Comercial modules.
 * Receives a product reference and displays structured information.
 *
 * Designed to be consumed by:
 *   Inventario, Maletas, Produccion, Compras, Importaciones, Pedidos
 *
 * PERMANENT RULE: No module may create its own product drawer.
 * All product detail evolution happens here.
 *
 * ── Field Source Map (internal — never shown in UI) ─────────────
 * | Field            | Source                              | Status
 * |------------------|-------------------------------------|--------
 * | grupoSag         | ProductEntity.grupoSag               | REAL (API)
 * | lineaSag         | ProductEntity.lineaSag               | REAL (API)
 * | subgrupoSag      | ProductEntity.subgrupoSag            | REAL (API)
 * | costo            | ProductEntity.costo                  | REAL (API)
 * | manejaTallaColor | ProductEntity.manejaTallaColor       | REAL (API)
 * | createdAtSag     | ProductEntity.createdAtSag           | REAL (API)
 * | lastModifiedSag  | ProductEntity.lastModifiedSag        | REAL (API)
 * | lastPurchaseSag  | ProductEntity.lastPurchaseSag        | REAL (API)
 * | lastSaleSag      | ProductEntity.lastSaleSag            | REAL (API)
 * | barcode          | ProductEntity.barcode                | REAL (API)
 * | handlingUnit     | ProductEntity.handlingUnit           | REAL (API)
 * | tallas           | ProductVariant.attributes.tallaName  | REAL (API)
 * | colores          | ProductVariant.attributes.colorName  | REAL (API)
 * | precioDetal      | SAG v_articulos.nd_precio3           | REAL (API)
 * | precioMayorista  | SAG v_articulos.nd_precio4           | REAL (API)
 * | disponible       | InventoryItem.disponibleReal         | REAL
 * | reservado        | InventoryItem.pedidosPendientes      | REAL — SAG pedidos pendientes de facturacion
 * | totalStock       | InventoryItem.existenciaBodega01     | REAL
 * | enTransito       | (REMOVED — no certified source)      | —
 *
 * Sprint: COMERCIAL-INVENTARIO-MASTER-DATA-COMPLETION-02
 */

import { C, T, S, R } from "@/lib/ui/tokens";
import { OperationalSideDrawer } from "@/components/workspace/operational-side-drawer";
import type { DrawerSeverity } from "@/components/workspace/operational-side-drawer";

// ── Types ────────────────────────────────────────────────────────────────────

export interface CommercialProductData {
  reference: string;
  description: string;
  stateLabel: string;
  stateColor: string;
  disponible: number;

  linea?: string;
  subGrupo?: string;
  subgrupoSag?: string;
  categoria?: string;
  marca?: string;
  proveedor?: string;
  origen?: string;

  // ── Master data enrichment (MASTER-DATA-COMPLETION-02) ──
  grupoSag?: string | null;
  lineaSag?: string | null;
  grupoId?: number | null;
  lineaId?: number | null;
  subgrupoId?: number | null;
  costo?: number | null;
  manejaTallaColor?: boolean;
  barcode?: string | null;
  description2?: string | null;
  handlingUnit?: string | null;
  createdAtSag?: string | null;
  lastModifiedSag?: string | null;
  lastPurchaseSag?: string | null;
  lastSaleSag?: string | null;
  variantCount?: number;

  tallas?: string[];
  colores?: string[];

  precioDetal?: number | null;
  precioMayorista?: number | null;

  reservado?: number;
  enImportacion?: number;
  totalStock?: number;

  imageUrl?: string | null;

  lineCategory?: "textile" | "accessory";
  isAccessory?: boolean;

  enrichmentLoading?: boolean;
}

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  product: CommercialProductData | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function drawerSeverity(product: CommercialProductData): DrawerSeverity {
  if (product.disponible <= 0) return "critical";
  if (product.disponible <= 10) return "warning";
  return "info";
}

function fmtNum(n: number): string {
  return n.toLocaleString("es-CO");
}

function fmtPrice(n: number | null | undefined): string {
  if (n == null || n === 0) return "\u2014";
  return `$${n.toLocaleString("es-CO")}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "\u2014";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-CO", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "\u2014";
  }
}

// ── Spacing constants (tighter than default) ─────────────────────────────────

const SEC_MB = S[3];   // section margin-bottom (was S[5])
const SEC_PB = S[2];   // section padding-bottom (was S[4])

// ── Component ────────────────────────────────────────────────────────────────

export function CommercialProductDrawer({ open, onClose, product }: Props) {
  if (!product) return null;

  const loading = product.enrichmentLoading === true;
  const hasPrices =
    (product.precioDetal != null && product.precioDetal > 0) ||
    (product.precioMayorista != null && product.precioMayorista > 0);

  return (
    <OperationalSideDrawer
      open={open}
      onClose={onClose}
      title={product.reference}
      subtitle={product.description}
      statusLabel={product.stateLabel}
      severity={drawerSeverity(product)}
      size="default"
    >
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex",
        gap: S[3],
        marginBottom: S[3],
        alignItems: "flex-start",
      }}>
        <ProductThumbnail
          reference={product.reference}
          imageUrl={product.imageUrl}
          size={48}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: T.mono,
            fontSize: T.sz.sm,
            fontWeight: T.wt.bold,
            color: C.ink,
            marginBottom: 2,
          }}>
            {product.reference}
          </div>
          <div style={{
            fontFamily: T.mono,
            fontSize: T.sz["2xs"],
            color: C.inkMid,
            lineHeight: 1.4,
            marginBottom: S[1],
          }}>
            {product.description}
          </div>
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontFamily: T.mono,
            fontSize: T.sz["2xs"],
            fontWeight: T.wt.semibold,
            color: product.stateColor,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: product.stateColor, display: "inline-block",
            }} />
            {product.stateLabel}
          </span>
        </div>
      </div>

      {/* ── Resumen comercial ─────────────────────────────────────────── */}
      <div style={{
        display: "flex",
        alignItems: "baseline",
        gap: S[4],
        marginBottom: SEC_MB,
        paddingBottom: SEC_PB,
        borderBottom: `1px solid ${C.line}22`,
      }}>
        <SummaryMetric
          label="Disponible"
          value={product.disponible > 0 ? `${fmtNum(product.disponible)} uds` : "\u2014"}
          highlight={product.disponible <= 0}
        />
        {loading ? (
          <SummaryMetric label="Precio detal" value="..." />
        ) : hasPrices ? (
          <>
            {product.precioDetal != null && product.precioDetal > 0 && (
              <SummaryMetric label="Precio detal" value={fmtPrice(product.precioDetal)} />
            )}
            {product.precioMayorista != null && product.precioMayorista > 0 && (
              <SummaryMetric label="Precio mayorista" value={fmtPrice(product.precioMayorista)} />
            )}
          </>
        ) : (
          <SummaryMetric label="Precios" value="\u2014" />
        )}
      </div>

      {/* ── Clasificacion ──────────────────────────────────────────── */}
      <Section title="Clasificacion">
        {loading ? (
          <Muted>Cargando...</Muted>
        ) : (
          <InfoGrid>
            <InfoField label="Grupo" value={product.grupoSag ?? product.categoria} />
            <InfoField label="Linea" value={product.lineaSag ?? product.linea} />
            <InfoField label="Subgrupo" value={product.subgrupoSag || product.subGrupo} />
            {product.handlingUnit && <InfoField label="Unidad manejo" value={product.handlingUnit} />}
            {product.marca && <InfoField label="Marca" value={product.marca} />}
          </InfoGrid>
        )}
      </Section>

      {/* ── Variantes ───────────────────────────────────────────────── */}
      {loading ? (
        <Section title="Variantes">
          <Muted>Cargando...</Muted>
        </Section>
      ) : (product.tallas && product.tallas.length > 0) ||
           (product.colores && product.colores.length > 0) ? (
        <Section title={`Variantes${product.variantCount ? ` (${product.variantCount})` : ""}`}>
          {product.tallas && product.tallas.length > 0 && (
            <div style={{ marginBottom: S[2] }}>
              <FieldLabel>Tallas</FieldLabel>
              <div style={{ display: "flex", gap: S[1], flexWrap: "wrap" as const }}>
                {product.tallas.map(t => <TagChip key={t} label={t} />)}
              </div>
            </div>
          )}
          {product.colores && product.colores.length > 0 && (
            <div>
              <FieldLabel>Colores</FieldLabel>
              <div style={{ display: "flex", gap: S[1], flexWrap: "wrap" as const }}>
                {product.colores.map(c => <TagChip key={c} label={c} />)}
              </div>
            </div>
          )}
        </Section>
      ) : product.isAccessory && product.handlingUnit ? (
        <Section title="Variantes">
          <div style={{ marginBottom: S[2] }}>
            <FieldLabel>Tamano</FieldLabel>
            <div style={{ display: "flex", gap: S[1], flexWrap: "wrap" as const }}>
              <TagChip label={product.handlingUnit} />
            </div>
          </div>
        </Section>
      ) : (
        <Section title="Variantes">
          <Muted>
            {product.manejaTallaColor
              ? "Maneja talla/color \u2014 sin movimientos registrados"
              : "No maneja talla/color"}
          </Muted>
        </Section>
      )}

      {/* ── Precios ─────────────────────────────────────────────────── */}
      <Section title="Precios">
        {loading ? (
          <Muted>Cargando...</Muted>
        ) : (
          <InfoGrid>
            <InfoField label="Precio detal" value={fmtPrice(product.precioDetal)} />
            <InfoField label="Precio mayorista" value={fmtPrice(product.precioMayorista)} />
            <InfoField label="Costo" value={fmtPrice(product.costo)} />
          </InfoGrid>
        )}
      </Section>

      {/* ── Inventario ──────────────────────────────────────────────── */}
      <Section title="Inventario">
        <InfoGrid>
          <InfoField
            label="Disponible"
            value={product.disponible > 0 ? fmtNum(product.disponible) : "\u2014"}
            highlight={product.disponible <= 0}
          />
          <InfoField
            label="Reservado"
            value={product.reservado != null && product.reservado > 0
              ? fmtNum(product.reservado)
              : "\u2014"}
          />
          {product.totalStock != null && (
            <InfoField
              label="Stock total"
              value={product.totalStock > 0 ? fmtNum(product.totalStock) : "\u2014"}
            />
          )}
        </InfoGrid>
      </Section>

      {/* ── Fechas SAG ──────────────────────────────────────────────── */}
      {!loading && (
        <Section title="Fechas SAG">
          <InfoGrid>
            <InfoField label="Creacion" value={fmtDate(product.createdAtSag)} />
            <InfoField label="Ultima modificacion" value={fmtDate(product.lastModifiedSag)} />
            <InfoField label="Ultima compra" value={fmtDate(product.lastPurchaseSag)} />
            <InfoField label="Ultima venta" value={fmtDate(product.lastSaleSag)} />
          </InfoGrid>
        </Section>
      )}

      {/* ── Identificadores SAG ─────────────────────────────────────── */}
      {!loading && (product.grupoId != null || product.barcode) && (
        <Section title="Identificadores SAG">
          <InfoGrid>
            {product.grupoId != null && <InfoField label="Grupo ID" value={String(product.grupoId)} />}
            {product.lineaId != null && <InfoField label="Linea ID" value={String(product.lineaId)} />}
            {product.subgrupoId != null && <InfoField label="Subgrupo ID" value={String(product.subgrupoId)} />}
            {product.barcode && <InfoField label="Codigo barras" value={product.barcode} />}
            {product.description2 && <InfoField label="Descripcion 2" value={product.description2} />}
          </InfoGrid>
        </Section>
      )}
    </OperationalSideDrawer>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

export function ProductThumbnail({
  reference,
  imageUrl,
  size = 40,
}: {
  reference: string;
  imageUrl?: string | null;
  size?: number;
}) {
  const initials = reference.slice(0, 2).toUpperCase();

  if (imageUrl) {
    return (
      <div style={{
        width: size,
        height: size,
        borderRadius: R.sm,
        overflow: "hidden",
        flexShrink: 0,
        border: `1px solid ${C.line}`,
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={reference}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
    );
  }

  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: R.sm,
      background: `${C.blueDark}0A`,
      border: `1px solid ${C.blueDark}20`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    }}>
      <span style={{
        fontFamily: T.mono,
        fontSize: size > 40 ? T.sz.sm : T.sz["2xs"],
        fontWeight: T.wt.bold,
        color: C.blueDark,
        opacity: 0.6,
      }}>
        {initials}
      </span>
    </div>
  );
}

// ── Resumen comercial metric ─────────────────────────────────────────────────

function SummaryMetric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: C.inkGhost,
        marginBottom: 1,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: T.mono,
        fontSize: T.sz.sm,
        fontWeight: T.wt.bold,
        color: highlight ? C.red : C.ink,
        whiteSpace: "nowrap" as const,
      }}>
        {value}
      </div>
    </div>
  );
}

// ── Section (tighter spacing) ────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      marginBottom: SEC_MB,
      paddingBottom: SEC_PB,
      borderBottom: `1px solid ${C.line}22`,
    }}>
      <div style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        fontWeight: T.wt.bold,
        color: C.inkLight,
        textTransform: "uppercase" as const,
        letterSpacing: "0.06em",
        marginBottom: S[2],
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function InfoGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: `${S[1]}px ${S[4]}px`,
    }}>
      {children}
    </div>
  );
}

function InfoField({
  label,
  value,
  highlight,
}: {
  label: string;
  value?: string | null;
  highlight?: boolean;
}) {
  const displayValue = value && value.trim() ? value : "\u2014";
  const isEmpty = !value || !value.trim() || value === "\u2014";
  return (
    <div style={{ marginBottom: S[1] }}>
      <div style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: C.inkGhost,
        marginBottom: 1,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: T.mono,
        fontSize: T.sz.xs,
        fontWeight: isEmpty ? T.wt.normal : T.wt.semibold,
        color: highlight ? C.red : isEmpty ? C.inkGhost : C.ink,
      }}>
        {displayValue}
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontFamily: T.mono,
      fontSize: T.sz["2xs"],
      fontWeight: T.wt.semibold,
      color: C.inkLight,
      textTransform: "uppercase" as const,
      marginBottom: 2,
      display: "block",
    }}>
      {children}
    </span>
  );
}

function TagChip({ label }: { label: string }) {
  return (
    <span style={{
      fontFamily: T.mono,
      fontSize: T.sz["2xs"],
      padding: `1px ${S[2]}px`,
      borderRadius: R.sm,
      border: `1px solid ${C.line}`,
      background: C.surface,
      color: C.inkMid,
    }}>
      {label}
    </span>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontFamily: T.mono,
      fontSize: T.sz["2xs"],
      color: C.inkGhost,
    }}>
      {children}
    </span>
  );
}
