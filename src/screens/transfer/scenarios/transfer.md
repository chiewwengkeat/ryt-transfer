# Transfer — what can happen

Every situation someone can meet while sending money, from opening a transfer to its final outcome. Every client that sends money — this app, a website, a lite app, a rebuild — follows this file, and it is the only description of these scenarios. Tests, the demo's mock bank, the app's words and its analytics all point back here through each scenario's id.

**How to read it.** Scenarios are grouped by the step where they happen, in the order the index lists. Money never moves before the transfer is approved: the bank first creates the transfer, and only the approval that follows can move money. The recipient step checks only that an id is well formed; the bank looks up the name on review. Each scenario says when it happens, what happened to the money, where it shows, what the person must be told and what they can do. Where it matters, it also says what they must never be offered, what follows afterwards, and why. The exact words live in the app's translation files under the scenario's id: this file fixes the story, not the sentences.

**How to change it.** Edit any wording. Keep the bold labels as they are. Never change a grey id: a new scenario gets a new id, and a removed scenario's id is never reused.

**Money.** Every Money line is exactly one of these four states. Where **Tell them** ends with a state's phrase, the app's message for that scenario carries that phrase in every language. Phrases machine-translated once.

| Money | Malay | Chinese |
| --- | --- | --- |
| no money moved | tiada wang dipindahkan | 款项未转出 |
| money moved | wang telah dipindahkan | 款项已转出 |
| not confirmed yet | belum disahkan | 尚未确认 |
| money returned | wang telah dipulangkan | 款项已退回 |

**Retry words.** Where **Never** reads "offer to send it again", nothing the person can press carries one of these words: no button or action label, in any language. Messages keep their warnings, such as "shouldn't send it again" or "check History before sending again".

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
- **When:** their balance and today's limit load, before a transfer starts
- **Money:** no money moved
- **Shown as:** on the home screen, and again on the amount step
- **Tell them:** their balance, and how much more they can send today
- **They can:** start a transfer
- **Why:** seeing what they can afford before typing anything means a limit never surprises them at the end

### New customer's lower daily limit
`transfer.new_customer_daily_limit`
- **When:** the account is new, so the bank sets today's limit at RM1,000 rather than the usual RM5,000
- **Money:** no money moved
- **Shown as:** on the home screen, and again on the amount step
- **Tell them:** their balance, and how much more they can send today, as for any limit
- **They can:** send within the lower limit
- **Why:** banks start new customers on a cautious daily limit, and the app shows whatever limit the bank sets rather than assuming one

### Balance or limit can't load
`transfer.balance_unavailable`
- **When:** their balance or today's limit can't be loaded
- **Money:** no money moved
- **Shown as:** on the home screen, where the balance would be
- **Tell them:** their balance couldn't be loaded
- **They can:** retry
- **Never:** let them start a transfer before both have loaded
- **Why:** every check on the amount needs the balance and the limit, so sending waits for them rather than guessing

### Transfers under maintenance
`transfer.under_maintenance`
- **When:** the bank says transfers are paused for maintenance (`SERVICE_UNAVAILABLE`)
- **Money:** no money moved
- **Shown as:** on the home screen, or on the review step if it begins mid-transfer
- **Tell them:** transfers are unavailable right now, and until when if the bank says
- **They can:** try again later
- **Why:** the bank knows when its maintenance ends, so the app passes on the bank's own time rather than inventing one

### Offline
`transfer.offline`
- **When:** the phone reports no connection, or a request failed for lack of one
- **Money:** no money moved
- **Shown as:** on the home screen and each transfer step, with sending paused
- **Tell them:** they're offline and sending is paused
- **They can:** wait; it clears once a request reaches the bank
- **Why:** a phone can report a connection that doesn't reach the bank, so only a request that gets through ends the offline state

### Earlier transfer still being checked
`transfer.earlier_transfer_unconfirmed`
- **When:** a transfer they approved earlier still has no final answer from the bank
- **Money:** not confirmed yet
- **Shown as:** on the home screen and the review step
- **Tell them:** their last transfer is still being checked, so they shouldn't send it again, with a reference to quote to support — not confirmed yet
- **They can:** carry on with a new transfer at their own risk
- **Never:** offer to send it again
- **Why:** the earlier transfer may still complete, so a second one could pay twice, and the person decides with that in front of them

