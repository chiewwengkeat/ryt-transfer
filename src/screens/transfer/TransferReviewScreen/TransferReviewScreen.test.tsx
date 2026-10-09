import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { t } from "i18next";
import { http, HttpResponse } from "msw";
import { AccessibilityInfo, Platform } from "react-native";

import type { GetPrimaryAccountResponse } from "@/domains/account/api/get-primary-account/get-primary-account.type";
import type { GetTransferLimitsResponse } from "@/domains/account/api/get-transfer-limits/get-transfer-limits.type";
import { approvalSettingsStore } from "@/domains/approval/lib/approval-host-inputs/approval-host-inputs";
import { ApproveTransferErrorCode } from "@/domains/transfer/api/approve-transfer/approve-transfer.type";
import {
  TransferFunds,
  TransferStatus,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import type { ListRecentRecipientsResponse } from "@/domains/transfer/api/list-recent-recipients/list-recent-recipients.type";
import { getLookupRecipientOptions } from "@/domains/transfer/api/lookup-recipient/lookup-recipient";
import { RecipientIdType } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import {
  PendingTransferStage,
  writePendingTransfer,
} from "@/domains/transfer/lib/pending-transfers/pending-transfers";
import { TransportErrorKind } from "@/shared/http/transport-error/transport-error";
import { formatMalaysianDateTime } from "@/shared/lib/dates/dates";
import { reportRequestOutcome } from "@/shared/platform/offline/offline";
import {
  type BankErrorBody,
  lookUpTestRecipient,
  readBankBalanceMinor,
  sendToBank,
  startTestTransfer,
} from "@/test/bank-client";
import {
  biometricPromptsShown,
  cancelNextBiometricPrompt,
  holdNextBiometricPrompt,
  phoneKeyOptions,
} from "@/test/biometrics-double";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { finishOpeningScreen } from "@/test/finish-opening-screen";
import { pressHardwareBack } from "@/test/hardware-back";
import { readBankOnRealTimers } from "@/test/read-bank-on-real-timers";
import {
  secureStoreNativeDouble,
  setPhoneNetwork,
} from "@/test/harness/native-doubles";
import {
  observedRecords,
  reportedScenarios,
} from "@/test/harness/recording-sink";
import { holdTheNextTransferRead } from "@/test/hold-the-next-transfer-read";
import { mswServer, sentRequests } from "@/test/msw-server";
import { pressHandlerOf } from "@/test/press-handler-of";
import {
  askOpenAppToReadAgain,
  relaunchApp,
  renderRoute,
} from "@/test/render-route";
import { scenarioTest } from "@/test/scenario-test";

import { TransferFlowStep } from "@/screens/transfer/flow-store/flow-store";

afterEach(() => {
  jest.restoreAllMocks();
});

const RECIPIENT_MOBILE = "012-345 6789";

// Home holds Transfer back until its first reads land, so a press made sooner does nothing.
async function waitForHomeToOfferTransfer() {
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Transfer" })).toBeEnabled();
  });
}

async function openReviewOfRm100(
  startPath: "/" | "/transfer" = "/transfer",
  note?: string,
) {
  const view = await renderRoute(startPath);
  if (startPath === "/") {
    await waitForHomeToOfferTransfer();
    await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
  }
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    RECIPIENT_MOBILE,
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("RM 12,845.50");
  await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
  if (note !== undefined)
    await fireEvent.changeText(screen.getByLabelText("Note (optional)"), note);
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  return view;
}

// The swipe is native and never reaches JS, so this reads the setting the native transfer screen is handed.
function readRootTransferScreenGestureEnabled() {
  const transferScreen = screen.root?.queryAll(
    (node) =>
      node.type === "RNSScreen" &&
      String(node.props.screenId).startsWith("transfer-"),
  )[0];
  if (transferScreen === undefined)
    throw new Error("The root stack holds no transfer screen.");
  return transferScreen.props.gestureEnabled as unknown;
}

it(
  "shows the name and bank the bank holds for the number, and the number masked",
  scenarioTest("transfer.recipient_found", async () => {
    const { recipient } = await lookUpTestRecipient(RECIPIENT_MOBILE);
    await openReviewOfRm100();

    expect(await screen.findByText(recipient.registeredName)).toBeOnTheScreen();
    expect(screen.getByText(recipient.bankName)).toBeOnTheScreen();
    expect(screen.getByText(recipient.idValueMasked)).toBeOnTheScreen();
    expect(screen.getByText("RM 100.00")).toBeOnTheScreen();
  }),
);

it(
  "asks for a second look at the name on a first transfer to the recipient",
  scenarioTest("transfer.first_transfer_to_recipient", async () => {
    await openReviewOfRm100();

    expect(
      await screen.findByText(
        "This is your first transfer to this recipient. Check the name is who you expect.",
      ),
    ).toBeOnTheScreen();
  }),
);

it(
  "signs what review shows and sends it, and the bank verifies it and moves the money",
  scenarioTest("transfer.biometrics_recognised", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const balanceBeforeMinor = await readBankBalanceMinor();
    const view = await openReviewOfRm100();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    await screen.findByText("Transfer sent");
    expect(view.getPathname()).toMatch(/^\/transfer\/result\/[\w-]+$/);
    expect(await readBankOnRealTimers(readBankBalanceMinor)).toBe(
      balanceBeforeMinor - 10_000,
    );
  }),
);

it(
  "sends one transfer when Transfer is pressed twice before review can re-render",
  scenarioTest("transfer.double_tap_ignored", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const balanceBeforeMinor = await readBankBalanceMinor();
    await openReviewOfRm100();
    const pressTransfer = pressHandlerOf(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    // ⛔ Not two fireEvent.press calls: awaited, the second meets a busy button; together, their acts overlap.
    // Both presses in one act land before the re-render, so only the flow's own guard can refuse the second.
    await act(() => {
      pressTransfer();
      pressTransfer();
    });

    await screen.findByText("Transfer sent");
    expect(countSent("POST", "/transfers")).toBe(1);
    expect(countSent("POST", "/approve")).toBe(1);
    expect(biometricPromptsShown()).toHaveLength(1);
    expect(await readBankOnRealTimers(readBankBalanceMinor)).toBe(
      balanceBeforeMinor - 10_000,
    );
  }),
);

it("signs the name, masked number, bank and amount review shows, and no note", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const { recipient } = await lookUpTestRecipient(RECIPIENT_MOBILE);
  const releasePrompt = holdNextBiometricPrompt();
  await openReviewOfRm100();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await waitFor(() => {
    expect(biometricPromptsShown()).toHaveLength(1);
  });

  const [prompt] = biometricPromptsShown();
  expect(JSON.parse(prompt?.data ?? "")).toMatchObject({
    registeredName: recipient.registeredName,
    idValueMasked: recipient.idValueMasked,
    bankCode: recipient.bankCode,
    amountMinor: 10_000,
    currency: "MYR",
    note: null,
  });
  expect(screen.getByText(recipient.registeredName)).toBeOnTheScreen();
  expect(screen.getByText(recipient.idValueMasked)).toBeOnTheScreen();
  expect(screen.getByText(recipient.bankName)).toBeOnTheScreen();
  expect(screen.getByText("RM 100.00")).toBeOnTheScreen();
  releasePrompt();
  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
});

it("signs the note review shows and sends it with the transfer, which the bank then approves", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const releasePrompt = holdNextBiometricPrompt();
  await openReviewOfRm100("/transfer", "Lunch");

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await waitFor(() => {
    expect(biometricPromptsShown()).toHaveLength(1);
  });

  const [prompt] = biometricPromptsShown();
  expect(JSON.parse(prompt?.data ?? "")).toMatchObject({ note: "Lunch" });
  const create = sentRequests.find(
    (request) =>
      request.method === "POST" &&
      /\/transfers$/.test(new URL(request.url).pathname),
  );
  expect(await create?.json()).toMatchObject({ note: "Lunch" });
  releasePrompt();
  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
});

it("reports each step of a sent transfer and each scenario it shows, with its amount, never with the recipient", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  await openReviewOfRm100();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await screen.findByText("Transfer sent");

  expect(
    observedRecords
      .filter((record) => record.name === "transfer_step")
      .map((record) => record.properties),
  ).toEqual([
    { scenario: "transfer.balance_and_limit_shown" },
    { step: "reviewing", amountMinor: 10_000, currency: "MYR" },
    { scenario: "transfer.recipient_found" },
    { scenario: "transfer.first_transfer_to_recipient" },
    { step: "creating", amountMinor: 10_000, currency: "MYR" },
    {
      step: "approving",
      amountMinor: 10_000,
      currency: "MYR",
      path: "biometric",
    },
    { scenario: "transfer.biometrics_recognised" },
    {
      step: "submitting",
      amountMinor: 10_000,
      currency: "MYR",
      path: "biometric",
    },
    { step: "done" },
    { step: "editing" },
  ]);
});

it(
  "approves with the PIN when it is chosen instead of a face or fingerprint, with no prompt",
  scenarioTest("transfer.pin_chosen", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const balanceBeforeMinor = await readBankBalanceMinor();
    await openReviewOfRm100();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Use PIN instead" }),
    );
    expect(
      await screen.findByText("Enter your bank PIN to approve this transfer."),
    ).toBeOnTheScreen();
    for (const digit of "246810")
      await fireEvent.press(screen.getByRole("button", { name: digit }));
    await fireEvent.press(screen.getByRole("button", { name: "Approve" }));

    expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
    expect(biometricPromptsShown()).toEqual([]);
    expect(reportedScenarios()).toContain("transfer.pin_chosen");
    jest.useRealTimers();
    expect(await readBankBalanceMinor()).toBe(balanceBeforeMinor - 10_000);
  }),
);

