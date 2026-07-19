# CASTILLITOS — Business Rule Specification v1

**Fuente:** Reunion Entrega Modulo Comercial (Go Live)
**Fecha de la reunion:** 2026 (fecha exacta no especificada en el documento)
**Fecha de este documento:** 2026-07-13
**Estado:** Borrador para validacion
**Tenant:** Castillitos

---

## Resumen Ejecutivo

Se analizaron las observaciones de la reunion de entrega del modulo Comercial con el cliente Castillitos. Del documento original se identificaron:

| Clasificacion | Cantidad |
|---|---|
| RULE (reglas de negocio) | 14 |
| REQUIREMENT (requisitos funcionales) | 6 |
| DATA REQUIREMENT (requisitos de datos) | 3 |
| UI IMPROVEMENT (mejoras de interfaz) | 2 |
| DISCOVERY (investigaciones pendientes) | 2 |
| FUTURE MODULE (modulos futuros) | 1 |
| **Total items procesados** | **28** |

---

## Indice de Observaciones Clasificadas

Antes de las reglas formales, se presenta la clasificacion completa de cada observacion del documento original para trazabilidad.

### RULE — Reglas de negocio

| ID | Origen | Descripcion corta |
|---|---|---|
| R-01 | Tiendas, Informes #3 | Cobertura textil: min 8, max 12 unidades por referencia en cada tienda |
| R-02 | Tiendas, pag. 4 | Regla 36: referencia textil con <=36 unidades totales se consolida en Caldas y Centro |
| R-03 | Tiendas, pag. 4 | Cobertura accesorios tiendas: Pequeno 6, Mediano 4, Grande 1 |
| R-04 | Tiendas, pag. 4 | Excepcion productos especiales: banera, cuna colecho, corral = 3 en San Diego + 3 en Caldas |
| R-05 | Tiendas, Descuentos | Markdown por antiguedad: 3m=10%, 6m=30%, 9m=50%, 12m=70% |
| R-06 | Informes #2 | Sugerencia de surtido segun rotacion historica de cada tienda |
| R-07 | Maletas #1 | Derrotero maletas importacion por tamano: Pequeno 10, Mediano 10, Grande 3 |
| R-08 | Maletas #2 | Senal de produccion Castillitos: umbral 100 unidades en bodega sin OP activa |
| R-09 | Maletas #2 | Senal de produccion Latin Kids: umbral 200 unidades en bodega sin OP activa |
| R-10 | Importaciones #1 | Baja rotacion importaciones: >8 meses sin ingreso a bodega con inventario existente |
| R-11 | Vendedores #1 | Alerta agotamiento referencia: notificacion al vendedor con referencia y foto |
| R-12 | Vendedores #2 | Alerta cartera vencida >30 dias al momento de tomar pedido |
| R-13 | Vendedores #3 | Alerta clientes inactivos: >3 meses sin compra, con historial de cartera y compras |
| R-14 | Pedidos, Surtido | Surtido automatico por tallas: distribuir cantidad solicitada segun disponibilidad por talla |

### REQUIREMENT — Requisitos funcionales

| ID | Origen | Descripcion corta | Clasificacion |
|---|---|---|---|
| REQ-01 | Tiendas | Solo 4 tiendas activas: San Diego, Gran Plaza, Centro, Caldas. Las demas inhabilitadas | REQUIREMENT |
| REQ-02 | Pedidos #3 | Tipo de entrega: agregar opcion "despacho en parciales" | REQUIREMENT |
| REQ-03 | Pedidos #4 | Opcion de omitir descuento en pedido | REQUIREMENT |
| REQ-04 | Tiendas, Descuentos | Alerta a tienda por baja rotacion con descuento sugerido | REQUIREMENT |
| REQ-05 | Informes #1 | Informe comparativo de rotacion entre tiendas (separando textil de importacion) | REQUIREMENT |
| REQ-06 | Informes #1 | Informe de rentabilidad por referencia (separando textil de importacion) | REQUIREMENT |

### DATA REQUIREMENT — Requisitos de datos

| ID | Origen | Descripcion corta | Clasificacion |
|---|---|---|---|
| DR-01 | Pedidos #1 | Leer sucursales de clientes desde SAG para mostrar al tomar pedido | DATA REQUIREMENT |
| DR-02 | Tiendas, pag. 3 | Traer de SAG: fecha de ingreso a tienda, fechas de pedidos de clientes | DATA REQUIREMENT |
| DR-03 | Tiendas, pag. 3-4 | Traer de SAG: ciudad, documento, nombre del cliente + tallas, colores, precios, subgrupos, descripcion, linea, tamano, fechas ingreso/venta, canal de venta | DATA REQUIREMENT |

### UI IMPROVEMENT — Mejoras de interfaz

| ID | Origen | Descripcion corta | Clasificacion |
|---|---|---|---|
| UI-01 | Pedidos | Boton de surtido automatico en seccion de pedidos | UI IMPROVEMENT |
| UI-02 | Tiendas | Tiendas inhabilitadas deben mostrarse visualmente como tales | UI IMPROVEMENT |

### DISCOVERY — Investigaciones pendientes

| ID | Origen | Descripcion corta | Clasificacion |
|---|---|---|---|
| DIS-01 | Pedidos #1 | Investigar en SAG como se dividen sucursales de clientes | DISCOVERY |
| DIS-02 | Pedidos #2 | Investigar todos los datos demograficos disponibles en SAG respecto al cliente | DISCOVERY |

### FUTURE MODULE — Modulos futuros

| ID | Origen | Descripcion corta | Clasificacion |
|---|---|---|---|
| FM-01 | Vendedores | App movil para vendedores: tomar pedidos, consultar clientes, consultar cartera, cumplimiento de pedidos, generacion catalogos automatica | FUTURE MODULE |

---

## BRS-01 — Modelo Comercial

No se identificaron reglas de negocio en esta categoria.
Sin embargo, una premisa transversal se identifica claramente:

> **Premisa fundamental:** El negocio opera en dos "mundos" completamente separados: **Textil** (marcas Castillitos y Latin Kids) e **Importacion** (accesorios). Todas las reglas de cobertura, rotacion, produccion y surtido deben respetar esta separacion.

Esta premisa afecta a todas las reglas documentadas a continuacion.

---

## BRS-02 — Tiendas

### R-01: Cobertura Textil General

