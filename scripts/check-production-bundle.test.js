const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const {
  BUNDLE_MARKERS,
  checkProductionBundle,
} = require("./check-production-bundle");

const PROJECT_DIR = "/project";
const MARKERS = [
  {
    source: "the bank",
    text: "bank-marker",
    carriedBy: ["demo", "development"],
  },
  { source: "msw", text: "msw-marker", carriedBy: ["demo", "development"] },
  {
    source: "src/shared/observability/render-trace.ts",
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

function bundledFilesWhenEveryGateHolds({ variant }) {
  return [
    "/src/app/_layout.tsx",
    "/node_modules/.pnpm/react@19.2.0/node_modules/react/index.js",
    ...(["demo", "development"].includes(variant)
      ? [
          "/src/mocks/demo-bank.ts",
          "/node_modules/.pnpm/msw@2.15.0/node_modules/msw/lib/core/http.mjs",
        ]
      : []),
  ];
}

function sourceMapExceptFor(label, bundledFiles) {
  return (run) => [
    {
      sources:
        exportRunLabel(run) === label
          ? bundledFiles
          : bundledFilesWhenEveryGateHolds(run),
    },
  ];
}

function fakeExpoExport({
  bundleTextFor = bundleTextWhenEveryGateHolds,
  sourceMapsFor = (run) => [{ sources: bundledFilesWhenEveryGateHolds(run) }],
  exportResultFor = () => ({ status: 0 }),
} = {}) {
  const exportCalls = [];
  const runCommand = (command, args, options) => {
    const run = {
      variant: options.env.EXPO_PUBLIC_APP_VARIANT,
      platform: args[args.indexOf("--platform") + 1],
    };
    exportCalls.push({ command, args, options, label: exportRunLabel(run) });
    const outputDir = args[args.indexOf("--output-dir") + 1];
    const bundleDir = path.join(outputDir, "_expo/static/js", run.platform);
    fs.mkdirSync(bundleDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, "metadata.json"), "{}");
    const bundleText = bundleTextFor(run);
    if (bundleText !== null)
      fs.writeFileSync(path.join(bundleDir, "entry.js"), bundleText);
    for (const [index, sourceMap] of sourceMapsFor(run).entries())
      fs.writeFileSync(
        path.join(bundleDir, `entry-${index}.js.map`),
        JSON.stringify(sourceMap),
      );
    return exportResultFor(run);
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

test("runs every export with Metro's cache cleared, JavaScript rather than bytecode, a source map and no .env file", () => {
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
    assert.ok(args.includes("--source-maps"));
    assert.equal(options.env.EXPO_NO_DOTENV, "1");
    assert.equal(options.cwd, PROJECT_DIR);
  }
});

test("ships one marker with text for each mock group and msw's core, carried by demo and development, and for the render trace and its measurement, carried by development alone", () => {
  assert.deepEqual(
    BUNDLE_MARKERS.map(
      ({ source, carriedBy }) => `${source}: ${carriedBy.join(" and ")}`,
    ).sort(),
    [
      "msw's request-handling core: demo and development",
      "src/mocks/bank: demo and development",
      "src/mocks/handlers: demo and development",
      "src/mocks/scenarios: demo and development",
      "src/mocks/switcher: demo and development",
      "src/mocks/transport: demo and development",
      "src/screens/transfer/TransferHistoryScreen/components/SectionTransferAccordion/hooks/use-transfer-history-render-measurement.ts: development",
      "src/shared/observability/render-trace.ts: development",
    ],
  );
  for (const { source, text } of BUNDLE_MARKERS)
    assert.notEqual(text, "", source);
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
  assert.match(failures[0], /and that no code outside the bank contains\.$/);
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

test("fails a development export missing the render trace, asking for a string no code outside the trace contains", () => {
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
  assert.match(
    failures[0],
    /and that no code outside src\/shared\/observability\/render-trace\.ts contains\.$/,
  );
});

for (const markerText of ["ryt-render-trace", "pullToRefreshWithNothingNew"]) {
  const shippedTextFor = (variant, keepsMarker = true) =>
    BUNDLE_MARKERS.filter(
      ({ carriedBy, text }) =>
        carriedBy.includes(variant) && (keepsMarker || text !== markerText),
    )
      .map(({ text }) => text)
      .join(";");

  test(`fails a development export lacking ${markerText}`, () => {
    const failures = checkWith(
      fakeExpoExport({
        bundleTextFor: ({ variant }) =>
          shippedTextFor(variant, variant !== "development"),
      }),
      { markers: BUNDLE_MARKERS },
    );

    assert.equal(failures.length, 1);
    assert.match(
      failures[0],
      new RegExp(`^development android export lacks "${markerText}"`),
    );
  });

  test(`fails a demo or production export carrying ${markerText}`, () => {
    const failures = checkWith(
      fakeExpoExport({
        bundleTextFor: (run) =>
          ["demo ios", "production android"].includes(exportRunLabel(run))
            ? `${shippedTextFor(run.variant)};${markerText}`
            : shippedTextFor(run.variant),
      }),
      { markers: BUNDLE_MARKERS },
    );

    assert.equal(failures.length, 2);
    assert.match(
      failures[0],
      new RegExp(`^production android export carries "${markerText}"`),
    );
    assert.match(
      failures[1],
      new RegExp(`^demo ios export carries "${markerText}"`),
    );
  });
}

test("refuses a marker that has no text, before running any export", () => {
  const fake = fakeExpoExport();

  assert.throws(
    () =>
      checkWith(fake, {
        markers: [{ ...MARKERS[0], text: "" }, ...MARKERS.slice(1)],
      }),
    /The marker for the bank has no text/,
  );
  assert.equal(fake.exportCalls.length, 0);
});

test("refuses the marker for src/shared/observability/render-trace.ts when it has no text", () => {
  const fake = fakeExpoExport();

  assert.throws(
    () =>
      checkWith(fake, {
        markers: [...MARKERS.slice(0, 2), { ...MARKERS[2], text: "" }],
      }),
    /The marker for src\/shared\/observability\/render-trace\.ts has no text/,
  );
  assert.equal(fake.exportCalls.length, 0);
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

test("counts a marker in any file an export writes, not only its JavaScript", () => {
  const fake = fakeExpoExport();
  const failures = checkWith({
    runCommand: (command, args, options) => {
      const exportResult = fake.runCommand(command, args, options);
      if (fake.exportCalls.at(-1).label === "production android") {
        const assetsDir = path.join(
          args[args.indexOf("--output-dir") + 1],
          "assets",
        );
        fs.mkdirSync(assetsDir);
        fs.writeFileSync(path.join(assetsDir, "3f9c2a"), "bank-marker");
      }
      return exportResult;
    },
  });

  assert.equal(failures.length, 1);
  assert.match(failures[0], /^production android export carries "bank-marker"/);
});

test("reads markers from the bundle, never from its source map, which keeps the text minify drops", () => {
  const failures = checkWith(
    fakeExpoExport({
      bundleTextFor: bundleTextExceptFor("demo android", "bank-marker"),
      sourceMapsFor: (run) => [
        {
          sources: bundledFilesWhenEveryGateHolds(run),
          sourcesContent: ["bank-marker;msw-marker;trace-marker"],
        },
      ],
    }),
  );

  assert.equal(failures.length, 1);
  assert.match(failures[0], /^demo android export lacks "msw-marker"/);
});

test("fails a production export whose source map lists a mock file, naming it", () => {
  const failures = checkWith(
    fakeExpoExport({
      sourceMapsFor: sourceMapExceptFor("production android", [
        "/src/app/_layout.tsx",
        "/src/mocks/bank/malaysia-time.ts",
      ]),
    }),
  );

  assert.equal(failures.length, 1);
  assert.match(
    failures[0],
    /^production android export's source map lists files from src\/mocks\/ or msw \(1 found\): \/src\/mocks\/bank\/malaysia-time\.ts;/,
  );
});

test("fails the unset-variant export whose source map lists an msw file", () => {
  const failures = checkWith(
    fakeExpoExport({
      sourceMapsFor: sourceMapExceptFor("unset android", [
        "/src/app/_layout.tsx",
        "/node_modules/.pnpm/@mswjs+interceptors@0.39.2/node_modules/@mswjs/interceptors/lib/node/index.mjs",
      ]),
    }),
  );

  assert.equal(failures.length, 1);
  assert.match(
    failures[0],
    /^unset-variant android export's source map lists files from src\/mocks\/ or msw \(1 found\)/,
  );
});

test("names at most ten of the files a production source map lists from src/mocks/ or msw", () => {
  const failures = checkWith(
    fakeExpoExport({
      sourceMapsFor: sourceMapExceptFor("production ios", [
        "/src/app/_layout.tsx",
        ...Array.from(
          { length: 12 },
          (_, index) => `/src/mocks/bank/module-${index}.ts`,
        ),
      ]),
    }),
  );

  assert.equal(failures.length, 1);
  assert.match(failures[0], /\(12 found\): .*\/module-9\.ts;/);
  assert.doesNotMatch(failures[0], /module-10\.ts/);
});

test("fails a demo export whose source map lists no file from src/mocks/", () => {
  const failures = checkWith(
    fakeExpoExport({
      sourceMapsFor: sourceMapExceptFor("demo ios", [
        "/src/app/_layout.tsx",
        "/node_modules/.pnpm/msw@2.15.0/node_modules/msw/lib/core/http.mjs",
      ]),
    }),
  );

  assert.equal(failures.length, 1);
  assert.match(
    failures[0],
    /^demo ios export's source map lists no file from src\/mocks\//,
  );
});

test("fails a development export whose source map lists no file from src/mocks/", () => {
  const failures = checkWith(
    fakeExpoExport({
      sourceMapsFor: sourceMapExceptFor("development android", [
        "/src/app/_layout.tsx",
        "/node_modules/.pnpm/msw@2.15.0/node_modules/msw/lib/core/http.mjs",
      ]),
    }),
  );

  assert.equal(failures.length, 1);
  assert.match(
    failures[0],
    /^development android export's source map lists no file from src\/mocks\//,
  );
});

test("fails a demo export whose source map lists no file from msw", () => {
  const failures = checkWith(
    fakeExpoExport({
      sourceMapsFor: sourceMapExceptFor("demo android", [
        "/src/app/_layout.tsx",
        "/src/mocks/demo-bank.ts",
      ]),
    }),
  );

  assert.equal(failures.length, 1);
  assert.match(
    failures[0],
    /^demo android export's source map lists no file from msw/,
  );
});

test("fails a development export whose source map lists no file from msw", () => {
  const failures = checkWith(
    fakeExpoExport({
      sourceMapsFor: sourceMapExceptFor("development android", [
        "/src/app/_layout.tsx",
        "/src/mocks/demo-bank.ts",
      ]),
    }),
  );

  assert.equal(failures.length, 1);
  assert.match(
    failures[0],
    /^development android export's source map lists no file from msw/,
  );
});

test("fails an export that wrote no source map, or one listing nothing under src/app/", () => {
  const failures = checkWith(
    fakeExpoExport({
      sourceMapsFor: (run) =>
        ({
          "production android": [],
          "demo ios": [
            {
              sources: [
                "/src/mocks/demo-bank.ts",
                "/node_modules/msw/lib/core/http.mjs",
              ],
            },
          ],
        })[exportRunLabel(run)] ?? [
          { sources: bundledFilesWhenEveryGateHolds(run) },
        ],
    }),
  );

  assert.equal(failures.length, 2);
  assert.match(
    failures[0],
    /^production android export wrote no source map that lists src\/app\//,
  );
  assert.match(
    failures[1],
    /^demo ios export wrote no source map that lists src\/app\//,
  );
});

test("fails an export whose source map lists files from anywhere but the project root", () => {
  const failures = checkWith(
    fakeExpoExport({
      sourceMapsFor: sourceMapExceptFor("production android", [
        "/home/runner/work/app/app/src/app/_layout.tsx",
        "/home/runner/work/app/app/src/mocks/demo-bank.ts",
      ]),
    }),
  );

  assert.equal(failures.length, 1);
  assert.match(
    failures[0],
    /^production android export wrote no source map that lists src\/app\//,
  );
});

test("takes only the project's own src/mocks/ and msw's own packages for the demo layer's files", () => {
  const failures = checkWith(
    fakeExpoExport({
      sourceMapsFor: sourceMapExceptFor("production android", [
        "/src/app/_layout.tsx",
        "/node_modules/.pnpm/fixtures-kit@1.0.0/node_modules/fixtures-kit/src/mocks/user.js",
        "/node_modules/.pnpm/msw-storybook-addon@2.0.0/node_modules/msw-storybook-addon/dist/index.mjs",
        "/node_modules/.pnpm/msw@2.15.0/node_modules/statuses/index.js",
      ]),
    }),
  );

  assert.deepEqual(failures, []);
});

test("reads the files of every source map an export writes", () => {
  const failures = checkWith(
    fakeExpoExport({
      sourceMapsFor: (run) =>
        exportRunLabel(run) === "demo android"
          ? [
              { sources: ["/src/app/_layout.tsx", "/src/mocks/demo-bank.ts"] },
              {
                sources: [
                  "/node_modules/.pnpm/msw@2.15.0/node_modules/msw/lib/core/http.mjs",
                ],
              },
            ]
          : [{ sources: bundledFilesWhenEveryGateHolds(run) }],
    }),
  );

  assert.deepEqual(failures, []);
});

test("fails an export that does not finish", () => {
  const failures = checkWith(
    fakeExpoExport({
      exportResultFor: (run) => ({
        status: exportRunLabel(run) === "demo ios" ? 1 : 0,
      }),
    }),
  );

  assert.equal(failures.length, 1);
  assert.match(failures[0], /^demo ios export did not finish: exit 1/);
});

test("fails an export that a signal stopped, even when it wrote a bundle", () => {
  const failures = checkWith(
    fakeExpoExport({
      exportResultFor: (run) =>
        exportRunLabel(run) === "demo ios"
          ? { status: null, signal: "SIGKILL" }
          : { status: 0 },
    }),
  );

  assert.equal(failures.length, 1);
  assert.match(failures[0], /^demo ios export did not finish/);
});

test("stops an export at its time limit with a signal it cannot trap, and fails it by name", () => {
  const fake = fakeExpoExport({
    exportResultFor: (run) =>
      exportRunLabel(run) === "demo ios"
        ? {
            status: null,
            signal: "SIGKILL",
            error: Object.assign(new Error("spawnSync expo ETIMEDOUT"), {
              code: "ETIMEDOUT",
            }),
          }
        : { status: 0 },
  });

  const failures = checkWith(fake);

  for (const { label, options } of fake.exportCalls) {
    assert.ok(Number.isFinite(options.timeout) && options.timeout > 0, label);
    assert.equal(options.killSignal, "SIGKILL", label);
  }
  assert.equal(failures.length, 1);
  assert.match(
    failures[0],
    /^demo ios export did not finish within \d+ minutes/,
  );
});

test("refuses any platform but android and ios before running any export", () => {
  for (const platform of ["web", "all"]) {
    const fake = fakeExpoExport();

    assert.throws(
      () =>
        checkWith(fake, {
          exportRuns: [
            { variant: "production", platform: "android" },
            { variant: "production", platform },
          ],
        }),
      new RegExp(`Unknown platform "${platform}"`),
    );
    assert.equal(fake.exportCalls.length, 0);
  }
});

test("removes every export's output once it has read it", () => {
  const fake = fakeExpoExport();

  checkWith(fake);

  for (const { args } of fake.exportCalls)
    assert.equal(
      fs.existsSync(path.dirname(args[args.indexOf("--output-dir") + 1])),
      false,
    );
});

const SHIPPED_BUNDLE_BY_VARIANT = Object.fromEntries(
  ["production", "unset", "demo", "development"].map((variant) => [
    variant,
    {
      text: BUNDLE_MARKERS.filter(({ carriedBy }) =>
        carriedBy.includes(variant),
      )
        .map(({ text }) => text)
        .join(";"),
      sources: bundledFilesWhenEveryGateHolds({ variant }),
    },
  ]),
);

function runCheckInProjectWithStubExpo(t, bundleByVariant) {
  const projectDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "production-bundle-cli-"),
  );
  t.after(() => fs.rmSync(projectDir, { recursive: true, force: true }));
  const binDir = path.join(projectDir, "node_modules", ".bin");
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(
    path.join(binDir, "expo"),
    `#!${process.execPath}
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const bundleDir = path.join(args[args.indexOf("--output-dir") + 1], "_expo/static/js", args[args.indexOf("--platform") + 1]);
fs.mkdirSync(bundleDir, { recursive: true });
const bundle = ${JSON.stringify(bundleByVariant)}[process.env.EXPO_PUBLIC_APP_VARIANT ?? "unset"];
fs.writeFileSync(path.join(bundleDir, "entry.js"), bundle.text);
fs.writeFileSync(path.join(bundleDir, "entry.js.map"), JSON.stringify({ sources: bundle.sources }));
`,
    { mode: 0o755 },
  );
  // A copy inside the project: CI passes no argument, so the default project dir is what it runs.
  const scriptCopy = path.join(
    projectDir,
    "scripts",
    "check-production-bundle.js",
  );
  fs.mkdirSync(path.dirname(scriptCopy));
  fs.copyFileSync(
    path.join(__dirname, "check-production-bundle.js"),
    scriptCopy,
  );
  return spawnSync(process.execPath, [scriptCopy], { encoding: "utf8" });
}

test("exits 1 when run as CI runs it and a production bundle carries a mock marker", (t) => {
  const result = runCheckInProjectWithStubExpo(t, {
    ...SHIPPED_BUNDLE_BY_VARIANT,
    production: {
      ...SHIPPED_BUNDLE_BY_VARIANT.production,
      text: BUNDLE_MARKERS.find(({ source }) => source === "src/mocks/bank")
        .text,
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /^production android export carries/m);
});

test("exits 0 when run as CI runs it and every bundle carries only what its variant should", (t) => {
  const result = runCheckInProjectWithStubExpo(t, SHIPPED_BUNDLE_BY_VARIANT);

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    new RegExp(
      `6 exports checked, ${BUNDLE_MARKERS.length} markers in each, 0 failures`,
    ),
  );
});