// The OS draws the prompt out of Jest's sight, so these three read what the app hands the library.
it(
  "asks for a face or fingerprint only, never the phone's passcode",
  scenarioTest("transfer.biometrics_recognised", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    await openReviewOfRm100();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
    await screen.findByText("Transfer sent");

    expect(phoneKeyOptions()).toContainEqual(
      expect.objectContaining({
        keyType: "ec256",
        biometricStrength: "strong",
        allowDeviceCredentials: false,
      }),
    );
    expect(biometricPromptsShown()).toEqual([
      expect.objectContaining({
        biometricStrength: "strong",
        disableDeviceFallback: true,
      }),
    ]);
  }),
);

it(
  "hands the iOS face or fingerprint prompt a title stating the amount and the recipient's registered name",
  scenarioTest("transfer.biometrics_recognised", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const { recipient } = await lookUpTestRecipient(RECIPIENT_MOBILE);
    await openReviewOfRm100();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
    await screen.findByText("Transfer sent");

    expect(biometricPromptsShown()).toEqual([
      expect.objectContaining({
        promptTitle: `Approve RM 100.00 to ${recipient.registeredName}`,
      }),
    ]);
  }),
);

it(
  "hands the Android face or fingerprint prompt the amount and the recipient's registered name under its title",
  scenarioTest("transfer.biometrics_recognised", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const { recipient } = await lookUpTestRecipient(RECIPIENT_MOBILE);
    await openReviewOfRm100();
    const platformOs = jest.replaceProperty(Platform, "OS", "android");

    try {
      await fireEvent.press(
        await screen.findByRole("button", { name: "Transfer" }),
      );
      await screen.findByText("Transfer sent");
    } finally {
      platformOs.restore();
    }

    expect(biometricPromptsShown()).toEqual([
      expect.objectContaining({
        promptTitle: "Approve transfer",
        promptSubtitle: `RM 100.00 to ${recipient.registeredName}`,
      }),
    ]);
  }),
);

it(
  "says the transfer was not sent when the face or fingerprint prompt is closed",
  scenarioTest("transfer.approval_cancelled", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const balanceBeforeMinor = await readBankBalanceMinor();
    cancelNextBiometricPrompt();
    await openReviewOfRm100();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(
      await screen.findByText("The transfer was not sent — no money moved."),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Transfer" })).toBeOnTheScreen();
    expect(await readBankOnRealTimers(readBankBalanceMinor)).toBe(
      balanceBeforeMinor,
    );
  }),
);

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

it(
  "keeps review open when Back is pressed mid-approval, so the outcome is shown and one intended transfer debits once",
  scenarioTest("transfer.approval_unanswered", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const balanceBeforeMinor = await readBankBalanceMinor();
    let releaseApproval: () => void = () => undefined;
    const approvalHeld = new Promise<void>((release) => {
      releaseApproval = () => {
        release();
      };
    });
    // Holds the approval in flight, then falls through to the scenario, which commits it and loses the answer.
    mswServer.use(
      http.post(
        "*/transfers/:transferId/approve",
        async () => {
          await approvalHeld;
        },
        { once: true },
      ),
    );
    const view = await openReviewOfRm100();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
    await screen.findByText(
      "Sending your transfer. The bank's answer comes next.",
    );
    await pressHardwareBack();
    expect(view.getPathname()).toBe("/transfer/review");
    releaseApproval();

    expect(
      await screen.findByText("Transfer sent", {}, { timeout: 10_000 }),
    ).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Transfer" })).toBeNull();
    expect(await readBankOnRealTimers(readBankBalanceMinor)).toBe(
      balanceBeforeMinor - 10_000,
    );
  }),
);

it.each<[TransferFlowStep, (stepHeld: Promise<void>) => () => void]>([
  [
    TransferFlowStep.Creating,
    (stepHeld) => {
      mswServer.use(
        http.post(
          "*/transfers",
          async () => {
            await stepHeld;
          },
          { once: true },
        ),
      );
      return () => {
        expect(countSent("POST", "/transfers")).toBe(1);
      };
    },
  ],
  [
    TransferFlowStep.Approving,
    (stepHeld) => {
      const readFromTheDouble = secureStoreNativeDouble.getValueWithKeyAsync;
      const keychainRead = jest
        .spyOn(secureStoreNativeDouble, "getValueWithKeyAsync")
        .mockImplementationOnce(async (key) => {
          await stepHeld;
          return readFromTheDouble(key);
        });
      return () => {
        expect(keychainRead).toHaveBeenCalled();
      };
    },
  ],
  [
    TransferFlowStep.Submitting,
    (stepHeld) => {
      mswServer.use(
        http.post(
          "*/transfers/:transferId/approve",
          async () => {
            await stepHeld;
          },
          { once: true },
        ),
      );
      return () => {
        expect(countSent("POST", "/approve")).toBe(1);
      };
    },
  ],
])(
  "turns off the swipe that would close the whole transfer flow while the transfer is %s",
  async (_step, holdStep) => {
    await pairPhoneAsTheDemoLaunchDoes();
    await openReviewOfRm100("/");
    let releaseStep: () => void = () => undefined;
    // Armed once review is open: the launch check for pending transfers reads the keychain too, and would take the hold.
    const expectStepHeld = holdStep(
      new Promise<void>((release) => {
        releaseStep = () => {
          release();
        };
      }),
    );

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
    await waitFor(expectStepHeld);

    expect(readRootTransferScreenGestureEnabled()).toBe(false);
    releaseStep();
    await screen.findByText("Transfer sent");
  },
);

it(
  "leaves only Home beneath the result once the approval's answer is lost, so review cannot send it again",
  scenarioTest("transfer.approval_unanswered", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const view = await openReviewOfRm100("/");

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
    await screen.findByText("Transfer sent", {}, { timeout: 10_000 });
    await pressHardwareBack();

    expect(view.getPathname()).toBe("/");
  }),
);

it(
  "turns the swipe back on when the bank refuses the approval and nothing was sent",
  scenarioTest("transfer.approval_not_verified", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    await openReviewOfRm100("/");

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
    await screen.findByText(
      "The approval couldn't be verified — no money moved.",
    );

    expect(readRootTransferScreenGestureEnabled()).not.toBe(false);
  }),
);

it(
  "re-reads the balance after a lost answer, so Home shows the debit the bank made",
  scenarioTest("transfer.approval_unanswered", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    await openReviewOfRm100("/");

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
    await screen.findByText("Transfer sent", {}, { timeout: 10_000 });
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));

    expect(await screen.findByText("RM 12,745.50")).toBeOnTheScreen();
  }),
);

it("re-reads the balance after something unexpected fails past the approval, so Home shows the debit the bank made", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  await openReviewOfRm100("/");
  // Nothing the bank answers can fail past the approval, so a navigation fault stands in.
  jest.spyOn(router, "dismissTo").mockImplementationOnce(() => {
    throw new Error("Test.");
  });

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await screen.findByText("Transfer sent");
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));

  expect(await screen.findByText("RM 12,745.50")).toBeOnTheScreen();
});

it(
  "starts the next transfer blank after going Home from an approval whose answer was lost",
  scenarioTest("transfer.approval_unanswered", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const view = await openReviewOfRm100();
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
    await screen.findByText("Transfer sent", {}, { timeout: 10_000 });

    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
    expect(
      await screen.findByLabelText("DuitNow mobile number"),
    ).toHaveDisplayValue("");
    await fireEvent.changeText(
      screen.getByLabelText("DuitNow mobile number"),
      RECIPIENT_MOBILE,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByLabelText("Amount (RM)")).toHaveDisplayValue("");
    expect(view.getPathname()).toBe("/transfer/amount");
  }),
);

it("never reopens review while its transfer is being sent, even from the amount step behind it", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  let answerApproval = () => {};
  mswServer.use(
    http.post(
      "*/transfers/:transferId/approve",
      () =>
        new Promise<Response>((resolve) => {
          answerApproval = () => {
            resolve(HttpResponse.error());
          };
        }),
      { once: true },
    ),
    http.post("*/transfers/:transferId/approve", () => HttpResponse.error()),
  );
  const view = await openReviewOfRm100();
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await screen.findByText(
    "Sending your transfer. The bank's answer comes next.",
  );

  // Review offers no way back while sending, so this stands in for any route that still could.
  await act(() => {
    router.back();
  });
  await fireEvent.press(await screen.findByRole("button", { name: "Review" }));

  expect(view.getPathname()).toBe("/transfer/amount");
  expect(screen.queryByText("This screen stopped working.")).toBeNull();
  answerApproval();
  await screen.findByRole("button", { name: "Done" }, { timeout: 10_000 });
});

