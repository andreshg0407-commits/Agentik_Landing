# Borradores de Correo — SAG Executive Pack

> Seleccionar el borrador según el destinatario de SAG.

| Tipo de Destinatario | Versión Recomendada |
|---|---|
| Técnico (DBA, TI) | Versión TI |
| Mixto (técnico + operativo) | Versión Funcional |
| Dirección (gerencia) | Versión Gerencial |

---

## Correo — TI / DBA — SAG

**Asunto:** Validación de Fuentes de Información para Integración Operacional — Agentik × SAG
**Para:** [Jefe de TI / DBA — SAG]
**CC:** [Analista Funcional — SAG], [Gerente de Proyecto — Agentik]

---

```
Estimado equipo de Tecnología SAG,

Agradecemos el tiempo dedicado a la reunión técnica de mayo de 2026 y la disposición confirmada para apoyar esta integración.

Con base en lo discutido durante la reunión técnica, compartimos el resultado de nuestro análisis interno de requerimientos de información con el objetivo de validar conjuntamente las fuentes de datos más adecuadas para la integración entre Agentik y SAG.

OBJETIVO DE LA SOLICITUD

Para soportar procesos de análisis, seguimiento y gestión definidos por la organización, se requiere acceso de consulta (solo lectura) a información operacional registrada en SAG. En ningún caso Agentik realizará operaciones de escritura (INSERT, UPDATE, DELETE) sobre datos de SAG.

DOMINIOS DE INFORMACIÓN REQUERIDOS

Durante el análisis funcional se identificaron los siguientes ocho dominios de información relevantes para la integración. Como propuesta inicial se plantea exponerlos mediante vistas de solo lectura, aunque quedamos abiertos a la recomendación técnica que el equipo SAG considere más apropiada.

  1. vw_agentik_ventas       — Documentos de venta por línea de detalle
  2. vw_agentik_pagos        — Pagos asociados a documentos de cartera
  3. vw_agentik_cartera      — Documentos pendientes de cobro por cliente
  4. vw_agentik_recaudos     — Ingresos registrados en el sistema de cartera
  5. vw_agentik_bancos       — Movimientos del extracto bancario
  6. vw_agentik_inventario   — Saldos por referencia, talla y bodega
  7. vw_agentik_compras      — Órdenes de compra y recepciones
  8. vw_agentik_productos    — Maestro de artículos con atributos operativos

La especificación técnica detallada de campos requeridos y opcionales para cada vista se encuentra en el documento adjunto "Solicitud Formal de Vistas de Base de Datos".

DOCUMENTACIÓN ADJUNTA

El propósito de la documentación adjunta es facilitar la revisión técnica y reducir iteraciones posteriores, permitiendo validar desde el inicio qué información ya se encuentra disponible, qué información requiere ajustes y cuáles son las mejores alternativas de integración.

Se adjuntan tres documentos:
  • Resumen Ejecutivo — Contexto general de la integración.
  • Solicitud Formal de Vistas — Especificación técnica campo a campo.
  • Registro de Preguntas Abiertas — Consultas técnicas pendientes de validación.

PRÓXIMOS PASOS

Como siguiente paso proponemos una sesión conjunta de validación funcional y técnica para revisar:
  1. Disponibilidad de cada campo solicitado en las tablas fuente.
  2. Mecanismo de acceso más conveniente para SAG (vistas directas, conexión por VPN, etc.).
  3. Resolución de las preguntas técnicas incluidas en el registro adjunto.
  4. Cronograma de creación de las primeras vistas prioritarias.

Nuestro objetivo es construir una integración sostenible, simple de mantener y alineada con las mejores prácticas recomendadas por el equipo SAG. Estamos completamente abiertos a ajustar el enfoque técnico según sus recomendaciones.

Agradecemos su colaboración.

Atentamente,
Equipo de Integraciones — Agentik
```

**Adjuntos:**

- [✓] **Agentik × SAG — Resumen Ejecutivo de Integración** (PDF)
  Descripción del objetivo, alcance, método de acceso, beneficios y dominios requeridos.
- [✓] **Agentik × SAG — Solicitud Formal de Vistas de Base de Datos** (PDF)
  Especificación técnica de las 8 vistas requeridas con campos, filtros y frecuencia.
- [✓] **Agentik × SAG — Registro de Preguntas Abiertas** (PDF)
  Listado de preguntas técnicas y funcionales pendientes de respuesta por dominio.

> **Notas internas:**
> - Reemplazar '[Jefe de TI / DBA — SAG]' con el nombre y correo real del contacto de SAG.
> - Confirmar la versión del documento antes de enviar (actualmente v2.6.0).
> - Adjuntar los tres PDFs generados desde los documentos del Executive Pack.

