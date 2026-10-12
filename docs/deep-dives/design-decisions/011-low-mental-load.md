# 011. Low mental load

## Context

The author set two principles for how this module's code is laid out, quoted as written:

> 1. Low mental load, when FE engineers view it
>    1. Low mental load means that line counts can't be too high for non-component files
>    2. Auxiliary helpers inside a file cannot be at the top, only the main exports, because viewers of the file is primarily interested in the main exports first only. Auxiliary helpers are only relevant if they're interested in fully understanding internals, which is usually not the goal (Usually the goal of viewing a file is to get a rough overview of it), so auxiliaries should generally be at the end of the file
>    3. Colocation is absolutely critical
>    4. When engineers see something, let's say some code, the less irrelevant information they see, the better. Examples:
>       1. Flat folder structure whereby attempting to view one file will necessarily have the engineer see dozens of different files unrelated to what they care about. See <code>src/test</code> folder, and <code>src/test/harness</code> folder
> 2. Unambiguity, such that different FE engineers do not easily have conflicting interpretations of the pattern for specific instances

Colocation sets a floor under file size, also in the author's words:

> The critical principle of colocation, means that the files realistically should have a floor. Meaning that for your re-architecture, splitting files for the sake of splitting it may not be a good idea, if the original file to split is not that large to begin with. … Not that large in the first place refers to about 200 lines for component files, and for tests, about 400 lines. … If it's below the floor, consolidation is preferred, though not required.
>
> The reason for consolidation is simply colocation, and reducing the number of jumps needed to understand a piece of something: Mental load.
>
> "Encapsulation" or "single responsibility" is somewhat secondary to this.
>
> Many small files means that for an engineer to understand a piece of something, he would have to jump many different places

And two asks about the file count: "I want the number of non-tooling files to be significantly reduced", and "ESLint files should not increase too much, and non-eslint tooling files should also be reduced".

Measured against them, the code fell short:

1. Test files ran to 2,869 lines, the longest with no `describe` at all
2. Helpers sat above the main code in 80 of 115 test files, and in 17 of the 56 app modules that are neither components nor hooks
3. `src/test` held 48 files, 31 of them loose at its top level, harness and repository checks mixed together
4. Scenario ids were spelled four ways, and a component's strings were filed three ways
5. Modules that are neither components nor hooks had no home of their own
6. The repository root listed 25 entries

## Decision

Every rule below serves the two principles; where two engineers could read a rule two ways, the rule names the case:

1. **Sizes**, counted on the file as committed
   1. A test file: at most 500 lines, tooling tests included; a split is allowed from about 350 and encouraged from about 420; a split's parts aim at 480 or fewer, leaving room for later lines
   2. A test file under about 200 lines merges into another file of its unit, where one can take it
   3. A module that is neither a component nor a test: at most about 320 lines
   4. Exact numbers once applied: module floor 100, component 200, module taking a fold 250, merged harness file 250, module cap 320, test floor 200, test cap 500
   5. The limits apply when a file is created, moved, split or folded; a file that later grows past one may be split then, and never must be
2. **Folds**
   1. A module under 100 lines whose only consumer in app code is another module folds into that module, smallest first, repeated until nothing more folds, while the consumer stays within 250 lines
   2. A module with a test of its own folds too; its test moves into the consumer's tests, unless that test checks what only a direct call can see
   3. A folded module keeps its name and body: relocated, not rewritten
   4. Nothing folds into a component file: [decision 012](012-inline-or-own-folder.md) sets when a piece inlines into a component's body and when it takes a folder of its own
   5. Never folds: the one file app code loads the mock BE through; a module loaded for its side effect; the wrappers around native libraries; a module a route imports or that sets up the whole app at load; the flow store and its refresh after an approval; the harness, which merges by role instead; a module another test mocks by its path
   6. An endpoint's `.type.ts` stays a file; a type file beside any other module folds into the module while the module stays within 250 lines
3. **Main exports first**
   1. Every file that is not a component opens with what it is for: a module with its exports, a test file with its setup then its tests, a script with the statements it runs; private helpers, constants and types follow
   2. This app's Babel compiles `const`, `let` and `enum` to `var`, so a value read before its definition is a silent `undefined`, never an error
   3. So a value the file reads at load stays above its reader, under a disable line naming that reader; a declaration kept above for another reason names that reason on the same line; `no-use-before-define` catches what is missed
   4. No autofix: moving a value read at load breaks the file
