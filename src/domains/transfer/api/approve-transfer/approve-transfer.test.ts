import { getTransferOptions } from "@/domains/transfer/api/get-transfer/get-transfer";
import {
  TransferDirection,
  TransferFunds,
  TransferStatus,
  type Transfer,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { RecipientIdType } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import { mswServer } from "@/test/mock-bank/mock-bank";
import { createQueryClientWithoutGcTimers } from "@/test/render/drive-app";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";
import { createElement, type ReactNode } from "react";
import {
  buildSignedApprovalText,
  useApproveTransfer,
} from "./approve-transfer";

it("signs the reviewed details as JSON in the fixed key order", () => {
  expect(buildSignedApprovalText({ ...REVIEWED_TRANSFER, note: "Lunch" })).toBe(
    '{"format":"transfer-approval/1","transferId":"trf_8c1f3a","challenge":"q7Rk2nVb0sXe","recipientRef":"ref_51d0","registeredName":"NUR AISYAH BINTI AHMAD","idValueMasked":"•••• 4567","bankCode":"MBB","amountMinor":12550,"currency":"MYR","note":"Lunch"}',
  );
});

it("keeps the note's key as null when there is no note", () => {
  const expected = buildSignedApprovalText({
    ...REVIEWED_TRANSFER,
    note: null,
  });

  expect(expected).toMatch(/,"note":null}$/);
  expect(buildSignedApprovalText(REVIEWED_TRANSFER)).toBe(expected);
  expect(buildSignedApprovalText({ ...REVIEWED_TRANSFER, note: "" })).toBe(
    expected,
  );
});

it("keeps the copy of a transfer it holds when the approval answers the same version", async () => {
  const queryClient = await approveWithTheBankAnswering(
    transferAt(2, TransferStatus.Completed),
    transferAt(2, TransferStatus.Processing),
  );

  expect(
    queryClient.getQueryData(getTransferOptions("trf_1").queryKey)?.status,
  ).toBe(TransferStatus.Processing);
});

it("keeps the approval's copy of a transfer when a later read answers the same version", async () => {
  const queryClient = await approveWithTheBankAnswering(
    transferAt(2, TransferStatus.Completed),
  );
  mswServer.use(
    http.get("*/transfers/:transferId", () =>
      HttpResponse.json({ transfer: transferAt(2, TransferStatus.Processing) }),
    ),
  );

  await queryClient.fetchQuery(getTransferOptions("trf_1"));

  expect(
    queryClient.getQueryData(getTransferOptions("trf_1").queryKey)?.status,
  ).toBe(TransferStatus.Completed);
});

const REVIEWED_TRANSFER = {
  transferId: "trf_8c1f3a",
  challenge: "q7Rk2nVb0sXe",
  recipientRef: "ref_51d0",
  registeredName: "NUR AISYAH BINTI AHMAD",
  idValueMasked: "•••• 4567",
  bankCode: "MBB",
  amount: { minor: 12550, currency: "MYR" as const },
};

const transferAt = (version: number, status: TransferStatus): Transfer => ({
  transferId: "trf_1",
  version,
  direction: TransferDirection.Out,
  status,
  funds: TransferFunds.Debited,
  counterparty: {
    registeredName: "TAN WEI MING",
    idType: RecipientIdType.Mobile,
    idValueMasked: "•••• 6789",
    bankName: "Maybank",
  },
  amount: { minor: 10_000, currency: "MYR" },
  createdAt: "2026-10-07T09:30:00+08:00",
  updatedAt: "2026-10-07T09:30:05+08:00",
});

async function approveWithTheBankAnswering(answer: Transfer, held?: Transfer) {
  const queryClient = createQueryClientWithoutGcTimers();
  if (held)
    queryClient.setQueryData(
      getTransferOptions(held.transferId).queryKey,
      held,
    );
  mswServer.use(
    http.post("*/transfers/:transferId/approve", () =>
      HttpResponse.json({ transfer: answer }),
    ),
  );
  const { result } = await renderHook(useApproveTransfer, {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children),
  });
  await act(() =>
    result.current.mutateAsync({
      customerId: "cus_1",
      transferId: answer.transferId,
      request: { keyId: "key_1", signature: "c2lnbmF0dXJl" },
      idempotencyKey: "approve-1",
    }),
  );
  return queryClient;
}
