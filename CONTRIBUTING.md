# Contributing

This guide is for the engineers who work on this module. The repository takes no outside contributions: [LICENSE](LICENSE) grants no licence to use or modify its code.

## Checks

Run all three before you push. CI runs them on every push.

```sh
pnpm typecheck
pnpm lint    # ESLint, Prettier (which also orders imports), the placement check and the secret scan
pnpm test    # Jest, then the tests of the repo's own scripts and lint rules
```

The pre-commit hook lints, formats and secret-scans the staged files, then runs the placement check over the commit's own tree. The `commit-msg` hook lints the message, and CI lints every pushed message again.

Open the repo in VS Code or Cursor, trust the folder, install the ESLint and Prettier extensions it recommends, and accept the editor's offer to use the workspace's TypeScript version. A save then runs Format Document once and nothing else, whatever your own settings say, and Format Document organizes the imports as it formats. The editor shows the TypeScript and ESLint errors and warnings that `pnpm typecheck` and `pnpm lint` report, since all of them read `tsconfig.json` and `eslint.config.mjs`: a rule changes there and nowhere else. `.config/eslint/disk-changes.js` keeps the editor's ESLint reading files as they stand on disk, where another tool or session may have changed them, and restarts it once the lint config or a rule changes.

CI also runs `production-bundle`, a job of its own that exports the app in each variant, and with none set (`scripts/check-production-bundle.js`). It fails when a production or unset export carries code from `src/mocks/` or msw, or when a demo or production export carries the development-only re-render counter. It also fails when an export does not finish or writes no bundle, when no source map lists `src/app/`, or when a build that should carry that code lacks it, since then a clean export proves nothing.

## Layout

Two principles shape every rule below: an engineer reading the code should meet as little of what they do not need as possible, and no two engineers should read a rule two ways. [Decision 011](docs/deep-dives/design-decisions/011-low-mental-load.md) argues each rule, and [001](docs/deep-dives/design-decisions/001-vertical-slices.md) the slices.

The app is cut into vertical slices of two kinds:

- A **screens folder**, `src/screens/<flow>/`, holds one flow's screens and whatever only that flow uses.
- A **domain**, `src/domains/<area>/`, holds one business area's API, and the components and modules that two or more screens folders share.

A screens folder and a domain about the same thing share a singular name, as `src/screens/transfer/` and `src/domains/transfer/` do. Around the slices:

