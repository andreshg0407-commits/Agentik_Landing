/**
 * scripts/integration/patch-server-only.cjs
 *
 * DEPRECATED — Use the real integration harness instead:
 *   scripts/integration/run-autonomous-operations-harness.ts
 *   → calls: POST /api/internal/integration-tests/autonomous-operations
 *
 * This module patches the `server-only` package to be a no-op so that
 * Next.js server code can be imported and tested via tsx/Node.js outside
 * the Next.js runtime. This is a brittle workaround — it bypasses the
 * server-only guard without a real server context, which means Prisma and
 * other server services are not guaranteed to work correctly.
 *
 * Load with:  NODE_OPTIONS="-r ./scripts/integration/patch-server-only.cjs"
 *
 * NEVER load this in production. Only for local integration test scripts.
 *
 * Status: DEPRECATED since AGENTIK-INTEGRATION-HARNESS-01
 * Replacement: run-autonomous-operations-harness.ts + API route
 */

if (process.env.NODE_ENV === "production") {
  throw new Error(
    "[patch-server-only] Refusing to load in production environment.",
  );
}

const Module = require("module");
const originalLoad = Module._load;

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "server-only") {
    // Return a no-op module — allows server-only imports in test context
    return {};
  }
  return originalLoad.apply(this, arguments);
};
