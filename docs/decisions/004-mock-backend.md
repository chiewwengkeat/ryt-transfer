# 004. Mock backend

## Context

No bank backend exists for this module. A reviewer still has to see every scenario on a phone they install, from not enough balance to the service down, a lost answer or an app killed mid-approval, and the tests have to exercise the same behaviour. With one fake for the demo and another for the tests, every change to the bank's contract would need two edits that drift apart. Whatever carries the mock should also be a package that is published and maintained, not a deprecated or unreleased one.

## Decision

The app carries its own mock bank, and one set of [msw](https://mswjs.io) handlers answers for it wherever the app runs:

- **One set of handlers, two hosts.** In Jest, msw's Node server serves them (`src/test/msw-server.ts`). On a phone, in development and demo builds, the app's own fetch transport (`src/shared/http/transport.ts`) hands each request to msw's `getResponse` (`src/mocks/transport/demo-send.ts`), through a small Metro alias that exposes only msw's request-handling core (`metro.config.js`, `metro.msw-entry.mjs`). A change to an endpoint's contract is one edit to its `.type.ts` and one to the handler that answers it. msw stays on its 2.x line; the alias reaches into msw's internal file layout, so any msw upgrade re-checks it.
- **A bank with state.** Behind the handlers is one bank, `src/mocks/bank/`, that every endpoint reads and writes: a transfer moves the balance and uses the day's limit, a repeated idempotency key gets its first answer back, and signatures are verified for real. Development and demo builds save it across restarts, because the scenarios about a killed app need the bank to outlive the app; the Demo menu resets it.
- **Scenarios on top.** Each matrix id has an entry in `src/mocks/scenarios/transfer-scenarios.ts`: conditions that change the bank's state, or answers laid over the bank's own. A visible Demo menu picks one in development and demo builds, so a reviewer can see every error without touching code. Production carries neither the bank nor the menu ([007](007-production-guard.md)).
- **Nothing passes through.** No handler forwards a request to the network: a request nothing answers is an error, in tests and on a phone alike.

## Rejected

- **msw's own routes into React Native.** On Hermes, msw 2's React Native entry returned empty response bodies; the newer `@msw/react-native` was an unreleased experiment that worked only after a manual build, bundler aliases and two hand-written shims; msw 3 has no React Native entry at all.
- **msw 2's main entry, shimmed.** It loads two browser APIs React Native lacks and crashes at startup without hand-written stand-ins for them.
- **msw in tests only, with plain handlers in the app.** The phone would not have depended on msw's internal files; msw's own handlers answer on the phone instead, through the alias.
- **A local mock server.** The most production-like, but an installed APK has no server to reach.
- **A bank that forgets on restart.** Killing the app kills the mock, so the scenarios about a killed app could be shown only in tests.
- **Fixed answers per scenario.** No balance change after a transfer, no limit used, no repeat recognised.
- **axios or ky over the transport.** axios uses XHR on React Native, which never received a mocked body when it was tried; ky retries reads on its own, on top of the query library's retries.
- **A hidden gesture, or a launch argument, to pick a scenario.** A reviewer may never find the gesture, and an installed APK cannot easily take a launch argument.
