import { approvalSettingsStore } from "@/domains/approval/lib/approval-host-inputs/approval-host-inputs";
import {
  observedRecords,
  secureStoreNativeDouble,
} from "@/test/doubles/native-doubles";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import {
  mswServer,
  readBankBalanceMinor,
  sentRequests,
} from "@/test/mock-bank/mock-bank";
import {
  enterPinAndApprove,
  pressHardwareBack,
  readBankOnRealTimers,
  scenarioTest,
  walkToTransferReview,
} from "@/test/render/drive-app";
import { relaunchApp, renderRoute } from "@/test/render/render-route";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { http, HttpResponse } from "msw";
import {
  countSent,
  RECIPIENT_MOBILE,
  walkFromHomeToTransferReview,
  walkToTransferReviewAndPressTransfer,
} from "./TransferReviewScreen.helper";

afterEach(() => {
  jest.restoreAllMocks();
});

it(
  "leaves only Home beneath the result once the approval's answer is lost, so review cannot send it again",
  scenarioTest("transfer.approval_unanswered", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const view = await renderRoute("/");
    await walkFromHomeToTransferReview();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
    await screen.findByText("Transfer sent", {}, { timeout: 10_000 });
    await pressHardwareBack();

    expect(view.getPathname()).toBe("/");
  }),
);

it(
  "re-reads the balance after a lost answer, so Home shows the debit the bank made",
  scenarioTest("transfer.approval_unanswered", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    await renderRoute("/");
    await walkFromHomeToTransferReview();

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
  await renderRoute("/");
  await walkFromHomeToTransferReview();
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
    const view = await renderRoute("/transfer");
    await walkToTransferReview();
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

it("takes a lost approval answer to the result page, which never offers to send again", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  mswServer.use(
    http.post("*/transfers/:transferId/approve", () => HttpResponse.error()),
  );
  const view = await renderRoute("/transfer");
  await walkToTransferReview();

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
  const view = await renderRoute("/transfer");
  await walkToTransferReview();
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
  await renderRoute("/transfer");
  await walkToTransferReview();
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

it("never says no money moved when something unexpected fails after the bank answers the approval", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const balanceBeforeMinor = await readBankBalanceMinor();
  const view = await renderRoute("/transfer");
  await walkToTransferReview();
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
  const view = await renderRoute("/transfer");
  await walkToTransferReview();
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
  // Waited out here: the released reads fail as no network and redraw Home, which teardown would warn of.
  await act(async () => {
    releaseApprovals();
    await jest.advanceTimersByTimeAsync(1_000);
  });
});

it("closes the PIN sheet and checks the transfer on the result page, never saying no money moved, when something unexpected fails after the approval has left the phone", async () => {
  approvalSettingsStore.setState({ biometricApprovalOn: false });
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/transfer");
  await walkToTransferReviewAndPressTransfer();
  // Nothing after the bank's answer throws by itself, so a failing navigation stands in for any throw there.
  const dismissFailingOnce = jest
    .spyOn(router, "dismissTo")
    .mockImplementationOnce(() => {
      throw new Error("Test.");
    });

  await enterPinAndApprove(DEMO_PIN);

  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  expect(screen.queryByText(/no money moved/)).toBeNull();
  expect(dismissFailingOnce).toHaveBeenCalledTimes(2);
  dismissFailingOnce.mockRestore();
});

const DEMO_PIN = "246810";
