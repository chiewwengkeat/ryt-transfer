# Ryt Transfer

Android and iOS, React Native, Expo SDK 57, TypeScript. Features:

1. Transfer
2. Transfer History List

All handled transfer scenarios are detailed in the [scenario matrix](src/screens/transfer/scenarios/transfer.md)

## Install direct from APK

1. Download [ryt-transfer-demo.apk](https://github.com/chiewwengkeat/ryt-transfer/releases/latest) and install on your Android phone
2. Full-featured: all are BE API calls simulated with an API layer
3. See `Demo` button on top right of screen, to simulate many scenarios. [See demo video below](#demo-video)

## Demo video

[![External Link](docs/deep-dives/demo-video.jpg)](https://youtu.be/JoYJbxgE1o0)

## Write-ups

1. [Main summarized write-up](docs/write-up.md)
2. [More in-depth design decisions](docs/deep-dives/design-decisions/). Recommendations:
   1. [Folder architecture](docs/deep-dives/design-decisions/001-vertical-slices.md)
   2. [Architectural principle](docs/deep-dives/design-decisions/011-low-mental-load.md)

## Run from source

You need Node 22.14 or later on the 22 line (see `.nvmrc`) and pnpm, which the repo pins at 10.33.0. Node ships Corepack: run `corepack enable pnpm` once and `pnpm` starts the pinned version. A pnpm 10 or later installed another way (<https://pnpm.io/installation>) switches itself to the pin. Then, for the platform you build:

- iOS: Xcode 16.1 or later with an iOS simulator, and CocoaPods (`brew install cocoapods`).
- Android: JDK 17, and Android Studio with an emulator, with `ANDROID_HOME` set to its Android SDK (on a Mac, `export ANDROID_HOME=$HOME/Library/Android/sdk`).

```sh
pnpm install
pnpm ios        # or: pnpm android. Leave it running: it serves the app's code.
```

Once `pnpm ios` or `pnpm android` has built the development app, `pnpm start` serves it: its QR code and its `a` key open Ryt Transfer Dev, never Expo Go, which cannot run this app.

Build variants and checks: [CONTRIBUTING.md](CONTRIBUTING.md#build-variants) and its [checks](CONTRIBUTING.md#checks).

## Assumptions

- **A Malaysian bank's customer.** Ringgit only, held as whole sen, and times shown in Malaysia time.
- **Transfers go over DuitNow**, to an ID or a bank account; the bank, never the app, looks up the registered name.
- **The module runs inside the bank's own app**, which owns sign-in and the PIN and talks to it through [two seams](docs/deep-dives/features.md#for-the-host-app).
- **The bank's API is designed here.** No backend exists, so each endpoint's types are a proposed contract.
- **The bank creates a transfer before anyone approves it.** Creating checks the balance and limits; only the approval moves money.
- **The bank's rules are the simulated bank's**: RM5,000 a day, RM50,000 a transfer, 60 seconds to approve, three PIN tries.
