import { fireEvent, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import { renderRoute } from "@/test/render/render-route";

afterEach(() => {
  jest.restoreAllMocks();
});

it("shows the amount's error and announces it to a screen reader", async () => {
  const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");

  await typeAnAmountOverTodaysLimit();

  expect(screen.getByText(OVER_TODAYS_LIMIT)).toBeOnTheScreen();
  expect(announce).toHaveBeenCalledWith(OVER_TODAYS_LIMIT);
});

it("names the amount's input once, by its label, and keeps its error as the input's hint", async () => {
  await typeAnAmountOverTodaysLimit();

  expect(screen.getByHintText(OVER_TODAYS_LIMIT)).toBe(
    screen.getByLabelText("Amount (RM)"),
  );
  expect(screen.queryByText("Amount (RM)")).toBeNull();
  expect(
    screen.getByText("Amount (RM)", { includeHiddenElements: true }),
  ).toBeOnTheScreen();
});

it("keeps the keyboard from learning or correcting a recipient's mobile number", async () => {
  await renderRoute("/transfer");
  const mobileNumber = await screen.findByLabelText("DuitNow mobile number");

  expect(mobileNumber).toHaveProp("autoCorrect", false);
  expect(mobileNumber).toHaveProp("autoComplete", "tel");
});

const OVER_TODAYS_LIMIT =
  "That is more than the RM 5,000.00 you can still send today.";

async function typeAnAmountOverTodaysLimit() {
  await renderRoute("/transfer");
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    "012-345 6789",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("RM 12,845.50");
  await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "5,000.01");
}
