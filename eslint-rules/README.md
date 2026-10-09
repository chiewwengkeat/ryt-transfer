# eslint-rules

This repository's lint rules live in [`.config/eslint/rules/`](../.config/eslint/rules/).

This folder holds only this file, and stays: the coding-agent tooling used on this repository treats a
repository as a frontend one only while a folder of this name sits at its root, and switches its guards
off without it. A rule put here is never loaded, so add none.