| Folder        | Holds                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/`    | The routes, kept thin: each re-exports a screen or a view. A flow's layout holds its navigator, the root layout re-exports the root view, and `+native-intent.tsx` re-exports the filter on the links that open the app.                                                                                                                                                                      |
| `src/root/`   | What exists once for the whole app and that every screen sits inside: the root view, `ViewRoot/`, with its providers, the root stack and the views it lays over the app, and the modules a route imports or that set up the whole app while it loads: the launch steps, the query client, the translation registry and the link filter. It is the one place app code loads `src/mocks/` from. |
| `src/shared/` | Code that knows nothing about banking: UI, hooks, theme, i18n, HTTP, config, platform wrappers, observability, plain helpers.                                                                                                                                                                                                                                                                 |
| `src/mocks/`  | The mock bank and its scenarios, for development and demo builds only.                                                                                                                                                                                                                                                                                                                        |
| `src/test/`   | The test harness, by role: `setup/`, `render/`, `mock-bank/`, `doubles/`, `fixtures/`, and `scenarios/` for the matrix scanner.                                                                                                                                                                                                                                                               |

Outside `src/`, `.config/` holds the tooling's configuration: Metro's, commitlint's, the globs that define test code, and ESLint's slice boundaries, import bans and rules in `.config/eslint/`. `eslint-rules/` holds only a note and stays empty: coding-agent tooling keys on the folder.

### Adding a slice

- A screens folder holds `<Name>Screen/` folders beside `components/`, `hooks/`, `lib/` and `i18n/`, and nothing else. The transfer folder also keeps its flow's store in `flow-store/` and the scenario matrix in `scenarios/`.
- A screen's folder holds its entry file, `<Name>Screen.tsx`, beside `components/`, `hooks/`, `lib/` and `tests/`.
- A domain holds `api/`, `components/`, `hooks/`, `lib/` and `i18n/`, and nothing else. Each endpoint has a folder of its own in `api/`: `<endpoint>.type.ts` holds its request and response types, and `<endpoint>.ts` the code that calls it or works on its cached data, including the rules about what that data means and any hook a component calls. Lint fails a component that calls `useQuery`, `useMutation` or `useInfiniteQuery` itself, so a component reads and writes through such a hook. The types can land before the rest, while only the mock bank answers the endpoint. A domain's query keys all come from its `api/<area>.keys.ts`.
- `src/root/` holds `ViewRoot/` and kebab-case module folders, each a module a route imports or one that sets up the whole app while it loads. Below `ViewRoot/`, pieces nest as they do in a screen's folder.
- A screen's route in `src/app/` re-exports the screen's entry file and an `ErrorBoundary`.
- A flow's layout in `src/app/` holds the flow's navigator, the guard on which of its routes may open, and what leaving the flow does.
- A slice's strings go in its `i18n/` folder, one bundle per language, registered in `src/root/translations/translations.ts`. The Demo menu's own strings, the `demo` namespace in `src/mocks/switcher/i18n/`, are the exception: app code may not import `src/mocks/`, so the menu registers them itself the first time it renders.

The placement check fails any other entry directly in a screens folder or a domain, or at the top of `src/root/` (`scripts/slice-layout.js`). What a screen's folder holds is review's to hold.

### Imports

Imports run one way: a screens folder may use domains and shared code, a domain only itself and shared code, and shared code only shared code. Nothing imports sideways: no screens folder imports another, no domain imports another, and a screen's own `components/`, `hooks/` and `lib/` are private to that screen.

App code outside a domain reaches it only through its public files: an endpoint's `<endpoint>.ts` and `<endpoint>.type.ts`, a domain component's own file, a domain module's `<x>.ts` and `<x>.type.ts` in `hooks/<x>/` or `lib/<x>/`, and the domain's `api/<area>.keys.ts`. Routes and the root reach a screens folder only through a screen's entry file and the flow store's `flow-store.ts` and `flow-store.type.ts`, and routes reach the root only through `ViewRoot.tsx` and its top-level modules. The root also imports the `i18n/` bundles of screens folders and domains alike, which it registers. In app code, only `src/root/` may load `src/mocks/`, and only through `require`, never an `import`, but for a type-only import of the demo contract from `src/mocks/demo-layer/demo-layer.ts`.

Tests are not app code. The harness in `src/test/` may import from any slice, the mock bank included. A repository check, named `.check.test.ts(x)`, may also import `src/mocks/` and `src/root/` directly. Any other test keeps the import rules of the code beside it and may also import the harness.

Inside a folder, import with `./`; once an import leaves the folder, with `@/`, so every importer outside a folder spells a module's path the same way. Lint fails a `../` path in `src/` written as a quoted string in an import, an export, a `require`, an `import()` or a `jest.mock`-family call, though not one in a template literal or passed to `require.resolve`; the matrix scanner's one climb, to `.config/test-files.js`, says why on its line.

`.config/eslint/boundaries.mjs` holds the slice rules and `.config/eslint/bans.mjs` the import bans; `pnpm lint` fails a breach of either.

## Where a component, hook or module goes

Colocation first: a piece of code lives as close to its users as possible. Most components serve a single screen, and keeping each one inside that screen keeps the screen's code together instead of scattering it through a folder the whole flow shares.

1. Used by one screen → inside that screen: `src/screens/<flow>/<Name>Screen/components/<Component>/<Component>.tsx`.
2. Used by two or more screens of one screens folder → `src/screens/<flow>/components/<Component>/`.
3. Used by two or more screens folders → `src/domains/<area>/components/<Component>/`, in the area whose data it shows.
4. Knows nothing about banking, and used by two or more slices → `src/shared/ui/`. A banking-free piece stays beside its users until a second slice uses it.

Hooks and modules climb the same ladder. A hook is named `use-*` and lives in `hooks/<use-x>/<use-x>.ts`; any other module that is not a component lives in `lib/<x>/<x>.ts`. A module that exports a hook beside plain functions is placed by its main export. Shared code keeps its modules in area folders, such as `src/shared/platform/network/network.ts`; an area whose one module shares its name is both, as `src/shared/config/config.ts` is.

Every module and hook sits in a folder of its own, named for it, with its test and its role files beside it. Only files inside that folder import its role files; code elsewhere imports `<x>.ts` or `<x>.type.ts`. Routes, a screen's entry file, string bundles, each domain's `api/<area>.keys.ts`, test code and the scenario matrix are exempt. API modules always live in their domain's `api/`.

A piece that only one other piece uses nests in that piece's own `components/`, `hooks/` or `lib/`, but a hook or `lib/` module owns no nested pieces: a module only it uses is placed by the component or screen that owns it. A piece only `src/root/` uses lives in the one domain its files import; one that imports no domain, or more than one slice, nests in the root view's own `components/`, `hooks/` or `lib/`, as the session-ended view nests in `src/root/ViewRoot/components/`. It nests there even when only `src/root/`'s modules use it, never the view: those modules, like a hook, own no nested pieces. These root rules win over the first one whenever every user is the root view, a hook or module of its own, or one of `src/root/`'s modules, so a piece only the view uses still lives in the one domain it imports; once every user sits inside a component the root view nests, the first rule places it in that component. A piece moves up a rung in the commit that gives it a user at the wider level, and only app code counts as a user, never a test.

`scripts/check-placement-ladder.js` fails a component, hook or `lib/` module placed higher than its users need, or one no app code uses, and the import rules fail one placed too low. It checks every piece in a folder of its own inside a `components/`, `hooks/` or `lib/` folder of a screens folder, a domain, shared code and `src/root/` below its top level. A file loose in such a folder escapes it: lint fails a loose component, and review a loose hook or module. A base component directly in `src/shared/ui/` passes with no user at all, since it can be built before any screen uses it, and fails once every user sits in one slice. The check also fails any test file under `src/app/`, which Expo Router would bundle as a route. It runs in `pnpm lint`, and so in CI, and in the pre-commit hook. On an edge case of who uses a piece, the script is the authority, not this summary. It cannot tell whether a piece knows about banking: that call is the reviewer's.

## Sizes and folds

Fewer files that each read at a glance, rather than many small ones a reader has to jump between. Every limit is a number of lines in the file as committed, after Prettier. A limit applies when a file is created, moved, split or folded; a file that later grows past one may be split then, and never must be.

| File                                            | Lines                        |
| ----------------------------------------------- | ---------------------------- |
| A test file, tooling tests included             | at most 500; lint fails more |
| A test file, before it should merge             | about 200                    |
| A module that is neither a component nor a test | at most about 320            |
| A module, before it folds into its one user     | 100                          |
| A component                                     | at most 200                  |
| A module taking a fold                          | at most 250                  |
| A merged harness file                           | at most 250                  |

- A module under 100 lines whose only user in app code is another module folds into that module, smallest first and repeated until nothing more folds, while the user stays within its limit. A test of its own moves into the user's tests, unless it checks what only a direct call can see, as the history list's row helper's and the demo reset cleanup's tests do.
- A folded module is relocated, not rewritten: it joins its user's private helpers below the exports, in the order they are called, and nothing folded is exported.
- Nothing folds into a component file: a component, hook or function one component uses inlines into that component's body or takes a folder of its own. A child readers rarely need inlines up to about 15 lines of its own function, and one they usually need up to about 40, while the user stays within 200 lines; anything larger takes its own folder. Size counts neither props nor styles, and an inlined child's styles join its user's sheet. A child with state or effects that renders conditionally or in a list never inlines: state is `useState`, `useReducer` or a ref the child owns, or an effect, and a store or query read is not state.
- When logic leaves a component's body, a helper component in its own folder beats an imported hook or function.
- These never fold: `src/mocks/demo-layer/demo-layer.ts`, the one file app code loads the mock bank through, though others fold into it; a module loaded for its side effect; the wrappers in `src/shared/platform/`; a module a route imports or one that sets up the whole app while it loads; the flow store and its refresh after an approval; the harness, which merges within each role instead; and a module another test mocks by its path.
- An endpoint's `.type.ts` stays beside it. Any other module's type file folds into the module while the module stays within 250 lines.
- A test file may split from about 350 lines and should from about 420; a split's parts aim at 480 lines or fewer, leaving room for later lines. A test file under about 200 lines merges into another file of its unit: into the unit's unsuffixed file while that stays within 500 lines, otherwise into a family file named for what the merged tests share. A unit whose tests are one file stays as it is, and so do a suite that runs one test per load, a suite with a file-level `jest.mock` of a local module, and a demo-build suite with no other demo-build suite to join.
- Tests that share a file share its module state and top-level hooks, including hooks a fixture it imports registers. Merge a file with top-level setup only into one whose tests pass beside it, and run a merged or split file under `jest --randomize`.

## Names and file shape

Lint fails a breach of each of these (`eslint.config.mjs`, with the repository's own rules in `.config/eslint/rules/`). On an edge case, the rule's own file is the authority, not this summary.

- A component's name leads with its Type, from a closed list: `{Type}{Purpose}{Feature}{Variant}`, such as `CardBalance` or `ButtonPrimary`. Screens are the exception, each named `<Name>Screen`.
- A component sits in a folder of its own, named for it: `<Component>/<Component>.tsx`. A file beside it takes the same name with a singular role suffix, such as `<Component>.type.ts`, never `.types.ts`.
- A component file reads in one order: imports, `Props`, the component, `StyleSheet.create`, then the rest. A JSDoc on the component stays within four lines.
- In app code, no component, hook or function sits at module level in a component file beside the component; constants, types, styles and contexts may.
- A style key names what it styles. A component's outermost element takes `main`, and no other element does, looking through a context provider, into a fragment whose one styled element it is, and onto the JSX a component that renders nothing itself hands to another. A style beside `main` there is named for its condition alone, as `pressed`. Below it, every key of a `Text`, `TextInput` or `Text*` component starts with `text` (`textName`), every key of a `Pressable`, `Touchable*` or `Button*` component starts with `btn` (`btnClose`, never `btnCloseButton`), and no other element's key starts with either.
- Every other file opens with what it is for. A module reads imports, exports, then its private helpers, constants and types; a test file reads imports and setup (`jest.mock`, top-level hooks), its tests, then its helpers; a script reads imports, the statements it runs, then its helpers. This app's Babel compiles `const`, `let` and `enum` to `var`, so a value read before its definition is a silent `undefined`, never an error: a value the file reads while it loads stays above its reader, marked `// eslint-disable-next-line fe/file-layout -- read at load by <reader>`, and `no-use-before-define` fails a read placed above its value. A declaration kept above for another reason carries the same line with why it must stay above in place of `read at load by <reader>`: a load-time hook fills it, it must load before a later statement runs, or only a type reads it, which `no-use-before-define` still counts as a use. A file whose top level must run in its written order takes one file-level exception that says why.
- A file's imports, `import` statements and top-level `require` calls alike, form one block with no blank line inside it, and Prettier orders the `import` statements as VS Code's Organize Imports does. A save never removes a blank line, since Organize Imports only sorts within a block; the commit hook's `eslint --fix` does. The one blank line allowed follows a side-effect import that must load first and opens the block, such as `@/test/setup/demo-build`: its author writes it, since Organize Imports sorts side-effect imports with the rest but never across a blank line. A comment line between imports splits the block for sorting too, so a comment on one import's position goes at the end of the block.
- A hook file is kebab-case and named for the hook it exports: `use-send-transfer-approval.ts` exports `useSendTransferApproval`.
- Only files inside a component's folder import its internal files; code elsewhere imports the component itself.

