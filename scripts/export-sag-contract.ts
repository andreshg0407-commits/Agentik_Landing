/**
 * scripts/export-sag-contract.ts
 *
 * Imprime el contrato ejecutivo SAG × Agentik en formato Markdown.
 * Ejecutar con: npx tsx scripts/export-sag-contract.ts
 */

import { buildSagExecutiveContract } from "../lib/integrations/sag/data-contract/export/sag-contract-export";
import { exportAll }                 from "../lib/integrations/sag/data-contract/export/sag-contract-renderer";

const contract = buildSagExecutiveContract();
const out      = exportAll(contract);

console.log(out.markdown);
