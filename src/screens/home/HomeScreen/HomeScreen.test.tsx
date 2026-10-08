import { fireEvent, screen } from "@testing-library/react-native";

import { clearTransferScenario } from "@/test/clear-transfer-scenario";
import { renderRoute } from "@/test/render-route";
import { scenarioTest } from "@/test/scenario-test";

it(
  "shows the balance and how much more can be sent today",
  scenarioTest("transfer.balance_and_limit_shown", async () => {
    await renderRoute("/");

    expect(await screen.findByText("RM 12,845.50")).toBeOnTheScreen();
    expect(
      screen.getByText("You can send RM 5,000.00 more today"),
    ).toBeOnTheScreen();
  }),
);

it(
  "offers to try again when the balance cannot load, and shows it once it does",
  scenarioTest("transfer.start_unexpected", async () => {
    await renderRoute("/");
    const tryAgainButton = await screen.findByRole("button", {
      name: "Try again",
    });
    expect(
      screen.getByText("Something unexpected went wrong."),
    ).toBeOnTheScreen();

    clearTransferScenario();
    await fireEvent.press(tryAgainButton);

    expect(await screen.findByText("RM 12,845.50")).toBeOnTheScreen();
  }),
);
