import type { QueryClient } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { http, HttpResponse } from "msw";

import type { GetPrimaryAccountResponse } from "@/domains/account/api/get-primary-account/get-primary-account.type";
import { rememberApprovalPinLocked } from "@/domains/approval/hooks/approval-pin-lock";
import { approvalPinSheetStore } from "@/domains/approval/hooks/approval-pin-sheet";
import {
  approvalSettingsStore,
  notifyApprovalPinReset,
} from "@/domains/approval/hooks/approval-settings";
import { listPendingTransfers } from "@/domains/transfer/hooks/pending-transfers";
import { transferFlowStore } from "@/screens/transfer/state/transfer-flow";
import { readBankBalanceMinor, sendToBank } from "@/test/bank-client";
import {
  biometricPromptsShown,
  cancelNextBiometricPrompt,
  changeEnrolledBiometrics,
  failNextBiometricPrompt,
  holdNextBiometricPrompt,
  reportBiometricSensorUnavailable,
} from "@/test/biometrics-double";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { moveAppTo } from "@/test/harness/app-state";
import { secureStoreNativeDouble } from "@/test/harness/native-doubles";
import {
  observedRecords,
  reportedScenarios,
} from "@/test/harness/recording-sink";
import { mswServer, sentRequests } from "@/test/msw-server";
import { relaunchApp, renderRoute } from "@/test/render-route";
import { scenarioTest } from "@/test/scenario-test";

const DEMO_PIN = "246810";

async function confirmRm100ApprovedByPin() {
  approvalSettingsStore.setState({ biometricApprovalOn: false });
  return confirmRm100Transfer();
}

async function openReviewOfRm100() {
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
  await screen.findByRole("button", { name: "Transfer" });
  return view;
}

async function confirmRm100Transfer() {
  const view = await openReviewOfRm100();
  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
  return view;
}

async function approveWithPin(pin: string) {
  for (const digit of pin)
    await fireEvent.press(await screen.findByRole("button", { name: digit }));
  await fireEvent.press(screen.getByRole("button", { name: "Approve" }));
}

function approveRequests() {
  return sentRequests.filter((request) =>
    new URL(request.url).pathname.endsWith("/approve"),
  );
}

async function sendAnotherRm100TransferFromResult() {
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
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
}

// The scenario forgets only keys registered in an earlier millisecond than it began, and a 1 ms
// timer can fire within the same one, so this waits for the clock itself to move on.
async function pairPhoneBeforeTheBankForgetsItsKeys() {
  await pairPhoneAsTheDemoLaunchDoes();
  const pairedAtMs = Date.now();
  while (Date.now() <= pairedAtMs) {
    await new Promise((resolve) => {
      setTimeout(resolve, 1);
    });
  }
}

it(
  "approves with the bank PIN beside the phone's own key, and the bank moves the money",
  scenarioTest("transfer.biometrics_unavailable", async () => {
    const balanceBeforeMinor = await readBankBalanceMinor();
    await confirmRm100ApprovedByPin();

    await approveWithPin(DEMO_PIN);

    expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
    expect(biometricPromptsShown()).toEqual([]);
    const [approval] = approveRequests();
    const approvalBody = (await approval?.json()) as unknown;
    expect(approvalBody).toHaveProperty("keyId");
    expect(approvalBody).toHaveProperty("pin", DEMO_PIN);
    expect(reportedScenarios()).toContain("transfer.biometrics_unavailable");
    jest.useRealTimers();
    expect(await readBankBalanceMinor()).toBe(balanceBeforeMinor - 10_000);
  }),
);

it(
  "says how many tries are left after a wrong PIN, and sends each try as a new attempt",
  scenarioTest("transfer.pin_incorrect", async () => {
    await confirmRm100ApprovedByPin();

    await approveWithPin("111111");

    expect(
      await screen.findByText("That PIN is incorrect. You have 2 tries left."),
    ).toBeOnTheScreen();
    await approveWithPin(DEMO_PIN);
    expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
    const attemptKeys = approveRequests().map((request) =>
      request.headers.get("Idempotency-Key"),
    );
    expect(new Set(attemptKeys).size).toBe(2);
    expect(reportedScenarios()).toContain("transfer.pin_incorrect");
  }),
);

it(
  "locks the PIN after three wrong tries, offers no other try, and moves no money",
  scenarioTest("transfer.pin_locked", async () => {
    const balanceBeforeMinor = await readBankBalanceMinor();
    await confirmRm100ApprovedByPin();

    await approveWithPin("111111");
    await screen.findByText("That PIN is incorrect. You have 2 tries left.");
    await approveWithPin("111111");
    await screen.findByText("That PIN is incorrect. You have 1 try left.");
    await approveWithPin("111111");

    const lockedMessage =
      "Your PIN is locked. Reset it in the app's security settings.";
    expect(await screen.findByText(lockedMessage)).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "1" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(reportedScenarios()).toContain("transfer.pin_locked");
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    expect(
      await screen.findByRole("button", { name: "Transfer" }),
    ).toBeOnTheScreen();
    expect(screen.getByText(lockedMessage)).toBeOnTheScreen();
    jest.useRealTimers();
    expect(await readBankBalanceMinor()).toBe(balanceBeforeMinor);
  }),
);

