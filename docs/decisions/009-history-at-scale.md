# 009. History at scale

## Context

History has to stay usable over thousands of transfers in one sitting. New transfers land at the top while someone scrolls, each day's header shows how many transfers the day holds and their net amount, and any claim about the list's speed has to be one another engineer can repeat.

## Decision

History is built for thousands of transfers, and the decision is to count its re-renders rather than assume them:

- **Cursor pages of 30.** Each request returns the next 30 transfers, newest first by the bank's timestamp and then id, with an opaque cursor for the page after (`src/domains/transfer/api/list-transfers/list-transfers.type.ts`). A transfer that lands while someone scrolls cannot shift the next page.
- **Day sections that collapse.** Each day's header shows the date, the day's count and its net amount, and collapses or expands the day's rows. Days arrive expanded. The figures come from the bank: every page carries a summary of each day it touches, covering the whole day, so a day split across two pages never reads short.
- **FlashList 2.** It recycles row cells, and measures each row's height itself so large text never breaks the list.
- **Infinite scroll, one reset.** The next page loads a screen before the end. History's query never refetches on focus or reconnect, because a refetch replays every loaded page: 34 requests after 1,000 rows. Opening History with pages already cached, pulling to refresh and a transfer just made all go through one reset, which keeps only the newest page and fetches it again; an open with nothing cached fetches that page once.
- **The React Compiler, no hand-written memoization.** A row's render function never closes over a value that changes. In the spike that measured this approach, appending a page re-rendered no visible row, a status change re-rendered one, and an identical refetch none.
- **Seeded, then counted.** The demo bank seeds 5,000 transfers over 548 days (`src/mocks/bank/ports.ts`). The decision is to count six operations: a page append, a status change, a new transfer at the top, a pull-to-refresh that brings nothing new, collapsing and expanding a day, and format calls per append. A new transfer at the top is expected to re-render the visible rows once; the decision is to report that cost and hold its fix in reserve ([010](010-query-cache-only.md)). The counter is compiled only into development builds, and the decided bundle check fails a demo or production bundle that carries it. The decision is a hand count in a release-mode development build on an Android emulator, written up with the steps to repeat it, rather than a CI test. iOS is not re-measured: in the spike, none of about 50 log lines from a release build reached iOS's log, and the iOS counts it did take matched Android's. There is no frame-rate claim: an emulator on a desktop says nothing about a mid-range phone.

The cost of headers that do not pin: a day's header scrolls away with its rows, so inside a long day its date is out of view.

## Rejected

- **Offset or page-number paging.** A transfer made while someone scrolls pushes every older row down one, so the next page repeats a row and the list gets a duplicate key; deep offsets are also slow on a real database.
- **Pages of 20.** 1,000 transfers take 50 requests instead of 34.
- **Pages of 50.** A heavier first response, for a screen most people open to see the latest few.
- **A tuned FlatList.** It virtualizes but does not recycle rows, and it needs fixed row heights, which large text breaks.
- **Legend List 3.** Pure JavaScript, but its own documentation still called version 3 a beta when it was weighed.
- **A hand-built list.** It rebuilds the virtualization the platform's list components already provide, in code every later engineer has to maintain.
- **Sticky date headers, without collapsing.** A pinned header keeps the current day in view, but it holds a band of the screen for the whole scroll, and with no collapse a long day can only scroll under its header.
- **A date on every row.** The simplest, but harder to scan by day: it repeats the date on every row and leaves no one place for a day's count and net amount.
- **Summing the loaded rows.** A day split across two pages would read short until its next page arrived, which in a bank looks like a wrong total.
- **Only the date and count in a day's header, or only the date.** A header with fewer figures. Chosen instead: the bank's summary of each day, so the header shows the day's count and net amount, whole from the first page.
- **A "Load more" button.** A tap for every 30 rows, in a list meant to be scrolled through by the thousand.
- **Refreshing only on a pull or a new transfer.** A list opened minutes after its last fetch could lack the transfer someone is checking for before sending again.
- **The compiler off, with hand-written memoization.** Explicit, but a hand-written dependency list is easy to get wrong, and every one is one more thing to go stale.
- **Fixing the head-insert re-render now.** Weighed in [010](010-query-cache-only.md), which holds the fix in reserve.
- **The mechanisms alone, with no seeded data.** Nothing would show the list at scale.
- **An on-device timing harness.** About a day's work, and on an emulator on a desktop its timings would say nothing about a mid-range phone.
- **A throwaway probe for the counts, or counting in Jest.** A throwaway probe leaves no measurement code in the repository, and counting in Jest needs no emulator, but its counts would not come from a release build. Chosen instead: a counter committed with its tests and compiled only into development builds, counted by hand in a release-mode development build on an Android emulator.
- **Counting on iOS as well.** iOS would get counts of its own, at the cost of the app writing them to a file read off the simulator, since in the spike none of about 50 log lines from a release build reached iOS's log. Chosen instead: Android only.
