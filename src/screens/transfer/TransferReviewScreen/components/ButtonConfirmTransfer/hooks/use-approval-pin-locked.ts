import { useEffect, useState } from "react";

import {
  isApprovalPinLocked,
  subscribeToApprovalPinLock,
} from "@/domains/approval/hooks/approval-pin-lock";

export function useApprovalPinLocked() {
  const [pinLocked, setPinLocked] = useState(false);
  useEffect(() => {
    let mountReadOutdated = false;
    const unsubscribe = subscribeToApprovalPinLock((pinLockedNow) => {
      mountReadOutdated = true;
      setPinLocked(pinLockedNow);
    });
    void isApprovalPinLocked().then((pinLockedAtMount) => {
      if (!mountReadOutdated) setPinLocked(pinLockedAtMount);
    });
    return () => {
      mountReadOutdated = true;
      unsubscribe();
    };
  }, []);
  return pinLocked;
}
