import { act, fireEvent, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { http, HttpResponse } from "msw";

import { approvalSettingsStore } from "@/domains/approval/lib/approval-host-inputs/approval-host-inputs";
import {
  readBankBalanceMinor,
  sendToBank,
  mswServer,
} from "@/test/mock-bank/mock-bank";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import {
  enterPinAndApprove,
  walkToTransferReview,
} from "@/test/render/drive-app";
import { relaunchApp, renderRoute } from "@/test/render/render-route";

import { approveRequests } from "./TransferReviewScreen.helper";

it("sends an approval whose answer was lost twice more, 2 and then 4 seconds on, as the same bytes under the same key", async () => {
  const approvalsSeen: { atMs: number; key: string | null; body: string }[] =
    [];
  mswServer.use(
    http.post("*/transfers/:transferId/approve", async ({ request }) => {
      approvalsSeen.push({
        atMs: Date.now(),
        key: request.headers.get("Idempotency-Key"),
        body: await request.clone().text(),
      });
    }),
    http.post("*/transfers/:transferId/approve", () => HttpResponse.error(), {
      once: true,
    }),
    http.post("*/transfers/:transferId/approve", () => HttpResponse.error(), {
      once: true,
    }),
  );
  await confirmRm100Transfer();

  expect(
    await screen.findByText("Transfer sent", {}, { timeout: 10_000 }),
  ).toBeOnTheScreen();
  const [firstSend, firstResend, secondResend] = approvalsSeen;
  expect(approvalsSeen).toHaveLength(3);
  expect(firstSend?.key).toEqual(expect.any(String));
  expect(firstResend).toMatchObject({
    key: firstSend?.key,
    body: firstSend?.body,
  });
  expect(secondResend).toMatchObject({
    key: firstSend?.key,
    body: firstSend?.body,
  });
  expect(
    (firstResend?.atMs ?? 0) - (firstSend?.atMs ?? 0),
  ).toBeGreaterThanOrEqual(2_000);
  expect(
    (secondResend?.atMs ?? 0) - (firstResend?.atMs ?? 0),
  ).toBeGreaterThanOrEqual(4_000);
});

it("sends an approval whose answer timed out again under the same key, and shows the bank's answer to that copy", async () => {
  mswServer.use(
    http.post(
      "*/transfers/:transferId/approve",
      () => new Promise<never>(() => undefined),
      { once: true },
    ),
  );
  await confirmRm100Transfer();
  await screen.findByText(
    "Sending your transfer. The bank's answer comes next.",
  );

  await act(async () => {
    await jest.advanceTimersByTimeAsync(32_000);
  });

  expect(
    await screen.findByText("Transfer sent", {}, { timeout: 10_000 }),
  ).toBeOnTheScreen();
  const attemptKeys = approveRequests().map((request) =>
    request.headers.get("Idempotency-Key"),
  );
  expect(attemptKeys).toHaveLength(2);
  expect(new Set(attemptKeys).size).toBe(1);
});

it("never sends an approval again once the bank has answered it, a server error that names a code included", async () => {
  mswServer.use(
    http.post("*/transfers/:transferId/approve", () =>
      HttpResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "Test." } },
        { status: 500 },
      ),
    ),
  );
  await confirmRm100Transfer();

  expect(
    await screen.findByText(
      "This transfer is being checked, so don't send it again — not confirmed yet.",
    ),
  ).toBeOnTheScreen();
  expect(approveRequests()).toHaveLength(1);
});

it("sends an approval answered by a server error naming no bank code twice more under its key, then treats it as a lost answer", async () => {
  mswServer.use(
    http.post("*/transfers/:transferId/approve", () =>
      HttpResponse.text("<html>Bad gateway</html>", { status: 502 }),
    ),
  );
  await confirmRm100Transfer();

  expect(
    await screen.findByText(
      "This transfer is being checked, so don't send it again — not confirmed yet.",
      {},
      { timeout: 10_000 },
    ),
  ).toBeOnTheScreen();
  const attemptKeys = approveRequests().map((request) =>
    request.headers.get("Idempotency-Key"),
  );
  expect(attemptKeys).toHaveLength(3);
  expect(new Set(attemptKeys).size).toBe(1);
});

it("answers a server error by the bank code it names, a known one sent once", async () => {
  mswServer.use(
    http.post("*/transfers/:transferId/approve", () =>
      HttpResponse.json(
        { error: { code: "APPROVAL_EXPIRED", message: "Test." } },
        { status: 503 },
      ),
    ),
  );
  await confirmRm100Transfer();

  expect(
    await screen.findByText("The approval timed out — no money moved."),
  ).toBeOnTheScreen();
  expect(approveRequests()).toHaveLength(1);
});

it("gets the bank's first answer back for a resend whose first copy already moved the money, which moves once", async () => {
  const balanceBeforeMinor = await readBankBalanceMinor();
  deliverFirstApprovalButLoseItsAnswer();
  await confirmRm100Transfer();

  expect(
    await screen.findByText("Transfer sent", {}, { timeout: 10_000 }),
  ).toBeOnTheScreen();
  jest.useRealTimers();
  expect(await readBankBalanceMinor()).toBe(balanceBeforeMinor - 10_000);
});