| Campo | Valor |
|---|---|
| **ID** | R-01 |
| **Nombre** | Cobertura textil minima y maxima por referencia en tienda |
| **Objetivo empresarial** | Garantizar disponibilidad de producto textil en todas las tiendas sin sobreinventario |
| **Descripcion** | En cada tienda debe haber minimo 8 y maximo 12 unidades por referencia textil. Esta regla aplica a todas las tiendas activas |
| **Problema que resuelve** | Tiendas con referencias agotadas (venta perdida) o saturadas (capital inmovilizado) |
| **Aplica a** | Referencias textiles en tiendas activas (San Diego, Gran Plaza, Centro, Caldas) |
| **No aplica a** | Accesorios (importacion) — tienen su propio derrotero. Tiendas inhabilitadas |
| **Responsable** | Gerencia Comercial |
| **Datos requeridos** | Inventario actual por referencia por tienda, clasificacion textil/importacion |
| **Dominios CDL requeridos** | Product Domain, Inventory Domain, Store Operations Domain |
| **Decision Engine que la consumira** | Coverage Engine |
| **Condiciones** | `productWorld = "TEXTIL"` AND `storeStatus = "ACTIVE"` |
| **Resultado esperado** | Si unidades < 8: senal de surtido. Si unidades > 12: senal de transferencia o restriccion |
| **Prioridad** | ALTA |
| **Precedencia** | BASE — puede ser sobreescrita por R-02 (regla 36) y R-04 (excepciones de producto) |
| **Excepciones** | R-02 (regla 36) puede reducir la tienda elegible. R-04 puede definir cantidades diferentes para productos especificos |
| **Alertas relacionadas** | REQ-04 (alerta baja rotacion a tienda) |
| **Evidence requerida** | Inventario por referencia por tienda, fecha ultima sincronizacion, clasificacion de producto |
| **KPIs relacionados** | Cobertura por tienda, referencias en quiebre, referencias sobreinventariadas |
| **Casos de prueba positivos** | Referencia textil con 5 unidades en San Diego → senal de surtido (3 unidades faltantes). Referencia textil con 10 unidades → estado optimo, sin accion |
| **Casos de prueba negativos** | Referencia de accesorios con 5 unidades → esta regla NO aplica. Referencia textil con 5 unidades en tienda inhabilitada → esta regla NO aplica |
| **Preguntas abiertas** | PENDIENTE DE VALIDACION: El min 8 / max 12 es por referencia (ej: "Camisa Polo Azul") o por subgrupo (ej: "Camisas Polo" incluyendo todas las tallas/colores)? El documento dice "por referencia" pero en la practica podria ser por subgrupo. Validar con cliente |

---

### R-02: Regla 36 — Consolidacion Textil

| Campo | Valor |
|---|---|
| **ID** | R-02 |
| **Nombre** | Consolidacion textil cuando inventario total <= 36 unidades |
| **Objetivo empresarial** | Concentrar inventario bajo en tiendas de mayor rotacion para maximizar probabilidad de venta |
| **Descripcion** | Cuando una referencia textil tenga en su totalidad entre TODAS las bodegas (incluyendo la principal) solo 36 unidades o menos, esa referencia solo debe estar en las tiendas de Caldas y Centro. Las demas tiendas deben retirar y transferir los sobrantes |
| **Problema que resuelve** | Inventario diluido entre muchas tiendas impide venta rapida de ultimas unidades |
| **Aplica a** | Referencias textiles cuyo inventario total (todas las bodegas + tiendas) <= 36 unidades |
| **No aplica a** | Accesorios (importacion). Referencias textiles con inventario total > 36 unidades |
| **Responsable** | Gerencia Comercial |
| **Datos requeridos** | Inventario total por referencia (suma de todas las bodegas y tiendas), clasificacion textil, inventario por tienda |
| **Dominios CDL requeridos** | Product Domain, Inventory Domain, Store Operations Domain |
| **Decision Engine que la consumira** | Coverage Engine, Transfer Engine |
| **Condiciones** | `productWorld = "TEXTIL"` AND `totalInventory(allWarehouses + allStores) <= 36` |
| **Resultado esperado** | Referencia se concentra en Caldas y Centro. San Diego y Gran Plaza reciben senal de transferencia hacia Caldas/Centro o bodega principal |
| **Prioridad** | ALTA |
| **Precedencia** | EXCEPTION — sobreescribe R-01 para las tiendas afectadas |
| **Excepciones** | R-04 (productos especiales) podria tener precedencia sobre esta regla si un producto especial cae bajo 36 unidades. PENDIENTE DE VALIDACION |
| **Alertas relacionadas** | Alerta cuando referencia cruza el umbral de 36 unidades |
| **Evidence requerida** | Inventario total consolidado (todas las bodegas), desglose por ubicacion, clasificacion textil |
| **KPIs relacionados** | Referencias consolidadas, velocidad de liquidacion post-consolidacion |
| **Casos de prueba positivos** | Referencia textil con 30 unidades totales (10 en bodega, 8 en San Diego, 6 en Centro, 6 en Caldas) → transferir 8 de San Diego a Caldas/Centro. Referencia textil con 36 unidades exactas → aplica la regla |
| **Casos de prueba negativos** | Referencia textil con 37 unidades totales → R-01 aplica normalmente. Referencia importacion con 30 unidades → esta regla NO aplica |
| **Preguntas abiertas** | PENDIENTE DE VALIDACION: (1) El umbral es estrictamente <= 36 o < 36? El documento dice "solo 36 unidades" lo cual sugiere <= 36. (2) Gran Plaza esta excluida igual que San Diego, o solo San Diego? El documento menciona "solo debe estar en Caldas y Centro" y "las demas tiendas retirar". (3) Cuando el inventario vuelve a subir de 36 (por produccion), se redistribuye automaticamente o se requiere accion manual? (4) Caldas y Centro son las tiendas de mayor rotacion? Validar la razon de la seleccion |

---

### R-03: Cobertura Accesorios por Tamano (Derrotero Tiendas)

| Campo | Valor |
|---|---|
| **ID** | R-03 |
| **Nombre** | Derrotero de accesorios por tamano en tiendas |
| **Objetivo empresarial** | Garantizar disponibilidad optima de accesorios importados segun su tamano fisico y capacidad de exhibicion |
| **Descripcion** | Cantidad optima de accesorios en tiendas segun tamano: Pequeno = 6 unidades por tienda, Mediano = 4 unidades por tienda, Grande = 1 unidad por tienda |
| **Problema que resuelve** | Accesorios grandes ocupan espacio. Accesorios pequenos necesitan mayor volumen para generar venta |
| **Aplica a** | Productos del mundo importacion (accesorios) en tiendas activas |
| **No aplica a** | Productos textiles. Tiendas inhabilitadas |
| **Responsable** | Gerencia Comercial |
| **Datos requeridos** | Clasificacion de tamano (Pequeno/Mediano/Grande), inventario actual por tienda, clasificacion importacion |
| **Dominios CDL requeridos** | Product Domain, Inventory Domain, Store Operations Domain |
| **Decision Engine que la consumira** | Coverage Engine |
| **Condiciones** | `productWorld = "IMPORTACION"` AND `storeStatus = "ACTIVE"` |
| **Resultado esperado** | Producto Pequeno con 3 unidades → surtir 3 mas. Producto Grande con 2 → senal de transferencia de 1 |
| **Prioridad** | ALTA |
| **Precedencia** | BASE — puede ser sobreescrita por R-04 (excepciones de producto) |
| **Excepciones** | R-04 define excepciones para banera, cuna colecho y corral |
| **Alertas relacionadas** | Alerta si desvia del estado optimo |
| **Evidence requerida** | Clasificacion de tamano, inventario por tienda, ultima sincronizacion |
| **KPIs relacionados** | Cobertura accesorios por tienda, quiebres por tamano |
| **Casos de prueba positivos** | Accesorio Pequeno con 2 unidades en tienda → surtir 4 unidades. Accesorio Grande con 1 unidad → estado optimo |
| **Casos de prueba negativos** | Producto textil Pequeno → esta regla NO aplica. Accesorio en tienda inhabilitada → NO aplica |
| **Preguntas abiertas** | PENDIENTE DE VALIDACION: (1) Este derrotero aplica a TODAS las tiendas activas por igual? O hay tiendas con cantidades diferentes? (2) Que define "Pequeno", "Mediano", "Grande"? Es el campo `tamano` de SAG? (3) Este es min=ideal=max o hay un rango? El documento dice "cantidad optima" lo cual sugiere ideal, no min/max |

