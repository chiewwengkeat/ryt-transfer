import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { http, HttpResponse } from "msw";

import {
  readBankBalanceMinor,
  mswServer,
  sentRequests,
} from "@/test/mock-bank/mock-bank";
import { biometricPromptsShown } from "@/test/doubles/biometrics-double";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import {
  pressHardwareBack,
  readBankOnRealTimers,
  pressHandlerOf,
  scenarioTest,
  walkToTransferReview,
} from "@/test/render/drive-app";
import {
  secureStoreNativeDouble,
  observedRecords,
} from "@/test/doubles/native-doubles";
import { renderRoute } from "@/test/render/render-route";

import { TransferFlowStep } from "@/screens/transfer/flow-store/flow-store";

afterEach(() => {
  jest.restoreAllMocks();
});

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
  await walkToTransferReview({ note });
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

function countSent(method: string, pathEnd: string) {
  return sentRequests.filter(
    (request) =>
      request.method === method &&
      new URL(request.url).pathname.endsWith(pathEnd),
  ).length;
}

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