Review holds the rules no tool checks: what a screen's folder holds, a folder per module and per hook, a `../` path lint cannot see, only `use-*` modules in `hooks/`, where tests and their helpers sit, role files imported only from inside their folder, every size limit but the test cap, how a folded module is written, whether a child inlines or takes a folder of its own, the namespace rule for `t`, the `.check.test` suffix for repository checks only, whether a piece knows about banking, `collapsable={false}` on a `View` that is a native view in only some renders, and `main` on an outermost element styled by something other than its sheet, such as `StyleSheet.absoluteFill`. In app code and `src/mocks/` it also holds two rules on state. Only `useQueryError` sets state during render. A value read in render that must keep its first-render value comes from `useInitialValue`; one read only inside effects is a ref instead.

## Views that flatten

A `View` whose props can change while it stays mounted, so that it is a native view in some renders and flattened in others, carries `collapsable={false}`: Android can lose a view that flattens and turns real again. A background colour other than transparent, a border width, opacity below 1, a transform and `aria-hidden` set to true each make a `View` native. React Native lists the rest in `ViewShadowNode.cpp`, and Android adds its own in `HostPlatformViewTraitsInitializer.h`, both under `node_modules/react-native/ReactCommon/react/renderer/components/view/`. A `Pressable` or an `Animated.View` never flattens.

