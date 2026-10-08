import type { QueryClient } from "@tanstack/react-query";
import { act, fireEvent, screen } from "@testing-library/react-native";

import { approvalPinSheetStore } from "@/domains/approval/hooks/approval-pin-sheet";
import { approvalSettingsStore } from "@/domains/approval/hooks/approval-settings";
import { transferFlowStore } from "@/screens/transfer/state/transfer-flow";
import { readBankBalanceMinor } from "@/test/bank-client";
import { biometricPromptsShown } from "@/test/biometrics-double";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { observedRecords } from "@/test/harness/recording-sink";
import { sentRequests } from "@/test/msw-server";
import { renderRoute } from "@/test/render-route";
import { scenarioTest } from "@/test/scenario-test";

const DEMO_PIN = "246810";

async function confirmRm100ApprovedByPin() {
  await pairPhoneAsTheDemoLaunchDoes();
  approvalSettingsStore.setState({ biometricApprovalOn: false });
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
