import { fireEvent, screen } from "@testing-library/react-native";

import type { DemoLayer } from "@/shared/demo-layer/demo-layer.type";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { renderRoute } from "@/test/render-route";

// The demo build's root: Jest runs as production, whose launch loads no demo layer.
jest.mock("@/shell/app-launch", () => ({
  __esModule: true,
  demoLayer: jest.requireActual<{ default: DemoLayer }>("@/mocks/demo-layer")
    .default,
}));

async function approveWithPin(pin: string) {
  for (const digit of pin)
    await fireEvent.press(await screen.findByRole("button", { name: digit }));
  await fireEvent.press(screen.getByRole("button", { name: "Approve" }));
}

it("gives the next transfer its PIN keypad back once Unlock PIN has unlocked the PIN the bank locked", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/transfer");
  await fireEvent.press(screen.getByRole("button", { name: "Demo menu" }));
  await fireEvent.press(screen.getByRole("radio", { name: "No biometrics" }));
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
  await approveWithPin("111111");
  await screen.findByText("That PIN is incorrect. You have 2 tries left.");
  await approveWithPin("111111");
  await screen.findByText("That PIN is incorrect. You have 1 try left.");
  await approveWithPin("111111");
  await fireEvent.press(await screen.findByRole("button", { name: "Close" }));

  await fireEvent.press(screen.getByRole("button", { name: "Demo menu" }));
  await fireEvent.press(screen.getByRole("button", { name: "Unlock PIN" }));
  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
  await approveWithPin("246810");

  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
});