it("offers no PIN instead once the bank has locked the PIN, and leaves face or fingerprint to approve", async () => {
  await openReviewOfRm100();
  await fireEvent.press(
    screen.getByRole("button", { name: "Use PIN instead" }),
  );
  await approveWithPin("111111");
  await screen.findByText("That PIN is incorrect. You have 2 tries left.");
  await approveWithPin("111111");
  await screen.findByText("That PIN is incorrect. You have 1 try left.");
  await approveWithPin("111111");
  await fireEvent.press(await screen.findByRole("button", { name: "Close" }));

  expect(await screen.findByRole("button", { name: "Transfer" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Use PIN instead" })).toBeNull();
});

it.each([
  [
    "face or fingerprint approval is off",
    () => {
      approvalSettingsStore.setState({ biometricApprovalOn: false });
    },
  ],
  [
    "nothing is enrolled",
    () => {
      reportBiometricSensorUnavailable("BIOMETRY_NOT_ENROLLED");
    },
  ],
  [
    "the phone has no usable sensor",
    () => {
      reportBiometricSensorUnavailable("BIOMETRY_NOT_AVAILABLE");
    },
  ],
  [
    "the phone has locked face and fingerprint after too many attempts",
    () => {
      reportBiometricSensorUnavailable("BIOMETRY_LOCKOUT");
    },
  ],
])(
  "creates no transfer that only the PIN could approve once the bank has locked the PIN, when %s",
  async (_, leaveOnlyThePinToApprove) => {
    await openReviewOfRm100();
    await fireEvent.press(
      screen.getByRole("button", { name: "Use PIN instead" }),
    );
    await approveWithPin("111111");
    await screen.findByText("That PIN is incorrect. You have 2 tries left.");
    await approveWithPin("111111");
    await screen.findByText("That PIN is incorrect. You have 1 try left.");
    await approveWithPin("111111");
    await fireEvent.press(await screen.findByRole("button", { name: "Close" }));
    await act(leaveOnlyThePinToApprove);
    const countCreatesSent = () =>
      sentRequests.filter(
        (request) =>
          request.method === "POST" &&
          /\/transfers$/.test(new URL(request.url).pathname),
      ).length;
    const createsSentBeforeTheLock = countCreatesSent();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(
      await screen.findByRole("header", { name: "PIN locked" }),
    ).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "1" })).toBeNull();
    expect(countCreatesSent()).toBe(createsSentBeforeTheLock);
  },
);

it("keeps no record to recheck while the sheet shows the bank refusing a wrong PIN", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const {
    body: { customerId },
  } = await sendToBank<GetPrimaryAccountResponse>("GET", "/accounts/primary");
  await confirmRm100ApprovedByPin();

  await approveWithPin("111111");
  await screen.findByText("That PIN is incorrect. You have 2 tries left.");

  // ⛔ Read directly: only a phone that kills the app with this sheet open meets the record at the next launch, and
  // a relaunch here unmounts the root first, which answers the sheet as closed and forgets the record anyway.
  expect(await listPendingTransfers(customerId)).toEqual([]);
});

it("reopens nothing and warns of nothing at the next launch once the bank locks the PIN", async () => {
  const view = await confirmRm100ApprovedByPin();
  await lockThePinWithThreeWrongTries();

  const relaunched = await relaunchApp(view);

  expect(
    await screen.findByRole("button", { name: "Transfer", disabled: false }),
  ).toBeOnTheScreen();
  await act(() => jest.advanceTimersByTimeAsync(1_000));
  expect(relaunched.getPathname()).toBe("/");
  expect(screen.queryByText(/still being checked/)).toBeNull();
});

async function lockThePinWithThreeWrongTries() {
  await approveWithPin("111111");
  await screen.findByText("That PIN is incorrect. You have 2 tries left.");
  await approveWithPin("111111");
  await screen.findByText("That PIN is incorrect. You have 1 try left.");
  await approveWithPin("111111");
  await fireEvent.press(await screen.findByRole("button", { name: "Close" }));
  await screen.findByRole("button", { name: "Transfer" });
}

it("keeps the PIN the bank locked for the next transfer, whose Transfer shows the locked words with no keypad", async () => {
  await confirmRm100ApprovedByPin();
  await lockThePinWithThreeWrongTries();

  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));

  expect(
    await screen.findByRole("header", { name: "PIN locked" }),
  ).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "1" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Close" }));
  expect(
    await screen.findByText(
      "Your PIN is locked. Reset it in the app's security settings.",
    ),
  ).toBeOnTheScreen();
  expect(approveRequests()).toHaveLength(3);
});

it("still approves with face or fingerprint while the bank holds the PIN locked", async () => {
  await confirmRm100ApprovedByPin();
  await lockThePinWithThreeWrongTries();
  await act(() => {
    approvalSettingsStore.setState({ biometricApprovalOn: true });
  });

  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));

  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  expect(biometricPromptsShown()).toHaveLength(1);
});

it("asks for no PIN to set approval up again while the bank holds the PIN locked", async () => {
  await pairPhoneBeforeTheBankForgetsItsKeys();
  await scenarioTest("transfer.approval_key_unknown", async () => {
    await confirmRm100Transfer();
    await screen.findByText("Approval needs setting up again on this phone.");
    await lockThePinWithThreeWrongTries();

    await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));

    expect(
      await screen.findByRole("header", { name: "PIN locked" }),
    ).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "1" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    expect(
      await screen.findByText(
        "Your PIN is locked. Reset it in the app's security settings.",
      ),
    ).toBeOnTheScreen();
  })();
});

