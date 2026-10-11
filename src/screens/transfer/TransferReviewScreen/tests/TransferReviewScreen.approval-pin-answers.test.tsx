import type { QueryClient } from "@tanstack/react-query";
import { act, fireEvent, screen } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";

import type { GetPrimaryAccountResponse } from "@/domains/account/api/get-primary-account/get-primary-account.type";
import {
  approvalSettingsStore,
  notifyApprovalPinReset,
} from "@/domains/approval/lib/approval-host-inputs/approval-host-inputs";
import { rememberApprovalPinLocked } from "@/domains/approval/lib/approval-pin-lock/approval-pin-lock";
import { approvalPinSheetStore } from "@/domains/approval/lib/approval-pin-sheet/approval-pin-sheet";
import { listPendingTransfers } from "@/domains/transfer/lib/pending-transfers/pending-transfers";
import { transferFlowStore } from "@/screens/transfer/flow-store/flow-store";
import {
  biometricPromptsShown,
  changeEnrolledBiometrics,
  reportBiometricSensorUnavailable,
} from "@/test/doubles/biometrics-double";
import {
  observedRecords,
  reportedScenarios,
} from "@/test/doubles/native-doubles";
import {
  pairPhoneAsTheDemoLaunchDoes,
  pairPhoneBeforeTheBankForgetsItsKeys,
} from "@/test/mock-bank/demo-pairing";
import {
  mswServer,
  readBankBalanceMinor,
  sendToBank,
  sentRequests,
} from "@/test/mock-bank/mock-bank";
import { enterPinAndApprove, scenarioTest } from "@/test/render/drive-app";
import { relaunchApp, renderRoute } from "@/test/render/render-route";

import {
  approveRequests,
  walkToTransferReviewAndPressTransfer,
  walkToTransferReviewUntilTransferShows,
} from "./TransferReviewScreen.helper";