### Screenshots blocked
`transfer.screen_capture_blocked`
- **When:** they take a screenshot or record the screen anywhere but a receipt, in the production app
- **Money:** no money moved
- **Shown as:** the picture or recording comes out blank; on Android the phone says the app doesn't allow it
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
- **Why:** no transfer exists yet, so nothing can have moved and trying again is always safe

## Recipient

### Badly formed ID, amount or note
`transfer.badly_formed_input`
- **When:** an ID, an amount or a note doesn't match its format — a mobile number with too few digits, an amount with three decimals, a note with symbols
- **Money:** no money moved
- **Shown as:** under the field
- **Tell them:** what's wrong with that field
- **They can:** fix it
- **Why:** a malformed value caught at the field saves a trip to the bank, which checks every one again anyway

### Contacts access refused
`transfer.contacts_access_refused`
- **When:** they choose a recipient from their contacts but don't allow access
- **Money:** no money moved
- **Shown as:** on the recipient step
- **Tell them:** to allow contacts access in Settings, or type the number
- **They can:** type the number, or open Settings
- **Why:** contacts are a shortcut, so refusing access never blocks a transfer

### Picked contact has no Malaysian mobile number
`transfer.contact_without_mobile`
- **When:** the contact they pick has no Malaysian mobile number
- **Money:** no money moved
- **Shown as:** on the recipient step
- **Tell them:** that contact has no Malaysian mobile number
- **They can:** pick another contact, or type a number
- **Why:** only a Malaysian mobile number can be a DuitNow mobile ID, so the app says so instead of filling the field with one that will fail

### Recent recipient chosen
`transfer.recent_recipient_chosen`
- **When:** they pick someone they've sent to before from their recent recipients
- **Money:** no money moved
- **Shown as:** on the recipient step, as the recipient picked, in place of the ID field
- **Tell them:** who they picked; review then shows the name the bank holds today
- **They can:** continue, or change the recipient
- **Why:** a recent recipient saves typing, but the name check still runs afresh, so a changed or reassigned number is never trusted from memory

### Something unexpected while choosing the recipient
`transfer.recipient_unexpected`
- **When:** anything the scenarios above don't name goes wrong on the recipient step
- **Money:** no money moved
- **Shown as:** on the recipient step
- **Tell them:** something unexpected went wrong
- **They can:** try again, or go back
- **Why:** no transfer exists yet, so nothing can have moved and trying again is always safe

## Amount

### Amount over the balance or a limit
`transfer.amount_too_high`
- **When:** the amount is more than their balance, today's remaining limit, or RM50,000 for one transfer
- **Money:** no money moved
- **Shown as:** under the amount, as they type
- **Tell them:** which of the three it is over, naming the figure
- **They can:** lower the amount
- **Why:** the person learns the limit they hit while typing, though the bank checks all three again before any money moves

### Something unexpected while entering the amount
`transfer.amount_unexpected`
- **When:** anything the scenarios above don't name goes wrong on the amount step
- **Money:** no money moved
- **Shown as:** on the amount step
- **Tell them:** something unexpected went wrong
- **They can:** try again, or go back
- **Why:** no transfer exists yet, so nothing can have moved and trying again is always safe

## Review

### Recipient found
`transfer.recipient_found`
- **When:** the bank finds the ID and returns the name and bank registered to it
- **Money:** no money moved
- **Shown as:** on the review step, beside the amount and note
- **Tell them:** the registered name and bank
- **They can:** confirm, or go back and change anything
- **Why:** the person approves only after seeing who the money goes to as the bank records them, never a name typed or remembered

### First transfer to this recipient
`transfer.first_transfer_to_recipient`
- **When:** the bank says they have never sent to this recipient before
- **Money:** no money moved
- **Shown as:** on the review step, beside the name
- **Tell them:** it is their first transfer to this recipient, so they should check the name is who they expect
- **They can:** confirm, or go back
- **Why:** scams target first payments to new accounts, so the first one gets a second look without an extra step

