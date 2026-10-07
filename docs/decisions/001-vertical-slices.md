# 001. Vertical slices

## Context

This module is built as a bank's production code that a growing team of engineers extends as features multiply. Its folder layout decides how quickly an engineer finds the code they need and how often two engineers' changes collide. The layout has to make it obvious, at first glance, where new code goes, so that everyone files the same piece in the same place. It has to keep a feature's code together, and it has to give dependencies a direction a tool can enforce, because a boundary nobody enforces erodes in the first busy week.

## Decision

The app is plain folders in one Expo app, cut into two kinds of vertical slice:

- **Screens folders**, `src/screens/<flow>/`: a flow's screens, its state, and whatever only that flow uses.
- **Domains**, `src/domains/<area>/`: a business area's API, and whatever two or more screens folders use.

A screens folder and a domain about the same thing share a singular name. Code that knows nothing about banking lives in `src/shared/`, the routes in `src/app/` only re-export screens, and `src/shell/` holds the app's root. Imports run one way, from screens folders to domains to shared code, and never sideways. Each kind of slice exposes a fixed pattern of public files, with no index files, so the rules never grow as slices are added (`eslint.boundaries.mjs`). Each endpoint has a folder of its own, so adding one edits no shared file.

A component or hook is placed by who uses it, on the ladder in [CONTRIBUTING.md](../../CONTRIBUTING.md#where-a-component-or-hook-goes): inside the one screen that uses it, then the screens folder, then a domain, then shared code. `scripts/check-placement-ladder.js` fails one placed higher than its users need, and the import rules fail one placed too low.

The kind of slice is the folder it sits in, so where new code goes reads off the tree, and growth adds slices rather than rules. One tsconfig, one Jest config and one Metro graph serve the whole app; moving to packages later stays bounded work, since the lint patterns already name each slice's public files. The ladder's cost is that a component can move twice as its users widen.

## Rejected

- **A workspace package per slice, or packages for shared code.** The module resolver would enforce the boundaries, but every package needs its own `package.json`, tsconfig and test project, plus workspace tooling, and the mock layer's Metro alias would need proving again across packages. That pays now for a second app that does not exist.
- **Flow folders with no domains.** Nothing gives dependencies a direction, so the import graph tangles as slices multiply.
- **Bounded contexts.** Each grows into a monolith of its own, a payments context holding transfer, approval, QR and bills, with no rule inside it.
- **Feature-Sliced Design.** Its six layers split each feature across layers, so "which layer?" becomes a recurring call, and its `app` layer collides with Expo Router's `src/app`.
- **Screens written straight into `src/app/`.** The screens would become a layer outside their slice, and a flow's state would spread across route files.
- **An index file per slice.** Importing anything through an index loads every module it re-exports. The allow-list names the exact files other code may import, and as one pattern per kind of slice it never grows with the code.
- **One file per role in a domain**, every endpoint's types in one file and every hook in another. Past a handful of endpoints, each becomes the long file every endpoint change edits, and so the merge hotspot.
- **Placing a shared component by what it uses, not by who uses it.** Its folder would rest on a judgement about future reuse. Counting today's users reads off the code, at the cost of moving a component when its users change.