it("never moves on from the recipient step while a transfer is still being created", async () => {
  let releaseCreate: () => void = () => undefined;
  const createHeld = new Promise<void>((release) => {
    releaseCreate = () => {
      release();
    };
  });
  mswServer.use(
    http.post("*/transfers", async () => {
      await createHeld;
      return HttpResponse.error();
    }),
  );
  const view = await openReviewOfRm100();
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  // Review offers no way back while sending, so this stands in for any route that still could.
  await act(() => {
    router.back();
    router.back();
  });
  await fireEvent.press(
    await screen.findByRole("button", { name: "Continue" }),
  );

  expect(view.getPathname()).toBe("/transfer");
  // Review is gone, so only the funnel shows the held create failing inside this test rather than in the next one.
  const recordsBeforeRelease = observedRecords.length;
  releaseCreate();
  await waitFor(
    () => {
      expect(
        observedRecords
          .slice(recordsBeforeRelease)
          .filter((record) => record.name === "transfer_step")
          .map((record) => record.properties.step),
      ).toContain("reviewing");
    },
    { timeout: 10_000 },
  );
});

it("takes a lost approval answer to the result page, which never offers to send again", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  mswServer.use(
    http.post("*/transfers/:transferId/approve", () => HttpResponse.error()),
  );
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
  expect(screen.queryByRole("button", { name: "Transfer" })).toBeNull();
  expect(screen.getByRole("button", { name: "Done" })).toBeOnTheScreen();
  expect(observedRecords).toContainEqual(
    expect.objectContaining({
      name: "transfer_outcome",
      properties: { scenario: "transfer.approval_unanswered" },
    }),
  );
});

it("takes an approval lost as the phone goes offline to the result page, which reads the transfer once the phone is back", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  let releaseApproval = () => {};
  const approvalHeld = new Promise<void>((resolve) => {
    releaseApproval = resolve;
  });
  mswServer.use(
    http.post(
      "*/transfers/:transferId/approve",
      async () => {
        await approvalHeld;
        return HttpResponse.error();
      },
      { once: true },
    ),
    http.post("*/transfers/:transferId/approve", () => HttpResponse.error()),
  );
  const view = await openReviewOfRm100();
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await waitFor(() => {
    expect(countSent("POST", "/approve")).toBe(1);
  });

  await act(() => {
    setPhoneNetwork({ isConnected: false, isInternetReachable: false });
  });
  releaseApproval();

  expect(
    await screen.findByText(
      "This transfer is being checked, so don't send it again — not confirmed yet.",
      {},
      { timeout: 10_000 },
    ),
  ).toBeOnTheScreen();
  expect(view.getPathname()).toMatch(/^\/transfer\/result\/[\w-]+$/);
  expect(screen.queryByText(/not sent|no money moved/)).toBeNull();
  const transferPath = `/transfers/${view.getPathname()?.split("/").at(-1)}`;
  const readsOfTheTransfer = () =>
    sentRequests.filter(
      (request) =>
        request.method === "GET" &&
        new URL(request.url).pathname.endsWith(transferPath),
    ).length;
  const readsWhileOffline = readsOfTheTransfer();
  await act(() => {
    setPhoneNetwork({ isConnected: true, isInternetReachable: true });
  });
  await waitFor(() => {
    expect(readsOfTheTransfer()).toBeGreaterThan(readsWhileOffline);
  });
});

it("keeps the transfer on the phone before its approval leaves, so the next launch reopens it after the app is killed as it leaves", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const secureStoreWrites = jest.spyOn(
    secureStoreNativeDouble,
    "setValueWithKeyAsync",
  );
  mswServer.use(
    http.post("*/transfers/:transferId/approve", () => {
      // Killed as the approval leaves: nothing the app would store from here on is kept.
      secureStoreWrites.mockRejectedValue(new Error("The app was killed."));
      return new Promise<never>(() => undefined);
    }),
  );
  const view = await openReviewOfRm100();
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await waitFor(() => {
    expect(countSent("POST", "/approve")).toBe(1);
  });
  const approvedTransferId = sentRequests
    .find(({ url }) => url.endsWith("/approve"))
    ?.url.split("/")
    .at(-2);
  secureStoreWrites.mockRestore();

  const relaunched = await relaunchApp(view);

  expect(
    await screen.findByRole("header", { name: "Checking your last transfer" }),
  ).toBeOnTheScreen();
  expect(relaunched.getPathname()).toBe(
    `/transfer/result/${approvedTransferId}`,
  );
});

it("says the approval was not sent when the phone cannot keep a record of it", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  await openReviewOfRm100();
  jest
    .spyOn(secureStoreNativeDouble, "setValueWithKeyAsync")
    .mockRejectedValue(new Error("the keychain is unavailable"));

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  expect(
    await screen.findByText(
      "Something unexpected stopped the approval — no money moved.",
    ),
  ).toBeOnTheScreen();
  const sentPaths = sentRequests.map(
    ({ method, url }) => `${method} ${new URL(url).pathname}`,
  );
  expect(sentPaths).toContain("POST /transfers");
  expect(sentPaths.filter((path) => path.endsWith("/approve"))).toEqual([]);
});

it("says face or fingerprint approval is unavailable while it is turned off, and sends no approval", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  approvalSettingsStore.setState({ biometricApprovalOn: false });
  await openReviewOfRm100();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  expect(
    await screen.findByText(
      "Face or fingerprint approval isn't available, so approve with your PIN.",
    ),
  ).toBeOnTheScreen();
  expect(biometricPromptsShown()).toEqual([]);
  const sentPaths = sentRequests.map(
    ({ method, url }) => `${method} ${new URL(url).pathname}`,
  );
  expect(sentPaths).toContain("POST /transfers");
  expect(sentPaths.filter((path) => path.endsWith("/approve"))).toEqual([]);
});

it("ignores Android's Back while the transfer is being sent", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  let answerApproval = () => {};
  mswServer.use(
    http.post(
      "*/transfers/:transferId/approve",
      () =>
        new Promise<Response>((resolve) => {
          answerApproval = () => {
            resolve(HttpResponse.error());
          };
        }),
      { once: true },
    ),
    http.post("*/transfers/:transferId/approve", () => HttpResponse.error()),
  );
  const view = await openReviewOfRm100();
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await screen.findByText(
    "Sending your transfer. The bank's answer comes next.",
  );

  await pressHardwareBack();
  const pathnameWhileSending = view.getPathname();
  answerApproval();

  expect(pathnameWhileSending).toBe("/transfer/review");
  expect(
    await screen.findByRole("button", { name: "Done" }, { timeout: 10_000 }),
  ).toBeOnTheScreen();
});

it("offers no PIN instead while the last request found no network, and offers it again once one is answered", async () => {
  await openReviewOfRm100();
  expect(
    await screen.findByRole("button", { name: "Use PIN instead" }),
  ).toBeOnTheScreen();

  await act(() => {
    reportRequestOutcome("GET /accounts/primary", TransportErrorKind.Network);
  });

  expect(screen.getByRole("button", { name: "Transfer" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Use PIN instead" })).toBeNull();
  await act(() => {
    reportRequestOutcome("GET /accounts/primary");
  });
  expect(
    screen.getByRole("button", { name: "Use PIN instead" }),
  ).toBeOnTheScreen();
});

it("offers to try again or leave when the bank's answer to the transfer cannot be read", async () => {
  mswServer.use(
    http.post("*/transfers", () => HttpResponse.json({}, { status: 201 }), {
      once: true,
    }),
  );
  const view = await openReviewOfRm100();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  expect(
    await screen.findByText(
      "Something unexpected stopped the transfer — no money moved.",
    ),
  ).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Transfer" })).toBeOnTheScreen();
  await pressHardwareBack();
  expect(view.getPathname()).toBe("/transfer/amount");
});

it("offers to try again or leave when the phone cannot read its approval key", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const balanceBeforeMinor = await readBankBalanceMinor();
  await openReviewOfRm100();
  jest
    .spyOn(secureStoreNativeDouble, "getValueWithKeyAsync")
    .mockRejectedValueOnce(new Error("Test."));

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  expect(
    await screen.findByText(
      "Something unexpected stopped the approval — no money moved.",
    ),
  ).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Transfer" })).toBeOnTheScreen();
  expect(await readBankOnRealTimers(readBankBalanceMinor)).toBe(
    balanceBeforeMinor,
  );
});

it("closes the PIN sheet and offers to try again or leave when the phone cannot read its approval key after the PIN", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  await openReviewOfRm100();
  await fireEvent.press(
    await screen.findByRole("button", { name: "Use PIN instead" }),
  );
  for (const digit of "246810")
    await fireEvent.press(await screen.findByRole("button", { name: digit }));
  const readSecureValue = secureStoreNativeDouble.getValueWithKeyAsync;
  jest
    .spyOn(secureStoreNativeDouble, "getValueWithKeyAsync")
    .mockImplementation((key: string) =>
      key.includes("possession-key-id")
        ? Promise.reject(new Error("Test."))
        : readSecureValue(key),
    );

  await fireEvent.press(screen.getByRole("button", { name: "Approve" }));

  expect(
    await screen.findByText(
      "Something unexpected stopped the approval — no money moved.",
    ),
  ).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  expect(screen.getByRole("button", { name: "Transfer" })).toBeOnTheScreen();
  expect(countSent("POST", "/approve")).toBe(0);
});

it("offers to try again or leave when something unexpected fails before the transfer is sent", async () => {
  await openReviewOfRm100();
  jest
    .spyOn(
      jest.requireMock<{ randomUUID: () => string }>("expo-crypto"),
      "randomUUID",
    )
    .mockImplementationOnce(() => {
      throw new Error("Test.");
    });

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  expect(
    await screen.findByText(
      "Something unexpected stopped the transfer — no money moved.",
    ),
  ).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Transfer" })).toBeOnTheScreen();
  expect(countSent("POST", "/transfers")).toBe(0);
});

it("never says no money moved when something unexpected fails after the bank answers the approval", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const balanceBeforeMinor = await readBankBalanceMinor();
  const view = await openReviewOfRm100();
  // Nothing the bank answers can fail past the approval, so a navigation fault stands in.
  jest.spyOn(router, "dismissTo").mockImplementationOnce(() => {
    throw new Error("Test.");
  });

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  expect(view.getPathname()).toMatch(/^\/transfer\/result\/[\w-]+$/);
  expect(screen.queryByText(/no money moved/)).toBeNull();
  expect(screen.queryByRole("button", { name: "Transfer" })).toBeNull();
  expect(await readBankOnRealTimers(readBankBalanceMinor)).toBe(
    balanceBeforeMinor - 10_000,
  );
});

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

