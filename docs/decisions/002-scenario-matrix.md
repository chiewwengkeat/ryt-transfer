# 002. Scenario matrix

## Context

A bank's transfers run through more than one client: this app, a website, perhaps a lighter app or a rebuild. Each must tell a person the same thing about their money in the same situation, or one client's "failed" beside another's "pending" leads someone to pay twice. Product owners and designers need to read and change that behaviour themselves, with no second copy kept for them in a ticket. The list of situations is long from the start and keeps growing. And the app's Malay and Chinese are machine translations nobody reviews, so nothing human stands between a mistranslated money message and a customer.

## Decision

[`src/screens/transfer/scenarios/transfer.md`](../../src/screens/transfer/scenarios/transfer.md) is the one description of what can happen while someone sends money, and every client that sends money follows it. Transfer is the feature that gets one because it is where clients drifting apart costs a customer money. The file is written for a product owner as much as for an engineer:

- **One short section per scenario**, grouped by the step where it happens, under an index with one line per step. Each section says when it happens, what happened to the money, where it shows, what the person must be told and what they can do; where it matters, also what they must never be offered, what follows and why. A new attribute is one more label, never a wider table.
- **A permanent id per scenario**, `transfer.<snake_case>`, never changed and never reused. The mock bank's scenario registry, the scenario tests, the translation keys, the Demo menu and the analytics outcome all use it as written. The matrix test fails when the registry's ids, or the step each sits under, differ from the file's, or when a test declares an id the file lacks; the decision is that it also fails a scenario with no test.
- **The story, not the sentences.** The matrix fixes what each scenario tells the person; the exact words live in the translation files under the scenario's id, so each client words it for its own screen.
- **Four money states.** Every Money line is one of: no money moved, money moved, not confirmed yet, money returned. A glossary in the header gives each state's phrase in Malay and Chinese. The decision is a check that fails a money message, in any language, that lacks its state's phrase, and anything a person can press that offers to send again where the scenario's **Never** forbids it. It reads only what can be pressed, so messages keep their warnings against sending again.
- **Inside the transfer slice**, beside the code that implements it. Only the matrix test reads it, through the file system; nothing imports it, so no build carries it.

The ids join five kinds of consumer to the file, so the check that pins them is what keeps a renamed scenario from silently losing its test and its mock. The cost of the file's place is that a description meant for every client sits in one app's source tree.

## Rejected

- **Transfer history as the feature.** It has about six states, few of them errors.
- **Biometric approval alone as the feature.** It is bound to the phone's hardware rather than independent of any client's technology, and it is one step of a transfer anyway.
- **The exact words in the matrix.** The file would become part of the app's build through a custom transform, a product owner's mis-edit would fail the build, and every client would be held to one set of sentences instead of one story.
- **The English words in the matrix, the translations in the app.** The same build step, and each client would still translate on its own.
- **The words kept in two places, or generated.** Two copies kept equal by a test are still two copies; a data file that generates the markdown would have product owners editing data, with the markdown as a copy.
- **Ids nothing checks, or links by heading.** Unchecked, a scenario loses its test silently; linked by heading text, a rename silently breaks every test and mock that points at it.
- **Linked tables of rule ids**, split across files that cite each other and point into the code. Within one file, the index already links each scenario to its section, and the matrix test fails on any mismatch; ids are kept for the joins that cross files, to the tests and the mocks.
- **Tables, or Given/When/Then.** A table stops being readable once its cells hold sentences, and one table for everything is easy to break when edited by hand. Given/When/Then is slow to scan and reads as test code to a product owner.
- **Keeping the original 48 scenarios, with variant ids.** The matrix would have stayed one section per scenario of its original list, with variant ids for a new customer's daily limit and for cooling-off's two causes. Chosen instead: a section for the limit, and one for each cause of cooling-off, each with its own message.
- **Fewer money states, or the bank's own.** Without "money returned", a reversal would read as "no money moved"; with only moved or not, the uncertain state disappears. The bank's internal states are precise for operations and opaque to a customer.
- **No check on the money messages.** Money messages in two languages would rest on a machine translation nothing checks.
- **A ban on retry words alone, or a one-off back-translation.** The ban misses a message that names the wrong money state; a back-translation checks once, and nothing re-checks the next edit.
- **Only "try again", in each language.** The **Never** lines forbid offering to send it again, and a translation could say exactly that without tripping a list of "try again" alone.
- **Checking messages too, with a retry word allowed after "don't".** It would also catch a message that urges a resend in words. Chosen instead: the check reads only what a person can press.
- **A `scenarios/` folder at the root.** In plain view at the top of the repository, and able to move whole to a shared repository when a second client arrives. Chosen instead: the transfer slice, beside the code that implements it.
- **`docs/scenarios/`.** With the project's engineering documents. Chosen instead: the transfer slice, beside the code that implements it.
