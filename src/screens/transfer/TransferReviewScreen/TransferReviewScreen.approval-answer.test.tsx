import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { t } from "i18next";
import { http, HttpResponse } from "msw";

import {
  ApprovalPinSheetStep,
  approvalPinSheetStore,
} from "@/domains/approval/hooks/approval-pin-sheet";
import { approvalSettingsStore } from "@/domains/approval/hooks/approval-settings";
import {
  type GetTransferResponse,
  TransferFailureReason,
  TransferFunds,
  TransferStatus,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { formatMalaysianDateTime } from "@/shared/lib/dates/dates";
import { readBankBalanceMinor, sendToBank } from "@/test/bank-client";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { pressHardwareBack } from "@/test/hardware-back";
import { watchRoutesDrawnOnTop } from "@/test/harness/screen-stack-double";
import { mswServer, sentRequests } from "@/test/msw-server";
import { relaunchApp, renderRoute } from "@/test/render-route";
import { scenarioTest } from "@/test/scenario-test";

const SENDING_MESSAGE = "Sending your transfer. The bank's answer comes next.";
const RESULT_PATH = /^\/transfer\/result\/[\w-]+$/;

async function reviewRm100Transfer() {
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
  return view;
}

async function approveRm100Transfer() {
  const view = await reviewRm100Transfer();
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  return view;
}

async function expectNothingToRecheckAtTheNextLaunch(
  view: Awaited<ReturnType<typeof renderRoute>>,
) {
  const relaunched = await relaunchApp(view);
  expect(
    await screen.findByRole("button", { name: "Transfer", disabled: false }),
  ).toBeOnTheScreen();
  await act(() => jest.advanceTimersByTimeAsync(1_000));
  expect(relaunched.getPathname()).toBe("/");
  expect(screen.queryByText(/still being checked/)).toBeNull();
}

it("opens the result page straight from review, showing no other screen of the transfer between them", async () => {
  await reviewRm100Transfer();
  const transferButton = await screen.findByRole("button", {
    name: "Transfer",
  });
  const routesDrawnOnTop = watchRoutesDrawnOnTop();

  await fireEvent.press(transferButton);
  await screen.findByRole("header", { name: "Transfer sent" });

  expect(new Set(routesDrawnOnTop())).toEqual(
    new Set(["review", "transfer", "result/[transferId]"]),
  );
});

// ⛔ Stands in for Back skipping the result page: review holds Back until the flow is done, and Jest mounts
// the page in that same render, so a pressed Back always arrives too late here.
function dropTheResultPageAsItOpens() {
  const pushRoute = router.push;
  return jest
    .spyOn(router, "push")
    .mockImplementation((...pushed: Parameters<typeof router.push>) => {
      const [href] = pushed;
      if (
        typeof href === "object" &&
        href.pathname === "/transfer/result/[transferId]"
      )
        return;
      pushRoute(...pushed);
    });
}

it("tells Home the transfer was sent when the result page never opens, and reopens no result at the next launch", async () => {
  const resultPageDropped = dropTheResultPageAsItOpens();
  try {
    const view = await approveRm100Transfer();
    const sentNotice =
      /^Your transfer of RM 100\.00 to .+ was sent — money moved\.$/;

    expect(await screen.findByText(sentNotice)).toBeOnTheScreen();
    expect(view.getPathname()).toBe("/");
    resultPageDropped.mockRestore();
    const relaunched = await relaunchApp(view);
    expect(await screen.findByText(sentNotice)).toBeOnTheScreen();
    expect(relaunched.getPathname()).toBe("/");
  } finally {
    resultPageDropped.mockRestore();
  }
});

it(
  "warns Home with the bank's reference when the result page never opens on a transfer still processing, and reopens no result at the next launch",
  scenarioTest("transfer.processing", async () => {
    const resultPageDropped = dropTheResultPageAsItOpens();
    try {
      const view = await approveRm100Transfer();
      const stillBeingChecked =
        /^Your last transfer is still being checked, so don't send it again — not confirmed yet\. If you contact us, quote this reference: (?!trf_)\w+$/;

      expect(await screen.findByText(stillBeingChecked)).toBeOnTheScreen();
      expect(view.getPathname()).toBe("/");
      resultPageDropped.mockRestore();
      const relaunched = await relaunchApp(view);
      expect(await screen.findByText(stillBeingChecked)).toBeOnTheScreen();
      expect(relaunched.getPathname()).toBe("/");
    } finally {
      resultPageDropped.mockRestore();
    }
  }),
);

it(
  "warns Home not to send it again when the approval's answer is lost and the result page never opens, and reopens that page at the next launch",
  scenarioTest("transfer.approval_unanswered", async () => {
    const resultPageDropped = dropTheResultPageAsItOpens();
    try {
      const view = await approveRm100Transfer();

      expect(
        await screen.findByText(
          /^Your last transfer is still being checked, so don't send it again — not confirmed yet\./,
          { timeout: 10_000 },
        ),
      ).toBeOnTheScreen();
      expect(view.getPathname()).toBe("/");
      resultPageDropped.mockRestore();
      const relaunched = await relaunchApp(view);
      expect(
        await screen.findByRole("header", { name: "Transfer sent" }),
      ).toBeOnTheScreen();
      expect(relaunched.getPathname()).toMatch(RESULT_PATH);
    } finally {
      resultPageDropped.mockRestore();
    }
  }),
);

it(
  "warns Home not to send it again when something unexpected fails as a lost answer is settled and the result page never opens, and reopens that page at the next launch",
  scenarioTest("transfer.approval_unanswered", async () => {
    approvalSettingsStore.setState({ biometricApprovalOn: false });
    // ⛔ Nothing between the bank's answer and its settling throws by itself, so the sending sheet's close, the
    // settling's first step, stands in for any throw there.
    const stopFailingTheSendingSheetsClose = approvalPinSheetStore.subscribe(
      (sheet, previousSheet) => {
        if (
          previousSheet.step !== ApprovalPinSheetStep.Sending ||
          sheet.step !== ApprovalPinSheetStep.Closed
        )
          return;
        stopFailingTheSendingSheetsClose();
        throw new Error("Test.");
      },
    );
    const resultPageDropped = dropTheResultPageAsItOpens();
    try {
      const view = await approveRm100Transfer();
      for (const digit of "246810")
        await fireEvent.press(
          await screen.findByRole("button", { name: digit }),
        );
      await fireEvent.press(screen.getByRole("button", { name: "Approve" }));

      expect(
        await screen.findByText(
          /^Your last transfer is still being checked, so don't send it again — not confirmed yet\./,
          { timeout: 10_000 },
        ),
      ).toBeOnTheScreen();
      expect(view.getPathname()).toBe("/");
      resultPageDropped.mockRestore();
      const relaunched = await relaunchApp(view);
      expect(
        await screen.findByRole("header", { name: "Transfer sent" }),
      ).toBeOnTheScreen();
      expect(relaunched.getPathname()).toMatch(RESULT_PATH);
    } finally {
      stopFailingTheSendingSheetsClose();
      resultPageDropped.mockRestore();
    }
  }),
);

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
    const view = await approveRm100Transfer();

    expect(
      await screen.findByText("The approval timed out — no money moved."),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Transfer" })).toBeOnTheScreen();
    await expectNothingToRecheckAtTheNextLaunch(view);
    jest.useRealTimers();
    expect(await readBankBalanceMinor()).toBe(balanceBeforeMinor);
  }),
);

it(
  "says on review that the approval couldn't be verified when the bank rejects its signature",
  scenarioTest("transfer.approval_not_verified", async () => {
    const view = await approveRm100Transfer();

    expect(
      await screen.findByText(
        "The approval couldn't be verified — no money moved.",
      ),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Transfer" })).toBeOnTheScreen();
    await expectNothingToRecheckAtTheNextLaunch(view);
  }),
);

it(
  "says on review that the balance or limit changed when the bank finds them short as the approval arrives, and leads back to an amount step that reads both again",
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
    const readsAfterTheRefusal = sentRequests
      .slice(
        sentRequests.findLastIndex((request) =>
          new URL(request.url).pathname.endsWith("/approve"),
        ),
      )
      .filter((request) => request.method === "GET")
      .map((request) => new URL(request.url).pathname);
    expect(readsAfterTheRefusal).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/\/accounts\/primary$/),
        expect.stringMatching(/\/transfer-limits$/),
      ]),
    );
    await expectNothingToRecheckAtTheNextLaunch(view);
    jest.useRealTimers();
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
    `You can send money from ${formatMalaysianDateTime(securityWaitEndsAt, t)} — a security wait after pairing this phone.`,
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
    await expectNothingToRecheckAtTheNextLaunch(view);
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
