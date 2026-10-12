# 002. Scenario matrix

## Context

1. A bank's transfers go through more than one FE consumer: this app, a website, maybe a lite app or a rebuild
2. Each must tell the user the same thing about their money in the same scenario; one FE consumer's "failed" beside another's "pending" leads a user to pay twice
3. Product owners and designers need to read and change that behaviour themselves, with no second copy kept for them in a ticket
4. The scenario list is long from the start, and keeps growing
5. The Malay and Chinese copy is unreviewed machine translation, so no human stands between a mistranslated money message and a customer

## Decision

[`src/screens/transfer/scenarios/transfer.md`](../../../src/screens/transfer/scenarios/transfer.md) is the single source of truth for what can happen while a user sends money, and every FE consumer that sends money follows it. Transfer gets one because it is where FE consumers drifting apart costs a customer money. The file is written for a product owner as much as for an engineer:

1. **One short section per scenario**, grouped by step, under an index with one line per step
   1. Each section: when it happens, whether money moved, where it shows, what the user must be told, what they can do
   2. Where it matters: what they must never be offered, what follows, and why
   3. A new attribute is one more label, never a wider table
2. **A permanent id per scenario**: `transfer.<snake_case>`, never changed and never reused
   1. The mock BE's scenario registry, the scenario tests, the Demo menu and the analytics `transfer_step` event all use it as written
   2. The translations keep its copy under `common.<name>`, where `<name>` is the id after `transfer.`
   3. The matrix check fails when the registry's ids, or the step each sits under, differ from the file's; when a test declares an id the file lacks; or when no route test picks a scenario and asserts on it
3. **The story, not the copy**: the matrix fixes what each scenario tells the user; the exact copy lives in the translation files under the scenario's id, so each FE consumer words it for its own screen
4. **Four money states**: every Money line is one of no money moved, money moved, not confirmed yet, money returned
   1. A glossary in the header gives each state's phrase in Malay and Chinese
   2. A check fails a scenario whose **Tell them** ends in a money state when none of its strings carries that state's phrase, in any language
   3. Where **Never** forbids offering to send it again, the check fails a retry word in any of the scenario's strings but its message (`body`), so messages keep their warnings against sending again
5. **Inside the transfer slice**, beside the code that implements it
   1. Only tests read it, through the file system; nothing imports it, so no build bundles it

**Result**:

1. The ids join five consumers to the file (registry, tests, Demo menu, analytics, translations), so the check that pins them keeps a renamed scenario from silently losing its test and its mock
2. Cost: a description meant for every FE consumer sits in one app's source tree

## Rejected

1. **Transfer history as the feature**. Reason: about six states, few of them errors
2. **Biometric approval alone as the feature**. Reason: bound to the device's hardware rather than independent of any FE consumer's stack, and only one step of a transfer anyway
3. **The exact copy in the matrix**. Reason: the file would join the app's build through a custom transform, a product owner's mis-edit would fail the build, and every FE consumer would be held to one set of sentences instead of one story
4. **The English copy in the matrix, the translations in the app**. Reason: the same build step, and each FE consumer would still translate on its own
5. **The copy kept in two places, or generated**. Reason: two copies kept equal by a test are still two copies; a data file that generates the markdown would have product owners editing data, with the markdown as a copy
6. **Ids nothing checks, or links by heading**. Reason: unchecked, a scenario silently loses its test; linked by heading text, a rename silently breaks every test and mock that points at it
7. **Linked tables of rule ids**, split across files that cite each other and point into the code. Reason: within one file, the index already links each scenario to its section and the matrix check fails on any mismatch; ids are kept for the joins that cross files, to the tests and the mocks
8. **Tables, or Given/When/Then**. Reason: a table stops being readable once its cells hold sentences, and one table for everything breaks easily when edited by hand; Given/When/Then is slow to scan and reads as test code to a product owner
9. **Keeping the original 48 scenarios, with variant ids** for a new customer's daily limit and cooling-off's two causes. Reason: a product owner would not have found the new customer's case in the matrix
10. **Fewer money states, or BE's own**. Reason: without "money returned", a reversal would read as "no money moved"; with only moved or not, the uncertain state disappears; BE's internal states are precise for operations and opaque to a customer
11. **No check on the money messages**. Reason: money messages in two languages would rest on a machine translation nothing checks
12. **A ban on retry words alone, or a one-off back-translation**. Reason: the ban misses a message that names the wrong money state; a back-translation checks once, and nothing re-checks the next edit
13. **Only "try again", in each language**. Reason: the **Never** lines forbid offering to send it again, and a translation could say exactly that without tripping a list of "try again" alone
14. **Checking messages too, with a retry word allowed after "don't"**. Reason: it would also catch a message that urges a retry in words, but the three warnings to check History before sending again would still fail in Malay and Chinese
15. **A `scenarios/` folder at the repo root**, in plain view and able to move whole to a shared repo when a second FE consumer arrives. Reason: the transfer slice keeps it beside the code that implements it
16. **docs/scenarios/**. Reason: one level deeper, among engineering docs a product owner seldom opens
