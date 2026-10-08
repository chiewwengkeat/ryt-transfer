import type { QueryClient } from "@tanstack/react-query";
import { act, fireEvent, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { http } from "msw";

import type { GetPrimaryAccountResponse } from "@/domains/account/api/get-primary-account/get-primary-account.type";
import { approvalPinSheetStore } from "@/domains/approval/hooks/approval-pin-sheet";
import { approvalSettingsStore } from "@/domains/approval/hooks/approval-settings";
import { listPendingTransfers } from "@/domains/transfer/hooks/pending-transfers";
import { transferFlowStore } from "@/screens/transfer/state/transfer-flow";
import { readBankBalanceMinor, sendToBank } from "@/test/bank-client";
import {
  biometricPromptsShown,
  changeEnrolledBiometrics,
  failNextBiometricPrompt,
  reportBiometricSensorUnavailable,
} from "@/test/biometrics-double";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { observedRecords } from "@/test/harness/recording-sink";
import { mswServer, sentRequests } from "@/test/msw-server";
import { renderRoute } from "@/test/render-route";
import { scenarioTest } from "@/test/scenario-test";

const DEMO_PIN = "246810";

async function confirmRm100ApprovedByPin() {
  approvalSettingsStore.setState({ biometricApprovalOn: false });
  await confirmRm100Transfer();
}

async function confirmRm100Transfer() {
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/transfer");
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
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    expect(
      await screen.findByRole("button", { name: "Transfer" }),
    ).toBeOnTheScreen();
    expect(screen.getByText(lockedMessage)).toBeOnTheScreen();
    jest.useRealTimers();
    expect(await readBankBalanceMinor()).toBe(balanceBeforeMinor);
  }),
);

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

it(
  "says the face or fingerprint was not recognised, sends nothing, and leaves Transfer to try again",
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
  }),
);

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
    await approveWithPin(DEMO_PIN);
    expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  }),
);

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
])("asks for the PIN, saying why, when %s", async (_, sensorCode, reason) => {
  reportBiometricSensorUnavailable(sensorCode);
  await confirmRm100Transfer();

  expect(await screen.findByText(reason)).toBeOnTheScreen();
  expect(
    screen.getByText(
      "Face or fingerprint approval isn't available, so approve with your PIN.",
    ),
  ).toBeOnTheScreen();
  expect(biometricPromptsShown()).toEqual([]);
});

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

it(
  "stops before anything is sent when the prompt fails in a way the app does not name",
  scenarioTest("transfer.approval_unexpected", async () => {
    failNextBiometricPrompt("SIGNATURE_CREATION_FAILED");
    await confirmRm100Transfer();

    expect(
      await screen.findByText(
        "Something unexpected stopped the approval before it was sent — no money moved.",
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
  await confirmRm100Transfer();
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
  jest.useRealTimers();
  const {
    body: { customerId },
  } = await sendToBank<GetPrimaryAccountResponse>("GET", "/accounts/primary");
  expect(await listPendingTransfers(customerId)).toContainEqual(
    expect.objectContaining({ transferId: firstTransferId }),
  );
});
