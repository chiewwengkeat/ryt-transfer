import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { focusManager } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { delay, http, HttpResponse } from "msw";

import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import { mswServer, sentRequests } from "@/test/mock-bank/mock-bank";
import { relaunchApp, renderRoute } from "@/test/render/render-route";
import { scenarioTest, walkToTransferReview } from "@/test/render/drive-app";

const notificationHaptics = jest.spyOn(Haptics, "notificationAsync");
const impactHaptics = jest.spyOn(Haptics, "impactAsync");
const selectionHaptics = jest.spyOn(Haptics, "selectionAsync");

beforeEach(() => {
  notificationHaptics.mockClear();
  impactHaptics.mockClear();
  selectionHaptics.mockClear();
});

async function walkToReviewFromHome() {
  await pairPhoneAsTheDemoLaunchDoes();
  const view = await renderRoute("/");
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer", disabled: false }),
  );
  await walkToTransferReview();
  await screen.findByRole("button", { name: "Transfer" });
  return view;
}

async function walkToStillUnreachable() {
  await walkToReviewFromHome();
  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
  await screen.findByRole(
    "header",
    { name: "Checking your transfer" },
    { timeout: 10_000 },
  );
  await act(() => jest.advanceTimersByTimeAsync(17_000));
  await screen.findByRole("header", { name: "Still checking your transfer" });
}

// On a phone a failing read takes a while to fail, and the page renders while it is in flight.
function slowTransferReads() {
  mswServer.use(
    http.get("*/transfers/:transferId", async () => {
      await delay(3_000);
    }),
  );
}

it(
  "gives one success haptic when the result page shows money moved, and none on the way there",
  scenarioTest("transfer.completed", async () => {
    await walkToReviewFromHome();
    expect(notificationHaptics).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
    await screen.findByText(/— money moved\.$/);
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    await screen.findByText("RM 12,745.50");

    expect(notificationHaptics.mock.calls).toEqual([
      [Haptics.NotificationFeedbackType.Success],
    ]);
    expect(impactHaptics).not.toHaveBeenCalled();
    expect(selectionHaptics).not.toHaveBeenCalled();
  }),
);

it(
  "warns while the transfer is processing, then gives success when the bank completes it",
  scenarioTest("transfer.processing", async () => {
    await walkToReviewFromHome();
    await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
    await waitFor(() => {
      expect(notificationHaptics).toHaveBeenCalled();
    });

    // Back a minute later, once the bank has settled it: returning to the app is what rereads the transfer.
    jest.setSystemTime(Date.now() + 60_000);
    await act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await screen.findByText(/— money moved\.$/);

    expect(notificationHaptics.mock.calls).toEqual([
      [Haptics.NotificationFeedbackType.Warning],
      [Haptics.NotificationFeedbackType.Success],
    ]);
  }),
);

it(
  "gives one error haptic when the bank's fraud check stops the transfer, as no money moved",
  scenarioTest("transfer.fraud_blocked", async () => {
    await walkToReviewFromHome();
    await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
    await screen.findByRole("header", { name: "Transfer stopped" });

    expect(notificationHaptics.mock.calls).toEqual([
      [Haptics.NotificationFeedbackType.Error],
    ]);
  }),
);

it(
  "warns again when a processing transfer is refunded, as money that came back is news of its own",
  scenarioTest("transfer.refunded_after_processing", async () => {
    await walkToReviewFromHome();
    await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
    await screen.findByRole("header", { name: "Transfer processing" });

    await act(() => jest.advanceTimersByTimeAsync(32_000));
    await screen.findByRole("header", { name: "Transfer refunded" });

    expect(notificationHaptics.mock.calls).toEqual([
      [Haptics.NotificationFeedbackType.Warning],
      [Haptics.NotificationFeedbackType.Warning],
    ]);
  }),
);

it(
  "warns once when the app reopens on the transfer it was closed during",
  scenarioTest("transfer.app_closed_during_approval", async () => {
    mswServer.use(
      http.post(
        "*/transfers/:transferId/approve",
        () => new Promise<never>(() => undefined),
        { once: true },
      ),
    );
    const view = await walkToReviewFromHome();
    await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
    await waitFor(() => {
      expect(sentRequests.some(({ url }) => url.endsWith("/approve"))).toBe(
        true,
      );
    });

    await relaunchApp(view);
    await screen.findByRole("header", { name: "Checking your last transfer" });

    expect(notificationHaptics.mock.calls).toEqual([
      [Haptics.NotificationFeedbackType.Warning],
    ]);
  }),
);

it(
  "warns once for a processing transfer, and not again when reading it later fails",
  scenarioTest("transfer.processing", async () => {
    await walkToReviewFromHome();
    await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
    await screen.findByRole("header", { name: "Transfer processing" });

    mswServer.use(
      http.get("*/transfers/:transferId", () => HttpResponse.error()),
    );
    await act(() => jest.advanceTimersByTimeAsync(32_000));

    expect(
      screen.getByRole("header", { name: "Transfer processing" }),
    ).toBeOnTheScreen();
    expect(notificationHaptics.mock.calls).toEqual([
      [Haptics.NotificationFeedbackType.Warning],
    ]);
  }),
);

it(
  "warns once while checking, and not again when the bank turns out unreachable, as the money is still not confirmed",
  scenarioTest("transfer.status_unreachable", async () => {
    await walkToStillUnreachable();

    expect(notificationHaptics.mock.calls).toEqual([
      [Haptics.NotificationFeedbackType.Warning],
    ]);
  }),
);

it(
  "warns once for a result whose status cannot be reached, and not again as the page reads it again on its own",
  scenarioTest("transfer.status_unreachable", async () => {
    await walkToStillUnreachable();
    slowTransferReads();

    await act(() => jest.advanceTimersByTimeAsync(16_000));

    expect(
      screen.getByRole("header", { name: "Still checking your transfer" }),
    ).toBeOnTheScreen();
    expect(notificationHaptics.mock.calls).toEqual([
      [Haptics.NotificationFeedbackType.Warning],
    ]);
  }),
);

it(
  "warns once for a result whose status cannot be reached, and not again when returning to the app reads it again",
  scenarioTest("transfer.status_unreachable", async () => {
    await walkToStillUnreachable();
    slowTransferReads();

    await act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await act(() => jest.advanceTimersByTimeAsync(1_000));

    expect(
      screen.getByRole("header", { name: "Still checking your transfer" }),
    ).toBeOnTheScreen();
    expect(notificationHaptics.mock.calls).toEqual([
      [Haptics.NotificationFeedbackType.Warning],
    ]);
  }),
);

it("warns while an approval lost on its way to the bank is checked, then gives an error once its window passes with no money moved", async () => {
  mswServer.use(
    http.post("*/transfers/:transferId/approve", () => HttpResponse.error()),
  );
  await walkToReviewFromHome();
  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
  await screen.findByRole(
    "header",
    { name: "Checking your transfer" },
    { timeout: 10_000 },
  );

  await act(() => jest.advanceTimersByTimeAsync(75_000));
  await screen.findByRole("header", { name: "Transfer not sent" });

  expect(notificationHaptics.mock.calls).toEqual([
    [Haptics.NotificationFeedbackType.Warning],
    [Haptics.NotificationFeedbackType.Error],
  ]);
});
