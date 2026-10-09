import { act, fireEvent, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import {
  finishOpeningScreen,
  pressHardwareBack,
  walkToTransferReview,
} from "@/test/render/drive-app";
import { relaunchApp, renderRoute } from "@/test/render/render-route";

const SENT_NOTICE =
  /^Your transfer of RM 100\.00 to .+ was sent — money moved\.$/;

async function approveRm100Transfer() {
  await pairPhoneAsTheDemoLaunchDoes();
  const view = await renderRoute("/transfer");
  await walkToTransferReview();
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  return view;
}

async function waitOnHomeForItsBalance() {
  await screen.findByText("RM 12,745.50");
  await act(() => jest.advanceTimersByTimeAsync(1_000));
}

it("tells Home the transfer was sent when Back leaves the result page as it opens, at the next launch too", async () => {
  const view = await approveRm100Transfer();
  await screen.findByRole("header", { name: "Transfer sent" });

  await pressHardwareBack();

  expect(await screen.findByText(SENT_NOTICE)).toBeOnTheScreen();
  expect(view.getPathname()).toBe("/");
  const relaunched = await relaunchApp(view);
  expect(await screen.findByText(SENT_NOTICE)).toBeOnTheScreen();
  expect(relaunched.getPathname()).toBe("/");
});

it("says nothing more on Home once the result page has finished opening and Back leaves it", async () => {
  const view = await approveRm100Transfer();
  await finishOpeningScreen(
    await screen.findByRole("header", { name: "Transfer sent" }),
  );

  await pressHardwareBack();

  await waitOnHomeForItsBalance();
  expect(view.getPathname()).toBe("/");
  expect(screen.queryByText(SENT_NOTICE)).toBeNull();
});

it("says nothing more on Home, shown or spoken, when Done leaves the result page before it has finished opening", async () => {
  const view = await approveRm100Transfer();
  await screen.findByRole("header", { name: "Transfer sent" });
  const announcements = jest
    .spyOn(AccessibilityInfo, "announceForAccessibility")
    .mockClear();

  await fireEvent.press(screen.getByRole("button", { name: "Done" }));

  await waitOnHomeForItsBalance();
  expect(view.getPathname()).toBe("/");
  expect(screen.queryByText(SENT_NOTICE)).toBeNull();
  expect(announcements.mock.calls.flat()).not.toContainEqual(
    expect.stringMatching(SENT_NOTICE),
  );
});
