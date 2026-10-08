import { usePathname, useSegments } from "expo-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { isProductionBuild } from "@/shared/config/config";
import {
  allowScreenCapture,
  blockScreenCapture,
} from "@/shared/platform/screen-capture";
import { demoLayer } from "@/shell/app-launch";

const RECEIPT_ROUTES = new Set([
  "/transfer/result/[transferId]",
  "/transfer-history/[transferId]",
]);
// Outlasts a screen transition, whose end only the screen itself is told of: until then the screen being left shows.
const RECEIPT_SETTLE_MS = 600;

export function useScreenCaptureBlock() {
  const routePattern = `/${useSegments().join("/")}`;
  const pathname = usePathname();
  const onReceiptRoute = RECEIPT_ROUTES.has(routePattern);
  const [settledReceiptPathname, setSettledReceiptPathname] = useState<
    string | null
  >(null);
  useEffect(() => {
    if (!onReceiptRoute) return;
    const settleTimer = setTimeout(() => {
      setSettledReceiptPathname(pathname);
    }, RECEIPT_SETTLE_MS);
    return () => {
      clearTimeout(settleTimer);
      setSettledReceiptPathname(null);
    };
  }, [onReceiptRoute, pathname]);
  const [captureBlockPicked, setCaptureBlockPicked] = useState(false);
  const captureBlockPickedRef = useRef(false);
  // Before paint, so a pick saved before a restart blocks the first frame.
  useLayoutEffect(
    () =>
      demoLayer?.subscribeToScreenCaptureBlock((picked) => {
        captureBlockPickedRef.current = picked;
        setCaptureBlockPicked(picked);
      }),
    [],
  );

  // The crash screen that replaces this root is no receipt, so it is blocked wherever other screens are, even when a
  // receipt crashed. The pick is read through a ref: as a dependency, unpicking it on a receipt would block the receipt.
  useLayoutEffect(
    () => () => {
      if (isProductionBuild || captureBlockPickedRef.current)
        void blockScreenCapture();
    },
    [],
  );

  const receiptOnScreen = onReceiptRoute && settledReceiptPathname === pathname;
  const blocked = (isProductionBuild || captureBlockPicked) && !receiptOnScreen;
  // Before paint, so a receipt being left hands over to a screen that is drawn blocked.
  useLayoutEffect(() => {
    void (blocked ? blockScreenCapture() : allowScreenCapture());
  }, [blocked]);
}
