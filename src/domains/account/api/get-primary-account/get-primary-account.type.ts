import type { WireMoney } from "@/shared/lib/money/money.type";

export interface GetPrimaryAccountResponse {
  customerId: string;
  accountId: string;
  balance: WireMoney;
}
