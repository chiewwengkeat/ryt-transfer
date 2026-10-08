# 007. The fake bank cannot ship

## Context

The demo build carries a fake bank and a Demo menu that changes its answers, so that a reviewer can see every scenario on a phone. Reviewers install a release build, and a release build switches off code marked development-only, so the fake bank cannot hide behind that switch: the demo needs a build of its own. A bank's customers install the production build, which must carry none of it. A rule that only says so proves nothing; what a production build holds has to be checked, on every change, by something other than intent.

## Decision

The build variant is the only setting, and a production build carries nothing fake:

- **One setting.** `EXPO_PUBLIC_APP_VARIANT` is `development`, `demo` or `production`, and unset or empty means production, so a build with no variant fails closed (`src/shared/config/config.ts`). The same default gives Jest the real `fetch` and the mock server with no special case. The variant decides whether the fake bank exists. There are no `.env` files, feature flags or remote config, and with no backend for any variant to reach, the API address is a single constant.
- **One way in.** Everything fake lives in `src/mocks/`. The shell loads it through a single `require` gated on a literal comparison of `process.env.EXPO_PUBLIC_APP_VARIANT`, written at the `require` itself. A release build inlines the variable and Metro strips the dead branch, but only in that literal form.
- **Lint holds the door.** A static import of `src/mocks/` is banned everywhere in app code, and only the shell may `require` it (`eslint.bans.mjs`). Decisions made at runtime read `isProductionBuild` instead, and never gate stripping on it.
- **The cache follows the variant.** Metro's transform cache never saw the variable, so a production bundle built straight after a demo one could carry the fake bank. The cache key now includes the variant (`metro.config.js`), the APK scripts clear Metro's cache before they build, and every build script regenerates its native project.
- **A check on the outcome, in CI.** The decision is a CI job that exports the production bundle on every push and fails when its source map lists any file from `src/mocks/` or msw, or when the bundle holds a string only the mock code uses. The demo export must hold them, so a check that finds nothing has proved something.
- **A check that production still starts.** The decision pairs that job with a Jest test, run on every push, that renders the real app root as production runs it and fails if the fake bank's loader is touched. A crash that only the bundled app shows needs a production APK booted on a device, which no push does.
- **Production reaches nothing.** No backend exists, so production calls an address that never resolves.

## Rejected

- **One build with a demo mode to unlock.** The fake bank and the Demo menu would ship inside the production app, one unlock away from a customer.
- **Development and demo builds only.** With no production build, nothing would prove that the fake bank stays out of the app a bank ships.
- **Development as the default variant.** A release build made by hand without the variable would ship the fake bank, and Jest would run every test against the fake bank instead of `fetch` and the mock server.
- **Refusing to build or start with no variant.** A forgotten variable would stop the bundle and release builds with an error naming it, but Expo's own tools still read the config, so the config would have to treat an unset variable as development for them, and Jest would need the variable set as a special case.
- **Per-environment `.env` files.** Expo picks them by `NODE_ENV`, not by variant, so the variant would gain a second home.
- **A feature-flag layer.** Nothing has a second setting to switch, and every extra setting is one more that a reviewer or a release could set wrong.
- **Gating the `require` on an imported predicate.** Measured: a `require` behind an imported check, like any static import, stays in every build, production included.
- **Failing the production build itself when it reaches the fake bank.** A guard in Metro's resolver would stop such a build on the machine that makes it, a developer's included. The decided bundle check reads only the bundle CI itself exports, so a production build made anywhere else, such as one from a Metro cache warmed by an earlier demo build, never passes through it; for those builds this design relies on the variant in the cache key and on the APK scripts clearing the cache. That is the gap such a guard would close. It would have cost a few lines of build config, one proof that they stop such a build and pass a clean one, and a second definition of what counts as fake-bank code, in Metro's config, kept in step with the bundle check's.
- **String markers only.** A fake-bank file carrying none of the marker strings would pass if something loaded it on its own, and a file added later would be covered only if it pulled in a marked one. The source map's path list covers every file, present and future, with no list to maintain.
- **An Android build on every push as well.** Fifteen minutes or more a run; the release workflow builds the demo APK instead, on demand and for each release tag.
- **No CI.** No minutes and no upkeep, but nothing beyond an engineer's own machine would run the checks, nothing would show a reviewer that they pass, and the production bundle's check would have nowhere to run.