---

### R-04: Excepcion Productos Especiales (Banera, Cuna Colecho, Corral)

| Campo | Valor |
|---|---|
| **ID** | R-04 |
| **Nombre** | Cobertura especial para banera, cuna colecho y corral |
| **Objetivo empresarial** | Garantizar exhibicion de productos de alto valor en tiendas estrategicas |
| **Descripcion** | Para banera, cuna colecho y corral: debe haber 3 unidades en San Diego y 3 unidades en Caldas. Este es el estado optimo. Si cambia, genera alerta |
| **Problema que resuelve** | Estos productos requieren tratamiento diferenciado por su tamano, valor y necesidad de exhibicion |
| **Aplica a** | Productos cuya descripcion y tamano correspondan a banera, cuna colecho, o corral. Solo en tiendas San Diego y Caldas |
| **No aplica a** | Otros accesorios (usan R-03). Tiendas Gran Plaza y Centro para estos productos. Productos textiles |
| **Responsable** | Gerencia Comercial |
| **Datos requeridos** | Descripcion del producto, tamano, inventario en San Diego, inventario en Caldas |
| **Dominios CDL requeridos** | Product Domain, Inventory Domain, Store Operations Domain |
| **Decision Engine que la consumira** | Coverage Engine |
| **Condiciones** | `productDescription IN ("banera", "cuna colecho", "corral")` AND `store IN ("San Diego", "Caldas")` |
| **Resultado esperado** | Estado optimo = 3 unidades en cada tienda. Si < 3: senal de surtido. Si > 3: senal de transferencia. Si cambia: alerta |
| **Prioridad** | ALTA |
| **Precedencia** | EXCEPTION — sobreescribe R-03 para estos productos especificos |
| **Excepciones** | Ninguna conocida |
| **Alertas relacionadas** | Alerta inmediata si el estado optimo cambia (cualquier desviacion) |
| **Evidence requerida** | Descripcion de producto, tamano, inventario actual en San Diego y Caldas |
| **KPIs relacionados** | Disponibilidad de productos especiales, desviaciones del optimo |
| **Casos de prueba positivos** | Banera con 2 unidades en San Diego → surtir 1 unidad. Corral con 3 unidades en Caldas → estado optimo |
| **Casos de prueba negativos** | Banera con 3 unidades en Gran Plaza → esta regla no define cobertura para Gran Plaza. Producto textil → NO aplica |
| **Preguntas abiertas** | PENDIENTE DE VALIDACION: (1) Como se identifican estos productos en SAG? Por descripcion textual? Por subgrupo? Por referencia especifica? El documento dice "tener en cuenta la descripcion y tamano". (2) Que pasa con Gran Plaza y Centro para estos productos? No deben tener ninguno? Deben usar R-03? (3) El umbral es exactamente 3 o es un minimo de 3? (4) Estos productos son importacion (accesorios) o son una categoria aparte? |

---

### R-05: Markdown por Antiguedad en Tienda

| Campo | Valor |
|---|---|
| **ID** | R-05 |
| **Nombre** | Descuentos sugeridos por antiguedad de producto en tienda |
| **Objetivo empresarial** | Liquidar inventario envejecido progresivamente para liberar capital y espacio de exhibicion |
| **Descripcion** | Despues de 3 meses de ingreso a tienda, si el producto aun tiene inventario en Caldas y Centro, sugerir descuento progresivo: 3 meses = 10%, 6 meses = 30%, 9 meses = 50%, 12 meses = 70%. Se envia alerta a la tienda con el producto y el descuento sugerido |
| **Problema que resuelve** | Productos que no rotan ocupan espacio, inmovilizan capital y pierden relevancia |
| **Aplica a** | Productos con inventario en tiendas de Caldas y Centro |
| **No aplica a** | PENDIENTE DE VALIDACION |
| **Responsable** | Gerencia Comercial |
| **Datos requeridos** | Fecha de ingreso del producto a la tienda (desde SAG), inventario actual en la tienda, dias transcurridos desde ingreso |
| **Dominios CDL requeridos** | Product Domain, Inventory Domain, Sales Domain, Store Operations Domain |
| **Decision Engine que la consumira** | Markdown Engine |
| **Condiciones** | `daysSinceStoreEntry >= 90` AND `currentInventory > 0` AND `store IN ("Caldas", "Centro")` |
| **Resultado esperado** | Sugerencia de descuento (NO aplicacion automatica): 90-179 dias = 10%, 180-269 dias = 30%, 270-364 dias = 50%, >= 365 dias = 70% |
| **Prioridad** | MEDIA |
| **Precedencia** | STANDARD |
| **Excepciones** | PENDIENTE DE VALIDACION: Hay productos exentos de markdown? Nuevos lanzamientos? |
| **Alertas relacionadas** | Alerta a tienda con producto y descuento sugerido. REQ-04 |
| **Evidence requerida** | Fecha ingreso a tienda, dias transcurridos, banda de descuento aplicable, inventario actual |
| **KPIs relacionados** | Inventario envejecido, velocidad de liquidacion, porcentaje de markdown aplicado |
| **Casos de prueba positivos** | Producto ingresado hace 100 dias con 5 unidades en Centro → sugerencia 10%. Producto ingresado hace 200 dias con 3 unidades en Caldas → sugerencia 30% |
| **Casos de prueba negativos** | Producto ingresado hace 50 dias → sin sugerencia. Producto sin inventario (0 unidades) → sin sugerencia |
| **Preguntas abiertas** | PENDIENTE DE VALIDACION: (1) El documento dice "en Caldas y Centro". Esto significa que SOLO aplica a esas dos tiendas? O aplica a todas las tiendas pero se menciono Caldas y Centro como ejemplo? (2) Aplica tanto a textil como a importacion? (3) Es el descuento sugerido o se aplica automaticamente? El documento dice "sugerir" lo cual implica que es una sugerencia. (4) La fecha de ingreso es la primera vez que entro a ESA tienda especifica, o la fecha de produccion/importacion? (5) Si el producto se vende parcialmente y queda poco, el descuento sigue siendo por dias o hay un umbral de inventario que lo acelera? |

