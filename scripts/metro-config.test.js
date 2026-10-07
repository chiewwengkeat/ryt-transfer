const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { test } = require("node:test");

const METRO_CONFIG_PATH = path.join(__dirname, "..", "metro.config.js");

// Metro hashes cacheVersion into every transform key. A child process, since require caches the load.
function loadCacheVersionUnder(variant) {
  const env = { ...process.env };
  delete env.EXPO_PUBLIC_APP_VARIANT;
  if (variant !== undefined) env.EXPO_PUBLIC_APP_VARIANT = variant;
  return execFileSync(
    process.execPath,
    [
      "-p",
      `String(require(${JSON.stringify(METRO_CONFIG_PATH)}).cacheVersion)`,
    ],
    { env, encoding: "utf8" },
  ).trim();
}

test("a demo build and a production build never share a transform cache", () => {
  assert.notEqual(
    loadCacheVersionUnder("demo"),
    loadCacheVersionUnder("production"),
  );
});

test("a development build keeps its own transform cache", () => {
  assert.notEqual(
    loadCacheVersionUnder("development"),
    loadCacheVersionUnder("production"),
  );
});

test("an empty variant shares production's transform cache", () => {
  assert.equal(loadCacheVersionUnder(""), loadCacheVersionUnder("production"));
});

test("an unset variant shares production's transform cache", () => {
  assert.equal(
    loadCacheVersionUnder(undefined),
    loadCacheVersionUnder("production"),
  );
});
