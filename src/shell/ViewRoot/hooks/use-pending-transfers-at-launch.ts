import { useEffect } from "react";

import { getPrimaryAccountOptions } from "@/domains/account/api/get-primary-account/get-primary-account";
import { discardOtherCustomersPendingTransfers } from "@/domains/transfer/hooks/pending-transfers";
import { queryClient } from "@/shell/query-client";

export function usePendingTransfersAtLaunch() {
  useEffect(() => {
    void queryClient
      .ensureQueryData(getPrimaryAccountOptions())
      .then(({ customerId }) =>
        discardOtherCustomersPendingTransfers(customerId),
      )
      // Offline or signed out: whose records these are is unknown until the next launch reads the account.
      .catch(() => undefined);
  }, []);
}