### Recipient not found
`transfer.recipient_not_found`
- **When:** no DuitNow account is registered to the ID (`RECIPIENT_NOT_FOUND`)
- **Money:** no money moved
- **Shown as:** on the review step
- **Tell them:** no DuitNow account was found for this ID
- **They can:** go back to the recipient step
- **Why:** an ID with no account behind it can never be paid, so the person fixes it before anything else

### Name check unavailable
`transfer.name_check_unavailable`
- **When:** the bank can't confirm recipient names right now (`NAME_ENQUIRY_UNAVAILABLE`)
- **Money:** no money moved
- **Shown as:** on the review step
- **Tell them:** recipient names can't be confirmed right now
- **They can:** retry
- **Never:** let them confirm without a registered name
- **Why:** the name is what the person approves against, so a transfer never goes ahead on an unconfirmed one

### Too many name checks
`transfer.too_many_name_checks`
- **When:** the bank refuses after too many name checks in a short time (`TOO_MANY_LOOKUPS`)
- **Money:** no money moved
- **Shown as:** on the review step
- **Tell them:** to try again in a minute
- **They can:** wait, then retry
- **Why:** limiting name checks stops anyone harvesting names by guessing IDs, so the wait is deliberate

### Balance or limit short at confirmation
`transfer.balance_or_limit_short_at_confirmation`
- **When:** the bank checks the balance and the limits as it creates the transfer and finds the amount over one of them (`INSUFFICIENT_FUNDS`, `DAILY_LIMIT_EXCEEDED`, `ABOVE_PER_TRANSFER_MAX`)
- **Money:** no money moved
- **Shown as:** on the review step
- **Tell them:** the reason — not enough balance, or over a limit
- **They can:** go back to the amount
- **Why:** the bank checks again when it creates the transfer, because the balance or limit can change after the amount was typed

### Phone paired less than 12 hours ago
`transfer.cooling_off_new_phone`
- **When:** this phone was paired with the account less than 12 hours ago (`COOLING_OFF`), also when the approval arrives
- **Money:** no money moved
- **Shown as:** on the review step
- **Tell them:** they can send money from a given time — a security wait after pairing this phone
- **They can:** wait
- **Why:** a newly paired phone is the likeliest sign of a stolen login, so it waits before money can leave

### Account opened less than an hour ago
`transfer.cooling_off_new_account`
- **When:** the account was opened less than an hour ago (`COOLING_OFF`), also when the approval arrives
- **Money:** no money moved
- **Shown as:** on the review step
- **Tell them:** they can send money from a given time — a security wait after opening their account
- **They can:** wait
- **Why:** a brand-new account is a common tool in scams, so its first hour allows no transfers out

### Account locked
`transfer.account_locked`
- **When:** the account is locked (`ACCOUNT_LOCKED`), also when the approval arrives
- **Money:** no money moved
- **Shown as:** on the review step
- **Tell them:** their account is locked, and to contact Ryt to unlock it
- **They can:** leave
- **Why:** a lock is the customer's own emergency stop, so the app offers no way around it

### Name check expired
`transfer.name_check_expired`
- **When:** more than 10 minutes have passed since the name check, so the bank no longer accepts it (`RECIPIENT_REF_EXPIRED`)
- **Money:** no money moved
- **Shown as:** on the review step
- **Tell them:** to confirm the recipient again
- **They can:** confirm again, which runs the name check afresh
- **Why:** a registered name can change, so one confirmed long ago is checked again before money goes to it

### No answer when confirming
`transfer.confirmation_unanswered`
- **When:** the bank's answer to creating the transfer never arrives, even after the request is repeated
- **Money:** no money moved
- **Shown as:** on the review step
- **Tell them:** they couldn't reach Ryt — no money moved
- **They can:** try again; the bank recognises a repeat, so it never creates two transfers
- **Why:** creating a transfer moves no money, so an unanswered one is safe to repeat, and the bank keeps a repeat to one transfer

