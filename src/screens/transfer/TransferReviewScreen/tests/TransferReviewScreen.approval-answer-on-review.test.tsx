import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { getFixedT } from "i18next";
import { http, HttpResponse } from "msw";

import { ApproveTransferErrorCode } from "@/domains/transfer/api/approve-transfer/approve-transfer.type";
import {
  type GetTransferResponse,
  TransferFailureReason,
  TransferFunds,
  TransferStatus,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { formatMalaysianDateTime } from "@/shared/lib/dates/dates";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import {
  mswServer,
  readBankBalanceMinor,
  sendToBank,
  sentRequests,
} from "@/test/mock-bank/mock-bank";
import {
  pressHardwareBack,
  readBankOnRealTimers,
  scenarioTest,
  walkToTransferReview,
} from "@/test/render/drive-app";
import { relaunchApp, renderRoute } from "@/test/render/render-route";

import {
  countSent,
  walkToTransferReviewAndPressTransfer,
} from "./TransferReviewScreen.helper";

afterEach(() => {
  jest.restoreAllMocks();
});

it(
  "says on review that the approval timed out once the bank's window has passed, and keeps no record to recheck",
  scenarioTest("transfer.approval_expired", async () => {
    const balanceBeforeMinor = await readBankBalanceMinor();
    await pairPhoneAsTheDemoLaunchDoes();
    const view = await renderRoute("/transfer");
    await walkToTransferReviewAndPressTransfer();

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
    await pairPhoneAsTheDemoLaunchDoes();
    const view = await renderRoute("/transfer");
    await walkToTransferReviewAndPressTransfer();

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
    await pairPhoneAsTheDemoLaunchDoes();
    const view = await renderRoute("/transfer");
    await walkToTransferReviewAndPressTransfer();

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
  await pairPhoneAsTheDemoLaunchDoes();
  const view = await renderRoute("/transfer");
  await walkToTransferReviewAndPressTransfer();

  expect(
    await screen.findByText(
      "It was not sent because your balance or limit changed — no money moved.",
    ),
  ).toBeOnTheScreen();
  expect(view.getPathname()).toBe("/transfer/review");
});

// Read against the clock the app reads: a fixed time stops being ahead once it has passed.
// eslint-disable-next-line fe/file-layout -- read at load by an it.each table
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
    `You can send money from ${formatMalaysianDateTime(securityWaitEndsAt, getFixedT(null, ["shared"]))} — a security wait after pairing this phone.`,
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
    await pairPhoneAsTheDemoLaunchDoes();
    const view = await renderRoute("/transfer");
    await walkToTransferReviewAndPressTransfer();
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
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/transfer");
  await walkToTransferReviewAndPressTransfer();

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
    await pairPhoneAsTheDemoLaunchDoes();
    await renderRoute("/transfer");
    await walkToTransferReviewAndPressTransfer();

    expect(
      await screen.findByText(
        "Something unexpected stopped the approval — no money moved.",
      ),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Transfer" })).toBeOnTheScreen();
  }),
);

it(
  "says the transfer was not sent when the bank cannot verify the approval",
  scenarioTest("transfer.approval_not_verified", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const balanceBeforeMinor = await readBankBalanceMinor();
    await renderRoute("/transfer");
    await walkToTransferReview();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(
      await screen.findByText(
        "The approval couldn't be verified — no money moved.",
      ),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Transfer" })).toBeOnTheScreen();
    expect(await readBankOnRealTimers(readBankBalanceMinor)).toBe(
      balanceBeforeMinor,
    );
  }),
);

// ⛔ No INVALID_REQUEST row: that answer is ruled to move to the approval step's catch-all.
it.each([
  [
    410,
    ApproveTransferErrorCode.ApprovalExpired,
    {},
    "The approval timed out — no money moved.",
  ],
  [
    403,
    ApproveTransferErrorCode.ApprovalInvalid,
    {},
    "The approval couldn't be verified — no money moved.",
  ],
  [
    409,
    ApproveTransferErrorCode.KeyNotRegistered,
    {},
    "Approval needs setting up again on this phone.",
  ],
  [
    403,
    ApproveTransferErrorCode.CoolingOff,
    // An hour ahead of the clock the app reads, so the wait has not passed by the time it is shown.
    {
      until: new Date(Date.now() + 60 * 60_000).toISOString(),
      reason: "DEVICE_PAIRED",
    },
    /^You can send money from .+ — a security wait after pairing this phone\.$/,
  ],
  [
    403,
    ApproveTransferErrorCode.CoolingOff,
    {
      until: new Date(Date.now() + 60 * 60_000).toISOString(),
      reason: "NEW_ACCOUNT",
    },
    /^You can send money from .+ — a security wait after opening your account\.$/,
  ],
  [
    403,
    ApproveTransferErrorCode.AccountLocked,
    {},
    "Your account is locked. Contact Ryt to unlock it.",
  ],
])(
  "keeps the transfer on review, saying why, when the bank refuses the approval with %i %s",
  async (status, code, details, reason) => {
    await pairPhoneAsTheDemoLaunchDoes();
    mswServer.use(
      http.post("*/transfers/:transferId/approve", () =>
        HttpResponse.json(
          { error: { code, message: "Test.", ...details } },
          { status },
        ),
      ),
    );
    const view = await renderRoute("/transfer");
    await walkToTransferReview();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(await screen.findByText(reason)).toBeOnTheScreen();
    expect(
      screen.queryByText(
        "This transfer is being checked, so don't send it again — not confirmed yet.",
      ),
    ).toBeNull();
    expect(view.getPathname()).toBe("/transfer/review");
    expect(countSent("POST", "/approve")).toBe(1);
  },
);

const SENDING_MESSAGE = "Sending your transfer. The bank's answer comes next.";

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
