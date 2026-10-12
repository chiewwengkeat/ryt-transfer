# 009. History at scale

## Context

1. History has to stay fast over thousands of transfers in one session
2. New transfers land at the top while the user scrolls
3. Each day header shows the day's transfer count and net amount
4. Any claim about the list's performance has to be one another engineer can reproduce

## Decision

History is built for thousands of transfers, and its re-renders are measured, not assumed:

1. **Cursor pagination, 30 per page**
   1. Each request returns the next 30 transfers, newest first by BE's timestamp, then id, with an opaque cursor for the next page (`src/domains/transfer/api/list-transfers/list-transfers.type.ts`)
   2. A transfer landing mid-scroll can't shift the next page
2. **Collapsible day sections**
   1. Each day header shows the date, the day's count and its net amount, and collapses or expands the day's rows; its chevron rotates, instantly when the OS reduces motion
   2. Days start expanded
   3. The figures come from BE: every page carries a whole-day summary for each day it touches, so a day split across two pages never shows a short total
3. **FlashList 2**: recycles row cells, and measures each row's height itself, so large text never breaks the list
4. **Infinite scroll, one reset**
   1. The next page is fetched a screen before the end
   2. History's infinite query never refetches on focus or reconnect, since a refetch replays every loaded page: 34 requests after 1,000 rows
   3. One reset serves pull-to-refresh, a transfer just made, and opening History 30 s or more after its newest page was last fetched: it keeps only the newest page and refetches it; deeper pages are fetched again as the user scrolls
   4. Opened within those 30 s, unless a sign-in or a Demo pick has since invalidated it, History renders the pages in the cache (up to the 200 transfers kept on closing) and sends no request, so a quick back-and-forth costs nothing
   5. Opened with an empty cache, it fetches the newest page once
5. **React Compiler, no hand-written memoization**
   1. A row's render function never closes over a value that changes
   2. In the spike that measured this approach, appending a page re-rendered no visible row, a status change one, and an identical refetch none
6. **Seeded, then counted**
   1. The mock BE seeds 5,000 transfers over 548 days (`src/mocks/bank/ports/ports.ts`)
   2. Each operation that changes the list is counted by hand in a release-mode development build on an Android emulator, not in a CI test; [the counts](../history-re-render-counts.md) are written up with the steps to reproduce them
   3. Appending a page, a pull-to-refresh with nothing new, and collapsing or expanding a day re-render no row already on screen; a status change re-renders its one row
   4. A new transfer at the top re-renders the visible rows once, as expected: the cost is reported and its fix held in reserve ([010](010-query-cache-only.md))
   5. Format calls scale with rendered cells, never with loaded rows
   6. The render counter is compiled only into development builds; the bundle check fails a demo or production bundle that contains it
   7. iOS isn't re-measured: in the spike, none of about 50 log lines from a release build reached iOS's log, and the iOS counts it did take matched Android's
   8. No frame-rate claim: an emulator on a desktop says nothing about a mid-range phone

**Cost**: headers aren't sticky, so a day header scrolls away with its rows, and inside a long day its date is out of view

## Rejected

1. **Offset or page-number pagination**. Reason: a transfer made mid-scroll pushes every older row down one, so the next page repeats a row and the list gets a duplicate key; deep offsets are also slow on a real database
2. **Pages of 20**. Reason: 1,000 transfers take 50 requests instead of 34
3. **Pages of 50**. Reason: a heavier first response, for a screen most users open to see the latest few
4. **A tuned FlatList**. Reason: it virtualizes but doesn't recycle rows, and needs fixed row heights, which large text breaks
5. **Legend List 3**. Reason: pure JavaScript, but its own docs still called version 3 a beta when it was weighed
6. **A hand-built list**. Reason: it rebuilds the virtualization the existing list components already provide, in code every later engineer has to maintain
7. **Sticky date headers, without collapsing**. Reason: a pinned header keeps the current day in view, but takes a band of the screen for the whole scroll, and with no collapse a long day can only scroll under its header
8. **A date on every row**. Reason: simplest, but harder to scan by day: it repeats the date on every row and leaves no one place for a day's count and net amount
9. **Summing the loaded rows**. Reason: a day split across two pages would show a short total until its next page arrived, which in a banking app looks like a wrong total
10. **Only the date and count in a day header, or only the date**. Reason: fewer figures; BE's whole-day summary lets the header show the day's count and net amount, complete from the first page
11. **A "Load more" button**. Reason: a tap every 30 rows, in a list meant to be scrolled through by the thousand
12. **Refreshing only on pull-to-refresh or a new transfer**. Reason: a list opened minutes after its last fetch could lack the transfer the user is checking for before sending again
13. **A five-minute reuse window**. Reason: more reopenings would cost no request, but inside the window the same gap opens: a list fetched minutes ago could lack that transfer
14. **Keeping every page and refetching all of them on reopening**. Reason: everything scrolled to stays, but 180 transfers take six sequential requests on every reopening
15. **Compiler off, with hand-written memoization**. Reason: explicit, but a hand-written dependency list is easy to get wrong, and each one can go stale
16. **Fixing the head-insert re-render now**. Reason: weighed in [010](010-query-cache-only.md), which holds the fix in reserve
17. **The mechanisms alone, with no seeded data**. Reason: nothing would show the list at scale
18. **An on-device timing harness**. Reason: about a day's work, and on a desktop emulator its timings would say nothing about a mid-range phone
19. **A throwaway probe for the counts, or counting in Jest**. Reason: a throwaway probe leaves no measurement code in the repo, and counting in Jest needs no emulator, but neither count would come from a release build; instead, a render counter committed with its tests, compiled only into development builds, and counted by hand in a release-mode development build on an Android emulator
20. **Counting on iOS as well**. Reason: the app would have to write the counts to a file pulled off the simulator, since in the spike none of about 50 log lines from a release build reached iOS's log; so Android only
