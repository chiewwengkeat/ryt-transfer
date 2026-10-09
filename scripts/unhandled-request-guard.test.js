const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { test } = require("node:test");

test("fails a Jest run whose test sent a request no handler answered, naming its URL", () => {
  const result = spawnSync(
    path.join(REPO_ROOT, "node_modules/.bin/jest"),
    [
      "--roots",
      path.join(REPO_ROOT, "src/test/fixtures"),
      "--testMatch",
      "**/unmocked-request.fixture.ts",
      "--watchman=false",
    ],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /No mock handled: GET https:\/\/api\.example\.test\/scenarios\/unmocked\.json/,
  );
});

const REPO_ROOT = path.join(__dirname, "..");
