# VENDEDORES_DATA_AUDIT.md

COMMERCIAL-DATA-AUDIT-01 -- Fase 3: Auditoria de Datos Vendedores

---

## Origen de Datos

**Los vendedores NO provienen de una tabla Prisma ni de SAG.**

El modulo Vendedores usa un **registro hardcoded** en:
```
lib/comercial/maletas/maletas-normalizer.ts :: DEFAULT_VENDOR_REGISTRY
```

### Registro actual (4 vendedores)

| ID | Nombre | SAG Name | Activo |
|---|---|---|---|
| CARLOS_LEON | CARLOS LEON | null (no confirmado) | si |
| CARLOS_VILLA | CARLOS VILLA | null (no confirmado) | si |
| NESTOR | NESTOR | NESTOR FERNANDO ALZATE JIMENEZ | si |
| ORLANDO | ORLANDO | LUIS ORLANDO NARANJO | si |

**Problema:** Solo 2 de 4 vendedores tienen `sagName` confirmado.

---

## Vendedores Reales en CRM (CRMQuote.sellerName)

El CRM registra 8 vendedores distintos:

| Vendedor CRM | Pedidos | En registro hardcoded? |
|---|---|---|
| Luis Orlando Naranjo | 91 | Si (ORLANDO) |
| Nestor Fernando Alzate Jimenez | 74 | Si (NESTOR) |
| Carlos Villa | 34 | Si (CARLOS_VILLA) |
| Carlos Agudelo | 32 | **NO** |
| Manuela Tamayo Perez | 26 | **NO** |
| Fredy Velez | 25 | **NO** |
| Juan Valencia | 2 | **NO** |
| Yuliana Ospina Tabares | 1 | **NO** |

**4 vendedores con actividad CRM NO aparecen en el modulo.**

---

## Relaciones Cross-Module

### Con Clientes (CustomerProfile.sellerSlug)

| Metrica | Valor |
|---|---|
| Clientes con sellerName | 18 de 33,203 |
| Clientes con sellerSlug | ~18 |
| Seller name usado | "Vendedor Generico" |

**RELACION ROTA.** El CRM sync no escribe sellerName/sellerSlug en CustomerProfile. El modulo Vendedores llama `computeVendorCustomerSummary()` que busca por `sellerSlug`, encontrando 0 clientes para cada vendedor.

### Con Pedidos (CRMQuote.sellerSlug)

| Metrica | Valor |
|---|---|
| Quotes con seller | 285 de 285 (100%) |
| Match con registro hardcoded | ~199 (NESTOR, ORLANDO, CARLOS_VILLA) |
| Sin match | ~86 (Carlos Agudelo, Manuela, Fredy, Juan, Yuliana) |

**RELACION PARCIAL.** El vendedor se identifica por `sellerSlug` en CRMQuote. Solo 3 de 8 vendedores CRM tienen match en el registro. Los KPIs de "Carlos Leon" probablemente son 0 porque no tiene quotes.

### Con Maletas (CommercialCase.salesRepId)

| Metrica | Valor |
|---|---|
| CommercialCase registros | **0** |
| CommercialCaseItem registros | **0** |

**RELACION INEXISTENTE.** La tabla CommercialCase nunca ha sido poblada. El modulo Maletas funciona en runtime via Excel + engine, pero nunca persiste snapshots de casos. Esto significa que `computeVendorActiveCaseSnapshot()` siempre retorna un caso vacio.

---

## Problemas Criticos

### P0 — Registro hardcoded con 4 de 8 vendedores reales

El modulo muestra 4 vendedores cuando CRM tiene 8 con actividad.

**Solucion requerida:**
- Opcion A: Crear modelo Prisma `CommercialSalesRep` y sync desde CRM.
- Opcion B: Actualizar DEFAULT_VENDOR_REGISTRY con los 8 vendedores del CRM.

### P0 — Carlos Leon tiene 0 actividad CRM

Carlos Leon esta en el registro pero no aparece en ningun CRMQuote. Podria ser un vendedor inactivo o con otro nombre en CRM (quizas "Carlos Agudelo"?).

### P1 — sellerName/sellerSlug nunca se escribe en CustomerProfile

La relacion vendedor-cliente esta completamente rota. Todos los KPIs de clientes por vendedor son 0.

### P1 — CommercialCase nunca persistido

`persistCaseSnapshot()` existe pero nunca se invoca en produccion. El panel "Maleta Activa" en el detalle de vendedor siempre muestra "Sin maleta activa asignada".

### P2 — sagName no confirmado para Carlos Leon y Carlos Villa

Sin sagName, estos vendedores no pueden ser vinculados a datos de facturacion SAG.

---

## Confianza General

| Aspecto | Confianza |
|---|---|
| Lista de vendedores | **BAJA** (hardcoded, incompleta) |
| KPIs de ventas (via CRMQuote) | **MEDIA** (funciona para 3 de 8 vendedores) |
| Relacion con clientes | **NULA** (sellerSlug vacio en CustomerProfile) |
| Relacion con maletas | **NULA** (CommercialCase vacia) |
| Relacion con pedidos | **MEDIA** (funciona para vendedores con sellerSlug match) |