## Adding a scenario

The scenario matrix, [`src/screens/transfer/scenarios/transfer.md`](src/screens/transfer/scenarios/transfer.md), is the one description of what can happen while someone sends money. Its header says how to read it and how to change it. A new scenario takes five edits, made in one commit:

1. Its section in the matrix, written as the header says.
2. Its member in `TransferScenarioId` (`src/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id.ts`), named for the id after `transfer.` in PascalCase and valued as the id: `ApprovalExpired = "transfer.approval_expired"`. App code names a scenario by its member, never by a string.
3. Its entry in `TRANSFER_SCENARIOS` (`src/mocks/scenarios/transfer-scenarios/transfer-scenarios.ts`), under the same step, with what makes the mock bank behave that way: `conditions` change the bank's own state, `handlers` lay answers over the bank's, and an entry with neither is either the normal bank's own behaviour or caused on the phone or by what the person does. The Demo menu lists every entry with `conditions` or `handlers` under its step; `phoneSide` lists one with neither near the top, for what the phone or the host app causes and the pick stands in for, such as the capture block the demo build leaves off, or face and fingerprint approval turned off in the host app's settings. The registry must hold every member of the enum, so the type check fails until it and the enum agree, and the matrix check, `src/screens/transfer/scenarios/transfer.check.test.ts`, fails until the registry and the matrix hold the same ids under the same steps.
4. Its words, in all three languages: whatever the app shows for it under `common.<name>` in the transfer domain's bundles (`src/domains/transfer/i18n/`), and its Demo menu title at `common.<name>.title` in the Demo menu's bundles (`src/mocks/switcher/i18n/`), where `<name>` is the id after `transfer.`.
5. Its route test, as below.

