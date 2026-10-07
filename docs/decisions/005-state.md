# 005. State

## Context

The transfer flow runs across several screens, and several of its steps wait on the network or on a prompt. A double tap, or a navigation midway, must neither create a second transfer nor lose the first, so the flow's states have to rule out the impossible ones. The state that is not the bank's data is small: the draft across the flow's screens, the demo scenario picked in demo builds and the language picked. Some code that needs it runs outside React, such as the deep-link handler and the mock bank.

## Decision

The transfer flow is a plain typed reducer. It is in one state at a time — editing, reviewing, creating, approving, submitting, checking, done — each holding only what that step needs, and it rejects any transition its current state does not allow. A confirmation that arrives outside reviewing is ignored, and going back to edit discards the transfer's idempotency key ([006](006-never-sent-twice.md)).

The reducer lives in a zustand store. A component subscribes to the slice it shows and re-renders only when that slice changes, and code outside React reads the store directly: the deep-link handler drops a link that arrives mid-transfer, and a background check takes over a transfer the person leaves while it is being sent. `src/mocks/switcher/switcher-store.ts`, read by the mock bank outside React, is the same pattern at its smallest.

The bank's data is not client state. The flow holds only the transfer's id, and the transfer itself lives in the query cache ([010](010-query-cache-only.md)). Each form keeps its fields in react-hook-form, so a keystroke re-renders its field rather than the screen. The language picked is the one piece kept across launches, in a key-value store read synchronously, so the first screen appears already in that language (`src/shared/platform/kv-storage.ts`).

## Rejected

- **XState.** Strong guarantees, but one more library, and one more way of thinking, for every engineer who touches the flow.
- **No explicit model**, only flags across screens and the data library's request status. It allows a double submit, or a pending transfer lost on navigation.
- **React Context with a reducer.** Every consumer re-renders on any change unless the state is split across many providers, and nothing outside React can read it.
- **Jotai.** Atoms are fine-grained, but they are a second mental model, and its major release was days old when it was weighed.
- **AsyncStorage for the language picked.** It reads asynchronously only, so the splash screen would wait for it.