it.each([
  [
    "the bank locks the PIN chosen instead as it is tried",
    async () => {
      mswServer.use(
        http.post(
          "*/transfers/:transferId/approve",
          () =>
            HttpResponse.json(
              { error: { code: "PIN_LOCKED", message: "Test." } },
              { status: 423 },
            ),
          { once: true },
        ),
      );
      await openReviewOfRm100();
      await fireEvent.press(
        screen.getByRole("button", { name: "Use PIN instead" }),
      );
      await approveWithPin(DEMO_PIN);
    },
  ],
  [
    "the fingerprints or face changed",
    async () => {
      await openReviewOfRm100();
      await act(rememberApprovalPinLocked);
      changeEnrolledBiometrics();
      await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
    },
  ],
  [
    "the bank no longer knows the phone's key",
    async () => {
      mswServer.use(
        http.post(
          "*/transfers/:transferId/approve",
          () =>
            HttpResponse.json(
              { error: { code: "KEY_NOT_REGISTERED", message: "Test." } },
              { status: 409 },
            ),
          { once: true },
        ),
      );
      await openReviewOfRm100();
      await act(rememberApprovalPinLocked);
      await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
    },
  ],
  [
    "only the PIN could approve the next transfer",
    async () => {
      await openReviewOfRm100();
      await act(() => {
        approvalSettingsStore.setState({ biometricApprovalOn: false });
      });
      await act(rememberApprovalPinLocked);
      await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
    },
  ],
])(
  "shows only that the PIN is locked and where to reset it, nothing about entering it, and reports it as it opens, when %s",
  async (_, meetTheLockedPin) => {
    await meetTheLockedPin();

    expect(
      await screen.findByRole("header", { name: "PIN locked" }),
    ).toBeOnTheScreen();
    expect(reportedScenarios()).toContain("transfer.pin_locked");
    expect(
      screen.getByText(
        "Your PIN is locked. Reset it in the app's security settings.",
      ),
    ).toBeOnTheScreen();
    expect(
      screen.queryAllByText(
        /approve with your PIN|enter your (bank )?PIN|your PIN approves/i,
      ),
    ).toEqual([]);
    expect(screen.queryByRole("button", { name: "1" })).toBeNull();
  },
);

it("opens the keypad again once the host app reports the PIN reset", async () => {
  mswServer.use(
    http.post(
      "*/transfers/:transferId/approve",
      () =>
        HttpResponse.json(
          { error: { code: "PIN_LOCKED", message: "Test." } },
          { status: 423 },
        ),
      { once: true },
    ),
  );
  await confirmRm100ApprovedByPin();
  await approveWithPin(DEMO_PIN);
  await fireEvent.press(await screen.findByRole("button", { name: "Close" }));
  await screen.findByText(
    "Your PIN is locked. Reset it in the app's security settings.",
  );

  await act(() => notifyApprovalPinReset());
  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
  await approveWithPin(DEMO_PIN);

  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
});

async function readWhatTheAppStillHolds() {
  // Lets a finished call's zero-length cache timer run, which drops its variables.
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
  const { queryClient } = jest.requireMock<{ queryClient: QueryClient }>(
    "@/shell/query-client",
  );
  return JSON.stringify([
    queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.state.variables),
    transferFlowStore.getState(),
    approvalPinSheetStore.getState(),
    observedRecords,
  ]);
}

it("keeps the PIN nowhere once its approval is answered", async () => {
  await confirmRm100ApprovedByPin();

  await approveWithPin(DEMO_PIN);
  await screen.findByText("Transfer sent");

  expect(await approveRequests().at(-1)?.text()).toContain(DEMO_PIN);
  expect(await readWhatTheAppStillHolds()).not.toContain(DEMO_PIN);
});

it("keeps a refused PIN nowhere once the sheet is closed on review", async () => {
  await confirmRm100ApprovedByPin();

  await approveWithPin("111111");
  await screen.findByText("That PIN is incorrect. You have 2 tries left.");
  await fireEvent.press(screen.getByRole("button", { name: "Close" }));
  await screen.findByRole("button", { name: "Transfer" });

  expect(await approveRequests().at(-1)?.text()).toContain("111111");
  expect(await readWhatTheAppStillHolds()).not.toContain("111111");
});

it("closes the PIN sheet and checks the transfer on the result page, never saying no money moved, when something unexpected fails after the approval has left the phone", async () => {
  await confirmRm100ApprovedByPin();
  // Nothing after the bank's answer throws by itself, so a failing navigation stands in for any throw there.
  const dismissFailingOnce = jest
    .spyOn(router, "dismissTo")
    .mockImplementationOnce(() => {
      throw new Error("Test.");
    });

  await approveWithPin(DEMO_PIN);

  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  expect(screen.queryByText(/no money moved/)).toBeNull();
  expect(dismissFailingOnce).toHaveBeenCalledTimes(2);
  dismissFailingOnce.mockRestore();
});

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

  await approveWithPin("111111");

  expect(
    await screen.findByText(
      "That PIN is incorrect. You have 2 tries left.",
      {},
      { timeout: 10_000 },
    ),
  ).toBeOnTheScreen();
  await approveWithPin(DEMO_PIN);
  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  const attemptKeys = approveRequests().map((request) =>
    request.headers.get("Idempotency-Key"),
  );
  const rightPinKey = attemptKeys.pop();
  expect(new Set(attemptKeys).size).toBe(1);
  expect(rightPinKey).not.toBe(attemptKeys[0]);
});

