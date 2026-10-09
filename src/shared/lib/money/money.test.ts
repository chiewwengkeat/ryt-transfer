import { formatMoney, parseTypedAmount, parseWireAmount, asSen } from "./money";
import type { WireMoney } from "./money";

describe("asSen", () => {
  it.each([0, 1, -500, 123450, Number.MAX_SAFE_INTEGER])(
    "keeps the safe integer %p as it is",
    (value) => {
      expect(asSen(value)).toBe(value);
    },
  );

  it.each([
    12.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])("refuses %p, which is not a safe integer", (value) => {
    expect(() => asSen(value)).toThrow(RangeError);
  });
});

describe("parseWireAmount", () => {
  it("reads a whole number of sen in ringgit", () => {
    expect(parseWireAmount({ minor: 123450, currency: "MYR" })).toEqual({
      minor: 123450,
      currency: "MYR",
    });
  });

  it.each<unknown>([
    undefined,
    null,
    {},
    { minor: "5000", currency: "MYR" },
    { minor: 12.5, currency: "MYR" },
    { minor: Number.MAX_SAFE_INTEGER + 1, currency: "MYR" },
    { minor: 5000, currency: "USD" },
  ])("returns null for %p instead of throwing", (wire) => {
    expect(parseWireAmount(wire as WireMoney)).toBeNull();
  });
});

describe("formatMoney", () => {
  it.each([
    [123450, "RM 1,234.50"],
    [0, "RM 0.00"],
    [5, "RM 0.05"],
    [100000000, "RM 1,000,000.00"],
    [-123450, "-RM 1,234.50"],
    [Number.MAX_SAFE_INTEGER, "RM 90,071,992,547,409.91"],
  ])("shows %p sen as %p", (minor, text) => {
    expect(formatMoney({ minor: asSen(minor), currency: "MYR" })).toBe(text);
  });

  it.each([
    [-123450, "-RM 1,234.50"],
    [123450, "+RM 1,234.50"],
    [0, "RM 0.00"],
  ])("signs %p sen as %p when zero alone goes unsigned", (minor, text) => {
    expect(
      formatMoney(
        { minor: asSen(minor), currency: "MYR" },
        { signDisplay: "exceptZero" },
      ),
    ).toBe(text);
  });
});

describe("parseTypedAmount", () => {
  it.each([
    ["1234", 123400],
    ["1,234.50", 123450],
    ["0.5", 50],
    [".5", 50],
    ["12.", 1200],
    ["0", 0],
    ["90071992547409.91", Number.MAX_SAFE_INTEGER],
  ])("reads %p as %p sen", (text, minor) => {
    expect(parseTypedAmount(text)).toEqual({ minor, currency: "MYR" });
  });

  it("reads a typed comma as thousands grouping, so 12,34 is RM 1,234.00", () => {
    expect(parseTypedAmount("12,34")).toEqual({
      minor: 123400,
      currency: "MYR",
    });
  });

  it.each([
    "",
    ".",
    "1.234",
    "1.2.3",
    "-5",
    "1e3",
    " 12",
    "RM 12",
    "90071992547409.92",
  ])("refuses %p", (text) => {
    expect(parseTypedAmount(text)).toBeNull();
  });
});
