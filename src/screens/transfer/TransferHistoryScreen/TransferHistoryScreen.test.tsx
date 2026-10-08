import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { AccessibilityInfo, AppState } from "react-native";

import {
  TransferDirection,
  TransferFunds,
  TransferStatus,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { toMalaysianDateKey } from "@/shared/lib/dates/dates";
import { lookUpTestRecipient } from "@/test/bank-client";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { setPhoneNetwork } from "@/test/harness/native-doubles";
import { observedRecords } from "@/test/harness/recording-sink";
import { mswServer, sentRequests } from "@/test/msw-server";
import { renderRoute } from "@/test/render-route";
import { scenarioTest } from "@/test/scenario-test";
import {
  buildHistoryTransfer,
  failTransferHistoryPages,
  holdTransferHistoryPages,
  serveTransferHistoryPages,
  serveTransferHistoryResponses,
} from "@/test/transfer-history-pages";

const sentTransferHistoryCursors = () =>
  sentRequests
    .map(({ url }) => new URL(url))
    .filter(({ pathname }) => pathname.endsWith("/transfers"))
    .map(({ searchParams }) => searchParams.get("cursor"));

const LIM_ON_4_OCTOBER = buildHistoryTransfer({
  registeredName: "Lim Wei Jie",
  createdAt: "2026-10-04T13:05:00+08:00",
});
const TAN_ON_6_OCTOBER = buildHistoryTransfer({
  registeredName: "Tan Mei Ling",
  createdAt: "2026-10-06T09:00:00+08:00",
});
const LIM_AT_AN_UNREADABLE_TIME = buildHistoryTransfer({
  registeredName: "Lim Wei Jie",
  createdAt: "not a date",
});
const OFFLINE = { isConnected: false, isInternetReachable: false };
const ONLINE = { isConnected: true, isInternetReachable: true };
const OUT_OF_DATE = "Couldn't refresh — this list may be out of date";

function bringAppToTheFront() {
  for (const [eventName, listener] of jest.mocked(AppState).addEventListener
    .mock.calls)
    if (eventName === "change") {
      listener("background");
      listener("active");
    }
}

it("lists the first page's transfers under their day, asking the bank once", async () => {
  await renderRoute("/transfer-history");

  expect(
    await screen.findByRole("button", {
      name: "Aisyah Rahman 3:42 pm · Successful -RM 50.00",
    }),
  ).toBeOnTheScreen();
  expect(
    screen.getByRole("button", {
      name: "5 Oct 2026, 1 transfer, -RM 50.00",
      expanded: true,
    }),
  ).toBeOnTheScreen();
  expect(sentTransferHistoryCursors()).toEqual([null]);
});

it("shows a loader while the first page is on its way", async () => {
  const releaseFirstPage = holdTransferHistoryPages("first");
  await renderRoute("/transfer-history");

  expect(await screen.findByLabelText("Loading")).toBeOnTheScreen();
  releaseFirstPage();
  expect(
    await screen.findByRole("button", { name: /^Aisyah Rahman/ }),
  ).toBeOnTheScreen();
});

it("shows the transfers it has at once on a later open, then the newest page in their place", async () => {
  await renderRoute("/");
  await act(() => {
    router.push("/transfer-history");
  });
  expect(
    await screen.findByRole("button", { name: /^Aisyah Rahman/ }),
  ).toBeOnTheScreen();
  await act(() => {
    router.back();
  });
  serveTransferHistoryPages([[LIM_ON_4_OCTOBER]]);
  const releaseFirstPage = holdTransferHistoryPages("first");

  await act(() => {
    router.push("/transfer-history");
  });

  expect(
    screen.getByRole("button", { name: /^Aisyah Rahman/ }),
  ).toBeOnTheScreen();
  releaseFirstPage();
  expect(
    await screen.findByRole("button", { name: /^Lim Wei Jie/ }),
  ).toBeOnTheScreen();
  expect(
    screen.queryByRole("button", { name: /^Aisyah Rahman/ }),
  ).not.toBeOnTheScreen();
  expect(sentTransferHistoryCursors()).toEqual([null, null]);
});

it("trims to the newest page on a later open, asking again for none of the older ones", async () => {
  serveTransferHistoryPages([[buildHistoryTransfer()], [LIM_ON_4_OCTOBER]]);
  await renderRoute("/");
  await act(() => {
    router.push("/transfer-history");
  });
  expect(
    await screen.findByRole("button", { name: /^Lim Wei Jie/ }),
  ).toBeOnTheScreen();
  await act(() => {
    router.back();
  });
  const releaseFirstPage = holdTransferHistoryPages("first");

  await act(() => {
    router.push("/transfer-history");
  });
  await act(() => jest.advanceTimersByTimeAsync(1000));

  expect(
    screen.getByRole("button", { name: /^Aisyah Rahman/ }),
  ).toBeOnTheScreen();
  expect(
    screen.queryByRole("button", { name: /^Lim Wei Jie/ }),
  ).not.toBeOnTheScreen();
  releaseFirstPage();
  expect(
    await screen.findByRole("button", { name: /^Lim Wei Jie/ }),
  ).toBeOnTheScreen();
});

it(
  "shows a transfer sent while History was closed first when History opens again",
  scenarioTest("transfer.completed", async () => {
    mswServer.resetHandlers();
    await pairPhoneAsTheDemoLaunchDoes();
    const { recipient } = await lookUpTestRecipient("012-345 6789");
    await renderRoute("/");
    await act(() => {
      router.push("/transfer-history");
    });
    expect(
      await screen.findByRole("button", { name: /^6 Oct 2026, / }),
    ).toBeOnTheScreen();
    await act(() => {
      router.back();
    });

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
    const requestCountBeforeReopening = sentTransferHistoryCursors().length;

    await act(() => {
      router.push("/transfer-history");
    });

    expect(
      await screen.findByRole("button", {
        name: "Today, 1 transfer, -RM 100.00",
      }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole("button", {
        name: new RegExp(`^${recipient.registeredName} .+ -RM 100\\.00$`),
      }),
    ).toBeOnTheScreen();
    expect(
      sentTransferHistoryCursors().slice(requestCountBeforeReopening),
    ).toContain(null);
  }),
);

it("loads the next page as the list nears its end, with a spinner until it lands", async () => {
  serveTransferHistoryPages([[buildHistoryTransfer()], [LIM_ON_4_OCTOBER]]);
  const releaseLaterPages = holdTransferHistoryPages("later");
  await renderRoute("/transfer-history");

  expect(
    await screen.findByRole("button", { name: /^Aisyah Rahman/ }),
  ).toBeOnTheScreen();
  expect(
    await screen.findByLabelText("Loading more transfers"),
  ).toBeOnTheScreen();
  expect(
    screen.queryByRole("button", { name: /^Lim Wei Jie/ }),
  ).not.toBeOnTheScreen();
  expect(screen.queryByText("That's everything")).not.toBeOnTheScreen();

  releaseLaterPages();

  expect(
    await screen.findByRole("button", { name: /^Lim Wei Jie/ }),
  ).toBeOnTheScreen();
  expect(screen.getByText("That's everything")).toBeOnTheScreen();
  expect(sentTransferHistoryCursors()).toEqual([null, "page-2"]);
});

it("says it has every transfer once the last page is in", async () => {
  await renderRoute("/transfer-history");

  expect(await screen.findByText("That's everything")).toBeOnTheScreen();
  expect(
    screen.queryByLabelText("Loading more transfers"),
  ).not.toBeOnTheScreen();
});

it("says there are no transfers yet when the first page is empty", async () => {
  serveTransferHistoryPages([[]]);
  await renderRoute("/transfer-history");

  expect(
    await screen.findByRole("header", { name: "No transfers yet" }),
  ).toBeOnTheScreen();
  expect(
    screen.getByText("Transfers you send or receive will show here."),
  ).toBeOnTheScreen();
});

it("offers Retry when the next page fails, asks no more by itself, and shows the page once a retry lands", async () => {
  serveTransferHistoryPages([[buildHistoryTransfer()], [LIM_ON_4_OCTOBER]]);
  const recoverLaterPages = failTransferHistoryPages("later");
  await renderRoute("/transfer-history");
  expect(await screen.findByText("Couldn't load more.")).toBeOnTheScreen();
  const failedRequestCount = sentTransferHistoryCursors().length;

  await fireEvent.press(
    screen.getByRole("button", { name: "5 Oct 2026, 1 transfer, -RM 50.00" }),
  );
  await act(() => jest.advanceTimersByTimeAsync(1000));

  expect(screen.getByText("Couldn't load more.")).toBeOnTheScreen();
  expect(sentTransferHistoryCursors()).toHaveLength(failedRequestCount);
  recoverLaterPages();
  const releaseLaterPages = holdTransferHistoryPages("later");
  await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
  expect(
    await screen.findByLabelText("Loading more transfers"),
  ).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Retry" })).not.toBeOnTheScreen();
  releaseLaterPages();
  expect(
    await screen.findByRole("button", { name: /^Lim Wei Jie/ }),
  ).toBeOnTheScreen();
});

it("pulls the newest page in place of the loaded ones", async () => {
  await renderRoute("/transfer-history");
  const aisyah = await screen.findByRole("button", { name: /^Aisyah Rahman/ });
  serveTransferHistoryPages([
    [
      buildHistoryTransfer({
        registeredName: "Lim Wei Jie",
        createdAt: "2026-10-05T16:10:00+08:00",
      }),
      buildHistoryTransfer(),
    ],
  ]);

  await fireEvent(aisyah, "refresh");

  expect(
    await screen.findByRole("button", {
      name: "5 Oct 2026, 2 transfers, -RM 100.00",
    }),
  ).toBeOnTheScreen();
  expect(
    screen.getByRole("button", { name: /^Lim Wei Jie/ }),
  ).toBeOnTheScreen();
  expect(sentTransferHistoryCursors()).toEqual([null, null]);
});

it("trims to the newest page on a pull, asking again for none of the older ones", async () => {
  serveTransferHistoryPages([[buildHistoryTransfer()], [LIM_ON_4_OCTOBER]]);
  await renderRoute("/transfer-history");
  const lim = await screen.findByRole("button", { name: /^Lim Wei Jie/ });
  const releaseFirstPage = holdTransferHistoryPages("first");

  await fireEvent(lim, "refresh");
  await act(() => jest.advanceTimersByTimeAsync(1000));

  expect(
    screen.queryByRole("button", { name: /^Lim Wei Jie/ }),
  ).not.toBeOnTheScreen();
  expect(
    screen.getByRole("button", { name: /^Aisyah Rahman/ }),
  ).toBeOnTheScreen();
  releaseFirstPage();
  expect(
    await screen.findByRole("button", { name: /^Lim Wei Jie/ }),
  ).toBeOnTheScreen();
});

it("loads no more and shows no spinner while a refresh is on its way, then pages on from the new first page", async () => {
  serveTransferHistoryPages([[buildHistoryTransfer()], [LIM_ON_4_OCTOBER]]);
  await renderRoute("/transfer-history");
  const lim = await screen.findByRole("button", { name: /^Lim Wei Jie/ });
  const releaseFirstPage = holdTransferHistoryPages("first");

  await fireEvent(lim, "refresh");
  await act(() => jest.advanceTimersByTimeAsync(1000));

  expect(sentTransferHistoryCursors()).toEqual([null, "page-2", null]);
  expect(
    screen.queryByLabelText("Loading more transfers"),
  ).not.toBeOnTheScreen();
  const releaseLaterPages = holdTransferHistoryPages("later");
  releaseFirstPage();
  expect(
    await screen.findByLabelText("Loading more transfers"),
  ).toBeOnTheScreen();
  expect(sentTransferHistoryCursors()).toEqual([
    null,
    "page-2",
    null,
    "page-2",
  ]);
  releaseLaterPages();
  expect(
    await screen.findByRole("button", { name: /^Lim Wei Jie/ }),
  ).toBeOnTheScreen();
});

it("asks for the newest page once back online when History opened offline, and shows it", async () => {
  serveTransferHistoryPages([[buildHistoryTransfer()], [LIM_ON_4_OCTOBER]]);
  await renderRoute("/");
  await act(() => {
    router.push("/transfer-history");
  });
  expect(
    await screen.findByRole("button", { name: /^Lim Wei Jie/ }),
  ).toBeOnTheScreen();
  await act(() => {
    router.back();
  });
  serveTransferHistoryPages([
    [TAN_ON_6_OCTOBER, buildHistoryTransfer()],
    [LIM_ON_4_OCTOBER],
  ]);
  await act(() => {
    setPhoneNetwork(OFFLINE);
  });
  await act(() => {
    router.push("/transfer-history");
  });
  await act(() => jest.advanceTimersByTimeAsync(5000));
  expect(screen.getByText(OUT_OF_DATE)).toBeOnTheScreen();
  expect(
    screen.queryByLabelText("Loading more transfers"),
  ).not.toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Retry" })).not.toBeOnTheScreen();

  await act(() => {
    setPhoneNetwork(ONLINE);
  });

  expect(
    await screen.findByRole("button", { name: /^Tan Mei Ling/ }),
  ).toBeOnTheScreen();
  await waitFor(() => {
    expect(sentTransferHistoryCursors()).toEqual([
      null,
      "page-2",
      null,
      "page-2",
    ]);
  });
});

it("offers Try again when the first page fails, and lists the transfers once it lands", async () => {
  const recoverFirstPage = failTransferHistoryPages("first");
  await renderRoute("/transfer-history");

  expect(
    await screen.findByText("Couldn't load your transfers."),
  ).toBeOnTheScreen();
  recoverFirstPage();
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));

  expect(
    await screen.findByRole("button", { name: /^Aisyah Rahman/ }),
  ).toBeOnTheScreen();
});

