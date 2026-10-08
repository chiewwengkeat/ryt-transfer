# Contributing

This guide is for the engineers who work on this module. The repository takes no outside contributions: [LICENSE](LICENSE) grants no licence to use or modify its code.

## Checks

Run all three before you push. CI runs them on every push.

```sh
pnpm typecheck
pnpm lint    # ESLint, Prettier, the placement-ladder check and the secret scan
pnpm test    # Jest, then the tests of the repo's own scripts and lint rules
```

The pre-commit hook lints, formats and secret-scans the staged files, then runs the placement check over the commit's own tree. The `commit-msg` hook lints the message, and CI lints every pushed message again.

## Layout

The app is cut into vertical slices of two kinds:

- A **screens folder**, `src/screens/<flow>/`, holds one flow's screens and whatever only that flow uses.
- A **domain**, `src/domains/<area>/`, holds one business area's API, and the components and modules that two or more screens folders share.

A screens folder and a domain about the same thing share a singular name, as `src/screens/transfer/` and `src/domains/transfer/` do. Around the slices:

| Folder        | Holds                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `src/app/`    | The routes, kept thin: a screen's route re-exports the screen and an `ErrorBoundary`.                                                |
| `src/shell/`  | The app's root: its providers, the query client, the translation bundles it registers, and the only code that may load `src/mocks/`. |
| `src/shared/` | Code that knows nothing about banking: UI, theme, i18n, HTTP, config, platform wrappers, observability, plain helpers.               |
| `src/mocks/`  | The mock bank and its scenarios, for development and demo builds only.                                                               |
| `src/test/`   | The test harness.                                                                                                                    |

### Adding a slice

- A screens folder holds `<Name>Screen/` folders beside `components/`, `hooks/`, `state/` and `i18n/`, and nothing else. The transfer folder also keeps the scenario matrix in `scenarios/`.
- A domain holds `api/`, `components/`, `hooks/` and `i18n/`, and nothing else. Each endpoint has a folder of its own, `api/<endpoint>/<endpoint>.ts`, with its request and response types beside it in `<endpoint>.type.ts`.
- A domain's `hooks/` holds its public modules that are not components: its hooks, and any plain module another slice calls.
- A screen's route in `src/app/` re-exports the screen's entry file, `<Name>Screen/<Name>Screen.tsx`.
- A slice's strings go in its `i18n/` folder, one bundle per language, registered in `src/shell/translations.ts`.

The placement check fails any other entry in a slice (`scripts/slice-layout.js`).

### Imports

Imports run one way: a screens folder may use domains and shared code, a domain only itself and shared code, and shared code only shared code. Nothing imports sideways: no screens folder imports another, no domain imports another, and a screen's own `components/` and `hooks/` are private to that screen.

App code outside a domain reaches it only through its public files: an endpoint's `<endpoint>.ts` and `<endpoint>.type.ts`, a domain component's own file, the domain's `api/<area>.keys.ts`, and the files directly in its `hooks/`. Routes and the shell reach a screens folder only through a screen's entry file and the folder's `state/`. The shell also imports the `i18n/` bundles of screens folders and domains alike, which it registers. Only the shell may load `src/mocks/`, and only through `require`, never an `import`. The test harness in `src/test/` may import from any slice, the mock bank included; any other test keeps the import rules of the code beside it and may also import the harness.

`eslint.boundaries.mjs` holds the slice rules and `eslint.bans.mjs` the import bans; `pnpm lint` fails a breach of either.

## Where a component or hook goes

Colocation first: a piece of code lives as close to its users as possible. Most components serve a single screen, and keeping each one inside that screen keeps the screen's code together instead of scattering it through a folder the whole flow shares.

1. Used by one screen → inside that screen: `src/screens/<flow>/<Name>Screen/components/<Component>/<Component>.tsx`.
2. Used by two or more screens of one screens folder → `src/screens/<flow>/components/<Component>/`.
3. Used by two or more screens folders, or by the shell → `src/domains/<area>/components/<Component>/`, in the area whose data it shows.
4. Knows nothing about banking → `src/shared/ui/`.

Hooks climb the same ladder in `hooks/` folders, except that a hook that knows nothing about banking and that only the shell uses stays in `src/shell/` until code outside the shell uses it. A component that only one other component uses nests in that component's own `components/`. A piece moves up a rung in the commit that gives it a user at the wider level, and only app code counts as a user, never a test. API modules always live in their domain's `api/`.

`scripts/check-placement-ladder.js` fails a component or hook placed higher than its users need, or one no app code uses, and the import rules fail one placed too low. It checks every component and hook in a `components/` or `hooks/` folder of a screens folder, a domain or shared code; the base components directly in `src/shared/ui/` are exempt, since they are built before any screen uses them. It runs in `pnpm lint`, and so in CI, and in the pre-commit hook. On an edge case of who uses a piece, the script is the authority, not this summary. It cannot tell whether a piece knows about banking, so that call is the reviewer's: a hook that knows nothing about banking and that only the shell uses passes the script in a domain, and still belongs in `src/shell/`.

## Adding a scenario

