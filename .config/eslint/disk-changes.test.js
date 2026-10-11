const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { ESLint } = require("eslint");
const { importX } = require("eslint-plugin-import-x");
const tseslint = require("typescript-eslint");

// CI marks a run one-off, which turns the watching off, so this file sets it aside before loading the module.
delete process.env.CI;
const diskChanges = require("./disk-changes");

test("disk-changes: a long-running ESLint sees a type fixed on disk after it first linted", async () => {
  const project = makeProject({
    "draft.ts":
      'import type { Money } from "./moved-money";\nexport const draft: { amount: Money } = { amount: { minor: 1 } };\n',
  });
  const eslint = longRunningESLint(project);
  assert.deepEqual(await ruleIds(eslint, project), [
    "@typescript-eslint/no-unsafe-argument",
  ]);

  replaceInFile(project, "draft.ts", "./moved-money", "./money");

  assert.deepEqual(await lintUntilClean(eslint, project), []);
});

test("disk-changes: a long-running ESLint resolves a module that reappears on disk", async () => {
  const project = makeProject({});
  const money = path.join(project, "money.ts");
  const text = fs.readFileSync(money, "utf8");
  fs.rmSync(money);
  const eslint = longRunningESLint(project);
  assert.ok(
    (await ruleIds(eslint, project)).includes("import-x/no-unresolved"),
  );

  fs.writeFileSync(money, text);

  assert.deepEqual(await lintUntilClean(eslint, project), []);
});

test("disk-changes: an editor's ESLint server exits once its lint config changes, for VS Code to restart", async () => {
  const project = makeProject({});
  const env = { ...process.env, DISK_CHANGES_MIN_UPTIME_MS: "0" };
  delete env.CI;
  const server = spawn(
    process.execPath,
    ["-e", languageServer(project), "--", "--clientProcessId=1"],
    { env, stdio: ["ignore", "pipe", "inherit"] },
  );
  try {
    await once(server.stdout, "data");

    fs.writeFileSync(
      path.join(project, "eslint.config.mjs"),
      "export default [];\n",
    );

    const [code] = await Promise.race([
      once(server, "exit"),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("the server never exited")), 15_000),
      ),
    ]);
    assert.equal(code, 0);
  } finally {
    server.kill();
  }
});

function languageServer(project) {
  return `
    const { ESLint } = require(${JSON.stringify(require.resolve("eslint"))});
    const diskChanges = require(${JSON.stringify(require.resolve("./disk-changes"))});
    const project = ${JSON.stringify(project)};
    new ESLint({
      cwd: project,
      overrideConfigFile: true,
      overrideConfig: [{
        files: ["**/*.ts"],
        languageOptions: {
          parser: diskChanges.typescriptParser,
          parserOptions: { projectService: true, tsconfigRootDir: project },
        },
      }],
    })
      .lintFiles([${JSON.stringify(path.join(project, "a.ts"))}])
      .then(() => process.stdout.write("ready"));
    setInterval(() => {}, 1000);
  `;
}

function makeProject(overrides) {
  const project = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "disk-changes-")),
  );
  const files = {
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        strict: true,
        module: "esnext",
        moduleResolution: "bundler",
      },
      include: ["*.ts"],
    }),
    "money.ts":
      "export type Money = { minor: number };\nexport function formatMoney(money: Money): string {\n  return String(money.minor);\n}\n",
    "draft.ts":
      'import type { Money } from "./money";\nexport const draft: { amount: Money } = { amount: { minor: 1 } };\n',
    "a.ts":
      'import { draft } from "./draft";\nimport { formatMoney } from "./money";\nexport const shown = formatMoney(draft.amount);\n',
    ...overrides,
  };
  for (const [name, text] of Object.entries(files))
    fs.writeFileSync(path.join(project, name), text);
  return project;
}

function longRunningESLint(project) {
  return new ESLint({
    cwd: project,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.ts"],
        languageOptions: {
          parser: diskChanges.typescriptParser,
          parserOptions: { projectService: true, tsconfigRootDir: project },
        },
        plugins: { "@typescript-eslint": tseslint.plugin, "import-x": importX },
        settings: {
          "import-x/resolver-next": [
            diskChanges.typescriptImportResolver({
              project: path.join(project, "tsconfig.json"),
            }),
          ],
          "import-x/cache": diskChanges.importCache,
        },
        rules: {
          "@typescript-eslint/no-unsafe-argument": "error",
          "import-x/no-unresolved": "error",
        },
      },
    ],
  });
}

async function ruleIds(eslint, project) {
  const [result] = await eslint.lintFiles([path.join(project, "a.ts")]);
  return result.messages.map((message) => message.ruleId);
}

async function lintUntilClean(eslint, project) {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const ids = await ruleIds(eslint, project);
    if (ids.length === 0 || Date.now() > deadline) return ids;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

function replaceInFile(project, name, from, to) {
  const file = path.join(project, name);
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(from, to));
}
