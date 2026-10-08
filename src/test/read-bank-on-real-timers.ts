// The bank answers after msw's delay(), which renderRoute's fake timers hold forever. The test stays on real timers.
export function readBankOnRealTimers<Answer>(readBank: () => Promise<Answer>) {
  jest.useRealTimers();
  return readBank();
}
