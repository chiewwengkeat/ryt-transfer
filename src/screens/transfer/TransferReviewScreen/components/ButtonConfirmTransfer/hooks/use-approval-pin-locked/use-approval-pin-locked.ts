import { useEffect, useRef, useState } from "react";

import {
  isApprovalPinLocked,
  subscribeToApprovalPinLock,
} from "@/domains/approval/lib/approval-pin-lock/approval-pin-lock";

export function useApprovalPinLocked() {
  // Unknown, not unlocked, until the first read answers: a guess could create a transfer only a PIN could approve.
  const [pinLocked, setPinLocked] = useState<boolean>();
  const pinLockedNowRef = useRef<boolean>(undefined);
  useEffect(() => {
    let mountReadOutdated = false;
    const unsubscribe = subscribeToApprovalPinLock((pinLockedNow) => {
      mountReadOutdated = true;
      pinLockedNowRef.current = pinLockedNow;
      setPinLocked(pinLockedNow);
    });
    void isApprovalPinLocked().then((pinLockedAtMount) => {
      if (mountReadOutdated) return;
      pinLockedNowRef.current = pinLockedAtMount;
      setPinLocked(pinLockedAtMount);
    });
    return () => {
      mountReadOutdated = true;
      unsubscribe();
    };
  }, []);
  return { pinLocked, isPinLockedNow: () => pinLockedNowRef.current };
}
