import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import {
  appSwitcherBlurIntensity,
  isScreenCaptureBlocked,
} from "@/test/harness/native-doubles";
import { renderRoute } from "@/test/render-route";

it("blocks capture on Home, lifts it on a receipt only once the screen before it has gone, and blocks it again on leaving", async () => {
  await renderRoute("/");
  await screen.findByText("RM 12,845.50");
  const blockedOnHome = isScreenCaptureBlocked();

  await act(() => {
    router.push("/transfer/result/transfer-on-screen");
  });
  const blockedWhileHomeLeaves = isScreenCaptureBlocked();
  await waitFor(() => {
    expect(isScreenCaptureBlocked()).toBe(false);
  });
  await act(() => {
    router.back();
  });

  expect(blockedOnHome).toBe(true);
  expect(blockedWhileHomeLeaves).toBe(true);
  expect(isScreenCaptureBlocked()).toBe(true);
});

it("keeps capture blocked from the recipient step to review, and allows it on the result page of a sent transfer", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/transfer");
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    "012-345 6789",
  );
  const blockedOnRecipient = isScreenCaptureBlocked();
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await fireEvent.changeText(
    await screen.findByLabelText("Amount (RM)"),
    "100",
  );
  const blockedOnAmount = isScreenCaptureBlocked();
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  const transfer = await screen.findByRole("button", { name: "Transfer" });
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

it("blurs the app in the iPhone's app switcher from launch, at the default strength", () => {
  expect(appSwitcherBlurIntensity()).toBe(0.5);
});
