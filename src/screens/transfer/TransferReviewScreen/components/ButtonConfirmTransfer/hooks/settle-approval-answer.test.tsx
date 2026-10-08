import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";

import type { GetPrimaryAccountResponse } from "@/domains/account/api/get-primary-account/get-primary-account.type";
import {
  type GetTransferResponse,
  TransferFailureReason,
  TransferFunds,
  TransferStatus,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { listPendingTransfers } from "@/domains/transfer/hooks/pending-transfers";
import { formatMalaysianDateTime } from "@/shared/lib/dates/dates";
import { readBankBalanceMinor, sendToBank } from "@/test/bank-client";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { pressHardwareBack } from "@/test/hardware-back";
import { mswServer } from "@/test/msw-server";
import { renderRoute } from "@/test/render-route";
import { scenarioTest } from "@/test/scenario-test";

const SENDING_MESSAGE = "Sending your transfer. The bank's answer comes next.";
const RESULT_PATH = /^\/transfer\/result\/[\w-]+$/;

async function approveRm100Transfer() {
  await pairPhoneAsTheDemoLaunchDoes();
  const view = await renderRoute("/transfer");
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

async function readPendingTransfersAfterTheRoute() {
  jest.useRealTimers();
  const {
    body: { customerId },
  } = await sendToBank<GetPrimaryAccountResponse>("GET", "/accounts/primary");
  return listPendingTransfers(customerId);
}

function answerEveryApprovalWith(
  status: number,
  error: Record<string, unknown>,
) {
  mswServer.use(
    http.post("*/transfers/:transferId/approve", () =>
      HttpResponse.json({ error }, { status }),
    ),
  );
}

it(
  "says on review that the approval timed out once the bank's window has passed, and keeps no record to recheck",
  scenarioTest("transfer.approval_expired", async () => {
    const balanceBeforeMinor = await readBankBalanceMinor();
    await approveRm100Transfer();

    expect(
      await screen.findByText("The approval timed out — no money moved."),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Transfer" })).toBeOnTheScreen();
    expect(await readPendingTransfersAfterTheRoute()).toEqual([]);
    expect(await readBankBalanceMinor()).toBe(balanceBeforeMinor);
  }),
);

it(
  "says on review that the approval couldn't be verified when the bank rejects its signature",
  scenarioTest("transfer.approval_not_verified", async () => {
    await approveRm100Transfer();

    expect(
      await screen.findByText(
        "The approval couldn't be verified — no money moved.",
      ),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Transfer" })).toBeOnTheScreen();
    expect(await readPendingTransfersAfterTheRoute()).toEqual([]);
  }),
);

it(
  "says on review that the balance or limit changed when the bank finds them short as the approval arrives, and leads back to the amount",
  scenarioTest("transfer.balance_or_limit_short_at_approval", async () => {
    const balanceBeforeMinor = await readBankBalanceMinor();
    const view = await approveRm100Transfer();

    expect(
      await screen.findByText(
        "It was not sent because your balance or limit changed — no money moved.",
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/— money moved\./)).toBeNull();
    expect(view.getPathname()).toBe("/transfer/review");
    await pressHardwareBack();
    expect(view.getPathname()).toBe("/transfer/amount");
    expect(await readPendingTransfersAfterTheRoute()).toEqual([]);
    expect(await readBankBalanceMinor()).toBe(balanceBeforeMinor);
  }),
);

it("says the same on review when it is today's limit the bank finds short as the approval arrives", async () => {
  // The short-at-approval scenario ends on the balance, never the limit, so the limit's answer is built here.
  mswServer.use(
    http.post<{ transferId: string }>(
      "*/transfers/:transferId/approve",
      async ({ params: { transferId } }) => {
        const {
          body: { transfer },
        } = await sendToBank<GetTransferResponse>(
          "GET",
          `/transfers/${transferId}`,
        );
        return HttpResponse.json({
          transfer: {
            ...transfer,
            status: TransferStatus.Unsuccessful,
            funds: TransferFunds.NotDebited,
            failureReason: TransferFailureReason.DailyLimitExceeded,
          },
        });
      },
    ),
  );
  const view = await approveRm100Transfer();

  expect(
    await screen.findByText(
      "It was not sent because your balance or limit changed — no money moved.",
    ),
  ).toBeOnTheScreen();
  expect(view.getPathname()).toBe("/transfer/review");
});

// Read against the clock the app reads: a fixed time stops being ahead once it has passed.
const securityWaitEndsAt = new Date(Date.now() + 60 * 60_000).toISOString();

it.each([
  [
    "the account was locked",
    { code: "ACCOUNT_LOCKED", message: "Test." },
    "Your account is locked. Contact Ryt to unlock it.",
  ],
  [
    "a security wait began",
    {
      code: "COOLING_OFF",
      message: "Test.",
      until: securityWaitEndsAt,
      reason: "DEVICE_PAIRED",
    },
    `You can send money from ${formatMalaysianDateTime(securityWaitEndsAt)} — a security wait after pairing this phone.`,
  ],
])(
  "holds Transfer on review, saying why and offering no PIN instead, with no record to recheck, when %s after the transfer was created",
  async (_, error, holdReason) => {
    let answerApproval: (response: Response) => void = () => undefined;
    mswServer.use(
      http.post(
        "*/transfers/:transferId/approve",
        () =>
          new Promise<Response>((resolve) => {
            answerApproval = resolve;
          }),
      ),
    );
    const view = await approveRm100Transfer();
    await screen.findByText(SENDING_MESSAGE);

    answerApproval(HttpResponse.json({ error }, { status: 403 }));

    await waitFor(() => {
      expect(screen.queryByText(SENDING_MESSAGE)).toBeNull();
    });
    expect(view.getPathname()).toBe("/transfer/review");
    expect(await screen.findByText(holdReason)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Transfer" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Use PIN instead" }),
    ).toBeNull();
    expect(
      screen.queryByText("The transfer was not sent — no money moved."),
    ).toBeNull();
    expect(await readPendingTransfersAfterTheRoute()).toEqual([]);
  },
);

it("holds Transfer on review with the security wait's words but no time when the wait the bank names has already ended", async () => {
  answerEveryApprovalWith(403, {
    code: "COOLING_OFF",
    message: "Test.",
    until: new Date(Date.now() - 60_000).toISOString(),
    reason: "DEVICE_PAIRED",
  });
  await approveRm100Transfer();

  expect(
    await screen.findByText(
      "You can send money later — a security wait after pairing this phone.",
    ),
  ).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Transfer" })).toBeDisabled();
});

it(
  "says something unexpected stopped the approval when the bank refuses it as badly formed",
  scenarioTest("transfer.approval_unexpected", async () => {
    answerEveryApprovalWith(400, {
      code: "INVALID_REQUEST",
      message: "Test.",
    });
    await approveRm100Transfer();

    expect(
      await screen.findByText(
        "Something unexpected stopped the approval — no money moved.",
      ),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Transfer" })).toBeOnTheScreen();
  }),
);

it.each([
  ["TRANSFER_NOT_FOUND", 404],
  ["IDEMPOTENCY_KEY_REUSED", 409],
  ["REQUEST_IN_PROGRESS", 409],
])(
  "takes an approval answered %s to the result page, since that answer does not say where the transfer ended",
  async (code, status) => {
    answerEveryApprovalWith(status, { code, message: "Test." });
    const view = await approveRm100Transfer();

    expect(
      await screen.findByText(
        "This transfer is being checked, so don't send it again — not confirmed yet.",
      ),
    ).toBeOnTheScreen();
    expect(view.getPathname()).toMatch(RESULT_PATH);
  },
);

it.each([
  ["PIN_INCORRECT", 422],
  ["PIN_LOCKED", 423],
])(
  "takes a face or fingerprint approval answered %s to the result page as a lost answer, since the approval had left the phone",
  async (code, status) => {
    answerEveryApprovalWith(status, { code, message: "Test." });
    const view = await approveRm100Transfer();

    expect(
      await screen.findByText(
        "This transfer is being checked, so don't send it again — not confirmed yet.",
      ),
    ).toBeOnTheScreen();
    expect(view.getPathname()).toMatch(RESULT_PATH);
  },
);

it(
  "takes a transfer the bank's fraud check stopped to the result page, never back to sending",
  scenarioTest("transfer.fraud_blocked", async () => {
    const view = await approveRm100Transfer();

    expect(
      await screen.findByRole("button", { name: "Done" }),
    ).toBeOnTheScreen();
    expect(view.getPathname()).toMatch(RESULT_PATH);
    expect(screen.queryByRole("button", { name: "Transfer" })).toBeNull();
  }),
);

it(
  "takes a transfer held for a security check to the result page",
  scenarioTest("transfer.held_for_review", async () => {
    const view = await approveRm100Transfer();

    expect(
      await screen.findByRole("button", { name: "Done" }),
    ).toBeOnTheScreen();
    expect(view.getPathname()).toMatch(RESULT_PATH);
  }),
);

it(
  "takes a transfer the receiving bank declined to the result page",
  scenarioTest("transfer.recipient_account_inactive", async () => {
    const view = await approveRm100Transfer();

    expect(
      await screen.findByRole("button", { name: "Done" }),
    ).toBeOnTheScreen();
    expect(view.getPathname()).toMatch(RESULT_PATH);
  }),
);