it(
  "says the face or fingerprint was not recognised, sends nothing, and leaves Transfer to try again or the PIN to approve",
  scenarioTest("transfer.biometrics_not_recognised", async () => {
    failNextBiometricPrompt("AUTHENTICATION_FAILED");
    await confirmRm100Transfer();

    expect(
      await screen.findByText(
        "Your face or fingerprint was not recognised. You can try again, or use your PIN.",
      ),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Transfer" })).toBeEnabled();
    expect(approveRequests()).toEqual([]);
    await fireEvent.press(
      screen.getByRole("button", { name: "Use PIN instead" }),
    );
    await approveWithPin(DEMO_PIN);
    expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  }),
);

it("offers no PIN instead while the transfer is being sent", async () => {
  let releaseApproval: () => void = () => undefined;
  const approvalHeld = new Promise<void>((release) => {
    releaseApproval = () => {
      release();
    };
  });
  mswServer.use(
    http.post(
      "*/transfers/:transferId/approve",
      async () => {
        await approvalHeld;
      },
      { once: true },
    ),
  );
  await confirmRm100Transfer();
  await screen.findByText(
    "Sending your transfer. The bank's answer comes next.",
  );

  expect(screen.queryByRole("button", { name: "Use PIN instead" })).toBeNull();
  releaseApproval();
  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
});

it("offers no PIN instead while face or fingerprint approval is turned off, Transfer asking for the PIN itself", async () => {
  approvalSettingsStore.setState({ biometricApprovalOn: false });
  await openReviewOfRm100();

  expect(screen.queryByRole("button", { name: "Use PIN instead" })).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
  expect(
    await screen.findByText("It's turned off in this app's settings."),
  ).toBeOnTheScreen();
});

it("takes the PIN choice away once face or fingerprint approval is turned off with review open", async () => {
  await openReviewOfRm100();
  expect(
    screen.getByRole("button", { name: "Use PIN instead" }),
  ).toBeOnTheScreen();

  await act(() => {
    approvalSettingsStore.setState({ biometricApprovalOn: false });
  });

  expect(screen.queryByRole("button", { name: "Use PIN instead" })).toBeNull();
});

it("asks the phone again on coming back to the app, taking the PIN choice away once nothing is enrolled", async () => {
  await openReviewOfRm100();
  expect(
    screen.getByRole("button", { name: "Use PIN instead" }),
  ).toBeOnTheScreen();

  reportBiometricSensorUnavailable("BIOMETRY_NOT_ENROLLED");
  await act(() => {
    moveAppTo("active");
  });

  await waitFor(() => {
    expect(
      screen.queryByRole("button", { name: "Use PIN instead" }),
    ).toBeNull();
  });
});

it(
  "turns a prompt the phone locked after too many attempts into the PIN sheet, which approves",
  scenarioTest("transfer.biometrics_locked_out", async () => {
    failNextBiometricPrompt("BIOMETRIC_LOCKOUT");
    await confirmRm100Transfer();

    expect(
      await screen.findByText(
        "There were too many attempts, so approve with your PIN.",
      ),
    ).toBeOnTheScreen();
    expect(reportedScenarios()).toContain("transfer.biometrics_locked_out");
    await approveWithPin(DEMO_PIN);
    expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  }),
);

it(
  "reports the PIN locked, not why the PIN was wanted, when the phone locks face and fingerprint while the bank holds the PIN locked",
  scenarioTest("transfer.biometrics_locked_out", async () => {
    failNextBiometricPrompt("BIOMETRIC_LOCKOUT");
    await openReviewOfRm100();
    await act(rememberApprovalPinLocked);

    await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));

    expect(
      await screen.findByRole("header", { name: "PIN locked" }),
    ).toBeOnTheScreen();
    expect(reportedScenarios()).toContain("transfer.pin_locked");
    expect(reportedScenarios()).not.toContain("transfer.biometrics_locked_out");
  }),
);

it(
  "turns a key that cannot sign after Android's own lockout recovery into the PIN sheet, which approves",
  scenarioTest("transfer.biometrics_locked_out", async () => {
    failNextBiometricPrompt("KEY_USER_NOT_AUTHENTICATED");
    await confirmRm100Transfer();

    expect(
      await screen.findByText(
        "There were too many attempts, so approve with your PIN.",
      ),
    ).toBeOnTheScreen();
    await approveWithPin(DEMO_PIN);
    expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  }),
);

it("still offers Use PIN instead while the phone reports face and fingerprint locked", async () => {
  reportBiometricSensorUnavailable("BIOMETRY_LOCKOUT");
  await openReviewOfRm100();

  await fireEvent.press(
    screen.getByRole("button", { name: "Use PIN instead" }),
  );

  expect(
    await screen.findByText("Enter your bank PIN to approve this transfer."),
  ).toBeOnTheScreen();
  expect(biometricPromptsShown()).toEqual([]);
});

it("opens the PIN sheet with no prompt while the phone reports face and fingerprint locked", async () => {
  reportBiometricSensorUnavailable("BIOMETRY_LOCKOUT");
  await confirmRm100Transfer();

  expect(
    await screen.findByText(
      "There were too many attempts, so approve with your PIN.",
    ),
  ).toBeOnTheScreen();
  expect(biometricPromptsShown()).toEqual([]);
});

it.each([
  [
    "nothing is enrolled",
    "BIOMETRY_NOT_ENROLLED",
    "No face or fingerprint is set up on this phone.",
  ],
  [
    "the phone has no usable sensor",
    "BIOMETRY_NOT_AVAILABLE",
    "This phone has no face or fingerprint sensor the app can use.",
  ],
])(
  "offers no PIN instead and asks for the PIN itself, saying why, when %s",
  async (_, sensorCode, reason) => {
    reportBiometricSensorUnavailable(sensorCode);
    await openReviewOfRm100();

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Use PIN instead" }),
      ).toBeNull();
    });
    await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));

    expect(await screen.findByText(reason)).toBeOnTheScreen();
    expect(
      screen.getByText(
        "Face or fingerprint approval isn't available, so approve with your PIN.",
      ),
    ).toBeOnTheScreen();
    expect(biometricPromptsShown()).toEqual([]);
  },
);

