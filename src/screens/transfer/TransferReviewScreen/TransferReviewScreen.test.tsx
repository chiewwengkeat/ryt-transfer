import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { http, HttpResponse } from "msw";

import { lookUpTestRecipient, readBankBalanceMinor } from "@/test/bank-client";
import {
  biometricPromptsShown,
  cancelNextBiometricPrompt,
  phoneKeyOptions,
} from "@/test/biometrics-double";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { pressHardwareBack } from "@/test/hardware-back";
import { secureStoreNativeDouble } from "@/test/harness/native-doubles";
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
    // The bank answers after a delay, which the route's fake timers would hold forever.
    jest.useRealTimers();
    expect(await readBankBalanceMinor()).toBe(balanceBeforeMinor - 10_000);
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
    jest.useRealTimers();
    expect(await readBankBalanceMinor()).toBe(balanceBeforeMinor - 10_000);
  }),
);

it("asks for a face or fingerprint only, never the phone's passcode", async () => {
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
});

it("states the amount and the recipient's registered name in the face or fingerprint prompt", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const { recipient } = await lookUpTestRecipient(MOBILE);
  await openReviewOfRm100();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await screen.findByText("Transfer sent");

  expect(biometricPromptsShown()).toEqual([
    expect.objectContaining({
      promptTitle: "Approve transfer",
      promptSubtitle: `RM 100.00 to ${recipient.registeredName}`,
    }),
  ]);
});

it("says the transfer was not sent when the face or fingerprint prompt is closed", async () => {
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
  jest.useRealTimers();
  expect(await readBankBalanceMinor()).toBe(balanceBeforeMinor);
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
      await screen.findByText("The transfer was not sent — no money moved."),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Transfer" })).toBeOnTheScreen();
    jest.useRealTimers();
    expect(await readBankBalanceMinor()).toBe(balanceBeforeMinor);
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
    jest.useRealTimers();
    expect(await readBankBalanceMinor()).toBe(balanceBeforeMinor - 10_000);
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
    jest.useRealTimers();
    expect(await readBankBalanceMinor()).toBe(balanceBeforeMinor - 10_000);
  }),
);

it(
  "turns off the swipe that would close the whole transfer flow while the transfer is being sent",
  scenarioTest("transfer.approval_unanswered", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    await openReviewOfRm100("/");
    const transferButton = await screen.findByRole("button", {
      name: "Transfer",
    });
    expect(readRootTransferScreenGestureEnabled()).not.toBe(false);

    await fireEvent.press(transferButton);
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

it("never offers to send again when the approval's answer is lost", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  mswServer.use(
    http.post("*/transfers/:transferId/approve", () => HttpResponse.error()),
  );
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
  jest.useRealTimers();
  expect(await readBankBalanceMinor()).toBe(balanceBeforeMinor);
});

it("never says no money moved when something unexpected fails after the approval was sent", async () => {
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
      "The bank's answer did not arrive. Check History before sending this again — not confirmed yet.",
    ),
  ).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Transfer" })).toBeNull();
  expect(
    screen.getByRole("button", { name: "Back to Home" }),
  ).toBeOnTheScreen();
  jest.useRealTimers();
  expect(await readBankBalanceMinor()).toBe(balanceBeforeMinor - 10_000);
});
