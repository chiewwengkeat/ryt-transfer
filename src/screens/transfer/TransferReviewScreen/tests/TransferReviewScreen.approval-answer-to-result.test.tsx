import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { http, HttpResponse } from "msw";

import {
  ApprovalPinSheetStep,
  approvalPinSheetStore,
} from "@/domains/approval/lib/approval-pin-sheet/approval-pin-sheet";
import { approvalSettingsStore } from "@/domains/approval/lib/approval-host-inputs/approval-host-inputs";
import { ApproveTransferErrorCode } from "@/domains/transfer/api/approve-transfer/approve-transfer.type";
import {
  readBankBalanceMinor,
  mswServer,
  sentRequests,
} from "@/test/mock-bank/mock-bank";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import {
  pressHardwareBack,
  readBankOnRealTimers,
  scenarioTest,
  walkToTransferReview,
} from "@/test/render/drive-app";
import {
  observedRecords,
  watchRoutesDrawnOnTop,
} from "@/test/doubles/native-doubles";
import { relaunchApp, renderRoute } from "@/test/render/render-route";

import {
  countSent,
  walkToTransferReviewAndPressTransfer,
} from "./TransferReviewScreen.helper";

afterEach(() => {
  jest.restoreAllMocks();
});

it("opens the result page straight from review, showing no other screen of the transfer between them", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/transfer");
  await walkToTransferReview();
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

it("keeps review sending, with Transfer and Back held, from a PIN approval's answer until the result page covers it", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/transfer");
  await walkToTransferReview();
  // ⛔ Held shut, the result page leaves on screen what review shows until it covers review: on a phone, one commit.
  const resultPageAsked = jest.spyOn(router, "push").mockReturnValue(undefined);
  const homeAsked = jest.spyOn(router, "dismissTo").mockReturnValue(undefined);
  try {
    for (const label of ["Use PIN instead", ..."246810", "Approve"])
      await fireEvent.press(await screen.findByRole("button", { name: label }));
    await waitFor(() => expect(resultPageAsked).toHaveBeenCalled());
    const requestsSentBeforePresses = sentRequests.length;
    await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
    await pressHardwareBack();

    expect(screen.getByText(SENDING_MESSAGE)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Transfer" })).toBeBusy();
    expect(screen.queryByText("Use PIN instead")).toBeNull();
    expect(sentRequests).toHaveLength(requestsSentBeforePresses);
  } finally {
    for (const spy of [resultPageAsked, homeAsked]) spy.mockRestore();
  }
});

it("tells Home the transfer was sent when the result page never opens, and reopens no result at the next launch", async () => {
  const resultPageDropped = dropTheResultPageAsItOpens();
  try {
    await pairPhoneAsTheDemoLaunchDoes();
    const view = await renderRoute("/transfer");
    await walkToTransferReviewAndPressTransfer();
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
      await pairPhoneAsTheDemoLaunchDoes();
      const view = await renderRoute("/transfer");
      await walkToTransferReviewAndPressTransfer();
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
      await pairPhoneAsTheDemoLaunchDoes();
      const view = await renderRoute("/transfer");
      await walkToTransferReviewAndPressTransfer();

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
      await pairPhoneAsTheDemoLaunchDoes();
      const view = await renderRoute("/transfer");
      await walkToTransferReviewAndPressTransfer();
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

it.each([
  ["TRANSFER_NOT_FOUND", 404],
  ["IDEMPOTENCY_KEY_REUSED", 409],
  ["REQUEST_IN_PROGRESS", 409],
])(
  "takes an approval answered %s to the result page, since that answer does not say where the transfer ended",
  async (code, status) => {
    answerEveryApprovalWith(status, { code, message: "Test." });
    await pairPhoneAsTheDemoLaunchDoes();
    const view = await renderRoute("/transfer");
    await walkToTransferReviewAndPressTransfer();

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
    await pairPhoneAsTheDemoLaunchDoes();
    const view = await renderRoute("/transfer");
    await walkToTransferReviewAndPressTransfer();

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
    await pairPhoneAsTheDemoLaunchDoes();
    const view = await renderRoute("/transfer");
    await walkToTransferReviewAndPressTransfer();

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
    await pairPhoneAsTheDemoLaunchDoes();
    const view = await renderRoute("/transfer");
    await walkToTransferReviewAndPressTransfer();

    expect(
      await screen.findByRole("button", { name: "Done" }),
    ).toBeOnTheScreen();
    expect(view.getPathname()).toMatch(RESULT_PATH);
  }),
);

it(
  "takes a transfer the receiving bank declined to the result page",
  scenarioTest("transfer.recipient_account_inactive", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const view = await renderRoute("/transfer");
    await walkToTransferReviewAndPressTransfer();

    expect(
      await screen.findByRole("button", { name: "Done" }),
    ).toBeOnTheScreen();
    expect(view.getPathname()).toMatch(RESULT_PATH);
  }),
);

it(
  "never offers to send again when the bank answers the approval with a code the app does not know",
  scenarioTest("transfer.approval_unknown_answer", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const balanceBeforeMinor = await readBankBalanceMinor();
    const view = await renderRoute("/transfer");
    await walkToTransferReview();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
    expect(view.getPathname()).toMatch(/^\/transfer\/result\/[\w-]+$/);
    expect(screen.queryByRole("button", { name: "Transfer" })).toBeNull();
    expect(observedRecords).toContainEqual(
      expect.objectContaining({
        name: "transfer_outcome",
        properties: { scenario: "transfer.approval_unknown_answer" },
      }),
    );
    expect(await readBankOnRealTimers(readBankBalanceMinor)).toBe(
      balanceBeforeMinor - 10_000,
    );
  }),
);

it.each<[string, () => Response, number]>([
  ["a 500 with no body", () => new HttpResponse(null, { status: 500 }), 3],
  [
    "a 502 proxy page",
    () => new HttpResponse("<html>Bad gateway</html>", { status: 502 }),
    3,
  ],
  [
    "a 503 whose code approve does not name",
    () =>
      HttpResponse.json(
        { error: { code: "SERVICE_UNAVAILABLE", message: "Test." } },
        { status: 503 },
      ),
    1,
  ],
  ["a 200 with an empty body", () => new HttpResponse("", { status: 200 }), 3],
  ["a 200 whose body is not JSON", () => new HttpResponse("OK"), 3],
  ["a 200 whose body holds no transfer", () => HttpResponse.json({}), 1],
  [
    "404 TRANSFER_NOT_FOUND",
    () =>
      HttpResponse.json(
        {
          error: {
            code: ApproveTransferErrorCode.TransferNotFound,
            message: "Test.",
          },
        },
        { status: 404 },
      ),
    1,
  ],
  [
    "409 IDEMPOTENCY_KEY_REUSED",
    () =>
      HttpResponse.json(
        {
          error: {
            code: ApproveTransferErrorCode.IdempotencyKeyReused,
            message: "Test.",
          },
        },
        { status: 409 },
      ),
    1,
  ],
  [
    "409 REQUEST_IN_PROGRESS",
    () =>
      HttpResponse.json(
        {
          error: {
            code: ApproveTransferErrorCode.RequestInProgress,
            message: "Test.",
          },
        },
        { status: 409 },
      ),
    1,
  ],
])(
  "never offers to send again when the bank answers the approval with %s",
  async (_, answerApproval, approvesSent) => {
    await pairPhoneAsTheDemoLaunchDoes();
    mswServer.use(http.post("*/transfers/:transferId/approve", answerApproval));
    const view = await renderRoute("/transfer");
    await walkToTransferReview();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(
      await screen.findByText(
        "This transfer is being checked, so don't send it again — not confirmed yet.",
        {},
        { timeout: 10_000 },
      ),
    ).toBeOnTheScreen();
    expect(view.getPathname()).toMatch(/^\/transfer\/result\/[\w-]+$/);
    expect(screen.queryByText(/no money moved/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Transfer" })).toBeNull();
    expect(screen.getByRole("button", { name: "Done" })).toBeOnTheScreen();
    expect(countSent("POST", "/approve")).toBe(approvesSent);
  },
);

it(
  "never says money moved when the bank answers that the transfer is still processing",
  scenarioTest("transfer.processing", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const view = await renderRoute("/transfer");
    await walkToTransferReview();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(
      await screen.findByText(
        "It's usually instant, but can take up to one business day. The result will show here and in History — not confirmed yet.",
      ),
    ).toBeOnTheScreen();
    expect(view.getPathname()).toMatch(/^\/transfer\/result\/[\w-]+$/);
    expect(screen.queryByText(/— money moved\./)).toBeNull();
  }),
);

const SENDING_MESSAGE = "Sending your transfer. The bank's answer comes next.";
const RESULT_PATH = /^\/transfer\/result\/[\w-]+$/;

// ⛔ Stands in for Back skipping the result page: review holds Back until that page covers it, too late to press here.
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
