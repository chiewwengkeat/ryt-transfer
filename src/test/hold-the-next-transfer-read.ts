import { http } from "msw";

import { mswServer } from "@/test/msw-server";

// A resolver that answers nothing hands the read on to the bank, once released.
export function holdTheNextTransferRead() {
  let releaseTransferRead = () => undefined as void;
  const transferReadHeld = new Promise<void>((release) => {
    releaseTransferRead = release;
  });
  mswServer.use(
    http.get(
      "*/transfers/:transferId",
      async () => {
        await transferReadHeld;
      },
      { once: true },
    ),
  );
  return releaseTransferRead;
}