it("asks three times before saying the first page failed", async () => {
  failTransferHistoryPages("first");
  await renderRoute("/transfer-history");

  expect(
    await screen.findByText("Couldn't load your transfers."),
  ).toBeOnTheScreen();
  expect(sentTransferHistoryCursors()).toEqual([null, null, null]);
});

it("asks three times before saying the first page failed when the bank takes too long", async () => {
  holdTransferHistoryPages("first");
  await renderRoute("/transfer-history");

  await act(() => jest.advanceTimersByTimeAsync(15_000));
  expect(screen.getByLabelText("Loading")).toBeOnTheScreen();
  expect(sentTransferHistoryCursors()).toEqual([null, null]);
  await act(() => jest.advanceTimersByTimeAsync(20_000));

  expect(
    await screen.findByText("Couldn't load your transfers."),
  ).toBeOnTheScreen();
  expect(sentTransferHistoryCursors()).toEqual([null, null, null]);
});

it("asks three times for the next page before offering Retry", async () => {
  serveTransferHistoryPages([[buildHistoryTransfer()], [LIM_ON_4_OCTOBER]]);
  failTransferHistoryPages("later");
  await renderRoute("/transfer-history");

  expect(await screen.findByText("Couldn't load more.")).toBeOnTheScreen();
  expect(sentTransferHistoryCursors()).toEqual([
    null,
    "page-2",
    "page-2",
    "page-2",
  ]);
});