---

## Correo — Analista Funcional — SAG

**Asunto:** Solicitud de Información Operacional — Integración Agentik × SAG
**Para:** [Analista Funcional / Coordinador Operativo — SAG]
**CC:** [Jefe de TI — SAG], [Gerente de Proyecto — Agentik]

---

```
Estimado(a) [Nombre],

Junto con saludar, enviamos la solicitud formal de acceso a información operacional del sistema SAG para la integración con Agentik.

RESUMEN DE LA SOLICITUD

Agentik requiere acceso de consulta (solo lectura) a la siguiente información:

  • Ventas: documentos de venta con detalle por producto, cliente y condiciones comerciales.
  • Cartera: documentos pendientes de cobro y estado de vencimiento por cliente.
  • Pagos y Recaudos: registros de pago e ingresos de cartera.
  • Bancos: movimientos del extracto bancario.
  • Inventario: saldos por referencia, talla y bodega.
  • Compras: órdenes de compra y recepciones de mercancía.
  • Productos: maestro de artículos con atributos comerciales.

El objetivo es consolidar esta información en reportes de gestión que faciliten el seguimiento operativo de la organización. En ningún caso Agentik modificará datos en SAG.

PREGUNTAS FUNCIONALES PENDIENTES

Incluimos un registro de preguntas funcionales que requieren su validación, relacionadas con la disponibilidad de ciertos campos y la forma en que SAG registra la información. Este registro está incluido en el documento adjunto.

Le agradecemos coordinar con el equipo de TI de SAG la revisión técnica correspondiente.

Quedamos atentos a cualquier consulta o aclaración.

Atentamente,
Equipo de Integraciones — Agentik
```

**Adjuntos:**

- [✓] **Agentik × SAG — Resumen Ejecutivo de Integración** (PDF)
  Descripción del objetivo, alcance, método de acceso, beneficios y dominios requeridos.
- [✓] **Agentik × SAG — Solicitud Formal de Vistas de Base de Datos** (PDF)
  Especificación técnica de las 8 vistas requeridas con campos, filtros y frecuencia.
- [✓] **Agentik × SAG — Registro de Preguntas Abiertas** (PDF)
  Listado de preguntas técnicas y funcionales pendientes de respuesta por dominio.

> **Notas internas:**
> - Esta variante es más adecuada para enviar al analista funcional antes de la reunión técnica.
> - El tono es menos técnico y hace énfasis en el propósito operacional, no en la arquitectura.

---

## Correo — Gerencia — SAG

**Asunto:** Integración Agentik × SAG — Documentación Formal de Requerimientos
**Para:** [Gerente de TI / Director Técnico — SAG]
**CC:** [Jefe de TI — SAG], [Director de Proyecto — Agentik]

---

```
Estimado(a) [Nombre],

En seguimiento a las conversaciones sostenidas con el equipo de SAG, Agentik formaliza por este medio la solicitud de acceso de consulta a información operacional del sistema SAG.

La integración propuesta tiene como objetivo consolidar en la plataforma Agentik los datos de ventas, cartera, pagos, bancos, inventario, compras y productos de la organización, sin generar impacto en los procesos operativos ni en el rendimiento del sistema SAG.

El método propuesto es la creación de ocho vistas de base de datos de solo lectura por parte del equipo técnico de SAG, con nomenclatura vw_agentik_[dominio], tal como fue discutido en la reunión de mayo de 2026.

Se adjunta la documentación técnica y funcional completa que incluye:
  • Resumen ejecutivo de la integración.
  • Especificación detallada de las ocho vistas solicitadas.
  • Registro de preguntas técnicas pendientes de validación.

El equipo de integraciones de Agentik está disponible para una reunión de alineación con el equipo técnico de SAG en la fecha que sea conveniente.

Agradecemos el apoyo brindado.

Atentamente,
[Nombre del Director de Proyecto — Agentik]
Agentik
```

**Adjuntos:**

- [✓] **Agentik × SAG — Resumen Ejecutivo de Integración** (PDF)
  Descripción del objetivo, alcance, método de acceso, beneficios y dominios requeridos.
- [✓] **Agentik × SAG — Solicitud Formal de Vistas de Base de Datos** (PDF)
  Especificación técnica de las 8 vistas requeridas con campos, filtros y frecuencia.
- [✓] **Agentik × SAG — Registro de Preguntas Abiertas** (PDF)
  Listado de preguntas técnicas y funcionales pendientes de respuesta por dominio.

> **Notas internas:**
> - Esta variante es para comunicación a nivel gerencial. Es breve y hace énfasis en el acuerdo previo.
> - Reemplazar el firmante con el nombre real del director o gerente de Agentik.

---
