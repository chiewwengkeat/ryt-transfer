import { act, fireEvent, screen } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";

import type { GetPrimaryAccountResponse } from "@/domains/account/api/get-primary-account/get-primary-account.type";
import {
  type GetTransferResponse,
  TransferStatus,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import {
  PendingTransferStage,
  writePendingTransfer,
} from "@/domains/transfer/lib/pending-transfers/pending-transfers";
import { requestJson } from "@/shared/http/transport/transport";
import { sendToBank, startTestTransfer } from "@/test/mock-bank/bank-client";
import { clearTransferScenario } from "@/test/mock-bank/clear-transfer-scenario";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import { reportedScenarios } from "@/test/doubles/recording-sink";
import { mswServer } from "@/test/mock-bank/msw-server";
import { relaunchApp, renderRoute } from "@/test/render/render-route";
import { scenarioTest } from "@/test/render/scenario-test";

const STILL_CHECKED =
  "Your last transfer is still being checked. If you contact us, quote this reference:";

async function sendRm100FromHomeToTheResultPage() {
  await pairPhoneAsTheDemoLaunchDoes();
  const view = await renderRoute("/");
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer", disabled: false }),
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
  // Long enough for an approval whose answer is lost to be sent twice more, seconds apart.
  await screen.findByRole("button", { name: "Done" }, { timeout: 10_000 });
  return view;
}

async function endTheSession() {
  mswServer.use(http.all("*", () => new HttpResponse(null, { status: 401 })));
  await act(async () => {
    await requestJson("/any-request").catch(() => undefined);
  });
}

it(
  "covers the app with its own screen, offering only to sign in again, when the bank says the session has ended",
  scenarioTest("transfer.session_ended", async () => {
    await renderRoute("/");

    expect(
      await screen.findByRole("header", { name: "Your session has ended" }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText("For your security, sign in again to carry on."),
    ).toBeOnTheScreen();
    expect(
      screen
        .getAllByRole("button")
        .map((button) => button.props.accessibilityLabel as unknown),
    ).toEqual(["Sign in again"]);
    expect(reportedScenarios()).toContain("transfer.session_ended");
  }),
);

it(
  "covers a transfer under way when the session ends there, and returns to its step once they sign in again",
  scenarioTest("transfer.session_ended", async () => {
    const view = await renderRoute("/transfer");
    expect(
      await screen.findByRole("header", { name: "Your session has ended" }),
    ).toBeOnTheScreen();

    clearTransferScenario();
    await fireEvent.press(
      screen.getByRole("button", { name: "Sign in again" }),
    );

    expect(
      screen.queryByRole("header", { name: "Your session has ended" }),
    ).toBeNull();
    expect(
      await screen.findByLabelText("DuitNow mobile number"),
    ).toBeOnTheScreen();
    expect(view.getPathname()).toBe("/transfer");
  }),
);

it(
  "quotes the bank's reference for a transfer still processing when the session ends",
  scenarioTest("transfer.processing", async () => {
    const view = await sendRm100FromHomeToTheResultPage();
    // The bank answers after a delay, which the route's fake timers would hold forever.
    jest.useRealTimers();
    const { body } = await sendToBank<GetTransferResponse>(
      "GET",
      view.getPathname()?.replace("/transfer/result", "/transfers") ?? "",
    );

    await endTheSession();

    expect(
      await screen.findByText(`${STILL_CHECKED} ${body.transfer.reference}`),
    ).toBeOnTheScreen();
  }),
);

it(
  "quotes the bank's reference that the result page quoted when the session ends after a relaunch whose read of the transfer fails",
  scenarioTest("transfer.processing", async () => {
    const view = await sendRm100FromHomeToTheResultPage();
    const quotedOnResult = await screen.findByText(
      /^If you contact us, quote this reference: \d{8}[\dA-F]{8}$/,
    );
    const reference = String(quotedOnResult.props.children).replace(
      "If you contact us, quote this reference: ",
      "",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    await screen.findByText(/still being checked/);
    mswServer.use(
      http.get(
        "*/transfers/:transferId",
        () => new HttpResponse(null, { status: 503 }),
      ),
    );
    await relaunchApp(view);
    await screen.findByText(/still being checked/);

    await endTheSession();

    expect(
      await screen.findByText(`${STILL_CHECKED} ${reference}`),
    ).toBeOnTheScreen();
  }),
);

it(
  "quotes the transfer's id when the session ends while the bank cannot be reached to check it",
  scenarioTest("transfer.status_unreachable", async () => {
    const view = await sendRm100FromHomeToTheResultPage();
    const transferId = view.getPathname()?.replace("/transfer/result/", "");

    await endTheSession();

    expect(
      await screen.findByText(`${STILL_CHECKED} ${transferId}`),
    ).toBeOnTheScreen();
  }),
);

it(
  "quotes nothing when the session ends after the bank has confirmed where the money went",
  scenarioTest("transfer.completed", async () => {
    await sendRm100FromHomeToTheResultPage();

    await endTheSession();

    expect(
      await screen.findByRole("header", { name: "Your session has ended" }),
    ).toBeOnTheScreen();
    await expect(
      screen.findByText(/still being checked/, {}, { timeout: 500 }),
    ).rejects.toThrow("Unable to find an element with text");
  }),
);

it("quotes nothing when the session ends while Home still announces how an earlier transfer ended", async () => {
  const {
    body: { customerId },
  } = await sendToBank<GetPrimaryAccountResponse>("GET", "/accounts/primary");
  const { created, lookup } = await startTestTransfer(10_000);
  await writePendingTransfer(customerId, {
    transferId: created.transfer.transferId,
    idempotencyKey: "approval-key",
    createdAt: "2026-10-07T01:30:00.000Z",
    stage: PendingTransferStage.Processing,
  });
  mswServer.use(
    http.get("*/transfers/:transferId", () =>
      HttpResponse.json({
        transfer: {
          ...created.transfer,
          reference: "20261007C0FFEE00",
          status: TransferStatus.Completed,
        },
      }),
    ),
  );
  const sentNotice = `Your transfer of RM 100.00 to ${lookup.recipient.registeredName} was sent — money moved.`;
  const view = await renderRoute("/");
  await screen.findByText(sentNotice);
  // Announced again at the next launch, so the record outlived its announcement and the view has one to pass over.
  await relaunchApp(view);
  await screen.findByText(sentNotice);

  await endTheSession();

  expect(
    await screen.findByRole("header", { name: "Your session has ended" }),
  ).toBeOnTheScreen();
  await expect(
    screen.findByText(/still being checked/, {}, { timeout: 500 }),
  ).rejects.toThrow("Unable to find an element with text");
});
