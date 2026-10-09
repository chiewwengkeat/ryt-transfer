import * as SecureStore from "expo-secure-store";

import {
  secureStoreEntries,
  secureStoreNativeDouble,
} from "@/test/doubles/native-doubles";

import {
  deleteAllSecureRecords,
  deleteSecureNamespace,
  deleteSecureRecord,
  listSecureRecords,
  readSecureRecord,
  updateSecureRecord,
  writeSecureRecord,
} from "./secure-storage";

const FIRST_PENDING = { namespace: "customer-1", name: "pending.tr-1" };
const FIRST_KEYS = { namespace: "customer-1", name: "approval-keys" };
const SECOND_PENDING = { namespace: "customer-2", name: "pending.tr-2" };

afterEach(() => {
  jest.restoreAllMocks();
});

it("keeps records to this unlocked phone and never asks for the passcode", async () => {
  await writeSecureRecord(FIRST_PENDING, "{}");

  const written = [...secureStoreEntries.values()];
  expect(written).not.toHaveLength(0);
  expect(written.map(({ options }) => options)).toEqual(
    written.map(() => ({
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    })),
  );
});

it("reads a record back only from the customer it was written for", async () => {
  await writeSecureRecord(FIRST_PENDING, "first customer's");
  await writeSecureRecord(SECOND_PENDING, "second customer's");

  expect(await readSecureRecord(FIRST_PENDING)).toBe("first customer's");
  expect(
    await readSecureRecord({ ...FIRST_PENDING, namespace: "customer-2" }),
  ).toBeNull();
});

it("lists every record it holds, across customers", async () => {
  await writeSecureRecord(FIRST_PENDING, "{}");
  await writeSecureRecord(SECOND_PENDING, "{}");
  await writeSecureRecord(FIRST_KEYS, "{}");
  await deleteSecureRecord(FIRST_PENDING);

  expect(await listSecureRecords()).toEqual([SECOND_PENDING, FIRST_KEYS]);
});

it("lists every record when writes overlap", async () => {
  const pending = ["tr-1", "tr-2", "tr-3"].map((transferId) => ({
    namespace: "customer-1",
    name: `pending.${transferId}`,
  }));

  await Promise.all(pending.map((address) => writeSecureRecord(address, "{}")));

  expect(await listSecureRecords()).toEqual(pending);
});

it("applies an overlapping write and delete of one record in the order they were asked for", async () => {
  await Promise.all([
    writeSecureRecord(FIRST_PENDING, "{}"),
    deleteSecureRecord(FIRST_PENDING),
  ]);

  expect(await readSecureRecord(FIRST_PENDING)).toBeNull();
  expect(await listSecureRecords()).toEqual([]);
});

it("rewrites a record from the value it holds, and leaves a missing one missing", async () => {
  await writeSecureRecord(FIRST_PENDING, "approving");

  await updateSecureRecord(FIRST_PENDING, (value) => `${value}, processing`);
  await updateSecureRecord(SECOND_PENDING, () => "processing");

  expect(await readSecureRecord(FIRST_PENDING)).toBe("approving, processing");
  expect(await readSecureRecord(SECOND_PENDING)).toBeNull();
  expect(await listSecureRecords()).toEqual([FIRST_PENDING]);
});

it("never brings back a record deleted while an update of it was under way", async () => {
  await writeSecureRecord(FIRST_PENDING, "approving");

  await Promise.all([
    updateSecureRecord(FIRST_PENDING, () => "processing"),
    deleteAllSecureRecords(),
  ]);

  expect(await readSecureRecord(FIRST_PENDING)).toBeNull();
  expect(await listSecureRecords()).toEqual([]);
});

it("leaves no record a wipe cannot find when a write stops halfway", async () => {
  const writeForReal = secureStoreNativeDouble.setValueWithKeyAsync;
  jest
    .spyOn(secureStoreNativeDouble, "setValueWithKeyAsync")
    .mockImplementationOnce(writeForReal)
    .mockRejectedValueOnce(new Error("the phone died"));

  await expect(writeSecureRecord(FIRST_PENDING, "{}")).rejects.toThrow(
    "the phone died",
  );
  await deleteAllSecureRecords();

  expect(await readSecureRecord(FIRST_PENDING)).toBeNull();
});

it("leaves no record a wipe cannot find when a wipe stops halfway", async () => {
  await writeSecureRecord(FIRST_PENDING, "{}");
  jest
    .spyOn(secureStoreNativeDouble, "deleteValueWithKeyAsync")
    .mockRejectedValueOnce(new Error("the phone died"));

  await expect(deleteAllSecureRecords()).rejects.toThrow("the phone died");
  await deleteAllSecureRecords();

  expect(await readSecureRecord(FIRST_PENDING)).toBeNull();
});

it("wipes one customer's records and keeps the other customer's", async () => {
  await writeSecureRecord(FIRST_PENDING, "{}");
  await writeSecureRecord(FIRST_KEYS, "{}");
  await writeSecureRecord(SECOND_PENDING, "{}");

  await deleteSecureNamespace("customer-1");

  expect(await listSecureRecords()).toEqual([SECOND_PENDING]);
  expect(await readSecureRecord(FIRST_KEYS)).toBeNull();
});

it("wipes every record it holds, whoever it belongs to", async () => {
  await writeSecureRecord(FIRST_PENDING, "{}");
  await writeSecureRecord(SECOND_PENDING, "{}");

  await deleteAllSecureRecords();

  expect(await listSecureRecords()).toEqual([]);
  expect(await readSecureRecord(SECOND_PENDING)).toBeNull();
});

it.each([
  { records: "every record", wipe: () => deleteAllSecureRecords() },
  {
    records: "one customer's records",
    wipe: () => deleteSecureNamespace("customer-1"),
  },
])(
  "applies a wipe of $records and the writes around it in the order they were asked for",
  async ({ wipe }) => {
    await writeSecureRecord(FIRST_KEYS, "keys from before the reinstall");

    await Promise.all([
      writeSecureRecord(FIRST_PENDING, "{}"),
      wipe(),
      writeSecureRecord(FIRST_KEYS, "keys paired just now"),
    ]);

    expect({
      pending: await readSecureRecord(FIRST_PENDING),
      keys: await readSecureRecord(FIRST_KEYS),
      index: await listSecureRecords(),
    }).toEqual({
      pending: null,
      keys: "keys paired just now",
      index: [FIRST_KEYS],
    });
  },
);

it("refuses a namespace that could build another record's key", async () => {
  await expect(
    writeSecureRecord({ namespace: "customer.1", name: "pending" }, "{}"),
  ).rejects.toThrow("namespace");

  expect(await listSecureRecords()).toEqual([]);
});
