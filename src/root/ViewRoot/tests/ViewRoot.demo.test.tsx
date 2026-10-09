import "@/test/setup/demo-build";

import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { Pressable, Text } from "react-native";

import type { GetPrimaryAccountResponse } from "@/domains/account/api/get-primary-account/get-primary-account.type";
import { hasApprovalKeysOnFile } from "@/domains/approval/lib/approval-keys/approval-keys";
import { TransferStatus } from "@/domains/transfer/api/get-transfer/get-transfer.type";
import {
  PendingTransferStage,
  writePendingTransfer,
} from "@/domains/transfer/lib/pending-transfers/pending-transfers";
import { requestJson } from "@/shared/http/transport/transport";
import BottomSheetFrame from "@/shared/ui/BottomSheetFrame/BottomSheetFrame";
import {
  lookUpTestRecipient,
  mswServer,
  sendToBank,
  sentNameChecks,
  startTestTransfer,
} from "@/test/mock-bank/mock-bank";
import { biometricPromptsShown } from "@/test/doubles/biometrics-double";
import { isScreenCaptureBlocked } from "@/test/doubles/native-doubles";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import {
  enterPinAndApprove,
  pickDemoScenario,
  scenarioTest,
  waitPastReceiptSettle,
} from "@/test/render/drive-app";
import { crashTheScreenOfASettledReceipt } from "@/test/render/interrupt-app";
import { renderRoute } from "@/test/render/render-route";

it("shows a scenario picked from the Demo menu in a banner, whose ✕ returns to normal", async () => {
  await renderDemoRoot();

  await pickDemoScenario("Transfers under maintenance");
  expect(
    screen.getByText("Demo · Transfers under maintenance"),
  ).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole("button", { name: "Back to normal" }));

  expect(
    screen.queryByText("Demo · Transfers under maintenance"),
  ).not.toBeOnTheScreen();
  await fireEvent.press(screen.getByRole("button", { name: "Demo menu" }));
  expect(
    screen.getByRole("radio", { name: "Normal, no scenario" }),
  ).toBeChecked();
});

it("keeps the Demo banner above an ended session, so a reviewer can return to normal and sign in again", async () => {
  await renderDemoRoot();
  await pickDemoScenario("Session ended");

  await readTheAccountAsAScreenWould();
  const appWhileEnded = screen.queryByRole("button", { name: "Choose a bank" });
  await fireEvent.press(screen.getByRole("button", { name: "Back to normal" }));
  await fireEvent.press(screen.getByRole("button", { name: "Sign in again" }));
  await readTheAccountAsAScreenWould();

  expect(appWhileEnded).not.toBeOnTheScreen();
  expect(
    screen.queryByRole("button", { name: "Sign in again" }),
  ).not.toBeOnTheScreen();
  expect(
    screen.getByRole("button", { name: "Choose a bank" }),
  ).toBeOnTheScreen();
});

it("shows the Demo banner over a session that ended with a screen's sheet open, so a reviewer can still return to normal", async () => {
  await renderDemoRoot();
  await pickDemoScenario("Session ended");
  await fireEvent.press(screen.getByRole("button", { name: "Choose a bank" }));

  await readTheAccountAsAScreenWould();

  expect(
    screen.getByRole("header", { name: "Your session has ended" }),
  ).toBeOnTheScreen();
  expect(
    screen.getByRole("button", { name: "Back to normal" }),
  ).toBeOnTheScreen();
});

it("asks a refused name check again once a Demo scenario is picked, so review shows that scenario's answer", async () => {
  const { recipient } = await lookUpTestRecipient("012-345 6789");
  mswServer.use(
    http.post(
      "*/recipients/lookup",
      () =>
        HttpResponse.json(
          { error: { code: "TOO_MANY_LOOKUPS", message: "Test." } },
          { status: 429 },
        ),
      { once: true },
    ),
  );
  await renderRoute("/transfer");
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    "012-345 6789",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("RM 12,845.50");
  await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  await screen.findByText(
    "Too many name checks in a short time. Try again in a minute.",
  );
  const nameChecksBeforePick = sentNameChecks().length;

  await pickDemoScenario("Balance or limit short at confirmation");

  expect(await screen.findByText(recipient.registeredName)).toBeOnTheScreen();
  expect(sentNameChecks()).toHaveLength(nameChecksBeforePick + 1);
});

it("hides the app and the session-ended view from screen readers while the Demo menu is open", async () => {
  await renderDemoRoot();
  const appBeforeMenu = screen.queryByRole("button", { name: "Choose a bank" });

  await fireEvent.press(screen.getByRole("button", { name: "Demo menu" }));
  const appWhileMenuOpen = screen.queryByRole("button", {
    name: "Choose a bank",
  });
  await fireEvent.press(screen.getByRole("radio", { name: "Session ended" }));
  await readTheAccountAsAScreenWould();
  await fireEvent.press(screen.getByRole("button", { name: "Demo menu" }));
  const signInWhileMenuOpen = screen.queryByRole("button", {
    name: "Sign in again",
  });
  await fireEvent.press(
    screen.getByRole("button", { name: "Close the demo menu" }),
  );

  expect(appBeforeMenu).toBeOnTheScreen();
  expect(appWhileMenuOpen).not.toBeOnTheScreen();
  expect(signInWhileMenuOpen).not.toBeOnTheScreen();
  expect(
    screen.getByRole("button", { name: "Sign in again" }),
  ).toBeOnTheScreen();
});