it("never offers to send again when the bank answers none of three tries at the approval, each given 30 seconds", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  let releaseApprovals: () => void = () => undefined;
  const approvalsHeld = new Promise<void>((release) => {
    releaseApprovals = () => {
      release();
    };
  });
  // The status read is held too: past the bank's approval window it would truthfully answer "expired".
  mswServer.use(
    http.post("*/transfers/:transferId/approve", async () => {
      await approvalsHeld;
      return HttpResponse.error();
    }),
    http.get("*/transfers/:transferId", async () => {
      await approvalsHeld;
      return HttpResponse.error();
    }),
  );
  const view = await openReviewOfRm100();
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await screen.findByText(
    "Sending your transfer. The bank's answer comes next.",
  );

  await act(() => jest.advanceTimersByTimeAsync(95_000));
  // ⛔ Never a findBy here: it moves the fake clock while it waits, past the moment under test.
  expect(
    screen.queryByText(
      "This transfer is being checked, so don't send it again — not confirmed yet.",
    ),
  ).toBeNull();
  await act(() => jest.advanceTimersByTimeAsync(1_500));

  expect(
    await screen.findByText(
      "This transfer is being checked, so don't send it again — not confirmed yet.",
    ),
  ).toBeOnTheScreen();
  expect(view.getPathname()).toMatch(/^\/transfer\/result\/[\w-]+$/);
  expect(screen.queryByRole("button", { name: "Transfer" })).toBeNull();
  expect(countSent("POST", "/approve")).toBe(3);
  releaseApprovals();
});

it("never says the transfer was not sent when the session ends as the bank answers the approval", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  mswServer.use(
    http.post("*/transfers/:transferId/approve", () =>
      HttpResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Test." } },
        { status: 401 },
      ),
    ),
  );
  await openReviewOfRm100();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  expect(await screen.findByText("Your session has ended")).toBeOnTheScreen();
  // The ended session hides the app from screen readers, the result's notice included.
  expect(
    screen.getByText(
      "This transfer is being checked, so don't send it again — not confirmed yet.",
      { includeHiddenElements: true },
    ),
  ).toBeOnTheScreen();
  expect(
    screen.queryByText("The transfer was not sent — no money moved.", {
      includeHiddenElements: true,
    }),
  ).toBeNull();
});

it(
  "checks a lost answer on the result page, and never says no money moved, even after signing in again while the name check is down",
  scenarioTest("transfer.approval_unanswered", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const balanceBeforeMinor = await readBankBalanceMinor();
    const releaseTransferRead = holdTheNextTransferRead();
    const view = await openReviewOfRm100("/");
    const transferButton = await screen.findByRole("button", {
      name: "Transfer",
    });
    // Ends the session at the lost answer's balance re-read, the next account request.
    mswServer.use(
      http.get(
        "*/accounts/primary",
        () =>
          HttpResponse.json(
            { error: { code: "SESSION_ENDED", message: "Test." } },
            { status: 401 },
          ),
        { once: true },
      ),
    );
    await fireEvent.press(transferButton);
    const signInButton = await screen.findByRole(
      "button",
      { name: "Sign in again" },
      { timeout: 10_000 },
    );
    expect(
      await screen.findByRole("header", {
        name: "Checking your transfer",
        includeHiddenElements: true,
      }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        "This transfer is being checked, so don't send it again — not confirmed yet.",
        { includeHiddenElements: true },
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        `If you contact us, quote this reference: ${view.getPathname()?.replace("/transfer/result/", "")}`,
        { includeHiddenElements: true },
      ),
    ).toBeOnTheScreen();
    releaseTransferRead();
    mswServer.use(
      http.post("*/recipients/lookup", () =>
        HttpResponse.json(
          { error: { code: "NAME_ENQUIRY_UNAVAILABLE", message: "Test." } },
          { status: 503 },
        ),
      ),
    );

    await fireEvent.press(signInButton);
    // Were sign-in to ask the name check, it would fail only once its retries are spent; asserting sooner passes either way.
    await act(() => jest.advanceTimersByTimeAsync(15_000));

    expect(screen.getByText("Transfer sent")).toBeOnTheScreen();
    expect(view.getPathname()).toMatch(/^\/transfer\/result\/[\w-]+$/);
    expect(screen.queryByText(/no money moved/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.getByRole("button", { name: "Done" })).toBeOnTheScreen();
    expect(await readBankOnRealTimers(readBankBalanceMinor)).toBe(
      balanceBeforeMinor - 10_000,
    );
  }),
);

it("keeps the recipient review showed after signing in again, so the transfer carries the same reference", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  mswServer.use(
    http.post(
      "*/transfers",
      () =>
        HttpResponse.json(
          { error: { code: "SESSION_ENDED", message: "Test." } },
          { status: 401 },
        ),
      { once: true },
    ),
  );
  await openReviewOfRm100();
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  await fireEvent.press(
    await screen.findByRole("button", { name: "Sign in again" }),
  );
  // Were sign-in to ask the name check, this lets its new reference land; pressing sooner sends the first one either way.
  await act(() => jest.advanceTimersByTimeAsync(1_000));
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await screen.findByText("Transfer sent");

  const recipientRefs = await Promise.all(
    sentRequests
      .filter(
        (request) =>
          request.method === "POST" &&
          new URL(request.url).pathname.endsWith("/transfers"),
      )
      .map(
        async (request) =>
          ((await request.clone().json()) as { recipientRef: string })
            .recipientRef,
      ),
  );
  expect(recipientRefs).toHaveLength(2);
  expect(recipientRefs[1]).toBe(recipientRefs[0]);
});

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

it("sends a transfer to a passport recipient through review and its approval, and debits once", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const balanceBeforeMinor = await readBankBalanceMinor();
  await renderRoute("/transfer");
  await fireEvent.press(await screen.findByRole("radio", { name: "Passport" }));
  await fireEvent.changeText(
    screen.getByLabelText("Passport number"),
    "a1234567",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("RM 12,845.50");
  await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  expect(await screen.findByText("•••• 4567")).toBeOnTheScreen();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  expect(await readBankOnRealTimers(readBankBalanceMinor)).toBe(
    balanceBeforeMinor - 10_000,
  );
});

it(
  "warns on a review reached from a recent recipient that the last transfer is still being checked",
  scenarioTest("transfer.earlier_transfer_unconfirmed", async () => {
    const {
      body: { customerId },
    } = await sendToBank<GetPrimaryAccountResponse>("GET", "/accounts/primary");
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
            reference: "20261007C0FFEE00",
            status: TransferStatus.Processing,
            funds: TransferFunds.Debited,
          },
        }),
      ),
    );
    const {
      body: {
        items: [firstRecent],
      },
    } = await sendToBank<ListRecentRecipientsResponse>(
      "GET",
      "/recipients/recent",
    );
    await renderRoute("/");
    await waitForHomeToOfferTransfer();
    const [firstRecentButton] = await screen.findAllByRole("button", {
      name: /••••/,
    });
    await fireEvent.press(firstRecentButton!);
    await screen.findByText(firstRecent!.registeredName);
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("RM 12,845.50");
    await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
    await fireEvent.press(screen.getByRole("button", { name: "Review" }));

    expect(
      await screen.findByText(
        "Your last transfer is still being checked, so don't send it again — not confirmed yet. If you contact us, quote this reference: 20261007C0FFEE00",
      ),
    ).toBeOnTheScreen();
    expect(
      await screen.findByText(firstRecent!.idValueMasked),
    ).toBeOnTheScreen();
    expect(
      await screen.findByRole("button", { name: "Transfer" }),
    ).toBeEnabled();
  }),
);