it("keeps the rows under a notice when a refresh fails, and refreshes them on Try again", async () => {
  await renderRoute("/transfer-history");
  const aisyah = await screen.findByRole("button", { name: /^Aisyah Rahman/ });
  const recoverFirstPage = failTransferHistoryPages("first");

  await fireEvent(aisyah, "refresh");

  expect(await screen.findByText(OUT_OF_DATE)).toBeOnTheScreen();
  expect(
    screen.getByRole("button", { name: /^Aisyah Rahman/ }),
  ).toBeOnTheScreen();
  expect(
    screen.queryByText("Couldn't load your transfers."),
  ).not.toBeOnTheScreen();
  recoverFirstPage();
  serveTransferHistoryPages([[LIM_ON_4_OCTOBER]]);
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  expect(
    await screen.findByRole("button", { name: /^Lim Wei Jie/ }),
  ).toBeOnTheScreen();
  expect(screen.queryByText(OUT_OF_DATE)).not.toBeOnTheScreen();
});

it("keeps the rows it has under the notice when History opens offline", async () => {
  await renderRoute("/");
  await act(() => {
    router.push("/transfer-history");
  });
  expect(
    await screen.findByRole("button", { name: /^Aisyah Rahman/ }),
  ).toBeOnTheScreen();
  await act(() => {
    router.back();
  });
  await act(() => {
    setPhoneNetwork(OFFLINE);
  });

  await act(() => {
    router.push("/transfer-history");
  });
  await act(() => jest.advanceTimersByTimeAsync(60_000));

  expect(screen.getByText(OUT_OF_DATE)).toBeOnTheScreen();
  expect(
    screen.getByRole("button", { name: /^Aisyah Rahman/ }),
  ).toBeOnTheScreen();
  expect(sentTransferHistoryCursors()).toEqual([null]);
});

