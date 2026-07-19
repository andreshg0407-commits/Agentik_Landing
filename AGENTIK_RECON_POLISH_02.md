# AGENTIK-FINANCE-RECON-POLISH-02
## Conciliación Inteligente — Flujo Vivo, Drawer Premium y Cierre V1

**Sprint:** AGENTIK-FINANCE-RECON-POLISH-02
**Archivo principal:** `app/(app)/[orgSlug]/finanzas/conciliacion/conciliacion-client.tsx`
**Backend constraint:** NO Prisma, NO APIs, NO SAG changes. Todo mock/frontend.
**TypeScript baseline:** 160 errores (mantenido exacto).

---

## Cambios aplicados

### 1. Narrativa limpiada

| Antes | Después |
|-------|---------|
| "Pipeline de conciliación inteligente" | "Universos conectados · Flujo de conciliación" |
| "Extractos y movimientos bancarios" (Paso 03) | "Contraparte operacional del cruce" |
| "Automatizaciones de conciliación" | "Reglas automáticas de conciliación" |
| "Automatización · SI / ENTONCES" (col header) | "Regla automática · SI / ENTONCES" |
| "+ Nueva automatización de conciliación" | "+ Nueva regla automática" |
| "COINCIDENCIAS IA" (status strip) | "CONFIANZA IA" |
| "Excepciones" (historial col header) | "Problemas" |

Términos eliminados del texto visible al usuario:
- "matching" — reemplazado siempre por "conciliar / conciliación"
- "workspace" — eliminado del texto de usuario
- "pipeline" — reemplazado por "flujo"
- "source / source_selector" — reemplazados por "Origen de datos / Fuente de validación"
- "exceptions" — reemplazado por "Problemas detectados"

---

### 2. Flujo vivo — conectores entre paneles

Los conectores 01→02 y 02→03 pasaron de un `→` estático a conectores vivos con:

**Conector 01→02:**
```
2.847 reg.
    ↓
enviados al motor
```
Color: `C.blueDark`. Línea degradada de `C.blueBorder` a `C.blueDark`.

**Conector 02→03:**
```
4 compatibles
    ↓
1 conflicto
```
Valores derivados dinámicamente de `MATCH_FIELDS`. Color verde para compatibles, ámbar para conflicto.

Grid ajustado: `"1fr 76px 1fr 76px 1fr"` (antes `40px`).

---

### 3. Motor IA — presencia visual aumentada

| Aspecto | Antes | Después |
|---------|-------|---------|
| Background | `C.white` | `C.blueLight` |
| Border | `1px solid C.blueBorder` | `1.5px solid C.blueBorder` |
| Box shadow | `E.sm` | `E.sm + ring 3px C.blueBorder·40` |

El Motor IA se distingue visualmente como el cerebro del módulo.

---

### 4. Tabla de campos comparados

Headers renombrados:
- "Origen operacional (SAG)" → `Origen (SAG)`
- "Fuente de validación (Bancolombia)" → `Validación (BC)`

Grid ajustado: `"1fr 88px 1fr"`.

IA insight: ahora aplica a **todas las filas** (antes solo partial/conflict) usando `mf.interpretation`.

---

### 5. Problemas detectados

La sección ya estaba nombrada correctamente: "Problemas detectados por conciliación".

**Nuevo campo `action: string`** agregado a cada `EXCEPTION`:
- E001: "Crear soporte en Centro Documental"
- E002: "Confirmar registro original y anular duplicado"
- E003: "Aplicar nota de crédito o ajuste contable"
- E004: "Cargar soporte documental en Centro Documental"
- E005: "Corregir NIT en SAG y volver a conciliar"

Cada fila ahora muestra:
1. ID + nombre entendible + badge de tipo
2. Sub-línea: `Acción sugerida: [texto operativo]`

---

### 6. Drawer — Origen de datos / Fuente de validación

Reescritura completa del `source_selector` drawer con 7 bloques diferenciados:

**Bloque 1 — Resumen**
Grid 2×2: universo activo / registros / período / última carga.

**Bloque 2 — Entidades detectadas por Motor IA**
Pagos / Facturas / Clientes / Cuentas (Origen) o Consignaciones / Transferencias / Débitos / Sin referencia (Validación).

**Bloque 3 — Universos conectados**
Solo fuentes activas con registros reales + timestamp de sincronización.

**Bloque 4 — Universos disponibles**
Fuentes no conectadas con botón CTA activo:
- "Conectar →" (Shopify, PayCo, Davivienda, Nequi)
- "Cargar archivo →" (XML / Excel / PDF)

Nunca texto muerto ni disabled.

**Bloque 5 — Resumen operacional**
Texto ejecutivo corto (1-2 líneas) que resume el estado del universo. Estilo: blueLight con borde izquierdo `C.blueDark`.

**Bloque 6 — Última actividad operacional**
Lista compacta con dot de color (verde / ámbar / rojo / gris) + timestamp + descripción.
Ejemplos:
- Hace 12 min · SAG sincronizado correctamente
- Pendiente · DIAN — validación de período Abr 2026
- Hoy · 2 conflictos esperan decisión del operador

**Bloque 7 — Acciones**
- Primaria: "Ir a Centro Documental →" (link real)
- Secundaria: "Conectar nueva integración →" (button activo)
- Ghost: "Cargar archivo PDF / XLSX / XML →" (button activo)

---

### 7. Reglas automáticas

Sección renombrada de "Automatizaciones" a "Reglas automáticas".
Formato SI / ENTONCES ya implementado desde ARCH-01 — mantenido.

---

## Auditoría de coherencia — resultado

| Criterio | Estado |
|----------|--------|
| ¿El usuario entiende qué está conciliando? | SAG ERP vs Bancolombia — visible en paneles y drawer |
| ¿Se entiende entre qué universos? | "Universos conectados" como sección principal |
| ¿El botón principal dice Conciliar? | "Conciliar" — ag-action-primary en Motor IA |
| ¿No hay "matching" visible? | Eliminado de todo texto de usuario |
| ¿No hay acciones muertas? | Botones de Universos disponibles son CTAs activos |
| ¿El drawer tiene continuidad operacional? | 7 bloques + Centro Documental link + Última actividad |
| ¿El flujo se siente vivo? | Conectores con valores dinámicos de MATCH_FIELDS |
| ¿Centro Documental aparece? | Acción primaria en drawer + sub-líneas de excepciones |
| ¿Todo en español LATAM? | Sí |
| ¿Parece dashboard genérico? | No — lenguaje operacional de revisoría fiscal |

---

## Identidad del módulo

**Conciliación Inteligente** es un centro operacional donde Agentik cruza datos de SAG, bancos, DIAN y documentos cargados para detectar problemas, sugerir reglas y reducir auditorías manuales.

Ciclo: `capturar → interpretar → validar → conciliar → decidir → exportar → aprender`

---

## Próximos pasos V2

| Área | Tarea | Prioridad |
|------|-------|-----------|
| Backend | `POST /api/orgs/[orgSlug]/conciliacion/run` | Alta |
| Backend | `GET /api/orgs/[orgSlug]/conciliacion/matches` | Alta |
| Motor IA | Embeddings reales para similitud semántica | Alta |
| Reglas | CRUD en Prisma con `orgId` FK | Media |
| Centro Documental | Link bidireccional real desde drawer | Media |
| Exportación | PDF con Puppeteer · XML DIAN schema | Media |
| Integración Bancolombia | Sincronización real de extractos | Media |
| Integración DIAN | Validación de facturas electrónicas | Media |
