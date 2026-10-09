import { act, fireEvent, screen } from "@testing-library/react-native";

import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { pressHardwareBack } from "@/test/hardware-back";
import { relaunchApp, renderRoute } from "@/test/render-route";

const SENT_NOTICE =
  /^Your transfer of RM 100\.00 to .+ was sent — money moved\.$/;

async function approveRm100Transfer() {
  await pairPhoneAsTheDemoLaunchDoes();
  const view = await renderRoute("/transfer");
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    "012-345 6789",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("RM 12,845.50");
  await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
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
  const heading = await screen.findByRole("header", { name: "Transfer sent" });
  // Jest plays no screen transitions: this is the phone's signal that the page has finished opening.
  await fireEvent(heading, "appear");

  await pressHardwareBack();

  await waitOnHomeForItsBalance();
  expect(view.getPathname()).toBe("/");
  expect(screen.queryByText(SENT_NOTICE)).toBeNull();
});

it("says nothing more on Home when Done leaves the result page before it has finished opening", async () => {
  const view = await approveRm100Transfer();
  await screen.findByRole("header", { name: "Transfer sent" });

  await fireEvent.press(screen.getByRole("button", { name: "Done" }));

  await waitOnHomeForItsBalance();
  expect(view.getPathname()).toBe("/");
  expect(screen.queryByText(SENT_NOTICE)).toBeNull();
});
