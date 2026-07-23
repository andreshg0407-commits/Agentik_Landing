/**
 * Stub for "server-only" module.
 *
 * Usage: npx tsx --require ./lib/comercial/pedidos/__tests__/stub-server-only.js --test ...
 *
 * In Next.js, "server-only" throws when imported from a client component.
 * In Node.js CLI tests, there is no client boundary — this stub makes it a no-op.
 */
"use strict";
const Module = require("node:module");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === "server-only" || request === "client-only") {
    // Return a path that resolves to this no-op stub
    return __filename;
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