it(
  "approves with the bank PIN beside the phone's own key, and the bank moves the money",
  scenarioTest("transfer.biometrics_unavailable", async () => {
    const balanceBeforeMinor = await readBankBalanceMinor();
    approvalSettingsStore.setState({ biometricApprovalOn: false });
    await pairPhoneAsTheDemoLaunchDoes();
    await renderRoute("/transfer");
    await walkToTransferReviewAndPressTransfer();

    await enterPinAndApprove(DEMO_PIN);

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
    approvalSettingsStore.setState({ biometricApprovalOn: false });
    await pairPhoneAsTheDemoLaunchDoes();
    await renderRoute("/transfer");
    await walkToTransferReviewAndPressTransfer();

    await enterPinAndApprove("111111");

    expect(
      await screen.findByText("That PIN is incorrect. You have 2 tries left."),
    ).toBeOnTheScreen();
    await enterPinAndApprove(DEMO_PIN);
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
    approvalSettingsStore.setState({ biometricApprovalOn: false });
    await pairPhoneAsTheDemoLaunchDoes();
    await renderRoute("/transfer");
    await walkToTransferReviewAndPressTransfer();

    await enterPinAndApprove("111111");
    await screen.findByText("That PIN is incorrect. You have 2 tries left.");
    await enterPinAndApprove("111111");
    await screen.findByText("That PIN is incorrect. You have 1 try left.");
    await enterPinAndApprove("111111");

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
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/transfer");
  await walkToTransferReviewUntilTransferShows();
  await fireEvent.press(
    screen.getByRole("button", { name: "Use PIN instead" }),
  );
  await enterPinAndApprove("111111");
  await screen.findByText("That PIN is incorrect. You have 2 tries left.");
  await enterPinAndApprove("111111");
  await screen.findByText("That PIN is incorrect. You have 1 try left.");
  await enterPinAndApprove("111111");
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
    await pairPhoneAsTheDemoLaunchDoes();
    await renderRoute("/transfer");
    await walkToTransferReviewUntilTransferShows();
    await fireEvent.press(
      screen.getByRole("button", { name: "Use PIN instead" }),
    );
    await enterPinAndApprove("111111");
    await screen.findByText("That PIN is incorrect. You have 2 tries left.");
    await enterPinAndApprove("111111");
    await screen.findByText("That PIN is incorrect. You have 1 try left.");
    await enterPinAndApprove("111111");
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
  approvalSettingsStore.setState({ biometricApprovalOn: false });
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/transfer");
  await walkToTransferReviewAndPressTransfer();

  await enterPinAndApprove("111111");
  await screen.findByText("That PIN is incorrect. You have 2 tries left.");

  // ⛔ Read directly: only a phone that kills the app with this sheet open meets the record at the next launch, and
  // a relaunch here unmounts the root first, which answers the sheet as closed and forgets the record anyway.
  expect(await listPendingTransfers(customerId)).toEqual([]);
});

it("reopens nothing and warns of nothing at the next launch once the bank locks the PIN", async () => {
  approvalSettingsStore.setState({ biometricApprovalOn: false });
  await pairPhoneAsTheDemoLaunchDoes();
  const view = await renderRoute("/transfer");
  await walkToTransferReviewAndPressTransfer();
  await lockThePinWithThreeWrongTries();

  const relaunched = await relaunchApp(view);

  expect(
    await screen.findByRole("button", { name: "Transfer", disabled: false }),
  ).toBeOnTheScreen();
  await act(() => jest.advanceTimersByTimeAsync(1_000));
  expect(relaunched.getPathname()).toBe("/");
  expect(screen.queryByText(/still being checked/)).toBeNull();
});

it("keeps the PIN the bank locked for the next transfer, whose Transfer shows the locked words with no keypad", async () => {
  approvalSettingsStore.setState({ biometricApprovalOn: false });
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/transfer");
  await walkToTransferReviewAndPressTransfer();
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
  approvalSettingsStore.setState({ biometricApprovalOn: false });
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/transfer");
  await walkToTransferReviewAndPressTransfer();
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
    await pairPhoneAsTheDemoLaunchDoes();
    await renderRoute("/transfer");
    await walkToTransferReviewAndPressTransfer();
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
      await pairPhoneAsTheDemoLaunchDoes();
      await renderRoute("/transfer");
      await walkToTransferReviewUntilTransferShows();
      await fireEvent.press(
        screen.getByRole("button", { name: "Use PIN instead" }),
      );
      await enterPinAndApprove(DEMO_PIN);
    },
  ],
  [
    "the fingerprints or face changed",
    async () => {
      await pairPhoneAsTheDemoLaunchDoes();
      await renderRoute("/transfer");
      await walkToTransferReviewUntilTransferShows();
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
      await pairPhoneAsTheDemoLaunchDoes();
      await renderRoute("/transfer");
      await walkToTransferReviewUntilTransferShows();
      await act(rememberApprovalPinLocked);
      await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
    },
  ],
  [
    "only the PIN could approve the next transfer",
    async () => {
      await pairPhoneAsTheDemoLaunchDoes();
      await renderRoute("/transfer");
      await walkToTransferReviewUntilTransferShows();
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
  approvalSettingsStore.setState({ biometricApprovalOn: false });
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/transfer");
  await walkToTransferReviewAndPressTransfer();
  await enterPinAndApprove(DEMO_PIN);
  await fireEvent.press(await screen.findByRole("button", { name: "Close" }));
  await screen.findByText(
    "Your PIN is locked. Reset it in the app's security settings.",
  );

  await act(() => notifyApprovalPinReset());
  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
  await enterPinAndApprove(DEMO_PIN);

  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
});

it("keeps the PIN nowhere once its approval is answered", async () => {
  approvalSettingsStore.setState({ biometricApprovalOn: false });
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/transfer");
  await walkToTransferReviewAndPressTransfer();

  await enterPinAndApprove(DEMO_PIN);
  await screen.findByText("Transfer sent");

  expect(await approveRequests().at(-1)?.text()).toContain(DEMO_PIN);
  expect(await readWhatTheAppStillHolds()).not.toContain(DEMO_PIN);
});

it("keeps a refused PIN nowhere once the sheet is closed on review", async () => {
  approvalSettingsStore.setState({ biometricApprovalOn: false });
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/transfer");
  await walkToTransferReviewAndPressTransfer();

  await enterPinAndApprove("111111");
  await screen.findByText("That PIN is incorrect. You have 2 tries left.");
  await fireEvent.press(screen.getByRole("button", { name: "Close" }));
  await screen.findByRole("button", { name: "Transfer" });

  expect(await approveRequests().at(-1)?.text()).toContain("111111");
  expect(await readWhatTheAppStillHolds()).not.toContain("111111");
});

const DEMO_PIN = "246810";

async function lockThePinWithThreeWrongTries() {
  await enterPinAndApprove("111111");
  await screen.findByText("That PIN is incorrect. You have 2 tries left.");
  await enterPinAndApprove("111111");
  await screen.findByText("That PIN is incorrect. You have 1 try left.");
  await enterPinAndApprove("111111");
  await fireEvent.press(await screen.findByRole("button", { name: "Close" }));
  await screen.findByRole("button", { name: "Transfer" });
}

async function readWhatTheAppStillHolds() {
  // Lets a finished call's zero-length cache timer run, which drops its variables.
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
  const { queryClient } = jest.requireMock<{ queryClient: QueryClient }>(
    "@/root/query-client/query-client",
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
