import {
  deleteSecureNamespace,
  deleteSecureRecord,
  listSecureRecords,
  readSecureRecord,
  writeSecureRecord,
} from "@/shared/platform/secure-storage";

const NAMESPACE_PREFIX = "pending-transfers-";

export enum PendingTransferStage {
  Approving = "approving",
  Processing = "processing",
}

export async function writePendingTransfer(
  customerId: string,
  record: PendingTransfer,
) {
  await writeSecureRecord(
    {
      namespace: pendingTransfersNamespace(customerId),
      name: record.transferId,
    },
    JSON.stringify(record),
  );
}

export async function listPendingTransfers(customerId: string) {
  const namespace = pendingTransfersNamespace(customerId);
  const addresses = (await listSecureRecords()).filter(
    (address) => address.namespace === namespace,
  );
  const records = await Promise.all(addresses.map(readSecureRecord));
  // The index entry is written before its record, so a write cut short leaves an entry with nothing behind it.
  return records.flatMap((record) =>
    record === null ? [] : [JSON.parse(record) as PendingTransfer],
  );
}

export async function updatePendingTransferStage(
  customerId: string,
  transferId: string,
  stage: PendingTransferStage,
) {
  const address = {
    namespace: pendingTransfersNamespace(customerId),
    name: transferId,
  };
  const record = await readSecureRecord(address);
  if (record === null) return;
  await writeSecureRecord(
    address,
    JSON.stringify({ ...(JSON.parse(record) as PendingTransfer), stage }),
  );
}

export async function clearPendingTransfer(
  customerId: string,
  transferId: string,
) {
  await deleteSecureRecord({
    namespace: pendingTransfersNamespace(customerId),
    name: transferId,
  });
}

export async function discardOtherCustomersPendingTransfers(
  customerId: string,
) {
  const ownNamespace = pendingTransfersNamespace(customerId);
  const otherNamespaces = new Set(
    (await listSecureRecords())
      .map(({ namespace }) => namespace)
      .filter(
        (namespace) =>
          namespace.startsWith(NAMESPACE_PREFIX) && namespace !== ownNamespace,
      ),
  );
  for (const namespace of otherNamespaces)
    await deleteSecureNamespace(namespace);
}

function pendingTransfersNamespace(customerId: string) {
  return `${NAMESPACE_PREFIX}${customerId}`;
}

interface PendingTransfer {
  transferId: string;
  idempotencyKey: string;
  createdAt: string;
  stage: PendingTransferStage;
}
