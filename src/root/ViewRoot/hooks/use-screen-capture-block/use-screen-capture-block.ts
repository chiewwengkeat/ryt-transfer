import { usePathname, useSegments } from "expo-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";

import { demoLayer } from "@/root/app-launch/app-launch";
import { isProductionBuild } from "@/shared/config/config";
import {
  allowScreenCapture,
  blockScreenCapture,
  useScreenErrorShowing,
} from "@/shared/platform/screen-capture/screen-capture";

export function useScreenCaptureBlock(
  captureBlockScenarioId: Parameters<
    NonNullable<typeof demoLayer>["subscribeToPhoneSidePick"]
  >[0],
) {
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
      demoLayer?.subscribeToPhoneSidePick(captureBlockScenarioId, (picked) => {
        captureBlockPickedRef.current = picked;
        setCaptureBlockPicked(picked);
      }),
    [captureBlockScenarioId],
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

  // A route's own error view keeps its route mounted, so it would otherwise pass for the receipt it replaced.
  const screenErrorShowing = useScreenErrorShowing();
  const receiptOnScreen =
    onReceiptRoute &&
    settledReceiptPathname === pathname &&
    !screenErrorShowing;
  const blocked = (isProductionBuild || captureBlockPicked) && !receiptOnScreen;
  // Before paint, so a receipt being left hands over to a screen that is drawn blocked.
  useLayoutEffect(() => {
    void (blocked ? blockScreenCapture() : allowScreenCapture());
    if (!blocked || Platform.OS !== "android") return;
    // A font-size change or reopen from Back recreates Android's activity on an unblocked window; blocked stays put,
    // so block again on active. Not iOS: it keeps its window, and each block adds a recording observer until allowed.
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void blockScreenCapture();
    });
    return () => {
      subscription.remove();
    };
  }, [blocked]);
}

const RECEIPT_ROUTES = new Set([
  "/transfer/result/[transferId]",
  "/transfer-history/[transferId]",
]);
// Outlasts a screen transition, whose end only the screen itself is told of: until then the screen being left shows.
const RECEIPT_SETTLE_MS = 600;
