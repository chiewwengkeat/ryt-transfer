/* eslint-disable no-restricted-globals -- a double of console itself, which logs nothing of its own */
afterEach(() => {
  consoleErrorSpy?.mockRestore();
  consoleErrorSpy = undefined;
});

export function hideConsoleError(message: string) {
  consoleErrorSpy?.mockRestore();
  const { error } = console;
  let didHidePrevious = false;
  consoleErrorSpy = jest
    .spyOn(console, "error")
    .mockImplementation((...args: unknown[]) => {
      const isExpected =
        args.some((arg) => arg instanceof Error && arg.message === message) ||
        (didHidePrevious && String(args[0]).startsWith(MSW_POINTER));
      didHidePrevious = isExpected;
      if (!isExpected) error(...args);
    });
}

// msw prints this right after a handler's exception, pointing back at it.
const MSW_POINTER =
  "[MSW] Encountered an unhandled exception during the handler lookup";
let consoleErrorSpy: jest.SpyInstance | undefined;