### Details changed after no answer
`transfer.details_changed_after_no_answer`
- **When:** after a confirmation went unanswered, they change the recipient, amount or note before confirming again
- **Money:** no money moved
- **Shown as:** on the review step, with the new details
- **Tell them:** the new details, to confirm afresh
- **They can:** confirm them as a new transfer
- **Why:** changed details are a different transfer, so the bank never mistakes them for a repeat of the old ones

### Double tap on Transfer
`transfer.double_tap_ignored`
- **When:** they tap Transfer again while the first tap is still being handled
- **Money:** no money moved
- **Shown as:** on the review step, where the second tap does nothing
- **Tell them:** nothing more; the first tap carries on
- **They can:** wait for it
- **Why:** one tap is one transfer, so a second tap in flight can never start another

### Something unexpected while reviewing
`transfer.review_unexpected`
- **When:** anything the scenarios above don't name goes wrong on the review step before an approval is sent, for example the bank answering with a code the app doesn't know
- **Money:** no money moved
- **Shown as:** on the review step
- **Tell them:** something unexpected stopped the transfer — no money moved
- **They can:** try again, or go back
- **Why:** no approval has been sent, so nothing can have moved and trying again is safe

## Approval

### Face or fingerprint recognised
`transfer.biometrics_recognised`
- **When:** their face or fingerprint is recognised; the phone signs exactly what review shows and sends the approval to the bank
- **Money:** not confirmed yet
- **Shown as:** the phone's prompt, then the review step showing the transfer as sending
- **Tell them:** it is being sent, and the bank's answer comes next
- **They can:** wait for the bank's answer, which leads to one of the Outcome scenarios
- **Never:** offer to send it again while the answer is awaited
- **Why:** a signature over everything review showed lets the bank prove these details, and no others, were approved

### Approval cancelled
`transfer.approval_cancelled`
- **When:** they cancel the face or fingerprint prompt, or close the PIN sheet without approving; also when the phone closes its own prompt, as newer Android does when it locks the phone after too many failed tries, which reaches the app as their cancel
- **Money:** no money moved
- **Shown as:** on the review step
- **Tell them:** the transfer was not sent — no money moved
- **They can:** transfer again, which creates a new transfer, or edit the details
- **Why:** closing the prompt is a clear no, and only an approval moves money, so the unapproved transfer simply lapses at the bank

### Face or fingerprint not recognised
`transfer.biometrics_not_recognised`
- **When:** the phone does not recognise their face or fingerprint, and the prompt closes
- **Money:** no money moved
- **Shown as:** on the review step
- **Tell them:** they were not recognised, and can try again or use their PIN
- **They can:** try again, or approve with their PIN
- **Never:** approve with the phone's own passcode
- **Why:** a phone's passcode is shared and is all it asks before anyone adds a fingerprint, so only the bank's own checks stand in for biometrics

### Too many face or fingerprint attempts
`transfer.biometrics_locked_out`
- **When:** the phone locks face and fingerprint recognition after too many failed tries; newer Android handles the lockout inside its own prompt, so this also shows when the phone's key cannot sign after that prompt's own recovery with the phone's PIN
- **Money:** no money moved
- **Shown as:** the PIN sheet, over the review step
- **Tell them:** there were too many attempts, so they approve with their PIN
- **They can:** approve with their PIN
- **Never:** approve with the phone's own passcode
- **Why:** the phone's lockout stops guessing at the sensor, and the PIN, checked and limited at the bank, still lets the owner finish

### Face or fingerprint unavailable
`transfer.biometrics_unavailable`
- **When:** face and fingerprint approval is off in the app's settings, nothing is enrolled on the phone, or the phone has no usable sensor
- **Money:** no money moved
- **Shown as:** the PIN sheet, over the review step, saying why
- **Tell them:** why face or fingerprint approval isn't available, and that they approve with their PIN
- **They can:** approve with their PIN
- **Never:** approve with the phone's own passcode
- **Why:** every phone must be able to approve, and the PIN path still signs with the phone's own key and is checked at the bank

