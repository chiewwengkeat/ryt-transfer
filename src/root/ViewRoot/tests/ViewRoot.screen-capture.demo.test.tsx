import { act, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import "@/test/setup/demo-build";
import { crashTheScreenOfASettledReceipt } from "@/test/render/interrupt-app";
import { isScreenCaptureBlocked } from "@/test/doubles/native-doubles";
import {
  waitPastReceiptSettle,
  pickDemoScenario,
  scenarioTest,
} from "@/test/render/drive-app";
import { renderRoute } from "@/test/render/render-route";

it(
  "blocks capture on Home in a demo build while Screenshots blocked is picked, and allows it on a receipt",
  scenarioTest("transfer.screen_capture_blocked", async () => {
    await renderRoute("/");
    await screen.findByText("RM 12,845.50");
    await waitPastReceiptSettle();
    const blockedOnHome = isScreenCaptureBlocked();

    await act(() => {
      router.push("/transfer/result/transfer-on-screen");
    });

    expect(blockedOnHome).toBe(true);
    await waitFor(() => {
      expect(isScreenCaptureBlocked()).toBe(false);
    });
  }),
);

it("allows capture on Home in a demo build until Screenshots blocked is picked from the Demo menu, blocks it at once, and allows it again once another scenario is picked", async () => {
  await renderRoute("/");
  await screen.findByText("RM 12,845.50");
  const blockedBeforePick = isScreenCaptureBlocked();

  await pickDemoScenario("Screenshots blocked");
  const blockedOnPick = isScreenCaptureBlocked();
  await waitPastReceiptSettle();
  const blockedPastSettle = isScreenCaptureBlocked();
  await pickDemoScenario("Normal, no scenario");

  expect(blockedBeforePick).toBe(false);
  expect(blockedOnPick).toBe(true);
  expect(blockedPastSettle).toBe(true);
  expect(isScreenCaptureBlocked()).toBe(false);
});

it(
  "blocks capture again in a demo build while Screenshots blocked is picked when the screen of a sent transfer's result crashes and its error view replaces it",
  scenarioTest("transfer.screen_capture_blocked", async () => {
    await crashTheScreenOfASettledReceipt(
      "/transfer/result/transfer-on-screen",
      "transfer/result/[transferId]",
    );

    expect(isScreenCaptureBlocked()).toBe(true);
  }),
);

it("leaves capture allowed in a demo build with no scenario picked when the screen of a transfer's details crashes and its error view replaces it", async () => {
  await crashTheScreenOfASettledReceipt(
    "/transfer-history/transfer-on-screen",
    "transfer-history/[transferId]",
  );

  expect(isScreenCaptureBlocked()).toBe(false);
});
