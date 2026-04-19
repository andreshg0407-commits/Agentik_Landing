# SAG Test Plan — Castillitos

Executable checklist for the first real SAG test run.
Work through each phase in order. **Do not skip phases** — each gate confirms the next phase is safe.

---

## Prerequisites

| Item | How to verify |
|------|---------------|
| Database reachable (Neon) | `npx tsx lib/check-db.ts` → "Connected" |
| `DATABASE_URL` env set | `echo $DATABASE_URL \| head -c 40` |
| `PYA_SOAP_TOKEN` env set (or `TOKEN` as fallback) | `echo $PYA_SOAP_TOKEN \| head -c 8` or `echo $TOKEN \| head -c 8` |
| `PYA_SOAP_ENDPOINT` env set (or defaults to wssagpya) | `echo ${PYA_SOAP_ENDPOINT:-https://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap}` |
| Castillitos org exists with `status=ACTIVE` | `npx tsx -e "const {prisma}=require('./lib/prisma');prisma.organization.findUnique({where:{slug:'castillitos'},select:{id:true,status:true}}).then(console.log)"` |

> **Token resolution order:** `PYA_SOAP_TOKEN` → `TOKEN` (fallback). Both are checked by `lib/sag/env.ts`.

---

## Phase 0 — Connection validation (new)

```bash
# Validates env vars + fires minimal SOAP call (SELECT TOP 1 * FROM TERCEROS)
npx tsx scripts/sag-test-connection.ts
# With raw SOAP logging:
PYA_DEBUG=true npx tsx scripts/sag-test-connection.ts
```

**Pass criteria:**
- [ ] Token resolves (PYA_SOAP_TOKEN or TOKEN)
- [ ] SOAP call returns ≥1 row from TERCEROS
- [ ] Script exits 0

---

## Phase 1 — Connector setup (idempotent)

```bash
# Upsert both connectors: sag_pya_soap + castillitos_crm
npx tsx scripts/setup-castillitos-connectors.ts --org=castillitos
```

**Expected output (abbreviated):**
```
Organization: Castillitos (castillitos) [ACTIVE]
✅ sag_pya_soap connector upserted — status: ACTIVE
✅ castillitos_crm connector upserted — status: ACTIVE
  SAG endpoint: http://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap
  SAG token:    a1b2c3d4…
```

**Pass criteria:**
- [ ] Both connectors show `status: ACTIVE`
- [ ] SAG token shows first 8 chars (not empty, not "(ausente)")
- [ ] Script exits 0

---

## Phase 2 — Homologation report (read-only)

```bash
# Print homologation summary + run TERCEROS + CARTERA reads + save samples
npx tsx scripts/sag-test-read.ts
# Skip saving sample files:
npx tsx scripts/sag-test-read.ts --skip-save
```

> **Alt (API, if session cookie available):**
> ```bash
> curl -s -X POST \
>   -H "Cookie: <your-session-cookie>" \
>   "http://localhost:3000/api/internal/sag-compat-report?org=castillitos" \
>   | jq .
> ```

**Pass criteria:**
- [ ] Response includes `homologationSummary` object
- [ ] `pctComplete` is shown (any value — just confirms the report runs)
- [ ] `pendingNames` lists the remaining value sets to confirm

**Current state (as of 2026-04-08):**
- Confirmed: 9 / 14 value sets (gate OPEN — ≥3 required for Phase 5)
  - ✅ ZONAS (39), BODEGAS (37), LINEAS (5), TARIFAS_IVA (8), GRUPOS (29), TALLAS (35), COLORES (88), TIPOS_TERCERO (3), UNIDADES (UND)
  - ⬜ FORMAS_PAGO (embedded in FUENTES.ka_ni_forma_pago_fte — no standalone table), TIPOS_CLIENTE, VENDEDORES (113 active, FK-only), LISTAS_PRECIO, SUB_GRUPOS
- CASTILLITOS_STRUCT: `articlesTable="ARTICULOS"`, `movimientosTable="MOVIMIENTOS"`, `movimientosItemsTable="MOVIMIENTOS_ITEMS"`
- CASTILLITOS_CONFIG: `defaultWarehouse="01"`, `usesTallaColor=true`
- Samples saved: `scripts/samples/terceros-top20.json`, `movimientos-top20.json`, `articulos-top5.json`, `bodegas-top5.json`, `zonas-top5.json`, `vendedores-top5.json`, `fuentes-all.json`, plus zonas/bodegas/colores/tallas full sets