With no scenario picked, the mock bank behaves as a normal bank. Every test starts that way, with the bank reset before it, and a scenario changes only what its entry names. In development and demo builds, the Demo menu picks one scenario at a time, and its Normal entry goes back to the normal bank without clearing what the bank holds.

## Adding a test

Test a route the way a person uses it, against the mock bank:

- `renderRoute(url)` (`src/test/render/render-route.tsx`) mounts the app's own routes at that URL with their real providers. Every request goes to the mock bank, and a request no handler answers fails the test. It switches Jest to fake timers until the test ends: Testing Library's `findBy` queries and `waitFor` advance them, a test that waits out a timeout advances them itself, and one that reads the mock bank directly first returns to real timers with `readBankOnRealTimers` (`src/test/render/drive-app.ts`), since the bank answers after a delay the fake timers hold.
- `scenarioTest("transfer.<name>", run)` (`src/test/render/drive-app.ts`) picks a scenario for one test. Give the id as a string literal: the matrix check reads that argument to fail an id the matrix lacks, and an id built at runtime escapes that check.
- Every scenario in the matrix needs a route test that picks it, renders the route and asserts what the person sees. The matrix check fails a scenario with none: it counts a test only when the test passes the id to `scenarioTest`, calls `expect`, and sits in a file that calls `renderRoute` itself, so a helper shared by test files never takes that call from them. A skipped test counts for nothing, and neither does any test in a file holding a focused one, or in a repository check.
- A screen's tests sit in its `tests/` folder, `src/screens/<flow>/<Name>Screen/tests/`, and the root view's in `src/root/ViewRoot/tests/`; every other test sits beside its module. A helper that one screen's test files share sits in that `tests/` folder as `<Name>Screen.<role>.ts(x)`, such as `<Name>Screen.helper.tsx`.
- Route tests are split by behaviour and named for the screen they render, `<Name>Screen.<behaviour>.test.tsx`: `.offline`, `.holds`, `.phone-security`. Every test of a behaviour lives in that one file and nowhere else. A suffix names one behaviour, or, once small files merge, the family their tests share, and a screen's small behaviours live in its unsuffixed `<Name>Screen.test.tsx`. A behaviour over the cap splits into files named for its parts. No split or merge adds or removes a `describe`, since that changes the full name of every test inside it. A test of the demo build's own behaviour carries `.demo` in its name. Jest runs as production, so a test that must run as the demo build imports `@/test/setup/demo-build` before anything else, alone above a blank line.
- A shared component's route tests sit beside the component, in `<Component>.test.tsx`, rather than in the suites of the screens they walk: `src/shared/ui/FieldText/FieldText.test.tsx` renders the amount and recipient steps to test the field.
- A repository check sits beside what it checks and is named `<x>.check.test.ts(x)`, as the matrix's, the scenario enum's and the translations' checks are. The suffix lets it import `src/mocks/` and `src/root/` directly and earns it no scenario credit; it marks nothing else. A helper that repository checks share sits beside them, named for what they check, `<x>.helper.ts`, as the matrix's two checks share `transfer.helper.ts`; `.config/test-files.js` must count it as test code, as it counts a screens folder's `scenarios/`.
- Query by accessible name, through `accessibilityRole` and `accessibilityLabel`; lint bans `testID`.
- Assert what a person could observe: text, roles, where they ended up, and the requests that left the app. Never assert on component state or on which module a value passed through.