### Fingerprints or face changed
`transfer.biometrics_changed`
- **When:** a fingerprint or face was added or removed on the phone since approval was set up, so face and fingerprint approval stops working
- **Money:** no money moved
- **Shown as:** the PIN sheet, over the review step
- **Tell them:** their fingerprints or face changed; their PIN approves this transfer and turns face or fingerprint approval back on
- **They can:** approve with their PIN; face or fingerprint approval is then set up again with the same PIN
- **Never:** turn face or fingerprint approval back on without the PIN
- **Afterwards:** the bank tells them their approval method changed
- **Why:** anyone holding the phone can add a finger, so a change counts only once the bank's PIN confirms it, and the owner hears of it

### PIN chosen instead
`transfer.pin_chosen`
- **When:** they choose to approve with their PIN instead of face or fingerprint
- **Money:** no money moved
- **Shown as:** the PIN sheet, over the review step
- **Tell them:** to enter their bank PIN to approve this transfer
- **They can:** enter their PIN
- **Why:** the PIN path is always open, so approving never depends on the phone's sensor

### Incorrect PIN
`transfer.pin_incorrect`
- **When:** the bank says the PIN is wrong and tries remain (`PIN_INCORRECT`)
- **Money:** no money moved
- **Shown as:** in the PIN sheet
- **Tell them:** the PIN is incorrect, and how many tries are left
- **They can:** enter it again, each try a new attempt
- **Why:** the bank checks and counts PIN tries, so the number shown is always the bank's

### PIN locked
`transfer.pin_locked`
- **When:** the bank has locked the PIN after three wrong tries (`PIN_LOCKED`)
- **Money:** no money moved
- **Shown as:** in the PIN sheet
- **Tell them:** the PIN is locked, and they reset it in the app's security settings
- **They can:** leave
- **Never:** offer another PIN try
- **Why:** three wrong PINs lock it at the bank, which is what stops someone holding the phone from guessing

### Approval key unknown to the bank
`transfer.approval_key_unknown`
- **When:** the bank does not know the key this phone signed with (`KEY_NOT_REGISTERED`), for example after the app was reinstalled or restored
- **Money:** no money moved
- **Shown as:** the PIN sheet on the review step, when the bank already holds keys for them and they have not typed their PIN yet; otherwise nothing extra — a PIN they already typed sets approval up again as the transfer is approved
- **Tell them:** approval needs setting up again on this phone, with their PIN
- **They can:** set approval up again, then approve
- **Never:** set up a new key without the PIN while the bank holds their keys
- **Why:** a new key is a new way to move money, so once keys are on file only the PIN can add one

### Approval window passed
`transfer.approval_expired`
- **When:** the bank says the 60-second approval window has passed (`APPROVAL_EXPIRED`)
- **Money:** no money moved
- **Shown as:** on the review step, or on the result page when the phone checked an approval whose answer never came
- **Tell them:** the approval timed out — no money moved
- **They can:** start again, which creates a new transfer
- **Never:** decide it timed out from the phone's own clock
- **Why:** the bank settles expiry and sending in one step, so only its answer can say nothing was sent while an approval might still land

### Approval could not be verified
`transfer.approval_not_verified`
- **When:** the bank cannot verify the approval against the transfer it holds (`APPROVAL_INVALID`)
- **Money:** no money moved
- **Shown as:** on the review step
- **Tell them:** the approval couldn't be verified — no money moved
- **They can:** start again
- **Why:** the bank rebuilds what was signed from its own records, so an approval that doesn't match them never moves money

### Balance or limit short at approval
`transfer.balance_or_limit_short_at_approval`
- **When:** the bank re-checks the balance and today's limit as the approval arrives, finds them short and ends the transfer
- **Money:** no money moved
- **Shown as:** on the review step, or on the result page when the phone checked an approval whose answer never came
- **Tell them:** it was not sent because their balance or limit changed — no money moved
- **They can:** go back to the amount on the review step, or finish on the result page
- **Why:** money moves only after the bank's own check at that moment, since another transfer can change the balance or limit after review

