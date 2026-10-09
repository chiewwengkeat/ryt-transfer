import type { WireMoney } from "@/shared/lib/money/money";

export interface GetPrimaryAccountResponse {
  customerId: string;
  accountId: string;
  balance: WireMoney;
}
