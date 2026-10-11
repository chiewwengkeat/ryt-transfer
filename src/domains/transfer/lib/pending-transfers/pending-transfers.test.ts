import {
  deleteAllSecureRecords,
  readSecureRecord,
  writeSecureRecord,
} from "@/shared/platform/secure-storage/secure-storage";
import { secureStoreNativeDouble } from "@/test/doubles/native-doubles";
import {
  clearPendingTransfer,
  discardOtherCustomersPendingTransfers,
  listPendingTransfers,
  PendingTransferStage,
  updatePendingTransfer,
  writePendingTransfer,
} from "./pending-transfers";

afterEach(() => {
  jest.restoreAllMocks();
});

it("lists the pending transfers written for a customer, and none of another customer's", async () => {
  await writePendingTransfer(FIRST_CUSTOMER, approvingRecord("trf_1"));
  await writePendingTransfer(SECOND_CUSTOMER, approvingRecord("trf_2"));

  expect(await listPendingTransfers(FIRST_CUSTOMER)).toEqual([
    approvingRecord("trf_1"),
  ]);
});

it("keeps one record per transfer, holding the key of its latest write", async () => {
  await writePendingTransfer(FIRST_CUSTOMER, approvingRecord("trf_1"));
  await writePendingTransfer(FIRST_CUSTOMER, {
    ...approvingRecord("trf_1"),
    idempotencyKey: "key-second-attempt",
  });

  expect(await listPendingTransfers(FIRST_CUSTOMER)).toEqual([
    { ...approvingRecord("trf_1"), idempotencyKey: "key-second-attempt" },
  ]);
});

it("moves a transfer to the stage it reached, and never brings back a cleared one", async () => {
  await writePendingTransfer(FIRST_CUSTOMER, approvingRecord("trf_1"));

  await updatePendingTransfer(FIRST_CUSTOMER, "trf_1", {
    stage: PendingTransferStage.Processing,
  });
  await updatePendingTransfer(FIRST_CUSTOMER, "trf_cleared", {
    stage: PendingTransferStage.Processing,
  });

  expect(await listPendingTransfers(FIRST_CUSTOMER)).toEqual([
    { ...approvingRecord("trf_1"), stage: PendingTransferStage.Processing },
  ]);
});

it("keeps the bank's reference with a transfer through a later change of stage", async () => {
  await writePendingTransfer(FIRST_CUSTOMER, approvingRecord("trf_1"));

  await updatePendingTransfer(FIRST_CUSTOMER, "trf_1", {
    reference: "20261008601D507E",
  });
  await updatePendingTransfer(FIRST_CUSTOMER, "trf_1", {
    stage: PendingTransferStage.Processing,
  });

  expect(await listPendingTransfers(FIRST_CUSTOMER)).toEqual([
    {
      ...approvingRecord("trf_1"),
      stage: PendingTransferStage.Processing,
      reference: "20261008601D507E",
    },
  ]);
});

it("never brings back a transfer wiped while its stage was being moved", async () => {
  await writePendingTransfer(FIRST_CUSTOMER, approvingRecord("trf_1"));

  await Promise.all([
    updatePendingTransfer(FIRST_CUSTOMER, "trf_1", {
      stage: PendingTransferStage.Processing,
    }),
    deleteAllSecureRecords(),
  ]);

  expect(await listPendingTransfers(FIRST_CUSTOMER)).toEqual([]);
});

it("clears one transfer and keeps the customer's others", async () => {
  await writePendingTransfer(FIRST_CUSTOMER, approvingRecord("trf_1"));
  await writePendingTransfer(FIRST_CUSTOMER, approvingRecord("trf_2"));

  await clearPendingTransfer(FIRST_CUSTOMER, "trf_1");

  expect(await listPendingTransfers(FIRST_CUSTOMER)).toEqual([
    approvingRecord("trf_2"),
  ]);
});

it("discards every other customer's pending transfers, and keeps this customer's and the phone's other records", async () => {
  const approvalKeys = { namespace: "approval", name: "key-ids" };
  await writeSecureRecord(approvalKeys, "{}");
  await writePendingTransfer(FIRST_CUSTOMER, approvingRecord("trf_1"));
  await writePendingTransfer(SECOND_CUSTOMER, approvingRecord("trf_2"));

  await discardOtherCustomersPendingTransfers(FIRST_CUSTOMER);

  expect(await listPendingTransfers(FIRST_CUSTOMER)).toEqual([
    approvingRecord("trf_1"),
  ]);
  expect(await listPendingTransfers(SECOND_CUSTOMER)).toEqual([]);
  expect(await readSecureRecord(approvalKeys)).toBe("{}");
});

it("still lists a customer's transfers when a write stopped between its index entry and its record", async () => {
  await writePendingTransfer(FIRST_CUSTOMER, approvingRecord("trf_1"));
  const writeForReal = secureStoreNativeDouble.setValueWithKeyAsync;
  jest
    .spyOn(secureStoreNativeDouble, "setValueWithKeyAsync")
    .mockImplementationOnce(writeForReal)
    .mockRejectedValueOnce(new Error("the phone died"));

  await expect(
    writePendingTransfer(FIRST_CUSTOMER, approvingRecord("trf_2")),
  ).rejects.toThrow("the phone died");

  expect(await listPendingTransfers(FIRST_CUSTOMER)).toEqual([
    approvingRecord("trf_1"),
  ]);
});

const FIRST_CUSTOMER = "cus_first";
const SECOND_CUSTOMER = "cus_second";

function approvingRecord(transferId: string) {
  return {
    transferId,
    idempotencyKey: `key-${transferId}`,
    createdAt: "2026-10-08T01:00:00.000Z",
    stage: PendingTransferStage.Approving,
  };
}
