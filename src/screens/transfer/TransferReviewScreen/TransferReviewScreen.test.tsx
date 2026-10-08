import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { http, HttpResponse } from "msw";
import { Platform } from "react-native";

import { ApproveTransferErrorCode } from "@/domains/transfer/api/approve-transfer/approve-transfer.type";
import { lookUpTestRecipient, readBankBalanceMinor } from "@/test/bank-client";
import {
  biometricPromptsShown,
  cancelNextBiometricPrompt,
  phoneKeyOptions,
} from "@/test/biometrics-double";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { pressHardwareBack } from "@/test/hardware-back";
import { readBankOnRealTimers } from "@/test/read-bank-on-real-timers";
import { secureStoreNativeDouble } from "@/test/harness/native-doubles";
import { observedRecords } from "@/test/harness/recording-sink";
import { mswServer, sentRequests } from "@/test/msw-server";
import { renderRoute } from "@/test/render-route";
import { scenarioTest } from "@/test/scenario-test";

import { TransferFlowStep, transferFlowStore } from "../state/transfer-flow";

const MOBILE = "012-345 6789";

async function openReviewOfRm100(startPath: "/" | "/transfer" = "/transfer") {
  const view = await renderRoute(startPath);
  if (startPath === "/")
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    MOBILE,
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("RM 12,845.50");
  await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  return view;
}

function countPostsTo(pathname: RegExp) {
  return sentRequests.filter(
    (request) =>
      request.method === "POST" && pathname.test(new URL(request.url).pathname),
  ).length;
}

// The swipe is native and never reaches JS, so this reads the setting the root stack hands its transfer screen.
function readRootTransferScreenGestureEnabled() {
  type Fiber = {
    return: Fiber | null;
    child: Fiber | null;
    sibling: Fiber | null;
    stateNode: unknown;
    memoizedProps: { screenId?: unknown; gestureEnabled?: unknown } | null;
  };
  let fiber = (screen.root as unknown as { unstable_fiber: Fiber })
    .unstable_fiber;
  while (fiber.return) fiber = fiber.return;
  // The walk up can end in React's stale copy of the tree, which still holds an earlier render's options.
  const pending = [(fiber.stateNode as { current: Fiber }).current];
  for (let next = pending.pop(); next; next = pending.pop()) {
    const props = next.memoizedProps;
    if (
      typeof props?.screenId === "string" &&
      props.screenId.startsWith("transfer-")
    )
      return props.gestureEnabled;
    if (next.sibling) pending.push(next.sibling);
    if (next.child) pending.push(next.child);
  }
  throw new Error("The root stack holds no transfer screen.");
}

it(
  "shows the name and bank the bank holds for the number",
  scenarioTest("transfer.recipient_found", async () => {
    const { recipient } = await lookUpTestRecipient(MOBILE);
    await openReviewOfRm100();

    expect(await screen.findByText(recipient.registeredName)).toBeOnTheScreen();
    expect(screen.getByText(recipient.bankName)).toBeOnTheScreen();
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
    const transferButton = await screen.findByRole("button", {
      name: "Transfer",
    });
    // fireEvent flushes each press, so a second one would hit a busy button and prove nothing.
    type PressFiber = {
      return: PressFiber | null;
      memoizedProps: { onPress?: () => void } | null;
    };
    let fiber: PressFiber | null = (
      transferButton as unknown as { unstable_fiber: PressFiber }
    ).unstable_fiber;
    while (fiber !== null && fiber.memoizedProps?.onPress === undefined)
      fiber = fiber.return;
    const pressTransfer = fiber?.memoizedProps?.onPress;
    if (pressTransfer === undefined)
      throw new Error("Nothing handles a press on Transfer.");

    await act(() => {
      pressTransfer();
      pressTransfer();
    });

    await screen.findByText("Transfer sent");
    expect(countPostsTo(/\/transfers$/)).toBe(1);
    expect(countPostsTo(/\/approve$/)).toBe(1);
    expect(biometricPromptsShown()).toHaveLength(1);
    expect(await readBankOnRealTimers(readBankBalanceMinor)).toBe(
      balanceBeforeMinor - 10_000,
    );
  }),
);

it("reports each step of a sent transfer with its amount, never with the recipient", async () => {
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
    { step: "reviewing", amountMinor: 10_000, currency: "MYR" },
    { step: "creating", amountMinor: 10_000, currency: "MYR" },
    { step: "approving", amountMinor: 10_000, currency: "MYR" },
    { step: "submitting", amountMinor: 10_000, currency: "MYR" },
    { step: "done" },
    { step: "editing" },
  ]);
});

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
    const { recipient } = await lookUpTestRecipient(MOBILE);
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
    const { recipient } = await lookUpTestRecipient(MOBILE);
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
      await screen.findByText("The transfer was not sent — no money moved."),
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
    await openReviewOfRm100();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(
      await screen.findByText(
        "The bank's answer did not arrive. Check History before sending this again — not confirmed yet.",
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Transfer" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Back to Home" }),
    ).toBeOnTheScreen();
    expect(await readBankOnRealTimers(readBankBalanceMinor)).toBe(
      balanceBeforeMinor - 10_000,
    );
  }),
);

