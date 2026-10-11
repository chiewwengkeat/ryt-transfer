import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { Platform } from "react-native";

import {
  isScreenCaptureBlocked,
  screenCaptureNativeDouble,
} from "@/test/doubles/native-doubles";
import {
  buildHistoryTransfer,
  serveTransferDetails,
  serveTransferHistoryPages,
} from "@/test/fixtures/transfer-responses";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import { moveAppTo, waitPastReceiptSettle } from "@/test/render/drive-app";
import {
  ButtonCrashScreen,
  crashTheScreenOfASettledReceipt,
} from "@/test/render/interrupt-app";
import { renderRoute } from "@/test/render/render-route";

it("blocks capture on Home, lifts it on a receipt only once the screen before it has gone, and blocks it again on leaving", async () => {
  await renderRoute("/");
  await screen.findByText("RM 12,845.50");
  await waitPastReceiptSettle();
  const blockedOnHome = isScreenCaptureBlocked();

  await act(() => {
    router.push("/transfer/result/transfer-on-screen");
  });
  // Just short of the settle. Jest cannot time the native push beneath it: that the settle outlasts it is a device check.
  await act(() => {
    jest.advanceTimersByTime(599);
  });
  const blockedJustBeforeReceiptSettles = isScreenCaptureBlocked();
  await waitFor(() => {
    expect(isScreenCaptureBlocked()).toBe(false);
  });
  await act(() => {
    router.back();
  });
  const blockedOnLeaving = isScreenCaptureBlocked();
  await waitPastReceiptSettle();

  expect(blockedOnHome).toBe(true);
  expect(blockedJustBeforeReceiptSettles).toBe(true);
  expect(blockedOnLeaving).toBe(true);
  expect(isScreenCaptureBlocked()).toBe(true);
});

it("blocks capture on the new window Android gives Home after a font-size change, once the app is active again", async () => {
  const platformOs = jest.replaceProperty(Platform, "OS", "android");
  try {
    await renderRoute("/");
    await screen.findByText("RM 12,845.50");
    await waitPastReceiptSettle();
    // The recreated activity's window starts unblocked, while the library still holds its key.
    void screenCaptureNativeDouble.allowScreenCapture();
    const blockedOnTheNewWindow = isScreenCaptureBlocked();

    await act(() => {
      moveAppTo("background");
      moveAppTo("active");
    });

    expect(blockedOnTheNewWindow).toBe(false);
    expect(isScreenCaptureBlocked()).toBe(true);
  } finally {
    platformOs.restore();
  }
});

it("tells iOS nothing more when the app becomes active, since iOS keeps its window and each block there adds a recording observer", async () => {
  await renderRoute("/");
  await screen.findByText("RM 12,845.50");
  await waitPastReceiptSettle();
  const blocksSent = jest.spyOn(
    screenCaptureNativeDouble,
    "preventScreenCapture",
  );

  await act(() => {
    moveAppTo("background");
    moveAppTo("active");
  });

  expect(isScreenCaptureBlocked()).toBe(true);
  expect(blocksSent).not.toHaveBeenCalled();
});

it("blocks capture on the new window Android gives Home when it is reopened after Back", async () => {
  const platformOs = jest.replaceProperty(Platform, "OS", "android");
  try {
    const view = await renderRoute("/");
    await screen.findByText("RM 12,845.50");
    await waitPastReceiptSettle();

    // Back ends the activity, not the process: the root mounts again on a window that starts unblocked, while the
    // library still holds its key.
    await view.unmount();
    void screenCaptureNativeDouble.allowScreenCapture();
    const blockedOnTheNewWindow = isScreenCaptureBlocked();
    await renderRoute("/");
    await screen.findByText("RM 12,845.50");

    expect(blockedOnTheNewWindow).toBe(false);
    expect(isScreenCaptureBlocked()).toBe(true);
  } finally {
    platformOs.restore();
  }
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
  await screen.findByText("RM 12,845.50");
  await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
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

it("keeps capture blocked on review while the PIN sheet is open over it", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/transfer");
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    "012-345 6789",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("RM 12,845.50");
  await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));

  await fireEvent.press(
    await screen.findByRole("button", { name: "Use PIN instead" }),
  );
  await screen.findByText("Enter your bank PIN to approve this transfer.");
  await waitPastReceiptSettle();

  expect(isScreenCaptureBlocked()).toBe(true);
});

it("keeps capture blocked on the History list, and allows it on a transfer's details, a receipt, once the list has gone", async () => {
  const listed = buildHistoryTransfer();
  serveTransferHistoryPages([[listed]]);
  serveTransferDetails(listed);
  const view = await renderRoute("/transfer-history");
  const row = await screen.findByRole("button", { name: /^Aisyah Rahman/ });
  await waitPastReceiptSettle();
  const blockedOnHistory = isScreenCaptureBlocked();

  await fireEvent.press(row);

  expect(view.getPathname()).toBe(`/transfer-history/${listed.transferId}`);
  expect(blockedOnHistory).toBe(true);
  await waitFor(() => {
    expect(isScreenCaptureBlocked()).toBe(false);
  });
});

it("keeps capture blocked when a crash replaces the app on a screen that is no receipt", async () => {
  await renderRoute("/", {
    appDir: "src/app",
    overrides: { index: ButtonCrashScreen },
  });

  await fireEvent.press(
    screen.getByRole("button", { name: "Crash the screen" }),
  );
  await screen.findByText("The app stopped working.");
  await waitPastReceiptSettle();

  expect(isScreenCaptureBlocked()).toBe(true);
});

it.each([
  {
    receipt: "a transfer's details",
    pathname: "/transfer-history/transfer-on-screen",
    routeFile: "transfer-history/[transferId]",
  },
  {
    receipt: "the result of a sent transfer",
    pathname: "/transfer/result/transfer-on-screen",
    routeFile: "transfer/result/[transferId]",
  },
])(
  "blocks capture again when the screen of $receipt crashes and its error view replaces it",
  async ({ pathname, routeFile }) => {
    await crashTheScreenOfASettledReceipt(pathname, routeFile);

    expect(isScreenCaptureBlocked()).toBe(true);
  },
);
