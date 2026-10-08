import { useEffect, useRef, useState } from "react";

import {
  isApprovalPinLocked,
  subscribeToApprovalPinLock,
} from "@/domains/approval/hooks/approval-pin-lock";

export function useApprovalPinLocked() {
  // Unknown, not unlocked, until the first read answers: a press before then must not take the PIN path on a guess.
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
