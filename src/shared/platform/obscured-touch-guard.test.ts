import {
  isObscuredTouchGuardOn,
  touchThroughOverlay,
} from "@/test/harness/obscured-touch-guard-double";

import { enableObscuredTouchGuard } from "./obscured-touch-guard";

it("keeps the guard on from the first hold until the last release", () => {
  const releaseFirst = enableObscuredTouchGuard(jest.fn());
  const releaseSecond = enableObscuredTouchGuard(jest.fn());
  const onWhileBothHold = isObscuredTouchGuardOn();
  releaseFirst();
  const onWhileOneHolds = isObscuredTouchGuardOn();
  releaseSecond();

  expect([onWhileBothHold, onWhileOneHolds, isObscuredTouchGuardOn()]).toEqual([
    true,
    true,
    false,
  ]);
});

it("tells every holder about each touch the guard drops", () => {
  const heardByFirst = jest.fn();
  const heardBySecond = jest.fn();
  const releaseFirst = enableObscuredTouchGuard(heardByFirst);
  const releaseSecond = enableObscuredTouchGuard(heardBySecond);

  touchThroughOverlay();
  touchThroughOverlay();
  releaseFirst();
  releaseSecond();

  expect(heardByFirst).toHaveBeenCalledTimes(2);
  expect(heardBySecond).toHaveBeenCalledTimes(2);
});

it("stops telling a holder once it releases the guard", () => {
  const heardByReleased = jest.fn();
  const heardByRemaining = jest.fn();
  const releaseFirst = enableObscuredTouchGuard(heardByReleased);
  const releaseSecond = enableObscuredTouchGuard(heardByRemaining);

  releaseFirst();
  touchThroughOverlay();
  releaseSecond();

  expect(heardByReleased).not.toHaveBeenCalled();
  expect(heardByRemaining).toHaveBeenCalledTimes(1);
});

it("ignores a hold's second release", () => {
  const releaseTwice = enableObscuredTouchGuard(jest.fn());
  const releaseOther = enableObscuredTouchGuard(jest.fn());

  releaseTwice();
  releaseTwice();
  const onWhileOtherHolds = isObscuredTouchGuardOn();
  releaseOther();

  expect(onWhileOtherHolds).toBe(true);
});
