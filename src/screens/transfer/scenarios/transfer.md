# Transfer — what can happen

Every scenario a user can hit while sending money, from opening a transfer to its final outcome:

1. Every FE consumer that sends money (this app, a website, a lite app, a rebuild) follows this file; it is the only description of these scenarios
2. Tests, the mock BE, the translation bundles and analytics all reference each scenario by its id

**How to read it**:

1. Scenarios are grouped by the step where they happen, in the index's order
2. Money never moves before approval: Create Transfer moves no money, and only the Approve Transfer API call that follows can
3. The recipient step only validates the ID's format; BE looks up the registered name on review
4. Each scenario says when it happens, whether money moved, where it shows, what the user must be told and what they can do; where it matters, also what they must never be offered, what follows afterwards, and why
5. The exact copy lives in the translation bundles under the scenario's id: this file fixes what each message must say, not its wording

**How to change it**:

1. Edit any wording; keep the bold labels as they are
2. Never change a grey id: a new scenario gets a new id, and a removed scenario's id is never reused

**Money**:

1. Every Money line is exactly one of these four states
2. Where **Tell them** ends with a state's phrase, the scenario's message carries that phrase in every language
3. The Malay and Chinese phrases were machine-translated once

| Money | Malay | Chinese |
| --- | --- | --- |
| no money moved | tiada wang dipindahkan | 款项未转出 |
| money moved | wang telah dipindahkan | 款项已转出 |
| not confirmed yet | belum disahkan | 尚未确认 |
| money returned | wang telah dipulangkan | 款项已退回 |

**Retry words**:

1. Where **Never** reads "offer to send it again", no button or action label carries one of these words, in any language, and no message in any language offers to send it again
2. Messages keep their warnings, such as "shouldn't send it again" or "check Transfer history before sending again"

| Retry word | Language |
| --- | --- |
| try again | English |
| send it again | English |
| send again | English |
| cuba lagi | Malay |
| hantar semula | Malay |
| hantar lagi | Malay |
| 重试 | Chinese |
| 再次发送 | Chinese |
| 重新发送 | Chinese |

**Index**

