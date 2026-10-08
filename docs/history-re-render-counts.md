# Transfer history: measured re-render counts

How many of the history list's on-screen cells redraw for each thing that changes it, measured on Android in a
release-mode build. Counts only: no frame-rate or timing claim, since an emulator on a desktop says nothing about a
mid-range phone and React's profiler does not run in release builds.

## The numbers

Measured at commit `f054c18`: app data cleared once, then three cold launches, identical line for line. "Mounted" is
what FlashList had rendered when the operation began: the screen plus the margin it draws beyond it, 18 rows and 3 day
headers here.

| Operation                                  | Rows redrawn (of mounted) | Day headers redrawn (of mounted) | Cells newly shown  | Format calls | Earlier spike |
| ------------------------------------------ | ------------------------- | -------------------------------- | ------------------ | ------------ | ------------- |
| Page append, at rest at the top            | 0 of 18                   | 0 of 3                           | none               | 0            | 0             |
| Pull to refresh with nothing new           | 0 of 18                   | 0 of 3                           | none               | 0            | not compared  |
| Status change of one transfer              | 1 of 18                   | 0 of 3                           | none               | 2            | 1             |
| Collapse a day                             | 0 of 18                   | 1 of 3                           | 5 rows, 1 header   | 14           | —             |
| Expand it again                            | 0 of 17                   | 1 of 4                           | 6 rows             | 14           | —             |
| A new transfer at the top                  | 17 of 18                  | 1 of 3                           | 1 row              | 21           | —             |
| Jump to the end, and the pages that follow | 0 of 18                   | 0 of 3                           | 42 rows, 5 headers | 94           | —             |

The earlier spike measured a flat list of 24 mounted rows with the React Compiler on: a page append redrew 0, a
status change 1, an identical refetch 0. Without the compiler it was 24, 24 and 0. Its refetch fetched again the one
page it had loaded, so the pull, which trims two pages to one, is not set against it.

## What they show

- **A page append redraws nothing already shown.** Each row is the history query's `select` copy of its transfer, which
  TanStack Query's structural sharing of `select`'s result keeps from one page to the next, and the list's render
  function never closes over anything that changes, so FlashList's cell memo holds.
- **A pull that brings nothing new redraws nothing.** The pull trims the list to its first page and fetches that page
  again; the identical answer keeps every object. The trim is why this is not the spike's whole-cache refetch: the list
  never replays its loaded pages.
- **A status change redraws its one row**, which formats its time and amount again. Its day's header stays: the money
  did not move, so neither did the day's net.
- **Collapsing or expanding redraws only the tapped header.** The rows that enter the screen are first renders; no row
  that stays on screen redraws as the rows below it move.
- **A new transfer at the top redraws every mounted row once**, 17 of 18 (the 18th cell shows the new transfer), and
  the header of the day that gained it. Structural sharing matches a list's items by position, so a new first item
  gives every later one a new object. Each redrawn row formats its amount again, which arrives as a new object, but not
  its time, none of whose inputs changed.
- **Formatting follows the cells on screen, never the rows loaded.** Every format call belongs to a cell that drew, at
  most two per cell: a row's time and amount, a header's day and net. An append at rest formats nothing, because the
  new page draws nothing until it scrolls into view; the jump to the end formats 94 strings for the 47 cells it draws.

### The new transfer at the top: the cost, and the fix kept in reserve

One extra pass over the rows on screen each time a refresh brings a new transfer. The fix is an id-keyed
`structuralSharing` function on the history query that keeps a transfer's previous object whenever that same transfer
arrives unchanged, so only the new row would draw. It is not built: the decision was to report the count and keep the
fix in reserve, since one pass over 18 rows per refresh is cheap under the compiler.

## How it was measured

- **A redraw** is a commit of a cell already showing the same transfer, or the same day, before the operation began and
  still showing it. A recycled cell that now shows another transfer is that transfer's first render. Rows and day
  headers are counted apart.
- **A format call** is a real call of the row's or the header's formatter; a result the compiler reuses is not one.
- **Each operation starts on a settled list and is read once it settles again**: two snapshots 500 ms apart agree.
- **The operations**, in this order, each through the list's own code:
  1. Page append: the next page is fetched while the list rests at the top.
  2. Pull to refresh with nothing new: the same reset a pull runs, then the scroll to the top.
  3. Status change: the newest transfer comes back with a newer version and the status Processing, through the cache
     patch the transfer flow uses. Its money is unchanged.
  4. Collapse: the newest day's toggle, as a tap on its header runs it.
  5. Expand: the same toggle again.
  6. A new transfer at the top: no screen can make one appear while the list is open, so this is written to the cache,
     shaped as the reset leaves it: one page, a new transfer first, the next 29 rows shifted down, and its day's count
     up by one.
  7. Jump to the end: the list scrolls to its end, which loads a page by itself, and one more page is fetched.

  The refresh runs before the cache writes, which a refresh would undo.

- **The build**: a release-mode development build, React's production renderer with the React Compiler on Hermes. Only
  development builds run the trace and the operations that drive it: demo and production exports keep the trace as
  no-op stand-ins and carry none of the operations.
- **The device**: the Android emulator, Pixel 9 profile (1080 × 2424, 420 dpi), Android 17 (API 37), arm64, holding the
  demo's 5,000 seeded transfers.

### iOS was not measured again

A release build's console output reaches Android's log but not iOS's, which delivered none of about 50 lines in the
earlier spike, so iOS counts would have to be written to a file and read off the simulator. That spike found iOS's
counts identical to Android's, and the list's code is the same on both.

## Reproduce

Build the release-mode development build, install it over fresh app data, and open History through its measure link:

```sh
EXPO_PUBLIC_APP_VARIANT=development pnpm exec expo prebuild --clean --platform android
cd android && EXPO_PUBLIC_APP_VARIANT=development ./gradlew app:assembleRelease && cd ..
adb install -r android/app/build/outputs/apk/release/app-release.apk
adb shell pm clear io.github.chiewwengkeat.ryttransfer.dev
adb logcat -c
adb shell am start -a android.intent.action.VIEW -d 'ryt-dev://transfer-history?measure=renders' io.github.chiewwengkeat.ryttransfer.dev
adb logcat -s ReactNativeJS | grep ryt-render-trace
```

Seven lines arrive within about 15 seconds, one per operation. For another run, force-stop the app and open the link
again: the measurement runs once per launch, and only when that link opened the app. A debug build measures React's
development renderer, so its counts are not these.

Each line is JSON. `cells.row` and `cells.header` give `mounted`, `rerenderedCells` (distinct cells redrawn),
`rerenders` (all redraws) and `firstRenders`; `formatCalls` covers both; `before` and `after` give the pages loaded.
The first line of a run reads:

```text
ryt-render-trace {"operation":"pageAppend","before":{"pagesLoaded":1},"after":{"pagesLoaded":2},"cells":{"header":{"mounted":3,"rerenderedCells":0,"rerenders":0,"firstRenders":0},"row":{"mounted":18,"rerenderedCells":0,"rerenders":0,"firstRenders":0}},"formatCalls":0}
```

The trace is `src/shared/observability/render-trace.ts`; the row and the day header each call it once, and the list's
development-only hook `SectionTransferAccordion/hooks/use-transfer-history-render-measurement.ts` drives the operations.
