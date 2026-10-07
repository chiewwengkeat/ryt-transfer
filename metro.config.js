const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// msw's root entry loads modules that need MessageEvent and BroadcastChannel, which Hermes
// lacks, so app code gets an entry exposing only the request-handling core.
const MSW_DIR = path.dirname(require.resolve("msw/package.json"));
const MSW_NATIVE_ENTRY = path.join(__dirname, "metro.msw-entry.mjs");
const MSW_CORE_MODULES = new Map(
  ["http", "HttpResponse", "delay", "getResponse"].map((name) => [
    `msw-core/${name}`,
    path.join(MSW_DIR, "lib", "core", `${name}.mjs`),
  ]),
);
const NODE_MODULES_SEGMENT = `${path.sep}node_modules${path.sep}`;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === "msw" &&
    !context.originModulePath.includes(NODE_MODULES_SEGMENT)
  ) {
    return { type: "sourceFile", filePath: MSW_NATIVE_ENTRY };
  }
  const coreModulePath = MSW_CORE_MODULES.get(moduleName);
  if (coreModulePath) return { type: "sourceFile", filePath: coreModulePath };
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
