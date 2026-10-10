import "@/test/setup/demo-build";

import { fireEvent, screen } from "@testing-library/react-native";

import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import {
  enterPinAndApprove,
  walkToTransferReview,
} from "@/test/render/drive-app";
import { renderRoute } from "@/test/render/render-route";

it("shows the demo PIN in a demo build, and the PIN it shows approves the transfer", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/transfer");
  await walkToTransferReview();
  await fireEvent.press(
    await screen.findByRole("button", { name: "Use PIN instead" }),
  );

  expect(await screen.findByText("Demo PIN: 246810")).toBeOnTheScreen();
  await enterPinAndApprove("246810");
  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
});
