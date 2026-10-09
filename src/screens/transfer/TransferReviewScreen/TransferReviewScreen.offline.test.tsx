import { act, fireEvent, screen } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";

import { requestJson } from "@/shared/http/transport";
import { lookUpTestRecipient } from "@/test/bank-client";
import { clearTransferScenario } from "@/test/clear-transfer-scenario";
import { mswServer, sentRequests } from "@/test/msw-server";
import { pickTransferScenario } from "@/test/pick-transfer-scenario";
import { renderRoute } from "@/test/render-route";
import { scenarioTest } from "@/test/scenario-test";

const RECIPIENT_MOBILE = "012-345 6789";
const OFFLINE_NOTICE =
  "You're offline. Sending is paused until Ryt can be reached.";

async function openReviewWhileNoRequestReachesTheBank() {
  await renderRoute("/transfer");
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    RECIPIENT_MOBILE,
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("RM 12,845.50");
  await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
  mswServer.use(http.all("*", () => HttpResponse.error()));
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  await screen.findByRole("button", { name: "Try again" });
}

it(
  "says sending is paused on review too, and lets the transfer go ahead once a request reaches the bank",
  scenarioTest("transfer.offline", async () => {
    // Offline from the start, no balance loads and review is never reached: the phone goes offline at the amount step.
    clearTransferScenario();
    const { recipient } = await lookUpTestRecipient(RECIPIENT_MOBILE);
    await renderRoute("/transfer");
    await fireEvent.changeText(
      await screen.findByLabelText("DuitNow mobile number"),
      RECIPIENT_MOBILE,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("RM 12,845.50");
    await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
    pickTransferScenario("transfer.offline");

    await fireEvent.press(screen.getByRole("button", { name: "Review" }));

    expect(await screen.findByText(OFFLINE_NOTICE)).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Transfer" })).toBeNull();
    clearTransferScenario();
    await act(() => jest.advanceTimersByTimeAsync(10_000));
    expect(await screen.findByText(recipient.registeredName)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Transfer" })).toBeEnabled();
    expect(screen.queryByText(OFFLINE_NOTICE)).toBeNull();
  }),
);

it("checks the name again by itself once a request reaches the bank, after review opened while none could", async () => {
  const { recipient } = await lookUpTestRecipient(RECIPIENT_MOBILE);
  await openReviewWhileNoRequestReachesTheBank();
  mswServer.resetHandlers();

  // The amount step's balance poll, still mounted under review, is the request that gets through.
  await act(() => jest.advanceTimersByTimeAsync(10_000));

  expect(await screen.findByText(recipient.registeredName)).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Transfer" })).toBeEnabled();
});

it("goes back to its loader while it checks the name again, until that answer lands", async () => {
  const { recipient } = await lookUpTestRecipient(RECIPIENT_MOBILE);
  await openReviewWhileNoRequestReachesTheBank();
  mswServer.resetHandlers();
  let answerTheNameCheck: () => void = () => undefined;
  const nameCheckHeld = new Promise<void>((answer) => {
    answerTheNameCheck = answer;
  });
  mswServer.use(
    http.post(
      "*/recipients/lookup",
      async () => {
        await nameCheckHeld;
      },
      { once: true },
    ),
  );

  await act(() => jest.advanceTimersByTimeAsync(10_000));

  expect(screen.getByLabelText("Loading")).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  answerTheNameCheck();
  expect(await screen.findByText(recipient.registeredName)).toBeOnTheScreen();
});

it("never checks an answered name again once a request reaches the bank after one found none, so its reference stays", async () => {
  const { recipient } = await lookUpTestRecipient(RECIPIENT_MOBILE);
  await renderRoute("/transfer");
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    RECIPIENT_MOBILE,
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("RM 12,845.50");
  await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  await screen.findByText(recipient.registeredName);
  const nameChecksAnswered = sentRequests.filter(({ url }) =>
    url.endsWith("/recipients/lookup"),
  ).length;
  mswServer.use(http.all("*", () => HttpResponse.error(), { once: true }));
  await act(async () => {
    await requestJson("/accounts/primary").catch(() => undefined);
  });

  await act(async () => {
    const accountRead = requestJson("/accounts/primary");
    await jest.advanceTimersByTimeAsync(1_000);
    await accountRead;
  });
  await act(() => jest.advanceTimersByTimeAsync(1_000));

  expect(
    sentRequests.filter(({ url }) => url.endsWith("/recipients/lookup")),
  ).toHaveLength(nameChecksAnswered);
  expect(screen.getByText(recipient.registeredName)).toBeOnTheScreen();
});

it("checks the name again only once while it still finds no network, never bringing the offline notice back, and review keeps its Try again", async () => {
  await openReviewWhileNoRequestReachesTheBank();
  mswServer.resetHandlers();
  mswServer.use(http.post("*/recipients/lookup", () => HttpResponse.error()));
  const countNameChecksSent = () =>
    sentRequests.filter(({ url }) => url.endsWith("/recipients/lookup")).length;
  const nameChecksBeforeTheBankAnswered = countNameChecksSent();

  await act(() => jest.advanceTimersByTimeAsync(10_000));
  const nameChecksOnceTheBankAnswered = countNameChecksSent();
  const offlineOnceTheCheckFoundNoNetworkAgain =
    screen.queryByText(OFFLINE_NOTICE) !== null;
  await act(() => jest.advanceTimersByTimeAsync(11_000));

  expect(nameChecksOnceTheBankAnswered).toBeGreaterThan(
    nameChecksBeforeTheBankAnswered,
  );
  expect(countNameChecksSent()).toBe(nameChecksOnceTheBankAnswered);
  expect(offlineOnceTheCheckFoundNoNetworkAgain).toBe(false);
  expect(screen.queryByText(OFFLINE_NOTICE)).toBeNull();
  expect(
    screen.getByText(
      "Something unexpected stopped the transfer — no money moved.",
    ),
  ).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Try again" })).toBeOnTheScreen();
});
