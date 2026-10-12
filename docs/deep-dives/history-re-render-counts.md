# Transfer history: measured re-render counts

How many of the history list's mounted cells re-render on each operation, measured on Android in a release build:

1. Counts only, no frame-rate or timing claim:
   1. An emulator on a desktop says nothing about a mid-range phone
   2. React's profiler doesn't run in release builds

## The numbers

1. Measured at commit `f054c18`, before the rebase that landed it as `59331b8`, whose history code is the same
2. App data cleared once, then three cold launches, identical line for line
3. "Mounted": what FlashList had rendered when the operation began, the viewport plus the margin it renders beyond it; here 18 rows and 3 day headers

| Operation                                  | Rows re-rendered (of mounted) | Day headers re-rendered (of mounted) | Cells first rendered | Format calls | Earlier spike |
| ------------------------------------------ | ----------------------------- | ------------------------------------ | -------------------- | ------------ | ------------- |
| Page append, at rest at the top            | 0 of 18                       | 0 of 3                               | none                 | 0            | 0             |
| Pull to refresh with nothing new           | 0 of 18                       | 0 of 3                               | none                 | 0            | not compared  |
| Status change of one transfer              | 1 of 18                       | 0 of 3                               | none                 | 2            | 1             |
| Collapse a day                             | 0 of 18                       | 1 of 3                               | 5 rows, 1 header     | 14           | —             |
| Expand it again                            | 0 of 17                       | 1 of 4                               | 6 rows               | 14           | —             |
| A new transfer at the top                  | 17 of 18                      | 1 of 3                               | 1 row                | 21           | —             |
| Jump to the end, and the pages that follow | 0 of 18                       | 0 of 3                               | 42 rows, 5 headers   | 94           | —             |

The earlier spike, a flat list of 24 mounted rows:

1. React Compiler on: a page append re-rendered 0 rows, a status change 1, an identical refetch 0
2. React Compiler off: 24, 24 and 0
3. The spike's refetch fetched only the one page it had loaded, so the pull to refresh, which trims two pages to one, isn't compared against it

## What they show

1. **A page append re-renders no mounted cell**
   1. Each row is the history query's `select` copy of its transfer, which TanStack Query's structural sharing of `select`'s result keeps as the same object from one page to the next
   2. The list's render function closes over nothing that changes, so FlashList's cell memo holds
2. **A pull to refresh with nothing new re-renders nothing**
   1. The pull trims the list to its first page and refetches that page; the identical response keeps every object
   2. The trim is why this differs from the spike's whole-cache refetch: the list never refetches every page it had loaded
3. **A status change re-renders its one row**, which formats its time and amount again
   1. Its day header doesn't re-render: the transfer's amount is unchanged, so the day's net is too
4. **Collapsing or expanding re-renders only the tapped header**
   1. Rows entering the viewport are first renders; no row that stays on screen re-renders as the rows below it move
5. **A new transfer at the top re-renders every mounted row once**: 17 of 18 (the 18th cell shows the new transfer), plus the header of the day that gained it
   1. Structural sharing matches a list's items by index, so a new first item gives every later item a new object
   2. Each re-rendered row formats its amount again, since the amount arrives as a new object, but not its time, none of whose inputs changed
6. **Formatting follows the rendered cells, never the loaded rows**
   1. Every format call belongs to a cell that rendered, at most two per cell: a row's time and amount, a header's day and net
   2. A page append at rest formats nothing: the new page renders nothing until it scrolls into view
   3. The jump to the end formats 94 strings for the 47 cells it renders

### The new transfer at the top: the cost, and the fix kept in reserve

1. Cost: one extra re-render of the mounted rows each time a refresh brings a new transfer
2. Fix: an id-keyed `structuralSharing` function on the history query, keeping a transfer's previous object whenever the same transfer arrives unchanged, so only the new row would render
3. Not built: the decision was to report the count and keep the fix in reserve, since one pass over 18 rows per refresh is cheap under the React Compiler

## How it was measured

1. **A re-render**: a commit of a cell that showed the same transfer, or the same day, before the operation began and still shows it
   1. A recycled cell that now shows another transfer counts as that transfer's first render
   2. Rows and day headers are counted separately
2. **A format call**: a real call of the row's or the header's formatter; a result the React Compiler reuses isn't one
3. **Each operation starts on a settled list, and is measured once the list settles again**: two snapshots 500 ms apart agree
4. **The operations**, in this order, each through the list's own code:
   1. Page append: the next page is fetched while the list rests at the top
   2. Pull to refresh with nothing new: the same reset a pull triggers, then a scroll to the top
   3. Status change: the newest transfer comes back with a newer version and the status Processing, through the cache patch the transfer flow uses; its amount is unchanged
   4. Collapse: the newest day's toggle, as a tap on its header triggers it
   5. Expand: the same toggle again
   6. A new transfer at the top: no screen can add one while the list is open, so it is written to the query cache in the shape the reset leaves: one page, a new transfer first, the next 29 rows shifted down, and its day's count up by one
   7. Jump to the end: the list scrolls to its end, which fetches a page by itself, then one more page is fetched
5. **The pull to refresh runs before the two cache writes** (status change, new transfer), since a refresh would undo them
6. **The build**: a release-mode development build, so React's production renderer, with the React Compiler, on Hermes
   1. Only development builds run the trace and the operations that drive it
   2. Demo and production exports keep the trace as no-op stubs and carry none of the operations
7. **The device**: the Android emulator, Pixel 9 profile (1080 × 2424, 420 dpi), Android 17 (API 37), arm64, holding the demo's 5,000 seeded transfers

### iOS was not measured again

1. A release build's console output reaches Android's logcat but not iOS's log: iOS delivered none of about 50 lines in the earlier spike
2. So iOS counts would have to be written to a file and read off the simulator
3. That spike found iOS's counts identical to Android's, and the list's code is the same on both

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

1. Seven lines arrive within about 15 seconds, one per operation
2. To measure again, force-stop the app and open the link again: the measurement runs once per launch, and only when that link opened the app
3. A debug build measures React's development renderer, so its counts aren't comparable with these

Each line is JSON:

1. `cells.row` and `cells.header`: `mounted`, `rerenderedCells` (distinct cells re-rendered), `rerenders` (all re-renders) and `firstRenders`
2. `formatCalls`: rows and headers together
3. `before` and `after`: the pages loaded

The first line of a measurement:

```text
ryt-render-trace {"operation":"pageAppend","before":{"pagesLoaded":1},"after":{"pagesLoaded":2},"cells":{"header":{"mounted":3,"rerenderedCells":0,"rerenders":0,"firstRenders":0},"row":{"mounted":18,"rerenderedCells":0,"rerenders":0,"firstRenders":0}},"formatCalls":0}
```

1. The trace: `src/shared/observability/render-trace/render-trace.ts`; the row and the day header each call it once
2. The operations: the list's development-only hook, `SectionTransferAccordion/hooks/use-transfer-history-render-measurement/use-transfer-history-render-measurement.ts`
