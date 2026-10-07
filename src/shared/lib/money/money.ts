import type { Money, Sen, WireMoney } from "./money.type";

/** Brands a number already in sen, throwing unless a safe integer. It never converts ringgit. */
export function toSen(value: number): Sen {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Sen must be a safe integer, not ${value}`);
  }
  return value as Sen;
}

export function parseWireAmount(wire: WireMoney): Money | null {
  // The type is only the contract: a row missing its amount must not throw and blank its page.
  if (!Number.isSafeInteger(wire?.minor) || wire.currency !== "MYR") {
    return null;
  }
  return { minor: toSen(wire.minor), currency: "MYR" };
}

// Not Intl.NumberFormat: Hermes hands it to the platform, whose output varies across Android versions.
export function formatMoney(
  money: Money,
  { signDisplay = "auto" }: { signDisplay?: "auto" | "exceptZero" } = {},
) {
  const digits = String(Math.abs(money.minor)).padStart(3, "0");
  const ringgit = digits.slice(0, -2).replace(/\B(?=(\d{3})+$)/g, ",");
  const sign =
    money.minor < 0
      ? "-"
      : money.minor > 0 && signDisplay === "exceptZero"
        ? "+"
        : "";
  return `${sign}RM ${ringgit}.${digits.slice(-2)}`;
}

export function parseTypedAmount(text: string): Money | null {
  // A typed "," is thousands grouping, never a decimal mark.
  const match = /^(\d*)(?:\.(\d{0,2}))?$/.exec(text.replace(/,/g, ""));
  if (!match) return null;
  const [, ringgit = "", sen = ""] = match;
  const minor = Number(ringgit + sen.padEnd(2, "0"));
  if (ringgit + sen === "" || !Number.isSafeInteger(minor)) return null;
  return { minor: toSen(minor), currency: "MYR" };
}
