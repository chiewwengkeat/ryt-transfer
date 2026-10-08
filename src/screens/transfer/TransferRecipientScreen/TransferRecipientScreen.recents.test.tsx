import { fireEvent, screen } from "@testing-library/react-native";

import type { ListRecentRecipientsResponse } from "@/domains/transfer/api/list-recent-recipients/list-recent-recipients.type";
import { requestJson } from "@/shared/http/transport";
import { renderRoute } from "@/test/render-route";
import { scenarioTest } from "@/test/scenario-test";

it(
  "opens the recipient step filled in from a recent recipient on Home, with the amount empty and the name looked up afresh",
  scenarioTest("transfer.recent_recipient_chosen", async () => {
    const {
      items: [firstRecent],
    } = await requestJson<ListRecentRecipientsResponse>("/recipients/recent");
    await renderRoute("/");
    const [firstRecentButton] = await screen.findAllByRole("button", {
      name: /••••/,
    });
    await fireEvent.press(firstRecentButton!);

    expect(
      await screen.findByText(firstRecent!.registeredName),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByLabelText("Amount (RM)")).toHaveDisplayValue("");
    await screen.findByText("RM 12,845.50");
    await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
    await fireEvent.press(screen.getByRole("button", { name: "Review" }));
    expect(
      await screen.findByText(firstRecent!.idValueMasked),
    ).toBeOnTheScreen();
  }),
);

it("lets a recent recipient picked on the recipient step be changed for a typed one", async () => {
  await renderRoute("/transfer");
  const [firstRecentButton] = await screen.findAllByRole("button", {
    name: /••••/,
  });
  await fireEvent.press(firstRecentButton!);

  await fireEvent.press(await screen.findByRole("button", { name: "Change" }));
  expect(screen.getByLabelText("DuitNow mobile number")).toBeOnTheScreen();
});

it(
  "says something unexpected went wrong when recent recipients cannot load, and still takes a typed number",
  scenarioTest("transfer.recipient_unexpected", async () => {
    const view = await renderRoute("/transfer");

    expect(
      await screen.findByText("Something unexpected went wrong."),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Try again" })).toBeOnTheScreen();
    await fireEvent.changeText(
      screen.getByLabelText("DuitNow mobile number"),
      "012-345 6789",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    expect(view.getPathname()).toBe("/transfer/amount");
  }),
);
