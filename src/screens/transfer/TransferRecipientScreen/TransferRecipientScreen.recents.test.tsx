import { act, fireEvent, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { http, HttpResponse } from "msw";

import type { ListRecentRecipientsResponse } from "@/domains/transfer/api/list-recent-recipients/list-recent-recipients.type";
import { requestJson } from "@/shared/http/transport";
import { setPhoneNetwork } from "@/test/harness/native-doubles";
import { mswServer } from "@/test/msw-server";
import { renderRoute } from "@/test/render-route";
import { scenarioTest } from "@/test/scenario-test";

const UNKNOWN_BANK_CODE = {
  error: { code: "NEW_BANK_CODE", message: "Unknown to this app." },
};

it(
  "opens the recipient step with a recent recipient picked on Home, the amount empty and the name looked up afresh",
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

it("waits for a recent recipient linked from Home to load, never offering the typed form in its place", async () => {
  const {
    items: [firstRecent],
  } = await requestJson<ListRecentRecipientsResponse>("/recipients/recent");
  await renderRoute("/");
  await act(() => {
    router.push({
      pathname: "/transfer",
      params: { recentId: firstRecent!.recentId },
    });
  });

  expect(screen.getByLabelText("Loading")).toBeOnTheScreen();
  expect(
    screen.queryByLabelText("DuitNow mobile number"),
  ).not.toBeOnTheScreen();
  expect(
    await screen.findByText(firstRecent!.registeredName),
  ).toBeOnTheScreen();
});

it("says something unexpected went wrong when a recent linked from Home is no longer listed, until a number is typed instead", async () => {
  const view = await renderRoute("/");
  await act(() => {
    router.push({
      pathname: "/transfer",
      params: { recentId: "rcp_no_longer_listed" },
    });
  });
  const recentMissing = await screen.findByText(
    "Something unexpected went wrong.",
  );

  await fireEvent.changeText(
    screen.getByLabelText("DuitNow mobile number"),
    "012-345 6789",
  );
  expect(recentMissing).not.toBeOnTheScreen();
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));

  expect(view.getPathname()).toBe("/transfer/amount");
});

it("waits, rather than offering the typed form, while recents that could not load leave a linked recent unknown offline", async () => {
  mswServer.use(
    http.get("*/recipients/recent", () =>
      HttpResponse.json(UNKNOWN_BANK_CODE, { status: 400 }),
    ),
  );
  await renderRoute("/");
  await act(() => {
    router.push({
      pathname: "/transfer",
      params: { recentId: "rcp_linked_from_home" },
    });
  });
  const typedForm = await screen.findByLabelText("DuitNow mobile number");

  await act(() => {
    setPhoneNetwork({ isConnected: false, isInternetReachable: false });
  });

  expect(typedForm).not.toBeOnTheScreen();
  expect(screen.getByLabelText("Loading")).toBeOnTheScreen();
});

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