4. **Folders**
   1. Every plain module and hook sits in a folder of its own, `<x>/<x>.ts`, with its test and its role files beside it
   2. Exempt: routes, a screen's entry file, string bundles, each domain's `api/<area>.keys.ts`, test code and the scenario matrix
   3. A hook, named `use-*`, lives in `hooks/`; any other module that is not a component lives in `lib/`; a module exporting a hook beside plain functions is placed by its main export
   4. Both climb the same placement ladder as components; a piece with one consumer nests inside that consumer
   5. Tooling stays flat, each test beside its subject
5. **Imports**
   1. `./` inside a folder, `@/` once an import leaves it, so every importer outside a folder spells a module's path the same way
   2. Lint fails a `../` path in `src/` written as a quoted string in an import, an export, `require`, `import()` or a Jest module mock
   3. The one file that must climb out, the matrix scanner reading `.config/test-files.js`, says why on its line
6. **Tests**
   1. A screen's tests sit in its `tests/` folder, the root view's too; every other test sits beside its module
   2. Route tests split by behaviour: each behaviour's tests in one file, `<Screen>.<behaviour>.test.tsx`; a screen's small behaviours share its unsuffixed file
   3. A split or merge never adds or removes a `describe`, since that changes the full name of every test inside it
   4. A helper that one screen's test files share sits in its `tests/` folder as `<Screen>.<role>.ts`
   5. A repository check sits beside what it checks, named `.check.test.ts`: the suffix lets it import the mock BE and the root directly, and earns it no scenario credit
   6. The harness is sorted by role, into `setup/`, `render/`, `mock-bank/`, `doubles/`, `fixtures/` and `scenarios/`, with each role's small helpers merged
7. **The app's root**
   1. `src/root/` holds what exists once for the whole app and wraps every screen: the root view, and the modules a route imports or that set up the whole app at load
   2. A piece only the root uses lives in the one domain its files import; one importing no domain, or several slices, nests in the root view's own folders, even when only the root's modules use it
   3. A view that knows nothing about banking goes to `src/shared/ui/`; a banking-free piece stays beside its consumers until a second slice uses it
8. **The transfer flow's store**: `src/screens/transfer/flow-store/`, in four files: the store with every selector and the step analytics, the step reducers, the types, the test
9. **Strings**
   1. A component's strings sit under its own name; strings one module reads, under that module's name; a screen's group holds only the strings the screen file renders itself
   2. `common` holds only scenario strings and the groups two modules read, judged by the group rather than by each string
   3. Every scenario's strings live in the transfer domain's bundle, and its Demo menu title in the Demo menu's bundle
   4. The shared namespace is `shared`, and no namespace is the default: every shared string is written `t("shared:…")`, and a component names the namespaces it reads, so its keys are type-checked
10. **Scenario ids**
    1. One enum, `TransferScenarioId`, holds all 58 ids in the transfer domain; app code passes its members, tests pass the literal id, which the matrix check reads
    2. The mock registry must hold every member, so the compiler, the registry and the matrix check together keep the enum, the registry and the matrix equal
    3. A new scenario takes five edits: the matrix, the enum, the registry, its strings and Demo menu title, its route test
11. **The demo contract's type** lives in its one implementation, `src/mocks/demo-layer/demo-layer.ts`; only the root may import that type from it
12. **The repository root** keeps only what a tool or a reader looks for by name there
    1. The other config files move into `.config/`
    2. `eslint-rules/` stays as a marker folder that coding-agent tooling looks for, holding only a note that the rules live in `.config/eslint/rules/`
13. **Endpoint files unchanged**: an endpoint's file keeps its rules, its API call, its cache and its hook
14. **Lint holds some rules, review the rest**
    1. Lint: the test cap, `no-use-before-define`, main-first order (`fe/file-layout`), the `../` ban, the placement check (a test under `src/app/` included), the slice layout, the slice boundaries and the import bans
    2. Review: a folder per module, `use-*` modules only in `hooks/`, where tests sit, `<Screen>.<role>.ts` helpers, role files imported only from inside their folder, every size limit but the test cap, how a folded module is written, whether a component's piece inlines or takes a folder of its own ([012](012-inline-or-own-folder.md)), the namespace rule for `t`, and `.check.test` for repository checks only

**Folding comes before the read-path ranking**:

1. The author's canonical conventions, which this repository's lint rules came from, rank one cost first: the path a reader takes to the code they need, where a hop to a well-named file is nearly free and file count is no goal
   1. So they keep one component per file and a folder per component, exempt tests from size bands, split tests only along a named axis, and ban `max-lines`
2. This repository amends that ranking on purpose, on principles 1.3 and 1.4
   1. Below the floor, a file of its own is a jump the reader pays to understand one piece, and principle 1.4 counts each jump as mental load; so a small module with one consumer folds into it, and the jump disappears
   2. The fold stops at 250 lines: past that, a file no longer reads at a glance, and the read-path argument takes over again
   3. Component files keep the read-path ranking ([decision 012](012-inline-or-own-folder.md)): nothing folds into one