---

### R-06: Sugerencia de Surtido por Rotacion Historica

| Campo | Valor |
|---|---|
| **ID** | R-06 |
| **Nombre** | Surtido automatico basado en historial de rotacion por tienda |
| **Objetivo empresarial** | Surtir cada tienda con los productos que historicamente mas se venden en esa tienda especifica |
| **Descripcion** | Cuando una tienda necesita surtido, el sistema debe sugerir lo que mas se venda segun el historial de ventas de esa tienda. No surtir con productos genericos sino con los mas vendidos en ESA tienda |
| **Problema que resuelve** | Surtir todas las tiendas igual ignora las diferencias de demanda local |
| **Aplica a** | Todas las tiendas activas |
| **No aplica a** | Tiendas inhabilitadas |
| **Responsable** | Gerencia Comercial |
| **Datos requeridos** | Historial de ventas por referencia por tienda, inventario disponible en bodega, velocidad de venta |
| **Dominios CDL requeridos** | Product Domain, Sales Domain, Inventory Domain, Store Operations Domain |
| **Decision Engine que la consumira** | Coverage Engine, Replenishment Engine |
| **Condiciones** | `store.needsReplenishment = true` (determinado por R-01, R-03, R-04) |
| **Resultado esperado** | Lista priorizada de referencias a surtir ordenadas por rotacion historica descendente en esa tienda |
| **Prioridad** | MEDIA |
| **Precedencia** | STANDARD — complementa R-01, R-03 (determina QUE surtir, no CUANTO) |
| **Excepciones** | Si la referencia mas vendida no tiene stock en bodega, pasar a la siguiente |
| **Alertas relacionadas** | Ninguna directa |
| **Evidence requerida** | Historial de ventas por tienda, ranking de rotacion, disponibilidad en bodega |
| **KPIs relacionados** | Efectividad del surtido, rotacion post-surtido, venta perdida por surtido incorrecto |
| **Casos de prueba positivos** | Tienda Centro necesita 8 referencias textiles → el sistema sugiere las 8 que mas se vendieron historicamente en Centro y que tienen stock en bodega |
| **Casos de prueba negativos** | Tienda sin historial de ventas → no hay base para sugerencia, aplicar surtido estandar |
| **Preguntas abiertas** | PENDIENTE DE VALIDACION: (1) Que ventana de tiempo se usa para el historial? Ultimos 3 meses? 6 meses? 12 meses? (2) Se separa por mundo (textil/importacion) al calcular rotacion? (3) Si una tienda nunca vendio un producto, puede recibirlo como surtido? |

---

## BRS-03 — Maletas

### R-07: Derrotero Maletas Importacion por Tamano

| Campo | Valor |
|---|---|
| **ID** | R-07 |
| **Nombre** | Derrotero de productos importacion para maletas de vendedor |
| **Objetivo empresarial** | Cada vendedor lleva una maleta con muestrario optimo segun el tamano fisico del producto |
| **Descripcion** | Para productos de importacion en maletas: Pequeno = 10 unidades, Mediano = 10 unidades, Grande = 3 unidades |
| **Problema que resuelve** | Maletas desequilibradas: muchos productos grandes o pocos pequenos reduce la efectividad del vendedor |
| **Aplica a** | Productos del mundo importacion asignados a maletas de vendedores |
| **No aplica a** | Productos textiles (tienen sus propias reglas de maleta) |
| **Responsable** | Gerencia Comercial |
| **Datos requeridos** | Clasificacion de tamano, contenido actual de cada maleta, mundo del producto |
| **Dominios CDL requeridos** | Product Domain, Inventory Domain |
| **Decision Engine que la consumira** | Coverage Engine (contexto maletas) |
| **Condiciones** | `productWorld = "IMPORTACION"` AND `context = "MALETA"` |
| **Resultado esperado** | Sugerencia de carga de maleta: Pequeno=10, Mediano=10, Grande=3 |
| **Prioridad** | MEDIA |
| **Precedencia** | BASE |
| **Excepciones** | Ninguna mencionada |
| **Alertas relacionadas** | R-11 (alerta agotamiento referencia en maleta) |
| **Evidence requerida** | Contenido actual de maleta, clasificacion tamano, mundo del producto |
| **KPIs relacionados** | Cobertura de maleta, efectividad de muestrario |
| **Casos de prueba positivos** | Accesorio Pequeno con 5 unidades en maleta → surtir 5 mas. Accesorio Grande con 3 en maleta → optimo |
| **Casos de prueba negativos** | Producto textil en maleta → esta regla NO aplica |
| **Preguntas abiertas** | PENDIENTE DE VALIDACION: (1) Es 10/10/3 por referencia o por total de accesorios de ese tamano? (2) Ya existia un derrotero textil para maletas que sigue vigente? (3) Que pasa si no hay stock suficiente para completar el derrotero? |

---

## BRS-04 — Produccion

### R-08: Senal de Produccion Textil — Marca Castillitos

| Campo | Valor |
|---|---|
| **ID** | R-08 |
| **Nombre** | Umbral de produccion para subgrupos textiles Castillitos |
| **Objetivo empresarial** | Evitar desabastecimiento de subgrupos textiles de la marca Castillitos activando produccion a tiempo |
| **Descripcion** | Cuando un subgrupo textil de la marca Castillitos llega a 100 unidades disponibles en bodega SIN una orden de produccion (OP) activa de ese mismo subgrupo, se sugiere producir ese subgrupo. Anteriormente el umbral general era 200 unidades; este cambio reduce el umbral a 100 solo para Castillitos |
| **Problema que resuelve** | Desabastecimiento por produccion tardia. El umbral anterior de 200 era demasiado alto para Castillitos |
| **Aplica a** | Subgrupos textiles de la marca Castillitos |
| **No aplica a** | Marca Latin Kids (mantiene umbral 200 = R-09). Accesorios/importacion |
| **Responsable** | Gerencia de Produccion |
| **Datos requeridos** | Inventario disponible en bodega principal por subgrupo, ordenes de produccion activas (OP), clasificacion por marca, clasificacion textil |
| **Dominios CDL requeridos** | Product Domain, Inventory Domain, Purchasing Import Domain |
| **Decision Engine que la consumira** | Production Signal Engine |
| **Condiciones** | `productWorld = "TEXTIL"` AND `brand = "CASTILLITOS"` AND `warehouseAvailable <= 100` AND `activeOP(sameSubgroup) = 0` |
| **Resultado esperado** | Senal de sugerencia de produccion para el subgrupo desabastecido |
| **Prioridad** | ALTA |
| **Precedencia** | STANDARD |
| **Excepciones** | Si ya existe una OP activa para ese subgrupo, NO se genera senal (evitar duplicados) |
| **Alertas relacionadas** | Alerta a gerencia de produccion |
| **Evidence requerida** | Inventario de bodega por subgrupo, lista de OP activas, marca del producto |
| **KPIs relacionados** | Tiempo de reaccion produccion, subgrupos en desabastecimiento, dias sin produccion activa |
| **Casos de prueba positivos** | Subgrupo "Camisetas Polo" Castillitos con 95 unidades en bodega y 0 OP activas → senal de produccion |
| **Casos de prueba negativos** | Mismo subgrupo con 95 unidades pero 1 OP activa → NO generar senal. Subgrupo Latin Kids con 150 unidades → NO aplica (su umbral es 200) |
| **Preguntas abiertas** | PENDIENTE DE VALIDACION: (1) "Bodega" se refiere solo a la bodega principal (B01) o incluye todas las bodegas (B04, B14, B15)? (2) "Disponible" es inventario total o inventario no comprometido (sin reservas de pedidos)? (3) La senal es solo informativa o debe crear automaticamente la OP en SAG? |