it(
  "approves with the PIN when a new face or fingerprint has killed the phone's key",
  scenarioTest("transfer.biometrics_changed", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    changeEnrolledBiometrics();
    await confirmRm100Transfer();

    expect(
      await screen.findByText(
        "Your fingerprints or face changed. Your PIN approves this transfer and turns face or fingerprint approval back on.",
      ),
    ).toBeOnTheScreen();
    expect(biometricPromptsShown()).toEqual([]);
    expect(reportedScenarios()).toContain("transfer.biometrics_changed");
    await approveWithPin(DEMO_PIN);
    expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  }),
);

it("says the transfer was not sent when the prompt is closed with Android's cancel", async () => {
  failNextBiometricPrompt("USER_CANCELED");
  await confirmRm100Transfer();

  expect(
    await screen.findByText("The transfer was not sent — no money moved."),
  ).toBeOnTheScreen();
  expect(approveRequests()).toEqual([]);
});

it("says the transfer was not sent when Android cancels its own prompt", async () => {
  failNextBiometricPrompt("SYSTEM_CANCELED");
  await confirmRm100Transfer();

  expect(
    await screen.findByText("The transfer was not sent — no money moved."),
  ).toBeOnTheScreen();
  expect(approveRequests()).toEqual([]);
});

it(
  "stops before anything is sent when the prompt fails in a way the app does not name",
  scenarioTest("transfer.approval_unexpected", async () => {
    failNextBiometricPrompt("SIGNATURE_CREATION_FAILED");
    await confirmRm100Transfer();

    expect(
      await screen.findByText(
        "Something unexpected stopped the approval — no money moved.",
      ),
    ).toBeOnTheScreen();
    expect(approveRequests()).toEqual([]);
  }),
);

