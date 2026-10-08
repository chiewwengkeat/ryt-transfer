import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";

import {
  type GetTransferResponse,
  TransferDirection,
  TransferFailureReason,
  TransferFunds,
  TransferStatus,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { RecipientIdType } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import { formatMalaysianDateTime } from "@/shared/lib/dates/dates";
import { lookUpTestRecipient, sendToBank } from "@/test/bank-client";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { mswServer, sentRequests } from "@/test/msw-server";
import { readBankOnRealTimers } from "@/test/read-bank-on-real-timers";
import { renderRoute } from "@/test/render-route";
import { scenarioTest } from "@/test/scenario-test";

const BANK_REFERENCE =
  /^If you contact us, quote this reference: \d{8}[\dA-F]{8}$/;

async function sendRm100FromHome() {
  await pairPhoneAsTheDemoLaunchDoes();
  const view = await renderRoute("/");
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    "012-345 6789",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("RM 12,845.50");
  await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  return view;
}

function transferIdIn(pathname: string | undefined) {
  return pathname?.replace("/transfer/result/", "") ?? "";
}

// The page's only offers: anything more could be a way to send the money twice.
function buttonsOnTheResultPage() {
  return screen
    .getAllByRole("button")
    .map((button) => button.props.accessibilityLabel as unknown);
}

it(
  "gives a receipt in Malaysia time, and Home's balance and limit move with the money",
  scenarioTest("transfer.completed", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const { recipient } = await lookUpTestRecipient("012-345 6789");
    const view = await renderRoute("/");
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
    await fireEvent.changeText(
      await screen.findByLabelText("DuitNow mobile number"),
      "012-345 6789",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("RM 12,845.50");
    await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
    await fireEvent.press(screen.getByRole("button", { name: "Review" }));
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(
      await screen.findByText(
        `RM 100.00 sent to ${recipient.registeredName} — money moved.`,
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText("•••• 6789")).toBeOnTheScreen();
    expect(screen.getByText(recipient.bankName)).toBeOnTheScreen();
    const { body } = await readBankOnRealTimers(() =>
      sendToBank<GetTransferResponse>(
        "GET",
        view.getPathname()?.replace("/transfer/result", "/transfers") ?? "",
      ),
    );
    expect(
      screen.getByText(formatMalaysianDateTime(body.transfer.updatedAt)),
    ).toBeOnTheScreen();
    expect(screen.getByText(body.transfer.reference ?? "")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "Done" }));

    expect(await screen.findByText("RM 12,745.50")).toBeOnTheScreen();
    expect(
      screen.getByText("You can send RM 4,900.00 more today"),
    ).toBeOnTheScreen();
    expect(view.getPathname()).toBe("/");
  }),
);

it("leaves out the note and reference rows when the bank sends them empty", async () => {
  mswServer.use(
    http.get("*/transfers/:transferId", () =>
      HttpResponse.json({
        transfer: {
          transferId: "trf_test",
          version: 3,
          direction: TransferDirection.Out,
          status: TransferStatus.Completed,
          funds: TransferFunds.Debited,
          counterparty: {
            registeredName: "NG CHEE KEONG",
            idType: RecipientIdType.Mobile,
            idValueMasked: "•••• 6789",
            bankName: "Maybank",
          },
          amount: { minor: 10_000, currency: "MYR" },
          note: "",
          reference: "",
          createdAt: "2026-10-07T09:30:00+08:00",
          updatedAt: "2026-10-07T09:30:05+08:00",
        },
      } satisfies GetTransferResponse),
    ),
  );
  await renderRoute("/transfer/result/trf_test", {
    appDir: "src/app",
    overrides: {},
  });

  expect(
    await screen.findByText("RM 100.00 sent to NG CHEE KEONG — money moved."),
  ).toBeOnTheScreen();
  expect(screen.queryByText("Note")).toBeNull();
  expect(screen.queryByText("Reference")).toBeNull();
});

it(
  "says the bank stopped a transfer its fraud check blocked, and points to the bank, never back to sending",
  scenarioTest("transfer.fraud_blocked", async () => {
    await sendRm100FromHome();

    expect(
      await screen.findByRole("header", { name: "Transfer stopped" }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        "The bank stopped this transfer to protect you, and will contact you about it — no money moved.",
      ),
    ).toBeOnTheScreen();
    expect(buttonsOnTheResultPage()).toEqual(["Done"]);
  }),
);