it(
  "keeps review open when Back is pressed mid-approval, so the lost answer is told and one intended transfer debits once",
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
    releaseApproval();

    expect(
      await screen.findByText(
        "The bank's answer did not arrive. Check History before sending this again — not confirmed yet.",
      ),
    ).toBeOnTheScreen();
    await pressHardwareBack();
    expect(view.getPathname()).toBe("/transfer/review");
    expect(screen.queryByRole("button", { name: "Transfer" })).toBeNull();
    expect(await readBankOnRealTimers(readBankBalanceMinor)).toBe(
      balanceBeforeMinor - 10_000,
    );
  }),
);

it(
  "turns off the swipe that would close the whole transfer flow while the transfer is being sent",
  scenarioTest("transfer.approval_unanswered", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    let releaseCreate: () => void = () => undefined;
    const createHeld = new Promise<void>((release) => {
      releaseCreate = () => {
        release();
      };
    });
    // Holds the create so the swipe is read at its first sending step, then falls through to the scenario.
    mswServer.use(
      http.post(
        "*/transfers",
        async () => {
          await createHeld;
        },
        { once: true },
      ),
    );
    await openReviewOfRm100("/");
    const transferButton = await screen.findByRole("button", {
      name: "Transfer",
    });
    expect(readRootTransferScreenGestureEnabled()).not.toBe(false);

    await fireEvent.press(transferButton);
    await screen.findByRole("button", { name: "Transfer", busy: true });
    expect(readRootTransferScreenGestureEnabled()).toBe(false);
    releaseCreate();
    await screen.findByRole("button", { name: "Back to Home" });

    expect(readRootTransferScreenGestureEnabled()).toBe(false);
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
    await screen.findByText("The transfer was not sent — no money moved.");

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
    await fireEvent.press(
      await screen.findByRole("button", { name: "Back to Home" }),
    );

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
  await fireEvent.press(
    await screen.findByRole("button", { name: "Back to Home" }),
  );

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

    await fireEvent.press(
      await screen.findByRole("button", { name: "Back to Home" }),
    );
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
    expect(
      await screen.findByLabelText("DuitNow mobile number"),
    ).toHaveDisplayValue("");
    await fireEvent.changeText(
      screen.getByLabelText("DuitNow mobile number"),
      MOBILE,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByLabelText("Amount (RM)")).toHaveDisplayValue("");
    expect(view.getPathname()).toBe("/transfer/amount");
  }),
);

it(
  "never reopens review after a lost answer, even from the amount step behind it",
  scenarioTest("transfer.approval_unanswered", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const view = await openReviewOfRm100();
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
    await screen.findByRole("button", { name: "Back to Home" });

    // Review offers no way back after a lost answer, so this stands in for any route that still could.
    await act(() => {
      router.back();
    });
    await fireEvent.press(
      await screen.findByRole("button", { name: "Review" }),
    );

    expect(view.getPathname()).toBe("/transfer/amount");
    expect(screen.queryByText("This screen stopped working.")).toBeNull();
  }),
);

it("never moves on from the recipient step while a transfer is still being created", async () => {
  let releaseCreate: () => void = () => undefined;
  const createHeld = new Promise<void>((release) => {
    releaseCreate = () => {
      release();
    };
  });
  mswServer.use(
    http.post(
      "*/transfers",
      async () => {
        await createHeld;
        return HttpResponse.error();
      },
      { once: true },
    ),
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
  // Review is gone, so only the flow shows the held create failing inside this test rather than in the next one.
  releaseCreate();
  await waitFor(() => {
    expect(transferFlowStore.getState().step).toBe(TransferFlowStep.Reviewing);
  });
});

it(
  "never offers to send again when the approval's answer is lost",
  scenarioTest("transfer.approval_unanswered", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    await openReviewOfRm100();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(
      await screen.findByText(
        "The bank's answer did not arrive. Check History before sending this again — not confirmed yet.",
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Transfer" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Back to Home" }),
    ).toBeOnTheScreen();
  }),
);

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
      "Something unexpected stopped the approval before it was sent — no money moved.",
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
      "Something unexpected stopped the approval before it was sent — no money moved.",
    ),
  ).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Transfer" })).toBeOnTheScreen();
  expect(await readBankOnRealTimers(readBankBalanceMinor)).toBe(
    balanceBeforeMinor,
  );
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
      "Something unexpected stopped the approval before it was sent — no money moved.",
    ),
  ).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Transfer" })).toBeOnTheScreen();
  expect(countPostsTo(/\/transfers$/)).toBe(0);
});

