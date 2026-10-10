# Ryt Transfer

A money-transfer module for a Malaysian banking app, on Android and iOS, in React Native, Expo SDK 57 and TypeScript. You pick who to pay, enter an amount, review it, approve it with your face, a fingerprint or your bank PIN, see what happened to the money, and find it in your history, all against a simulated bank.

Every situation a transfer can meet is described once, in the [scenario matrix](src/screens/transfer/scenarios/transfer.md). What each feature is, and where it's implemented and tested: [docs/features.md](docs/features.md).

## Demo video

<!-- Replace the next line with the video's link once it is uploaded. -->

The demo video is linked here once it is uploaded.

## Install the demo

Download `ryt-transfer-demo.apk` from the [latest release](https://github.com/chiewwengkeat/ryt-transfer/releases/latest) and open it on an Android phone, or run `adb install ryt-transfer-demo.apk` with an emulator running. It is the demo build, with the simulated bank and the Demo menu.

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

## Try the scenarios

- Development and demo builds show a strip across the top of every screen. Its **Demo ▾** button opens the Demo menu, which picks one scenario at a time.
- [The demo guide](docs/demo-guide.md) shows how to reach the scenarios.

## Assumptions

- **A Malaysian bank's customer.** Ringgit only, held as whole sen, and times shown in Malaysia time.
- **Transfers go over DuitNow**, to an ID or a bank account; the bank, never the app, looks up the registered name.
- **The module runs inside the bank's own app**, which owns sign-in and the PIN and talks to it through [two seams](docs/features.md#for-the-host-app).
- **The bank's API is designed here.** No backend exists, so each endpoint's types are a proposed contract.
- **The bank creates a transfer before anyone approves it.** Creating checks the balance and limits; only the approval moves money.
- **The bank's rules are the simulated bank's**: RM5,000 a day, RM50,000 a transfer, 60 seconds to approve, three PIN tries.

## Why it's built this way

The [write-up](docs/write-up.md) gives the calls that shaped the module, and the [decision records](docs/decisions/) hold each one's full argument.
