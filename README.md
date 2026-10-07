# Ryt Transfer

A money-transfer module for a mobile banking app, built with React Native, Expo SDK 57 and TypeScript.

## Run it

You need Node 22.13 or later on the 22 line (see `.nvmrc`), pnpm 12, and Xcode or Android Studio.

Install pnpm 12 from <https://pnpm.io/installation>, or prefix each `pnpm` command below with `npx pnpm@12.9.1`.

```sh
pnpm install
pnpm ios        # or: pnpm android
```

Expo Go cannot run this app: it carries native modules, biometric key signing among them, that Expo Go does not ship.

## Variants

`EXPO_PUBLIC_APP_VARIANT` picks the build: `development`, `demo` or `production`. Unset or empty means `production`, which has no fake bank and no Demo pill, so a bare `npx expo start` serves an app with no backend; start Metro with `pnpm start`. Development and demo carry their own name, app id and URL scheme, so they install beside production.

| Variant                                       | iOS                   | Android                   |
| --------------------------------------------- | --------------------- | ------------------------- |
| `development` (debug, served by `pnpm start`) | `pnpm ios`            | `pnpm android`            |
| `demo` (release)                              | `pnpm ios:demo`       | `pnpm android:demo`       |
| `production` (release)                        | `pnpm ios:production` | `pnpm android:production` |

Each script regenerates the native project for its variant before it builds: the variant is baked into the native app and inlined into the JavaScript bundle, and a fresh project leaves Gradle no stale bundle to reuse. A bare `npx expo run:*` reuses whatever native project the last variant left behind.

If your shell sets `CI`, delete `$TMPDIR/metro-*` before building another variant: under `CI` Metro keeps its cache, and a cached bundle still carries the previous variant.

## Checks

```sh
pnpm typecheck
pnpm lint    # ESLint, Prettier, the placement-ladder check and the secret scan
pnpm test
```
