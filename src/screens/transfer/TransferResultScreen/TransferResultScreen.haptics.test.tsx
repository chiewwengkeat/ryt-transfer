import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { focusManager } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { http, HttpResponse } from "msw";

import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { mswServer, sentRequests } from "@/test/msw-server";
import { renderRoute } from "@/test/render-route";
import { scenarioTest } from "@/test/scenario-test";

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
  await renderRoute("/");
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    "012-345 6789",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("RM 12,845.50");
  await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  await screen.findByRole("button", { name: "Transfer" });
}

function transferReadsSent() {
  return sentRequests.filter(
    ({ method, url }) =>
      method === "GET" && /^\/transfers\/[^/]+$/.test(new URL(url).pathname),
  ).length;
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
  "warns once when a processing transfer's status then cannot be reached",
  scenarioTest("transfer.processing", async () => {
    await walkToReviewFromHome();
    await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
    await waitFor(() => {
      expect(notificationHaptics).toHaveBeenCalled();
    });

    mswServer.use(
      http.get("*/transfers/:transferId", () => HttpResponse.error()),
    );
    await act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await screen.findByRole("button", { name: "Load the result again" });

    expect(notificationHaptics.mock.calls).toEqual([
      [Haptics.NotificationFeedbackType.Warning],
    ]);
  }),
);

it(
  "warns once for a result whose status cannot be reached, and not again when loading it again fails",
  scenarioTest("transfer.status_unreachable", async () => {
    await walkToReviewFromHome();
    await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
    const loadAgain = await screen.findByRole("button", {
      name: "Load the result again",
    });
    const readsBeforeLoadingAgain = transferReadsSent();

    await fireEvent.press(loadAgain);
    // One read and its two retries: only then has loading it again failed.
    await waitFor(() => {
      expect(transferReadsSent()).toBe(readsBeforeLoadingAgain + 3);
    });
    await screen.findByRole("button", { name: "Load the result again" });

    expect(notificationHaptics.mock.calls).toEqual([
      [Haptics.NotificationFeedbackType.Warning],
    ]);
  }),
);

it(
  "warns once for a result whose status cannot be reached, and not again when returning to the app fails to load it",
  scenarioTest("transfer.status_unreachable", async () => {
    await walkToReviewFromHome();
    await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
    await screen.findByRole("button", { name: "Load the result again" });
    const readsBeforeReturning = transferReadsSent();

    await act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() => {
      expect(transferReadsSent()).toBe(readsBeforeReturning + 3);
    });
    await screen.findByRole("button", { name: "Load the result again" });

    expect(notificationHaptics.mock.calls).toEqual([
      [Haptics.NotificationFeedbackType.Warning],
    ]);
  }),
);
