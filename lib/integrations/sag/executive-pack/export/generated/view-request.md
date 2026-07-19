# Especificación de Dominios de Información para Integración Operacional

**Agentik × SAG**

> Versión 2.6.0 &nbsp;|&nbsp; 2026-05-31 &nbsp;|&nbsp; Externo — Documento técnico-funcional

---

## Contexto

Este documento describe los dominios de información identificados durante el análisis funcional y técnico de la integración entre Agentik y SAG. SAG continúa siendo el sistema de origen en todos los casos. Agentik opera únicamente como consumidor de información, con acceso exclusivamente de consulta (SELECT). El mecanismo definitivo de integración será definido conjuntamente con el equipo técnico de SAG.

---

## Resumen de Dominios de Información

| # | Dominio de información | Fase | Información prioritaria | Información complementaria | Frecuencia |
|---|---|---|---|---|---|
| 1 | Información de Ventas | Fase 1 | 11 | 12 | Diaria al cierre del día (EOD) |
| 2 | Información de Pagos | Fase 1 | 8 | 5 | Diaria al cierre del día (EOD) |
| 3 | Información de Cartera | Fase 1 | 9 | 5 | Diaria al cierre del día (EOD) |
| 4 | Información de Recaudos | Fase 1 | 6 | 6 | Diaria al cierre del día (EOD) |
| 5 | Información Bancaria | Fase 1 | 9 | 5 | Diaria al cierre del día (EOD) |
| 6 | Información de Inventario | Fase 2 | 6 | 9 | Diaria al cierre del día (EOD) |
| 7 | Información de Compras | Fase 2 | 12 | 5 | Diaria al cierre del día (EOD) |
| 8 | Información de Productos | Fase 2 | 5 | 11 | Diaria al cierre del día (EOD) |

---

> Los nombres técnicos utilizados en este documento corresponden a una propuesta de nomenclatura elaborada por Agentik para facilitar la discusión técnica. La nomenclatura definitiva podrá ajustarse conjuntamente durante la etapa de validación e implementación.

---

## FASE 1 — Información Financiera y Comercial

> Ventas · Pagos · Cartera · Recaudos · Bancos

### Información de Ventas

*Nombre técnico sugerido: `vw_agentik_ventas`*  

**Propósito:** Consulta de documentos de venta con detalle por línea. Permite conocer el valor, producto, cliente, vendedor y estado de cada transacción de venta.  
**Posibles fuentes identificadas durante el análisis:** `VENTAS_MAESTRO`, `VENTAS_DETALLE`, `CLIENTES`, `VENDEDORES`  

*Estas referencias corresponden a hipótesis de trabajo construidas durante el análisis preliminar y serán validadas conjuntamente con el equipo SAG durante la revisión técnica.*

**Frecuencia:** Diaria al cierre del día (EOD)  
**Fase:** Fase 1 — Información Financiera y Comercial

**Campos identificados para la integración:**

| Campo | Tipo | Descripción |
|---|---|---|
| `ID_VENTA` | string | Identificador único de la transacción de venta. |
| `NUMERO_FACTURA` | string | Número del documento de factura. |
| `FECHA_VENTA` | datetime | Fecha y hora de registro de la venta. |
| `ID_CLIENTE` | string | Identificador del cliente. |
| `ID_VENDEDOR` | string | Identificador del ejecutivo de ventas. |
| `ID_PRODUCTO` | string | Identificador del producto. |
| `REFERENCIA` | string | Referencia comercial del producto. |
| `MONTO_BRUTO` | decimal | Valor bruto antes de descuentos. |
| `MONTO_NETO` | decimal | Valor neto después de descuentos. |
| `ESTADO_DOCUMENTO` | enum | Estado: activo, anulado, devuelto. |
| `EMPRESA` | string | Empresa emisora del documento. |

**Campos adicionales identificados:**