- **Start** · [Balance and today's limit shown](#balance-and-todays-limit-shown) · [New customer's lower daily limit](#new-customers-lower-daily-limit) · [Balance or limit can't load](#balance-or-limit-cant-load) · [Transfers under maintenance](#transfers-under-maintenance) · [Offline](#offline) · [Earlier transfer still being checked](#earlier-transfer-still-being-checked) · [Screenshots blocked](#screenshots-blocked) · [Something unexpected while starting](#something-unexpected-while-starting)
- **Recipient** · [Badly formed ID, amount or note](#badly-formed-id-amount-or-note) · [Contacts access refused](#contacts-access-refused) · [Picked contact has no Malaysian mobile number](#picked-contact-has-no-malaysian-mobile-number) · [Recent recipient chosen](#recent-recipient-chosen) · [Something unexpected while choosing the recipient](#something-unexpected-while-choosing-the-recipient)
- **Amount** · [Amount over the balance or a limit](#amount-over-the-balance-or-a-limit) · [Something unexpected while entering the amount](#something-unexpected-while-entering-the-amount)
- **Review** · [Recipient found](#recipient-found) · [First transfer to this recipient](#first-transfer-to-this-recipient) · [Recipient not found](#recipient-not-found) · [Name check unavailable](#name-check-unavailable) · [Too many name checks](#too-many-name-checks) · [Balance or limit short at confirmation](#balance-or-limit-short-at-confirmation) · [Phone paired less than 12 hours ago](#phone-paired-less-than-12-hours-ago) · [Account opened less than an hour ago](#account-opened-less-than-an-hour-ago) · [Account locked](#account-locked) · [Name check expired](#name-check-expired) · [No answer when confirming](#no-answer-when-confirming) · [Details changed after no answer](#details-changed-after-no-answer) · [Double tap on Transfer](#double-tap-on-transfer) · [Something unexpected while reviewing](#something-unexpected-while-reviewing)
- **Approval** · [Face or fingerprint recognised](#face-or-fingerprint-recognised) · [Approval cancelled](#approval-cancelled) · [Face or fingerprint not recognised](#face-or-fingerprint-not-recognised) · [Too many face or fingerprint attempts](#too-many-face-or-fingerprint-attempts) · [Face or fingerprint unavailable](#face-or-fingerprint-unavailable) · [Fingerprints or face changed](#fingerprints-or-face-changed) · [PIN chosen instead](#pin-chosen-instead) · [Incorrect PIN](#incorrect-pin) · [PIN locked](#pin-locked) · [Approval key unknown to the bank](#approval-key-unknown-to-the-bank) · [Approval window passed](#approval-window-passed) · [Approval could not be verified](#approval-could-not-be-verified) · [Balance or limit short at approval](#balance-or-limit-short-at-approval) · [Stopped by the bank's fraud check](#stopped-by-the-banks-fraud-check) · [Held for a security check](#held-for-a-security-check) · [Receiving account inactive](#receiving-account-inactive) · [Rooted, jailbroken or tampered phone](#rooted-jailbroken-or-tampered-phone) · [Something unexpected while approving](#something-unexpected-while-approving)
- **Outcome** · [Transfer completed](#transfer-completed) · [Transfer processing](#transfer-processing) · [Refunded after processing](#refunded-after-processing) · [Something unexpected after sending](#something-unexpected-after-sending)
- **Recovery** · [No answer to the approval](#no-answer-to-the-approval) · [Bank still unreachable](#bank-still-unreachable) · [App closed during approval](#app-closed-during-approval) · [Last transfer not found](#last-transfer-not-found) · [Session ended](#session-ended) · [Unknown answer to the approval](#unknown-answer-to-the-approval) · [Something unexpected while checking](#something-unexpected-while-checking)

## Start

### Balance and today's limit shown
`transfer.balance_and_limit_shown`
- **When:** the balance and today's limit queries succeed, before a transfer starts
- **Money:** no money moved
- **Shown as:** on Home, and again on the amount step
- **Tell them:** their balance, and how much more they can send today
- **They can:** start a transfer
- **Why:** the user sees what they can afford before typing anything, so a limit never surprises them at the end

### New customer's lower daily limit
`transfer.new_customer_daily_limit`
- **When:** the account is new, so BE sets today's limit at RM1,000 instead of the usual RM5,000
- **Money:** no money moved
- **Shown as:** on Home, and again on the amount step
- **Tell them:** their balance, and how much more they can send today, as for any limit
- **They can:** send within the lower limit
- **Why:** banks start new customers on a cautious daily limit, and FE shows whatever limit BE returns, never an assumed one

### Balance or limit can't load
`transfer.balance_unavailable`
- **When:** the balance or today's limit query fails
- **Money:** no money moved
- **Shown as:** on Home, in place of the balance
- **Tell them:** their balance couldn't be loaded
- **They can:** retry
- **Never:** let them start a transfer before both have loaded
- **Why:** every amount check needs the balance and the limit, so sending waits for both instead of guessing

### Transfers under maintenance
`transfer.under_maintenance`
- **When:** BE returns `SERVICE_UNAVAILABLE`: transfers are paused for maintenance
- **Money:** no money moved
- **Shown as:** on Home, or on the review step if it begins mid-transfer
- **Tell them:** transfers are unavailable right now, and until when if the bank says
- **They can:** try again later
- **Afterwards:** Home queries BE again at the time BE returned, and turns Transfer back on once maintenance is over
- **Why:** BE knows when maintenance ends, so FE shows BE's time, never one of its own

### Offline
`transfer.offline`
- **When:** the OS reports no connection, or a request fails for lack of network
- **Money:** no money moved
- **Shown as:** once, at the foot of Home and of each transfer step, with sending paused; a screen that sends nothing says only that they're offline, in place of its Try again
- **Tell them:** they're offline and sending is paused
- **They can:** wait, or try again where the bank list waits for them
- **Afterwards:** the offline state clears once a request gets a response from BE
- **Why:** the OS can report a connection that never reaches BE, so only a request that gets a response ends the offline state

### Earlier transfer still being checked
`transfer.earlier_transfer_unconfirmed`
- **When:** a transfer they approved earlier still has no final status from BE
- **Money:** not confirmed yet
- **Shown as:** on Home and the review step
- **Tell them:** their last transfer is still being checked, so they shouldn't send it again, with a reference to quote to support — not confirmed yet
- **They can:** carry on with a new transfer at their own risk
- **Never:** offer to send it again
- **Afterwards:** while Home or the review step is open and in front, FE queries the newest such transfer's status about every 15 seconds; an older one is queried at the next launch, or once the newer one settles
- **Why:** the earlier transfer may still complete, so a second one could pay twice, and the user decides with that in front of them

### Screenshots blocked
`transfer.screen_capture_blocked`
- **When:** they take a screenshot or record the screen anywhere but a receipt, in the production build
- **Money:** no money moved
- **Shown as:** the screenshot or recording comes out blank; on Android 14 and newer the OS may say the app detected the screenshot, and on older Android that the app doesn't allow it
- **Tell them:** nothing more; the phone's own notice is enough
- **They can:** carry on; a receipt can still be captured
- **Why:** a balance, a recipient or the PIN pad on screen can be captured by malware or a screen-sharing scammer

### Something unexpected while starting
`transfer.start_unexpected`
- **When:** anything the scenarios above don't name goes wrong before a recipient is chosen
- **Money:** no money moved
- **Shown as:** on the screen where it happened
- **Tell them:** something unexpected went wrong
- **They can:** try again, or go back
- **Why:** no transfer exists yet, so no money can have moved and retrying is always safe

## Recipient

### Badly formed ID, amount or note
`transfer.badly_formed_input`
- **When:** an ID, an amount or a note fails format validation — a mobile number with too few digits, an amount with three decimals, a note with symbols
- **Money:** no money moved
- **Shown as:** under the field
- **Tell them:** what's wrong with that field
- **They can:** fix it
- **Why:** FE validation catches a malformed value without an API call, and BE validates every value again anyway

### Contacts access refused
`transfer.contacts_access_refused`
- **When:** they pick a recipient from their contacts but deny the contacts permission
- **Money:** no money moved
- **Shown as:** on the recipient step
- **Tell them:** to allow contacts access in Settings, or type the number
- **They can:** type the number, or open Settings
- **Why:** contacts are a shortcut, so denying access never blocks a transfer

### Picked contact has no Malaysian mobile number
`transfer.contact_without_mobile`
- **When:** the contact they pick has no Malaysian mobile number
- **Money:** no money moved
- **Shown as:** on the recipient step
- **Tell them:** that contact has no Malaysian mobile number
- **They can:** pick another contact, or type a number
- **Why:** only a Malaysian mobile number can be a DuitNow mobile ID, so FE says so instead of filling the field with one BE would reject

### Recent recipient chosen
`transfer.recent_recipient_chosen`
- **When:** they pick someone they've sent to before from their recent recipients
- **Money:** no money moved
- **Shown as:** on the recipient step, as the recipient picked, in place of the ID field
- **Tell them:** who they picked; review then shows the name the bank holds today
- **They can:** continue, or change the recipient
- **Why:** a recent recipient saves typing, but BE's name check still runs afresh, so a changed or reassigned number is never trusted from an earlier lookup

### Something unexpected while choosing the recipient
`transfer.recipient_unexpected`
- **When:** anything the scenarios above don't name goes wrong on the recipient step
- **Money:** no money moved
- **Shown as:** on the recipient step
- **Tell them:** something unexpected went wrong
- **They can:** try again, or go back
- **Why:** no transfer exists yet, so no money can have moved and retrying is always safe

## Amount

### Amount over the balance or a limit
`transfer.amount_too_high`
- **When:** the amount exceeds their balance, today's remaining limit, or RM50,000 per transfer
- **Money:** no money moved
- **Shown as:** under the amount, as they type
- **Tell them:** which of the three it is over, naming the figure
- **They can:** lower the amount
- **Why:** the user learns which limit they hit while typing; BE checks all three again before any money moves

### Something unexpected while entering the amount
`transfer.amount_unexpected`
- **When:** anything the scenarios above don't name goes wrong on the amount step
- **Money:** no money moved
- **Shown as:** on the amount step
- **Tell them:** something unexpected went wrong
- **They can:** try again, or go back
- **Why:** no transfer exists yet, so no money can have moved and retrying is always safe

## Review

### Recipient found
`transfer.recipient_found`
- **When:** BE's name check finds the ID and returns the name and bank registered to it
- **Money:** no money moved
- **Shown as:** on the review step, beside the amount and note
- **Tell them:** the registered name and bank
- **They can:** confirm, or go back and change anything
- **Why:** the user approves only after seeing who the money goes to as BE records them, never a typed or remembered name

### First transfer to this recipient
`transfer.first_transfer_to_recipient`
- **When:** BE says they have never sent to this recipient before
- **Money:** no money moved
- **Shown as:** on the review step, beside the name
- **Tell them:** it is their first transfer to this recipient, so they should check the name is who they expect
- **They can:** confirm, or go back
- **Why:** scams target first payments to new accounts, so the first one gets a second look without an extra step

### Recipient not found
`transfer.recipient_not_found`
- **When:** BE returns `RECIPIENT_NOT_FOUND`: no DuitNow account is registered to the ID
- **Money:** no money moved
- **Shown as:** on the review step
- **Tell them:** no DuitNow account was found for this ID
- **They can:** go back to the recipient step
- **Why:** an ID with no account behind it can never be paid, so the user fixes it first

### Name check unavailable
`transfer.name_check_unavailable`
- **When:** BE returns `NAME_ENQUIRY_UNAVAILABLE`: it can't confirm recipient names right now
- **Money:** no money moved
- **Shown as:** on the review step
- **Tell them:** recipient names can't be confirmed right now
- **They can:** retry
- **Never:** let them confirm without a registered name
- **Why:** the registered name is what the user approves against, so a transfer never goes ahead without one

### Too many name checks
`transfer.too_many_name_checks`
- **When:** BE rejects the name check after too many in a short time (`TOO_MANY_LOOKUPS`)
- **Money:** no money moved
- **Shown as:** on the review step
- **Tell them:** to try again in a minute
- **They can:** wait, then retry
- **Why:** rate-limiting name checks stops anyone harvesting names by guessing IDs, so the wait is deliberate

### Balance or limit short at confirmation
`transfer.balance_or_limit_short_at_confirmation`
- **When:** Create Transfer finds the amount over the balance or a limit (`INSUFFICIENT_FUNDS`, `DAILY_LIMIT_EXCEEDED`, `ABOVE_PER_TRANSFER_MAX`)
- **Money:** no money moved
- **Shown as:** on the review step
- **Tell them:** the reason — not enough balance, or over a limit
- **They can:** go back to the amount
- **Why:** BE checks again on Create Transfer, because the balance or limit can change after the amount was typed

### Phone paired less than 12 hours ago
`transfer.cooling_off_new_phone`
- **When:** Create Transfer, or Approve Transfer, returns `COOLING_OFF`: this phone was paired with the account less than 12 hours ago
- **Money:** no money moved
- **Shown as:** on the review step
- **Tell them:** they can send money from a given time — a security wait after pairing this phone
- **They can:** wait
- **Why:** a newly paired phone is the likeliest sign of a stolen login, so it waits before money can leave

### Account opened less than an hour ago
`transfer.cooling_off_new_account`
- **When:** Create Transfer, or Approve Transfer, returns `COOLING_OFF`: the account was opened less than an hour ago
- **Money:** no money moved
- **Shown as:** on the review step
- **Tell them:** they can send money from a given time — a security wait after opening their account
- **They can:** wait
- **Why:** a brand-new account is a common tool in scams, so its first hour allows no outgoing transfers

### Account locked
`transfer.account_locked`
- **When:** Create Transfer, or Approve Transfer, returns `ACCOUNT_LOCKED`
- **Money:** no money moved
- **Shown as:** on the review step
- **Tell them:** their account is locked, and to contact Ryt to unlock it
- **They can:** leave
- **Why:** a lock is the customer's own emergency stop, so FE offers no way around it

### Name check expired
`transfer.name_check_expired`
- **When:** more than 10 minutes have passed since the name check, so Create Transfer rejects its recipient reference (`RECIPIENT_REF_EXPIRED`)
- **Money:** no money moved
- **Shown as:** on the review step
- **Tell them:** to confirm the recipient again
- **They can:** confirm again, which runs the name check afresh
- **Why:** a registered name can change, so one confirmed long ago is checked again before money goes to it

### No answer when confirming
`transfer.confirmation_unanswered`
- **When:** Create Transfer gets no response, even after FE's retries
- **Money:** no money moved
- **Shown as:** on the review step
- **Tell them:** they couldn't reach Ryt — no money moved
- **They can:** try again
- **Why:** Create Transfer moves no money, and a retry re-sends the same `Idempotency-Key`, so BE never creates two transfers

### Details changed after no answer
`transfer.details_changed_after_no_answer`
- **When:** after Create Transfer got no response, they change the recipient, amount or note before confirming again
- **Money:** no money moved
- **Shown as:** on the review step, with the new details
- **Tell them:** the new details, to confirm afresh
- **They can:** confirm them as a new transfer
- **Why:** changed details get a new `Idempotency-Key`, so BE treats them as a new transfer, never a retry of the old one

### Double tap on Transfer
`transfer.double_tap_ignored`
- **When:** they tap Transfer again while the first tap is still being handled
- **Money:** no money moved
- **Shown as:** on the review step, where the second tap does nothing
- **Tell them:** nothing more; the first tap carries on
- **They can:** wait for it
- **Why:** one tap is one transfer, so a second tap while the first is in flight can never start another

### Something unexpected while reviewing
`transfer.review_unexpected`
- **When:** anything the scenarios above don't name goes wrong on the review step before Approve Transfer is sent, for example BE returning an error code FE doesn't know
- **Money:** no money moved
- **Shown as:** on the review step
- **Tell them:** something unexpected stopped the transfer — no money moved
- **They can:** try again, or go back
- **Why:** no Approve Transfer request has been sent, so no money can have moved and retrying is safe

## Approval

### Face or fingerprint recognised
`transfer.biometrics_recognised`
- **When:** their face or fingerprint is recognised; the device key signs exactly what review shows, and FE sends Approve Transfer
- **Money:** not confirmed yet
- **Shown as:** the OS biometric prompt, then the review step showing the transfer as sending
- **Tell them:** it is being sent, and the bank's answer comes next
- **They can:** wait for the bank's answer, which leads to one of the Outcome scenarios
- **Never:** offer to send it again while the response is awaited
- **Why:** a signature over everything review showed lets BE prove these details, and no others, were approved

### Approval cancelled
`transfer.approval_cancelled`
- **When:** they cancel the biometric prompt, or close the PIN sheet without approving; also when the OS closes its own prompt, as newer Android does when it locks the phone after too many failed attempts, which reaches FE as a cancel
- **Money:** no money moved
- **Shown as:** on the review step
- **Tell them:** the transfer was not sent — no money moved
- **They can:** transfer again, which creates a new transfer, or edit the details
- **Why:** closing the prompt is a clear no, and only Approve Transfer moves money, so the unapproved transfer expires at BE

### Face or fingerprint not recognised
`transfer.biometrics_not_recognised`
- **When:** the OS doesn't recognise their face or fingerprint, and the prompt closes
- **Money:** no money moved
- **Shown as:** on the review step
- **Tell them:** they were not recognised, and can try again or use their PIN
- **They can:** try again, or approve with their PIN
- **Never:** approve with the device passcode
- **Why:** a device passcode is often shared, and is all the OS asks before anyone adds a fingerprint, so only the PIN, verified by BE, stands in for biometrics

### Too many face or fingerprint attempts
`transfer.biometrics_locked_out`
- **When:** the OS locks face and fingerprint recognition after too many failed attempts; newer Android handles the lockout inside its own prompt, so this also shows when the device key can't sign after that prompt's own recovery with the device PIN
- **Money:** no money moved
- **Shown as:** the PIN sheet, over the review step
- **Tell them:** there were too many attempts, so they approve with their PIN
- **They can:** approve with their PIN
- **Never:** approve with the device passcode
- **Why:** the OS lockout stops guessing at the sensor, and the PIN, verified and rate-limited by BE, still lets the owner finish

### Face or fingerprint unavailable
`transfer.biometrics_unavailable`
- **When:** biometric approval is off in the host app's settings, nothing is enrolled on the device, or the device has no usable sensor, a face unlock the OS rates too weak to protect a key counting as none
- **Money:** no money moved
- **Shown as:** the PIN sheet, over the review step, saying why
- **Tell them:** why face or fingerprint approval isn't available, and that they approve with their PIN
- **They can:** approve with their PIN
- **Never:** approve with the device passcode
- **Why:** every phone must be able to approve, and the PIN path still signs with a hardware-backed device key and is verified by BE

### Fingerprints or face changed
`transfer.biometrics_changed`
- **When:** a fingerprint or face was added or removed on the device since approval was set up, which invalidates the biometric key, or was added to a device set up while none was enrolled, which had no biometric key
- **Money:** no money moved
- **Shown as:** the PIN sheet, over the review step
- **Tell them:** their fingerprints or face changed; their PIN approves this transfer and turns face or fingerprint approval back on
- **They can:** approve with their PIN; face or fingerprint approval is then set up again with the same PIN
- **Never:** turn face or fingerprint approval back on without the PIN
- **Afterwards:** the bank notifies them that their approval method changed
- **Why:** anyone holding the phone can add a finger, so a change counts only once BE verifies the PIN, and the owner is notified

### PIN chosen instead
`transfer.pin_chosen`
- **When:** they choose to approve with their PIN instead of face or fingerprint
- **Money:** no money moved
- **Shown as:** the PIN sheet, over the review step
- **Tell them:** to enter their bank PIN to approve this transfer
- **They can:** enter their PIN
- **Why:** the PIN path is always available, so approving never depends on the device's sensor

### Incorrect PIN
`transfer.pin_incorrect`
- **When:** Approve Transfer returns `PIN_INCORRECT` with attempts remaining
- **Money:** no money moved
- **Shown as:** in the PIN sheet
- **Tell them:** the PIN is incorrect, and how many tries are left
- **They can:** enter it again, each try a new attempt
- **Why:** BE verifies and counts PIN attempts, so the number shown is always BE's

### PIN locked
`transfer.pin_locked`
- **When:** BE has locked the PIN after three wrong attempts (`PIN_LOCKED`)
- **Money:** no money moved
- **Shown as:** in the PIN sheet
- **Tell them:** the PIN is locked, and they reset it in the app's security settings
- **They can:** leave
- **Never:** offer another PIN attempt
- **Why:** three wrong PINs lock it at BE, which stops someone holding the phone from guessing

### Approval key unknown to the bank
`transfer.approval_key_unknown`
- **When:** Approve Transfer returns `KEY_NOT_REGISTERED`: BE doesn't know the key this device signed with, for example after the app was reinstalled or restored
- **Money:** no money moved
- **Shown as:** the PIN sheet on the review step, when BE already holds keys for them and they haven't typed their PIN yet; otherwise nothing extra — a PIN they already typed registers a new key as the transfer is approved
- **Tell them:** approval needs setting up again on this phone, with their PIN
- **They can:** set approval up again, then approve
- **Never:** register a new key without the PIN while BE holds their keys
- **Why:** a new key is a new way to move money, so once keys are registered only the PIN can add one

### Approval window passed
`transfer.approval_expired`
- **When:** Approve Transfer returns `APPROVAL_EXPIRED`, or a status query returns `EXPIRED`: the 60-second approval window has passed
- **Money:** no money moved
- **Shown as:** on the review step, or on the result page when FE polled the status of an approval whose response was lost
- **Tell them:** the approval timed out — no money moved
- **They can:** start again, which creates a new transfer
- **Never:** decide expiry from the device clock
- **Why:** BE settles expiry and execution in one step, so only its response can say no money moved while an approval might still land

### Approval could not be verified
`transfer.approval_not_verified`
- **When:** Approve Transfer returns `APPROVAL_INVALID`: BE can't verify the signature against the transfer it holds
- **Money:** no money moved
- **Shown as:** on the review step
- **Tell them:** the approval couldn't be verified — no money moved
- **They can:** start again
- **Why:** BE rebuilds the signed payload from its own records, so a signature that doesn't match them never moves money

### Balance or limit short at approval
`transfer.balance_or_limit_short_at_approval`
- **When:** BE re-checks the balance and today's limit on Approve Transfer, finds them short and ends the transfer
- **Money:** no money moved
- **Shown as:** on the review step, or on the result page when FE polled the status of an approval whose response was lost
- **Tell them:** it was not sent because their balance or limit changed — no money moved
- **They can:** go back to the amount on the review step, or finish on the result page
- **Why:** money moves only after BE's own check at that moment, since another transfer can change the balance or limit after review

### Stopped by the bank's fraud check
`transfer.fraud_blocked`
- **When:** the bank's fraud check blocks the transfer on Approve Transfer
- **Money:** no money moved
- **Shown as:** the result page
- **Tell them:** the bank stopped this transfer to protect them and will contact them — no money moved
- **They can:** finish
- **Never:** offer to send it again
- **Afterwards:** the bank contacts them about it; if the result page never showed, Home announces it in the same session
- **Why:** a blocked transfer may be a scam in progress, so the user is sent to the bank, never back to sending

### Held for a security check
`transfer.held_for_review`
- **When:** BE accepts the approval but holds the transfer for a security check before it completes
- **Money:** not confirmed yet
- **Shown as:** the result page
- **Tell them:** it is held for a security check and will complete or be refunded, with a reference to quote to support — not confirmed yet
- **They can:** finish
- **Never:** offer to send it again
- **Afterwards:** once it settles, History shows the outcome and Home announces it: within about 15 seconds while Home is open and in front, on returning to Home once review's own status query has found it settled, and otherwise at the next sign-in or launch
- **Why:** the money may already be on its way, so a second transfer could pay twice

### Receiving account inactive
`transfer.recipient_account_inactive`
- **When:** the recipient's bank declines because the receiving account is inactive
- **Money:** no money moved
- **Shown as:** the result page
- **Tell them:** the transfer was declined — no money moved
- **They can:** finish
- **Afterwards:** if the result page never showed, Home announces it in the same session
- **Why:** the decline came before any money left, so the user hears plainly that nothing was taken

### Rooted, jailbroken or tampered phone
`transfer.rooted_phone`
- **When:** the device clearly reports it is rooted or jailbroken, or that something is hooking into running apps; an inconclusive check lets approval proceed
- **Money:** no money moved
- **Shown as:** on the review step, in place of the biometric prompt
- **Tell them:** this phone's security can't be confirmed, so transfers are off on it
- **They can:** leave
- **Never:** offer a way to approve anyway
- **Why:** an approval key is only as safe as the device holding it, so a device that reports tampering never approves

### Something unexpected while approving
`transfer.approval_unexpected`
- **When:** anything the scenarios above don't name goes wrong before Approve Transfer leaves the device, or BE rejects it as malformed (`INVALID_REQUEST`); once the request has left, any other unexpected failure counts as a lost response, under Recovery
- **Money:** no money moved
- **Shown as:** on the review step
- **Tell them:** something unexpected stopped the approval — no money moved
- **They can:** try again, or leave
- **Why:** until Approve Transfer leaves the device, BE can't move money, so a failure here is safe to retry; after it leaves, the same failure could hide a completed transfer

## Outcome

### Transfer completed
`transfer.completed`
- **When:** BE completes the transfer
- **Money:** money moved
- **Shown as:** the result page, as a receipt
- **Tell them:** it was sent, with a receipt of the amount, the registered name, the masked ID, the bank, the note, a reference, and the date and time it completed in Malaysia time — money moved
- **They can:** finish
- **Afterwards:** the balance, today's limit and history refetch, and the bank sends its own notification of the transfer; if the result page never showed, Home announces it in the same session
- **Why:** the receipt carries what a user needs to prove the payment, in Malaysia time so it matches their statement

### Transfer processing
`transfer.processing`
- **When:** BE accepts the transfer but hasn't finished it (`PROCESSING`)
- **Money:** not confirmed yet
- **Shown as:** the result page
- **Tell them:** it is usually instant but can take up to one business day, and the result will show in History, with a reference to quote to support — not confirmed yet
- **They can:** finish
- **Never:** offer to send it again
- **Afterwards:** once it settles, the result page and History update, or Home announces it: within about 15 seconds while Home is open and in front, on returning to Home once review's own status query has found it settled, and otherwise at the next sign-in or launch
- **Why:** a transfer in progress may still complete, so the user learns where the result will appear instead of being invited to send again

### Refunded after processing
`transfer.refunded_after_processing`
- **When:** a processing transfer ends unsuccessful, and the bank refunds it automatically
- **Money:** money returned
- **Shown as:** in History, and on the result page if it is still open; otherwise as a notice on Home: within about 15 seconds while Home is open and in front, otherwise at the next launch
- **Tell them:** it didn't go through, and the money is being or has been returned automatically
- **They can:** see it in History; nothing else is needed
- **Why:** money that left and came back is a different result from money that never left, and the user sees which

### Something unexpected after sending
`transfer.outcome_unexpected`
- **When:** BE has responded to Approve Transfer, but something the scenarios above don't name stops the outcome rendering
- **Money:** not confirmed yet
- **Shown as:** the result page
- **Tell them:** the result can't be shown right now, and to check their transfer history before sending again, with a reference to quote to support — not confirmed yet
- **They can:** open Transfer history, or, while the phone reports a connection, try loading the result again
- **Never:** offer to send it again
- **Why:** once BE has responded, money may have moved, so an unexplained failure here sends the user to History, never back to sending

## Recovery

### No answer to the approval
`transfer.approval_unanswered`
- **When:** Approve Transfer gets no usable response — a timeout, a network drop, an unreadable response, or a 5xx with no error code — even after two retries of the same request
- **Money:** not confirmed yet
- **Shown as:** the result page, polling the transfer status
- **Tell them:** the transfer is being checked and they shouldn't send it again, with a reference to quote to support — not confirmed yet
- **They can:** wait for the outcome, which the result page then shows
- **Never:** offer to send it again
- **Why:** an Approve request that left the device may have moved money, so only BE's response ends the wait, and sending again could pay twice

### Bank still unreachable
`transfer.status_unreachable`
- **When:** polling the transfer status keeps failing to reach BE
- **Money:** not confirmed yet
- **Shown as:** the result page
- **Tell them:** it will keep being checked, and the result will show here and in History, with a reference to quote to support — not confirmed yet
- **They can:** leave
- **Never:** offer to send it again
- **Afterwards:** Home polls the transfer status about every 15 seconds while Home is open and in front, and the next launch reopens the result page
- **Why:** leaving is safe because polling continues and the outcome surfaces by itself, so the user never has to guess

### App closed during approval
`transfer.app_closed_during_approval`
- **When:** the app was killed after Approve Transfer was sent and before a readable response arrived
- **Money:** not confirmed yet
- **Shown as:** at the next launch, then the result page
- **Tell them:** their last transfer is being checked, then its outcome, with a reference to quote to support — not confirmed yet
- **They can:** wait for the outcome
- **Never:** offer to send it again
- **Why:** FE records every approval in secure storage before sending it, so a killed app still learns how its transfer ended

### Last transfer not found
`transfer.last_transfer_not_found`
- **When:** a status query returns `TRANSFER_NOT_FOUND`; FE then stops polling that transfer
- **Money:** not confirmed yet
- **Shown as:** the result page
- **Tell them:** their last transfer can't be found, and to check their transfer history before sending again, with a reference to quote to support — not confirmed yet
- **They can:** open Transfer history
- **Never:** offer to send it again
- **Why:** not found is not the same as not sent, so the user checks History before sending again instead of being told nothing happened

### Session ended
`transfer.session_ended`
- **When:** BE returns 401 (session ended) during a transfer
- **Money:** not confirmed yet
- **Shown as:** a full screen of its own, handed to the host app
- **Tell them:** their session has ended and they need to sign in again, with a reference to quote to support while a transfer is being checked
- **They can:** sign in again
- **Afterwards:** any transfer still unconfirmed is queried again once they're back, and its outcome shown
- **Why:** sign-in is the host app's job, so the transfer keeps its record and polling resumes once the user returns

### Unknown answer to the approval
`transfer.approval_unknown_answer`
- **When:** Approve Transfer returns an error code FE doesn't know
- **Money:** not confirmed yet
- **Shown as:** the result page, polling the transfer status
- **Tell them:** the transfer is being checked and they shouldn't send it again, with a reference to quote to support — not confirmed yet
- **They can:** wait for the bank's answer
- **Never:** offer to send it again
- **Why:** an error code FE can't interpret might hide a completed transfer, so it is treated exactly like no response

### Something unexpected while checking
`transfer.recovery_unexpected`
- **When:** anything the scenarios above don't name goes wrong while polling a transfer's status
- **Money:** not confirmed yet
- **Shown as:** the result page
- **Tell them:** the outcome isn't confirmed, and to check their transfer history before sending again, with a reference to quote to support — not confirmed yet
- **They can:** open Transfer history, or leave
- **Never:** offer to send it again
- **Afterwards:** Home polls the transfer status about every 15 seconds while Home is open and in front, and the next launch reopens the result page
- **Why:** while the outcome is unknown, money may have moved, so the user is sent to History, never back to sending