it("keeps the rows under the notice when pulled offline, and refreshes them once back online", async () => {
  await renderRoute("/transfer-history");
  const aisyah = await screen.findByRole("button", { name: /^Aisyah Rahman/ });
  serveTransferHistoryPages([[LIM_ON_4_OCTOBER]]);
  await act(() => {
    setPhoneNetwork(OFFLINE);
  });

  await fireEvent(aisyah, "refresh");

  expect(await screen.findByText(OUT_OF_DATE)).toBeOnTheScreen();
  expect(
    screen.getByRole("button", { name: /^Aisyah Rahman/ }),
  ).toBeOnTheScreen();
  await act(() => {
    setPhoneNetwork(ONLINE);
  });
  expect(
    await screen.findByRole("button", { name: /^Lim Wei Jie/ }),
  ).toBeOnTheScreen();
  expect(screen.queryByText(OUT_OF_DATE)).not.toBeOnTheScreen();
});

it("says it couldn't load the transfers when History first opens offline, and lists them once back online", async () => {
  await renderRoute("/");
  await act(() => {
    setPhoneNetwork(OFFLINE);
  });

  await act(() => {
    router.push("/transfer-history");
  });

  expect(
    await screen.findByText("Couldn't load your transfers."),
  ).toBeOnTheScreen();
  expect(screen.queryByLabelText("Loading")).not.toBeOnTheScreen();
  await act(() => {
    setPhoneNetwork(ONLINE);
  });
  expect(
    await screen.findByRole("button", { name: /^Aisyah Rahman/ }),
  ).toBeOnTheScreen();
});

