const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DEMO_LAYER_VARIANTS = ["demo", "development"];
const RENDER_TRACE = "the render trace";

// Strings each group's code uses at runtime: minify drops a constant only a dead branch reads.
// An export name survives minify too: Metro's module transform writes it as a property of exports.
const BUNDLE_MARKERS = [
  {
    source: "src/mocks/bank",
    text: "cus_4f7e2a91",
    carriedBy: DEMO_LAYER_VARIANTS,
  },
  // Not a route path: the scenarios bring those into a bundle that holds no handler.
  {
    source: "src/mocks/handlers",
    text: "transferHandlers",
    carriedBy: DEMO_LAYER_VARIANTS,
  },
  {
    source: "src/mocks/scenarios",
    text: "transfer.balance_and_limit_shown",
    carriedBy: DEMO_LAYER_VARIANTS,
  },
  {
    source: "src/mocks/switcher",
    text: "switcherStore",
    carriedBy: DEMO_LAYER_VARIANTS,
  },
  // Not one of its literals: msw's own packages and React Native's fetch carry those too.
  {
    source: "src/mocks/transport",
    text: "createDemoSend",
    carriedBy: DEMO_LAYER_VARIANTS,
  },
  {
    source: "msw's request-handling core",
    text: "kDefaultContentType",
    carriedBy: DEMO_LAYER_VARIANTS,
  },
  // Empty until the render trace exists: a placeholder would fail the development export.
  { source: RENDER_TRACE, text: "", carriedBy: ["development"] },
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
  const emptyTextMarker = markers.find(
    ({ source, text }) => text === "" && source !== RENDER_TRACE,
  );
  if (emptyTextMarker)
    throw new Error(
      `The marker for ${emptyTextMarker.source} has no text, so it would check nothing: only the render trace's may be empty, until the trace exists.`,
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
          "--source-maps",
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
      // Not the source map: it holds each module's original source, dead branches included.
      const outputContents = outputFiles
        .filter((file) => !file.endsWith(".map"))
        .map((file) => fs.readFileSync(file));
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
            `${exportLabel} lacks "${text}" from ${source}, so its absence from the other builds proves nothing. If ${source} no longer uses it, replace it with another string that code uses at runtime — never a constant only a dead branch reads, which minify drops — and that no ${source === RENDER_TRACE ? "other " : ""}app code contains.`,
          );
      }

      // Map paths start at the project root, so a package's own src/mocks/ never matches, and a
      // map listing no src/app/ file has changed form: its zeros below would prove nothing.
      const bundledFiles = outputFiles
        .filter((file) => file.endsWith(".map"))
        .flatMap((file) => JSON.parse(fs.readFileSync(file, "utf8")).sources);
      if (!bundledFiles.some((file) => file.startsWith("/src/app/"))) {
        failures.push(
          `${exportLabel} wrote no source map that lists src/app/, so the files a map leaves out prove nothing.`,
        );
        continue;
      }
      const mockFiles = bundledFiles.filter((file) =>
        file.startsWith("/src/mocks/"),
      );
      const mswFiles = bundledFiles.filter((file) =>
        /\/node_modules\/(msw|@mswjs)\//.test(file),
      );
      if (!DEMO_LAYER_VARIANTS.includes(variant)) {
        const leakedFiles = [...mockFiles, ...mswFiles];
        if (leakedFiles.length > 0)
          failures.push(
            `${exportLabel}'s source map lists files from src/mocks/ or msw (${leakedFiles.length} found): ${leakedFiles.slice(0, 10).join(", ")}; only ${DEMO_LAYER_VARIANTS.join(" and ")} builds may.`,
          );
        continue;
      }
      if (mockFiles.length === 0)
        failures.push(
          `${exportLabel}'s source map lists no file from src/mocks/, so their absence from the other builds' maps proves nothing.`,
        );
      if (mswFiles.length === 0)
        failures.push(
          `${exportLabel}'s source map lists no file from msw, so their absence from the other builds' maps proves nothing.`,
        );
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
    `production bundle: ${EXPORT_RUNS.length} exports checked, ${BUNDLE_MARKERS.filter(({ text }) => text !== "").length} of ${BUNDLE_MARKERS.length} markers in each, ${failures.length} failures`,
  );
  process.exitCode = failures.length > 0 ? 1 : 0;
}

module.exports = { BUNDLE_MARKERS, checkProductionBundle };