it("never says no money moved when something unexpected fails after the bank answers the approval", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const balanceBeforeMinor = await readBankBalanceMinor();
  await openReviewOfRm100();
  // Nothing the bank answers can fail past the approval, so a navigation fault stands in.
  jest.spyOn(router, "dismissTo").mockImplementationOnce(() => {
    throw new Error("Test.");
  });

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  expect(
    await screen.findByText(
      "The result cannot be shown right now. Check History before sending this again — not confirmed yet.",
    ),
  ).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Transfer" })).toBeNull();
  expect(
    screen.getByRole("button", { name: "Back to Home" }),
  ).toBeOnTheScreen();
  expect(await readBankOnRealTimers(readBankBalanceMinor)).toBe(
    balanceBeforeMinor - 10_000,
  );
});

it.each<[string, () => Response]>([
  ["a 500 with no body", () => new HttpResponse(null, { status: 500 })],
  [
    "a 502 proxy page",
    () => new HttpResponse("<html>Bad gateway</html>", { status: 502 }),
  ],
  [
    "a 503 whose code approve does not name",
    () =>
      HttpResponse.json(
        { error: { code: "SERVICE_UNAVAILABLE", message: "Test." } },
        { status: 503 },
      ),
  ],
  ["a 200 with an empty body", () => new HttpResponse("", { status: 200 })],
  ["a 200 whose body is not JSON", () => new HttpResponse("OK")],
  ["a 200 whose body holds no transfer", () => HttpResponse.json({})],
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
  ],
])(
  "never offers to send again when the bank answers the approval with %s",
  async (_, answerApproval) => {
    await pairPhoneAsTheDemoLaunchDoes();
    mswServer.use(http.post("*/transfers/:transferId/approve", answerApproval));
    await openReviewOfRm100();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(
      await screen.findByText(
        "The bank's answer did not arrive. Check History before sending this again — not confirmed yet.",
      ),
    ).toBeOnTheScreen();
    expect(
      screen.queryByText("The transfer was not sent — no money moved."),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Transfer" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Back to Home" }),
    ).toBeOnTheScreen();
    expect(countPostsTo(/\/approve$/)).toBe(1);
  },
);

it("never offers to send again when the bank has not answered the approval after 30 seconds", async () => {
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
        return HttpResponse.error();
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

  await act(() => jest.advanceTimersByTimeAsync(29_000));
  // ⛔ Never a findBy here: it moves the fake clock while it waits, past the 30 seconds under test.
  expect(
    screen.queryByText(
      "The bank's answer did not arrive. Check History before sending this again — not confirmed yet.",
    ),
  ).toBeNull();
  await act(() => jest.advanceTimersByTimeAsync(1_500));

  expect(
    await screen.findByText(
      "The bank's answer did not arrive. Check History before sending this again — not confirmed yet.",
    ),
  ).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Transfer" })).toBeNull();
  expect(countPostsTo(/\/approve$/)).toBe(1);
  releaseApproval();
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
  // The ended session hides the app from screen readers, review's notice included.
  expect(
    screen.getByText(
      "The bank's answer did not arrive. Check History before sending this again — not confirmed yet.",
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
  "never says money moved when the bank answers that the transfer is still processing",
  scenarioTest("transfer.processing", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const view = await openReviewOfRm100();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(
      await screen.findByText(
        "The result cannot be shown right now. Check History before sending this again — not confirmed yet.",
      ),
    ).toBeOnTheScreen();
    expect(view.getPathname()).toMatch(/^\/transfer\/result\/[\w-]+$/);
    expect(screen.queryByText(/— money moved\./)).toBeNull();
  }),
);

it(
  "never says money moved when the bank finds the balance or limit short as the approval arrives",
  scenarioTest("transfer.balance_or_limit_short_at_approval", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    await openReviewOfRm100();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(
      await screen.findByText(
        "The result cannot be shown right now. Check History before sending this again — not confirmed yet.",
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/— money moved\./)).toBeNull();
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
  [410, ApproveTransferErrorCode.ApprovalExpired, {}],
  [403, ApproveTransferErrorCode.ApprovalInvalid, {}],
  [422, ApproveTransferErrorCode.PinIncorrect, { attemptsRemaining: 2 }],
  [423, ApproveTransferErrorCode.PinLocked, {}],
  [409, ApproveTransferErrorCode.KeyNotRegistered, {}],
  [
    403,
    ApproveTransferErrorCode.CoolingOff,
    { until: "2026-10-07T21:30:00+08:00", reason: "DEVICE_PAIRED" },
  ],
  [403, ApproveTransferErrorCode.AccountLocked, {}],
])(
  "says the transfer was not sent, and offers it again, when the bank refuses the approval with %i %s",
  async (status, code, details) => {
    await pairPhoneAsTheDemoLaunchDoes();
    mswServer.use(
      http.post("*/transfers/:transferId/approve", () =>
        HttpResponse.json(
          { error: { code, message: "Test.", ...details } },
          { status },
        ),
      ),
    );
    await openReviewOfRm100();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(
      await screen.findByText("The transfer was not sent — no money moved."),
    ).toBeOnTheScreen();
    expect(
      screen.queryByText(
        "The bank's answer did not arrive. Check History before sending this again — not confirmed yet.",
      ),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Transfer" })).toBeOnTheScreen();
    expect(countPostsTo(/\/approve$/)).toBe(1);
  },
);
