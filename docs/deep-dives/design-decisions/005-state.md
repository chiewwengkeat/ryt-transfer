# 005. State

## Context

1. The transfer flow spans several screens, and several steps await a network response or a prompt
2. A double tap, or navigating away midway, must neither create a second transfer nor lose the first, so the flow's state must rule out impossible states
3. Local state, apart from BE data, is small: the draft across the flow's screens, the demo scenario picked in demo builds, and the language picked
4. Some code that needs it runs outside React: the deep-link handler, the mock BE

## Decision

The transfer flow is a plain typed reducer in a zustand store; BE data stays in the query cache:

1. **One state at a time**: editing, reviewing, creating, approving, submitting, done
   1. Each state holds only what its step needs
   2. The reducer ignores any action its current state doesn't allow: a Confirm outside reviewing does nothing
   3. Going back to edit discards the transfer's idempotency key ([006](006-never-sent-twice.md))
2. **A zustand store holds the reducer**
   1. A component subscribes to the slice it shows, and re-renders only when that slice changes
   2. Code outside React reads the store directly: the deep-link handler drops a link that arrives mid-transfer
   3. `src/mocks/switcher/switcher-store/switcher-store.ts`, read by the mock BE outside React, is the same pattern at its smallest
3. **The transfer itself is server state**: the flow keeps its id; the transfer lives in the query cache ([010](010-query-cache-only.md))
4. **What the flow keeps until its step is done**
   1. The draft, which notice the editing or review step shows, and a hold's details
   2. A few BE responses as they arrived, never refetched: Approve, for one, signs the recipient lookup response review showed, and BE's challenge
5. **Form fields live in each screen's own state** (amount, recipient)
   1. Each form holds a few fields, each validated on the screen where it's entered
   2. A keystroke re-renders the form's screen, which is cheap at this size
6. **Persisted state**
   1. The language picked: a key-value store read synchronously, so the first screen renders already in that language (`src/shared/platform/kv-storage/kv-storage.ts`)
   2. The scenario picked, in development and demo builds: saved with the mock BE's state
   3. A transfer still being checked: its ids, in secure storage ([006](006-never-sent-twice.md), [008](008-hardening.md))

## Rejected

1. **XState**. Reason: strong guarantees, but one more library, and one more mental model, for every engineer who touches the flow
2. **No explicit model**, only flags across screens and the data library's request status. Reason: allows a double submit, or a pending transfer lost on navigation
3. **React Context with a reducer**. Reason: every consumer re-renders on any change unless the state is split across many providers, and nothing outside React can read it
4. **Jotai**. Reason: fine-grained atoms, but a second mental model, and its major release was days old when it was weighed
5. **react-hook-form with zod**. Reason: a keystroke would re-render only its field rather than the form's screen, and a schema would hold each form's validation in one place; but that re-render is cheap at this size, a schema adds little over a few fields each validated where it's entered, and the pair takes three packages (react-hook-form, its adapter, zod)
6. **AsyncStorage for the language picked**. Reason: async reads only, so the splash screen would wait for it
7. **expo-secure-store for the language picked**. Reason: no extra dependency and a synchronous read, but a setting that is no secret would sit in the keychain or keystore, and on iOS a keychain item can survive deleting the app
8. **MMKV**. Reason: fast and synchronous, but needs `react-native-nitro-modules` beside it. Chosen instead: expo-sqlite's key-value store, versioned with the Expo SDK