---

### R-09: Senal de Produccion Textil — Marca Latin Kids

| Campo | Valor |
|---|---|
| **ID** | R-09 |
| **Nombre** | Umbral de produccion para subgrupos textiles Latin Kids |
| **Objetivo empresarial** | Evitar desabastecimiento de subgrupos textiles de la marca Latin Kids |
| **Descripcion** | Cuando un subgrupo textil de la marca Latin Kids llega a 200 unidades disponibles en bodega SIN una OP activa de ese mismo subgrupo, se sugiere producir. Este umbral se mantiene sin cambio (ya existia como regla general) |
| **Problema que resuelve** | Desabastecimiento por produccion tardia |
| **Aplica a** | Subgrupos textiles de la marca Latin Kids |
| **No aplica a** | Marca Castillitos (usa R-08 con umbral 100). Accesorios/importacion |
| **Responsable** | Gerencia de Produccion |
| **Datos requeridos** | Identicos a R-08 |
| **Dominios CDL requeridos** | Product Domain, Inventory Domain, Purchasing Import Domain |
| **Decision Engine que la consumira** | Production Signal Engine |
| **Condiciones** | `productWorld = "TEXTIL"` AND `brand = "LATIN_KIDS"` AND `warehouseAvailable <= 200` AND `activeOP(sameSubgroup) = 0` |
| **Resultado esperado** | Senal de sugerencia de produccion para el subgrupo desabastecido |
| **Prioridad** | ALTA |
| **Precedencia** | STANDARD |
| **Excepciones** | Identicas a R-08 |
| **Alertas relacionadas** | Alerta a gerencia de produccion |
| **Evidence requerida** | Identica a R-08 |
| **KPIs relacionados** | Identicos a R-08 |
| **Casos de prueba positivos** | Subgrupo Latin Kids con 180 unidades en bodega y 0 OP → senal de produccion |
| **Casos de prueba negativos** | Subgrupo Latin Kids con 250 unidades → sin senal. Subgrupo Castillitos con 180 unidades → NO aplica (R-08 ya cubrio con umbral 100) |
| **Preguntas abiertas** | Mismas que R-08. Adicionalmente: PENDIENTE DE VALIDACION: Hay otras marcas textiles ademas de Castillitos y Latin Kids? Si aparece una nueva marca, cual umbral aplica por defecto? |

---

## BRS-05 — Importacion

### R-10: Deteccion Baja Rotacion de Importaciones

| Campo | Valor |
|---|---|
| **ID** | R-10 |
| **Nombre** | Productos importados con baja rotacion (>8 meses sin reingreso) |
| **Objetivo empresarial** | Identificar productos importados que no se recompran desde China y aun inmovilizan inventario |
| **Descripcion** | Referencias que llevan mas de 8 meses sin registrar recompra o reingreso desde China y que aun tengan inventario. Este listado se denomina "productos con baja rotacion" |
| **Problema que resuelve** | Capital inmovilizado en productos importados que no rotan y no se reponen |
| **Aplica a** | Productos del mundo importacion (accesorios) con inventario > 0 |
| **No aplica a** | Productos textiles (tienen produccion local, no importacion) |
| **Responsable** | Gerencia de Importaciones |
| **Datos requeridos** | Fecha ultimo ingreso a bodega por referencia, inventario actual, clasificacion importacion |
| **Dominios CDL requeridos** | Product Domain, Inventory Domain, Purchasing Import Domain |
| **Decision Engine que la consumira** | Rotation Engine, Markdown Engine |
| **Condiciones** | `productWorld = "IMPORTACION"` AND `daysSinceLastWarehouseEntry > 240` AND `currentInventory > 0` |
| **Resultado esperado** | Listado de "productos con baja rotacion" para decision de markdown, liquidacion o discontinuacion |
| **Prioridad** | MEDIA |
| **Precedencia** | STANDARD |
| **Excepciones** | PENDIENTE DE VALIDACION: Hay productos importados que deliberadamente no se recompran (ediciones limitadas)? |
| **Alertas relacionadas** | Puede alimentar R-05 (markdown) si se decide aplicar descuento |
| **Evidence requerida** | Fecha ultimo ingreso, dias transcurridos, inventario actual, historial de importaciones |
| **KPIs relacionados** | Numero de referencias con baja rotacion, capital inmovilizado, antiguedad promedio |
| **Casos de prueba positivos** | Accesorio sin ingreso desde hace 10 meses con 50 unidades en bodega → aparece en listado |
| **Casos de prueba negativos** | Accesorio sin ingreso hace 6 meses → no califica aun. Accesorio sin ingreso hace 10 meses pero con 0 inventario → no aplica |
| **Preguntas abiertas** | PENDIENTE DE VALIDACION: (1) "Ingreso a bodega" es la fecha de entrada por importacion (documento de entrada) o la fecha de orden de compra? (2) Los 8 meses son calendario o habiles? (3) Este listado genera alguna accion automatica (markdown) o solo es informativo? (4) Aplica la regla de markdown R-05 automaticamente a estos productos? |

---

## BRS-06 — Vendedores

### R-11: Alerta Agotamiento de Referencia en Maleta

