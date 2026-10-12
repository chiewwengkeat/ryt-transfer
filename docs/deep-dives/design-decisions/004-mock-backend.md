# 004. Mock BE

## Context

1. No BE exists for this module
2. A reviewer still has to see every scenario on a device they install the app on: insufficient balance, service down, a lost response, an app killed mid-approval
3. The tests have to exercise the same behaviour
4. With one mock for the demo and another for the tests, every API contract change would need two edits that drift apart
5. The mock has to last: no deprecated or unsupported package

## Decision

The app ships its own mock BE, and one set of [MSW](https://mswjs.io) handlers serves it wherever the app runs:

1. **One set of handlers, two hosts**
   1. Jest: MSW's Node server (`src/test/mock-bank/mock-bank.ts`)
   2. Device, in development and demo builds: the app's own fetch transport (`src/shared/http/transport/transport.ts`) passes each request to MSW's `getResponse` (`createDemoSend` in `src/mocks/demo-layer/demo-layer.ts`), through a small Metro alias that exposes only MSW's request-handling core (`.config/metro.js`, `.config/metro.msw-entry.mjs`)
   3. An API contract change edits, once for tests and devices alike: the endpoint's `.type.ts`; the endpoint module that sends the request and parses the response; the mock BE code behind the handler that builds the response; and any scenario that overrides it
   4. A new or moved path also edits the mock BE's own path list (`src/mocks/handlers/bank-paths/bank-paths.ts`), which the type checker doesn't tie to FE's
   5. MSW stays on 2.x; the alias reaches into MSW's internal file layout, so every MSW upgrade re-checks it
2. **A stateful mock BE**: one store, `src/mocks/bank/`, behind every endpoint's handler
   1. A transfer debits the balance and uses the day's limit
   2. A repeated `Idempotency-Key` gets BE's first response back
   3. Signatures are verified for real
   4. Development and demo builds persist it across app restarts, since the killed-app scenarios need the mock BE to outlive the app; the Demo menu resets it
3. **Scenarios on top**
   1. Each matrix id has an entry in `src/mocks/scenarios/transfer-scenarios/transfer-scenarios.ts`: conditions that change the mock BE's state, or handlers that override its responses
   2. A visible Demo menu picks one in development and demo builds, so a reviewer sees BE and network errors without touching code
   3. Production ships neither the mock BE nor the menu ([007](007-production-guard.md))
4. **No passthrough**: no handler forwards a request to the network; an unhandled request is an error, in tests and on a device alike

## Rejected

1. **MSW's own React Native integration**. Reason: on Hermes, MSW 2's React Native entry returned empty response bodies; the newer `@msw/react-native` was an unreleased experiment that worked only after a manual build, Metro aliases and two hand-written shims; MSW 3 has no React Native entry at all
2. **"Supported" read as the integration its maintainers declare, or a stable 1.0 release**. Reason: the first would have meant `@msw/react-native`, the experiment above; the second would have ruled out the only maintained biometric-signing library, leaving a pass/fail biometric prompt. Chosen instead: MSW stays on 2.x, and the signing library ([003](003-biometric-approval.md)) may stay before 1.0
3. **MSW 2's main entry, with two hand-written shims**. Reason: the app would import MSW's public entry, not its internal files, but would need stand-ins for the two browser APIs React Native lacks, without which that entry crashes the app at startup: hand-written shims of web APIs, on a path untested when it was weighed. Chosen instead: the alias, which needs no shims, at the cost of re-checking it on every MSW upgrade
4. **MSW in tests only, with plain handlers in the app**. Reason: the app would call plain request-to-response handlers directly, with no MSW import, but the handlers would stop being MSW's own
5. **A local mock server**. Reason: the most production-like, but an installed APK has no server to reach
6. **A mock BE that resets on app restart**. Reason: killing the app kills the mock, so the killed-app scenarios could be shown only in tests
7. **Fixed responses per scenario**. Reason: no balance change after a transfer, no limit used, no retry recognised
8. **A mock BE that accepts any signature**. Reason: a demo would pass what the real BE rejects ([003](003-biometric-approval.md))
9. **axios or ky over the transport**. Reason: the transport is needed anyway, to reach the mock BE. axios could reach it only through its fetch adapter, wrapped around that transport, since its default XHR adapter never received a mocked body when tried; ky retries GET requests twice by default, retries that would have to be turned off under TanStack Query's own
10. **No way to pick a scenario**. Reason: a reviewer would see only the happy path
11. **A hidden gesture, or a launch argument, to pick a scenario**. Reason: a reviewer may never find the gesture, and an installed APK can't easily take a launch argument
