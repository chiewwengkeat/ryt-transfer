import { act, screen, waitFor } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";
import { Text } from "react-native";

import type { GetPrimaryAccountResponse } from "@/domains/account/api/get-primary-account/get-primary-account.type";
import { askForApprovalPin } from "@/domains/approval/lib/approval-pin-sheet/approval-pin-sheet";
import {
  PendingTransferStage,
  writePendingTransfer,
} from "@/domains/transfer/lib/pending-transfers/pending-transfers";
import {
  sendToBank,
  startTestTransfer,
  mswServer,
} from "@/test/mock-bank/mock-bank";
import { relaunchApp, renderRoute } from "@/test/render/render-route";

it("discards another customer's pending transfers at launch, and keeps the signed-in customer's", async () => {
  const { body: signedInAccount } = await sendToBank<GetPrimaryAccountResponse>(
    "GET",
    "/accounts/primary",
  );
  const {
    created: { transfer: ownTransfer },
  } = await startTestTransfer(10_000);
  const {
    created: { transfer: earlierCustomersTransfer },
  } = await startTestTransfer(5_000);
  const pendingSince = {
    idempotencyKey: "key-earlier",
    createdAt: "2026-10-07T01:00:00.000Z",
    stage: PendingTransferStage.Approving,
  };
  await writePendingTransfer("cus_earlier", {
    ...pendingSince,
    transferId: earlierCustomersTransfer.transferId,
  });
  await writePendingTransfer(signedInAccount.customerId, {
    ...pendingSince,
    transferId: ownTransfer.transferId,
  });

  const view = await renderRoute("/", {
    appDir: "src/app",
    overrides: { index: () => <Text>Home</Text> },
  });
  await waitFor(() => {
    expect(view.getPathname()).toBe(
      `/transfer/result/${ownTransfer.transferId}`,
    );
  });
  mswServer.use(
    http.get("*/accounts/primary", () =>
      HttpResponse.json({ ...signedInAccount, customerId: "cus_earlier" }),
    ),
  );
  const relaunched = await relaunchApp(view);
  await act(() => jest.advanceTimersByTimeAsync(500));

  expect(relaunched.getPathname()).toBe("/");
});

it("answers an open PIN request as closed when the app's root goes away, so its caller is not left waiting", async () => {
  const view = await renderRoute("/", {
    appDir: "src/app",
    overrides: { index: () => <Text>Home</Text> },
  });
  let pinAnswer: string | null | undefined;
  await act(() => {
    void askForApprovalPin({ message: "Approve with your PIN." }).then(
      (answer) => {
        pinAnswer = answer;
      },
    );
  });
  await screen.findByRole("button", { name: "Approve" });

  await view.unmount();

  await waitFor(() => expect(pinAnswer).toBeNull());
});