| Campo | Tipo | Descripción |
|---|---|---|
| `NOMBRE_CLIENTE` | string | Nombre del cliente para presentación. |
| `NOMBRE_VENDEDOR` | string | Nombre del vendedor para presentación. |
| `NOMBRE_PRODUCTO` | string | Descripción del producto para presentación. |
| `CANTIDAD` | number | Unidades vendidas. |
| `PRECIO_UNITARIO` | decimal | Precio unitario de venta. |
| `DESCUENTO_COMERCIAL` | decimal | Descuento aplicado en la negociación. |
| `COSTO_PRODUCTO` | decimal | Costo del producto para cálculo de margen. |
| `BODEGA` | string | Bodega de despacho. |
| `CIUDAD` | string | Ciudad de entrega. |
| `CANAL_VENTA` | string | Canal de la venta: mostrador, distribuidor, etc. |
| `MONEDA` | enum | Moneda de la transacción: COP, USD, EUR. |
| `FECHA_ENTREGA_REAL` | date | Fecha real de entrega al cliente. |

**Filtros sugeridos:**
- FECHA_VENTA >= :fechaDesde AND FECHA_VENTA <= :fechaHasta
- EMPRESA = :empresaId

**Observaciones:**
- La granularidad por línea de detalle es el nivel de análisis identificado para este dominio.
- De existir una tabla separada de detalles de venta, se valoraría que el acceso consolide la información en una consulta.
- Sería conveniente validar si el campo REFERENCIA mantiene una estructura consistente entre los dominios de Inventario y Productos.

---

### Información de Pagos

*Nombre técnico sugerido: `vw_agentik_pagos`*  

**Propósito:** Consulta de pagos asociados a documentos de cartera. Permite conocer qué facturas han recibido abonos, en qué fecha y por qué valor.  
**Tablas fuente:** `pagosnew`  

**Frecuencia:** Diaria al cierre del día (EOD)  
**Fase:** Fase 1 — Información Financiera y Comercial

**Campos identificados para la integración:**

| Campo | Tipo | Descripción |
|---|---|---|
| `ID_PAGO` | string | Identificador único del pago. |
| `ID_FACTURA_REF` | string | Identificador de la factura asociada al pago. |
| `ID_CLIENTE` | string | Identificador del cliente. |
| `FECHA_PAGO` | datetime | Fecha y hora del pago. |
| `MONTO_PAGADO` | decimal | Valor pagado en la transacción. |
| `TIPO_PAGO` | enum | Tipo: abono, pago total, anticipo. |
| `ESTADO_PAGO` | enum | Estado: aplicado, pendiente, anulado. |
| `EMPRESA` | string | Empresa receptora del pago. |

**Campos adicionales identificados:**

| Campo | Tipo | Descripción |
|---|---|---|
| `FECHA_VENCIMIENTO` | date | Fecha de vencimiento del documento pagado. |
| `CANAL_PAGO` | string | Canal de recepción: banco, caja, transferencia. |
| `SALDO_POSTERIOR` | decimal | Saldo pendiente después de aplicar el pago. |
| `MONEDA` | enum | Moneda del pago: COP, USD, EUR. |
| `NOMBRE_CLIENTE` | string | Nombre del cliente para presentación. |

**Filtros sugeridos:**
- FECHA_PAGO >= :fechaDesde
- EMPRESA = :empresaId

**Observaciones:**
- SAG confirmó que pagosnew no tiene restricción histórica de acceso.
- Sería conveniente validar si ID_FACTURA_REF puede relacionarse con el identificador de venta o factura disponible en el dominio de Ventas.
- Confirmar el nombre exacto de la tabla fuente de pagos vigente.

---

### Información de Cartera

*Nombre técnico sugerido: `vw_agentik_cartera`*  

**Propósito:** Consulta de documentos pendientes de cobro por cliente. Una fila por documento pendiente, con estado de mora y saldo actual.  
**Posibles fuentes identificadas durante el análisis:** `CARTERA_DOCUMENTOS`, `CLIENTES`, `VENDEDORES`  

