const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const { buildAndroidReleaseApk } = require("./build-android-apk");

const COMPILED_APK_CONTENTS = "the release APK the stand-in Gradle wrote";

function buildInScratchProject(variant, { resultOf = {} } = {}) {
  const projectRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "build-android-apk-"),
  );
  const metroCacheDirectory = path.join(projectRoot, "metro-cache");
  const distDirectory = path.join(projectRoot, "dist");
  const maskProjectRoot = (text) => text.replace(projectRoot, "<root>");
  const commands = [];
  let error = null;
  try {
    fs.mkdirSync(metroCacheDirectory);
    buildAndroidReleaseApk({
      variant,
      projectRoot,
      metroCacheDirectory,
      spawnCommand: (command, args, { env }) => {
        commands.push({
          command: maskProjectRoot(command),
          args: args.map(maskProjectRoot),
          variant: env.EXPO_PUBLIC_APP_VARIANT,
          metroCacheExists: fs.existsSync(metroCacheDirectory),
        });
        const result = resultOf[path.basename(command)] ?? { status: 0 };
        if (path.basename(command) === "gradlew" && result.status === 0) {
          const apk = path.join(
            projectRoot,
            "android/app/build/outputs/apk/release/app-release.apk",
          );
          fs.mkdirSync(path.dirname(apk), { recursive: true });
          fs.writeFileSync(apk, COMPILED_APK_CONTENTS);
        }
        return result;
      },
    });
  } catch (caught) {
    error = caught;
  }
  const outcome = {
    error,
    commands,
    metroCacheExists: fs.existsSync(metroCacheDirectory),
    dist: fs.existsSync(distDirectory)
      ? Object.fromEntries(
          fs
            .readdirSync(distDirectory)
            .map((file) => [
              file,
              fs.readFileSync(path.join(distDirectory, file), "utf8"),
            ]),
        )
      : {},
  };
  fs.rmSync(projectRoot, { recursive: true, force: true });
  return outcome;
}

for (const variant of [undefined, "development", "constructor", "__proto__"]) {
  test(`refuses the variant ${variant} before clearing the cache or running a command`, () => {
    const build = buildInScratchProject(variant);

    assert.match(String(build.error), /must be demo or production/);
    assert.deepEqual(build.commands, []);
    assert.equal(build.metroCacheExists, true);
  });
}

test("clears Metro's cache, then runs a clean prebuild and a release compile for both ABIs, each with the variant set", () => {
  const build = buildInScratchProject("demo");

  assert.equal(build.error, null);
  assert.deepEqual(build.commands, [
    {
      command: "<root>/node_modules/.bin/expo",
      args: ["prebuild", "<root>", "--clean", "--platform", "android"],
      variant: "demo",
      metroCacheExists: false,
    },
    {
      command: "<root>/android/gradlew",
      args: [
        "-p",
        "<root>/android",
        "app:assembleRelease",
        "-PreactNativeArchitectures=arm64-v8a,x86_64",
      ],
      variant: "demo",
      metroCacheExists: false,
    },
  ]);
});

test("copies the compiled APK into dist under the variant's name", () => {
  const build = buildInScratchProject("production");

  assert.deepEqual(build.dist, {
    "ryt-transfer-production.apk": COMPILED_APK_CONTENTS,
  });
});

test("never compiles after a failed prebuild", () => {
  const build = buildInScratchProject("demo", {
    resultOf: { expo: { status: 1 } },
  });

  assert.match(String(build.error), /prebuild .* failed: exit code 1/);
  assert.deepEqual(
    build.commands.map(({ command }) => command),
    ["<root>/node_modules/.bin/expo"],
  );
});

test("copies nothing when a signal kills the compile", () => {
  const build = buildInScratchProject("demo", {
    resultOf: { gradlew: { status: null, signal: "SIGKILL" } },
  });

  assert.match(String(build.error), /failed: SIGKILL/);
  assert.deepEqual(build.dist, {});
});
