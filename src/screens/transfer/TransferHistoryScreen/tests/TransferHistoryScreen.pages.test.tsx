import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import {
  buildHistoryTransfer,
  holdTransferHistoryPages,
  serveTransferHistoryPages,
} from "@/test/fixtures/transfer-responses";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import {
  lookUpTestRecipient,
  mswServer,
  sentRequests,
} from "@/test/mock-bank/mock-bank";
import { scenarioTest } from "@/test/render/drive-app";
import { renderRoute } from "@/test/render/render-route";

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

it("shows the transfers it has at once on an open 30 s later, then the newest page in their place", async () => {
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
  await act(() => jest.advanceTimersByTimeAsync(30_000));
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

it("draws every page it loaded and asks nothing on an open within 30 s of reading the newest page, then asks for that page once", async () => {
  serveTransferHistoryPages([[buildHistoryTransfer()], [LIM_ON_4_OCTOBER]]);
  const releaseLaterPages = holdTransferHistoryPages("later");
  await renderRoute("/");
  await act(() => {
    router.push("/transfer-history");
  });
  expect(
    await screen.findByRole("button", { name: /^Aisyah Rahman/ }),
  ).toBeOnTheScreen();
  // A later page landing late must restart nothing: the 30 s run from the newest page's read.
  await act(() => jest.advanceTimersByTimeAsync(8_000));
  releaseLaterPages();
  expect(
    await screen.findByRole("button", { name: /^Lim Wei Jie/ }),
  ).toBeOnTheScreen();
  await act(() => {
    router.back();
  });
  const requestCountBeforeQuickOpen = sentTransferHistoryCursors().length;

  await act(() => {
    router.push("/transfer-history");
  });
  await act(() => jest.advanceTimersByTimeAsync(1000));

  expect(
    screen.getByRole("button", { name: /^Aisyah Rahman/ }),
  ).toBeOnTheScreen();
  expect(
    screen.getByRole("button", { name: /^Lim Wei Jie/ }),
  ).toBeOnTheScreen();
  expect(
    sentTransferHistoryCursors().slice(requestCountBeforeQuickOpen),
  ).toEqual([]);
  await act(() => {
    router.back();
  });
  await act(() => jest.advanceTimersByTimeAsync(22_000));
  const requestCountBeforeLateOpen = sentTransferHistoryCursors().length;

  await act(() => {
    router.push("/transfer-history");
  });
  await act(() => jest.advanceTimersByTimeAsync(1000));

  expect(
    sentTransferHistoryCursors()
      .slice(requestCountBeforeLateOpen)
      .filter((cursor) => cursor === null),
  ).toHaveLength(1);
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
    const transferButton = await screen.findByRole("button", {
      name: "Transfer",
    });
    const requestCountBeforeTransfer = sentTransferHistoryCursors().length;
    await fireEvent.press(transferButton);
    await fireEvent.press(await screen.findByRole("button", { name: "Done" }));

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
      sentTransferHistoryCursors().slice(requestCountBeforeTransfer),
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

const sentTransferHistoryCursors = () =>
  sentRequests
    .map(({ url }) => new URL(url))
    .filter(({ pathname }) => pathname.endsWith("/transfers"))
    .map(({ searchParams }) => searchParams.get("cursor"));

const LIM_ON_4_OCTOBER = buildHistoryTransfer({
  registeredName: "Lim Wei Jie",
  createdAt: "2026-10-04T13:05:00+08:00",
});
