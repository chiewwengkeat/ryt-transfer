let guardOn = false;
const dropListeners = new Set<() => void>();

// State lives in this file, not on the object: jest-expo copies the object's keys onto a new module on every require.
export const obscuredTouchGuardNativeDouble = {
  enable: () => {
    guardOn = true;
  },
  disable: () => {
    guardOn = false;
  },
  addListener: (eventName: string, listener: () => void) => {
    if (eventName === "onObscuredTouchDropped") dropListeners.add(listener);
    return {
      remove: () => {
        dropListeners.delete(listener);
      },
    };
  },
};

// A tap through another app's window drawn over this one: dropped and reported only while the guard is on.
export function touchThroughOverlay() {
  if (!guardOn) return;
  for (const listener of dropListeners) listener();
}

export function isObscuredTouchGuardOn() {
  return guardOn;
}

// Listeners stay: each holder removes its own on release.
export function resetObscuredTouchGuardDouble() {
  guardOn = false;
}