| Campo | Valor |
|---|---|
| **ID** | R-11 |
| **Nombre** | Notificacion automatica al vendedor cuando referencia de maleta se agota |
| **Objetivo empresarial** | Evitar que vendedores ofrezcan productos agotados. Permitir retiro inmediato de la maleta |
| **Descripcion** | Cuando una referencia se agota en inventario, enviar notificacion directa a los vendedores que la tienen en maleta. La notificacion debe mostrar la referencia y su foto para que el vendedor la saque de la maleta |
| **Problema que resuelve** | Vendedores toman pedidos de productos agotados, generando frustracion y cancelaciones |
| **Aplica a** | Todas las referencias asignadas a maletas de vendedores |
| **No aplica a** | Productos no asignados a maletas |
| **Responsable** | Gerencia Comercial |
| **Datos requeridos** | Inventario disponible por referencia, asignacion maleta-vendedor-referencia, foto del producto |
| **Dominios CDL requeridos** | Product Domain, Inventory Domain |
| **Decision Engine que la consumira** | Alert Engine |
| **Condiciones** | `referenceAvailableInventory = 0` AND `referenceInVendorSuitcase = true` |
| **Resultado esperado** | Notificacion push/alerta al vendedor con: nombre de la referencia, foto, instruccion de retirar de maleta |
| **Prioridad** | ALTA |
| **Precedencia** | ALERT |
| **Excepciones** | Si el producto vuelve a tener stock (por produccion o importacion), enviar notificacion de reincorporacion? PENDIENTE DE VALIDACION |
| **Alertas relacionadas** | Directamente es una alerta |
| **Evidence requerida** | Inventario en cero, lista de vendedores afectados, fecha de agotamiento |
| **KPIs relacionados** | Pedidos rechazados por agotamiento, tiempo de reaccion del vendedor |
| **Casos de prueba positivos** | Referencia "Camisa Polo Roja M" llega a 0 unidades. Vendedor Juan la tiene en maleta → Juan recibe notificacion con foto |
| **Casos de prueba negativos** | Referencia llega a 0 pero ningun vendedor la tiene en maleta → no se envia notificacion |
| **Preguntas abiertas** | PENDIENTE DE VALIDACION: (1) "Agotamiento" es inventario total = 0 o inventario disponible = 0 (considerando reservas)? (2) La notificacion es instantanea o se agrupa en un resumen diario? (3) Requiere la app movil de vendedores (FM-01) o se puede implementar por otro canal? |

---

### R-12: Alerta Cartera Vencida al Tomar Pedido

| Campo | Valor |
|---|---|
| **ID** | R-12 |
| **Nombre** | Alerta de cartera vencida cuando vendedor atiende a cliente |
| **Objetivo empresarial** | Evitar que vendedores tomen pedidos de clientes con cartera vencida sin conocimiento previo |
| **Descripcion** | Cuando un vendedor llega donde un cliente y va a hacer un pedido, si el cliente tiene cartera vencida a mas de 30 dias, el sistema debe alertar al vendedor |
| **Problema que resuelve** | Vendedores toman pedidos que luego son rechazados por credito, generando desgaste comercial |
| **Aplica a** | Todos los clientes al momento de iniciar un pedido |
| **No aplica a** | Clientes sin cartera vencida. Clientes con cartera vencida <= 30 dias |
| **Responsable** | Gerencia Financiera / Gerencia Comercial |
| **Datos requeridos** | Cartera del cliente (cuentas por cobrar), dias de vencimiento, monto vencido |
| **Dominios CDL requeridos** | Customer Domain, Sales Domain |
| **Decision Engine que la consumira** | Order Validation Engine, Alert Engine |
| **Condiciones** | `customer.overdueReceivableDays > 30` |
| **Resultado esperado** | Alerta visible al vendedor ANTES de iniciar el pedido. No bloquea — solo alerta |
| **Prioridad** | ALTA |
| **Precedencia** | ALERT |
| **Excepciones** | PENDIENTE DE VALIDACION: Hay clientes VIP exentos? El sistema debe bloquear el pedido o solo alertar? |
| **Alertas relacionadas** | Directamente es una alerta |
| **Evidence requerida** | Monto vencido, dias de vencimiento, fecha ultimo pago |
| **KPIs relacionados** | Cartera vencida, pedidos tomados a clientes morosos, recuperacion post-alerta |
| **Casos de prueba positivos** | Cliente con factura vencida hace 45 dias → alerta al vendedor al seleccionar el cliente |
| **Casos de prueba negativos** | Cliente con factura vencida hace 20 dias → sin alerta. Cliente sin cartera → sin alerta |
| **Preguntas abiertas** | PENDIENTE DE VALIDACION: (1) Los 30 dias son desde la fecha de vencimiento de la factura? (2) Es solo alertar o tambien bloquear la toma de pedido? El documento dice "alertar". (3) El vendedor puede ignorar la alerta y tomar el pedido de todas formas? (4) Se muestra el monto vencido o solo la existencia de cartera vencida? |

---

### R-13: Alerta Clientes Inactivos

| Campo | Valor |
|---|---|
| **ID** | R-13 |
| **Nombre** | Informe y alerta de clientes sin compras en mas de 3 meses |
| **Objetivo empresarial** | Identificar clientes en riesgo de perdida y activar retencion comercial |
| **Descripcion** | Generar informe de clientes que llevan mas de 3 meses sin comprar. Para esos mismos clientes, incluir historial de cartera y compras. Esta informacion puede ser alertas en la app de vendedores |
| **Problema que resuelve** | Perdida silenciosa de clientes por falta de seguimiento |
| **Aplica a** | Todos los clientes con historial de compras |
| **No aplica a** | Clientes nuevos sin historial |
| **Responsable** | Gerencia Comercial |
| **Datos requeridos** | Fecha ultima compra por cliente, historial de compras, historial de cartera |
| **Dominios CDL requeridos** | Customer Domain, Sales Domain |
| **Decision Engine que la consumira** | Alert Engine, Customer Intelligence Engine |
| **Condiciones** | `daysSinceLastPurchase > 90` |
| **Resultado esperado** | Listado de clientes inactivos con: nombre, ultima compra, monto historial, estado de cartera. Alerta al vendedor asignado |
| **Prioridad** | MEDIA |
| **Precedencia** | ALERT |
| **Excepciones** | Clientes estacionales que solo compran en ciertos periodos? PENDIENTE DE VALIDACION |
| **Alertas relacionadas** | Directamente es una alerta/informe |
| **Evidence requerida** | Fecha ultima compra, dias de inactividad, historial de compras, estado de cartera |
| **KPIs relacionados** | Tasa de retencion, clientes reactivados, valor perdido por inactividad |
| **Casos de prueba positivos** | Cliente "Almacen XYZ" no compra hace 120 dias → aparece en listado con historial |
| **Casos de prueba negativos** | Cliente que compro hace 60 dias → no aparece. Cliente nuevo sin compras historicas → no aplica |
| **Preguntas abiertas** | PENDIENTE DE VALIDACION: (1) Los 3 meses son calendario (90 dias) o 3 meses exactos? (2) Se agrupa por vendedor asignado? (3) Requiere la app movil (FM-01) o se muestra en el modulo web? (4) La alerta es periodica (diaria, semanal) o se genera una sola vez al cruzar el umbral? |

---

## BRS-07 — Pedidos

### R-14: Surtido Automatico por Tallas

