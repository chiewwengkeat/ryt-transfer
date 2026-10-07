const { spawnSync } = require("node:child_process");

module.exports = {
  extends: ["@commitlint/config-conventional"],
  plugins: [
    {
      rules: {
        "no-git-trailer": ({ raw }) => {
          const trailers = spawnSync("git", ["interpret-trailers", "--parse"], {
            input: raw ?? "",
            encoding: "utf8",
          }).stdout.trim();
          return [
            trailers === "",
            `commit messages carry no git trailer; found: ${trailers.replaceAll("\n", " | ")}`,
          ];
        },
      },
    },
  ],
  rules: {
    "scope-case": [2, "always", "lower-case"],
    "subject-case": [2, "always", "lower-case"],
    "no-git-trailer": [2, "always"],
  },
};
