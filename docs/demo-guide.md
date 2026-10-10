# Demo guide

The [scenario matrix](../src/screens/transfer/scenarios/transfer.md) is the one description of what can happen while someone sends money, and the Demo menu itself is the live list of the scenarios the bank or the connection can cause. This page only shows how to reach each scenario in the demo build.

## The Demo menu

Development and demo builds show a strip across the top of every screen. Its **Demo ▾** button opens the Demo menu, which picks one scenario at a time and then closes. The strip then reads "Demo · " and the scenario's name, and its ✕ goes back to normal. A pick stays until another replaces it, through a restart too. Picks never combine.

The menu, top to bottom:

- **Unlock PIN**, marked "Demo only", is there only while the demo PIN is locked. It stands in for the PIN reset the host app would run.
- **Normal, no scenario**: the bank behaves normally and keeps what it holds, such as the balance and today's limit used.
- **Screenshots blocked**: production's capture block, in this build. Screenshots and screen recordings come out blank on every screen but the two receipts, the result page and a transfer's details.
- **Face or fingerprint unavailable**: approval goes to the PIN, as when face and fingerprint approval is turned off in the app's settings.
- **Rooted, jailbroken or tampered phone**: production's refusal, in this build. Review refuses to approve, in place of the approval prompt.
- One heading per step, listing every scenario the bank or the connection causes, by its name in the matrix. Pick one, then walk to the step it names:

  | Step      | Entries                                                                                                                                                                                                                                                                                            |
  | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Start     | New customer's lower daily limit · Balance or limit can't load · Transfers under maintenance · Offline · Something unexpected while starting                                                                                                                                                       |
  | Recipient | Something unexpected while choosing the recipient                                                                                                                                                                                                                                                  |
  | Amount    | Something unexpected while entering the amount                                                                                                                                                                                                                                                     |
  | Review    | Recipient not found · Name check unavailable · Too many name checks · Balance or limit short at confirmation · Phone paired less than 12 hours ago · Account opened less than an hour ago · Account locked · Name check expired · No answer when confirming · Something unexpected while reviewing |
  | Approval  | Approval key unknown to the bank · Approval window passed · Approval could not be verified · Balance or limit short at approval · Stopped by the bank's fraud check · Held for a security check · Receiving account inactive                                                                       |
  | Outcome   | Transfer processing · Refunded after processing · Something unexpected after sending                                                                                                                                                                                                               |
  | Recovery  | No answer to the approval · Bank still unreachable · Last transfer not found · Session ended · Unknown answer to the approval · Something unexpected while checking                                                                                                                                |

- **Reset demo** starts the bank afresh: the opening balance of RM12,845.50, today's limit unused, a newly seeded history, the PIN unlocked and no scenario picked.

## What the demo build does differently

Production blocks screenshots and screen recording on every screen but the two receipts, and refuses approval on a phone that reports it is rooted, jailbroken or hooked. The demo and development builds do neither by default: capture stays allowed so the demo can be recorded, and the phone check is skipped, so the demo approves on any test phone, emulator or simulator. **Screenshots blocked** and **Rooted, jailbroken or tampered phone** in the Demo menu each switch production's behaviour on, in the demo build.

## Scenarios you cause yourself

The rest come from what you type or do, with **Normal, no scenario** picked unless a line says otherwise.

| Scenario                                          | How                                                                                                                                                                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Balance and today's limit shown                   | Open the app.                                                                                                                                                                                                            |
| Earlier transfer still being checked              | Pick **Transfer processing** and send a transfer. While it is still processing, start another one (review warns), or close and reopen the app (Home warns).                                                              |
| Badly formed ID, amount or note                   | Type a mobile number with too few digits, an amount with three decimals, or a note with symbols.                                                                                                                         |
| Contacts access refused                           | Tap the contacts button on the recipient step and refuse access.                                                                                                                                                         |
| Picked contact has no Malaysian mobile number     | Pick a contact with no Malaysian mobile number, after adding one to the phone's contacts.                                                                                                                                |
| Recent recipient chosen                           | After one transfer, pick its recipient from the recent recipients, on Home or the recipient step.                                                                                                                        |
| Amount over the balance or a limit                | Type more than the balance, more than today's remaining limit (RM5,000 a day to start with), or more than RM50,000.                                                                                                      |
| Recipient found, First transfer to this recipient | Enter any well-formed ID: the simulated bank gives each one a registered name and bank of its own, and an ID you have not sent to before gets the first-transfer warning.                                                |
| Details changed after no answer                   | Pick **No answer when confirming**, tap Transfer, go back, change the amount or note, and return to review.                                                                                                              |
| Double tap on Transfer                            | Tap Transfer twice, quickly.                                                                                                                                                                                             |
| Face or fingerprint recognised                    | Approve with a matching face or finger (below).                                                                                                                                                                          |
| Face or fingerprint not recognised                | The route tests cover it: on the emulator and the simulator a non-matching face or finger keeps the phone's own prompt open to try again, so the app hears only a cancel or, on Android, a lockout.                      |
| Too many face or fingerprint attempts             | On the Android emulator, fail until its prompt asks for the emulator's own PIN, enter it, and the PIN sheet says there were too many attempts. The iOS simulator never locks Face ID, so there the route tests cover it. |
| Approval cancelled                                | Cancel the prompt, or close the PIN sheet.                                                                                                                                                                               |
| Face or fingerprint unavailable                   | Pick **Face or fingerprint unavailable**, or remove every fingerprint from the emulator, or turn Face ID enrolment off on the simulator.                                                                                 |
| Fingerprints or face changed                      | On Android, add a fingerprint in the emulator's settings once the app has set approval up. The iOS simulator never ends a key when enrolment changes, so it does not show there.                                         |
| PIN chosen instead                                | Tap **Use PIN instead** under Transfer.                                                                                                                                                                                  |
| Incorrect PIN, PIN locked                         | Enter any PIN but the demo PIN. The third wrong one locks it; **Unlock PIN** in the Demo menu unlocks it.                                                                                                                |
| Something unexpected while approving              | The route tests cover it; nothing in the demo causes it.                                                                                                                                                                 |
| Transfer completed                                | Approve a transfer.                                                                                                                                                                                                      |
| App closed during approval                        | Pick **No answer to the approval**, approve, and while review still says it is sending, close the app from the app switcher; then open it again.                                                                         |

## Face ID, fingerprints and the demo PIN

- **iOS simulator:** turn on Features → Face ID → Enrolled. While the prompt shows, Features → Face ID → Matching Face approves, and Non-matching Face makes the prompt offer to try again. From a terminal, `xcrun simctl spawn booted notifyutil -p com.apple.BiometricKit_Sim.pearl.match` matches, and the same with `com.apple.BiometricKit_Sim.pearl.nomatch` does not.
- **Android emulator:** set a screen lock and add a fingerprint in the emulator's settings, touching the sensor from the emulator's extended controls (⋯ → Fingerprint) when it asks. While the prompt shows, touch the sensor with that finger to approve; another finger makes the prompt ask again. From a terminal, `adb -e emu finger touch 1` touches with finger 1.
- **The demo PIN** shows on the PIN sheet itself. The bank allows three tries.
