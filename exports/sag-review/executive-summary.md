# Requerimientos de Información para Integración Operacional

**Agentik × SAG**

> Versión 2.6.0 &nbsp;|&nbsp; 2026-05-31 &nbsp;|&nbsp; Externo — Documento técnico-funcional

---

## 1. Objetivo de la Integración

Para soportar procesos de análisis, seguimiento y gestión definidos por la organización, se requiere acceso de consulta (solo lectura) a información operacional almacenada en SAG.

El objetivo de esta integración es consolidar información de ventas, cartera, inventario, compras, recaudos, pagos y movimientos bancarios en una capa de visualización centralizada, sin modificar ningún dato en SAG ni alterar los procesos operativos existentes.

Agentik opera como un sistema de consulta y presentación. SAG permanece como el sistema de registro (sistema de origen) en todos los casos. No se requiere ninguna escritura ni modificación de datos desde Agentik hacia SAG.

---

## 2. Alcance Actual de la Integración

La integración cubre los siguientes dominios de información, en orden de prioridad:

— Ventas: documentos de venta, líneas de detalle, valores, descuentos y condiciones comerciales.

— Pagos: registros de pago asociados a documentos de cartera.

— Cartera: documentos pendientes de cobro por cliente.

— Recaudos: ingresos registrados en el sistema de cartera.

— Bancos: movimientos del extracto bancario.

— Inventario: saldos de inventario por referencia, talla y bodega.

— Compras: órdenes de compra y estado de recepciones.

— Productos: maestro de artículos con atributos comerciales y operativos.

Todos los dominios operan en modo de solo lectura. Agentik consume la información pero no la modifica en ningún caso.

---

## 3. Método de Acceso Propuesto

Como propuesta inicial se plantea exponer los dominios de información mediante vistas de solo lectura con nomenclatura estandarizada. No obstante, el mecanismo definitivo podrá definirse conjuntamente con el equipo SAG según las alternativas técnicas disponibles.

Método propuesto: vistas de base de datos de solo lectura.

Frecuencia de actualización: diaria al cierre del día (EOD) para la mayoría de dominios.

Acceso: SELECT únicamente. Sin INSERT, UPDATE ni DELETE desde Agentik.

Filtros sugeridos: por empresa y por rango de fechas para optimizar el volumen de datos.

Agentik está abierto a implementar la modalidad que SAG recomiende: acceso directo a vistas, exportación programada de archivos, o endpoints de consulta específicos según disponibilidad técnica.

Durante la reunión técnica realizada en mayo de 2026 se discutieron diferentes alternativas de integración y mecanismos de acceso a la información. Este documento resume los requerimientos de información identificados durante el análisis funcional y técnico realizado para la integración.

De acuerdo con la recomendación del equipo SAG, los procesos de consulta y sincronización deberán programarse preferiblemente en horarios de baja operación, idealmente durante la noche, con el fin de minimizar cualquier impacto sobre el funcionamiento normal del sistema.

---

## 4. Beneficios Operativos

Para la organización:

— Visibilidad centralizada de ventas, cartera e inventario en tiempo cercano al real.

— Reducción del tiempo dedicado a la construcción manual de informes.

— Alertas operacionales basadas en umbrales definidos por el negocio.

— Trazabilidad entre documentos: venta, factura, recaudo, pago y extracto bancario.

Para SAG:

— Sin impacto en el rendimiento operacional: acceso de solo lectura.

— Sin modificaciones al esquema de base de datos existente.

— Vistas creadas con filtros de partición para optimizar el acceso.

— Documentación consolidada de la información identificada durante el análisis previo a la validación técnica.

---

## 5. Dominios de Información Requeridos

A continuación se listan los ocho dominios de información identificados para la integración, agrupados según la prioridad funcional definida durante el análisis:

FASE 1 — Información Financiera y Comercial

1. Información de Ventas      — Documentos de venta por línea de detalle

2. Información de Pagos       — Pagos asociados a documentos de cartera

3. Información de Cartera     — Documentos pendientes por cliente

4. Información de Recaudos    — Ingresos registrados en sistema de cartera

5. Información Bancaria       — Movimientos del extracto bancario

FASE 2 — Información Operacional

6. Información de Inventario  — Saldos por referencia, talla y bodega

7. Información de Compras     — Órdenes de compra y recepciones

8. Información de Productos   — Maestro de artículos con atributos operativos

Los nombres técnicos, mecanismos de acceso y nomenclatura definitiva serán definidos conjuntamente durante la validación técnica.

El detalle completo de campos por dominio se encuentra en el documento adjunto 'Solicitud Formal de Información'.

---

## 6. Siguiente Paso Propuesto

Agentik propone una reunión técnica de validación con el equipo de SAG para:

— Confirmar la disponibilidad de cada campo identificado durante el análisis en las tablas fuente.

— Definir el mecanismo de acceso más conveniente para SAG.

— Resolver las preguntas abiertas documentadas en el registro adjunto.

— Definir conjuntamente el plan de implementación y la secuencia de habilitación de los dominios priorizados.

El listado consolidado de preguntas pendientes se incluye en el documento 'Registro de Preguntas Abiertas' adjunto a este paquete.

Nuestro objetivo es construir una integración sostenible, simple de mantener y alineada con las mejores prácticas recomendadas por el equipo SAG. Estamos abiertos a ajustar el enfoque técnico según sus recomendaciones.

---

*Preparado por: Equipo de Integraciones — Agentik*