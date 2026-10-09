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

Malay and Chinese ship as machine translations, so I decided on a check that fails any money message leaving out its money state's phrase, and anything that offers to send the money again where a scenario forbids it. The banned words were to cover "send it again" as well as "try again", in all three languages. But six scenarios must warn against resending: three tell the person they shouldn't send it again, and three to check History before sending again. Banning the words anywhere in a message would have failed all six, and rewording them to pass would have removed the very warnings the check exists to protect. So, as decided, the check's retry-word half reads only what a person can press, buttons and action labels, and messages keep their warnings; the phrase half is the one that reads messages, each for its state's phrase ([002](decisions/002-scenario-matrix.md)). The cost is that the check does not catch a message urging a resend in words.

### A press that outlived leaving review

Every approval waits for a fresh check that the phone is not rooted or hooked, and on a slow phone that check takes a moment. An audit found that if someone pressed Transfer and went Back during that moment, the press still went through: the transfer was created, and the approval prompt rose over the amount screen they had gone back to. Locking Back and the swipe while the check ran would have closed that, at the cost of a screen that ignores someone trying to leave it. Instead, leaving review while the check runs cancels the press: nothing is created, no prompt appears, and they press again if they come back ([008](decisions/008-hardening.md)). A second audit found the same gap one wait later: once the bank has locked the PIN, the press also asks the phone whether its sensor can be used, and Back during that question still created and approved the transfer. So the press now looks again after every wait before a prompt or the PIN sheet appears, and stops if review was left: nothing is created, and a transfer already created is never approved. When that question finds the sensor locked after too many attempts, the press now stops there too and creates nothing, since only the locked PIN could approve. A changed fingerprint or face still gets through, and on Android so does a locked sensor, since Android's answer to that question never says locked: the phone learns of either only when it tries to sign, so with the PIN locked that transfer is created and then lapses unapproved, with no money moved.

### The capture block lifted a moment too soon

The block lifts only on the two receipts, and the first version lifted it the moment a receipt's route opened. But a screen transition is still running then, and its first frames show the screen being left: the review, with the recipient and the amount. The shell is not told when a transition ends, so the block now stays on for 600 milliseconds after a receipt opens, an allowance meant to outlast the transition, and goes back on before the next screen is drawn when a receipt is left.

### A block that never reached a new window

On the emulator, production's block failed open after someone left the app with Back and opened it again, or changed the text size: Android gives the app a new window then, and the block is a flag on one window. The app did ask for the block again, but the screen-capture library skips a request under a key it already holds, and the key taken at launch was still held, so the new window was never flagged. The demo build's "Screenshots blocked" pick hid the fault, since it starts unblocked and so lets the key go. Each request now also passes through a key that is let go at once, so it always reaches the current window, and on Android the block is asked for again each time the app becomes active. On the production build it held through every way of getting a new window that was tried.

## The decisions

- [001 Vertical slices](decisions/001-vertical-slices.md): screens folders and business domains as plain folders, imports that run one way, and a placement rule a script enforces.
- [002 Scenario matrix](decisions/002-scenario-matrix.md): one file describes every situation a transfer can meet, with permanent ids that tests, mocks, translations and the Demo menu all use.
- [003 Biometric approval](decisions/003-biometric-approval.md): each transfer is approved by a signature over exactly what the person saw, never by a yes-or-no prompt.
- [004 Mock backend](decisions/004-mock-backend.md): one fake bank with state, answering through the same msw handlers in tests and on a phone.
- [005 State](decisions/005-state.md): the flow is a typed reducer in a zustand store, and the transfer itself stays in the query cache.
- [006 Never sent twice](decisions/006-never-sent-twice.md): create, then approve; an idempotency key on every write; a lost answer resent briefly, then checked.
- [007 The fake bank cannot ship](decisions/007-production-guard.md): one build variant, one literally gated way in, and a decided CI check on what the production bundle holds.
- [008 Hardening](decisions/008-hardening.md): capture blocked everywhere but the receipts, the switcher blur, the rooted-phone refusal, and what only the bank's servers can do.
- [009 History at scale](decisions/009-history-at-scale.md): cursor pages, day totals from the bank, a recycling list, and re-render counts in place of timing claims.
- [010 Query cache only](decisions/010-query-cache-only.md): the bank's data lives in TanStack Query's cache, with no normalized store beside it.

## What I could not prove

What no device has proved, what the bank and the host app own, and what the languages and text sizes leave open are now on a page of their own: [limitations](limitations.md).
