const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const RELEASE_VARIANTS = new Set(["demo", "production"]);

function buildAndroidReleaseApk({
  variant,
  projectRoot,
  metroCacheDirectory,
  spawnCommand,
}) {
  if (!RELEASE_VARIANTS.has(variant))
    throw new Error(
      `The variant to build must be ${[...RELEASE_VARIANTS].join(" or ")}, not "${variant}".`,
    );
  const env = { ...process.env, EXPO_PUBLIC_APP_VARIANT: variant };
  const runBuildCommand = (command, args) => {
    const { status, signal, error } = spawnCommand(command, args, {
      cwd: projectRoot,
      env,
      stdio: "inherit",
    });
    if (status !== 0)
      throw new Error(
        `${[command, ...args].join(" ")} failed: ${error?.message ?? signal ?? `exit code ${status}`}`,
      );
  };
  const androidDirectory = path.join(projectRoot, "android");

  // Expo skips Gradle's reset of this cache under CI.
  fs.rmSync(metroCacheDirectory, { recursive: true, force: true });
  runBuildCommand(path.join(projectRoot, "node_modules", ".bin", "expo"), [
    "prebuild",
    projectRoot,
    "--clean",
    "--platform",
    "android",
  ]);
  runBuildCommand(path.join(androidDirectory, "gradlew"), [
    "-p",
    androidDirectory,
    "app:assembleRelease",
    "-PreactNativeArchitectures=arm64-v8a,x86_64",
  ]);

  const apkPath = path.join(projectRoot, "dist", `ryt-transfer-${variant}.apk`);
  fs.mkdirSync(path.dirname(apkPath), { recursive: true });
  fs.copyFileSync(
    path.join(
      androidDirectory,
      "app/build/outputs/apk/release/app-release.apk",
    ),
    apkPath,
  );
  return apkPath;
}

if (require.main === module) {
  try {
    const apkPath = buildAndroidReleaseApk({
      variant: process.argv[2],
      projectRoot: path.join(__dirname, ".."),
      metroCacheDirectory: path.join(os.tmpdir(), "metro-cache"),
      spawnCommand: spawnSync,
    });
    console.log(`Built ${apkPath}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { buildAndroidReleaseApk };
