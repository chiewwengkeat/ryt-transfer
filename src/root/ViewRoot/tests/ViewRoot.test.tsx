import type { GetPrimaryAccountResponse } from "@/domains/account/api/get-primary-account/get-primary-account.type";
import {
  PendingTransferStage,
  writePendingTransfer,
} from "@/domains/transfer/lib/pending-transfers/pending-transfers";
import {
  mswServer,
  sendToBank,
  startTestTransfer,
} from "@/test/mock-bank/mock-bank";
import { relaunchApp, renderRoute } from "@/test/render/render-route";
import { act, waitFor } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";
import { Text } from "react-native";

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
