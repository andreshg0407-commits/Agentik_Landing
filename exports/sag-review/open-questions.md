# Registro de Preguntas Abiertas

**Agentik × SAG — Preguntas pendientes de validación**

> Versión 2.6.0 &nbsp;|&nbsp; 2026-05-31

---

## Resumen

| Total | Prioridad Alta | Prioridad Media | Prioridad Baja |
|---|---|---|---|
| 32 | 4 | 18 | 10 |

---

## Acceso General

### GEN-01 — 🔴 **Prioridad Alta**

**Pregunta:** ¿Cuál es el mecanismo de autenticación que SAG recomienda para el acceso de solo lectura a las vistas? ¿Usuario de base de datos dedicado, API key, o conexión por VPN corporativa?

**Impacto si no se responde:** La arquitectura de conexión no puede definirse hasta confirmar el mecanismo de autenticación.

**Respuesta SAG:** _Pendiente_

### GEN-02 — 🔴 **Prioridad Alta**

**Pregunta:** ¿Las vistas se crearán en el ambiente de producción de SAG o en un ambiente espejo/staging? ¿Habrá un proceso de certificación antes de pasar a producción?

**Impacto si no se responde:** Determina el cronograma de implementación y los ambientes disponibles para pruebas.

**Respuesta SAG:** _Pendiente_

### GEN-03 — ⚪ Prioridad Baja

**Pregunta:** ¿Cuál es la ventana horaria recomendada por SAG para ejecutar procesos de consulta, sincronización o extracción de información sin afectar la operación normal del sistema?

**Impacto si no se responde:** Permite programar las sincronizaciones en horarios de baja operación, preferiblemente nocturnos, y definir tamaños de lote adecuados para minimizar cualquier impacto sobre SAG.

**Respuesta SAG:** _Pendiente_

### GEN-04 — ⚪ Prioridad Baja

**Pregunta:** ¿SAG puede notificar a Agentik cuando una vista ha sido actualizada (trigger o flag de timestamp), o Agentik debe hacer polling periódico?

**Impacto si no se responde:** Afecta el diseño del proceso de sincronización y la frescura de los datos en Agentik.

**Respuesta SAG:** _Pendiente_

### GEN-05 — ⚪ Prioridad Baja

**Pregunta:** ¿Existe documentación técnica del esquema de base de datos de SAG disponible para el equipo de Agentik? ¿Diccionario de datos, ERD, o manual de tablas?

**Impacto si no se responde:** Acelera la validación de campos y reduce el número de preguntas en reuniones técnicas.

**Respuesta SAG:** _Pendiente_

---

## Ventas

### VEN-01 — 🟡 **Prioridad Media**

**Pregunta:** ¿La vista vw_agentik_ventas incluirá tanto facturas como notas débito/crédito en una misma vista, o se manejarán en vistas separadas?

**Contexto:** El análisis de ventas netas requiere cruzar facturas con sus notas de ajuste para calcular el valor real de la transacción.

**Impacto si no se responde:** Sin confirmación, el cálculo de ventas netas puede duplicar o subestimar valores si los tipos de documento no están correctamente separados.

**Respuesta SAG:** _Pendiente_

### VEN-02 — 🟡 **Prioridad Media**

**Pregunta:** ¿El campo DESCUENTO_COMERCIAL en la línea de detalle refleja el descuento aplicado al ítem o el descuento en el encabezado del documento prorrateado?

**Contexto:** Para análisis de rentabilidad por producto, necesitamos el descuento a nivel de línea.

**Impacto si no se responde:** Afecta el cálculo de margen bruto por referencia si el descuento está consolidado en el encabezado.

**Respuesta SAG:** _Pendiente_

### VEN-03 — 🟡 **Prioridad Media**

**Pregunta:** ¿El campo CIUDAD_DESTINO está disponible en la vista de ventas o se debe obtener cruzando con la tabla de clientes?

**Impacto si no se responde:** La segmentación geográfica de ventas requiere este campo directamente en la vista para evitar JOINs adicionales.

**Respuesta SAG:** _Pendiente_

---

## Pagos

### PAG-01 — 🟡 **Prioridad Media**

**Pregunta:** ¿El campo ESTADO_PAGO en la tabla pagosnew distingue entre pago aplicado, pago pendiente de aplicar y pago reversado?

**Contexto:** Para el seguimiento de cartera es crítico saber si un pago ya fue aplicado al documento de cobro.

**Impacto si no se responde:** Sin esta distinción, el saldo pendiente de cartera puede reportar valores incorrectos.

**Respuesta SAG:** _Pendiente_

### PAG-02 — 🟡 **Prioridad Media**

**Pregunta:** ¿La fecha histórica más antigua disponible en pagosnew es accesible sin restricciones? SAG confirmó en reunión de mayo 2026 que no hay restricción histórica — ¿esto aplica también para el ambiente de producción actual?

**Impacto si no se responde:** La ventana histórica disponible determina la profundidad del análisis de comportamiento de pago por cliente.

**Respuesta SAG:** _Pendiente_

### PAG-03 — 🟡 **Prioridad Media**