### Stopped by the bank's fraud check
`transfer.fraud_blocked`
- **When:** the bank's fraud check blocks the transfer as the approval arrives
- **Money:** no money moved
- **Shown as:** the result page
- **Tell them:** the bank stopped this transfer to protect them and will contact them — no money moved
- **They can:** finish
- **Never:** offer to send it again
- **Afterwards:** the bank contacts them about it
- **Why:** a blocked transfer may be a scam in progress, so the person is sent to the bank, never back to sending

### Held for a security check
`transfer.held_for_review`
- **When:** the bank accepts the approval but holds the transfer for a security check before it completes
- **Money:** not confirmed yet
- **Shown as:** the result page
- **Tell them:** it is held for a security check and will complete or be refunded, with a reference to quote to support — not confirmed yet
- **They can:** finish
- **Never:** offer to send it again
- **Afterwards:** when it settles, History shows the outcome and the next launch announces it
- **Why:** the money may already be on its way, so a second send could pay twice

### Receiving account inactive
`transfer.recipient_account_inactive`
- **When:** the recipient's bank declines because the receiving account is inactive
- **Money:** no money moved
- **Shown as:** the result page
- **Tell them:** the transfer was declined — no money moved
- **They can:** finish
- **Why:** the decline came before any money left, so the person hears plainly that nothing was taken

### Rooted, jailbroken or tampered phone
`transfer.rooted_phone`
- **When:** the phone clearly reports it is rooted or jailbroken, or that something is hooking into running apps; an unclear check lets approval go ahead
- **Money:** no money moved
- **Shown as:** on the review step, in place of the prompt
- **Tell them:** this phone's security can't be confirmed, so transfers are off on it
- **They can:** leave
- **Never:** offer a way to approve anyway
- **Why:** an approval key is only as safe as the phone holding it, so a phone that reports tampering never approves

### Something unexpected while approving
`transfer.approval_unexpected`
- **When:** anything the scenarios above don't name goes wrong before the approval leaves the phone, or the bank refuses the approval as badly formed (`INVALID_REQUEST`); once it has left, anything else unexpected is a lost approval answer, in Recovery
- **Money:** no money moved
- **Shown as:** on the review step
- **Tell them:** something unexpected stopped the approval — no money moved
- **They can:** try again, or leave
- **Why:** until the approval leaves the phone the bank cannot move money, so a failure here is safe to retry; after it leaves, the same failure could hide a completed transfer

## Outcome

### Transfer completed
`transfer.completed`
- **When:** the bank completes the transfer
- **Money:** money moved
- **Shown as:** the result page, as a receipt
- **Tell them:** it was sent, with a receipt of the amount, the registered name, the masked ID, the bank, the note, a reference, and the date and time it completed in Malaysia time — money moved
- **They can:** finish
- **Afterwards:** their balance, today's limit and history update, and the bank sends its own notice of the transfer
- **Why:** the receipt carries what a person needs to prove the payment, in Malaysia time so it matches their statement

### Transfer processing
`transfer.processing`
- **When:** the bank accepts the transfer but hasn't finished it (`PROCESSING`)
- **Money:** not confirmed yet
- **Shown as:** the result page
- **Tell them:** it is usually instant but can take up to one business day, and the result will show in History, with a reference to quote to support — not confirmed yet
- **They can:** finish
- **Never:** offer to send it again
- **Afterwards:** when it settles, the result page and History update, or the next launch announces it
- **Why:** a transfer in progress may still complete, so the person learns where the answer will appear instead of being invited to send again

### Refunded after processing
`transfer.refunded_after_processing`
- **When:** a transfer that was processing ends unsuccessful, and the bank refunds it automatically
- **Money:** money returned
- **Shown as:** in History, and as a notice the next time the app opens
- **Tell them:** it didn't go through, and the money is being or has been returned automatically
- **They can:** see it in History; nothing else is needed
- **Why:** money that left and came back is a different answer from money that never left, and the person sees which