it(
  "goes Home from the receipt on Back, and the next transfer starts blank",
  scenarioTest("transfer.completed", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const view = await openReviewOfRm100("/");
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
    await screen.findByText("Transfer sent");

    await pressHardwareBack();
    expect(view.getPathname()).toBe("/");
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(
      await screen.findByLabelText("DuitNow mobile number"),
    ).toHaveDisplayValue("");
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

it("pauses sending on review while the phone reports no connection", async () => {
  await openReviewOfRm100();
  const transferButton = await screen.findByRole("button", {
    name: "Transfer",
  });

  await act(() => {
    setPhoneNetwork({ isConnected: false, isInternetReachable: false });
  });
  expect(transferButton).toBeDisabled();
  expect(
    screen.getByText("You're offline, so sending is paused."),
  ).toBeOnTheScreen();

  await act(() => {
    setPhoneNetwork({ isConnected: true, isInternetReachable: true });
  });
  expect(transferButton).toBeEnabled();
});

it(
  "says no DuitNow account was found for the ID, and leads back to the recipient step",
  scenarioTest("transfer.recipient_not_found", async () => {
    const view = await openReviewOfRm100();

    expect(
      await screen.findByText("No DuitNow account was found for this ID."),
    ).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Transfer" })).toBeNull();
    expect(reportedScenarios()).toContain("transfer.recipient_not_found");
    await fireEvent.press(
      screen.getByRole("button", { name: "Change the recipient" }),
    );

    expect(view.getPathname()).toBe("/transfer");
  }),
);

it(
  "says recipient names can't be confirmed right now, and never lets the transfer go ahead without one",
  scenarioTest("transfer.name_check_unavailable", async () => {
    await openReviewOfRm100();

    expect(
      await screen.findByText("Recipient names can't be confirmed right now."),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Try again" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Transfer" })).toBeNull();
    expect(reportedScenarios()).toContain("transfer.name_check_unavailable");
  }),
);

it(
  "asks to try again in a minute after too many name checks, and offers Try again only once that minute has passed",
  scenarioTest("transfer.too_many_name_checks", async () => {
    await openReviewOfRm100();

    expect(
      await screen.findByText(
        "Too many name checks in a short time. Try again in a minute.",
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Transfer" })).toBeNull();
    expect(reportedScenarios()).toContain("transfer.too_many_name_checks");
    await act(() => jest.advanceTimersByTimeAsync(59_000));
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    await act(() => jest.advanceTimersByTimeAsync(1_000));
    const nameChecksBeforeTryingAgain = countSent("POST", "/recipients/lookup");
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => {
      expect(countSent("POST", "/recipients/lookup")).toBe(
        nameChecksBeforeTryingAgain + 1,
      );
    });
  }),
);

it(
  "says the too-many-checks words once review has finished opening and the screen reader has placed its focus, and not again as Try again appears after the minute",
  scenarioTest("transfer.too_many_name_checks", async () => {
    const tooManyChecks =
      "Too many name checks in a short time. Try again in a minute.";
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    announce.mockClear();
    const timesSaid = () =>
      announce.mock.calls.filter(([words]) => words === tooManyChecks).length;
    await openReviewOfRm100();
    const refusal = await screen.findByText(tooManyChecks);
    const saidWhileReviewOpens = timesSaid();
    await finishOpeningScreen(refusal);
    await act(() => jest.advanceTimersByTimeAsync(500));
    const saidWhileTheFocusLands = timesSaid();
    await act(() => jest.advanceTimersByTimeAsync(500));
    const saidOnceTheFocusHasLanded = timesSaid();

    await act(() => jest.advanceTimersByTimeAsync(60_000));

    expect(saidWhileReviewOpens).toBe(0);
    expect(saidWhileTheFocusLands).toBe(0);
    expect(saidOnceTheFocusHasLanded).toBe(1);
    expect(screen.getByRole("button", { name: "Try again" })).toBeOnTheScreen();
    expect(timesSaid()).toBe(1);
  }),
);

it(
  "says the too-many-checks words once more when Try again after the minute is refused too",
  scenarioTest("transfer.too_many_name_checks", async () => {
    const tooManyChecks =
      "Too many name checks in a short time. Try again in a minute.";
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    await openReviewOfRm100();
    await finishOpeningScreen(await screen.findByText(tooManyChecks));
    await act(() => jest.advanceTimersByTimeAsync(60_000));
    const announcementsBeforeTryAgain = announce.mock.calls.length;

    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await act(() => jest.advanceTimersByTimeAsync(5_000));

    expect(screen.getByText(tooManyChecks)).toBeOnTheScreen();
    expect(
      announce.mock.calls
        .slice(announcementsBeforeTryAgain)
        .filter(([message]) => message === tooManyChecks),
    ).toHaveLength(1);
  }),
);

// Sign-in spares an answered name check, so this stands in for any later path that asks it again.
function askOpenReviewsNameCheckAgain() {
  return act(() => {
    askOpenAppToReadAgain(
      getLookupRecipientOptions({
        idType: RecipientIdType.Mobile,
        idValue: "+60123456789",
      }).queryKey,
    );
  });
}

it.each([
  [
    "NAME_ENQUIRY_UNAVAILABLE",
    503,
    "Recipient names can't be confirmed right now.",
  ],
  ["RECIPIENT_NOT_FOUND", 404, "No DuitNow account was found for this ID."],
])(
  "stops offering Transfer once review's name check, asked again, answers %s",
  async (code, status, message) => {
    const { recipient } = await lookUpTestRecipient(RECIPIENT_MOBILE);
    await openReviewOfRm100();
    await screen.findByText(recipient.registeredName);
    mswServer.use(
      http.post("*/recipients/lookup", () =>
        HttpResponse.json({ error: { code, message: "Test." } }, { status }),
      ),
    );

    await askOpenReviewsNameCheckAgain();

    expect(await screen.findByText(message)).toBeOnTheScreen();
    expect(screen.queryByText(recipient.registeredName)).toBeNull();
    expect(screen.queryByRole("button", { name: "Transfer" })).toBeNull();
  },
);

it("asks review's name check again once they sign back in, when the ended session cut off their Try again", async () => {
  const { recipient } = await lookUpTestRecipient(RECIPIENT_MOBILE);
  await openReviewOfRm100();
  await screen.findByText(recipient.registeredName);
  mswServer.use(
    http.post(
      "*/recipients/lookup",
      () =>
        HttpResponse.json(
          { error: { code: "NEW_BANK_CODE", message: "Test." } },
          { status: 400 },
        ),
      { once: true },
    ),
  );
  await askOpenReviewsNameCheckAgain();
  const tryAgain = await screen.findByRole("button", { name: "Try again" });
  mswServer.use(
    http.post(
      "*/recipients/lookup",
      () =>
        HttpResponse.json(
          { error: { code: "SESSION_ENDED", message: "Test." } },
          { status: 401 },
        ),
      { once: true },
    ),
  );
  await fireEvent.press(tryAgain);
  const signInAgain = await screen.findByRole("button", {
    name: "Sign in again",
  });
  const nameChecksBeforeSignIn = countSent("POST", "/recipients/lookup");

  await fireEvent.press(signInAgain);

  // ⛔ Wait for the check first: review still shows its last Transfer for a moment after sign-in, so a find passes either way.
  await waitFor(() => {
    expect(countSent("POST", "/recipients/lookup")).toBe(
      nameChecksBeforeSignIn + 1,
    );
  });
  expect(
    await screen.findByRole("button", { name: "Transfer", disabled: false }),
  ).toBeOnTheScreen();
  expect(screen.getByText(recipient.registeredName)).toBeOnTheScreen();
});

it("offers no PIN instead while review's name check, asked again, is running, and offers it again once it answers", async () => {
  await openReviewOfRm100();
  expect(
    await screen.findByRole("button", { name: "Use PIN instead" }),
  ).toBeOnTheScreen();
  let releaseNameCheck: () => void = () => undefined;
  const nameCheckHeld = new Promise<void>((release) => {
    releaseNameCheck = () => {
      release();
    };
  });
  mswServer.use(
    http.post(
      "*/recipients/lookup",
      async () => {
        await nameCheckHeld;
        return undefined;
      },
      { once: true },
    ),
  );

  await askOpenReviewsNameCheckAgain();

  await waitFor(() => {
    expect(
      screen.queryByRole("button", { name: "Use PIN instead" }),
    ).toBeNull();
  });
  releaseNameCheck();
  expect(
    await screen.findByRole("button", { name: "Use PIN instead" }),
  ).toBeOnTheScreen();
});

it("shows no name-check notice while sending, though review's name check, asked again, fails", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
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
        return undefined;
      },
      { once: true },
    ),
  );
  await openReviewOfRm100();
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await screen.findByText(
    "Sending your transfer. The bank's answer comes next.",
  );
  mswServer.use(
    http.post("*/recipients/lookup", () =>
      HttpResponse.json(
        { error: { code: "NAME_ENQUIRY_UNAVAILABLE", message: "Test." } },
        { status: 503 },
      ),
    ),
  );

  await askOpenReviewsNameCheckAgain();
  await act(() => jest.advanceTimersByTimeAsync(1_000));

  expect(
    screen.queryByText("Recipient names can't be confirmed right now."),
  ).toBeNull();
  releaseApproval();
  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
});

it("says something unexpected stopped the transfer when the name check answers in a way the app does not know", async () => {
  mswServer.use(
    http.post("*/recipients/lookup", () =>
      HttpResponse.json(
        { error: { code: "NEW_BANK_CODE", message: "Unknown to this app." } },
        { status: 400 },
      ),
    ),
  );
  await openReviewOfRm100();

  expect(
    await screen.findByText(
      "Something unexpected stopped the transfer — no money moved.",
    ),
  ).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Transfer" })).toBeNull();
});

function countSent(method: string, pathEnd: string) {
  return sentRequests.filter(
    (request) =>
      request.method === method &&
      new URL(request.url).pathname.endsWith(pathEnd),
  ).length;
}

