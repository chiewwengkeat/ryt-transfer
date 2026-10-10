import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { http, HttpResponse } from "msw";

import { readBankBalanceMinor, mswServer } from "@/test/mock-bank/mock-bank";
import {
  biometricPromptsShown,
  cancelNextBiometricPrompt,
  failNextBiometricPrompt,
  holdNextBiometricPrompt,
} from "@/test/doubles/biometrics-double";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import { enterPinAndApprove } from "@/test/render/drive-app";
import {
  secureStoreNativeDouble,
  observedRecords,
} from "@/test/doubles/native-doubles";
import { relaunchApp, renderRoute } from "@/test/render/render-route";

import {
  approveRequests,
  walkToTransferReviewUntilTransferShows,
  walkToTransferReviewAndPressTransfer,
} from "./TransferReviewScreen.helper";

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
  await pairPhoneAsTheDemoLaunchDoes();
  const view = await renderRoute("/transfer");
  await walkToTransferReviewAndPressTransfer();
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
    await pairPhoneAsTheDemoLaunchDoes();
    await renderRoute("/transfer");
    await walkToTransferReviewAndPressTransfer();
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
    await enterPinAndApprove(DEMO_PIN);

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
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/transfer");
  await walkToTransferReviewAndPressTransfer();
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
  await enterPinAndApprove(DEMO_PIN);

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
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/transfer");
  await walkToTransferReviewAndPressTransfer();
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
  await enterPinAndApprove(DEMO_PIN);

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
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/transfer");
  await walkToTransferReviewAndPressTransfer();
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
  await enterPinAndApprove(DEMO_PIN);
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
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/transfer");
  await walkToTransferReviewAndPressTransfer();
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
    await pairPhoneAsTheDemoLaunchDoes();
    await renderRoute("/transfer");
    await walkToTransferReviewUntilTransferShows();
    await fireEvent.press(
      screen.getByRole("button", { name: "Use PIN instead" }),
    );
    for (const refusal of earlierRefusals) {
      await enterPinAndApprove("111111");
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
    await enterPinAndApprove("111111");
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

const DEMO_PIN = "246810";

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
