import "@/test/setup/demo-build";

import { fireEvent, screen } from "@testing-library/react-native";

import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import { enterPinAndApprove } from "@/test/render/drive-app";
import { renderRoute } from "@/test/render/render-route";

// Real time, not fake: locking the PIN and sending again outlasts Jest's 5 s under a loaded parallel run.
jest.setTimeout(15_000);

async function lockThePinOnAnRm100TransferUnderNoBiometrics() {
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
  await enterPinAndApprove("111111");
  await screen.findByText("That PIN is incorrect. You have 2 tries left.");
  await enterPinAndApprove("111111");
  await screen.findByText("That PIN is incorrect. You have 1 try left.");
  await enterPinAndApprove("111111");
  await fireEvent.press(await screen.findByRole("button", { name: "Close" }));
}

it("shows on Home what a pick changes, and what returning to Normal changes back, without the app leaving the screen", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/");
  await screen.findByText(/more today/);

  await fireEvent.press(screen.getByRole("button", { name: "Demo menu" }));
  await fireEvent.press(
    screen.getByRole("radio", { name: "Transfers under maintenance" }),
  );
  expect(
    await screen.findByText(/^Transfers are unavailable right now, until/),
  ).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole("button", { name: "Demo menu" }));
  await fireEvent.press(
    screen.getByRole("radio", { name: "Normal, no scenario" }),
  );

  expect(await screen.findByText(/more today/)).toBeOnTheScreen();
  expect(
    screen.getByRole("button", { name: "Transfer", disabled: false }),
  ).toBeOnTheScreen();
});

it("gives the next transfer its PIN keypad back once Unlock PIN has unlocked the PIN the bank locked", async () => {
  await lockThePinOnAnRm100TransferUnderNoBiometrics();

  await fireEvent.press(screen.getByRole("button", { name: "Demo menu" }));
  await fireEvent.press(screen.getByRole("button", { name: "Unlock PIN" }));
  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
  await enterPinAndApprove("246810");

  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
});
