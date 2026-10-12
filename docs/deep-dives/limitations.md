# Limitations

The [write-up](../write-up.md#limits-and-what-id-do-next) names four limits, each with a next step; this page holds the full list. Two more next steps:

1. Hide the screen from accessibility services on Android 14 and newer (needs native code), alongside BE's server-side fraud signals
2. Close the accessibility gaps under [Languages and text size](#languages-and-text-size):
   1. Spoken announcements and the native navigation bar in the picked language
   2. A newly shown error scrolled into view at large text
   3. TalkBack focus returned to what opened a sheet

## What I could not prove

Only layouts were checked on a physical device: one Android phone, which also recorded the demo video. Every other device check used an Android emulator (Google's own image, API level 37) or an iOS 26.5 simulator, and some of this module's security only a physical device can prove:

1. **Device-only security is not verified on a device**
   1. iOS simulator: software keys, no Secure Enclave, the signing library renders its own prompt, and the keychain ignores the access-control flag that should require authentication
   2. Android emulator: a software keystore too, so the hardware-backed guarantee needs a physical device
   3. Release builds of the demo and production variants ran on the emulator and the simulator; physical devices, Android 16 and older, and the next Expo SDK are untested
2. **No key attestation**: nothing yet proves to BE that a signing key lives in a device's secure hardware
   1. Android key attestation and Apple App Attest are production steps
   2. The Secure Enclave and manufacturers' Android builds are unverified on physical devices
3. **The device integrity check's own result**: no device showed what the signing library's root and jailbreak check returns on the emulator or the simulator
   1. The demo build skips the check; the production build, with no BE to reach, never gets past Home to an approval
   2. The refusal was seen only through the Demo menu's stand-in; route tests cover the library's results
4. **VoiceOver only on the simulator**
   1. VoiceOver's own log names the voice that read each element and announcement, but a test driver can't move its cursor
   2. Checked: what VoiceOver reads first as each screen opens, and what it announces. Not checked: swiping through a screen
   3. No screen-reader check in this project used a physical iPhone
5. **The iOS app-switcher blur**
   1. Simulator: the blur covered the app on every screen tested, the Face ID prompt showed over a blurred app, and at the library's default strength the figures were illegible even in a full-resolution screenshot; a physical iPhone's switcher is unchecked
   2. Once the app is in the background, iOS keeps a snapshot of it for the switcher; where capture is blocked, that snapshot is black, not blurred
   3. After a Face ID approval, the result page opens while the app is still blurred, so on iOS its entrance animation plays unseen and the user sees the blur lift instead
6. **Capture blocking on iOS**
   1. The simulator takes no screenshot or screen recording of its own: its capture runs on the Mac, outside the simulated device, and is never blocked
   2. Seen only through two stand-ins, the switcher snapshot and the UI-test runner's screenshot: both black on the blocked screens tested, and not on a receipt
   3. Unproven: whether a screenshot, a screen recording or AirPlay mirroring on a physical iPhone comes out blank
7. **Capture blocking on Android**
   1. Emulator: blank in screenshots, screen recordings and the recent-apps thumbnail on every screen tested (production's Home and, under the demo build's Screenshots blocked pick, the screens production can't reach)
   2. A recording from review into a receipt stayed blank until the receipt had settled
   3. Stayed on after Back and reopening, and after a text size change, when Android gives the app a new window ([008](design-decisions/008-hardening.md))
   4. A screenshot saves a black image, but Android's own notice says the app detected the screenshot, not that it refused it: the library registers for screenshot events at every launch, and stopping that needs native code
   5. Only Google's emulator image was available, so how manufacturers' Android builds honour the block is unverified
8. **The tapjacking guard** is verified from the code only: the emulator has no overlay app to test it with
9. **Fingerprint lockout on Android**
   1. With the PIN locked at BE and the fingerprint locked out after too many attempts, pressing Transfer on the emulator created the transfer and opened Android's own prompt for the device PIN to recover fingerprints, not the PIN-locked sheet
   2. Cause: the signing library's Android side reports no lockout before a fingerprint is requested
   3. That transfer is never approved and expires, so no money moves; once fingerprints are recovered, the PIN-locked sheet shows. Accepted as an Android gap
   4. No simulator can lock Face ID out, so on iOS only route tests check that the press creates nothing and shows the PIN-locked sheet
10. **Haptics and motion**
    1. Emulator vibration log: the result page fires three distinct effects (success when money moved, a warning while not confirmed, an error when none moved), once per change, and none through the steps or after a cancelled prompt. The simulator has no haptics, so iOS haptics were never observed
    2. Reduced motion on, at launch or mid-session: screens fade on Android and cross-fade on iOS, the result page's content and its tick stay still, and the Demo menu opens and History's chevron turns instantly. Turned off again, the platform's own transitions return
    3. The result page's entrance and the tick's settle animation showed on the simulator and the emulator
    4. Unchecked: how the haptics feel, and how the motion performs on a physical device; an emulator has no vibration motor, and its frame rate says nothing about a phone's
11. **A blank frame after a PIN approval on Android**
    1. As the PIN sheet closes on an approval, Android can render it over plain grey or a near-white screen for 0.08 to 0.19 s before the result page renders, with review gone from beneath it: 4 of 12 approvals on one emulator
    2. A change meant to keep review rendered beneath the closing sheet removed it in 8 approvals on another emulator, but not on this one; the cause is not settled. iOS showed none
12. **The PIN sheet's content drops on Android** by about 28 dp as the sixth digit is entered, so Approve moves just after the last digit; iOS, which shows the same line, was not checked
13. **Device test coverage**
    1. Earlier device passes, in development builds and in English: the approval paths (face, fingerprint and PIN, the lockouts, the PIN lock at BE, an approval key BE no longer knows, a changed fingerprint, face or fingerprint unavailable), the result page's notices, the hold reasons under both screen readers, the recipient step with contacts, and History
    2. Release-build passes didn't re-test those, beyond approving by fingerprint and by Face ID, a non-matching face, and the Android lockout on the way. They covered what came after: the capture block, the switcher blur, the rooted-device refusal, the three languages, haptics and motion, and the accessibility bar at 200% text under TalkBack and VoiceOver
    3. Since then, a production release build covered, under TalkBack and VoiceOver: the bank picker sheet saying why it has no list and offering Try again, and a balance that fails to load, no longer re-announced on every refetch
    4. Since then, demo release builds covered, on both platforms:
       1. A pressed card fades only as far as a pressed button does
       2. The balance's error card padded like the loaded balance
       3. The balance card holds one height at the default text size while loading, once loaded, and when it says the balance couldn't be loaded, so nothing below it shifts; shorter during maintenance, when it shows the balance alone
       4. The balance on Home kept whole at the largest text sizes
       5. A busy button, such as review's Transfer, keeps its own colour so its spinner shows
       6. History keeps its words whole at 200% text
    5. And on Android:
       1. Try again offered on the result page, in History and on a transfer's details only while the OS reports a connection
       2. The bank picker sheet's Try again fetching from BE even while the OS reports none
       3. A return to the foreground with no connection fetching nothing, tested with no screen reader on
       4. The status bar's icons rendered dark
       5. Under TalkBack: History saying nothing of a first page that failed only because the session ended, once Sign in again lifts the session-ended screen; and the language sheet's title read first as it opens, with nothing from Home or the Demo strip spoken beneath it
    6. Two fixes made after those passes, pinned by route tests, keep the maintenance card compact and Transfer's reason for waiting in view while FE refetches the limits on returning to the foreground
    7. Not covered by any release build:
       1. Production past the amount step: with no BE to reach, it never gets to review, so its approval, its device integrity check and its receipts never ran on a device
       2. The result of an expired approval, on either platform, and of one stopped by the fraud check, on iOS
       3. TalkBack through the Demo menu and the PIN sheet
       4. At 200% text on Android: the session-ended, not-found and crash screens, History empty or failing, and Home during maintenance
       5. At 200% on iOS: the not-found and crash screens, History empty or failing, Home during maintenance, the contacts-refused notice, review's notices other than the first-transfer warning and the refusal, and the result page's unexpected state
       6. The contacts picker in Malay and Chinese; Voice Control, which the simulator lacks; and, on either platform, the app following a change of the device language
       7. Covered by route tests only: a crash on a receipt, since no build ships a way to crash a screen; Back during the device integrity check, or during the biometric sensor check the press makes once BE has locked the PIN; and a check that never resolves, since the demo build resolves its stand-in at once and production never reaches review
       8. The app's own copy for an unrecognised face or finger, which neither the emulator nor the simulator shows: both keep their own prompt open after a non-match, so route tests alone cover it
       9. Fixes only development builds covered:
          1. On iOS, the ID field's keyboard following the ID type, and the result's heading read first by VoiceOver
          2. The app's own copy held beneath the session-ended screen, and a heading read once Sign in again lifts that screen, which route tests check for iOS alone
          3. Try again after too many name checks offered only once the wait is over, a second refusal after that Try again announced again, and a short amount leading back to the amount step
          4. The result page opening straight from review, which shows the transfer as sending until then, with no other transfer screen between them
          5. An earlier transfer reported as still being checked only once the launch check has queried it
          6. The bank picker's matches and a screen's next control kept clear of the keyboard
          7. A sheet's title read first as it opens: on Android, for every sheet but the language sheet; on iOS, VoiceOver reads Close first, then moves to the title
          8. Home's language button kept whole at the largest text sizes
          9. The Demo strip hidden from VoiceOver while a sheet is open, and from TalkBack under every sheet but the language sheet; held to a few lines at the largest text sizes; and with no blank band under it on Android
       10. Fixes only route tests check:
           1. A press stopped wherever review is left
           2. The PIN-locked state loaded from secure storage before a press can create a transfer, with "Use PIN instead" hidden until then
           3. No unexpected error shown on review for a transfer that the session's end kept from being created, and only the session's end reported for it, or for recent recipients it failed
           4. No failure that was only the session's end shown for History's later pages or its refresh, or on a transfer's details, once Sign in again lifts the session-ended screen
           5. The bank picker sheet staying silent on that return to the foreground with no connection, which no screen reader has listened for
           6. On iOS, where the simulator always reports a connection: what Try again does with no connection on the result page, in History, on a transfer's details and in the bank picker sheet, and a return to the foreground with none; no transfer created while the PIN is locked and the device has locked face and fingerprint after too many attempts; and the capture block sent to the native module on every block, not only the first, which came with the fix that lets each request reach the app's current window, and which only Android covered
       11. A fix nothing checks and no device has covered: the balance on the amount step kept whole at the largest text sizes
14. **Home's warning after the result page is left early**
    1. Home and review now refetch the status of the newest transfer still being checked, about every 15 s while their warning shows
    2. An Approve response is recorded even when its result page never shows (e.g. Android's Back skips it), so Home says how the transfer ended, or warns while it is still being checked
    3. Both came after the release-build passes, and only development builds covered them: the refetch on both platforms, and the recorded response when Android's Back skips the result page
15. **History performance on iOS**: the [re-render counts](history-re-render-counts.md) were taken on Android
    1. iOS wasn't re-measured: in the spike, a release build's logs never reached iOS's log, and the iOS counts it did take matched Android's
    2. No count says anything about frame rate

## What the bank and the host app own

1. **Device integrity proof**
   1. The root and jailbreak check runs on the device, so it can be fooled, and it can refuse a genuine customer whose device misreports
   2. The refusal replaces the approval prompt, with no appeal inside this module and no way to approve anyway
   3. The real control is BE verifying the device server-side, through Google Play Integrity and Apple App Attest; this module names that step and builds none of it
   4. Separately, Bank Negara Malaysia's Risk Management in Technology policy (Appendix 11, paragraph 3) expects the bank to detect and end hijacked sessions promptly, and to warn a customer when a risky app raises their risk; that sits on the bank's side too
2. **Apps that read the screen**
   1. Blocking screenshots doesn't stop a malicious accessibility service or a remote-control app from reading the screen, a common route for Android banking scams in Malaysia
   2. Android 14 can hide an app's views from all but genuine accessibility tools, but that needs native code I chose not to add yet; with BE's server-side fraud signals, it is the production fix
3. **Moments capture blocking doesn't cover**
   1. The splash screen, before the JS bundle runs; it shows no data
   2. Entering a receipt: the block stays on for 600 ms after the receipt's route opens, meant to outlast the transition, so the screen being left (e.g. review, with its recipient and amount) isn't captured as it slides away. On a device slow enough that the transition outlasts it, the transition's last frames would be
   3. On the emulator, a recording from review into a receipt stayed blank until the receipt had settled
   4. Leaving a receipt: the block is back on before the next screen renders
   5. When BE ends the session while a receipt is open, the session-ended screen covering it is capturable like the receipt: the block follows the route beneath, and that screen shows no account data, at most the reference of a transfer still being checked
4. **An approval BE says expired**
   1. The result page treats it as no money moved, without checking whether money left the account; a transfer's details page checks, and so does the result page for a failed transfer
   2. Holds only while BE never debits a transfer whose approval expired, which its API contract must guarantee
5. **A transfer BE says it can't find**
   1. FE stops polling its status and drops its record, though whether money moved isn't confirmed
   2. On the result page: it says once that the transfer can't be found and to check Transfer history before sending again; nothing warns about it after Done or a relaunch
   3. On Home's refetch or the launch check: Home just stops warning about it
6. **The host app** owns sign-in, device pairing, PIN setup and reset, the biometrics setting and session handling: the banking app this module runs inside
7. **A second customer on one device**
   1. FE keeps only the signed-in customer's records of transfers still being checked: at launch, and at a sign-in after the session ended, it discards any other customer's
   2. On a shared device, a transfer still being checked for one customer loses its warning once the other signs in
8. **Someone holding the device and the PIN** can approve through the PIN path
   1. The countermeasures are the bank's: every transfer and every biometric change is notified, and the account can be locked
   2. Three wrong PINs lock the PIN at BE, which stops someone guessing it, not someone who knows it

## Languages and text size

1. **Malay and Chinese are machine translations**, used as they came and reviewed by no one. A glossary fixes the money phrases and the retry words; their overall quality is unknown
2. **Language tagging for screen readers**
   1. On iOS, the app tells VoiceOver which language each text and control is in; on the simulator, VoiceOver read them in its Malay and Chinese voices
   2. Untagged on both platforms: screen titles and back buttons rendered by the native navigation bar, since a custom header would lose the bar's own animation
   3. Untagged: spoken announcements, since React Native's announcement API takes no language. On the simulator, a Malay result was announced in the English voice, and a Chinese refusal in Japanese and Chinese voices by turns. Tagging them needs native code, which this module doesn't add
   4. Android has no such tagging at all: TalkBack reads Malay and Chinese in the device's own speech language, as it did on the emulator, and nothing here closes that
   5. Strings Android adds itself follow the device language, not the app's: its own back button's "Navigate up", and "busy" on a waiting button
3. **The Chinese is simplified**: the app matches the device language by its language code alone, so a device set to traditional Chinese gets the simplified text too
4. **Malay and Chinese were tested** on the emulator and the simulator through every screen of a transfer, History and the Demo menu, dates included. On both, a pick applied at once and persisted across a relaunch, the first screen already in the picked language, with no English frame first
5. **The accessibility bar at 200% text**
   1. Tested in English on the emulator at font scale 2 and on the simulator at the accessibility text size nearest 200%; and in Malay, the longest language, on the simulator's review, PIN sheet and result page
   2. Apart from the back buttons below, every control met 48 dp on Android and 44 pt on iOS, with a role and a name
   3. Two failures found:
      1. The floating offline notice covered content that couldn't scroll clear of it; fixed since, and only route tests check the fix
      2. History broke names and words mid-word. Since then, a row's amount and a day's total move below the text when a row lacks room for both, and a demo release build kept every word whole at 200% on the emulator, at 360 dp and 411 dp wide, and on the simulator
   4. What remains:
      1. Native screen titles keep their size at any text size, on both platforms; screens with headers of their own scale them up to 2×, past which a title's longest word would break. Home's language button in that bar grows to 1.5×, and no further
      2. The navigation bar's back button on the recipient step and History measures 30 × 30 dp on Android, under the 48 dp the app's own controls meet. iOS's own back chevron is 43 × 37 pt, a system control
      3. At 200% on iOS:
         1. An error or notice that appears below the visible part of a screen isn't scrolled into view: the amount's over-limit error while the keyboard is up, and the notice that a picked contact has no Malaysian mobile number. Screen readers still announce both
         2. A 16-character reference is wider than its row and breaks mid-token, since no layout can keep it whole at that size
      4. At the largest iOS text size on an iPhone SE, review's two buttons, Transfer and Use PIN instead, take about 70% of the screen in Malay, leaving a strip of review above them to scroll
      5. At the two largest iOS accessibility text sizes, a word or number wider than a History row's text column still breaks inside it:
         1. On a 402 pt simulator, "Unsuccessful" and a long one-word name, "SUBRAMANIAM", broke at both sizes; on a 360 dp emulator at 200%, the same name stays whole
         2. Computed from React Native's own layout code and the system font, and not observed beyond that simulator: "Unsuccessful" breaks on any iPhone narrower than about 410 pt at the second largest size and on every iPhone at the largest; the Malay "keselamatan" of a held transfer's status, below about 389 and 425 pt; and at the largest, on the smallest iPhones such as the SE, "Successful", "Processing" and a five-figure amount's digits too
      6. When the text size shrinks with the app open, Home's warning about an earlier transfer, and the Demo strip, keep their large height until the app restarts; screens opened afterwards lay out normally
      7. Demo build: at the largest iOS text sizes the Demo pill is cut off at the screen edge, and at 200% the Demo strip pushes the app down about 64 px
      8. On iOS, changing the text size while History is open renders the larger text clipped at the right edge until the screen is opened again
      9. On Android, when a deep link opened the app, changing the device's text size with the app open takes it back to the linked screen: on the emulator, History or a transfer's details came back in place of Home, three times in three
      10. Under TalkBack, closing a sheet sends focus to the top of the screen rather than back to what opened it; picking an ID type, or collapsing or expanding a History day, announces nothing until focus comes back to it
      11. On the emulator, TalkBack's explore-by-touch found nothing in a sheet's body, only its title and Close: held there, the bank picker sheet's text and Try again, and the language sheet's rows, said nothing, though swiping reached each of them, and the same hold found a button on the screen beneath once the sheet closed. The holds were sent through the emulator, not by a finger; why they find nothing is unknown
      12. Demo build: TalkBack moves from the result page's heading to the Demo strip about 2 s after the heading takes focus, and on review it goes to the strip first: review, unlike the result page, sends no screen reader to its heading
      13. Under VoiceOver, review's refusal after too many name checks is cut off at its sixth word, then read again whole: VoiceOver is already reading the refusal it has focused when the app's announcement of it begins. TalkBack says it once
      14. When the amount step's loading spinner sat outside the balance card, VoiceOver also read "Your balance couldn't be loaded." a second time, about 4 s after the app announced it, moving onto the notice from the spinner it had focused; TalkBack said it once. The spinner now sits inside the card, and whether VoiceOver still reads the notice twice is unchecked
6. **No haptic tick when typing an amount**: the amount is typed on the OS keyboard, which already clicks or buzzes on each key on most phones
7. **A load error with nothing failed**: opened with no connection and nothing loaded yet, History says "Couldn't load your transfers." and a transfer's details say "Couldn't load this transfer.", though the query is only paused until the device has a connection, and fetches by itself then
8. **The bank picker sheet can show "You're offline. Sending is paused until Ryt can be reached." twice**
   1. When the device loses its connection with the sheet open, the sheet and the app's own notice beneath it each show it
   2. The sheet fetches its list even offline, so a request that reaches BE meanwhile triggers a refetch of the list, and the sheet shows it again
   3. Both showed in Jest runs made to look for them, but no committed test checks either; whether a screen reader on a device speaks the second over the first is unchecked
