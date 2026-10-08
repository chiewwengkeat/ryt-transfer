# 003. Biometric approval

## Context

A transfer needs proof that the account holder approved this transfer, to this recipient, for this amount, on their own phone. A biometric prompt that answers only yes or no proves none of that: it ties nothing to the transfer, and Expo's local-authentication module, for one, reports the same success for the phone's passcode as for a fingerprint. That passcode is often known to family, and it is all a phone asks before someone adds a fingerprint of their own.

Bank Negara Malaysia's Risk Management in Technology policy (RMiT) expects the code that authorises a transfer to be generated on the payer's device, with more than one factor, and to be specific to the confirmed recipient and amount. It forbids the app from storing a PIN, which the bank verifies centrally, and where biometrics alone authenticate a customer, it expects the bank to detect a change to the biometrics a device approves with. Some phones have no biometrics at all.

## Decision

Each transfer is approved by a signature the bank checks, never by a yes-or-no prompt:

- **A biometric key signs what the person saw.** A device key that only a strong biometric unlocks (EC P-256, with no device passcode) signs the transfer's details: the recipient's reference, registered name, masked ID and bank, the amount, currency and note, the transfer id and the bank's 60-second challenge, as JSON in a fixed key order. The bank rebuilds the same text and compares, so nothing shown on the review screen can be swapped on the way. One builder makes that text for the app and the mock bank alike, `buildSignedApprovalText` in `src/domains/transfer/api/approve-transfer/approve-transfer.ts`.
- **The phone's passcode authorises nothing.** The fallback is the app's own six-digit PIN pad. The bank checks the PIN and allows three tries, while a second hardware key, which needs no prompt, signs the same details. The bank tells the two paths apart by the key that signed, and refuses a signature from the second key that arrives without the right PIN.
- **A changed fingerprint or face ends the biometric key.** The app notices when signing fails, explains, takes the PIN once, approves the current transfer through the PIN path and registers a new biometric key with the same PIN. The bank records the change and notifies the customer.
- **Approval is a step on the review screen**, the system's biometric prompt or the PIN sheet over review, not a route of its own, so no URL or back entry leads into a half-approved transfer.
- **The signing library sits behind an adapter.** `@sbaiahmed1/react-native-biometrics` is pinned to an exact version, and the adapter always asks for EC P-256 and strong biometrics: without the strong setting, an iPhone key survives a newly added face or fingerprint.
- **The mock bank verifies every signature** with `@noble/curves` (`src/mocks/bank/verification.ts`), so a tampered amount is refused in the demo and in tests as the bank would refuse it.
- **The Demo menu never approves.** "No biometrics" sends approval down the PIN path, which still signs with the hardware key and still needs the PIN the bank checks; "Unlock PIN", shown only while the demo PIN is locked and marked as demo-only, unlocks it; the rooted-phone entry makes approval refuse. So no build approves a transfer without a real biometric or the PIN.

## Rejected

- **A yes-or-no biometric prompt.** It binds nothing to the recipient or the amount, so it produces no code the bank can check against what was approved.
- **A fallback key the phone's passcode unlocks.** Anyone who knows the passcode can approve, and can add their own fingerprint. A key that accepts the passcode also survives a new fingerprint, so the bank never learns the biometrics changed.
- **One key that either unlocks.** A newly added fingerprint, or the passcode, approves.
- **Signing less.** Signing only the recipient and the amount lets a note changed on the way pass; signing only the bank's challenge commits the phone to nothing it showed.
- **Building the signed text in the mock bank first, then in the approval domain.** The approval domain would end up holding the text its keys sign, at the cost of a move commit, a plain function in a `hooks/` folder, and a second declaration of the signed fields, since the approval domain cannot import the transfer domain's contracts.
- **A 12-hour hold after a biometric change.** Whoever holds the phone and the PIN approves through the PIN path and never registers a new key, so the hold stops nobody who has the PIN and falls only on the owner who added a finger. What acts against them is the bank's: every transfer and every biometric change is notified, and the account can be locked. Three wrong PINs lock the PIN at the bank, which stops someone guessing it, not someone who knows it.
- **A four-digit PIN.** Two taps fewer per PIN approval, but a weaker PIN for a bank: ten thousand combinations, so three blind guesses would succeed three times in ten thousand. Chosen instead: six digits, a million combinations, so three blind guesses succeed three times in a million.
- **Re-pairing in the host app, or quietly making a new key.** Re-pairing leaves approvals dead until the phone is paired again elsewhere, a dead end inside this module. A quiet new key hands approval to whoever adds a fingerprint.
- **Our own native signing module, or the older well-known library.** Our own module keeps third-party code away from the keys, at the cost of more native code with no emulator evidence behind it. The older library has had no release since 2022.
- **Approval as a screen of its own.** It repeats the review screen and adds a URL and a back entry into a half-approved transfer, both of which must then be guarded.
- **A shared modal route for approval.** Any flow could reuse it, but it would need the same guarding as a screen of its own, its result would have to reach the caller through shared state, and the 60-second challenge would no longer live within one screen.
- **A Demo menu that fakes approval results.** The demo build would approve transfers with no real authentication.
- **A Demo menu that never touches approval.** A reviewer on a real phone would have to remove their own fingerprints to see the PIN fallback.
- **A mock bank that trusts any signature.** A demo would pass a transfer the real bank would refuse, where checking each signature for real shows a tampered amount refused on screen.
