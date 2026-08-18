/**
 * IMPORTS-EXECUTIVE-UX-CLOSEOUT-05A3
 *
 * Verifies UX overhaul for importaciones-client.tsx:
 *   1. Drawer close button uses real × character (not literal \u2715)
 *   2. Drawer has Escape key handler
 *   3. Drawer has aria-label="Cerrar"
 *   4. Classification labels: INMEDIATA = "Alta rotacion" (not "Comprar ahora")
 *   5. Classification badge: INMEDIATA = "Alta rotacion" (not "Comprar")
 *   6. Classification badge: NO_RECOMPRAR = "Menor rotacion"
 *   7. Classification label: SIN_DATOS = "Sin ventas 6M"
 *   8. Inteligencia tab has Sales 6M KPIs
 *   9. Inteligencia tab has classification distribution
 *  10. Inteligencia tab has Top 10 tallas
 *  11. Inteligencia tab does NOT have SAG Blockers panel
 *  12. Inteligencia tab does NOT have Rulings panel
 *  13. Mas de 8 meses uses compact methodology note (not blocker banner)
 *  14. KPI label says "Antiguedad estimada 8M+" (not "provisionales")
 *
 * Sprint: IMPORTS-EXECUTIVE-UX-CLOSEOUT-05A3
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const CLIENT_PATH = path.resolve(
  __dirname,
  "../../../app/(app)/[orgSlug]/comercial/importaciones/importaciones-client.tsx"
);
const clientSrc = fs.readFileSync(CLIENT_PATH, "utf-8");

describe("05A3 — Drawer Close Button", () => {
  test("T1: Drawer does NOT render literal backslash-u2715", () => {
    // The old code had: \u2715 as a literal string in JSX
    // The new code uses {"\u00D7"} which renders as ×
    expect(clientSrc).not.toContain(">\n          \\u2715\n");
  });

  test("T1b: Drawer uses real multiplication sign character", () => {
    expect(clientSrc).toContain('"\\u00D7"');
  });

  test("T2: Drawer has Escape key handler", () => {
    expect(clientSrc).toContain('"Escape"');
    expect(clientSrc).toContain("keydown");
  });

  test("T3: Drawer has aria-label Cerrar", () => {
    expect(clientSrc).toContain('aria-label="Cerrar"');
  });
});

describe("05A3 — Classification Labels", () => {
  test("T4: INMEDIATA label is 'Alta rotacion' not 'Comprar ahora'", () => {
    expect(clientSrc).toContain('INMEDIATA: "Alta rotacion"');
    expect(clientSrc).not.toContain('"Comprar ahora"');
  });

  test("T5: INMEDIATA badge label is 'Alta rotacion' not 'Comprar'", () => {
    // In CLASSIFICATION_DISPLAY
    expect(clientSrc).toContain('label: "Alta rotacion"');
  });

  test("T6: NO_RECOMPRAR label is 'Menor rotacion'", () => {
    expect(clientSrc).toContain('NO_RECOMPRAR: "Menor rotacion"');
  });

  test("T7: SIN_DATOS label is 'Sin ventas 6M'", () => {
    expect(clientSrc).toContain('SIN_DATOS: "Sin ventas 6M"');
  });
});

describe("05A3 — Inteligencia Tab", () => {
  test("T8: Inteligencia has Sales 6M KPIs", () => {
    expect(clientSrc).toContain("Refs con ventas 6M");
    expect(clientSrc).toContain("Und netas 6M");
    expect(clientSrc).toContain("Valor neto 6M");
  });

  test("T9: Inteligencia has classification distribution", () => {
    expect(clientSrc).toContain("Distribucion por clasificacion");
  });

  test("T10: Inteligencia has Top 10 tallas", () => {
    expect(clientSrc).toContain("Top 10 tallas por ventas 6M");
  });

  test("T11: Inteligencia does NOT have SAG Blockers panel", () => {
    expect(clientSrc).not.toContain("Blockers SAG");
  });

  test("T12: Inteligencia does NOT have Rulings panel", () => {
    expect(clientSrc).not.toContain("Rulings emitidos");
  });
});

describe("05A3 — Mas de 8 meses", () => {
  test("T13: Uses compact methodology note, not blocker banner", () => {
    expect(clientSrc).not.toContain("IMPORTS_B24_REENTRY_AGE_PARTIAL");
    expect(clientSrc).toContain("Antiguedad estimada con fecha de ultima compra SAG");
  });

  test("T14: KPI label says 'Antiguedad estimada 8M+' not 'provisionales'", () => {
    expect(clientSrc).toContain('Antiguedad estimada 8M+');
    expect(clientSrc).not.toContain("provisionales (pendiente SAG-004)");
  });
});