it("announces no failure left from an earlier visit, only one from this visit", async () => {
  const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
  await renderRoute("/");
  await act(() => {
    router.push("/transfer-history");
  });
  const aisyah = await screen.findByRole("button", { name: /^Aisyah Rahman/ });
  failTransferHistoryPages("first");
  await fireEvent(aisyah, "refresh");
  expect(await screen.findByText(OUT_OF_DATE)).toBeOnTheScreen();
  await act(() => {
    router.back();
  });
  const releaseFirstPage = holdTransferHistoryPages("first");
  announce.mockClear();

  await act(() => {
    router.push("/transfer-history");
  });

  expect(
    screen.getByRole("button", { name: /^Aisyah Rahman/ }),
  ).toBeOnTheScreen();
  expect(screen.queryByText(OUT_OF_DATE)).not.toBeOnTheScreen();
  expect(announce).not.toHaveBeenCalled();
  releaseFirstPage();
  expect(await screen.findByText(OUT_OF_DATE)).toBeOnTheScreen();
  expect(announce).toHaveBeenCalledWith(OUT_OF_DATE);
});

it("asks the bank nothing when the app comes to the front or the connection returns", async () => {
  await renderRoute("/transfer-history");
  expect(await screen.findByText("That's everything")).toBeOnTheScreen();

  await act(() => {
    bringAppToTheFront();
  });
  await act(() => {
    setPhoneNetwork(OFFLINE);
  });
  await act(() => {
    setPhoneNetwork(ONLINE);
  });
  await act(() => jest.advanceTimersByTimeAsync(1000));

  expect(sentTransferHistoryCursors()).toEqual([null]);
});

it("hands a 401 to the session-ended view", async () => {
  failTransferHistoryPages("first", 401);
  await renderRoute("/transfer-history");

  expect(
    await screen.findByRole("header", { name: "Your session has ended" }),
  ).toBeOnTheScreen();
});

it("collapses a day to its header and expands it again, saying which it is", async () => {
  await renderRoute("/transfer-history");

  await fireEvent.press(
    await screen.findByRole("button", {
      name: "5 Oct 2026, 1 transfer, -RM 50.00",
      expanded: true,
    }),
  );

  expect(
    screen.getByRole("button", {
      name: "5 Oct 2026, 1 transfer, -RM 50.00",
      expanded: false,
    }),
  ).toBeOnTheScreen();
  expect(
    screen.queryByRole("button", { name: /^Aisyah Rahman/ }),
  ).not.toBeOnTheScreen();

  await fireEvent.press(
    screen.getByRole("button", { name: "5 Oct 2026, 1 transfer, -RM 50.00" }),
  );

  expect(
    screen.getByRole("button", {
      name: "5 Oct 2026, 1 transfer, -RM 50.00",
      expanded: true,
    }),
  ).toBeOnTheScreen();
  expect(
    screen.getByRole("button", { name: /^Aisyah Rahman/ }),
  ).toBeOnTheScreen();
});

