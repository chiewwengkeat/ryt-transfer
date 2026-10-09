import { act, fireEvent, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { http, HttpResponse } from "msw";

import { rootedPhoneDemoPickStore } from "@/domains/approval/hooks/device-integrity-verdict";
import {
  TransferFunds,
  TransferStatus,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import {
  PendingTransferStage,
  writePendingTransfer,
} from "@/domains/transfer/hooks/pending-transfers";
import { sendToBank, startTestTransfer } from "@/test/bank-client";
import {
  biometricPromptsShown,
  cancelNextBiometricPrompt,
  deviceIntegrityChecksAsked,
  failDeviceIntegrityChecks,
  failNextBiometricPrompt,
  holdDeviceIntegrityChecks,
  reportDeviceIntegrity,
} from "@/test/harness/biometrics-double";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { pressHardwareBack } from "@/test/hardware-back";
import { observedRecords } from "@/test/harness/recording-sink";
import { mswServer, sentRequests } from "@/test/msw-server";
import { renderRoute } from "@/test/render-route";
import { walkToTransferReview } from "@/test/walk-to-transfer-review";

const PHONE_REFUSAL =
  "This phone's security can't be confirmed, so transfers are off on it.";
const PIN_OFFER =
  "Your face or fingerprint was not recognised. You can try again, or use your PIN.";
const EARLIER_TRANSFER_UNCONFIRMED =
  /^Your last transfer is still being checked/;
const PIN_SHEET = "Enter your bank PIN to approve this transfer.";

async function openReviewOfRm100() {
  const view = await renderRoute("/transfer");
  await walkToTransferReview();
  return view;
}

function transferWritesSent() {
  return sentRequests
    .filter(({ method }) => method === "POST")
    .map(({ url }) => new URL(url).pathname)
    .filter((path) => path.startsWith("/transfers"));
}

async function approveWithPinFromTheSheet() {
  await screen.findByText(PIN_SHEET);
  for (const digit of "246810")
    await fireEvent.press(screen.getByRole("button", { name: digit }));
  await fireEvent.press(screen.getByRole("button", { name: "Approve" }));
  await screen.findByText("Transfer sent");
}

async function approveFromReviewOpenedAgain() {
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await screen.findByText("Transfer sent");
}

it("refuses approval in place of the prompt on a phone that reports root, leaving no way to approve and sending nothing, then approves from review opened again once the phone reports clean", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  reportDeviceIntegrity({
    isRooted: true,
    isCompromised: true,
    riskLevel: "HIGH",
  });
  await openReviewOfRm100();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  expect(await screen.findByText(PHONE_REFUSAL)).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Transfer" })).toBeNull();
  expect(biometricPromptsShown()).toEqual([]);
  expect(transferWritesSent()).toEqual([]);
  await pressHardwareBack();
  reportDeviceIntegrity({});
  await approveFromReviewOpenedAgain();
  expect(biometricPromptsShown()).toHaveLength(1);
  expect(transferWritesSent()).toEqual([
    "/transfers",
    expect.stringMatching(/^\/transfers\/[\w-]+\/approve$/),
  ]);
});

it("shows the refusal alone, with no earlier transfer's warning, no notice that offers the PIN and no Use PIN instead beside it", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const {
    body: { customerId },
  } = await sendToBank<{ customerId: string }>("GET", "/accounts/primary");
  const { created } = await startTestTransfer(10_000);
  await writePendingTransfer(customerId, {
    transferId: created.transfer.transferId,
    idempotencyKey: "approval-key",
    createdAt: "2026-10-07T01:30:00.000Z",
    stage: PendingTransferStage.Processing,
  });
  mswServer.use(
    http.get("*/transfers/:transferId", () =>
      HttpResponse.json({
        transfer: {
          ...created.transfer,
          status: TransferStatus.Processing,
          funds: TransferFunds.Debited,
        },
      }),
    ),
  );
  failNextBiometricPrompt("AUTHENTICATION_FAILED");
  await openReviewOfRm100();
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  expect(await screen.findByText(PIN_OFFER)).toBeOnTheScreen();
  expect(screen.getByText(EARLIER_TRANSFER_UNCONFIRMED)).toBeOnTheScreen();
  expect(
    screen.getByRole("button", { name: "Use PIN instead" }),
  ).toBeOnTheScreen();
  reportDeviceIntegrity({
    isRooted: true,
    isCompromised: true,
    riskLevel: "HIGH",
  });

  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));

  expect(await screen.findByText(PHONE_REFUSAL)).toBeOnTheScreen();
  expect(screen.queryByText(PIN_OFFER)).toBeNull();
  expect(screen.queryByText(EARLIER_TRANSFER_UNCONFIRMED)).toBeNull();
  expect(screen.queryByRole("button", { name: "Use PIN instead" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Transfer" })).toBeNull();
});

it("checks the phone afresh at each press, so a phone that reports hooks after a closed prompt is refused", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  await openReviewOfRm100();
  cancelNextBiometricPrompt();
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await screen.findByText("The transfer was not sent — no money moved.");
  reportDeviceIntegrity({
    hasRuntimeHooks: true,
    isCompromised: true,
    riskLevel: "HIGH",
  });

  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));

  expect(await screen.findByText(PHONE_REFUSAL)).toBeOnTheScreen();
  expect(biometricPromptsShown()).toHaveLength(1);
});

