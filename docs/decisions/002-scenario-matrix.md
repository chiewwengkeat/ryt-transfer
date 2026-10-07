# 002. Scenario matrix

## Context

A bank's transfers run through more than one client: this app, a website, perhaps a lighter app or a rebuild. Each must tell a person the same thing about their money in the same situation, or one client's "failed" beside another's "pending" leads someone to pay twice. Product owners and designers need to read and change that behaviour themselves, with no second copy kept for them in a ticket. The list of situations is long from the start and keeps growing. And the app's Malay and Chinese are machine translations nobody reviews, so nothing human stands between a mistranslated money message and a customer.

## Decision

[`src/screens/transfer/scenarios/transfer.md`](../../src/screens/transfer/scenarios/transfer.md) is the one description of what can happen while someone sends money, and every client that sends money follows it. Transfer is the feature that gets one because it is where clients drifting apart costs a customer money. The file is written for a product owner as much as for an engineer:

- **One short section per scenario**, grouped by the step where it happens, under an index with one line per step. Each section says when it happens, what happened to the money, where it shows, what the person must be told and what they can do; where it matters, also what they must never be offered, what follows and why. A new attribute is one more label, never a wider table.
- **A permanent id per scenario**, `transfer.<snake_case>`, never changed and never reused. The mock bank's scenario registry, the scenario tests, the translation keys, the Demo menu and the analytics outcome all use it as written, and the matrix test fails when they disagree with the file.
- **The story, not the sentences.** The matrix fixes what each scenario tells the person; the exact words live in the translation files under the scenario's id, so each client words it for its own screen.
- **Four money states.** Every Money line is one of: no money moved, money moved, not confirmed yet, money returned. A glossary in the header gives each state's phrase in Malay and Chinese. A check fails a money message, in any language, that lacks its state's phrase, and anything a person can press that offers to send again where the scenario's **Never** forbids it. Messages keep their warnings against sending again.
- **Inside the transfer slice**, beside the code that implements it. Only the matrix test reads it, through the file system; nothing imports it, so no build carries it.

The ids join six kinds of consumer, so the check that pins them is what keeps a renamed scenario from silently losing its test, its mock and its words. The cost of the file's place is that a description meant for every client sits in one app's source tree.

## Rejected

- **The exact words in the matrix.** The file would become part of the app's build through a custom transform, a product owner's mis-edit would fail the build, and every client would be held to one set of sentences instead of one story.
- **The words kept in two places, or generated.** Two copies kept equal by a test are still two copies; a data file that generates the markdown would have product owners editing data, with the markdown as a copy.
- **Ids nothing checks, or links by heading.** Unchecked, a scenario loses its test silently; linked by heading text, a rename silently breaks every test and mock that points at it.
- **Tables, or Given/When/Then.** A table stops being readable once its cells hold sentences, and one table for everything is easy to break when edited by hand. Given/When/Then is slow to scan and reads as test code to a product owner.
- **Fewer money states, or the bank's own.** Without "money returned", a reversal would read as "no money moved"; with only moved or not, the uncertain state disappears. The bank's internal states are precise for operations and opaque to a customer.
- **A ban on retry words alone, or a one-off back-translation.** The ban misses a message that names the wrong money state; a back-translation checks once, and nothing re-checks the next edit.
- **A `scenarios/` folder at the root, or under `docs/`.** Either is easier for a product owner to find, and a root folder could move whole to a shared repository when a second client arrives. Both put the file away from the code that changes with it.