it(
  "says a held transfer will complete or be refunded, with the bank's reference to quote",
  scenarioTest("transfer.held_for_review", async () => {
    await sendRm100FromHome();

    expect(
      await screen.findByRole("header", { name: "Transfer on hold" }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        "The bank is holding this transfer for a security check. It will complete or be refunded — not confirmed yet.",
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText(BANK_REFERENCE)).toBeOnTheScreen();
    expect(buttonsOnTheResultPage()).toEqual(["Done"]);
  }),
);

it(
  "says a transfer to an inactive account was declined, with no money moved",
  scenarioTest("transfer.recipient_account_inactive", async () => {
    await sendRm100FromHome();

    expect(
      await screen.findByRole("header", { name: "Transfer declined" }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText("The transfer was declined — no money moved."),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/quote this reference/)).toBeNull();
  }),
);

it(
  "says a processing transfer can take up to a business day, with the bank's reference to quote",
  scenarioTest("transfer.processing", async () => {
    await sendRm100FromHome();

    expect(
      await screen.findByRole("header", { name: "Transfer processing" }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        "It's usually instant, but can take up to one business day. The result will show here and in History — not confirmed yet.",
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText(BANK_REFERENCE)).toBeOnTheScreen();
    expect(buttonsOnTheResultPage()).toEqual(["Done"]);
  }),
);

it(
  "checks a transfer whose approval went unanswered, quoting its id, then shows how it ended",
  scenarioTest("transfer.approval_unanswered", async () => {
    let releaseStatusRead: () => void = () => undefined;
    const statusReadHeld = new Promise<void>((release) => {
      releaseStatusRead = release;
    });
    mswServer.use(
      http.get(
        "*/transfers/:transferId",
        async () => {
          await statusReadHeld;
        },
        { once: true },
      ),
    );
    const view = await sendRm100FromHome();

    expect(
      await screen.findByRole("header", { name: "Checking your transfer" }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        "The bank's answer did not arrive. Check History before sending this again — not confirmed yet.",
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        `If you contact us, quote this reference: ${transferIdIn(view.getPathname())}`,
      ),
    ).toBeOnTheScreen();
    expect(buttonsOnTheResultPage()).toEqual(["Done"]);
    releaseStatusRead();

    expect(
      await screen.findByRole("header", { name: "Transfer sent" }),
    ).toBeOnTheScreen();
  }),
);

it(
  "treats an approval answer the app does not know like no answer, and shows how the transfer ended",
  scenarioTest("transfer.approval_unknown_answer", async () => {
    await sendRm100FromHome();

    expect(
      await screen.findByRole("header", { name: "Transfer sent" }),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/not sent/)).toBeNull();
  }),
);

it(
  "says a transfer the bank cannot find can't be found, to check History, with its id to quote",
  scenarioTest("transfer.last_transfer_not_found", async () => {
    const view = await sendRm100FromHome();

    expect(
      await screen.findByRole("header", { name: "Transfer not found" }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        "Your last transfer can't be found. Check History before sending it again — not confirmed yet.",
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        `If you contact us, quote this reference: ${transferIdIn(view.getPathname())}`,
      ),
    ).toBeOnTheScreen();
    expect(buttonsOnTheResultPage()).toEqual(["Done"]);
  }),
);

it(
  "leaves an unanswered approval's outcome unconfirmed when checking it meets an answer the app does not know",
  scenarioTest("transfer.recovery_unexpected", async () => {
    const view = await sendRm100FromHome();

    expect(
      await screen.findByRole("header", { name: "Outcome not confirmed" }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        "This transfer's outcome can't be confirmed right now. Check History before sending it again — not confirmed yet.",
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        `If you contact us, quote this reference: ${transferIdIn(view.getPathname())}`,
      ),
    ).toBeOnTheScreen();
    expect(buttonsOnTheResultPage()).toEqual(["Done"]);
  }),
);

it(
  "keeps the receipt of a transfer the bank completed when a later read of it fails",
  scenarioTest("transfer.outcome_unexpected", async () => {
    await sendRm100FromHome();

    expect(
      await screen.findByRole("header", { name: "Transfer sent" }),
    ).toBeOnTheScreen();
    await waitFor(() => {
      expect(
        sentRequests.filter(({ method, url }) =>
          method === "GET" ? /\/transfers\/[\w-]+$/.test(url) : false,
        ),
      ).not.toHaveLength(0);
    });
    expect(
      screen.getByRole("header", { name: "Transfer sent" }),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/cannot be shown/)).toBeNull();
  }),
);

it(
  "offers to load the result again, never to send again, when the bank answers with an outcome the app cannot name",
  scenarioTest("transfer.outcome_unexpected", async () => {
    const { recipient } = await lookUpTestRecipient("012-345 6789");
    mswServer.use(
      http.post("*/transfers/:transferId/approve", ({ params }) =>
        HttpResponse.json({
          transfer: {
            transferId: params.transferId,
            version: 2,
            direction: TransferDirection.Out,
            // Debited and unsuccessful with no refund under way: whether the money comes back is unsaid.
            status: TransferStatus.Unsuccessful,
            funds: TransferFunds.Debited,
            failureReason: TransferFailureReason.RecipientBankRejected,
            counterparty: recipient,
            amount: { minor: 10_000, currency: "MYR" },
            reference: "20261007C0FFEE00",
            createdAt: "2026-10-07T09:30:00+08:00",
            updatedAt: "2026-10-07T09:30:05+08:00",
          },
        }),
      ),
    );
    const view = await sendRm100FromHome();

    expect(
      await screen.findByRole("header", { name: "Result not available" }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        "The result cannot be shown right now. Check History before sending this again — not confirmed yet.",
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        "If you contact us, quote this reference: 20261007C0FFEE00",
      ),
    ).toBeOnTheScreen();
    expect(buttonsOnTheResultPage()).toEqual(["Load the result again", "Done"]);
    const transferId = transferIdIn(view.getPathname());
    const readsBefore = sentRequests.filter(({ url }) =>
      url.endsWith(`/transfers/${transferId}`),
    ).length;

    await fireEvent.press(
      screen.getByRole("button", { name: "Load the result again" }),
    );

    await waitFor(() => {
      expect(
        sentRequests.filter(({ url }) =>
          url.endsWith(`/transfers/${transferId}`),
        ),
      ).toHaveLength(readsBefore + 1);
    });
    expect(
      await screen.findByRole("header", { name: "Result not available" }),
    ).toBeOnTheScreen();
  }),
);
