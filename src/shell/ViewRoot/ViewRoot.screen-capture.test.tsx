import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text } from "react-native";

import { motionDurations } from "@/shared/lib/motion/motion";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { isScreenCaptureBlocked } from "@/test/harness/native-doubles";
import { waitPastReceiptSettle } from "@/test/harness/receipt-settle";
import { renderRoute } from "@/test/render-route";

function ScreenCrashingOnPress() {
  const [crashed, setCrashed] = useState(false);
  // Only on a press: a crash in the first render replaces the app before its guard has run.
  if (crashed) throw new Error("render failed");
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        setCrashed(true);
      }}
    >
      <Text>Crash the screen</Text>
    </Pressable>
  );
}

it("blocks capture on Home, lifts it on a receipt only once the screen before it has gone, and blocks it again on leaving", async () => {
  await renderRoute("/");
  await screen.findByText("RM 12,845.50");
  await waitPastReceiptSettle();
  const blockedOnHome = isScreenCaptureBlocked();

  await act(() => {
    router.push("/transfer/result/transfer-on-screen");
  });
  await act(() => {
    jest.advanceTimersByTime(motionDurations.screenTransition);
  });
  const blockedWhileHomeLeaves = isScreenCaptureBlocked();
  await waitFor(() => {
    expect(isScreenCaptureBlocked()).toBe(false);
  });
  await act(() => {
    router.back();
  });
  const blockedOnLeaving = isScreenCaptureBlocked();
  await waitPastReceiptSettle();

  expect(blockedOnHome).toBe(true);
  expect(blockedWhileHomeLeaves).toBe(true);
  expect(blockedOnLeaving).toBe(true);
  expect(isScreenCaptureBlocked()).toBe(true);
});

it("keeps capture blocked from the recipient step to review, and allows it on the result page of a sent transfer", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/transfer");
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    "012-345 6789",
  );
  await waitPastReceiptSettle();
  const blockedOnRecipient = isScreenCaptureBlocked();
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await fireEvent.changeText(
    await screen.findByLabelText("Amount (RM)"),
    "100",
  );
  await waitPastReceiptSettle();
  const blockedOnAmount = isScreenCaptureBlocked();
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  const transfer = await screen.findByRole("button", { name: "Transfer" });
  await waitPastReceiptSettle();
  const blockedOnReview = isScreenCaptureBlocked();

  await fireEvent.press(transfer);
  await screen.findByText("Transfer sent");

  expect([blockedOnRecipient, blockedOnAmount, blockedOnReview]).toEqual([
    true,
    true,
    true,
  ]);
  await waitFor(() => {
    expect(isScreenCaptureBlocked()).toBe(false);
  });
});

it("keeps capture blocked when a crash replaces the app on a screen that is no receipt", async () => {
  await renderRoute("/", {
    appDir: "src/app",
    overrides: { index: ScreenCrashingOnPress },
  });

  await fireEvent.press(
    screen.getByRole("button", { name: "Crash the screen" }),
  );
  await screen.findByText("The app stopped working.");
  await waitPastReceiptSettle();

  expect(isScreenCaptureBlocked()).toBe(true);
});

it("blocks capture again when a crash replaces the app on a receipt", async () => {
  await renderRoute("/transfer-history/transfer-on-screen", {
    appDir: "src/app",
    overrides: { "transfer-history/[transferId]": ScreenCrashingOnPress },
  });
  await waitFor(() => {
    expect(isScreenCaptureBlocked()).toBe(false);
  });

  await fireEvent.press(
    screen.getByRole("button", { name: "Crash the screen" }),
  );
  await screen.findByText("The app stopped working.");
  await waitPastReceiptSettle();

  expect(isScreenCaptureBlocked()).toBe(true);
});