The scenario matrix, [`src/screens/transfer/scenarios/transfer.md`](src/screens/transfer/scenarios/transfer.md), is the one description of what can happen while someone sends money. Its header says how to read it and how to change it. A new scenario takes four edits, made in one commit:

1. Its section in the matrix, written as the header says.
2. Its id in `TRANSFER_SCENARIOS` (`src/mocks/scenarios/transfer-scenarios.ts`), under the same step, with what makes the mock bank behave that way: `conditions` change the bank's own state, `handlers` lay answers over the bank's, and an entry with neither is either the normal bank's own behaviour or caused on the phone or by what the person does. The matrix test, `src/test/scenarios/transfer-matrix.test.ts`, fails until the registry and the matrix hold the same ids under the same steps.
3. Its words under `common.<name>` in the flow's bundles, where `<name>` is the id after `transfer.`.
4. Its route test, as below.

With no scenario picked, the mock bank behaves as a normal bank. Every test starts that way, with the bank reset before it, and a scenario changes only what its entry names.

## Adding a test

Test a route the way a person uses it, against the mock bank:

- `renderRoute(url)` (`src/test/render-route.tsx`) mounts the app's own routes at that URL with their real providers. Every request goes to the mock bank, and a request no handler answers fails the test.
- `scenarioTest("transfer.<name>", run)` (`src/test/scenario-test.ts`) picks a scenario for one test. Give the id as a string literal: the matrix test reads that argument to fail an id the matrix lacks, and an id built at runtime escapes that check.
- Every scenario in the matrix needs a route test that picks it, renders the route and asserts what the person sees.
- Query by accessible name, through `accessibilityRole` and `accessibilityLabel`; lint bans `testID`.
- Assert what a person could observe: text, roles, where they ended up, and the requests that left the app. Never assert on component state or on which module a value passed through.

## Translations

Every string the production app shows comes from a bundle named by its language's code in `AppLanguage` (`src/shared/i18n/i18n.ts`): `en-MY` for English, `ms-MY` for Malay and `zh-MY` for Chinese. A Malay or Chinese string is a machine translation, set as it comes out, with no human review.

- A slice's bundle groups its strings under one top-level key per screen, or per component that keeps its own (`review`, `card_balance`), plus `common` for what two or more of them share. A scenario's words sit under `common.<name>` even when only one screen shows them. A leaf key is named for its role (`title`, `body_secondary`), never numbered.
- A Malay or Chinese bundle has every key of the English bundle beside it, and each of its strings keeps the English string's `{{placeholders}}`.
- A plural comes as a twin. English has `_one` and `_other`; Malay and Chinese repeat their `_other` string under `_one`. Hermes lacks `Intl.PluralRules`, so i18next reads `_one` for a count of one in every language, and a missing twin shows English.
- A money state's phrase appears in each language exactly as the matrix's money table gives it.
- Nothing the person can press offers to send again in a scenario whose **Never** forbids it, in any language. A message may still warn against sending again.
- When an English string changes, re-translate its Malay and Chinese in the same commit. No check notices a translation left behind by a change to its English.

`src/shell/translations.test.ts` reads the bundles the app registers, and fails on a top-level key defined twice in one namespace, or on a Malay or Chinese plural whose `_one` twin is missing or differs from its `_other`.

## Build variants

`EXPO_PUBLIC_APP_VARIANT` picks the build: `development`, `demo` or `production`. Unset or empty means `production`, so a build with no variant fails closed. Development and demo carry the mock bank. Production does not, and calls an API address that never resolves.

| Variant       | Metro        | iOS                   | Android                   | An Android APK, with no device  |
| ------------- | ------------ | --------------------- | ------------------------- | ------------------------------- |
| `development` | `pnpm start` | `pnpm ios`            | `pnpm android`            |                                 |
| `demo`        |              | `pnpm ios:demo`       | `pnpm android:demo`       | `pnpm build:android:demo`       |
| `production`  |              | `pnpm ios:production` | `pnpm android:production` | `pnpm build:android:production` |

Every script sets its variant itself. Those that build also regenerate the native project for it, and the APK scripts write to `dist/`.

- Code that a production build must not contain is loaded by a `require` gated on a literal comparison of `process.env.EXPO_PUBLIC_APP_VARIANT`, written at the `require` itself. Metro strips only that form: code behind an imported predicate, or reached by a static `import`, ships in every build.
- Decisions made at runtime read `isProductionBuild` from `src/shared/config/config.ts`.

## Commits

- Conventional Commits, with a lowercase scope and description: `feat(history): load the next page before the list ends`. Every line stays within 100 characters.
- One slice per commit: one capability, or one piece of infrastructure, with its tests. A slice is committed once it typechecks, lints and passes the tests on its own, and its diff has been reviewed.
- A body only when the why is not in the code; scaffolding and plain additions carry a subject alone. A body is at most three numbered points, each one to three short sentences naming the problem the change solves. A commit that settles a decision names the option it turned down, and why, in a numbered `Rejected:` point.
- `main` stays linear: work lands on it in order, never through a merge commit. A pushed commit is never amended or force-pushed; a fix lands as a later commit of its own.
- No trailers of any kind, `Co-authored-by:` and `Signed-off-by:` included: the `commit-msg` hook refuses a message from which git parses a trailer.
