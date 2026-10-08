import { reportError } from "@/shared/observability/observability";
import {
  deleteSecureRecord,
  readSecureRecord,
  writeSecureRecord,
} from "@/shared/platform/secure-storage";

// Beside the phone's key ids, so whatever wipes the module's records takes the lock with them.
const PIN_LOCKED_RECORD = { namespace: "approval", name: "pin-locked" };

export async function rememberApprovalPinLocked() {
  await writeSecureRecord(PIN_LOCKED_RECORD, "locked").catch(
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
  await deleteSecureRecord(PIN_LOCKED_RECORD).catch((error: unknown) => {
    reportError(error, { boundary: "approval_pin_lock" });
  });
}
