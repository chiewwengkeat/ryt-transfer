# 010. Query cache only

## Context

The bank's data shows on several screens: the balance, the history pages, a transfer's details and its result. A transfer's status changes after it is sent, and every screen showing it has to agree. A normalized client store, each object held once by id, is the classic answer to that, and it was weighed for the history list in particular.

## Decision

TanStack Query's cache is the only client copy of the bank's data. No normalized store sits beside it:

- **By id and key.** A transfer is referred to by its id and its query key; a screen that needs it reads the cache through that endpoint's own query.
- **No pushed copies.** The details screen shows the tapped row from the loaded history pages as placeholder data until its own fetch returns. Nothing pushes a copy of a row into another cache entry, where it could drift until a fetch lands.
- **Key and fetcher together.** Each query's key travels with its fetcher through TanStack's `queryOptions`, so invalidating or patching a query cannot name a key that has drifted from it.
- **One place for the query client's retries.** It retries a read at most twice, and only after a dropped connection, a timeout or a server error. It never retries a write, and never holds one offline to replay on reconnecting (`src/shell/query-client.ts`); the flow's own resends of a lost answer carry that act's idempotency key ([006](006-never-sent-twice.md)).

Unchanged rows skip their re-render: TanStack keeps an unchanged transfer as the same object, FlashList's cells re-render only when their row's object, the render function or the list's `extraData` changes, and the compiler keeps the render function stable ([009](009-history-at-scale.md) sets out how the re-renders are counted). One case costs more. TanStack compares list items by position, so a new transfer at the top makes every shifted row a new object, and the visible rows are expected to re-render once, a pass that is cheap under the compiler. An id-keyed `structuralSharing` function would remove it; the decision is to report the cost and hold that fix in reserve.

The cost: keeping screens fresh rests on patching or resetting the right query at each change, a discipline the transfer flow carries rather than a guarantee.

## Rejected

- **A normalized transfer store.** A write-through layer, an eviction rule and a second owner of freshness, an estimated 150–250 lines plus tests.
- **An app-wide entity layer, such as `@normy/react-query`.** Every object needs a stable id and every write a normalized response, and by default it normalizes every query by id, which would rewrite the recipient in each history row, kept as confirmed when the money was sent, with today's details. The library is also before 1.0.
- **An ids-plus-store list whose writes keep unchanged transfers' objects.** A transfer arriving at the top would re-render only its own row, at the cost of the write-through layer, the eviction rule and the second owner of freshness above; an id-keyed `structuralSharing` function removes the same cost inside the cache if it ever shows.
- **Building the id-keyed fix now.** No visible row would re-render when a transfer lands at the top, but the re-render it removes is one pass over the visible rows, cheap under the compiler.
- **SWR.** A mapped result is not structurally shared, and its model for writes is weaker.
- **RTK Query.** A Redux store, for an app with little client state.
- **No library.** Caching, deduplication, retries and paging written by hand.
- **Pushing a copy into the details cache when a row is pressed.** One copy per tap, which can drift until the details fetch lands.
- **Pushing every loaded row into its own cache entry.** A copy of every row loaded, and the most write paths.
- **A query-key factory library.** No release since 25 February 2024, and `queryOptions` keeps each key with its fetcher without one.
