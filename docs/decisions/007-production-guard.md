# 007. The fake bank cannot ship

## Context

The demo build carries a fake bank and a Demo menu that changes its answers, so that a reviewer can see every scenario on a phone. Reviewers install a release build, and a release build switches off code marked development-only, so the fake bank cannot hide behind that switch: the demo needs a build of its own. A bank's customers install the production build, which must carry none of it. A rule that only says so proves nothing; what a production build holds has to be checked, on every change, by something other than intent.

## Decision

The build variant is the only setting, and a production build carries nothing fake:

- **One setting.** `EXPO_PUBLIC_APP_VARIANT` is `development`, `demo` or `production`, and unset or empty means production, so a build with no variant fails closed (`src/shared/config/config.ts`). The same default gives Jest the real `fetch` and the mock server with no special case. The variant decides the API address and whether the fake bank exists. There are no `.env` files, feature flags or remote config.
- **One way in.** Everything fake lives in `src/mocks/`. The shell loads it through a single `require` gated on a literal comparison of `process.env.EXPO_PUBLIC_APP_VARIANT`, written at the `require` itself. A release build inlines the variable and Metro strips the dead branch, but only in that literal form.
- **Lint holds the door.** A static import of `src/mocks/` is banned everywhere in app code, and only the shell may `require` it (`eslint.bans.mjs`). Decisions made at runtime read `isProductionBuild` instead, and never gate stripping on it.
- **The cache follows the variant.** Metro's transform cache never saw the variable, so a production bundle built straight after a demo one could carry the fake bank. The cache key now includes the variant (`metro.config.js`), and every build script regenerates its native project.
- **CI checks the outcome.** On every push, CI exports the production bundle and fails when its source map lists any file from `src/mocks/` or msw, or when the bundle holds a string only the mock code uses. The demo export must hold them, so a check that finds nothing has proved something.
- **The production app still starts.** On every push, a test renders the real app root as production runs it and fails if the fake bank's loader is touched. A production APK is also booted on an emulator by hand; a crash that only the bundled app shows is caught there, not on every push.
- **Production reaches nothing.** No backend exists, so production calls an address that never resolves.

## Rejected

- **One build with a demo mode to unlock.** The fake bank and the Demo menu would ship inside the production app, one unlock away from a customer.
- **Development and demo builds only.** With no production build, nothing would prove that the fake bank stays out of the app a bank ships.
- **Development as the default variant.** A release build made by hand without the variable would ship the fake bank, and Jest would run every test against the fake bank instead of `fetch` and the mock server.
- **Per-environment `.env` files.** Expo picks them by `NODE_ENV`, not by variant, so the variant would gain a second home.
- **A feature-flag layer.** Nothing has a second setting to switch, and every extra setting is one more that a reviewer or a release could set wrong.
- **Gating the `require` on an imported predicate.** Measured: a `require` behind an imported check, like any static import, stays in every build, production included.
- **Failing the production build itself when anything in it reaches the fake bank.** It would fail sooner, on the machine that builds, at the cost of a second guard to keep in step with the bundle check, which already fails CI on the same condition and reads the bundle that actually ships, however the fake bank got into it.
- **String markers only.** A fake-bank file carrying none of the marker strings would pass if something loaded it on its own, and a file added later would be covered only if it pulled in a marked one. The source map's path list covers every file, present and future, with no list to maintain.
