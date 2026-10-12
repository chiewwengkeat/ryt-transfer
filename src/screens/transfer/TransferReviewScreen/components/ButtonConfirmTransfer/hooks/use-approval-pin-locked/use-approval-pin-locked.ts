import {
  isApprovalPinLocked,
  subscribeToApprovalPinLock,
} from "@/domains/approval/lib/approval-pin-lock/approval-pin-lock";
import { useEffect, useRef, useState } from "react";

export function useApprovalPinLocked() {
  // Unknown, not unlocked, until the first read answers: a guess could create a transfer only a PIN could approve.
  const [isPinLocked, setIsPinLocked] = useState<boolean>();
  const pinLockedNowRef = useRef<boolean>(undefined);
  useEffect(() => {
    let isMountReadOutdated = false;
    const unsubscribe = subscribeToApprovalPinLock((isLocked) => {
      isMountReadOutdated = true;
      pinLockedNowRef.current = isLocked;
      setIsPinLocked(isLocked);
    });
    isApprovalPinLocked().then((isLockedAtMount) => {
      if (isMountReadOutdated) return;
      pinLockedNowRef.current = isLockedAtMount;
      setIsPinLocked(isLockedAtMount);
    });
    return () => {
      isMountReadOutdated = true;
      unsubscribe();
    };
  }, []);
  return {
    pinLocked: isPinLocked,
    isPinLockedNow: () => pinLockedNowRef.current,
  };
}
