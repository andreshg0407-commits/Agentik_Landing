# SAG_COMMERCIAL_KNOWLEDGE_MAPPING_01

**Sprint:** SAG-COMMERCIAL-KNOWLEDGE-GAP-DISCOVERY-01
**Date:** 2026-07-11
**Scope:** Solo datos faltantes — no repite descubrimientos anteriores

---

## Conocimiento SAG ya documentado (NO repetir)

Los siguientes datos YA fueron investigados, sincronizados o documentados en sprints anteriores:

- **v_articulos:** k_sc_codigo_articulo, sc_detalle_articulo, ss_talla, ss_color, línea, subgrupo
- **Inventario (bodega 01):** disponible, reservado, pendiente PD, limpieza AP
- **MOVIMIENTOS header (PD/FV/NV):** ka_nl_movimiento, n_numero_documento, d_fecha_documento, sc_beneficiario, ka_nl_tercero
- **MOVIMIENTOS_ITEMS (PD):** CustomerOrderLine — artículo, talla, color, cantidad, bodega, valor
- **MOVIMIENTOS (OP, CN, ET):** ProductionEvent + ProductionEventLine — completo
- **TERCEROS:** CustomerProfile — NIT, nombre, ciudad (parcial)
- **CARTERA:** CustomerReceivable — facturas, saldos, aging
- **PAGOS (v_pagosnew):** CollectionRecord — recibos, montos
- **Fuente 1/2:** SaleRecord.sagSourceType — fiscal vs remisión
- **Document families:** FV, NV, PD, NC, OP, ET, CN, R1, R2, AN

---

## Datos Faltantes — Mapeo SAG

### 1. Líneas de Factura (FV/NV) — Unidades vendidas

**Tabla:** `MOVIMIENTOS_ITEMS`
**Filtro header:** `k_n_clase_fuente` = fuente de FV (probablemente 1 o 2) — confirmar con `FUENTES`
**Campos requeridos:**

| Campo SAG | Uso Agentik | Tipo |
|---|---|---|
| `ka_nl_movimiento` | FK al header (para fecha, cliente, vendedor) | int |
| `ka_nl_movimiento_item` | PK de línea (idempotencia) | int |
| `ka_nl_articulo` | FK artículo → referenceCode via v_articulos | int |
| `k_sc_codigo_articulo` | Código referencia directa | string |
| `ss_talla` | Talla (variante) | string |
| `ss_color` | Color (variante) | string |
| `n_cantidad` | **Unidades vendidas** — dato crítico | decimal |
| `n_valor_unitario` | **Precio unitario real** — dato crítico | decimal |
| `n_valor` | Valor total línea (qty × price) | decimal |
| `ka_nl_bodega` | Bodega de despacho | int |

**Modelo Agentik propuesto:** `SaleLineRecord` (nuevo)
**Sync:** Incremental por `d_fecha_documento` del header
**Volumen estimado:** ~50K-100K líneas/año (basado en 3,376 OP × ~15 líneas avg)

---

### 2. Líneas de Nota Crédito (NC) — Devoluciones

**Tabla:** `MOVIMIENTOS_ITEMS`
**Filtro header:** `k_n_clase_fuente` = fuente NC (confirmar en `FUENTES`)
**Campos requeridos:** Mismos que FV/NV (ka_nl_articulo, ss_talla, ss_color, n_cantidad, n_valor)

**Modelo Agentik propuesto:** Reutilizar `SaleLineRecord` con flag `isReturn: true` o campo `documentType: "NC"`
**Sync:** Mismo endpoint que FV, solo cambiar filtro de fuente

---

### 3. Movimientos de Entrada al Inventario (para edad)

**Tabla:** `MOVIMIENTOS` + `MOVIMIENTOS_ITEMS`
**Filtro:** Documentos de tipo entrada (ET fuente 116 YA synced, pero también entradas directas si existen)
**Campos adicionales no sincronizados:**

| Campo SAG | Uso Agentik | Disponibilidad |
|---|---|---|
| `d_fecha_documento` (header) | Fecha ingreso al inventario | YA en ProductionEvent para ET |
| `n_cantidad` (item) | Cantidad ingresada | YA en ProductionEventLine para ET |

**Acción:** No requiere nuevo sync — ProductionEvent/ET ya tiene estos datos.
Lo que falta es un **índice derivado** que agrupe por referencia y calcule:
- Primera fecha de ingreso
- Última fecha de ingreso
- Total unidades ingresadas (acumulado)

**Modelo propuesto:** Capa calculada, no nuevo sync.

---

### 4. Precio de Lista (PV3/PV4) — Snapshot temporal

**Tabla:** `v_articulos`
**Campos:**

| Campo SAG | Uso | Disponibilidad |
|---|---|---|
| `n_precio_venta_3` (PV3) | Precio mayorista | Disponible en v_articulos |
| `n_precio_venta_4` (PV4) | Precio punto de venta | Disponible en v_articulos |

