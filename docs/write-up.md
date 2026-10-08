# Write-up

This is my account of building the transfer module: what pushed back while it was built, the decisions that shaped it, and what I have not been able to prove. Each decision's full argument, with the options it beat, is in its record under [`decisions/`](decisions/); this page links to them rather than repeating them.

## What pushed back

### The app crashed at every launch on Android 14 and newer

I had refused every Android permission the app does not use, the one for detecting screenshots included, since the app blocks screenshots and never listens for them. The demo build closed about 0.3 seconds after opening on the Android emulator. expo-screen-capture registers Android's screenshot callback at every launch, used or not, and Android 14 refuses that registration without the permission. I allowed that one permission in every variant: it is granted at install with no prompt, and it only reports captures of the app's own screen. The photo permission the same library adds stays refused, because the library checks for it before using it on older Android.

### A production bundle could carry the fake bank

The fake bank drops out of a production build only because the build inlines the variant and strips the branch that loads it. Metro's transform cache left the variant out of its key, so a production bundle built straight after a demo one reused the demo's transformed files and read the variant as `demo`, which would have shipped the fake bank. Replayed on full bundles, the leak showed in both orders and between two copies of the repository; with the variant in the cache key, every order came out right, and a build with no variant still came out as production ([007](decisions/007-production-guard.md)).

### The bottom sheet, reversed on evidence

The PIN sheet, the bank picker, the contacts chooser and the Demo menu all sit on one bottom sheet. I first picked @gorhom/bottom-sheet, the common React Native library, on its stated support for Reanimated 4. A read of its issue tracker and source then found open reports, on this exact stack of React Native 0.86 and Reanimated 4.5, of an Android sheet that intermittently turns invisible with every tap dead and of a sheet that never opens again after an interrupted close, all closed by a bot rather than fixed. Its Jest stand-in also shows every sheet's content at all times, so no test could see the PIN sheet open or close. A sheet on React Native's `Modal` would open in a separate window, outside the PIN pad's touch guard. So the app draws its own sheet, about 200 lines on the Reanimated it already had, inside its main window. It costs drag-to-dismiss, and screen-reader focus is kept inside the sheet by hand.

### The touch guard had to cover the whole screen

On Android, the PIN pad must ignore touches while another app draws over the screen, so that an overlay cannot trick someone into typing their PIN. React Native has no switch for Android's touch filter, so this takes a small native module. React Native's Android source showed its root view handing every touch to JavaScript before any inner view sees it, so a filter on the keypad's own view would act too late; only the root view can filter a touch first. The guard therefore filters the whole screen while the PIN sheet is open. A dropped touch gives no feedback, and with a harmless overlay such as a screen dimmer the keypad would simply look dead, so the sheet says to close the app drawing over the screen.

### A check that would have removed the warnings it guards

Malay and Chinese ship as machine translations, so I decided on a check that fails any money message leaving out its money state's phrase, and anything that offers to send the money again where a scenario forbids it. The banned words were to cover "send it again" as well as "try again", in all three languages. But six scenarios must warn against resending: three tell the person they shouldn't send it again, and three to check History before sending again. Banning the words anywhere in a message would have failed all six, and rewording them to pass would have removed the very warnings the check exists to protect. So, as decided, the check's retry-word half reads only what a person can press, buttons and action labels, and messages keep their warnings; its other half still holds every money message to its state's phrase ([002](decisions/002-scenario-matrix.md)). The cost is that the check does not catch a message urging a resend in words.

## The decisions

- [001 Vertical slices](decisions/001-vertical-slices.md): screens folders and business domains as plain folders, imports that run one way, and a placement rule a script enforces.
- [002 Scenario matrix](decisions/002-scenario-matrix.md): one file describes every situation a transfer can meet, with permanent ids that tests, mocks, translations and the Demo menu all use.
- [003 Biometric approval](decisions/003-biometric-approval.md): each transfer is approved by a signature over exactly what the person saw, never by a yes-or-no prompt.
- [004 Mock backend](decisions/004-mock-backend.md): one fake bank with state, answering through the same msw handlers in tests and on a phone.
- [005 State](decisions/005-state.md): the flow is a typed reducer in a zustand store, and the bank's data stays out of client state.
- [006 Never sent twice](decisions/006-never-sent-twice.md): create, then approve; an idempotency key on every write; a lost answer resent briefly, then checked.
- [007 The fake bank cannot ship](decisions/007-production-guard.md): one build variant, one literally gated way in, and a decided CI check on what the production bundle holds.
- [008 Hardening](decisions/008-hardening.md): capture blocked everywhere but the receipts, the switcher blur, the rooted-phone refusal, and what only the bank's servers can do.
- [009 History at scale](decisions/009-history-at-scale.md): cursor pages, day totals from the bank, a recycling list, and re-render counts in place of timing claims.
- [010 Query cache only](decisions/010-query-cache-only.md): the bank's data lives only in TanStack Query's cache, with no normalized store beside it.

