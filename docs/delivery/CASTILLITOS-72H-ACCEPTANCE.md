# CASTILLITOS 72H DELIVERY — ACCEPTANCE CONTROL

**Documento canónico de handoff.** Ruta: `docs/delivery/CASTILLITOS-72H-ACCEPTANCE.md`
**QA Lead:** Fable · **Implementación:** Opus · **Aprobación visual/negocio:** Andrés · **Gate de alcance/arquitectura:** Yumeko
**Regla:** los IDs son estables — no se renombran ni se eliminan en silencio. Solo Fable cambia estados a PASS. Opus marca `IMPLEMENTED_UNVERIFIED`.
**Antes de tocar código Desktop/Seller, Opus debe leer este documento completo y devolver su matriz de acknowledgement (§F).**

Estados: `OPEN` · `IMPLEMENTED_UNVERIFIED` · `PASS` · `BLOCKED`

---

## A. FASE A — DESKTOP (prioridad máxima)

### DESK-NAV-01 · P1 · Desktop · `/[orgSlug]/comercial/*`
- **Comportamiento actual:** el System Rail primario (`components/shell/workspace-shell-client.tsx`, `PrimaryRail` ~línea 273) no declara altura de viewport propia (sin `height:100vh`, sin `position:sticky/fixed`); su altura depende del contenedor flex `minHeight:100vh` (línea 140). Si el documento (body) scrollea en vez del canvas interno, el rail puede desplazarse/terminar antes del fondo cuando Comercial tiene pocos módulos.
- **Esperado:** rail azul llena SIEMPRE la altura del viewport; no se mueve al scrollear la navegación secundaria; indicador de módulo activo alineado; sin clipping de labels/íconos.
- **Evidencia:** `workspace-shell-client.tsx` líneas 140 (`minHeight:100vh` en wrapper), 273-286 (PrimaryRail sin altura propia ni sticky), canvas con `overflow:auto` interno.
- **Autoridad de datos:** n/a (shell).
- **Alcance propuesto (mínimo):** fijar el rail a viewport (`position:sticky; top:0; height:100vh` o `100dvh`) o garantizar que el scroll viva solo en el canvas interno. Nada más.
- **Alcance prohibido:** rediseñar la navegación, tocar jerarquía de 3 niveles, colores, módulos.
- **Test de aceptación:** en `/comercial/clientes` con >100 filas y en `/comercial` (pocos módulos): el borde inferior del rail toca el borde inferior del viewport en todo momento de scroll; el indicador activo no se desplaza.
- **Estado:** OPEN

### DESK-SELLER-01 · P0 · Desktop · `/[orgSlug]/comercial/vendedores`
- **Actual:** la identidad de vendedor del directorio es un **slug derivado del nombre** (`lib/comercial/foundation/seller-directory.ts:21` — `sellerId: string; // slug derived from sellerName`); el drawer 360 se abre y consulta por `sellerSlug` (`vendedores-client.tsx:199` → `/api/orgs/[orgSlug]/comercial/vendedores/[sellerSlug]`).
- **Esperado:** identidad canónica de vendedor (tercero) como clave de consulta; el nombre es display, jamás identidad. Sin lookup fuzzy por nombre.
- **Evidencia:** archivos/líneas citados.
- **Autoridad canónica:** `lib/comercial/frontline/seller-tercero-mapping.ts` (+ `seller-user-mapping` para scope). La API route ya importa `resolveCurrentSeller/deriveSellerScope` — el mapeo existe.
- **Alcance propuesto:** resolver slug→tercero canónico en el borde (API) usando el mapping existente y propagar el ID canónico al loader; mantener el slug solo como parámetro de URL legado.
- **Prohibido:** reconstruir el directorio, renombrar rutas, inventar identidades.
- **Test:** dos vendedores con nombres similares/homónimos resuelven a terceros distintos; un slug sin mapeo certificado → estado factual "Identidad no certificada", nunca datos de otro vendedor.
- **Estado:** OPEN

