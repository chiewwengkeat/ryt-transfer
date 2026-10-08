import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import "@/test/demo-build";
import { ButtonCrashScreen } from "@/test/harness/crash-on-press";
import { isScreenCaptureBlocked } from "@/test/harness/native-doubles";
import { waitPastReceiptSettle } from "@/test/harness/receipt-settle";
import { renderRoute } from "@/test/render-route";
import { scenarioTest } from "@/test/scenario-test";

async function pickDemoScenario(title: string) {
  await fireEvent.press(screen.getByRole("button", { name: "Demo menu" }));
  await fireEvent.press(screen.getByRole("radio", { name: title }));
}

async function crashTheAppOnASettledReceipt() {
  await renderRoute("/transfer-history/transfer-on-screen", {
    appDir: "src/app",
    overrides: { "transfer-history/[transferId]": ButtonCrashScreen },
  });
  await waitFor(() => {
    expect(isScreenCaptureBlocked()).toBe(false);
  });
  await fireEvent.press(
    screen.getByRole("button", { name: "Crash the screen" }),
  );
  await screen.findByText("The app stopped working.");
  await waitPastReceiptSettle();
}

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
  "blocks capture again in a demo build while Screenshots blocked is picked when a crash replaces the app on a receipt",
  scenarioTest("transfer.screen_capture_blocked", async () => {
    await crashTheAppOnASettledReceipt();

    expect(isScreenCaptureBlocked()).toBe(true);
  }),
);

it("leaves capture allowed in a demo build with no scenario picked when a crash replaces the app on a receipt", async () => {
  await crashTheAppOnASettledReceipt();

  expect(isScreenCaptureBlocked()).toBe(false);
});
