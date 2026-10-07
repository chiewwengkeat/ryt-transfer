# 010. Query cache only

## Context

The bank's data shows on several screens: the balance, the history pages, a transfer's details and its result. A transfer's status changes after it is sent, and every screen showing it has to agree. A normalized client store, each object held once by id, is the classic answer to that, and it was weighed for the history list in particular.

## Decision

TanStack Query's cache is the only client copy of the bank's data. No normalized store sits beside it:

- **By id and key.** A transfer is referred to by its id and its query key; a screen that needs it reads the cache through that endpoint's own query.
- **No copies.** The details screen shows the tapped row from the loaded history pages as placeholder data until its own fetch returns. Nothing is copied, so no second copy exists to drift.
- **Key and fetcher together.** Each query's key travels with its fetcher through TanStack's `queryOptions`, so invalidating or patching a query cannot name a key that has drifted from it.
- **One place for retries.** A read retries at most twice, and only after a dropped connection, a timeout or a server error. A write never retries, and never waits offline to be replayed on reconnecting (`src/shell/query-client.ts`, and [006](006-never-sent-twice.md)).

Rows built straight from the cache re-render only what changed ([009](009-history-at-scale.md) has the counts). One case costs more. TanStack compares list items by position, so a new transfer at the top makes every shifted row a new object, and the visible rows re-render once. That is cheap under the compiler, and an id-keyed `structuralSharing` function would remove it; the fix is held in reserve and the cost is reported.

The cost: keeping screens fresh rests on patching or resetting the right query at each change, a discipline the transfer flow carries rather than a guarantee.

## Rejected

- **A normalized transfer store.** A write-through layer, an eviction rule and a second owner of freshness, an estimated 150–250 lines plus tests. A history entry is also a snapshot, the recipient as confirmed when the money was sent, so normalizing the recipient would show today's name on last month's record.
- **An app-wide entity layer, such as `@normy/react-query`.** Every object needs a stable id and every write a normalized response, and by default it normalizes every query by id, which would rewrite the recipient snapshot inside history rows. The library is also before 1.0.
- **An ids-plus-store list.** The spiked version re-rendered 24 rows on an identical refetch, because its writes did not keep the old objects for unchanged transfers.
- **SWR.** A mapped result is not structurally shared, and its model for writes is weaker.
- **RTK Query.** A Redux store, for an app with little client state.
- **No library.** Caching, deduplication, retries and paging written by hand.
- **Pushing a copy into the details cache when a row is pressed.** One copy per tap, which can drift until the details fetch lands.
- **Pushing every loaded row into its own cache entry.** A copy of every row loaded, and the most write paths.
- **A query-key factory library.** No release since 25 February 2024, and `queryOptions` keeps each key with its fetcher without one.
