# TENANT-BRANDING-IMPORT-01 -- Sprint Report

**Date:** 2026-07-04
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained)

---

## Objective

Allow users to upload brand manual (PDF) and logos to automatically pre-fill tenant corporate identity via AI extraction.

---

## Architecture

```
User drops files (PDF + logos)
       |
       v
POST /api/orgs/{slug}/branding/import  (FormData)
       |
       +-- Upload logos to R2 (branding/{slug}/...)
       |
       +-- Extract text from PDF (lightweight parser)
       |
       +-- AI Layer: TEXT_GENERATION + JSON_OUTPUT
       |
       v
{ uploads: [...], extraction: {...} }
       |
       v
Preview panel (colors, fields, footer, fonts)
       |
       v
User clicks "Aplicar al formulario"
       |
       v
Form pre-filled -- user reviews + saves
```

---

## File Uploads

### R2 Storage
Key pattern: `branding/{orgSlug}/{yyyy}/{mm}/{role}-{uuid}.{ext}`

Supported files:
| Type | MIME | Role |
|------|------|------|
| PNG/JPG/WebP/SVG | image/* | logo, logo_dark, logo_mono |
| PDF | application/pdf | brand_manual |

Role auto-detection from filename:
- Contains "dark"/"oscuro"/"negro" -> logo_dark
- Contains "mono"/"bw"/"blanco" -> logo_mono
- First image without match -> logo
- PDF -> brand_manual

### Upload Service
`lib/tenant/branding-import.ts`:
- `uploadBrandingAsset()` -- upload to R2 under branding/ prefix
- `isAllowedMime()`, `isLogoMime()`, `isPdfMime()` -- MIME validation

---

## AI Extraction

### Pipeline
1. PDF text extracted via lightweight stream parser (no dependencies)
2. Text sent to AI Layer with EXTRACTION_SYSTEM_PROMPT
3. AI returns structured JSON with branding fields
4. Response validated (hex colors, string types)
5. Confidence level: high/medium/low

### Extracted Fields
- commercialName, legalName, taxId
- address, city, country
- phone, email, website
- primaryColor, secondaryColor, accentColor (hex validated)
- documentFooter (composed from found data)
- socialInstagram, socialFacebook, socialWhatsapp
- fonts[] (informational)
- logoUsageNotes (informational)

### Service
`lib/tenant/branding-import.ts`:
- `extractBrandingFromText(pdfText, orgSlug)` -- AI extraction
- `extractionToUpsertInput(extraction, logoUrls)` -- conversion helper

---

## UI Flow

### Import Section (top of branding page)
1. Drag-and-drop zone accepts PDF + image files
2. Files listed with role, preview thumbnail, size, remove button
3. "Subir y extraer identidad" button triggers upload + extraction
4. Logo URLs auto-applied to form immediately

### Extraction Preview Panel
- Shows extracted fields in 2-column grid
- Color swatches with hex values
- Font list (informational)
- Logo usage notes
- Document footer preview with brand color
- Confidence badge (high/medium/low)
- "Aplicar al formulario" / "Descartar" actions

### Post-Apply
- All extracted fields pre-fill the form
- User can edit any field manually
- Standard "Guardar identidad corporativa" saves to DB

---

## API

### POST /api/orgs/{slug}/branding/import

**Input:** FormData with fields: logo, logo_dark, logo_mono, brand_manual

**Response:**
```json
{
  "uploads": [
    { "url": "https://cdn.../branding/...", "key": "...", "bytes": 12345, "mimeType": "image/png", "role": "logo" }
  ],
  "extraction": {
    "commercialName": "...",
    "primaryColor": "#004AAD",
    "confidence": "high",
    ...
  },
  "errors": []
}
```

---

## Files Created/Modified

| File | Change |
|------|--------|
| `lib/tenant/branding-import.ts` | Upload + AI extraction service |
| `app/api/orgs/[orgSlug]/branding/import/route.ts` | FormData upload + extraction API |
| `app/(app)/[orgSlug]/configuracion/branding/branding-client.tsx` | Import section, drag-drop, extraction preview, apply flow |

---

## Limitations

- PDF text extraction is lightweight (no OCR). Image-heavy PDFs with no embedded text will yield low-confidence results.
- AI Layer adapters are currently mocks. Real extraction requires Anthropic/OpenAI API keys.
- SVG logos uploaded but not validated for content.
- No image analysis (VISION) of logos for color extraction -- uses PDF text only.