it(
  "says on review that the balance no longer covers the amount, reads it and the limits again, and leads back to the amount instead of offering Transfer",
  scenarioTest("transfer.balance_or_limit_short_at_confirmation", async () => {
    const view = await openReviewOfRm100();
    const transferButton = await screen.findByRole("button", {
      name: "Transfer",
    });
    const balanceReadsBefore = countSent("GET", "/accounts/primary");

    await fireEvent.press(transferButton);

    expect(
      await screen.findByText(
        "Your balance no longer covers this amount. Go back to change it.",
      ),
    ).toBeOnTheScreen();
    expect(view.getPathname()).toBe("/transfer/review");
    await waitFor(() => {
      expect(countSent("GET", "/accounts/primary")).toBeGreaterThan(
        balanceReadsBefore,
      );
    });
    expect(countSent("POST", "/approve")).toBe(0);
    expect(screen.queryByRole("button", { name: "Transfer" })).toBeNull();
    await fireEvent.press(
      screen.getByRole("button", { name: "Change amount" }),
    );
    expect(view.getPathname()).toBe("/transfer/amount");
  }),
);

it.each(["DAILY_LIMIT_EXCEEDED", "ABOVE_PER_TRANSFER_MAX"])(
  "says the amount is over a limit when the bank answers Confirm with %s",
  async (code) => {
    mswServer.use(
      http.post("*/transfers", () =>
        HttpResponse.json(
          { error: { code, message: "Test." } },
          { status: 422 },
        ),
      ),
    );
    await openReviewOfRm100();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(
      await screen.findByText(
        "This amount is now over one of your transfer limits. Go back to change it.",
      ),
    ).toBeOnTheScreen();
  },
);

it(
  "asks to confirm the recipient again once the name check has expired, and checks the name afresh",
  scenarioTest("transfer.name_check_expired", async () => {
    await openReviewOfRm100();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(
      await screen.findByText(
        "The recipient check has expired. Confirm the recipient again.",
      ),
    ).toBeOnTheScreen();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Transfer" })).toBeEnabled();
    });
    expect(countSent("POST", "/recipients/lookup")).toBe(2);
  }),
);

it(
  "goes on to review when maintenance begins after today's limit loaded, and says there until when transfers are unavailable",
  scenarioTest("transfer.under_maintenance", async () => {
    const { body } = await askBankToCreateRm100();
    // Home's read lands before the maintenance begins; every read after meets it.
    mswServer.use(
      http.get(
        "*/transfer-limits",
        () =>
          HttpResponse.json({
            daily: {
              limit: { minor: 500_000, currency: "MYR" },
              usedToday: { minor: 0, currency: "MYR" },
              remaining: { minor: 500_000, currency: "MYR" },
            },
            perTransferMax: { minor: 5_000_000, currency: "MYR" },
          } satisfies GetTransferLimitsResponse),
        { once: true },
      ),
    );
    await renderRoute("/");
    await waitForHomeToOfferTransfer();
    await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
    await fireEvent.changeText(
      await screen.findByLabelText("DuitNow mobile number"),
      RECIPIENT_MOBILE,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    await fireEvent.changeText(
      await screen.findByLabelText("Amount (RM)"),
      "100",
    );
    // Lets the amount step's own read meet the maintenance: before it does, Review is enabled either way.
    await act(() => jest.advanceTimersByTimeAsync(1_000));
    expect(screen.getByRole("button", { name: "Review" })).toBeEnabled();
    await fireEvent.press(screen.getByRole("button", { name: "Review" }));

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(
      await screen.findByText(
        `Transfers are unavailable right now, until ${formatMalaysianDateTime(body.error.until ?? "", t)}.`,
      ),
    ).toBeOnTheScreen();
    expect(countSent("POST", "/approve")).toBe(0);
  }),
);

it.each([
  ["a time the app cannot read", { until: "soon" }],
  ["no time", {}],
])(
  "says transfers are unavailable without a time when the bank answers Confirm with maintenance and %s",
  async (_, untilField) => {
    mswServer.use(
      http.post("*/transfers", () =>
        HttpResponse.json(
          {
            error: {
              code: "SERVICE_UNAVAILABLE",
              message: "Test.",
              ...untilField,
            },
          },
          { status: 503 },
        ),
      ),
    );
    await openReviewOfRm100();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(
      await screen.findByText(
        "Transfers are unavailable right now. Try again later.",
      ),
    ).toBeOnTheScreen();
    expect(countSent("POST", "/approve")).toBe(0);
  },
);

it("reads today's limit again when the bank answers Confirm with maintenance, since Home reads maintenance off it", async () => {
  mswServer.use(
    http.post("*/transfers", () =>
      HttpResponse.json(
        { error: { code: "SERVICE_UNAVAILABLE", message: "Test." } },
        { status: 503 },
      ),
    ),
  );
  await openReviewOfRm100();
  const transferButton = await screen.findByRole("button", {
    name: "Transfer",
  });
  const limitReadsBefore = countSent("GET", "/transfer-limits");

  await fireEvent.press(transferButton);

  await screen.findByText(
    "Transfers are unavailable right now. Try again later.",
  );
  await waitFor(() => {
    expect(countSent("GET", "/transfer-limits")).toBeGreaterThan(
      limitReadsBefore,
    );
  });
});

it(
  "says something unexpected stopped the transfer when the bank answers Confirm in a way the app does not know",
  scenarioTest("transfer.review_unexpected", async () => {
    await openReviewOfRm100();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(
      await screen.findByText(
        "Something unexpected stopped the transfer — no money moved.",
      ),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Transfer" })).toBeEnabled();
  }),
);

async function askBankToCreateRm100() {
  const { recipientRef } = await lookUpTestRecipient(RECIPIENT_MOBILE);
  return sendToBank<BankErrorBody>("POST", "/transfers", {
    body: { recipientRef, amount: { minor: 10_000, currency: "MYR" } },
  });
}

it(
  "says from when money can be sent while a newly paired phone waits, announces it, and holds the transfer",
  scenarioTest("transfer.cooling_off_new_phone", async () => {
    const { body } = await askBankToCreateRm100();
    const holdReason = `You can send money from ${formatMalaysianDateTime(body.error.until ?? "", t)} — a security wait after pairing this phone.`;
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    await openReviewOfRm100();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(await screen.findByText(holdReason)).toBeOnTheScreen();
    expect(announce).toHaveBeenCalledWith(holdReason);
    expect(screen.getByRole("button", { name: "Transfer" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Use PIN instead" }),
    ).toBeNull();
    expect(countSent("POST", "/approve")).toBe(0);
    expect(reportedScenarios()).toContain("transfer.cooling_off_new_phone");
  }),
);

it(
  "says from when money can be sent in a new account's first hour, announces it, and holds the transfer with no PIN way around it",
  scenarioTest("transfer.cooling_off_new_account", async () => {
    const { body } = await askBankToCreateRm100();
    const holdReason = `You can send money from ${formatMalaysianDateTime(body.error.until ?? "", t)} — a security wait after opening your account.`;
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    await openReviewOfRm100();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(await screen.findByText(holdReason)).toBeOnTheScreen();
    expect(announce).toHaveBeenCalledWith(holdReason);
    expect(screen.getByRole("button", { name: "Transfer" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Use PIN instead" }),
    ).toBeNull();
    expect(countSent("POST", "/approve")).toBe(0);
    expect(reportedScenarios()).toContain("transfer.cooling_off_new_account");
  }),
);

it.each([
  [
    "DEVICE_PAIRED",
    "a time the app cannot read",
    () => "soon",
    "You can send money later — a security wait after pairing this phone.",
  ],
  [
    "NEW_ACCOUNT",
    "a time the app cannot read",
    () => "soon",
    "You can send money later — a security wait after opening your account.",
  ],
  [
    "DEVICE_PAIRED",
    "a time already passed",
    () => new Date(Date.now() - 60_000).toISOString(),
    "You can send money later — a security wait after pairing this phone.",
  ],
])(
  "holds the transfer without a time, and keeps holding it, when the bank's cooling-off for %s comes with %s",
  async (reason, _, untilTheBankSends, holdReason) => {
    mswServer.use(
      http.post("*/transfers", () =>
        HttpResponse.json(
          {
            error: {
              code: "COOLING_OFF",
              message: "Test.",
              until: untilTheBankSends(),
              reason,
            },
          },
          { status: 403 },
        ),
      ),
    );
    await openReviewOfRm100();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
    expect(await screen.findByText(holdReason)).toBeOnTheScreen();
    await act(() => jest.advanceTimersByTimeAsync(10 * 60_000));

    expect(screen.getByText(holdReason)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Transfer" })).toBeDisabled();
  },
);

it(
  "lifts the hold once the security wait ends, and offers Transfer again",
  scenarioTest("transfer.cooling_off_new_account", async () => {
    const { body } = await askBankToCreateRm100();
    const holdReason = `You can send money from ${formatMalaysianDateTime(body.error.until ?? "", t)} — a security wait after opening your account.`;
    await openReviewOfRm100();
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
    await screen.findByText(holdReason);
    const msUntilTheWaitEnds = Date.parse(body.error.until ?? "") - Date.now();

    await act(() => jest.advanceTimersByTimeAsync(msUntilTheWaitEnds - 1_000));
    expect(screen.getByRole("button", { name: "Transfer" })).toBeDisabled();
    await act(() => jest.advanceTimersByTimeAsync(2_000));

    expect(screen.queryByText(holdReason)).toBeNull();
    expect(screen.getByRole("button", { name: "Transfer" })).toBeEnabled();
  }),
);

it("words a cooling-off whose reason the app does not know as a newly paired phone's", async () => {
  const until = new Date(Date.now() + 60 * 60_000).toISOString();
  mswServer.use(
    http.post("*/transfers", () =>
      HttpResponse.json(
        {
          error: {
            code: "COOLING_OFF",
            message: "Test.",
            until,
            reason: "NEW_REASON",
          },
        },
        { status: 403 },
      ),
    ),
  );
  await openReviewOfRm100();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  expect(
    await screen.findByText(
      `You can send money from ${formatMalaysianDateTime(until, t)} — a security wait after pairing this phone.`,
    ),
  ).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Transfer" })).toBeDisabled();
});

it(
  "says the account is locked and to contact Ryt, announces it, offers no way around it, and lets Back leave",
  scenarioTest("transfer.account_locked", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    const view = await openReviewOfRm100();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(
      await screen.findByText(
        "Your account is locked. Contact Ryt to unlock it.",
      ),
    ).toBeOnTheScreen();
    expect(announce).toHaveBeenCalledWith(
      "Your account is locked. Contact Ryt to unlock it.",
    );
    expect(screen.getByRole("button", { name: "Transfer" })).toBeDisabled();
    expect(countSent("POST", "/approve")).toBe(0);
    expect(reportedScenarios()).toContain("transfer.account_locked");

    await pressHardwareBack();

    expect(view.getPathname()).toBe("/transfer/amount");
  }),
);

it("treats a key the bank says was used for other details as something unexpected", async () => {
  mswServer.use(
    http.post("*/transfers", () =>
      HttpResponse.json(
        { error: { code: "IDEMPOTENCY_KEY_REUSED", message: "Test." } },
        { status: 409 },
      ),
    ),
  );
  await openReviewOfRm100();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  expect(
    await screen.findByText(
      "Something unexpected stopped the transfer — no money moved.",
    ),
  ).toBeOnTheScreen();
  expect(countSent("POST", "/transfers")).toBe(1);
});

function idempotencyKeysOfCreatesSent() {
  return sentRequests
    .filter(
      (request) =>
        request.method === "POST" &&
        new URL(request.url).pathname.endsWith("/transfers"),
    )
    .map((request) => request.headers.get("Idempotency-Key"));
}

it(
  "repeats an unanswered confirmation under its key, says Ryt could not be reached, and repeats it again when tried",
  scenarioTest("transfer.confirmation_unanswered", async () => {
    await openReviewOfRm100();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(
      await screen.findByText(
        "Ryt could not be reached — no money moved.",
        {},
        { timeout: 10_000 },
      ),
    ).toBeOnTheScreen();
    const [unansweredKey] = idempotencyKeysOfCreatesSent();
    expect(unansweredKey).toEqual(expect.any(String));
    expect(idempotencyKeysOfCreatesSent()).toEqual(
      Array(3).fill(unansweredKey),
    );
    // The lost answers left the app offline until the amount step's balance poll gets through.
    await waitFor(
      () => {
        expect(screen.getByRole("button", { name: "Transfer" })).toBeEnabled();
      },
      { timeout: 15_000 },
    );
    await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));

    expect(
      await screen.findByText(
        "Ryt could not be reached — no money moved.",
        {},
        { timeout: 10_000 },
      ),
    ).toBeOnTheScreen();
    expect(idempotencyKeysOfCreatesSent()).toEqual(
      Array(6).fill(unansweredKey),
    );
  }),
);

it("goes on with the transfer the bank made once a repeat gets the answer that was lost, and debits once", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const balanceBeforeMinor = await readBankBalanceMinor();
  mswServer.use(
    http.post(
      "*/transfers",
      async ({ request }) => {
        await sendToBank("POST", "/transfers", {
          body: await request.json(),
          idempotencyKey: request.headers.get("Idempotency-Key"),
        });
        return HttpResponse.error();
      },
      { once: true },
    ),
  );
  await openReviewOfRm100();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  expect(
    await screen.findByText("Transfer sent", {}, { timeout: 10_000 }),
  ).toBeOnTheScreen();
  expect(new Set(idempotencyKeysOfCreatesSent()).size).toBe(1);
  jest.useRealTimers();
  expect(await readBankBalanceMinor()).toBe(balanceBeforeMinor - 10_000);
});

it("treats a server error naming no bank code as no answer, repeating the create under its key until one gets through", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const balanceBeforeMinor = await readBankBalanceMinor();
  mswServer.use(
    ...Array.from({ length: 3 }, () =>
      http.post(
        "*/transfers",
        () => new HttpResponse("<html>Bad gateway</html>", { status: 502 }),
        { once: true },
      ),
    ),
  );
  await openReviewOfRm100();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  expect(
    await screen.findByText(
      "Ryt could not be reached — no money moved.",
      {},
      { timeout: 10_000 },
    ),
  ).toBeOnTheScreen();
  const [unansweredKey] = idempotencyKeysOfCreatesSent();
  expect(idempotencyKeysOfCreatesSent()).toEqual(Array(3).fill(unansweredKey));
  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));

  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  expect(idempotencyKeysOfCreatesSent()).toEqual(Array(4).fill(unansweredKey));
  jest.useRealTimers();
  expect(await readBankBalanceMinor()).toBe(balanceBeforeMinor - 10_000);
});