### DESK-SELLER-02 · P0 · Desktop · drawer Vendedores → tab COMISIONES
- **Actual:** placeholder — `lib/comercial/vendors/vendedor-360-loader.ts:456` devuelve `comisiones: { state: "pendiente_pya" }` mientras el dominio de comisión está CERRADO y certificado.
- **Esperado:** statement mensual real con `truthState` visible (CERTIFIED · CERTIFIED_ZERO · SAG_UNAVAILABLE · IDENTITY_UNRESOLVED), bandas y total del mes.
- **Evidencia:** línea citada; cadena CERT-02→06 de esta entrega certifica el servicio.
- **Autoridad canónica:** `lib/comercial/frontline/seller-commission-service.ts` → `computeSellerCommissionStatement(sellerTerceroId, year, month)`.
- **Alcance propuesto:** conectar el tab al servicio (depende de DESK-SELLER-01 para el tercero); render con truthState SIEMPRE visible.
- **Prohibido:** recalcular comisiones, tocar bandas, tocar autoridades congeladas (CERT-05), cualquier FLOAT en dinero.
- **Test:** Orlando Naranjo (tercero certificado) muestra statement del mes con truthState=CERTIFIED y total exacto del servicio; vendedor sin identidad → IDENTITY_UNRESOLVED explícito, jamás $0 fingido.
- **Estado:** OPEN

### DESK-SELLER-03 · P1 · Desktop · drawer Vendedores → tab METAS
- **Actual:** placeholder `metas: { state: "pendiente_pya" }` (`vendedor-360-loader.ts:455`). No existe servicio canónico de metas.
- **Esperado (ley sin-hecho-sin-componente):** estado factual "Sin metas configuradas" (o retirar el tab en esta entrega) — nunca placeholder técnico visible ni métricas inventadas.
- **Autoridad:** ninguna (declarado honesto).
- **Alcance propuesto:** texto factual o retiro del tab. Prohibido: inventar motor de metas en 72h.
- **Test:** el tab no muestra "pendiente_pya" ni datos fabricados.
- **Estado:** OPEN

### DESK-SELLER-04 · P0 · Desktop · drawer Vendedores → PERFIL (código SAG)
- **Actual:** no existe campo de código SAG del vendedor en directorio ni loader; `vendedor-360-loader.ts:129` — `sagName: null, // Will be enriched from maletas if available`. La cadena de fallback contractual no está implementada.
- **Esperado (cadena certificada, sin inventar):** `código SAG del vendedor` OR `código de bodega SAG asignada` OR literal **"Sin código SAG certificado"**.
- **Evidencia:** línea citada; `vw_agentik_bodegas` con **0 usos** en lib (ver §A.5) — la pata de bodega asignada no está ingerida.
- **Autoridad canónica:** seller-tercero-mapping (código vendedor); asignación de bodega: fuente por confirmar con Yumeko (gap declarado — posible uso de `vw_agentik_bodegas` ya suministrada).
- **Alcance propuesto:** exponer el código desde el mapping cuando exista; si no, mostrar el literal factual. La pata "bodega asignada" solo si la fuente se certifica dentro de la ventana; si no, cae al literal.
- **Prohibido:** derivar códigos por heurística/nombre; pedir vistas SAG nuevas salvo imposibilidad contractual.
- **Test:** vendedor con tercero certificado muestra su código; vendedor sin código y sin bodega certificada muestra exactamente "Sin código SAG certificado".
- **Estado:** OPEN

### DESK-SELLER-05 · P1 · Desktop · drawer Vendedores → tab VENTAS
- **Actual:** el header del cliente declara "Data sources: CRM quotes (primary)" (`vendedores-client.tsx:11`); las métricas del directorio (`seller-metrics`) se construyen sobre actividad CRM (`crmQuoteCount`, `totalAmount`).
- **Esperado:** las ventas del vendedor provienen de la autoridad canónica de ventas (`SaleRecord`, source-aware); las cotizaciones CRM pueden mostrarse, pero etiquetadas como CRM y nunca como "ventas".
- **Autoridad canónica:** `SaleRecord` read model (vw_agentik_ventas ingerida).
- **Alcance propuesto:** verificación de qué muestra exactamente el tab VENTAS (Opus lo declara en su acknowledgement); si muestra montos CRM como ventas → rewire mínimo a SaleRecord por vendedor + relabel.
- **Prohibido:** nuevo motor de agregación; mezclar CRM y SAG en una sola cifra.
- **Test:** el total "ventas del mes" del drawer coincide con la agregación SaleRecord del vendedor para el período etiquetado.
- **Estado:** OPEN

