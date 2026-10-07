const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Release transforms inline EXPO_PUBLIC_ variables, and Metro's cache key never sees them.
config.cacheVersion = process.env.EXPO_PUBLIC_APP_VARIANT || "production";

// msw's root entry loads modules that need MessageEvent and BroadcastChannel, which Hermes
// lacks, so app code gets an entry exposing only the request-handling core. No passthrough:
// a catch-all passthrough would send real requests from a demo build.
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
