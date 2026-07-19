// Mock server-only for script context
const Module = require("module");
const origLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "server-only") return {};
  return origLoad.call(this, request, parent, isMain);
};
