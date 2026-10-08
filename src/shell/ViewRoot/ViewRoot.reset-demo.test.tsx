import { act, fireEvent, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { http, HttpResponse } from "msw";

import type { GetPrimaryAccountResponse } from "@/domains/account/api/get-primary-account/get-primary-account.type";
import { hasApprovalKeysOnFile } from "@/domains/approval/hooks/approval-keys";
import type { DemoLayer } from "@/domains/approval/hooks/demo-layer.type";
import { TransferStatus } from "@/domains/transfer/api/get-transfer/get-transfer.type";
import {
  PendingTransferStage,
  writePendingTransfer,
} from "@/domains/transfer/hooks/pending-transfers";
import { requestJson } from "@/shared/http/transport";
import { sendToBank, startTestTransfer } from "@/test/bank-client";
import { biometricPromptsShown } from "@/test/biometrics-double";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { mswServer } from "@/test/msw-server";
import { renderRoute } from "@/test/render-route";

// The demo build's root: Jest runs as production, whose launch loads no demo layer.
jest.mock("@/shell/app-launch", () => ({
  __esModule: true,
  demoLayer: jest.requireActual<{ default: DemoLayer }>("@/mocks/demo-layer")
    .default,
}));

async function sendRm100FromHomeAndReturn() {
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer", disabled: false }),
  );
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    "012-345 6789",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await fireEvent.changeText(
    await screen.findByLabelText("Amount (RM)"),
    "100",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await fireEvent.press(await screen.findByRole("button", { name: "Done" }));
}

async function startRm100TransferFromHomeUnderNoBiometrics() {
  await fireEvent.press(
    await screen.findByRole("button", { name: "Demo menu" }),
  );
  await fireEvent.press(screen.getByRole("radio", { name: "No biometrics" }));
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer", disabled: false }),
  );
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    "012-345 6789",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await fireEvent.changeText(
    await screen.findByLabelText("Amount (RM)"),
    "100",
  );
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

it("puts Home back to the demo's opening balance and limit, and a transfer after the reset still goes through", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/");
  await sendRm100FromHomeAndReturn();
  await screen.findByText("RM 12,745.50");

  await fireEvent.press(screen.getByRole("button", { name: "Demo menu" }));
  await fireEvent.press(screen.getByRole("button", { name: "Reset demo" }));

  expect(await screen.findByText("RM 12,845.50")).toBeOnTheScreen();
  expect(
    screen.getByText("You can send RM 5,000.00 more today"),
  ).toBeOnTheScreen();
  await sendRm100FromHomeAndReturn();
  expect(await screen.findByText("RM 12,745.50")).toBeOnTheScreen();
  expect(
    screen.getByText("You can send RM 4,900.00 more today"),
  ).toBeOnTheScreen();
});

it("keeps no PIN lock past Reset demo, so the next transfer gets its keypad", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/");
  await startRm100TransferFromHomeUnderNoBiometrics();
  await approveWithPin("111111");
  await screen.findByText("That PIN is incorrect. You have 2 tries left.");
  await approveWithPin("111111");
  await screen.findByText("That PIN is incorrect. You have 1 try left.");
  await approveWithPin("111111");
  await fireEvent.press(await screen.findByRole("button", { name: "Close" }));
  await act(() => {
    router.dismissTo("/");
  });

  await fireEvent.press(screen.getByRole("button", { name: "Demo menu" }));
  await fireEvent.press(screen.getByRole("button", { name: "Reset demo" }));
  // A transfer begun while the reset runs has its flow reset beneath it.
  await act(() => jest.advanceTimersByTimeAsync(5_000));
  await startRm100TransferFromHomeUnderNoBiometrics();

  expect(await screen.findByRole("button", { name: "2" })).toBeOnTheScreen();
  expect(screen.getByLabelText("PIN, 0 of 6 digits entered")).toBeOnTheScreen();
});

it("turns face or fingerprint approval back on with Reset demo after No biometrics was picked", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/");
  await fireEvent.press(
    await screen.findByRole("button", { name: "Demo menu" }),
  );
  await fireEvent.press(screen.getByRole("radio", { name: "No biometrics" }));

  await fireEvent.press(screen.getByRole("button", { name: "Demo menu" }));
  await fireEvent.press(screen.getByRole("button", { name: "Reset demo" }));
  await act(() => jest.advanceTimersByTimeAsync(5_000));
  await sendRm100FromHomeAndReturn();

  expect(biometricPromptsShown()).toHaveLength(1);
  expect(await screen.findByText("RM 12,745.50")).toBeOnTheScreen();
});

it("checks an earlier transfer again once they sign back in after the reset, and says it was sent", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const {
    body: { customerId },
  } = await sendToBank<GetPrimaryAccountResponse>("GET", "/accounts/primary");
  const { created, lookup } = await startTestTransfer(10_000);
  await renderRoute("/");
  await screen.findByText("RM 12,845.50");
  await fireEvent.press(screen.getByRole("button", { name: "Demo menu" }));
  await fireEvent.press(screen.getByRole("button", { name: "Reset demo" }));
  // ⛔ Wait the reset out first: a record written while it runs is wiped by the reset itself, which also hides this notice.
  await act(() => jest.advanceTimersByTimeAsync(5_000));
  expect(await hasApprovalKeysOnFile()).toBe(true);
  await writePendingTransfer(customerId, {
    transferId: created.transfer.transferId,
    idempotencyKey: "approval-key",
    createdAt: "2026-10-07T01:30:00.000Z",
    stage: PendingTransferStage.Processing,
  });
  let sessionEnded = true;
  mswServer.use(
    http.all("*", () =>
      sessionEnded ? new HttpResponse(null, { status: 401 }) : undefined,
    ),
    http.get("*/transfers/:transferId", () =>
      HttpResponse.json({
        transfer: { ...created.transfer, status: TransferStatus.Completed },
      }),
    ),
  );
  await act(async () => {
    await requestJson("/any-request").catch(() => undefined);
  });
  const signInAgain = await screen.findByRole("button", {
    name: "Sign in again",
  });
  sessionEnded = false;

  await fireEvent.press(signInAgain);

  expect(
    await screen.findByText(
      `Your transfer of RM 100.00 to ${lookup.recipient.registeredName} was sent — money moved.`,
    ),
  ).toBeOnTheScreen();
});
