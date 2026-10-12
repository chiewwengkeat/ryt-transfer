# 007. The mock BE cannot ship

## Context

1. The demo build carries a mock BE and a Demo menu that changes its responses, so a reviewer can see every scenario on a device
2. Reviewers install a release build, and a release build strips `__DEV__`-only code, so the mock BE can't hide behind `__DEV__`: the demo needs a build variant of its own
3. The bank's customers install the production build, which must carry none of it
4. A rule that only says so proves nothing; the production bundle's contents have to be checked on every change, against the built output rather than the build config

## Decision

The build variant is the only setting, and a production build carries no mock code:

1. **One setting**
   1. `EXPO_PUBLIC_APP_VARIANT` is `development`, `demo` or `production`; unset or empty means production, so a build with no variant fails closed (`src/shared/config/config.ts`)
   2. The same default gives Jest the real `fetch` and the MSW server, with no special case
   3. The variant decides whether the mock BE exists; no `.env` files, feature flags or remote config
   4. No BE exists for any variant to reach, so the API base URL is a single constant
2. **One entry point**
   1. All mock code lives in `src/mocks/`
   2. The app's root loads it through one `require`, gated on a literal comparison of `process.env.EXPO_PUBLIC_APP_VARIANT` written at the `require` itself
   3. A release build inlines the variable and Metro's dead-code elimination strips the dead branch, but only in that literal form
3. **Lint enforces the entry point**
   1. A static import of `src/mocks/` is banned in all app code but one: the root's type-only import of the demo contract, which the compiler erases, so no mock code reaches a bundle through it
   2. Only the app's root may `require` it (`.config/eslint/bans.mjs`)
   3. Runtime decisions use `isProductionBuild` instead, and never gate stripping on it
4. **Metro's cache key includes the variant**
   1. Metro's transform cache never saw the variable, so a production bundle built right after a demo one could carry the mock BE
   2. The cache key now includes the variant (`.config/metro.js`), the APK scripts clear Metro's cache before building, and every build script regenerates its native project
5. **A CI check on the built bundle**
   1. A CI job exports every variant's bundle on every push, plus one with no variant set (`scripts/check-production-bundle.js`)
   2. It fails when a production or unset bundle's source map lists any file from `src/mocks/` or msw, or the bundle holds a string only mock code uses
   3. The demo bundle must hold them, so a check that finds nothing has proved something
6. **A check that production still boots**
   1. A Jest test, run on every push, renders the real app root as a build with no variant and fails if the mock BE's loader is touched (`src/root/ViewRoot/tests/ViewRoot.production-boot.test.tsx`)
   2. A production APK is booted by hand on an emulator (`pnpm android:production`): a crash only the bundled app shows is caught there, not on every push
7. **Production reaches nothing**: no BE exists, so production calls a URL that never resolves

## Rejected

1. **One build with a demo mode to unlock**. Reason: the mock BE and the Demo menu would ship inside the production app, one unlock away from a customer
2. **Development and demo builds only**. Reason: with no production build, nothing would prove the mock BE stays out of the app the bank ships
3. **Development as the default variant**. Reason: a release build made by hand without the variable would ship the mock BE, and Jest would reach the mock BE through the demo's own transport instead of `fetch` and the MSW server
4. **Refusing to build or start with no variant**. Reason: a forgotten variable would stop bundle and release builds with an error naming it, but Expo's own tools still read the config, so the config would have to treat an unset variable as development for them, and Jest would need the variable set as a special case
5. **Per-environment `.env` files**. Reason: Expo picks them by `NODE_ENV`, not by variant, so the variant would gain a second home
6. **A feature-flag layer**. Reason: nothing has a second setting to switch, and every extra setting is one more a reviewer or a release could set wrong
7. **Gating the `require` on an imported predicate**. Reason: measured, a `require` behind an imported check, like any static import, stays in every build, production included
8. **Failing the production build itself when it reaches the mock BE**. Reason:
   1. A guard in Metro's resolver would stop such a build on the machine that makes it, a developer's included
   2. The bundle check reads only the bundle CI itself exports, so a production build made elsewhere (e.g. from a Metro cache warmed by an earlier demo build) never passes through it; for those builds this design relies on the variant in the cache key and on the APK scripts clearing the cache. That is the gap such a guard would close
   3. Its cost: a few lines of build config, one proof that they stop such a build and pass a clean one, and a second definition of mock code, in Metro's config, kept in step with the bundle check's
9. **String markers only**. Reason: a mock file carrying none of the marker strings would pass if something loaded it on its own, and a file added later would be covered only if it imported a marked one. The source map's file list covers every file, present and future, with no list to maintain
10. **An Android build on every push as well**. Reason: 15 minutes or more per run; the release workflow builds the demo APK instead, on demand and for each release tag
11. **No CI**. Reason: no minutes and no upkeep, but nothing beyond an engineer's own machine would run the checks, nothing would show a reviewer they pass, and the production bundle check would have nowhere to run
