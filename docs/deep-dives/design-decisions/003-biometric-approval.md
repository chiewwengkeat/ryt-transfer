# 003. Biometric approval

## Context

1. A transfer needs proof that the account holder approved this transfer, to this recipient, for this amount, on their own device
2. A pass/fail biometric prompt proves none of that: it binds nothing to the transfer, and Expo's local-authentication module, for one, reports the same success for the device passcode as for a fingerprint
3. The device passcode is often known to family, and it's all the OS requires before someone enrolls their own fingerprint
4. Bank Negara Malaysia's Risk Management in Technology policy (RMiT) expects:
   1. The code that authorises a transfer to be generated on the payer's device, with more than one factor, and specific to the confirmed recipient and amount
   2. No PIN stored by the app; the bank verifies it centrally
   3. Where biometrics alone authenticate a transaction, as when an app relies on the OS biometric check, the bank to detect a change to the biometrics a device approves with
5. Some devices have no biometrics at all

## Decision

Each transfer is approved by a signature BE verifies, never by a pass/fail prompt:

1. **A biometric key signs what review showed**
   1. A device key that only a strong biometric unlocks (EC P-256, no device passcode)
   2. Signed, as JSON in a fixed key order: the recipient's reference, registered name, masked ID and bank, the amount, currency and note, the transfer id and BE's 60-second challenge
   3. BE rebuilds the same text and compares, so nothing review showed can be swapped in transit
   4. One builder makes that text for FE and the mock BE alike: `buildSignedApprovalText` in `src/domains/transfer/api/approve-transfer/approve-transfer.ts`
2. **The device passcode authorises nothing**
   1. Fallback: the app's own six-digit PIN pad; BE verifies the PIN and allows three attempts
   2. A second hardware key, which needs no prompt, signs the same details
   3. BE tells the two paths apart by the signing key, and rejects a second-key signature sent without the right PIN
   4. A device the OS won't give a biometric key, because no strong biometric is enrolled, pairs with the second key alone and approves through the PIN path; a face or fingerprint enrolled later is set up as changed biometrics are, below
3. **Changed biometrics end the biometric key**
   1. FE detects the signing failure, explains, takes the PIN once, approves the current transfer through the PIN path, and registers a new biometric key with the same PIN
   2. BE records the change and notifies the customer
4. **Approval is a step on the review screen** (the OS biometric prompt, or the PIN sheet over review), not a route of its own, so no URL or back-stack entry leads into a half-approved transfer
5. **The signing library sits behind an adapter**
   1. `@sbaiahmed1/react-native-biometrics`, pinned to an exact version
   2. The adapter always requests EC P-256 and strong biometrics: without strong, an iPhone key survives a newly enrolled face or fingerprint
6. **The mock BE verifies every signature** with `@noble/curves` (`src/mocks/bank/verification/verification.ts`), so a tampered amount is rejected wherever the mock BE responds, as BE would reject it
7. **The Demo menu never approves**
   1. "Face or fingerprint unavailable" sends approval down the PIN path, which still signs with the hardware key and still needs the PIN BE verifies
   2. "Unlock PIN", shown only while the demo PIN is locked and marked demo-only, unlocks it
   3. The rooted-device entry makes FE refuse approval
   4. So no build approves a transfer without a real biometric or the PIN

## Rejected

1. **A pass/fail biometric prompt**. Reason: binds nothing to the recipient or the amount, so it produces no code BE can check against what was approved
2. **A fallback key the device passcode unlocks**. Reason: anyone who knows the passcode can approve, and can enroll their own fingerprint; a key that accepts the passcode also survives a new fingerprint, so BE never learns the biometrics changed
3. **One key that either unlocks**. Reason: a newly enrolled fingerprint, or the passcode, approves
4. **Signing less**. Reason: signing only the recipient and the amount lets a note changed in transit pass; signing only BE's challenge commits the device to nothing it showed
5. **Building the signed text in the mock BE first, then in the approval domain**. Reason: the approval domain would end up holding the text its keys sign, at the cost of a move commit and a second declaration of the signed fields, since the approval domain can't import the transfer domain's contracts
6. **A 12-hour hold after a biometric change**. Reason: whoever holds the device and the PIN approves through the PIN path and never registers a new key, so the hold stops nobody who has the PIN and falls only on the owner who enrolled a finger. What stops that holder is the bank's: every transfer and every biometric change is notified, and the account can be locked. Three wrong PINs lock the PIN at BE, which stops someone guessing it, not someone who knows it
7. **A four-digit PIN**. Reason: two taps fewer per PIN approval, but a weaker PIN for a bank: 10,000 combinations, so three blind guesses succeed 3 times in 10,000. Chosen instead: six digits, a million combinations, so three blind guesses succeed 3 times in a million
8. **Re-pairing in the host app, or silently creating a new key**. Reason: re-pairing leaves approvals dead until the device is paired again elsewhere, a dead end inside this module; a silent new key hands approval to whoever enrolls a fingerprint
9. **Our own native signing module, or the older well-known library**. Reason: our own module keeps third-party code away from the keys, at the cost of more native code with no emulator evidence behind it; the older library has had no release since 2022
10. **Approval as a screen of its own**. Reason: duplicates the review screen and adds a URL and a back-stack entry into a half-approved transfer, both of which must then be guarded
11. **A shared modal route for approval**. Reason: any flow could reuse it, but it needs the same guarding as a screen of its own, its result would have to reach the caller through shared state, and the 60-second challenge would no longer live within one screen
12. **A Demo menu that fakes approval results**. Reason: the demo build would approve transfers with no real authentication
13. **A Demo menu that never touches approval**. Reason: a reviewer on a real device would have to remove their own fingerprints to see the PIN fallback
14. **A mock BE that trusts any signature**. Reason: a demo would pass a transfer BE would reject, where verifying each signature for real rejects a tampered amount as BE would