it("says Ryt could not be reached while the bank is still on the create, and repeats it under its key when tried", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const balanceBeforeMinor = await readBankBalanceMinor();
  mswServer.use(
    http.post(
      "*/transfers",
      () =>
        HttpResponse.json(
          { error: { code: "REQUEST_IN_PROGRESS", message: "Test." } },
          { status: 409 },
        ),
      { once: true },
    ),
  );
  await openReviewOfRm100();
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  expect(
    await screen.findByText("Ryt could not be reached — no money moved."),
  ).toBeOnTheScreen();
  const [inProgressKey] = idempotencyKeysOfCreatesSent();

  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));

  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  expect(idempotencyKeysOfCreatesSent()).toEqual([
    inProgressKey,
    inProgressKey,
  ]);
  jest.useRealTimers();
  expect(await readBankBalanceMinor()).toBe(balanceBeforeMinor - 10_000);
});

it("repeats a create whose answer could not be read under its key, and debits once", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const balanceBeforeMinor = await readBankBalanceMinor();
  mswServer.use(
    http.post(
      "*/transfers",
      async ({ request }) => {
        await sendToBank("POST", "/transfers", {
          body: await request.json(),
          idempotencyKey: request.headers.get("Idempotency-Key"),
        });
        return new HttpResponse("<html>Created</html>", { status: 201 });
      },
      { once: true },
    ),
  );
  await openReviewOfRm100();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  expect(
    await screen.findByText("Transfer sent", {}, { timeout: 10_000 }),
  ).toBeOnTheScreen();
  expect(new Set(idempotencyKeysOfCreatesSent()).size).toBe(1);
  jest.useRealTimers();
  expect(await readBankBalanceMinor()).toBe(balanceBeforeMinor - 10_000);
});

it("sends a fresh create under a new key once review's name check, asked again after Ryt did not answer, gives a new reference", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const balanceBeforeMinor = await readBankBalanceMinor();
  let createsLost = 0;
  let forwarding = false;
  // ⛔ Keep the forward: only a bank that made the first create refuses its key with another reference.
  mswServer.use(
    http.post("*/transfers", async ({ request }) => {
      if (forwarding || createsLost === 3) return undefined;
      createsLost += 1;
      forwarding = true;
      await sendToBank("POST", "/transfers", {
        body: await request.json(),
        idempotencyKey: request.headers.get("Idempotency-Key"),
      });
      forwarding = false;
      return HttpResponse.error();
    }),
  );
  await openReviewOfRm100();
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await screen.findByText(
    "Ryt could not be reached — no money moved.",
    {},
    { timeout: 10_000 },
  );
  const [unansweredKey] = idempotencyKeysOfCreatesSent();
  await askOpenReviewsNameCheckAgain();
  // Until the new answer renders, Transfer still sends the earlier one, rightly under the kept key.
  await act(() => jest.advanceTimersByTimeAsync(1_000));
  expect(countSent("POST", "/recipients/lookup")).toBe(2);
  expect(screen.getByRole("button", { name: "Transfer" })).toBeEnabled();

  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));

  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  const creates = sentRequests.filter(
    (request) =>
      request.method === "POST" &&
      new URL(request.url).pathname.endsWith("/transfers"),
  );
  const [lostCreate] = creates;
  const freshCreate = creates.at(-1);
  const keys = creates.map((request) => request.headers.get("Idempotency-Key"));
  expect(keys.filter((key) => key !== unansweredKey)).toEqual([keys.at(-1)]);
  const lostBody = (await lostCreate?.json()) as { recipientRef: string };
  const freshBody = (await freshCreate?.json()) as { recipientRef: string };
  expect(freshBody.recipientRef).not.toBe(lostBody.recipientRef);
  jest.useRealTimers();
  expect(await readBankBalanceMinor()).toBe(balanceBeforeMinor - 10_000);
});