| Campo | Valor |
|---|---|
| **ID** | R-14 |
| **Nombre** | Distribucion automatica de cantidad solicitada por tallas segun disponibilidad |
| **Objetivo empresarial** | Agilizar la toma de pedidos cuando el cliente solicita unidades surtidas (mezcla de tallas) |
| **Descripcion** | Cuando un cliente pide una cantidad de unidades "surtidas" (ej: 50 unidades surtidas de una referencia), el sistema debe distribuir automaticamente la cantidad por tallas de acuerdo a la disponibilidad actual en inventario |
| **Problema que resuelve** | El vendedor debe calcular manualmente cuantas unidades de cada talla incluir, lo cual es lento y propenso a errores |
| **Aplica a** | Pedidos con solicitud de "surtido" en productos textiles con tallas |
| **No aplica a** | Pedidos de tallas especificas. Productos sin tallas (accesorios) |
| **Responsable** | Gerencia Comercial |
| **Datos requeridos** | Disponibilidad por talla por referencia, cantidad total solicitada |
| **Dominios CDL requeridos** | Product Domain, Inventory Domain |
| **Decision Engine que la consumira** | Order Engine |
| **Condiciones** | `orderType = "SURTIDO"` AND `product.hasSizes = true` |
| **Resultado esperado** | Distribucion proporcional por talla segun disponibilidad. Si hay 100 unidades: S=20, M=30, L=30, XL=20 y el cliente pide 50 surtidas → S=10, M=15, L=15, XL=10 |
| **Prioridad** | MEDIA |
| **Precedencia** | STANDARD |
| **Excepciones** | Si una talla tiene 0 disponible, se omite y se redistribuye. Si no hay suficiente para cubrir la solicitud total, informar al vendedor |
| **Alertas relacionadas** | Alerta si no se puede cubrir la totalidad del pedido |
| **Evidence requerida** | Disponibilidad por talla, distribucion calculada, diferencia con solicitud |
| **KPIs relacionados** | Tiempo de toma de pedido, precision del surtido, pedidos parciales |
| **Casos de prueba positivos** | Cliente pide 50 surtidas. Disponible: S=20, M=30, L=25, XL=15 (total 90). Distribucion: S=11, M=17, L=14, XL=8 (proporcional) |
| **Casos de prueba negativos** | Cliente pide talla M especifica (no es surtido) → NO aplica. Producto accesorio sin tallas → NO aplica |
| **Preguntas abiertas** | PENDIENTE DE VALIDACION: (1) La distribucion es proporcional a disponibilidad o existe una curva ideal de tallas (ej: mas M y L que S y XL)? (2) Si no hay suficiente inventario para cubrir el pedido completo, se crea pedido parcial o se rechaza? (3) El vendedor puede ajustar la distribucion sugerida antes de confirmar? |

---

## Matriz de Mapeo: Regla → Infraestructura

| Business Rule | Decision Engine | CDL Domains | Policy Template | Policy Pack Category |
|---|---|---|---|---|
| R-01 Cobertura Textil 8-12 | Coverage Engine | Product, Inventory, StoreOps | STORE_COVERAGE | COVERAGE |
| R-02 Regla 36 Consolidacion | Coverage Engine, Transfer Engine | Product, Inventory, StoreOps | STORE_STOCK_RESTRICTION | STORE |
| R-03 Cobertura Accesorios Tamano | Coverage Engine | Product, Inventory, StoreOps | STORE_COVERAGE | COVERAGE |
| R-04 Excepcion Banera/Cuna/Corral | Coverage Engine | Product, Inventory, StoreOps | STORE_PRODUCT_EXCEPTION | COVERAGE |
| R-05 Markdown por Antiguedad | Markdown Engine | Product, Inventory, Sales, StoreOps | STORE_MARKDOWN (PLANNED) | MARKDOWN |
| R-06 Surtido por Rotacion | Coverage Engine, Replenishment Engine | Product, Sales, Inventory, StoreOps | (nuevo: STORE_REPLENISHMENT_PRIORITY) | REPLENISHMENT |
| R-07 Derrotero Maletas Import | Coverage Engine (maletas) | Product, Inventory | (nuevo: SUITCASE_COVERAGE) | COVERAGE |
| R-08 Senal Produccion Castillitos | Production Signal Engine | Product, Inventory, PurchasingImport | (nuevo: PRODUCTION_SIGNAL) | ALERT |
| R-09 Senal Produccion Latin Kids | Production Signal Engine | Product, Inventory, PurchasingImport | (nuevo: PRODUCTION_SIGNAL) | ALERT |
| R-10 Baja Rotacion Importaciones | Rotation Engine, Markdown Engine | Product, Inventory, PurchasingImport | (nuevo: IMPORT_LOW_ROTATION) | INVENTORY |
| R-11 Alerta Agotamiento Maleta | Alert Engine | Product, Inventory | STORE_DEVIATION_ALERT | ALERT |
| R-12 Alerta Cartera Vencida | Order Validation Engine, Alert Engine | Customer, Sales | (nuevo: ORDER_CREDIT_CHECK) | ORDER |
| R-13 Alerta Clientes Inactivos | Alert Engine, Customer Intelligence | Customer, Sales | (nuevo: CUSTOMER_INACTIVITY_ALERT) | ALERT |
| R-14 Surtido Automatico Tallas | Order Engine | Product, Inventory | (nuevo: ORDER_AUTO_ASSORTMENT) | ORDER |

**Nota:** Las entradas marcadas como "(nuevo: ...)" indican que se necesita un template que no existe en STORE-POLICY-TEMPLATES-01. Estos templates pertenecen a sprints futuros (ORDER-POLICY-TEMPLATES, VENDOR-POLICY-TEMPLATES, PRODUCTION-POLICY-TEMPLATES, IMPORT-POLICY-TEMPLATES).

---

## Preguntas Pendientes de Validacion (Consolidadas)

### Criticas — bloquean implementacion

| # | Regla | Pregunta |
|---|---|---|
| Q-01 | R-01 | El min 8 / max 12 es por referencia individual o por subgrupo (incluyendo tallas/colores)? |
| Q-02 | R-02 | El umbral de la regla 36 es <= 36 o estrictamente < 36? |
| Q-03 | R-02 | Gran Plaza esta excluida (igual que San Diego) de la consolidacion, o se mantiene? |
| Q-04 | R-03 | El derrotero accesorios (6/4/1) es el ideal, el minimo, o el rango min-max? |
| Q-05 | R-03 | Como se determina el "tamano" del producto? Campo `tamano` en SAG? Descripcion? Subgrupo? |
| Q-06 | R-04 | Como se identifican banera, cuna colecho y corral en SAG? Por descripcion? Por subgrupo? Por referencia especifica? |
| Q-07 | R-04 | Gran Plaza y Centro NO deben tener estos productos, o se les asigna usando R-03? |
| Q-08 | R-05 | El markdown aplica solo a Caldas y Centro o a todas las tiendas? |
| Q-09 | R-05 | La "fecha de ingreso" es la primera vez que entro a ESA tienda, o la fecha de produccion/importacion general? |
| Q-10 | R-08, R-09 | "Bodega" es solo la principal (B01) o incluye todas (B04, B14, B15)? |
| Q-11 | R-08, R-09 | "Disponible" es inventario total o inventario no comprometido (sin reservas)? |

### Importantes — impactan calidad

