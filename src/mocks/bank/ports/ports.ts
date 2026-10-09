import { getRandomBytes } from "expo-crypto";
import Storage from "expo-sqlite/kv-store";

const BANK_STORAGE_KEY = "demo-bank";

let boundPorts = {
  storage: {
    read: (): string | null => Storage.getItemSync(BANK_STORAGE_KEY),
    write: (snapshot: string) => {
      Storage.setItemSync(BANK_STORAGE_KEY, snapshot);
    },
  },
  randomBytes: (count: number): Uint8Array => getRandomBytes(count),
  seed: {
    anchorMs: () => Date.now(),
    transferCount: 5000,
    spanDays: 548,
  },
};

export function bindBankPorts(ports: typeof boundPorts) {
  boundPorts = ports;
}

export function bankPorts() {
  return boundPorts;
}

export function randomHex(byteCount: number) {
  return Array.from(boundPorts.randomBytes(byteCount), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
