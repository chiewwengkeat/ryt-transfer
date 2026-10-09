import { requireNativeModule } from "expo";

export function enableObscuredTouchGuard(onTouchDropped: () => void) {
  // Required per hold, not at import, so a file importing this one loads before any native module or Jest double exists.
  const guardModule = requireNativeModule<{
    enable(): void;
    disable(): void;
    addListener(
      eventName: "onObscuredTouchDropped",
      listener: () => void,
    ): { remove(): void };
  }>("ObscuredTouchGuard");
  const dropListener = guardModule.addListener(
    "onObscuredTouchDropped",
    onTouchDropped,
  );
  guardHoldCount += 1;
  if (guardHoldCount === 1) guardModule.enable();

  let holdReleased = false;
  return () => {
    if (holdReleased) return;
    holdReleased = true;
    dropListener.remove();
    guardHoldCount -= 1;
    if (guardHoldCount === 0) guardModule.disable();
  };
}

let guardHoldCount = 0;
