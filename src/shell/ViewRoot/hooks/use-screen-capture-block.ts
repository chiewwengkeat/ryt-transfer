import { usePathname, useSegments } from "expo-router";
import { useEffect, useLayoutEffect, useState } from "react";

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
  const route = `/${useSegments().join("/")}`;
  const pathname = usePathname();
  const onReceiptRoute = RECEIPT_ROUTES.has(route);
  const [settledReceiptPathname, setSettledReceiptPathname] = useState<
    string | null
  >(null);
  useEffect(() => {
    if (!onReceiptRoute) return;
    const settle = setTimeout(() => {
      setSettledReceiptPathname(pathname);
    }, RECEIPT_SETTLE_MS);
    return () => {
      clearTimeout(settle);
      setSettledReceiptPathname(null);
    };
  }, [onReceiptRoute, pathname]);
  const [captureBlockPicked, setCaptureBlockPicked] = useState(false);
  // Before paint, so a pick saved before a restart blocks the first frame.
  useLayoutEffect(
    () => demoLayer?.subscribeToScreenCaptureBlock(setCaptureBlockPicked),
    [],
  );

  // The crash screen that replaces this root is no receipt, so in production it is blocked even when a receipt crashed.
  useLayoutEffect(
    () => () => {
      if (isProductionBuild) void blockScreenCapture();
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