it("lets an approval's answer change nothing once the person has left it and started another transfer", async () => {
  let releaseFirstApproval: () => void = () => undefined;
  const firstApprovalHeld = new Promise<void>((release) => {
    releaseFirstApproval = () => {
      release();
    };
  });
  // Holds the first approval in flight, then falls through to the bank, which completes it.
  mswServer.use(
    http.post(
      "*/transfers/:transferId/approve",
      async () => {
        await firstApprovalHeld;
      },
      { once: true },
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
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    "012-345 6789",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await fireEvent.changeText(await screen.findByLabelText("Amount (RM)"), "50");
  releaseFirstApproval();
  await act(async () => {
    await jest.advanceTimersByTimeAsync(1_000);
  });

  expect(screen.getByLabelText("Amount (RM)")).toHaveDisplayValue("50");
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  const [firstTransferId, secondTransferId] = approveRequests().map(
    (request) => new URL(request.url).pathname.split("/")[2],
  );
  expect(secondTransferId).not.toBe(firstTransferId);
  expect(screen.getByText("RM 50.00")).toBeOnTheScreen();
  const relaunched = await relaunchApp(view);
  expect(
    await screen.findByRole("header", { name: "Transfer sent" }),
  ).toBeOnTheScreen();
  expect(screen.getByText("RM 100.00")).toBeOnTheScreen();
  expect(relaunched.getPathname()).toBe(`/transfer/result/${firstTransferId}`);
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

async function startRm50TransferFromHomeToItsPinSheet() {
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    "012-345 6789",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await fireEvent.changeText(await screen.findByLabelText("Amount (RM)"), "50");
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  await fireEvent.press(
    await screen.findByRole("button", { name: "Use PIN instead" }),
  );
  await screen.findByText("Enter your bank PIN to approve this transfer.");
}

it.each([
  ["signs", () => undefined],
  ["is cancelled", cancelNextBiometricPrompt],
  [
    "reports a lockout",
    () => {
      failNextBiometricPrompt("BIOMETRIC_LOCKOUT");
    },
  ],
])(
  "leaves a newer transfer alone when the prompt of one the person left %s afterwards, so only the newer one moves",
  async (_, setPromptAnswer) => {
    const balanceBeforeMinor = await readBankBalanceMinor();
    setPromptAnswer();
    const releasePrompt = holdNextBiometricPrompt();
    await confirmRm100Transfer();
    await waitFor(() => {
      expect(biometricPromptsShown()).toHaveLength(1);
    });

    // Review offers no way back while approving, so this stands in for any route that still could.
    await act(() => {
      router.dismissTo("/");
    });
    await startRm50TransferFromHomeToItsPinSheet();
    await act(async () => {
      releasePrompt();
      await jest.advanceTimersByTimeAsync(1_000);
    });
    await approveWithPin(DEMO_PIN);

    expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
    expect(screen.getByText("RM 50.00")).toBeOnTheScreen();
    expect(approveRequests()).toHaveLength(1);
    jest.useRealTimers();
    expect(await readBankBalanceMinor()).toBe(balanceBeforeMinor - 5_000);
  },
);

it("leaves a newer transfer alone when the refusal of one the person left is settled afterwards", async () => {
  mswServer.use(
    http.post(
      "*/transfers/:transferId/approve",
      () =>
        HttpResponse.json(
          { error: { code: "APPROVAL_EXPIRED", message: "Test." } },
          { status: 410 },
        ),
      { once: true },
    ),
  );
  let recordDeleteHeld = false;
  let releaseRecordDelete: () => void = () => undefined;
  const deleteRecordForReal = secureStoreNativeDouble.deleteValueWithKeyAsync;
  jest
    .spyOn(secureStoreNativeDouble, "deleteValueWithKeyAsync")
    .mockImplementationOnce(async (key) => {
      recordDeleteHeld = true;
      await new Promise<void>((release) => {
        releaseRecordDelete = release;
      });
      return deleteRecordForReal(key);
    });
  await confirmRm100Transfer();
  // ⛔ Wait on the hold, never the spy's calls: an earlier test's spy can still be in place, having seen this test's earlier deletes.
  await waitFor(() => {
    expect(recordDeleteHeld).toBe(true);
  });

  // Review offers no way back while sending, so this stands in for any route that still could.
  await act(() => {
    router.dismissTo("/");
  });
  await startRm50TransferFromHomeToItsPinSheet();
  await act(async () => {
    releaseRecordDelete();
    await jest.advanceTimersByTimeAsync(1_000);
  });
  await approveWithPin(DEMO_PIN);

  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  expect(screen.getByText("RM 50.00")).toBeOnTheScreen();
});

it("leaves a newer transfer's PIN sheet alone when the bank asks for a PIN to set approval up again for one the person left", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  let keyRegistrationHeld = false;
  let releaseKeyRegistration: () => void = () => undefined;
  mswServer.use(
    http.post(
      "*/transfers/:transferId/approve",
      () =>
        HttpResponse.json(
          { error: { code: "KEY_NOT_REGISTERED", message: "Test." } },
          { status: 409 },
        ),
      { once: true },
    ),
    http.post(
      "*/approval-keys",
      () =>
        new Promise<undefined>((release) => {
          keyRegistrationHeld = true;
          releaseKeyRegistration = () => release(undefined);
        }),
      { once: true },
    ),
  );
  await confirmRm100Transfer();
  await waitFor(() => {
    expect(keyRegistrationHeld).toBe(true);
  });

  // Review offers no way back while sending, so this stands in for any route that still could.
  await act(() => {
    router.dismissTo("/");
  });
  await startRm50TransferFromHomeToItsPinSheet();
  await act(async () => {
    releaseKeyRegistration();
    await jest.advanceTimersByTimeAsync(1_000);
  });
  await approveWithPin(DEMO_PIN);

  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  expect(screen.getByText("RM 50.00")).toBeOnTheScreen();
});

it("still reports setting approval up again failing unexpectedly for a transfer the person left, saying nothing over the newer one", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  let keyRegistrationHeld = false;
  let failKeyRegistration: () => void = () => undefined;
  mswServer.use(
    http.post(
      "*/transfers/:transferId/approve",
      () =>
        HttpResponse.json(
          { error: { code: "KEY_NOT_REGISTERED", message: "Test." } },
          { status: 409 },
        ),
      { once: true },
    ),
    http.post(
      "*/approval-keys",
      () =>
        new Promise<Response>((answer) => {
          keyRegistrationHeld = true;
          failKeyRegistration = () => {
            answer(
              HttpResponse.json(
                { error: { code: "INVALID_REQUEST", message: "Test." } },
                { status: 400 },
              ),
            );
          };
        }),
      { once: true },
    ),
  );
  await confirmRm100Transfer();
  await waitFor(() => {
    expect(keyRegistrationHeld).toBe(true);
  });

  await act(() => {
    router.dismissTo("/");
  });
  await startRm50TransferFromHomeToItsPinSheet();
  await act(async () => {
    failKeyRegistration();
    await jest.advanceTimersByTimeAsync(1_000);
  });

  expect(observedRecords.map((record) => record.properties.boundary)).toContain(
    "approval_key_registration",
  );
  expect(
    screen.getByText("Enter your bank PIN to approve this transfer."),
  ).toBeOnTheScreen();
  await approveWithPin(DEMO_PIN);
  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  expect(screen.getByText("RM 50.00")).toBeOnTheScreen();
});

it("opens no PIN sheet over Home when the bank asks for a PIN to set approval up again for a transfer the person left", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  let keyRegistrationHeld = false;
  let askForThePin: () => void = () => undefined;
  mswServer.use(
    http.post(
      "*/transfers/:transferId/approve",
      () =>
        HttpResponse.json(
          { error: { code: "KEY_NOT_REGISTERED", message: "Test." } },
          { status: 409 },
        ),
      { once: true },
    ),
    http.post(
      "*/approval-keys",
      () =>
        new Promise<Response>((answer) => {
          keyRegistrationHeld = true;
          askForThePin = () => {
            answer(
              HttpResponse.json(
                { error: { code: "PIN_REQUIRED", message: "Test." } },
                { status: 403 },
              ),
            );
          };
        }),
      { once: true },
    ),
  );
  await confirmRm100Transfer();
  await waitFor(() => {
    expect(keyRegistrationHeld).toBe(true);
  });

  await act(() => {
    router.dismissTo("/");
  });
  await screen.findByRole("button", { name: "Transfer" });
  await act(async () => {
    askForThePin();
    await jest.advanceTimersByTimeAsync(1_000);
  });

  expect(
    screen.queryByText(
      "Enter your PIN to set it up and approve this transfer.",
    ),
  ).toBeNull();
  expect(screen.getByRole("button", { name: "Transfer" })).toBeOnTheScreen();
});

it(
  "sets face or fingerprint approval up again with the PIN that approved the transfer, so the next one needs no PIN",
  scenarioTest("transfer.biometrics_changed", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    changeEnrolledBiometrics();
    await confirmRm100Transfer();
    await approveWithPin(DEMO_PIN);
    await screen.findByText("Transfer sent");

    await sendAnotherRm100TransferFromResult();

    expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
    expect(biometricPromptsShown()).toHaveLength(1);
    const keyRegistration = sentRequests
      .filter((request) => new URL(request.url).pathname === "/approval-keys")
      .at(-1);
    const keyRegistrationBody = (await keyRegistration?.json()) as unknown;
    expect(keyRegistrationBody).toHaveProperty("pin", DEMO_PIN);
    expect(keyRegistrationBody).toHaveProperty("biometricPublicKey");
    expect(keyRegistrationBody).not.toHaveProperty("possessionPublicKey");
  }),
);

