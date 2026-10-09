const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

test("fails a misformatted file git would keep, though it is not added yet", () => {
  const exitCode = runFormatCheckIn({
    gitRepo: true,
    files: { "amount.ts": MISFORMATTED },
  });
  assert.equal(exitCode, 1);
});

test("passes a misformatted file the checkout excludes locally", () => {
  const exitCode = runFormatCheckIn({
    gitRepo: true,
    files: { "amount.ts": FORMATTED, "notes.local.ts": MISFORMATTED },
    locallyExcluded: ["notes.local.ts"],
  });
  assert.equal(exitCode, 0);
});

test("checks every file outside a work tree, so an exported tree is never skipped", () => {
  const exitCode = runFormatCheckIn({
    gitRepo: false,
    files: { "amount.ts": MISFORMATTED },
  });
  assert.equal(exitCode, 1);
});

const CHECK_SCRIPT = path.join(__dirname, "check-format.js");
const MISFORMATTED = "export const  amount=1\n";
const FORMATTED = "export const amount = 1;\n";

function runFormatCheckIn({ gitRepo, files, locallyExcluded = [] }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "check-format-"));
  // Inside a hook or a rebase, git exports variables that would aim these commands at this repo.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
  );
  const run = (command, args) =>
    spawnSync(command, args, { cwd: root, env, encoding: "utf8" });
  try {
    if (gitRepo) run("git", ["init", "-q"]);
    for (const [file, content] of Object.entries(files))
      fs.writeFileSync(path.join(root, file), content);
    if (locallyExcluded.length > 0)
      fs.appendFileSync(
        path.join(root, ".git/info/exclude"),
        locallyExcluded.join("\n") + "\n",
      );
    return run(process.execPath, [CHECK_SCRIPT]).status;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