it("keeps a collapsed day collapsed through a refresh that brings it nothing new, and opens a new day", async () => {
  await renderRoute("/transfer-history");
  await fireEvent.press(
    await screen.findByRole("button", {
      name: "5 Oct 2026, 1 transfer, -RM 50.00",
    }),
  );
  serveTransferHistoryPages([
    [
      buildHistoryTransfer({
        registeredName: "Lim Wei Jie",
        createdAt: "2026-10-06T10:20:00+08:00",
      }),
      buildHistoryTransfer(),
    ],
  ]);

  await fireEvent(
    screen.getByRole("button", { name: "5 Oct 2026, 1 transfer, -RM 50.00" }),
    "refresh",
  );

  expect(
    await screen.findByRole("button", { name: /^Lim Wei Jie/ }),
  ).toBeOnTheScreen();
  expect(
    screen.getByRole("button", {
      name: "5 Oct 2026, 1 transfer, -RM 50.00",
      expanded: false,
    }),
  ).toBeOnTheScreen();
  expect(
    screen.queryByRole("button", { name: /^Aisyah Rahman/ }),
  ).not.toBeOnTheScreen();
});

it("opens a collapsed day again when the next page brings rows it did not have", async () => {
  serveTransferHistoryPages([
    [buildHistoryTransfer()],
    [
      buildHistoryTransfer({
        registeredName: "Lim Wei Jie",
        createdAt: "2026-10-05T09:15:00+08:00",
      }),
    ],
  ]);
  const releaseLaterPages = holdTransferHistoryPages("later");
  await renderRoute("/transfer-history");
  await fireEvent.press(
    await screen.findByRole("button", {
      name: "5 Oct 2026, 2 transfers, -RM 100.00",
    }),
  );
  expect(
    screen.queryByRole("button", { name: /^Aisyah Rahman/ }),
  ).not.toBeOnTheScreen();

  releaseLaterPages();

  expect(
    await screen.findByRole("button", { name: /^Lim Wei Jie/ }),
  ).toBeOnTheScreen();
  expect(
    screen.getByRole("button", { name: /^Aisyah Rahman/ }),
  ).toBeOnTheScreen();
  expect(
    screen.getByRole("button", {
      name: "5 Oct 2026, 2 transfers, -RM 100.00",
      expanded: true,
    }),
  ).toBeOnTheScreen();
});

it("heads a day with the latest summary the bank sent for it", async () => {
  serveTransferHistoryResponses([
    {
      items: [buildHistoryTransfer()],
      days: [
        {
          date: "2026-10-05",
          count: 2,
          net: { minor: -10000, currency: "MYR" },
        },
      ],
    },
    {
      items: [
        buildHistoryTransfer({
          registeredName: "Lim Wei Jie",
          createdAt: "2026-10-05T09:15:00+08:00",
        }),
      ],
      days: [
        {
          date: "2026-10-05",
          count: 3,
          net: { minor: -15000, currency: "MYR" },
        },
      ],
    },
  ]);
  const releaseLaterPages = holdTransferHistoryPages("later");
  await renderRoute("/transfer-history");
  expect(
    await screen.findByRole("button", {
      name: "5 Oct 2026, 2 transfers, -RM 100.00",
    }),
  ).toBeOnTheScreen();

  releaseLaterPages();

  expect(
    await screen.findByRole("button", {
      name: "5 Oct 2026, 3 transfers, -RM 150.00",
    }),
  ).toBeOnTheScreen();
});

it("keeps a day open that a later page reopened when a pull trims that page away", async () => {
  serveTransferHistoryPages([
    [buildHistoryTransfer()],
    [
      buildHistoryTransfer({
        registeredName: "Lim Wei Jie",
        createdAt: "2026-10-05T09:15:00+08:00",
      }),
    ],
  ]);
  const releaseLaterPages = holdTransferHistoryPages("later");
  await renderRoute("/transfer-history");
  await fireEvent.press(
    await screen.findByRole("button", {
      name: "5 Oct 2026, 2 transfers, -RM 100.00",
    }),
  );
  releaseLaterPages();
  expect(
    await screen.findByRole("button", { name: /^Lim Wei Jie/ }),
  ).toBeOnTheScreen();
  const releaseLaterPagesAgain = holdTransferHistoryPages("later");

  await fireEvent(
    screen.getByRole("button", { name: /^Aisyah Rahman/ }),
    "refresh",
  );
  await act(() => jest.advanceTimersByTimeAsync(1000));

  expect(
    screen.getByRole("button", {
      name: "5 Oct 2026, 2 transfers, -RM 100.00",
      expanded: true,
    }),
  ).toBeOnTheScreen();
  expect(
    screen.getByRole("button", { name: /^Aisyah Rahman/ }),
  ).toBeOnTheScreen();
  releaseLaterPagesAgain();
  expect(
    await screen.findByRole("button", { name: /^Lim Wei Jie/ }),
  ).toBeOnTheScreen();
});