### DESK-CLIENT-01 · P1 · Desktop · `/comercial/clientes` drawer → tab CARTERA (y Cliente 360)
- **Actual:** cartera desde read model `customerReceivable` (`cliente-360-loader.ts:196`) sin exponer `truthStatus` de la autoridad canónica AR en la UI.
- **Esperado:** cifras de cartera con estado de verdad visible (patrón `truthStatus=CERTIFIED` del canonical-ar) y freshness ("Cartera: SAG al {fecha}").
- **Autoridad canónica:** `lib/comercial/frontline/canonical-ar-service.ts` (+ `receivable-truth-status`).
- **Alcance propuesto:** verificar equivalencia read-model↔canónico; exponer truthStatus/asOf en el tab. Si el read model no porta truthStatus, consumir el servicio canónico para el resumen del drawer.
- **Prohibido:** recalcular vencidos en React; nueva fuente.
- **Test:** cliente con cartera vencida muestra total+vencido idénticos al servicio canónico y el estado CERTIFIED/asOf visible.
- **Estado:** OPEN

### DESK-CLIENT-02 · P2 · Desktop · Cliente 360 → preferencias de producto/línea
- **Actual:** estado vacío honesto: "Pendiente de consolidar — Se requiere historial de SaleRecord con productLine" (`cliente-360-client.tsx:390`).
- **Esperado:** si SaleRecord ya porta `productLine` para el cliente, el bloque debe poblarse (UI no conectada ≠ dato inexistente); si genuinamente no hay historial con línea, el vacío actual es correcto.
- **Autoridad:** SaleRecord.productLine (línea canónica).
- **Alcance propuesto:** Opus declara en acknowledgement cuál de los dos casos es; si es "loader no conectado", conexión mínima.
- **Test:** cliente con ≥1 venta con línea canónica muestra distribución; cliente sin historial muestra el vacío honesto.
- **Estado:** OPEN

### DESK-CLIENT-03 · P2 · Desktop · Cliente 360 loader (higiene de query)
- **Actual:** `db.$queryRawUnsafe` con parámetros posicionales `$1/$2` (`cliente-360-loader.ts:275-283`) — **parametrizado, sin interpolación** → sin riesgo de inyección; solo higiene (preferir `$queryRaw` tagged template).
- **Esperado/Alcance:** ninguno dentro de las 72h (registrado para post-entrega). No es bloqueante.
- **Estado:** OPEN (diferido P2)

### DESK-INTEL-01 · P1 · Desktop · tabs INTELIGENCIA (Clientes y Vendedores)
- **Actual:** Clientes: `opportunities` deterministas calculadas en el loader (regla de 90 días, `cliente-360-loader.ts:455-460`) con badge en el tab — deterministas ✔; Vendedores: tab INTELIGENCIA presente en `DRAWER_TABS` (`vendedores-client.tsx:58-68`) con contenido por verificar contra hechos canónicos.
- **Esperado:** solo hechos/condiciones deterministas ya existentes; sin claves internas crudas; períodos etiquetados; sin acciones fuera del rol; sin falsos vacíos.
- **Alcance propuesto:** verificación puntual del render de ambos tabs (Opus declara contenido exacto en acknowledgement); correcciones mínimas de etiqueta/período si aplican.
- **Prohibido:** rediseñar los tabs; añadir scoring nuevo; copywriting que convierta HECHO en insight.
- **Test:** cada card del tab traza a un servicio/regla determinista citable; ninguna clave interna cruda visible; toda cifra temporal lleva su ventana.
- **Estado:** OPEN

### A.5 COBERTURA DE FUENTES SAG (uso real en lib/, excluyendo scripts de certificación)

