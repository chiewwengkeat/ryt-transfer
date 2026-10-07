import { fireEvent, screen } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";

import { mswServer } from "@/test/msw-server";
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

it("offers to try again when the balance cannot load, and shows it once it does", async () => {
  mswServer.use(
    http.get(
      "*/accounts/primary",
      () =>
        HttpResponse.json(
          { error: { code: "NEW_BANK_CODE", message: "Unknown to this app." } },
          { status: 400 },
        ),
      { once: true },
    ),
  );
  await renderRoute("/");

  await fireEvent.press(
    await screen.findByRole("button", { name: "Try again" }),
  );

  expect(await screen.findByText("RM 12,845.50")).toBeOnTheScreen();
});