function loseEveryTryOfTheFirstCreate() {
  // Its Transfer and both repeats.
  mswServer.use(
    ...Array.from({ length: 3 }, () =>
      http.post("*/transfers", () => HttpResponse.error(), { once: true }),
    ),
  );
}

it(
  "confirms changed details as a new transfer after Ryt did not answer",
  scenarioTest("transfer.details_changed_after_no_answer", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const balanceBeforeMinor = await readBankBalanceMinor();
    loseEveryTryOfTheFirstCreate();
    await openReviewOfRm100();
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
    await screen.findByText(
      "Ryt could not be reached — no money moved.",
      {},
      { timeout: 10_000 },
    );
    const [unansweredKey] = idempotencyKeysOfCreatesSent();

    await pressHardwareBack();
    await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "50");
    await fireEvent.press(screen.getByRole("button", { name: "Review" }));

    expect(
      await screen.findByText(
        "Your details changed after Ryt did not answer. Check them, then confirm this as a new transfer.",
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText("RM 50.00")).toBeOnTheScreen();
    await waitFor(
      () => {
        expect(screen.getByRole("button", { name: "Transfer" })).toBeEnabled();
      },
      { timeout: 15_000 },
    );
    await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));

    expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
    expect(idempotencyKeysOfCreatesSent().at(-1)).not.toBe(unansweredKey);
    jest.useRealTimers();
    expect(await readBankBalanceMinor()).toBe(balanceBeforeMinor - 5_000);
  }),
);

it(
  "says the details changed after Ryt did not answer when only the note changed",
  scenarioTest("transfer.details_changed_after_no_answer", async () => {
    loseEveryTryOfTheFirstCreate();
    await openReviewOfRm100();
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
    await screen.findByText(
      "Ryt could not be reached — no money moved.",
      {},
      { timeout: 10_000 },
    );

    await pressHardwareBack();
    await fireEvent.changeText(
      screen.getByLabelText("Note (optional)"),
      "Lunch",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Review" }));

    expect(
      await screen.findByText(
        "Your details changed after Ryt did not answer. Check them, then confirm this as a new transfer.",
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText("Lunch")).toBeOnTheScreen();
    expect(reportedScenarios()).toContain(
      "transfer.details_changed_after_no_answer",
    );
  }),
);

it(
  "says the details changed after Ryt did not answer on review, not before it, when only the recipient changed",
  scenarioTest("transfer.details_changed_after_no_answer", async () => {
    const otherMobile = "019-876 5432";
    const { recipient } = await lookUpTestRecipient(otherMobile);
    loseEveryTryOfTheFirstCreate();
    await openReviewOfRm100();
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
    await screen.findByText(
      "Ryt could not be reached — no money moved.",
      {},
      { timeout: 10_000 },
    );

    await pressHardwareBack();
    await pressHardwareBack();
    await fireEvent.changeText(
      screen.getByLabelText("DuitNow mobile number"),
      otherMobile,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("RM 12,845.50");

    expect(
      screen.queryByText(
        "Your details changed after Ryt did not answer. Check them, then confirm this as a new transfer.",
      ),
    ).toBeNull();
    await pressHardwareBack();
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("RM 12,845.50");
    await fireEvent.press(screen.getByRole("button", { name: "Review" }));
    expect(
      await screen.findByText(
        "Your details changed after Ryt did not answer. Check them, then confirm this as a new transfer.",
      ),
    ).toBeOnTheScreen();
    expect(await screen.findByText(recipient.registeredName)).toBeOnTheScreen();
  }),
);

it("reopens review without saying the details changed when the same recipient is chosen again after Ryt did not answer", async () => {
  loseEveryTryOfTheFirstCreate();
  await openReviewOfRm100();
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await screen.findByText(
    "Ryt could not be reached — no money moved.",
    {},
    { timeout: 10_000 },
  );

  await pressHardwareBack();
  await pressHardwareBack();
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("RM 12,845.50");
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));

  expect(await screen.findByText("RM 100.00")).toBeOnTheScreen();
  expect(
    screen.queryByText(
      "Your details changed after Ryt did not answer. Check them, then confirm this as a new transfer.",
    ),
  ).toBeNull();
});

it("reopens review without saying the details changed when nothing changed after Ryt did not answer", async () => {
  const { recipient } = await lookUpTestRecipient(RECIPIENT_MOBILE);
  loseEveryTryOfTheFirstCreate();
  await openReviewOfRm100();
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await screen.findByText(
    "Ryt could not be reached — no money moved.",
    {},
    { timeout: 10_000 },
  );

  await pressHardwareBack();
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));

  expect(await screen.findByText(recipient.registeredName)).toBeOnTheScreen();
  expect(
    screen.queryByText(
      "Your details changed after Ryt did not answer. Check them, then confirm this as a new transfer.",
    ),
  ).toBeNull();
});

it.each([
  ["made", () => undefined],
  [
    "a refusal",
    () =>
      HttpResponse.json(
        { error: { code: "AMOUNT_INVALID", message: "Test." } },
        { status: 422 },
      ),
  ],
  ["lost, even after its repeats", () => HttpResponse.error()],
])(
  "never lets a transfer left mid-confirmation move or stop the one confirmed since, when its answer is %s",
  async (_, answerLeftTransferWith) => {
    await pairPhoneAsTheDemoLaunchDoes();
    const balanceBeforeMinor = await readBankBalanceMinor();
    let answerLeftTransfer = () => {};
    const leftTransferAnswered = new Promise<void>((resolve) => {
      answerLeftTransfer = resolve;
    });
    let answerNewTransfer = () => {};
    const newTransferAnswered = new Promise<void>((resolve) => {
      answerNewTransfer = resolve;
    });
    // Holds both creates in flight; the newer one then falls through to the bank.
    mswServer.use(
      http.post("*/transfers", async ({ request }) => {
        const { amount } = (await request.clone().json()) as {
          amount: { minor: number };
        };
        if (amount.minor === 10_000) {
          await leftTransferAnswered;
          return answerLeftTransferWith();
        }
        await newTransferAnswered;
        return undefined;
      }),
    );
    await openReviewOfRm100();
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    // Review offers no way out while confirming, so this stands in for any route that still could.
    await act(() => {
      router.dismissTo("/");
    });
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
    await fireEvent.changeText(
      await screen.findByLabelText("DuitNow mobile number"),
      RECIPIENT_MOBILE,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("RM 12,845.50");
    await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "50");
    await fireEvent.press(screen.getByRole("button", { name: "Review" }));
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
    await act(async () => {
      answerLeftTransfer();
      // Past a lost answer's two repeats, 2 s then 4 s apart, while the newer create is still held.
      await jest.advanceTimersByTimeAsync(7_000);
    });
    answerNewTransfer();

    expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
    jest.useRealTimers();
    expect(await readBankBalanceMinor()).toBe(balanceBeforeMinor - 5_000);
  },
);

function refuseCreatesKeepingTheirBodies() {
  const createBodies: unknown[] = [];
  // Refused, so no approval follows: these tests are about what the create carries.
  mswServer.use(
    http.post("*/transfers", async ({ request }) => {
      createBodies.push(await request.json());
      return HttpResponse.json(
        { error: { code: "INVALID_REQUEST", message: "Test." } },
        { status: 400 },
      );
    }),
  );
  return createBodies;
}

it("shows the note on review, and sends it to the bank trimmed", async () => {
  const createBodies = refuseCreatesKeepingTheirBodies();
  await openReviewOfRm100("/transfer", "  Lunch with Ali  ");

  expect(await screen.findByText("Lunch with Ali")).toBeOnTheScreen();
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  await screen.findByText(
    "Something unexpected stopped the transfer — no money moved.",
  );
  expect(createBodies).toEqual([
    expect.objectContaining({ note: "Lunch with Ali" }),
  ]);
});

it("sends no note when the note is left blank", async () => {
  const createBodies = refuseCreatesKeepingTheirBodies();
  await openReviewOfRm100("/transfer", "   ");

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  await screen.findByText(
    "Something unexpected stopped the transfer — no money moved.",
  );
  expect(screen.queryByText("Note")).toBeNull();
  expect(createBodies).toHaveLength(1);
  expect(createBodies[0]).not.toHaveProperty("note");
});

it.each([
  [
    "AMOUNT_INVALID",
    "Amount (RM)",
    "The bank could not accept this amount.",
    "50",
  ],
  [
    "NOTE_INVALID",
    "Note (optional)",
    "The bank could not accept this note.",
    "Dinner",
  ],
])(
  "returns to the amount step when the bank answers Confirm with %s, and says so under that field until it changes",
  async (code, refusedField, refusal, changedValue) => {
    mswServer.use(
      http.post("*/transfers", () =>
        HttpResponse.json(
          { error: { code, message: "Test." } },
          { status: 422 },
        ),
      ),
    );
    const view = await openReviewOfRm100("/transfer", "Lunch");

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(await screen.findByHintText(refusal)).toBe(
      screen.getByLabelText(refusedField),
    );
    expect(view.getPathname()).toBe("/transfer/amount");
    expect(
      screen.queryByText(
        "The bank could not accept the amount or note as entered. Check them, then review again.",
      ),
    ).toBeNull();
    await fireEvent.changeText(
      screen.getByLabelText(refusedField),
      changedValue,
    );
    expect(screen.queryByHintText(refusal)).toBeNull();
  },
);
