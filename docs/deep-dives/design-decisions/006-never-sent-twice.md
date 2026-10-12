# 006. Never sent twice

## Context

1. A response can be lost after BE has acted on the request (timeout, network drop, 5xx), so FE can't tell whether money moved
2. A blind retry, or a retry button, can pay twice
3. Retries also come from outside app code: the OS network stack, or a proxy on a flaky network
4. The OS can kill the app between the Approve request and its response

## Decision

Create, then approve; only Approve moves money, and every mutation survives a lost response:

1. **Create, then approve**
   1. FE looks up the recipient, then calls Create Transfer
   2. Create: BE checks balance, limits, any cooling-off period and the account lock, then returns a 60-second challenge, so those errors reach the user before approval
   3. Approve: the only API call that moves money; BE re-checks balance and limits, ends the transfer with no money moved if they fall short, and rejects a wrong PIN
2. **`Idempotency-Key` on every mutation** (Create Transfer, Approve Transfer, key registration)
   1. A random UUID (expo-crypto's `randomUUID`), generated on the user's press and re-sent by every retry
   2. BE replays its first response to a key for 24 h, so nothing executes twice and a retried wrong PIN costs no extra attempt (`src/mocks/handlers/answer-from-bank/answer-from-bank.ts`)
   3. Same key with a different body: BE rejects it
3. **Lost Approve response: retry, then poll**
   1. The same request is re-sent after 2 s, then 4 s; then FE queries the transfer status at 2, 4, 8 and 16 s, then every 15 s, until BE responds
   2. Expiry and execution are one decision at BE; FE never decides from its own clock
   3. A lost Create response is retried with the same key too
   4. The query client retries no other mutation, and never queues one offline to replay on reconnect, which could move money minutes later with no fresh approval (`src/root/query-client/query-client.ts`)
4. **Offline is shown, and sending pauses**
   1. FE counts itself offline when the OS reports no connection, or a request fails for lack of network
   2. Sending pauses, with the reason shown
   3. The balance and limits queries refetch every 10 s, and on reconnect; a success clears the offline state
5. **A killed app reopens on the transfer status**
   1. Before each Approve request, FE writes, and awaits, a secure-storage record holding the transfer's ids and stage, no personal data
   2. Every launch queries the status of each recorded transfer and shows it, so an app killed mid-approval reopens on what happened
6. **No retry offered**: until the transfer status is known, no control offers to send the money again; the matrix's **Never** lines say so per scenario

## Rejected

1. **One API call that validates and moves money**. Reason: balance, limit and account-lock errors would arrive only after approval
2. **Separate validate, approve and execute API calls**. Reason: one more response that can be lost, and an approval and an execution that can disagree; here expiry and execution are one decision
3. **Keys without retries**. Reason: a lost Approve request waits out the 60-second window, and the user starts over; re-sending the same request within the window completes it at once
4. **A key on Create only**. Reason: BE still executes a transfer at most once, but a repeated Approve request (from FE, the network stack or a proxy) wouldn't get BE's first response back, and a retried wrong PIN would count as two attempts
5. **A time-ordered UUID with a polyfill, or nanoid**. Reason: a time-ordered key sorts by creation time, which helps reading logs, at the cost of a polyfill; nanoid makes shorter random ids. A key only has to be random and unique, so expo-crypto's `randomUUID`, from Expo's own SDK, is enough
6. **The OS connection status alone, for offline**. Reason: it can report a connection that never reaches BE, and knows nothing of the mock BE's simulated network loss
7. **No offline state**. Reason: a mobile banking app has to handle a lost connection
8. **Leaving the user to check their history**. Reason: FE knows which transfer it sent and can query BE; a user left to work it out may pay twice
9. **Persisting the whole draft, to resume it after a kill**. Reason: the recipient's ID and registered name would sit on the device, personal data the secure-storage record never holds, when what matters after a kill is whether money moved
10. **Persisting nothing**. Reason: a user who can't tell whether money moved may send it again
