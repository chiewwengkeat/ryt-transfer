import * as SecureStore from "expo-secure-store";

const RECORD_OPTIONS = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
const KEY_PREFIX = "ryt-transfer";
// expo-secure-store cannot list keys, so this lists every record, for every customer: a wipe
// after a reinstall cannot know whose records survived in the keychain.
const INDEX_KEY = `${KEY_PREFIX}.index`;

let pendingSecureChange: Promise<void> = Promise.resolve();

export async function writeSecureRecord(
  address: SecureRecordAddress,
  value: string,
) {
  const key = secureRecordKey(address);
  await changeSecureRecordsInTurn(async () => {
    // Indexed first: a crash between the two leaves an entry with no record, never a record no wipe finds.
    await updateSecureIndex((entries) =>
      entries.some((entry) => isSameRecordAddress(entry, address))
        ? entries
        : [...entries, address],
    );
    await SecureStore.setItemAsync(key, value, RECORD_OPTIONS);
  });
}

export async function readSecureRecord(address: SecureRecordAddress) {
  return await SecureStore.getItemAsync(
    secureRecordKey(address),
    RECORD_OPTIONS,
  );
}

export async function deleteSecureRecord(address: SecureRecordAddress) {
  const key = secureRecordKey(address);
  await changeSecureRecordsInTurn(async () => {
    await SecureStore.deleteItemAsync(key, RECORD_OPTIONS);
    await updateSecureIndex((entries) =>
      entries.filter((entry) => !isSameRecordAddress(entry, address)),
    );
  });
}

export async function listSecureRecords() {
  const index = await SecureStore.getItemAsync(INDEX_KEY, RECORD_OPTIONS);
  return (index === null ? [] : JSON.parse(index)) as SecureRecordAddress[];
}

export async function deleteSecureNamespace(namespace: string) {
  const records = await listSecureRecords();
  await Promise.all(
    records
      .filter((record) => record.namespace === namespace)
      .map(deleteSecureRecord),
  );
}

export async function deleteAllSecureRecords() {
  const records = await listSecureRecords();
  await Promise.all(records.map(deleteSecureRecord));
}

// One change at a time, record and index together: overlapping ones drop each other's index
// entries, or leave a record stored that the index has dropped.
function changeSecureRecordsInTurn(change: () => Promise<void>) {
  const turn = pendingSecureChange.then(change);
  // The caller sees a failure; the queue must not, or every later change fails with it.
  pendingSecureChange = turn.catch(() => undefined);
  return turn;
}

async function updateSecureIndex(
  change: (entries: SecureRecordAddress[]) => SecureRecordAddress[],
) {
  const entries = await listSecureRecords();
  await SecureStore.setItemAsync(
    INDEX_KEY,
    JSON.stringify(change(entries)),
    RECORD_OPTIONS,
  );
}

// The namespace takes no dot, so no two addresses can build the same key.
function secureRecordKey({ namespace, name }: SecureRecordAddress) {
  if (!/^[\w-]+$/.test(namespace) || !/^[\w.-]+$/.test(name))
    throw new Error(
      'A secure record needs a namespace of letters, digits, "_" or "-", and a name that may also hold ".".',
    );
  return `${KEY_PREFIX}.${namespace}.${name}`;
}

function isSameRecordAddress(
  left: SecureRecordAddress,
  right: SecureRecordAddress,
) {
  return left.namespace === right.namespace && left.name === right.name;
}

interface SecureRecordAddress {
  namespace: string;
  name: string;
}