**Problema:** SAG solo tiene el valor ACTUAL, no histórico.
**Solución:** Snapshot periódico (cron semanal/mensual) que guarda el precio vigente en cada momento.

**Modelo propuesto:** `ProductPriceSnapshot` (nuevo)
```
{
  organizationId, referenceCode,
  pv3: number, pv4: number,
  capturedAt: DateTime
}
```

---

### 5. Mapeo Bodega → Tienda (confirmación)

**Tabla:** Tabla `BODEGAS` en SAG
**Estado:** Referenciada en master-data discovery (castillitos-overrides.ts) pero NO confirmada.
**Dato faltante:** Relación bodega.id → tienda nombre para bodegas comerciales.

**Conocimiento parcial actual:**
- Bodega 01 = Producto Terminado (principal)
- Bodega 04 = WIP (proceso)
- Bodega 14/15 = Materia Prima
- Bodegas comerciales (tiendas) = **DESCONOCIDO**

**Acción requerida:** Query a BODEGAS en SAG para listar TODAS las bodegas con nombre. Mapear cuáles son tiendas. Esto es una sola consulta de descubrimiento.

---

### 6. Vendedores SAG (complemento)

**Tabla:** `VENDEDORES` o campo en MOVIMIENTOS header
**Estado actual:** SaleRecord.sellerSlug y sellerName existen (importados de CSV)
**Dato faltante:**

| Campo | Uso | Disponibilidad |
|---|---|---|
| Código vendedor SAG | Join estable | Parcial (sellerCode en SaleRecord) |
| Zona asignada | Cobertura territorial | DESCONOCIDO — puede estar en VENDEDORES o TERCEROS |
| Correo/teléfono | Contacto | NO PRIORITARIO |

**Acción:** Query descriptiva a VENDEDORES table (si existe en SAG PYA).

---

## Resumen de Acciones SAG

| # | Acción | Tipo | Tabla SAG | Prioridad | Desbloquea |
|---|---|---|---|---|---|
| 1 | Sync líneas FV/NV | NUEVO SYNC | MOVIMIENTOS_ITEMS | MÁXIMA | Rotación, Precio, Margen |
| 2 | Sync líneas NC | NUEVO SYNC | MOVIMIENTOS_ITEMS | ALTA | Devoluciones, Rotación neta |
| 3 | Índice edad inventario | CÁLCULO | ProductionEvent ET (existente) | ALTA | Edad, Antigüedad |
| 4 | Snapshot precios PV3/PV4 | CRON | v_articulos | MEDIA | Histórico precios |
| 5 | Discovery bodegas | CONSULTA | BODEGAS | ALTA | Cobertura tiendas |
| 6 | Discovery vendedores | CONSULTA | VENDEDORES | BAJA | Zonas, Performance |

---

## Prioridad de Implementación

```
SPRINT 1 ─── Líneas de Factura (FV/NV)
             → Desbloquea: unidades vendidas, precio real, rotación base
             → Modelo: SaleLineRecord
             → Volumen: estimado 50K-100K registros
             → Pattern: mismo que CustomerOrderLine sync (ya implementado)

SPRINT 2 ─── Edad Inventario + Antigüedad
             → No requiere sync — cálculo sobre ProductionEvent ET
             → Modelo: InventoryAgeIndex (tabla derivada o view)
             → Desbloquea: CAP-01, CAP-04

SPRINT 3 ─── Rotación Engine
             → Combina Sprint 1 + Sprint 2
             → Desbloquea: CAP-02, CAP-05 (recompra)

SPRINT 4 ─── Notas Crédito (NC) + Snapshot Precios
             → Completa el ciclo: venta - devolución = venta neta
             → Snapshot periódico para histórico de precios

SPRINT 5 ─── Discovery + Mapeo Bodegas
             → Una consulta a BODEGAS SAG
             → Configurar mapeo en Agentik
             → Desbloquea cobertura real de tiendas
```

---

## Notas Técnicas

1. **El sync de líneas FV/NV sigue EXACTAMENTE el mismo patrón que CustomerOrderLine** (PD lines sync ya implementado). La diferencia es solo el filtro de fuente.

2. **MOVIMIENTOS_ITEMS es la misma tabla para PD, FV, NV, NC, ET, CN**. Solo cambia `k_n_clase_fuente` del header. El adapter ya sabe leer esta tabla.

3. **v_articulos ya se accede** para enriquecer referencias en el sync de PD. El PV3/PV4 ya está disponible — solo falta persistirlo.

4. **El índice de edad NO requiere un nuevo sync** — ProductionEvent ET (fuente 116) ya tiene la fecha de ingreso para producto terminado. Solo falta un query de agregación.

5. **El volumen de líneas FV/NV será mayor que PD** (~3x-5x según patrones de facturación vs pedidos). El sync debe ser incremental desde el inicio.