*Estas referencias corresponden a hipótesis de trabajo construidas durante el análisis preliminar y serán validadas conjuntamente con el equipo SAG durante la revisión técnica.*

**Frecuencia:** Diaria al cierre del día (EOD)  
**Fase:** Fase 1 — Información Financiera y Comercial

**Campos identificados para la integración:**

| Campo | Tipo | Descripción |
|---|---|---|
| `ID_DOCUMENTO` | string | Identificador único del documento de cartera. |
| `NUMERO_FACTURA` | string | Número de la factura asociada. |
| `ID_CLIENTE` | string | Identificador del cliente. |
| `FECHA_EMISION` | date | Fecha de emisión del documento. |
| `FECHA_VENCIMIENTO` | date | Fecha de vencimiento de la obligación. |
| `VALOR_ORIGINAL` | decimal | Valor original del documento. |
| `SALDO_PENDIENTE` | decimal | Saldo vigente pendiente de cobro. |
| `DIAS_MORA` | number | Días transcurridos desde el vencimiento. |
| `EMPRESA` | string | Empresa del documento. |

**Campos adicionales identificados:**

| Campo | Tipo | Descripción |
|---|---|---|
| `NOMBRE_CLIENTE` | string | Nombre del cliente. |
| `ID_VENDEDOR` | string | Vendedor responsable de la cuenta. |
| `NOMBRE_VENDEDOR` | string | Nombre del vendedor. |
| `ESTADO_CARTERA` | enum | Estado: corriente, vencida, castigada. |
| `CUPO_CREDITO` | decimal | Cupo de crédito aprobado para el cliente. |

**Filtros sugeridos:**
- SALDO_PENDIENTE > 0
- EMPRESA = :empresaId

**Observaciones:**
- Una fila por documento pendiente es el nivel de granularidad identificado para el análisis de envejecimiento de cartera.
- El campo DIAS_MORA puede ser calculado como CURRENT_DATE − FECHA_VENCIMIENTO si SAG no lo expone directamente.

---

### Información de Recaudos

*Nombre técnico sugerido: `vw_agentik_recaudos`*  

**Propósito:** Consulta de ingresos registrados en el sistema de cartera. Permite conocer qué dinero fue capturado y si ya fue aplicado a documentos específicos.  
**Posibles fuentes identificadas durante el análisis:** `RECAUDOS_CAJA`, `RECAUDOS_BANCO`  

*Estas referencias corresponden a hipótesis de trabajo construidas durante el análisis preliminar y serán validadas conjuntamente con el equipo SAG durante la revisión técnica.*

**Frecuencia:** Diaria al cierre del día (EOD)  
**Fase:** Fase 1 — Información Financiera y Comercial

**Campos identificados para la integración:**

| Campo | Tipo | Descripción |
|---|---|---|
| `ID_RECAUDO` | string | Identificador único del recaudo. |
| `FECHA_RECAUDO` | datetime | Fecha y hora del recaudo. |
| `ID_CLIENTE` | string | Cliente asociado al recaudo. |
| `MONTO_RECAUDO` | decimal | Valor recibido. |
| `ESTADO_RECAUDO` | enum | Estado: aplicado, pendiente, en_revision. |
| `EMPRESA` | string | Empresa receptora. |

**Campos adicionales identificados:**

| Campo | Tipo | Descripción |
|---|---|---|
| `ID_DOCUMENTO_REF` | string | Documento al que se aplica el recaudo. |
| `CANAL_RECAUDO` | string | Canal: caja, banco, transferencia, PSE. |
| `CONCILIADO` | boolean | Indica si el recaudo tiene confirmación bancaria. |
| `REFERENCIA_BANCARIA` | string | Referencia del banco para cruce con extracto. |
| `ID_MOVIMIENTO_BANCO` | string | Identificador del movimiento en extracto bancario. |
| `MONTO_NO_APLICADO` | decimal | Parte del recaudo aún sin aplicar a documentos. |