| Fuente SAG | ¿Ingerida/usada? | Modelo/servicio canónico | ¿Clientes? | ¿Vendedores? | Gap de entrega |
|---|---:|---|---:|---:|---|
| vw_agentik_ventas | ✔ (13 files) | SaleRecord read model | ✔ (360 sales) | parcial | DESK-SELLER-05 (tab usa CRM como primario) |
| vw_agentik_recaudos | ✔ (27) | canonical-recaudos / collections | ✔ (collections) | por drawer: verificar | truthStatus no expuesto (DESK-CLIENT-01) |
| vw_agentik_cartera | ✔ (19) | canonical-ar-service | ✔ (read model) | ✔ | truthStatus no expuesto en UI |
| vw_agentik_clientes | ✔ (4) | CustomerProfile | ✔ | — | — |
| vw_agentik_vendedores | ⚠ (1) | seller-tercero-mapping | — | ✘ directorio usa slug de nombre | **DESK-SELLER-01/04** |
| vw_agentik_productos | ✔ (7) | ProductEntity / catálogo | parcial | — | DESK-CLIENT-02 (línea por conectar en 360) |
| vw_agentik_inventario | ✔ (12) | inventory-control snapshot | — | — | — (no requerido en 360) |
| vw_agentik_bodegas | **✘ (0)** | ninguno | ✘ | ✘ | pata de fallback de DESK-SELLER-04 |
| vw_agentik_compras | ✔ (5) | lastPurchaseSag / import-intelligence | — | — | — |
| vw_agentik_produccion | ⚠ (1) | sag-production-sync (conector) | ✘ | ✘ | fuera de alcance 72h (entitlement Producción) |
| pedidos (SAG directo) | ✔ | current-order-ingestion (cutover law, commit 2706764) | ✔ (SAG orders por NIT) | verificar en drawer | — |
| vw_agentik_anticipos_vendedores | ✘ (1 ref) | **SOURCE_MISSING** (B. BLOCKED, cadena CERT) | — | ✘ | declarado; NO pedir en 72h |
| Queries SAG directas existentes | ✔ | `consultaSagJson` en 12 adapters (catálogo, ventas de tienda, transfers, producción, órdenes CURRENT) | — | — | patrón ya establecido cuando la vista fue insuficiente |

**Regla de la ventana:** no se solicitan vistas SAG nuevas durante las 72h salvo campo contractual imposible desde las fuentes existentes (único candidato: bodega asignada del vendedor — decisión de Yumeko en DESK-SELLER-04).

## B. FASE B — SELLER APP (aceptación de producción)

### SELLER-PERF-01 · P0 · Seller · `/[orgSlug]/seller-app`
- **Actual (evidencia de código):** el server component `seller-app/page.tsx` encadena **≥7 awaits secuenciales** antes del primer render: `requireOrgAccess` (37) → `resolveCurrentSeller` (40) → `getSellerAttention` (48) → `customerProfile.findMany` (59) → `getSellerInactiveCustomers` (83) → `customerOrderRecord.groupBy` ×2 (92, 115) → bloque portafolio `Promise.all` (186) → `getSalesPortfolioWithdrawalItems` (206) → `listOrders` (272). Solo el bloque de portafolio está paralelizado. Si `getSellerAttention`/canonical-AR tocan SAG en vivo dentro del render, la latencia SAG entra en serie al TTFB. El reporte de 29,5 s es **consistente con esta estructura**; la reproducción exacta requiere runtime (esta sesión no tiene egreso a DB/SAG).
- **Esperado:** Login→Home y Home ≤ objetivo que fije Andrés (propuesto: p95 ≤ 4 s warm); las 3 corridas warm registradas en §B.2.
- **Alcance propuesto (mínimo, para Opus):** paralelizar los awaits independientes en un `Promise.all` por bloques + medir; si el dominante es una llamada SAG en vivo, moverla a dato cacheado/último sync con freshness visible (patrón ya usado en el resto del módulo). **Identificación exacta del stage dominante = primer paso obligatorio** (instrumentación temporal o logs de timing ya presentes en loaders).
- **Prohibido:** reescribir la Seller App; tocar la ley de cutover/ingesta; degradar verdad (nada de ocultar freshness para "ganar" velocidad).
- **Test:** 3 corridas warm cronometradas Login→Home, Home, Clientes, Crear pedido, Pedidos, Comisiones; p95 bajo el objetivo; cero errores de consola.
- **Estado:** OPEN (medición runtime pendiente — ver B.2)

