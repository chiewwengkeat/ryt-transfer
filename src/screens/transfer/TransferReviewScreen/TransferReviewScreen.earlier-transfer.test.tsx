import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";

import type { GetPrimaryAccountResponse } from "@/domains/account/api/get-primary-account/get-primary-account.type";
import type { GetTransferLimitsResponse } from "@/domains/account/api/get-transfer-limits/get-transfer-limits.type";
import {
  TransferFunds,
  TransferStatus,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import {
  PendingTransferStage,
  writePendingTransfer,
} from "@/domains/transfer/lib/pending-transfers/pending-transfers";
import {
  sendToBank,
  startTestTransfer,
  mswServer,
} from "@/test/mock-bank/mock-bank";
import { pressHardwareBack, scenarioTest } from "@/test/render/drive-app";
import { renderRoute } from "@/test/render/render-route";

const STILL_BEING_CHECKED =
  "Your last transfer is still being checked, so don't send it again — not confirmed yet. If you contact us, quote this reference: 20261007C0FFEE00";

it(
  "drops the warning on review once the earlier transfer completes, with no notice there, and the amount step behind shows the balance and limit read again",
  scenarioTest("transfer.earlier_transfer_unconfirmed", async () => {
    const { body: account } = await sendToBank<GetPrimaryAccountResponse>(
      "GET",
      "/accounts/primary",
    );
    const { body: limits } = await sendToBank<GetTransferLimitsResponse>(
      "GET",
      "/transfer-limits",
    );
    const { created } = await startTestTransfer(10_000);
    await writePendingTransfer(account.customerId, {
      transferId: created.transfer.transferId,
      idempotencyKey: "approval-key",
      createdAt: "2026-10-07T01:30:00.000Z",
      stage: PendingTransferStage.Processing,
    });
    const bankAnswer = {
      transfer: {
        ...created.transfer,
        reference: "20261007C0FFEE00",
        status: TransferStatus.Processing,
        funds: TransferFunds.Debited,
      },
    };
    mswServer.use(
      http.get("*/transfers/:transferId", () => HttpResponse.json(bankAnswer)),
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
    expect(await screen.findByText(STILL_BEING_CHECKED)).toBeOnTheScreen();
    mswServer.use(
      http.get("*/accounts/primary", () =>
        HttpResponse.json({
          ...account,
          balance: {
            ...account.balance,
            minor: account.balance.minor - 10_000,
          },
        }),
      ),
      http.get("*/transfer-limits", () =>
        HttpResponse.json({
          ...limits,
          daily: {
            ...limits.daily,
            remaining: {
              ...limits.daily.remaining,
              minor: limits.daily.remaining.minor - 10_000,
            },
          },
        }),
      ),
    );
    bankAnswer.transfer = {
      ...bankAnswer.transfer,
      status: TransferStatus.Completed,
      version: bankAnswer.transfer.version + 1,
    };

    await act(() => jest.advanceTimersByTimeAsync(15_000));

    await waitFor(() => {
      expect(screen.queryByText(STILL_BEING_CHECKED)).toBeNull();
    });
    expect(screen.queryByText(/was sent — money moved\.$/)).toBeNull();
    await pressHardwareBack();
    expect(await screen.findByText("RM 12,745.50")).toBeOnTheScreen();
    expect(
      screen.getByText("You can send RM 4,900.00 more today"),
    ).toBeOnTheScreen();
  }),
);