**Filtros sugeridos:**
- FECHA_RECAUDO >= :fechaDesde
- EMPRESA = :empresaId

**Observaciones:**
- Confirmar con SAG si recaudos y pagos están en la misma tabla o en tablas separadas.
- El campo REFERENCIA_BANCARIA podría facilitar la relación entre este dominio y la información bancaria disponible para procesos de conciliación y análisis.
- CONCILIADO permite saber si el ingreso tiene respaldo bancario confirmado.

---

### Información Bancaria

*Nombre técnico sugerido: `vw_agentik_bancos`*  

**Propósito:** Consulta de movimientos del extracto bancario reportados por las entidades financieras. Referencia principal para la consulta y análisis de movimientos bancarios registrados en las cuentas de la organización.  
**Posibles fuentes identificadas durante el análisis:** `MOVIMIENTOS_BANCO`, `SALDOS_BANCO`  

*Estas referencias corresponden a hipótesis de trabajo construidas durante el análisis preliminar y serán validadas conjuntamente con el equipo SAG durante la revisión técnica.*

**Frecuencia:** Diaria al cierre del día (EOD)  
**Fase:** Fase 1 — Información Financiera y Comercial

**Campos identificados para la integración:**

| Campo | Tipo | Descripción |
|---|---|---|
| `ID_MOVIMIENTO_BANCO` | string | Identificador único del movimiento en extracto. |
| `ID_CUENTA_BANCO` | string | Identificador de la cuenta bancaria. |
| `BANCO` | string | Nombre del banco. |
| `FECHA_MOVIMIENTO` | date | Fecha del movimiento en el extracto. |
| `TIPO_MOVIMIENTO` | enum | Tipo: débito, crédito. |
| `VALOR_DEBITO` | decimal | Valor del débito (si aplica). |
| `VALOR_CREDITO` | decimal | Valor del crédito (si aplica). |
| `SALDO_POSTERIOR` | decimal | Saldo de la cuenta después del movimiento. |
| `EMPRESA` | string | Empresa propietaria de la cuenta. |

**Campos adicionales identificados:**

| Campo | Tipo | Descripción |
|---|---|---|
| `CONCEPTO_MOVIMIENTO` | string | Descripción del movimiento según el banco. |
| `REFERENCIA_BANCARIA` | string | Referencia del banco para cruce con recaudos. |
| `CONCILIADO` | boolean | Indica si el movimiento ya fue conciliado. |
| `FECHA_VALOR` | date | Fecha valor (puede diferir de FECHA_MOVIMIENTO). |
| `NUMERO_CUENTA` | string | Número de cuenta bancaria. |

**Filtros sugeridos:**
- FECHA_MOVIMIENTO >= :fechaDesde AND FECHA_MOVIMIENTO <= :fechaHasta
- EMPRESA = :empresaId

**Observaciones:**
- El campo REFERENCIA_BANCARIA podría utilizarse para relacionar movimientos bancarios con registros de recaudo, sujeto a la validación del modelo de datos disponible en SAG.
- SALDO_POSTERIOR del último movimiento del día equivale al saldo real disponible.
- Confirmar disponibilidad del extracto bancario histórico desde 2020.

---

## FASE 2 — Información Operacional

> Inventario · Compras · Productos

### Información de Inventario

*Nombre técnico sugerido: `vw_agentik_inventario`*  

**Propósito:** Consulta de saldos de inventario por referencia, talla y bodega. Fuente oficial: v_saldos_inventariotallanew (confirmada en reunión SAG mayo 2026).  
**Tablas fuente:** `v_saldos_inventariotallanew`  

**Frecuencia:** Diaria al cierre del día (EOD)  
**Fase:** Fase 2 — Información Operacional

**Campos identificados para la integración:**