### B.2 MATRIZ DE FLUJOS (protocolo listo — ejecución BLOCKED desde esta sesión)

Esta sesión no puede ejecutar los flujos de producción: sin acceso de red al deployment y con login prohibido para el QA agente. El protocolo queda listo para ejecutarse con Andrés (o vía extensión de Chrome con la app abierta y sesión iniciada por Andrés). Cada fila registrará: URL inicial → acción → URL final → contenido útil renderizado → tiempo de carga → errores de consola → veredicto.

| # | Flujo | URL inicial | Veredicto |
|---|---|---|---|
| 1 | Login | `/login` | BLOCKED (pendiente corrida runtime) |
| 2 | Home | `/[orgSlug]/seller-app` | BLOCKED |
| 3 | Clientes | `…/seller-app` → tab Clientes | BLOCKED |
| 4 | Cliente exacto (360) | drawer cliente | BLOCKED |
| 5 | Crear pedido | tab Nuevo pedido | BLOCKED |
| 6 | Lista de pedidos | tab Pedidos | BLOCKED |
| 7 | Pedido exacto | detalle pedido | BLOCKED |
| 8 | Comisiones | tab Finanzas/Comisiones | BLOCKED |
| 9 | Maleta | tab Portafolio | BLOCKED |
| 10 | Alertas | atención frontline | BLOCKED |
| 11 | Perfil | perfil vendedor | BLOCKED |
| 12 | Logout | — | BLOCKED |
| 13 | Confinamiento seller (intento cross-seller por URL) | manipulación de params | BLOCKED — test crítico: debe DENY |

Tiempos warm (3 corridas) a registrar para: Login→Home · Home · Clientes · Crear pedido · Pedidos · Comisiones.

## C. FASE C — MANAGER (visual QA) — EJECUTADA 13-ago

**Evidencia:** `/tmp/m2a-screenshots` (acceso de solo lectura otorgado). **Inventario: 27 archivos, 22 imágenes únicas** — 3 grupos de duplicados exactos por checksum: `06-client-from-alert = 07-manager-sphere = 09-header-manager-home` (una sola imagen del Home sirviendo 3 evidencias distintas), `05-seller-detail = 05-vendedores` (colección), `01-manager-home = home`. Dos corridas: antigua (~11:08, con skeletons/timeouts en `02-commercial-hub-timeout`, `03-ventas`, `04-clientes`) y actual (14:46–14:48, la evaluada).

**Evidencia REQUERIDA FALTANTE (no asumida):** detalle de vendedor + estado de Maleta (los dos archivos "seller-detail" muestran la COLECCIÓN); detalle de cliente funcionando (`client-detail.png` = colección; `diana-alzate.png` = pantalla en blanco); flujo alerta→cliente (`06-client-from-alert` duplica el Home); drawer/menú lateral.

**Cumple (observado):** Home — saludo con hora del día + fecha correcta ("Jueves, 13 de agosto"), card de Atención real con CTA exacto "Ver análisis", badge 1, solo módulo Comercial, esfera de vidrio Agentik bien posicionada ✔ · Hub — 7 superficies exactas sin Portafolio, grilla 3 col legible ✔ · freshness "Datos al {fecha}" presente en TODAS las pantallas ✔ · Importaciones — ley "Baja rotación (>8 meses)" correcta + estado SIN_FECHA honesto no clasificado como baja rotación ✔ · sin shell Desktop ✔ · sin headers duplicados ✔ · login brandeado ✔.

### Findings Fase C (solo fallas observadas directamente)

