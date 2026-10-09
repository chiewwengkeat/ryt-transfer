# Ryt Transfer

A money-transfer module for a Malaysian banking app, on Android and iOS, in React Native, Expo SDK 57 and TypeScript. You pick who to pay, enter an amount, review it, approve it with your face, a fingerprint or your bank PIN, see what happened to the money, and find it in your history, all against a simulated bank.

Every situation a transfer can meet is described once, in the [scenario matrix](src/screens/transfer/scenarios/transfer.md). What each feature is, and where it's implemented and tested: [docs/features.md](docs/features.md).

## Demo video

<!-- Replace the next line with the video's link once it is uploaded. -->

The demo video is linked here once it is uploaded.

## Install the demo

Download `ryt-transfer-demo.apk` from the [latest release](https://github.com/chiewwengkeat/ryt-transfer/releases/latest) and open it on an Android phone, or run `adb install ryt-transfer-demo.apk` with an emulator running. It is the demo build, with the simulated bank and the Demo menu.

## Run from source

You need Node 22.13 or later on the 22 line (see `.nvmrc`) and pnpm, which the repo pins at 10.33.0. Node ships Corepack: run `corepack enable pnpm` once and `pnpm` starts the pinned version. A pnpm 10 or later installed another way (<https://pnpm.io/installation>) switches itself to the pin. Then, for the platform you build:

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
- The demo PIN is `246810`.
- [The demo guide](docs/demo-guide.md) shows how to reach every scenario.

## Assumptions

- **A Malaysian bank's customer.** Ringgit only, held as whole sen, and times shown in Malaysia time.
- **Transfers go over DuitNow**, to a mobile number, an NRIC, a passport, a business registration number, an army or police number, or an account number at a named bank. The bank, never the app, looks up the name the ID is registered to.
- **The module runs inside the bank's own app**, which already signs the customer in, pairs the phone, sets up and resets the PIN, holds the biometrics setting and manages the session. The module reads that setting and hears of a PIN reset through [two seams](docs/features.md#for-the-host-app), and hands a session the bank ended back to it.
- **The bank's API is designed here.** No backend exists, so each endpoint's request and response types, in its domain's `api/` folder, are a proposed contract, and the simulated bank answers it. Production calls an address that never resolves.
- **The bank creates a transfer before anyone approves it.** Creating checks the balance, the limits, any waiting period and the account lock; only the approval moves money. Every write carries an idempotency key the bank honours for 24 hours.
- **The bank's rules are the simulated bank's**: RM5,000 a day, or RM1,000 on a new account, at most RM50,000 in one transfer, 60 seconds to approve, three tries at a six-digit PIN, and a wait of 12 hours after a new phone is paired or an hour after the account opens. The app shows the limits the bank returns rather than assuming them.

## Why it's built this way

The [write-up](docs/write-up.md) gives the calls that shaped the module, and the [decision records](docs/decisions/) hold each one's full argument.

## How this was built

I built this with Claude Code, Anthropic's coding agent, and this section is where I say who did what. No commit carries an AI co-author line: the repository's `commit-msg` hook refuses any trailer, and this section discloses it instead.

- **What I decided.** Every library, every feature and every rule here was my call. Before any code, Claude Code put the open questions to me in rounds, each with its options, what each would cost and a recommendation, and I picked one, sometimes against the recommendation, or answered in my own words. Questions that came up while building came back to me the same way. The [decision records](docs/decisions/) set out the larger choices and the options they beat.
- **What Claude Code did.** It wrote the code, the tests, the scenario matrix and these documents from those decisions. The work ran as parallel sessions on separate branches, each piece handed to its own agent with a written plan, and each commit is one slice of it.
- **How each step was checked.** CI runs the typecheck, lint, placement check and tests on every push. Review agents that wrote none of the code audited each piece against its plan and the source, and their fixes landed as commits of their own. The app ran on an Android emulator and an iOS simulator, never on a physical phone; the [write-up](docs/write-up.md) says what that leaves unproven.