it("sends an approval answered with a body it cannot read again under the same key, and gets the bank's first answer back", async () => {
  deliverFirstApprovalButLoseItsAnswer(() =>
    HttpResponse.text("<html>Approved</html>", { status: 200 }),
  );
  await confirmRm100Transfer();

  expect(
    await screen.findByText("Transfer sent", {}, { timeout: 10_000 }),
  ).toBeOnTheScreen();
  // The test's own forward of the first copy carries no Accept header; the app's copies do.
  const appCopyKeys = approveRequests()
    .filter((request) => request.headers.get("Accept") === "application/json")
    .map((request) => request.headers.get("Idempotency-Key"));
  expect(appCopyKeys).toHaveLength(2);
  expect(new Set(appCopyKeys).size).toBe(1);
});

it("keeps the tries left that a wrong PIN was told when its refusal answers a resend, which the bank does not count again", async () => {
  deliverFirstApprovalButLoseItsAnswer();
  await confirmRm100ApprovedByPin();

  await enterPinAndApprove("111111");

  expect(
    await screen.findByText(
      "That PIN is incorrect. You have 2 tries left.",
      {},
      { timeout: 10_000 },
    ),
  ).toBeOnTheScreen();
  await enterPinAndApprove(DEMO_PIN);
  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  const attemptKeys = approveRequests().map((request) =>
    request.headers.get("Idempotency-Key"),
  );
  const rightPinKey = attemptKeys.pop();
  expect(new Set(attemptKeys).size).toBe(1);
  expect(rightPinKey).not.toBe(attemptKeys[0]);
});

it("lets a lost approval answer change nothing once the person has left it, though it is sent twice more and answered while another transfer is being sent", async () => {
  let firstTransferId: string | undefined;
  let firstTransferCopies = 0;
  let releaseLastCopy: () => void = () => undefined;
  const lastCopyHeld = new Promise<void>((release) => {
    releaseLastCopy = () => {
      release();
    };
  });
  let releaseSecondApproval: () => void = () => undefined;
  const secondApprovalHeld = new Promise<void>((release) => {
    releaseSecondApproval = () => {
      release();
    };
  });
  // Released, a held approval falls through to the bank, which completes its transfer.
  mswServer.use(
    http.post<{ transferId: string }>(
      "*/transfers/:transferId/approve",
      async ({ params: { transferId } }) => {
        firstTransferId ??= transferId;
        if (transferId !== firstTransferId) {
          await secondApprovalHeld;
          return undefined;
        }
        firstTransferCopies += 1;
        if (firstTransferCopies < 3) return HttpResponse.error();
        await lastCopyHeld;
        return undefined;
      },
    ),
  );
  const view = await confirmRm100Transfer();
  await screen.findByText(
    "Sending your transfer. The bank's answer comes next.",
  );

  // Review offers no way back while sending, so this stands in for any route that still could.
  await act(() => {
    router.back();
  });
  await act(() => {
    router.back();
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(2_000);
  });
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    "012-345 6789",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await fireEvent.changeText(await screen.findByLabelText("Amount (RM)"), "50");
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  await act(async () => {
    await jest.advanceTimersByTimeAsync(4_000);
  });
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await screen.findByText(
    "Sending your transfer. The bank's answer comes next.",
  );
  releaseLastCopy();
  await act(async () => {
    await jest.advanceTimersByTimeAsync(1_000);
  });

  expect(
    screen.getByText("Sending your transfer. The bank's answer comes next."),
  ).toBeOnTheScreen();
  expect(screen.queryByText("Transfer sent")).toBeNull();
  releaseSecondApproval();
  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  expect(screen.getByText("RM 50.00")).toBeOnTheScreen();
  const firstTransferKeys = approveRequests()
    .filter(
      (request) =>
        new URL(request.url).pathname.split("/")[2] === firstTransferId,
    )
    .map((request) => request.headers.get("Idempotency-Key"));
  expect(firstTransferKeys).toHaveLength(3);
  expect(new Set(firstTransferKeys).size).toBe(1);
  const relaunched = await relaunchApp(view);
  expect(
    await screen.findByRole("header", { name: "Transfer sent" }),
  ).toBeOnTheScreen();
  expect(screen.getByText("RM 100.00")).toBeOnTheScreen();
  expect(relaunched.getPathname()).toBe(`/transfer/result/${firstTransferId}`);
});

const DEMO_PIN = "246810";

async function confirmRm100ApprovedByPin() {
  approvalSettingsStore.setState({ biometricApprovalOn: false });
  return confirmRm100Transfer();
}

async function pairPhoneAndOpenReviewOfRm100() {
  await pairPhoneAsTheDemoLaunchDoes();
  const view = await renderRoute("/transfer");
  await walkToTransferReview();
  await screen.findByRole("button", { name: "Transfer" });
  return view;
}

async function confirmRm100Transfer() {
  const view = await pairPhoneAndOpenReviewOfRm100();
  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
  return view;
}

// Later copies go to the bank untouched, so a resend gets back whatever the bank answered the first.
function deliverFirstApprovalButLoseItsAnswer(
  lostAnswer: () => Response = () => HttpResponse.error(),
) {
  let firstCopyLost = false;
  mswServer.use(
    http.post("*/transfers/:transferId/approve", async ({ request }) => {
      if (firstCopyLost) return undefined;
      firstCopyLost = true;
      await sendToBank("POST", new URL(request.url).pathname, {
        body: (await request.clone().json()) as unknown,
        idempotencyKey: request.headers.get("Idempotency-Key"),
      });
      return lostAnswer();
    }),
  );
}
