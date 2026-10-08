# Instructions for coding agents

Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing anything. It holds this repository's layout, placement, naming, scenario, testing, translation, build-variant and commit rules, and they bind an agent as they bind a person. Claude Code loads it through the import below; other tools show that line as plain text, so open the file yourself.

@CONTRIBUTING.md

Beyond it:

- Build, run and start Metro only through the package scripts (`pnpm start`, `pnpm ios`, `pnpm android:demo` and the rest). They set the build variant; a bare `npx expo …` command leaves it unset, which means production, where no mock bank answers.
- Use pnpm 12, or `npx pnpm@12.9.1` where it is not installed. npm and yarn ignore `pnpm-lock.yaml`.
- No commit carries a trailer, including the co-author line coding agents add by default: the `commit-msg` hook refuses the commit.
- Before you call a change done, run `pnpm typecheck`, `pnpm lint` and `pnpm test`, and report each one's result.
- Write a comment only for a why the code cannot show: a constraint, a platform quirk, or correct code that looks wrong. Never restate the code.