it("ignores the demo's rooted-phone pick in a production build, and approves on a phone that reports clean", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  // Set directly: a production build loads no demo layer, so no pick can reach the store any other way.
  rootedPhoneDemoPickStore.setState({ rootedPhonePicked: true });
  await openReviewOfRm100();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  expect(biometricPromptsShown()).toHaveLength(1);
});

it("waits, showing Transfer busy, for a phone check still running when it is pressed, then refuses", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const answerHeldChecks = holdDeviceIntegrityChecks();
  await openReviewOfRm100();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  const transferWhileChecking = screen.getByRole("button", {
    name: "Transfer",
  });
  const promptsWhileChecking = biometricPromptsShown();
  await act(() => {
    answerHeldChecks({
      hasRuntimeHooks: true,
      isCompromised: true,
      riskLevel: "HIGH",
    });
  });

  expect(transferWhileChecking).toBeBusy();
  expect(promptsWhileChecking).toEqual([]);
  expect(await screen.findByText(PHONE_REFUSAL)).toBeOnTheScreen();
  expect(biometricPromptsShown()).toEqual([]);
  expect(transferWritesSent()).toEqual([]);
  await pressHardwareBack();
  reportDeviceIntegrity({});
  await approveFromReviewOpenedAgain();
  expect(biometricPromptsShown()).toHaveLength(1);
  expect(transferWritesSent()).toEqual([
    "/transfers",
    expect.stringMatching(/^\/transfers\/[\w-]+\/approve$/),
  ]);
});

it("lets approval go ahead when the phone check gives no clear answer, and records that once", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  failDeviceIntegrityChecks();
  await openReviewOfRm100();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  expect(
    observedRecords.filter(({ name }) => name === "device_integrity_unknown"),
  ).toEqual([
    { type: "event", name: "device_integrity_unknown", properties: {} },
  ]);
});

it("lets approval go ahead when the phone check has not answered within 5 seconds, and records that once", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  holdDeviceIntegrityChecks();
  await openReviewOfRm100();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await act(async () => {
    await jest.advanceTimersByTimeAsync(4_999);
  });
  const transferJustBeforeFiveSeconds = screen.getByRole("button", {
    name: "Transfer",
  });
  const promptsJustBeforeFiveSeconds = biometricPromptsShown();
  await act(async () => {
    await jest.advanceTimersByTimeAsync(1);
  });

  expect(transferJustBeforeFiveSeconds).toBeBusy();
  expect(promptsJustBeforeFiveSeconds).toEqual([]);
  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  expect(biometricPromptsShown()).toHaveLength(1);
  expect(
    observedRecords.filter(({ name }) => name === "device_integrity_unknown"),
  ).toEqual([
    { type: "event", name: "device_integrity_unknown", properties: {} },
  ]);
});

it.each([
  ["Android's Back", pressHardwareBack],
  // Jest cannot press the native header; Android's header Back pops review as this does.
  [
    "Android's header Back",
    async () => {
      await act(() => {
        router.back();
      });
    },
  ],
])(
  "creates and approves nothing when review is left with %s while the phone check runs, and approves from review opened again",
  async (_, leaveReview) => {
    await pairPhoneAsTheDemoLaunchDoes();
    const answerHeldChecks = holdDeviceIntegrityChecks();
    const view = await openReviewOfRm100();
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
    const transferWhileChecking = screen.getByRole("button", {
      name: "Transfer",
    });

    await leaveReview();
    await act(async () => {
      answerHeldChecks({});
      await jest.advanceTimersByTimeAsync(10_000);
    });

    expect(transferWhileChecking).toBeBusy();
    expect(view.getPathname()).toBe("/transfer/amount");
    expect(biometricPromptsShown()).toEqual([]);
    expect(transferWritesSent()).toEqual([]);
    await approveFromReviewOpenedAgain();
    expect(biometricPromptsShown()).toHaveLength(1);
    expect(transferWritesSent()).toEqual([
      "/transfers",
      expect.stringMatching(/^\/transfers\/[\w-]+\/approve$/),
    ]);
  },
);

