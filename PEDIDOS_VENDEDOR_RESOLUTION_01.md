# PEDIDOS-VENDEDOR-RESOLUTION-01

## Decision: OPTION A — Vendedor resuelto con evidencia

SAG **SI** trae vendedor. El campo `ka_nl_tercero_vend` en MOVIMIENTOS contiene el FK al TERCERO que es el vendedor asignado al pedido.

---

## Hallazgos de la auditoria

### SAG MOVIMIENTOS.ka_nl_tercero_vend

| Year | With vendor | Total PD | Coverage |
|------|-----------|----------|----------|
| 2026 | 950       | 1,033    | **92.0%** |
| 2025 | 1         | 1,783    | 0.1%     |
| 2024 | 0         | 1,300    | 0.0%     |
| 2023 | 0         | 1,431    | 0.0%     |
| 2022 | 1,002     | 1,438    | 69.7%    |
| 2021 | 1,789     | 1,808    | 98.9%    |
| 2020 | 798       | 803      | 99.4%    |
| **Total** | **4,540** | **9,596** | **47.3%** |

SAG dejo de poblar el campo en 2023-2025. Lo retomo en 2026 con 92% de cobertura.

### Vendedores identificados (18 en SAG)

| ID | NIT | Nombre | Pedidos |
|----|-----|--------|---------|
| 211 | 4423395 | NESTOR FERNANDO ALZATE JIMENEZ | 1,709 |
| 280 | 71731547 | LUIS ORLANDO NARANJO | 1,024 |
| 8773 | 71790666 | JAIME ANDRES OSPINA PEREZ | 722 |
| 25349 | 98664635 | JUAN CARLOS VALENCIA | 253 |
| 194 | 1026152500 | JOHANA GALLEGO CASTRO | 188 |
| 278 | 1017127729 | JULIAN DAVID TORRES PEREZ | 123 |
| 39363 | 1041632210 | MANUELA TAMAYO | 110 |
| 8794 | 1020419509 | SANDRA MILENA SANCHEZ ALVAREZ | 98 |
| 191 | 1007665438 | HILARY VANESSA JIMENEZ ZAPATA | 93 |
| + 9 mas... | | | |

### Cruce con CRM

8 de 9 vendedores CRM coinciden con vendedores SAG:

- Luis Orlando Naranjo (CRM) = LUIS ORLANDO NARANJO (SAG #280)
- Nestor Fernando Alzate Jimenez (CRM) = NESTOR FERNANDO ALZATE JIMENEZ (SAG #211)
- Carlos Villa (CRM) = CARLOS VILLA (SAG #39268)
- Juan Valencia (CRM) = JUAN CARLOS VALENCIA (SAG #25349)
- etc.

Solo "Administrator" (14 quotes) no tiene match.

### Otras fuentes auditadas

| Fuente | Resultado |
|--------|-----------|
| CustomerProfile.sellerName | 46/33,229 profiles (no util) |
| VendorCommercialBag | 0 bags (no disponible) |
| Cartera/Receivables | No tiene campo vendedor |
| SaleRecord.sellerName | "Sin Vendedor" en todos |

---

## Estrategia de resolucion implementada

### Prioridad 1: SAG directo (HIGH confidence)

```
MOVIMIENTOS.ka_nl_tercero_vend → TERCEROS.sc_nombre
```

- 92% de pedidos 2026
- Nombre real del vendedor
- Confianza: **alta**

### Prioridad 2: CRM quote history (MEDIUM confidence)

```
CustomerOrderRecord.customerNit → CustomerProfile.sagTerceroId
CustomerProfile.crmId → CRMQuote.billing_account_id
CRMQuote.sellerName → vendedor mas frecuente para ese cliente
```

- Solo si confianza >= 60% (vendedor dominante)
- Confianza: **media**

### Sin resolucion (UNKNOWN)

- Pedidos de 2023-2025 sin SAG vendor y sin historial CRM
- UI muestra: "Vendedor no identificado en SAG"
- NO se calculan KPIs por vendedor para estos pedidos

---

## Archivos creados/modificados

| Archivo | Cambio |
|---------|--------|
| `lib/comercial/pedidos/seller-resolution-service.ts` | NUEVO: service con resolveSellerForSagOrder, batch, report |
| `lib/comercial/pedidos/order-types.ts` | sellerSource, sellerConfidence fields |
| `lib/comercial/pedidos/order-service.ts` | Wired new resolution (replaces SaleRecord fallback) |
| `app/api/.../pedidos/history/route.ts` | seller_resolution action |
| `app/.../pedidos/pedidos-client.tsx` | Seller source/confidence display + "sin vendedor" note |
| `scripts/audit-pedidos-vendedor-resolution.ts` | 31/31 PASS |

---

## Que decir en la reunion

> "Los pedidos ya estan sincronizados con SAG y el detalle de producto esta completo.
> Descubrimos que SAG SI trae el vendedor en el campo `ka_nl_tercero_vend` — un FK a TERCEROS.
> Para 2026 tenemos 92% de cobertura. Hay un gap en 2023-2025 donde SAG dejo de poblar el campo,
> pero lo cubrimos parcialmente con el historial CRM.
>
> Ya implementamos la resolucion: cada pedido muestra el vendedor con su fuente (SAG/CRM)
> y nivel de confianza. Los pedidos sin vendedor se marcan honestamente como 'no identificado'
> y no se incluyen en KPIs por vendedor."

---

## Limitaciones

1. **Gap 2023-2025**: SAG no poblo `ka_nl_tercero_vend` → ~3,500 pedidos sin vendedor directo
2. **CRM coverage parcial**: Solo cubre clientes con historial de cotizaciones en SuiteCRM
3. **ss_usuario_new es el digitador**: Siempre "YULIANA OSPINA TABARES" — no es el vendedor
4. **No hay tabla formal cliente-vendedor**: La relacion se infiere de documentos

## Proximos pasos (opcionales)

1. Solicitar a SAG que llene `ka_nl_tercero_vend` retroactivamente para 2023-2025
2. Crear tabla formal `ClienteVendedor` para asignaciones manuales
3. Backfill desde CRM para los ~3,500 pedidos del gap