**Pregunta:** ¿Los pagos en efectivo y los pagos electrónicos (transferencias, PSE) se registran en la misma tabla o en tablas separadas dentro de pagosnew?

**Impacto si no se responde:** Afecta la construcción del análisis por canal de pago.

**Respuesta SAG:** _Pendiente_

---

## Cartera

### CAR-01 — 🟡 **Prioridad Media**

**Pregunta:** ¿El campo FECHA_VENCIMIENTO en la cartera pendiente refleja la fecha original de vencimiento del documento o la fecha renegociada si hubo refinanciación?

**Impacto si no se responde:** El cálculo de días de mora y el análisis de envejecimiento de cartera depende de esta distinción.

**Respuesta SAG:** _Pendiente_

### CAR-02 — 🟡 **Prioridad Media**

**Pregunta:** ¿El cupo de crédito del cliente (CUPO_CREDITO) está disponible en la misma vista de cartera o en una tabla de maestro de clientes separada?

**Impacto si no se responde:** La cobertura de cupo de crédito requiere cruzar saldo pendiente con el cupo asignado.

**Respuesta SAG:** _Pendiente_

### CAR-03 — ⚪ Prioridad Baja

**Pregunta:** ¿SAG registra las promesas de pago como campo en la cartera o se gestionan en un módulo separado de gestión de cobros?

**Impacto si no se responde:** Determina si el indicador de cumplimiento de promesas de pago puede obtenerse de SAG directamente.

**Respuesta SAG:** _Pendiente_

---

## Recaudos

### REC-01 — 🟡 **Prioridad Media**

**Pregunta:** ¿El campo CONCILIADO (boolean o equivalente) en recaudos indica específicamente que el recaudo fue cruzado contra un movimiento bancario, o simplemente que fue aplicado a un documento de cartera?

**Contexto:** La conciliación bancaria requiere cruzar recaudos contra extractos bancarios, no solo contra documentos de cartera.

**Impacto si no se responde:** Si CONCILIADO solo refleja aplicación a cartera, el módulo de conciliación bancaria no puede usarlo como señal de cruce con bancos.

**Respuesta SAG:** _Pendiente_

### REC-02 — 🟡 **Prioridad Media**

**Pregunta:** ¿Los recaudos anulados o reversados permanecen en la vista con un estado especial, o se eliminan físicamente del registro?

**Impacto si no se responde:** Los recaudos reversados deben excluirse del saldo de caja real pero incluirse en el historial de movimientos para conciliación.

**Respuesta SAG:** _Pendiente_

---

## Bancos

### BAN-01 — 🔴 **Prioridad Alta**

**Pregunta:** ¿El campo REFERENCIA_BANCARIA en la vista de bancos corresponde al número de referencia del extracto bancario emitido por la entidad financiera, o es un código interno de SAG?

**Contexto:** Para la conciliación bancaria automatizada, la referencia debe poder cruzarse directamente con el extracto bancario del banco.

**Impacto si no se responde:** Si es un código interno de SAG, la conciliación automática contra extractos bancarios externos no es posible.

**Respuesta SAG:** _Pendiente_

### BAN-02 — 🟡 **Prioridad Media**

**Pregunta:** ¿La vista de bancos puede filtrar por TIPO_MOVIMIENTO para separar créditos (ingresos) de débitos (egresos)? ¿Cuáles son los valores exactos del campo TIPO_MOVIMIENTO en SAG?

**Impacto si no se responde:** El análisis de flujo de caja bancario requiere separar ingresos de egresos de forma confiable.

**Respuesta SAG:** _Pendiente_

### BAN-04 — 🟡 **Prioridad Media**

**Pregunta:** ¿Existe un campo que identifique si un movimiento bancario ya fue cruzado con un recaudo en SAG (ESTADO_CONCILIACION o equivalente)?

**Impacto si no se responde:** La detección de movimientos bancarios no conciliados requiere esta señal para evitar falsos positivos.

**Respuesta SAG:** _Pendiente_

### BAN-03 — ⚪ Prioridad Baja

**Pregunta:** ¿Los movimientos bancarios en SAG son cargados manualmente por el equipo contable o se importan automáticamente desde el banco?

**Impacto si no se responde:** Determina la latencia real de los datos bancarios y la confiabilidad del saldo reportado.

**Respuesta SAG:** _Pendiente_

---

## Inventario

### INV-01 — 🟡 **Prioridad Media**

**Pregunta:** ¿El campo DISPONIBLE en v_saldos_inventariotallanew descuenta automáticamente las reservas por pedidos pendientes de surtir, o es equivalente a EXISTENCIA menos solo los compromisos registrados en SAG?

**Contexto:** SAG ya confirmó que el cálculo del disponible depende de la parametrización 'Disponible a utilizar' y de las fuentes configuradas para afectar disponible. Esta validación busca únicamente determinar la configuración específica utilizada por la organización.

**Impacto si no se responde:** Si DISPONIBLE y EXISTENCIA son iguales, el campo DISPONIBLE no puede usarse como indicador operativo de stock real. Afecta quiebres de stock y cobertura.

