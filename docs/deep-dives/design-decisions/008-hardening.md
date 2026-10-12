# 008. Hardening

## Context

1. The app's screens show a balance, recipients and the PIN pad
2. An Android device can run software working against its owner, a common route for Android banking scams in Malaysia:
   1. Malware that captures the screen, or a screen-sharing scammer
   2. An app drawing over this one to steer a tap (tapjacking)
   3. An accessibility service or remote-control app reading the screen
3. A rooted device, or one with runtime hooks (another tool injecting code into the running app), lets other code read or change this app while it runs
4. Stored data can outlive the app: Expo's build turns Android backup on unless told otherwise, and the iOS keychain survives deleting the app
5. Bank Negara Malaysia's Risk Management in Technology policy (RMiT) asks for a mobile app designed to run in a secure, tamper-proof environment, and lists, among the controls an independent assessor checks for online transactions, an app that doesn't run on compromised devices; neither says how
6. Some protections can only be built on BE

## Decision

A production build protects what's on screen, the device it runs on and what it stores; what only BE can do is named, not faked:

1. **Screen capture**
   1. Production blocks screenshots and screen recording on every screen but the two receipts (the result page and a transfer's details)
   2. The app's root turns the block on before the first render, and lifts it only once a receipt has been the current route for 600 ms, long enough to outlast the screen transition, so the screen being left isn't captured as it slides away
   3. Leaving a receipt turns the block back on before the next screen renders; a receipt replaced by its error view is blocked again
   4. On Android, the root requests the block again each time the app becomes active, so it holds when Android recreates the app's window (after Back and reopening, or a text-size change)
   5. When BE ends the session over a receipt, the session-ended screen covering it stays capturable like the receipt, since the block follows the route beneath, and that screen shows no account data, at most the reference of a transfer still being checked
   6. A new screen is blocked unless it is listed as a receipt; no screen opts in
   7. On Android, a blocked screen is also blank in the recent-apps view
   8. Receipts stay capturable because users keep a screenshot of a receipt as proof of payment
   9. Development and demo builds allow capture; a Demo menu entry turns the block on
2. **The iOS app switcher**
   1. A blur at the library's default strength, 0.5, covers the app in the switcher, in every build, never paused
   2. On the simulator, the figures were illegible at that strength, and the Face ID prompt showed over the blurred app; a real iPhone is unchecked
   3. Where capture is blocked, the snapshot iOS keeps of an app in the background is black rather than blurred
3. **Rooted, jailbroken or runtime-hooked devices**
   1. Production rejects approval when the signing library reports root, a jailbreak or runtime hooks: those signals, never its overall verdict, which on Android also counts a device with no screen lock, or any error, as compromised
   2. An unclear result, or none within 5 s, allows approval and logs it, since a check that never returns must not lock a genuine customer out
   3. Every approval awaits a fresh check, since hooks can attach after launch
   4. Leaving review at any await before the biometric prompt or the PIN sheet appears, the check included, cancels the press: no transfer is created, none already created is approved, and no prompt appears
   5. The rejection replaces the approval prompt and offers no way to approve anyway
   6. Development and demo builds skip the check; a Demo menu entry shows the rejection
4. **The PIN pad**
   1. The app's own keypad, never the system keyboard
   2. On Android, while the PIN sheet is open, a tapjacking guard drops touches that arrive while another app draws over the screen
   3. The guard covers the whole screen, because React Native hands every touch to its root view first; the sheet says to close the app drawing over it
   4. Verified by reading the code only: the emulator has no overlay app
5. **Permissions**
   1. Writing contacts, drawing over other apps, shared storage and photo access are blocked, since the app uses none of them (`app.config.ts`)
   2. The screenshot-detection permission stays, in every variant, though nothing uses it: on Android 14 and newer, expo-screen-capture registers for screenshot events at every launch, used or not, and Android kills the app without it
6. **Storage**
   1. The signing keys never leave the device's hardware-backed keystore
   2. The few records the module keeps (its key ids, and the ids of transfers still being checked) sit in the platform's secure storage, which on iOS opens them only on this device while it is unlocked (`src/shared/platform/secure-storage/secure-storage.ts`)
   3. Android backup is off (`app.config.ts`)
   4. An install marker in general storage, missing at launch after a reinstall, wipes the records and keys an earlier install left behind
7. **Logs**: an allow-list decides what reaches a log or an analytics sink; credentials and personal data count as sensitive and never do; amounts may (`src/shared/observability/observability/observability.ts`)
8. **Lint rules** (`.config/eslint/bans.mjs`)
   1. Storage goes only through the platform module, except in the mock BE, which keeps its own state
   2. Console output goes only through the observability module
   3. Outside `src/mocks/`, only the test harness and the repository checks import the mock BE; the app's root loads it through its gated `require` and imports only the type of its demo contract
   4. A secret scan runs with every lint
9. **BE's side**: proving a device's integrity takes BE (Google Play Integrity on Android, Apple App Attest on iOS); this module names that step and builds none of it
10. **Not built: hiding the screen from accessibility services**
    1. Android 14 lets an app mark its views so only genuine accessibility tools can read them
    2. That needs native code, so a malicious accessibility service or a remote-control app can still read the screen
    3. In production, that flag and BE's server-side fraud signals close the gap

## Rejected

1. **Blocking capture on the transfer steps only, or on those and Home**. Reason: either leaves History's names and amounts capturable, since History is a route stack of its own; the first also leaves Home's balance and recent recipients capturable
2. **Blocking every screen, receipts included**. Reason: users keep a screenshot of a receipt as proof of payment
3. **Never blocking**. Reason: malware or a screen-sharing scammer could capture a balance, a recipient or the PIN pad
4. **An on/off switch for the block in the Demo menu**. Reason: it would stay on across scenarios, so the block could be shown during a BE scenario such as not enough balance, at the cost of a second kind of menu entry and one more field in the store behind it
5. **A switch with no matrix section**. Reason: it would be a demo-only control with no matrix id, unlike every scenario the Demo menu picks, and the matrix would never tell other FE consumers that capture is blocked
6. **react-native-capture-protection**. Reason: expo-screen-capture, Expo's own module, both blocks capture and renders the switcher blur, at a patch version that fixes an iOS bug where re-blocking on the next screen blacked out the app
7. **A full-strength blur, paused for Face ID**. Reason: the pause would turn the cover off around every approval, and a user leaving the app mid-prompt would leave the review screen, recipient and amount, unblurred in the switcher
8. **No cover in the switcher**. Reason: a balance or a recipient's name would show to anyone glancing at the switcher
9. **expo-device's or jail-monkey's root check**. Reason: either adds a library for a check the signing library already makes
10. **Disabling review's exits while the device check runs**. Reason: no press could outlive the user leaving review, but while the check ran, Back and the swipe would do nothing, and a user who wanted out would find the screen stuck. Instead, leaving cancels the press, and the user presses again on return
11. **No on-device root check, only a note in the write-up**. Reason: no genuine customer would be rejected on a device that misreports, but the check rejects only on a clear signal, and [the limitations](../limitations.md#what-the-bank-and-the-host-app-own) name what it can't do
12. **Hiding other apps' overlays while the PIN sheet is open**. Reason: it would remove an overlay rather than ignore touches through it; the guard drops the touches instead, and the sheet says why
13. **Leaving overlays as a documented gap**. Reason: no native code, at the cost of a PIN pad an overlay app could steer; a small native guard closes it instead
14. **Dropping blocked touches silently**. Reason: with a harmless overlay such as a screen dimmer, the keypad would just look dead
15. **Hiding the screen from accessibility services now, on Android 14 and newer**. Reason: it would stop a malicious accessibility service reading the marked views, at the cost of native code; the gap is named for production instead
16. **Keeping the template's permissions**. Reason: the app would request drawing over other apps, the permission tapjacking malware relies on, and shared storage, none of which it uses, and a store listing shows every permission an app requests
17. **Keeping the screen-capture library's two permissions**. Reason: photo access would be requested for nothing, since the library checks for it before using it; only the screenshot-detection permission came back, once blocking it crashed every launch on Android 14 and newer
18. **Patching the screen-capture library**. Reason: it would have kept the screenshot permission blocked, at the cost of a patched dependency in the repo, re-checked at every SDK upgrade; allowing that one permission, granted at install with no prompt, was chosen instead
19. **Dropping the screen-capture library**. Reason: the capture block and the switcher blur both come from it; allowing the one permission kept them
20. **react-native-keychain**. Reason: a native module outside the SDK's versioning, where expo-secure-store is versioned with the SDK; its last release was in March 2025
21. **Encrypted MMKV**. Reason: its encryption key would itself need the platform's secure storage, a second store for records that fit in the first
22. **A biometric lock on the stored records**. Reason: it would prompt for a fingerprint at every launch-time check, and a biometric change would wipe the records
23. **Treating financial data as sensitive too**. Reason: balances and amounts could never reach a log or an analytics sink either; amounts may, under this decision
24. **Treating only credentials as sensitive**. Reason: recipients' IDs and registered names could reach a log; they count as sensitive here
25. **Lint bans alone, with no secret scan**. Reason: one check fewer, but a committed key or token would be left to code review to catch
26. **No security checks beyond style**. Reason: a rule nobody checks is a rule someone breaks
27. **An app lock, or a mock sign-in**. Reason: sign-in, device pairing, PIN setup and reset, and the biometrics setting belong to the host app this module runs inside; building them here adds a capability nobody asked for
