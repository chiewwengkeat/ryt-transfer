# 008. Hardening

## Context

The app's screens hold a balance, recipients and the PIN pad, and an Android phone can run software working against its owner: malware that captures the screen, a screen-sharing scammer, an app drawing over this one to steer a tap, or an accessibility service or remote-control app reading the screen, a common route for Android banking scams in Malaysia. A rooted or hooked phone lets other code read or change this app while it runs. Records can outlive the app: Expo's build turns Android backup on unless told otherwise, and the iPhone keychain survives deleting the app. Bank Negara Malaysia's Risk Management in Technology policy asks for a mobile app designed to run in a secure, tamper-proof environment, but sets no rule to detect or block a rooted phone. And some protections can only be built on the bank's servers.

## Decision

A production build protects what is on screen, the phone it runs on and what it stores. What only the bank's servers can do is named, not faked.

- **Screen capture.** Production blocks screenshots and screen recording on every screen except the two receipts, the result page and a transfer's details. The shell switches the block on before the first render and lifts it only while a receipt is the current route, so a new screen is blocked unless it is named a receipt, and no screen opts in. On Android a blocked screen is also blank in the recent-apps view. Receipts stay capturable because people keep a screenshot of a receipt as proof of payment. Development and demo builds allow capture, and a Demo scenario shows the block.
- **The iOS app switcher.** A blur at the system's default strength covers the app in the switcher, in every build, never paused. At that strength figures may stay legible. The Face ID prompt is expected to make the app inactive, so the prompt likely shows over a blurred screen; no device has confirmed it.
- **Rooted, jailbroken or hooked phones.** Production refuses approval when the signing library reports root, a jailbreak or runtime hooks: those signals, never its overall verdict, which on Android also counts a phone with no screen lock, or any error, as compromised. An unclear result allows approval and logs it. Every approval waits for a fresh check, since hooks can attach after launch. The refusal takes the place of the approval prompt and offers no way to approve anyway. Development and demo builds skip the check, since emulators read as rooted, and a Demo scenario shows the refusal.
- **The PIN pad.** The app's own keypad, never the system keyboard. On Android, while the PIN sheet is open, the app ignores touches that arrive while another app draws over the screen. The filter covers the whole screen, because React Native hands every touch to its root view first, and the sheet says to close the app drawing over it. This is read from the code, not seen working: the emulator has no overlay app.
- **Permissions.** The Android app requests only what it uses, so writing contacts, drawing over other apps, shared storage and photo access are refused (`app.config.ts`). The permission to detect screenshots stays, in every variant: expo-screen-capture registers for screenshot events at every launch on Android 14 and newer, used or not, and Android closes the app without it. Nothing in the app listens for screenshots.
- **Storage.** Keys and records sit in the platform's secure storage, readable only on this device while it is unlocked (`src/shared/platform/secure-storage.ts`); Android backup is off (`app.config.ts`); and a reinstall wipes whatever an earlier install left behind.
- **Logs.** An allow-list decides what reaches a log or an analytics sink. Credentials and personal data count as sensitive and never do; amounts may (`src/shared/observability/observability.ts`).
- **Rules the lint enforces.** Storage goes only through the platform module, console output only through the observability module, and nothing imports the fake bank (`eslint.bans.mjs`). A secret scan runs with every lint.
- **The bank's side.** Proving a phone's integrity takes the bank's servers: Google Play Integrity on Android, Apple App Attest on iOS. This module names that step and builds none of it.
- **Not built: hiding the screen from accessibility services.** Android 14 lets an app mark its views so only genuine accessibility tools can read them. That needs native code, so a malicious accessibility service or a remote-control app can still read the screen. In production, that flag and the bank's server-side signals are the answer.

## Rejected

- **Blocking capture on the transfer steps only, or on those and Home.** History and a transfer's details run in their own route stack and hold names and amounts, so a block placed on the transfer steps misses them.
- **Blocking every screen, receipts included.** People keep a screenshot of a receipt as proof of payment.
- **Never blocking.** A balance, a recipient or the PIN pad on screen could be captured by malware or a screen-sharing scammer.
- **A full-strength blur, paused for Face ID.** The pause would switch the cover off around every approval, and anyone leaving the app mid-prompt would leave the review screen, recipient and amount, unblurred in the switcher.
- **No cover in the switcher.** A balance or a recipient's name would show to anyone glancing at the switcher.
- **expo-device's or jail-monkey's root check.** Either adds a library for a check the signing library already makes.
- **react-native-keychain.** A native module outside the SDK's versioning, where expo-secure-store is versioned with the SDK; its last release was in March 2025.
- **Encrypted MMKV.** Its encryption key would itself need the platform's secure storage: a second store for records that fit in the first.
- **A biometric lock on the stored records.** It would ask for a fingerprint at every launch-time check, and a biometric change would wipe the records.
- **An app lock, or a mock sign-in.** Sign-in, device pairing, PIN setup and reset, and the biometrics setting belong to the host app this module runs inside; building them here adds a capability nobody asked for.
