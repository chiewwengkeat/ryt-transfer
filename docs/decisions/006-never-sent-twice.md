# 006. Never sent twice

## Context

The answer to a write can be lost after the bank has acted on it: a timeout, a dropped network or a server error leaves the app not knowing whether the money moved. A blind resend, or a button offering to try again, can pay twice. The app's own code is not the only thing that repeats a request: the phone's network stack or a proxy on a flaky line may send it again on its own. And the phone can kill the app between an approval leaving and its answer arriving.

## Decision

A transfer is created first and approved second, only the approval can move money, and every write survives a lost answer without running twice:

- **Create, then approve.** The app looks up the recipient, then creates the transfer. The bank checks the balance, the limits, any cooling-off period and the account lock before it returns a 60-second challenge, so every refusal the person can act on arrives before they approve. The approval is the one call that moves money.
- **An idempotency key on every write.** Creating a transfer, approving it and registering a key each carry an `Idempotency-Key`, a random UUID from expo-crypto's `randomUUID`, minted the moment the person acts and reused by every repeat of that act. The bank keeps the first answer to each key for 24 hours and returns it to any repeat, so nothing runs twice, and a resent wrong PIN never costs a second attempt (`src/mocks/bank/idempotency.ts`). A key reused with a different body is refused.
- **A lost approval answer is resent, then checked.** The identical request goes again after 2 and 4 seconds, while the challenge is still open; then the app reads the transfer's status at 2, 4, 8 and 16 seconds and every 15 seconds after, until the bank answers. Expiry and execution are one decision at the bank, and the app never decides from its own clock. Nothing else retries a write: the query client sends each write once, and never holds one while the phone is offline to replay it on reconnecting, which could move money minutes after the person acted with no fresh approval (`src/shell/query-client.ts`).
- **A killed app reopens on the result.** Before each approval the app writes, and waits for, a record holding only the transfer's ids. Every launch checks each record and shows its outcome, so an app closed mid-approval comes back to what happened, not to a guess.
- **No resend offered.** Where the outcome is not yet known, nothing the person can press offers to send the money again; the matrix's **Never** lines say so scenario by scenario.

## Rejected

- **One call that checks and moves money.** A refusal for the balance, a limit or the account lock would arrive only after the person had approved.
- **Separate check, approve and execute calls.** One more call whose answer can be lost, and an approval and an execution that can disagree, where here expiry and execution are one decision.
- **Keys with no resend.** An approval lost on its way to the bank would sit unanswered until the 60-second window closed, and the person would have to start again; resending the identical request within the window completes it at once.
- **A key on the create call only.** A repeat of the approval, by the app, the network stack or a proxy, could run twice, and a resent wrong PIN would count as two tries.
- **Leaving the person to check their history.** The app knows which transfer it sent and can ask the bank; someone left to work it out alone may pay twice.
- **Saving the whole draft, to resume it after a kill.** The recipient's ID and registered name would sit on the phone, personal data the ids-only record never holds, when what matters after a kill is whether the money moved.
- **Saving nothing.** Someone who cannot tell whether the money moved may send it again.
