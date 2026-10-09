const { spawnSync } = require("node:child_process");
const path = require("node:path");

// Inside a work tree, only the files git keeps: machine-local files are git's to exclude,
// so the shared ignore file never names them. An exported tree holds only kept files.
// eslint-disable-next-line fe/file-layout -- read at load by files
const listed = spawnSync(
  "git",
  ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf8" },
);
// eslint-disable-next-line fe/file-layout -- read at load by prettier
const files =
  listed.status === 0 ? listed.stdout.split("\0").filter(Boolean) : ["."];

// eslint-disable-next-line fe/file-layout -- read at load by process.exitCode
const prettier = spawnSync(
  path.join(__dirname, "..", "node_modules", ".bin", "prettier"),
  ["--check", "--ignore-unknown", "--no-error-on-unmatched-pattern", ...files],
  { stdio: "inherit" },
);
process.exitCode = prettier.status ?? 1;
