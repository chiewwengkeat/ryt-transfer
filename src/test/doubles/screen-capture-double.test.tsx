import { act, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import { renderRoute } from "@/test/render/render-route";

import { isScreenCaptureBlocked } from "./native-doubles";
import { waitPastReceiptSettle } from "@/test/render/receipt-settle";

// ⛔ Keep these two alone in this file, in this order: the first sees the app's own launch, the second
// what the first leaves behind.
it("starts the first test blocked by the app's launch, and ends it on a receipt with capture allowed", async () => {
  const blockedAtLaunch = isScreenCaptureBlocked();
  await renderRoute("/");
  await act(() => {
    router.push("/transfer/result/transfer-on-screen");
  });

  expect(blockedAtLaunch).toBe(true);
  await waitFor(() => {
    expect(isScreenCaptureBlocked()).toBe(false);
  });
});

it("starts the next test blocked too, as a production launch does, and keeps Home blocked", async () => {
  const blockedAtLaunch = isScreenCaptureBlocked();
  await renderRoute("/");
  await screen.findByText("RM 12,845.50");
  await waitPastReceiptSettle();

  expect(blockedAtLaunch).toBe(true);
  expect(isScreenCaptureBlocked()).toBe(true);
});