it("moves a day from Today to Yesterday at Malaysian midnight", async () => {
  const today = toMalaysianDateKey(new Date().toISOString());
  serveTransferHistoryPages([
    [buildHistoryTransfer({ createdAt: `${today}T00:00:00+08:00` })],
  ]);
  await renderRoute("/transfer-history");
  expect(
    await screen.findByRole("button", {
      name: "Today, 1 transfer, -RM 50.00",
    }),
  ).toBeOnTheScreen();
  const tomorrow = toMalaysianDateKey(
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  );

  await act(() => {
    jest.advanceTimersByTime(
      Date.parse(`${tomorrow}T00:00:00+08:00`) - Date.now(),
    );
  });

  expect(
    screen.getByRole("button", { name: "Yesterday, 1 transfer, -RM 50.00" }),
  ).toBeOnTheScreen();
});

it("moves a day from Today to Yesterday when the app returns after Malaysian midnight", async () => {
  const today = toMalaysianDateKey(new Date().toISOString());
  serveTransferHistoryPages([
    [buildHistoryTransfer({ createdAt: `${today}T00:00:00+08:00` })],
  ]);
  await renderRoute("/transfer-history");
  expect(
    await screen.findByRole("button", {
      name: "Today, 1 transfer, -RM 50.00",
    }),
  ).toBeOnTheScreen();
  const tomorrow = toMalaysianDateKey(
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  );
  // The clock moves with no timer firing, as it does for an app the phone suspended.
  jest.setSystemTime(Date.parse(`${tomorrow}T00:00:01+08:00`));

  await act(() => {
    bringAppToTheFront();
  });

  expect(
    screen.getByRole("button", { name: "Yesterday, 1 transfer, -RM 50.00" }),
  ).toBeOnTheScreen();
});

it.each([
  ["a sent transfer", {}, "Successful -RM 50.00"],
  [
    "a received transfer",
    { direction: TransferDirection.In, funds: TransferFunds.Credited },
    "Received +RM 50.00",
  ],
  [
    "a transfer still processing",
    { status: TransferStatus.Processing },
    "Processing -RM 50.00",
  ],
  [
    "a transfer held for a security check",
    { status: TransferStatus.Processing, underReview: true },
    "Held for a security check -RM 50.00",
  ],
  [
    "an unsuccessful transfer whose money never left",
    { status: TransferStatus.Unsuccessful, funds: TransferFunds.NotDebited },
    "Unsuccessful RM 50.00",
  ],
  [
    "an unsuccessful transfer whose refund is on its way",
    { status: TransferStatus.Unsuccessful, funds: TransferFunds.RefundPending },
    "Unsuccessful -RM 50.00",
  ],
  [
    "an unsuccessful transfer whose money came back",
    { status: TransferStatus.Unsuccessful, funds: TransferFunds.Refunded },
    "Unsuccessful RM 50.00",
  ],
])(
  "shows %s with its status and the money it moved",
  async (_, transfer, statusAndAmount) => {
    serveTransferHistoryPages([[buildHistoryTransfer(transfer)]]);
    await renderRoute("/transfer-history");

    expect(
      await screen.findByRole("button", {
        name: `Aisyah Rahman 3:42 pm · ${statusAndAmount}`,
      }),
    ).toBeOnTheScreen();
  },
);

it("shows when a transfer was sent, though it settled at another minute", async () => {
  serveTransferHistoryPages([
    [buildHistoryTransfer({ updatedAt: "2026-10-06T09:05:00+08:00" })],
  ]);
  await renderRoute("/transfer-history");

  expect(
    await screen.findByRole("button", {
      name: "Aisyah Rahman 3:42 pm · Successful -RM 50.00",
    }),
  ).toBeOnTheScreen();
});

