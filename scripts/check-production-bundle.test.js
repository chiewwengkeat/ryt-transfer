const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const { checkProductionBundle } = require("./check-production-bundle");

const PROJECT_DIR = "/project";
const MARKERS = [
  {
    source: "the bank",
    text: "bank-marker",
    carriedBy: ["demo", "development"],
  },
  { source: "msw", text: "msw-marker", carriedBy: ["demo", "development"] },
  {
    source: "the render trace",
    text: "trace-marker",
    carriedBy: ["development"],
  },
];

function exportRunLabel({ variant, platform }) {
  return `${variant ?? "unset"} ${platform}`;
}

function bundleTextWhenEveryGateHolds({ variant }) {
  return MARKERS.filter(({ carriedBy }) => carriedBy.includes(variant))
    .map(({ text }) => text)
    .join(";");
}

function bundleTextExceptFor(label, text) {
  return (run) =>
    exportRunLabel(run) === label ? text : bundleTextWhenEveryGateHolds(run);
}

function fakeExpoExport({
  bundleTextFor = bundleTextWhenEveryGateHolds,
  exitStatusFor = () => 0,
} = {}) {
  const exportCalls = [];
  const runCommand = (command, args, options) => {
    const run = {
      variant: options.env.EXPO_PUBLIC_APP_VARIANT,
      platform: args[args.indexOf("--platform") + 1],
    };
    exportCalls.push({ command, args, options, label: exportRunLabel(run) });
    const outputDir = args[args.indexOf("--output-dir") + 1];
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, "metadata.json"), "{}");
    const bundleText = bundleTextFor(run);
    if (bundleText !== null) {
      const bundleDir = path.join(outputDir, "_expo/static/js", run.platform);
      fs.mkdirSync(bundleDir, { recursive: true });
      fs.writeFileSync(path.join(bundleDir, "entry.js"), bundleText);
    }
    return { status: exitStatusFor(run) };
  };
  return { exportCalls, runCommand };
}

function checkWith(fake, options = {}) {
  return checkProductionBundle({
    projectDir: PROJECT_DIR,
    runCommand: fake.runCommand,
    markers: MARKERS,
    ...options,
  });
}

test("exports production and demo on both platforms, development and the unset variant on android, whatever variant the shell set", (t) => {
  const shellVariant = process.env.EXPO_PUBLIC_APP_VARIANT;
  process.env.EXPO_PUBLIC_APP_VARIANT = "demo";
  t.after(() => {
    if (shellVariant === undefined) delete process.env.EXPO_PUBLIC_APP_VARIANT;
    else process.env.EXPO_PUBLIC_APP_VARIANT = shellVariant;
  });
  const fake = fakeExpoExport();

  checkWith(fake);

  assert.deepEqual(fake.exportCalls.map(({ label }) => label).sort(), [
    "demo android",
    "demo ios",
    "development android",
    "production android",
    "production ios",
    "unset android",
  ]);
  const unsetExport = fake.exportCalls.find(
    ({ label }) => label === "unset android",
  );
  assert.equal(
    Object.hasOwn(unsetExport.options.env, "EXPO_PUBLIC_APP_VARIANT"),
    false,
  );
});

test("runs every export with Metro's cache cleared, JavaScript rather than bytecode, and no .env file", () => {
  const fake = fakeExpoExport();

  checkWith(fake);

  assert.equal(fake.exportCalls.length, 6);
  for (const { command, args, options } of fake.exportCalls) {
    assert.equal(
      command,
      path.join(PROJECT_DIR, "node_modules", ".bin", "expo"),
    );
    assert.equal(args[0], "export");
    assert.ok(args.includes("--clear"));
    assert.ok(args.includes("--no-bytecode"));
    assert.equal(options.env.EXPO_NO_DOTENV, "1");
    assert.equal(options.cwd, PROJECT_DIR);
  }
});