it("offers the PIN again on the next transfer when face or fingerprint approval could not be set up again", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  changeEnrolledBiometrics();
  mswServer.use(
    http.post(
      "*/approval-keys",
      () =>
        HttpResponse.json(
          { error: { code: "SERVICE_UNAVAILABLE", message: "Test." } },
          { status: 503 },
        ),
      { once: true },
    ),
  );
  await confirmRm100Transfer();
  await approveWithPin(DEMO_PIN);
  await screen.findByText("Transfer sent");

  await sendAnotherRm100TransferFromResult();

  expect(
    await screen.findByText(
      "Your fingerprints or face changed. Your PIN approves this transfer and turns face or fingerprint approval back on.",
    ),
  ).toBeOnTheScreen();
});

it("asks for the PIN again, not for a face or fingerprint the bank cannot verify, when the app stopped while setting face or fingerprint approval up again", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  changeEnrolledBiometrics();
  mswServer.use(
    http.post("*/approval-keys", () => new Promise<undefined>(() => {}), {
      once: true,
    }),
  );
  await confirmRm100Transfer();
  await approveWithPin(DEMO_PIN);
  await screen.findByText("Transfer sent");

  await sendAnotherRm100TransferFromResult();

  expect(
    await screen.findByText(
      "Your fingerprints or face changed. Your PIN approves this transfer and turns face or fingerprint approval back on.",
    ),
  ).toBeOnTheScreen();
  await approveWithPin(DEMO_PIN);
  await screen.findByText("Transfer sent");
  await sendAnotherRm100TransferFromResult();
  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  expect(biometricPromptsShown()).toHaveLength(1);
});

it("still approves with face or fingerprint set up again on its own once setting every key up again was left unfinished", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  changeEnrolledBiometrics();
  await confirmRm100Transfer();
  await approveWithPin(DEMO_PIN);
  await screen.findByText("Transfer sent");
  mswServer.use(
    http.post(
      "*/transfers/:transferId/approve",
      () =>
        HttpResponse.json(
          { error: { code: "KEY_NOT_REGISTERED", message: "Test." } },
          { status: 409 },
        ),
      { once: true },
    ),
  );
  await sendAnotherRm100TransferFromResult();
  await screen.findByText(
    "Enter your PIN to set it up and approve this transfer.",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Close" }));
  await screen.findByText("The transfer was not sent — no money moved.");

  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));

  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
});

it("sets approval up again with the PIN when the bank no longer knows the phone's key, then approves", async () => {
  await pairPhoneBeforeTheBankForgetsItsKeys();
  await scenarioTest("transfer.approval_key_unknown", async () => {
    const balanceBeforeMinor = await readBankBalanceMinor();
    await confirmRm100Transfer();

    expect(
      await screen.findByText("Approval needs setting up again on this phone."),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        "Enter your PIN to set it up and approve this transfer.",
      ),
    ).toBeOnTheScreen();
    expect(reportedScenarios()).toContain("transfer.approval_key_unknown");
    await approveWithPin("111111");
    expect(
      await screen.findByText("That PIN is incorrect. You have 2 tries left."),
    ).toBeOnTheScreen();
    expect(reportedScenarios()).toContain("transfer.pin_incorrect");
    await approveWithPin(DEMO_PIN);

    expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
    jest.useRealTimers();
    expect(await readBankBalanceMinor()).toBe(balanceBeforeMinor - 10_000);
  })();
});

it("sets approval up again with the PIN already entered, the sheet still only sending, when the bank no longer knows the phone's key on the PIN path", async () => {
  await pairPhoneBeforeTheBankForgetsItsKeys();
  await scenarioTest("transfer.approval_key_unknown", async () => {
    let releaseKeyRegistration: () => void = () => undefined;
    const keyRegistrationHeld = new Promise<void>((release) => {
      releaseKeyRegistration = () => {
        release();
      };
    });
    mswServer.use(
      http.post(
        "*/approval-keys",
        async () => {
          await keyRegistrationHeld;
        },
        { once: true },
      ),
    );
    await confirmRm100ApprovedByPin();
    const requestsBeforeApproving = sentRequests.length;

    await approveWithPin(DEMO_PIN);
    await waitFor(() => {
      expect(
        sentRequests
          .slice(requestsBeforeApproving)
          .some((request) =>
            new URL(request.url).pathname.endsWith("/approval-keys"),
          ),
      ).toBe(true);
    });
    expect(
      screen.queryByText("Approval needs setting up again on this phone."),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Approve", busy: true }),
    ).toBeOnTheScreen();
    releaseKeyRegistration();

    expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
    const approvalKeyIds = await Promise.all(
      approveRequests().map(
        async (request) => ((await request.json()) as { keyId: string }).keyId,
      ),
    );
    expect(approvalKeyIds).toHaveLength(2);
    expect(new Set(approvalKeyIds).size).toBe(2);
  })();
});