> **IMPORTANT — CARTERA vs MOVIMIENTOS:** `CARTERA` does not exist in this SAG installation. The receivables table is `MOVIMIENTOS` (document headers) joined with `MOVIMIENTOS_ITEMS` (line items).

> **Amount resolution (2026-04-08):** Single-pass JOIN query confirmed working. `originalAmount = SUM(ISNULL(n_valor,0))` per document (net, ex-IVA). `paidAmount = 0` — `RECIBOS`/`ANTICIPOS`/`ABONOS` don't exist; `PAGOS` table is empty. `balanceDue = originalAmount`. Sample: MOV-7 = COP 10,677,011; MOV-20 = COP 18,696,984. See `scripts/samples/movimientos-with-amounts-top20.json` and `movimientos-amounts-comparison.json`.

> **Mapper notes (2026-04-08):** `mapSagCustomer` reads `n_nit`, `sc_nombre`, `ss_nombre1/2`, `ss_apellido1/2`, `sc_naturaleza`, `sc_telefono_ppal`, `ss_email`, `ddt_fecha_modificacion`. `mapSagReceivable` reads the 11 JOIN-result fields: `ka_nl_movimiento`, `n_numero_documento`, `sc_beneficiario`, `d_fecha_documento`, `ss_moneda`, `total_valor`, `total_iva`, `total_descuento`.

---

## Phase 3 — SAG read sync (customers)

Get the connector ID first:
```bash
npx tsx -e "
const {prisma}=require('./lib/prisma');
prisma.connector.findFirst({
  where:{organization:{slug:'castillitos'}, source:'sag_pya_soap'},
  select:{id:true,status:true,source:true}
}).then(console.log)"
```
Copy the `id` value as `CONNECTOR_ID`.

```bash
# Sync customers module — real SAG SOAP call, read-only
curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>" \
  -d '{"module":"customers"}' \
  "http://localhost:3000/api/orgs/castillitos/connectors/CONNECTOR_ID/sync" \
  | jq .
```

**Expected response shape:**
```json
{
  "runId": "cm...",
  "module": "customers",
  "status": "SUCCEEDED",
  "rowsImported": 150,
  "rowsSkipped": 0,
  "rowsErrored": 0,
  "error": null,
  "ms": 4200
}
```

**Pass criteria:**
- [ ] `status` is `"SUCCEEDED"` (not `"FAILED"`)
- [ ] `rowsImported` > 0
- [ ] `error` is null
- [ ] No `SAG_SOAP_FAULT` in server logs
- [ ] No `SAG_HTTP_ERROR` in server logs

**Debug flags:**
```bash
# Enable raw SOAP request/response logging
PYA_DEBUG=true npx tsx scripts/setup-castillitos-connectors.ts
# Or set env in .env.local: PYA_DEBUG=true
```

**If it fails — check server logs for:**
```
[SAG] ERROR sync:hook:fail    ...
[SAG] ERROR soap:fault        ...
[SAG] ERROR soap:http:error   ...
```

---

## Phase 4 — SAG read sync (receivables)

```bash
curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>" \
  -d '{"module":"receivables"}' \
  "http://localhost:3000/api/orgs/castillitos/connectors/CONNECTOR_ID/sync" \
  | jq .
```

**Pass criteria:**
- [ ] `status` is `"SUCCEEDED"`
- [ ] `rowsImported` ≥ 0 (may be 0 if no open cartera)
- [ ] `error` is null
- [ ] After the call, check that `CustomerProfile.totalReceivables` is populated for known NITs:

```bash
npx tsx -e "
const {prisma}=require('./lib/prisma');
prisma.customerProfile.findMany({
  where:{organization:{slug:'castillitos'}},
  select:{nit:true,totalReceivables:true,overdueReceivables:true},
  take:5,orderBy:{totalReceivables:'desc'}
}).then(r=>console.table(r))"
```

---