3. The amendments: the 500-line test cap and the 200-line test floor; the module floor and the module cap; `lib/`; a folder per module and per hook; screens' `tests/`; main exports first in modules, tests and scripts; flat tooling with tests beside; non-API type files folded into their module; rules held by review rather than lint

**Costs**:

1. A small module is found inside its consumer, not in a folder named for it; it keeps its name, so a search still finds it
2. A piece can move twice as its consumers widen or narrow
3. A new scenario takes five edits
4. Some test files stay between about 420 lines and the 500-line cap, inside the band where a split is encouraged
5. A module and its test take two layouts: a folder each in `src/`, flat in tooling
6. A tiny module whose moved copy also had its imports rewritten can fall below git's rename similarity, and `git log --follow` then needs `-M30%`
7. Rules held by review can drift where lint would not

## Rejected

1. **A module floor of about 60 lines, or 150, or none**. Reason: at 60, most small single-consumer modules stayed files of their own; at 150, modules large enough to read alone would have folded; with none, every small module stayed a jump. Chosen instead: 100
2. **No cap on modules, or a cap of 250 or 300**. Reason: no cap leaves principle 1.1 unanswered for modules; 250 or 300 would have split the scenario registry, then 317 lines, for a size the author doesn't call too high. Chosen instead: about 320
3. **A test cap of 300 or 400 lines, or no cap with `describe` blocks to navigate**. Reason: a smaller cap buys more files without a clearer rule; `describe` blocks leave a 2,000-line file. Chosen instead: 500, which one behaviour's tests rarely outgrow
4. **Splitting every test file from 420 lines**. Reason: those splits were among the additions that would have left more files than before, against the asks to cut files. Chosen instead: only files over 500 split; the bands stay guidance
5. **Splitting tests by the matrix's steps, or one file per scenario**. Reason: a behaviour spans steps and scenarios, so its tests would scatter, and one file per scenario multiplies files. Chosen instead: one file per behaviour
6. **The test floor held by a lint warning, or by a blocking lint**. Reason: a merge is a judgement about which tests belong together, which lint can't make. Chosen instead: review
7. **Component folds**. Reason: [decision 012](012-inline-or-own-folder.md) sets how a component's pieces inline or take a folder of their own
8. **Keeping every type file, or folding the endpoints' type files too**. Reason: the endpoints' types are the proposed API contract, read on their own; the other type files are small parts of their one module. Chosen instead: the endpoints keep theirs, the rest fold
9. **Keeping modules with a test of their own as files**. Reason: their tests can reach the code through the consumer it folds into. Chosen instead: they fold, except one whose test checks what only a direct call can see, such as the history list's row helper and the demo reset's cleanup, which stay files
10. **One file per harness helper**. Reason: 18 of the harness's 31 files were under 30 lines, each a jump. Chosen instead: each role's helpers merged, up to 250 lines
11. **Main-first order for tests only, or as a written rule only**. Reason: helpers sat above the main code in modules too, and a written rule drifts back. Chosen instead: lint, for every file that is not a component
12. **Main first with no exceptions, helpers in a sibling file, or define before use**. Reason: no exceptions breaks the files that read a value at load; a sibling file is another jump; define before use puts helpers on top. Chosen instead: main first, with each value read at load marked
13. **The order rule limited to source and tests, or given an autofix**. Reason: tooling and config files have the same readers; an autofix would move values read at load and break the file silently. Chosen instead: every file, no autofix
14. **A folder per concern, a role suffix inside `hooks/`, or a module beside its single consumer**. Reason: none gives a module that is neither component nor hook one home every engineer would pick, and a suffix keeps modules that aren't hooks in `hooks/`. Chosen instead: `lib/`, on the same ladder as components
15. **Splitting a module that exports a hook beside plain functions**. Reason: both such modules sat below the size the floor protects. Chosen instead: each placed by its main export, whole
16. **A folder only for plain modules, or only once a module has a test, or flat modules**. Reason: each leaves two shapes for one kind of file, which engineers then choose between. Chosen instead: a folder for every module and hook
17. **`tests/` in every folder, or once a folder holds two test files, or tests beside the code everywhere**. Reason: outside screens, a module's one test beside it is part of what the folder is about; a screen's ten suites are not what someone opening the screen wants. Chosen instead: `tests/` for screens and the root view
18. **The repository checks in one `checks/` folder, or left in `src/test`**. Reason: either keeps them away from what they check. Chosen instead: beside it, with the `.check.test` suffix
19. **Reaching the mock BE and the root through the harness, keeping the three checks in `src/test`, or listing them in the lint config**. Reason: the harness route adds a module only to forward imports; a file list grows with every check. Chosen instead: the suffix, which lint keys on
20. **One `harness/` folder, the old split, or no role folders**. Reason: each leaves the harness's helpers flat among each other. Chosen instead: role folders, merged within each role
21. **Keeping the root's folder named `shell`, with a written rule, or splitting its views from its wiring**. Reason: either keeps views that belong to one domain, or know nothing of banking, in a folder of their own beside the app's root. Chosen instead: `src/root/`, its single-domain views moved into their domains and its banking-free views into `src/shared/ui/`
22. **Moving every root piece to a domain with the root passing data down, or folding the account domain into transfer**. Reason: the first threads props through for no reader's benefit; the second merges two business areas to place one view. Chosen instead: a piece reading one domain moves there, and one reading several stays in the root view
23. **Naming a test helper for what it does**. Reason: `<Screen>.<role>.ts`, chosen instead, says whose helper it is and what kind of file it is
24. **Naming the enum `TransferScenario`**. Reason: `TransferScenarioId`, chosen instead, is the name the mock BE's id type and `scenarioTest` already used
25. **The scenario ids in the flow store, or two enums with no bare strings**. Reason: domain components couldn't import the flow store's list, and two enums keep two spellings. Chosen instead: one enum in the transfer domain
26. **Keeping the balance card's four scenario ids in the account domain, or an id list of the account's own**. Reason: either keeps a second spelling of the ids. Chosen instead: the card reports what it rendered, and its screens name the scenario
27. **The `@/` alias always, or relative paths inside a slice**. Reason: always aliasing lengthens every import within a folder; relative paths across a slice spell one module's path differently from each importer. Chosen instead: `./` inside a folder, `@/` outside it
28. **A root alias for tooling**. Reason: the tooling has no `@/` alias, and one exception line costs less. Chosen instead: the ban covers `src/` only
29. **Flattening components inside each screen, or nesting at most two levels**. Reason: either loses the rule that a piece sits inside its only consumer. Chosen instead: nesting inside the only consumer
30. **The transfer flow's bundle for scenario strings, or checks that read every bundle**. Reason: the strings would sit apart from the ids, or the checks would have to know every bundle. Chosen instead: the transfer domain's bundle, beside the ids
31. **Scanning the Demo menu's titles for retry words too**. Reason: the titles never render in production. Chosen instead: the scan reads the transfer bundle only
32. **A component's strings under its screen's name, or all three shapes left as they were**. Reason: a component rendered on two screens has no single screen to file under, and three shapes leave each engineer to pick one. Chosen instead: under its own name
33. **Renaming the namespace only, a string bundle for the root, or no change**. Reason: a bundle for the session-ended view's three strings is three files for three strings. Chosen instead: `common` becomes `shared`, and those strings stay in it
34. **`shared` as the default namespace**. Reason: shared code couldn't write the `shared:` prefix, so a shared string would be spelled two ways. Chosen instead: no default namespace
35. **A lint rule against a `t` from `useTranslation()` with no namespace**. Reason: among the less important rules lint leaves to prose. Chosen instead: review holds it
36. **The demo contract in `src/root/`, or left in the approval domain**. Reason: one of its seven members concerns approval; a home in the root splits the type from the one file that implements it. Chosen instead: the type in its implementation, imported by type only
37. **The flow store in `lib/transfer-flow/`, in `transfer-flow/`, or left in `state/`; one file per step, or all in the store file**. Reason: `lib/` would have pushed it into a domain, where screens' state can't live, and `state/` names nothing; one file per step makes small files with one consumer; one file passes the module cap. Chosen instead: `flow-store/`, in four files
38. **Endpoint files holding only the BE API call and its cache, with the rules about what the data means moved out**. Reason: each endpoint's rules would leave the one file an engineer opens for that endpoint. Chosen instead: endpoint files unchanged
39. **Keeping the lint rules in `eslint-rules/` at the root, or moving them with no folder left behind**. Reason: the first leaves a tooling folder among the root's entries; the second switches off the guards coding-agent tooling keys on that folder. Chosen instead: the rules move into `.config/eslint/rules/`, and a marker keeps the folder
40. **A folder per lint rule**. Reason: a rule and its test are the whole unit, so a folder adds a jump that hides nothing. Chosen instead: flat, each test beside its rule
41. **Folder per module and screens' `tests/` held by lint**. Reason: lint stays small. Chosen instead: prose, which review holds
42. **Exempting tooling tests from the size rules**. Reason: tooling tests ran to 976 lines, with the same readers as any test. Chosen instead: every test file
