import { act, fireEvent, screen } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";
import { AccessibilityInfo } from "react-native";

import { moveAppTo, scenarioTest } from "@/test/render/drive-app";
import {
  setPhoneNetwork,
  reportedScenarios,
} from "@/test/doubles/native-doubles";
import { mswServer, sentRequests } from "@/test/mock-bank/mock-bank";
import { renderRoute } from "@/test/render/render-route";

it("says in the bank sheet that the banks wait for a connection, offering Try again, once the phone has none", async () => {
  mswServer.use(
    http.get("*/banks", () =>
      HttpResponse.json(UNKNOWN_BANK_CODE, { status: 400 }),
    ),
  );
  await renderRoute("/transfer");
  await fireEvent.press(
    await screen.findByRole("radio", { name: "Account number" }),
  );
  await fireEvent.press(screen.getByRole("button", { name: "Bank" }));
  const banksUnexpected = await screen.findByText(
    "Something unexpected went wrong.",
  );

  await act(() => {
    setPhoneNetwork({ isConnected: false, isInternetReachable: false });
  });

  expect(banksUnexpected).not.toBeOnTheScreen();
  expect(screen.getByText(OFFLINE_NOTICE)).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Try again" })).toBeOnTheScreen();
  expect(screen.getByLabelText("Search banks")).toBeOnTheScreen();
});

it("says in the bank sheet that the banks wait for a connection when asking for them finds none, again after a Try again that finds none, and lists them on one that gets through", async () => {
  const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
  const timesSaid = () =>
    announce.mock.calls.filter(([words]) => words === OFFLINE_NOTICE).length;
  mswServer.use(http.all("*", () => HttpResponse.error()));
  await renderRoute("/transfer");
  await fireEvent.press(
    await screen.findByRole("radio", { name: "Account number" }),
  );
  await fireEvent.press(screen.getByRole("button", { name: "Bank" }));
  await fireEvent.press(
    await screen.findByRole("button", { name: "Try again" }),
  );
  const saidBeforeItsAnswer = timesSaid();
  await act(() => jest.advanceTimersByTimeAsync(1_000));
  const saidOnceItFoundNone = timesSaid();

  mswServer.resetHandlers();
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));

  expect(
    await screen.findByRole("button", { name: "Public Bank" }),
  ).toBeOnTheScreen();
  expect(saidOnceItFoundNone).toBe(saidBeforeItsAnswer + 1);
});

it("asks the bank for its list on a Try again pressed while the phone has no connection, and lists the banks by itself once the phone is back", async () => {
  const bankListReads = () =>
    sentRequests.filter(({ url }) => new URL(url).pathname.endsWith("/banks"))
      .length;
  await renderRoute("/transfer");
  const accountNumber = await screen.findByRole("radio", {
    name: "Account number",
  });
  await act(() => {
    setPhoneNetwork({ isConnected: false, isInternetReachable: false });
  });
  mswServer.use(http.all("*", () => HttpResponse.error()));
  await fireEvent.press(accountNumber);
  await fireEvent.press(screen.getByRole("button", { name: "Bank" }));
  const tryAgain = await screen.findByRole("button", { name: "Try again" });
  const readsBeforeThePress = bankListReads();

  await fireEvent.press(tryAgain);
  await act(() => jest.advanceTimersByTimeAsync(5_000));

  expect(bankListReads()).toBeGreaterThan(readsBeforeThePress);
  expect(screen.getByText(OFFLINE_NOTICE)).toBeOnTheScreen();
  mswServer.resetHandlers();
  await act(() => {
    setPhoneNetwork({ isConnected: true, isInternetReachable: true });
  });
  expect(
    await screen.findByRole("button", { name: "Public Bank" }),
  ).toBeOnTheScreen();
});

it("neither asks for the banks again nor says it is offline again when the app returns to the front with the bank sheet open and no connection", async () => {
  const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
  const timesSaid = () =>
    announce.mock.calls.filter(([words]) => words === OFFLINE_NOTICE).length;
  const bankListReads = () =>
    sentRequests.filter(({ url }) => new URL(url).pathname.endsWith("/banks"))
      .length;
  await renderRoute("/transfer");
  const accountNumber = await screen.findByRole("radio", {
    name: "Account number",
  });
  await act(() => {
    setPhoneNetwork({ isConnected: false, isInternetReachable: false });
  });
  mswServer.use(http.all("*", () => HttpResponse.error()));
  await fireEvent.press(accountNumber);
  await fireEvent.press(screen.getByRole("button", { name: "Bank" }));
  await screen.findByRole("button", { name: "Try again" });
  await act(() => jest.advanceTimersByTimeAsync(5_000));
  const readsBeforeTheReturn = bankListReads();
  const saidBeforeTheReturn = timesSaid();

  moveAppTo("background");
  moveAppTo("active");
  await act(() => jest.advanceTimersByTimeAsync(5_000));

  expect(bankListReads()).toBe(readsBeforeTheReturn);
  expect(timesSaid()).toBe(saidBeforeTheReturn);
});

it(
  "says sending is paused on the recipient step too, where typing an ID and moving on stay open",
  scenarioTest("transfer.offline", async () => {
    const view = await renderRoute("/transfer");

    expect(await screen.findByText(OFFLINE_NOTICE)).toBeOnTheScreen();
    await fireEvent.changeText(
      screen.getByLabelText("DuitNow mobile number"),
      "012-345 6789",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));

    expect(view.getPathname()).toBe("/transfer/amount");
    expect(screen.getByText(OFFLINE_NOTICE)).toBeOnTheScreen();
    expect(reportedScenarios()).toContain("transfer.offline");
  }),
);

it("reports being offline again when the connection drops a second time on the recipient step", async () => {
  await renderRoute("/transfer");
  await screen.findByLabelText("DuitNow mobile number");

  for (const connected of [false, true, false])
    await act(() => {
      setPhoneNetwork({
        isConnected: connected,
        isInternetReachable: connected,
      });
    });

  expect(screen.getByText(OFFLINE_NOTICE)).toBeOnTheScreen();
  expect(
    reportedScenarios().filter((scenario) => scenario === "transfer.offline"),
  ).toHaveLength(2);
});

const UNKNOWN_BANK_CODE = {
  error: { code: "NEW_BANK_CODE", message: "Unknown to this app." },
};
const OFFLINE_NOTICE =
  "You're offline. Sending is paused until Ryt can be reached.";