| Campo | Tipo | Descripción |
|---|---|---|
| `ID_PRODUCTO` | string | Identificador del producto. |
| `REFERENCIA` | string | Referencia comercial del producto. |
| `TALLA` | string | Talla de la variante. |
| `CODIGO_BODEGA` | string | Código de la bodega. |
| `EXISTENCIA` | number | Unidades físicas en la bodega. |
| `DISPONIBLE` | number | Unidades disponibles para venta según configuración SAG. |

**Campos adicionales identificados:**

| Campo | Tipo | Descripción |
|---|---|---|
| `CODIGO_ARTICULO` | string | Código externo o de barras del artículo. |
| `NOMBRE_ARTICULO` | string | Descripción del artículo. |
| `COLOR` | string | Color de la variante (si la vista lo incluye). |
| `NOMBRE_BODEGA` | string | Nombre legible de la bodega. |
| `SUCURSAL` | string | Sucursal propietaria de la bodega. |
| `LINEA` | string | Línea de producto. |
| `RESERVADO` | number | Unidades reservadas para pedidos. |
| `TRANSITO` | number | Unidades en tránsito aún no recibidas. |
| `COSTO_PROMEDIO` | decimal | Costo promedio ponderado del artículo. |

**Filtros sugeridos:**
- EXISTENCIA > 0 OR DISPONIBLE > 0
- CODIGO_BODEGA IN (:bodegasActivas)

**Observaciones:**
- SAG confirmó que v_saldos_inventariotallanew es la fuente oficial para saldos con granularidad por talla.
- DISPONIBLE puede verse afectado por la parametrización de PD (Pedidos en Despacho). Confirmar fórmula exacta.
- RESERVADO puede no estar disponible como campo separado — se podría derivar como EXISTENCIA − DISPONIBLE.

---

### Información de Compras

*Nombre técnico sugerido: `vw_agentik_compras`*  

**Propósito:** Consulta de órdenes de compra con estado de recepción. Permite conocer qué se ha pedido, cuánto se ha recibido y qué está pendiente.  
**Posibles fuentes identificadas durante el análisis:** `ORDENES_COMPRA`, `RECEPCIONES_COMPRA`, `MAESTRO_PROVEEDORES`  

*Estas referencias corresponden a hipótesis de trabajo construidas durante el análisis preliminar y serán validadas conjuntamente con el equipo SAG durante la revisión técnica.*

**Frecuencia:** Diaria al cierre del día (EOD)  
**Fase:** Fase 2 — Información Operacional

**Campos identificados para la integración:**

| Campo | Tipo | Descripción |
|---|---|---|
| `ID_COMPRA` | string | Identificador único de la orden de compra. |
| `NUMERO_OC` | string | Número visible de la OC. |
| `ID_PROVEEDOR` | string | Identificador del proveedor. |
| `NOMBRE_PROVEEDOR` | string | Nombre del proveedor. |
| `ID_PRODUCTO` | string | Identificador del producto. |
| `REFERENCIA` | string | Referencia del producto. |
| `CANTIDAD_ORDENADA` | number | Unidades solicitadas. |
| `CANTIDAD_RECIBIDA` | number | Unidades efectivamente recibidas. |
| `VALOR_TOTAL` | decimal | Valor total de la orden. |
| `FECHA_OC` | date | Fecha de emisión de la OC. |
| `ESTADO_OC` | enum | Estado: aprobada, enviada, parcial, recibida, cancelada. |
| `EMPRESA` | string | Empresa compradora. |

**Campos adicionales identificados:**

| Campo | Tipo | Descripción |
|---|---|---|
| `FECHA_COMPROMISO` | date | Fecha pactada de entrega con el proveedor. |
| `FECHA_RECEPCION_REAL` | date | Fecha real de recepción en bodega. |
| `MONEDA` | enum | Moneda de la OC: COP, USD, EUR, CNY. |
| `BODEGA_DESTINO` | string | Bodega de destino de la recepción. |
| `TIPO_COMPRA` | enum | Tipo: nacional, internacional. |