## What I could not prove

Nothing here ran on a physical phone: every device check used an emulator or a simulator, and some of this module's security only a real phone can prove.

- **Device-only security is not device-verified.** On the iOS simulator the keys are software, the signing library draws its own prompt, there is no Secure Enclave, and the keychain ignores the setting that should demand authentication. On the Android emulator the keystore is software too, so the hardware guarantee needs a real phone. Release builds ran on the emulator and the simulator; physical devices, Android 16 and older, and the next Expo SDK remain untested.
- **No key attestation.** Nothing yet proves to the bank that a signing key lives in a phone's secure hardware: Android key attestation and Apple App Attest are production steps, and the Secure Enclave and manufacturers' Android builds are unverified on real devices.
- **No VoiceOver pass on a real iPhone.** No screen-reader check in this project uses a real iPhone.
- **The blur during approval.** The iOS switcher blur is always on at the library's default strength, so figures may stay legible in the switcher. I expect the Face ID prompt to make the app inactive and so appear over the blur; no device has confirmed it.
- **The touch guard** is read from the code, not seen working: the emulator has no overlay app to test it with.
- **Haptics and motion.** An emulator has no vibration motor, and its frame rate says nothing about a phone's, so the feel of the haptics and how the motion runs on a real phone are unchecked.
- **The capture block on manufacturers' Android.** Only Google's emulator image is available to check it on; how other manufacturers' builds of Android honour it is unverified.

## What the bank and the host app own

- **Proving the phone's integrity.** The rooted-phone check runs on the phone, so it can be fooled, and it can refuse a genuine customer whose phone misreports. The refusal takes the place of the approval prompt and offers no appeal inside this module, and no way to approve anyway. The real control is the bank verifying the phone on its servers, through Google Play Integrity and Apple App Attest; this module names that step and builds none of it. Separately, Bank Negara Malaysia's Risk Management in Technology policy, in Appendix 11, paragraph 3, expects the bank to detect and end hijacked sessions promptly, and to warn a customer when a risky app raises their risk; that sits on the bank's side too.
- **Apps that read the screen.** Blocking screenshots does not stop a malicious accessibility service or a remote-control app from reading the screen, a common route for Android banking scams in Malaysia. Android 14 can hide an app's views from all but genuine accessibility tools, but that needs native code I chose not to add yet; with the bank's server-side fraud signals, it is the production answer.
- **Unblocked moments.** At worst, the capture block is off during the splash screen before the app's code loads, which shows no data, and through a transition into or out of a receipt, when the screen on the other side, such as the review with its recipient and amount, is drawn unblocked.
- **The host app.** Sign-in, device pairing, PIN setup and reset, the biometrics setting and session handling belong to the banking app this module runs inside.
- **Someone holding the phone and the PIN** can approve through the PIN path. What acts against them is the bank's: every transfer and every biometric change is notified, and the account can be locked. Three wrong PINs lock the PIN at the bank, which stops someone guessing it, not someone who knows it.

## Languages and text size

- Malay and Chinese are machine translations, used as they came and reviewed by no one. A glossary fixes the money phrases and the retry words, but the translations' overall quality is unknown.
- The Chinese is simplified. The app matches the phone's language on its language code alone, so a phone set to traditional Chinese gets the simplified text too.
- The walk at 200% text is planned in English only, with Malay and Chinese at the default size on Android only, so Malay, which runs about a quarter longer than English, may clip at large sizes where nobody looks.
- Typing an amount gives no haptic tick: the amount is typed on the phone's own keyboard, which already clicks or buzzes on each key on most phones.