### Something unexpected after sending
`transfer.outcome_unexpected`
- **When:** the bank has answered the approval, but something the scenarios above don't name stops the outcome showing
- **Money:** not confirmed yet
- **Shown as:** the result page
- **Tell them:** the result can't be shown right now, and to check History before sending again, with a reference to quote to support — not confirmed yet
- **They can:** check History, or try loading the result again
- **Never:** offer to send it again
- **Why:** once the bank has answered, money may have moved, so an unexplained failure here sends the person to History, never back to sending

## Recovery

### No answer to the approval
`transfer.approval_unanswered`
- **When:** the approval was sent but no answer came back — a timeout, a dropped connection, or a server error without a status — even after sending the same approval twice more
- **Money:** not confirmed yet
- **Shown as:** the result page, checking
- **Tell them:** the transfer is being checked and they shouldn't send it again, with a reference to quote to support — not confirmed yet
- **They can:** wait; it ends when the bank answers, with the matching outcome
- **Never:** offer to send it again
- **Why:** an approval that left the phone may have moved money, so only the bank's answer ends the wait, and sending again could pay twice

### Bank still unreachable
`transfer.status_unreachable`
- **When:** checking the transfer keeps failing to reach the bank
- **Money:** not confirmed yet
- **Shown as:** the result page
- **Tell them:** it will keep being checked, and the result will show here and in History, with a reference to quote to support — not confirmed yet
- **They can:** leave; checking resumes the next time the app opens
- **Never:** offer to send it again
- **Why:** leaving is safe because the check carries on and the outcome surfaces by itself, so the person never has to guess

### App closed during approval
`transfer.app_closed_during_approval`
- **When:** the app was closed after the approval was sent and before its answer was shown
- **Money:** not confirmed yet
- **Shown as:** at the next launch, then the result page
- **Tell them:** their last transfer is being checked, then its outcome, with a reference to quote to support — not confirmed yet
- **They can:** wait for the outcome
- **Never:** offer to send it again
- **Why:** the phone records every approval before sending it, so a closed app still learns how its transfer ended

### Last transfer not found
`transfer.last_transfer_not_found`
- **When:** checking a transfer, the bank says it has no such transfer (`TRANSFER_NOT_FOUND`); the phone then stops checking it
- **Money:** not confirmed yet
- **Shown as:** the result page
- **Tell them:** their last transfer can't be found, and to check History before sending again, with a reference to quote to support — not confirmed yet
- **They can:** check History
- **Never:** offer to send it again
- **Why:** not found is not the same as not sent, so the person checks History before sending again rather than being told nothing happened

### Session ended
`transfer.session_ended`
- **When:** the bank says their session has ended (401) during a transfer
- **Money:** not confirmed yet
- **Shown as:** a full screen of its own, handed to the host app
- **Tell them:** their session has ended and they need to sign in again, with a reference to quote to support while a transfer is being checked
- **They can:** sign in again
- **Afterwards:** any transfer still being checked is checked once they are back, and its outcome shown
- **Why:** signing in is the host app's job, so the transfer keeps its record and finishes checking once the person returns

### Unknown answer to the approval
`transfer.approval_unknown_answer`
- **When:** the bank answers the approval with an error code the app doesn't know
- **Money:** not confirmed yet
- **Shown as:** the result page, checking
- **Tell them:** the transfer is being checked and they shouldn't send it again, with a reference to quote to support — not confirmed yet
- **They can:** wait for the bank's answer
- **Never:** offer to send it again
- **Why:** an answer the app can't read might hide a completed transfer, so it is treated exactly like no answer at all

### Something unexpected while checking
`transfer.recovery_unexpected`
- **When:** anything the scenarios above don't name goes wrong while checking a transfer's outcome
- **Money:** not confirmed yet
- **Shown as:** the result page
- **Tell them:** the outcome isn't confirmed, and to check History before sending again, with a reference to quote to support — not confirmed yet
- **They can:** check History, or leave; checking resumes the next time the app opens
- **Never:** offer to send it again
- **Why:** while the outcome is unknown, money may have moved, so the person is sent to History, never back to sending
