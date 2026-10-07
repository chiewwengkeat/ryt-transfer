const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DEMO_LAYER_VARIANTS = ["demo", "development"];

// Strings each group's code uses at runtime: minify drops a constant only a dead branch reads.
const BUNDLE_MARKERS = [
  {
    source: "src/mocks/bank",
    text: "cus_4f7e2a91",
    carriedBy: DEMO_LAYER_VARIANTS,
  },
  {
    source: "src/mocks/handlers",
    text: "*/transfers/:transferId",
    carriedBy: DEMO_LAYER_VARIANTS,
  },
  {
    source: "src/mocks/scenarios",
    text: "transfer.balance_and_limit_shown",
    carriedBy: DEMO_LAYER_VARIANTS,
  },
  // The store holds no string of its own; the module transform writes its export name as one.
  {
    source: "src/mocks/switcher",
    text: "switcherStore",
    carriedBy: DEMO_LAYER_VARIANTS,
  },
  {
    source: "src/mocks/transport",
    text: "Unhandled Exception",
    carriedBy: DEMO_LAYER_VARIANTS,
  },
  {
    source: "msw's request-handling core",
    text: "kDefaultContentType",
    carriedBy: DEMO_LAYER_VARIANTS,
  },
  // Empty until the render trace exists: a placeholder would fail the development export.
  { source: "the render trace", text: "", carriedBy: ["development"] },
];

const EXPORT_RUNS = [
  { variant: "production", platform: "android" },
  { variant: "production", platform: "ios" },
  // Unset builds as production, and a negated gate (`!== "production"`) leaks only here.
  { variant: undefined, platform: "android" },
  { variant: "demo", platform: "android" },
  { variant: "demo", platform: "ios" },
  { variant: "development", platform: "android" },
];

function checkProductionBundle({
  projectDir,
  runCommand = spawnSync,
  markers = BUNDLE_MARKERS,
  exportRuns = EXPORT_RUNS,
}) {
  const unknownPlatformRun = exportRuns.find(
    ({ platform }) => platform !== "android" && platform !== "ios",
  );
  if (unknownPlatformRun)
    throw new Error(
      `Unknown platform "${unknownPlatformRun.platform}": each export must be android or ios, so its counts come from one bundle.`,
    );

  const outputRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "production-bundle-"),
  );
  const failures = [];
  try {
    for (const { variant, platform } of exportRuns) {
      const exportLabel = `${variant ?? "unset-variant"} ${platform} export`;
      const outputDir = path.join(
        outputRoot,
        `${variant ?? "unset"}-${platform}`,
      );
      const env = {
        ...process.env,
        EXPO_NO_DOTENV: "1",
        EXPO_PUBLIC_APP_VARIANT: variant,
      };
      if (variant === undefined) delete env.EXPO_PUBLIC_APP_VARIANT;
      const exportResult = runCommand(
        path.join(projectDir, "node_modules", ".bin", "expo"),
        [
          "export",
          "--platform",
          platform,
          "--no-bytecode",
          "--clear",
          "--output-dir",
          outputDir,
        ],
        { cwd: projectDir, env, stdio: "inherit" },
      );
      if (exportResult.status !== 0) {
        failures.push(
          `${exportLabel} did not finish: ${exportResult.error ?? `exit ${exportResult.status}`}`,
        );
        continue;
      }

      const outputFiles = fs
        .readdirSync(outputDir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => path.join(entry.parentPath, entry.name));
      if (!outputFiles.some((file) => file.endsWith(".js"))) {
        failures.push(
          `${exportLabel} wrote no JavaScript bundle, so its zeros prove nothing.`,
        );
        continue;
      }
      const outputContents = outputFiles.map((file) => fs.readFileSync(file));
      for (const { source, text, carriedBy } of markers) {
        if (text === "") continue;
        let foundCount = 0;
        for (const content of outputContents)
          for (
            let at = content.indexOf(text);
            at !== -1;
            at = content.indexOf(text, at + text.length)
          )
            foundCount += 1;
        const mustCarry = carriedBy.includes(variant);
        if (!mustCarry && foundCount > 0)
          failures.push(
            `${exportLabel} carries "${text}" from ${source} (${foundCount} found); only ${carriedBy.join(" and ")} builds may.`,
          );
        if (mustCarry && foundCount === 0)
          failures.push(
            `${exportLabel} lacks "${text}" from ${source}, so its absence from the other builds proves nothing. If ${source} no longer uses it, replace it with another string that code uses at runtime — never a constant only a dead branch reads, which minify drops — and that no app code contains.`,
          );
      }
    }
  } finally {
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
  return failures;
}

if (require.main === module) {
  const failures = checkProductionBundle({
    projectDir: path.resolve(process.argv[2] ?? path.join(__dirname, "..")),
  });
  for (const failure of failures) console.error(failure);
  console.log(
    `production bundle: ${EXPORT_RUNS.length} exports checked, ${failures.length} failures`,
  );
  process.exitCode = failures.length > 0 ? 1 : 0;
}

module.exports = { BUNDLE_MARKERS, checkProductionBundle };