## Phase 5 — Write preview (dry-run, no real send)

> **Gate:** Only proceed once ≥ 3 value sets in Phase 2 have `confirmed: true`.
> Without confirmed master data, write validation issues warnings only.

### 5a. Enqueue a test customer write (tipo 6)

This creates a `SagWriteOp` row with `status=PENDING` — no SOAP call is made yet.

```bash
curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>" \
  -d '{
    "tipo": 6,
    "payload": {
      "nit": "900123456",
      "razonSocial": "CLIENTE TEST SAG",
      "email": "test@example.com",
      "telefono": "3001234567",
      "ciudad": "BOGOTÁ"
    }
  }' \
  "http://localhost:3000/api/orgs/castillitos/sag/writes" \
  | jq .
```

**Pass criteria:**
- [ ] Response contains `id` (the SagWriteOp ID)
- [ ] `status` is `"PENDING"`
- [ ] No immediate error
- [ ] Row appears in DB: `npx tsx -e "const {prisma}=require('./lib/prisma'); prisma.sagWriteOp.findMany({where:{status:'PENDING'},select:{id:true,tipo:true,status:true},take:3}).then(console.log)"`

### 5b. Inspect the generated XML (pre-approval)

```bash
# Read the XML that would be sent (stored in pendingXml)
npx tsx -e "
const {prisma}=require('./lib/prisma');
prisma.sagWriteOp.findFirst({
  where:{status:'PENDING'},
  select:{id:true,tipo:true,pendingXml:true,validationWarnings:true}
}).then(r=>{ console.log('ID:', r?.id); console.log('XML:', r?.pendingXml?.slice(0,400)); console.log('Warnings:', r?.validationWarnings) })"
```

**Pass criteria:**
- [ ] XML is well-formed (starts with `<?xml`)
- [ ] NIT and razonSocial appear in the XML
- [ ] `validationWarnings` shows only known-pending fields (none blocking if `confirmed=false`)

### 5c. Do NOT approve in test — just verify preview is clean

Do not run the approval step until homologation is ≥ 80% complete and the test environment token is confirmed. The write executor will call the real SAG SOAP endpoint.

---

## Phase 6a — Controlled first SAG write (execute)

> **Gate:** Operation must be in `APPROVED` state. Human reviewer must have inspected `generatedXml`.
> Current operation: `cmnqjm6260000x3y5a610uaaj` — type=1 (UPSERT_CUSTOMER), risk=LOW, 495 bytes.

### State machine after safety architecture sprint

```
enqueue  → PENDING
approve  → APPROVED          (no SOAP — POST .../approve)
execute  → SENDING → SUCCEEDED|FAILED   (real SOAP — POST .../execute)
retry    → APPROVED          (no SOAP — POST .../retry, then /execute again)
reject   → REJECTED          (terminal, no SOAP)
```

### Verify XML before executing

```bash
npx tsx -e "
const {prisma}=require('./lib/prisma');
prisma.sagWriteOperation.findUnique({
  where:{id:'cmnqjm6260000x3y5a610uaaj'},
  select:{status:true,generatedXml:true,risk:true}
}).then(r=>{ console.log('status:', r?.status); console.log('risk:', r?.risk); console.log('XML:'); console.log(r?.generatedXml) })"
```

### Execute (one-shot, live SAG write)

```bash
# Requires MANAGER+ session cookie from an authenticated browser session
curl -s -X POST \
  -H "Cookie: <your-session-cookie>" \
  "http://localhost:3000/api/orgs/castillitos/sag/write/cmnqjm6260000x3y5a610uaaj/execute" \
  | jq .
```

**Expected response (success):**
```json
{
  "ok": true,
  "operationId": "cmnqjm6260000x3y5a610uaaj",
  "sagResponse": { "ok": true, "raw": "OK", "message": "OK" }
}
```

**Pass criteria:**
- [ ] `ok: true`
- [ ] `sagResponse.raw` starts with `"OK"` (not `"ERROR:"` or `"FALLIDO:"`)
- [ ] DB row: `status=SUCCEEDED`, `sentAt` set, `executedAt` set, `submittedXml` matches `generatedXml`
- [ ] `sagResponseOk = true`