| ID | Sev | Screenshot | Defecto observado | Resultado esperado | Test mínimo de aceptación |
|---|---|---|---|---|---|
| MANAGER-VIS-01 | P0 | `store-detail.png` | Crash de runtime: "Something went wrong — Cannot read properties of null (reading 'get')" al abrir el detalle de tienda | Detalle de tienda renderiza StoreSnapshot sin error | Abrir las 4 tiendas desde la lista: 0 crashes, contenido útil visible |
| MANAGER-VIS-02 | P0 | `diana-alzate.png` | Detalle de cliente en blanco (solo header "Clientes" + esfera; cuerpo vacío) — destino del CTA de Atención muerto | El cliente de la alerta abre con sus hechos (identidad, cartera CERTIFIED, recencia) | Tap "Ver análisis" en el Home → pantalla del cliente con ≥1 hecho renderizado |
| MANAGER-VIS-03 | P0 | `tiendas.png`, `02-tiendas-collection.png` | Las 4 tiendas muestran "0 refs · 0 agotadas" (todas en cero, dos corridas distintas) con estado verde "operativa", mientras Inventario reporta 3.341 refs — cero falso renderizado como hecho | Por tienda: refs/agotadas reales del pipeline certificado, o retirar la línea (sin hecho → sin componente) | ≥1 tienda con refs > 0 coherentes con el snapshot de inventario, o línea ausente con estado honesto |
| MANAGER-VIS-04 | P0 | `pedidos.png`, `09-pedidos-canonical.png` | Card "Ticket promedio $733 K" — métrica REMOVIDA de V1 por contrato (sin dueño canónico; corrección UX-01.1: cero cálculo en presentación) | Card eliminada hasta que exista contrato de métrica canónico | "Ticket" no aparece en ninguna superficie Manager |
| MANAGER-VIS-05 | P1 | `ventas/clientes/pedidos/vendedores.png` | Formato numérico colombiano inconsistente y ambiguo: "$107.0 M"/"$52.0 M"/"$178.8 M" (punto decimal US) conviven con "9.860"/"33.855"/"$7.730 M" (punto de miles) — "$7.730 M" es ilegible (¿7,73 M o 7.730 M?) | Una sola convención es-CO: punto = miles, coma = decimal ("$107,0 M", "$7,73 M", "9.860") | Barrido de las 8 pantallas: cero cifras con punto decimal US; "$7.730 M" resuelto sin ambigüedad |
| MANAGER-VIS-06 | P1 | `importaciones.png` | Clave interna cruda `SIN_FECHA_DE_ACTIVIDAD_IMPORTACION` visible en la card (además de tildes ausentes: "importacion", "rotacion") | Solo la etiqueta legible ("Sin fecha de actividad de importación"); la clave vive en el DTO, no en la UI | Cero identificadores SNAKE_CASE visibles en Manager |
| MANAGER-VIS-07 | P1 | `vendedores.png` | "Administrator — 3 clientes · 17 pedidos · $8.9 M" listado como vendedor del EQUIPO ACTIVO — identidad interna/de sistema en lista ejecutiva | Solo vendedores canónicos (tercero certificado) en el equipo | "Administrator" (y cualquier usuario de sistema) ausente de la lista |
| MANAGER-VIS-08 | P1 | `clientes.png` | "CONSUMIDOR FINAL" como destacado "Mayor cartera vencida $1.014 M" (entidad genérica POS presentada como cliente ejecutivo); "Clientes activos 33.855" con olor a base total, no a activos-90d canónico | Entidades genéricas excluidas de destacados; "activos" solo con la definición canónica (o relabel "Clientes totales") | CONSUMIDOR FINAL fuera de destacados; cifra de activos = definición canónica verificada |
| MANAGER-VIS-09 | P1 | duplicados (checksums) | Evidencia faltante entregada como duplicados: detalle de vendedor+Maleta, detalle de cliente y alerta→cliente sin captura real | Screenshot real por cada superficie del checklist | 3 capturas nuevas: seller detail (con Maleta), client detail con datos, flujo alerta→cliente |
| MANAGER-VIS-10 | P2 | `commercial-hub.png` | Ley de badge no aplicada en el hub: Home marca 1 Atención (Clientes) pero la card Clientes del hub no lleva badge | Badge = conteo real de Atención sin resolver por subdominio exacto | Con 1 atención de Clientes activa, la card Clientes muestra "1" |
| MANAGER-VIS-11 | P2 | `vendedores.png`, varias | Puntos de estado verde/naranja sin leyenda ni semántica declarada; tipografía monoespaciada en datos (desvío del ADN Inter aprobado) | Semántica de estado visible o accesible; tipografía del sistema visual aprobado | Leyenda/tooltip presente; fuente del sistema en cifras |

