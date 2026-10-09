import { act, fireEvent, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import { pressHardwareBack } from "@/test/hardware-back";
import { setPhoneNetwork } from "@/test/harness/native-doubles";
import { renderRoute } from "@/test/render-route";
import {
  failTransferDetails,
  serveTransferDetails,
} from "@/test/transfer-details-responses";
import {
  buildHistoryTransfer,
  serveTransferHistoryPages,
} from "@/test/transfer-history-pages";

const AISYAH = buildHistoryTransfer();
const OFFLINE = { isConnected: false, isInternetReachable: false };
const ONLINE = { isConnected: true, isInternetReachable: true };
const OUT_OF_DATE = "Couldn't refresh — these details may be out of date";

it("keeps a transfer from its History row under the notice when opened offline, offering no Try again, and shows the bank's once back online", async () => {
  serveTransferDetails({ ...AISYAH, version: 2, note: "Lunch" });
  await renderRoute("/transfer-history");
  const aisyah = await screen.findByRole("button", { name: /^Aisyah Rahman/ });
  await act(() => {
    setPhoneNetwork(OFFLINE);
  });

  await fireEvent.press(aisyah);

  expect(await screen.findByText(OUT_OF_DATE)).toBeOnTheScreen();
  expect(screen.getByText("Aisyah Rahman")).toBeOnTheScreen();
  expect(screen.queryByText("Lunch")).not.toBeOnTheScreen();
  expect(
    screen.queryByRole("button", { name: "Try again" }),
  ).not.toBeOnTheScreen();
  await act(() => {
    setPhoneNetwork(ONLINE);
  });

  expect(await screen.findByText("Lunch")).toBeOnTheScreen();
  expect(screen.queryByText(OUT_OF_DATE)).not.toBeOnTheScreen();
});

it("keeps the transfer it has under the notice when reopened offline, offering no Try again, and refreshes it once back online", async () => {
  serveTransferDetails({ ...AISYAH, version: 2, note: "Lunch" });
  await renderRoute("/transfer-history");
  await fireEvent.press(
    await screen.findByRole("button", { name: /^Aisyah Rahman/ }),
  );
  await screen.findByText("Lunch");
  await pressHardwareBack();
  serveTransferDetails({ ...AISYAH, version: 3, note: "Dinner" });
  await act(() => {
    setPhoneNetwork(OFFLINE);
  });

  await fireEvent.press(
    await screen.findByRole("button", { name: /^Aisyah Rahman/ }),
  );

  expect(await screen.findByText(OUT_OF_DATE)).toBeOnTheScreen();
  expect(screen.getByText("Lunch")).toBeOnTheScreen();
  expect(
    screen.queryByRole("button", { name: "Try again" }),
  ).not.toBeOnTheScreen();
  await act(() => {
    setPhoneNetwork(ONLINE);
  });

  expect(await screen.findByText("Dinner")).toBeOnTheScreen();
  expect(screen.queryByText(OUT_OF_DATE)).not.toBeOnTheScreen();
});

it("says it couldn't load a transfer opened offline with nothing loaded, offering no Try again, and shows it once back online", async () => {
  serveTransferHistoryPages([[]]);
  serveTransferDetails(AISYAH);
  await renderRoute("/");
  await act(() => {
    setPhoneNetwork(OFFLINE);
  });

  await act(() => {
    router.push(`/transfer-history/${AISYAH.transferId}`);
  });

  expect(
    await screen.findByText("Couldn't load this transfer."),
  ).toBeOnTheScreen();
  expect(
    screen.queryByRole("button", { name: "Try again" }),
  ).not.toBeOnTheScreen();
  expect(screen.queryByLabelText("Loading")).not.toBeOnTheScreen();
  await act(() => {
    setPhoneNetwork(ONLINE);
  });

  expect(await screen.findByText("Aisyah Rahman")).toBeOnTheScreen();
});

it("offers Try again on a transfer it couldn't load only while the phone has a connection, and shows the transfer on one pressed once back online", async () => {
  serveTransferHistoryPages([[]]);
  serveTransferDetails(AISYAH);
  const recoverDetails = failTransferDetails();
  await renderRoute(`/transfer-history/${AISYAH.transferId}`);
  expect(
    await screen.findByText("Couldn't load this transfer."),
  ).toBeOnTheScreen();

  await act(() => {
    setPhoneNetwork(OFFLINE);
  });

  expect(
    screen.queryByRole("button", { name: "Try again" }),
  ).not.toBeOnTheScreen();
  await act(() => {
    setPhoneNetwork(ONLINE);
  });
  expect(
    await screen.findByRole("button", { name: "Try again" }),
  ).toBeOnTheScreen();
  recoverDetails();
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));

  expect(await screen.findByText("Aisyah Rahman")).toBeOnTheScreen();
});