test("passes when production and the unset variant carry no marker and demo and development carry theirs", () => {
  assert.deepEqual(checkWith(fakeExpoExport()), []);
});

test("fails a production export that carries a mock marker", () => {
  const failures = checkWith(
    fakeExpoExport({
      bundleTextFor: bundleTextExceptFor("production ios", "bank-marker"),
    }),
  );

  assert.equal(failures.length, 1);
  assert.match(failures[0], /^production ios export carries "bank-marker"/);
});

test("fails the unset-variant export that carries a mock marker, as a negated gate leaves it", () => {
  const failures = checkWith(
    fakeExpoExport({
      bundleTextFor: bundleTextExceptFor("unset android", "msw-marker"),
    }),
  );

  assert.equal(failures.length, 1);
  assert.match(
    failures[0],
    /^unset-variant android export carries "msw-marker"/,
  );
});

test("fails a demo export missing a mock marker and says how to choose another", () => {
  const failures = checkWith(
    fakeExpoExport({
      bundleTextFor: bundleTextExceptFor("demo ios", "msw-marker"),
    }),
  );

  assert.equal(failures.length, 1);
  assert.match(
    failures[0],
    /^demo ios export lacks "bank-marker" from the bank, so its absence from the other builds proves nothing/,
  );
  assert.match(failures[0], /never a constant only a dead branch reads/);
});

test("fails a development export missing a mock marker", () => {
  const failures = checkWith(
    fakeExpoExport({
      bundleTextFor: bundleTextExceptFor(
        "development android",
        "bank-marker;trace-marker",
      ),
    }),
  );

  assert.equal(failures.length, 1);
  assert.match(failures[0], /^development android export lacks "msw-marker"/);
});

test("fails a demo export that carries the render trace", () => {
  const failures = checkWith(
    fakeExpoExport({
      bundleTextFor: bundleTextExceptFor(
        "demo android",
        "bank-marker;msw-marker;trace-marker",
      ),
    }),
  );

  assert.equal(failures.length, 1);
  assert.match(failures[0], /^demo android export carries "trace-marker"/);
});

test("fails a development export missing the render trace", () => {
  const failures = checkWith(
    fakeExpoExport({
      bundleTextFor: bundleTextExceptFor(
        "development android",
        "bank-marker;msw-marker",
      ),
    }),
  );

  assert.equal(failures.length, 1);
  assert.match(failures[0], /^development android export lacks "trace-marker"/);
});

test("never checks a marker with no text", () => {
  const markers = [
    ...MARKERS.slice(0, 2),
    { source: "the render trace", text: "", carriedBy: ["development"] },
  ];

  const failures = checkWith(
    fakeExpoExport({
      bundleTextFor: bundleTextExceptFor(
        "development android",
        "bank-marker;msw-marker",
      ),
    }),
    { markers },
  );

  assert.deepEqual(failures, []);
});

test("fails an export that wrote no JavaScript bundle rather than reading its zeros as clean", () => {
  const failures = checkWith(
    fakeExpoExport({
      bundleTextFor: bundleTextExceptFor("production android", null),
    }),
  );

  assert.equal(failures.length, 1);
  assert.match(
    failures[0],
    /^production android export wrote no JavaScript bundle/,
  );
});

test("fails an export that does not finish", () => {
  const failures = checkWith(
    fakeExpoExport({
      exitStatusFor: (run) => (exportRunLabel(run) === "demo ios" ? 1 : 0),
    }),
  );

  assert.equal(failures.length, 1);
  assert.match(failures[0], /^demo ios export did not finish: exit 1/);
});

test("refuses an unknown platform before running any export", () => {
  const fake = fakeExpoExport();

  assert.throws(
    () =>
      checkWith(fake, {
        exportRuns: [
          { variant: "production", platform: "android" },
          { variant: "production", platform: "web" },
        ],
      }),
    /Unknown platform "web"/,
  );
  assert.equal(fake.exportCalls.length, 0);
});