**Preguntas a Andrés (no findings):** (1) el saludo dice "Arnold" — ¿es el displayName real de la cuenta de prueba o identidad equivocada?; (2) ¿"BODEGA CENTRO/SANDIEGO/CALDAS" son nombres comerciales reales de las tiendas o se está listando la entidad bodega cruda de SAG?

**Nota Fase B (colateral, no Fase C):** `08-seller-app.png` muestra la esfera del Seller App TAPANDO el badge "Crítica" de la tercera card de atención — se registrará en Fase B cuando corra.

### Verificación final de evidencias (13-ago 15:30–15:32 · batch `final-*`/`gap*`)

**PASS: 1** — MANAGER-VIS-01 (detalle de tienda ya no crashea; declara "Fuente: No disponible"). **FAIL: 10** — VIS-02 (sin evidencia nueva de detalle de cliente; el flujo Home→alerta Diana→detalle sigue sin captura funcionando), VIS-03 (tiendas siguen con ceros falsos en colección), VIS-04 (ticket promedio sigue), VIS-05 (formato US sigue), VIS-06 (clave cruda sigue), VIS-07 (Administrator sigue), VIS-08 (CONSUMIDOR FINAL sigue), VIS-09 (sin captura de vendedor Luis Orlando abierto ni Maleta con vacío factual), VIS-10 (badge del hub sigue ausente), VIS-11 (leyenda/tipografía sin cambio).

**Reglas nuevas del arquitecto — NO VERIFICABLES con la evidencia actual** (los detalles de cliente/vendedor no tienen captura funcional): cliente sin vendedor → "Sin vendedor asignado" (no "—"); vendedor sin código SAG → campo ausente; vendedor no viajero → sin sección Maleta. Quedan como criterios de aceptación de VIS-02/VIS-09.

**Observación de verdad (para Opus/Yumeko, sin ID nuevo):** entre las corridas 14:47 y 15:31 "Baja rotación (>8 meses)" pasó de **253 → 16** y "Recompra inmediata" de **91 → 288** con el mismo label y la misma fecha de datos — un delta así en 45 min exige explicación (¿cambio de definición mientras la ley de 8 meses calendario está congelada?) antes de cualquier PASS de Importaciones.

**VEREDICTO VISUAL: `MANAGER_VISUAL_FIXES_REQUIRED`** — 4 P0 + 5 P1 + 2 P2. Ningún ítem de runtime se marca PASS por screenshot (regla respetada): lo que se ve correcto queda anotado como "cumple (observado)" y se confirmará en runtime.

## D. MATRIZ DE ACEPTACIÓN DE ENTREGA

