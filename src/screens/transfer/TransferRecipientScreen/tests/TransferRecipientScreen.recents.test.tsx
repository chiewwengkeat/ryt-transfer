import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { http, HttpResponse } from "msw";
import { AccessibilityInfo } from "react-native";

import type { ListRecentRecipientsResponse } from "@/domains/transfer/api/list-recent-recipients/list-recent-recipients.type";
import type { LookupRecipientResponse } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import { requestJson } from "@/shared/http/transport/transport";
import {
  reportedScenarios,
  setPhoneNetwork,
} from "@/test/doubles/native-doubles";
import { mswServer, sentRequests } from "@/test/mock-bank/mock-bank";
import {
  moveAppTo,
  pressHardwareBack,
  scenarioTest,
} from "@/test/render/drive-app";
import { renderRoute } from "@/test/render/render-route";

import { UNKNOWN_BANK_CODE } from "./TransferRecipientScreen.helper";

it(
  "opens the recipient step with a recent recipient picked on Home in place of the ID field, the amount empty, and review showing the name the bank holds today",
  scenarioTest("transfer.recent_recipient_chosen", async () => {
    const nameTheBankHoldsToday = "NUR IMAN BINTI HASHIM";
    const {
      items: [firstRecent],
    } = await requestJson<ListRecentRecipientsResponse>("/recipients/recent");
    const todaysNameCheck = await requestJson<LookupRecipientResponse>(
      "/recipients/lookup",
      { method: "POST", body: { recentId: firstRecent!.recentId } },
    );
    mswServer.use(
      http.post("*/recipients/lookup", () =>
        HttpResponse.json({
          ...todaysNameCheck,
          recipient: {
            ...todaysNameCheck.recipient,
            registeredName: nameTheBankHoldsToday,
          },
        }),
      ),
    );
    await renderRoute("/");
    const [firstRecentButton] = await screen.findAllByRole("button", {
      name: /••••/,
    });
    await fireEvent.press(firstRecentButton!);

    expect(
      await screen.findByText(firstRecent!.registeredName),
    ).toBeOnTheScreen();
    expect(screen.queryByLabelText("DuitNow mobile number")).toBeNull();
    expect(screen.getByRole("button", { name: "Change" })).toBeOnTheScreen();
    expect(reportedScenarios()).toContain("transfer.recent_recipient_chosen");
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByLabelText("Amount (RM)")).toHaveDisplayValue("");
    await screen.findByText("RM 12,845.50");
    await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
    await fireEvent.press(screen.getByRole("button", { name: "Review" }));
    expect(await screen.findByText(nameTheBankHoldsToday)).toBeOnTheScreen();
    expect(screen.getByText(firstRecent!.idValueMasked)).toBeOnTheScreen();
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
  "says something unexpected went wrong when recent recipients cannot load, asks for them again on Try again, still takes a typed number, and goes back to Home",
  scenarioTest("transfer.recipient_unexpected", async () => {
    const recentRecipientReadsSent = () =>
      sentRequests.filter(({ url }) => url.endsWith("/recipients/recent"))
        .length;
    const view = await renderRoute("/transfer");

    expect(
      await screen.findByText("Something unexpected went wrong."),
    ).toBeOnTheScreen();
    expect(reportedScenarios()).toContain("transfer.recipient_unexpected");
    const readsBeforeTryAgain = recentRecipientReadsSent();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => {
      expect(recentRecipientReadsSent()).toBe(readsBeforeTryAgain + 1);
    });
    await fireEvent.changeText(
      screen.getByLabelText("DuitNow mobile number"),
      "012-345 6789",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    expect(view.getPathname()).toBe("/transfer/amount");
    await pressHardwareBack();
    await fireEvent.press(
      await screen.findByRole("button", { name: "Back to Home" }),
    );
    expect(
      await screen.findByRole("button", { name: "Transfer" }),
    ).toBeOnTheScreen();
    expect(view.getPathname()).toBe("/");
  }),
);

it("lists the recent recipients on Try again after they could not load", async () => {
  mswServer.use(
    http.get("*/recipients/recent", () =>
      HttpResponse.json(UNKNOWN_BANK_CODE, { status: 400 }),
    ),
  );
  await renderRoute("/transfer");
  const recentsUnexpected = await screen.findByText(
    "Something unexpected went wrong.",
  );

  mswServer.resetHandlers();
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));

  expect(
    await screen.findAllByRole("button", { name: /••••/ }),
  ).not.toHaveLength(0);
  expect(recentsUnexpected).not.toBeOnTheScreen();
});

it("reports only the session's end for recents that failed into it, never saying they failed, whose message goes once signing in again reads them", async () => {
  const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
  announce.mockClear();
  await renderRoute("/transfer");
  await screen.findAllByRole("button", { name: /••••/ });
  const reportsBeforeTheSessionEnded = reportedScenarios().length;
  mswServer.use(http.all("*", () => new HttpResponse(null, { status: 401 })));

  moveAppTo("background");
  moveAppTo("active");
  const signInAgain = await screen.findByRole("button", {
    name: "Sign in again",
  });
  mswServer.resetHandlers();
  await fireEvent.press(signInAgain);
  await act(() => jest.advanceTimersByTimeAsync(2_000));

  expect(reportedScenarios().slice(reportsBeforeTheSessionEnded)).toEqual([
    "transfer.session_ended",
  ]);
  expect(screen.queryByText("Something unexpected went wrong.")).toBeNull();
  expect(announce).not.toHaveBeenCalledWith("Something unexpected went wrong.");
});

it("hides the recipient step's something-unexpected message while the phone has no connection", async () => {
  mswServer.use(
    http.get("*/recipients/recent", () =>
      HttpResponse.json(UNKNOWN_BANK_CODE, { status: 400 }),
    ),
  );
  await renderRoute("/transfer");
  const recentsUnexpected = await screen.findByText(
    "Something unexpected went wrong.",
  );

  await act(() => {
    setPhoneNetwork({ isConnected: false, isInternetReachable: false });
  });

  expect(recentsUnexpected).not.toBeOnTheScreen();
  expect(screen.getByLabelText("DuitNow mobile number")).toBeOnTheScreen();
});
