import type { Sen } from "./money.type";

export function toSen(value: number): Sen {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Sen must be a safe integer, not ${value}`);
  }
  return value as Sen;
}