it("still lists a transfer whose amount it cannot read", async () => {
  serveTransferHistoryPages([
    [buildHistoryTransfer({ amount: { minor: 50.5, currency: "MYR" } })],
  ]);
  await renderRoute("/transfer-history");

  expect(
    await screen.findByRole("button", {
      name: "Aisyah Rahman 3:42 pm · Successful",
    }),
  ).toBeOnTheScreen();
});

it("keeps transfers whose time it cannot read in their place without a time, reporting them once for the page", async () => {
  serveTransferHistoryPages([
    [
      TAN_ON_6_OCTOBER,
      LIM_AT_AN_UNREADABLE_TIME,
      buildHistoryTransfer({
        registeredName: "Ng Siew Lan",
        createdAt: "",
      }),
      buildHistoryTransfer(),
    ],
  ]);
  await renderRoute("/transfer-history");

  expect(
    await screen.findByRole("button", {
      name: "Lim Wei Jie Successful -RM 50.00",
    }),
  ).toBeOnTheScreen();
  expect(
    screen.getByRole("button", { name: "Ng Siew Lan Successful -RM 50.00" }),
  ).toBeOnTheScreen();
  expect(
    screen.getByRole("button", { name: /^Tan Mei Ling 9:00 am/ }),
  ).toBeOnTheScreen();
  expect(
    screen.getByRole("button", { name: /^Aisyah Rahman 3:42 pm/ }),
  ).toBeOnTheScreen();
  expect(
    observedRecords.filter(
      ({ name }) => name === "transfer_history_unreadable_times",
    ),
  ).toEqual([
    {
      type: "event",
      name: "transfer_history_unreadable_times",
      properties: { count: 2 },
    },
  ]);
});

it("folds a transfer whose time it cannot read away with its neighbour's day, which a pull leaves folded", async () => {
  serveTransferHistoryPages([
    [TAN_ON_6_OCTOBER, LIM_AT_AN_UNREADABLE_TIME, buildHistoryTransfer()],
  ]);
  await renderRoute("/transfer-history");

  await fireEvent.press(
    await screen.findByRole("button", {
      name: "6 Oct 2026, 1 transfer, -RM 50.00",
    }),
  );

  expect(
    screen.getByRole("button", {
      name: "6 Oct 2026, 1 transfer, -RM 50.00",
      expanded: false,
    }),
  ).toBeOnTheScreen();
  expect(
    screen.queryByRole("button", { name: /^Lim Wei Jie/ }),
  ).not.toBeOnTheScreen();
  expect(
    screen.queryByRole("button", { name: /^Tan Mei Ling/ }),
  ).not.toBeOnTheScreen();
  await fireEvent(
    screen.getByRole("button", { name: /^Aisyah Rahman/ }),
    "refresh",
  );
  await act(() => jest.advanceTimersByTimeAsync(1000));
  expect(
    screen.getByRole("button", {
      name: "6 Oct 2026, 1 transfer, -RM 50.00",
      expanded: false,
    }),
  ).toBeOnTheScreen();
  expect(
    screen.queryByRole("button", { name: /^Lim Wei Jie/ }),
  ).not.toBeOnTheScreen();
});

it("loads on past a later page holding a transfer whose time it cannot read", async () => {
  serveTransferHistoryPages([
    [buildHistoryTransfer()],
    [LIM_AT_AN_UNREADABLE_TIME],
  ]);
  await renderRoute("/transfer-history");

  expect(
    await screen.findByRole("button", {
      name: "Lim Wei Jie Successful -RM 50.00",
    }),
  ).toBeOnTheScreen();
  expect(screen.getByText("That's everything")).toBeOnTheScreen();
  expect(screen.queryByText("Couldn't load more.")).not.toBeOnTheScreen();
});

it("pages through the bank's own history, its split day whole from the first page", async () => {
  mswServer.resetHandlers();
  const releaseLaterPages = holdTransferHistoryPages("later");
  await renderRoute("/transfer-history");

  expect(
    await screen.findByRole("button", {
      name: "26 Sep 2026, 5 transfers, -RM 801.73",
    }),
  ).toBeOnTheScreen();
  releaseLaterPages();

  await waitFor(() => {
    expect(screen.getAllByRole("button", { name: / · / })).toHaveLength(45);
  });
  expect(screen.getByText("That's everything")).toBeOnTheScreen();
  expect(sentTransferHistoryCursors()).toEqual([null, expect.any(String)]);
});
