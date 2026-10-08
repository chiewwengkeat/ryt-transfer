import { useEffect, useState } from "react";

import { reportError } from "@/shared/observability/observability";
import {
  deleteSecureRecord,
  readSecureRecord,
  writeSecureRecord,
} from "@/shared/platform/secure-storage";

// Beside the phone's key ids, so whatever wipes the module's records takes the lock with them.
const PIN_LOCKED_RECORD = { namespace: "approval", name: "pin-locked" };

// Told only once the record has changed, so a mounted reader agrees with what the approve path reads.
const pinLockListeners = new Set<(pinLocked: boolean) => void>();

export async function rememberApprovalPinLocked() {
  await writeSecureRecord(PIN_LOCKED_RECORD, "locked").then(
    () => {
      pinLockListeners.forEach((hearPinLock) => hearPinLock(true));
    },
    (error: unknown) => {
      reportError(error, { boundary: "approval_pin_lock" });
    },
  );
}

// Unreadable reads as unlocked: the bank still refuses a locked PIN, and a false lock would shut the PIN path.
export async function isApprovalPinLocked() {
  const lockedRecord = await readSecureRecord(PIN_LOCKED_RECORD).catch(
    () => null,
  );
  return lockedRecord !== null;
}

export async function forgetApprovalPinLock() {
  await deleteSecureRecord(PIN_LOCKED_RECORD).then(
    () => {
      pinLockListeners.forEach((hearPinLock) => hearPinLock(false));
    },
    (error: unknown) => {
      reportError(error, { boundary: "approval_pin_lock" });
    },
  );
}

export function useApprovalPinLocked() {
  const [pinLocked, setPinLocked] = useState(false);
  useEffect(() => {
    let mountReadOutdated = false;
    const hearPinLock = (pinLockedNow: boolean) => {
      mountReadOutdated = true;
      setPinLocked(pinLockedNow);
    };
    pinLockListeners.add(hearPinLock);
    void isApprovalPinLocked().then((pinLockedAtMount) => {
      if (!mountReadOutdated) setPinLocked(pinLockedAtMount);
    });
    return () => {
      mountReadOutdated = true;
      pinLockListeners.delete(hearPinLock);
    };
  }, []);
  return pinLocked;
}
