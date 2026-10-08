import { fireEvent, screen } from "@testing-library/react-native";

import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { renderRoute } from "@/test/render-route";
import { scenarioTest } from "@/test/scenario-test";

it(
  "offers to load the result again, never to send again, when reading a processing transfer fails in a way the app cannot name",
  scenarioTest("transfer.outcome_unexpected", async () => {
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
    await fireEvent.changeText(
      await screen.findByLabelText("Amount (RM)"),
      "100",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Review" }));
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(
      await screen.findByRole("header", { name: "Result not available" }),
    ).toBeOnTheScreen();
    expect(
      screen
        .getAllByRole("button")
        .map((button) => button.props.accessibilityLabel as unknown)
        .sort(),
    ).toEqual(["Done", "Load the result again"]);
  }),
);