**Respuesta SAG:** _Pendiente_

### INV-02 — 🟡 **Prioridad Media**

**Pregunta:** ¿El campo RESERVADO existe en v_saldos_inventariotallanew o es un campo derivado que debe calcularse cruzando con pedidos pendientes?

**Impacto si no se responde:** Determina si el inventario comprometido puede calcularse directamente desde la vista de inventario o requiere un JOIN adicional.

**Respuesta SAG:** _Pendiente_

### INV-03 — 🟡 **Prioridad Media**

**Pregunta:** ¿Los atributos COLOR y demás variantes de producto se encuentran disponibles de forma consistente para todas las empresas o dependen de parametrizaciones específicas de implementación?

**Impacto si no se responde:** Determina si el análisis de inventario puede hacerse a nivel de SKU completo (referencia + talla + color) para todas las empresas o solo para algunas según configuración.

**Respuesta SAG:** _Pendiente_

### INV-04 — 🟡 **Prioridad Media**

**Pregunta:** ¿El campo COSTO_PROMEDIO en inventario es el costo promedio ponderado histórico o el último costo de compra?

**Impacto si no se responde:** Afecta directamente el cálculo del valor total del inventario y el margen bruto.

**Respuesta SAG:** _Pendiente_

### INV-05 — ⚪ Prioridad Baja

**Pregunta:** ¿Existe una vista o tabla en SAG que consolide el inventario en tránsito (comprado pero aún no recibido físicamente)?

**Impacto si no se responde:** Sin esta información, el inventario en tránsito debe estimarse desde las órdenes de compra enviadas sin recepción completa.

**Respuesta SAG:** _Pendiente_

---

## Compras

### COM-01 — 🟡 **Prioridad Media**

**Pregunta:** ¿El campo ESTADO_OC en SAG tiene valores estándar predefinidos? ¿Cuáles son los posibles valores y cuál indica que una OC está completamente recibida?

**Impacto si no se responde:** El cálculo de compras pendientes y cumplimiento de proveedores depende de poder filtrar por estado de la OC.

**Respuesta SAG:** _Pendiente_

### COM-02 — 🟡 **Prioridad Media**

**Pregunta:** ¿La fecha de compromiso de entrega del proveedor (FECHA_COMPROMISO) está disponible a nivel de línea de OC o solo a nivel de encabezado?

**Impacto si no se responde:** El cálculo de OC vencidas y el seguimiento de SLA por proveedor requiere la fecha a nivel de línea para productos con diferentes fechas de entrega.

**Respuesta SAG:** _Pendiente_

### COM-03 — ⚪ Prioridad Baja

**Pregunta:** ¿SAG registra el tipo de compra (nacional / internacional) a nivel de OC? ¿Bajo qué campo y con qué valores?

**Impacto si no se responde:** El análisis de importaciones y dependencia de comercio exterior requiere este campo.

**Respuesta SAG:** _Pendiente_

---

## Productos

### PRO-01 — 🔴 **Prioridad Alta**

**Pregunta:** ¿El código de referencia (REFERENCIA) en el maestro de productos de SAG es el mismo que se usa en las vistas de ventas, inventario, compras y cartera? ¿Es la clave de cruce garantizada entre todos los dominios?

**Impacto si no se responde:** Si los códigos de referencia no son consistentes entre dominios, la trazabilidad Producto → Inventario → Venta → Compra no es posible sin tablas de homologación adicionales.

**Respuesta SAG:** _Pendiente_

### PRO-02 — ⚪ Prioridad Baja

**Pregunta:** ¿El campo ACTIVO en el maestro de productos distingue entre productos activos para venta, activos para compra y activos solo para consulta histórica?

**Impacto si no se responde:** El conteo de referencias activas puede ser impreciso si el campo ACTIVO no distingue entre estos estados.

**Respuesta SAG:** _Pendiente_

### PRO-03 — ⚪ Prioridad Baja

**Pregunta:** ¿Existe un campo MARGEN_OBJETIVO en el maestro de productos que refleje el margen esperado por la organización para esa referencia?

**Impacto si no se responde:** El análisis de productos por margen requiere este campo para identificar referencias por encima o por debajo del objetivo.

**Respuesta SAG:** _Pendiente_

### PRO-04 — ⚪ Prioridad Baja

**Pregunta:** ¿SAG maneja el campo ES_IMPORTADO o equivalente en el maestro de productos? ¿O solo está disponible el PAIS_ORIGEN?

**Impacto si no se responde:** Si solo está disponible PAIS_ORIGEN, el campo ES_IMPORTADO debe derivarse comparando PAIS_ORIGEN con el país de la organización.

**Respuesta SAG:** _Pendiente_

---

> **Nota sobre horarios:** Las consultas y procesos de extracción de información deberán programarse preferiblemente en horarios de baja operación, idealmente durante la noche, siguiendo la recomendación del equipo SAG para minimizar cualquier impacto sobre el funcionamiento normal del sistema.

---

*Favor completar la columna "Respuesta SAG" y devolver a: integraciones@agentik.co*