**Verify DB after execute:**
```bash
npx tsx -e "
const {prisma}=require('./lib/prisma');
prisma.sagWriteOperation.findUnique({
  where:{id:'cmnqjm6260000x3y5a610uaaj'},
  select:{status:true,sentAt:true,executedAt:true,sagResponseOk:true,sagResponseRaw:true,submittedXml:true}
}).then(console.log)"
```

---

## Phase 7 — Post-sync data quality check

After Phases 3–4 succeed:

```bash
# Verify KPIs are populated in CustomerProfile
npx tsx -e "
const {prisma}=require('./lib/prisma');
prisma.customerProfile.aggregate({
  where:{organization:{slug:'castillitos'}},
  _count:{_all:true},
  _sum:{totalSalesL12:true,totalReceivables:true}
}).then(console.log)"
```

```bash
# Verify ConnectorRun history
npx tsx -e "
const {prisma}=require('./lib/prisma');
prisma.connectorRun.findMany({
  where:{connector:{organization:{slug:'castillitos'}}},
  select:{id:true,module:true,status:true,rowsImported:true,startedAt:true},
  orderBy:{startedAt:'desc'},take:10
}).then(r=>console.table(r))"
```

**Pass criteria:**
- [ ] At least 1 `SUCCEEDED` run per module synced
- [ ] `CustomerProfile._count._all` > 0
- [ ] `totalSalesL12` sum > 0 (if SAG has sales data)

---

## Sign-off

| Phase | Status | Notes |
|-------|--------|-------|
| 0. Prerequisites | ✅ | env vars wired; SAG_TEST_TOKEN / SAG_TEST_DB in .env (2026-04-08) |
| 1. Connector setup | ✅ | lib/sag/env.ts; sag-test-connection.ts; SOAP ping confirmed |
| 2. Homologation report | ✅ | 9/14 confirmed; castillitos-overrides.ts populated from live data |
| 3. Read sync: customers | ✅ | TERCEROS read; terceros-top20.json saved; mapSagCustomer updated |
| 4. Read sync: receivables | ✅ | JOIN MOVIMIENTOS+ITEMS confirmed; real amounts wired; movimientos-with-amounts-top20.json |
| 5. Write preview | ✅ | Dry-run passed: Preview A (minimal) + B (full, real row) READY; Preview C (bad) correctly BLOCKED; XML confirmed; 1 advisory (DANE code) |
| 5b. Enqueue validation | ✅ | PENDING row created: cmnqjm6260000x3y5a610uaaj; XML byte-exact; all 10 field checks passed; pendingCount 0→1 |
| 6. Approval gating | ✅ | MANAGER+ gating confirmed; approve+execute coupling documented; PENDING→APPROVED transition verified; 10/10 field checks passed; generatedXml immutable (495 bytes); no SOAP fired |
| 6b. Safety architecture | ✅ | approve+execute decoupled; new POST .../execute route created; retry decoupled; 26/26 arch checks; op cmnqjm6260000x3y5a610uaaj in APPROVED state, awaiting execute |
| 7. Data quality check | ⬜ | |

Update status: ⬜ pending / 🔄 in progress / ✅ passed / ❌ failed

---

## Escalation — common errors

| Error | Likely cause | Fix |
|-------|-------------|-----|
| `SAG_SOAP_FAULT` | Bad token or SOAP namespace mismatch | Check `PYA_SOAP_TOKEN`, set `PYA_DEBUG=true` to see raw envelope |
| `SAG_HTTP_ERROR: 401` | Token expired or wrong environment (test vs prod) | Re-issue token from SAG admin panel |
| `SAG_HTTP_ERROR: 503` | SAG endpoint down | Wait and retry; check Azure portal |
| `SAG_PARSE_ERROR` | SAG returned non-SOAP response | `PYA_DEBUG=true` to inspect raw response |
| `Connector not found` | connectorId doesn't match org | Re-run Phase 1 setup script |
| `rowsImported: 0` (customers) | SAG query returned empty — wrong filters | Check adapter query params in `query-catalog.ts` |
| `[SAG] ERROR sync:hook:fail` | Post-sync hook threw (non-fatal) | Check hook error code in log; hook failures don't fail the sync run |
