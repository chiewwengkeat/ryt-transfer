import { fireEvent, screen } from "@testing-library/react-native";

import { renderRoute } from "@/test/render-route";
import { scenarioTest } from "@/test/scenario-test";

it.each(["012-345 6789", "60123456789", "+60 12 345 6789"])(
  "takes %s as a DuitNow mobile number and moves on to the amount",
  async (typedMobile) => {
    const view = await renderRoute("/");
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    await fireEvent.changeText(
      await screen.findByLabelText("DuitNow mobile number"),
      typedMobile,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));

    expect(view.getPathname()).toBe("/transfer/amount");
  },
);

it("leaves for Home from its header, even when the transfer opened with nothing beneath it", async () => {
  const view = await renderRoute("/transfer");

  await fireEvent.press(
    await screen.findByRole("button", { name: "Back to Home" }),
  );

  expect(
    await screen.findByRole("button", { name: "Transfer" }),
  ).toBeOnTheScreen();
  expect(view.getPathname()).toBe("/");
});

it(
  "says what is wrong with a number that is not a Malaysian mobile number, and stays",
  scenarioTest("transfer.badly_formed_input", async () => {
    const view = await renderRoute("/transfer");

    await fireEvent.changeText(
      await screen.findByLabelText("DuitNow mobile number"),
      "03-2345 6789",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));

    expect(
      screen.getByHintText(
        "Enter a Malaysian mobile number, like 012-345 6789.",
      ),
    ).toBeOnTheScreen();
    expect(view.getPathname()).toBe("/transfer");
  }),
);
