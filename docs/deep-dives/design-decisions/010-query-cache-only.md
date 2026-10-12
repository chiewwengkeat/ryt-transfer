# 010. Query cache only

## Context

1. BE data shows on several screens: the balance, the history pages, a transfer's details and its result
2. A transfer's status changes after it is sent, and every screen showing it has to agree
3. A normalized client-side store, each object held once by id, is the classic fix, and it was weighed for the history list in particular

## Decision

TanStack Query's cache holds all server state; the transfer flow's store keeps only a few responses as they arrived, never refetched, for the step that uses them ([005](005-state.md)). No normalized store sits beside the cache:

1. **By id and query key**: a transfer is referred to by its id and its query key; a screen that needs it reads the cache through that endpoint's own query
2. **No copied entries**
   1. The details screen shows the tapped row from the cached history pages as `placeholderData` until its own fetch returns
   2. Nothing copies a row into another cache entry, where it could drift until a fetch lands
3. **Key and query function together**
   1. Each domain's query keys come from one factory, `api/<area>.keys.ts`
   2. Each query's options, built with TanStack's `queryOptions`, take their key from that factory and carry it with the query function
   3. Patching or invalidating names a query's options, or a key prefix from the same factory, so neither can name a key that has drifted from the query's
4. **One place for the query client's retries** (`src/root/query-client/query-client.ts`)
   1. A query is retried at most twice, and only after a network drop, a timeout or a 5xx
   2. The default never retries a mutation, and never queues one offline to replay on reconnect
   3. The flow's own retries of a lost Create or Approve response re-send that mutation's `Idempotency-Key` ([006](006-never-sent-twice.md))

Unchanged rows skip their re-render:

1. TanStack's structural sharing keeps an unchanged transfer as the same object
2. FlashList's cells re-render only when their row's object, the render function or the list's `extraData` changes
3. The React Compiler keeps the render function stable ([009](009-history-at-scale.md) sets out how the re-renders are counted)

One case costs more:

1. Structural sharing compares list items by position, so a new transfer at the top makes every shifted row a new object, and the visible rows re-render once, a cheap pass under the compiler
2. An id-keyed `structuralSharing` function would remove it; the cost is reported and that fix held in reserve

**Cost**: keeping screens fresh depends on patching or resetting the right query at each change, a discipline the transfer flow upholds, not a guarantee

## Rejected

1. **A normalized transfer store**. Reason: a write-through layer, an eviction rule and a second owner of freshness, an estimated 150–250 lines plus tests
2. **An app-wide entity layer, such as `@normy/react-query`**. Reason: every object needs a stable id and every mutation a normalized response; by default it normalizes every query by id, which would overwrite the recipient in each history row, kept as confirmed when the transfer was sent, with today's details; the library is also pre-1.0
3. **An ids-plus-store list whose updates keep unchanged transfers' objects**. Reason: a transfer arriving at the top would re-render only its own row, at the cost of the write-through layer, eviction rule and second owner of freshness above; an id-keyed `structuralSharing` function removes the same cost inside the cache if it ever shows
4. **Building the id-keyed fix now**. Reason: no visible row would re-render when a transfer lands at the top, but the re-render it removes is one pass over the visible rows, cheap under the compiler
5. **SWR**. Reason: a mapped result isn't structurally shared, and its mutation model is weaker
6. **RTK Query**. Reason: a Redux store, for an app with little client state
7. **No library**. Reason: caching, request deduplication, retries and pagination written by hand
8. **Copying the row into the details cache entry on press**. Reason: one copy per tap, which can drift until the details fetch lands
9. **Copying every loaded row into its own cache entry**. Reason: a copy of every loaded row, and the most cache-write paths
10. **A query-key factory library**. Reason: no release since 25 February 2024, and a plain factory per domain, with `queryOptions`, keeps each key with its query function without one
