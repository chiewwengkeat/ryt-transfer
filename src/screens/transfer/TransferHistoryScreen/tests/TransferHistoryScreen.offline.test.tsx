import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import { moveAppTo } from "@/test/render/drive-app";
import { setPhoneNetwork } from "@/test/doubles/native-doubles";
import { sentRequests } from "@/test/mock-bank/mock-bank";
import { renderRoute } from "@/test/render/render-route";
import {
  buildHistoryTransfer,
  failTransferHistoryPages,
  serveTransferHistoryPages,
} from "@/test/fixtures/transfer-responses";

import { OUT_OF_DATE } from "./TransferHistoryScreen.helper";

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

it("keeps the rows it has under the notice, offering no Try again, when History opens offline", async () => {
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
    screen.queryByRole("button", { name: "Try again" }),
  ).not.toBeOnTheScreen();
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

it("says it couldn't load the transfers when History first opens offline, offering no Try again, and lists them once back online", async () => {
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
  expect(
    screen.queryByRole("button", { name: "Try again" }),
  ).not.toBeOnTheScreen();
  expect(screen.queryByLabelText("Loading")).not.toBeOnTheScreen();
  await act(() => {
    setPhoneNetwork(ONLINE);
  });
  expect(
    await screen.findByRole("button", { name: /^Aisyah Rahman/ }),
  ).toBeOnTheScreen();
});

it("offers no Try again on a first page that failed while the phone has no connection, and lists the transfers on one pressed once back online", async () => {
  const recoverFirstPage = failTransferHistoryPages("first");
  await renderRoute("/transfer-history");
  expect(
    await screen.findByText("Couldn't load your transfers."),
  ).toBeOnTheScreen();

  await act(() => {
    setPhoneNetwork(OFFLINE);
  });

  expect(
    screen.queryByRole("button", { name: "Try again" }),
  ).not.toBeOnTheScreen();
  recoverFirstPage();
  await act(() => {
    setPhoneNetwork(ONLINE);
  });
  await fireEvent.press(
    await screen.findByRole("button", { name: "Try again" }),
  );

  expect(
    await screen.findByRole("button", { name: /^Aisyah Rahman/ }),
  ).toBeOnTheScreen();
});

it("offers no Try again under a failed refresh's notice while the phone has no connection, and refreshes on one pressed once back online", async () => {
  await renderRoute("/transfer-history");
  const aisyah = await screen.findByRole("button", { name: /^Aisyah Rahman/ });
  const recoverFirstPage = failTransferHistoryPages("first");
  await fireEvent(aisyah, "refresh");
  expect(await screen.findByText(OUT_OF_DATE)).toBeOnTheScreen();

  await act(() => {
    setPhoneNetwork(OFFLINE);
  });

  expect(
    screen.queryByRole("button", { name: "Try again" }),
  ).not.toBeOnTheScreen();
  recoverFirstPage();
  serveTransferHistoryPages([[LIM_ON_4_OCTOBER]]);
  await act(() => {
    setPhoneNetwork(ONLINE);
  });
  await fireEvent.press(
    await screen.findByRole("button", { name: "Try again" }),
  );

  expect(
    await screen.findByRole("button", { name: /^Lim Wei Jie/ }),
  ).toBeOnTheScreen();
  expect(screen.queryByText(OUT_OF_DATE)).not.toBeOnTheScreen();
});

it("offers no Retry for an older page that failed while the phone has no connection, says nothing is out of date, and loads the page on one pressed once back online", async () => {
  serveTransferHistoryPages([[buildHistoryTransfer()], [LIM_ON_4_OCTOBER]]);
  const recoverLaterPages = failTransferHistoryPages("later");
  await renderRoute("/transfer-history");
  expect(await screen.findByText("Couldn't load more.")).toBeOnTheScreen();

  await act(() => {
    setPhoneNetwork(OFFLINE);
  });

  expect(screen.queryByRole("button", { name: "Retry" })).not.toBeOnTheScreen();
  expect(screen.queryByText(OUT_OF_DATE)).not.toBeOnTheScreen();
  recoverLaterPages();
  await act(() => {
    setPhoneNetwork(ONLINE);
  });
  await fireEvent.press(await screen.findByRole("button", { name: "Retry" }));

  expect(
    await screen.findByRole("button", { name: /^Lim Wei Jie/ }),
  ).toBeOnTheScreen();
});

it("asks the bank nothing when the app comes to the front or the connection returns", async () => {
  await renderRoute("/transfer-history");
  expect(await screen.findByText("That's everything")).toBeOnTheScreen();

  await act(() => {
    moveAppTo("background");
    moveAppTo("active");
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
const OFFLINE = { isConnected: false, isInternetReachable: false };
const ONLINE = { isConnected: true, isInternetReachable: true };
