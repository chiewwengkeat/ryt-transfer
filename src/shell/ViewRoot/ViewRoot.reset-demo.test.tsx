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

async function sendRm100FromHomeAndReturn() {
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    "012-345 6789",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await fireEvent.changeText(
    await screen.findByLabelText("Amount (RM)"),
    "100",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await fireEvent.press(await screen.findByRole("button", { name: "Done" }));
}

it("puts Home back to the demo's opening balance and limit, and a transfer after the reset still goes through", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/");
  await sendRm100FromHomeAndReturn();
  await screen.findByText("RM 12,745.50");

  await fireEvent.press(screen.getByRole("button", { name: "Demo menu" }));
  await fireEvent.press(screen.getByRole("button", { name: "Reset demo" }));

  expect(await screen.findByText("RM 12,845.50")).toBeOnTheScreen();
  expect(
    screen.getByText("You can send RM 5,000.00 more today"),
  ).toBeOnTheScreen();
  await sendRm100FromHomeAndReturn();
  expect(await screen.findByText("RM 12,745.50")).toBeOnTheScreen();
  expect(
    screen.getByText("You can send RM 4,900.00 more today"),
  ).toBeOnTheScreen();
});
