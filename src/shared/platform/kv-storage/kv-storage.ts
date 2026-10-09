import Storage, { type SQLiteStorage } from "expo-sqlite/kv-store";

// Narrowed: every caller shares one store, and a clear() from one would wipe the others' entries.
export const kvStorage: Pick<
  SQLiteStorage,
  | "getItemSync"
  | "setItemSync"
  | "removeItemSync"
  | "getItemAsync"
  | "setItemAsync"
  | "removeItemAsync"
> = Storage;