it.each([
  ["face or fingerprint", "Transfer", () => Promise.resolve()],
  ["the PIN", "Use PIN instead", () => approveWithPin(DEMO_PIN)],
])(
  "sets approval up again only once with %s when the bank still does not know the new keys, then says so on review",
  async (_, approveButtonName, finishApproving) => {
    let keyRegistrations = 0;
    await openReviewOfRm100();
    mswServer.use(
      http.post("*/transfers/:transferId/approve", () =>
        HttpResponse.json(
          { error: { code: "KEY_NOT_REGISTERED", message: "Test." } },
          { status: 409 },
        ),
      ),
      // Refusing a second registration ends a loop of them, which would otherwise run Jest out of memory.
      http.post("*/approval-keys", () => {
        keyRegistrations += 1;
        return keyRegistrations === 1
          ? HttpResponse.json({
              possessionKeyId: "possession-key-again",
              biometricKeyId: "biometric-key-again",
            })
          : HttpResponse.json(
              { error: { code: "SERVICE_UNAVAILABLE", message: "Test." } },
              { status: 503 },
            );
      }),
    );

    await fireEvent.press(
      screen.getByRole("button", { name: approveButtonName }),
    );
    await finishApproving();

    expect(
      await screen.findByText("Approval needs setting up again on this phone."),
    ).toBeOnTheScreen();
    expect(approveRequests()).toHaveLength(2);
    expect(keyRegistrations).toBe(1);
  },
);

it.each([
  ["face or fingerprint", "Transfer", () => Promise.resolve()],
  ["the PIN", "Use PIN instead", () => approveWithPin(DEMO_PIN)],
])(
  "still approves with %s once setting approval up again was left unfinished, the bank still holding the phone's keys",
  async (_, approveButtonName, finishApproving) => {
    mswServer.use(
      http.post(
        "*/transfers/:transferId/approve",
        () =>
          HttpResponse.json(
            { error: { code: "KEY_NOT_REGISTERED", message: "Test." } },
            { status: 409 },
          ),
        { once: true },
      ),
    );
    await confirmRm100Transfer();
    await screen.findByText(
      "Enter your PIN to set it up and approve this transfer.",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await screen.findByText("The transfer was not sent — no money moved.");

    await fireEvent.press(
      screen.getByRole("button", { name: approveButtonName }),
    );
    await finishApproving();

    expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  },
);

it.each([
  ["wrong", [], "That PIN is incorrect. You have 2 tries left."],
  [
    "locked",
    [
      "That PIN is incorrect. You have 2 tries left.",
      "That PIN is incorrect. You have 1 try left.",
    ],
    "Your PIN is locked. Reset it in the app's security settings.",
  ],
])(
  "leaves a newer transfer being sent alone when one the person left finishes refusing its %s PIN afterwards",
  async (_, earlierRefusals, leftTransfersRefusal) => {
    let recordDeleteHeld = false;
    let releaseRecordDelete: () => void = () => undefined;
    let releaseNewerApproval: () => void = () => undefined;
    const newerApprovalHeld = new Promise<void>((release) => {
      releaseNewerApproval = release;
    });
    await openReviewOfRm100();
    await fireEvent.press(
      screen.getByRole("button", { name: "Use PIN instead" }),
    );
    for (const refusal of earlierRefusals) {
      await approveWithPin("111111");
      await screen.findByText(refusal);
    }
    const deleteRecordForReal = secureStoreNativeDouble.deleteValueWithKeyAsync;
    jest
      .spyOn(secureStoreNativeDouble, "deleteValueWithKeyAsync")
      .mockImplementationOnce(async (key) => {
        recordDeleteHeld = true;
        await new Promise<void>((release) => {
          releaseRecordDelete = release;
        });
        return deleteRecordForReal(key);
      });
    await approveWithPin("111111");
    // ⛔ Wait on the hold, never the spy's calls: an earlier test's spy can still be in place, having seen this test's earlier deletes.
    await waitFor(() => {
      expect(recordDeleteHeld).toBe(true);
    });

    // The sending sheet covers the app, so starting another transfer behind it stands in for any route that still could.
    const behindTheSendingSheet = { includeHiddenElements: true };
    await act(() => {
      router.dismissTo("/");
    });
    mswServer.use(
      http.post(
        "*/transfers/:transferId/approve",
        async () => {
          await newerApprovalHeld;
        },
        { once: true },
      ),
    );
    await fireEvent.press(
      await screen.findByRole("button", {
        name: "Transfer",
        ...behindTheSendingSheet,
      }),
    );
    await fireEvent.changeText(
      await screen.findByLabelText(
        "DuitNow mobile number",
        behindTheSendingSheet,
      ),
      "012-345 6789",
    );
    await fireEvent.press(
      screen.getByRole("button", {
        name: "Continue",
        ...behindTheSendingSheet,
      }),
    );
    await fireEvent.changeText(
      await screen.findByLabelText("Amount (RM)", behindTheSendingSheet),
      "50",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Review", ...behindTheSendingSheet }),
    );
    // Home's Transfer stays mounted under the transfer screens; review's, on top, is found last.
    await fireEvent.press(
      (
        await screen.findAllByRole("button", {
          name: "Transfer",
          ...behindTheSendingSheet,
        })
      ).at(-1)!,
    );
    await screen.findByText(
      "Sending your transfer. The bank's answer comes next.",
      behindTheSendingSheet,
    );
    await act(async () => {
      releaseRecordDelete();
      await jest.advanceTimersByTimeAsync(1_000);
    });
    expect(
      screen.queryByText(leftTransfersRefusal, behindTheSendingSheet),
    ).toBeNull();
    releaseNewerApproval();

    expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
    expect(screen.getByText("RM 50.00")).toBeOnTheScreen();
  },
);
