// Preload script: intercept "server-only" resolution before tsx processes imports
const Module = require("module");
const path = require("path");
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === "server-only") {
    return path.join(__dirname, "mock-server-only.js");
  }
  return orig.call(this, request, parent, isMain, options);
};
