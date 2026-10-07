import { toSen } from "./money";

describe("toSen", () => {
  it.each([0, 1, -500, 123450, Number.MAX_SAFE_INTEGER])(
    "keeps the safe integer %p as it is",
    (value) => {
      expect(toSen(value)).toBe(value);
    },
  );

  it.each([
    12.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])("refuses %p, which is not a safe integer", (value) => {
    expect(() => toSen(value)).toThrow(RangeError);
  });
});