| # | Regla | Pregunta |
|---|---|---|
| Q-12 | R-02 | Cuando el inventario vuelve a subir de 36, se redistribuye automaticamente? |
| Q-13 | R-05 | El markdown aplica a textil, importacion, o ambos? |
| Q-14 | R-05 | Hay productos exentos de markdown? |
| Q-15 | R-06 | Que ventana de tiempo se usa para calcular historial de rotacion? 3, 6, 12 meses? |
| Q-16 | R-07 | El derrotero maletas (10/10/3) es por referencia o por total de accesorios de ese tamano en la maleta? |
| Q-17 | R-11 | La notificacion es instantanea o se agrupa? |
| Q-18 | R-12 | El vendedor puede ignorar la alerta y tomar el pedido? |
| Q-19 | R-13 | La alerta es periodica o se genera una sola vez? |
| Q-20 | R-14 | La distribucion surtida es proporcional a disponibilidad o existe una curva ideal de tallas? |

---

## Riesgos de Interpretacion Detectados

| # | Riesgo | Severidad | Mitigacion |
|---|---|---|---|
| RI-01 | "Referencia" puede significar cosas distintas en diferentes contextos: a veces es la referencia individual (Camisa Polo Azul M), a veces es el subgrupo (Camisas Polo). Las reglas R-01, R-02, R-03 usan "referencia" de forma potencialmente ambigua | ALTA | Validar con cliente la granularidad exacta para cada regla |
| RI-02 | La regla de markdown R-05 menciona "Caldas y Centro" pero no queda claro si aplica SOLO a esas tiendas o si fue un ejemplo. Si solo aplica a esas dos tiendas, San Diego y Gran Plaza nunca tendrian markdown por antiguedad | ALTA | Confirmar si es exclusivo o general |
| RI-03 | R-02 y R-04 pueden entrar en conflicto: si un corral (R-04) cae bajo 36 unidades totales, R-02 dice consolidar solo en Caldas/Centro, pero R-04 dice que debe estar en San Diego y Caldas. Se debe definir precedencia | MEDIA | Definir que R-04 tiene precedencia sobre R-02 para productos especiales |
| RI-04 | R-05 requiere "fecha de ingreso a tienda" de SAG. Si este dato no existe o no es confiable en SAG, la regla no puede ejecutarse | ALTA | Validar disponibilidad y calidad del dato en SAG antes de implementar |
| RI-05 | Las reglas R-08 y R-09 mencionan "marca" (Castillitos vs Latin Kids) pero el Commercial Data Layer actual identifica productos por subgrupo, linea, descripcion — no necesariamente por "marca". Hay que verificar como mapear marca a los campos disponibles | MEDIA | Investigar campo de marca en SAG y como se refleja en Product Domain |
| RI-06 | R-07 (derrotero maletas importacion) y R-03 (derrotero tiendas importacion) usan tamanos diferentes: maletas 10/10/3 vs tiendas 6/4/1. Esto es correcto porque maletas y tiendas son contextos diferentes, pero podria generar confusion | BAJA | Documentar explicitamente la diferencia de contexto |
| RI-07 | R-14 (surtido automatico) no define la logica de distribucion: proporcional a inventario, proporcional a curva de ventas, o alguna otra formula. La implementacion depende de esta decision | MEDIA | Definir algoritmo de distribucion con el cliente |

---

## Lista de Reglas Identificadas (Resumen)

| ID | Nombre | Dominio | Prioridad |
|---|---|---|---|
| R-01 | Cobertura textil min 8, max 12 por referencia | Tiendas | ALTA |
| R-02 | Regla 36: consolidacion textil en Caldas/Centro | Tiendas | ALTA |
| R-03 | Cobertura accesorios por tamano (6/4/1) | Tiendas | ALTA |
| R-04 | Excepcion banera/cuna colecho/corral (3+3) | Tiendas | ALTA |
| R-05 | Markdown por antiguedad (10%/30%/50%/70%) | Tiendas | MEDIA |
| R-06 | Surtido por rotacion historica de tienda | Tiendas | MEDIA |
| R-07 | Derrotero maletas importacion (10/10/3) | Maletas | MEDIA |
| R-08 | Senal produccion Castillitos (umbral 100) | Produccion | ALTA |
| R-09 | Senal produccion Latin Kids (umbral 200) | Produccion | ALTA |
| R-10 | Baja rotacion importaciones (>8 meses) | Importacion | MEDIA |
| R-11 | Alerta agotamiento referencia en maleta | Vendedores | ALTA |
| R-12 | Alerta cartera vencida >30 dias en pedido | Vendedores | ALTA |
| R-13 | Alerta clientes inactivos >3 meses | Vendedores | MEDIA |
| R-14 | Surtido automatico por tallas | Pedidos | MEDIA |

---

## CORRECCION BRS — CASTILLITOS-MALLET-POLICIES-01 (2026-07-13)

### Clarificacion: Alcance de Derroteros vs Store Policies

Tras la implementacion del sprint CASTILLITOS-MALLET-POLICIES-01, se establece la siguiente separacion formal:

#### DERROTERO DE MALETAS

- Aplica EXCLUSIVAMENTE a vendedores y sus bodegas/maletas
- Define la composicion comercial objetivo de cada maleta
- Puede depender de: marca, mundo comercial, grupo, subgrupo, o tamano
- NO se utiliza para determinar cobertura de tiendas
- Tres derroteros implementados:
  1. Castillitos Textil (4 grupos, 32 entradas — fuente: DERROTERO CS.xlsx)
  2. Latin Kids Textil (6 grupos, 23 entradas — fuente: DERROTERO_RULES LT existente)
  3. Importacion/Accesorios (3 entradas por tamano — fuente: reunion Go Live)

#### STORE POLICIES

- NO consumen derroteros de maletas
- Usan reglas propias de:
  - Cobertura minima/maxima (R-01, R-03)
  - Consolidacion (R-02, regla 36)
  - Excepciones de producto (R-04)
  - Descuentos por antiguedad (R-05)
  - Surtido por rotacion (R-06)
  - Transferencias (futuro)
  - Restriccion de inventario (futuro)

#### Reglas afectadas por esta clarificacion

| Regla | Clarificacion |
|---|---|
| R-01 (Cobertura textil 8-12) | Aplica SOLO a tiendas. No aplica a maletas |
| R-02 (Regla 36) | Aplica SOLO a tiendas. No aplica a maletas |
| R-03 (Cobertura accesorios tiendas) | Aplica SOLO a tiendas. El derrotero de accesorios para MALETAS usa valores distintos (10/10/3 vs 6/4/1) |
| R-07 (Derrotero importacion maletas) | Aplica SOLO a maletas. Implementado en CASTILLITOS-MALLET-POLICIES-01 |

#### Trazabilidad

- **Decision tomada por:** Sprint CASTILLITOS-MALLET-POLICIES-01
- **Fecha:** 2026-07-13
- **Motivo:** El derrotero del Excel aplica exclusivamente a la composicion de maletas de vendedores. Las tiendas utilizan reglas de cobertura (min/max), rotacion, surtido y descuentos que son independientes