Only these are tested below the route: the money and date helpers, the transport, the platform wrappers, the translation bundles and the scenario matrix's checks, a state no route can stage, such as a launch after a reinstall, and other logic with more cases than a route test can meaningfully cover, such as the mock bank's rules or the query client's retries. A component is tested through a route that renders it, except three shared pieces whose behaviour no route test can reach, the Demo strip, whose suite mounts it around a stand-in app, and the banner, whose suite mounts it on a stand-in route, which keep suites of their own, as does one hook whose suite mounts a stand-in route too:

- `src/shared/ui/BottomSheetFrame/`: a body taller than the sheet still scrolls, which needs a layout pass Jest never runs, and a sheet that may not be dismissed holds Back and the escape gesture, which no route leaves reachable.
- `src/shared/ui/ViewScreenFrame/`: it scrolls the field being typed in clear of the keyboard only on layout, which a route render never fires.
- `src/shared/observability/render-trace/render-trace.ts`: the trace is compiled only into development builds, and every route test runs as production.
- `src/mocks/switcher/components/ViewDemo/`: its menu's order, Unlock PIN's place, its own place above the app, its menu opening over an app sheet, and its screen-reader language, against a stand-in app; the demo build's route tests reach it through the root too.
- `src/shared/ui/BannerNotice/`: it announces each new message once, and holds a message that changes beneath another screen until its own screen is on top again.
- `src/domains/transfer/hooks/use-track-scenario-shown/`: it reports what a covered screen came to show once that screen is back on top, and not again on later returns.

## Translations

Every string the production app shows comes from a bundle in English (`en-MY`), Malay (`ms-MY`) and Chinese (`zh-MY`), each named by its language's code in `AppLanguage` (`src/shared/i18n/i18n.ts`), except the language names: each is a constant in its own script, never a translation key, so it reads the same whichever language is picked. A Malay or Chinese string is a machine translation, set as it comes out, with no human review.

- Each slice's bundles form a namespace: `shared`, `account`, `home` and `transfer`. The transfer screens' bundle and the transfer domain's merge into the one `transfer` namespace a top-level key at a time, so a top-level key lives in only one of the two.
- No namespace is the default. Every shared word is written `t("shared:…")`. A component that shows its own words and shared ones calls `useTranslation(["<own>", "shared"])`, and one that shows only shared words calls `useTranslation(["shared"])`, so its keys are type-checked either way. Never take `t` from a `useTranslation()` with no namespace: that `t` accepts any string, typos included, and shows a raw key on screen. Call `useTranslation()` with no namespace only to read `i18n`.
- A bundle groups its strings under one top-level key per screen or module. A component's words sit under its own name (`card_balance`, `section_transfer_buttons`), and words that only one hook or plain module reads sit under that module's name. A screen's group holds only the words the screen file shows itself. `common` holds only scenario words and the groups of words two or more modules read, judged by the group, so a word in one may have a single reader. A leaf key is named for its role (`title`, `body_secondary`), never numbered.
- A scenario's words sit under `common.<name>` in the transfer domain's bundle, even when only one screen shows them, and its Demo menu title at `common.<name>.title` in the Demo menu's bundle.
- A Malay or Chinese bundle has every key of the English bundle beside it, and each of its strings keeps the English string's `{{placeholders}}`.
- A plural comes as a twin. English has `_one` and `_other`; Malay and Chinese repeat their `_other` string under `_one`. Hermes lacks `Intl.PluralRules`, so i18next reads `_one` for a count of one in every language, and a missing twin shows English.
- A money state's phrase appears in each language exactly as the matrix's money table gives it.
- Where a scenario's **Never** reads "offer to send it again", nothing the person can press carries any of the nine retry words in the matrix header's table, in any language, since an English word left on a Malay button still offers a resend; and no message offers to send it again. A message may still warn against sending again.
- When an English string changes, re-translate its Malay and Chinese in the same commit. No check notices a translation left behind by a change to its English.

