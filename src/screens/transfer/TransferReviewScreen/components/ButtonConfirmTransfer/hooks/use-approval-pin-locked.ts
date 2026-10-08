import { useEffect, useRef, useState } from "react";

import {
  isApprovalPinLocked,
  subscribeToApprovalPinLock,
} from "@/domains/approval/hooks/approval-pin-lock";

export function useApprovalPinLocked() {
  const [pinLocked, setPinLocked] = useState(false);
  const pinLockedNowRef = useRef(false);
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
