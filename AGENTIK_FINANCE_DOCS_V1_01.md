# AGENTIK-FINANCE-DOCS-V1-01
## Centro Documental Financiero — Ingesta, Lectura IA y Trazabilidad Operacional

**Sprint:** AGENTIK-FINANCE-DOCS-V1-01
**Archivos creados/modificados:**
- `app/(app)/[orgSlug]/finanzas/documentos/documentos-client.tsx` (nuevo — client component)
- `app/(app)/[orgSlug]/finanzas/documentos/page.tsx` (actualizado — server wrapper)
**Backend constraint:** NO Prisma, NO APIs, NO SAG changes. Todo mock/frontend.
**TypeScript baseline:** 160 errores (mantenido exacto).

---

## Identidad del módulo

**Centro Documental Financiero** no es un repositorio de archivos.
Es el motor documental vivo de Finanzas: recibe, interpreta, clasifica y convierte documentos en entidades operacionales.

Ciclo del documento:
```
Cargar → Lectura IA → Campos detectados → Aprobación → Listo para conciliación
```

Downstream: Conciliación Inteligente · Tesorería Operativa · Cierre Financiero · Planeación Financiera

---

## Arquitectura de componentes

```
page.tsx (Server Component)
  └── requireOrgAccess(orgSlug)
  └── <DocumentosClient orgSlug={orgSlug} />

DocumentosClient ("use client")
  ├── Estado: ctx (DrawerCtx | null)
  ├── Sección 1: OperationalWorkspaceHeader + Status Strip (5 KPIs)
  ├── Sección 2: Bloque de ingesta — zona de carga + acciones
  ├── Sección 3: Flujo documental IA — 5 pasos con contadores
  ├── Sección 4: Documentos recientes — tabla operacional (10 docs)
  ├── Sección 5: Clasificación inteligente — grid 5×2 por tipo
  ├── Sección 6: Entidades listas para usar — chips interactivos
  ├── Sección 7: Bandeja de revisión — campos con baja confianza
  ├── Sección 8: Listos para conciliación — docs aprobados + CTA link real
  ├── Sección 9: Trazabilidad documental (CollapsibleSection, defaultOpen=false)
  ├── Sección 10: Paquetes documentales (CollapsibleSection, defaultOpen=false)
  └── OperationalSideDrawer — 4 variantes (document, review_item, entity, upload)
```

---

## Estados de documento IA

| Estado | Badge CSS | Significado |
|--------|-----------|-------------|
| `pendiente` | `ag-op-status--stale` | En cola · sin lectura |
| `leyendo` | `ag-op-status--info` | Motor procesando |
| `estructura_detectada` | `ag-op-status--info` | Campos encontrados · pendiente aprobación |
| `requiere_revision` | `ag-op-status--warning` | Baja confianza · decisión humana |
| `aprobado` | `ag-op-status--ok` | Listo para uso operacional |
| `listo_conciliacion` | `ag-op-status--ok` | Enviable a Conciliación Inteligente |
| `enviado_cierre` | `ag-op-status--ok` | Integrado a Cierre Financiero |
| `error_documental` | `ag-op-status--critical` | Error de lectura · requiere corrección |

---

## Drawers (4 variantes)

| Tipo | Trigger | Contenido |
|------|---------|-----------|
| `upload` | Click zona de carga | Formatos · destinos operacionales · acciones |
| `document` | Click fila de documento | Campos detectados + confianza · timeline · IA recomendación · acciones |
| `review_item` | Click fila bandeja | Valor detectado · barra confianza · sugerencia IA · acciones humanas |
| `entity` | Click chip entidad | Cantidad · tipo · uso operacional · envío a conciliación |

---

## Mock data — Documentos V1

| ID | Tipo | Estado | Destino |
|----|------|--------|---------|
| D001 | Extracto bancario | Listo para conciliación | Conciliación Inteligente |
| D002 | Factura de compra | Aprobado | Cierre Financiero |
| D003 | Documento DIAN | Requiere revisión | Pendiente |
| D004 | Soporte de pago | Estructura detectada | Conciliación Inteligente |
| D005 | Extracto bancario | Aprobado | Conciliación Inteligente |
| D006 | Orden | Pendiente | — |
| D007 | Nómina | Aprobado | Cierre Financiero |
| D008 | Impuesto | Error documental | — |
| D009 | Comprobante | Listo para conciliación | Conciliación Inteligente |
| D010 | Contrato | Estructura detectada | Centro Documental |

---

## Conexión con Conciliación Inteligente

- Sección "Listos para conciliación": CTA real con `<Link href="/{orgSlug}/finanzas/conciliacion">`
- Drawer de documento (`listo_conciliacion`): botón "Enviar a Conciliación Inteligente →"
- Bandeja de revisión: footer indica umbral automático ≥85% → conciliación
- Entidades detectadas: "Enviar a Conciliación →" (PassiveAction V1)

---

## Entidades detectadas — categorías

| Entidad | Cantidad | Tipo | Lista |
|---------|----------|------|-------|
| Clientes | 87 | Identidad | ✅ |
| Fechas | 198 | Temporal | ✅ |
| Valores monetarios | 142 | Financiero | ✅ |
| Referencias | 64 | Trazabilidad | ✅ |
| Facturas | 18 | Documento | ✅ |
| NITs | 23 | Identidad | ✅ |
| Impuestos | 31 | Financiero | ✅ |
| Proveedores | 14 | Identidad | ✅ |
| Cuentas bancarias | 9 | Financiero | ✅ |
| Órdenes | 7 | Operacional | ⏳ |
| Centros de costo | 7 | Contable | ⏳ |

---

## Checklist de validación final

| Criterio | Estado |
|----------|--------|
| TypeScript baseline 160 intacto | ✅ |
| Navegación Finanzas → Centro Documental | ✅ (ya existía en module-nav-config.ts) |
| Cero inglés visual al usuario | ✅ |
| Botones con affordance real | ✅ (CTA link real a /finanzas/conciliacion) |
| Centro Documental conectado a Conciliación | ✅ (link en sección 8 + drawers) |
| No dashboard genérico | ✅ (flujo documental · entidades · bandeja) |
| Identidad visual coherente con Tesorería/Conciliación | ✅ (mismos primitivos ag-* + tokens) |
| T.mono para todos los datos operacionales | ✅ |
| ag-op-table/ag-op-row para tablas | ✅ |
| CollapsibleSection para secciones secundarias | ✅ (Trazabilidad + Paquetes) |
| OperationalWorkspaceHeader al inicio | ✅ |

---

## Próximos pasos V2

| Área | Tarea | Prioridad |
|------|-------|-----------|
| Backend | `POST /api/orgs/[orgSlug]/documentos/upload` | Alta |
| Backend | `GET /api/orgs/[orgSlug]/documentos` | Alta |
| Motor IA | OCR + extracción de campos con embeddings | Alta |
| Clasificación | Modelo de clasificación por tipo documental | Alta |
| Conciliación | `POST /api/orgs/[orgSlug]/documentos/[id]/send-to-recon` | Media |
| Trazabilidad | Tabla `DocumentActivity` en Prisma | Media |
| DIAN | Validación XML schema electrónico | Media |
| Exportación | PDF Puppeteer · ZIP de paquete documental | Media |