Two repository checks read the bundles:

- `src/root/translations/translations.check.test.tsx` fails a top-level key defined twice in one namespace; a Malay or Chinese bundle, in any namespace, the Demo menu's included, that lacks a key English has, carries one English lacks or changes a string's placeholders; a Malay or Chinese plural whose `_one` twin is missing or differs from its `_other`; a key repeated inside one object of any bundle file; a matrix id with no title in the Demo menu's bundle; and a group under the transfer bundle's `common` that names no matrix id, unless the check lists it among the words two modules share.
- `src/screens/transfer/scenarios/transfer.strings.check.test.ts` holds two of the rules above, over the bundles the app registers:
  - The money phrase: for a scenario whose **Tell them** ends in a money state, it fails each language in which no string of `common.<name>` carries that state's phrase. A longer phrase holding the shorter one does not count, so "no money moved" never passes for "money moved".
  - The retry words: under a scenario whose **Never** forbids a resend, it fails any string of `common.<name>` but its `body` that carries a retry word.

## Build variants

`EXPO_PUBLIC_APP_VARIANT` picks the build: `development`, `demo` or `production`. Unset or empty means `production`, so a build with no variant fails closed. Development and demo carry the mock bank and the Demo menu. Production carries neither and calls an API address that never resolves. Each variant has its own name, app id and URL scheme, so development and demo install beside production.

| Variant       | Metro        | iOS                   | Android                   | An Android APK, with no device  |
| ------------- | ------------ | --------------------- | ------------------------- | ------------------------------- |
| `development` | `pnpm start` | `pnpm ios`            | `pnpm android`            |                                 |
| `demo`        |              | `pnpm ios:demo`       | `pnpm android:demo`       | `pnpm build:android:demo`       |
| `production`  |              | `pnpm ios:production` | `pnpm android:production` | `pnpm build:android:production` |

Every script sets its variant itself. Those that build also regenerate the native project for it, and the APK scripts write to `dist/`. The variant is baked into the native app and inlined into the JavaScript bundle, and a fresh project leaves Gradle no stale bundle to reuse; a bare `npx expo run:*` reuses whatever native project the last variant left behind.

`pnpm ios` and `pnpm android` build the app, install it on a simulator or emulator and open it, then keep running as the Metro bundler the app loads its code from: leave that terminal open while you use the app. The first build takes several minutes.

With several simulators or emulators running, they pick the first one. Name yours with `--device`: a simulator's UDID (`xcrun simctl list devices booted` lists them) or an emulator's AVD name (`$ANDROID_HOME/emulator/emulator -list-avds`).

```sh
pnpm ios --device <simulator UDID>
pnpm android --device <AVD name>
```

- Code that a production build must not contain is loaded by a `require` gated on a literal comparison of `process.env.EXPO_PUBLIC_APP_VARIANT`, written at the `require` itself. Metro strips only that form: code behind an imported predicate, or reached by a static `import`, ships in every build.
- Decisions made at runtime read `isProductionBuild` from `src/shared/config/config.ts`.

## Commits

- Conventional Commits, with a lowercase scope and description: `feat(history): load the next page before the list ends`. Every line stays within 100 characters.
- One slice per commit: one capability, or one piece of infrastructure, with its tests. A slice is committed once it typechecks, lints and passes the tests on its own, and its diff has been reviewed.
- A body only when the why is not in the code; scaffolding and plain additions carry a subject alone. A body is at most three numbered points, each one to three short sentences naming the problem the change solves. A commit that settles a decision names the option it turned down, and why, in a numbered `Rejected:` point.
- `main` stays linear: work lands on it in order, never through a merge commit. A pushed commit is never amended or force-pushed; a fix lands as a later commit of its own.
- No trailers of any kind, `Co-authored-by:` and `Signed-off-by:` included: the `commit-msg` hook refuses a message from which git parses a trailer.