it("creates and approves nothing when an iPhone's Back or swipe starts closing review while the phone check runs", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const answerHeldChecks = holdDeviceIntegrityChecks();
  await openReviewOfRm100();
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  // iOS tells review it will disappear as its own Back or swipe begins, and pops it here only once that ends.
  await fireEvent(screen.getByText("RM 100.00"), "willDisappear");
  await act(async () => {
    answerHeldChecks({});
    await jest.advanceTimersByTimeAsync(10_000);
  });
  const promptsBeforeThePopLands = biometricPromptsShown();
  const writesBeforeThePopLands = transferWritesSent();
  await act(() => {
    router.back();
  });

  expect(promptsBeforeThePopLands).toEqual([]);
  expect(writesBeforeThePopLands).toEqual([]);
  await approveFromReviewOpenedAgain();
  expect(biometricPromptsShown()).toHaveLength(1);
  expect(transferWritesSent()).toEqual([
    "/transfers",
    expect.stringMatching(/^\/transfers\/[\w-]+\/approve$/),
  ]);
});

it("refuses Use PIN instead before any PIN sheet on a phone that reports root, sending nothing", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  reportDeviceIntegrity({
    isRooted: true,
    isCompromised: true,
    riskLevel: "HIGH",
  });
  await openReviewOfRm100();
  const checksBeforePress = deviceIntegrityChecksAsked();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Use PIN instead" }),
  );

  expect(await screen.findByText(PHONE_REFUSAL)).toBeOnTheScreen();
  expect(screen.queryByText(PIN_SHEET)).toBeNull();
  expect(screen.queryByRole("button", { name: "Use PIN instead" })).toBeNull();
  expect(transferWritesSent()).toEqual([]);
  expect(deviceIntegrityChecksAsked() - checksBeforePress).toBe(1);
});

it("waits, showing Transfer busy and no PIN sheet, for a phone check still running when Use PIN instead is pressed, then approves with the PIN on that one check", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const answerHeldChecks = holdDeviceIntegrityChecks();
  await openReviewOfRm100();
  const checksBeforePress = deviceIntegrityChecksAsked();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Use PIN instead" }),
  );
  const transferWhileChecking = screen.getByRole("button", {
    name: "Transfer",
  });
  const pinOfferWhileChecking = screen.queryByRole("button", {
    name: "Use PIN instead",
  });
  const sheetWhileChecking = screen.queryByText(PIN_SHEET);
  await act(() => {
    answerHeldChecks({});
  });

  expect(transferWhileChecking).toBeBusy();
  expect(pinOfferWhileChecking).toBeNull();
  expect(sheetWhileChecking).toBeNull();
  await approveWithPinFromTheSheet();
  expect(biometricPromptsShown()).toEqual([]);
  expect(deviceIntegrityChecksAsked() - checksBeforePress).toBe(1);
});

it("lets Use PIN instead go ahead when the phone check has not answered within 5 seconds, and records that once", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  holdDeviceIntegrityChecks();
  await openReviewOfRm100();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Use PIN instead" }),
  );
  await act(async () => {
    await jest.advanceTimersByTimeAsync(4_999);
  });
  const sheetJustBeforeFiveSeconds = screen.queryByText(PIN_SHEET);
  await act(async () => {
    await jest.advanceTimersByTimeAsync(1);
  });

  expect(sheetJustBeforeFiveSeconds).toBeNull();
  await approveWithPinFromTheSheet();
  expect(
    observedRecords.filter(({ name }) => name === "device_integrity_unknown"),
  ).toEqual([
    { type: "event", name: "device_integrity_unknown", properties: {} },
  ]);
});

it("checks the phone afresh at each press of Use PIN instead, so a phone that reports hooks after a closed PIN sheet is refused", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  await openReviewOfRm100();
  const checksBeforePresses = deviceIntegrityChecksAsked();
  await fireEvent.press(
    await screen.findByRole("button", { name: "Use PIN instead" }),
  );
  await screen.findByText(PIN_SHEET);
  await fireEvent.press(screen.getByRole("button", { name: "Close" }));
  await screen.findByText("The transfer was not sent — no money moved.");
  reportDeviceIntegrity({
    hasRuntimeHooks: true,
    isCompromised: true,
    riskLevel: "HIGH",
  });

  await fireEvent.press(
    screen.getByRole("button", { name: "Use PIN instead" }),
  );

  expect(await screen.findByText(PHONE_REFUSAL)).toBeOnTheScreen();
  expect(deviceIntegrityChecksAsked() - checksBeforePresses).toBe(2);
  expect(transferWritesSent()).toEqual(["/transfers"]);
});
