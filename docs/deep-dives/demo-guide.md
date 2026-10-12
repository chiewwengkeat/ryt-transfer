# Demo guide

How to reach each scenario in the demo build:

1. [The scenario matrix](../../src/screens/transfer/scenarios/transfer.md): the single source of truth for what can happen while the user sends money
2. The Demo menu: the live list of the scenarios BE or the network can cause

## The Demo menu

Development and demo builds render a strip across the top of every screen:

1. **Demo ▾** opens the Demo menu, which picks one scenario at a time, then closes
2. With a scenario picked, the strip reads "Demo · " and the scenario's name; its ✕ goes back to normal
3. A pick persists until another replaces it, across app restarts too
4. Picks never combine

The menu, top to bottom:

1. **Unlock PIN**, marked "Demo only": shown only while the demo PIN is locked; stands in for the host app's PIN reset
2. **Normal, no scenario**: the mock BE behaves normally and keeps its state, such as the balance and today's limit used
3. **Screenshots blocked**: production's capture block, in the demo build. Screenshots and screen recordings come out blank on every screen but the two receipts (the result page and a transfer's details)
4. **Face or fingerprint unavailable**: approval falls back to the PIN, as when face and fingerprint approval is turned off in the host app's settings
5. **Rooted, jailbroken or tampered phone**: production's refusal, in the demo build. Review refuses to approve, in place of the approval prompt
6. One heading per step, listing every scenario BE or the network causes, by its name in the matrix. Pick one, then go to the step it names:

   | Step      | Entries                                                                                                                                                                                                                                                                                            |
   | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | Start     | New customer's lower daily limit · Balance or limit can't load · Transfers under maintenance · Offline · Something unexpected while starting                                                                                                                                                       |
   | Recipient | Something unexpected while choosing the recipient                                                                                                                                                                                                                                                  |
   | Amount    | Something unexpected while entering the amount                                                                                                                                                                                                                                                     |
   | Review    | Recipient not found · Name check unavailable · Too many name checks · Balance or limit short at confirmation · Phone paired less than 12 hours ago · Account opened less than an hour ago · Account locked · Name check expired · No answer when confirming · Something unexpected while reviewing |
   | Approval  | Approval key unknown to the bank · Approval window passed · Approval could not be verified · Balance or limit short at approval · Stopped by the bank's fraud check · Held for a security check · Receiving account inactive                                                                       |
   | Outcome   | Transfer processing · Refunded after processing · Something unexpected after sending                                                                                                                                                                                                               |
   | Recovery  | No answer to the approval · Bank still unreachable · Last transfer not found · Session ended · Unknown answer to the approval · Something unexpected while checking                                                                                                                                |

7. **Reset demo** resets the mock BE: the opening balance of RM12,845.50, today's limit unused, a newly seeded history, the PIN unlocked and no scenario picked

## What the demo build does differently

1. Production, by default:
   1. Blocks screenshots and screen recording on every screen but the two receipts
   2. Refuses approval on a phone that reports it is rooted, jailbroken, or runs runtime hooks
2. Demo and development builds, by default, do neither:
   1. Capture stays allowed, so the demo can be recorded
   2. The device check is skipped, so the demo approves on any test phone, emulator or simulator
3. **Screenshots blocked** and **Rooted, jailbroken or tampered phone** in the Demo menu each turn production's behaviour on, in the demo build

## Scenarios you cause yourself

The rest come from what you type or do, with **Normal, no scenario** picked unless a row says otherwise.

| Scenario                                          | How                                                                                                                                                                                                                  |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Balance and today's limit shown                   | Open the app                                                                                                                                                                                                         |
| Earlier transfer still being checked              | Pick **Transfer processing** and send a transfer. While it is still processing, start another (review warns), or close and reopen the app (Home warns)                                                               |
| Badly formed ID, amount or note                   | Type a mobile number with too few digits, an amount with three decimals, or a note with symbols                                                                                                                      |
| Contacts access refused                           | Tap the contacts button on the recipient step and deny access                                                                                                                                                        |
| Picked contact has no Malaysian mobile number     | Add a contact with no Malaysian mobile number to the phone's contacts, then pick it                                                                                                                                  |
| Recent recipient chosen                           | After one transfer, pick its recipient from the recent recipients, on Home or the recipient step                                                                                                                     |
| Amount over the balance or a limit                | Type more than the balance, more than today's remaining limit (RM5,000 a day to start with), or more than RM50,000                                                                                                   |
| Recipient found, First transfer to this recipient | Enter any well-formed ID: the mock BE gives each ID a registered name and bank of its own, and an ID you haven't sent to before gets the first-transfer warning                                                      |
| Details changed after no answer                   | Pick **No answer when confirming**, tap Transfer, go back, change the amount or note, and return to review                                                                                                           |
| Double tap on Transfer                            | Tap Transfer twice, quickly                                                                                                                                                                                          |
| Face or fingerprint recognised                    | Approve with a matching face or finger ([below](#face-id-fingerprints-and-the-demo-pin))                                                                                                                             |
| Face or fingerprint not recognised                | Route tests only: on the emulator and the simulator, a non-matching face or finger keeps the OS prompt open for another attempt, so FE only ever receives a cancel or, on Android, a lockout                         |
| Too many face or fingerprint attempts             | Android emulator: fail until its prompt asks for the emulator's own PIN, enter it, and the PIN sheet says there were too many attempts. The iOS simulator never locks Face ID out, so there the route tests cover it |
| Approval cancelled                                | Cancel the prompt, or close the PIN sheet                                                                                                                                                                            |
| Face or fingerprint unavailable                   | Pick **Face or fingerprint unavailable**, remove every fingerprint from the emulator, or turn Face ID enrolment off on the simulator                                                                                 |
| Fingerprints or face changed                      | Android: add a fingerprint in the emulator's settings once the app has set approval up. The iOS simulator never invalidates a key when enrolment changes, so it can't be shown there                                 |
| PIN chosen instead                                | Tap **Use PIN instead** under Transfer                                                                                                                                                                               |
| Incorrect PIN, PIN locked                         | Enter any PIN but the demo PIN. The third wrong PIN locks it; **Unlock PIN** in the Demo menu unlocks it                                                                                                             |
| Something unexpected while approving              | Route tests only; nothing in the demo causes it                                                                                                                                                                      |
| Transfer completed                                | Approve a transfer                                                                                                                                                                                                   |
| App closed during approval                        | Pick **No answer to the approval** and approve; while review still shows it as sending, close the app from the app switcher, then reopen it                                                                          |

## Face ID, fingerprints and the demo PIN

1. **iOS simulator**
   1. Turn on Features → Face ID → Enrolled
   2. While the prompt shows: Features → Face ID → Matching Face approves; Non-matching Face makes the prompt offer another attempt
   3. In Xcode 27, where DeviceHub replaces Simulator, that menu is Device → Face ID, and Matching Face is called Authorized with Face ID
   4. From a terminal: `xcrun simctl spawn booted notifyutil -p com.apple.BiometricKit_Sim.pearl.match` matches, and the same with `com.apple.BiometricKit_Sim.pearl.nomatch` doesn't
2. **Android emulator**
   1. Set a screen lock and add a fingerprint in the emulator's settings, touching the sensor from the emulator's extended controls (⋯ → Fingerprint) when asked
   2. While the prompt shows, touch the sensor with that finger to approve; another finger makes the prompt ask again
   3. From a terminal: `adb -e emu finger touch 1` touches with finger 1
3. **The demo PIN** shows on the PIN sheet itself; the mock BE allows three attempts
