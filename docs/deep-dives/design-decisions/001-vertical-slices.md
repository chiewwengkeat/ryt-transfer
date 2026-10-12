# 001. Vertical slices

## Context

1. Built as a bank's production code: many more features will follow, added by FE engineers new to the codebase, with no context of the whole system or its patterns
2. The folder layout decides how fast an engineer finds the code they need, and how often two engineers' changes collide
3. So the layout must:
   1. Make it obvious at first glance where new code goes, so every engineer puts the same component in the same folder
   2. Keep a feature's code together
   3. Give dependencies a direction a tool can enforce: a boundary nobody enforces erodes in the first busy week

## Decision

Plain folders in one Expo app, cut into two kinds of vertical slice:

1. **Two kinds of slice**
   1. Screens folders, `src/screens/<flow>/`: a flow's screens, its state, and whatever only that flow uses
   2. Domains, `src/domains/<area>/`: a business area's API, and whatever two or more screens folders use
   3. A screens folder and a domain about the same thing share a singular name
2. **Around the slices**
   1. `src/shared/`: only code that knows nothing about banking
   2. `src/root/`: the app's root, what exists once for the whole app and every screen sits inside
   3. `src/app/`: routes re-export screens, their layouts hold the navigators, and the root layout re-exports the root view
3. **One import direction**: screens folders → domains → shared code, never sideways
   1. Each kind of slice exposes a fixed few patterns of public files, with no index files, so the rules never grow as slices are added (`.config/eslint/boundaries.mjs`)
   2. Each endpoint has a folder of its own, so a domain's API grows by folders
4. **Colocation first**: a component, hook or module lives as close to its consumers as possible, placed by who uses it, on the ladder in [CONTRIBUTING.md](../../../CONTRIBUTING.md#where-a-component-hook-or-module-goes)
   1. Inside the one screen that uses it → the screens folder → a domain once two screens folders use it → shared code
   2. A piece only the app's root uses lives in the one domain its files import; one importing no domain, or several slices, nests in the root view's own folders, even when only the root's modules use it
   3. Most components serve a single screen, so most stay beside it
   4. `scripts/check-placement-ladder.js` fails one placed higher than its consumers need, except a base component in `src/shared/ui/` that nothing uses yet, since it is built before any screen uses it; the import rules fail one placed too low
5. **Related records**: [decision 011](011-low-mental-load.md) sets how a small module folds into its one consumer, and how modules and tests are laid out; [decision 012](012-inline-or-own-folder.md), how a component's pieces inline or take a folder of their own

**Result**:

1. A slice's kind is the folder it sits in, so where new code goes reads off the tree, and growth adds slices, not rules
2. One tsconfig, one Jest config and one Metro graph serve the whole app; moving to packages later stays bounded work, since the lint patterns already name each slice's public files
3. Cost: a component can move twice as its consumers widen

## Rejected

1. **A workspace package per slice**. Reason: the module resolver would enforce the boundaries, but every package needs its own `package.json`, tsconfig and test project, plus workspace tooling, and the Metro resolver override that loads msw would need proving again across packages
2. **Packages only for code another FE consumer would share**. Reason: the slices would stay folders, but the shared code would need packaging and workspace tooling now, for a second FE consumer that doesn't exist; moving the shared code and the domains out first stays bounded work once one does
3. **Flow folders with no domains**. Reason: nothing gives dependencies a direction, so the import graph tangles as slices multiply
4. **One folder per business capability**. Reason: capabilities could import each other's public files (in one direction, with lint blocking cycles), where slices never import sideways, and each capability's folder would grow bigger
5. **Bounded contexts**. Reason: each grows into a monolith of its own, a payments context holding transfer, approval, QR and bills, with no rule inside it
6. **Feature-Sliced Design**. Reason: its six layers split each feature across layers, so "which layer?" becomes a recurring call, and its `app` layer collides with Expo Router's `src/app`
7. **Screens written straight into `src/app/`**. Reason: the screens would become a layer outside their slice, and a flow's state would spread across route files
8. **An index file per slice**. Reason: importing anything through an index loads every module it re-exports; the allow-list names the exact files other code may import, and as a fixed few patterns per kind of slice it never grows with the code
9. **One file per role in a domain** (every endpoint's types in one file, every hook in another). Reason: past a handful of endpoints, each becomes the long file every endpoint change edits, and so the merge-conflict hotspot
10. **A mechanical rule putting every component in `domains/`**. Reason: placement would need no judgement, but the screens folders would shrink to their screens; the ladder keeps a component beside the one screen that uses it until a wider consumer appears
11. **Placing a component by what it uses, not by who uses it**. Reason: placement would follow from the component alone; the ladder keeps most components beside the one screen that uses them, at the cost of moving one when its consumers widen