it("draws a screen's sheet over the app and hides the screen behind it from screen readers", async () => {
  await renderDemoRoot();

  await fireEvent.press(screen.getByRole("button", { name: "Choose a bank" }));

  expect(screen.getByText("Maybank")).toBeOnTheScreen();
  expect(
    screen.queryByRole("button", { name: "Choose a bank" }),
  ).not.toBeOnTheScreen();
  expect(
    screen.getByRole("button", { name: "Close the banks" }),
  ).toBeOnTheScreen();
});

it("hides the Demo header from screen readers while a screen's sheet is open, so the sheet is what they meet first", async () => {
  await renderDemoRoot();
  await pickDemoScenario("Transfers under maintenance");

  await fireEvent.press(screen.getByRole("button", { name: "Choose a bank" }));
  const scenarioWhileSheetOpen = screen.queryByText(
    "Demo · Transfers under maintenance",
  );
  const backToNormalWhileSheetOpen = screen.queryByRole("button", {
    name: "Back to normal",
  });
  const menuWhileSheetOpen = screen.queryByRole("button", {
    name: "Demo menu",
  });
  await fireEvent.press(
    screen.getByRole("button", { name: "Close the banks" }),
  );

  expect(scenarioWhileSheetOpen).not.toBeOnTheScreen();
  expect(backToNormalWhileSheetOpen).not.toBeOnTheScreen();
  expect(menuWhileSheetOpen).not.toBeOnTheScreen();
  expect(
    screen.getByText("Demo · Transfers under maintenance"),
  ).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Demo menu" })).toBeOnTheScreen();
});

it("stops a transfer's approval before any face or fingerprint prompt while No biometrics is picked", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/transfer");
  await pickDemoScenario("No biometrics");

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

  expect(
    await screen.findByText(
      "Face or fingerprint approval isn't available, so approve with your PIN.",
    ),
  ).toBeOnTheScreen();
  expect(biometricPromptsShown()).toEqual([]);
});

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
  await enterPinAndApprove("111111");
  await screen.findByText("That PIN is incorrect. You have 2 tries left.");
  await enterPinAndApprove("111111");
  await screen.findByText("That PIN is incorrect. You have 1 try left.");
  await enterPinAndApprove("111111");
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

it(
  "blocks capture on Home in a demo build while Screenshots blocked is picked, and allows it on a receipt",
  scenarioTest("transfer.screen_capture_blocked", async () => {
    await renderRoute("/");
    await screen.findByText("RM 12,845.50");
    await waitPastReceiptSettle();
    const blockedOnHome = isScreenCaptureBlocked();

    await act(() => {
      router.push("/transfer/result/transfer-on-screen");
    });

    expect(blockedOnHome).toBe(true);
    await waitFor(() => {
      expect(isScreenCaptureBlocked()).toBe(false);
    });
  }),
);

it("allows capture on Home in a demo build until Screenshots blocked is picked from the Demo menu, blocks it at once, and allows it again once another scenario is picked", async () => {
  await renderRoute("/");
  await screen.findByText("RM 12,845.50");
  const blockedBeforePick = isScreenCaptureBlocked();

  await pickDemoScenario("Screenshots blocked");
  const blockedOnPick = isScreenCaptureBlocked();
  await waitPastReceiptSettle();
  const blockedPastSettle = isScreenCaptureBlocked();
  await pickDemoScenario("Normal, no scenario");

  expect(blockedBeforePick).toBe(false);
  expect(blockedOnPick).toBe(true);
  expect(blockedPastSettle).toBe(true);
  expect(isScreenCaptureBlocked()).toBe(false);
});

it(
  "blocks capture again in a demo build while Screenshots blocked is picked when the screen of a sent transfer's result crashes and its error view replaces it",
  scenarioTest("transfer.screen_capture_blocked", async () => {
    await crashTheScreenOfASettledReceipt(
      "/transfer/result/transfer-on-screen",
      "transfer/result/[transferId]",
    );

    expect(isScreenCaptureBlocked()).toBe(true);
  }),
);

it("leaves capture allowed in a demo build with no scenario picked when the screen of a transfer's details crashes and its error view replaces it", async () => {
  await crashTheScreenOfASettledReceipt(
    "/transfer-history/transfer-on-screen",
    "transfer-history/[transferId]",
  );

  expect(isScreenCaptureBlocked()).toBe(false);
});

function ScreenWithASheet() {
  const [sheetOpen, setSheetOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setSheetOpen(true);
        }}
      >
        <Text>Choose a bank</Text>
      </Pressable>
      {sheetOpen && (
        <BottomSheetFrame
          title="Banks"
          closeLabel="Close the banks"
          onClose={() => {
            setSheetOpen(false);
          }}
        >
          <Text>Maybank</Text>
        </BottomSheetFrame>
      )}
    </>
  );
}

async function renderDemoRoot() {
  await renderRoute("/", {
    appDir: "src/app",
    overrides: { index: ScreenWithASheet },
  });
}

async function readTheAccountAsAScreenWould() {
  // The bank answers after a delay, which the route's fake timers would hold forever.
  jest.useRealTimers();
  await act(async () => {
    await requestJson("/accounts/primary").catch(() => undefined);
  });
}

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
