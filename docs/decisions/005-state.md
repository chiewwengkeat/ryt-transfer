# 005. State

## Context

The transfer flow runs across several screens, and several of its steps wait on the network or on a prompt. A double tap, or a navigation midway, must neither create a second transfer nor lose the first, so the flow's states have to rule out the impossible ones. The state that is not the bank's data is small: the draft across the flow's screens, the demo scenario picked in demo builds and the language picked. Some code that needs it runs outside React, such as the deep-link handler and the mock bank.

## Decision

The transfer flow is a plain typed reducer. It is in one state at a time — editing, reviewing, creating, approving, submitting, done — each holding only what that step needs, and it rejects any transition its current state does not allow. A confirmation that arrives outside reviewing is ignored, and going back to edit discards the transfer's idempotency key ([006](006-never-sent-twice.md)).

The reducer lives in a zustand store. A component subscribes to the slice it shows and re-renders only when that slice changes, and code outside React reads the store directly: the deep-link handler drops a link that arrives mid-transfer. `src/mocks/switcher/switcher-store.ts`, read by the mock bank outside React, is the same pattern at its smallest.

The transfer itself is not client state: the flow keeps its id, and the transfer lives in the query cache ([010](010-query-cache-only.md)). The flow also keeps the draft, which notice the editing or review step shows, with a hold's details, and a few of the bank's answers as they arrived, never refreshed, until the step that needs them is done: the approval, for one, signs the recipient lookup's answer that review showed and the bank's challenge. The amount and recipient forms keep their fields in their screens' own state, as they hold only a few fields, each validated on the screen where it is entered. A keystroke re-renders the form's screen, which is cheap at this size. The language picked is kept across launches in a key-value store read synchronously, so the first screen appears already in that language (`src/shared/platform/kv-storage.ts`). Development and demo builds also keep the scenario picked, saved with the mock bank's state, and a transfer still being checked keeps its ids in secure storage ([006](006-never-sent-twice.md), [008](008-hardening.md)).

## Rejected

- **XState.** Strong guarantees, but one more library, and one more way of thinking, for every engineer who touches the flow.
- **No explicit model**, only flags across screens and the data library's request status. It allows a double submit, or a pending transfer lost on navigation.
- **React Context with a reducer.** Every consumer re-renders on any change unless the state is split across many providers, and nothing outside React can read it.
- **Jotai.** Atoms are fine-grained, but they are a second mental model, and its major release was days old when it was weighed.
- **react-hook-form with zod.** A keystroke would re-render only its field rather than the form's screen, and a schema would hold each form's checks in one place. But that re-render is cheap at this size, a schema gathers little from a few fields each validated where it is entered, and together they take three packages: react-hook-form, its adapter and zod.
- **AsyncStorage for the language picked.** It reads asynchronously only, so the splash screen would wait for it.
- **expo-secure-store for the language picked.** No extra dependency and a synchronous read, but a setting that is no secret would sit in the keychain or keystore, and on iOS a keychain item can survive deleting the app.
- **MMKV.** Fast and synchronous, but it needs `react-native-nitro-modules` beside it. Chosen instead: expo-sqlite's key-value store, versioned with the Expo SDK.