| ID | Sev | Owner | Ack Opus | Archivo de implementación | Test | Verificación Fable | Estado final |
|---|---|---|---|---|---|---|---|
| DESK-SELLER-01 | P0 | Opus | — | — | — | — | OPEN |
| DESK-SELLER-02 | P0 | Opus | — | — | — | — | OPEN |
| DESK-SELLER-04 | P0 | Opus (+gate Yumeko en pata bodega) | — | — | — | — | OPEN |
| SELLER-PERF-01 | P0 | Opus (medición: Andrés+Fable) | — | — | — | — | OPEN |
| DESK-NAV-01 | P1 | Opus | — | — | — | — | OPEN |
| DESK-SELLER-03 | P1 | Opus | — | — | — | — | OPEN |
| DESK-SELLER-05 | P1 | Opus | — | — | — | — | OPEN |
| DESK-CLIENT-01 | P1 | Opus | — | — | — | — | OPEN |
| DESK-INTEL-01 | P1 | Opus | — | — | — | — | OPEN |
| DESK-CLIENT-02 | P2 | Opus | — | — | — | — | OPEN (diferible) |
| DESK-CLIENT-03 | P2 | — | — | — | — | — | OPEN (diferido post-entrega) |
| B.2 flujos 1–13 | P0 | Andrés+Fable (runtime) | n/a | n/a | protocolo B.2 | — | BLOCKED |
| MANAGER-VIS-01 | P0 | Opus | — | — | — | PASS · gap1-store-detail.png 15:30 — sin crash; fuente "No disponible" declarada | PASS |
| MANAGER-VIS-02 | P0 | Opus | — | — | — | FAIL · sin evidencia nueva; última captura (diana-alzate.png) en blanco | OPEN (FAIL verificado) |
| MANAGER-VIS-03 | P0 | Opus | — | — | — | FAIL · final-tiendas.png 15:31 — 4 tiendas siguen "0 refs · 0 agotadas" | OPEN (FAIL verificado) |
| MANAGER-VIS-04 | P0 | Opus | — | — | — | FAIL · final-pedidos.png 15:31 — "Ticket promedio $733 K" sigue visible | OPEN (FAIL verificado) |
| MANAGER-VIS-05 | P1 | Opus | — | — | — | FAIL · final-ventas/vendedores/clientes — "$107.0 M"/"$178.8 M" (punto decimal US) sin corregir | OPEN (FAIL verificado) |
| MANAGER-VIS-06 | P1 | Opus | — | — | — | FAIL · final/gap2/gap3-importaciones — clave SIN_FECHA_DE_ACTIVIDAD_IMPORTACION sigue en UI | OPEN (FAIL verificado) |
| MANAGER-VIS-07 | P1 | Opus | — | — | — | FAIL · final-vendedores.png — "Administrator" sigue en EQUIPO ACTIVO ($8.9 M) | OPEN (FAIL verificado) |
| MANAGER-VIS-08 | P1 | Opus | — | — | — | FAIL · final-clientes.png — CONSUMIDOR FINAL sigue destacado; "activos 33.855" sin relabel | OPEN (FAIL verificado) |
| MANAGER-VIS-09 | P1 | Opus (capturas) | — | — | — | FAIL · batch final sin captura de seller detail/Maleta ni cliente con datos | OPEN (FAIL verificado) |
| MANAGER-VIS-10 | P2 | Opus | — | — | — | FAIL · final-hub.png — card Clientes sin badge con Atención=1 activa | OPEN (FAIL verificado) |
| MANAGER-VIS-11 | P2 | Opus | — | — | — | FAIL · final-vendedores.png — puntos sin leyenda; tipografía mono persiste | OPEN (FAIL verificado) |

## E. ORDEN DE EJECUCIÓN PARA OPUS

1. DESK-SELLER-01 (identidad canónica — desbloquea 02 y 04)
2. DESK-SELLER-02 (comisiones con truthState)
3. DESK-SELLER-04 (código SAG con cadena de fallback certificada)
4. SELLER-PERF-01 (identificar stage dominante → paralelizar mínimo)
5. DESK-NAV-01 (rail viewport)
6. DESK-CLIENT-01 (truthStatus de cartera visible)
7. DESK-SELLER-05 (ventas canónicas vs CRM en el drawer)
8. DESK-SELLER-03 (metas: estado factual)
9. DESK-INTEL-01 (verificación + correcciones mínimas)
10. DESK-CLIENT-02 (si es "loader no conectado")

Diferidos explícitos: DESK-CLIENT-03 (higiene post-entrega) · vw_agentik_produccion (entitlement) · anticipos (SOURCE_MISSING, cadena CERT) · todo trabajo Copilot (auditoría cerrada; prohibido en la ventana).

## F. MATRIZ DE ACKNOWLEDGEMENT (la llena Opus antes de tocar código)

| Finding ID | Trabajo existente reutilizado | Archivos a cambiar | Test previsto | ¿Aceptado sin reinterpretación? |
|---|---|---|---|---:|
| — | — | — | — | — |

Reglas para Opus: no renombrar IDs · no sustituir el comportamiento esperado por otro diseño · no repetir la investigación de Fable · no implementar ítems ausentes de este documento · no ampliar un fix sin reportar blocker · no auto-aprobarse visualmente · al terminar cada finding: `IMPLEMENTED_UNVERIFIED` (solo Fable otorga `PASS`).
