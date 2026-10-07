# 009. History at scale

## Context

History has to stay usable over thousands of transfers in one sitting. New transfers land at the top while someone scrolls, each day's header shows how many transfers the day holds and their net amount, and any claim about the list's speed has to be one another engineer can repeat.

## Decision

History is built for thousands of transfers, and its rendering is measured rather than assumed:

- **Cursor pages of 30.** Each request returns the next 30 transfers, newest first by the bank's timestamp and then id, with an opaque cursor for the page after (`src/domains/transfer/api/list-transfers/list-transfers.type.ts`). A transfer that lands while someone scrolls cannot shift the next page.
- **Day sections that collapse.** Each day's header shows the date, the day's count and its net amount, and collapses or expands the day's rows. Days arrive expanded. The figures come from the bank: every page carries a summary of each day it touches, covering the whole day, so a day split across two pages never reads short.
- **FlashList 2.** It recycles row cells, measures each row's height itself so large text never breaks the list, and keeps the visible row in place as rows arrive.
- **Infinite scroll, one reset.** The next page loads a screen before the end. Nothing refetches on focus or reconnect, because a refetch replays every loaded page: 34 requests after 1,000 rows. Opening History, pulling to refresh and a transfer just made all go through one reset, which keeps only the newest page and fetches it again.
- **The React Compiler, no hand-written memoization.** A row's render function never closes over a value that changes. In the spike that chose this approach, appending a page re-rendered no visible row, a status change re-rendered one, and an identical refetch none.
- **Seeded, then counted.** The demo bank seeds 5,000 transfers over 548 days (`src/mocks/bank/ports.ts`). Six operations are counted: a page append, a status change, a new transfer at the top, a pull-to-refresh that brings nothing new, collapsing and expanding a day, and format calls per append. A new transfer at the top re-renders the visible rows once, a cost reported with its fix held in reserve ([010](010-query-cache-only.md)). The counter is compiled only into development builds, and the bundle check proves it absent from demo and production. Counts are taken by hand in a release-mode development build on an Android emulator and written up with the steps to repeat them, rather than run as CI tests. iOS is not re-measured: in the spike, none of about 50 log lines from a release build reached iOS's log, and the iOS counts it did take matched Android's. There is no frame-rate claim: an emulator on a desktop says nothing about a mid-range phone.

The cost of collapsible days: a day's header scrolls away with its rows, so inside a long day its date is out of view.

## Rejected

- **Offset or page-number paging.** A transfer made while someone scrolls pushes every older row down one, so the next page repeats a row and the list gets a duplicate key; deep offsets are also slow on a real database.
- **Pages of 20.** 1,000 transfers take 50 requests instead of 34.
- **Pages of 50.** A heavier first response, for a screen most people open to see the latest few.
- **A tuned FlatList.** It virtualizes but does not recycle rows, and it needs fixed row heights, which large text breaks.
- **Legend List 3.** Pure JavaScript, but its own documentation still called version 3 a beta when it was weighed.
- **A hand-built list.** It rebuilds the virtualization the platform's list components already provide, in code every later engineer has to maintain.
- **Sticky date headers.** A pinned header keeps the current day in view, but it holds a band of the screen for the whole scroll, a band that grows with the text size, and a busy day can only be scrolled through. A header that collapses its day lets a person skip past it and still shows the day's count and net amount.
- **A date on every row.** It repeats the date on every row and leaves no one place for a day's count and net amount.
- **Summing the loaded rows.** A day split across two pages would read short until its next page arrived, which in a bank looks like a wrong total.
- **A "Load more" button.** A tap for every 30 rows, in a list meant to be scrolled through by the thousand.
- **Refreshing only on a pull or a new transfer.** A list opened minutes after its last fetch could lack the transfer someone is checking for before sending again.
- **The compiler off, with hand-written memoization.** Measured in the spike: a page append and a status change each re-rendered all 24 mounted rows. Every hand-written dependency list is also one more thing to go stale.
- **A timing harness on a device.** About a day's work, for timings that describe the one phone it ran on.