**Filtros sugeridos:**
- ESTADO_OC NOT IN ('cancelada', 'cerrada') OR FECHA_RECEPCION_REAL >= :fechaDesde
- EMPRESA = :empresaId

**Observaciones:**
- Confirmar si las OC y las recepciones están en la misma tabla o si requieren JOIN.
- El campo ESTADO_OC puede tener codificación diferente en SAG — confirmar valores del enum.

---

### Información de Productos

*Nombre técnico sugerido: `vw_agentik_productos`*  

**Propósito:** Consulta del maestro de artículos con atributos comerciales, operativos y logísticos. Fuente de referencia para enriquecer información de ventas, inventario y compras.  
**Posibles fuentes identificadas durante el análisis:** `MAESTRO_PRODUCTOS`, `PRECIOS_LISTA`  

*Estas referencias corresponden a hipótesis de trabajo construidas durante el análisis preliminar y serán validadas conjuntamente con el equipo SAG durante la revisión técnica.*

**Frecuencia:** Diaria al cierre del día (EOD)  
**Fase:** Fase 2 — Información Operacional

**Campos identificados para la integración:**

| Campo | Tipo | Descripción |
|---|---|---|
| `ID_PRODUCTO` | string | Identificador único del producto. |
| `REFERENCIA` | string | Referencia comercial — clave de cruce con otros dominios. |
| `NOMBRE_COMERCIAL` | string | Nombre del producto para presentación. |
| `ACTIVO` | boolean | Indica si el producto está activo. |
| `UNIDAD_MEDIDA` | string | Unidad de medida: UND, KG, PAR, CAJA, etc. |

**Campos adicionales identificados:**

| Campo | Tipo | Descripción |
|---|---|---|
| `CODIGO_PRODUCTO` | string | Código externo o de barras. |
| `LINEA` | string | Línea de producto. |
| `CATEGORIA` | string | Categoría de gestión. |
| `MARCA` | string | Marca comercial. |
| `PRECIO_LISTA` | decimal | Precio de lista vigente. |
| `COSTO_PROMEDIO` | decimal | Costo promedio ponderado. |
| `TALLA` | string | Talla (si el producto maneja variantes). |
| `COLOR` | string | Color (si el producto maneja variantes). |
| `MANEJA_TALLA_COLOR` | boolean | Indica si el artículo tiene variantes de talla/color. |
| `STOCK_MINIMO` | number | Nivel mínimo de stock requerido. |
| `DESCONTINUADO` | boolean | Indica si el producto fue descontinuado. |

**Filtros sugeridos:**
- ACTIVO = true

**Observaciones:**
- Sería conveniente validar si el campo REFERENCIA mantiene una estructura consistente entre los distintos dominios.
- Confirmar si PRECIO_LISTA está en MAESTRO_PRODUCTOS o en una tabla separada de listas de precios.
- Si el maestro tiene una fila por variante (talla × color), indicarlo para ajustar el modelo de datos.

---

## Nota Final

El propósito de este documento es facilitar la validación conjunta de los dominios de información identificados durante el análisis funcional y operativo realizado para la integración entre Agentik y SAG.

Los campos aquí descritos representan una referencia de trabajo inicial y podrán ajustarse conjuntamente durante el proceso de validación técnica, de acuerdo con la disponibilidad de información y las recomendaciones del equipo SAG.

De acuerdo con la recomendación recibida por el equipo SAG durante las conversaciones preliminares, cualquier proceso de consulta, sincronización o extracción de información será programado preferiblemente en horarios de baja operación, idealmente durante la noche, con el fin de minimizar cualquier impacto sobre el funcionamiento normal del sistema.

Agentik permanece abierto a adaptar tanto el mecanismo de integración como el modelo de acceso según las mejores prácticas definidas por SAG.

El objetivo principal de este documento es servir como base de conversación para la validación conjunta de la información requerida, facilitando el análisis técnico y reduciendo iteraciones durante el proceso de integración.
