# Ryt Transfer

A money-transfer module for a mobile banking app, built with React Native, Expo SDK 57 and TypeScript.

## Run it

You need Node 22 (see `.nvmrc`), pnpm 12, and Xcode or Android Studio.

Install pnpm 12 from <https://pnpm.io/installation>, or prefix each `pnpm` command below with `npx pnpm@12.9.1`.

```sh
pnpm install
npx expo run:ios      # or: npx expo run:android
```

Expo Go cannot run this app: it carries native modules, biometric key signing among them, that Expo Go does not ship.

## Variants

`EXPO_PUBLIC_APP_VARIANT` picks the build: `development` (the default), `demo` or `production`. Development and demo carry their own name and app id, so they install beside production. Keep the variable set for both steps, because the native build is where the JavaScript is bundled and the variant inlined:

```sh
EXPO_PUBLIC_APP_VARIANT=demo npx expo prebuild --clean
EXPO_PUBLIC_APP_VARIANT=demo npx expo run:ios --configuration Release   # or: npx expo run:android --variant release
```

## Checks

```sh
pnpm typecheck
pnpm lint    # ESLint, Prettier, the placement-ladder check and the secret scan
pnpm test
```
