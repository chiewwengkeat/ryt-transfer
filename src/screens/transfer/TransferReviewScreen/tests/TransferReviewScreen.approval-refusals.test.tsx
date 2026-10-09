import { fireEvent, screen } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";

import { ApproveTransferErrorCode } from "@/domains/transfer/api/approve-transfer/approve-transfer.type";
import { readBankBalanceMinor, mswServer } from "@/test/mock-bank/mock-bank";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import {
  readBankOnRealTimers,
  scenarioTest,
  walkToTransferReview,
} from "@/test/render/drive-app";
import { observedRecords } from "@/test/doubles/native-doubles";
import { renderRoute } from "@/test/render/render-route";

import {
  countSent,
  waitForHomeToOfferTransfer,
} from "./TransferReviewScreen.helper";

afterEach(() => {
  jest.restoreAllMocks();
});

it(
  "says the transfer was not sent when the bank cannot verify the approval",
  scenarioTest("transfer.approval_not_verified", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const balanceBeforeMinor = await readBankBalanceMinor();
    await openReviewOfRm100();

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

it(
  "never offers to send again when the bank answers the approval with a code the app does not know",
  scenarioTest("transfer.approval_unknown_answer", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const balanceBeforeMinor = await readBankBalanceMinor();
    const view = await openReviewOfRm100();

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
    const view = await openReviewOfRm100();

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
    const view = await openReviewOfRm100();

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
    const view = await openReviewOfRm100();

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

async function openReviewOfRm100(
  startPath: "/" | "/transfer" = "/transfer",
  note?: string,
) {
  const view = await renderRoute(startPath);
  if (startPath === "/") {
    await waitForHomeToOfferTransfer();
    await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
  }
  await walkToTransferReview({ note });
  return view;
}
